'use strict';

const DEFAULT_KEEP_ALIVE_INTERVAL_MS = 7 * 60 * 1000; // 7 min (420000ms < 15 min Render Free idle timeout)
const DEFAULT_PING_TIMEOUT_MS = 8_000;

/**
 * Normalizes a base or full health URL into a concrete `/health` endpoint URL.
 * @param {string | null | undefined} rawUrl
 * @returns {string | null}
 */
function resolveHealthUrl(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return null;

  let normalized = trimmed;
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  try {
    const parsed = new URL(normalized);
    if (!parsed.pathname || parsed.pathname === '/') {
      parsed.pathname = '/health';
    } else if (!parsed.pathname.endsWith('/health')) {
      parsed.pathname = `${parsed.pathname.replace(/\/+$/, '')}/health`;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Lightweight anti-hibernation keep-alive service for Render Free web services.
 * - Activates only when `RENDER_EXTERNAL_URL` or `KEEP_ALIVE_URL` is configured
 *   (and skipped in `NODE_ENV=test` unless explicitly enabled).
 * - Uses `AbortController` with a short timeout per ping and never crashes the process.
 * - Uses `.unref()` timers and cleans up cleanly via `stop()` / `close()` on LifecycleManager shutdown.
 */
class KeepAliveService {
  /**
   * @param {{
   *   targetUrl?: string | null,
   *   intervalMs?: number,
   *   timeoutMs?: number,
   *   enabled?: boolean,
   *   nodeEnv?: string,
   *   fetchImpl?: typeof fetch,
   *   logger?: Console
   * }} [options]
   */
  constructor(options = {}) {
    const envUrl = process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL || '';
    const rawTarget = options.targetUrl !== undefined ? options.targetUrl : envUrl;
    this.targetUrl = resolveHealthUrl(rawTarget);

    const envInterval = Number(process.env.KEEP_ALIVE_INTERVAL_MS);
    this.intervalMs =
      Number.isFinite(options.intervalMs) && options.intervalMs > 0
        ? Number(options.intervalMs)
        : Number.isFinite(envInterval) && envInterval > 0
          ? envInterval
          : DEFAULT_KEEP_ALIVE_INTERVAL_MS;

    this.timeoutMs =
      Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
        ? Number(options.timeoutMs)
        : DEFAULT_PING_TIMEOUT_MS;

    this.nodeEnv = options.nodeEnv || process.env.NODE_ENV || 'development';
    this.enabledOption = options.enabled;
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.logger = options.logger || console;

    this._timer = null;
    this._running = false;
    /** @type {Set<AbortController>} */
    this._activeControllers = new Set();

    this.pingCount = 0;
    this.lastStatus = null;
    this.lastPingAt = null;
    this.lastError = null;
  }

  /**
   * Determines whether keep-alive should activate under current configuration.
   * @returns {{ active: boolean, reason: string }}
   */
  shouldRun() {
    if (this.enabledOption === false) {
      return { active: false, reason: 'EXPLICITLY_DISABLED' };
    }
    if (this.nodeEnv === 'test' && this.enabledOption !== true) {
      return { active: false, reason: 'TEST_ENVIRONMENT' };
    }
    if (!this.targetUrl) {
      return { active: false, reason: 'NO_TARGET_URL' };
    }
    if (typeof this.fetchImpl !== 'function') {
      return { active: false, reason: 'NO_FETCH_IMPL' };
    }
    return { active: true, reason: 'ENABLED' };
  }

  /**
   * Executes a single bounded HTTP GET ping to `this.targetUrl`.
   * Never throws unhandled errors.
   */
  async pingOnce() {
    if (!this.targetUrl || typeof this.fetchImpl !== 'function') {
      return { ok: false, status: null, error: 'NOT_CONFIGURED' };
    }

    const controller = new AbortController();
    this._activeControllers.add(controller);

    let timeoutTimer = null;
    try {
      timeoutTimer = setTimeout(() => {
        controller.abort(new Error('KEEP_ALIVE_TIMEOUT'));
      }, this.timeoutMs);
      if (typeof timeoutTimer.unref === 'function') {
        timeoutTimer.unref();
      }

      const res = await this.fetchImpl(this.targetUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'AUTONMAX-vNext-KeepAlive/1.0' },
        signal: controller.signal,
      });

      this.pingCount += 1;
      this.lastStatus = res?.status ?? 200;
      this.lastPingAt = Date.now();
      this.lastError = null;

      return {
        ok: Boolean(res && res.ok !== false),
        status: this.lastStatus,
        targetUrl: this.targetUrl,
      };
    } catch (err) {
      const msg = err?.message || String(err);
      this.pingCount += 1;
      this.lastStatus = null;
      this.lastPingAt = Date.now();
      this.lastError = msg;
      this.logger.warn?.(`[KEEP_ALIVE] ping failed (${this.targetUrl}): ${msg}`);
      return {
        ok: false,
        status: null,
        error: msg,
        targetUrl: this.targetUrl,
      };
    } finally {
      if (timeoutTimer !== null) {
        clearTimeout(timeoutTimer);
      }
      this._activeControllers.delete(controller);
    }
  }

  /**
   * Starts the periodic unref'd keep-alive loop if configured and eligible.
   * @returns {{ started: boolean, reason: string, targetUrl: string | null, intervalMs: number }}
   */
  start() {
    if (this._running) {
      return {
        started: true,
        reason: 'ALREADY_RUNNING',
        targetUrl: this.targetUrl,
        intervalMs: this.intervalMs,
      };
    }

    const check = this.shouldRun();
    if (!check.active) {
      return {
        started: false,
        reason: check.reason,
        targetUrl: this.targetUrl,
        intervalMs: this.intervalMs,
      };
    }

    this._running = true;
    this._timer = setInterval(() => {
      this.pingOnce().catch(() => {});
    }, this.intervalMs);

    if (typeof this._timer.unref === 'function') {
      this._timer.unref();
    }

    return {
      started: true,
      reason: 'STARTED',
      targetUrl: this.targetUrl,
      intervalMs: this.intervalMs,
    };
  }

  /**
   * Stops the keep-alive timer and aborts any in-flight HTTP pings cleanly.
   */
  stop() {
    this._running = false;
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
    for (const controller of Array.from(this._activeControllers)) {
      try {
        controller.abort(new Error('KEEP_ALIVE_STOPPED'));
      } catch {
        // Ignore abort errors on shutdown.
      }
    }
    this._activeControllers.clear();
  }

  /**
   * LifecycleManager-compatible alias for `stop()`.
   */
  close() {
    this.stop();
  }

  /**
   * Returns current keep-alive telemetry snapshot.
   */
  getStatus() {
    return {
      running: this._running,
      targetUrl: this.targetUrl,
      intervalMs: this.intervalMs,
      pingCount: this.pingCount,
      lastStatus: this.lastStatus,
      lastPingAt: this.lastPingAt,
      lastError: this.lastError,
    };
  }
}

KeepAliveService.DEFAULT_KEEP_ALIVE_INTERVAL_MS = DEFAULT_KEEP_ALIVE_INTERVAL_MS;
KeepAliveService.DEFAULT_PING_TIMEOUT_MS = DEFAULT_PING_TIMEOUT_MS;
KeepAliveService.resolveHealthUrl = resolveHealthUrl;

module.exports = {
  KeepAliveService,
  DEFAULT_KEEP_ALIVE_INTERVAL_MS,
  DEFAULT_PING_TIMEOUT_MS,
  resolveHealthUrl,
};
