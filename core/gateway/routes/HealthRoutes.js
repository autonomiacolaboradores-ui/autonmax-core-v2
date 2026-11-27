'use strict';

/**
 * Registers health liveness (`/health`), infrastructure readiness (`/api/v1/readiness`),
 * and live AI diagnostic route (`POST /api/v1/ai/test`).
 * @param {{
 *   dbManager: import('../../storage/DatabaseManager').DatabaseManager,
 *   promptPin?: import('../../ai/PromptPin').PromptPin,
 *   queueRepository?: import('../../storage/repositories/QueueRepository').QueueRepository,
 *   llmRouter?: import('../../ai/LlmRouter').LlmRouter,
 *   agentEngine?: import('../../ai/AgentEngine').AgentEngine
 * }} deps
 */
function createHealthRoutes(deps) {
  return [
    {
      method: 'GET',
      path: '/health',
      exempt: true,
      handler: async ({ res }) => {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, status: 'healthy' }));
      },
    },
    {
      method: 'GET',
      path: '/api/v1/readiness',
      handler: async ({ sendOk }) => {
        const startNs = process.hrtime.bigint();
        let dbStatus = 'DOWN';
        try {
          if (deps.dbManager && deps.dbManager.isOpen()) {
            deps.dbManager.getAppliedMigrations();
            dbStatus = 'UP';
          }
        } catch {
          dbStatus = 'DOWN';
        }
        const latencyMs = Number(
          (Number(process.hrtime.bigint() - startNs) / 1e6).toFixed(2)
        );

        let promptPinCheck = { status: 'UNVERIFIED', sha256: null };
        if (deps.promptPin) {
          try {
            const res = deps.promptPin.verifyAtBoot({ strict: false });
            promptPinCheck = {
              status: res.ok ? 'MATCH' : 'MISMATCH',
              sha256: res.sha256,
            };
          } catch {
            promptPinCheck = { status: 'ERROR', sha256: null };
          }
        }

        const pendingMessages = deps.queueRepository
          ? deps.queueRepository.countPendingOutbox()
          : 0;

        const cbRaw = deps.llmRouter?.circuitBreaker || {};
        const circuitBreakers = {};
        for (const provider of ['groq', 'xai', 'openai', 'gemini', 'openrouter']) {
          circuitBreakers[provider] = cbRaw[provider]?.status || 'CLOSED';
        }
        const llmDiagnostics =
          deps.llmRouter && typeof deps.llmRouter.getDiagnostics === 'function'
            ? deps.llmRouter.getDiagnostics()
            : null;

        const ready =
          dbStatus === 'UP' && promptPinCheck.status !== 'MISMATCH';

        return sendOk(
          {
            status: ready ? 'READY' : 'DEGRADED',
            checks: {
              database: { status: dbStatus, driver: 'node:sqlite', latencyMs },
              promptPin: promptPinCheck,
              outboxQueue: { status: 'HEALTHY', pendingMessages },
              circuitBreakers,
              llm: llmDiagnostics,
            },
          },
          ready ? 200 : 503
        );
      },
    },
    {
      method: 'POST',
      path: '/api/v1/ai/test',
      handler: async ({ auth, body, sendOk, sendError }) => {
        if (!deps.llmRouter) {
          return sendError(503, 'LLM_ROUTER_UNAVAILABLE', 'LlmRouter não inicializado.');
        }

        const userMessage = String(
          body?.message || 'Responda em português em 1 frase curta confirmando que está online.'
        ).trim();
        const partnerId =
          auth?.type === 'bearer'
            ? auth.partnerId
            : body?.partnerId || auth?.partnerId || null;

        if (body?.mode === 'agent' && deps.agentEngine && partnerId) {
          const ctx = deps.agentEngine.buildContext({
            partnerId,
            conversationId: body?.conversationId || 'ai-test',
            currentUserMessage: userMessage,
            historyLimit: 5,
          });
          const res = await deps.llmRouter.generate({
            systemPrompt: ctx.systemPrompt,
            history: ctx.historyMessages,
            userMessage,
          });
          return sendOk({
            ok: res.ok,
            status: res.status,
            providerUsed: res.providerUsed,
            model: res.model,
            text: res.text,
            errors: res.errors || [],
          });
        }

        const res = await deps.llmRouter.generate({
          systemPrompt: 'Você é o assistente AUTONMAX vNext. Responda de forma objetiva em português.',
          userMessage,
        });
        return sendOk({
          ok: res.ok,
          status: res.status,
          providerUsed: res.providerUsed,
          model: res.model,
          text: res.text,
          errors: res.errors || [],
        });
      },
    },
  ];
}

module.exports = { createHealthRoutes };
