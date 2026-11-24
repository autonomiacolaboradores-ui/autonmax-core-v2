'use strict';

const crypto = require('node:crypto');

function generateUuid() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return crypto.randomUUID();
}

/**
 * Resolves a queued offline operation into a Doc 02 REST endpoint + method.
 * @param {{ type: string, payload: Record<string, any> }} action
 * @returns {{ method: string, path: string, body: Record<string, any> }}
 */
function resolveSyncRequest(action) {
  const p = action.payload || {};
  const partnerId = p.partnerId;

  switch (action.type) {
    case 'catalog.create':
      return {
        method: 'POST',
        path: `/api/v1/partners/${partnerId}/catalog`,
        body: p.item || p,
      };
    case 'catalog.update':
      return {
        method: 'PUT',
        path: `/api/v1/partners/${partnerId}/catalog/${p.itemId}`,
        body: p.patch || p,
      };
    case 'catalog.delete':
      return {
        method: 'DELETE',
        path: `/api/v1/partners/${partnerId}/catalog/${p.itemId}`,
        body: {},
      };
    case 'appointment.create':
      return {
        method: 'POST',
        path: `/api/v1/partners/${partnerId}/appointments`,
        body: p,
      };
    case 'appointment.cancel':
      return {
        method: 'POST',
        path: `/api/v1/partners/${partnerId}/appointments/${p.appointmentId}/cancel`,
        body: {},
      };
    case 'order.create':
      return {
        method: 'POST',
        path: `/api/v1/partners/${partnerId}/orders`,
        body: p,
      };
    case 'order.cancel':
      return {
        method: 'POST',
        path: `/api/v1/partners/${partnerId}/orders/${p.orderId}/cancel`,
        body: {},
      };
    case 'conversation.pause':
      return {
        method: 'POST',
        path: `/api/v1/partners/${partnerId}/conversations/${p.conversationId}/pause`,
        body: { paused: Boolean(p.paused) },
      };
    case 'partner.config':
      return {
        method: 'PUT',
        path: `/api/v1/partners/${partnerId}/config`,
        body: p.config || p,
      };
    default:
      return {
        method: 'POST',
        path: '/api/v1/sync',
        body: { type: action.type, payload: p },
      };
  }
}

/**
 * Offline-First FIFO SyncQueue with `X-Idempotency-Key` replay,
 * automatic reconnect flush, and non-blocking `409 CONFLICT` reconciliation.
 */
class SyncQueue {
  /**
   * @param {{
   *   storage: import('../storage/StorageAdapter').StorageAdapter,
   *   network: { isOnline: () => boolean, onChange?: (cb: (online: boolean) => void) => (() => void) },
   *   secureAuth?: { getToken: () => Promise<string | null> | string | null },
   *   baseUrl?: string,
   *   fetchImpl?: typeof fetch,
   *   onStatusChange?: (status: 'ONLINE' | 'OFFLINE' | 'SYNCING' | 'CONFLICT') => void
   * }} deps
   */
  constructor(deps = {}) {
    if (!deps.storage) {
      throw new Error('SyncQueue requires storage');
    }
    this.storage = deps.storage;
    this.network = deps.network || { isOnline: () => true };
    this.secureAuth = deps.secureAuth || { getToken: async () => null };
    this.baseUrl = String(deps.baseUrl || '').replace(/\/$/, '');
    this.fetchImpl = deps.fetchImpl || globalThis.fetch;
    this.onStatusChange = deps.onStatusChange || null;
    this._syncing = false;
    this._unsubscribeNet = null;
  }

  /**
   * Enqueues an offline mutation with a deterministic/UUID idempotency key.
   * @param {{ type: string, payload: Record<string, any>, idempotencyKey?: string, versionHash?: string }} action
   */
  async enqueue(action) {
    const entry = await this.storage.enqueueSync({
      ...action,
      idempotencyKey: action.idempotencyKey || generateUuid(),
    });
    await this._notifyStatus();
    return entry;
  }

  /**
   * Computes current operational connectivity/sync status.
   * @returns {Promise<'ONLINE' | 'OFFLINE' | 'SYNCING' | 'CONFLICT'>}
   */
  async getStatus() {
    if (this._syncing) return 'SYNCING';
    const conflicts = await this.storage.getConflicts();
    if (Array.isArray(conflicts) && conflicts.length > 0) {
      return 'CONFLICT';
    }
    return this.network.isOnline() ? 'ONLINE' : 'OFFLINE';
  }

  /**
   * @private
   */
  async _notifyStatus() {
    if (typeof this.onStatusChange === 'function') {
      const status = await this.getStatus();
      this.onStatusChange(status);
    }
  }

  /**
   * Binds network reconnection listener to flush pending offline queue automatically.
   */
  bindAutoFlush() {
    if (this._unsubscribeNet || typeof this.network.onChange !== 'function') {
      return () => {};
    }
    this._unsubscribeNet = this.network.onChange((online) => {
      if (online) {
        this.flush().catch(() => {});
      } else {
        this._notifyStatus().catch(() => {});
      }
    });
    return this._unsubscribeNet;
  }

  /**
   * Flushes pending items in strict chronological FIFO order.
   * - `200`/`201`: marks synced (removes from queue)
   * - `409`: marks item `CONFLICT` and continues processing remaining items
   * - `5xx`/network error: keeps item `PENDING` and stops batch for later retry
   * @param {{ baseUrl?: string, headers?: Record<string, string> }} [options]
   */
  async flush(options = {}) {
    if (!this.network.isOnline()) {
      await this._notifyStatus();
      return { ok: false, offline: true, synced: 0, conflicts: 0, remaining: (await this.storage.getPendingSync()).length };
    }

    if (this._syncing) {
      return { ok: true, alreadySyncing: true, synced: 0, conflicts: 0 };
    }

    this._syncing = true;
    await this._notifyStatus();

    let synced = 0;
    let conflicts = 0;
    let stoppedByServerError = false;
    const baseUrl = String(options.baseUrl ?? this.baseUrl).replace(/\/$/, '');

    try {
      const pending = await this.storage.getPendingSync();
      const token = await this.secureAuth.getToken();

      for (const item of pending) {
        const reqSpec = resolveSyncRequest(item);
        const headers = {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': item.idempotencyKey,
          ...(options.headers || {}),
        };
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        try {
          const response = await this.fetchImpl(`${baseUrl}${reqSpec.path}`, {
            method: reqSpec.method,
            headers,
            body:
              reqSpec.method === 'GET' || reqSpec.method === 'HEAD'
                ? undefined
                : JSON.stringify(reqSpec.body),
          });

          if (response.ok) {
            await this.storage.markSynced(item.id);
            synced += 1;
            continue;
          }

          if (response.status === 409) {
            let reason = 'CONFLICT';
            try {
              const errJson = await response.json();
              reason = errJson?.error?.code || errJson?.error?.message || 'CONFLICT';
            } catch {
              // Ignore non-JSON error body
            }
            await this.storage.markConflict(item.id, reason);
            conflicts += 1;
            continue;
          }

          // Transient 5xx or unexpected error: keep PENDING and abort remainder to preserve FIFO order
          stoppedByServerError = true;
          break;
        } catch {
          stoppedByServerError = true;
          break;
        }
      }

      const remaining = (await this.storage.getPendingSync()).length;
      return {
        ok: !stoppedByServerError,
        offline: false,
        synced,
        conflicts,
        remaining,
      };
    } finally {
      this._syncing = false;
      await this._notifyStatus();
    }
  }

  /**
   * Unsubscribes network listener cleanly.
   */
  dispose() {
    if (this._unsubscribeNet) {
      this._unsubscribeNet();
      this._unsubscribeNet = null;
    }
  }
}

SyncQueue.resolveSyncRequest = resolveSyncRequest;

module.exports = { SyncQueue, resolveSyncRequest };
