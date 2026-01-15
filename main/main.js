const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let overlayWindow;

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 1200,
    height: 300,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    type: 'panel', // Helps with staying on top of full-screen apps on macOS
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // Enable transparency at the OS level
  overlayWindow.setIgnoreMouseEvents(true);
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setFullScreenable(false); // Prevent it from being minimized/hidden by fullscreen transitions

  // Position at bottom
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  overlayWindow.setPosition(Math.floor((width - 1200) / 2), height - 250);

  // Load the overlay content from our Next.js app
  overlayWindow.loadURL('http://localhost:3000/electron-overlay');
}

app.whenReady().then(() => {
  createOverlayWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
