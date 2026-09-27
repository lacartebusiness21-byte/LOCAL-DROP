let Notification = null;
try {
  Notification = require('electron').Notification;
} catch (e) {
  Notification = null;
}

function notify(title, body) {
  try {
    if (Notification && Notification.isSupported && Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  } catch (e) {
    /* pas bloquant : une notification ratée ne doit jamais casser un transfert */
  }
}

module.exports = { notify };
