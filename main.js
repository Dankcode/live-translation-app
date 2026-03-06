const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const { WebSocketServer } = require('ws');
const http = require('http');

let overlayWindow;
let mainWindow;
let wss = null;
let staticServer = null;

const isDev = !app.isPackaged;

function getRendererDistPath() {
  return isDev ? null : path.join(process.resourcesPath, 'dist');
}

/**
 * Detects the local IPv4 address.
 */
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

/**
 * Starts a simple static file server for LAN access (satellite/history pages).
 */
function startStaticServer() {
  killPort(3000);
  const distPath = isDev ? null : getRendererDistPath();

  staticServer = http.createServer((req, res) => {
    if (isDev) {
      // In dev mode, proxy to Vite
      res.writeHead(302, { Location: `http://localhost:5173${req.url}` });
      res.end();
      return;
    }

    let filePath = path.join(distPath, req.url === '/' ? 'index.html' : req.url);
    // Remove query strings
    filePath = filePath.split('?')[0];

    const mimeTypes = {
      '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
      '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff',
      '.woff2': 'font/woff2',
    };

    if (!fs.existsSync(filePath)) {
      // Try with .html extension
      if (fs.existsSync(filePath + '.html')) {
        filePath = filePath + '.html';
      } else {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    // Use readFile (not streams) to stay compatible with ASAR packaging.
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Failed to read file');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
      res.end(data);
    });
  });

  staticServer.listen(3000, () => {
    console.log('Static file server started on port 3000 for LAN access');
  }).on('error', (e) => {
    console.error('Static server failed to start (port 3000 in use?):', e.message);
  });
}

/**
 * Kills any process occupying the given port (macOS/Linux).
 */
function killPort(port) {
  try {
    const pids = execSync(`lsof -ti:${port} 2>/dev/null`).toString().trim();
    if (pids) {
      execSync(`kill -9 ${pids.split('\n').join(' ')} 2>/dev/null`);
      console.log(`Killed old process on port ${port}`);
    }
  } catch (e) { /* no process on port, that's fine */ }
}

/**
 * Initializes the WebSocket server for Satellite STT.
 */
function startWebSocketServer() {
  killPort(8080);

  wss = new WebSocketServer({ port: 8080 });

  wss.on('listening', () => {
    console.log('Satellite WebSocket Server started on port 8080');
  });

  wss.on('error', (e) => {
    console.error('WebSocket server error:', e.message);
    wss = null;
  });

  wss.on('connection', (ws) => {
    console.log('Satellite Browser connected. Total clients:', wss.clients.size);
    broadcastSatelliteStatus();

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('satellite-transcript', data);
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    });

    ws.on('close', () => {
      console.log('Satellite Browser disconnected. Total clients:', wss.clients.size);
      broadcastSatelliteStatus();
    });
  });
}

function broadcastSatelliteStatus() {
  if (mainWindow && !mainWindow.isDestroyed() && wss) {
    mainWindow.webContents.send('satellite-status', wss.clients.size > 0);
  }
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

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173/index.html');
  } else {
    mainWindow.loadFile(path.join(getRendererDistPath(), 'index.html'));
  }
}

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 1200,
    height: 300,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: true,
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

  if (isDev) {
    overlayWindow.loadURL('http://localhost:5173/overlay.html');
  } else {
    overlayWindow.loadFile(path.join(getRendererDistPath(), 'overlay.html'));
  }
}

app.whenReady().then(async () => {
  createMainWindow();
  createOverlayWindow();
  startWebSocketServer();
  startStaticServer();
  await requestPermissions();
});

// --- SATELLITE HANDLERS ---

ipcMain.on('open-satellite-browser', () => {
  if (isDev) {
    shell.openExternal('http://localhost:5173/satellite.html');
  } else {
    shell.openExternal('http://localhost:3000/satellite.html');
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

ipcMain.on('check-satellite-status', (event) => {
  event.reply('satellite-status', wss ? wss.clients.size > 0 : false);
});

ipcMain.on('broadcast-stt-command', (event, { command, config }) => {
  // 1. Send to Overlay window via IPC (The overlay now acts as the listener)
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send(`${command}-stt`, config);
  }

  // 2. Broadcast to all WebSocket clients (Legacy Browser Satellite)
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

ipcMain.on('satellite-data', (event, data) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('satellite-transcript', data);
  }
  // Also broadcast to all WebSocket clients (Viewer/History Sync)
  broadcastToViewers(data);
});

ipcMain.on('broadcast-transcript', (event, data) => {
  broadcastToViewers(data);
});

ipcMain.on('send-subtitle', (event, data) => {
  // Only send to overlay for display
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('receive-subtitle', data);
  }
});

ipcMain.on('overlay-hover', (event, isHovered) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setIgnoreMouseEvents(!isHovered, { forward: true });
  }
});

ipcMain.on('sync-languages', (event, data) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('sync-languages', data);
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('sync-languages', data);
  }
});

ipcMain.on('sync-interface-language', (event, locale) => {
  if (mainWindow && !mainWindow.isDestroyed() && event.sender !== mainWindow.webContents) {
    mainWindow.webContents.send('sync-interface-language', locale);
  }
  if (overlayWindow && !overlayWindow.isDestroyed() && event.sender !== overlayWindow.webContents) {
    overlayWindow.webContents.send('sync-interface-language', locale);
  }
});

ipcMain.on('open-devtools', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.openDevTools({ mode: 'detach' });
  }
});

ipcMain.on('get-local-ip', (event) => {
  event.reply('local-ip', getLocalIP());
});

ipcMain.on('open-external-browser', (event, url) => {
  shell.openExternal(url);
});

/**
 * Broadcasts data to all connected WebSocket clients.
 */
function broadcastToViewers(data) {
  if (wss) {
    const payload = JSON.stringify({
      type: 'transcript',
      ...data,
      timestamp: Date.now() // Use the host computer's time
    });
    wss.clients.forEach((client) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(payload);
      }
    });
  }
}

app.on('will-quit', () => {
  if (staticServer) staticServer.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
