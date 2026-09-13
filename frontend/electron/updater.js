const { dialog, BrowserWindow } = require('electron');

const UPDATE_FEED = 'https://isp.tonycommgroupltd.com/desktop/';

let autoUpdater = null;
let checking = false;
let downloadPromptOpen = false;
let updateReady = false;
let pendingVersion = '';

function isRemoteNewer(remote, local) {
  const parse = (v) =>
    String(v || '0')
      .split(/[.-]/)
      .map((p) => parseInt(p, 10) || 0);
  const a = parse(remote);
  const b = parse(local);
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

function getAutoUpdater() {
  if (!autoUpdater) {
    ({ autoUpdater } = require('electron-updater'));
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
  }
  return autoUpdater;
}

function parentWindow() {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
}

async function promptRestart(version) {
  if (downloadPromptOpen) return;
  downloadPromptOpen = true;
  try {
    const result = await dialog.showMessageBox(parentWindow(), {
      type: 'info',
      title: 'Update ready',
      message: `Tonycomm ISP Admin ${version} is ready to install.`,
      detail: 'Restart now to apply the update, or choose Later to keep working.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (result.response === 0) {
      getAutoUpdater().quitAndInstall(false, true);
    }
  } finally {
    downloadPromptOpen = false;
  }
}

function wireUpdaterEvents({ notifyRenderer } = {}) {
  const updater = getAutoUpdater();

  updater.on('checking-for-update', () => {
    notifyRenderer?.({ type: 'checking' });
  });

  updater.on('update-available', (info) => {
    notifyRenderer?.({ type: 'available', version: info.version });
  });

  updater.on('update-not-available', (info) => {
    notifyRenderer?.({ type: 'not-available', version: info.version });
  });

  updater.on('error', (err) => {
    console.warn('[updater]', err?.message || err);
    notifyRenderer?.({ type: 'error', message: err?.message || String(err) });
  });

  updater.on('download-progress', (progress) => {
    notifyRenderer?.({
      type: 'progress',
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  updater.on('update-downloaded', async (info) => {
    updateReady = true;
    pendingVersion = info.version;
    notifyRenderer?.({ type: 'downloaded', version: info.version });
    await promptRestart(info.version);
  });
}

/**
 * Soft auto-update against Contabo generic feed.
 * Packaged builds only — skipped in electron:dev.
 */
function setupAutoUpdater(app, { getMainWindow } = {}) {
  if (!app.isPackaged) return;

  const notifyRenderer = (payload) => {
    const win = getMainWindow?.() || parentWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('desktop-update-status', payload);
    }
  };

  try {
    const updater = getAutoUpdater();
    updater.setFeedURL({ provider: 'generic', url: UPDATE_FEED });
    wireUpdaterEvents({ notifyRenderer });

    // Delay so the UI can settle before network/dialogs.
    setTimeout(() => {
      updater.checkForUpdates().catch((err) => {
        console.warn('[updater] check failed:', err?.message || err);
      });
    }, 4000);
  } catch (err) {
    console.warn('[updater] setup failed:', err?.message || err);
  }
}

async function checkForUpdatesManual() {
  if (!require('electron').app.isPackaged) {
    await dialog.showMessageBox(parentWindow(), {
      type: 'info',
      title: 'Updates',
      message: 'Update checks run in the installed desktop app only.',
      buttons: ['OK'],
    });
    return { ok: false, reason: 'dev' };
  }

  if (updateReady) {
    await promptRestart(pendingVersion || getAutoUpdater().currentVersion);
    return { ok: true, reason: 'ready' };
  }

  if (checking) {
    return { ok: false, reason: 'busy' };
  }

  checking = true;
  try {
    const updater = getAutoUpdater();
    const result = await updater.checkForUpdates();
    const updateInfo = result?.updateInfo;
    const hasUpdate =
      updateInfo &&
      updateInfo.version &&
      isRemoteNewer(updateInfo.version, updater.currentVersion);

    if (!hasUpdate) {
      await dialog.showMessageBox(parentWindow(), {
        type: 'info',
        title: 'No updates',
        message: `You are on the latest version (${updater.currentVersion}).`,
        buttons: ['OK'],
      });
      return { ok: true, reason: 'up-to-date', version: updater.currentVersion };
    }

    await dialog.showMessageBox(parentWindow(), {
      type: 'info',
      title: 'Update available',
      message: `Version ${updateInfo.version} is available.`,
      detail: 'The update is downloading in the background. You will be asked to restart when it is ready.',
      buttons: ['OK'],
    });
    return { ok: true, reason: 'available', version: updateInfo.version };
  } catch (err) {
    await dialog.showMessageBox(parentWindow(), {
      type: 'warning',
      title: 'Update check failed',
      message: 'Could not check for updates.',
      detail: err?.message || String(err),
      buttons: ['OK'],
    });
    return { ok: false, reason: 'error', message: err?.message || String(err) };
  } finally {
    checking = false;
  }
}

function getAppVersion(app) {
  return app.getVersion();
}

module.exports = {
  UPDATE_FEED,
  setupAutoUpdater,
  checkForUpdatesManual,
  getAppVersion,
};
