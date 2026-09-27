(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  const els = {
    connectionState: document.getElementById('connection-state'),
    connectionText: document.getElementById('connection-text'),
    uploadArea: document.getElementById('upload-area'),
    pcName: document.getElementById('pc-name'),
    fileInput: document.getElementById('file-input'),
    selectionSummary: document.getElementById('selection-summary'),
    fileCount: document.getElementById('file-count'),
    fileTotalSize: document.getElementById('file-total-size'),
    selectedFiles: document.getElementById('selected-files'),
    sendBtn: document.getElementById('send-btn'),
    progressArea: document.getElementById('progress-area'),
    currentFileName: document.getElementById('current-file-name'),
    progressFill: document.getElementById('progress-fill'),
    progressPercent: document.getElementById('progress-percent'),
    progressDetail: document.getElementById('progress-detail'),
    progressSpeed: document.getElementById('progress-speed'),
    progressEta: document.getElementById('progress-eta'),
    doneMessage: document.getElementById('done-message'),
    errorArea: document.getElementById('error-area'),
  };

  let selectedFiles = [];

  function detectDeviceLabel() {
    const ua = navigator.userAgent || '';
    if (/iphone/i.test(ua)) return 'iPhone';
    if (/ipad/i.test(ua)) return 'iPad';
    if (/android/i.test(ua)) {
      const match = ua.match(/;\s*([^;)]+)\s+Build/);
      return match ? match[1].trim() : 'Android';
    }
    return 'Appareil';
  }
  const deviceLabel = detectDeviceLabel();

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

  function showError(message) {
    els.errorArea.textContent = message;
    els.errorArea.classList.remove('hidden');
  }

  function clearError() {
    els.errorArea.classList.add('hidden');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  let socket = null;

  async function checkSession() {
    if (!token) {
      showError('Lien invalide. Scannez à nouveau le QR Code affiché sur le PC.');
      return;
    }
    try {
      const res = await fetch(`/api/session/${token}`);
      if (!res.ok) {
        showError(
          "Impossible de se connecter au PC.\nVérifiez que le téléphone et le PC sont connectés au même réseau local, ou scannez à nouveau le QR Code (il a peut-être expiré)."
        );
        return;
      }
      const session = await res.json();
      els.pcName.textContent = session.pcName;
      els.connectionState.classList.add('hidden');
      els.uploadArea.classList.remove('hidden');
      clearError();

      if (window.io && !socket) {
        socket = io();
        socket.on('connect', () => socket.emit('join', { token, role: 'mobile' }));
        socket.on('session:destroyed', (info) => {
          showError(
            info.reason === 'expired'
              ? 'La session a expiré. Scannez à nouveau le QR Code sur le PC.'
              : "La session a été annulée par l'ordinateur."
          );
          els.uploadArea.classList.add('hidden');
        });
        socket.on('disconnect', () => {
          showError('Connexion interrompue. Tentative de reconnexion...');
        });
        socket.on('connect', () => clearError());
      }
    } catch (err) {
      showError(
        'Impossible de se connecter au PC.\nVérifiez que le téléphone et le PC sont connectés au même réseau local.'
      );
    }
  }

  els.fileInput.addEventListener('change', () => {
    selectedFiles = Array.from(els.fileInput.files || []);
    renderSelection();
  });

  function renderSelection() {
    if (selectedFiles.length === 0) {
      els.selectionSummary.classList.add('hidden');
      els.selectedFiles.innerHTML = '';
      els.sendBtn.disabled = true;
      return;
    }
    els.selectionSummary.classList.remove('hidden');
    els.fileCount.textContent = `${selectedFiles.length} fichier${selectedFiles.length > 1 ? 's' : ''}`;
    const total = selectedFiles.reduce((sum, f) => sum + f.size, 0);
    els.fileTotalSize.textContent = formatBytes(total);
    els.selectedFiles.innerHTML = selectedFiles
      .map((f) => `<li>${escapeHtml(f.name)} — ${formatBytes(f.size)}</li>`)
      .join('');
    els.sendBtn.disabled = false;
  }

  function uploadOneFile(file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/upload/${token}`);
      xhr.setRequestHeader('X-Device-Label', deviceLabel);

      let lastLoaded = 0;
      let lastTime = Date.now();

      xhr.upload.addEventListener('progress', (e) => {
        if (!e.lengthComputable) return;
        const now = Date.now();
        const elapsedSec = (now - lastTime) / 1000;
        const deltaBytes = e.loaded - lastLoaded;
        const speed = elapsedSec > 0.15 ? deltaBytes / elapsedSec : null;

        if (speed !== null) {
          lastLoaded = e.loaded;
          lastTime = now;
        }

        onProgress(e.loaded, e.total, speed);
      });

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          let message = `Erreur serveur (${xhr.status})`;
          try {
            message = JSON.parse(xhr.responseText).message || message;
          } catch (e) {
            /* ignore */
          }
          reject(new Error(message));
        }
      };

      xhr.onerror = () => reject(new Error('Réseau interrompu pendant le transfert.'));

      const formData = new FormData();
      formData.append('file', file, file.name);
      xhr.send(formData);
    });
  }

  els.sendBtn.addEventListener('click', async () => {
    if (selectedFiles.length === 0) return;
    els.sendBtn.disabled = true;
    els.progressArea.classList.remove('hidden');
    els.doneMessage.classList.add('hidden');
    clearError();

    for (let i = 0; i < selectedFiles.length; i += 1) {
      const file = selectedFiles[i];
      els.currentFileName.textContent = `${file.name} (${i + 1}/${selectedFiles.length})`;

      try {
        // eslint-disable-next-line no-await-in-loop
        await uploadOneFile(file, (loaded, total, speed) => {
          const pct = total ? Math.round((loaded / total) * 100) : 0;
          els.progressFill.style.width = `${pct}%`;
          els.progressPercent.textContent = `${pct}%`;
          els.progressDetail.textContent = `${formatBytes(loaded)} / ${formatBytes(total)}`;

          if (speed && speed > 0) {
            els.progressSpeed.textContent = `Vitesse : ${formatBytes(speed)}/s`;
            const remaining = (total - loaded) / speed;
            els.progressEta.textContent = `Temps restant : ${Math.max(0, Math.round(remaining))} s`;
          }
        });
      } catch (err) {
        showError(err.message || "Le transfert a échoué.");
        els.sendBtn.disabled = false;
        return;
      }
    }

    els.progressArea.classList.add('hidden');
    els.doneMessage.classList.remove('hidden');
    selectedFiles = [];
    els.fileInput.value = '';
    renderSelection();
    els.sendBtn.disabled = false;
  });

  checkSession();
})();
