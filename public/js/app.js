(function () {
  'use strict';

  const els = {
    qrImage: document.getElementById('qr-image'),
    statusLine: document.getElementById('status-line'),
    statusText: document.getElementById('status-text'),
    localUrl: document.getElementById('local-url'),
    copyAddress: document.getElementById('copy-address'),
    refreshQr: document.getElementById('refresh-qr'),
    clientsCount: document.getElementById('clients-count'),
    multiAddress: document.getElementById('multi-address'),
    addressSelect: document.getElementById('address-select'),
    folderPath: document.getElementById('folder-path'),
    chooseFolder: document.getElementById('choose-folder'),
    openFolder: document.getElementById('open-folder'),
    newSession: document.getElementById('new-session'),
    cancelSession: document.getElementById('cancel-session'),
    transferPanel: document.getElementById('transfer-panel'),
    globalProgressLabel: document.getElementById('global-progress-label'),
    globalProgressFill: document.getElementById('global-progress-fill'),
    fileList: document.getElementById('file-list'),
    toastArea: document.getElementById('toast-area'),
    themeToggle: document.getElementById('theme-toggle'),
    pcNameFooter: document.getElementById('pc-name-footer'),
    welcomeOverlay: document.getElementById('welcome-overlay'),
    welcomeContinue: document.getElementById('welcome-continue'),
    diagnosticToggle: document.getElementById('diagnostic-toggle'),
    diagnosticBody: document.getElementById('diagnostic-body'),
    diagnosticCaret: document.getElementById('diagnostic-caret'),
    testConnection: document.getElementById('test-connection'),
    diagPlatform: document.getElementById('diag-platform'),
    diagInterface: document.getElementById('diag-interface'),
    diagIpv4: document.getElementById('diag-ipv4'),
    diagPort: document.getElementById('diag-port'),
    diagServer: document.getElementById('diag-server'),
    diagWebsocket: document.getElementById('diag-websocket'),
    diagFirewall: document.getElementById('diag-firewall'),
    autostartCheckbox: document.getElementById('autostart-checkbox'),
    startMinimizedCheckbox: document.getElementById('start-minimized-checkbox'),
    historyToggle: document.getElementById('history-toggle'),
    historyBody: document.getElementById('history-body'),
    historyCaret: document.getElementById('history-caret'),
    historyList: document.getElementById('history-list'),
    firewallBanner: document.getElementById('firewall-banner'),
    firewallMessage: document.getElementById('firewall-message'),
    firewallDismiss: document.getElementById('firewall-dismiss'),
  };

  let currentToken = null;
  let socket = null;
  let knownAddresses = [];

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i += 1;
    }
    return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    els.toastArea.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  function setStatus(connected) {
    els.statusLine.classList.toggle('status-connected', connected);
    els.statusText.textContent = connected ? 'Téléphone connecté' : "En attente d'une connexion...";
  }

  async function createSession(address) {
    // Invalide systématiquement la session précédente : un ancien QR Code
    // ne doit jamais rester valable après qu'un nouveau a été généré.
    if (currentToken) {
      try {
        await fetch(`/api/session/${currentToken}`, { method: 'DELETE' });
      } catch (e) {
        /* le serveur redémarre peut-être : on continue quand même */
      }
      currentToken = null;
    }
    let res;
    try {
      res = await fetch('/api/session/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(address ? { address } : {}),
      });
    } catch (e) {
      showToast('Serveur local indisponible.');
      return;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.message || 'Impossible de créer une session.');
      return;
    }
    const data = await res.json();
    currentToken = data.token;
    knownAddresses = data.addresses || [];

    els.qrImage.src = data.qrDataUrl;
    els.localUrl.textContent = data.url;
    els.folderPath.textContent = data.downloadDir;
    els.pcNameFooter.textContent = data.pcName;
    setStatus(false);
    els.clientsCount.textContent = '0';
    els.transferPanel.classList.add('hidden');
    els.fileList.innerHTML = '';

    if (knownAddresses.length > 1) {
      els.multiAddress.classList.remove('hidden');
      const kindLabel = { wifi: 'Wi-Fi', ethernet: 'Ethernet', other: 'Autre' };
      els.addressSelect.innerHTML = knownAddresses
        .map((a) => `<option value="${a.address}">${kindLabel[a.kind] || 'Autre'} — ${a.name} — ${a.address}</option>`)
        .join('');
      els.addressSelect.value = address || knownAddresses[0].address;
    } else {
      els.multiAddress.classList.add('hidden');
    }

    joinSocketRoom(currentToken);
    runDiagnostics();
  }

  function joinSocketRoom(token) {
    if (!socket) {
      socket = io();
      socket.on('session:update', renderSessionState);
      socket.on('session:destroyed', (info) => {
        showToast(
          info.reason === 'expired' ? 'La session a expiré.' : 'La session a été annulée.'
        );
      });
      socket.on('connect', () => {
        if (currentToken) socket.emit('join', { token: currentToken, role: 'pc' });
      });
    }
    socket.emit('join', { token, role: 'pc' });
  }

  function renderSessionState(session) {
    setStatus(session.phoneConnected);
    els.clientsCount.textContent = String(session.clientsCount || 0);

    if (session.status === 'connected' && session.files.length === 0) {
      showToast('Téléphone connecté');
    }

    if (session.files.length > 0) {
      els.transferPanel.classList.remove('hidden');
      renderFileList(session.files);
      if (session.status === 'done') {
        showToast('Transfert terminé');
        loadHistory();
      }
    }
  }

  function renderFileList(files) {
    els.fileList.innerHTML = files
      .map((f) => {
        const pct = f.size ? Math.round((f.received / f.size) * 100) : 0;
        const statusLabel = { uploading: `${pct}%`, done: '✅', error: '❌' }[f.status] || '';
        return `<li><span>${escapeHtml(f.name)}</span><span>${statusLabel}</span></li>`;
      })
      .join('');

    const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
    const totalReceived = files.reduce((sum, f) => sum + (f.received || 0), 0);
    const globalPct = totalSize ? Math.round((totalReceived / totalSize) * 100) : 0;
    const doneCount = files.filter((f) => f.status === 'done').length;

    els.globalProgressFill.style.width = `${globalPct}%`;
    els.globalProgressLabel.textContent = `${files.length} fichier${files.length > 1 ? 's' : ''} — ${doneCount} terminé${doneCount > 1 ? 's' : ''}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Historique -------------------------------------------------------
  async function loadHistory() {
    try {
      const res = await fetch('/api/history');
      const list = await res.json();
      if (!list.length) {
        els.historyList.innerHTML = '<li class="history-empty">Aucun transfert pour le moment.</li>';
        return;
      }
      els.historyList.innerHTML = list
        .slice(0, 30)
        .map((entry) => {
          const date = new Date(entry.date);
          const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
          const statusLabel = entry.status === 'done' ? '✅' : '❌';
          return `<li><span>${time} · ${escapeHtml(entry.device)} — ${escapeHtml(entry.name)}</span><span>${formatBytes(entry.size)} ${statusLabel}</span></li>`;
        })
        .join('');
    } catch (e) {
      /* historique non bloquant */
    }
  }

  els.historyToggle.addEventListener('click', () => {
    const hidden = els.historyBody.classList.toggle('hidden');
    els.historyCaret.textContent = hidden ? '▾' : '▴';
    if (!hidden) loadHistory();
  });

  // --- Thème sombre / clair -------------------------------------------------
  function initTheme() {
    const saved = localStorage.getItem('localdrop-theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
  }

  els.themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('localdrop-theme', next);
    } catch (e) {
      /* stockage indisponible : on ignore silencieusement */
    }
  });

  // --- Actions utilisateur ---------------------------------------------------
  els.newSession.addEventListener('click', () => createSession());
  els.refreshQr.addEventListener('click', () => createSession(els.addressSelect.value || undefined));

  els.cancelSession.addEventListener('click', () => createSession());

  els.addressSelect.addEventListener('change', (e) => createSession(e.target.value));

  els.copyAddress.addEventListener('click', async () => {
    const text = els.localUrl.textContent;
    if (!text || text === '—') return;
    try {
      await navigator.clipboard.writeText(text);
      showToast('Adresse copiée');
    } catch (e) {
      showToast('Impossible de copier automatiquement. Sélectionnez le texte manuellement.');
    }
  });

  els.openFolder.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/open-folder', { method: 'POST' });
      if (!res.ok) {
        const info = await res.json().catch(() => ({}));
        showToast(info.message || "Impossible d'ouvrir le dossier.");
      }
    } catch (e) {
      showToast("Impossible d'ouvrir le dossier.");
    }
  });

  els.diagnosticToggle.addEventListener('click', () => {
    const hidden = els.diagnosticBody.classList.toggle('hidden');
    els.diagnosticCaret.textContent = hidden ? '▾' : '▴';
  });

  async function runDiagnostics() {
    els.diagServer.textContent = '…';
    els.diagWebsocket.textContent = '…';
    try {
      const res = await fetch('/api/diagnostics');
      const data = await res.json();
      els.diagPlatform.textContent = data.platform;
      els.diagInterface.textContent = data.interface ? `${data.interface} (${data.interfaceKind})` : '—';
      els.diagIpv4.textContent = data.ipv4 || '—';
      els.diagPort.textContent = data.port;
      els.diagServer.textContent = data.server === 'ok' ? '✅ OK' : '❌';
      els.diagFirewall.textContent = data.firewall.message;

      // Le WebSocket sert déjà à recevoir cette page en temps réel :
      // s'il est connecté à cet instant, il fonctionne réellement.
      els.diagWebsocket.textContent = socket && socket.connected ? '✅ OK' : '❌ Non connecté';
    } catch (err) {
      els.diagServer.textContent = '❌ Injoignable';
      els.diagWebsocket.textContent = '❌';
    }
  }

  els.testConnection.addEventListener('click', runDiagnostics);

  // --- Démarrage automatique (jamais activé par défaut) --------------------
  async function loadAutostartState() {
    try {
      const res = await fetch('/api/autostart');
      const data = await res.json();
      els.autostartCheckbox.checked = !!data.enabled;
    } catch (e) {
      /* ignore : l'état reste tel quel si l'appel échoue */
    }
  }

  els.autostartCheckbox.addEventListener('change', async (e) => {
    const wanted = e.target.checked;
    try {
      const res = await fetch('/api/autostart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: wanted }),
      });
      if (!res.ok) {
        const info = await res.json().catch(() => ({}));
        showToast(info.message || 'Impossible de modifier le démarrage automatique.');
        e.target.checked = !wanted;
      }
    } catch (err) {
      showToast('Impossible de modifier le démarrage automatique.');
      e.target.checked = !wanted;
    }
  });

  loadAutostartState();

  async function loadStartMinimizedState() {
    try {
      const res = await fetch('/api/start-minimized');
      const data = await res.json();
      els.startMinimizedCheckbox.checked = !!data.enabled;
    } catch (e) {
      /* ignore */
    }
  }

  els.startMinimizedCheckbox.addEventListener('change', async (e) => {
    const wanted = e.target.checked;
    try {
      await fetch('/api/start-minimized', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: wanted }),
      });
    } catch (err) {
      showToast('Impossible de modifier ce réglage.');
      e.target.checked = !wanted;
    }
  });

  loadStartMinimizedState();

  els.chooseFolder.addEventListener('click', async () => {
    const res = await fetch('/api/choose-folder', { method: 'POST' });
    if (res.status === 501) {
      const info = await res.json().catch(() => ({}));
      showToast(info.message || 'Sélection graphique indisponible sur cette plateforme.');
      return;
    }
    if (res.status === 400) {
      return; // annulé par l'utilisateur, rien à faire
    }
    if (!res.ok) {
      const info = await res.json().catch(() => ({}));
      showToast(info.message || 'Sélection du dossier impossible.');
      return;
    }
    const data = await res.json();
    els.folderPath.textContent = data.path;
    // Recrée la session pour appliquer le nouveau dossier de destination.
    createSession(els.addressSelect.value || undefined);
  });

  // --- Premier démarrage -------------------------------------------------
  function initWelcome() {
    const seen = localStorage.getItem('localdrop-welcome-seen');
    if (!seen) {
      els.welcomeOverlay.classList.remove('hidden');
    }
  }

  els.welcomeContinue.addEventListener('click', () => {
    els.welcomeOverlay.classList.add('hidden');
    try {
      localStorage.setItem('localdrop-welcome-seen', '1');
    } catch (e) {
      /* ignore */
    }
  });

  // --- Alerte pare-feu (envoyée par le process Electron) -------------------
  if (window.localdrop && window.localdrop.onFirewallWarning) {
    window.localdrop.onFirewallWarning((message) => {
      els.firewallMessage.textContent = message;
      els.firewallBanner.classList.remove('hidden');
    });
  }
  els.firewallDismiss.addEventListener('click', () => {
    els.firewallBanner.classList.add('hidden');
  });

  if (window.localdrop && window.localdrop.onRequestNewSession) {
    window.localdrop.onRequestNewSession(() => createSession());
  }

  // --- Init ----------------------------------------------------------------
  initTheme();
  initWelcome();
  createSession();
  loadHistory();
})();
