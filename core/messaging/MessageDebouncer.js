'use strict';

const DEFAULT_DEBOUNCE_WINDOW_MS = 2500;
const MAX_DEBOUNCE_WINDOW_MS = 8000;

/**
 * Resolves configured debounce window clamped within [0, 8000] ms.
 * @param {number | string | undefined} rawValue
 * @returns {number}
 */
function resolveDebounceWindowMs(rawValue) {
  const parsed = Number(rawValue ?? process.env.DEBOUNCE_WINDOW_MS ?? DEFAULT_DEBOUNCE_WINDOW_MS);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_DEBOUNCE_WINDOW_MS;
  }
  return Math.min(MAX_DEBOUNCE_WINDOW_MS, Math.trunc(parsed));
}

/**
 * Aggregates fragmented consecutive inbound messages per `(partnerId, chatId)`
 * inside a quiet debounce window before dispatching a single consolidated turn.
 */
class MessageDebouncer {
  /**
   * @param {{ windowMs?: number, onFlush?: (batch: Record<string, any>) => Promise<void> | void }} [options]
   */
  constructor(options = {}) {
    this.windowMs = resolveDebounceWindowMs(options.windowMs);
    this.onFlush = typeof options.onFlush === 'function' ? options.onFlush : null;
    /** @type {Map<string, { partnerId: string, chatId: string, items: Array<Record<string, any>>, texts: string[], eventKeys: string[], timer: NodeJS.Timeout | null, onFlush: Function | null }>} */
    this._buffers = new Map();
    /** @type {Set<Promise<void>>} */
    this._inFlightFlushes = new Set();
    this._closed = false;
  }

  /**
   * Builds composite buffer key for `(partnerId, chatId)`.
   * @param {string} partnerId
   * @param {string} chatId
   * @returns {string}
   */
  static makeKey(partnerId, chatId) {
    return `${String(partnerId)}::${String(chatId)}`;
  }

  /**
   * Enqueues a message fragment into the `(partnerId, chatId)` debounce window.
   * @param {{ partnerId: string, chatId: string, text: string, eventKey?: string }} item
   * @param {(batch: Record<string, any>) => Promise<void> | void} [onFlush]
   * @returns {{ accepted: boolean, key: string, bufferedCount: number }}
   */
  enqueue(item, onFlush) {
    if (this._closed) {
      return { accepted: false, key: '', bufferedCount: 0 };
    }
    const partnerId = String(item.partnerId || '');
    const chatId = String(item.chatId || '');
    const key = MessageDebouncer.makeKey(partnerId, chatId);

    let bucket = this._buffers.get(key);
    if (!bucket) {
      bucket = {
        partnerId,
        chatId,
        items: [],
        texts: [],
        eventKeys: [],
        timer: null,
        onFlush: typeof onFlush === 'function' ? onFlush : this.onFlush,
      };
      this._buffers.set(key, bucket);
    } else if (typeof onFlush === 'function') {
      bucket.onFlush = onFlush;
    }

    if (bucket.timer !== null) {
      clearTimeout(bucket.timer);
      bucket.timer = null;
    }

    bucket.items.push(item);
    const cleanText = String(item.text || '').trim();
    if (cleanText) {
      bucket.texts.push(cleanText);
    }
    if (item.eventKey) {
      bucket.eventKeys.push(String(item.eventKey));
    }

    const flushFn = () => {
      this.flushKey(key);
    };

    if (this.windowMs === 0) {
      bucket.timer = setTimeout(flushFn, 0);
    } else {
      bucket.timer = setTimeout(flushFn, this.windowMs);
    }
    if (typeof bucket.timer.unref === 'function') {
      bucket.timer.unref();
    }

    return {
      accepted: true,
      key,
      bufferedCount: bucket.items.length,
    };
  }

  /**
   * Immediately flushes a single `(partnerId, chatId)` buffer.
   * @param {string} key
   * @returns {Promise<void>}
   */
  flushKey(key) {
    const bucket = this._buffers.get(key);
    if (!bucket) {
      return Promise.resolve();
    }

    if (bucket.timer !== null) {
      clearTimeout(bucket.timer);
      bucket.timer = null;
    }
    this._buffers.delete(key);

    const handler = bucket.onFlush || this.onFlush;
    if (typeof handler !== 'function') {
      return Promise.resolve();
    }

    const batch = {
      partnerId: bucket.partnerId,
      chatId: bucket.chatId,
      text: bucket.texts.join('\n'),
      texts: [...bucket.texts],
      eventKeys: [...bucket.eventKeys],
      items: [...bucket.items],
      count: bucket.items.length,
    };

    const p = Promise.resolve()
      .then(() => handler(batch))
      .finally(() => {
        this._inFlightFlushes.delete(p);
      });

    this._inFlightFlushes.add(p);
    return p;
  }

  /**
   * Flushes all buffered conversations and awaits in-flight handlers.
   */
  async flushAll() {
    const keys = Array.from(this._buffers.keys());
    const promises = keys.map((k) => this.flushKey(k));
    await Promise.allSettled([...promises, ...Array.from(this._inFlightFlushes)]);
  }

  /**
   * Stops accepting new debounced messages, cancels pending timers, and drains in-flight flushes.
   * @param {{ flushPending?: boolean }} [options]
   */
  async close(options = {}) {
    this._closed = true;
    if (options.flushPending) {
      await this.flushAll();
      return;
    }

    for (const bucket of this._buffers.values()) {
      if (bucket.timer !== null) {
        clearTimeout(bucket.timer);
        bucket.timer = null;
      }
    }
    this._buffers.clear();
    await Promise.allSettled(Array.from(this._inFlightFlushes));
  }

  /**
   * Returns current number of active buffered chats.
   * @returns {number}
   */
  pendingCount() {
    return this._buffers.size;
  }
}

MessageDebouncer.DEFAULT_DEBOUNCE_WINDOW_MS = DEFAULT_DEBOUNCE_WINDOW_MS;
MessageDebouncer.MAX_DEBOUNCE_WINDOW_MS = MAX_DEBOUNCE_WINDOW_MS;
MessageDebouncer.resolveDebounceWindowMs = resolveDebounceWindowMs;

module.exports = {
  MessageDebouncer,
  DEFAULT_DEBOUNCE_WINDOW_MS,
  MAX_DEBOUNCE_WINDOW_MS,
  resolveDebounceWindowMs,
};
