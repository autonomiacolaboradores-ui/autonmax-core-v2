'use strict';

const DEFAULT_DRAIN_TIMEOUT_MS = 10_000;
const DEFAULT_SIGNALS = ['SIGINT', 'SIGTERM'];

/**
 * Runs a cleanup function bounded by a timeout without leaking timer handles.
 * @param {() => (void | Promise<void>)} fn
 * @param {number} timeoutMs
 * @param {string} name
 */
async function runWithTimeout(fn, timeoutMs, name) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    await Promise.resolve(fn());
    return;
  }

  let timer = null;
  try {
    await Promise.race([
      Promise.resolve().then(() => fn()),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Shutdown timeout (${timeoutMs}ms) for resource "${name}"`));
        }, timeoutMs);
        if (typeof timer.unref === 'function') {
          timer.unref();
        }
      }),
    ]);
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}

/**
 * Single centralized coordinator for SIGINT/SIGTERM signals and ordered LIFO
 * shutdown of runtime resources without forcing `process.exit()`.
 */
class LifecycleManager {
  /**
   * @param {{ drainTimeoutMs?: number, signals?: string[], processRef?: NodeJS.EventEmitter, logger?: Console }} [options]
   */
  constructor(options = {}) {
    this.drainTimeoutMs = Number.isFinite(options.drainTimeoutMs)
      ? Number(options.drainTimeoutMs)
      : DEFAULT_DRAIN_TIMEOUT_MS;
    this.signals = Array.isArray(options.signals)
      ? [...options.signals]
      : [...DEFAULT_SIGNALS];
    this.processRef = options.processRef || process;
    this.logger = options.logger || console;

    /** @type {Array<{ id: symbol, name: string, close: (reason: string) => (void | Promise<void>), timeoutMs?: number }>} */
    this._resources = [];
    /** @type {Map<string, () => void>} */
    this._signalHandlers = new Map();
    /** @type {Promise<{ ok: boolean, reason: string, closed: string[], errors: Array<{ name: string, error: Error }> }> | null} */
    this._shutdownPromise = null;
    this._closed = false;
  }

  /**
   * Registers a resource or cleanup handler. Resources are closed in reverse
   * registration order (LIFO) during shutdown.
   * @param {string | (() => void | Promise<void>) | { close: Function }} nameOrTarget
   * @param {(() => void | Promise<void>) | { close: Function, timeoutMs?: number }} [targetOrOptions]
   * @param {{ timeoutMs?: number }} [options]
   * @returns {() => void} Unregister function
   */
  register(nameOrTarget, targetOrOptions, options = {}) {
    let name;
    let closeFn;
    let timeoutMs = options.timeoutMs;

    if (typeof nameOrTarget === 'string') {
      name = nameOrTarget;
      if (typeof targetOrOptions === 'function') {
        closeFn = targetOrOptions;
      } else if (targetOrOptions && typeof targetOrOptions.close === 'function') {
        closeFn = () => targetOrOptions.close();
        if (timeoutMs === undefined && Number.isFinite(targetOrOptions.timeoutMs)) {
          timeoutMs = targetOrOptions.timeoutMs;
        }
      } else {
        throw new TypeError(
          `LifecycleManager.register("${name}") requires a function or an object with close()`
        );
      }
    } else if (typeof nameOrTarget === 'function') {
      name = nameOrTarget.name || `resource_${this._resources.length + 1}`;
      closeFn = nameOrTarget;
      if (targetOrOptions && typeof targetOrOptions === 'object') {
        timeoutMs = targetOrOptions.timeoutMs;
      }
    } else if (nameOrTarget && typeof nameOrTarget.close === 'function') {
      name = nameOrTarget.constructor?.name || `resource_${this._resources.length + 1}`;
      closeFn = () => nameOrTarget.close();
      if (targetOrOptions && typeof targetOrOptions === 'object') {
        timeoutMs = targetOrOptions.timeoutMs;
      }
    } else {
      throw new TypeError(
        'LifecycleManager.register requires (name, fn|closeable) or (fn|closeable)'
      );
    }

    const entry = {
      id: Symbol(name),
      name,
      close: closeFn,
      timeoutMs,
    };

    this._resources.push(entry);

    return () => {
      const idx = this._resources.findIndex((item) => item.id === entry.id);
      if (idx !== -1) {
        this._resources.splice(idx, 1);
      }
    };
  }

  /**
   * Returns registered resource names in registration order.
   * @returns {string[]}
   */
  getRegisteredNames() {
    return this._resources.map((entry) => entry.name);
  }

  /**
   * Installs SIGINT/SIGTERM handlers on `processRef` (idempotent).
   * Never calls `process.exit()` forcibly; allows the event loop to drain naturally.
   * @returns {LifecycleManager}
   */
  installSignals() {
    if (this._signalHandlers.size > 0) {
      return this;
    }

    for (const signal of this.signals) {
      const listener = () => {
        this.shutdown(signal).then((result) => {
          if (!result.ok && this.processRef && typeof this.processRef === 'object') {
            this.processRef.exitCode = 1;
          }
        });
      };
      this._signalHandlers.set(signal, listener);
      this.processRef.on(signal, listener);
    }

    return this;
  }

  /**
   * Detaches installed SIGINT/SIGTERM listeners cleanly.
   */
  uninstallSignals() {
    for (const [signal, listener] of this._signalHandlers.entries()) {
      if (typeof this.processRef.off === 'function') {
        this.processRef.off(signal, listener);
      } else if (typeof this.processRef.removeListener === 'function') {
        this.processRef.removeListener(signal, listener);
      }
    }
    this._signalHandlers.clear();
  }

  /**
   * Indicates whether shutdown has been initiated.
   * @returns {boolean}
   */
  isShuttingDown() {
    return this._shutdownPromise !== null;
  }

  /**
   * Indicates whether shutdown has completed.
   * @returns {boolean}
   */
  isClosed() {
    return this._closed;
  }

  /**
   * Executes ordered LIFO shutdown of all registered resources without forcing process.exit.
   * Repeated calls return the same in-flight/completed promise.
   * @param {string} [reason='manual']
   * @returns {Promise<{ ok: boolean, reason: string, closed: string[], errors: Array<{ name: string, error: Error }> }>}
   */
  shutdown(reason = 'manual') {
    if (this._shutdownPromise) {
      return this._shutdownPromise;
    }

    this._shutdownPromise = (async () => {
      this.uninstallSignals();

      const snapshot = [...this._resources];
      const closed = [];
      const errors = [];

      for (let i = snapshot.length - 1; i >= 0; i -= 1) {
        const entry = snapshot[i];
        const timeoutMs =
          entry.timeoutMs !== undefined ? entry.timeoutMs : this.drainTimeoutMs;

        try {
          await runWithTimeout(() => entry.close(reason), timeoutMs, entry.name);
          closed.push(entry.name);
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          errors.push({ name: entry.name, error });
          if (this.logger && typeof this.logger.error === 'function') {
            this.logger.error(
              `[LifecycleManager] Error closing "${entry.name}" (${reason}):`,
              error.message
            );
          }
        }
      }

      this._resources.length = 0;
      this._closed = true;

      return {
        ok: errors.length === 0,
        reason,
        closed,
        errors,
      };
    })();

    return this._shutdownPromise;
  }
}

module.exports = { LifecycleManager, DEFAULT_DRAIN_TIMEOUT_MS };
