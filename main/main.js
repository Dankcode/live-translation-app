const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
ipcMain.on('open-external-link', (event, url) => {
  shell.openExternal(url);
});
let overlayWindow;
let mainWindow;
let satelliteWindow; // Reference for the new window
let macSttProcess = null;

const MAC_STT_APP_BIN = path.join(app.getAppPath(), 'bin/SpeechHost.app/Contents/MacOS/SpeechHost');

/**
 * Checks if the native macOS STT binary exists.
 */
function checkMacSttBinary() {
  if (process.platform !== 'darwin') return false;
  return fs.existsSync(MAC_STT_APP_BIN);
}

/**
 * Requests microphone permissions on macOS.
 */
async function requestPermissions() {
  if (process.platform === 'darwin') {
    const { systemPreferences } = require('electron');
    try {
      const micAccess = await systemPreferences.askForMediaAccess('microphone');
      console.log('Microphone access granted:', micAccess);
    } catch (e) {
      console.error('Failed to request microphone access:', e);
    }
  }
}

/**
 * Broadcasts the overlay visibility status to the main window.
 */
function broadcastOverlayStatus() {
  const visible = overlayWindow ? overlayWindow.isVisible() : false;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('overlay-status', visible);
  }
}

/**
 * Creates the main application window.
 */
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 850,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const url = 'http://localhost:3000';
  mainWindow.loadURL(url);
}

/**
 * Creates the satellite window to run the specific satellite script.
 */
function createSatelliteWindow() {
  if (satelliteWindow) {
    satelliteWindow.focus();
    return;
  }

  satelliteWindow = new BrowserWindow({
    width: 600,
    height: 400,
    title: "Satellite Renderer",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // Using app.getAppPath() for more reliable path resolution relative to app root
  const satellitePath = path.join(app.getAppPath(), './src/app/satellite', 'ipcrenderer.js');
  const indexPath = path.join(app.getAppPath(), './src/app/satellite', 'index.html');

  satelliteWindow.loadFile(indexPath).catch(() => {
    // Fallback: If no HTML exists, we can inject the script into a blank page
    satelliteWindow.loadURL('about:blank');
    satelliteWindow.webContents.on('did-finish-load', () => {
      try {
        if (fs.existsSync(satellitePath)) {
          const content = fs.readFileSync(satellitePath, 'utf8');
          satelliteWindow.webContents.executeJavaScript(content);
        } else {
          console.error('Satellite script not found at:', satellitePath);
        }
      } catch (err) {
        console.error('Failed to read or execute satellite script:', err);
      }
    });
  });

  satelliteWindow.on('closed', () => {
    satelliteWindow = null;
  });
}

/**
 * Creates the transparent overlay window for displaying subtitles.
 */
function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 1200,
    height: 300,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
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
  try {
    createMainWindow();
    createOverlayWindow();
    await requestPermissions();
  } catch (err) {
    console.error('Error during app startup:', err);
  }
});

// --- IPC HANDLERS ---

/**
 * Handler to open the Satellite window from the UI.
 */
ipcMain.on('open-satellite', () => {
  createSatelliteWindow();
});

/**
 * Received from page.jsx (Browser STT)
 * Forwards the browser-generated transcript to the overlay window.
 */
ipcMain.on('send-subtitle', (event, data) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('receive-subtitle', data);
  }
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
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('overlay-lock-status', ignore);
    }
    overlayWindow.webContents.send('overlay-lock-status', ignore);
  }
});

ipcMain.on('open-external-browser', (event, url) => {
  shell.openExternal(url);
});

// --- NATIVE MAC STT HANDLERS ---

ipcMain.on('start-mac-stt', async (event, { locale }) => {
  if (process.platform !== 'darwin') {
    event.reply('mac-stt-error', 'Native STT is only supported on macOS.');
    return;
  }

  if (!checkMacSttBinary()) {
    event.reply('mac-stt-error', 'SpeechHost.app not found in bin/ directory.');
    return;
  }

  if (macSttProcess) macSttProcess.kill();

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
          if (overlayWindow) overlayWindow.webContents.send('receive-subtitle', json);
        }
      } catch (e) {
        console.error('Failed to parse Swift output:', line);
      }
    }
  });

  macSttProcess.stderr.on('data', (data) => console.error(`macOS STT stderr: ${data}`));
  macSttProcess.on('close', () => macSttProcess = null);
});

ipcMain.on('start-mac-stt', async (event, { locale }) => {
  if (process.platform !== 'darwin') {
    event.reply('mac-stt-error', 'Native STT is only supported on macOS.');
    return;
  }

  if (!checkMacSttBinary()) {
    event.reply('mac-stt-error', 'SpeechHost.app not found in bin/ directory.');
    return;
  }

  if (macSttProcess) macSttProcess.kill();

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
          if (overlayWindow) overlayWindow.webContents.send('receive-subtitle', json);
        }
      } catch (e) {
        console.error('Failed to parse Swift output:', line);
      }
    }
  });

  macSttProcess.stderr.on('data', (data) => console.error(`macOS STT stderr: ${data}`));
  macSttProcess.on('close', () => macSttProcess = null);
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