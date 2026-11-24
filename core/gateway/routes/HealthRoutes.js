'use strict';

/**
 * Registers health liveness (`/health`) and infrastructure readiness (`/api/v1/readiness`).
 * @param {{
 *   dbManager: import('../../storage/DatabaseManager').DatabaseManager,
 *   promptPin?: import('../../ai/PromptPin').PromptPin,
 *   queueRepository?: import('../../storage/repositories/QueueRepository').QueueRepository,
 *   llmRouter?: import('../../ai/LlmRouter').LlmRouter
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
            },
          },
          ready ? 200 : 503
        );
      },
    },
  ];
}

module.exports = { createHealthRoutes };
