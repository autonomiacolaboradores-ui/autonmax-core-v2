'use strict';

const path = require('node:path');
const { isValidCredsFile } = require('./SessionManager');

const DEFAULT_WATCHDOG_INTERVAL_MS = 60_000;
const DEFAULT_BASE_BACKOFF_MS = 2_000;
const DEFAULT_MAX_BACKOFF_MS = 120_000;

/**
 * Multi-session WhatsApp watchdog (cleanly distilled from legacy `WhatsAppWatchdog.js`):
 * - Monitors paired sessions (`baileys_auth/creds.json` valid) registered in `SessionManager`.
 * - Performs non-destructive soft reconnect (`forceReconnect`) when a paired session drops
 *   to `DISCONNECTED` without wiping credentials, bounded by per-session exponential backoff.
 * - Respects `STANDBY`, `isInitializing`, and `isPairingReset` states (never loops QR pairing).
 * - Uses `.unref()` timers and shuts down cleanly via `LifecycleManager`.
 */
class SessionWatchdog {
  /**
   * @param {{
   *   sessionManager: import('./SessionManager').SessionManager,
   *   intervalMs?: number,
   *   baseBackoffMs?: number,
   *   maxBackoffMs?: number,
   *   enabled?: boolean,
   *   nodeEnv?: string,
   *   logger?: Console
   * }} deps
   */
  constructor(deps = {}) {
    if (!deps.sessionManager) {
      throw new Error('SessionWatchdog requires sessionManager');
    }
    this.sessionManager = deps.sessionManager;

    const envInterval = Number(process.env.WA_WATCHDOG_INTERVAL_MS);
    this.intervalMs =
      Number.isFinite(deps.intervalMs) && deps.intervalMs > 0
        ? Number(deps.intervalMs)
        : Number.isFinite(envInterval) && envInterval > 0
          ? envInterval
          : DEFAULT_WATCHDOG_INTERVAL_MS;

    this.baseBackoffMs =
      Number.isFinite(deps.baseBackoffMs) && deps.baseBackoffMs >= 0
        ? Number(deps.baseBackoffMs)
        : DEFAULT_BASE_BACKOFF_MS;
    this.maxBackoffMs =
      Number.isFinite(deps.maxBackoffMs) && deps.maxBackoffMs >= 0
        ? Number(deps.maxBackoffMs)
        : DEFAULT_MAX_BACKOFF_MS;

    this.enabledOption = deps.enabled;
    this.nodeEnv = deps.nodeEnv || process.env.NODE_ENV || 'development';
    this.logger = deps.logger || console;

    this._timer = null;
    this._running = false;
    this._ticking = false;
    this._lastTickAt = null;
    /** @type {Map<string, { attempts: number, lastAttemptAt: number }>} */
    this._backoff = new Map();
  }

  /**
   * Runs one health inspection pass over all registered sessions.
   */
  async tick() {
    if (this._ticking) {
      return { checked: 0, actions: [], skipped: 'IN_PROGRESS' };
    }
    this._ticking = true;
    this._lastTickAt = Date.now();

    try {
      const entries =
        typeof this.sessionManager.listRegisteredSessions === 'function'
          ? this.sessionManager.listRegisteredSessions()
          : Array.from(this.sessionManager._sessions?.values?.() || []);

      const adapter = this.sessionManager.channelAdapter;
      const actions = [];

      for (const entry of entries) {
        const sessionKey = entry.sessionKey;
        const status = await adapter.getStatus(sessionKey);

        if (status === 'CONNECTED') {
          this._backoff.delete(sessionKey);
          continue;
        }

        if (status === 'STANDBY' || status === 'PAIRING_READY' || status === 'RECONNECTING') {
          continue;
        }

        const diag =
          typeof adapter.getSessionDiagnostics === 'function'
            ? adapter.getSessionDiagnostics(sessionKey)
            : null;

        if (diag?.isInitializing || diag?.isPairingReset) {
          continue;
        }

        const credsPath = path.join(entry.authDir, 'creds.json');
        if (!isValidCredsFile(credsPath)) {
          continue;
        }

        if (status === 'DISCONNECTED') {
          const prev = this._backoff.get(sessionKey) || { attempts: 0, lastAttemptAt: 0 };
          const nextAttempt = prev.attempts + 1;
          const delayMs = Math.min(
            this.maxBackoffMs,
            this.baseBackoffMs * Math.pow(2, Math.min(prev.attempts, 6))
          );

          if (prev.attempts > 0 && Date.now() - prev.lastAttemptAt < delayMs) {
            actions.push({
              sessionKey,
              action: 'soft_reconnect',
              attempt: nextAttempt,
              skipped: 'backoff',
            });
            continue;
          }

          this._backoff.set(sessionKey, {
            attempts: nextAttempt,
            lastAttemptAt: Date.now(),
          });

          const actionRecord = {
            sessionKey,
            action: 'soft_reconnect',
            attempt: nextAttempt,
            delayMs,
          };
          actions.push(actionRecord);

          try {
            if (typeof adapter.forceReconnect === 'function') {
              await adapter.forceReconnect(sessionKey);
            } else {
              await adapter.connect(sessionKey);
            }
            const afterStatus = await adapter.getStatus(sessionKey);
            if (afterStatus === 'CONNECTED') {
              this._backoff.delete(sessionKey);
            }
          } catch (err) {
            actionRecord.error = err?.message || String(err);
            this.logger.warn?.(
              `[SESSION_WATCHDOG] soft reconnect failed (${sessionKey}): ${actionRecord.error}`
            );
          }
        }
      }

      return { checked: entries.length, actions };
    } finally {
      this._ticking = false;
    }
  }

  /**
   * Starts the periodic unref'd watchdog timer.
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

    this._running = true;
    this._timer = setInterval(() => {
      this.tick().catch(() => {});
    }, this.intervalMs);
    if (typeof this._timer.unref === 'function') {
      this._timer.unref();
    }
    return { started: true, reason: 'STARTED', intervalMs: this.intervalMs };
  }

  /**
   * Stops the watchdog timer cleanly.
   */
  stop() {
    this._running = false;
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  close() {
    this.stop();
  }

  getStatus() {
    return {
      running: this._running,
      intervalMs: this.intervalMs,
      lastTickAt: this._lastTickAt,
      trackedBackoffs: this._backoff.size,
    };
  }
}

SessionWatchdog.DEFAULT_WATCHDOG_INTERVAL_MS = DEFAULT_WATCHDOG_INTERVAL_MS;

module.exports = {
  SessionWatchdog,
  DEFAULT_WATCHDOG_INTERVAL_MS,
};
