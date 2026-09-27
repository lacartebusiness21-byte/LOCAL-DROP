const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const net = require('net');

const serverLib = require('../server/server');
const { getLocalAddresses } = require('../server/network');
const config = require('../server/config');
const { createTray } = require('./tray');

// Nécessaire sur Windows pour que les notifications affichent le bon nom/icône
// LocalDrop au lieu du nom générique "Electron".
if (process.platform === 'win32') {
  app.setAppUserModelId('sn.blcservices.localdrop');
}

let mainWindow = null;
let serverInstance = null;

function chooseFolderHandler() {
  return new Promise((resolve) => {
    const result = dialog.showOpenDialogSync(mainWindow, {
      title: 'Choisir le dossier de destination',
      properties: ['openDirectory', 'createDirectory'],
    });
    resolve(result && result.length ? result[0] : null);
  });
}

const autostartHandlers = {
  setAutostart(enabled) {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: false,
      path: process.execPath,
      args: enabled ? ['--hidden'] : [],
    });
  },
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 820,
    minWidth: 400,
    minHeight: 620,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(`http://localhost:${serverInstance.port}/index.html`);

  // Ne quitte pas l'app à la fermeture de la fenêtre : elle reste dans la zone
  // de notification (voir tray.js), conformément au mode "minimisé" demandé.
  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// Vérification basique d'accessibilité réseau : on tente une connexion TCP
// locale sur l'adresse LAN. Si ça échoue, le pare-feu bloque probablement.
function checkFirewallAccess(port) {
  const addresses = getLocalAddresses();
  if (!addresses.length) {
    return Promise.resolve({ ok: false, message: 'Aucune interface réseau locale détectée.' });
  }
  const target = addresses[0].address;

  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1500);
    socket.once('connect', () => {
      socket.destroy();
      resolve({ ok: true });
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve({ ok: false, message: 'Le pare-feu Windows bloque peut-être les connexions entrantes vers LocalDrop.' });
    });
    socket.once('error', () => {
      resolve({ ok: false, message: 'Le pare-feu Windows bloque peut-être les connexions entrantes vers LocalDrop.' });
    });
    socket.connect(port, target);
  });
}

app.whenReady().then(async () => {
  try {
    serverInstance = await serverLib.start({ chooseFolderHandler, autostartHandlers });
  } catch (err) {
    dialog.showErrorBox('LocalDrop — Erreur serveur', err.message || "Le serveur local n'a pas pu démarrer.");
    app.quit();
    return;
  }

  createWindow();
  createTray({ app, mainWindow, autostartHandlers });

  const appConfig = config.load();
  const hiddenStart = process.argv.includes('--hidden') || !!appConfig.startMinimized;
  if (hiddenStart) mainWindow.hide();

  const firewallCheck = await checkFirewallAccess(serverInstance.port);
  if (!firewallCheck.ok) {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('firewall-warning', firewallCheck.message);
    });
  }
});

app.on('before-quit', () => {
  app.isQuiting = true;
  // Arrêt propre du serveur local : libère le port et ferme les sockets
  // ouvertes avant qu'Electron ne termine le process.
  if (serverInstance && serverInstance.server) {
    try {
      serverInstance.io.close();
      serverInstance.server.close();
    } catch (e) {
      /* le process va quitter de toute façon */
    }
  }
});

app.on('window-all-closed', () => {
  // Sur Windows/Linux, LocalDrop reste actif via l'icône de la zone de
  // notification tant que l'utilisateur ne quitte pas explicitement.
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
  }
});

ipcMain.handle('get-server-info', () => ({
  port: serverInstance ? serverInstance.port : null,
}));
