// Démarre le serveur LocalDrop sans Electron, pour tester rapidement
// l'API et les interfaces web dans un navigateur classique.
// Le choix de dossier via bouton et le démarrage automatique Windows
// ne sont disponibles qu'en mode Electron (electron/main.js).
const serverLib = require('../server/server');

serverLib
  .start({})
  .then(({ port }) => {
    console.log(`LocalDrop (mode test, sans Electron) démarré : http://localhost:${port}`);
    console.log('Ctrl+C pour arrêter.');
  })
  .catch((err) => {
    console.error('Erreur au démarrage du serveur :', err.message);
    process.exit(1);
  });
