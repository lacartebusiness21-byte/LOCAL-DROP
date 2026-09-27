const { generateToken } = require('./security');

// Sessions en mémoire : token -> { clients: Map(socketId -> info), files: [...] }
const sessions = new Map();
const SESSION_TTL_MS = 60 * 60 * 1000; // expire après 1h d'inactivité

function createSession({ address, downloadDir, pcName }) {
  const token = generateToken();
  const session = {
    token,
    address,
    downloadDir,
    pcName,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    clients: new Map(), // socketId -> { connectedAt, userAgent, deviceLabel }
    files: [], // { id, name, size, received, status, deviceLabel }
    status: 'waiting', // waiting | connected | uploading | done
  };
  sessions.set(token, session);
  return session;
}

function getSession(token) {
  return sessions.get(token);
}

function destroySession(token, reason) {
  const session = sessions.get(token);
  sessions.delete(token);
  return session ? { ...session, reason } : null;
}

function touch(token) {
  const s = sessions.get(token);
  if (s) s.lastActivity = Date.now();
}

function cleanupExpired() {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (now - session.lastActivity > SESSION_TTL_MS) {
      sessions.delete(token);
    }
  }
}

// Ce qui est envoyé au client (jamais downloadDir en clair côté mobile).
function serializeSession(session) {
  return {
    token: session.token,
    phoneConnected: session.clients.size > 0,
    clientsCount: session.clients.size,
    status: session.status,
    files: session.files,
  };
}

module.exports = {
  sessions,
  createSession,
  getSession,
  destroySession,
  touch,
  cleanupExpired,
  serializeSession,
};
