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
    focusable: true, // Need focusable for interaction and resizing
    resizable: true, // Allow user to resize
    type: 'panel', // Necessary for macOS to stay above other apps
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // Enable persistence at the OS level
  // Note: setIgnoreMouseEvents(false) is default, allowing interaction
  // visibleOnFullScreen: true is key for macOS fullscreen persistence
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // 'screen-saver' level for topmost priority
  overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  overlayWindow.setFullScreenable(false);

  // Position at bottom
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  overlayWindow.setPosition(Math.floor((width - 1200) / 2), height - 250);

  // Load the overlay content from our Next.js app
  overlayWindow.loadURL('http://localhost:3000/overlay');
}

app.whenReady().then(() => {
  createOverlayWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
