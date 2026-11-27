'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { runMigrations, getAppliedMigrations } = require('./migrations');

const DEFAULT_DB_PATH = path.resolve(process.cwd(), 'workspace', 'autonmax.db');

/**
 * Manages the native node:sqlite DatabaseSync connection, mandatory PRAGMAs,
 * nested-safe transactions, versioned migrations, and clean WAL checkpoint shutdown.
 */
class DatabaseManager {
  /**
   * @param {{ dbPath?: string, autoMigrate?: boolean }} [options]
   */
  constructor(options = {}) {
    this.dbPath = options.dbPath || process.env.DB_PATH || DEFAULT_DB_PATH;
    this.autoMigrate = options.autoMigrate === true;
    /** @type {DatabaseSync | null} */
    this.db = null;
    this._txDepth = 0;
  }

  /**
   * Opens the SQLite connection and applies mandatory runtime PRAGMAs.
   * Safe to call multiple times (idempotent when already open).
   * @returns {DatabaseManager}
   */
  open() {
    if (this.db) {
      return this;
    }

    if (this.dbPath !== ':memory:' && !this.dbPath.startsWith('file:')) {
      const parentDir = path.dirname(path.resolve(this.dbPath));
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const db = new DatabaseSync(this.dbPath);
    try {
      this._applyPragmas(db);
      this.db = db;
      if (this.autoMigrate) {
        this.migrate();
      }
      return this;
    } catch (err) {
      try {
        db.close();
      } catch {
        // Ignore secondary close error on failed open.
      }
      this.db = null;
      throw err;
    }
  }

  /**
   * Convenience helper to open the database and run pending migrations.
   * @param {{ migrationsDir?: string }} [options]
   * @returns {{ applied: number[], skipped: number[], currentVersion: number }}
   */
  init(options = {}) {
    this.open();
    return this.migrate(options);
  }

  /**
   * Applies mandatory PRAGMAs on boot.
   * @param {DatabaseSync} db
   * @private
   */
  _applyPragmas(db) {
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
    `);
  }

  /**
   * Runs pending deterministic migrations tracked in schema_migrations.
   * @param {{ migrationsDir?: string }} [options]
   * @returns {{ applied: number[], skipped: number[], currentVersion: number }}
   */
  migrate(options = {}) {
    const db = this.getDb();
    return runMigrations(db, options);
  }

  /**
   * Returns applied schema migrations.
   * @returns {Array<{ version: number, applied_at: string }>}
   */
  getAppliedMigrations() {
    return getAppliedMigrations(this.getDb());
  }

  /**
   * Reads active PRAGMA settings from the open connection.
   * @returns {{ journal_mode: string, synchronous: number, foreign_keys: number, busy_timeout: number }}
   */
  getPragmas() {
    const db = this.getDb();
    const journalRow = db.prepare('PRAGMA journal_mode;').get();
    const syncRow = db.prepare('PRAGMA synchronous;').get();
    const fkRow = db.prepare('PRAGMA foreign_keys;').get();
    const busyRow = db.prepare('PRAGMA busy_timeout;').get();

    return {
      journal_mode: String(Object.values(journalRow)[0]),
      synchronous: Number(Object.values(syncRow)[0]),
      foreign_keys: Number(Object.values(fkRow)[0]),
      busy_timeout: Number(Object.values(busyRow)[0]),
    };
  }

  /**
   * Indicates whether the SQLite connection is currently open.
   * @returns {boolean}
   */
  isOpen() {
    return this.db !== null;
  }

  /**
   * Returns the underlying DatabaseSync instance or throws if closed.
   * @returns {DatabaseSync}
   */
  getDb() {
    if (!this.db) {
      throw new Error('DatabaseManager is not open. Call open() or init() first.');
    }
    return this.db;
  }

  /**
   * Executes a synchronous callback inside an atomic transaction.
   * Uses BEGIN IMMEDIATE at top level and SAVEPOINT for nested calls.
   * @template T
   * @param {(db: DatabaseSync) => T} fn
   * @returns {T}
   */
  transaction(fn) {
    if (typeof fn !== 'function') {
      throw new TypeError('transaction(fn) requires a function');
    }
    const db = this.getDb();
    const isOuter = this._txDepth === 0;
    const savepointName = `sp_tx_${this._txDepth}`;
    const maxBusyRetries = isOuter ? 3 : 0;

    for (let attempt = 0; ; attempt += 1) {
      if (isOuter) {
        try {
          db.exec('BEGIN IMMEDIATE;');
        } catch (beginErr) {
          const isBusy = /SQLITE_BUSY|database is locked/i.test(String(beginErr?.message || ''));
          if (isBusy && attempt < maxBusyRetries) {
            continue;
          }
          throw beginErr;
        }
      } else {
        db.exec(`SAVEPOINT ${savepointName};`);
      }

      this._txDepth += 1;
      try {
        const result = fn(db);
        if (isOuter) {
          db.exec('COMMIT;');
        } else {
          db.exec(`RELEASE SAVEPOINT ${savepointName};`);
        }
        return result;
      } catch (err) {
        try {
          if (isOuter) {
            db.exec('ROLLBACK;');
          } else {
            db.exec(`ROLLBACK TO SAVEPOINT ${savepointName};`);
            db.exec(`RELEASE SAVEPOINT ${savepointName};`);
          }
        } catch {
          // Ignore rollback failure if SQLite already rolled back.
        }
        const isBusy = /SQLITE_BUSY|database is locked/i.test(String(err?.message || ''));
        if (isOuter && isBusy && attempt < maxBusyRetries) {
          continue;
        }
        throw err;
      } finally {
        this._txDepth -= 1;
      }
    }
  }

  /**
   * Executes a safe WAL checkpoint for file-backed databases.
   * @param {'PASSIVE' | 'FULL' | 'RESTART' | 'TRUNCATE'} [mode='PASSIVE']
   * @returns {boolean}
   */
  checkpoint(mode = 'PASSIVE') {
    if (!this.db || this.dbPath === ':memory:' || String(this.dbPath).startsWith('file:')) {
      return false;
    }
    const allowed = new Set(['PASSIVE', 'FULL', 'RESTART', 'TRUNCATE']);
    const normalized = allowed.has(String(mode).toUpperCase())
      ? String(mode).toUpperCase()
      : 'PASSIVE';
    this.db.exec(`PRAGMA wal_checkpoint(${normalized});`);
    return true;
  }

  /**
   * Executes WAL checkpoint (TRUNCATE) and closes the database connection cleanly.
   * Safe to call multiple times.
   */
  close() {
    if (!this.db) {
      return;
    }

    const db = this.db;
    this.db = null;
    this._txDepth = 0;

    try {
      if (this.dbPath !== ':memory:') {
        db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      }
    } finally {
      db.close();
    }
  }

  /**
   * Resolves a DatabaseSync instance from either a DatabaseManager or DatabaseSync.
   * @param {DatabaseManager | DatabaseSync} dbOrManager
   * @returns {DatabaseSync}
   */
  static resolveDb(dbOrManager) {
    if (!dbOrManager) {
      throw new Error('A DatabaseManager or DatabaseSync instance is required');
    }
    if (typeof dbOrManager.getDb === 'function') {
      return dbOrManager.getDb();
    }
    return dbOrManager;
  }

  /**
   * Runs a callback in a transaction whether given a DatabaseManager or DatabaseSync.
   * @template T
   * @param {DatabaseManager | DatabaseSync} dbOrManager
   * @param {(db: DatabaseSync) => T} fn
   * @returns {T}
   */
  static runInTransaction(dbOrManager, fn) {
    if (dbOrManager && typeof dbOrManager.transaction === 'function') {
      return dbOrManager.transaction(fn);
    }
    const db = DatabaseManager.resolveDb(dbOrManager);
    db.exec('BEGIN IMMEDIATE;');
    try {
      const res = fn(db);
      db.exec('COMMIT;');
      return res;
    } catch (err) {
      try {
        db.exec('ROLLBACK;');
      } catch {
        // Ignore rollback failure.
      }
      throw err;
    }
  }

  /**
   * Converts a node:sqlite null-prototype row into a plain object or null.
   * @param {Record<string, unknown> | undefined | null} row
   * @returns {Record<string, unknown> | null}
   */
  static toPlain(row) {
    return row ? { ...row } : null;
  }

  /**
   * Safely parses JSON text with a fallback value.
   * @template T
   * @param {string | null | undefined} value
   * @param {T} fallback
   * @returns {T}
   */
  static parseJson(value, fallback) {
    if (value === null || value === undefined || value === '') {
      return fallback;
    }
    if (typeof value !== 'string') {
      return value;
    }
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  /**
   * Serializes a value to JSON unless already a string.
   * @param {unknown} value
   * @param {string} [fallback='{}']
   * @returns {string}
   */
  static stringifyJson(value, fallback = '{}') {
    if (value === undefined) return fallback;
    if (value === null) return null;
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  }

  /**
   * Sanitizes identifiers before any NTFS/local filesystem usage.
   * @param {string} rawKey
   * @returns {string}
   */
  static sanitizeKey(rawKey) {
    return String(rawKey || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  /**
   * Extracts an optional partnerId from either a string or options object.
   * @param {string | { partnerId?: string, partner_id?: string } | undefined} options
   * @returns {string | null}
   */
  static extractPartnerId(options) {
    if (typeof options === 'string') return options || null;
    if (options && typeof options === 'object') {
      return options.partnerId ?? options.partner_id ?? null;
    }
    return null;
  }
}

module.exports = { DatabaseManager, DEFAULT_DB_PATH };
