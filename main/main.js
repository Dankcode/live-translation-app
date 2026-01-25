const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Enable Speech Recognition flags for Electron
app.commandLine.appendSwitch('enable-speech-input');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');

let overlayWindow;
let mainWindow;

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
});

ipcMain.on('get-overlay-status', (event) => {
  event.reply('overlay-status', overlayWindow ? overlayWindow.isVisible() : false);
});

ipcMain.on('close-overlay', () => {
  if (overlayWindow) overlayWindow.hide();
});

ipcMain.on('resize-overlay', (event, { width, height }) => {
  if (overlayWindow) overlayWindow.setSize(width, height);
});

ipcMain.on('set-ignore-mouse', (event, ignore) => {
  if (overlayWindow) overlayWindow.setIgnoreMouseEvents(ignore, { forward: true });
});

const http = require('http');

ipcMain.on('send-subtitle', (event, data) => {
  if (overlayWindow) overlayWindow.webContents.send('receive-subtitle', data);
});

let oauthServer = null;

ipcMain.on('google-oauth', (event) => {
  const { shell } = require('electron');

  if (oauthServer) {
    oauthServer.close();
  }

  // Create a temporary loopback server to capture the login success
  oauthServer = http.createServer((req, res) => {
    // Send a success message to the browser
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding-top: 50px; background: #0f172a; color: white;">
          <h1 style="color: #60a5fa;">Login Successful!</h1>
          <p>You can now close this window and return to Scribe Center.</p>
          <script>setTimeout(() => window.close(), 3000);</script>
        </body>
      </html>
    `);

    // Notify the Electron app that auth is finished
    if (mainWindow) {
      mainWindow.webContents.send('auth-finished');
      mainWindow.focus();
    }

    // Shut down the server
    setTimeout(() => {
      oauthServer.close();
      oauthServer = null;
    }, 1000);
  });

  oauthServer.listen(4201, '127.0.0.1', () => {
    console.log('[OAuth] Loopback server listening on http://127.0.0.1:4201');

    // Open Google Login in the system's default browser (Chrome, Safari, etc.)
    // We use ServiceLogin with a continue URL that points to our loopback server
    const authUrl = 'https://accounts.google.com/ServiceLogin?continue=http://127.0.0.1:4201';
    shell.openExternal(authUrl);
  });
});

ipcMain.on('check-google-auth', async (event) => {
  const { session } = require('electron');
  // When using loopback, the cookies aren't automatically shared with the Electron session
  // unless we explicitly set them. However, for Web Speech API, Google just needs 
  // *any* valid session in the same Chromium engine. 
  // Since we are using the system browser, the user is authenticated there.
  // We'll trust the loopback signal for now.
  const cookies = await session.defaultSession.cookies.get({ domain: '.google.com' });
  const hasAuth = cookies.some(c => c.name === 'HSID' || c.name === 'SID');
  event.reply('google-auth-status', hasAuth);
});

ipcMain.on('open-external-browser', (event, url) => {
  const { shell } = require('electron');
  shell.openExternal(url);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
