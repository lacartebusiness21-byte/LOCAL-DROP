const fs = require('fs');
const crypto = require('crypto');
const Busboy = require('busboy');
const {
  sanitizeFileName,
  isExtensionAllowed,
  resolveUniquePath,
  MAX_FILE_SIZE,
} = require('./security');
const { addEntry } = require('./history');
const { notify } = require('./notifications');
const { serializeSession } = require('./sessions');

function handleUpload(req, res, session, io) {
  const contentLength = Number(req.headers['content-length'] || 0);
  if (contentLength > MAX_FILE_SIZE) {
    res.status(413).json({ message: 'Fichier trop volumineux. Taille maximale : 2 Go par fichier.' });
    return;
  }

  const deviceLabel = req.headers['x-device-label'] || 'Appareil';

  let busboy;
  try {
    busboy = Busboy({
      headers: req.headers,
      limits: { fileSize: MAX_FILE_SIZE },
      // Sans ceci, les noms de fichiers accentués (RFC 2388, défaut latin1)
      // ressortent corrompus ("Ã©tÃ©" au lieu de "été").
      defParamCharset: 'utf8',
    });
  } catch (e) {
    res.status(400).json({ message: 'Requête invalide.' });
    return;
  }

  let fileHandled = false;
  let responded = false;
  const fileEntry = {
    id: crypto.randomBytes(6).toString('hex'),
    name: '',
    size: contentLength,
    received: 0,
    status: 'uploading',
    deviceLabel,
  };

  function broadcast() {
    io.to(session.token).emit('session:update', serializeSession(session));
  }

  busboy.on('file', (fieldname, fileStream, info) => {
    fileHandled = true;
    const safeName = sanitizeFileName(info.filename || 'fichier');

    if (!isExtensionAllowed(safeName)) {
      fileEntry.name = safeName;
      fileEntry.status = 'error';
      fileStream.resume();
      if (!responded) {
        responded = true;
        res.status(415).json({ message: 'Type de fichier non autorisé.' });
      }
      return;
    }

    fileEntry.name = safeName;
    session.files.push(fileEntry);
    session.status = 'uploading';
    broadcast();

    let destPath;
    try {
      destPath = resolveUniquePath(session.downloadDir, safeName);
    } catch (e) {
      fileEntry.status = 'error';
      fileStream.resume();
      if (!responded) {
        responded = true;
        res.status(500).json({ message: "Impossible d'accéder au dossier de destination." });
      }
      return;
    }

    const writeStream = fs.createWriteStream(destPath);
    let received = 0;
    let lastEmit = 0;
    let limitHit = false;

    fileStream.on('data', (chunk) => {
      received += chunk.length;
      fileEntry.received = received;
      const now = Date.now();
      if (now - lastEmit > 200) {
        lastEmit = now;
        broadcast();
      }
    });

    fileStream.on('limit', () => {
      limitHit = true;
      fileEntry.status = 'error';
      writeStream.destroy();
      fs.unlink(destPath, () => {});
    });

    fileStream.pipe(writeStream);

    writeStream.on('finish', () => {
      if (!limitHit) {
        fileEntry.status = 'done';
        fileEntry.receivedPath = destPath;
        session.status = 'done';
        addEntry({
          device: deviceLabel,
          name: fileEntry.name,
          size: fileEntry.size || received,
          status: 'done',
        });
        notify('LocalDrop', `Nouveau fichier reçu : ${fileEntry.name}`);
      }
      broadcast();
    });

    writeStream.on('error', () => {
      fileEntry.status = 'error';
      broadcast();
    });
  });

  busboy.on('error', () => {
    if (!responded) {
      responded = true;
      res.status(500).json({ message: 'Le transfert a échoué. Connexion interrompue.' });
    }
  });

  busboy.on('finish', () => {
    if (!fileHandled) {
      if (!responded) {
        responded = true;
        res.status(400).json({ message: 'Aucun fichier reçu.' });
      }
      return;
    }
    if (!responded) {
      responded = true;
      if (fileEntry.status === 'error') {
        res.status(415).json({ message: 'Type de fichier non autorisé ou fichier trop volumineux.' });
      } else {
        res.json({ ok: true, name: fileEntry.name, status: fileEntry.status });
      }
    }
  });

  req.pipe(busboy);
}

module.exports = { handleUpload };
