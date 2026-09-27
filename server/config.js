const fs = require('fs');
const path = require('path');
const os = require('os');

let electronApp = null;
try {
  // Disponible uniquement lorsque le serveur tourne dans le process principal Electron.
  electronApp = require('electron').app;
} catch (e) {
  electronApp = null;
}

function getConfigDir() {
  if (electronApp && electronApp.getPath) {
    try {
      return electronApp.getPath('userData');
    } catch (e) {
      /* on retombe sur le dossier maison */
    }
  }
  return path.join(os.homedir(), '.localdrop');
}

const CONFIG_DIR = getConfigDir();
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

const DEFAULTS = {
  downloadDir: path.join(os.homedir(), 'LocalDrop'),
  theme: 'system',
  autostart: false,
  startMinimized: false,
  port: 3000,
  welcomeSeen: false,
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function load() {
  ensureDir(CONFIG_DIR);
  if (!fs.existsSync(CONFIG_PATH)) {
    save(DEFAULTS);
    return { ...DEFAULTS };
  }
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (e) {
    return { ...DEFAULTS };
  }
}

function save(config) {
  ensureDir(CONFIG_DIR);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

module.exports = { load, save, CONFIG_DIR, CONFIG_PATH, DEFAULTS };
