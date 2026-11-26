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
  const readWebStorage = (storageObj) => {
    try {
      return storageObj ? storageObj.getItem('autonmax_jwt') : null;
    } catch {
      return null;
    }
  };
  const writeWebStorage = (storageObj, val) => {
    try {
      if (storageObj) {
        storageObj.setItem('autonmax_jwt', val);
        return true;
      }
    } catch {
      return false;
    }
    return false;
  };
  const removeWebStorage = (storageObj) => {
    try {
      if (storageObj) storageObj.removeItem('autonmax_jwt');
    } catch {
      // Ignore storage quota/security errors.
    }
  };

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
      // On Web/PWA (non-native), persist across tab/browser restarts via localStorage
      // (with migration fallback from legacy sessionStorage).
      if (!isNative && typeof globalThis.localStorage !== 'undefined') {
        const persisted = readWebStorage(globalThis.localStorage);
        if (persisted) return persisted;
        const fromSession =
          typeof globalThis.sessionStorage !== 'undefined'
            ? readWebStorage(globalThis.sessionStorage)
            : null;
        if (fromSession) {
          writeWebStorage(globalThis.localStorage, fromSession);
          return fromSession;
        }
      }
      if (!isNative && typeof globalThis.sessionStorage !== 'undefined') {
        return readWebStorage(globalThis.sessionStorage);
      }
      return memToken;
    },
    async setToken(token) {
      const value = String(token);
      if (isNative && globalThis.Capacitor?.Plugins?.SecureStoragePlugin) {
        await globalThis.Capacitor.Plugins.SecureStoragePlugin.set({
          key: 'autonmax_jwt',
          value,
        });
        return;
      }
      if (!isNative && typeof globalThis.localStorage !== 'undefined') {
        if (writeWebStorage(globalThis.localStorage, value)) {
          if (typeof globalThis.sessionStorage !== 'undefined') {
            removeWebStorage(globalThis.sessionStorage);
          }
          return;
        }
      }
      if (!isNative && typeof globalThis.sessionStorage !== 'undefined') {
        if (writeWebStorage(globalThis.sessionStorage, value)) return;
      }
      memToken = value;
    },
    async clearToken() {
      if (isNative && globalThis.Capacitor?.Plugins?.SecureStoragePlugin) {
        await globalThis.Capacitor.Plugins.SecureStoragePlugin.remove({
          key: 'autonmax_jwt',
        });
        return;
      }
      if (!isNative && typeof globalThis.localStorage !== 'undefined') {
        removeWebStorage(globalThis.localStorage);
      }
      if (!isNative && typeof globalThis.sessionStorage !== 'undefined') {
        removeWebStorage(globalThis.sessionStorage);
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
