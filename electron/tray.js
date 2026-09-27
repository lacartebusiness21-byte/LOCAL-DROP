const { Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const config = require('../server/config');

function createTray({ app, mainWindow, autostartHandlers }) {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath);
  } catch (e) {
    icon = nativeImage.createEmpty();
  }

  const tray = new Tray(icon);
  tray.setToolTip('LocalDrop');

  function buildMenu() {
    const appConfig = config.load();
    return Menu.buildFromTemplate([
      {
        label: 'Afficher LocalDrop',
        click: () => {
          mainWindow.show();
          mainWindow.focus();
        },
      },
      {
        label: 'Nouvelle session',
        click: () => {
          mainWindow.show();
          mainWindow.webContents.send('request-new-session');
        },
      },
      {
        label: 'Ouvrir le dossier',
        click: () => {
          shell.openPath(appConfig.downloadDir);
        },
      },
      { type: 'separator' },
      {
        label: 'Lancer au démarrage de Windows',
        type: 'checkbox',
        checked: !!appConfig.autostart,
        click: (item) => {
          autostartHandlers.setAutostart(item.checked);
          appConfig.autostart = item.checked;
          config.save(appConfig);
        },
      },
      { type: 'separator' },
      {
        label: 'Quitter',
        click: () => {
          app.isQuiting = true;
          app.quit();
        },
      },
    ]);
  }

  tray.setContextMenu(buildMenu());
  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  return tray;
}

module.exports = { createTray };
