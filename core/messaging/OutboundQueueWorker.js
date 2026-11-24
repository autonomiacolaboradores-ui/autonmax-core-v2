'use strict';

const { QueueRepository } = require('../storage/repositories/QueueRepository');

const DEFAULT_MIN_PRESENCE_MS = 1500;
const DEFAULT_MAX_PRESENCE_MS = 5000;
const DEFAULT_POLL_INTERVAL_MS = 250;
const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * Durable anti-ban outbound delivery worker over SQLite `outbox_queue` + `processed_events`.
 * Flow per Doc 01 Section 4:
 * 1. Read receipt (when supported by adapter)
 * 2. Emit `composing` or `recording` presence proportional to text length (1.5s–5s default)
 * 3. Dispatch message via ChannelAdapter
 * 4. Mark `SENT` (or schedule retry / mark `FAILED` on exhaustion)
 */
class OutboundQueueWorker {
  /**
   * @param {{
   *   dbManager?: import('../storage/DatabaseManager').DatabaseManager,
   *   queueRepository?: QueueRepository,
   *   channelAdapter: import('./ChannelAdapter').ChannelAdapter,
   *   minPresenceMs?: number,
   *   maxPresenceMs?: number,
   *   pollIntervalMs?: number,
   *   maxAttempts?: number,
   *   retryBaseMs?: number,
   *   sleepFn?: (ms: number) => Promise<void>
   * }} deps
   */
  constructor(deps = {}) {
    if (!deps.queueRepository && !deps.dbManager) {
      throw new Error('OutboundQueueWorker requires queueRepository or dbManager');
    }
    if (!deps.channelAdapter) {
      throw new Error('OutboundQueueWorker requires channelAdapter');
    }

    this.queueRepository =
      deps.queueRepository || new QueueRepository(deps.dbManager);
    this.channelAdapter = deps.channelAdapter;
    this.minPresenceMs = Number.isFinite(deps.minPresenceMs)
      ? Number(deps.minPresenceMs)
      : DEFAULT_MIN_PRESENCE_MS;
    this.maxPresenceMs = Number.isFinite(deps.maxPresenceMs)
      ? Number(deps.maxPresenceMs)
      : DEFAULT_MAX_PRESENCE_MS;
    this.pollIntervalMs = Number.isFinite(deps.pollIntervalMs)
      ? Number(deps.pollIntervalMs)
      : DEFAULT_POLL_INTERVAL_MS;
    this.maxAttempts = Number.isInteger(deps.maxAttempts)
      ? deps.maxAttempts
      : DEFAULT_MAX_ATTEMPTS;
    this.retryBaseMs = Number.isFinite(deps.retryBaseMs)
      ? Number(deps.retryBaseMs)
      : 2000;
    this.sleepFn = deps.sleepFn || null;

    this._running = false;
    this._pollTimer = null;
    this._inFlight = null;
  }

  /**
   * Atomically records `processed_events` and enqueues outbound reply in `outbox_queue`
   * inside the same SQLite transaction (post-commit idempotency).
   * @param {{ eventKey: string, sessionKey: string, channel?: string, recipientId: string, payload: Record<string, any>, nextAttemptAt?: number }} data
   */
  enqueuePostCommit({
    eventKey,
    sessionKey,
    channel = 'whatsapp',
    recipientId,
    payload,
    nextAttemptAt = Date.now(),
  }) {
    return this.queueRepository.enqueueWithIdempotency({
      eventKey,
      sessionKey,
      channel,
      recipientId,
      payload,
      nextAttemptAt,
    });
  }

  /**
   * Enqueues a direct outbound message without an inbound eventKey (e.g. STT fallback or operator).
   * @param {{ sessionKey: string, channel?: string, recipientId: string, payload: Record<string, any>, nextAttemptAt?: number }} data
   */
  enqueueDirect({
    sessionKey,
    channel = 'whatsapp',
    recipientId,
    payload,
    nextAttemptAt = Date.now(),
  }) {
    return this.queueRepository.enqueueOutbox({
      sessionKey,
      channel,
      recipientId,
      payload,
      nextAttemptAt,
    });
  }

  /**
   * Computes anti-ban typing/recording delay proportional to text length.
   * @param {string} text
   * @returns {number}
   */
  computePresenceDelayMs(text) {
    if (this.maxPresenceMs <= 0) return 0;
    const len = String(text || '').length;
    const proportional = len * 35;
    return Math.min(this.maxPresenceMs, Math.max(this.minPresenceMs, proportional));
  }

  /**
   * Delays safely without leaving dangling timers after worker stop.
   * @private
   */
  _sleep(ms) {
    if (ms <= 0) return Promise.resolve();
    if (this.sleepFn) return this.sleepFn(ms);
    return new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      if (typeof t.unref === 'function') t.unref();
    });
  }

  /**
   * Processes due PENDING rows in `outbox_queue`.
   * @param {{ nowMs?: number, limit?: number, sessionKey?: string }} [options]
   * @returns {Promise<{ processed: number, sent: number, retried: number, failed: number }>}
   */
  async processOnce(options = {}) {
    if (this._inFlight) {
      return this._inFlight;
    }

    this._inFlight = (async () => {
      const due = this.queueRepository.fetchDueOutbox({
        nowMs: options.nowMs ?? Date.now(),
        limit: options.limit ?? 20,
        sessionKey: options.sessionKey,
      });

      let sent = 0;
      let retried = 0;
      let failed = 0;

      for (const row of due) {
        const payload = row.payload || {};
        const presenceMode =
          payload.presence ||
          (payload.type === 'audio' ? 'recording' : 'composing');

        try {
          if (
            payload.readReceiptKey &&
            typeof this.channelAdapter.markRead === 'function'
          ) {
            await this.channelAdapter.markRead(row.session_key, [
              payload.readReceiptKey,
            ]);
          }

          if (typeof this.channelAdapter.sendPresence === 'function') {
            await this.channelAdapter.sendPresence(
              row.session_key,
              row.recipient_id,
              presenceMode
            );
          }

          const delayMs = this.computePresenceDelayMs(payload.text);
          if (delayMs > 0) {
            await this._sleep(delayMs);
          }

          if (typeof this.channelAdapter.sendPresence === 'function') {
            await this.channelAdapter.sendPresence(
              row.session_key,
              row.recipient_id,
              'paused'
            );
          }

          await this.channelAdapter.sendMessage(
            row.session_key,
            row.recipient_id,
            {
              type: payload.type || 'text',
              text: payload.text,
              mediaUrl: payload.mediaUrl,
            }
          );

          this.queueRepository.markOutboxSent(row.id);
          sent += 1;
        } catch {
          const nextAttemptCount = Number(row.attempts || 0) + 1;
          if (nextAttemptCount >= this.maxAttempts) {
            this.queueRepository.markOutboxFailed(row.id);
            failed += 1;
          } else {
            const backoff = this.retryBaseMs * Math.pow(2, nextAttemptCount - 1);
            this.queueRepository.markOutboxRetry(row.id, {
              nextAttemptAt: Date.now() + backoff,
            });
            retried += 1;
          }
        }
      }

      return {
        processed: due.length,
        sent,
        retried,
        failed,
      };
    })();

    try {
      return await this._inFlight;
    } finally {
      this._inFlight = null;
    }
  }

  /**
   * Starts background polling loop with unref'd timer.
   */
  start() {
    if (this._running) return;
    this._running = true;

    const scheduleNext = () => {
      if (!this._running) return;
      this._pollTimer = setTimeout(async () => {
        this._pollTimer = null;
        if (!this._running) return;
        try {
          await this.processOnce();
        } finally {
          scheduleNext();
        }
      }, this.pollIntervalMs);
      if (typeof this._pollTimer.unref === 'function') {
        this._pollTimer.unref();
      }
    };

    scheduleNext();
  }

  /**
   * Stops polling and waits for any active outbox delivery batch to settle.
   */
  async stop() {
    this._running = false;
    if (this._pollTimer !== null) {
      clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }
    if (this._inFlight) {
      await this._inFlight.catch(() => {});
    }
  }

  /**
   * Alias for stop() for LifecycleManager registration.
   */
  async close() {
    await this.stop();
  }
}

module.exports = {
  OutboundQueueWorker,
  DEFAULT_MIN_PRESENCE_MS,
  DEFAULT_MAX_PRESENCE_MS,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_MAX_ATTEMPTS,
};
