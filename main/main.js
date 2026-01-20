const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let overlayWindow;
let mainWindow;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const url = app.isPackaged
    ? `http://localhost:3000` // In a real setup, we'd start a local server here
    : 'http://localhost:3000';

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
    focusable: true,
    resizable: true,
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

  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  overlayWindow.setPosition(Math.floor((width - 1200) / 2), height - 250);

  const url = (app.isPackaged ? 'http://localhost:3000' : 'http://localhost:3000') + '/overlay';
  overlayWindow.loadURL(url);
}

app.whenReady().then(() => {
  createMainWindow();
  createOverlayWindow();
});

ipcMain.on('close-overlay', () => {
  if (overlayWindow) overlayWindow.hide();
});

ipcMain.on('resize-overlay', (event, { width, height }) => {
  if (overlayWindow) {
    overlayWindow.setSize(width, height);
  }
});

ipcMain.on('set-ignore-mouse', (event, ignore) => {
  if (overlayWindow) {
    overlayWindow.setIgnoreMouseEvents(ignore, { forward: true });
  }
});

ipcMain.on('send-subtitle', (event, data) => {
  if (overlayWindow) {
    overlayWindow.webContents.send('receive-subtitle', data);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
