'use strict';

const { ensureFeatureEnabled } = require('./FeatureRoutes');

/**
 * Registers Conversation, History, Soft-Pause, and Operator Intervention routes.
 * @param {{
 *   conversationRepository: import('../../storage/repositories/ConversationRepository').ConversationRepository,
 *   partnerRepository: import('../../storage/repositories/PartnerRepository').PartnerRepository,
 *   pauseController: import('../../messaging/PauseController').PauseController,
 *   sessionManager: import('../../messaging/SessionManager').SessionManager,
 *   webhookDispatcher?: import('../events/WebhookDispatcher').WebhookDispatcher
 * }} deps
 */
function createConversationRoutes(deps) {
  const {
    conversationRepository,
    partnerRepository,
    pauseController,
    sessionManager,
    webhookDispatcher,
  } = deps;

  return [
    {
      method: 'GET',
      path: '/api/v1/partners/:partnerId/conversations',
      handler: async ({ params, query, sendOk }) => {
        const limit = query.get('limit') ? Number(query.get('limit')) : 100;
        const offset = query.get('offset') ? Number(query.get('offset')) : 0;
        const list = conversationRepository.listByPartner(params.partnerId, {
          limit,
          offset,
        });
        return sendOk(list);
      },
    },
    {
      method: 'GET',
      path: '/api/v1/partners/:partnerId/conversations/:conversationId/messages',
      handler: async ({ params, query, sendOk, sendError }) => {
        const conv = conversationRepository.findById(params.conversationId, {
          partnerId: params.partnerId,
        });
        if (!conv) {
          return sendError(
            404,
            'CONVERSATION_NOT_FOUND',
            'Conversa não encontrada.'
          );
        }

        const limit = query.get('limit') ? Number(query.get('limit')) : 50;
        const offset = query.get('offset') ? Number(query.get('offset')) : 0;
        const messages = conversationRepository.listMessages(conv.id, {
          partnerId: params.partnerId,
          limit,
          offset,
        });
        return sendOk(messages);
      },
    },
    {
      method: 'POST',
      path: '/api/v1/partners/:partnerId/conversations/:conversationId/pause',
      handler: async ({ params, body, sendOk, sendError }) => {
        if (!ensureFeatureEnabled(partnerRepository, params.partnerId, 'softPause', sendError)) {
          return;
        }
        const existing = conversationRepository.findById(params.conversationId, {
          partnerId: params.partnerId,
        });
        if (!existing) {
          return sendError(
            404,
            'CONVERSATION_NOT_FOUND',
            'Conversa não encontrada.'
          );
        }

        const paused = Boolean(body.paused);
        const updated = paused
          ? pauseController.pause({
              partnerId: params.partnerId,
              conversationId: existing.id,
              humanRequested: true,
            })
          : pauseController.resume({
              partnerId: params.partnerId,
              conversationId: existing.id,
              clearContext: body.clearContext === true,
            });

        if (webhookDispatcher) {
          await webhookDispatcher.dispatch({
            eventType: 'conversation.pause_changed',
            partnerId: params.partnerId,
            payload: {
              conversationId: updated.id,
              paused,
              actor: 'operator',
            },
          });
        }

        return sendOk(updated);
      },
    },
    {
      method: 'POST',
      path: '/api/v1/partners/:partnerId/conversations/:conversationId/operator-message',
      handler: async ({ params, body, sendOk, sendError }) => {
        const text = String(body.text || '').trim();
        if (!text) {
          return sendError(400, 'VALIDATION_ERROR', 'text é obrigatório.');
        }

        const conv = conversationRepository.findById(params.conversationId, {
          partnerId: params.partnerId,
        });
        if (!conv) {
          return sendError(
            404,
            'CONVERSATION_NOT_FOUND',
            'Conversa não encontrada.'
          );
        }

        const msg = conversationRepository.addMessage({
          conversationId: conv.id,
          partnerId: params.partnerId,
          direction: 'OUTBOUND',
          role: 'operator',
          content: text,
        });

        if (Number(conv.is_paused) === 1) {
          pauseController.recordPausedMessage({
            partnerId: params.partnerId,
            conversationId: conv.id,
            role: 'operator',
            text,
          });
        }

        const partnerSessions = sessionManager.listPartnerSessions(params.partnerId);
        const sessionKey =
          body.sessionKey ||
          partnerSessions[0]?.sessionKey ||
          `pme:${params.partnerId}`;

        const outbox = sessionManager.outboxWorker.enqueueDirect({
          sessionKey,
          channel: conv.channel,
          recipientId: conv.external_chat_id,
          payload: { type: 'text', text },
        });

        return sendOk({ message: msg, outbox }, 201);
      },
    },
  ];
}

module.exports = { createConversationRoutes };
