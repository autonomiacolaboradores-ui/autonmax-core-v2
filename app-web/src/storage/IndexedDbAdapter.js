'use strict';

const crypto = require('node:crypto');
const { StorageAdapter } = require('./StorageAdapter');

const STORES = Object.freeze([
  'partner_config',
  'catalog_items',
  'appointments',
  'orders',
  'conversations',
  'messages',
  'sync_queue',
  'files',
]);

function generateUuid() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return crypto.randomUUID();
}

/**
 * Web StorageAdapter backed by IndexedDB in browsers, with a deterministic
 * in-memory Map fallback when `indexedDB` is unavailable (e.g., Node.js test runner).
 */
class IndexedDbAdapter extends StorageAdapter {
  /**
   * @param {{ dbName?: string, indexedDbFactory?: IDBFactory | null }} [options]
   */
  constructor(options = {}) {
    super();
    this.dbName = options.dbName || 'autonmax_vnext_local';
    this.indexedDbFactory =
      options.indexedDbFactory !== undefined
        ? options.indexedDbFactory
        : typeof globalThis.indexedDB !== 'undefined'
          ? globalThis.indexedDB
          : null;
    this._db = null;
    /** @type {Map<string, Map<string, any>>} */
    this._memoryStores = new Map();
    for (const name of STORES) {
      this._memoryStores.set(name, new Map());
    }
    this._seq = 0;
  }

  /**
   * Initializes IndexedDB stores or in-memory fallback.
   */
  async initialize() {
    if (!this.indexedDbFactory) {
      return;
    }
    if (this._db) return;

    this._db = await new Promise((resolve, reject) => {
      const req = this.indexedDbFactory.open(this.dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const store of STORES) {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store, { keyPath: 'id' });
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    });
  }

  /**
   * @private
   */
  _memStore(store) {
    let map = this._memoryStores.get(store);
    if (!map) {
      map = new Map();
      this._memoryStores.set(store, map);
    }
    return map;
  }

  /**
   * @private
   */
  _idbTx(storeName, mode, runner) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const req = runner(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB tx error'));
    });
  }

  async get(store, key) {
    if (!this._db) {
      const entry = this._memStore(store).get(String(key));
      if (!entry) return null;
      return entry.__wrapped ? entry.value : { ...entry };
    }
    const row = await this._idbTx(store, 'readonly', (s) => s.get(String(key)));
    if (!row) return null;
    return row.__wrapped ? row.value : row;
  }

  async set(store, key, value) {
    const id = String(key);
    const record =
      value && typeof value === 'object' && !Array.isArray(value) && value.id === id
        ? { ...value }
        : { id, __wrapped: true, value };

    if (!this._db) {
      this._memStore(store).set(id, record);
      return;
    }
    await this._idbTx(store, 'readwrite', (s) => s.put(record));
  }

  async query(store, predicate) {
    let items;
    if (!this._db) {
      items = Array.from(this._memStore(store).values()).map((entry) =>
        entry.__wrapped ? entry.value : { ...entry }
      );
    } else {
      const rows = await this._idbTx(store, 'readonly', (s) => s.getAll());
      items = (rows || []).map((r) => (r.__wrapped ? r.value : r));
    }
    return typeof predicate === 'function' ? items.filter(predicate) : items;
  }

  async upsert(store, item) {
    if (!item || !item.id) {
      throw new Error('IndexedDbAdapter.upsert requires item.id');
    }
    await this.set(store, item.id, item);
  }

  async remove(store, key) {
    if (!this._db) {
      this._memStore(store).delete(String(key));
      return;
    }
    await this._idbTx(store, 'readwrite', (s) => s.delete(String(key)));
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
    await this.upsert('sync_queue', record);
    return record;
  }

  async getPendingSync() {
    const pending = await this.query(
      'sync_queue',
      (item) => item && item.status === 'PENDING'
    );
    pending.sort((a, b) => a.timestamp - b.timestamp || (a.seq || 0) - (b.seq || 0));
    return pending;
  }

  async markSynced(id) {
    await this.remove('sync_queue', id);
  }

  async markConflict(id, reason) {
    const existing = await this.get('sync_queue', id);
    if (!existing) return null;
    const updated = {
      ...existing,
      status: 'CONFLICT',
      conflictReason: String(reason || 'CONFLICT'),
      updatedAt: Date.now(),
    };
    await this.upsert('sync_queue', updated);
    return updated;
  }

  async getConflicts() {
    return this.query('sync_queue', (item) => item && item.status === 'CONFLICT');
  }

  async saveFile(filePath, content) {
    const key = String(filePath);
    const data =
      typeof Blob !== 'undefined' && content instanceof Blob
        ? content
        : content;
    await this.set('files', key, { id: key, content: data, savedAt: Date.now() });
    return key;
  }

  async readFile(filePath) {
    const row = await this.get('files', String(filePath));
    return row ? row.content : null;
  }
}

IndexedDbAdapter.STORES = STORES;

module.exports = { IndexedDbAdapter, STORES };
