const os = require('os');

// Retourne les adresses IPv4 locales utilisables (hors 127.0.0.1),
// avec une estimation du type d'interface (wifi / ethernet / other).
function getLocalAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const [name, ifaces] of Object.entries(interfaces)) {
    if (!ifaces) continue;
    for (const iface of ifaces) {
      if (iface.family !== 'IPv4' || iface.internal) continue;

      const lower = name.toLowerCase();
      let kind = 'other';
      if (lower.includes('wi-fi') || lower.includes('wlan') || lower.includes('wifi')) {
        kind = 'wifi';
      } else if (lower.includes('eth') || lower.includes('ethernet') || lower.includes('en0') || lower.includes('en1')) {
        kind = 'ethernet';
      }

      addresses.push({ name, address: iface.address, kind, mac: iface.mac });
    }
  }

  // Priorité au Wi-Fi, puis Ethernet, puis le reste.
  const order = { wifi: 0, ethernet: 1, other: 2 };
  addresses.sort((a, b) => order[a.kind] - order[b.kind]);

  return addresses;
}

module.exports = { getLocalAddresses };
