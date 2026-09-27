const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt',
  '.mp4', '.mov', '.avi', '.mkv', '.webm', '.3gp',
]);

// Taille max par fichier (configurable plus tard via data/config.json).
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2 Go

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

// Nettoie le nom de fichier : retire tout chemin (../, /, \) et caractères interdits.
function sanitizeFileName(name) {
  const base = path.basename(String(name || '')).replace(/[/\\?%*:|"<>\x00-\x1F]/g, '_').trim();
  return base || 'fichier';
}

function isExtensionAllowed(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext);
}

// Empêche l'écrasement : photo.jpg -> photo (1).jpg -> photo (2).jpg ...
function resolveUniquePath(dir, fileName) {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let candidate = path.join(dir, fileName);
  let counter = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base} (${counter})${ext}`);
    counter += 1;
  }
  return candidate;
}

module.exports = {
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE,
  generateToken,
  sanitizeFileName,
  isExtensionAllowed,
  resolveUniquePath,
};
