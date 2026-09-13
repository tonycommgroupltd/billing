const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tonycommDesktop', {
  isDesktop: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  getVersion: () => ipcRenderer.invoke('desktop-get-version'),
  checkForUpdates: () => ipcRenderer.invoke('desktop-check-for-updates'),
  onUpdateStatus: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('desktop-update-status', handler);
    return () => ipcRenderer.removeListener('desktop-update-status', handler);
  },
});
