#!/usr/bin/env node
const builder = require('electron-builder');
const { Platform } = builder;

const args = process.argv.slice(2);
const targetIndex = args.indexOf('--target');
const target = targetIndex !== -1 ? args[targetIndex + 1] : null;

let platformTarget;
if (target === 'windows') {
  platformTarget = Platform.WINDOWS.createTarget();
} else if (target === 'linux') {
  platformTarget = Platform.LINUX.createTarget();
} else {
  platformTarget = Platform.current().createTarget();
}

builder
  .build({ targets: platformTarget })
  .then(() => {
    console.log('Build terminé. Fichiers disponibles dans dist/.');
  })
  .catch((err) => {
    console.error('Échec du build :', err.message || err);
    process.exit(1);
  });
