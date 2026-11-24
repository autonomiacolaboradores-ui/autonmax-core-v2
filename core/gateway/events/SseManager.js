'use strict';

const crypto = require('node:crypto');

const DEFAULT_HEARTBEAT_MS = 25_000;

/**
 * Manages Server-Sent Events (`/api/v1/events/stream`) subscriptions scoped by partnerId.
 */
class SseManager {
  /**
   * @param {{ heartbeatMs?: number }} [options]
   */
  constructor(options = {}) {
    this.heartbeatMs = Number.isFinite(options.heartbeatMs)
      ? Number(options.heartbeatMs)
      : DEFAULT_HEARTBEAT_MS;
    /** @type {Set<{ id: string, partnerId: string | null, res: import('node:http').ServerResponse }>} */
    this._clients = new Set();
    this._heartbeatTimer = null;
  }

  /**
   * Starts periodic heartbeat comments on an `.unref()` timer when clients exist.
   * @private
   */
  _ensureHeartbeat() {
    if (this._heartbeatTimer || this.heartbeatMs <= 0) return;
    this._heartbeatTimer = setInterval(() => {
      for (const client of Array.from(this._clients)) {
        try {
          client.res.write(': heartbeat\n\n');
        } catch {
          this._clients.delete(client);
        }
      }
      if (this._clients.size === 0) {
        this._stopHeartbeat();
      }
    }, this.heartbeatMs);
    if (typeof this._heartbeatTimer.unref === 'function') {
      this._heartbeatTimer.unref();
    }
  }

  /**
   * @private
   */
  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  /**
   * Upgrades an HTTP response to an SSE stream and registers cleanup on close.
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {{ partnerId?: string | null }} [options]
   */
  subscribe(req, res, options = {}) {
    const client = {
      id: `sse_${crypto.randomUUID()}`,
      partnerId: options.partnerId ? String(options.partnerId) : null,
      res,
    };

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    res.write(
      `event: connected\ndata: ${JSON.stringify({ clientId: client.id, partnerId: client.partnerId })}\n\n`
    );

    this._clients.add(client);
    this._ensureHeartbeat();

    const cleanup = () => {
      this._clients.delete(client);
      if (this._clients.size === 0) {
        this._stopHeartbeat();
      }
    };

    req.on('close', cleanup);
    res.on('close', cleanup);

    return client.id;
  }

  /**
   * Broadcasts an event envelope to all matching SSE subscribers.
   * @param {{ eventId?: string, eventType: string, partnerId?: string | null, timestamp?: string, payload: Record<string, unknown> }} event
   */
  broadcast(event) {
    const envelope = {
      eventId: event.eventId || `evt_${crypto.randomUUID()}`,
      eventType: event.eventType,
      partnerId: event.partnerId ?? null,
      timestamp: event.timestamp || new Date().toISOString(),
      payload: event.payload || {},
    };
    const frame = `event: ${envelope.eventType}\ndata: ${JSON.stringify(envelope)}\n\n`;

    for (const client of Array.from(this._clients)) {
      if (
        client.partnerId &&
        envelope.partnerId &&
        client.partnerId !== envelope.partnerId
      ) {
        continue;
      }
      try {
        client.res.write(frame);
      } catch {
        this._clients.delete(client);
      }
    }
  }

  /**
   * Returns active SSE subscriber count.
   */
  clientCount() {
    return this._clients.size;
  }

  /**
   * Closes all active SSE streams and stops heartbeat timers cleanly.
   */
  close() {
    this._stopHeartbeat();
    for (const client of Array.from(this._clients)) {
      try {
        client.res.end();
      } catch {
        // Ignore stream close errors.
      }
    }
    this._clients.clear();
  }
}

module.exports = { SseManager };
