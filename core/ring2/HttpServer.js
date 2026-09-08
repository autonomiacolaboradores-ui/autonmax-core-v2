'use strict';

// core/ring2/HttpServer.js
const http = require('http');
const path = require('path');
const fs = require('fs');

const HttpTelemetryMiddleware = require('./HttpTelemetryMiddleware');

const DocumentExtractor = require('./DocumentExtractor');
const WebSearchEngine = require('./WebSearchEngine');
const GeminiToolsDispatcher = require('./GeminiToolsDispatcher');
const WhatsAppDriver = require('./WhatsAppDriver');
const WhatsAppSessionManager = require('./WhatsAppSessionManager');
const WhatsAppWatchdog = require('./WhatsAppWatchdog');
const { ToolsRegistry } = require('./ToolsRegistry');
const PromptPinMod = require('../ring0/PromptPin');
const { getMetricsLog } = require('../ring1/MetricsEventLog');
const { DailyReportJob } = require('../ring1/DailyReportJob');
const { AttendantConversationBrain } = require('../ring1/AttendantConversationBrain');
const { getResilienceLayer } = require('../ring0/ResilienceLayer');
const { MaxAgentRuntime } = require('../ring1/MaxAgentRuntime');
const { getRuntimeExcellence } = require('../ring1/MaxRuntimeExcellence');
const AutoHealingSupervisor = require('../ring0/AutoHealingSupervisor');
const AudioHandler = require('./AudioHandler');
const { PmeAgentConfigurator } = require('../ring1/PmeAgentConfigurator');
const PdfGeneratorEngine = require('../ring1/PdfGeneratorEngine');
const { RuntimeCore } = require('../ring0/RuntimeCore');
const { PartnerAuthManager } = require('../ring1/PartnerAuthManager');
const { AppointmentListPdf } = require('./AppointmentListPdf');
const MultiProviderLlmRouter = require('../ring1/MultiProviderLlmRouter');
const { getSystemPrompt } = require('../ring1/SystemPrompt');

class HttpServer {
  constructor(options = {}) {
    // 1. CARREGAR .ENV ANTES DE QUALQUER INSTANCIAÇÃO
    const envPath = path.join(__dirname, '../../.env');
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split('\n');
      for (const line of lines) {
        const [k, ...v] = line.split('=');
        if (k && v) {
          process.env[k.trim()] = v.join('=').replace(/["'\s]/g, '').trim();
        }
      }
    }

    this.port = options.port !== undefined ? options.port : (process.env.PORT || 3000);
    this.host = options.host || '0.0.0.0';
    this.publicDir = path.join(__dirname, '../../public');
    this.reportsDir = path.join(__dirname, '../../workspace/reports');
    
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }

    this.runtime = options.runtime || new RuntimeCore();
    this.ledger = null; // financeiro expurgado (TokenLedger removido)
    this.authManager = options.authManager || new PartnerAuthManager(this.runtime);

    // OPS-1/OPS-2: multi-sessão WA — PME e Pessoal com authDir isolados
    this.waSessions = new WhatsAppSessionManager();
    this.waWatchdog = new WhatsAppWatchdog(this.waSessions);
    this.toolsRegistry = new ToolsRegistry();
    this.metricsLog = getMetricsLog();
    this.conversationBrain = new AttendantConversationBrain({ metrics: this.metricsLog });
    this.resilience = getResilienceLayer();
    
    this.resilience.installProcessHandlers(this.runtime);
    this.resilience.startPeriodicBackup(5 * 60 * 1000);
    try { this.resilience.shadowAttendantsDb(); } catch (_) {}
    this.dailyReportJob = new DailyReportJob({ metrics: this.metricsLog });
    this.whatsAppDriver = this.waSessions.getPmeDefault(); // compat UI + fluxos existentes
    this.pmeConfigurator = new PmeAgentConfigurator();
    this.agentRuntime = new MaxAgentRuntime({ pmeConfigurator: this.pmeConfigurator, authManager: this.authManager });
    
    // R1.8 E2E Booking: Wire singletons
    const PmeBookingTools = require('./PmeBookingTools');
    if (typeof PmeBookingTools.setRuntime === 'function') PmeBookingTools.setRuntime(this.runtime);
    if (typeof PmeBookingTools.setConfigurator === 'function') PmeBookingTools.setConfigurator(this.pmeConfigurator);

    this.runtimeExcellence = getRuntimeExcellence();
    this.pdfEngine = new PdfGeneratorEngine();
    this.llmRouter = new MultiProviderLlmRouter();

    // 👑 MAX AUTOHEALING SUPERVISOR — Ring2 = Watchdog multi-sessão (OPS-5)
    this.supervisor = new AutoHealingSupervisor();
    this.supervisor.registerRing(0, this.runtime);
    this.supervisor.registerRing(1, this.llmRouter);
    this.supervisor.registerRing(2, this.waWatchdog);
    this.supervisor.start();
    try {
      this.waWatchdog.start();
      this.dailyReportJob.startScheduler();
    } catch (e) {
      console.warn('[HTTP_SERVER] watchdog/daily schedule:', e.message);
    }

    // 🌉 SPRINT 3: EVENT BUS & SURFACE BRIDGE (Pub/Sub)
    const { SurfaceBridge } = require('../ring0/SurfaceBridge');
    this.surfaceBridge = new SurfaceBridge(this.whatsAppDriver, this);
    this.surfaceBridge.boot();

    // LISTENER DE MUDANÇA DE ESTADO (Guardião de Estado - WhatsApp Voice/Text)
    const onStateToggle = (isActive, driverContext) => {
      const driver = driverContext || this.whatsAppDriver;
      const partnerId = driver.connectedPartnerId || this.pmeConfigurator.getLatestActivePartnerId();
      this.pmeConfigurator.updateAttendantConfig(partnerId, { isActive });
      console.log(`[HTTP_SERVER] Sincronizando estado via WhatsAppGuard: ${isActive ? 'ATIVO' : 'PAUSADO'}`);
    };

    // RESPOSTA AUTÔNOMA DE IA NO WHATSAPP COM LLM (GROQ LLAMA 3.3 / OPENAI)
    const onMessageReceived = async (userMessage, remoteJid, rawMsg, isOwner = false, driverContext = null) => {
      try {
        const { globalEventBus } = require('../ring1/EventBus');
        globalEventBus.emitAsync('attendant:message_received', { text: userMessage, remoteJid, rawMsg, isOwner });
        
        const driver = driverContext || this.whatsAppDriver;
        const partnerId = driver.connectedPartnerId || this.pmeConfigurator.getLatestActivePartnerId();
        const config = this.pmeConfigurator.getAttendantConfig(partnerId);

        if (isOwner) {
          // 🛡️ GUARDIÃO DE ESTADO E CONFIGURAÇÃO (Apenas para o Dono)
          const adminPrompt = `Você é o Guardião de Estado e Assistente de Configuração do painel PME.
O dono do estabelecimento enviou a seguinte mensagem a partir do seu próprio celular (ou WhatsApp Web): "${userMessage}".

Configuração atual:
${JSON.stringify(config)}

Sua tarefa é identificar se o dono está dando um COMANDO DE CONFIGURAÇÃO/ESTADO, ou se está apenas conversando com um cliente (já que ele pode usar o celular dele para falar com clientes).
Exemplos de comandos: pausar/retomar bot, mudar horário de funcionamento, adicionar serviço, alterar mensagem de boas vindas, etc.

Regras de Resposta:
1. Se a mensagem NÃO for um comando (ex: o dono está respondendo dúvidas de um cliente, ou não está claro que é um comando), retorne EXATAMENTE este JSON:
{"isCommand": false}

2. Se a mensagem FOR um comando, retorne um JSON com os campos a serem atualizados (apenas os que mudaram) e uma mensagem de confirmação amigável. Para pausar/retomar, use "isActive": false/true.
{"isCommand": true, "updates": { "isActive": false }, "reply": "⏸️ Atendimento pausado com sucesso!"}

Responda APENAS com o JSON válido, sem markdown e sem blocos \`\`\`.`;

          const routerRes = await this.llmRouter.generateResponse({
            systemPrompt: adminPrompt,
            userMessage: userMessage
          });

          try {
            const match = routerRes.text.match(/\{[\s\S]*\}/);
            if (match) {
              const parsed = JSON.parse(match[0]);
              if (parsed.isCommand) {
                if (parsed.updates && Object.keys(parsed.updates).length > 0) {
                  this.pmeConfigurator.updateAttendantConfig(partnerId, parsed.updates);
                  console.log(`[WHATSAPP_ADMIN] Configuração atualizada via voz/texto pelo dono.`);
                }
                return parsed.reply || "✅ Configurações atualizadas!";
              }
            }
          } catch (e) {
            console.warn('[WHATSAPP_ADMIN] Falha no parse do comando do dono', e.message);
          }
          // Se não for comando (isCommand: false), não retorna nada (o bot não responde nada)
          return null;
        }

        // Soft-pause: IA não responde, Baileys fica online, contexto da conversa é preservado
        const driverPaused =
          (driverContext && typeof driverContext.isSessionPaused === 'function' && driverContext.isSessionPaused(remoteJid)) ||
          (this.whatsAppDriver && this.whatsAppDriver.isSessionPaused(remoteJid));
        const configPaused = config && config.isActive === false;
        const globalPaused = typeof global.IS_MAX_ACTIVE === 'boolean' && global.IS_MAX_ACTIVE === false;
        if (configPaused || driverPaused || globalPaused) {
          try {
            const drv = driverContext || this.whatsAppDriver;
            if (drv && typeof drv.bufferPausedMessage === 'function') {
              drv.bufferPausedMessage(remoteJid, text || '', 'customer');
            }
          } catch (_) {}
          console.log(`[WHATSAPP_GUARD] ⏸️ Bot PAUSADO para ${remoteJid}. Contexto guardado (socket Baileys 100% ativo).`);
          try {
            this.metricsLog.record({ type: 'paused', partnerId, meta: { remoteJid } });
          } catch (_) {}
          return null;
        }

        // Anti-flood
        if (this.conversationBrain && !this.conversationBrain.allowMessage(remoteJid)) {
          console.log(`[WHATSAPP_GUARD] flood throttle ${remoteJid}`);
          return null;
        }

        // R1.4 rate limit por partner|jid
        try {
          const excel = this.runtimeExcellence || getRuntimeExcellence();
          const admit = excel.admit(partnerId, remoteJid);
          if (!admit.ok) {
            return 'Recebi várias mensagens seguidas. Aguarde um instante e envie de novo, por favor.';
          }
        } catch (_) {}

        // Métricas reais + memória de conversa
        if (this.conversationBrain) {
          this.conversationBrain.trackInbound(partnerId, remoteJid, userMessage);
        }

        // R1.7: Offline-first survival — aviso pré-programado sem chamar LLM
        try {
          if (driverContext
              && typeof driverContext.isEdgeOffline === 'function'
              && driverContext.isEdgeOffline()) {
            const notice = driverContext.handleOfflineInbound(partnerId, remoteJid, userMessage);
            if (notice) {
              console.log('[OFFLINE_SURVIVAL]', remoteJid);
              return notice;
            }
          }
        } catch (offlineErr) {
          console.warn('[OFFLINE_SURVIVAL]', offlineErr.message);
        }

        // ROTEAMENTO PME
        let systemPrompt = null;

        try {
          systemPrompt = this.pmeConfigurator.compileMaxAttendantPrompt(partnerId);
        } catch (e) {
          console.warn('[WHATSAPP] compileMaxAttendantPrompt falhou:', e.message);
        }

        if (!systemPrompt || String(systemPrompt).trim().length < 20) {
          try {
            systemPrompt = this.pmeConfigurator.compileMaxAttendantPrompt(partnerId || 'usr_google_demo_100');
          } catch (_) {}
        }

        // Prompt canary (tópico 9)
        try {
          const excel = this.runtimeExcellence || getRuntimeExcellence();
          const canary = excel.canary.check(partnerId, systemPrompt);
          if (!canary.match) console.warn('[CANARY] prompt hash mismatch', canary);
        } catch (_) {}

        // Grounding + histórico curto (anti-alucinação de preço)
        let enrichedUser = String(userMessage || '');
        if (this.conversationBrain) {
          const hist = this.conversationBrain.historyBlock(partnerId, remoteJid);
          const ground = this.conversationBrain.buildGrounding(config, userMessage);
          if (hist) enrichedUser = `[Histórico recente]\n${hist}\n\n[Mensagem atual]\n${userMessage}`;
          if (ground) enrichedUser += ground;
        }
        // Contexto capturado enquanto a IA estava pausada (operador humano)
        try {
          const drv = driverContext || this.whatsAppDriver;
          let pauseFact = null;
          if (drv && typeof drv.takePendingPauseContext === 'function') {
            pauseFact = drv.takePendingPauseContext(remoteJid);
          }
          if (!pauseFact && drv && typeof drv.formatPausedContextFact === 'function') {
            pauseFact = drv.formatPausedContextFact(remoteJid);
            if (pauseFact && typeof drv.consumePausedContext === 'function') {
              drv.consumePausedContext(remoteJid, { clear: true });
            }
          }
          if (pauseFact) {
            enrichedUser =
              `[${pauseFact}]\n\n` +
              enrichedUser +
              '\n\n[INSTRUÇÃO] O atendimento acabou de ser retomado. Continue a conversa com base no contexto acima; não peça de novo o que o cliente já disse.';
          }
        } catch (_) {}

        // SUPERPODERES: multi-intent + tools determinísticas → facts para o LLM
        let agentFacts = '';
        try {
          if (this.agentRuntime) {
            let googleAccessToken = null;
            let tokenSource = 'none';
            let tokenReason = 'NOT_CONNECTED';
            if (process.env.DISABLE_GOOGLE_AUTH === 'true') {
              googleAccessToken = null;
              tokenSource = 'none';
              tokenReason = 'GOOGLE_AUTH_DISABLED';
            } else try {
              if (this.authManager && partnerId) {
                const withTimeout = (promise, ms) =>
                  Promise.race([
                    promise,
                    new Promise((resolve) => setTimeout(() => resolve({ isTimeout: true }), ms))
                  ]);
                
                if (typeof this.authManager.resolvePartnerGoogleToken === 'function') {
                  const res = await withTimeout(
                    this.authManager.resolvePartnerGoogleToken(partnerId),
                    5000
                  );
                  if (res && res.isTimeout) {
                    tokenSource = 'none';
                    tokenReason = 'TIMEOUT';
                  } else if (res) {
                    googleAccessToken = res.token || null;
                    tokenSource = res.source || 'none';
                    tokenReason = res.reason || (googleAccessToken ? 'VALID' : 'NOT_CONNECTED');
                  }
                } else if (typeof this.authManager.ensureValidGoogleAccessToken === 'function') {
                  const res = await withTimeout(
                    this.authManager.ensureValidGoogleAccessToken(partnerId),
                    5000
                  );
                  if (res && !res.isTimeout) {
                    googleAccessToken = res;
                    tokenSource = 'store';
                    tokenReason = 'VALID';
                  } else if (res && res.isTimeout) {
                    googleAccessToken = null;
                    tokenSource = 'none';
                    tokenReason = 'TIMEOUT';
                  } else {
                    tokenSource = 'none';
                    tokenReason = 'NOT_CONNECTED';
                  }
                }
              }
            } catch (authErr) {
              console.warn(`[CALENDAR] resolvePartnerGoogleToken failed partner=${partnerId} err=${authErr.message}`);
              tokenReason = 'ERROR';
            }
            if (!googleAccessToken && process.env.GOOGLE_ACCESS_TOKEN && process.env.NODE_ENV !== 'production') {
              googleAccessToken = process.env.GOOGLE_ACCESS_TOKEN;
              tokenSource = 'env';
              tokenReason = 'DEV_ENV_FALLBACK';
            }

            console.log(`[WA_PME] processTurn=yes partner=${partnerId} jid=${remoteJid}`);
            console.log(`[CALENDAR] token_inject partner=${partnerId} hasToken=${Boolean(googleAccessToken)} source=${tokenSource} reason=${tokenReason}`);

            const pushName = rawMsg?.pushName || rawMsg?.verifiedBizName || rawMsg?.notifyName || '';
            const actions = await this.agentRuntime.processTurn({
              mode: 'pme',
              partnerId,
              userKey: remoteJid,
              userMessage,
              pushName,
              googleAccessToken
            });
            agentFacts = this.agentRuntime.formatFactsBlock(actions);
          }
        } catch (agentErr) {
          console.warn('[AGENT_RUNTIME]', agentErr.message);
        }

        const finalUser = (enrichedUser || userMessage || '') + agentFacts;

        const routerRes = await this.llmRouter.generateResponse({
          systemPrompt,
          userMessage: finalUser,
          mode: 'pme',
          partnerId
        });

        let reply = (routerRes && routerRes.text) ? String(routerRes.text).trim() : '';
        if (!reply) {
          reply = 'Desculpe, tive uma instabilidade rápida. Pode repetir sua pergunta? Posso ajudar com preços, horários ou agendamento.';
        }

        if (this.conversationBrain) {
          this.conversationBrain.trackOutbound(partnerId, remoteJid, reply, userMessage);
        }
        try {
          const excel = this.runtimeExcellence || getRuntimeExcellence();
          excel.health.record(50, true); // approx if no t0
          excel.replay.append(partnerId, remoteJid, { role: 'assistant', text: String(reply).slice(0, 500) });
        } catch (_) {}
        return reply;
      } catch (err) {
        console.error('[WHATSAPP_AI] erro:', err.message);
        try {
          (this.runtimeExcellence || getRuntimeExcellence()).health.record(0, false);
        } catch (_) {}
        return 'Tive um problema técnico momentâneo. Pode enviar de novo? Estou aqui para preços, horários e agendamentos.';
      }
    };

    const onQrUpdate = (qr) => {
      const { globalEventBus } = require('../ring1/EventBus');
      globalEventBus.emitAsync('whatsapp:qr_updated', { qrDataUrl: qr });
    };

    // Aplica os handlers globalmente para todas as sessões passadas e futuras
    this.waSessions.setGlobalHandlers({ onMessageReceived, onStateToggle, onQrUpdate });

    // AUTO-INICIALIZAR BAILEYS na startup para o QR estar pronto quando o usuário abrir o modal
    setImmediate(() => {
      this.whatsAppDriver.initBaileys().catch(err => {
        console.warn('[WHATSAPP_STARTUP] Init adiado:', err.message);
      });
    });

    this.googleClientId = process.env.GOOGLE_CLIENT_ID || '';
    this.subscriptionService = null; // financeiro / licença via ledger expurgado

    this.server = null;
  }

  start() {
    return new Promise((resolve) => {
      this.server = http.createServer(async (req, res) => {
        // --- TELEMETRY MIDDLEWARE INJECTION ---
        HttpTelemetryMiddleware(req, res, async () => {
          const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const pathname = urlObj.pathname;

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-session-token');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          return res.end();
        }

        // 1. Endpoint GET /health (WA-aware: degradado se WhatsApp desconectado)
        if (req.method === 'GET' && pathname === '/health') {
          const disabled = process.env.DISABLE_GOOGLE_AUTH === 'true';
          const waState = (this.whatsAppDriver && this.whatsAppDriver.connectionState) || 'UNKNOWN';
          const waOk = waState === 'CONNECTED' || waState === 'STANDBY' || waState === 'UNKNOWN';
          const softPause = this.whatsAppDriver && typeof this.whatsAppDriver.getSoftPauseStatus === 'function'
            ? this.whatsAppDriver.getSoftPauseStatus()
            : null;
          const body = {
            status: waOk ? 'HEALTHY' : 'DEGRADED_WA',
            ok: true,
            nodeId: 'node_primary_01',
            timestamp: Date.now(),
            pwaReady: true,
            googleAuthDisabled: disabled,
            bookingMode: disabled ? 'local_pdf' : 'google_calendar',
            waState,
            waConnected: waState === 'CONNECTED',
            softPause: softPause
              ? { globalPaused: softPause.globalPaused, totalPausedSessions: softPause.totalPausedSessions }
              : null
          };
          // Render free: sempre 200 para não matar o serviço por WA temporário offline
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(body));
        }

        if (req.method === 'GET' && pathname === '/api/v1/resilience/status') {
          let waHealth = null;
          try { waHealth = this.waWatchdog ? await this.waWatchdog.health() : null; } catch (_) {}
          const outbox = this.resilience ? this.resilience.listOutbox(20) : [];
          let excellence = null;
          try {
            const ex = this.runtimeExcellence || getRuntimeExcellence();
            excellence = {
              health: ex.health.snapshot(),
              circuits: ex.breaker.status()
            };
          } catch (_) {}
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            status: 'SUCCESS',
            resilience: true,
            outboxPending: outbox.length,
            wa: waHealth,
            excellence,
            timestamp: Date.now()
          }));
        }

        // Product readiness (persistência, keys, superpoderes)
        if (req.method === 'GET' && (pathname === '/api/v1/product/readiness' || pathname === '/api/v1/readiness')) {
          try {
            const { runProductReadiness } = require('../ring0/ProductReadiness');
            const report = runProductReadiness();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ status: report.ok ? 'SUCCESS' : 'DEGRADED', ...report }));
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ status: 'ERROR', error: e.message }));
          }
        }

        // 2. Endpoint GET /api/v1/tools/health
        if (req.method === 'GET' && pathname === '/api/v1/tools/health') {
          // G7 fix: verificar módulos reais em vez de retornar hardcoded ONLINE
          // Mantém shape JSON idêntico ao anterior para não quebrar UI
          const checks = [
            {
              id: 1, name: 'Google Calendar Sync', skill: 'CALENDAR_SYNC', category: 'Integration',
              check: () => {
                if (process.env.DISABLE_GOOGLE_AUTH === 'true') return 'DISABLED';
                const token = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET;
                return token ? 'ONLINE' : 'NEED_OAUTH';
              }
            },
            {
              id: 2, name: 'Secretário MAX Autônomo', skill: 'SECRETARY_MODE', category: 'Agent',
              check: () => (this.agentRuntime ? 'ONLINE' : 'OFFLINE')
            },
            {
              id: 3, name: 'WhatsApp Omnichannel', skill: 'WHATSAPP_CONNECT', category: 'Channel',
              check: () => {
                const wa = this.whatsAppDriver;
                if (!wa) return 'OFFLINE';
                try { return (wa.isConnected && wa.isConnected()) ? 'ONLINE' : 'STANDBY'; } catch (_) { return 'STANDBY'; }
              }
            },
            {
              id: 4, name: 'Atendente Digital PME (Max)', skill: 'ATTENDANT_SKILL', category: 'B2B Skill',
              check: () => (this.pmeConfigurator ? 'ONLINE' : 'OFFLINE')
            },
            {
              id: 5, name: 'Web Search Engine', skill: 'WEB_SEARCH', category: 'Research',
              check: () => (process.env.SERP_API_KEY || process.env.BRAVE_API_KEY || process.env.GOOGLE_SEARCH_API_KEY ? 'ONLINE' : 'NO_API_KEY')
            },
            {
              id: 6, name: 'Roteador Multi-LLM', skill: 'LLM_ROUTER', category: 'AI Engine',
              check: () => (this.llmRouter ? 'ONLINE' : 'OFFLINE')
            },
            {
              id: 7, name: 'Google OAuth2', skill: 'GOOGLE_AUTH', category: 'Security',
              check: () => (process.env.GOOGLE_CLIENT_ID ? 'ONLINE' : 'NOT_CONFIGURED')
            },
            {
              id: 8, name: 'Voz & Áudio', skill: 'VOICE_TRANSCRIPTION', category: 'Audio',
              check: () => 'ONLINE' // AudioHandler sem dependências externas
            },
            {
              id: 9, name: 'Catálogo PME', skill: 'PME_CATALOG', category: 'B2B Store',
              check: () => (this.pmeConfigurator ? 'ONLINE' : 'OFFLINE')
            },
            {
              id: 10, name: 'Runtime Core (SQLite)', skill: 'RUNTIME_CORE', category: 'Core DB',
              check: () => {
                try { return (this.runtime && this.runtime.getDb()) ? 'ONLINE' : 'OFFLINE'; } catch (_) { return 'OFFLINE'; }
              }
            }
          ];

          const toolsStatus = checks.map(({ id, name, skill, category, check }) => {
            let status = 'OFFLINE';
            try { status = check(); } catch (_) { status = 'ERROR'; }
            return { id, name, skill, status, category };
          });

          const onlineCount = toolsStatus.filter((t) => t.status === 'ONLINE').length;
          const systemHealth = onlineCount === toolsStatus.length ? 'HEALTHY_100_PERCENT'
            : onlineCount >= toolsStatus.length * 0.7 ? 'DEGRADED'
            : 'UNHEALTHY';

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            status: 'SUCCESS',
            systemHealth,
            nodeId: 'node_primary_01',
            totalTools: toolsStatus.length,
            onlineToolsCount: onlineCount,
            tools: toolsStatus,
            timestamp: Date.now()
          }));
        }

        // REMOVIDO: handler duplicado de /api/v1/whatsapp/qrcode que estava aqui.
        // O handler correto (com suporte a ?mode e ?force e chamada ao Baileys) está abaixo.

        // ══════════════════════════════════════════════════════════════════
        // ENDPOINT PRINCIPAL: POST /api/v1/chat/stream
        // Liga o browser ao MultiProviderLlmRouter (Groq → OpenAI → Gemini)
        // Retorna Server-Sent Events (SSE) para streaming em tempo real
        // ══════════════════════════════════════════════════════════════════
        if (req.method === 'POST' && pathname === '/api/v1/chat/stream') {
          let body = '';
          req.on('data', chunk => (body += chunk));
          req.on('end', async () => {
            // Conexão SSE Resiliente (Sprint 6)
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
              'X-Accel-Buffering': 'no',
              'Access-Control-Allow-Origin': '*'
            });
            res.write(':ping\n\n'); // Flush imediato para evitar timeout

            // Heartbeat periódico a cada 15s para manter a conexão aberta (Nginx/Render)
            const heartbeat = setInterval(() => {
              res.write(':ping\n\n');
            }, 15000);

            // Tratamento de Desconexão Abrupta
            let isAborted = false;
            res.on('close', () => {
              if (res.writableEnded) return; // Já finalizado pelo backend, não é aborto
              isAborted = true;
              clearInterval(heartbeat);
            });

            try {
              const { userMessage, message, history = [] } = JSON.parse(body || '{}');
              const text = (userMessage || message || '').trim();

              if (!text) {
                res.write(`data: ${JSON.stringify({ chunk: 'Por favor, digite uma mensagem.' })}\n\n`);
                clearInterval(heartbeat);
                return res.end();
              }

              // Determinar system prompt: consumidor padrão ou atendente PME
              const sessionToken = req.headers['x-session-token'] || req.headers['authorization']?.replace('Bearer ', '');
              let systemPrompt = null;
              let partnerId = null;

              if (sessionToken && this.authManager) {
                try {
                  const session = await this.authManager.validateSession(sessionToken);
                  if (session && session.is_partner) {
                    partnerId = session.partner_id || session.user_id;
                    systemPrompt = this.pmeConfigurator.compileMaxAttendantPrompt(partnerId);
                  }
                } catch (_) {}
              }

              if (!systemPrompt) {
                systemPrompt = getSystemPrompt('Modo PME (Não Configurado) — o estabelecimento ainda não configurou regras específicas. Ajude de forma educada.');
              }

              // Mescla histórico enviado pelo client com o do banco de dados (Saneamento F5)
              let fullHistory = [...history];
              if (sessionToken && this.runtime) {
                  try {
                      const db = this.runtime.getDb();
                      const dbHist = db.prepare(`SELECT role, content FROM chat_history WHERE session_token = ? ORDER BY created_at ASC LIMIT 20`).all(sessionToken);
                      
                      if (dbHist && dbHist.length > 0 && history.length === 0) {
                          fullHistory = dbHist.map(h => ({ role: h.role, text: h.content }));
                      }
                      
                      db.prepare(`INSERT INTO chat_history (session_token, role, content) VALUES (?, 'user', ?)`).run(sessionToken, text);
                  } catch (e) {
                      console.error('[CHAT_HISTORY] Erro ao gerenciar histórico', e.message);
                  }
              }

              if (isAborted) return; // Economiza cota se já fechou

              let toolServiceResultPayload = '';
              let webGroundingContext = '';
              let googleCreds = null;
              
              if (sessionToken && this.authManager) {
                  try {
                      const session = await this.authManager.validateSession(sessionToken);
                      if (session) {
                          googleCreds = await this.authManager.getGoogleCredentials(session.user_id);
                      }
                  } catch(e){}
              }

              // Intent Check for Calendar
              if (/calendário|agenda|marcar|agendar|cancelar compromisso|horário/i.test(text)) {
                  const GoogleCalendarConnector = require('./GoogleCalendarConnector.js');
                  const intent = /criar|novo|marcar|agendar/i.test(text) ? 'CRIAR_COMPROMISSO' : 
                                 /alterar|atualizar|remarcar/i.test(text) ? 'ALTERAR_COMPROMISSO' :
                                 /cancelar|remover/i.test(text) ? 'CANCELAR_COMPROMISSO' : 'CONSULTAR_AGENDA';
                  
                  const gToken = googleCreds ? googleCreds.access_token : null;
                  toolServiceResultPayload = await GoogleCalendarConnector.handleIntent(intent, gToken, { summary: text });
              }

              // Intent Check for Search
              if (/busca|pesquisa|notícia|noticia|web|hoje|atual/i.test(text)) {
                  try {
                      const searchRes = await WebSearchEngine.search(text);
                      if (searchRes && searchRes.ok && searchRes.summaryText) {
                        webGroundingContext = `\n\n[CONTEXTO DE PESQUISA WEB]:\n${searchRes.summaryText}\n\n`;
                      } else if (searchRes && searchRes.message) {
                        webGroundingContext = `\n\n[PESQUISA WEB]: ${searchRes.message}\n\n`;
                      }
                  } catch(e){}
              }

              const promptText = text + webGroundingContext;

              // Chamar o LLM Router
              const mode = 'pme';
              const llmResult = await this.llmRouter.generateResponse({
                systemPrompt,
                userMessage: promptText,
                history: fullHistory,
                partnerId,
                mode
              });

              if (isAborted) return; // Economiza saída se já fechou

              let responseText = llmResult.text || 'Não consegui processar sua solicitação. Tente novamente.';
              
              if (toolServiceResultPayload) {
                  responseText += `\n\n${toolServiceResultPayload}`;
              }

              const provider = llmResult.providerUsed || 'LocalFallback';

              if (sessionToken && this.runtime) {
                  try {
                      this.runtime.getDb().prepare(`INSERT INTO chat_history (session_token, role, content) VALUES (?, 'assistant', ?)`).run(sessionToken, responseText);
                  } catch (e) {
                      console.error('[CHAT_HISTORY] Erro ao salvar log do assistente', e.message);
                  }
              }

              // Streaming de Chunks SSE (Sprint 6)
              // Transmite a resposta particionada para o client-side (efeito typing)
              const chunkSize = 2; // caracteres por chunk
              for (let i = 0; i < responseText.length; i += chunkSize) {
                if (isAborted) break; // Trava o streaming imediatamente se a aba fechar
                const chunk = responseText.slice(i, i + chunkSize);
                res.write(`data: ${JSON.stringify({ chunk, provider })}\n\n`);
                
                // Micro-delay para fluxo de digitação em tempo real
                await new Promise(r => setTimeout(r, 10)); 
              }

              console.log(`[CHAT_STREAM] Resposta SSE entregue via ${provider} (${responseText.length} chars)`);
            } catch (err) {
              console.error('[CHAT_STREAM_ERROR]', err.message);
              if (!isAborted) {
                res.write(`data: ${JSON.stringify({ chunk: `\n[Erro interno: ${err.message}]` })}\n\n`);
              }
            } finally {
              clearInterval(heartbeat);
              if (!isAborted) res.end();
            }
          });
          return;
        }

        // --- ROTAS DO AUTENTICADOR NATIVO (NOVO FLUXO) ---
        if (req.method === 'POST' && pathname === '/api/v1/auth/native/register') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    const result = await this.authManager.registerNativeUser(data.email, data.password, data.name);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } catch (err) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });
            return;
        }

        if (req.method === 'POST' && pathname === '/api/v1/auth/native/login') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    const result = await this.authManager.authenticateNativeUser(data.email, data.password);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } catch (err) {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });
            return;
        }

        // 3. Endpoint POST /api/v1/auth/google (Sprint 8)
        if (req.method === 'POST' && pathname === '/api/v1/auth/google') {
            if (process.env.DISABLE_GOOGLE_AUTH === 'true') {
                 res.writeHead(403, { 'Content-Type': 'application/json' });
                 return res.end(JSON.stringify({ error: 'Google Auth desabilitado temporariamente', code: 'GOOGLE_AUTH_DISABLED' }));
            }
          let body = '';
          req.on('data', chunk => (body += chunk));
          req.on('end', async () => {
            try {
              const payload = JSON.parse(body || '{}');
              
              const result = await this.authManager.authenticateGoogleUser({
                code: payload.code,
                idToken: payload.idToken
              });

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                status: 'SUCCESS',
                success: true,
                sessionToken: result.token,
                user: {
                  id: result.user.id || result.user.user_id,
                  email: result.user.email,
                  name: result.user.name,
                  picture: result.user.picture,
                  
                  debt_cents: result.user.debt_cents || 0,
                  is_partner: result.user.is_partner || false,
                  calendar_sync_granted: true
                },
                oauthConfigured: !!this.googleClientId
              }));
            } catch (err) {
              console.error('[AUTH_ERROR] Falha no login do Google:', err.message, err.stack);
              require('fs').writeFileSync('debug_error.log', err.message + '\\n' + err.stack);
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'ERROR', success: false, error: err.message, message: err.message }));
            }
          });
          return;
        }

        // 3.1 Endpoint GET /api/v1/auth/session (Sprint 8 - Validação de Boot)
        if (req.method === 'GET' && pathname === '/api/v1/auth/session') {
           const token = req.headers['x-session-token'] || (req.headers['authorization'] || '').replace('Bearer ', '');
           if (!token) {
               res.writeHead(401, { 'Content-Type': 'application/json' });
               return res.end(JSON.stringify({ status: 'ERROR', success: false, message: 'No token provided' }));
           }

           try {
               const session = await this.authManager.validateSession(token);
               if (session) {
                   console.log(`[AUTH_PERSIST] Sessão restaurada com sucesso para o usuário: ${session.email}`);
                   res.writeHead(200, { 'Content-Type': 'application/json' });
                   res.end(JSON.stringify({
                     status: 'SUCCESS',
                     success: true,
                     user: {
                         id: session.user_id,
                         email: session.email,
                         name: session.name,
                         picture: session.picture,
                         is_partner: session.is_partner === 1 || session.is_partner === true,
                         partner_id: session.partner_id,
                         store_name: session.store_name
                     }
                   }));
               } else {
                   console.log(`[AUTH_PERSIST] Token inválido ou expirado. Redirecionando para login.`);
                   res.writeHead(401, { 'Content-Type': 'application/json' });
                   res.end(JSON.stringify({ status: 'ERROR', success: false, message: 'Invalid or expired session' }));
               }
           } catch (err) {
               console.log(`[AUTH_PERSIST] Erro ao validar sessão: ${err.message}`);
               res.writeHead(500, { 'Content-Type': 'application/json' });
               res.end(JSON.stringify({ status: 'ERROR', success: false, message: 'Internal Server Error' }));
           }
           return;
        }

        // RFC 006-BIS: POST /api/v1/partner/upgrade
        if (req.method === 'POST' && (pathname === '/api/v1/partner/upgrade' || pathname === '/api/v1/user/upgrade-merchant')) {
          let body = '';
          req.on('data', chunk => (body += chunk));
          req.on('end', async () => {
            try {
              const sessionToken = req.headers['x-session-token'];
              let userId = 'usr_google_demo_100';

              if (sessionToken && this.authManager) {
                const session = await this.authManager.validateSession(sessionToken);
                if (session) userId = session.user_id;
              }

              const payload = JSON.parse(body || '{}');
              const targetUser = payload.userId || userId;
              const storeName = payload.storeName || payload.name;
              const segment = payload.segment || payload.storeSegment || 'FOOD_GASTRONOMY';

              const result = await this.authManager.upgradeToPartner(targetUser, storeName, segment);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'SUCCESS', success: true, partnerId: result.partnerId, storeName: result.storeName }));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'ERROR', success: false, error: err.message }));
            }
          });
          return;
        }

        // PME Engine V2 (Strangler Fig) - GET Config (Blindado contra IDOR: ACH-01)
        if (req.method === 'GET' && pathname === '/api/v1/pme/v2/config') {
          try {
            if (typeof global.IS_MAX_ACTIVE === 'undefined') global.IS_MAX_ACTIVE = true;
            const sessionToken = req.headers['x-session-token'];
            let session = null;
            if (sessionToken && this.authManager) {
              session = await this.authManager.validateSession(sessionToken);
            }

            if (!session) {
              res.writeHead(401, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ status: 'error', message: 'UNAUTHORIZED_SESSION' }));
            }

            const partnerId = session.user_id || session.partner_id;
            const db = this.runtime.getDb();
            const row = db.prepare('SELECT * FROM pme_configs_v2 WHERE partner_id = ?').get(partnerId);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            if (row) {
                let pdfs = [];
                let imgs = [];
                try { pdfs = JSON.parse(row.pdf_files || '[]'); } catch(_) { pdfs = []; }
                try { imgs = JSON.parse(row.image_files || '[]'); } catch(_) { imgs = []; }

                res.end(JSON.stringify({ 
                  status: 'success', 
                  config: {
                    partner_id: row.partner_id,
                    prompt_instructions: row.prompt_instructions || '',
                    business_rules: row.business_rules || '',
                    pdf_files: pdfs,
                    image_files: imgs,
                    isActive: global.IS_MAX_ACTIVE !== false,
                    updated_at: row.updated_at
                  }
                }));
            } else {
                res.end(JSON.stringify({ 
                  status: 'success', 
                  config: {
                    partner_id: partnerId,
                    prompt_instructions: '',
                    business_rules: '',
                    pdf_files: [],
                    image_files: [],
                    isActive: global.IS_MAX_ACTIVE !== false,
                    updated_at: null
                  }
                }));
            }
          } catch (err) {
            console.error('[PME V2 GET] Erro ao buscar config:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'error', message: err.message }));
          }
          return;
        }

        // PME Engine V2 (Strangler Fig) - POST Config (Blindado contra IDOR e DoS: ACH-01 e ACH-02)
        if (req.method === 'POST' && pathname === '/api/v1/pme/v2/config') {
          const sessionToken = req.headers['x-session-token'];
          let session = null;
          if (sessionToken && this.authManager) {
            session = await this.authManager.validateSession(sessionToken);
          }

          if (!session) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ status: 'error', message: 'UNAUTHORIZED_SESSION' }));
          }

          const authenticatedPartnerId = session.user_id || session.partner_id;
          const MAX_PAYLOAD_BYTES = 15 * 1024 * 1024; // Limite de 15MB (ACH-02)
          let body = '';
          let receivedBytes = 0;
          let isDestroyed = false;

          req.on('data', chunk => {
            if (isDestroyed) return;
            receivedBytes += chunk.length;
            if (receivedBytes > MAX_PAYLOAD_BYTES) {
              isDestroyed = true;
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'error', message: 'PAYLOAD_TOO_LARGE' }));
              req.destroy();
              return;
            }
            body += chunk;
          });

          req.on('end', async () => {
            if (isDestroyed) return;
            try {
              const payload = JSON.parse(body || '{}');
              if (typeof payload.isActive === 'boolean') {
                global.IS_MAX_ACTIVE = payload.isActive;
                // Soft-pause global: NÃO desconecta Baileys — só interrompe respostas da IA
                try {
                  if (this.whatsAppDriver && typeof this.whatsAppDriver.setGlobalPause === 'function') {
                    this.whatsAppDriver.setGlobalPause(!payload.isActive);
                  }
                } catch (pauseErr) {
                  console.warn('[PME V2 POST] soft-pause sync:', pauseErr.message);
                }
                try {
                  this.pmeConfigurator.updateAttendantConfig(authenticatedPartnerId || payload.partnerId, {
                    isActive: payload.isActive
                  });
                } catch (_) {}
                console.log(`[PME V2 POST] Estado de atendimento do Max atualizado: ${global.IS_MAX_ACTIVE ? 'ATIVO' : 'PAUSADO'} (Baileys permanece conectado)`);
              }
              const partnerId = authenticatedPartnerId;
              console.log('[PME V2 POST DEBUG] Payload Recebido:', JSON.stringify(payload, null, 2));
              const promptInst = payload.prompt_instructions || payload.promptInstructions || '';
              const rules = typeof payload.business_rules === 'string' ? payload.business_rules : JSON.stringify(payload.business_rules || {});
              console.log('[PME V2 POST DEBUG] Parsed Rules:', rules);
              const pdfs = typeof payload.pdf_files === 'string' ? payload.pdf_files : JSON.stringify(payload.pdf_files || []);
              const imgs = typeof payload.image_files === 'string' ? payload.image_files : JSON.stringify(payload.image_files || []);

              const db = this.runtime.getDb();
              db.prepare(`
                INSERT INTO pme_configs_v2 (partner_id, prompt_instructions, business_rules, pdf_files, image_files, updated_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(partner_id) DO UPDATE SET 
                  prompt_instructions=excluded.prompt_instructions,
                  business_rules=excluded.business_rules,
                  pdf_files=excluded.pdf_files,
                  image_files=excluded.image_files,
                  updated_at=CURRENT_TIMESTAMP
              `).run(partnerId, promptInst, rules, pdfs, imgs);

              // ESPELHO CRÍTICO: personalidade do painel → runtime JSON (WhatsApp/chat)
              try {
                if (typeof this.pmeConfigurator.syncPersonalityFromV2 === 'function') {
                  this.pmeConfigurator.syncPersonalityFromV2(partnerId, promptInst);
                } else {
                  this.pmeConfigurator.updateProfileAndPrompt(partnerId, {
                    personalityPrompt: promptInst
                  });
                }
                // Atualiza storeName se vier nas business_rules
                try {
                  const br = typeof payload.business_rules === 'string'
                    ? JSON.parse(payload.business_rules || '{}')
                    : (payload.business_rules || {});
                  if (br.storeName || br.store_name) {
                    this.pmeConfigurator.updateProfileAndPrompt(partnerId, {
                      storeName: br.storeName || br.store_name
                    });
                  }
                } catch (_) {}
                console.log(`[PME V2 POST] Personalidade espelhada para partner=${partnerId} len=${(promptInst||'').length}`);
              } catch (syncErr) {
                console.warn('[PME V2 POST] Falha ao espelhar personalidade:', syncErr.message);
              }

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                status: 'success',
                message: 'V2 Config Saved',
                personalitySynced: true,
                promptLength: (promptInst || '').length
              }));
            } catch (err) {
              console.error('[PME V2 POST] Erro ao gravar no SQLite:', err);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'error', message: err.message }));
            }
          });
          return;
        }

        // ── GOOGLE CALENDAR OAUTH (PME INTEGRATION) ───────────────────────────
        
        // 1. Status: GET /api/v1/pme/:partnerId/google-calendar/status ou /api/pme/:partnerId/google-calendar/status
        const statusMatch = pathname.match(/^\/api(?:\/v1)?\/pme\/([^\/]+)\/google-calendar\/status$/);
        if (req.method === 'GET' && statusMatch) {
            if (process.env.DISABLE_GOOGLE_AUTH === 'true') {
                 res.writeHead(200, { 'Content-Type': 'application/json' });
                 return res.end(JSON.stringify({ hasToken: false, oauthConfigured: false, disabled: true }));
            }
          try {
            const partnerId = statusMatch[1];
            const db = this.runtime.getDb();
            const row = db.prepare('SELECT email, google_access_token, google_refresh_token, google_token_expires_at FROM user_accounts WHERE id = ?').get(partnerId);
            
            const hasToken = Boolean(row && (row.google_access_token || row.google_refresh_token));
            const isExpired = Boolean(row && row.google_token_expires_at && Number(row.google_token_expires_at) < Date.now() && !row.google_refresh_token);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              status: 'SUCCESS',
              success: true,
              connected: hasToken && !isExpired,
              email: (row && row.email) ? row.email : null,
              expiresAt: (row && row.google_token_expires_at) ? Number(row.google_token_expires_at) : null,
              reason: !hasToken ? 'NEED_OAUTH' : (isExpired ? 'EXPIRED' : null)
            }));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ status: 'ERROR', error: err.message }));
          }
        }

        // 1.4b Resumo de Agendamentos (Agrupamento por Dia)
        const summaryMatch = pathname.match(/^\/api(?:\/v1)?\/pme\/([^\/]+)\/appointments\/summary$/);
        if (req.method === 'GET' && summaryMatch) {
          try {
            const partnerId = summaryMatch[1];
            const config = this.pmeConfigurator.getAttendantConfig(partnerId);
            const appointments = (config && config.existingAppointments) ? config.existingAppointments : [];
            
            const summaryMap = {};
            for (const appt of appointments) {
              if (!appt.dateStr) continue;
              if (!summaryMap[appt.dateStr]) {
                summaryMap[appt.dateStr] = 0;
              }
              summaryMap[appt.dateStr]++;
            }
            
            const summary = Object.keys(summaryMap).map(dateStr => ({
              dateStr,
              count: summaryMap[dateStr]
            })).sort((a, b) => a.dateStr.localeCompare(b.dateStr));
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ status: 'SUCCESS', summary }));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ status: 'ERROR', error: err.message }));
          }
        }

        // 1.5 PDF Local / Lista (Missão Cirúrgica D3 / D4)
        const listMatch = pathname.match(/^\/api(?:\/v1)?\/pme\/([^\/]+)\/appointments\/(local|pdf)$/);
        if (req.method === 'GET' && listMatch) {
          try {
            const partnerId = listMatch[1];
            const urlObj = require('url').parse(req.url, true);
            const dateFilter = urlObj.query.date || null;
            const AppointmentListPdf = require('./AppointmentListPdf');
            const pdfResult = await AppointmentListPdf.generateAppointmentsPdf(partnerId, this.pmeConfigurator, this.pdfEngine, dateFilter);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ status: 'SUCCESS', downloadUrl: pdfResult.downloadUrl }));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ status: 'ERROR', error: err.message }));
          }
        }

        // 2. Connect: GET /api/v1/pme/:partnerId/google-calendar/connect ou /api/pme/:partnerId/google-calendar/connect
        const connectMatch = pathname.match(/^\/api(?:\/v1)?\/pme\/([^\/]+)\/google-calendar\/connect$/);
        if (req.method === 'GET' && connectMatch) {
            if (process.env.DISABLE_GOOGLE_AUTH === 'true') {
                 res.writeHead(403, { 'Content-Type': 'application/json' });
                 return res.end(JSON.stringify({ error: 'Google Auth desabilitado temporariamente', code: 'GOOGLE_AUTH_DISABLED' }));
            }
          try {
            const partnerId = connectMatch[1];
            const clientId = process.env.GOOGLE_CLIENT_ID || this.googleClientId || '';
            const origin = (req.headers.host ? `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}` : 'http://localhost:3000');
            const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${origin}/api/v1/pme/google-calendar/callback`;
            
            const state = this.authManager ? this.authManager.createGoogleOAuthState(partnerId) : partnerId;
            const scopes = [
              'https://www.googleapis.com/auth/calendar',
              'https://www.googleapis.com/auth/userinfo.email',
              'https://www.googleapis.com/auth/userinfo.profile',
              'openid'
            ].join(' ');

            const params = new URLSearchParams({
              client_id: clientId,
              redirect_uri: redirectUri,
              response_type: 'code',
              scope: scopes,
              access_type: 'offline',
              prompt: 'consent',
              state
            });

            const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

            if (urlObj.searchParams.get('format') === 'json' || (req.headers.accept && req.headers.accept.includes('application/json'))) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ status: 'SUCCESS', success: true, authUrl, partnerId }));
            } else {
              res.writeHead(302, { Location: authUrl });
              return res.end();
            }
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ status: 'ERROR', error: err.message }));
          }
        }

        // 3. Callback: GET /api/v1/pme/google-calendar/callback ou /api/pme/google-calendar/callback
        if (req.method === 'GET' && (pathname === '/api/v1/pme/google-calendar/callback' || pathname === '/api/pme/google-calendar/callback')) {
            if (process.env.DISABLE_GOOGLE_AUTH === 'true') {
                 res.writeHead(403, { 'Content-Type': 'application/json' });
                 return res.end(JSON.stringify({ error: 'Google Auth desabilitado temporariamente', code: 'GOOGLE_AUTH_DISABLED' }));
            }
          try {
            const code = urlObj.searchParams.get('code');
            const stateStr = urlObj.searchParams.get('state');
            const oauthErr = urlObj.searchParams.get('error');

            if (oauthErr) {
              console.warn(`[CALENDAR_OAUTH] Erro retornado pelo Google: ${oauthErr}`);
              res.writeHead(302, { Location: `/?google=error&reason=${encodeURIComponent(oauthErr)}` });
              return res.end();
            }

            const partnerId = this.authManager ? this.authManager.verifyGoogleOAuthState(stateStr) : null;
            if (!partnerId) {
              console.warn(`[CALENDAR_OAUTH] State inválido ou expirado no callback: ${stateStr}`);
              res.writeHead(302, { Location: `/?google=error&reason=INVALID_STATE` });
              return res.end();
            }

            const clientId = process.env.GOOGLE_CLIENT_ID || this.googleClientId || '';
            const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
            const origin = (req.headers.host ? `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}` : 'http://localhost:3000');
            const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${origin}/api/v1/pme/google-calendar/callback`;

            const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
              })
            });

            const tokenData = await tokenRes.json();
            if (tokenData.error) {
              console.error(`[CALENDAR_OAUTH] Falha na troca de código: ${tokenData.error_description || tokenData.error}`);
              res.writeHead(302, { Location: `/?google=error&reason=${encodeURIComponent(tokenData.error_description || tokenData.error)}` });
              return res.end();
            }

            let email = null;
            if (tokenData.id_token && this.authManager) {
              const decoded = this.authManager._decodeGoogleToken(tokenData.id_token);
              if (decoded && decoded.email) email = decoded.email;
            }

            await this.authManager.saveGoogleOAuthTokens(partnerId, tokenData, email);
            console.log(`[CALENDAR_OAUTH] Google Calendar conectado com sucesso para partner=${partnerId} email=${email || 'n/a'}`);

            res.writeHead(302, { Location: `/?google=connected&partnerId=${encodeURIComponent(partnerId)}` });
            return res.end();
          } catch (err) {
            console.error('[CALENDAR_OAUTH] Erro inesperado no callback:', err);
            res.writeHead(302, { Location: `/?google=error&reason=${encodeURIComponent(err.message)}` });
            return res.end();
          }
        }

        // 4. Disconnect: POST /api/v1/pme/:partnerId/google-calendar/disconnect ou /api/pme/:partnerId/google-calendar/disconnect
        const disconnectMatch = pathname.match(/^\/api(?:\/v1)?\/pme\/([^\/]+)\/google-calendar\/disconnect$/);
        if (req.method === 'POST' && disconnectMatch) {
            if (process.env.DISABLE_GOOGLE_AUTH === 'true') {
                 res.writeHead(403, { 'Content-Type': 'application/json' });
                 return res.end(JSON.stringify({ error: 'Google Auth desabilitado temporariamente', code: 'GOOGLE_AUTH_DISABLED' }));
            }
          try {
            const partnerId = disconnectMatch[1];
            if (this.authManager) {
              await this.authManager.disconnectGoogleCalendar(partnerId);
            }
            console.log(`[CALENDAR_OAUTH] Google Calendar desconectado para partner=${partnerId}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ status: 'SUCCESS', success: true, connected: false }));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ status: 'ERROR', error: err.message }));
          }
        }

        // 5. PDF Local de Agendamentos: GET /api/v1/pme/:partnerId/appointments/pdf
        const pdfMatch = pathname.match(/^\/api(?:\/v1)?\/pme\/([^\/]+)\/appointments\/pdf$/);
        if (req.method === 'GET' && pdfMatch) {
            try {
                const partnerId = pdfMatch[1];
                const items = this._listPartnerAppointments(partnerId);
                const pdfBase64 = await this._generateAppointmentsPdf(partnerId, items);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ 
                    status: 'SUCCESS', 
                    downloadUrl: `data:application/pdf;base64,${pdfBase64}` 
                }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ status: 'ERROR', error: err.message }));
            }
        }

        // 6. Lista Local de Agendamentos: GET /api/v1/pme/:partnerId/appointments/list
        const listRouteMatch = pathname.match(/^\/api(?:\/v1)?\/pme\/([^\/]+)\/appointments\/list$/);
        if (req.method === 'GET' && listRouteMatch) {
            try {
                const partnerId = listRouteMatch[1];
                const items = this._listPartnerAppointments(partnerId);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ status: 'SUCCESS', items }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ status: 'ERROR', error: err.message }));
            }
        }

        // RFC 006-BIS: GET & POST /api/v1/partner/attendant/config
        if (pathname === '/api/v1/partner/attendant/config' || pathname === '/api/v1/merchant/attendant-config') {
          const sessionToken = req.headers['x-session-token'];
          let session = null;

          if (sessionToken && this.authManager) {
            session = await this.authManager.validateSession(sessionToken);
          }

          if (sessionToken && !session) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ status: 'ERROR', message: 'UNAUTHORIZED' }));
          }

          if (session && session.is_partner === 0) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ status: 'ERROR', message: 'FORBIDDEN_NOT_PARTNER' }));
          }

          // [REMOVIDO] Bloqueio HTTP 402 de assinatura expirada (Modo Sovereign)

          const partnerId = session ? session.partner_id : (urlObj.searchParams.get('partnerId') || 'usr_google_demo_100');

          if (req.method === 'GET') {
            const config = this.pmeConfigurator.getAttendantConfig(partnerId);
            const waStatus = await this.whatsAppDriver.getStatus();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              status: 'SUCCESS',
              success: true,
              config,
              whatsAppStatus: waStatus
            }));
          }

          if (req.method === 'POST') {
            // [V1 EXTIRPADO] Rota legada desativada (Strangler Fig refactor)
            res.writeHead(410, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'DEPRECATED', message: 'Use POST /api/v1/pme/v2/config' }));
            return;
          }
        }

        // ENDPOINTS DE INTEGRAÇÃO DO WHATSAPP (QR CODE, STATUS E SIMULAÇÃO)
        
        // 🛍️ VITRINE PME (Sprint 11) - Rota pública para exibir catálogo visual estático
        if (req.method === 'GET' && pathname.startsWith('/vitrine/')) {
          const pmeId = pathname.replace('/vitrine/', '');
          if (!pmeId) {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('Identificador da loja inválido.');
          }

          try {
            const db = this.runtime.getDb();
            const row = db.prepare('SELECT image_files FROM pme_configs_v2 WHERE partner_id = ?').get(pmeId);

            let imgs = [];
            if (row && row.image_files) {
              try { imgs = JSON.parse(row.image_files); } catch(e) {}
            }

            if (!imgs || imgs.length === 0) {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              return res.end(`
                <!DOCTYPE html>
                <html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Vitrine Virtual</title>
                <style>body{background:#0a0a0c;color:#aaa;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}</style>
                </head><body><h3>Catálogo não disponível no momento.</h3></body></html>
              `);
            }

            const imgTags = imgs.map(i => `<img src="${i.url || i.dataUrl}" alt="Produto" style="width:100%; border-radius:12px; margin-bottom:16px; object-fit:cover; border:1px solid rgba(0,163,255,0.15); box-shadow: 0 4px 12px rgba(0,0,0,0.5);">`).join('');

            const html = `
              <!DOCTYPE html>
              <html><head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Vitrine Virtual</title>
              <style>
                body { background:#0a0a0c; color:#fff; font-family:'Inter', sans-serif; margin:0; padding:24px 16px; box-sizing:border-box; }
                h2 { text-align:center; margin-top:0; color:#00a3ff; font-weight:700; font-size:1.4rem; margin-bottom:24px; letter-spacing:-0.5px; }
                .grid { display:flex; flex-direction:column; max-width:500px; margin:0 auto; }
              </style>
              </head><body>
                <h2>Nossa Vitrine</h2>
                <div class="grid">${imgTags}</div>
              </body></html>
            `;

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            return res.end(html);
          } catch (err) {
            console.error('[VITRINE] Erro:', err);
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('Erro interno ao carregar a vitrine.');
          }
        }

        if (req.method === 'GET' && (pathname === '/api/v1/whatsapp/qrcode' || pathname === '/api/v1/whatsapp/qr')) {
          const reqMode = urlObj.searchParams.get('mode');
          const sessionKeyParam = urlObj.searchParams.get('sessionKey');
          const partnerId = urlObj.searchParams.get('partnerId');
          const wa = this.waSessions.resolveFromRequest({
            sessionKey: sessionKeyParam,
            mode: reqMode,
            partnerId
          });

          const forceReset = urlObj.searchParams.get('force') === 'true' || urlObj.searchParams.get('reset') === 'true';
          const qrBase64 = await wa.generateQrCodeDataUri(forceReset);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            status: 'SUCCESS',
            success: true,
            qrBase64: qrBase64,
            sessionKey: wa.sessionKey || null,
            authDirectory: wa.authDir || null,
            activeContextMode: 'business',
            connectionState: wa.connectionState
          }));
        }

        if (req.method === 'GET' && pathname === '/api/v1/whatsapp/sessions') {
          const health = await this.waSessions.health();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ status: 'SUCCESS', success: true, ...health, sessions: this.waSessions.listSessions() }));
        }

        // OPS-7 multi-line
        if (req.method === 'GET' && pathname === '/api/v1/whatsapp/lines') {
          const partnerId = urlObj.searchParams.get('partnerId') || 'default';
          const lines = this.waSessions.listLines(partnerId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            status: 'SUCCESS',
            partnerId,
            maxLines: require('./WhatsAppSessionManager').MAX_LINES_PER_PARTNER,
            lines
          }));
        }
        if (req.method === 'POST' && pathname === '/api/v1/whatsapp/lines') {
          let body = '';
          for await (const chunk of req) body += chunk;
          let parsed = {};
          try { parsed = body ? JSON.parse(body) : {}; } catch (_) {}
          const partnerId = parsed.partnerId || urlObj.searchParams.get('partnerId') || 'default';
          const lineId = parsed.lineId || 'default';
          try {
            const wa = this.waSessions.getOrCreateLine(partnerId, lineId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              status: 'SUCCESS',
              sessionKey: wa.sessionKey,
              authDirectory: wa.authDir,
              connectionState: wa.connectionState
            }));
          } catch (err) {
            res.writeHead(err.code === 'MAX_LINES_EXCEEDED' ? 409 : 500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ status: 'ERROR', code: err.code || 'LINE_FAIL', message: err.message, existing: err.existing }));
          }
        }

        // OPS-4 metrics + daily report
        if (req.method === 'POST' && pathname === '/api/v1/metrics/event') {
          let body = '';
          for await (const chunk of req) body += chunk;
          let parsed = {};
          try { parsed = body ? JSON.parse(body) : {}; } catch (_) {}
          const r = this.metricsLog.record(parsed);
          res.writeHead(r.ok ? 200 : 400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(r));
        }
        if (req.method === 'GET' && pathname === '/api/v1/metrics/summary') {
          const partnerId = urlObj.searchParams.get('partnerId') || 'default';
          const day = urlObj.searchParams.get('day');
          const agg = this.metricsLog.aggregate(partnerId, day);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ status: 'SUCCESS', ...agg }));
        }
        if (req.method === 'POST' && pathname === '/api/v1/reports/daily') {
          let body = '';
          for await (const chunk of req) body += chunk;
          let parsed = {};
          try { parsed = body ? JSON.parse(body) : {}; } catch (_) {}
          const partnerId = parsed.partnerId || 'default';
          const day = parsed.day;
          const r = this.dailyReportJob.generate(partnerId, day);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ status: 'SUCCESS', ...r }));
        }

        // OPS-6 tools readiness
        if (req.method === 'GET' && pathname === '/api/v1/tools/readiness') {
          const report = this.toolsRegistry.lastReport || await this.toolsRegistry.selfTest({ live: false });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ status: 'SUCCESS', ...report }));
        }

        // OPS-3 prompt pin status
        if (req.method === 'GET' && pathname === '/api/v1/system/prompt-pin') {
          const v = PromptPinMod.verifyAtBoot({ strict: false, exitOnCritical: false });
          res.writeHead(v.ok ? 200 : 503, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ status: v.ok ? 'SUCCESS' : 'CRITICAL', ...v }));
        }

        // OPS-5 watchdog health
        if (req.method === 'GET' && pathname === '/api/v1/whatsapp/watchdog') {
          const h = await this.waWatchdog.health();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ status: 'SUCCESS', ...h }));
        }

        if (req.method === 'POST' && pathname === '/api/v1/whatsapp/disconnect') {
          try {
            let body = '';
            // body opcional já pode ter sido lido noutros handlers — usa query
            const reqMode = urlObj.searchParams.get('mode');
            const sessionKeyParam = urlObj.searchParams.get('sessionKey');
            const wa = this.waSessions.resolveFromRequest({ sessionKey: sessionKeyParam, mode: reqMode });
            const result = await wa.disconnect();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              status: 'SUCCESS',
              success: true,
              message: 'WhatsApp desconectado com sucesso (sessão isolada).',
              sessionKey: wa.sessionKey || null,
              ...result
            }));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ status: 'ERROR', success: false, error: err.message }));
          }
        }

        if (req.method === 'GET' && pathname === '/api/v1/whatsapp/status') {
          const reqMode = urlObj.searchParams.get('mode');
          const sessionKeyParam = urlObj.searchParams.get('sessionKey');
          const wa = (this.waSessions && (reqMode || sessionKeyParam))
            ? this.waSessions.resolveFromRequest({ sessionKey: sessionKeyParam, mode: reqMode })
            : this.whatsAppDriver;
          const status = await wa.getStatus();
          status.sessionKey = wa.sessionKey || 'pme:default';
          status.authDirectory = wa.authDir || null;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(status));
        }

        // ⏸️ INTERRUPTOR LÓGICO DE ATENDIMENTO (Soft-Pause API)
        // Permite ao operador humano pausar/retomar a IA por sessão/número ou globalmente
        if (req.method === 'GET' && pathname === '/api/v1/whatsapp/soft-pause') {
          const targetJid = urlObj.searchParams.get('jid') || urlObj.searchParams.get('phone') || urlObj.searchParams.get('remoteJid');
          const softPauseStatus = this.whatsAppDriver.getSoftPauseStatus(targetJid);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(softPauseStatus));
        }

        if (req.method === 'POST' && pathname === '/api/v1/whatsapp/soft-pause') {
          let body = '';
          req.on('data', chunk => (body += chunk));
          req.on('end', () => {
            try {
              const payload = JSON.parse(body || '{}');
              const target = payload.remoteJid || payload.jid || payload.phone || payload.number;
              const action = (payload.action || (payload.paused === false ? 'resume' : (payload.paused === true ? 'pause' : 'toggle'))).toLowerCase();
              const isGlobal = !!payload.global;

              let isPausedNow = false;

              if (isGlobal || !target) {
                if (action === 'pause') {
                  this.whatsAppDriver.setGlobalPause(true);
                  isPausedNow = true;
                } else if (action === 'resume') {
                  this.whatsAppDriver.setGlobalPause(false);
                  isPausedNow = false;
                } else if (action === 'toggle') {
                  isPausedNow = this.whatsAppDriver.setGlobalPause(!this.whatsAppDriver.isGlobalPaused);
                }
              } else {
                if (action === 'pause') {
                  this.whatsAppDriver.pauseSession(target);
                  isPausedNow = true;
                } else if (action === 'resume') {
                  this.whatsAppDriver.resumeSession(target);
                  isPausedNow = false;
                } else if (action === 'toggle') {
                  isPausedNow = this.whatsAppDriver.toggleSessionPause(target);
                } else {
                  isPausedNow = this.whatsAppDriver.isSessionPaused(target);
                }
              }

              const statusData = this.whatsAppDriver.getSoftPauseStatus(target);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({
                status: 'SUCCESS',
                success: true,
                action,
                target: target || 'GLOBAL',
                isPaused: isPausedNow,
                ...statusData
              }));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ status: 'ERROR', success: false, error: err.message }));
            }
          });
          return;
        }

        // ENDPOINT DE EXECUÇÃO DAS 16 FERRAMENTAS DO DISPATCHER
        if (req.method === 'POST' && (pathname === '/api/v1/tools/execute' || pathname === '/api/v1/tools/run' || pathname === '/api/v1/tools/dispatcher')) {
          let body = '';
          req.on('data', chunk => (body += chunk));
          req.on('end', async () => {
            try {
              const payload = JSON.parse(body || '{}');
              const targetTool = payload.tool || payload.toolName || payload.name;
              const targetParams = payload.arguments || payload.params || {};

              if (!targetTool) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ status: 'ERROR', success: false, error: 'Nome da ferramenta ausente no payload' }));
              }

              // G3 fix: usar GeminiToolsDispatcher.dispatch real (não o dispatcher fantasma)
              let result = null;
              try {
                result = await GeminiToolsDispatcher.dispatch(targetTool, targetParams, null);
              } catch (dispatchErr) {
                result = { status: 'ERROR', tool: targetTool, error: dispatchErr.message };
              }

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'SUCCESS', success: true, result }));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'ERROR', success: false, error: err.message }));
            }
          });
          return;
        }

        // Financeiro expurgado (TokenLedger / Pix / escrow removidos)
        if (
          pathname.startsWith('/api/v1/ledger/') ||
          pathname.startsWith('/api/v1/escrow/')
        ) {
          res.writeHead(410, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'GONE',
            success: false,
            error: 'Módulo financeiro removido. Runtime focado em PME.'
          }));
          return;
        }

        // Endpoint POST /api/v1/merchant/generate-daily-report
        if (req.method === 'POST' && pathname === '/api/v1/merchant/generate-daily-report') {
          let body = '';
          req.on('data', chunk => (body += chunk));
          req.on('end', () => {
            try {
              const payload = JSON.parse(body || '{}');
              const partnerId = payload.partnerId || 'usr_google_demo_100';
              const config = this.pmeConfigurator.getAttendantConfig(partnerId);

              // Abordagem Analítica: Varrer agendamentos reais de hoje
              const todayIso = new Date().toISOString().split('T')[0];
              const todayAppts = (config.existingAppointments || []).filter(a => a.dateStr === todayIso);
              const apptsCount = todayAppts.length;
              // Para evitar divisão por zero:
              const conversations = Math.max(config.metricsHistory?.conversationsHandled || 1, apptsCount);
              const rate = ((apptsCount / conversations) * 100).toFixed(1);

              const apptsLines = todayAppts.length > 0 
                ? todayAppts.map(a => `- ${a.timeSlot}: ${a.clientName} (${a.serviceName})`).join('\n')
                : 'Nenhum agendamento confirmado para hoje até o momento.';

              const reportText = `
RELATÓRIO EXECUÇÃO DIÁRIA — ATENDENTE DIGITAL MAX
---------------------------------------------------
Data: ${new Date().toLocaleDateString('pt-BR')}
Atendente: Max (Funcionário Digital)

MÉTRICAS OPERACIONAIS DO DIA:
- Interações/Conversas: ${conversations}
- Agendamentos para Hoje: ${apptsCount}
- Taxa de Conversão: ${rate}%

AGENDAMENTOS PARA HOJE:
${apptsLines}
              `.trim();

              const pdf = this.pdfEngine.generatePdfReport({
                title: `Relatorio_Diario_Max_${Date.now()}`,
                content: reportText,
                author: 'Max - Funcionário Digital AUTON.MAX',
                type: 'RELATORIO_DIARIO'
              });

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                status: 'SUCCESS',
                success: true,
                pdfUrl: pdf.downloadUrl,
                filename: pdf.filename,
                metrics: config.metricsHistory
              }));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'ERROR', success: false, error: err.message }));
            }
          });
          return;
        }

        // Endpoint POST /api/v1/tools/extract-text
        if (req.method === 'POST' && pathname === '/api/v1/tools/extract-text') {
          let body = '';
          req.on('data', chunk => (body += chunk));
          req.on('end', () => {
            try {
              const { fileName, fileContentBase64, mimeType } = JSON.parse(body || '{}');
              const buffer = Buffer.from(fileContentBase64 || '', 'base64');
              const extraction = DocumentExtractor.extractTextFromBuffer(fileName || 'documento.txt', buffer, mimeType || 'text/plain');
              
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'SUCCESS', extraction }));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'ERROR', message: err.message }));
            }
          });
          return;
        }

        // Endpoint POST /api/v1/tools/web-search
        if (req.method === 'POST' && pathname === '/api/v1/tools/web-search') {
          let body = '';
          req.on('data', chunk => (body += chunk));
          req.on('end', async () => {
            try {
              const { query } = JSON.parse(body || '{}');
              const searchResults = await WebSearchEngine.search(query);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                status: searchResults && searchResults.ok ? 'SUCCESS' : 'ERROR',
                ok: !!(searchResults && searchResults.ok),
                searchResults
              }));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'ERROR', message: err.message }));
            }
          });
          return;
        }

        // Endpoint POST /api/v1/voice/transcribe
        if (req.method === 'POST' && (pathname === '/api/v1/voice/transcribe' || req.url === '/api/v1/voice/transcribe')) {
          let body = [];
          req.on('data', chunk => body.push(chunk));
          req.on('end', async () => {
            try {
              const buffer = Buffer.concat(body);
              
              if (buffer.length === 0) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ status: 'ERROR', message: 'Áudio vazio.' }));
              }

              const stt = await AudioHandler.transcribe(buffer, req.headers['content-type'] || 'audio/webm');

              if (stt && stt.ok && stt.text) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({
                  status: 'SUCCESS',
                  ok: true,
                  text: stt.text,
                  provider: stt.provider,
                  audio_bytes: buffer.length
                }));
              }

              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({
                status: 'FALLBACK',
                ok: false,
                text: null,
                fallbackMessage: (stt && stt.fallbackMessage) || AudioHandler.getFallbackMessage(),
                error: (stt && stt.error) || 'STT_FAILED',
                audio_bytes: buffer.length
              }));
            } catch (err) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                status: 'FALLBACK',
                ok: false,
                text: null,
                fallbackMessage: AudioHandler.getFallbackMessage(),
                error: err.message
              }));
            }
          });
          return;
        }



        // ══════════════════════════════════════════════════════════════════
        // Sprint 9 — ENDPOINTS DE ONBOARDING & SUBSCRIPTION
        // ══════════════════════════════════════════════════════════════════

        // POST /api/v1/auth/google/onboarding — Salva tipo de conta e inicia Trial
        if (req.method === 'POST' && pathname === '/api/v1/auth/google/onboarding') {
          let body = '';
          req.on('data', chunk => (body += chunk));
          req.on('end', () => {
            try {
              const payload = JSON.parse(body || '{}');
              const { userId, accountType, displayName, email } = payload;
              let accessResult = { status: 'TRIAL', daysLeft: 14, allowed: true };
              
              if (this.subscriptionService) {
                 try {
                     accessResult = this.subscriptionService.registerUserOnboarding(userId || 'anonymous_user', {
                       accountType: accountType || 'PERSONAL',
                       displayName: displayName || 'Visitante',
                       email: email || ''
                     });
                 } catch (subErr) {
                     console.warn('[ONBOARDING] Falha no service de subscription, mockando resultado:', subErr.message);
                 }
              }
              
              const sessionToken = req.headers['x-session-token'] || req.headers['authorization']?.replace('Bearer ', '') || 'dummy_token';
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'SUCCESS', success: true, access: accessResult, user: payload, sessionToken }));
            } catch (err) {
              // Mesmo que quebre feio, libere a tela
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'MOCKED', success: true, access: { allowed: true } }));
            }
          });
          return;
        }

        // Subscription/ledger expurgados — acesso liberado (PME)
        if (req.method === 'GET' && pathname === '/api/v1/subscription/status') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'SUCCESS',
            success: true,
            access: { status: 'ACTIVE', allowed: true, daysLeft: null }
          }));
          return;
        }

        if (req.method === 'POST' && pathname === '/api/v1/subscription/activate') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'SUCCESS',
            success: true,
            access: { status: 'ACTIVE', allowed: true, daysLeft: null },
            message: 'Módulo de assinatura financeira removido — acesso liberado.'
          }));
          return;
        }



        // Servir relatórios gerados em PDF
        if (pathname.startsWith('/reports/')) {
          const reportFileName = path.basename(pathname);
          const pdfPath = path.join(this.reportsDir, reportFileName);
          if (fs.existsSync(pdfPath)) {
            res.writeHead(200, {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `inline; filename="${reportFileName}"`
            });
            return fs.createReadStream(pdfPath).pipe(res);
          }
        }

        // Static file serving
        let filePath = path.join(this.publicDir, pathname === '/' ? 'index.html' : pathname);
        let extname = path.extname(filePath);
        let contentType = 'text/html';

        switch (extname) {
          case '.js': contentType = 'text/javascript'; break;
          case '.json': contentType = 'application/json'; break;
          case '.png': contentType = 'image/png'; break;
          case '.svg': contentType = 'image/svg+xml'; break;
          case '.mp4': contentType = 'video/mp4'; break;
          case '.css': contentType = 'text/css'; break;
        }

        fs.readFile(filePath, (error, content) => {
          if (error) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
          } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
          }
        });
        }); // Fecha HttpTelemetryMiddleware
      }); // Fecha createServer

      this.server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`\n⚠️ [HTTP_SERVER] Porta ${this.port} em uso. Alternando automaticamente para http://${this.host}:${Number(this.port) + 1}...`);
          this.port = Number(this.port) + 1;
          setTimeout(() => {
            this.server.listen(this.port, this.host);
          }, 300);
        }
      });

      this.server.listen(this.port, this.host, () => {
        console.log(`AUTON.MAX Server v3.0.0-FUSION rodando em http://${this.host}:${this.port}`);
        
        // --- KEEP-ALIVE (Render free: processo vivo só enquanto houver tráfego) ---
        // 5 min reduz spin-down; no plano free o Render ainda pode dormir sem hit externo.
        const KEEP_ALIVE_INTERVAL = 5 * 60 * 1000;
        setInterval(async () => {
            try {
                const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${this.port || 3000}`;
                const healthUrl = `${baseUrl}/health`;
                await fetch(healthUrl);
                console.log(`[KEEP-ALIVE] ok ${healthUrl}`);
            } catch (err) {
                console.warn('[KEEP-ALIVE] Falha:', err.message);
            }
        }, KEEP_ALIVE_INTERVAL);

        // Higiene de disco (replay/metrics antigos) — install-and-forget
        try {
          const { getWorkspaceHygiene } = require('../ring0/WorkspaceHygiene');
          getWorkspaceHygiene({ maxAgeDays: Number(process.env.HYGIENE_MAX_AGE_DAYS) || 14 }).start();
        } catch (hygErr) {
          console.warn('[HYGIENE] init:', hygErr.message);
        }

        // Alerta ao dono se WA ficar desconectado (cooldown 6h)
        try {
          const { OwnerAlert } = require('./OwnerAlert');
          this.ownerAlert = new OwnerAlert({
            getDriver: () => this.whatsAppDriver,
            getOwnerJid: () => {
              if (process.env.OWNER_WHATSAPP_JID) return process.env.OWNER_WHATSAPP_JID;
              try {
                const cfg = this.pmeConfigurator && this.pmeConfigurator.getAttendantConfig
                  ? this.pmeConfigurator.getAttendantConfig('usr_google_demo_100')
                  : null;
                return (cfg && (cfg.ownerJid || cfg.ownerPhone)) || null;
              } catch (_) {
                return null;
              }
            }
          });
          setInterval(async () => {
            try {
              const st = this.whatsAppDriver && this.whatsAppDriver.connectionState;
              if (st === 'DISCONNECTED') {
                await this.ownerAlert.notify('wa_disconnected', `state=${st}`);
              } else if (st === 'STANDBY') {
                await this.ownerAlert.notify('wa_standby', `state=${st}`);
              }
            } catch (_) {}
          }, 15 * 60 * 1000);
        } catch (oaErr) {
          console.warn('[OWNER_ALERT] init:', oaErr.message);
        }

        resolve(this.server);
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      // Parar orquestrador auto-healing
      if (this.supervisor) {
        this.supervisor.stop();
      }
      
      // Matar socket do Baileys para permitir saída limpa do processo e evitar hang no Test Runner
      if (this.whatsAppDriver) {
        this.whatsAppDriver.isInitializing = false;
        if (this.whatsAppDriver.sock) {
          try { this.whatsAppDriver.sock.end(undefined); } catch (_) {}
          this.whatsAppDriver.sock = null;
        }
      }

      if (this.server) {
        this.server.close(resolve);
      } else {
        resolve();
      }
    });
  }

  _listPartnerAppointments(partnerId) {
    if (!this.pmeConfigurator) return [];
    const config = this.pmeConfigurator.getAttendantConfig(partnerId);
    return (config && config.existingAppointments) ? config.existingAppointments : [];
  }

  async _generateAppointmentsPdf(partnerId, items) {
    if (!items || items.length === 0) return this._minimalTextPdf('Nenhum agendamento encontrado no banco de dados local.');
    try {
      const PdfGeneratorEngine = require('../ring1/PdfGeneratorEngine');
      const pdfEngine = new PdfGeneratorEngine();
      let content = '';
      let currentDate = null;
      const sorted = [...items].sort((a, b) => {
        if (a.dateStr !== b.dateStr) return String(a.dateStr).localeCompare(String(b.dateStr));
        return String(a.timeSlot).localeCompare(String(b.timeSlot));
      });
      for (const appt of sorted) {
        if (appt.dateStr !== currentDate) {
          currentDate = appt.dateStr;
          content += `\n--- Data: ${currentDate} ---\n`;
        }
        // --- CORREÇÃO: sanitização na renderização ---
        let safeClient = (appt.clientName && !appt.clientName.startsWith('usr_'))
          ? appt.clientName
          : 'Cliente';

        if (appt.customerPhone) {
          // remove @s.whatsapp.net caso ainda venha completo
          const phone = String(appt.customerPhone).split('@')[0];
          safeClient += ` (${phone})`;
        }

        const safeService = (appt.serviceName && appt.serviceName.length > 2)
          ? appt.serviceName
          : 'Serviço';

        content += `[${appt.timeSlot}] ${safeClient} - ${safeService}\n`;
      }
      return await pdfEngine.generatePdfReport({
        title: `Agendamentos - ${partnerId}`,
        content: content,
        type: 'AGENDAMENTOS_LOCAIS'
      });
    } catch (err) {
      console.warn('Falha no gerador nativo, usando texto minimo:', err.message);
      return this._minimalTextPdf('LISTA DE AGENDAMENTOS\n\n' + JSON.stringify(items, null, 2));
    }
  }

  _minimalTextPdf(text) {
    const safeText = String(text).replace(/[()\\]/g, '').substring(0, 800);
    const raw = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>\nendobj\n4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n5 0 obj\n<< /Length ${safeText.length + 30} >>\nstream\nBT /F1 12 Tf 50 700 Td (${safeText}) Tj ET\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000224 00000 n \n0000000312 00000 n \ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n406\n%%EOF`;
    return Buffer.from(raw).toString('base64');
  }
}

module.exports = HttpServer;
