const baileys = require('@whiskeysockets/baileys');
console.log('Keys in baileys:', Object.keys(baileys));
if (baileys.default) {
  console.log('Keys in baileys.default:', Object.keys(baileys.default));
}
console.log('makeWASocket:', typeof baileys.makeWASocket);
console.log('useMultiFileAuthState:', typeof baileys.useMultiFileAuthState);
if (baileys.default) {
  console.log('default.makeWASocket:', typeof baileys.default.makeWASocket);
  console.log('default.useMultiFileAuthState:', typeof baileys.default.useMultiFileAuthState);
}
