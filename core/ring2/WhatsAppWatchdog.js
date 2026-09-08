'use strict';

/**
 * WhatsAppWatchdog — resiliência multi-sessão
 * - Reconnect sem wipe de credenciais
 * - Backoff exponencial por sessão
 * - Prefere initBaileys / forceReconnect soft
 */

const { getMetricsLog } = require('../ring1/MetricsEventLog');

class WhatsAppWatchdog {
  constructor(sessionManager, options = {}) {
    this.sm = sessionManager;
    this.intervalMs = options.intervalMs || 20000;
    this.metrics = options.metrics || getMetricsLog();
    this._timer = null;
    this._backoff = new Map();
    this._lastTick = 0;
  }

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => {
      this.tick().catch((e) => console.warn('[WA_WATCHDOG]', e.message));
    }, this.intervalMs);
    if (this._timer.unref) this._timer.unref();
    console.log('[WA_WATCHDOG] started interval=', this.intervalMs);
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  async tick() {
    this._lastTick = Date.now();
    if (!this.sm || typeof this.sm.listSessions !== 'function') {
      return { checked: 0, actions: [] };
    }
    const list = this.sm.listSessions();
    const actions = [];

    for (const s of list) {
      const driver = this.sm.get(s.sessionKey);
      if (!driver) continue;

      const state = driver.connectionState || s.connectionState || 'UNKNOWN';
      const hasCreds =
        driver.authDir &&
        require('node:fs').existsSync(require('node:path').join(driver.authDir, 'creds.json'));

      // Socket zumbi: creds + user mas inativo
      const inactive =
        driver.sock &&
        driver.sock.user &&
        driver.lastEventTime &&
        Date.now() - driver.lastEventTime > 90000;

      if ((state === 'DISCONNECTED' || inactive) && hasCreds && !driver.isInitializing) {
        const attempt = (this._backoff.get(s.sessionKey) || 0) + 1;
        this._backoff.set(s.sessionKey, attempt);
        const delay = Math.min(120000, 2000 * Math.pow(2, Math.min(attempt - 1, 5)));
        actions.push({ sessionKey: s.sessionKey, action: 'soft_reconnect', attempt, delay });

        try {
          this.metrics.record({
            type: 'wa_session_down',
            partnerId: this._partnerFromKey(s.sessionKey),
            sessionKey: s.sessionKey,
            meta: { state, attempt, inactive: !!inactive }
          });
        } catch (_) {}

        // Respeitar backoff mínimo entre tentativas
        const lastTry = driver._lastWatchdogReconnectAt || 0;
        if (Date.now() - lastTry < delay && attempt > 1) {
          actions[actions.length - 1].skipped = 'backoff';
          continue;
        }
        driver._lastWatchdogReconnectAt = Date.now();

        try {
          if (typeof driver.forceReconnect === 'function') {
            await driver.forceReconnect(); // soft — não apaga auth
          } else if (typeof driver.initBaileys === 'function') {
            driver.connectionState = 'DISCONNECTED';
            driver.isInitializing = false;
            await driver.initBaileys();
          }
          try {
            this.metrics.record({
              type: 'wa_reconnect_ok',
              partnerId: this._partnerFromKey(s.sessionKey),
              sessionKey: s.sessionKey,
              meta: { attempt }
            });
          } catch (_) {}
          if (driver.connectionState === 'CONNECTED') {
            this._backoff.set(s.sessionKey, 0);
          }
        } catch (err) {
          actions[actions.length - 1].error = err.message;
        }
      }

      if (state === 'CONNECTED') {
        this._backoff.set(s.sessionKey, 0);
      }

      if (state === 'PAIRING_READY' || state === 'STANDBY') {
        try {
          this.metrics.record({
            type: 'wa_qr_required',
            partnerId: this._partnerFromKey(s.sessionKey),
            sessionKey: s.sessionKey
          });
        } catch (_) {}
      }
    }
    return { checked: list.length, actions };
  }

  _partnerFromKey(sessionKey) {
    const key = String(sessionKey || '');
    if (key.startsWith('pme:')) {
      const parts = key.split(':');
      return parts[1] || 'default';
    }
    return 'default';
  }

  async health() {
    const base = this.sm && this.sm.health ? await this.sm.health() : { ok: true, sessions: [] };
    return {
      ok: true,
      watchdog: true,
      lastTick: this._lastTick,
      sessionCount: base.sessionCount || (base.sessions || []).length,
      sessions: base.sessions || []
    };
  }
}

module.exports = WhatsAppWatchdog;
