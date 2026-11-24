'use strict';

/**
 * Unified Client StorageAdapter interface aligned with Doc 04 Section 3.1.
 */
class StorageAdapter {
  async initialize() {}

  async get(_store, _key) {
    throw new Error('StorageAdapter.get() must be implemented by subclass');
  }

  async set(_store, _key, _value) {
    throw new Error('StorageAdapter.set() must be implemented by subclass');
  }

  async query(_store, _predicate) {
    throw new Error('StorageAdapter.query() must be implemented by subclass');
  }

  async upsert(_store, _item) {
    throw new Error('StorageAdapter.upsert() must be implemented by subclass');
  }

  async remove(_store, _key) {
    throw new Error('StorageAdapter.remove() must be implemented by subclass');
  }

  async enqueueSync(_action) {
    throw new Error('StorageAdapter.enqueueSync() must be implemented by subclass');
  }

  async getPendingSync() {
    throw new Error('StorageAdapter.getPendingSync() must be implemented by subclass');
  }

  async markSynced(_id) {
    throw new Error('StorageAdapter.markSynced() must be implemented by subclass');
  }

  async markConflict(_id, _reason) {
    throw new Error('StorageAdapter.markConflict() must be implemented by subclass');
  }

  async getConflicts() {
    throw new Error('StorageAdapter.getConflicts() must be implemented by subclass');
  }

  async saveFile(_filePath, _content) {
    throw new Error('StorageAdapter.saveFile() must be implemented by subclass');
  }

  async readFile(_filePath) {
    throw new Error('StorageAdapter.readFile() must be implemented by subclass');
  }
}

module.exports = { StorageAdapter };
