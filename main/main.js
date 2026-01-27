const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

let overlayWindow;
let mainWindow;

function broadcastOverlayStatus() {
  const visible = overlayWindow ? overlayWindow.isVisible() : false;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('overlay-status', visible);
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 850,
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

app.whenReady().then(() => {
  createMainWindow();
  createOverlayWindow();
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
  if (overlayWindow) overlayWindow.setIgnoreMouseEvents(ignore, { forward: true });
});

ipcMain.on('send-subtitle', (event, data) => {
  if (overlayWindow) overlayWindow.webContents.send('receive-subtitle', data);
});

ipcMain.on('open-external-browser', (event, url) => {
  shell.openExternal(url);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
