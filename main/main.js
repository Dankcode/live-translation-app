const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const { WebSocketServer } = require('ws');

let overlayWindow;
let mainWindow;
let macSttProcess = null;
let wss = null;

const MAC_STT_APP_BIN = path.join(app.getAppPath(), 'bin/SpeechHost.app/Contents/MacOS/SpeechHost');

/**
 * Initializes the WebSocket server for Satellite STT.
 */
function startWebSocketServer() {
  wss = new WebSocketServer({ port: 8080 });
  console.log('Satellite WebSocket Server started on port 8080');

  wss.on('connection', (ws) => {
    console.log('Satellite Browser connected');

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        // Forward the transcription to the main window
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('satellite-transcript', data);
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    });

    ws.on('close', () => {
      console.log('Satellite Browser disconnected');
    });
  });
}

function checkMacSttBinary() {
  if (process.platform !== 'darwin') return false;
  return fs.existsSync(MAC_STT_APP_BIN);
}

async function requestPermissions() {
  if (process.platform === 'darwin') {
    const { systemPreferences } = require('electron');
    try {
      const micAccess = await systemPreferences.askForMediaAccess('microphone');
      console.log('Microphone access:', micAccess);
    } catch (e) {
      console.error('Failed to request microphone access:', e);
    }
  }
}

function broadcastOverlayStatus() {
  const visible = overlayWindow ? overlayWindow.isVisible() : false;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('overlay-status', visible);
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const url = app.isPackaged ? 'http://localhost:3000' : 'http://localhost:3000';
  mainWindow.loadURL(url);
}

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 1200,
    height: 300,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    // Keep the main window usable while overlay is shown.
    focusable: false,
    resizable: true,
    show: false,
    type: 'panel',
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  overlayWindow.setFullScreenable(false);
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  overlayWindow.setPosition(Math.floor((width - 1200) / 2), height - 250);

  const url = 'http://localhost:3000/overlay';
  overlayWindow.loadURL(url);
}

app.whenReady().then(async () => {
  createMainWindow();
  createOverlayWindow();
  startWebSocketServer();
  await requestPermissions();
});

// --- SATELLITE HANDLERS ---

ipcMain.on('open-satellite-browser', () => {
  shell.openExternal('http://localhost:3000/satellite');
});

ipcMain.on('toggle-overlay', (event) => {
  if (!overlayWindow) {
    createOverlayWindow();
    overlayWindow.show();
  } else {
    if (overlayWindow.isVisible()) overlayWindow.hide();
    else overlayWindow.show();
  }
  event.reply('overlay-status', overlayWindow.isVisible());
  broadcastOverlayStatus();
});

ipcMain.on('get-overlay-status', (event) => {
  event.reply('overlay-status', overlayWindow ? overlayWindow.isVisible() : false);
});

ipcMain.on('broadcast-stt-command', (event, { command, config }) => {
  // 1. Send to Satellite Electron window (if any) via IPC
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    // Note: The satellite page might be in the overlay or a separate window.
    // In our current structure, it's usually opened via open-satellite-browser.
    // We don't track a specific 'satelliteWindow' variable, so we rely on WebSocket for browsers.
  }

  // 2. Broadcast to all WebSocket clients (Browser Satellite)
  if (wss) {
    const payload = JSON.stringify({ type: 'command', command, config });
    wss.clients.forEach((client) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(payload);
      }
    });
  }
});

ipcMain.on('close-overlay', () => {
  if (overlayWindow) overlayWindow.hide();
  broadcastOverlayStatus();
});

ipcMain.on('resize-overlay', (event, { width, height }) => {
  if (overlayWindow) overlayWindow.setSize(width, height);
});

ipcMain.on('set-ignore-mouse', (event, ignore) => {
  if (overlayWindow) {
    overlayWindow.setIgnoreMouseEvents(ignore, { forward: true });
    // Broadcast status to both windows
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('overlay-lock-status', ignore);
    }
    overlayWindow.webContents.send('overlay-lock-status', ignore);
  }
});

ipcMain.on('send-subtitle', (event, data) => {
  if (overlayWindow) overlayWindow.webContents.send('receive-subtitle', data);
});

ipcMain.on('open-external-browser', (event, url) => {
  shell.openExternal(url);
});

ipcMain.on('start-mac-stt', async (event, { locale }) => {
  if (process.platform !== 'darwin') {
    event.reply('mac-stt-error', 'Native STT is only supported on macOS.');
    return;
  }

  if (!checkMacSttBinary()) {
    event.reply('mac-stt-error', 'SpeechHost.app not found in bin/ directory. Please build it in Xcode first.');
    return;
  }

  if (macSttProcess) {
    macSttProcess.kill();
  }

  console.log(`Starting Native Host STT with locale: ${locale}`);
  macSttProcess = spawn(MAC_STT_APP_BIN, [locale]);

  macSttProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line);
        if (json.error) {
          mainWindow.webContents.send('mac-stt-error', json.error);
        } else if (json.transcript) {
          mainWindow.webContents.send('mac-stt-transcript', json);
        }
      } catch (e) {
        console.error('Failed to parse Swift output:', line);
      }
    }
  });

  macSttProcess.stderr.on('data', (data) => {
    console.error(`macOS STT stderr: ${data}`);
  });

  macSttProcess.on('close', (code) => {
    console.log(`macOS STT process exited with code ${code}`);
    macSttProcess = null;
  });
});

ipcMain.on('stop-mac-stt', () => {
  if (macSttProcess) {
    macSttProcess.kill();
    macSttProcess = null;
  }
});

app.on('will-quit', () => {
  if (macSttProcess) macSttProcess.kill();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
