'use strict';

const { IndexedDbAdapter } = require('../storage/IndexedDbAdapter');
const { CapacitorSqliteAdapter } = require('../storage/CapacitorSqliteAdapter');

/**
 * Creates unified EnvironmentPorts (Invariant 3) abstracting:
 * `storage`, `network`, `filesystem`, `secureAuth`, `clipboard`, `share`, `camera`.
 * Views and components consume ONLY these ports — zero direct runtime/Capacitor/IDB imports.
 * @param {Partial<{
 *   storage: import('../storage/StorageAdapter').StorageAdapter,
 *   network: Record<string, any>,
 *   filesystem: Record<string, any>,
 *   secureAuth: Record<string, any>,
 *   clipboard: Record<string, any>,
 *   share: Record<string, any>,
 *   camera: Record<string, any>,
 *   isNativePlatform: boolean
 * }>} [overrides]
 */
function createEnvironmentPorts(overrides = {}) {
  const isNative =
    overrides.isNativePlatform !== undefined
      ? Boolean(overrides.isNativePlatform)
      : Boolean(globalThis.Capacitor?.isNativePlatform?.());

  const storage =
    overrides.storage ||
    (isNative ? new CapacitorSqliteAdapter() : new IndexedDbAdapter());

  const networkListeners = new Set();
  const network = overrides.network || {
    isOnline() {
      if (typeof globalThis.navigator !== 'undefined' && typeof globalThis.navigator.onLine === 'boolean') {
        return globalThis.navigator.onLine;
      }
      return true;
    },
    onChange(cb) {
      networkListeners.add(cb);
      if (typeof globalThis.window?.addEventListener === 'function') {
        const onOnline = () => cb(true);
        const onOffline = () => cb(false);
        globalThis.window.addEventListener('online', onOnline);
        globalThis.window.addEventListener('offline', onOffline);
        return () => {
          networkListeners.delete(cb);
          globalThis.window.removeEventListener('online', onOnline);
          globalThis.window.removeEventListener('offline', onOffline);
        };
      }
      return () => networkListeners.delete(cb);
    },
  };

  const filesystem = overrides.filesystem || {
    async saveFile(filePath, content) {
      return storage.saveFile(filePath, content);
    },
    async readFile(filePath) {
      return storage.readFile(filePath);
    },
  };

  let memToken = null;
  const secureAuth = overrides.secureAuth || {
    async getToken() {
      if (isNative && globalThis.Capacitor?.Plugins?.SecureStoragePlugin) {
        try {
          const res = await globalThis.Capacitor.Plugins.SecureStoragePlugin.get({
            key: 'autonmax_jwt',
          });
          return res?.value || null;
        } catch {
          return null;
        }
      }
      if (typeof globalThis.sessionStorage !== 'undefined') {
        return globalThis.sessionStorage.getItem('autonmax_jwt');
      }
      return memToken;
    },
    async setToken(token) {
      if (isNative && globalThis.Capacitor?.Plugins?.SecureStoragePlugin) {
        await globalThis.Capacitor.Plugins.SecureStoragePlugin.set({
          key: 'autonmax_jwt',
          value: String(token),
        });
        return;
      }
      if (typeof globalThis.sessionStorage !== 'undefined') {
        globalThis.sessionStorage.setItem('autonmax_jwt', String(token));
        return;
      }
      memToken = String(token);
    },
    async clearToken() {
      if (isNative && globalThis.Capacitor?.Plugins?.SecureStoragePlugin) {
        await globalThis.Capacitor.Plugins.SecureStoragePlugin.remove({
          key: 'autonmax_jwt',
        });
        return;
      }
      if (typeof globalThis.sessionStorage !== 'undefined') {
        globalThis.sessionStorage.removeItem('autonmax_jwt');
        return;
      }
      memToken = null;
    },
  };

  const clipboard = overrides.clipboard || {
    async copy(text) {
      if (globalThis.navigator?.clipboard?.writeText) {
        await globalThis.navigator.clipboard.writeText(String(text));
        return { ok: true };
      }
      return { ok: true, copied: String(text) };
    },
  };

  const share = overrides.share || {
    async share(payload) {
      if (globalThis.navigator?.share) {
        await globalThis.navigator.share(payload);
        return { ok: true, native: true };
      }
      await clipboard.copy(payload?.text || payload?.url || '');
      return { ok: true, fallback: 'clipboard' };
    },
  };

  const camera = overrides.camera || {
    async captureOrScan() {
      return { ok: false, reason: 'CAMERA_NOT_CONFIGURED' };
    },
  };

  return {
    isNative,
    storage,
    network,
    filesystem,
    secureAuth,
    clipboard,
    share,
    camera,
  };
}

module.exports = { createEnvironmentPorts };
