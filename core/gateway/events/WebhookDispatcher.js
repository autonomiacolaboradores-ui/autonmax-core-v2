'use strict';

const crypto = require('node:crypto');

/**
 * Outbound HMAC-SHA256 Webhook Dispatcher aligned with Doc 02 Section 4.
 * Respects partner `webhooks` feature flag and supports bounded retries.
 */
class WebhookDispatcher {
  /**
   * @param {{
   *   signingSecret?: string,
   *   defaultTargetUrl?: string | null,
   *   partnerRepository?: import('../../storage/repositories/PartnerRepository').PartnerRepository,
   *   sseManager?: import('./SseManager').SseManager,
   *   fetchImpl?: typeof fetch,
   *   timeoutMs?: number,
   *   maxRetries?: number,
   *   retryDelayMs?: number,
   *   nodeEnv?: string
   * }} [options]
   */
  constructor(options = {}) {
    this.nodeEnv = options.nodeEnv || process.env.NODE_ENV || 'development';
    const configuredSecret =
      options.signingSecret ?? process.env.WEBHOOK_SIGNING_SECRET;
    if (this.nodeEnv === 'production' && !configuredSecret) {
      throw new Error('WEBHOOK_SIGNING_SECRET is strictly required in production');
    }
    this.signingSecret =
      configuredSecret || crypto.randomBytes(32).toString('hex');
    this.defaultTargetUrl =
      options.defaultTargetUrl ?? process.env.WEBHOOK_TARGET_URL ?? null;
    this.partnerRepository = options.partnerRepository || null;
    this.sseManager = options.sseManager || null;
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.timeoutMs = Number.isFinite(options.timeoutMs)
      ? Number(options.timeoutMs)
      : 5000;
    this.maxRetries = Number.isInteger(options.maxRetries)
      ? options.maxRetries
      : 2;
    this.retryDelayMs = Number.isFinite(options.retryDelayMs)
      ? Number(options.retryDelayMs)
      : 250;

    /** @type {Set<NodeJS.Timeout>} */
    this._timers = new Set();
    this._closed = false;
  }

  /**
   * Computes `sha256=<hmac_hex>` signature over raw JSON body.
   * @param {string} rawBody
   * @param {string} [secret]
   * @returns {string}
   */
  signBody(rawBody, secret = this.signingSecret) {
    const hex = crypto
      .createHmac('sha256', String(secret))
      .update(String(rawBody), 'utf8')
      .digest('hex');
    return `sha256=${hex}`;
  }

  /**
   * Resolves target webhook URL for a partner (partner_integrations -> global WEBHOOK_TARGET_URL).
   * @param {string | null} partnerId
   * @param {{ forceTest?: boolean }} [options]
   * @returns {{ enabled: boolean, targetUrl: string | null }}
   */
  resolveTarget(partnerId, options = {}) {
    let partnerEnabled = true;
    let partnerUrl = null;

    if (partnerId && this.partnerRepository) {
      const partner = this.partnerRepository.findById(partnerId);
      if (partner && partner.feature_flags) {
        partnerEnabled = partner.feature_flags.webhooks === true;
      }
      const integration = this.partnerRepository.getIntegration(
        partnerId,
        'webhook'
      );
      if (integration && integration.credentials?.targetUrl) {
        partnerUrl = String(integration.credentials.targetUrl);
      }
    }

    const targetUrl = partnerUrl || this.defaultTargetUrl;
    const enabled = options.forceTest ? Boolean(targetUrl) : Boolean(partnerEnabled && targetUrl);
    return { enabled, targetUrl };
  }

  /**
   * Emits an event to SSE subscribers and dispatches an HMAC-signed HTTP POST webhook if enabled.
   * @param {{ eventType: string, partnerId?: string | null, payload: Record<string, unknown>, forceTest?: boolean, targetUrl?: string }} event
   */
  async dispatch(event) {
    const envelope = {
      eventId: event.eventId || `evt_${crypto.randomUUID()}`,
      eventType: event.eventType,
      partnerId: event.partnerId ?? null,
      timestamp: event.timestamp || new Date().toISOString(),
      payload: event.payload || {},
    };

    if (this.sseManager) {
      this.sseManager.broadcast(envelope);
    }

    const resolved = event.targetUrl
      ? { enabled: true, targetUrl: event.targetUrl }
      : this.resolveTarget(envelope.partnerId, { forceTest: event.forceTest });

    if (!resolved.enabled || !resolved.targetUrl || typeof this.fetchImpl !== 'function') {
      return { ok: true, delivered: false, skipped: true, envelope };
    }

    const rawBody = JSON.stringify(envelope);
    const signature = this.signBody(rawBody);

    let lastError = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      if (this._closed) break;
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort(new Error('WEBHOOK_TIMEOUT'));
      }, this.timeoutMs);
      if (typeof timer.unref === 'function') timer.unref();

      try {
        const res = await this.fetchImpl(resolved.targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Autonmax-Signature': signature,
            'X-Autonmax-Event': envelope.eventType,
          },
          body: rawBody,
          signal: controller.signal,
        });
        if (res.ok) {
          return {
            ok: true,
            delivered: true,
            statusCode: res.status,
            attempts: attempt + 1,
            signature,
            envelope,
          };
        }
        lastError = `HTTP_${res.status}`;
      } catch (err) {
        lastError = err?.message || 'WEBHOOK_FAILED';
      } finally {
        clearTimeout(timer);
      }

      if (attempt < this.maxRetries && !this._closed && this.retryDelayMs > 0) {
        await new Promise((resolve) => {
          const t = setTimeout(() => {
            this._timers.delete(t);
            resolve();
          }, this.retryDelayMs);
          if (typeof t.unref === 'function') t.unref();
          this._timers.add(t);
        });
      }
    }

    return {
      ok: false,
      delivered: false,
      error: lastError,
      signature,
      envelope,
    };
  }

  /**
   * Cancels any pending retry delays for clean shutdown.
   */
  close() {
    this._closed = true;
    for (const t of this._timers) {
      clearTimeout(t);
    }
    this._timers.clear();
  }
}

module.exports = { WebhookDispatcher };
