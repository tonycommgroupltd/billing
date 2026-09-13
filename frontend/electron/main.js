const path = require('path');
const Module = require('module');
const fs = require('fs');
const { app, BrowserWindow, Menu, ipcMain, shell, session } = require('electron');

// Packaged builds put express / http-proxy-middleware / electron-updater in
// resources/node_modules (see package.json build.extraResources).
(function ensureRuntimeModules() {
  const candidates = [
    path.join(process.resourcesPath || '', 'node_modules'),
    path.join(__dirname, 'node_modules'),
  ];
  for (const dir of candidates) {
    if (dir && fs.existsSync(dir)) {
      module.paths.unshift(dir);
      process.env.NODE_PATH = [dir, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
      Module._initPaths();
      break;
    }
  }
})();

const { createDesktopServer } = require('./createServer');
const {
  setupAutoUpdater,
  checkForUpdatesManual,
  getAppVersion,
} = require('./updater');

const isDev = !app.isPackaged;
const DEV_URL = process.env.ELECTRON_START_URL || 'http://127.0.0.1:3001';

let mainWindow = null;
let localServer = null;

async function createWindow() {
  let startUrl = DEV_URL;

  if (!isDev || process.env.ELECTRON_USE_BUILD === '1') {
    const { server, url } = await createDesktopServer();
    localServer = server;
    startUrl = url;
  }

  // No File/Edit/View chrome — that menu makes Electron look like a browser/PWA.
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    title: 'Tonycomm ISP Admin',
    icon: path.join(__dirname, 'resources', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed =
      url.startsWith('http://127.0.0.1:') ||
      url.startsWith('http://localhost:') ||
      url.startsWith(startUrl);
    if (!allowed) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  await mainWindow.loadURL(startUrl);

  if (isDev && process.env.ELECTRON_OPEN_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  if (isDev) {
    // CRA HMR updates the page; if the renderer disconnects, reload automatically.
    mainWindow.webContents.on('did-fail-load', (_event, errorCode) => {
      if (errorCode === -6 || errorCode === -105 || errorCode === -102) {
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.loadURL(startUrl);
          }
        }, 1500);
      }
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({ requestHeaders: details.requestHeaders });
  });

  ipcMain.handle('desktop-get-version', () => getAppVersion(app));
  ipcMain.handle('desktop-check-for-updates', () => checkForUpdatesManual());

  try {
    await createWindow();
    setupAutoUpdater(app, { getMainWindow: () => mainWindow });
  } catch (err) {
    console.error('Failed to start Tonycomm ISP Admin:', err);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch((err) => {
        console.error(err);
        app.quit();
      });
    }
  });
});

app.on('window-all-closed', () => {
  if (localServer) {
    localServer.close();
    localServer = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (localServer) {
    localServer.close();
    localServer = null;
  }
});
