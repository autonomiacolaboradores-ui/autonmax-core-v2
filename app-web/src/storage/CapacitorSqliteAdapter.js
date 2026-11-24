'use strict';

const crypto = require('node:crypto');
const { StorageAdapter } = require('./StorageAdapter');

function generateUuid() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return crypto.randomUUID();
}

/**
 * Android APK StorageAdapter backed by `@capacitor-community/sqlite` and `@capacitor/filesystem`.
 * Auth tokens are strictly prohibited from SQLite/localStorage plaintext and belong
 * exclusively to Android Keystore via `EnvironmentPorts.secureAuth`.
 */
class CapacitorSqliteAdapter extends StorageAdapter {
  /**
   * @param {{
   *   dbName?: string,
   *   sqlitePlugin?: { execute: Function, query: Function, run: Function },
   *   filesystemPlugin?: { writeFile: Function, readFile: Function }
   * }} [options]
   */
  constructor(options = {}) {
    super();
    this.dbName = options.dbName || 'autonmax_local';
    this.sqlitePlugin =
      options.sqlitePlugin || globalThis.Capacitor?.Plugins?.CapacitorSQLite || null;
    this.filesystemPlugin =
      options.filesystemPlugin || globalThis.Capacitor?.Plugins?.Filesystem || null;
    this._initialized = false;
    this._seq = 0;
    // In-memory cache mirror for unit testing without native Android bridge
    this._tables = new Map();
  }

  async initialize() {
    if (this._initialized) return;
    if (this.sqlitePlugin && typeof this.sqlitePlugin.execute === 'function') {
      await this.sqlitePlugin.execute({
        database: this.dbName,
        statements: `
          CREATE TABLE IF NOT EXISTS kv_store (
            store TEXT NOT NULL,
            id TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            PRIMARY KEY (store, id)
          );
          CREATE TABLE IF NOT EXISTS sync_queue (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            idempotency_key TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'PENDING',
            conflict_reason TEXT,
            timestamp INTEGER NOT NULL
          );
        `,
      });
    }
    this._initialized = true;
  }

  _memTable(store) {
    let map = this._tables.get(store);
    if (!map) {
      map = new Map();
      this._tables.set(store, map);
    }
    return map;
  }

  async get(store, key) {
    if (this.sqlitePlugin && typeof this.sqlitePlugin.query === 'function') {
      const res = await this.sqlitePlugin.query({
        database: this.dbName,
        statement: 'SELECT payload_json FROM kv_store WHERE store = ? AND id = ?',
        values: [store, String(key)],
      });
      const row = res?.values?.[0];
      return row ? JSON.parse(row.payload_json) : null;
    }
    return this._memTable(store).get(String(key)) || null;
  }

  async set(store, key, value) {
    const id = String(key);
    if (this.sqlitePlugin && typeof this.sqlitePlugin.run === 'function') {
      await this.sqlitePlugin.run({
        database: this.dbName,
        statement:
          'INSERT OR REPLACE INTO kv_store (store, id, payload_json) VALUES (?, ?, ?)',
        values: [store, id, JSON.stringify(value)],
      });
      return;
    }
    this._memTable(store).set(id, value);
  }

  async query(store, predicate) {
    let items;
    if (this.sqlitePlugin && typeof this.sqlitePlugin.query === 'function') {
      const res = await this.sqlitePlugin.query({
        database: this.dbName,
        statement: 'SELECT payload_json FROM kv_store WHERE store = ?',
        values: [store],
      });
      items = (res?.values || []).map((r) => JSON.parse(r.payload_json));
    } else {
      items = Array.from(this._memTable(store).values());
    }
    return typeof predicate === 'function' ? items.filter(predicate) : items;
  }

  async upsert(store, item) {
    if (!item || !item.id) {
      throw new Error('CapacitorSqliteAdapter.upsert requires item.id');
    }
    await this.set(store, item.id, item);
  }

  async remove(store, key) {
    if (this.sqlitePlugin && typeof this.sqlitePlugin.run === 'function') {
      await this.sqlitePlugin.run({
        database: this.dbName,
        statement: 'DELETE FROM kv_store WHERE store = ? AND id = ?',
        values: [store, String(key)],
      });
      return;
    }
    this._memTable(store).delete(String(key));
  }

  async enqueueSync(action) {
    this._seq += 1;
    const record = {
      id: action.id || `sync_${generateUuid()}`,
      type: String(action.type),
      payload: action.payload || {},
      idempotencyKey: action.idempotencyKey || generateUuid(),
      versionHash: action.versionHash || null,
      status: 'PENDING',
      conflictReason: null,
      seq: this._seq,
      timestamp: action.timestamp || Date.now(),
    };

    if (this.sqlitePlugin && typeof this.sqlitePlugin.run === 'function') {
      await this.sqlitePlugin.run({
        database: this.dbName,
        statement:
          'INSERT INTO sync_queue (id, type, payload_json, idempotency_key, status, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
        values: [
          record.id,
          record.type,
          JSON.stringify(record.payload),
          record.idempotencyKey,
          record.status,
          record.timestamp,
        ],
      });
    } else {
      await this.upsert('sync_queue', record);
    }
    return record;
  }

  async getPendingSync() {
    if (this.sqlitePlugin && typeof this.sqlitePlugin.query === 'function') {
      const res = await this.sqlitePlugin.query({
        database: this.dbName,
        statement:
          "SELECT * FROM sync_queue WHERE status = 'PENDING' ORDER BY timestamp ASC",
        values: [],
      });
      return (res?.values || []).map((r) => ({
        id: r.id,
        type: r.type,
        payload: JSON.parse(r.payload_json),
        idempotencyKey: r.idempotency_key,
        status: r.status,
        conflictReason: r.conflict_reason,
        timestamp: Number(r.timestamp),
      }));
    }
    const items = await this.query('sync_queue', (i) => i && i.status === 'PENDING');
    items.sort((a, b) => a.timestamp - b.timestamp || (a.seq || 0) - (b.seq || 0));
    return items;
  }

  async markSynced(id) {
    if (this.sqlitePlugin && typeof this.sqlitePlugin.run === 'function') {
      await this.sqlitePlugin.run({
        database: this.dbName,
        statement: 'DELETE FROM sync_queue WHERE id = ?',
        values: [id],
      });
      return;
    }
    await this.remove('sync_queue', id);
  }

  async markConflict(id, reason) {
    if (this.sqlitePlugin && typeof this.sqlitePlugin.run === 'function') {
      await this.sqlitePlugin.run({
        database: this.dbName,
        statement:
          "UPDATE sync_queue SET status = 'CONFLICT', conflict_reason = ? WHERE id = ?",
        values: [String(reason || 'CONFLICT'), id],
      });
      return { id, status: 'CONFLICT', conflictReason: String(reason || 'CONFLICT') };
    }
    const existing = await this.get('sync_queue', id);
    if (!existing) return null;
    const updated = {
      ...existing,
      status: 'CONFLICT',
      conflictReason: String(reason || 'CONFLICT'),
    };
    await this.upsert('sync_queue', updated);
    return updated;
  }

  async getConflicts() {
    if (this.sqlitePlugin && typeof this.sqlitePlugin.query === 'function') {
      const res = await this.sqlitePlugin.query({
        database: this.dbName,
        statement: "SELECT * FROM sync_queue WHERE status = 'CONFLICT'",
        values: [],
      });
      return res?.values || [];
    }
    return this.query('sync_queue', (i) => i && i.status === 'CONFLICT');
  }

  async saveFile(filePath, content) {
    if (this.filesystemPlugin && typeof this.filesystemPlugin.writeFile === 'function') {
      const data = Buffer.isBuffer(content)
        ? content.toString('base64')
        : typeof content === 'string'
          ? content
          : Buffer.from(content).toString('base64');
      await this.filesystemPlugin.writeFile({
        path: filePath,
        data,
        directory: 'DOCUMENTS',
      });
      return filePath;
    }
    await this.set('files', filePath, { id: filePath, content });
    return filePath;
  }

  async readFile(filePath) {
    if (this.filesystemPlugin && typeof this.filesystemPlugin.readFile === 'function') {
      const res = await this.filesystemPlugin.readFile({
        path: filePath,
        directory: 'DOCUMENTS',
      });
      return res?.data || null;
    }
    const row = await this.get('files', filePath);
    return row ? row.content : null;
  }
}

module.exports = { CapacitorSqliteAdapter };
