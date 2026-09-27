const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

const config = require('./config');
const { getLocalAddresses } = require('./network');
const sessions = require('./sessions');
const { handleUpload } = require('./upload');
const history = require('./history');
const { generateToken } = require('./security');
const { openFolder } = require('./shell-utils');

const appConfig = config.load();

function ensureDownloadDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    return true;
  } catch (e) {
    return false;
  }
}
ensureDownloadDir(appConfig.downloadDir);

function getPcName() {
  return os.hostname();
}

function testPortFree(port) {
  return new Promise((resolve) => {
    const tester = net
      .createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.once('close', () => resolve(true)).close())
      .listen(port, '0.0.0.0');
  });
}

async function pickPort(preferred) {
  let port = preferred;
  for (let i = 0; i < 20; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await testPortFree(port)) return port;
    port += 1;
  }
  return preferred; // dernier recours : on tente quand même, l'erreur EADDRINUSE sera gérée à l'écoute
}

function createApp({ chooseFolderHandler, autostartHandlers } = {}) {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });

  let currentPort = appConfig.port;

  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.post('/api/session/create', async (req, res) => {
    const { address, downloadDir } = req.body || {};

    if (downloadDir) {
      if (!ensureDownloadDir(downloadDir)) {
        return res.status(400).json({ message: "Impossible d'accéder au dossier choisi." });
      }
      appConfig.downloadDir = downloadDir;
      config.save(appConfig);
    }

    const addresses = getLocalAddresses();
    if (addresses.length === 0) {
      return res.status(500).json({
        message:
          "Adresse IP locale introuvable. Connectez le PC à un réseau Wi-Fi, ou activez le partage de connexion (hotspot) du PC.",
      });
    }

    const chosen = addresses.find((a) => a.address === address) || addresses[0];
    const session = sessions.createSession({
      address: chosen.address,
      downloadDir: appConfig.downloadDir,
      pcName: getPcName(),
    });

    const url = `http://${chosen.address}:${currentPort}/mobile.html?token=${session.token}`;

    let qrDataUrl;
    try {
      qrDataUrl = await QRCode.toDataURL(url, { margin: 1, scale: 8 });
    } catch (e) {
      return res.status(500).json({ message: 'Impossible de générer le QR Code.' });
    }

    res.json({
      token: session.token,
      url,
      qrDataUrl,
      addresses,
      downloadDir: appConfig.downloadDir,
      pcName: session.pcName,
    });
  });

  app.delete('/api/session/:token', (req, res) => {
    const session = sessions.destroySession(req.params.token, 'cancelled');
    if (session) {
      io.to(req.params.token).emit('session:destroyed', { reason: 'cancelled' });
    }
    res.json({ ok: true });
  });

  app.get('/api/session/:token', (req, res) => {
    const session = sessions.getSession(req.params.token);
    if (!session) return res.status(404).json({ message: 'Session introuvable ou expirée.' });
    sessions.touch(req.params.token);
    res.json({ pcName: session.pcName });
  });

  app.post('/api/upload/:token', (req, res) => {
    const session = sessions.getSession(req.params.token);
    if (!session) return res.status(404).json({ message: 'Session invalide ou expirée. Scannez à nouveau le QR Code.' });
    sessions.touch(req.params.token);
    handleUpload(req, res, session, io);
  });

  app.get('/api/diagnostics', (req, res) => {
    const addresses = getLocalAddresses();
    const primary = addresses[0];
    res.json({
      platform: `${os.type()} ${os.release()}`,
      interface: primary ? primary.name : null,
      interfaceKind: primary ? primary.kind : null,
      ipv4: primary ? primary.address : null,
      port: currentPort,
      server: 'ok',
      firewall: {
        message: addresses.length
          ? '✅ Réseau local disponible'
          : "❌ Aucune interface réseau détectée",
      },
    });
  });

  app.get('/api/autostart', (req, res) => {
    res.json({ enabled: !!appConfig.autostart });
  });

  app.post('/api/autostart', (req, res) => {
    const { enabled } = req.body || {};
    if (!autostartHandlers || !autostartHandlers.setAutostart) {
      return res.status(501).json({ message: 'Démarrage automatique indisponible sur cette plateforme.' });
    }
    try {
      autostartHandlers.setAutostart(!!enabled);
      appConfig.autostart = !!enabled;
      config.save(appConfig);
      res.json({ enabled: appConfig.autostart });
    } catch (e) {
      res.status(500).json({ message: 'Impossible de modifier le démarrage automatique.' });
    }
  });

  app.get('/api/start-minimized', (req, res) => {
    res.json({ enabled: !!appConfig.startMinimized });
  });

  app.post('/api/start-minimized', (req, res) => {
    const { enabled } = req.body || {};
    appConfig.startMinimized = !!enabled;
    config.save(appConfig);
    res.json({ enabled: appConfig.startMinimized });
  });

  app.post('/api/choose-folder', async (req, res) => {
    if (!chooseFolderHandler) {
      return res.status(501).json({ message: 'Sélection graphique indisponible sur cette plateforme.' });
    }
    try {
      const selectedPath = await chooseFolderHandler();
      if (!selectedPath) return res.status(400).json({ message: 'Sélection annulée.' });
      if (!ensureDownloadDir(selectedPath)) {
        return res.status(500).json({ message: "Impossible d'accéder à ce dossier." });
      }
      appConfig.downloadDir = selectedPath;
      config.save(appConfig);
      res.json({ path: selectedPath });
    } catch (e) {
      res.status(500).json({ message: 'Sélection du dossier impossible.' });
    }
  });

  app.post('/api/open-folder', async (req, res) => {
    const result = await openFolder(appConfig.downloadDir);
    if (result) return res.status(500).json({ message: result });
    res.json({ ok: true });
  });

  app.get('/api/history', (req, res) => {
    res.json(history.load());
  });

  io.on('connection', (socket) => {
    // payload : soit une chaîne (ancien format, traité comme mobile pour
    // compatibilité), soit { token, role } où role vaut 'pc' ou 'mobile'.
    // Le tableau de bord PC doit rejoindre la room pour recevoir les mises à
    // jour en temps réel, mais ne doit jamais compter comme un appareil connecté.
    socket.on('join', (payload) => {
      const token = typeof payload === 'string' ? payload : payload && payload.token;
      const role = typeof payload === 'object' && payload && payload.role === 'pc' ? 'pc' : 'mobile';

      const session = sessions.getSession(token);
      if (!session) {
        socket.emit('session:destroyed', { reason: 'expired' });
        return;
      }
      socket.join(token);
      sessions.touch(token);

      if (role === 'mobile' && !session.clients.has(socket.id)) {
        session.clients.set(socket.id, {
          connectedAt: Date.now(),
          userAgent: socket.handshake.headers['user-agent'] || 'Inconnu',
        });
        session.status = 'connected';
      }

      io.to(token).emit('session:update', sessions.serializeSession(session));

      socket.on('disconnect', () => {
        if (role === 'mobile') {
          session.clients.delete(socket.id);
          if (session.clients.size === 0 && session.files.every((f) => f.status !== 'uploading')) {
            session.status = 'waiting';
          }
        }
        io.to(token).emit('session:update', sessions.serializeSession(session));
      });
    });
  });

  setInterval(() => sessions.cleanupExpired(), 5 * 60 * 1000).unref();

  return { app, server, io };
}

async function start({ chooseFolderHandler, autostartHandlers } = {}) {
  const { app, server, io } = createApp({ chooseFolderHandler, autostartHandlers });
  const port = await pickPort(appConfig.port || 3000);
  appConfig.port = port;
  config.save(appConfig);

  return new Promise((resolve, reject) => {
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error('Port déjà utilisé. Fermez le programme qui l\'occupe puis relancez LocalDrop.'));
      } else {
        reject(err);
      }
    });
    server.listen(port, '0.0.0.0', () => {
      resolve({ app, server, io, port });
    });
  });
}

module.exports = { start, createApp, getPcName };
