'use strict';

/**
 * WhatsAppSessionManager — OPS-1/OPS-2
 *
 * Isola sessões Baileys por sessionKey (authDir próprio).
 * Pessoal e PME NÃO partilham socket nem credenciais.
 *
 *   pme:default | pme:{partnerId} | pme:{partnerId}:{lineId}
 *
 * Compatibilidade: pme:default usa o authDir legado
 *   workspace/sessions/baileys_auth
 * para não forçar re-QR em instalações já pareadas.
 */

const fs = require('node:fs');
const path = require('node:path');
const WhatsAppDriver = require('./WhatsAppDriver');

const SESSIONS_ROOT = path.join(__dirname, '../../workspace/sessions');

/** OPS-7: max WhatsApp lines per PME partner on same host */
const MAX_LINES_PER_PARTNER = 2;

function sanitizeSegment(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120);
}

class WhatsAppSessionManager {
  constructor(options = {}) {
    this.rootDir = options.rootDir || SESSIONS_ROOT;
    this.sessions = new Map(); // sessionKey -> WhatsAppDriver
    this.globalHandlers = {}; // { onMessageReceived, onStateToggle, onQrUpdate }
    if (!fs.existsSync(this.rootDir)) {
      fs.mkdirSync(this.rootDir, { recursive: true });
    }
  }

  setGlobalHandlers(handlers) {
    this.globalHandlers = { ...this.globalHandlers, ...handlers };
    for (const driver of this.sessions.values()) {
      if (handlers.onMessageReceived) driver.onMessageReceived = handlers.onMessageReceived;
      if (handlers.onStateToggle) driver.onStateToggle = handlers.onStateToggle;
      if (handlers.onQrUpdate) driver.onQrUpdate = handlers.onQrUpdate;
    }
  }

  /**
   * Normaliza e valida sessionKey.
   */
  normalizeKey(sessionKey, fallback = 'pme:default') {
    let key = sanitizeSegment(sessionKey || fallback);
    if (!key.includes(':')) {
      if (key === 'business' || key === 'pme' || key === 'partner') key = 'pme:default';
      else key = `pme:${key}`;
    }
    const [kind] = key.split(':');
    if (kind !== 'pme') {
      key = `pme:${key}`;
    }
    return key;
  }

  /**
   * Resolve pasta de auth. Legado pme:default → baileys_auth (compat UI/produção).
   */
  resolveAuthDir(sessionKey) {
    const key = this.normalizeKey(sessionKey);
    if (key === 'pme:default') {
      return path.join(this.rootDir, 'baileys_auth');
    }
    const folder = key.replace(/:/g, '_');
    return path.join(this.rootDir, folder, 'baileys_auth');
  }

  getOrCreate(sessionKey, options = {}) {
    const key = this.normalizeKey(sessionKey);
    if (this.sessions.has(key)) {
      return this.sessions.get(key);
    }

    const authDir = options.authDir || this.resolveAuthDir(key);
    const driver = new WhatsAppDriver({ authDir });
    driver.sessionKey = key;
    driver.connectedPartnerId = options.partnerId || null;

    if (this.globalHandlers.onMessageReceived) driver.onMessageReceived = this.globalHandlers.onMessageReceived;
    if (this.globalHandlers.onStateToggle) driver.onStateToggle = this.globalHandlers.onStateToggle;
    if (this.globalHandlers.onQrUpdate) driver.onQrUpdate = this.globalHandlers.onQrUpdate;

    this.sessions.set(key, driver);
    console.log(`[WA_SESSION_MANAGER] sessão criada key=${key} authDir=${authDir}`);
    return driver;
  }

  get(sessionKey) {
    const key = this.normalizeKey(sessionKey);
    return this.sessions.get(key) || null;
  }

  /** Default PME — compatível com this.whatsAppDriver histórico */
  getPmeDefault(partnerId) {
    return this.getOrCreate(partnerId ? `pme:${partnerId}` : 'pme:default', {
      partnerId: partnerId || null
    });
  }



  /**
   * Resolve driver a partir de sessionKey explícito ou partnerId.
   */
  resolveFromRequest({ sessionKey, mode, partnerId, userId } = {}) {
    if (sessionKey) {
      return this.getOrCreate(sessionKey, { partnerId });
    }
    if (partnerId) {
      return this.getOrCreate(`pme:${partnerId}`, { partnerId });
    }
    return this.getPmeDefault();
  }

  listSessions() {
    return Array.from(this.sessions.entries()).map(([key, driver]) => ({
      sessionKey: key,
      connectionState: driver.connectionState,
      authDirectory: driver.authDir,
      activeContextMode: typeof driver.getContextMode === 'function' ? driver.getContextMode() : null
    }));
  }

  async health() {
    const items = [];
    for (const [key, driver] of this.sessions.entries()) {
      items.push({
        sessionKey: key,
        connectionState: driver.connectionState,
        hasCreds: fs.existsSync(path.join(driver.authDir, 'creds.json')),
        authDirectory: driver.authDir
      });
    }
    return {
      ok: true,
      sessionCount: items.length,
      sessions: items
    };
  }

  /**
   * Logout / reset APENAS da sessão indicada — nunca apaga auth de outra chave.
   */
  async resetSession(sessionKey, { wipeAuth = false } = {}) {
    const key = this.normalizeKey(sessionKey);
    const driver = this.sessions.get(key);
    if (!driver) {
      return { ok: false, reason: 'SESSION_NOT_LOADED', sessionKey: key };
    }
    try {
      if (driver.sock) {
        try {
          await driver.sock.end(undefined);
        } catch (_) {}
        driver.sock = null;
      }
      driver.connectionState = 'DISCONNECTED';
      if (wipeAuth && driver.authDir) {
        // Só apaga DENTRO do authDir desta sessão
        const root = path.resolve(this.rootDir);
        const target = path.resolve(driver.authDir);
        if (!target.startsWith(root)) {
          return { ok: false, reason: 'AUTH_DIR_OUTSIDE_ROOT', sessionKey: key };
        }
        // Não permitir wipe acidental de outra sessão via path traversal
        for (const [otherKey, other] of this.sessions.entries()) {
          if (otherKey !== key && path.resolve(other.authDir) === target) {
            return { ok: false, reason: 'AUTH_DIR_SHARED_REFUSAL', sessionKey: key };
          }
        }
        try {
          fs.rmSync(target, { recursive: true, force: true });
          fs.mkdirSync(target, { recursive: true });
        } catch (err) {
          return { ok: false, reason: 'WIPE_FAILED', message: err.message, sessionKey: key };
        }
      }
      return { ok: true, sessionKey: key, wiped: !!wipeAuth };
    } catch (err) {
      return { ok: false, reason: 'RESET_FAILED', message: err.message, sessionKey: key };
    }
  }

  /**
   * OPS-7 — multi-line: pme:{partnerId}:{lineId}
   * Agenda locks remain global per partnerId (not per line).
   */
  listLines(partnerId) {
    const pid = sanitizeSegment(partnerId || 'default');
    const prefix = `pme:${pid}:`;
    const lines = [];
    for (const [key, driver] of this.sessions.entries()) {
      if (key === `pme:${pid}` || key.startsWith(prefix)) {
        lines.push({
          sessionKey: key,
          lineId: key === `pme:${pid}` ? 'default' : key.slice(prefix.length),
          connectionState: driver.connectionState,
          authDirectory: driver.authDir
        });
      }
    }
    return lines;
  }

  /**
   * Create/get a line. Refuses if partner already has MAX_LINES_PER_PARTNER distinct lines.
   */
  getOrCreateLine(partnerId, lineId = 'default') {
    const pid = sanitizeSegment(partnerId || 'default');
    const lid = sanitizeSegment(lineId || 'default') || 'default';
    const key = lid === 'default' ? `pme:${pid}` : `pme:${pid}:${lid}`;
    const existingKeys = new Set();
    for (const k of this.sessions.keys()) {
      if (k === `pme:${pid}` || k.startsWith(`pme:${pid}:`)) existingKeys.add(k);
    }
    if (!this.sessions.has(key) && existingKeys.size >= MAX_LINES_PER_PARTNER) {
      const err = new Error('MAX_LINES_EXCEEDED');
      err.code = 'MAX_LINES_EXCEEDED';
      err.max = MAX_LINES_PER_PARTNER;
      err.partnerId = pid;
      err.existing = [...existingKeys];
      throw err;
    }
    return this.getOrCreate(key, { partnerId: pid });
  }

  static get MAX_LINES_PER_PARTNER() {
    return MAX_LINES_PER_PARTNER;
  }
}

module.exports = WhatsAppSessionManager;

