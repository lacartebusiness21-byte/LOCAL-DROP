let shell = null;
try {
  shell = require('electron').shell;
} catch (e) {
  shell = null;
}

// Retourne une chaîne d'erreur si l'ouverture échoue, sinon une chaîne vide.
async function openFolder(dirPath) {
  if (shell && shell.openPath) {
    return shell.openPath(dirPath);
  }
  return '';
}

module.exports = { openFolder };
