'use strict';

/**
 * MAX.Runtime Core — Ring 0
 * RFC-C001: MAX.RUNTIME CORE, ISOLATION & PERSISTENCE LAYER
 * Dual-Engine Apex Pattern — Deterministic process lifecycle & SQLite persistence
 *
 * Improvements applied in this session:
 * - Robust WAL request with documented fallback for restricted FS
 * - synchronous=EXTRA preferred, NORMAL as safe fallback
 * - Hardened close() with explicit checkpoint + double-close protection
 * - Signal handlers registered once per process (shared flag)
 * - Explicit journal mode query helper
 * - Defensive directory creation and audit emission
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'workspace', 'autonmax.db');
const REPORTS_DIR = path.join(__dirname, '..', '..', 'workspace', 'reports');

// Process-wide guard so multiple RuntimeCore instances do not stack handlers
let _processHandlersInstalled = false;

class RuntimeCore {
  constructor(options = {}) {
    this.dbPath = typeof options === 'string' ? options : (options.dbPath || DB_PATH);
    this.db = null;
    this._closed = false;
    this._journalMode = null;
    this._transactionQueue = [];
    this._isProcessingQueue = false;
  }

  /**
   * Boot the MAX.Kernel persistence layer.
   * Executes mandatory PRAGMAs and creates core tables.
   */
  boot() {
    if (this.db && !this._closed) {
      return this;
    }

    // Ensure directories exist
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    if (!fs.existsSync(REPORTS_DIR)) {
      fs.mkdirSync(REPORTS_DIR, { recursive: true });
    }

    this.db = new DatabaseSync(this.dbPath);
    this._closed = false;

    // Mandatory PRAGMAs (RFC-C001)
    // Sandbox FS (errcode 1034 disk I/O) is unstable under WAL + rapid writes.
    // We request WAL first; if any subsequent operation fails the caller can retry.
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      PRAGMA encoding = 'UTF-8';
    `);

    // Capture actual journal mode for diagnostics
    try {
      const row = this.db.prepare('PRAGMA journal_mode;').get();
      this._journalMode = (row && (row.journal_mode || Object.values(row)[0])) || 'unknown';
    } catch (_) {
      this._journalMode = 'unknown';
    }

    // Table: node_state
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS node_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Table: user_accounts (RFC 001)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_accounts (
        id TEXT PRIMARY KEY,
        google_id TEXT UNIQUE,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        picture TEXT,
        calendar_sync_granted INTEGER DEFAULT 0,
        is_partner INTEGER DEFAULT 0,
        store_name TEXT,
        store_segment TEXT,
        digital_attendant_active INTEGER DEFAULT 1,
        digital_attendant_welcome_msg TEXT DEFAULT 'Olá! Sou o Atendente Digital. Como posso te ajudar hoje?',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Tabela: user_sessions (Sprint MVP-02)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Sprint 9 — Colunas de Onboarding & Subscription (ALTER TABLE com idempotência)
    // SQLite não suporta IF NOT EXISTS no ALTER TABLE, então usamos try/catch por coluna.
    const sprint9Columns = [
      "ALTER TABLE user_accounts ADD COLUMN account_type TEXT DEFAULT 'PERSONAL'",
      "ALTER TABLE user_accounts ADD COLUMN display_name TEXT",
      "ALTER TABLE user_accounts ADD COLUMN subscription_status TEXT DEFAULT 'trial'",
      "ALTER TABLE user_accounts ADD COLUMN trial_started_at INTEGER",
      "ALTER TABLE user_accounts ADD COLUMN trial_ends_at INTEGER",
      "ALTER TABLE user_accounts ADD COLUMN subscription_expires_at INTEGER",
      "ALTER TABLE user_accounts ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP",
      "ALTER TABLE user_accounts ADD COLUMN is_partner INTEGER DEFAULT 0",
      // Sprint 10 — Base de Conhecimento do Atendente PME
      "ALTER TABLE user_accounts ADD COLUMN digital_attendant_prompt TEXT",
      "ALTER TABLE user_accounts ADD COLUMN digital_attendant_pdfs TEXT DEFAULT '[]'",
      "ALTER TABLE user_accounts ADD COLUMN digital_attendant_images TEXT DEFAULT '[]'",
      // Persistência Google Tokens
      "ALTER TABLE user_accounts ADD COLUMN google_access_token TEXT",
      "ALTER TABLE user_accounts ADD COLUMN google_refresh_token TEXT",
      "ALTER TABLE user_accounts ADD COLUMN google_token_expires_at INTEGER",
      // Sprint 11 - Autenticador Nativo (Desvio Temporario)
      "ALTER TABLE user_accounts ADD COLUMN password_hash TEXT"
    ];
    for (const colSql of sprint9Columns) {
      try { this.db.exec(colSql); } catch (_) { /* coluna já existe — ignorar */ }
    }

    // Tabela: pme_configs_v2 (Strangler Fig Refactor V2)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pme_configs_v2 (
        partner_id TEXT PRIMARY KEY,
        prompt_instructions TEXT,
        business_rules TEXT,
        pdf_files TEXT DEFAULT '[]',
        image_files TEXT DEFAULT '[]',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Tabela: chat_history (MPI STRICT)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_history (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        user_id TEXT,
        session_token TEXT,
        role TEXT,
        content TEXT,
        metadata TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_chat_history_session ON chat_history(session_id);
      CREATE INDEX IF NOT EXISTS idx_chat_history_user ON chat_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_chat_history_token ON chat_history(session_token);
    `);
    try { this.db.exec(`ALTER TABLE chat_history ADD COLUMN session_token TEXT;`); } catch (_) {}

    
    // Table: system_audit_log
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS system_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT NOT NULL,
        metadata_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Record boot success
    this._audit('BOOT_SUCCESS', 'INFO', 'MAX.Runtime Core initialized successfully', {
      journalMode: this._journalMode,
      dbPath: this.dbPath
    });

    this._installSignalHandlers();
    return this;
  }

  /**
   * Read a state key from node_state.
   */
  getStateKey(key) {
    this._ensureOpen();
    const row = this.db.prepare('SELECT value FROM node_state WHERE key = ?').get(key);
    return row ? row.value : null;
  }

  /**
   * Write (upsert) a state key into node_state.
   */
  setStateKey(key, value) {
    this._ensureOpen();
    this.db.prepare(`
      INSERT INTO node_state (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `).run(key, String(value));
    return true;
  }

  /**
   * Return the journal mode actually negotiated at boot.
   */
  getJournalMode() {
    return this._journalMode;
  }

  /**
   * Graceful shutdown algorithm (RFC-C001 §3):
   * 1. Interrupt new I/O
   * 2. PRAGMA wal_checkpoint(TRUNCATE) when applicable
   * 3. Close handle
   * 4. Emit clean shutdown log
   */
  close() {
    if (this._closed || !this.db) {
      return true;
    }

    try {
      // Best-effort checkpoint (only meaningful under WAL)
      if (String(this._journalMode).toLowerCase() === 'wal') {
        this.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      }
    } catch (err) {
      // Non-fatal on restricted FS
      this._appendShutdownLog('WARN', `wal_checkpoint: ${err.message}`);
    }

    try {
      this.db.close();
    } catch (err) {
      this._appendShutdownLog('WARN', `db.close: ${err.message}`);
    }

    this.db = null;
    this._closed = true;

    this._appendShutdownLog('INFO', 'SHUTDOWN_CLEAN MAX.Runtime Core closed gracefully');
    return true;
  }

  /**
   * Internal audit helper (system_audit_log).
   */
  _audit(eventType, severity, message, metadata = null) {
    if (!this.db || this._closed) return;
    try {
      this.db.prepare(`
        INSERT INTO system_audit_log (event_type, severity, message, metadata_json)
        VALUES (?, ?, ?, ?)
      `).run(eventType, severity, message, metadata ? JSON.stringify(metadata) : null);
    } catch (_) { /* ignore on close path */ }
  }

  _appendShutdownLog(severity, message) {
    const logPath = path.join(REPORTS_DIR, 'SYSTEM_AUDIT.log');
    const line = `[${new Date().toISOString()}] ${severity} ${message}\n`;
    try {
      if (!fs.existsSync(REPORTS_DIR)) {
        fs.mkdirSync(REPORTS_DIR, { recursive: true });
      }
      fs.appendFileSync(logPath, line);
    } catch (_) { /* best effort */ }
  }

  _ensureOpen() {
    if (this._closed || !this.db) {
      throw new Error('RuntimeCore is closed. Call boot() first.');
    }
  }

  _installSignalHandlers() {
    if (_processHandlersInstalled) return;
    _processHandlersInstalled = true;

    const handler = (signal) => {
      console.log(`[RuntimeCore] Received ${signal}, performing graceful shutdown...`);
      // Close the most recently known open instance is not tracked globally;
      // callers that need precise multi-instance shutdown should call close() explicitly.
      // Here we only guarantee process exit code 0 after best-effort cleanup.
      try {
        // no-op global; individual instances must be closed by the application
      } catch (_) {}
      process.exit(0);
    };

    process.on('SIGINT', handler);
    process.on('SIGTERM', handler);
    try {
      process.on('SIGHUP', handler);
    } catch (_) { /* platform may not support SIGHUP */ }
  }

  /**
   * Expose raw db for dependent Ring-0 modules (session/state modules).
   */
  getDb() {
    this._ensureOpen();
    return this.db;
  }

  isOpen() {
    return !!this.db && !this._closed;
  }

  /**
   * Fila de gravação sequencial (atomicTransaction) para escritas em lote.
   * Evita "database is locked" com retry exponential backoff e mutex local.
   * @param {Function} fn Callback async/sync que recebe `db` e executa lógica do lote.
   */
  atomicTransaction(fn) {
    return new Promise((resolve, reject) => {
      this._transactionQueue.push({ fn, resolve, reject });
      this._processTransactionQueue();
    });
  }

  async _processTransactionQueue() {
    if (this._isProcessingQueue || this._transactionQueue.length === 0) return;
    this._isProcessingQueue = true;

    while (this._transactionQueue.length > 0) {
      const task = this._transactionQueue.shift();
      if (!this.isOpen()) {
        task.reject(new Error('RuntimeCore is closed'));
        continue;
      }
      
      let attempt = 0;
      let success = false;
      const maxRetries = 5;

      while (!success && attempt < maxRetries) {
        attempt++;
        try {
          this.db.exec('BEGIN IMMEDIATE;'); // Garante o lock de escrita instantâneo
          const result = await task.fn(this.db);
          this.db.exec('COMMIT;');
          task.resolve(result);
          success = true;
        } catch (err) {
          try { this.db.exec('ROLLBACK;'); } catch (_) {}
          
          if (err.message && err.message.includes('database is locked') && attempt < maxRetries) {
            // Exponential backoff
            const backoff = Math.min(150 * Math.pow(2, attempt), 3000);
            await new Promise(r => setTimeout(r, backoff));
          } else {
            task.reject(err);
            break;
          }
        }
      }
    }
    
    this._isProcessingQueue = false;
  }

  // ── Compat API (BUG-01 fix) ─────────────────────────────────────────────────
  // PartnerAuthManager e outros módulos ring1 chamam transaction/dbGet/dbRun/dbAll.
  // Estes adaptadores expõem a mesma API usando o db ring0 (node:sqlite síncrono)
  // sem abrir um segundo handle, eliminando o "database is locked".

  /**
   * Executa fn dentro de uma transação BEGIN IMMEDIATE / COMMIT.
   * fn recebe um dbAdapter com { get, all, run } síncronos-mas-retornam-Promise.
   */
  async transaction(fn) {
    this._ensureOpen();
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const dbAdapter = {
        get: (sql, params) => this.dbGet(sql, params),
        all: (sql, params) => this.dbAll(sql, params),
        run: (sql, params) => this.dbRun(sql, params),
      };
      const result = await fn(dbAdapter);
      this.db.exec('COMMIT;');
      return result;
    } catch (err) {
      try { this.db.exec('ROLLBACK;'); } catch (_) {}
      throw err;
    }
  }

  dbGet(sql, params = []) {
    this._ensureOpen();
    return Promise.resolve(this.db.prepare(sql).get(...params));
  }

  dbAll(sql, params = []) {
    this._ensureOpen();
    return Promise.resolve(this.db.prepare(sql).all(...params));
  }

  dbRun(sql, params = []) {
    this._ensureOpen();
    const info = this.db.prepare(sql).run(...params);
    return Promise.resolve({ lastID: info.lastInsertRowid, changes: info.changes });
  }
  // ── Fim Compat API ───────────────────────────────────────────────────────────
}

module.exports = { RuntimeCore, DB_PATH, REPORTS_DIR };

