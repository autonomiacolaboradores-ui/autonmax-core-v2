'use strict';

/**
 * Registers SSE stream (`/api/v1/events/stream`) and partner Webhook config/test routes.
 * @param {{
 *   sseManager: import('../events/SseManager').SseManager,
 *   webhookDispatcher: import('../events/WebhookDispatcher').WebhookDispatcher,
 *   partnerRepository: import('../../storage/repositories/PartnerRepository').PartnerRepository
 * }} deps
 */
function createWebhookRoutes(deps) {
  const { sseManager, webhookDispatcher, partnerRepository } = deps;

  return [
    {
      method: 'GET',
      path: '/api/v1/events/stream',
      handler: async ({ req, res, auth, query }) => {
        const requestedPartnerId = query.get('partnerId');
        const partnerId =
          auth.type === 'bearer' ? auth.partnerId : requestedPartnerId || null;
        sseManager.subscribe(req, res, { partnerId });
      },
    },
    {
      method: 'GET',
      path: '/api/v1/partners/:partnerId/webhooks',
      handler: async ({ params, sendOk }) => {
        const integration = partnerRepository.getIntegration(
          params.partnerId,
          'webhook'
        );
        return sendOk({
          configured: Boolean(integration?.credentials?.targetUrl),
          targetUrl: integration?.credentials?.targetUrl || null,
          events: integration?.credentials?.events || ['*'],
        });
      },
    },
    {
      method: 'PUT',
      path: '/api/v1/partners/:partnerId/webhooks',
      handler: async ({ params, body, sendOk, sendError }) => {
        const targetUrl = String(body.targetUrl || '').trim();
        if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
          return sendError(
            400,
            'VALIDATION_ERROR',
            'targetUrl HTTP/HTTPS válido é obrigatório.'
          );
        }

        const saved = partnerRepository.upsertIntegration({
          partnerId: params.partnerId,
          provider: 'webhook',
          credentials: {
            targetUrl,
            events: Array.isArray(body.events) ? body.events : ['*'],
          },
        });
        return sendOk(saved.credentials);
      },
    },
    {
      method: 'POST',
      path: '/api/v1/partners/:partnerId/webhooks/test',
      handler: async ({ params, body, sendOk }) => {
        const dispatchRes = await webhookDispatcher.dispatch({
          eventType: body.eventType || 'system.webhook_test',
          partnerId: params.partnerId,
          payload: body.payload || { ok: true, source: 'gateway_test' },
          targetUrl: body.targetUrl || undefined,
          forceTest: true,
        });
        return sendOk(dispatchRes);
      },
    },
  ];
}

module.exports = { createWebhookRoutes };
