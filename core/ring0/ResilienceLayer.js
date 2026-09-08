'use strict';

/**
 * ResilienceLayer — install-and-forget ops
 * - Shadow backup de JSON críticos
 * - Outbox de mensagens WhatsApp não enviadas
 * - Persistência de message IDs processados
 * - Snapshot de estado de sessão
 * - Handlers de processo (SIGTERM / uncaught não matam em silêncio)
 */

const fs = require('node:fs');
const path = require('node:path');

const WORKSPACE = path.join(__dirname, '../../workspace');
const RES_ROOT = path.join(WORKSPACE, 'resilience');

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

class ResilienceLayer {
  constructor(options = {}) {
    this.root = options.root || RES_ROOT;
    this.outboxDir = path.join(this.root, 'outbox');
    this.stateDir = path.join(this.root, 'session_state');
    this.shadowDir = path.join(this.root, 'shadow');
    this.msgIdDir = path.join(this.root, 'processed_ids');
    for (const d of [this.root, this.outboxDir, this.stateDir, this.shadowDir, this.msgIdDir]) {
      ensureDir(d);
    }
    this._handlersInstalled = false;
  }

  /** Cópia atómica shadow de ficheiro de config */
  shadowCopy(srcPath, label = 'file') {
    try {
      if (!fs.existsSync(srcPath)) return { ok: false, reason: 'NO_SOURCE' };
      const base = path.basename(srcPath);
      const dest = path.join(this.shadowDir, `${label}_${base}`);
      const tmp = dest + '.tmp';
      fs.copyFileSync(srcPath, tmp);
      fs.renameSync(tmp, dest);
      // second generation
      try {
        fs.copyFileSync(dest, dest + '.bak');
      } catch (_) {}
      return { ok: true, dest };
    } catch (err) {
      return { ok: false, reason: err.message };
    }
  }

  shadowAttendantsDb(dbPath) {
    const p = dbPath || path.join(WORKSPACE, 'attendants_db.json');
    return this.shadowCopy(p, 'attendants');
  }

  shadowRuntimeDb(dbPath) {
    const p = dbPath || path.join(WORKSPACE, 'autonmax.db');
    return this.shadowCopy(p, 'runtime_db');
  }

  /** Outbox: mensagem a reenviar após reconnect */
  enqueueOutbound({ sessionKey, remoteJid, text, partnerId }) {
    try {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const row = {
        id,
        sessionKey: sessionKey || 'pme:default',
        remoteJid,
        text: String(text || '').slice(0, 4000),
        partnerId: partnerId || null,
        createdAt: new Date().toISOString(),
        attempts: 0
      };
      const file = path.join(this.outboxDir, `${id}.json`);
      fs.writeFileSync(file, JSON.stringify(row, null, 2));
      return { ok: true, id };
    } catch (err) {
      return { ok: false, reason: err.message };
    }
  }

  listOutbox(limit = 50) {
    try {
      const files = fs.readdirSync(this.outboxDir).filter((f) => f.endsWith('.json')).slice(0, limit);
      return files.map((f) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(this.outboxDir, f), 'utf8'));
        } catch (_) {
          return null;
        }
      }).filter(Boolean);
    } catch (_) {
      return [];
    }
  }

  ackOutbox(id) {
    try {
      const file = path.join(this.outboxDir, `${id}.json`);
      if (fs.existsSync(file)) fs.unlinkSync(file);
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err.message };
    }
  }

  bumpOutboxAttempt(id) {
    try {
      const file = path.join(this.outboxDir, `${id}.json`);
      if (!fs.existsSync(file)) return;
      const row = JSON.parse(fs.readFileSync(file, 'utf8'));
      row.attempts = (row.attempts || 0) + 1;
      row.lastAttemptAt = new Date().toISOString();
      if (row.attempts > 8) {
        fs.renameSync(file, file + '.dead');
        return;
      }
      fs.writeFileSync(file, JSON.stringify(row, null, 2));
    } catch (_) {}
  }

  /** Processed message IDs — anti-replay após crash */
  loadProcessedIds(sessionKey) {
    const file = path.join(this.msgIdDir, `${String(sessionKey).replace(/[^a-zA-Z0-9:_-]/g, '_')}.json`);
    try {
      if (!fs.existsSync(file)) return [];
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      return Array.isArray(data.ids) ? data.ids.slice(-1500) : [];
    } catch (_) {
      return [];
    }
  }

  saveProcessedIds(sessionKey, idsSet) {
    try {
      const file = path.join(this.msgIdDir, `${String(sessionKey).replace(/[^a-zA-Z0-9:_-]/g, '_')}.json`);
      const ids = [...idsSet].slice(-1500);
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ updatedAt: new Date().toISOString(), ids }));
      fs.renameSync(tmp, file);
    } catch (_) {}
  }

  saveSessionState(sessionKey, state) {
    try {
      const file = path.join(this.stateDir, `${String(sessionKey).replace(/[^a-zA-Z0-9:_-]/g, '_')}.json`);
      const tmp = file + '.tmp';
      fs.writeFileSync(
        tmp,
        JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2)
      );
      fs.renameSync(tmp, file);
    } catch (_) {}
  }

  loadSessionState(sessionKey) {
    try {
      const file = path.join(this.stateDir, `${String(sessionKey).replace(/[^a-zA-Z0-9:_-]/g, '_')}.json`);
      if (!fs.existsSync(file)) return null;
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (_) {
      return null;
    }
  }

  /** Backup periódico */
  startPeriodicBackup(intervalMs = 5 * 60 * 1000) {
    if (this._backupTimer) return;
    const run = () => {
      this.shadowAttendantsDb();
      try {
        const dbPath = path.join(WORKSPACE, 'autonmax.db');
        if (fs.existsSync(dbPath)) this.shadowRuntimeDb(dbPath);
      } catch (_) {}
    };
    run();
    this._backupTimer = setInterval(run, intervalMs);
    if (this._backupTimer.unref) this._backupTimer.unref();
  }

  installProcessHandlers(runtime) {
    if (this._handlersInstalled || global.__MAX_RESILIENCE_HANDLERS__) return;
    global.__MAX_RESILIENCE_HANDLERS__ = true;
    this._handlersInstalled = true;

    const shutdown = (sig) => {
      console.warn(`[RESILIENCE] ${sig} — checkpoint e shadow backup`);
      try {
        this.shadowAttendantsDb();
        if (runtime && typeof runtime._forceWalCheckpoint === 'function') {
          runtime._forceWalCheckpoint();
        } else if (runtime && runtime.db) {
          try {
            runtime.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
          } catch (_) {}
        }
      } catch (e) {
        console.warn('[RESILIENCE] shutdown backup:', e.message);
      }
      // não process.exit forçado aqui — deixa o host decidir
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('uncaughtException', (err) => {
      console.error('[RESILIENCE] uncaughtException (processo mantido):', err.message);
      try {
        this.shadowAttendantsDb();
      } catch (_) {}
    });

    process.on('unhandledRejection', (err) => {
      console.error('[RESILIENCE] unhandledRejection:', err && err.message ? err.message : err);
    });
  }
}

let _singleton = null;
function getResilienceLayer() {
  if (!_singleton) _singleton = new ResilienceLayer();
  return _singleton;
}

module.exports = { ResilienceLayer, getResilienceLayer };
