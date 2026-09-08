'use strict';

/**
 * OwnerAlert — avisa o dono do PME quando a sessão WhatsApp precisa de ação humana
 * (QR / desconectado prolongado). Não apaga credenciais.
 *
 * Destino: OWNER_WHATSAPP_JID ou config.ownerPhone / ownerJid no attendants_db.
 */

const fs = require('node:fs');
const path = require('node:path');

const STATE_PATH = path.join(__dirname, '../../workspace/sessions/owner_alert_state.json');
const COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6h entre alertas do mesmo tipo

class OwnerAlert {
  constructor(options = {}) {
    this.getDriver = options.getDriver || (() => null);
    this.getOwnerJid = options.getOwnerJid || (() => process.env.OWNER_WHATSAPP_JID || null);
    this.cooldownMs = options.cooldownMs || COOLDOWN_MS;
    this._state = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(STATE_PATH)) {
        return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
      }
    } catch (_) {}
    return { last: {} };
  }

  _save() {
    try {
      const dir = path.dirname(STATE_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(STATE_PATH, JSON.stringify(this._state, null, 2), 'utf8');
    } catch (_) {}
  }

  _canSend(type) {
    const t = (this._state.last && this._state.last[type]) || 0;
    return Date.now() - t > this.cooldownMs;
  }

  _mark(type) {
    if (!this._state.last) this._state.last = {};
    this._state.last[type] = Date.now();
    this._save();
  }

  /**
   * @param {'wa_disconnected'|'wa_needs_qr'|'wa_standby'} type
   * @param {string} [detail]
   */
  async notify(type, detail = '') {
    if (!this._canSend(type)) {
      return { ok: false, reason: 'COOLDOWN' };
    }
    const jid = this.getOwnerJid();
    if (!jid) {
      console.warn(`[OWNER_ALERT] ${type} — sem OWNER_WHATSAPP_JID configurado. ${detail}`);
      this._mark(type);
      return { ok: false, reason: 'NO_OWNER_JID' };
    }

    const messages = {
      wa_disconnected:
        '⚠️ Max Atendente: a sessão do WhatsApp está desconectada há um tempo. Se as mensagens pararem, abra o painel e verifique a conexão.',
      wa_needs_qr:
        '⚠️ Max Atendente: é necessário escanear o QR Code no painel para religar o WhatsApp. A sessão não foi apagada automaticamente.',
      wa_standby:
        '⚠️ Max Atendente: o WhatsApp entrou em modo espera (limite de QR). Abra o painel e gere um novo pareamento quando puder.'
    };
    const text = `${messages[type] || messages.wa_disconnected}${detail ? `\n\nDetalhe: ${detail}` : ''}`;

    try {
      const driver = this.getDriver();
      if (!driver || !driver.sock || driver.connectionState !== 'CONNECTED') {
        console.warn(`[OWNER_ALERT] não foi possível enviar (${type}): socket indisponível`);
        return { ok: false, reason: 'SOCKET_DOWN' };
      }
      let dest = String(jid).trim();
      if (!dest.includes('@')) dest = `${dest.replace(/\D/g, '')}@s.whatsapp.net`;
      await driver.sock.sendMessage(dest, { text });
      this._mark(type);
      console.log(`[OWNER_ALERT] enviado ${type} → ${dest}`);
      return { ok: true };
    } catch (e) {
      console.warn('[OWNER_ALERT] falha ao enviar:', e.message);
      return { ok: false, reason: e.message };
    }
  }
}

module.exports = { OwnerAlert };
