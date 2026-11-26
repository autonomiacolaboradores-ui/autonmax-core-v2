'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_BACKUP_INTERVAL_MS = 5 * 60 * 1000; // 5 min (mirrors legacy ResilienceLayer)

/**
 * Resolves the atomic shadow backup file path for a given SQLite dbPath.
 * @param {string} dbPath
 * @returns {string}
 */
function resolveShadowPath(dbPath) {
  return `${path.resolve(dbPath)}.shadow.bak`;
}

/**
 * Restores a missing or zero-byte SQLite file from its `.shadow.bak` copy before opening.
 * Safe no-op for `:memory:` or when the primary DB already exists with content.
 * @param {string} dbPath
 * @returns {{ restored: boolean, reason: string }}
 */
function restoreShadowIfMissing(dbPath) {
  if (!dbPath || dbPath === ':memory:' || String(dbPath).startsWith('file:')) {
    return { restored: false, reason: 'IN_MEMORY_DB' };
  }
  const absDb = path.resolve(dbPath);
  const shadowPath = resolveShadowPath(absDb);

  let primaryValid = false;
  try {
    if (fs.existsSync(absDb) && fs.statSync(absDb).size > 0) {
      primaryValid = true;
    }
  } catch {
    primaryValid = false;
  }

  if (primaryValid) {
    return { restored: false, reason: 'PRIMARY_OK' };
  }

  try {
    if (fs.existsSync(shadowPath) && fs.statSync(shadowPath).size > 0) {
      fs.mkdirSync(path.dirname(absDb), { recursive: true });
      const tmp = `${absDb}.restore.tmp`;
      fs.copyFileSync(shadowPath, tmp);
      fs.renameSync(tmp, absDb);
      return { restored: true, reason: 'RESTORED_FROM_SHADOW' };
    }
  } catch {
    return { restored: false, reason: 'RESTORE_FAILED' };
  }

  return { restored: false, reason: 'NO_SHADOW' };
}

/**
 * Periodic SQLite WAL checkpoint & atomic shadow backup service
 * (cleanly distilled from legacy `ResilienceLayer.js`).
 * - Always uses `.unref()` on timers and cleans up cleanly via `LifecycleManager`.
 * - Zero raw SQL (delegates WAL checkpoint to `DatabaseManager.checkpoint()`).
 */
class SqliteResilienceService {
  /**
   * @param {{
   *   dbManager: import('../storage/DatabaseManager').DatabaseManager,
   *   intervalMs?: number,
   *   enabled?: boolean,
   *   nodeEnv?: string,
   *   logger?: Console
   * }} deps
   */
  constructor(deps = {}) {
    if (!deps.dbManager) {
      throw new Error('SqliteResilienceService requires dbManager');
    }
    this.dbManager = deps.dbManager;
    const envInterval = Number(process.env.DB_BACKUP_INTERVAL_MS);
    this.intervalMs =
      Number.isFinite(deps.intervalMs) && deps.intervalMs > 0
        ? Number(deps.intervalMs)
        : Number.isFinite(envInterval) && envInterval > 0
          ? envInterval
          : DEFAULT_BACKUP_INTERVAL_MS;
    this.enabledOption = deps.enabled;
    this.nodeEnv = deps.nodeEnv || process.env.NODE_ENV || 'development';
    this.logger = deps.logger || console;

    this._timer = null;
    this._running = false;
    this.backupCount = 0;
    this.lastBackupAt = null;
    this.lastShadowPath = null;
  }

  /**
   * Executes a single WAL checkpoint + atomic `.shadow.bak` copy.
   */
  backupOnce() {
    const dbPath = this.dbManager.dbPath;
    if (!dbPath || dbPath === ':memory:' || String(dbPath).startsWith('file:')) {
      return { ok: false, reason: 'IN_MEMORY_DB' };
    }
    if (!this.dbManager.isOpen()) {
      return { ok: false, reason: 'DB_CLOSED' };
    }

    try {
      if (typeof this.dbManager.checkpoint === 'function') {
        this.dbManager.checkpoint('PASSIVE');
      }
      const absDb = path.resolve(dbPath);
      if (!fs.existsSync(absDb)) {
        return { ok: false, reason: 'NO_SOURCE' };
      }

      const shadowPath = resolveShadowPath(absDb);
      const tmpPath = `${shadowPath}.tmp`;
      fs.copyFileSync(absDb, tmpPath);
      fs.renameSync(tmpPath, shadowPath);

      this.backupCount += 1;
      this.lastBackupAt = Date.now();
      this.lastShadowPath = shadowPath;
      return { ok: true, shadowPath };
    } catch (err) {
      this.logger.warn?.('[SQLITE_RESILIENCE] shadow backup skipped:', err?.message);
      return { ok: false, reason: err?.message || 'BACKUP_ERROR' };
    }
  }

  /**
   * Starts periodic unref'd shadow backup loop for file-backed databases.
   */
  start() {
    if (this._running) {
      return { started: true, reason: 'ALREADY_RUNNING' };
    }
    if (this.enabledOption === false) {
      return { started: false, reason: 'EXPLICITLY_DISABLED' };
    }
    if (this.nodeEnv === 'test' && this.enabledOption !== true) {
      return { started: false, reason: 'TEST_ENVIRONMENT' };
    }
    const dbPath = this.dbManager.dbPath;
    if (!dbPath || dbPath === ':memory:' || String(dbPath).startsWith('file:')) {
      return { started: false, reason: 'IN_MEMORY_DB' };
    }

    this._running = true;
    this.backupOnce();
    this._timer = setInterval(() => {
      this.backupOnce();
    }, this.intervalMs);
    if (typeof this._timer.unref === 'function') {
      this._timer.unref();
    }
    return { started: true, reason: 'STARTED', intervalMs: this.intervalMs };
  }

  /**
   * Stops the periodic backup timer and performs a final checkpoint/shadow copy
   * while the database is still open.
   */
  stop() {
    const wasRunning = this._running;
    this._running = false;
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
    if (wasRunning && this.dbManager.isOpen()) {
      this.backupOnce();
    }
  }

  close() {
    this.stop();
  }
}

SqliteResilienceService.DEFAULT_BACKUP_INTERVAL_MS = DEFAULT_BACKUP_INTERVAL_MS;
SqliteResilienceService.resolveShadowPath = resolveShadowPath;
SqliteResilienceService.restoreShadowIfMissing = restoreShadowIfMissing;

module.exports = {
  SqliteResilienceService,
  DEFAULT_BACKUP_INTERVAL_MS,
  resolveShadowPath,
  restoreShadowIfMissing,
};
