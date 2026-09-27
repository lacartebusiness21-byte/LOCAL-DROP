const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('localdrop', {
  onFirewallWarning: (callback) => {
    ipcRenderer.on('firewall-warning', (_event, message) => callback(message));
  },
  onRequestNewSession: (callback) => {
    ipcRenderer.on('request-new-session', () => callback());
  },
});
