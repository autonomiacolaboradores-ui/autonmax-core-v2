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

        const adapter = sessionManager.channelAdapter;
        const candidateKey =
          lineId === 'default' ? `pme:${partnerId}` : `pme:${partnerId}:${lineId}`;
        const currentStatus = await adapter.getStatus(candidateKey);
        const entry =
          currentStatus === 'CONNECTED'
            ? sessionManager.createOrGetSession(partnerId, lineId)
            : await sessionManager.connectSession(partnerId, lineId);

        const status = await adapter.getStatus(entry.sessionKey);
        const qr = await adapter.getQr(entry.sessionKey);
        const diag =
          typeof adapter.getSessionDiagnostics === 'function'
            ? adapter.getSessionDiagnostics(entry.sessionKey)
            : null;

        return sendOk(
          {
            ...entry,
            status: diag?.status || status,
            qrCodeBase64: qr?.qrBase64 || null,
            rawText: qr?.rawText || null,
            phoneNumber: diag?.phoneNumber || null,
            lastEventTime: diag?.lastEventTime || null,
          },
          201
        );
      },
    },
    {
      method: 'GET',
      path: '/api/v1/channels/sessions/:sessionKey/qr',
      handler: async ({ auth, params, query, sendOk, sendError }) => {
        const parsed = authorizeSessionKey(auth, params.sessionKey, sendError);
        if (!parsed) return;

        const getQueryParam = (name) => {
          if (!query) return undefined;
          if (typeof query.get === 'function') return query.get(name);
          return query[name];
        };

        const force = String(getQueryParam('force') || '').toLowerCase() === 'true';
        const wait = String(getQueryParam('wait') || '').toLowerCase() === 'true';
        const rawTimeout = Number(getQueryParam('timeoutMs'));
        const timeoutMs =
          Number.isFinite(rawTimeout) && rawTimeout > 0
            ? Math.min(rawTimeout, 30000)
            : 8000;

        const adapter = sessionManager.channelAdapter;
        if (force) {
          if (typeof adapter.forceResetPairing === 'function') {
            await adapter.forceResetPairing(parsed.canonicalKey);
          } else if (typeof adapter.forceReconnect === 'function') {
            await adapter.forceReconnect(parsed.canonicalKey);
          }
        }

        if (wait && typeof adapter.waitForQr === 'function') {
          await adapter.waitForQr(parsed.canonicalKey, { timeoutMs });
        }

        const qr = await adapter.getQr(parsed.canonicalKey);
        const status = await adapter.getStatus(parsed.canonicalKey);
        const diag =
          typeof adapter.getSessionDiagnostics === 'function'
            ? adapter.getSessionDiagnostics(parsed.canonicalKey)
            : null;

        return sendOk({
          sessionKey: parsed.canonicalKey,
          status: diag?.status || status,
          qrCodeBase64: qr?.qrBase64 || null,
          rawText: qr?.rawText || null,
          phoneNumber: diag?.phoneNumber || null,
          lastEventTime: diag?.lastEventTime || null,
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
