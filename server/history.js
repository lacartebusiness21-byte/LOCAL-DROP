const fs = require('fs');
const path = require('path');
const { CONFIG_DIR } = require('./config');

const HISTORY_PATH = path.join(CONFIG_DIR, 'history.json');
const MAX_ENTRIES = 500;

function load() {
  try {
    const raw = fs.readFileSync(HISTORY_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function addEntry(entry) {
  const list = load();
  list.unshift({ ...entry, date: new Date().toISOString() });
  if (list.length > MAX_ENTRIES) list.length = MAX_ENTRIES;
  try {
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(list, null, 2), 'utf-8');
  } catch (e) {
    /* si l'écriture échoue, l'historique reste juste en mémoire pour cette session */
  }
  return list;
}

module.exports = { load, addEntry, HISTORY_PATH };
