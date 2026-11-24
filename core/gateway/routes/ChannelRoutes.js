'use strict';

const { parseSessionKey } = require('../../messaging/SessionManager');

/**
 * Registers Channel & WhatsApp Session routes (`/api/v1/channels/sessions*`).
 * @param {{
 *   sessionManager: import('../../messaging/SessionManager').SessionManager,
 *   authMiddleware: import('../middlewares/AuthMiddleware').AuthMiddleware
 * }} deps
 */
function createChannelRoutes(deps) {
  const { sessionManager, authMiddleware } = deps;

  function authorizeSessionKey(auth, rawSessionKey, sendError) {
    const parsed = parseSessionKey(decodeURIComponent(rawSessionKey));
    if (!authMiddleware.canAccessPartner(auth, parsed.partnerId)) {
      sendError(403, 'FORBIDDEN', 'Acesso negado a esta sessão.');
      return null;
    }
    return parsed;
  }

  return [
    {
      method: 'GET',
      path: '/api/v1/channels/sessions',
      handler: async ({ auth, sendOk }) => {
        let sessions = await sessionManager.listSessionsWithStatus();
        if (auth.type === 'bearer') {
          sessions = sessions.filter((s) => s.partnerId === auth.partnerId);
        }
        return sendOk(sessions);
      },
    },
    {
      method: 'POST',
      path: '/api/v1/channels/sessions',
      handler: async ({ auth, body, sendOk, sendError }) => {
        const partnerId = body.partnerId || auth.partnerId;
        const lineId = body.lineId || 'default';
        if (!partnerId) {
          return sendError(400, 'VALIDATION_ERROR', 'partnerId é obrigatório.');
        }
        if (!authMiddleware.canAccessPartner(auth, partnerId)) {
          return sendError(403, 'FORBIDDEN', 'Acesso negado para este parceiro.');
        }

        const entry = await sessionManager.connectSession(partnerId, lineId);
        const status = await sessionManager.channelAdapter.getStatus(entry.sessionKey);
        return sendOk({ ...entry, status }, 201);
      },
    },
    {
      method: 'GET',
      path: '/api/v1/channels/sessions/:sessionKey/qr',
      handler: async ({ auth, params, sendOk, sendError }) => {
        const parsed = authorizeSessionKey(auth, params.sessionKey, sendError);
        if (!parsed) return;

        const qr = await sessionManager.channelAdapter.getQr(parsed.canonicalKey);
        const status = await sessionManager.channelAdapter.getStatus(parsed.canonicalKey);
        return sendOk({
          sessionKey: parsed.canonicalKey,
          status,
          qrCodeBase64: qr?.qrBase64 || null,
          rawText: qr?.rawText || null,
        });
      },
    },
    {
      method: 'POST',
      path: '/api/v1/channels/sessions/:sessionKey/disconnect',
      handler: async ({ auth, params, body, sendOk, sendError }) => {
        const parsed = authorizeSessionKey(auth, params.sessionKey, sendError);
        if (!parsed) return;

        await sessionManager.disconnectSession(parsed.canonicalKey, {
          wipeAuth: body.wipeAuth === true,
        });
        const status = await sessionManager.channelAdapter.getStatus(parsed.canonicalKey);
        return sendOk({ sessionKey: parsed.canonicalKey, status });
      },
    },
    {
      method: 'POST',
      path: '/api/v1/channels/sessions/:sessionKey/send',
      handler: async ({ auth, params, body, sendOk, sendError }) => {
        const parsed = authorizeSessionKey(auth, params.sessionKey, sendError);
        if (!parsed) return;

        const recipientId = String(body.recipientId || '').trim();
        if (!recipientId || (!body.text && !body.mediaUrl)) {
          return sendError(
            400,
            'VALIDATION_ERROR',
            'recipientId e text/mediaUrl são obrigatórios.'
          );
        }

        const outbox = sessionManager.outboxWorker.enqueueDirect({
          sessionKey: parsed.canonicalKey,
          channel: body.channel || 'whatsapp',
          recipientId,
          payload: {
            type: body.type || 'text',
            text: body.text || '',
            mediaUrl: body.mediaUrl,
          },
        });
        return sendOk(outbox, 201);
      },
    },
  ];
}

module.exports = { createChannelRoutes };
