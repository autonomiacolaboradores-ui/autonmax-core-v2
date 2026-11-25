# AUTON.MAX vNext — Snapshot Completo do Estado Atual (Volume 02/03)

> Gerado integralmente a partir do código-fonte atual em disco (zero truncamentos, pós-Ondas 1–4, migrations 001–003, calendário rolante 7 dias, trava anti-passado, proteção pós-commit e 51/51 testes).

## Tabela Resumo de Todos os Volumes

| Volume | Blocos Cobertos | Arquivos | Linhas do Volume | Tamanho |
| :--- | :--- | ---: | ---: | ---: |
| [VNEXT_ATUAL_01_BLOCOS_0_A_3.md](./VNEXT_ATUAL_01_BLOCOS_0_A_3.md) | Bloco 0, Bloco 1, Bloco 2, Bloco 3 | 29 | 7876 | 247.4 KB |
| [VNEXT_ATUAL_02_BLOCOS_3_A_6.md](./VNEXT_ATUAL_02_BLOCOS_3_A_6.md) | Bloco 3, Bloco 4, Bloco 5, Bloco 6 | 36 | 8510 | 270.5 KB |
| [VNEXT_ATUAL_03_BLOCOS_6_A_7.md](./VNEXT_ATUAL_03_BLOCOS_6_A_7.md) | Bloco 6, Bloco 7 | 28 | 8279 | 292.7 KB |

## Mapa de Correlação Arquitetural (Blocos 0 a 7)

```text
Bloco 0 (Boot & Verify: bin/start.js, scripts/verify.js)
  ├──▶ Bloco 1 (Camada 1: DatabaseManager, Migrations 001–003, Repositories, LifecycleManager)
  ├──▶ Bloco 2 (Camada 2: CatalogService, BookingService [PAST_DATE_NOT_ALLOWED], OrderService, RegionalNormalizer [buildRollingCalendarSP])
  ├──▶ Bloco 3 (Camada 3: PromptPin, LlmRouter [Gemini + thoughtSignature], AgentEngine [Calendário 7d + Um-por-Vez + Pós-Commit Fallback], AtomicOutputGuard)
  ├──▶ Bloco 4 (Camada 4: WhatsAppBaileysAdapter, SessionManager, MessageDebouncer, OutboundQueueWorker, PauseController)
  ├──▶ Bloco 5 (Camada 5: GatewayServer [no-store], Auth/Partner/Catalog/Booking/Order/Channel/Conversation/Health/Webhook Routes, SSE)
  ├──▶ Bloco 6 (Camada 6: app-web Dark Cyber Neon, sw.js Network-First, Dashboard/Catalog/Orders/Conversations, Capacitor Android, Render YAML)
  └──▶ Bloco 7 (Suíte E2E & Contratos: tests/layer1..layer6 — 51/51 testes)
```

## Índice dos Arquivos Neste Volume (36 arquivos)

- [core/ai/LlmRouter.js](#coreaillmrouterjs) (955 linhas)
- [core/ai/PromptPin.js](#coreaipromptpinjs) (231 linhas)
- [core/ai/voice/CloudVoiceAdapter.js](#coreaivoicecloudvoiceadapterjs) (233 linhas)
- [core/ai/voice/LocalVoiceAdapter.js](#coreaivoicelocalvoiceadapterjs) (192 linhas)
- [core/ai/voice/VoiceAdapter.js](#coreaivoicevoiceadapterjs) (34 linhas)
- [core/prompts/pme_base.v1.md](#corepromptspmebasev1md) (23 linhas)
- [core/messaging/ChannelAdapter.js](#coremessagingchanneladapterjs) (99 linhas)
- [core/messaging/MessageDebouncer.js](#coremessagingmessagedebouncerjs) (202 linhas)
- [core/messaging/OutboundQueueWorker.js](#coremessagingoutboundqueueworkerjs) (288 linhas)
- [core/messaging/PauseController.js](#coremessagingpausecontrollerjs) (157 linhas)
- [core/messaging/SessionManager.js](#coremessagingsessionmanagerjs) (600 linhas)
- [core/messaging/adapters/WhatsAppBaileysAdapter.js](#coremessagingadapterswhatsappbaileysadapterjs) (850 linhas)
- [core/gateway/Server.js](#coregatewayserverjs) (449 linhas)
- [core/gateway/events/SseManager.js](#coregatewayeventsssemanagerjs) (148 linhas)
- [core/gateway/events/WebhookDispatcher.js](#coregatewayeventswebhookdispatcherjs) (194 linhas)
- [core/gateway/middlewares/AuthMiddleware.js](#coregatewaymiddlewaresauthmiddlewarejs) (293 linhas)
- [core/gateway/middlewares/CorsMiddleware.js](#coregatewaymiddlewarescorsmiddlewarejs) (91 linhas)
- [core/gateway/routes/AuthRoutes.js](#coregatewayroutesauthroutesjs) (176 linhas)
- [core/gateway/routes/BookingRoutes.js](#coregatewayroutesbookingroutesjs) (154 linhas)
- [core/gateway/routes/CatalogRoutes.js](#coregatewayroutescatalogroutesjs) (124 linhas)
- [core/gateway/routes/ChannelRoutes.js](#coregatewayrouteschannelroutesjs) (176 linhas)
- [core/gateway/routes/ConversationRoutes.js](#coregatewayroutesconversationroutesjs) (166 linhas)
- [core/gateway/routes/FeatureRoutes.js](#coregatewayroutesfeatureroutesjs) (89 linhas)
- [core/gateway/routes/HealthRoutes.js](#coregatewayrouteshealthroutesjs) (141 linhas)
- [core/gateway/routes/OrderRoutes.js](#coregatewayroutesorderroutesjs) (153 linhas)
- [core/gateway/routes/PartnerRoutes.js](#coregatewayroutespartnerroutesjs) (95 linhas)
- [core/gateway/routes/WebhookRoutes.js](#coregatewayrouteswebhookroutesjs) (82 linhas)
- [app-web/index.html](#app-webindexhtml) (42 linhas)
- [app-web/manifest.webmanifest](#app-webmanifestwebmanifest) (12 linhas)
- [app-web/src/bootstrap.js](#app-websrcbootstrapjs) (1002 linhas)
- [app-web/src/components/AuthScreen.js](#app-websrccomponentsauthscreenjs) (59 linhas)
- [app-web/src/components/Icons.js](#app-websrccomponentsiconsjs) (75 linhas)
- [app-web/src/components/OperationalStatusBadge.js](#app-websrccomponentsoperationalstatusbadgejs) (96 linhas)
- [app-web/src/components/WhatsAppQrModal.js](#app-websrccomponentswhatsappqrmodaljs) (77 linhas)
- [app-web/src/config/FrontendInitConfig.js](#app-websrcconfigfrontendinitconfigjs) (202 linhas)
- [app-web/src/ports/EnvironmentPorts.js](#app-websrcportsenvironmentportsjs) (152 linhas)

---

## Bloco 3 — Camada 3 (Motor Agêntico, LlmRouter, Elo 3 & Voice)

### core/ai/LlmRouter.js

- **Bloco:** Bloco 3 — Camada 3 (Motor Agêntico, LlmRouter, Elo 3 & Voice)
- **Imports internos (`require` / `import`):** (nenhum)
- **Exports principais:** `LlmRouter`, `MAX_TOOL_ITERATIONS`, `DEFAULT_PROVIDER_ORDER`
- **Total de linhas:** 955

~~~~javascript
'use strict';

const MAX_TOOL_ITERATIONS = 3;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_QUARANTINE_MS = 60_000;
const MAX_LAST_ERRORS = 10;
const DEFAULT_GROQ_FALLBACK_MODELS = Object.freeze([
  'llama-3.3-70b-versatile',
  'openai/gpt-oss-20b',
]);
const DEFAULT_GEMINI_FALLBACK_MODELS = Object.freeze([
  'gemini-flash-lite-latest',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
]);
const DEFAULT_PROVIDER_ORDER = Object.freeze([
  'gemini',
  'groq',
  'xai',
  'openai',
  'openrouter',
]);

function sanitizeKey(raw) {
  if (raw === null || raw === undefined) return null;
  const cleaned = String(raw).replace(/["'\s]/g, '').trim();
  return cleaned.length > 0 ? cleaned : null;
}

const PROVIDER_ENDPOINTS = Object.freeze({
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'openai/gpt-oss-120b',
    protocol: 'openai',
  },
  xai: {
    url: 'https://api.x.ai/v1/chat/completions',
    defaultModel: 'grok-2-latest',
    protocol: 'openai',
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    protocol: 'openai',
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    defaultModel: 'gemini-3-flash-preview',
    protocol: 'gemini',
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'deepseek/deepseek-chat',
    protocol: 'openai',
  },
});

/**
 * Safely parses JSON tool arguments.
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
function parseToolArgs(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

/**
 * Converts internal chat messages into OpenAI-compatible payload messages.
 * @param {string} systemPrompt
 * @param {Array<Record<string, any>>} messages
 */
function toOpenAiMessages(systemPrompt, messages) {
  const out = [];
  if (systemPrompt) {
    out.push({ role: 'system', content: systemPrompt });
  }

  for (const msg of messages) {
    if (!msg) continue;
    if (msg.role === 'tool') {
      out.push({
        role: 'tool',
        tool_call_id: msg.toolCallId || msg.tool_call_id || msg.name || 'tool_call',
        content:
          typeof msg.content === 'string'
            ? msg.content
            : JSON.stringify(msg.content ?? {}),
      });
      continue;
    }

    if (msg.role === 'assistant' && Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
      out.push({
        role: 'assistant',
        content: msg.content || null,
        tool_calls: msg.toolCalls.map((tc, idx) => ({
          id: tc.id || `call_${idx + 1}`,
          type: 'function',
          function: {
            name: tc.name,
            arguments:
              typeof tc.arguments === 'string'
                ? tc.arguments
                : JSON.stringify(tc.arguments || {}),
          },
        })),
      });
      continue;
    }

    out.push({
      role: msg.role === 'user' ? 'user' : msg.role === 'system' ? 'system' : 'assistant',
      content: String(msg.content ?? msg.text ?? ''),
    });
  }

  return out;
}

/**
 * Converts internal chat messages into Gemini `contents` payload.
 * @param {Array<Record<string, any>>} messages
 */
function toGeminiContents(messages) {
  const contents = [];

  for (const msg of messages) {
    if (!msg) continue;
    if (msg.role === 'tool') {
      contents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: msg.name || 'tool',
              response:
                typeof msg.content === 'string'
                  ? parseToolArgs(msg.content)
                  : msg.content ?? {},
            },
          },
        ],
      });
      continue;
    }

    if (msg.role === 'assistant' && Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
      if (Array.isArray(msg.rawParts) && msg.rawParts.length > 0) {
        contents.push({ role: 'model', parts: msg.rawParts });
        continue;
      }
      const parts = [];
      if (msg.content) parts.push({ text: String(msg.content) });
      for (const tc of msg.toolCalls) {
        const part = {
          functionCall: {
            name: tc.name,
            args: parseToolArgs(tc.arguments),
          },
        };
        if (tc.thoughtSignature) {
          part.thoughtSignature = tc.thoughtSignature;
        }
        parts.push(part);
      }
      contents.push({ role: 'model', parts });
      continue;
    }

    contents.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: String(msg.content ?? msg.text ?? '') }],
    });
  }

  return contents;
}

/**
 * Multi-provider LLM router with native fetch + AbortController timeout cancellation,
 * per-provider circuit breakers, and native Function Calling support.
 * Failover cascade: Groq -> xAI -> OpenAI -> Gemini -> OpenRouter.
 */
class LlmRouter {
  /**
   * @param {{
   *   timeoutMs?: number,
   *   quarantineMs?: number,
   *   providerOrder?: string[],
   *   keys?: Record<string, string | null>,
   *   models?: Record<string, string>,
   *   fetchImpl?: typeof fetch,
   *   nowFn?: () => number,
   *   groqApiKey?: string,
   *   xaiApiKey?: string,
   *   grokApiKey?: string,
   *   openAiApiKey?: string,
   *   geminiApiKey?: string,
   *   openRouterApiKey?: string
   * }} [options]
   */
  constructor(options = {}) {
    this.timeoutMs = Number.isFinite(options.timeoutMs)
      ? Number(options.timeoutMs)
      : DEFAULT_TIMEOUT_MS;
    this.quarantineMs = Number.isFinite(options.quarantineMs)
      ? Number(options.quarantineMs)
      : DEFAULT_QUARANTINE_MS;
    const envOrder = process.env.LLM_PROVIDER_ORDER
      ? String(process.env.LLM_PROVIDER_ORDER)
          .split(',')
          .map((p) => p.trim().toLowerCase())
          .filter((p) => PROVIDER_ENDPOINTS[p])
      : [];
    this.providerOrder = Array.isArray(options.providerOrder)
      ? [...options.providerOrder]
      : envOrder.length > 0
        ? envOrder
        : [...DEFAULT_PROVIDER_ORDER];
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.nowFn = options.nowFn || (() => Date.now());
    this.logger = options.logger || console;

    const optKeys = options.keys || {};
    this._explicitKeys = {
      groq:
        'groq' in optKeys
          ? optKeys.groq
          : 'groqApiKey' in options
            ? options.groqApiKey
            : undefined,
      xai:
        'xai' in optKeys
          ? optKeys.xai
          : 'xaiApiKey' in options
            ? options.xaiApiKey
            : 'grokApiKey' in options
              ? options.grokApiKey
              : undefined,
      openai:
        'openai' in optKeys
          ? optKeys.openai
          : 'openAiApiKey' in options
            ? options.openAiApiKey
            : undefined,
      gemini:
        'gemini' in optKeys
          ? optKeys.gemini
          : 'geminiApiKey' in options
            ? options.geminiApiKey
            : undefined,
      openrouter:
        'openrouter' in optKeys
          ? optKeys.openrouter
          : 'openRouterApiKey' in options
            ? options.openRouterApiKey
            : undefined,
    };

    const routerRef = this;
    this.keys = {
      get groq() {
        return routerRef._resolveApiKey('groq');
      },
      set groq(val) {
        routerRef._explicitKeys.groq = val;
      },
      get xai() {
        return routerRef._resolveApiKey('xai');
      },
      set xai(val) {
        routerRef._explicitKeys.xai = val;
      },
      get openai() {
        return routerRef._resolveApiKey('openai');
      },
      set openai(val) {
        routerRef._explicitKeys.openai = val;
      },
      get gemini() {
        return routerRef._resolveApiKey('gemini');
      },
      set gemini(val) {
        routerRef._explicitKeys.gemini = val;
      },
      get openrouter() {
        return routerRef._resolveApiKey('openrouter');
      },
      set openrouter(val) {
        routerRef._explicitKeys.openrouter = val;
      },
    };

    const optModels = options.models || {};
    this._explicitModels = {
      groq: optModels.groq || options.groqModel || null,
      xai: optModels.xai || options.xaiModel || null,
      openai: optModels.openai || options.openAiModel || null,
      gemini: optModels.gemini || options.geminiModel || null,
      openrouter: optModels.openrouter || options.openRouterModel || null,
    };

    this.models = {
      get groq() {
        return (
          routerRef._explicitModels.groq ||
          process.env.GROQ_MODEL ||
          PROVIDER_ENDPOINTS.groq.defaultModel
        );
      },
      set groq(val) {
        routerRef._explicitModels.groq = val;
      },
      xai: this._explicitModels.xai || PROVIDER_ENDPOINTS.xai.defaultModel,
      openai: this._explicitModels.openai || PROVIDER_ENDPOINTS.openai.defaultModel,
      get gemini() {
        return (
          routerRef._explicitModels.gemini ||
          process.env.GEMINI_MODEL ||
          PROVIDER_ENDPOINTS.gemini.defaultModel
        );
      },
      set gemini(val) {
        routerRef._explicitModels.gemini = val;
      },
      openrouter:
        this._explicitModels.openrouter || PROVIDER_ENDPOINTS.openrouter.defaultModel,
    };

    /** @type {Record<string, { failures: number, status: 'CLOSED' | 'TRIPPED', retryAfter: number, lastReason?: string }>} */
    this.circuitBreaker = {};
    /** @type {Array<{ ts: string, provider: string, model: string, statusCode: number | null, reason: string }>} */
    this.lastErrors = [];
  }

  /**
   * Resolves API key dynamically (explicit option overrides process.env).
   * @param {string} providerId
   * @returns {string | null}
   */
  _resolveApiKey(providerId) {
    const explicit = this._explicitKeys?.[providerId];
    if (explicit !== undefined) {
      return sanitizeKey(explicit);
    }
    switch (providerId) {
      case 'groq':
        return sanitizeKey(process.env.GROQ_API_KEY);
      case 'xai':
        return sanitizeKey(process.env.XAI_API_KEY || process.env.GROK_API_KEY);
      case 'openai':
        return sanitizeKey(process.env.OPENAI_API_KEY);
      case 'gemini':
        return sanitizeKey(process.env.GEMINI_API_KEY);
      case 'openrouter':
        return sanitizeKey(process.env.OPENROUTER_API_KEY);
      default:
        return null;
    }
  }

  /**
   * Returns ordered candidate models for Groq (primary + GROQ_FALLBACK_MODELS).
   * @returns {string[]}
   */
  _getGroqCandidateModels() {
    return this._buildCandidateModels(
      this.models.groq,
      process.env.GROQ_FALLBACK_MODELS,
      DEFAULT_GROQ_FALLBACK_MODELS
    );
  }

  /**
   * Returns ordered candidate models for Gemini (primary + GEMINI_FALLBACK_MODELS).
   * @returns {string[]}
   */
  _getGeminiCandidateModels() {
    return this._buildCandidateModels(
      this.models.gemini,
      process.env.GEMINI_FALLBACK_MODELS,
      DEFAULT_GEMINI_FALLBACK_MODELS
    );
  }

  /**
   * Deduplicates primary model + env/default fallback model list.
   * @private
   */
  _buildCandidateModels(primary, rawFallbacks, defaultFallbacks) {
    const fallbacks =
      rawFallbacks !== undefined
        ? String(rawFallbacks)
            .split(',')
            .map((m) => m.trim())
            .filter(Boolean)
        : [...defaultFallbacks];

    const seen = new Set();
    const out = [];
    for (const m of [primary, ...fallbacks]) {
      if (m && !seen.has(m)) {
        seen.add(m);
        out.push(m);
      }
    }
    return out;
  }

  /**
   * Records an error entry in `this.lastErrors` (capped at 10) without secrets.
   * @private
   */
  _recordError(provider, model, err) {
    const statusCode = Number.isInteger(err?.statusCode) ? err.statusCode : null;
    const reason = String(err?.message || 'PROVIDER_ERROR');
    this.lastErrors.push({
      ts: new Date(this.nowFn()).toISOString(),
      provider,
      model: model || 'unknown',
      statusCode,
      reason,
    });
    if (this.lastErrors.length > MAX_LAST_ERRORS) {
      this.lastErrors.splice(0, this.lastErrors.length - MAX_LAST_ERRORS);
    }
    this.logger.warn?.(
      `[AI_ROUTER] FAIL provider=${provider} model=${model || 'unknown'} status=${statusCode ?? 'ERR'} reason=${reason}`
    );
  }

  /**
   * Returns safe diagnostic snapshot without exposing API keys.
   */
  getDiagnostics() {
    const configuredProviders = {};
    const circuitBreakers = {};
    for (const providerId of DEFAULT_PROVIDER_ORDER) {
      configuredProviders[providerId] = Boolean(this._resolveApiKey(providerId));
      const cb = this.circuitBreaker[providerId];
      circuitBreakers[providerId] = {
        status: cb?.status || 'CLOSED',
        failures: cb?.failures || 0,
        retryAfter: cb?.retryAfter || 0,
        lastReason: cb?.lastReason || null,
      };
    }

    return {
      configuredProviders,
      models: {
        groq: this.models.groq,
        groqCandidates: this._getGroqCandidateModels(),
        xai: this.models.xai,
        openai: this.models.openai,
        gemini: this.models.gemini,
        geminiCandidates: this._getGeminiCandidateModels(),
        openrouter: this.models.openrouter,
      },
      circuitBreakers,
      lastErrors: this.lastErrors.map((e) => ({ ...e })),
    };
  }

  /**
   * Checks whether a provider circuit breaker is closed or past quarantine.
   * @param {string} providerId
   * @returns {boolean}
   */
  isProviderHealthy(providerId) {
    const state = this.circuitBreaker[providerId];
    if (!state || state.status !== 'TRIPPED') return true;
    if (this.nowFn() >= state.retryAfter) {
      state.status = 'CLOSED';
      state.failures = 0;
      return true;
    }
    return false;
  }

  /**
   * Records a provider failure and trips the circuit breaker when threshold or critical error occurs.
   * @param {string} providerId
   * @param {string} reason
   * @param {{ immediate?: boolean }} [options]
   */
  tripCircuitBreaker(providerId, reason = 'ERROR', options = {}) {
    if (!this.circuitBreaker[providerId]) {
      this.circuitBreaker[providerId] = {
        failures: 0,
        status: 'CLOSED',
        retryAfter: 0,
      };
    }
    const state = this.circuitBreaker[providerId];
    const msg = String(reason || '');
    const isCritical =
      options.immediate === true ||
      /401|403|429|503|502|504|TIMEOUT|ABORT/i.test(msg);

    state.failures = isCritical ? 3 : state.failures + 1;
    state.lastReason = msg;

    if (state.failures >= 3) {
      state.status = 'TRIPPED';
      state.retryAfter = this.nowFn() + this.quarantineMs;
    }
  }

  /**
   * Resets failure counter on successful response.
   * @param {string} providerId
   */
  recordSuccess(providerId) {
    this.circuitBreaker[providerId] = {
      failures: 0,
      status: 'CLOSED',
      retryAfter: 0,
    };
  }

  /**
   * Executes an HTTP POST using native fetch + AbortController with guaranteed timer cleanup.
   * @param {string} url
   * @param {Record<string, string>} headers
   * @param {Record<string, unknown>} payload
   * @param {AbortSignal} [externalSignal]
   */
  async _fetchJsonWithAbort(url, headers, payload, externalSignal) {
    if (typeof this.fetchImpl !== 'function') {
      throw new Error('fetch implementation is not available');
    }

    const controller = new AbortController();
    let timedOut = false;

    const onExternalAbort = () => {
      controller.abort(externalSignal.reason || new Error('ABORTED'));
    };
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort(externalSignal.reason || new Error('ABORTED'));
      } else {
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error('TIMEOUT'));
    }, this.timeoutMs);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }

    try {
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const rawText = await response.text();
      let data = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        data = { rawText };
      }

      if (!response.ok) {
        const errMsg =
          data?.error?.message || data?.message || `HTTP_${response.status}`;
        const errCode = data?.error?.code || data?.code || null;
        const err = new Error(
          `${errMsg}${errCode ? ` [${errCode}]` : ''} (HTTP_${response.status})`
        );
        err.statusCode = response.status;
        err.apiCode = errCode;
        err.critical =
          response.status === 401 ||
          response.status === 403 ||
          response.status === 429 ||
          response.status >= 500;
        throw err;
      }

      return data;
    } catch (err) {
      if (timedOut || err?.name === 'AbortError' || /TIMEOUT/i.test(err?.message || '')) {
        const timeoutErr = new Error(`TIMEOUT (${this.timeoutMs}ms)`);
        timeoutErr.code = 'TIMEOUT';
        timeoutErr.critical = true;
        throw timeoutErr;
      }
      throw err;
    } finally {
      clearTimeout(timer);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  /**
   * Calls an OpenAI-compatible chat completions endpoint (Groq, xAI, OpenAI, OpenRouter).
   * @private
   */
  async _callOpenAiProvider(
    providerId,
    apiKey,
    { systemPrompt, messages, tools, toolChoice, signal, modelOverride }
  ) {
    const spec = PROVIDER_ENDPOINTS[providerId];
    const model = modelOverride || this.models[providerId] || spec.defaultModel;
    const cleanKey = String(apiKey).replace(/["'\s]/g, '').trim();

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cleanKey}`,
    };
    if (providerId === 'openrouter') {
      headers['HTTP-Referer'] = 'https://autonmax.io';
      headers['X-Title'] = 'AUTONMAX vNext';
    }

    const payload = {
      model,
      messages: toOpenAiMessages(systemPrompt, messages),
      temperature: 0.4,
    };

    if (Array.isArray(tools) && tools.length > 0) {
      payload.tools = tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description || '',
          parameters: t.parameters || { type: 'object', properties: {} },
        },
      }));
      payload.tool_choice = toolChoice || 'auto';
    }

    const data = await this._fetchJsonWithAbort(spec.url, headers, payload, signal);
    const choice = data?.choices?.[0]?.message;
    if (!choice) {
      throw new Error('EMPTY_CHOICE');
    }

    const toolCalls = Array.isArray(choice.tool_calls)
      ? choice.tool_calls.map((tc, idx) => ({
          id: tc.id || `call_${idx + 1}`,
          name: tc.function?.name,
          arguments: parseToolArgs(tc.function?.arguments),
        }))
      : [];

    const text = typeof choice.content === 'string' ? choice.content.trim() : '';
    if (!text && toolCalls.length === 0) {
      throw new Error('EMPTY_RESPONSE');
    }

    return {
      model,
      text,
      toolCalls,
      raw: data,
    };
  }

  /**
   * Calls Google Gemini generateContent endpoint with native functionDeclarations.
   * @private
   */
  async _callGeminiProvider(apiKey, { systemPrompt, messages, tools, signal, modelOverride }) {
    const model = modelOverride || this.models.gemini || PROVIDER_ENDPOINTS.gemini.defaultModel;
    const url = `${PROVIDER_ENDPOINTS.gemini.baseUrl}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const payload = {
      contents: toGeminiContents(messages),
    };
    if (systemPrompt) {
      payload.systemInstruction = { parts: [{ text: systemPrompt }] };
    }
    if (Array.isArray(tools) && tools.length > 0) {
      payload.tools = [
        {
          functionDeclarations: tools.map((t) => ({
            name: t.name,
            description: t.description || '',
            parameters: t.parameters || { type: 'object', properties: {} },
          })),
        },
      ];
    }

    const data = await this._fetchJsonWithAbort(
      url,
      {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      payload,
      signal
    );

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const textParts = [];
    const toolCalls = [];

    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      if (part.text && !part.thought) textParts.push(part.text);
      if (part.functionCall) {
        toolCalls.push({
          id: `gemini_call_${i + 1}`,
          name: part.functionCall.name,
          arguments: parseToolArgs(part.functionCall.args),
          thoughtSignature: part.thoughtSignature || part.thought_signature || null,
        });
      }
    }

    const text = textParts.join('\n').trim();
    if (!text && toolCalls.length === 0) {
      throw new Error('EMPTY_GEMINI_RESPONSE');
    }

    return {
      model,
      text,
      toolCalls,
      rawParts: parts,
      raw: data,
    };
  }

  /**
   * Generates a completion across the failover cascade (Groq -> xAI -> OpenAI -> Gemini -> OpenRouter).
   * @param {{
   *   systemPrompt?: string,
   *   messages?: Array<Record<string, any>>,
   *   userMessage?: string,
   *   history?: Array<Record<string, any>>,
   *   tools?: Array<{ name: string, description?: string, parameters?: Record<string, unknown> }>,
   *   toolChoice?: string,
   *   signal?: AbortSignal
   * }} params
   */
  async generate(params = {}) {
    const systemPrompt = params.systemPrompt || '';
    const tools = Array.isArray(params.tools) ? params.tools : [];
    const messages = Array.isArray(params.messages)
      ? [...params.messages]
      : [
          ...(Array.isArray(params.history) ? params.history : []),
          ...(params.userMessage ? [{ role: 'user', content: params.userMessage }] : []),
        ];

    const errors = [];

    for (const providerId of this.providerOrder) {
      const apiKey = this._resolveApiKey(providerId);
      if (!apiKey || !this.isProviderHealthy(providerId)) {
        continue;
      }

      if (providerId === 'groq') {
        const candidates = this._getGroqCandidateModels();
        let allToolUseFailed = tools.length > 0;
        let groqCritical = false;

        for (const modelName of candidates) {
          try {
            const res = await this._callOpenAiProvider('groq', apiKey, {
              systemPrompt,
              messages,
              tools,
              toolChoice: params.toolChoice,
              signal: params.signal,
              modelOverride: modelName,
            });
            this.recordSuccess('groq');
            this.logger.info?.(`[AI_ROUTER] OK provider=groq model=${res.model}`);
            return {
              ok: true,
              status: 'SUCCESS',
              providerUsed: 'groq',
              model: res.model,
              text: res.text,
              toolCalls: res.toolCalls,
              raw: res.raw,
              errors,
            };
          } catch (err) {
            const reason = err?.message || 'PROVIDER_ERROR';
            const isToolUseFailed =
              err?.statusCode === 400 &&
              /tool_use_failed|failed_generation/i.test(reason);
            if (!isToolUseFailed) {
              allToolUseFailed = false;
            }
            errors.push({ provider: 'groq', model: modelName, reason });
            this._recordError('groq', modelName, err);

            if (err?.critical === true) {
              groqCritical = true;
              this.tripCircuitBreaker('groq', reason, { immediate: true });
              break;
            }
          }
        }

        if (!groqCritical && allToolUseFailed && params.toolChoice !== 'required') {
          const primaryModel = candidates[0];
          try {
            const cleanRes = await this._callOpenAiProvider('groq', apiKey, {
              systemPrompt,
              messages,
              tools: [],
              signal: params.signal,
              modelOverride: primaryModel,
            });
            this.recordSuccess('groq');
            this.logger.info?.(
              `[AI_ROUTER] OK provider=groq model=${cleanRes.model} mode=no_tools_fallback`
            );
            return {
              ok: true,
              status: 'SUCCESS',
              providerUsed: 'groq',
              model: cleanRes.model,
              text: cleanRes.text,
              toolCalls: cleanRes.toolCalls,
              raw: cleanRes.raw,
              errors,
            };
          } catch (err) {
            const reason = err?.message || 'PROVIDER_ERROR';
            errors.push({ provider: 'groq', model: primaryModel, reason });
            this._recordError('groq', primaryModel, err);
            this.tripCircuitBreaker('groq', reason, { immediate: err?.critical === true });
          }
        } else if (!groqCritical) {
          const lastGroqErr = errors[errors.length - 1]?.reason || 'PROVIDER_ERROR';
          this.tripCircuitBreaker('groq', lastGroqErr, { immediate: false });
        }
        continue;
      }

      if (providerId === 'gemini') {
        const candidates = this._getGeminiCandidateModels();
        let geminiCritical = false;

        for (const modelName of candidates) {
          try {
            const res = await this._callGeminiProvider(apiKey, {
              systemPrompt,
              messages,
              tools,
              signal: params.signal,
              modelOverride: modelName,
            });
            this.recordSuccess('gemini');
            this.logger.info?.(`[AI_ROUTER] OK provider=gemini model=${res.model}`);
            return {
              ok: true,
              status: 'SUCCESS',
              providerUsed: 'gemini',
              model: res.model,
              text: res.text,
              toolCalls: res.toolCalls,
              rawParts: res.rawParts,
              raw: res.raw,
              errors,
            };
          } catch (err) {
            const reason = err?.message || 'PROVIDER_ERROR';
            errors.push({ provider: 'gemini', model: modelName, reason });
            this._recordError('gemini', modelName, err);
            const isAuthError = err?.statusCode === 401 || err?.statusCode === 403;
            if (isAuthError) {
              geminiCritical = true;
              this.tripCircuitBreaker('gemini', reason, { immediate: true });
              break;
            }
          }
        }

        if (!geminiCritical) {
          const lastGemErr = errors[errors.length - 1]?.reason || 'PROVIDER_ERROR';
          this.tripCircuitBreaker('gemini', lastGemErr, { immediate: true });
        }
        continue;
      }

      try {
        const res = await this._callOpenAiProvider(providerId, apiKey, {
          systemPrompt,
          messages,
          tools,
          toolChoice: params.toolChoice,
          signal: params.signal,
        });

        this.recordSuccess(providerId);
        this.logger.info?.(`[AI_ROUTER] OK provider=${providerId} model=${res.model}`);
        return {
          ok: true,
          status: 'SUCCESS',
          providerUsed: providerId,
          model: res.model,
          text: res.text,
          toolCalls: res.toolCalls,
          raw: res.raw,
          errors,
        };
      } catch (err) {
        const reason = err?.message || 'PROVIDER_ERROR';
        const model = this.models[providerId] || PROVIDER_ENDPOINTS[providerId]?.defaultModel;
        errors.push({ provider: providerId, model, reason });
        this._recordError(providerId, model, err);
        this.tripCircuitBreaker(providerId, reason, { immediate: err?.critical === true });
      }
    }

    return {
      ok: false,
      status: 'LOCAL_FALLBACK',
      providerUsed: 'local_fallback',
      model: 'none',
      text: 'No momento estamos passando por uma rápida instabilidade na nossa inteligência. Pode repetir sua solicitação em instantes, por favor?',
      toolCalls: [],
      errors,
    };
  }
}

LlmRouter.MAX_TOOL_ITERATIONS = MAX_TOOL_ITERATIONS;
LlmRouter.DEFAULT_PROVIDER_ORDER = DEFAULT_PROVIDER_ORDER;

module.exports = {
  LlmRouter,
  MAX_TOOL_ITERATIONS,
  DEFAULT_PROVIDER_ORDER,
};
~~~~

### core/ai/PromptPin.js

- **Bloco:** Bloco 3 — Camada 3 (Motor Agêntico, LlmRouter, Elo 3 & Voice)
- **Imports internos (`require` / `import`):** (nenhum)
- **Exports principais:** `PromptPin`, `FORBIDDEN_PATTERNS`, `DEFAULT_BASE_PROMPT_PATH`, `sha256`, `scanForbidden`, `readCanonicalPrompt`, `validatePromptText`
- **Total de linhas:** 231

~~~~javascript
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_PROMPTS_DIR = path.resolve(__dirname, '../prompts');
const DEFAULT_BASE_PROMPT_PATH = path.join(DEFAULT_PROMPTS_DIR, 'pme_base.v1.md');

/**
 * Legacy forbidden patterns consolidated from donor PromptPin + ci_prompt_guard.
 */
const FORBIDDEN_PATTERNS = Object.freeze([
  /Pix\s+At[oô]mico/i,
  /Finan[çc]as\/Pix/i,
  /concilia[çc][aã]o\s+de\s+pagamentos\s+Pix/i,
  /Log[ií]stica\s*\/\s*Entrega/i,
  /1[º°]\s+Assistente\s+Digital\s+Universal/i,
  /MaxCoin/i,
  /\bPENDING_PIX\b/,
  /gera(r)?\s+cobran[cç]a\s+Pix\s+da\s+plataforma/i,
  /sistema\s+de\s+cashback\s+Auton/i,
]);

/**
 * Normalizes line endings and computes canonical SHA-256 hex digest.
 * @param {string} text
 * @returns {string}
 */
function sha256(text) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim() + '\n';
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Scans prompt text against forbidden legacy regression patterns.
 * @param {string} text
 * @param {string} [label='prompt']
 * @returns {Array<{ label: string, pattern: string }>}
 */
function scanForbidden(text, label = 'prompt') {
  const hits = [];
  const source = String(text || '');
  for (const re of FORBIDDEN_PATTERNS) {
    if (re.test(source)) {
      hits.push({ label, pattern: String(re) });
    }
    re.lastIndex = 0;
  }
  return hits;
}

/**
 * Reads and normalizes a canonical prompt markdown file.
 * @param {string} [promptPath]
 * @returns {string}
 */
function readCanonicalPrompt(promptPath = DEFAULT_BASE_PROMPT_PATH) {
  if (!fs.existsSync(promptPath)) {
    const err = new Error(`PROMPT_FILE_MISSING: ${promptPath}`);
    err.code = 'PROMPT_FILE_MISSING';
    throw err;
  }
  return fs.readFileSync(promptPath, 'utf8').replace(/\r\n/g, '\n').trim() + '\n';
}

/**
 * Validates any prompt string against forbidden patterns and optional expected SHA-256.
 * @param {string} text
 * @param {{ expectedSha256?: string, label?: string }} [options]
 */
function validatePromptText(text, options = {}) {
  const label = options.label || 'prompt';
  const forbidden = scanForbidden(text, label);
  const actualSha256 = sha256(text);
  const hashMismatch =
    options.expectedSha256 && options.expectedSha256 !== actualSha256
      ? [{ which: label, expected: options.expectedSha256, actual: actualSha256 }]
      : [];

  return {
    ok: forbidden.length === 0 && hashMismatch.length === 0,
    sha256: actualSha256,
    forbidden,
    hashMismatch,
  };
}

/**
 * Boot integrity gate for `pme_base.v1.md` (SHA-256 pin + ci_prompt_guard).
 */
class PromptPin {
  /**
   * @param {{ promptPath?: string, pinFilePath?: string, expectedSha256?: string }} [options]
   */
  constructor(options = {}) {
    this.promptPath = options.promptPath || DEFAULT_BASE_PROMPT_PATH;
    this.pinFilePath = options.pinFilePath || null;
    this.expectedSha256 = options.expectedSha256 || null;
    this._verifiedPrompt = null;
    this._verifiedSha256 = null;
  }

  /**
   * Verifies prompt existence, forbidden patterns, and SHA-256 hash integrity.
   * Throws an Error with `code` (`PROMPT_FORBIDDEN_PATTERN`, `PROMPT_HASH_MISMATCH`,
   * `PROMPT_FILE_MISSING`) when `strict !== false` and verification fails.
   * @param {{ strict?: boolean, expectedSha256?: string, pinFilePath?: string, createPinIfMissing?: boolean, extraTexts?: Array<{ label: string, text: string }> }} [options]
   */
  verifyAtBoot(options = {}) {
    const strict = options.strict !== false;
    const pinFilePath = options.pinFilePath ?? this.pinFilePath;
    let expectedSha256 = options.expectedSha256 ?? this.expectedSha256;

    const rawPrompt = readCanonicalPrompt(this.promptPath);
    const actualSha256 = sha256(rawPrompt);
    const forbidden = scanForbidden(rawPrompt, path.basename(this.promptPath));

    if (Array.isArray(options.extraTexts)) {
      for (const entry of options.extraTexts) {
        if (entry && entry.text) {
          forbidden.push(...scanForbidden(entry.text, entry.label || 'extra'));
        }
      }
    }

    let pinCreated = false;
    if (!expectedSha256 && pinFilePath) {
      if (fs.existsSync(pinFilePath)) {
        const stored = JSON.parse(fs.readFileSync(pinFilePath, 'utf8'));
        expectedSha256 = stored?.pme_base?.sha256 || stored?.sha256 || null;
      } else if (options.createPinIfMissing !== false) {
        fs.mkdirSync(path.dirname(pinFilePath), { recursive: true });
        fs.writeFileSync(
          pinFilePath,
          JSON.stringify(
            {
              version: 1,
              pme_base: {
                file: path.basename(this.promptPath),
                sha256: actualSha256,
                bytes: Buffer.byteLength(rawPrompt, 'utf8'),
              },
              computedAt: new Date().toISOString(),
            },
            null,
            2
          )
        );
        expectedSha256 = actualSha256;
        pinCreated = true;
      }
    }

    const hashMismatch =
      expectedSha256 && expectedSha256 !== actualSha256
        ? [{ which: 'pme_base', expected: expectedSha256, actual: actualSha256 }]
        : [];

    const ok = forbidden.length === 0 && hashMismatch.length === 0;
    const result = {
      ok,
      sha256: actualSha256,
      pinCreated,
      forbidden,
      hashMismatch,
      prompt: rawPrompt.trim(),
    };

    if (!ok && strict) {
      const code =
        forbidden.length > 0 ? 'PROMPT_FORBIDDEN_PATTERN' : 'PROMPT_HASH_MISMATCH';
      const err = new Error(
        forbidden.length > 0
          ? `PromptPin blocked forbidden legacy pattern(s): ${forbidden.map((f) => f.pattern).join(', ')}`
          : `PromptPin SHA-256 mismatch: expected ${expectedSha256}, got ${actualSha256}`
      );
      err.code = code;
      err.details = result;
      throw err;
    }

    if (ok) {
      this._verifiedPrompt = result.prompt;
      this._verifiedSha256 = actualSha256;
    }

    return result;
  }

  /**
   * Returns the verified base prompt (verifying on demand if not yet verified).
   * @returns {string}
   */
  getBasePrompt() {
    if (!this._verifiedPrompt) {
      const res = this.verifyAtBoot({ strict: true });
      return res.prompt;
    }
    return this._verifiedPrompt;
  }

  /**
   * Returns the verified SHA-256 hash.
   * @returns {string}
   */
  getSha256() {
    if (!this._verifiedSha256) {
      this.verifyAtBoot({ strict: true });
    }
    return this._verifiedSha256;
  }
}

PromptPin.FORBIDDEN_PATTERNS = FORBIDDEN_PATTERNS;
PromptPin.DEFAULT_BASE_PROMPT_PATH = DEFAULT_BASE_PROMPT_PATH;
PromptPin.sha256 = sha256;
PromptPin.scanForbidden = scanForbidden;
PromptPin.readCanonicalPrompt = readCanonicalPrompt;
PromptPin.validatePromptText = validatePromptText;

module.exports = {
  PromptPin,
  FORBIDDEN_PATTERNS,
  DEFAULT_BASE_PROMPT_PATH,
  sha256,
  scanForbidden,
  readCanonicalPrompt,
  validatePromptText,
};
~~~~

### core/ai/voice/CloudVoiceAdapter.js

- **Bloco:** Bloco 3 — Camada 3 (Motor Agêntico, LlmRouter, Elo 3 & Voice)
- **Imports internos (`require` / `import`):** `core/ai/voice/VoiceAdapter`
- **Exports principais:** `CloudVoiceAdapter`
- **Total de linhas:** 233

~~~~javascript
'use strict';

const { VoiceAdapter, FALLBACK_STT_MESSAGE } = require('./VoiceAdapter');

const DEFAULT_VOICE_TIMEOUT_MS = 15_000;

/**
 * Cloud VoiceAdapter (Render 512MB RAM compliant):
 * - STT: Groq Whisper -> Google Gemini Multimodal fallback
 * - TTS: Disabled when `VOICE_TTS_DRIVER=off` (default on constrained containers)
 *   or lightweight cloud HTTP endpoint when configured.
 */
class CloudVoiceAdapter extends VoiceAdapter {
  /**
   * @param {{
   *   groqApiKey?: string,
   *   geminiApiKey?: string,
   *   ttsDriver?: string,
   *   ttsEndpoint?: string,
   *   timeoutMs?: number,
   *   fetchImpl?: typeof fetch
   * }} [options]
   */
  constructor(options = {}) {
    super();
    this.groqApiKey = options.groqApiKey ?? process.env.GROQ_API_KEY ?? null;
    this.geminiApiKey = options.geminiApiKey ?? process.env.GEMINI_API_KEY ?? null;
    this.ttsDriver = String(
      options.ttsDriver ?? process.env.VOICE_TTS_DRIVER ?? 'off'
    ).toLowerCase();
    this.ttsEndpoint = options.ttsEndpoint ?? process.env.CLOUD_TTS_ENDPOINT ?? null;
    this.timeoutMs = Number.isFinite(options.timeoutMs)
      ? Number(options.timeoutMs)
      : DEFAULT_VOICE_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
  }

  /**
   * Executes fetch bounded by AbortController timeout.
   * @private
   */
  async _fetchWithTimeout(url, init) {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new Error('VOICE_TIMEOUT'));
    }, this.timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();

    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Transcribes audio via Groq Whisper with Gemini Multimodal fallback.
   * Never throws raw crashes to callers — returns friendly `fallbackMessage`.
   * @param {Buffer} buffer
   * @param {string} [mimeType='audio/ogg']
   */
  async transcribe(buffer, mimeType = 'audio/ogg') {
    if (!buffer || buffer.length === 0) {
      return {
        ok: false,
        text: '',
        provider: 'none',
        fallbackMessage: FALLBACK_STT_MESSAGE,
        error: 'EMPTY_AUDIO_BUFFER',
      };
    }

    const errors = [];

    if (this.groqApiKey && typeof this.fetchImpl === 'function') {
      try {
        const ext = String(mimeType).includes('ogg')
          ? 'ogg'
          : String(mimeType).includes('mp4') || String(mimeType).includes('m4a')
            ? 'm4a'
            : 'webm';
        const file = new File([buffer], `audio.${ext}`, {
          type: mimeType || 'audio/ogg',
        });
        const formData = new FormData();
        formData.append('file', file);
        formData.append('model', 'whisper-large-v3');
        formData.append('language', 'pt');

        const res = await this._fetchWithTimeout(
          'https://api.groq.com/openai/v1/audio/transcriptions',
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${this.groqApiKey}` },
            body: formData,
          }
        );

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Groq HTTP ${res.status}: ${errText.slice(0, 150)}`);
        }

        const data = await res.json();
        const text = String(data?.text || '').trim();
        if (text) {
          return { ok: true, text, provider: 'groq-whisper' };
        }
        errors.push('Groq returned empty text');
      } catch (err) {
        errors.push(err?.message || 'Groq STT failed');
      }
    } else {
      errors.push('GROQ_API_KEY missing');
    }

    if (this.geminiApiKey && typeof this.fetchImpl === 'function') {
      try {
        const payload = {
          contents: [
            {
              parts: [
                {
                  text: 'Transcreva este áudio de voz com precisão em português. Retorne apenas o texto transcrito, sem aspas e sem comentários.',
                },
                {
                  inlineData: {
                    mimeType: mimeType || 'audio/ogg',
                    data: Buffer.isBuffer(buffer)
                      ? buffer.toString('base64')
                      : Buffer.from(buffer).toString('base64'),
                  },
                },
              ],
            },
          ],
        };

        const res = await this._fetchWithTimeout(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(this.geminiApiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 150)}`);
        }

        const data = await res.json();
        const text = String(
          data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
        ).trim();
        if (text) {
          return { ok: true, text, provider: 'gemini-multimodal' };
        }
        errors.push('Gemini returned empty text');
      } catch (err) {
        errors.push(err?.message || 'Gemini STT failed');
      }
    } else {
      errors.push('GEMINI_API_KEY missing');
    }

    return {
      ok: false,
      text: '',
      provider: 'none',
      fallbackMessage: FALLBACK_STT_MESSAGE,
      error: errors.join(' | ') || 'STT_FAILED',
    };
  }

  /**
   * Synthesizes speech in cloud mode. Returns disabled state when `VOICE_TTS_DRIVER=off`.
   * @param {string} text
   * @param {{ voiceId?: string, speed?: number }} [options]
   */
  async synthesize(text, options = {}) {
    if (this.ttsDriver === 'off') {
      return {
        ok: false,
        buffer: Buffer.alloc(0),
        mimeType: 'audio/ogg; codecs=opus',
        error: 'TTS_DISABLED',
      };
    }

    if (!this.ttsEndpoint || typeof this.fetchImpl !== 'function') {
      return {
        ok: false,
        buffer: Buffer.alloc(0),
        mimeType: 'audio/ogg; codecs=opus',
        error: 'CLOUD_TTS_NOT_CONFIGURED',
      };
    }

    try {
      const res = await this._fetchWithTimeout(this.ttsEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: String(text || ''),
          voiceId: options.voiceId,
          speed: options.speed,
          format: 'ogg_opus',
        }),
      });
      if (!res.ok) {
        throw new Error(`Cloud TTS HTTP ${res.status}`);
      }
      const ab = await res.arrayBuffer();
      return {
        ok: true,
        buffer: Buffer.from(ab),
        mimeType: 'audio/ogg; codecs=opus',
      };
    } catch (err) {
      return {
        ok: false,
        buffer: Buffer.alloc(0),
        mimeType: 'audio/ogg; codecs=opus',
        error: err?.message || 'CLOUD_TTS_FAILED',
      };
    }
  }
}

module.exports = { CloudVoiceAdapter };
~~~~

### core/ai/voice/LocalVoiceAdapter.js

- **Bloco:** Bloco 3 — Camada 3 (Motor Agêntico, LlmRouter, Elo 3 & Voice)
- **Imports internos (`require` / `import`):** `core/ai/voice/VoiceAdapter`
- **Exports principais:** `LocalVoiceAdapter`
- **Total de linhas:** 192

~~~~javascript
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { VoiceAdapter, FALLBACK_STT_MESSAGE } = require('./VoiceAdapter');

const execFileAsync = promisify(execFile);

/**
 * Self-hosted local VoiceAdapter wrapper (`whisper.cpp` for STT, Piper + ffmpeg
 * to OGG/Opus for TTS). Intended only for self-hosted deployments with sufficient RAM,
 * activated via `VOICE_STT_DRIVER=local` / `VOICE_TTS_DRIVER=piper`.
 */
class LocalVoiceAdapter extends VoiceAdapter {
  /**
   * @param {{
   *   whisperBinPath?: string,
   *   whisperModelPath?: string,
   *   piperBinPath?: string,
   *   piperModelPath?: string,
   *   ffmpegBinPath?: string,
   *   timeoutMs?: number
   * }} [options]
   */
  constructor(options = {}) {
    super();
    this.whisperBinPath =
      options.whisperBinPath ?? process.env.WHISPER_BIN_PATH ?? '/usr/bin/whisper';
    this.whisperModelPath =
      options.whisperModelPath ?? process.env.WHISPER_MODEL_PATH ?? '';
    this.piperBinPath =
      options.piperBinPath ?? process.env.PIPER_BIN_PATH ?? '/usr/bin/piper';
    this.piperModelPath =
      options.piperModelPath ?? process.env.PIPER_MODEL_PATH ?? '';
    this.ffmpegBinPath =
      options.ffmpegBinPath ?? process.env.FFMPEG_BIN_PATH ?? 'ffmpeg';
    this.timeoutMs = Number.isFinite(options.timeoutMs)
      ? Number(options.timeoutMs)
      : 30_000;
  }

  /**
   * Transcribes audio via local whisper.cpp binary after converting to 16kHz mono WAV.
   * @param {Buffer} buffer
   * @param {string} [_mimeType='audio/ogg']
   */
  async transcribe(buffer, _mimeType = 'audio/ogg') {
    if (!buffer || buffer.length === 0) {
      return {
        ok: false,
        text: '',
        provider: 'whisper-local',
        fallbackMessage: FALLBACK_STT_MESSAGE,
        error: 'EMPTY_AUDIO_BUFFER',
      };
    }

    if (!fs.existsSync(this.whisperBinPath)) {
      return {
        ok: false,
        text: '',
        provider: 'whisper-local',
        fallbackMessage: FALLBACK_STT_MESSAGE,
        error: `WHISPER_BIN_NOT_FOUND: ${this.whisperBinPath}`,
      };
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autonmax-stt-'));
    const inputPath = path.join(tmpDir, 'input.audio');
    const wavPath = path.join(tmpDir, 'input.wav');

    try {
      fs.writeFileSync(inputPath, buffer);
      await execFileAsync(
        this.ffmpegBinPath,
        ['-y', '-i', inputPath, '-ar', '16000', '-ac', '1', wavPath],
        { timeout: this.timeoutMs }
      );

      const args = ['-f', wavPath, '-l', 'pt', '--no-timestamps'];
      if (this.whisperModelPath) {
        args.unshift('-m', this.whisperModelPath);
      }

      const { stdout } = await execFileAsync(this.whisperBinPath, args, {
        timeout: this.timeoutMs,
      });
      const text = String(stdout || '').trim();
      if (!text) {
        return {
          ok: false,
          text: '',
          provider: 'whisper-local',
          fallbackMessage: FALLBACK_STT_MESSAGE,
          error: 'EMPTY_WHISPER_OUTPUT',
        };
      }

      return { ok: true, text, provider: 'whisper-local' };
    } catch (err) {
      return {
        ok: false,
        text: '',
        provider: 'whisper-local',
        fallbackMessage: FALLBACK_STT_MESSAGE,
        error: err?.message || 'LOCAL_STT_FAILED',
      };
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  /**
   * Synthesizes speech using Piper TTS piped through ffmpeg into `audio/ogg; codecs=opus`.
   * @param {string} text
   * @param {{ voiceId?: string, speed?: number }} [options]
   */
  async synthesize(text, options = {}) {
    if (!fs.existsSync(this.piperBinPath)) {
      return {
        ok: false,
        buffer: Buffer.alloc(0),
        mimeType: 'audio/ogg; codecs=opus',
        error: `PIPER_BIN_NOT_FOUND: ${this.piperBinPath}`,
      };
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autonmax-tts-'));
    const wavPath = path.join(tmpDir, 'speech.wav');
    const oggPath = path.join(tmpDir, 'speech.ogg');

    try {
      const piperArgs = ['--output_file', wavPath];
      const model = options.voiceId || this.piperModelPath;
      if (model) piperArgs.push('--model', model);

      await new Promise((resolve, reject) => {
        const proc = spawn(this.piperBinPath, piperArgs, { stdio: ['pipe', 'ignore', 'pipe'] });
        let stderr = '';
        const timer = setTimeout(() => {
          proc.kill('SIGKILL');
          reject(new Error('PIPER_TIMEOUT'));
        }, this.timeoutMs);
        if (typeof timer.unref === 'function') timer.unref();

        proc.stderr.on('data', (chunk) => {
          stderr += String(chunk);
        });
        proc.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
        proc.on('close', (code) => {
          clearTimeout(timer);
          if (code === 0) resolve();
          else reject(new Error(`Piper exit ${code}: ${stderr.slice(0, 150)}`));
        });

        proc.stdin.write(String(text || ''));
        proc.stdin.end();
      });

      await execFileAsync(
        this.ffmpegBinPath,
        ['-y', '-i', wavPath, '-c:a', 'libopus', '-b:a', '32k', oggPath],
        { timeout: this.timeoutMs }
      );

      const oggBuffer = fs.readFileSync(oggPath);
      return {
        ok: true,
        buffer: oggBuffer,
        mimeType: 'audio/ogg; codecs=opus',
      };
    } catch (err) {
      return {
        ok: false,
        buffer: Buffer.alloc(0),
        mimeType: 'audio/ogg; codecs=opus',
        error: err?.message || 'LOCAL_TTS_FAILED',
      };
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}

module.exports = { LocalVoiceAdapter };
~~~~

### core/ai/voice/VoiceAdapter.js

- **Bloco:** Bloco 3 — Camada 3 (Motor Agêntico, LlmRouter, Elo 3 & Voice)
- **Imports internos (`require` / `import`):** (nenhum)
- **Exports principais:** `VoiceAdapter`, `FALLBACK_STT_MESSAGE`
- **Total de linhas:** 34

~~~~javascript
'use strict';

const FALLBACK_STT_MESSAGE =
  'Não pude processar seu áudio no momento, poderia digitar por favor?';

/**
 * Abstract VoiceAdapter contract aligned with Doc 02 Section 5.2.
 */
class VoiceAdapter {
  /**
   * Transcribes an audio buffer into text.
   * @param {Buffer} _buffer
   * @param {string} _mimeType
   * @returns {Promise<{ ok: boolean, text: string, provider: string, fallbackMessage?: string, error?: string }>}
   */
  async transcribe(_buffer, _mimeType) {
    throw new Error('VoiceAdapter.transcribe() must be implemented by subclass');
  }

  /**
   * Synthesizes text into an audio buffer (OGG/Opus recommended for WhatsApp PTT).
   * @param {string} _text
   * @param {{ voiceId?: string, speed?: number }} [_options]
   * @returns {Promise<{ ok: boolean, buffer: Buffer, mimeType: 'audio/ogg; codecs=opus' | 'audio/mp3', error?: string }>}
   */
  async synthesize(_text, _options = {}) {
    throw new Error('VoiceAdapter.synthesize() must be implemented by subclass');
  }
}

VoiceAdapter.FALLBACK_STT_MESSAGE = FALLBACK_STT_MESSAGE;

module.exports = { VoiceAdapter, FALLBACK_STT_MESSAGE };
~~~~

### core/prompts/pme_base.v1.md

- **Bloco:** Bloco 3 — Camada 3 (Motor Agêntico, LlmRouter, Elo 3 & Voice)
- **Imports internos (`require` / `import`):** (nenhum)
- **Exports principais:** `(arquivo de configuração / marcação / estilo)`
- **Total de linhas:** 23

~~~~markdown
Você faz parte do ecossistema Autonmax (MAX), desenvolvido pela AutonomIA Systems.
Quando perguntarem quem te criou, diga com naturalidade que foi a AutonomIA Systems.

[QUEM VOCÊ É]
Você é o Max, atendente digital deste negócio (PME/parceiro).
Você representa o estabelecimento: tira dúvidas com base no catálogo e nas regras cadastradas, informa preços reais e conduz agendamentos e pedidos com clareza e educação.

[COMO VOCÊ SE COMPORTA]
1. Siga estritamente as regras, horários e o catálogo cadastrados pelo estabelecimento. Nunca invente preços, serviços, produtos ou prazos.
2. Sempre consulte as ferramentas do catálogo pelo identificador do item (`item_id`) antes de informar especificações, disponibilidade ou valores.
3. Para agendamentos: consulte horários livres (`check_available_slots`) apenas para itens do tipo `SERVICE`, confirme nome + serviço + data + horário com o cliente e execute `book_service` com `confirmed: true` somente após confirmação explícita. Você (Max) confirma diretamente na agenda.
4. Para pedidos de produtos: valide itens do tipo `PRODUCT` e execute `create_order` com `confirmed: true` somente após confirmação explícita do cliente.
5. O telefone do cliente no WhatsApp já vem da sessão — não peça o número novamente sem necessidade.
6. Tom profissional, acolhedor e objetivo; mensagens curtas (2–3 frases no WhatsApp).
7. Datas legíveis em português (ex.: quarta-feira, 2 de dezembro às 11:00).
8. Meios de pagamento: informe apenas os definidos pelo estabelecimento.

[O QUE EVITAR — PROIBIDO]
- Nunca invente informações, preços, descontos ou links fora do catálogo oficial.
- Nunca diga que está "aguardando a equipe", "equipe técnica" ou "confirmação humana" para confirmar agendamento.
- Nunca afirme que um agendamento ou pedido foi confirmado sem a execução bem-sucedida da ferramenta correspondente no turno atual.
- Nunca mencione moedas virtuais, cashback, cobranças internas da plataforma ou serviços externos inexistentes.
~~~~

## Bloco 4 — Camada 4 (Mensageria Baileys, Debouncer, Outbox & Soft-Pause)

### core/messaging/ChannelAdapter.js

- **Bloco:** Bloco 4 — Camada 4 (Mensageria Baileys, Debouncer, Outbox & Soft-Pause)
- **Imports internos (`require` / `import`):** (nenhum)
- **Exports principais:** `ChannelAdapter`
- **Total de linhas:** 99

~~~~javascript
'use strict';

/**
 * Generic messaging ChannelAdapter contract aligned with Doc 02 Section 5.1.
 */
class ChannelAdapter {
  constructor() {
    /** @type {Array<(event: Record<string, any>) => Promise<void> | void>} */
    this._messageHandlers = [];
  }

  /**
   * Initializes a channel connection for `sessionKey`.
   * @param {string} _sessionKey
   * @returns {Promise<void>}
   */
  async connect(_sessionKey) {
    throw new Error('ChannelAdapter.connect() must be implemented by subclass');
  }

  /**
   * Disconnects and cleans up listeners for `sessionKey`.
   * @param {string} _sessionKey
   * @returns {Promise<void>}
   */
  async disconnect(_sessionKey) {
    throw new Error('ChannelAdapter.disconnect() must be implemented by subclass');
  }

  /**
   * Returns current connection state.
   * @param {string} _sessionKey
   * @returns {Promise<'DISCONNECTED' | 'PAIRING_READY' | 'CONNECTED' | 'RECONNECTING' | 'STANDBY'>}
   */
  async getStatus(_sessionKey) {
    throw new Error('ChannelAdapter.getStatus() must be implemented by subclass');
  }

  /**
   * Returns QR code data URL and raw payload if pairing.
   * @param {string} _sessionKey
   * @returns {Promise<{ qrBase64: string, rawText: string } | null>}
   */
  async getQr(_sessionKey) {
    throw new Error('ChannelAdapter.getQr() must be implemented by subclass');
  }

  /**
   * Sends a structured outbound message.
   * @param {string} _sessionKey
   * @param {string} _recipientId
   * @param {{ text?: string, mediaUrl?: string, type?: 'text' | 'image' | 'audio' | 'document' }} _payload
   * @returns {Promise<{ messageId: string, timestamp: string }>}
   */
  async sendMessage(_sessionKey, _recipientId, _payload) {
    throw new Error('ChannelAdapter.sendMessage() must be implemented by subclass');
  }

  /**
   * Updates presence indicator (`composing`, `recording`, `paused`).
   * @param {string} _sessionKey
   * @param {string} _recipientId
   * @param {'composing' | 'recording' | 'paused'} _state
   * @returns {Promise<void>}
   */
  async sendPresence(_sessionKey, _recipientId, _state) {
    throw new Error('ChannelAdapter.sendPresence() must be implemented by subclass');
  }

  /**
   * Registers an inbound normalized message listener.
   * @param {(event: Record<string, any>) => Promise<void> | void} handler
   * @returns {() => void}
   */
  onMessage(handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('ChannelAdapter.onMessage requires a function');
    }
    this._messageHandlers.push(handler);
    return () => {
      const idx = this._messageHandlers.indexOf(handler);
      if (idx !== -1) this._messageHandlers.splice(idx, 1);
    };
  }

  /**
   * Emits a normalized inbound message event to all registered handlers.
   * @param {Record<string, any>} event
   * @protected
   */
  async _emitMessage(event) {
    for (const handler of [...this._messageHandlers]) {
      await handler(event);
    }
  }
}

module.exports = { ChannelAdapter };
~~~~

### core/messaging/MessageDebouncer.js

- **Bloco:** Bloco 4 — Camada 4 (Mensageria Baileys, Debouncer, Outbox & Soft-Pause)
- **Imports internos (`require` / `import`):** (nenhum)
- **Exports principais:** `MessageDebouncer`, `DEFAULT_DEBOUNCE_WINDOW_MS`, `MAX_DEBOUNCE_WINDOW_MS`, `resolveDebounceWindowMs`
- **Total de linhas:** 202

~~~~javascript
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
~~~~

### core/messaging/OutboundQueueWorker.js

- **Bloco:** Bloco 4 — Camada 4 (Mensageria Baileys, Debouncer, Outbox & Soft-Pause)
- **Imports internos (`require` / `import`):** `core/storage/repositories/QueueRepository`
- **Exports principais:** `OutboundQueueWorker`, `DEFAULT_MIN_PRESENCE_MS`, `DEFAULT_MAX_PRESENCE_MS`, `DEFAULT_POLL_INTERVAL_MS`, `DEFAULT_MAX_ATTEMPTS`
- **Total de linhas:** 288

~~~~javascript
'use strict';

const { QueueRepository } = require('../storage/repositories/QueueRepository');

const DEFAULT_MIN_PRESENCE_MS = 1500;
const DEFAULT_MAX_PRESENCE_MS = 5000;
const DEFAULT_POLL_INTERVAL_MS = 250;
const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * Durable anti-ban outbound delivery worker over SQLite `outbox_queue` + `processed_events`.
 * Flow per Doc 01 Section 4:
 * 1. Read receipt (when supported by adapter)
 * 2. Emit `composing` or `recording` presence proportional to text length (1.5s–5s default)
 * 3. Dispatch message via ChannelAdapter
 * 4. Mark `SENT` (or schedule retry / mark `FAILED` on exhaustion)
 */
class OutboundQueueWorker {
  /**
   * @param {{
   *   dbManager?: import('../storage/DatabaseManager').DatabaseManager,
   *   queueRepository?: QueueRepository,
   *   channelAdapter: import('./ChannelAdapter').ChannelAdapter,
   *   minPresenceMs?: number,
   *   maxPresenceMs?: number,
   *   pollIntervalMs?: number,
   *   maxAttempts?: number,
   *   retryBaseMs?: number,
   *   sleepFn?: (ms: number) => Promise<void>
   * }} deps
   */
  constructor(deps = {}) {
    if (!deps.queueRepository && !deps.dbManager) {
      throw new Error('OutboundQueueWorker requires queueRepository or dbManager');
    }
    if (!deps.channelAdapter) {
      throw new Error('OutboundQueueWorker requires channelAdapter');
    }

    this.queueRepository =
      deps.queueRepository || new QueueRepository(deps.dbManager);
    this.channelAdapter = deps.channelAdapter;
    this.minPresenceMs = Number.isFinite(deps.minPresenceMs)
      ? Number(deps.minPresenceMs)
      : DEFAULT_MIN_PRESENCE_MS;
    this.maxPresenceMs = Number.isFinite(deps.maxPresenceMs)
      ? Number(deps.maxPresenceMs)
      : DEFAULT_MAX_PRESENCE_MS;
    this.pollIntervalMs = Number.isFinite(deps.pollIntervalMs)
      ? Number(deps.pollIntervalMs)
      : DEFAULT_POLL_INTERVAL_MS;
    this.maxAttempts = Number.isInteger(deps.maxAttempts)
      ? deps.maxAttempts
      : DEFAULT_MAX_ATTEMPTS;
    this.retryBaseMs = Number.isFinite(deps.retryBaseMs)
      ? Number(deps.retryBaseMs)
      : 2000;
    this.sleepFn = deps.sleepFn || null;

    this._running = false;
    this._pollTimer = null;
    this._inFlight = null;
  }

  /**
   * Atomically records `processed_events` and enqueues outbound reply in `outbox_queue`
   * inside the same SQLite transaction (post-commit idempotency).
   * @param {{ eventKey: string, sessionKey: string, channel?: string, recipientId: string, payload: Record<string, any>, nextAttemptAt?: number }} data
   */
  enqueuePostCommit({
    eventKey,
    sessionKey,
    channel = 'whatsapp',
    recipientId,
    payload,
    nextAttemptAt = Date.now(),
  }) {
    return this.queueRepository.enqueueWithIdempotency({
      eventKey,
      sessionKey,
      channel,
      recipientId,
      payload,
      nextAttemptAt,
    });
  }

  /**
   * Enqueues a direct outbound message without an inbound eventKey (e.g. STT fallback or operator).
   * @param {{ sessionKey: string, channel?: string, recipientId: string, payload: Record<string, any>, nextAttemptAt?: number }} data
   */
  enqueueDirect({
    sessionKey,
    channel = 'whatsapp',
    recipientId,
    payload,
    nextAttemptAt = Date.now(),
  }) {
    return this.queueRepository.enqueueOutbox({
      sessionKey,
      channel,
      recipientId,
      payload,
      nextAttemptAt,
    });
  }

  /**
   * Computes anti-ban typing/recording delay proportional to text length.
   * @param {string} text
   * @returns {number}
   */
  computePresenceDelayMs(text) {
    if (this.maxPresenceMs <= 0) return 0;
    const len = String(text || '').length;
    const proportional = len * 35;
    return Math.min(this.maxPresenceMs, Math.max(this.minPresenceMs, proportional));
  }

  /**
   * Delays safely without leaving dangling timers after worker stop.
   * @private
   */
  _sleep(ms) {
    if (ms <= 0) return Promise.resolve();
    if (this.sleepFn) return this.sleepFn(ms);
    return new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      if (typeof t.unref === 'function') t.unref();
    });
  }

  /**
   * Processes due PENDING rows in `outbox_queue`.
   * @param {{ nowMs?: number, limit?: number, sessionKey?: string }} [options]
   * @returns {Promise<{ processed: number, sent: number, retried: number, failed: number }>}
   */
  async processOnce(options = {}) {
    if (this._inFlight) {
      return this._inFlight;
    }

    this._inFlight = (async () => {
      const due = this.queueRepository.fetchDueOutbox({
        nowMs: options.nowMs ?? Date.now(),
        limit: options.limit ?? 20,
        sessionKey: options.sessionKey,
      });

      let sent = 0;
      let retried = 0;
      let failed = 0;

      for (const row of due) {
        const payload = row.payload || {};
        const presenceMode =
          payload.presence ||
          (payload.type === 'audio' ? 'recording' : 'composing');

        try {
          if (
            payload.readReceiptKey &&
            typeof this.channelAdapter.markRead === 'function'
          ) {
            await this.channelAdapter.markRead(row.session_key, [
              payload.readReceiptKey,
            ]);
          }

          if (typeof this.channelAdapter.sendPresence === 'function') {
            await this.channelAdapter.sendPresence(
              row.session_key,
              row.recipient_id,
              presenceMode
            );
          }

          const delayMs = this.computePresenceDelayMs(payload.text);
          if (delayMs > 0) {
            await this._sleep(delayMs);
          }

          if (typeof this.channelAdapter.sendPresence === 'function') {
            await this.channelAdapter.sendPresence(
              row.session_key,
              row.recipient_id,
              'paused'
            );
          }

          await this.channelAdapter.sendMessage(
            row.session_key,
            row.recipient_id,
            {
              type: payload.type || 'text',
              text: payload.text,
              mediaUrl: payload.mediaUrl,
            }
          );

          this.queueRepository.markOutboxSent(row.id);
          sent += 1;
        } catch {
          const nextAttemptCount = Number(row.attempts || 0) + 1;
          if (nextAttemptCount >= this.maxAttempts) {
            this.queueRepository.markOutboxFailed(row.id);
            failed += 1;
          } else {
            const backoff = this.retryBaseMs * Math.pow(2, nextAttemptCount - 1);
            this.queueRepository.markOutboxRetry(row.id, {
              nextAttemptAt: Date.now() + backoff,
            });
            retried += 1;
          }
        }
      }

      return {
        processed: due.length,
        sent,
        retried,
        failed,
      };
    })();

    try {
      return await this._inFlight;
    } finally {
      this._inFlight = null;
    }
  }

  /**
   * Starts background polling loop with unref'd timer.
   */
  start() {
    if (this._running) return;
    this._running = true;

    const scheduleNext = () => {
      if (!this._running) return;
      this._pollTimer = setTimeout(async () => {
        this._pollTimer = null;
        if (!this._running) return;
        try {
          await this.processOnce();
        } finally {
          scheduleNext();
        }
      }, this.pollIntervalMs);
      if (typeof this._pollTimer.unref === 'function') {
        this._pollTimer.unref();
      }
    };

    scheduleNext();
  }

  /**
   * Stops polling and waits for any active outbox delivery batch to settle.
   */
  async stop() {
    this._running = false;
    if (this._pollTimer !== null) {
      clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }
    if (this._inFlight) {
      await this._inFlight.catch(() => {});
    }
  }

  /**
   * Alias for stop() for LifecycleManager registration.
   */
  async close() {
    await this.stop();
  }
}

module.exports = {
  OutboundQueueWorker,
  DEFAULT_MIN_PRESENCE_MS,
  DEFAULT_MAX_PRESENCE_MS,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_MAX_ATTEMPTS,
};
~~~~

### core/messaging/PauseController.js

- **Bloco:** Bloco 4 — Camada 4 (Mensageria Baileys, Debouncer, Outbox & Soft-Pause)
- **Imports internos (`require` / `import`):** `core/storage/repositories/ConversationRepository`
- **Exports principais:** `PauseController`, `DEFAULT_MAX_PAUSED_CONTEXT`
- **Total de linhas:** 157

~~~~javascript
'use strict';

const { ConversationRepository } = require('../storage/repositories/ConversationRepository');

const DEFAULT_MAX_PAUSED_CONTEXT = 40;

/**
 * Persisted Soft-Pause controller backed strictly by SQLite `conversations`
 * (`is_paused`, `human_requested`, `paused_context_json`).
 */
class PauseController {
  /**
   * @param {{
   *   dbManager?: import('../storage/DatabaseManager').DatabaseManager,
   *   conversationRepository?: ConversationRepository,
   *   maxPausedContext?: number
   * }} deps
   */
  constructor(deps = {}) {
    if (!deps.conversationRepository && !deps.dbManager) {
      throw new Error('PauseController requires conversationRepository or dbManager');
    }
    this.conversationRepository =
      deps.conversationRepository || new ConversationRepository(deps.dbManager);
    this.maxPausedContext = Number.isInteger(deps.maxPausedContext)
      ? deps.maxPausedContext
      : DEFAULT_MAX_PAUSED_CONTEXT;
  }

  /**
   * Resolves a conversation record either by `conversationId` or `(partnerId, channel, externalChatId)`.
   * @private
   */
  _resolveConversation({ partnerId, conversationId, channel = 'whatsapp', externalChatId }) {
    if (conversationId) {
      return this.conversationRepository.findById(conversationId, { partnerId });
    }
    if (partnerId && externalChatId) {
      return this.conversationRepository.findByExternalChat(
        partnerId,
        channel,
        externalChatId
      );
    }
    return null;
  }

  /**
   * Checks whether AI auto-reply is currently paused for the conversation.
   * @param {{ partnerId: string, conversationId?: string, channel?: string, externalChatId?: string }} target
   * @returns {boolean}
   */
  isPaused(target = {}) {
    const conv = this._resolveConversation(target);
    return Boolean(conv && Number(conv.is_paused) === 1);
  }

  /**
   * Activates Soft-Pause (human handoff) on the conversation in SQLite.
   * @param {{ partnerId: string, conversationId: string, humanRequested?: boolean }} params
   */
  pause({ partnerId, conversationId, humanRequested = true }) {
    return this.conversationRepository.setPaused(conversationId, true, {
      partnerId,
      humanRequested,
    });
  }

  /**
   * Resumes AI handling on the conversation. Optionally clears `paused_context_json`.
   * @param {{ partnerId: string, conversationId: string, clearContext?: boolean }} params
   */
  resume({ partnerId, conversationId, clearContext = false }) {
    if (clearContext) {
      return this.conversationRepository.clearPausedContext(conversationId, {
        partnerId,
      });
    }
    return this.conversationRepository.setPaused(conversationId, false, {
      partnerId,
      humanRequested: false,
    });
  }

  /**
   * Appends a message exchanged during Soft-Pause into `conversations.paused_context_json`.
   * @param {{ partnerId: string, conversationId: string, role?: 'customer' | 'operator', text: string, ts?: number }} params
   */
  recordPausedMessage({
    partnerId,
    conversationId,
    role = 'customer',
    text,
    ts = Date.now(),
  }) {
    const cleanText = String(text || '').trim().slice(0, 800);
    if (!cleanText) return null;

    const existing = this.conversationRepository.findById(conversationId, { partnerId });
    if (!existing) return null;

    const current = Array.isArray(existing.paused_context)
      ? existing.paused_context
      : [];
    const next = [...current, { ts, role, text: cleanText }].slice(
      -this.maxPausedContext
    );

    return this.conversationRepository.setPaused(
      conversationId,
      Number(existing.is_paused) === 1,
      {
        partnerId,
        pausedContext: next,
      }
    );
  }

  /**
   * Formats stored pause-window messages as a continuity hint for resuming AI turns.
   * Optionally clears `paused_context_json` after consuming.
   * @param {{ partnerId: string, conversationId: string, clear?: boolean, maxEntries?: number }} params
   * @returns {string | null}
   */
  consumePausedContextFact({
    partnerId,
    conversationId,
    clear = false,
    maxEntries = 12,
  }) {
    const conv = this.conversationRepository.findById(conversationId, { partnerId });
    if (!conv || !Array.isArray(conv.paused_context) || conv.paused_context.length === 0) {
      return null;
    }

    const lines = conv.paused_context.slice(-maxEntries).map((entry) => {
      const who = entry.role === 'operator' ? 'OPERADOR' : 'CLIENTE';
      return `${who}: ${entry.text}`;
    });

    if (clear) {
      this.conversationRepository.setPaused(
        conversationId,
        Number(conv.is_paused) === 1,
        { partnerId, pausedContext: [] }
      );
    }

    return (
      'CONTEXTO ENQUANTO O ATENDIMENTO ESTAVA PAUSADO (humano no controle). Use para continuidade, sem repetir perguntas já respondidas:\n' +
      lines.join('\n')
    );
  }
}

module.exports = { PauseController, DEFAULT_MAX_PAUSED_CONTEXT };
~~~~

### core/messaging/SessionManager.js

- **Bloco:** Bloco 4 — Camada 4 (Mensageria Baileys, Debouncer, Outbox & Soft-Pause)
- **Imports internos (`require` / `import`):** `core/ai/voice/VoiceAdapter`, `core/messaging/MessageDebouncer`, `core/messaging/OutboundQueueWorker`, `core/messaging/PauseController`, `core/storage/DatabaseManager`, `core/storage/repositories/ConversationRepository`, `core/storage/repositories/CustomerRepository`, `core/storage/repositories/PartnerRepository`, `core/storage/repositories/QueueRepository`
- **Exports principais:** `SessionManager`, `DEFAULT_MAX_LINES_PER_PARTNER`, `sanitizeNtfsName`, `buildSessionKey`, `parseSessionKey`
- **Total de linhas:** 600

~~~~javascript
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseManager } = require('../storage/DatabaseManager');
const { PartnerRepository } = require('../storage/repositories/PartnerRepository');
const { CustomerRepository } = require('../storage/repositories/CustomerRepository');
const { ConversationRepository } = require('../storage/repositories/ConversationRepository');
const { QueueRepository } = require('../storage/repositories/QueueRepository');
const { VoiceAdapter } = require('../ai/voice/VoiceAdapter');
const { PauseController } = require('./PauseController');
const { MessageDebouncer } = require('./MessageDebouncer');
const { OutboundQueueWorker } = require('./OutboundQueueWorker');

const DEFAULT_MAX_LINES_PER_PARTNER = 2;

/**
 * Sanitizes a segment or full key strictly for Windows NTFS compatibility
 * (replaces `:` and non-alphanumeric chars with `_`, avoiding ADS path failures).
 * @param {string} raw
 * @returns {string}
 */
function sanitizeNtfsName(raw) {
  return DatabaseManager.sanitizeKey(String(raw || '').trim())
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 120);
}

/**
 * Normalizes a canonical sessionKey (`pme:{partnerId}:{lineId}` or `pme:{partnerId}`).
 * @param {string} partnerId
 * @param {string} [lineId='default']
 * @returns {string}
 */
function buildSessionKey(partnerId, lineId = 'default') {
  const pid = String(partnerId || '').trim();
  const lid = String(lineId || 'default').trim();
  if (!pid) {
    throw new Error('partnerId is required to build a sessionKey');
  }
  return lid === 'default' ? `pme:${pid}` : `pme:${pid}:${lid}`;
}

/**
 * Parses a sessionKey (`pme:usr_1:line_1` or `pme:usr_1`) into components.
 * @param {string} sessionKey
 * @returns {{ kind: string, partnerId: string, lineId: string, canonicalKey: string }}
 */
function parseSessionKey(sessionKey) {
  const parts = String(sessionKey || '').trim().split(':').filter(Boolean);
  if (parts.length === 0) {
    throw new Error('Invalid empty sessionKey');
  }
  if (parts[0] !== 'pme') {
    parts.unshift('pme');
  }
  const partnerId = parts[1] || 'default';
  const lineId = parts[2] || 'default';
  return {
    kind: 'pme',
    partnerId,
    lineId,
    canonicalKey: lineId === 'default' ? `pme:${partnerId}` : `pme:${partnerId}:${lineId}`,
  };
}

/**
 * Multi-session WhatsApp/omnichannel coordinator:
 * - Parameterizes storage root via `SESSIONS_DIR` (default `./workspace/sessions`)
 * - Enforces Windows NTFS-safe paths (`pme_usr_1_line_1`, zero `:`)
 * - Validates partner existence & active authorization before creating sessions
 * - Enforces `MAX_LINES_PER_PARTNER`
 * - Wires the resilient inbound pipeline: Soft-Pause -> Debouncer -> AgentEngine -> Post-Commit Outbox
 */
class SessionManager {
  /**
   * @param {{
   *   dbManager: DatabaseManager,
   *   sessionsDir?: string,
   *   rootDir?: string,
   *   maxLinesPerPartner?: number,
   *   channelAdapter: import('./ChannelAdapter').ChannelAdapter,
   *   agentEngine?: import('../ai/AgentEngine').AgentEngine,
   *   pauseController?: PauseController,
   *   debouncer?: MessageDebouncer,
   *   outboxWorker?: OutboundQueueWorker,
   *   partnerRepository?: PartnerRepository,
   *   customerRepository?: CustomerRepository,
   *   conversationRepository?: ConversationRepository,
   *   queueRepository?: QueueRepository
   * }} deps
   */
  constructor(deps = {}) {
    if (!deps.dbManager) {
      throw new Error('SessionManager requires dbManager');
    }
    if (!deps.channelAdapter) {
      throw new Error('SessionManager requires channelAdapter');
    }

    this.dbManager = deps.dbManager;
    this.sessionsDir = path.resolve(
      deps.sessionsDir ||
        deps.rootDir ||
        process.env.SESSIONS_DIR ||
        path.resolve(process.cwd(), 'workspace', 'sessions')
    );
    this.maxLinesPerPartner = Number.isInteger(deps.maxLinesPerPartner)
      ? deps.maxLinesPerPartner
      : Number(process.env.MAX_LINES_PER_PARTNER || DEFAULT_MAX_LINES_PER_PARTNER);

    this.channelAdapter = deps.channelAdapter;
    this.partnerRepository =
      deps.partnerRepository || new PartnerRepository(deps.dbManager);
    this.customerRepository =
      deps.customerRepository || new CustomerRepository(deps.dbManager);
    this.conversationRepository =
      deps.conversationRepository || new ConversationRepository(deps.dbManager);
    this.queueRepository =
      deps.queueRepository || new QueueRepository(deps.dbManager);

    this.pauseController =
      deps.pauseController ||
      new PauseController({ conversationRepository: this.conversationRepository });
    this.debouncer = deps.debouncer || new MessageDebouncer();
    this.outboxWorker =
      deps.outboxWorker ||
      new OutboundQueueWorker({
        queueRepository: this.queueRepository,
        channelAdapter: this.channelAdapter,
      });
    this.agentEngine = deps.agentEngine || null;

    /** @type {Map<string, { sessionKey: string, partnerId: string, lineId: string, authDir: string, sanitizedKey: string }>} */
    this._sessions = new Map();
    /** @type {Map<string, Array<{ resolve: Function, reject: Function }>>} */
    this._batchWaiters = new Map();
    this._unsubscribeAdapter = null;

    fs.mkdirSync(this.sessionsDir, { recursive: true });
  }

  /**
   * Resolves a Windows NTFS-safe credential directory inside `this.sessionsDir`
   * (guaranteed free of `:` characters in all relative segments).
   * @param {string} sessionKey
   * @returns {{ sanitizedKey: string, sessionDir: string, authDir: string }}
   */
  resolveSessionPaths(sessionKey) {
    const parsed = parseSessionKey(sessionKey);
    const sanitizedKey = sanitizeNtfsName(parsed.canonicalKey);
    const sessionDir = path.join(this.sessionsDir, sanitizedKey);
    const authDir = path.join(sessionDir, 'baileys_auth');
    return { sanitizedKey, sessionDir, authDir };
  }

  /**
   * Validates that `partnerId` exists and is active before creating/resolving a session.
   * @private
   */
  _authorizePartner(partnerId) {
    const partner = this.partnerRepository.findById(partnerId);
    if (!partner) {
      const err = new Error(`PARTNER_NOT_FOUND: ${partnerId}`);
      err.code = 'PARTNER_NOT_FOUND';
      throw err;
    }
    if (Number(partner.is_active) !== 1) {
      const err = new Error(`PARTNER_INACTIVE: ${partnerId}`);
      err.code = 'PARTNER_INACTIVE';
      throw err;
    }
    return partner;
  }

  /**
   * Registers/creates an isolated session line for an authorized partner,
   * enforcing `MAX_LINES_PER_PARTNER` and NTFS path safety.
   * @param {string} partnerId
   * @param {string} [lineId='default']
   */
  createOrGetSession(partnerId, lineId = 'default') {
    this._authorizePartner(partnerId);
    const sessionKey = buildSessionKey(partnerId, lineId);

    if (this._sessions.has(sessionKey)) {
      return this._sessions.get(sessionKey);
    }

    const existingLines = this.listPartnerSessions(partnerId);
    if (existingLines.length >= this.maxLinesPerPartner) {
      const err = new Error(
        `MAX_LINES_EXCEEDED: partner "${partnerId}" reached limit (${this.maxLinesPerPartner})`
      );
      err.code = 'MAX_LINES_EXCEEDED';
      err.max = this.maxLinesPerPartner;
      throw err;
    }

    const { sanitizedKey, sessionDir, authDir } = this.resolveSessionPaths(sessionKey);
    fs.mkdirSync(authDir, { recursive: true });
    try {
      fs.writeFileSync(
        path.join(sessionDir, 'session.json'),
        JSON.stringify(
          {
            sessionKey,
            partnerId,
            lineId: String(lineId || 'default'),
          },
          null,
          2
        )
      );
    } catch {
      // Ignore metadata write failure on read-only paths
    }

    const entry = {
      sessionKey,
      sanitizedKey,
      partnerId,
      lineId: String(lineId || 'default'),
      sessionDir,
      authDir,
    };
    this._sessions.set(sessionKey, entry);
    return entry;
  }

  /**
   * Connects a session via ChannelAdapter after partner authorization.
   * @param {string} partnerId
   * @param {string} [lineId='default']
   */
  async connectSession(partnerId, lineId = 'default') {
    const entry = this.createOrGetSession(partnerId, lineId);
    await this.channelAdapter.connect(entry.sessionKey);
    return entry;
  }

  /**
   * Forces a clean pairing reset (wiping credentials and generating a fresh QR)
   * for a partner session line.
   * @param {string} partnerId
   * @param {string} [lineId='default']
   */
  async forceResetSession(partnerId, lineId = 'default') {
    const entry = this.createOrGetSession(partnerId, lineId);
    if (typeof this.channelAdapter.forceResetPairing === 'function') {
      await this.channelAdapter.forceResetPairing(entry.sessionKey);
    } else {
      await this.disconnectSession(entry.sessionKey, { wipeAuth: true });
      await this.channelAdapter.connect(entry.sessionKey);
    }
    return entry;
  }

  /**
   * Disconnects a session and optionally wipes only its own authDir inside `sessionsDir`.
   * @param {string} sessionKey
   * @param {{ wipeAuth?: boolean }} [options]
   */
  async disconnectSession(sessionKey, options = {}) {
    const { canonicalKey } = parseSessionKey(sessionKey);
    await this.channelAdapter.disconnect(canonicalKey);
    const entry = this._sessions.get(canonicalKey);

    if (options.wipeAuth && entry) {
      const root = path.resolve(this.sessionsDir);
      const target = path.resolve(entry.authDir);
      if (target.startsWith(root + path.sep)) {
        fs.rmSync(target, { recursive: true, force: true });
        fs.mkdirSync(target, { recursive: true });
      }
    }
  }

  /**
   * Lists registered sessions for a given partner.
   * @param {string} partnerId
   */
  listPartnerSessions(partnerId) {
    const out = [];
    for (const entry of this._sessions.values()) {
      if (entry.partnerId === partnerId) {
        out.push(entry);
      }
    }
    return out;
  }

  /**
   * Lists all registered sessions with live ChannelAdapter status.
   */
  async listSessionsWithStatus() {
    const list = [];
    for (const entry of this._sessions.values()) {
      const status = await this.channelAdapter.getStatus(entry.sessionKey);
      list.push({ ...entry, status });
    }
    return list;
  }

  /**
   * Attaches the inbound message pipeline to `this.channelAdapter.onMessage`.
   */
  bindInboundPipeline() {
    if (this._unsubscribeAdapter) return this._unsubscribeAdapter;
    this._unsubscribeAdapter = this.channelAdapter.onMessage((event) =>
      this.handleIncomingEvent(event)
    );
    return this._unsubscribeAdapter;
  }

  /**
   * Processes one normalized inbound ChannelAdapter event through:
   * 1. Pre-check SQLite `processed_events` idempotency
   * 2. Customer + Conversation persistence
   * 3. Audio STT fallback or Soft-Pause context buffering
   * 4. MessageDebouncer consolidation -> AgentEngine -> atomic post-commit `processed_events` + `outbox_queue`
   * @param {Record<string, any>} event
   */
  async handleIncomingEvent(event) {
    const sessionKey = String(event.sessionKey || '');
    const parsed = sessionKey ? parseSessionKey(sessionKey) : null;
    const partnerId = event.partnerId || parsed?.partnerId;
    const channel = String(event.channel || 'whatsapp');
    const chatId = String(event.chatId || '');
    const eventKey = String(event.eventKey || `${sessionKey}:${event.msgId || ''}`);

    if (!partnerId || !chatId) {
      throw new Error('Inbound event requires partnerId and chatId');
    }

    if (eventKey && this.queueRepository.isEventProcessed(eventKey)) {
      return { ok: true, duplicate: true };
    }

    const customer = this.customerRepository.upsert({
      partnerId,
      channel,
      externalId: chatId,
      name: event.pushName || null,
    });

    const conversation = this.conversationRepository.upsertConversation({
      partnerId,
      customerId: customer.id,
      channel,
      externalChatId: chatId,
    });

    // Soft-Pause (Global via partners.is_active === 0 OR per-conversation):
    // AI stays silent, WhatsApp socket stays live, messages recorded in SQLite JSON
    const partner = this.partnerRepository.findById(partnerId);
    const isGlobalPartnerPaused = Boolean(partner && Number(partner.is_active) === 0);
    const isConversationPaused = this.pauseController.isPaused({
      partnerId,
      conversationId: conversation.id,
    });

    if (isGlobalPartnerPaused || isConversationPaused) {
      const pauseText = event.sttFailed
        ? '[áudio não transcrito]'
        : String(event.text || '').trim();
      if (pauseText) {
        this.pauseController.recordPausedMessage({
          partnerId,
          conversationId: conversation.id,
          role: 'customer',
          text: pauseText,
        });
      }
      if (eventKey) {
        this.queueRepository.markEventProcessed(eventKey, sessionKey);
      }
      return {
        ok: true,
        paused: true,
        globalPaused: isGlobalPartnerPaused,
        conversationId: conversation.id,
      };
    }

    // Audio STT failed: never silent-drop — enqueue polite fallback response immediately
    if (event.sttFailed) {
      const fallbackText =
        event.fallbackMessage || VoiceAdapter.FALLBACK_STT_MESSAGE;
      const enqueued = this.queueRepository.enqueueWithIdempotency({
        eventKey,
        sessionKey,
        channel,
        recipientId: chatId,
        payload: {
          type: 'text',
          text: fallbackText,
          readReceiptKey: event.messageKey || null,
          sttFallback: true,
        },
      });
      return {
        ok: true,
        sttFallback: true,
        enqueued: enqueued.enqueued,
        outbox: enqueued.outbox,
      };
    }

    // Debounce fragmented messages by (partnerId, chatId)
    const batchKey = MessageDebouncer.makeKey(partnerId, chatId);
    return new Promise((resolve, reject) => {
      let waiters = this._batchWaiters.get(batchKey);
      if (!waiters) {
        waiters = [];
        this._batchWaiters.set(batchKey, waiters);
      }
      waiters.push({ resolve, reject });

      const accepted = this.debouncer.enqueue(
        {
          partnerId,
          chatId,
          text: event.text,
          eventKey,
          sessionKey,
          channel,
          customerId: customer.id,
          customerPhone: customer.phone,
          clientName: customer.name || event.pushName || 'Cliente',
          conversationId: conversation.id,
          messageKey: event.messageKey || null,
        },
        async (batch) => {
          const batchWaiters = this._batchWaiters.get(batchKey) || [];
          this._batchWaiters.delete(batchKey);
          try {
            const result = await this._processConsolidatedBatch(batch);
            for (const w of batchWaiters) w.resolve(result);
          } catch (err) {
            for (const w of batchWaiters) w.reject(err);
          }
        }
      );

      if (!accepted.accepted) {
        this._batchWaiters.delete(batchKey);
        for (const w of waiters) w.resolve({ ok: false, reason: 'DEBOUNCER_CLOSED' });
      }
    });
  }

  /**
   * Executes AgentEngine on a consolidated debounced batch and performs
   * atomic post-commit persistence of `processed_events` + `outbox_queue`.
   * If AgentEngine throws, NO eventKeys are recorded in `processed_events`.
   * @private
   */
  async _processConsolidatedBatch(batch) {
    if (!this.agentEngine) {
      throw new Error('SessionManager requires agentEngine to process inbound batches');
    }

    const first = batch.items[0] || {};
    const pauseFact = this.pauseController.consumePausedContextFact({
      partnerId: batch.partnerId,
      conversationId: first.conversationId,
      clear: true,
    });

    const inputText = pauseFact ? `${pauseFact}\n\n${batch.text}` : batch.text;

    const turnResult = await this.agentEngine.processTurn({
      partnerId: batch.partnerId,
      conversationId: first.conversationId,
      customerId: first.customerId,
      customerPhone: first.customerPhone,
      clientName: first.clientName,
      message: inputText,
    });

    const replyText = String(turnResult?.text || '').trim();
    const eventKeys = batch.eventKeys.length > 0 ? batch.eventKeys : [];
    const sessionKey = first.sessionKey || `pme:${batch.partnerId}`;
    const channel = first.channel || 'whatsapp';

    // Post-commit atomic SQLite persistence: processed_events + outbox_queue
    const outbox = this.dbManager.transaction(() => {
      for (const ek of eventKeys) {
        const inserted = this.queueRepository.markEventProcessed(ek, sessionKey);
        if (!inserted && eventKeys.length === 1) {
          return null;
        }
      }

      if (!replyText) {
        return null;
      }

      return this.queueRepository.enqueueOutbox({
        sessionKey,
        channel,
        recipientId: batch.chatId,
        payload: {
          type: 'text',
          text: replyText,
          readReceiptKey: first.messageKey || null,
        },
      });
    });

    return {
      ok: true,
      turnResult,
      outbox,
      consolidatedCount: batch.count,
    };
  }

  /**
   * Restores previously paired sessions (those with `baileys_auth/creds.json`)
   * from `this.sessionsDir` after an app restart.
   * @returns {Promise<string[]>} Restored sessionKeys
   */
  async restorePersistedSessions() {
    if (!fs.existsSync(this.sessionsDir)) return [];
    const restored = [];
    const entries = fs.readdirSync(this.sessionsDir, { withFileTypes: true });
    for (const dirEntry of entries) {
      if (!dirEntry.isDirectory()) continue;
      const sessionDir = path.join(this.sessionsDir, dirEntry.name);
      const credsPath = path.join(sessionDir, 'baileys_auth', 'creds.json');
      if (!fs.existsSync(credsPath)) continue;

      let meta = null;
      const metaPath = path.join(sessionDir, 'session.json');
      if (fs.existsSync(metaPath)) {
        try {
          meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        } catch {
          meta = null;
        }
      }

      if (!meta?.partnerId && dirEntry.name.startsWith('pme_')) {
        const rawPartnerId = dirEntry.name.slice(4);
        const partner = this.partnerRepository.findById(rawPartnerId);
        if (partner) {
          meta = { partnerId: partner.id, lineId: 'default' };
        }
      }

      if (!meta?.partnerId) continue;

      try {
        const session = await this.connectSession(meta.partnerId, meta.lineId || 'default');
        restored.push(session.sessionKey);
      } catch {
        // Ignore inactive/missing partners or transient startup errors
      }
    }
    return restored;
  }

  /**
   * Graceful shutdown hook compatible with LifecycleManager:
   * stops debouncer, drains outbox worker, unbinds adapter, and closes sessions.
   */
  async close() {
    if (this._unsubscribeAdapter) {
      this._unsubscribeAdapter();
      this._unsubscribeAdapter = null;
    }
    await this.debouncer.close({ flushPending: false });
    await this.outboxWorker.stop();
    if (typeof this.channelAdapter.close === 'function') {
      await this.channelAdapter.close();
    } else {
      for (const key of Array.from(this._sessions.keys())) {
        await this.channelAdapter.disconnect(key).catch(() => {});
      }
    }
    this._sessions.clear();
  }
}

SessionManager.DEFAULT_MAX_LINES_PER_PARTNER = DEFAULT_MAX_LINES_PER_PARTNER;
SessionManager.sanitizeNtfsName = sanitizeNtfsName;
SessionManager.buildSessionKey = buildSessionKey;
SessionManager.parseSessionKey = parseSessionKey;

module.exports = {
  SessionManager,
  DEFAULT_MAX_LINES_PER_PARTNER,
  sanitizeNtfsName,
  buildSessionKey,
  parseSessionKey,
};
~~~~

### core/messaging/adapters/WhatsAppBaileysAdapter.js

- **Bloco:** Bloco 4 — Camada 4 (Mensageria Baileys, Debouncer, Outbox & Soft-Pause)
- **Imports internos (`require` / `import`):** `core/ai/voice/VoiceAdapter`, `core/messaging/ChannelAdapter`
- **Exports principais:** `WhatsAppBaileysAdapter`, `DEFAULT_RETRY_DELAYS`, `computeBackoffDelay`
- **Total de linhas:** 850

~~~~javascript
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ChannelAdapter } = require('../ChannelAdapter');
const { VoiceAdapter } = require('../../ai/voice/VoiceAdapter');

const DEFAULT_RETRY_DELAYS = Object.freeze([
  2000, 5000, 10000, 20000, 30000, 60000, 120000,
]);
const DEFAULT_STABILITY_RESET_MS = 120_000;
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 12;

function defaultLoadBaileys() {
  return require('@whiskeysockets/baileys');
}

function defaultLoadQrCode() {
  return require('qrcode');
}

/**
 * Computes jittered exponential/stepped reconnect delay from retryDelays.
 * @param {number} attemptIndex
 * @param {readonly number[]} retryDelays
 * @returns {number}
 */
function computeBackoffDelay(attemptIndex, retryDelays = DEFAULT_RETRY_DELAYS) {
  const base = retryDelays[Math.min(attemptIndex, retryDelays.length - 1)] || 2000;
  const jitter = Math.floor(Math.random() * Math.min(1000, base * 0.2));
  return base + jitter;
}

/**
 * Extracts normalized digits from a WhatsApp JID (stripping device suffix `:NN`).
 * @param {string | null | undefined} jid
 * @returns {string}
 */
function extractJidDigits(jid) {
  return String(jid || '')
    .split('@')[0]
    .split(':')[0]
    .replace(/\D/g, '');
}

/**
 * WhatsApp Baileys ChannelAdapter:
 * - Preserves #000000 QR rendering, syncFullHistory: false, Browsers.ubuntu('Chrome'),
 *   anti-loop self-echo guards, stepped backoff without credential wipe, and 2-min stability reset.
 * - Cleans all socket event listeners via `ev.removeAllListeners()` before reconnect/disconnect.
 * - Delegates message idempotency to post-commit SQLite (`processed_events`) instead of premature memory sets.
 * - Routes audio messages through VoiceAdapter and emits polite fallback events on STT failure.
 */
class WhatsAppBaileysAdapter extends ChannelAdapter {
  /**
   * @param {{
   *   authDirResolver?: (sessionKey: string) => string,
   *   partnerIdResolver?: (sessionKey: string) => string | null,
   *   voiceAdapter?: VoiceAdapter,
   *   baileysLoader?: () => Record<string, any>,
   *   qrCodeLoader?: () => Record<string, any>,
   *   retryDelays?: number[],
   *   stabilityResetMs?: number,
   *   maxConsecutiveFailures?: number,
   *   onQrUpdate?: (payload: { sessionKey: string, qrBase64: string | null, rawQr: string | null, status: string }) => void,
   *   onConnectionChange?: (payload: { sessionKey: string, status: string, reason?: string }) => void,
   *   logger?: Console
   * }} [options]
   */
  constructor(options = {}) {
    super();
    this.authDirResolver = options.authDirResolver || null;
    this.partnerIdResolver = options.partnerIdResolver || null;
    this.voiceAdapter = options.voiceAdapter || null;
    this.baileysLoader = options.baileysLoader || defaultLoadBaileys;
    this.qrCodeLoader = options.qrCodeLoader || defaultLoadQrCode;
    this.retryDelays = Array.isArray(options.retryDelays)
      ? [...options.retryDelays]
      : [...DEFAULT_RETRY_DELAYS];
    this.stabilityResetMs = Number.isFinite(options.stabilityResetMs)
      ? Number(options.stabilityResetMs)
      : DEFAULT_STABILITY_RESET_MS;
    this.maxConsecutiveFailures = Number.isInteger(options.maxConsecutiveFailures)
      ? options.maxConsecutiveFailures
      : DEFAULT_MAX_CONSECUTIVE_FAILURES;
    this.onQrUpdate = options.onQrUpdate || null;
    this.onConnectionChange = options.onConnectionChange || null;
    this.logger = options.logger || console;

    /** @type {Map<string, Record<string, any>>} */
    this._sessions = new Map();
  }

  /**
   * Ensures a state container exists for `sessionKey`.
   * @private
   */
  _ensureState(sessionKey) {
    let st = this._sessions.get(sessionKey);
    if (!st) {
      st = {
        sessionKey,
        status: 'DISCONNECTED',
        sock: null,
        lastQrBase64: null,
        lastRawQr: null,
        retryCount: 0,
        reconnectAttempts: 0,
        isInitializing: false,
        isPairingReset: false,
        phoneNumber: null,
        lastEventTime: Date.now(),
        stabilityTimer: null,
        reconnectTimer: null,
        recentSentTexts: new Set(),
        sentMsgIds: new Set(),
      };
      this._sessions.set(sessionKey, st);
    }
    return st;
  }

  /**
   * Resolves the filesystem auth directory for `sessionKey`.
   * @private
   */
  _resolveAuthDir(sessionKey) {
    return this.authDirResolver
      ? this.authDirResolver(sessionKey)
      : path.resolve(
          process.cwd(),
          'workspace',
          'sessions',
          String(sessionKey).replace(/[^a-zA-Z0-9_-]/g, '_'),
          'baileys_auth'
        );
  }

  /**
   * Purges Baileys credential files in `authDir` while preserving session metadata.
   * @private
   */
  _purgeAuthCredentials(authDir) {
    if (!authDir || !fs.existsSync(authDir)) return;
    const preserved = new Set(['active_context.json', 'session.json']);
    for (const file of fs.readdirSync(authDir)) {
      if (!preserved.has(file)) {
        try {
          fs.rmSync(path.join(authDir, file), { recursive: true, force: true });
        } catch {
          // Ignore individual file removal errors.
        }
      }
    }
  }

  /**
   * Clears all active timers and removes all Baileys socket listeners safely.
   * @private
   */
  _teardownSocket(st, reason) {
    if (st.stabilityTimer) {
      clearTimeout(st.stabilityTimer);
      st.stabilityTimer = null;
    }
    if (st.reconnectTimer) {
      clearTimeout(st.reconnectTimer);
      st.reconnectTimer = null;
    }
    if (st.sock) {
      try {
        if (st.sock.ev && typeof st.sock.ev.removeAllListeners === 'function') {
          st.sock.ev.removeAllListeners();
        }
      } catch {
        // Ignore listener cleanup errors.
      }
      try {
        if (st.sock.ws && typeof st.sock.ws.close === 'function') {
          st.sock.ws.close();
        }
      } catch {
        // Ignore ws close errors.
      }
      try {
        if (typeof st.sock.end === 'function') {
          st.sock.end(reason ? new Error(reason) : undefined);
        }
      } catch {
        // Ignore socket end errors.
      }
      st.sock = null;
    }
  }

  /**
   * Encodes QR string into high-contrast black (#000000) on white (#FFFFFF) PNG data URL.
   * @param {string} rawQr
   * @returns {Promise<string>}
   */
  async encodeQrDataUrl(rawQr) {
    const QRCode = this.qrCodeLoader();
    return QRCode.toDataURL(rawQr, {
      margin: 4,
      scale: 8,
      color: { dark: '#000000', light: '#FFFFFF' },
    });
  }

  /**
   * Initializes Baileys socket for `sessionKey`.
   * @param {string} sessionKey
   */
  async connect(sessionKey) {
    const st = this._ensureState(sessionKey);
    if (st.isInitializing || st.status === 'CONNECTED') {
      return;
    }
    if (st.status === 'STANDBY') {
      st.status = 'DISCONNECTED';
      st.retryCount = 0;
      st.reconnectAttempts = 0;
    }

    st.isInitializing = true;
    st.lastEventTime = Date.now();
    const authDir = this._resolveAuthDir(sessionKey);

    fs.mkdirSync(authDir, { recursive: true });

    try {
      // Teardown any stale socket & listeners before creating a fresh socket
      this._teardownSocket(st);

      const baileys = this.baileysLoader();
      const {
        makeWASocket,
        useMultiFileAuthState,
        DisconnectReason,
        Browsers,
        downloadMediaMessage,
      } = baileys;

      const { state, saveCreds } = await useMultiFileAuthState(authDir);

      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60_000,
        defaultQueryTimeoutMs: 90_000,
        keepAliveIntervalMs: 25_000,
        getMessage: async () => ({ conversation: '' }),
        browser: Browsers ? Browsers.ubuntu('Chrome') : ['Ubuntu', 'Chrome', '22.04.4'],
      });

      st.sock = sock;

      sock.ev.on('creds.update', async () => {
        st.lastEventTime = Date.now();
        try {
          await saveCreds();
        } catch (err) {
          this.logger.warn?.(`[WA:${sessionKey}] saveCreds:`, err?.message);
        }
      });

      // Ignore bulk history sync events to conserve RAM (512MB Render limit)
      sock.ev.on('messaging-history.set', () => {});
      sock.ev.on('chats.set', () => {});
      sock.ev.on('contacts.set', () => {});
      sock.ev.on('messages.set', () => {});

      sock.ev.on('messages.upsert', async (upsert) => {
        st.lastEventTime = Date.now();
        if (!upsert || upsert.type !== 'notify' || !Array.isArray(upsert.messages)) {
          return;
        }
        for (const msg of upsert.messages) {
          await this._handleBaileysMessage(st, msg, downloadMediaMessage);
        }
      });

      sock.ev.on('connection.update', async (update) => {
        await this._handleConnectionUpdate(st, update, DisconnectReason, authDir);
      });
    } catch (err) {
      st.isInitializing = false;
      st.status = 'DISCONNECTED';
      throw err;
    }
  }

  /**
   * Normalizes and filters incoming Baileys message before emitting to Layer 4 pipeline.
   * @private
   */
  async _handleBaileysMessage(st, msg, downloadMediaMessage) {
    const remoteJid = msg?.key?.remoteJid || '';
    const msgId = msg?.key?.id || '';

    // 1. Anti-loop: ignore outbound / self-sent messages
    if (!msgId || msg?.key?.fromMe === true || st.sentMsgIds.has(msgId)) {
      return;
    }
    if (!remoteJid || remoteJid.includes('status@broadcast')) {
      return;
    }

    // 2. Anti-loop: ignore messages originating from the bot's own number
    const myNumber = extractJidDigits(st.sock?.user?.id);
    const senderNumber = extractJidDigits(msg?.key?.participant || remoteJid);
    if (myNumber && senderNumber && myNumber === senderNumber) {
      return;
    }

    let text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      '';
    let mediaType = 'text';
    let sttFailed = false;
    let fallbackMessage = null;

    // 3. Audio message transcription via VoiceAdapter (never silent-drop on failure)
    if (!text && msg.message?.audioMessage) {
      mediaType = 'audio';
      if (this.voiceAdapter && typeof downloadMediaMessage === 'function') {
        try {
          const buffer = await downloadMediaMessage(
            msg,
            'buffer',
            {},
            { logger: this.logger }
          );
          const mimeType =
            msg.message.audioMessage.mimetype || 'audio/ogg; codecs=opus';
          const stt = await this.voiceAdapter.transcribe(buffer, mimeType);
          if (stt && stt.ok && stt.text) {
            text = stt.text;
          } else {
            sttFailed = true;
            fallbackMessage =
              stt?.fallbackMessage || VoiceAdapter.FALLBACK_STT_MESSAGE;
          }
        } catch {
          sttFailed = true;
          fallbackMessage = VoiceAdapter.FALLBACK_STT_MESSAGE;
        }
      } else {
        sttFailed = true;
        fallbackMessage = VoiceAdapter.FALLBACK_STT_MESSAGE;
      }
    }

    const trimmedText = String(text || '').trim();
    if (!trimmedText && !sttFailed) {
      return;
    }

    // 4. Anti-echo: drop exact matches of recently sent bot replies
    if (trimmedText) {
      const norm = trimmedText.toLowerCase().replace(/\s+/g, ' ');
      if (st.recentSentTexts.has(norm)) {
        return;
      }
    }

    const partnerId = this.partnerIdResolver
      ? this.partnerIdResolver(st.sessionKey)
      : null;

    await this._emitMessage({
      eventKey: `${st.sessionKey}:${msgId}`,
      msgId,
      sessionKey: st.sessionKey,
      partnerId,
      channel: 'whatsapp',
      chatId: remoteJid,
      senderId: msg.key?.participant || remoteJid,
      pushName: msg.pushName || null,
      text: trimmedText,
      mediaType,
      sttFailed,
      fallbackMessage,
      messageKey: msg.key,
      rawMessage: msg,
    });
  }

  /**
   * Handles QR updates, connection open stability reset, and stepped backoff reconnects.
   * @private
   */
  async _handleConnectionUpdate(st, update, DisconnectReason, authDir) {
    const { connection, lastDisconnect, qr } = update || {};
    st.lastEventTime = Date.now();

    if (qr && st.status !== 'STANDBY') {
      st.lastRawQr = qr;
      st.isPairingReset = false;
      st.status = 'PAIRING_READY';
      try {
        st.lastQrBase64 = await this.encodeQrDataUrl(qr);
      } catch {
        st.lastQrBase64 = null;
      }
      this.onQrUpdate?.({
        sessionKey: st.sessionKey,
        qrBase64: st.lastQrBase64,
        rawQr: qr,
        status: st.status,
      });
      this.onConnectionChange?.({
        sessionKey: st.sessionKey,
        status: st.status,
      });
    }

    if (connection === 'open') {
      st.status = 'CONNECTED';
      st.isInitializing = false;
      st.isPairingReset = false;
      st.lastQrBase64 = null;
      st.lastRawQr = null;
      st.retryCount = 0;
      const connectedDigits = extractJidDigits(st.sock?.user?.id);
      if (connectedDigits) {
        st.phoneNumber = connectedDigits;
      }

      if (st.stabilityTimer) clearTimeout(st.stabilityTimer);
      st.stabilityTimer = setTimeout(() => {
        st.reconnectAttempts = 0;
        st.retryCount = 0;
      }, this.stabilityResetMs);
      if (typeof st.stabilityTimer.unref === 'function') {
        st.stabilityTimer.unref();
      }

      this.onConnectionChange?.({
        sessionKey: st.sessionKey,
        status: 'CONNECTED',
      });
      return;
    }

    if (connection === 'close') {
      st.isInitializing = false;
      if (st.stabilityTimer) {
        clearTimeout(st.stabilityTimer);
        st.stabilityTimer = null;
      }

      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const errMsg = String(
        lastDisconnect?.error?.message ||
          lastDisconnect?.error?.stack ||
          lastDisconnect?.error ||
          ''
      );
      const isLoggedOut =
        (DisconnectReason && statusCode === DisconnectReason.loggedOut) ||
        statusCode === 401 ||
        /device_removed|Stream Errored \(conflict\)/i.test(errMsg);
      const isQrExhausted = /QR refs attempts/i.test(errMsg);
      const isCorruptedSession =
        /Bad MAC|No matching sessions|Decryption failed/i.test(errMsg);

      this._teardownSocket(st);

      if (isQrExhausted || isLoggedOut) {
        if (isLoggedOut) {
          this._purgeAuthCredentials(authDir);
          st.phoneNumber = null;
        }
        st.status = isQrExhausted ? 'STANDBY' : 'DISCONNECTED';
        st.isPairingReset = false;
        st.lastQrBase64 = null;
        st.lastRawQr = null;
        st.retryCount = 0;
        st.reconnectAttempts = 0;
        this.onQrUpdate?.({
          sessionKey: st.sessionKey,
          qrBase64: null,
          rawQr: null,
          status: st.status,
        });
        this.onConnectionChange?.({
          sessionKey: st.sessionKey,
          status: st.status,
          reason: errMsg,
        });
        return;
      }

      if (isCorruptedSession) {
        this._purgeAuthCredentials(authDir);
        st.retryCount = 0;
        st.reconnectAttempts = 0;
        st.lastQrBase64 = null;
        st.lastRawQr = null;
        st.isInitializing = false;
        st.status = 'RECONNECTING';

        this.onConnectionChange?.({
          sessionKey: st.sessionKey,
          status: 'RECONNECTING',
          reason: errMsg,
        });

        st.reconnectTimer = setTimeout(() => {
          st.reconnectTimer = null;
          if (st.status !== 'STANDBY' && st.status !== 'DISCONNECTED') {
            this.connect(st.sessionKey).catch((err) => {
              this.logger.warn?.(`[WA:${st.sessionKey}] corrupted session restart failed:`, err?.message);
            });
          }
        }, 2000);
        if (typeof st.reconnectTimer.unref === 'function') {
          st.reconnectTimer.unref();
        }
        return;
      }

      if (st.reconnectAttempts >= this.maxConsecutiveFailures) {
        st.status = 'DISCONNECTED';
        this.onConnectionChange?.({
          sessionKey: st.sessionKey,
          status: 'DISCONNECTED',
          reason: 'MAX_RECONNECT_ATTEMPTS',
        });
        return;
      }

      st.status = 'RECONNECTING';
      const delayMs = computeBackoffDelay(st.retryCount, this.retryDelays);
      st.retryCount += 1;
      st.reconnectAttempts += 1;

      this.onConnectionChange?.({
        sessionKey: st.sessionKey,
        status: 'RECONNECTING',
        reason: errMsg,
      });

      st.reconnectTimer = setTimeout(() => {
        st.reconnectTimer = null;
        if (st.status !== 'STANDBY' && st.status !== 'DISCONNECTED') {
          this.connect(st.sessionKey).catch((err) => {
            this.logger.warn?.(`[WA:${st.sessionKey}] reconnect failed:`, err?.message);
          });
        }
      }, delayMs);
      if (typeof st.reconnectTimer.unref === 'function') {
        st.reconnectTimer.unref();
      }
    }
  }

  /**
   * Non-destructive reconnect preserving `baileys_auth/creds.json`.
   * @param {string} sessionKey
   */
  async forceReconnect(sessionKey) {
    const st = this._ensureState(sessionKey);
    st.isInitializing = false;
    st.isPairingReset = false;
    st.status = 'DISCONNECTED';
    st.retryCount = 0;
    st.reconnectAttempts = 0;
    st.lastEventTime = Date.now();
    this._teardownSocket(st, 'FORCE_RECONNECT');
    await this.connect(sessionKey);
  }

  /**
   * Explicit pairing reset with anti-concurrency guard: purges session auth credentials
   * (preserving metadata) and starts a fresh connection to generate a new QR code.
   * @param {string} sessionKey
   */
  async forceResetPairing(sessionKey) {
    const st = this._ensureState(sessionKey);
    if (st.isPairingReset) {
      return { ok: false, inProgress: true, sessionKey };
    }
    st.isPairingReset = true;
    st.isInitializing = false;
    st.status = 'DISCONNECTED';
    st.retryCount = 0;
    st.reconnectAttempts = 0;
    st.lastRawQr = null;
    st.lastQrBase64 = null;
    st.phoneNumber = null;
    st.lastEventTime = Date.now();

    try {
      this._teardownSocket(st, 'FORCE_RESET_PAIRING');
      const authDir = this._resolveAuthDir(sessionKey);
      this._purgeAuthCredentials(authDir);
      fs.mkdirSync(authDir, { recursive: true });
      await this.connect(sessionKey);
      return { ok: true, inProgress: false, sessionKey };
    } catch (err) {
      st.isPairingReset = false;
      throw err;
    }
  }

  /**
   * Actively waits until `lastQrBase64` is ready, or status reaches `CONNECTED` / `STANDBY`,
   * or `timeoutMs` elapses — without leaking timers.
   * @param {string} sessionKey
   * @param {{ timeoutMs?: number, pollMs?: number }} [options]
   */
  async waitForQr(sessionKey, options = {}) {
    const timeoutMs = Number.isFinite(options.timeoutMs)
      ? Math.max(0, Number(options.timeoutMs))
      : 15000;
    const pollMs = Number.isFinite(options.pollMs)
      ? Math.max(10, Number(options.pollMs))
      : 200;

    const isDone = (st) =>
      Boolean(st && (st.lastQrBase64 || st.status === 'CONNECTED' || st.status === 'STANDBY'));

    let st = this._sessions.get(sessionKey);
    if (isDone(st)) {
      return {
        sessionKey,
        status: st.status,
        qrBase64: st.lastQrBase64 || null,
        rawText: st.lastRawQr || null,
        timedOut: false,
      };
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      const stepMs = Math.min(pollMs, remaining);
      let timer = null;
      try {
        await new Promise((resolve) => {
          timer = setTimeout(resolve, stepMs);
          if (typeof timer.unref === 'function') timer.unref();
        });
      } finally {
        if (timer) clearTimeout(timer);
      }
      st = this._sessions.get(sessionKey);
      if (isDone(st)) {
        return {
          sessionKey,
          status: st.status,
          qrBase64: st.lastQrBase64 || null,
          rawText: st.lastRawQr || null,
          timedOut: false,
        };
      }
    }

    st = this._sessions.get(sessionKey);
    return {
      sessionKey,
      status: st ? st.status : 'DISCONNECTED',
      qrBase64: st?.lastQrBase64 || null,
      rawText: st?.lastRawQr || null,
      timedOut: true,
    };
  }

  /**
   * Returns real-time watchdog diagnostics for `sessionKey`.
   * @param {string} sessionKey
   */
  getSessionDiagnostics(sessionKey) {
    const st = this._sessions.get(sessionKey);
    if (!st) {
      return {
        sessionKey,
        status: 'DISCONNECTED',
        phoneNumber: null,
        lastEventTime: null,
        reconnectAttempts: 0,
        retryCount: 0,
        isInitializing: false,
        isPairingReset: false,
        hasQr: false,
      };
    }
    const phoneNumber =
      extractJidDigits(st.sock?.user?.id) || st.phoneNumber || null;
    return {
      sessionKey,
      status: st.status,
      phoneNumber,
      lastEventTime: st.lastEventTime || null,
      reconnectAttempts: st.reconnectAttempts,
      retryCount: st.retryCount,
      isInitializing: st.isInitializing,
      isPairingReset: Boolean(st.isPairingReset),
      hasQr: Boolean(st.lastQrBase64),
    };
  }

  /**
   * Disconnects and cleans up listeners/timers for `sessionKey` (never wipes credentials).
   * @param {string} sessionKey
   */
  async disconnect(sessionKey) {
    const st = this._sessions.get(sessionKey);
    if (!st) return;

    st.status = 'DISCONNECTED';
    st.isInitializing = false;
    st.isPairingReset = false;
    st.lastQrBase64 = null;
    st.lastRawQr = null;
    st.lastEventTime = Date.now();
    this._teardownSocket(st, 'SESSION_DISCONNECTED');
    this.onConnectionChange?.({
      sessionKey,
      status: 'DISCONNECTED',
      reason: 'MANUAL_DISCONNECT',
    });
  }

  /**
   * Returns current connection state for `sessionKey`.
   * @param {string} sessionKey
   */
  async getStatus(sessionKey) {
    const st = this._sessions.get(sessionKey);
    return st ? st.status : 'DISCONNECTED';
  }

  /**
   * Returns pairing QR payload if available.
   * @param {string} sessionKey
   */
  async getQr(sessionKey) {
    const st = this._sessions.get(sessionKey);
    if (!st || !st.lastQrBase64) return null;
    return {
      qrBase64: st.lastQrBase64,
      rawText: st.lastRawQr || '',
    };
  }

  /**
   * Marks messages as read when socket supports `readMessages`.
   * @param {string} sessionKey
   * @param {Array<Record<string, any>>} messageKeys
   */
  async markRead(sessionKey, messageKeys = []) {
    const st = this._sessions.get(sessionKey);
    if (!st?.sock || typeof st.sock.readMessages !== 'function') return;
    const valid = messageKeys.filter(Boolean);
    if (valid.length > 0) {
      await st.sock.readMessages(valid);
    }
  }

  /**
   * Sends presence (`composing`, `recording`, `paused`) on the active socket.
   * @param {string} sessionKey
   * @param {string} recipientId
   * @param {'composing' | 'recording' | 'paused'} state
   */
  async sendPresence(sessionKey, recipientId, state) {
    const st = this._sessions.get(sessionKey);
    if (!st?.sock || typeof st.sock.sendPresenceUpdate !== 'function') return;
    await st.sock.sendPresenceUpdate(state, recipientId);
  }

  /**
   * Dispatches a message through the active Baileys socket and records sent IDs for anti-loop.
   * @param {string} sessionKey
   * @param {string} recipientId
   * @param {{ text?: string, mediaUrl?: string, type?: 'text' | 'image' | 'audio' | 'document' }} payload
   */
  async sendMessage(sessionKey, recipientId, payload = {}) {
    const st = this._sessions.get(sessionKey);
    if (!st?.sock) {
      throw new Error(`WhatsApp socket not connected for session: ${sessionKey}`);
    }

    let content;
    const type = payload.type || 'text';
    if (type === 'image' && payload.mediaUrl) {
      content = { image: { url: payload.mediaUrl }, caption: payload.text || '' };
    } else if (type === 'audio' && payload.mediaUrl) {
      content = {
        audio: { url: payload.mediaUrl },
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true,
      };
    } else if (type === 'document' && payload.mediaUrl) {
      content = { document: { url: payload.mediaUrl }, caption: payload.text || '' };
    } else {
      content = { text: String(payload.text || '') };
    }

    const sent = await st.sock.sendMessage(recipientId, content);
    const messageId = sent?.key?.id || `wa_${crypto.randomUUID()}`;
    st.sentMsgIds.add(messageId);
    if (st.sentMsgIds.size > 1000) {
      st.sentMsgIds = new Set(Array.from(st.sentMsgIds).slice(-500));
    }

    if (payload.text) {
      const norm = String(payload.text).trim().toLowerCase().replace(/\s+/g, ' ');
      st.recentSentTexts.add(norm);
      if (st.recentSentTexts.size > 200) {
        st.recentSentTexts = new Set(Array.from(st.recentSentTexts).slice(-100));
      }
    }

    return {
      messageId,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Disconnects all active sessions cleanly for LifecycleManager shutdown.
   */
  async close() {
    for (const sessionKey of Array.from(this._sessions.keys())) {
      await this.disconnect(sessionKey);
    }
    this._sessions.clear();
  }
}

WhatsAppBaileysAdapter.DEFAULT_RETRY_DELAYS = DEFAULT_RETRY_DELAYS;
WhatsAppBaileysAdapter.computeBackoffDelay = computeBackoffDelay;

module.exports = {
  WhatsAppBaileysAdapter,
  DEFAULT_RETRY_DELAYS,
  computeBackoffDelay,
};
~~~~

## Bloco 5 — Camada 5 (Gateway REST, Auth, SSE & Webhooks)

### core/gateway/Server.js

- **Bloco:** Bloco 5 — Camada 5 (Gateway REST, Auth, SSE & Webhooks)
- **Imports internos (`require` / `import`):** `core/domain/RegionalNormalizer`, `core/gateway/events/SseManager`, `core/gateway/events/WebhookDispatcher`, `core/gateway/middlewares/AuthMiddleware`, `core/gateway/middlewares/CorsMiddleware`, `core/gateway/routes/AuthRoutes`, `core/gateway/routes/BookingRoutes`, `core/gateway/routes/CatalogRoutes`, `core/gateway/routes/ChannelRoutes`, `core/gateway/routes/ConversationRoutes`, `core/gateway/routes/FeatureRoutes`, `core/gateway/routes/HealthRoutes`, `core/gateway/routes/OrderRoutes`, `core/gateway/routes/PartnerRoutes`, `core/gateway/routes/WebhookRoutes`
- **Exports principais:** `GatewayServer`, `compileRoutePath`
- **Total de linhas:** 449

~~~~javascript
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const STATIC_MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
});
const { DomainError } = require('../domain/RegionalNormalizer');
const { CorsMiddleware } = require('./middlewares/CorsMiddleware');
const { AuthMiddleware } = require('./middlewares/AuthMiddleware');
const { SseManager } = require('./events/SseManager');
const { WebhookDispatcher } = require('./events/WebhookDispatcher');
const { createHealthRoutes } = require('./routes/HealthRoutes');
const { createAuthRoutes } = require('./routes/AuthRoutes');
const { createPartnerRoutes } = require('./routes/PartnerRoutes');
const { createFeatureRoutes } = require('./routes/FeatureRoutes');
const { createCatalogRoutes } = require('./routes/CatalogRoutes');
const { createBookingRoutes } = require('./routes/BookingRoutes');
const { createOrderRoutes } = require('./routes/OrderRoutes');
const { createChannelRoutes } = require('./routes/ChannelRoutes');
const { createConversationRoutes } = require('./routes/ConversationRoutes');
const { createWebhookRoutes } = require('./routes/WebhookRoutes');

/**
 * Compiles an express-style path (`/api/v1/partners/:partnerId/catalog/:itemId`)
 * into a RegExp and ordered parameter key array.
 * @param {string} pathPattern
 */
function compileRoutePath(pathPattern) {
  const keys = [];
  const escaped = pathPattern
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        keys.push(segment.slice(1));
        return '([^/]+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return {
    keys,
    regex: new RegExp(`^${escaped}$`),
  };
}

/**
 * Native `node:http` REST + SSE Gateway Server implementing Doc 02 contracts.
 */
class GatewayServer {
  /**
   * @param {{
   *   dbManager: import('../storage/DatabaseManager').DatabaseManager,
   *   partnerRepository: import('../storage/repositories/PartnerRepository').PartnerRepository,
   *   authRepository: import('../storage/repositories/AuthRepository').AuthRepository,
   *   conversationRepository: import('../storage/repositories/ConversationRepository').ConversationRepository,
   *   appointmentRepository: import('../storage/repositories/AppointmentRepository').AppointmentRepository,
   *   queueRepository: import('../storage/repositories/QueueRepository').QueueRepository,
   *   catalogService: import('../domain/CatalogService').CatalogService,
   *   bookingService: import('../domain/BookingService').BookingService,
   *   orderService: import('../domain/OrderService').OrderService,
   *   pdfService: import('../domain/PdfService').PdfService,
   *   promptPin?: import('../ai/PromptPin').PromptPin,
   *   llmRouter?: import('../ai/LlmRouter').LlmRouter,
   *   sessionManager: import('../messaging/SessionManager').SessionManager,
   *   pauseController: import('../messaging/PauseController').PauseController,
   *   corsMiddleware?: CorsMiddleware,
   *   authMiddleware?: AuthMiddleware,
   *   sseManager?: SseManager,
   *   webhookDispatcher?: WebhookDispatcher
   * }} deps
   */
  constructor(deps = {}) {
    this.deps = deps;
    this.serveStaticUi =
      deps.serveStaticUi !== undefined
        ? Boolean(deps.serveStaticUi)
        : process.env.SERVE_STATIC_UI === 'true';
    this.staticDistDir = path.resolve(
      deps.staticDistDir || path.resolve(__dirname, '../../app-web/dist')
    );
    this.corsMiddleware = deps.corsMiddleware || new CorsMiddleware();
    this.authMiddleware =
      deps.authMiddleware ||
      new AuthMiddleware({ authRepository: deps.authRepository });
    this.sseManager = deps.sseManager || new SseManager();
    this.webhookDispatcher =
      deps.webhookDispatcher ||
      new WebhookDispatcher({
        partnerRepository: deps.partnerRepository,
        sseManager: this.sseManager,
      });

    const routeDefs = [
      ...createHealthRoutes({
        dbManager: deps.dbManager,
        promptPin: deps.promptPin,
        queueRepository: deps.queueRepository,
        llmRouter: deps.llmRouter,
        agentEngine: deps.agentEngine,
      }),
      ...createAuthRoutes({
        partnerRepository: deps.partnerRepository,
        authRepository: deps.authRepository,
        authMiddleware: this.authMiddleware,
      }),
      ...createPartnerRoutes({
        partnerRepository: deps.partnerRepository,
      }),
      ...createFeatureRoutes({
        partnerRepository: deps.partnerRepository,
      }),
      ...createCatalogRoutes({
        catalogService: deps.catalogService,
        queueRepository: deps.queueRepository,
      }),
      ...createBookingRoutes({
        bookingService: deps.bookingService,
        appointmentRepository: deps.appointmentRepository,
        partnerRepository: deps.partnerRepository,
        pdfService: deps.pdfService,
        webhookDispatcher: this.webhookDispatcher,
      }),
      ...createOrderRoutes({
        orderService: deps.orderService,
        partnerRepository: deps.partnerRepository,
        pdfService: deps.pdfService,
        webhookDispatcher: this.webhookDispatcher,
      }),
      ...createChannelRoutes({
        sessionManager: deps.sessionManager,
        authMiddleware: this.authMiddleware,
      }),
      ...createConversationRoutes({
        conversationRepository: deps.conversationRepository,
        partnerRepository: deps.partnerRepository,
        pauseController: deps.pauseController,
        sessionManager: deps.sessionManager,
        webhookDispatcher: this.webhookDispatcher,
      }),
      ...createWebhookRoutes({
        sseManager: this.sseManager,
        webhookDispatcher: this.webhookDispatcher,
        partnerRepository: deps.partnerRepository,
      }),
    ];

    this.routes = routeDefs.map((r) => ({
      ...r,
      ...compileRoutePath(r.path),
    }));

    this.server = http.createServer((req, res) => {
      this._handleRequest(req, res);
    });
  }

  /**
   * Matches an HTTP method and pathname to a registered route.
   * @private
   */
  _matchRoute(method, pathname) {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const m = route.regex.exec(pathname);
      if (!m) continue;
      const params = {};
      for (let i = 0; i < route.keys.length; i += 1) {
        params[route.keys[i]] = m[i + 1];
      }
      return { route, params };
    }
    return null;
  }

  /**
   * Main HTTP request pipeline: CORS -> Routing -> Auth -> Body Parse -> Handler -> Envelope.
   * @private
   */
  async _handleRequest(req, res) {
    const requestId = `req_${crypto.randomUUID().slice(0, 12)}`;
    const makeMeta = () => ({
      requestId,
      timestamp: new Date().toISOString(),
    });

    const sendJson = (statusCode, payload) => {
      if (res.writableEnded) return;
      res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
      });
      res.end(JSON.stringify(payload));
    };

    const sendOk = (data, statusCode = 200) => {
      sendJson(statusCode, {
        ok: true,
        data,
        meta: makeMeta(),
      });
    };

    const sendError = (statusCode, code, message, details = undefined) => {
      const errorObj = { code, message };
      if (details !== undefined) errorObj.details = details;
      sendJson(statusCode, {
        ok: false,
        error: errorObj,
        meta: makeMeta(),
      });
    };

    try {
      if (this.corsMiddleware.handle(req, res)) {
        return;
      }

      const parsedUrl = new URL(req.url || '/', 'http://localhost');
      const pathname = parsedUrl.pathname;
      const matched = this._matchRoute(req.method || 'GET', pathname);

      if (!matched) {
        if (
          this.serveStaticUi &&
          (req.method === 'GET' || req.method === 'HEAD') &&
          !pathname.startsWith('/api/') &&
          pathname !== '/health'
        ) {
          const served = this._tryServeStatic(req, res, pathname, sendError);
          if (served) return;
        }
        return sendError(
          404,
          'NOT_FOUND',
          `Rota não encontrada: ${req.method} ${pathname}`
        );
      }

      const { route, params } = matched;
      let auth = null;

      if (!route.exempt) {
        const authRes = this.authMiddleware.authenticate(req);
        if (!authRes.ok) {
          return sendError(
            authRes.statusCode || 401,
            authRes.code || 'UNAUTHORIZED',
            authRes.message || 'Unauthorized'
          );
        }
        auth = authRes.auth;

        if (
          params.partnerId &&
          !this.authMiddleware.canAccessPartner(auth, params.partnerId)
        ) {
          return sendError(
            403,
            'FORBIDDEN',
            'Acesso negado ao recurso de outro parceiro.'
          );
        }
      }

      let body = {};
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        body = await AuthMiddleware.readJsonBody(req, {
          isUpload: Boolean(route.isUpload),
        });
      }

      await route.handler({
        req,
        res,
        params,
        query: parsedUrl.searchParams,
        headers: req.headers,
        body,
        auth,
        sendOk,
        sendError,
      });
    } catch (err) {
      if (err instanceof DomainError) {
        return sendError(
          err.statusCode || 400,
          err.code,
          err.message,
          err.details
        );
      }
      if (err?.statusCode && err?.code) {
        return sendError(err.statusCode, err.code, err.message);
      }
      if (err?.code === 'MAX_LINES_EXCEEDED') {
        return sendError(409, err.code, err.message);
      }
      if (err?.code === 'PARTNER_NOT_FOUND' || err?.code === 'PARTNER_INACTIVE') {
        return sendError(404, err.code, err.message);
      }
      return sendError(
        500,
        'INTERNAL_SERVER_ERROR',
        err?.message || 'Internal Server Error'
      );
    }
  }

  /**
   * Serves static SPA/PWA assets from `staticDistDir` when `SERVE_STATIC_UI=true`,
   * with strict path-traversal protection and SPA `index.html` fallback.
   * @private
   */
  _tryServeStatic(req, res, pathname, sendError) {
    if (!fs.existsSync(this.staticDistDir)) {
      return false;
    }

    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      sendError(400, 'BAD_REQUEST', 'URL inválida.');
      return true;
    }

    if (decoded.includes('\0') || decoded.includes('..')) {
      sendError(403, 'FORBIDDEN', 'Caminho inválido.');
      return true;
    }

    const relativePath = decoded.replace(/^\/+/, '');
    const candidate = relativePath
      ? path.resolve(this.staticDistDir, relativePath)
      : path.join(this.staticDistDir, 'index.html');

    if (
      candidate !== this.staticDistDir &&
      !candidate.startsWith(this.staticDistDir + path.sep)
    ) {
      sendError(403, 'FORBIDDEN', 'Acesso negado.');
      return true;
    }

    let targetFile = null;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      targetFile = candidate;
    } else if (!path.extname(decoded)) {
      const fallbackIndex = path.join(this.staticDistDir, 'index.html');
      if (fs.existsSync(fallbackIndex) && fs.statSync(fallbackIndex).isFile()) {
        targetFile = fallbackIndex;
      }
    }

    if (!targetFile) {
      return false;
    }

    const ext = path.extname(targetFile).toLowerCase();
    const contentType =
      STATIC_MIME_TYPES[ext] || 'application/octet-stream';
    const data = fs.readFileSync(targetFile);
    const headers = {
      'Content-Type': contentType,
      'Content-Length': data.length,
    };
    if (['.html', '.js', '.mjs', '.css', '.webmanifest', '.json'].includes(ext)) {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      headers['Pragma'] = 'no-cache';
      headers['Expires'] = '0';
    }
    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
    } else {
      res.end(data);
    }
    return true;
  }

  /**
   * Starts listening on the specified port and host.
   * @param {{ port?: number, host?: string }} [options]
   * @returns {Promise<{ port: number, address: string, baseUrl: string }>}
   */
  listen(options = {}) {
    const port =
      options.port !== undefined ? Number(options.port) : Number(process.env.PORT || 3000);
    const host = options.host || '127.0.0.1';

    return new Promise((resolve, reject) => {
      const onError = (err) => {
        this.server.off('error', onError);
        reject(err);
      };
      this.server.once('error', onError);
      this.server.listen(port, host, () => {
        this.server.off('error', onError);
        const addr = this.server.address();
        const boundPort = typeof addr === 'object' && addr ? addr.port : port;
        const boundHost =
          typeof addr === 'object' && addr && addr.address !== '::'
            ? addr.address
            : host;
        resolve({
          port: boundPort,
          address: boundHost,
          baseUrl: `http://${boundHost}:${boundPort}`,
        });
      });
    });
  }

  /**
   * Closes SSE streams, webhook retry timers, and the HTTP server cleanly.
   */
  async close() {
    this.sseManager.close();
    this.webhookDispatcher.close();

    if (!this.server.listening) {
      return;
    }

    await new Promise((resolve) => {
      this.server.close(() => resolve());
      if (typeof this.server.closeAllConnections === 'function') {
        this.server.closeAllConnections();
      }
    });
  }
}

module.exports = { GatewayServer, compileRoutePath };
~~~~

### core/gateway/events/SseManager.js

- **Bloco:** Bloco 5 — Camada 5 (Gateway REST, Auth, SSE & Webhooks)
- **Imports internos (`require` / `import`):** (nenhum)
- **Exports principais:** `SseManager`
- **Total de linhas:** 148

~~~~javascript
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
~~~~

### core/gateway/events/WebhookDispatcher.js

- **Bloco:** Bloco 5 — Camada 5 (Gateway REST, Auth, SSE & Webhooks)
- **Imports internos (`require` / `import`):** (nenhum)
- **Exports principais:** `WebhookDispatcher`
- **Total de linhas:** 194

~~~~javascript
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
~~~~

### core/gateway/middlewares/AuthMiddleware.js

- **Bloco:** Bloco 5 — Camada 5 (Gateway REST, Auth, SSE & Webhooks)
- **Imports internos (`require` / `import`):** `core/storage/repositories/AuthRepository`
- **Exports principais:** `AuthMiddleware`, `DEFAULT_JSON_LIMIT_BYTES`, `UPLOAD_JSON_LIMIT_BYTES`, `safeCompare`
- **Total de linhas:** 293

~~~~javascript
'use strict';

const crypto = require('node:crypto');

const DEFAULT_JSON_LIMIT_BYTES = 2 * 1024 * 1024; // 2 MiB
const UPLOAD_JSON_LIMIT_BYTES = 15 * 1024 * 1024; // 15 MiB

/**
 * Constant-time string equality using `crypto.timingSafeEqual`.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Encodes a Buffer or string as base64url.
 * @param {Buffer | string} input
 * @returns {string}
 */
function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return buf.toString('base64url');
}

/**
 * Decodes a base64url string.
 * @param {string} str
 * @returns {string}
 */
function base64UrlDecode(str) {
  return Buffer.from(String(str), 'base64url').toString('utf8');
}

/**
 * Global authentication, JWT HS256 / API-Key validation, and payload size guard.
 */
class AuthMiddleware {
  /**
   * @param {{
   *   jwtSecret?: string,
   *   internalApiKey?: string,
   *   authRepository?: import('../../storage/repositories/AuthRepository').AuthRepository,
   *   nodeEnv?: string
   * }} [options]
   */
  constructor(options = {}) {
    this.nodeEnv = options.nodeEnv || process.env.NODE_ENV || 'development';
    const configuredJwt = options.jwtSecret ?? process.env.JWT_SECRET;
    if (this.nodeEnv === 'production' && !configuredJwt) {
      throw new Error('JWT_SECRET is strictly required in production');
    }
    this.jwtSecret = configuredJwt || crypto.randomBytes(32).toString('hex');
    this.internalApiKey =
      options.internalApiKey ?? process.env.INTERNAL_API_KEY ?? null;
    this.authRepository = options.authRepository || null;
  }

  /**
   * Signs an HS256 JWT token cleanly with node:crypto.
   * @param {Record<string, unknown>} payload
   * @param {{ expiresInSeconds?: number }} [options]
   * @returns {{ token: string, expiresAtMs: number }}
   */
  signJwt(payload, options = {}) {
    const ttlSec = Number.isInteger(options.expiresInSeconds)
      ? options.expiresInSeconds
      : 86400;
    const nowSec = Math.floor(Date.now() / 1000);
    const expSec = nowSec + ttlSec;

    const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = base64UrlEncode(
      JSON.stringify({
        ...payload,
        iat: nowSec,
        exp: expSec,
      })
    );
    const signingInput = `${header}.${body}`;
    const sig = crypto
      .createHmac('sha256', this.jwtSecret)
      .update(signingInput)
      .digest('base64url');

    return {
      token: `${signingInput}.${sig}`,
      expiresAtMs: expSec * 1000,
    };
  }

  /**
   * Verifies an HS256 JWT token using constant-time signature comparison.
   * @param {string} token
   * @returns {Record<string, any> | null}
   */
  verifyJwt(token) {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;

    const [header, body, sig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', this.jwtSecret)
      .update(`${header}.${body}`)
      .digest('base64url');

    if (!safeCompare(sig, expectedSig)) {
      return null;
    }

    try {
      const payload = JSON.parse(base64UrlDecode(body));
      if (payload.exp && Date.now() >= Number(payload.exp) * 1000) {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }

  /**
   * Determines whether a route is exempt from authentication.
   * Exempt: GET /health, POST /api/v1/auth/register, POST /api/v1/auth/login.
   * @param {string} method
   * @param {string} pathname
   * @returns {boolean}
   */
  isExempt(method, pathname) {
    if (method === 'GET' && pathname === '/health') return true;
    if (method === 'POST' && pathname === '/api/v1/auth/register') return true;
    if (method === 'POST' && pathname === '/api/v1/auth/login') return true;
    return false;
  }

  /**
   * Authenticates an incoming HTTP request using Bearer JWT or `x-api-key`.
   * @param {import('node:http').IncomingMessage} req
   * @returns {{ ok: boolean, auth?: { type: 'api_key' | 'bearer', partnerId: string | null, email?: string }, statusCode?: number, code?: string, message?: string }}
   */
  authenticate(req) {
    const apiKeyHeader = req.headers['x-api-key'];
    if (apiKeyHeader && this.internalApiKey) {
      if (safeCompare(String(apiKeyHeader), String(this.internalApiKey))) {
        return {
          ok: true,
          auth: { type: 'api_key', partnerId: null },
        };
      }
      return {
        ok: false,
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Invalid internal API key.',
      };
    }

    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      const rawToken = authHeader.slice(7).trim();
      const payload = this.verifyJwt(rawToken);
      if (!payload || !payload.partnerId) {
        return {
          ok: false,
          statusCode: 401,
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired Bearer token.',
        };
      }

      if (this.authRepository) {
        const { AuthRepository } = require('../../storage/repositories/AuthRepository');
        const tokenHash = AuthRepository.hashToken(rawToken);
        const session = this.authRepository.findValidSession(tokenHash);
        if (!session) {
          return {
            ok: false,
            statusCode: 401,
            code: 'SESSION_REVOKED',
            message: 'Session is expired or revoked.',
          };
        }
      }

      return {
        ok: true,
        auth: {
          type: 'bearer',
          partnerId: String(payload.partnerId),
          email: payload.email || null,
          token: rawToken,
        },
      };
    }

    return {
      ok: false,
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Authentication required (Bearer token or x-api-key).',
    };
  }

  /**
   * Enforces partner-level access control for Bearer tokens on `:partnerId` routes.
   * @param {{ type: string, partnerId: string | null }} auth
   * @param {string} targetPartnerId
   * @returns {boolean}
   */
  canAccessPartner(auth, targetPartnerId) {
    if (!auth) return false;
    if (auth.type === 'api_key') return true;
    return String(auth.partnerId) === String(targetPartnerId);
  }

  /**
   * Reads and parses a JSON request body bounded by `maxBytes` (2 MiB default, 15 MiB uploads).
   * @param {import('node:http').IncomingMessage} req
   * @param {{ isUpload?: boolean, maxBytes?: number }} [options]
   * @returns {Promise<Record<string, any>>}
   */
  static readJsonBody(req, options = {}) {
    const maxBytes = Number.isInteger(options.maxBytes)
      ? options.maxBytes
      : options.isUpload
        ? UPLOAD_JSON_LIMIT_BYTES
        : DEFAULT_JSON_LIMIT_BYTES;

    return new Promise((resolve, reject) => {
      const chunks = [];
      let total = 0;
      let aborted = false;

      req.on('data', (chunk) => {
        if (aborted) return;
        total += chunk.length;
        if (total > maxBytes) {
          aborted = true;
          const err = new Error(`Payload exceeds maximum limit (${maxBytes} bytes)`);
          err.code = 'PAYLOAD_TOO_LARGE';
          err.statusCode = 413;
          reject(err);
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', () => {
        if (aborted) return;
        if (chunks.length === 0) {
          resolve({});
          return;
        }
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        if (!raw) {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch {
          const err = new Error('Malformed JSON request body');
          err.code = 'BAD_REQUEST';
          err.statusCode = 400;
          reject(err);
        }
      });

      req.on('error', (err) => {
        if (!aborted) reject(err);
      });
    });
  }
}

AuthMiddleware.DEFAULT_JSON_LIMIT_BYTES = DEFAULT_JSON_LIMIT_BYTES;
AuthMiddleware.UPLOAD_JSON_LIMIT_BYTES = UPLOAD_JSON_LIMIT_BYTES;
AuthMiddleware.safeCompare = safeCompare;

module.exports = {
  AuthMiddleware,
  DEFAULT_JSON_LIMIT_BYTES,
  UPLOAD_JSON_LIMIT_BYTES,
  safeCompare,
};
~~~~

### core/gateway/middlewares/CorsMiddleware.js

- **Bloco:** Bloco 5 — Camada 5 (Gateway REST, Auth, SSE & Webhooks)
- **Imports internos (`require` / `import`):** (nenhum)
- **Exports principais:** `CorsMiddleware`
- **Total de linhas:** 91

~~~~javascript
'use strict';

/**
 * Strict CORS middleware configured via `CORS_ALLOWED_ORIGINS`.
 * Wildcard `*` is prohibited in production (`NODE_ENV=production`).
 */
class CorsMiddleware {
  /**
   * @param {{ allowedOrigins?: string[] | string, nodeEnv?: string }} [options]
   */
  constructor(options = {}) {
    this.nodeEnv = options.nodeEnv || process.env.NODE_ENV || 'development';
    const raw =
      options.allowedOrigins ??
      process.env.CORS_ALLOWED_ORIGINS ??
      'http://localhost:3000';

    if (Array.isArray(raw)) {
      this.allowedOrigins = raw.map((o) => String(o).trim()).filter(Boolean);
    } else {
      this.allowedOrigins = String(raw)
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
    }

    if (this.nodeEnv === 'production' && this.allowedOrigins.includes('*')) {
      throw new Error('CORS wildcard "*" is prohibited in production');
    }
  }

  /**
   * Checks if a given request origin is whitelisted.
   * @param {string | undefined} origin
   * @returns {boolean}
   */
  isOriginAllowed(origin) {
    if (!origin) return false;
    if (this.nodeEnv !== 'production' && this.allowedOrigins.includes('*')) {
      return true;
    }
    return this.allowedOrigins.includes(origin);
  }

  /**
   * Applies CORS headers and handles OPTIONS preflight requests.
   * Returns `true` if the response was terminated (preflight or forbidden origin).
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @returns {boolean}
   */
  handle(req, res) {
    const origin = req.headers.origin;

    if (origin && this.isOriginAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, OPTIONS'
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, x-api-key, X-Idempotency-Key'
    );

    if (req.method === 'OPTIONS') {
      if (origin && !this.isOriginAllowed(origin)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: false,
            error: { code: 'CORS_ORIGIN_FORBIDDEN', message: 'Origin not allowed' },
          })
        );
        return true;
      }
      res.writeHead(204);
      res.end();
      return true;
    }

    return false;
  }
}

module.exports = { CorsMiddleware };
~~~~

### core/gateway/routes/AuthRoutes.js

- **Bloco:** Bloco 5 — Camada 5 (Gateway REST, Auth, SSE & Webhooks)
- **Imports internos (`require` / `import`):** (nenhum)
- **Exports principais:** `createAuthRoutes`, `hashPassword`, `verifyPassword`
- **Total de linhas:** 176

~~~~javascript
'use strict';

const crypto = require('node:crypto');

/**
 * Hashes a password using scrypt and a random 16-byte salt.
 * @param {string} password
 * @returns {string}
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

/**
 * Verifies a plaintext password against a stored `salt:hash` string in constant time.
 * @param {string} password
 * @param {string} stored
 * @returns {boolean}
 */
function verifyPassword(password, stored) {
  if (!stored || !String(stored).includes(':')) return false;
  const [salt, hashHex] = String(stored).split(':');
  const derived = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hashHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

/**
 * Strips sensitive fields before serializing partner DTO.
 * @param {Record<string, any> | null} partner
 */
function sanitizePartner(partner) {
  if (!partner) return null;
  const copy = { ...partner };
  delete copy.password_hash;
  return copy;
}

/**
 * Registers authentication routes (`/api/v1/auth/register`, `login`, `session`).
 * @param {{
 *   partnerRepository: import('../../storage/repositories/PartnerRepository').PartnerRepository,
 *   authRepository: import('../../storage/repositories/AuthRepository').AuthRepository,
 *   authMiddleware: import('../middlewares/AuthMiddleware').AuthMiddleware
 * }} deps
 */
function createAuthRoutes(deps) {
  const { partnerRepository, authRepository, authMiddleware } = deps;

  return [
    {
      method: 'POST',
      path: '/api/v1/auth/register',
      exempt: true,
      handler: async ({ body, sendOk, sendError }) => {
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');
        const displayName = String(
          body.displayName ?? body.name ?? body.display_name ?? ''
        ).trim();

        if (!email || !password || !displayName) {
          return sendError(
            400,
            'VALIDATION_ERROR',
            'email, password e displayName são obrigatórios.'
          );
        }

        const existing = partnerRepository.findByEmail(email);
        if (existing) {
          return sendError(
            409,
            'EMAIL_ALREADY_EXISTS',
            'Este e-mail já está cadastrado.'
          );
        }

        const partner = partnerRepository.create({
          id: body.id,
          email,
          passwordHash: hashPassword(password),
          displayName,
          storeSegment: body.storeSegment ?? body.store_segment ?? null,
        });

        const { token, expiresAtMs } = authMiddleware.signJwt({
          partnerId: partner.id,
          email: partner.email,
        });
        authRepository.createSession({
          token,
          partnerId: partner.id,
          expiresAt: expiresAtMs,
        });

        return sendOk(
          {
            partner: sanitizePartner(partner),
            token,
            expiresAt: expiresAtMs,
          },
          201
        );
      },
    },
    {
      method: 'POST',
      path: '/api/v1/auth/login',
      exempt: true,
      handler: async ({ body, sendOk, sendError }) => {
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');

        if (!email || !password) {
          return sendError(
            400,
            'VALIDATION_ERROR',
            'email e password são obrigatórios.'
          );
        }

        const partner = partnerRepository.findByEmail(email);
        if (!partner || !verifyPassword(password, partner.password_hash)) {
          return sendError(
            401,
            'INVALID_CREDENTIALS',
            'E-mail ou senha inválidos.'
          );
        }

        const { token, expiresAtMs } = authMiddleware.signJwt({
          partnerId: partner.id,
          email: partner.email,
        });
        authRepository.createSession({
          token,
          partnerId: partner.id,
          expiresAt: expiresAtMs,
        });

        return sendOk({
          partner: sanitizePartner(partner),
          token,
          expiresAt: expiresAtMs,
        });
      },
    },
    {
      method: 'GET',
      path: '/api/v1/auth/session',
      handler: async ({ auth, sendOk, sendError }) => {
        if (auth.type === 'api_key') {
          return sendOk({
            authType: 'api_key',
            partnerId: null,
          });
        }
        const partner = partnerRepository.findById(auth.partnerId);
        if (!partner) {
          return sendError(404, 'PARTNER_NOT_FOUND', 'Parceiro não encontrado.');
        }
        return sendOk({
          authType: 'bearer',
          partner: sanitizePartner(partner),
        });
      },
    },
  ];
}

module.exports = { createAuthRoutes, hashPassword, verifyPassword };
~~~~

### core/gateway/routes/BookingRoutes.js

- **Bloco:** Bloco 5 — Camada 5 (Gateway REST, Auth, SSE & Webhooks)
- **Imports internos (`require` / `import`):** `core/domain/RegionalNormalizer`, `core/gateway/routes/FeatureRoutes`
- **Exports principais:** `createBookingRoutes`
- **Total de linhas:** 154

~~~~javascript
'use strict';

const { nowSP } = require('../../domain/RegionalNormalizer');
const { ensureFeatureEnabled } = require('./FeatureRoutes');

/**
 * Registers Appointment routes (`/api/v1/partners/:partnerId/appointments*`).
 * @param {{
 *   bookingService: import('../../domain/BookingService').BookingService,
 *   appointmentRepository: import('../../storage/repositories/AppointmentRepository').AppointmentRepository,
 *   partnerRepository: import('../../storage/repositories/PartnerRepository').PartnerRepository,
 *   pdfService: import('../../domain/PdfService').PdfService,
 *   webhookDispatcher?: import('../events/WebhookDispatcher').WebhookDispatcher
 * }} deps
 */
function createBookingRoutes(deps) {
  const {
    bookingService,
    appointmentRepository,
    partnerRepository,
    pdfService,
    webhookDispatcher,
  } = deps;

  return [
    {
      method: 'GET',
      path: '/api/v1/partners/:partnerId/appointments',
      handler: async ({ params, query, sendOk }) => {
        const dateStr = query.get('date') || undefined;
        const status = query.get('status') || undefined;
        const rows = appointmentRepository.listByPartner(params.partnerId, {
          dateStr,
          status,
        });
        return sendOk(rows);
      },
    },
    {
      method: 'GET',
      path: '/api/v1/partners/:partnerId/appointments/summary',
      handler: async ({ params, query, sendOk }) => {
        const dateStr = query.get('date') || nowSP().dateStr;
        const summary = bookingService.getDailySummary(params.partnerId, dateStr);
        const appointments = bookingService.listByDate(params.partnerId, dateStr);
        return sendOk({
          ...summary,
          appointments,
        });
      },
    },
    {
      method: 'GET',
      path: '/api/v1/partners/:partnerId/appointments/pdf',
      handler: async ({ params, query, res, sendError }) => {
        const partner = partnerRepository.findById(params.partnerId);
        if (!partner) {
          return sendError(404, 'PARTNER_NOT_FOUND', 'Parceiro não encontrado.');
        }
        const dateStr = query.get('date') || nowSP().dateStr;
        const appointments = bookingService.listByDate(params.partnerId, dateStr);
        const { buffer } = pdfService.buildAppointmentsPdf({
          partnerName: partner.display_name,
          dateStr,
          appointments,
        });

        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="agenda_${dateStr}.pdf"`,
          'Content-Length': buffer.length,
        });
        res.end(buffer);
      },
    },
    {
      method: 'POST',
      path: '/api/v1/partners/:partnerId/appointments',
      handler: async ({ params, body, headers, sendOk, sendError }) => {
        if (!ensureFeatureEnabled(partnerRepository, params.partnerId, 'bookings', sendError)) {
          return;
        }

        const idempotencyKey =
          headers['x-idempotency-key'] ||
          body.idempotencyKey ||
          body.idempotency_key ||
          null;

        const result = bookingService.bookService({
          partnerId: params.partnerId,
          itemId: body.itemId ?? body.item_id,
          dateStr: body.dateStr ?? body.date_str,
          timeSlot: body.timeSlot ?? body.time_slot,
          clientName: body.clientName ?? body.client_name,
          customerPhone: body.customerPhone ?? body.customer_phone ?? null,
          customerId: body.customerId ?? body.customer_id ?? null,
          confirmed: body.confirmed !== undefined ? body.confirmed : true,
          idempotencyKey: idempotencyKey ? String(idempotencyKey) : null,
          itemVersionHash: body.itemVersionHash ?? body.item_version_hash ?? null,
        });

        if (!result.idempotent && webhookDispatcher) {
          await webhookDispatcher.dispatch({
            eventType: 'appointment.confirmed',
            partnerId: params.partnerId,
            payload: {
              appointmentId: result.appointment.id,
              appointment: result.appointment,
            },
          });
        }

        return sendOk(
          {
            appointmentId: result.appointment.id,
            idempotent: result.idempotent,
            appointment: result.appointment,
          },
          result.idempotent ? 200 : 201
        );
      },
    },
    {
      method: 'POST',
      path: '/api/v1/partners/:partnerId/appointments/:id/cancel',
      handler: async ({ params, sendOk, sendError }) => {
        if (!ensureFeatureEnabled(partnerRepository, params.partnerId, 'bookings', sendError)) {
          return;
        }
        const res = bookingService.cancelAppointment({
          partnerId: params.partnerId,
          appointmentId: params.id,
        });

        if (!res.alreadyCancelled && webhookDispatcher) {
          await webhookDispatcher.dispatch({
            eventType: 'appointment.cancelled',
            partnerId: params.partnerId,
            payload: {
              appointmentId: res.appointment.id,
              appointment: res.appointment,
            },
          });
        }

        return sendOk(res.appointment);
      },
    },
  ];
}

module.exports = { createBookingRoutes };
~~~~

### core/gateway/routes/CatalogRoutes.js

- **Bloco:** Bloco 5 — Camada 5 (Gateway REST, Auth, SSE & Webhooks)
- **Imports internos (`require` / `import`):** (nenhum)
- **Exports principais:** `createCatalogRoutes`, `toCatalogDto`
- **Total de linhas:** 124

~~~~javascript
'use strict';

/**
 * Formats a catalog item into Doc 02 REST payload DTO.
 * @param {Record<string, any>} item
 */
function toCatalogDto(item) {
  return {
    itemId: item.id,
    id: item.id,
    partnerId: item.partner_id,
    name: item.name,
    type: item.item_type,
    itemType: item.item_type,
    description: item.description,
    priceCents: Number(item.price_cents),
    price_cents: Number(item.price_cents),
    durationMinutes: Number(item.duration_minutes),
    duration_minutes: Number(item.duration_minutes),
    category: item.category,
    versionHash: item.version_hash,
    version_hash: item.version_hash,
    active: Number(item.active),
    trackStock: Number(item.track_stock ?? 0) === 1,
    track_stock: Number(item.track_stock ?? 0),
    stockQuantity:
      item.stock_quantity !== null && item.stock_quantity !== undefined
        ? Number(item.stock_quantity)
        : null,
    stock_quantity:
      item.stock_quantity !== null && item.stock_quantity !== undefined
        ? Number(item.stock_quantity)
        : null,
    updatedAt: item.updated_at,
  };
}

/**
 * Registers canonical Catalog routes (`/api/v1/partners/:partnerId/catalog`).
 * Supports `X-Idempotency-Key` for offline sync replay.
 * @param {{
 *   catalogService: import('../../domain/CatalogService').CatalogService,
 *   queueRepository?: import('../../storage/repositories/QueueRepository').QueueRepository
 * }} deps
 */
function createCatalogRoutes(deps) {
  const { catalogService, queueRepository } = deps;

  return [
    {
      method: 'GET',
      path: '/api/v1/partners/:partnerId/catalog',
      handler: async ({ params, query, sendOk }) => {
        const items = catalogService.listItems(params.partnerId, {
          type: query.get('type') || undefined,
          includeInactive: query.get('includeInactive') === 'true',
          category: query.get('category') || undefined,
        });
        return sendOk(items.map(toCatalogDto));
      },
    },
    {
      method: 'POST',
      path: '/api/v1/partners/:partnerId/catalog',
      handler: async ({ params, body, headers, sendOk }) => {
        const idempotencyKey = headers['x-idempotency-key']
          ? String(headers['x-idempotency-key'])
          : null;

        if (idempotencyKey && queueRepository) {
          const eventKey = `cat:${params.partnerId}:${idempotencyKey}`;
          if (queueRepository.isEventProcessed(eventKey)) {
            const existing = body.id
              ? catalogService.getItemSpec(params.partnerId, body.id, {
                  includeInactive: true,
                })
              : catalogService
                  .listItems(params.partnerId, { includeInactive: true })
                  .find((i) => i.name === String(body.name || '').trim());
            if (existing) {
              return sendOk(toCatalogDto(existing), 200);
            }
          }
        }

        const created = catalogService.createItem(params.partnerId, body);
        if (idempotencyKey && queueRepository) {
          queueRepository.markEventProcessed(
            `cat:${params.partnerId}:${idempotencyKey}`,
            `api:${params.partnerId}`
          );
        }

        return sendOk(toCatalogDto(created), 201);
      },
    },
    {
      method: 'PUT',
      path: '/api/v1/partners/:partnerId/catalog/:itemId',
      handler: async ({ params, body, sendOk }) => {
        const updated = catalogService.updateItem(
          params.partnerId,
          params.itemId,
          body
        );
        return sendOk(toCatalogDto(updated));
      },
    },
    {
      method: 'DELETE',
      path: '/api/v1/partners/:partnerId/catalog/:itemId',
      handler: async ({ params, sendOk }) => {
        const deactivated = catalogService.softDeleteItem(
          params.partnerId,
          params.itemId
        );
        return sendOk(toCatalogDto(deactivated));
      },
    },
  ];
}

module.exports = { createCatalogRoutes, toCatalogDto };
~~~~

### core/gateway/routes/ChannelRoutes.js

- **Bloco:** Bloco 5 — Camada 5 (Gateway REST, Auth, SSE & Webhooks)
- **Imports internos (`require` / `import`):** `core/messaging/SessionManager`
- **Exports principais:** `createChannelRoutes`
- **Total de linhas:** 176

~~~~javascript
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
~~~~

### core/gateway/routes/ConversationRoutes.js

- **Bloco:** Bloco 5 — Camada 5 (Gateway REST, Auth, SSE & Webhooks)
- **Imports internos (`require` / `import`):** `core/gateway/routes/FeatureRoutes`
- **Exports principais:** `createConversationRoutes`
- **Total de linhas:** 166

~~~~javascript
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
~~~~

### core/gateway/routes/FeatureRoutes.js

- **Bloco:** Bloco 5 — Camada 5 (Gateway REST, Auth, SSE & Webhooks)
- **Imports internos (`require` / `import`):** `core/storage/repositories/PartnerRepository`
- **Exports principais:** `createFeatureRoutes`, `ensureFeatureEnabled`
- **Total de linhas:** 89

~~~~javascript
'use strict';

const {
  DEFAULT_FEATURE_FLAGS,
} = require('../../storage/repositories/PartnerRepository');

/**
 * Checks whether a partner feature flag is enabled; returns false and emits
 * HTTP `403 FEATURE_DISABLED` when disabled.
 * @param {import('../../storage/repositories/PartnerRepository').PartnerRepository} partnerRepository
 * @param {string} partnerId
 * @param {string} featureName
 * @param {Function} sendError
 * @returns {boolean}
 */
function ensureFeatureEnabled(partnerRepository, partnerId, featureName, sendError) {
  const partner = partnerRepository.findById(partnerId);
  if (!partner) {
    sendError(404, 'PARTNER_NOT_FOUND', 'Parceiro não encontrado.');
    return false;
  }
  const effective = { ...DEFAULT_FEATURE_FLAGS, ...(partner.feature_flags || {}) };
  if (effective[featureName] === false) {
    sendError(
      403,
      'FEATURE_DISABLED',
      `O módulo "${featureName}" está desativado para este parceiro.`,
      { partnerId, feature: featureName }
    );
    return false;
  }
  return true;
}

/**
 * Registers Painel de Chaves / Feature Flags routes (`GET/PUT /api/v1/partners/:partnerId/features`).
 * @param {{
 *   partnerRepository: import('../../storage/repositories/PartnerRepository').PartnerRepository
 * }} deps
 */
function createFeatureRoutes(deps) {
  const { partnerRepository } = deps;

  return [
    {
      method: 'GET',
      path: '/api/v1/partners/:partnerId/features',
      handler: async ({ params, sendOk, sendError }) => {
        const partner = partnerRepository.findById(params.partnerId);
        if (!partner) {
          return sendError(404, 'PARTNER_NOT_FOUND', 'Parceiro não encontrado.');
        }
        return sendOk({
          ...DEFAULT_FEATURE_FLAGS,
          ...(partner.feature_flags || {}),
        });
      },
    },
    {
      method: 'PUT',
      path: '/api/v1/partners/:partnerId/features',
      handler: async ({ params, body, sendOk, sendError }) => {
        const partner = partnerRepository.findById(params.partnerId);
        if (!partner) {
          return sendError(404, 'PARTNER_NOT_FOUND', 'Parceiro não encontrado.');
        }

        const current = {
          ...DEFAULT_FEATURE_FLAGS,
          ...(partner.feature_flags || {}),
        };
        const merged = { ...current };
        for (const [k, v] of Object.entries(body || {})) {
          if (typeof v === 'boolean') {
            merged[k] = v;
          }
        }

        const updated = partnerRepository.update(params.partnerId, {
          featureFlags: merged,
        });
        return sendOk(updated.feature_flags);
      },
    },
  ];
}

module.exports = { createFeatureRoutes, ensureFeatureEnabled };
~~~~

### core/gateway/routes/HealthRoutes.js

- **Bloco:** Bloco 5 — Camada 5 (Gateway REST, Auth, SSE & Webhooks)
- **Imports internos (`require` / `import`):** (nenhum)
- **Exports principais:** `createHealthRoutes`
- **Total de linhas:** 141

~~~~javascript
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
        const partnerId = body?.partnerId || auth?.partnerId || null;

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
~~~~

### core/gateway/routes/OrderRoutes.js

- **Bloco:** Bloco 5 — Camada 5 (Gateway REST, Auth, SSE & Webhooks)
- **Imports internos (`require` / `import`):** `core/domain/RegionalNormalizer`, `core/gateway/routes/FeatureRoutes`
- **Exports principais:** `createOrderRoutes`
- **Total de linhas:** 153

~~~~javascript
'use strict';

const { nowSP } = require('../../domain/RegionalNormalizer');
const { ensureFeatureEnabled } = require('./FeatureRoutes');

/**
 * Registers Product Order routes (`/api/v1/partners/:partnerId/orders*`).
 * @param {{
 *   orderService: import('../../domain/OrderService').OrderService,
 *   partnerRepository: import('../../storage/repositories/PartnerRepository').PartnerRepository,
 *   pdfService: import('../../domain/PdfService').PdfService,
 *   webhookDispatcher?: import('../events/WebhookDispatcher').WebhookDispatcher
 * }} deps
 */
function createOrderRoutes(deps) {
  const { orderService, partnerRepository, pdfService, webhookDispatcher } = deps;

  return [
    {
      method: 'GET',
      path: '/api/v1/partners/:partnerId/orders',
      handler: async ({ params, query, sendOk }) => {
        const status = query.get('status') || undefined;
        const dateFilter = query.get('date') || null;
        let rows = orderService.listOrders(params.partnerId, { status, limit: 500 });
        if (dateFilter) {
          rows = rows.filter((o) => String(o.created_at || '').startsWith(dateFilter));
        }
        return sendOk(rows);
      },
    },
    {
      method: 'GET',
      path: '/api/v1/partners/:partnerId/orders/summary',
      handler: async ({ params, query, sendOk }) => {
        const dateStr = query.get('date') || null;
        const summary = orderService.getSummary(params.partnerId, dateStr);
        let orders = orderService.listOrders(params.partnerId, { limit: 500 });
        if (dateStr) {
          orders = orders.filter((o) => String(o.created_at || '').startsWith(dateStr));
        }
        return sendOk({
          ...summary,
          orders,
        });
      },
    },
    {
      method: 'GET',
      path: '/api/v1/partners/:partnerId/orders/pdf',
      handler: async ({ params, query, res, sendError }) => {
        const partner = partnerRepository.findById(params.partnerId);
        if (!partner) {
          return sendError(404, 'PARTNER_NOT_FOUND', 'Parceiro não encontrado.');
        }
        const dateStr = query.get('date') || nowSP().dateStr;
        const orders = orderService
          .listOrders(params.partnerId, { limit: 500 })
          .filter((o) => String(o.created_at || '').startsWith(dateStr));
        const { buffer } = pdfService.buildOrdersPdf({
          partnerName: partner.display_name,
          dateStr,
          orders,
        });

        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="pedidos_${dateStr}.pdf"`,
          'Content-Length': buffer.length,
        });
        res.end(buffer);
      },
    },
    {
      method: 'POST',
      path: '/api/v1/partners/:partnerId/orders',
      handler: async ({ params, body, headers, sendOk, sendError }) => {
        if (!ensureFeatureEnabled(partnerRepository, params.partnerId, 'orders', sendError)) {
          return;
        }

        const idempotencyKey =
          headers['x-idempotency-key'] ||
          body.idempotencyKey ||
          body.idempotency_key ||
          null;

        const result = orderService.createOrder({
          partnerId: params.partnerId,
          items: body.items,
          clientName: body.clientName ?? body.client_name,
          customerPhone: body.customerPhone ?? body.customer_phone ?? null,
          customerId: body.customerId ?? body.customer_id ?? null,
          paymentMethod: body.paymentMethod ?? body.payment_method ?? null,
          deliveryType: body.deliveryType ?? body.delivery_type ?? null,
          address: body.address ?? null,
          notes: body.notes ?? null,
          confirmed: body.confirmed !== undefined ? body.confirmed : true,
          idempotencyKey: idempotencyKey ? String(idempotencyKey) : null,
        });

        if (!result.idempotent && webhookDispatcher) {
          await webhookDispatcher.dispatch({
            eventType: 'order.confirmed',
            partnerId: params.partnerId,
            payload: {
              orderId: result.order.id,
              order: result.order,
            },
          });
        }

        return sendOk(
          {
            orderId: result.order.id,
            idempotent: result.idempotent,
            order: result.order,
          },
          result.idempotent ? 200 : 201
        );
      },
    },
    {
      method: 'POST',
      path: '/api/v1/partners/:partnerId/orders/:id/cancel',
      handler: async ({ params, sendOk, sendError }) => {
        if (!ensureFeatureEnabled(partnerRepository, params.partnerId, 'orders', sendError)) {
          return;
        }
        const res = orderService.cancelOrder({
          partnerId: params.partnerId,
          orderId: params.id,
        });

        if (!res.alreadyCancelled && webhookDispatcher) {
          await webhookDispatcher.dispatch({
            eventType: 'order.cancelled',
            partnerId: params.partnerId,
            payload: {
              orderId: res.order.id,
              order: res.order,
            },
          });
        }

        return sendOk(res.order);
      },
    },
  ];
}

module.exports = { createOrderRoutes };
~~~~

### core/gateway/routes/PartnerRoutes.js

- **Bloco:** Bloco 5 — Camada 5 (Gateway REST, Auth, SSE & Webhooks)
- **Imports internos (`require` / `import`):** (nenhum)
- **Exports principais:** `createPartnerRoutes`
- **Total de linhas:** 95

~~~~javascript
'use strict';

/**
 * Registers partner configuration routes (`GET/PUT /api/v1/partners/:partnerId/config`).
 * Supports 15 MiB payload limit for PDF/image metadata updates.
 * @param {{
 *   partnerRepository: import('../../storage/repositories/PartnerRepository').PartnerRepository
 * }} deps
 */
function createPartnerRoutes(deps) {
  const { partnerRepository } = deps;

  function toPartnerConfigDto(partner) {
    return {
      partnerId: partner.id,
      email: partner.email,
      name: partner.display_name,
      displayName: partner.display_name,
      storeSegment: partner.store_segment,
      personalityPrompt: partner.personality_prompt,
      welcomeMessage: partner.welcome_message,
      ownerJid: partner.owner_jid,
      logoDataUrl: partner.logo_data_url || null,
      pdfFiles: partner.pdf_files,
      imageFiles: partner.image_files,
      businessRules: partner.business_rules,
      businessHours: partner.working_hours,
      workingHours: partner.working_hours,
      policies: partner.policies,
      activeStatus: Number(partner.is_active) === 1 ? 'ACTIVE' : 'INACTIVE',
      featureFlags: partner.feature_flags,
      updatedAt: partner.updated_at,
    };
  }

  return [
    {
      method: 'GET',
      path: '/api/v1/partners/:partnerId/config',
      handler: async ({ params, sendOk, sendError }) => {
        const partner = partnerRepository.findById(params.partnerId);
        if (!partner) {
          return sendError(404, 'PARTNER_NOT_FOUND', 'Parceiro não encontrado.');
        }
        return sendOk(toPartnerConfigDto(partner));
      },
    },
    {
      method: 'PUT',
      path: '/api/v1/partners/:partnerId/config',
      isUpload: true,
      handler: async ({ params, body, sendOk, sendError }) => {
        const existing = partnerRepository.findById(params.partnerId);
        if (!existing) {
          return sendError(404, 'PARTNER_NOT_FOUND', 'Parceiro não encontrado.');
        }

        const patch = {
          displayName: body.displayName ?? body.name,
          storeSegment: body.storeSegment ?? body.store_segment,
          personalityPrompt: body.personalityPrompt ?? body.personality_prompt,
          welcomeMessage: body.welcomeMessage ?? body.welcome_message,
          ownerJid: body.ownerJid ?? body.owner_jid,
          logoDataUrl: body.logoDataUrl ?? body.logo_data_url,
          pdfFiles: body.pdfFiles ?? body.pdf_files,
          imageFiles: body.imageFiles ?? body.image_files,
          businessRules:
            body.businessRules !== undefined && typeof body.businessRules !== 'string'
              ? JSON.stringify(body.businessRules)
              : body.businessRules ?? body.business_rules,
          workingHours:
            body.businessHours ?? body.workingHours ?? body.working_hours,
          policies: body.policies,
          isActive:
            body.activeStatus !== undefined
              ? body.activeStatus === 'ACTIVE'
              : body.isActive,
        };

        if (Array.isArray(patch.pdfFiles) && patch.pdfFiles.length > 5) {
          return sendError(400, 'VALIDATION_ERROR', 'Máximo de 5 PDFs permitidos.');
        }
        if (Array.isArray(patch.imageFiles) && patch.imageFiles.length > 10) {
          return sendError(400, 'VALIDATION_ERROR', 'Máximo de 10 imagens permitidas.');
        }

        const updated = partnerRepository.update(params.partnerId, patch);
        return sendOk(toPartnerConfigDto(updated));
      },
    },
  ];
}

module.exports = { createPartnerRoutes };
~~~~

### core/gateway/routes/WebhookRoutes.js

- **Bloco:** Bloco 5 — Camada 5 (Gateway REST, Auth, SSE & Webhooks)
- **Imports internos (`require` / `import`):** (nenhum)
- **Exports principais:** `createWebhookRoutes`
- **Total de linhas:** 82

~~~~javascript
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
~~~~

## Bloco 6 — Camada 6 (Interface Dark Cyber Neon SPA/PWA, Offline-First, Capacitor Android & Render)

### app-web/index.html

- **Bloco:** Bloco 6 — Camada 6 (Interface Dark Cyber Neon SPA/PWA, Offline-First, Capacitor Android & Render)
- **Imports internos (`require` / `import`):** (nenhum)
- **Exports principais:** `(arquivo de configuração / marcação / estilo)`
- **Total de linhas:** 42

~~~~html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#050810" />
    <title>AUTON.MAX — Atendente Digital PME</title>
    <link rel="icon" type="image/jpeg" href="./assets/img/logo-autonmax.jpg" />
    <link rel="manifest" href="./manifest.webmanifest" />
    <link rel="stylesheet" href="./src/theme/tokens.css" />
  </head>
  <body>
    <div id="autonmax-auth"></div>
    <div id="autonmax-root" class="is-hidden"></div>
    <div id="autonmax-modal"></div>
    <script src="./app.bundle.js" defer></script>
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          var hadController = Boolean(navigator.serviceWorker.controller);
          navigator.serviceWorker.addEventListener('controllerchange', function () {
            if (!hadController) return;
            try {
              if (sessionStorage.getItem('autonmax_sw_reloaded') === '1') return;
              sessionStorage.setItem('autonmax_sw_reloaded', '1');
            } catch {}
            window.location.reload();
          });
          navigator.serviceWorker
            .register('./sw.js', { updateViaCache: 'none' })
            .then(function (reg) {
              if (reg && typeof reg.update === 'function') {
                reg.update().catch(function () {});
              }
            })
            .catch(function () {});
        });
      }
    </script>
  </body>
</html>
~~~~

### app-web/manifest.webmanifest

- **Bloco:** Bloco 6 — Camada 6 (Interface Dark Cyber Neon SPA/PWA, Offline-First, Capacitor Android & Render)
- **Imports internos (`require` / `import`):** (nenhum)
- **Exports principais:** `(arquivo de configuração / marcação / estilo)`
- **Total de linhas:** 12

~~~~json
{
  "name": "AUTONMAX vNext",
  "short_name": "Autonmax",
  "description": "Atendente IA WhatsApp PME Offline-First com Trava Atômica",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#050810",
  "theme_color": "#00a3ff",
  "lang": "pt-BR",
  "icons": []
}
~~~~

### app-web/src/bootstrap.js

- **Bloco:** Bloco 6 — Camada 6 (Interface Dark Cyber Neon SPA/PWA, Offline-First, Capacitor Android & Render)
- **Imports internos (`require` / `import`):** `app-web/src/components/AuthScreen`, `app-web/src/components/WhatsAppQrModal`, `app-web/src/config/FrontendInitConfig`
- **Exports principais:** `initBrowserApp`
- **Total de linhas:** 1002

~~~~javascript
'use strict';

const { mountAutonmaxUI } = require('./config/FrontendInitConfig');
const { AuthScreen } = require('./components/AuthScreen');
const { WhatsAppQrModal } = require('./components/WhatsAppQrModal');

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

function getLocalDateStr(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parsePriceBrlToCents(raw) {
  let clean = String(raw || '0')
    .replace(/[^\d.,-]/g, '')
    .trim();
  if (clean.includes(',') && clean.includes('.')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else {
    clean = clean.replace(',', '.');
  }
  const num = Number(clean);
  return Number.isFinite(num) && num >= 0 ? Math.round(num * 100) : NaN;
}

/**
 * Browser entrypoint that mounts the full-screen AuthScreen until authenticated,
 * mounts AUTON.MAX into `#autonmax-root`, and wires all operational views to `/api/v1/*`.
 */
function initBrowserApp() {
  if (typeof document === 'undefined') return null;

  const root = document.getElementById('autonmax-root');
  if (!root) return null;

  const authMount = document.getElementById('autonmax-auth');
  const modalMount = document.getElementById('autonmax-modal');
  const authScreen = new AuthScreen();
  const waModal = new WhatsAppQrModal();

  const state = {
    token: null,
    partner: null,
    authMode: 'login',
    authMessage: '',
    authError: '',
    sessionKey: null,
    qrPollTimer: null,
    waModalOpen: false,
    waModalData: {
      open: false,
      status: 'DISCONNECTED',
      qrCodeBase64: null,
      phoneNumber: null,
      sessionKey: null,
    },
    catalogItems: [],
    catalogFilter: 'SERVICE',
    catalogSearch: '',
    catalogFormOpen: false,
    catalogEditingItem: null,
    catalogFormError: '',
    appointments: [],
    orders: [],
    conversations: [],
    selectedConvId: null,
    convMessages: [],
    aiTestResult: null,
    pmeSaveFeedback: null,
    appointmentsCount: 0,
    appointmentsTodayCount: 0,
    ordersCount: 0,
    ordersTodayCount: 0,
    waStatus: 'DISCONNECTED',
  };

  function stopQrPolling() {
    if (state.qrPollTimer) {
      clearTimeout(state.qrPollTimer);
      state.qrPollTimer = null;
    }
  }

  function scheduleQrPolling() {
    stopQrPolling();
    const needsQrPoll = state.waModalOpen || ui.activeView === 'channel';
    if (!needsQrPoll || !state.token || !state.sessionKey) return;
    state.qrPollTimer = setTimeout(() => {
      state.qrPollTimer = null;
      refreshWaQr({ wait: false });
    }, 1500);
  }

  const ui = mountAutonmaxUI(root, {
    shell_enabled: true,
    ui_mode: 'guided',
    baseUrl: window.location.origin,
    output_actions: {
      async exportAppointmentsPdf({ partnerId, dateStr }) {
        if (!state.token || !partnerId) return { ok: false };
        window.open(
          `/api/v1/partners/${encodeURIComponent(partnerId)}/appointments/pdf?date=${encodeURIComponent(dateStr)}`,
          '_blank'
        );
        return { ok: true };
      },
      async exportOrdersPdf({ partnerId, dateStr }) {
        if (!state.token || !partnerId) return { ok: false };
        window.open(
          `/api/v1/partners/${encodeURIComponent(partnerId)}/orders/pdf?date=${encodeURIComponent(dateStr)}`,
          '_blank'
        );
        return { ok: true };
      },
    },
  });

  async function apiFetch(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    if (state.token) {
      headers.Authorization = `Bearer ${state.token}`;
    }
    const res = await fetch(path, { ...options, headers });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) {
      throw new Error(json?.error?.message || `HTTP ${res.status}`);
    }
    return json.data;
  }

  function renderAuthGate() {
    const isAuthenticated = Boolean(state.token && state.partner);
    if (isAuthenticated) {
      if (authMount) {
        authMount.innerHTML = '';
        authMount.classList.add('is-hidden');
      }
      root.classList.remove('is-hidden');
      ui.render({
        shell: {
          partnerName:
            state.partner.displayName ||
            state.partner.display_name ||
            state.partner.email,
          partnerLogoUrl:
            state.partner.logoDataUrl ||
            state.partner.logo_data_url ||
            './assets/img/logo-autonmax.jpg',
        },
      });
      return;
    }

    root.classList.add('is-hidden');
    if (authMount) {
      authMount.classList.remove('is-hidden');
      authMount.innerHTML = authScreen.render({
        mode: state.authMode,
        error: state.authError,
        message: state.authMessage,
      });
    }
  }

  function renderWaModal() {
    if (!modalMount) return;
    modalMount.innerHTML = waModal.render({
      ...state.waModalData,
      open: state.waModalOpen,
    });
  }

  function renderCatalogState() {
    ui.render({
      catalog: {
        items: state.catalogItems,
        filterType: state.catalogFilter,
        searchQuery: state.catalogSearch,
        formOpen: state.catalogFormOpen,
        editingItem: state.catalogEditingItem,
        formError: state.catalogFormError,
      },
    });
  }

  function renderConversationsState() {
    ui.render({
      conversations: {
        items: state.conversations,
        selectedConversationId: state.selectedConvId,
        messages: state.convMessages,
      },
    });
  }

  async function refreshWaQr({ force = false, wait = false } = {}) {
    if (!state.token || !state.partner) return;
    try {
      if (!state.sessionKey) {
        const sess = await apiFetch('/api/v1/channels/sessions', {
          method: 'POST',
          body: JSON.stringify({ partnerId: state.partner.id, lineId: 'default' }),
        });
        state.sessionKey = sess.sessionKey;
      }

      const qs = new URLSearchParams();
      if (force) qs.set('force', 'true');
      if (wait) qs.set('wait', 'true');
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      const qrData = await apiFetch(
        `/api/v1/channels/sessions/${encodeURIComponent(state.sessionKey)}/qr${suffix}`
      );

      state.waModalData = {
        open: state.waModalOpen,
        sessionKey: qrData.sessionKey || state.sessionKey,
        status: qrData.status || 'DISCONNECTED',
        qrCodeBase64: qrData.qrCodeBase64 || null,
        phoneNumber: qrData.phoneNumber || null,
      };
      renderWaModal();

      if (ui.activeView === 'channel') {
        ui.render({ channel: qrData });
      } else if (ui.activeView === 'dashboard') {
        ui.render({
          dashboard: {
            partner: state.partner,
            catalog: state.catalogItems,
            waStatus: state.waModalData.status,
            aiTestResult: state.aiTestResult,
          },
        });
      }

      if (
        qrData.status !== 'CONNECTED' &&
        qrData.status !== 'STANDBY' &&
        qrData.status !== 'DISCONNECTED'
      ) {
        scheduleQrPolling();
      } else {
        stopQrPolling();
      }
    } catch {
      renderWaModal();
    }
  }

  async function executeLogout() {
    stopQrPolling();
    state.waModalOpen = false;
    renderWaModal();
    await ui.ports.secureAuth.clearToken();
    state.token = null;
    state.partner = null;
    state.sessionKey = null;
    state.catalogItems = [];
    state.appointments = [];
    state.orders = [];
    state.conversations = [];
    state.selectedConvId = null;
    state.convMessages = [];
    state.aiTestResult = null;
    state.authError = '';
    state.authMessage = '';
    renderAuthGate();
  }

  async function hydrateActiveView() {
    if (!state.token || !state.partner) return;
    const pid = encodeURIComponent(state.partner.id || state.partner.partnerId);
    const today = getLocalDateStr();

    try {
      if (ui.activeView === 'dashboard') {
        const [config, catalog, appts, orders, sessions] = await Promise.all([
          apiFetch(`/api/v1/partners/${pid}/config`).catch(() => state.partner),
          apiFetch(`/api/v1/partners/${pid}/catalog`).catch(() => state.catalogItems),
          apiFetch(`/api/v1/partners/${pid}/appointments`).catch(() => []),
          apiFetch(`/api/v1/partners/${pid}/orders`).catch(() => []),
          apiFetch('/api/v1/channels/sessions').catch(() => []),
        ]);
        if (config) state.partner = { ...state.partner, ...config };
        state.catalogItems = Array.isArray(catalog) ? catalog : [];
        const apptsList = Array.isArray(appts) ? appts : [];
        const ordersList = Array.isArray(orders) ? orders : [];
        state.appointments = apptsList;
        state.orders = ordersList;
        const confirmedAppts = apptsList.filter(
          (a) => String(a?.status || 'CONFIRMED').toUpperCase() === 'CONFIRMED'
        );
        const confirmedOrders = ordersList.filter(
          (o) => String(o?.status || 'CONFIRMED').toUpperCase() === 'CONFIRMED'
        );
        const firstSess = Array.isArray(sessions) && sessions[0] ? sessions[0] : null;
        if (firstSess?.sessionKey) state.sessionKey = firstSess.sessionKey;
        state.appointmentsCount = confirmedAppts.length;
        state.appointmentsTodayCount = confirmedAppts.filter(
          (a) => String(a?.date_str || '').slice(0, 10) === today
        ).length;
        state.ordersCount = confirmedOrders.length;
        state.ordersTodayCount = confirmedOrders.filter(
          (o) => String(o?.created_at || '').slice(0, 10) === today
        ).length;
        state.waStatus = firstSess?.status || state.waModalData.status || 'DISCONNECTED';

        renderDashboardLocal();
      } else if (ui.activeView === 'catalog') {
        const items = await apiFetch(`/api/v1/partners/${pid}/catalog`).catch(() => state.catalogItems);
        state.catalogItems = Array.isArray(items) ? items : [];
        renderCatalogState();
      } else if (ui.activeView === 'appointments') {
        const appts = await apiFetch(`/api/v1/partners/${pid}/appointments`).catch(() => []);
        state.appointments = Array.isArray(appts) ? appts : [];
        ui.render({ appointments: state.appointments });
      } else if (ui.activeView === 'orders') {
        const orders = await apiFetch(`/api/v1/partners/${pid}/orders`).catch(() => []);
        state.orders = Array.isArray(orders) ? orders : [];
        ui.render({ orders: state.orders });
      } else if (ui.activeView === 'conversations') {
        const convs = await apiFetch(`/api/v1/partners/${pid}/conversations`).catch(() => []);
        state.conversations = Array.isArray(convs) ? convs : [];
        if (state.selectedConvId) {
          state.convMessages = await apiFetch(
            `/api/v1/partners/${pid}/conversations/${encodeURIComponent(state.selectedConvId)}/messages`
          ).catch(() => []);
        }
        renderConversationsState();
      } else if (ui.activeView === 'channel') {
        const sessions = await apiFetch('/api/v1/channels/sessions').catch(() => []);
        const current = sessions[0] || {};
        state.sessionKey = state.sessionKey || current.sessionKey || null;
        if (state.sessionKey) {
          await refreshWaQr({ wait: false });
        } else {
          stopQrPolling();
          ui.render({ channel: { status: 'DISCONNECTED' } });
        }
      } else {
        stopQrPolling();
      }
    } catch {
      // Keep cached/local state rendered offline-first
    }
  }

  async function restoreSession() {
    try {
      await ui.ports.storage.initialize();
      const savedToken = await ui.ports.secureAuth.getToken();
      if (!savedToken) {
        renderAuthGate();
        return;
      }
      state.token = savedToken;
      const session = await apiFetch('/api/v1/auth/session');
      if (session?.partner) {
        state.partner = session.partner;
        renderAuthGate();
        await hydrateActiveView();
      } else {
        state.token = null;
        renderAuthGate();
      }
    } catch {
      state.token = null;
      state.partner = null;
      renderAuthGate();
    }
  }

  function renderDashboardLocal() {
    if (!state.partner) return;
    ui.render({
      shell: {
        partnerName:
          state.partner.displayName ||
          state.partner.display_name ||
          state.partner.email,
        partnerLogoUrl:
          state.partner.logoDataUrl ||
          state.partner.logo_data_url ||
          './assets/img/logo-autonmax.jpg',
      },
      dashboard: {
        partner: state.partner,
        catalog: state.catalogItems,
        appointmentsCount: state.appointmentsCount,
        appointmentsTodayCount: state.appointmentsTodayCount,
        ordersCount: state.ordersCount,
        ordersTodayCount: state.ordersTodayCount,
        waStatus: state.waStatus,
        aiTestResult: state.aiTestResult,
        pmeSaveFeedback: state.pmeSaveFeedback,
      },
    });
  }

  function syncPmeFieldsIntoState() {
    if (!state.partner) return;
    root.querySelectorAll('[data-pme-field]').forEach((el) => {
      const key = el.getAttribute('data-pme-field');
      if (key) state.partner[key] = el.value;
    });
  }

  function collectPmeFieldsFromDom() {
    syncPmeFieldsIntoState();
    const patch = {};
    root.querySelectorAll('[data-pme-field]').forEach((el) => {
      const key = el.getAttribute('data-pme-field');
      if (key) patch[key] = el.value;
    });
    const activeToggle = root.querySelector('[data-action="toggle-partner-active"]');
    const isActive = activeToggle
      ? Boolean(activeToggle.checked)
      : state.partner?.activeStatus
        ? state.partner.activeStatus === 'ACTIVE'
        : Number(state.partner?.is_active ?? 1) === 1;
    return {
      ...patch,
      activeStatus: isActive ? 'ACTIVE' : 'INACTIVE',
      logoDataUrl: state.partner?.logoDataUrl ?? state.partner?.logo_data_url ?? null,
      pdfFiles: state.partner?.pdfFiles ?? state.partner?.pdf_files ?? [],
      imageFiles: state.partner?.imageFiles ?? state.partner?.image_files ?? [],
    };
  }

  if (authMount) {
    authMount.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('[data-auth-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-auth-action');
      if (action === 'switch-auth') {
        state.authMode = state.authMode === 'login' ? 'register' : 'login';
        state.authError = '';
        state.authMessage = '';
        renderAuthGate();
      }
    });

    authMount.addEventListener('submit', async (ev) => {
      if (!ev.target?.matches?.('[data-auth-form]')) return;
      ev.preventDefault();
      state.authError = '';
      state.authMessage = '';
      const fd = new FormData(ev.target);
      const email = String(fd.get('email') || '').trim();
      const password = String(fd.get('password') || '');
      const displayName = String(fd.get('displayName') || '').trim();

      try {
        const endpoint =
          state.authMode === 'register' ? '/api/v1/auth/register' : '/api/v1/auth/login';
        const payload =
          state.authMode === 'register'
            ? { email, password, displayName }
            : { email, password };
        const data = await apiFetch(endpoint, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        state.token = data.token;
        state.partner = data.partner;
        await ui.ports.secureAuth.setToken(data.token);
        renderAuthGate();
        await hydrateActiveView();
      } catch (err) {
        state.authError = err.message || 'Falha na autenticação.';
        renderAuthGate();
      }
    });
  }

  if (modalMount) {
    modalMount.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('[data-wa-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-wa-action');
      if (action === 'close') {
        state.waModalOpen = false;
        stopQrPolling();
        renderWaModal();
      } else if (action === 'force-qr') {
        state.waModalData = { ...state.waModalData, qrCodeBase64: null, status: 'PAIRING_READY' };
        renderWaModal();
        await refreshWaQr({ force: true, wait: true });
      } else if (action === 'disconnect' && state.sessionKey) {
        await apiFetch(
          `/api/v1/channels/sessions/${encodeURIComponent(state.sessionKey)}/disconnect`,
          { method: 'POST', body: JSON.stringify({ wipeAuth: false }) }
        ).catch(() => {});
        stopQrPolling();
        state.waModalData = {
          ...state.waModalData,
          status: 'DISCONNECTED',
          qrCodeBase64: null,
          phoneNumber: null,
        };
        renderWaModal();
      }
    });
  }

  root.addEventListener('input', (ev) => {
    if (ev.target?.matches?.('[data-catalog-search]')) {
      state.catalogSearch = ev.target.value || '';
      renderCatalogState();
      const input = root.querySelector('[data-catalog-search]');
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }
  });

  root.addEventListener('change', async (ev) => {
    if (ev.target?.matches?.('[data-catalog-form] select[name="type"]')) {
      const form = ev.target.closest('[data-catalog-form]');
      const stockRow = form?.querySelector('[data-catalog-stock-row]');
      const durationWrap = form?.querySelector('[data-catalog-duration-wrap]');
      if (stockRow) {
        stockRow.style.display = ev.target.value === 'PRODUCT' ? 'flex' : 'none';
      }
      if (durationWrap) {
        durationWrap.style.display = ev.target.value === 'SERVICE' ? 'block' : 'none';
      }
      return;
    }

    if (ev.target?.matches?.('[data-catalog-stock-toggle]')) {
      const form = ev.target.closest('[data-catalog-form]');
      const qtyInput = form?.querySelector('[name="stockQuantity"]');
      const label = form?.querySelector('[data-catalog-stock-label]');
      const enabled = Boolean(ev.target.checked);
      if (qtyInput) qtyInput.disabled = !enabled;
      if (label) {
        label.textContent = enabled
          ? 'Estoque controlado'
          : 'Estoque ilimitado (Software/Digital)';
      }
      return;
    }

    const pid = state.partner ? encodeURIComponent(state.partner.id || state.partner.partnerId) : null;
    if (!pid) return;

    if (ev.target?.matches?.('[data-action="toggle-partner-active"]')) {
      const active = Boolean(ev.target.checked);
      const updated = await apiFetch(`/api/v1/partners/${pid}/config`, {
        method: 'PUT',
        body: JSON.stringify({ activeStatus: active ? 'ACTIVE' : 'INACTIVE' }),
      }).catch(() => null);
      if (updated) {
        state.partner = { ...state.partner, ...updated };
      } else {
        state.partner.activeStatus = active ? 'ACTIVE' : 'INACTIVE';
      }
      await hydrateActiveView();
      return;
    }

    const featKey = ev.target?.getAttribute?.('data-feature-toggle');
    if (featKey) {
      const updated = await apiFetch(`/api/v1/partners/${pid}/features`, {
        method: 'PUT',
        body: JSON.stringify({ [featKey]: Boolean(ev.target.checked) }),
      }).catch(() => null);
      if (updated) {
        state.partner.featureFlags = updated;
      }
      return;
    }

    const uploadKind = ev.target?.getAttribute?.('data-pme-upload');
    if (uploadKind && ev.target.files?.length) {
      syncPmeFieldsIntoState();
      state.pmeSaveFeedback = null;
      const files = Array.from(ev.target.files);
      if (uploadKind === 'logo') {
        const dataUrl = await readFileAsDataUrl(files[0]);
        state.partner.logoDataUrl = dataUrl;
      } else if (uploadKind === 'pdfs') {
        const existing = Array.isArray(state.partner.pdfFiles) ? [...state.partner.pdfFiles] : [];
        for (const f of files) {
          if (existing.length >= 5) {
            state.pmeSaveFeedback = { ok: false, message: 'Máximo de 5 PDFs permitidos.' };
            break;
          }
          existing.push({ name: f.name, dataUrl: await readFileAsDataUrl(f) });
        }
        state.partner.pdfFiles = existing;
      } else if (uploadKind === 'images') {
        const existing = Array.isArray(state.partner.imageFiles) ? [...state.partner.imageFiles] : [];
        for (const f of files) {
          if (existing.length >= 10) {
            state.pmeSaveFeedback = { ok: false, message: 'Máximo de 10 imagens permitidas.' };
            break;
          }
          existing.push({ name: f.name, dataUrl: await readFileAsDataUrl(f) });
        }
        state.partner.imageFiles = existing;
      }
      ev.target.value = '';
      renderDashboardLocal();
    }
  });

  root.addEventListener('submit', async (ev) => {
    const pid = state.partner ? encodeURIComponent(state.partner.id || state.partner.partnerId) : null;
    if (!pid) return;

    if (ev.target?.matches?.('[data-catalog-form]')) {
      ev.preventDefault();
      state.catalogFormError = '';
      const fd = new FormData(ev.target);
      const itemId = String(fd.get('itemId') || '').trim();
      const priceCents = parsePriceBrlToCents(fd.get('priceBrl'));
      const rawDuration = Number(fd.get('durationMinutes'));
      const durationMinutes =
        Number.isInteger(rawDuration) && rawDuration > 0 ? rawDuration : 30;
      const itemType = String(fd.get('type') || 'SERVICE').toUpperCase();
      const trackStock = Boolean(
        ev.target.querySelector('[data-catalog-stock-toggle]')?.checked
      );
      const stockQuantity = trackStock
        ? Math.max(0, Math.floor(Number(fd.get('stockQuantity') || 0)))
        : null;
      const payload = {
        name: String(fd.get('name') || '').trim(),
        type: itemType,
        itemType,
        priceCents,
        durationMinutes,
        category: String(fd.get('category') || '').trim() || 'geral',
        description: String(fd.get('description') || '').trim(),
        trackStock,
        stockQuantity,
      };

      if (!payload.name) {
        state.catalogFormError = 'Informe o nome do item.';
        renderCatalogState();
        return;
      }
      if (!Number.isInteger(priceCents) || priceCents < 0) {
        state.catalogFormError = 'Informe um preço válido (ex: 35,00).';
        renderCatalogState();
        return;
      }

      try {
        if (itemId) {
          await apiFetch(`/api/v1/partners/${pid}/catalog/${encodeURIComponent(itemId)}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          });
        } else {
          await apiFetch(`/api/v1/partners/${pid}/catalog`, {
            method: 'POST',
            body: JSON.stringify(payload),
          });
        }
        state.catalogFormOpen = false;
        state.catalogEditingItem = null;
        state.catalogFormError = '';
        await hydrateActiveView();
      } catch (err) {
        const isOffline = !ui.ports.network.isOnline() || err instanceof TypeError;
        if (!itemId && isOffline) {
          const { record } = await ui.views.catalog.createItemOffline(
            state.partner.id || state.partner.partnerId,
            payload
          );
          state.catalogItems = [record, ...state.catalogItems];
          state.catalogFormOpen = false;
          state.catalogEditingItem = null;
          state.catalogFormError = '';
          renderCatalogState();
        } else {
          state.catalogFormError = err?.message || 'Não foi possível salvar o item.';
          renderCatalogState();
        }
      }
      return;
    }

    const opFormConvId = ev.target?.getAttribute?.('data-operator-form');
    if (opFormConvId) {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const text = String(fd.get('text') || '').trim();
      if (!text) return;
      await apiFetch(
        `/api/v1/partners/${pid}/conversations/${encodeURIComponent(opFormConvId)}/operator-message`,
        {
          method: 'POST',
          body: JSON.stringify({ text }),
        }
      ).catch(async () => {
        await ui.views.conversations.sendOperatorMessage({
          conversationId: opFormConvId,
          text,
        });
      });
      await hydrateActiveView();
    }
  });

  root.addEventListener('click', async (ev) => {
    const shellBtn = ev.target.closest('[data-shell-action]');
    if (shellBtn) {
      const shellAction = shellBtn.getAttribute('data-shell-action');
      if (shellAction === 'toggle-mode') {
        ui.setUiMode(ui.uiMode === 'advanced' ? 'guided' : 'advanced');
      } else if (shellAction === 'logout') {
        await executeLogout();
      }
      return;
    }

    const navCatalogBtn = ev.target.closest('[data-nav-catalog]');
    if (navCatalogBtn) {
      state.catalogFilter = navCatalogBtn.getAttribute('data-nav-catalog') || 'ALL';
      state.catalogFormOpen = false;
      state.catalogEditingItem = null;
      ui.navigate('catalog');
      await hydrateActiveView();
      return;
    }

    const navBtn = ev.target.closest('[data-nav-view]');
    if (navBtn) {
      const viewId = navBtn.getAttribute('data-nav-view');
      ui.navigate(viewId);
      await hydrateActiveView();
      return;
    }

    const pid = state.partner ? encodeURIComponent(state.partner.id || state.partner.partnerId) : null;

    const removePdfIdx = ev.target.closest('[data-remove-pdf]')?.getAttribute('data-remove-pdf');
    if (removePdfIdx !== undefined && removePdfIdx !== null && state.partner) {
      syncPmeFieldsIntoState();
      const list = Array.isArray(state.partner.pdfFiles) ? [...state.partner.pdfFiles] : [];
      list.splice(Number(removePdfIdx), 1);
      state.partner.pdfFiles = list;
      renderDashboardLocal();
      return;
    }

    const removeImgIdx = ev.target.closest('[data-remove-img]')?.getAttribute('data-remove-img');
    if (removeImgIdx !== undefined && removeImgIdx !== null && state.partner) {
      syncPmeFieldsIntoState();
      const list = Array.isArray(state.partner.imageFiles) ? [...state.partner.imageFiles] : [];
      list.splice(Number(removeImgIdx), 1);
      state.partner.imageFiles = list;
      renderDashboardLocal();
      return;
    }

    const catAction = ev.target.closest('[data-catalog-action]')?.getAttribute('data-catalog-action');
    if (catAction === 'open-form') {
      state.catalogFormOpen = true;
      state.catalogEditingItem = null;
      renderCatalogState();
      return;
    }
    if (catAction === 'close-form') {
      state.catalogFormOpen = false;
      state.catalogEditingItem = null;
      renderCatalogState();
      return;
    }

    const editId = ev.target.closest('[data-catalog-edit]')?.getAttribute('data-catalog-edit');
    if (editId) {
      state.catalogEditingItem = state.catalogItems.find((i) => i.id === editId) || null;
      state.catalogFormOpen = Boolean(state.catalogEditingItem);
      renderCatalogState();
      return;
    }

    const delId = ev.target.closest('[data-catalog-delete]')?.getAttribute('data-catalog-delete');
    if (delId && pid) {
      await apiFetch(`/api/v1/partners/${pid}/catalog/${encodeURIComponent(delId)}`, {
        method: 'DELETE',
      }).catch(() => {});
      await hydrateActiveView();
      return;
    }

    const exportApptDate = ev.target
      .closest('[data-export-appointments-date]')
      ?.getAttribute('data-export-appointments-date');
    if (exportApptDate && state.partner) {
      await ui.views.appointments.exportAppointmentsPdf({
        partnerId: state.partner.id,
        dateStr: exportApptDate,
      });
      return;
    }

    const cancelApptId = ev.target
      .closest('[data-cancel-appointment]')
      ?.getAttribute('data-cancel-appointment');
    if (cancelApptId && pid) {
      await apiFetch(
        `/api/v1/partners/${pid}/appointments/${encodeURIComponent(cancelApptId)}/cancel`,
        { method: 'POST', body: JSON.stringify({}) }
      ).catch(async () => {
        await ui.views.appointments.cancelAppointmentOffline(state.partner.id, cancelApptId);
      });
      await hydrateActiveView();
      return;
    }

    const shareApptId = ev.target
      .closest('[data-share-appointment]')
      ?.getAttribute('data-share-appointment');
    if (shareApptId) {
      const appt = state.appointments.find((a) => a.id === shareApptId) || {};
      await ui.views.appointments.shareReceipt({
        id: shareApptId,
        text: `Agendamento ${appt.date_str || ''} ${appt.time_slot || ''} - ${appt.client_name || ''}`,
      });
      return;
    }

    const exportOrderDate = ev.target
      .closest('[data-export-orders-date]')
      ?.getAttribute('data-export-orders-date');
    if (exportOrderDate && state.partner) {
      await ui.views.orders.exportOrdersPdf({
        partnerId: state.partner.id,
        dateStr: exportOrderDate,
      });
      return;
    }

    const cancelOrderId = ev.target
      .closest('[data-cancel-order]')
      ?.getAttribute('data-cancel-order');
    if (cancelOrderId && pid) {
      await apiFetch(
        `/api/v1/partners/${pid}/orders/${encodeURIComponent(cancelOrderId)}/cancel`,
        { method: 'POST', body: JSON.stringify({}) }
      ).catch(() => {});
      await hydrateActiveView();
      return;
    }

    const shareOrderId = ev.target
      .closest('[data-share-order]')
      ?.getAttribute('data-share-order');
    if (shareOrderId) {
      const order = state.orders.find((o) => o.id === shareOrderId) || {};
      const itemsTxt = (Array.isArray(order.items) ? order.items : [])
        .map((it) => `${it.qty || 1}x ${it.name || 'Produto'}`)
        .join(', ');
      await ui.views.orders.shareReceipt({
        id: shareOrderId,
        text: `Pedido #${shareOrderId} - ${order.client_name || ''}${itemsTxt ? ` (${itemsTxt})` : ''}`,
      });
      return;
    }

    const convSelectId = ev.target.closest('[data-conv-select]')?.getAttribute('data-conv-select');
    if (convSelectId && pid) {
      if (String(state.selectedConvId || '') === String(convSelectId)) {
        state.selectedConvId = null;
        state.convMessages = [];
        renderConversationsState();
        return;
      }
      state.selectedConvId = convSelectId;
      state.convMessages = [];
      renderConversationsState();
      const loadedMessages = await apiFetch(
        `/api/v1/partners/${pid}/conversations/${encodeURIComponent(convSelectId)}/messages`
      ).catch(() => []);
      if (String(state.selectedConvId || '') === String(convSelectId)) {
        state.convMessages = Array.isArray(loadedMessages) ? loadedMessages : [];
        renderConversationsState();
      }
      return;
    }

    const pauseBtn = ev.target.closest('[data-conv-toggle-pause]');
    if (pauseBtn && pid) {
      const convId = pauseBtn.getAttribute('data-conv-toggle-pause');
      const currentlyPaused = pauseBtn.getAttribute('data-paused') === '1';
      const chatJid = pauseBtn.getAttribute('data-chat-jid') || '';
      const digits = String(chatJid).split('@')[0].split(':')[0].replace(/\D/g, '');
      if (!currentlyPaused && digits && typeof window !== 'undefined') {
        window.open(`https://wa.me/${digits}`, '_blank', 'noopener,noreferrer');
      }
      await apiFetch(
        `/api/v1/partners/${pid}/conversations/${encodeURIComponent(convId)}/pause`,
        {
          method: 'POST',
          body: JSON.stringify({ paused: !currentlyPaused }),
        }
      ).catch(() => {});
      await hydrateActiveView();
      return;
    }

    const actionBtn = ev.target.closest('[data-action]');
    if (!actionBtn) return;
    const action = actionBtn.getAttribute('data-action');
    const today = getLocalDateStr();

    if (action === 'sync-now') {
      await ui.syncQueue.flush();
      await hydrateActiveView();
    } else if (action === 'export-appointments-pdf' && state.partner) {
      await ui.views.appointments.exportAppointmentsPdf({
        partnerId: state.partner.id,
        dateStr: today,
      });
    } else if (action === 'export-orders-pdf' && state.partner) {
      await ui.views.orders.exportOrdersPdf({
        partnerId: state.partner.id,
        dateStr: today,
      });
    } else if (action === 'export-catalog' && state.partner) {
      await ui.views.catalog.exportCatalog(state.partner.id, state.catalogItems, 'json');
    } else if (action === 'save-pme-config' && pid) {
      const patch = collectPmeFieldsFromDom();
      try {
        const updated = await apiFetch(`/api/v1/partners/${pid}/config`, {
          method: 'PUT',
          body: JSON.stringify(patch),
        });
        if (updated) state.partner = { ...state.partner, ...updated };
        state.pmeSaveFeedback = {
          ok: true,
          message: 'Alterações do Max salvas no banco com sucesso!',
        };
        await hydrateActiveView();
      } catch (err) {
        state.pmeSaveFeedback = {
          ok: false,
          message: err?.message || 'Erro ao salvar alterações do Max.',
        };
        renderDashboardLocal();
      }
    } else if (action === 'test-ai' && state.partner) {
      try {
        state.aiTestResult = await apiFetch('/api/v1/ai/test', {
          method: 'POST',
          body: JSON.stringify({ partnerId: state.partner.id }),
        });
      } catch (err) {
        state.aiTestResult = { ok: false, error: err.message };
      }
      await hydrateActiveView();
    } else if (action === 'connect-whatsapp' && state.partner) {
      state.waModalOpen = true;
      state.waModalData = {
        open: true,
        status: 'PAIRING_READY',
        qrCodeBase64: null,
        phoneNumber: null,
        sessionKey: state.sessionKey,
      };
      renderWaModal();
      await refreshWaQr({ force: false, wait: true });
    }
  });

  renderAuthGate();
  restoreSession();
  return ui;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBrowserApp);
  } else {
    initBrowserApp();
  }
}

module.exports = { initBrowserApp };
~~~~

### app-web/src/components/AuthScreen.js

- **Bloco:** Bloco 6 — Camada 6 (Interface Dark Cyber Neon SPA/PWA, Offline-First, Capacitor Android & Render)
- **Imports internos (`require` / `import`):** `app-web/src/components/Icons`
- **Exports principais:** `AuthScreen`
- **Total de linhas:** 59

~~~~javascript
'use strict';

const { icon } = require('./Icons');

/**
 * Full-screen Dark Cyber Neon login & registration overlay (`#welcomeScreen` equivalent).
 * Blocks access to the operational panel until authenticated.
 */
class AuthScreen {
  /**
   * @param {{ brandLogoUrl?: string }} [options]
   */
  constructor(options = {}) {
    this.brandLogoUrl = options.brandLogoUrl || './assets/img/logo-autonmax.jpg';
  }

  /**
   * Renders the full-screen authentication overlay.
   * @param {{ mode?: 'login' | 'register', error?: string, message?: string }} [state]
   * @returns {string}
   */
  render(state = {}) {
    const isRegister = state.mode === 'register';
    const errorHtml = state.error
      ? `<p class="auth-feedback error" data-auth-error="true">${state.error}</p>`
      : '';
    const msgHtml = state.message
      ? `<p class="auth-feedback success" data-auth-message="true">${state.message}</p>`
      : '';

    return [
      `<div class="welcome-screen" data-auth-screen="true">`,
      `  <div class="welcome-card glass-cyber">`,
      `    <img src="${this.brandLogoUrl}" alt="AUTON.MAX" class="clean-brand-logo" onerror="this.style.display='none'" />`,
      `    <h1 class="welcome-title">Bem-vindo ao <span class="cyber-accent">AUTON.MAX</span></h1>`,
      `    <p class="welcome-subtitle">Atendente para o seu negócio</p>`,
      `    <form class="welcome-form" data-auth-form="true">`,
      isRegister
        ? `<input name="displayName" type="text" class="dark-input" placeholder="Nome do Estabelecimento" required autocomplete="organization" />`
        : '',
      `      <input name="email" type="email" class="dark-input" placeholder="E-mail" required autocomplete="email" />`,
      `      <input name="password" type="password" class="dark-input" placeholder="Senha" required autocomplete="${isRegister ? 'new-password' : 'current-password'}" />`,
      `      <div class="welcome-actions">`,
      `        <button type="submit" class="exec-action-btn primary glow-neon" style="flex: 1;" data-auth-submit="true">${icon('sparkles', { size: 16 })} <span>${isRegister ? 'Criar Conta' : 'Entrar'}</span></button>`,
      `        <button type="button" class="exec-action-btn" style="flex: 1;" data-auth-action="switch-auth">${isRegister ? 'Já tenho conta' : 'Criar Conta'}</button>`,
      `      </div>`,
      `      ${errorHtml}`,
      `      ${msgHtml}`,
      `    </form>`,
      `  </div>`,
      `</div>`,
    ]
      .filter(Boolean)
      .join('\n');
  }
}

module.exports = { AuthScreen };
~~~~

### app-web/src/components/Icons.js

- **Bloco:** Bloco 6 — Camada 6 (Interface Dark Cyber Neon SPA/PWA, Offline-First, Capacitor Android & Render)
- **Imports internos (`require` / `import`):** (nenhum)
- **Exports principais:** `icon`, `ICONS`
- **Total de linhas:** 75

~~~~javascript
'use strict';

/**
 * Offline-first inline SVG icons (`stroke="currentColor"`, zero hardcoded colors).
 */
const ICONS = Object.freeze({
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.77 1 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  'message-square':
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  'log-out':
    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  store:
    '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  'file-text':
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  'qr-code':
    '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3z"/><path d="M17 17h4v4h-4z"/><path d="M14 21h3"/>',
  upload:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  save:
    '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  layers:
    '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  'shopping-bag':
    '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  clock:
    '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  shield:
    '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  'calendar-check':
    '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/>',
  'shopping-cart':
    '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  'plus-circle':
    '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>',
  search:
    '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  'arrow-left':
    '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  'trash-2':
    '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  pause:
    '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
  play:
    '<polygon points="5 3 19 12 5 21 5 3"/>',
  send:
    '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  'refresh-cw':
    '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  sparkles:
    '<path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/>',
  'check-circle':
    '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  'alert-triangle':
    '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  x:
    '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
});

/**
 * Renders an inline SVG icon by name.
 * @param {string} name
 * @param {{ size?: number, className?: string }} [options]
 * @returns {string}
 */
function icon(name, options = {}) {
  const body = ICONS[name] || ICONS.sparkles;
  const size = Number(options.size || 18);
  const cls = options.className ? ` class="${options.className}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${cls}>${body}</svg>`;
}

module.exports = { icon, ICONS };
~~~~

### app-web/src/components/OperationalStatusBadge.js

- **Bloco:** Bloco 6 — Camada 6 (Interface Dark Cyber Neon SPA/PWA, Offline-First, Capacitor Android & Render)
- **Imports internos (`require` / `import`):** (nenhum)
- **Exports principais:** `OperationalStatusBadge`, `STATUS_META`
- **Total de linhas:** 96

~~~~javascript
'use strict';

const STATUS_META = Object.freeze({
  ONLINE: {
    label: 'Online',
    toneVar: 'var(--color-success)',
    banner: '',
  },
  OFFLINE: {
    label: 'Modo Offline',
    toneVar: 'var(--color-warning)',
    banner: 'Modo Offline — alterações salvas localmente e na fila de sincronização.',
  },
  SYNCING: {
    label: 'Sincronizando',
    toneVar: 'var(--color-primary)',
    banner: 'Sincronizando alterações pendentes...',
  },
  CONFLICT: {
    label: 'Conflito de Sincronização',
    toneVar: 'var(--color-danger)',
    banner: 'Há conflitos de sincronização aguardando revisão.',
  },
});

/**
 * OperationalStatusBadge (Invariant 6):
 * Discrete connectivity & sync indicator (`ONLINE | OFFLINE | SYNCING | CONFLICT`)
 * mounted inside the operational area independently of AppShell.
 */
class OperationalStatusBadge {
  /**
   * @param {{ status?: 'ONLINE' | 'OFFLINE' | 'SYNCING' | 'CONFLICT', pendingCount?: number, conflictCount?: number }} [initial]
   */
  constructor(initial = {}) {
    this.status = STATUS_META[initial.status] ? initial.status : 'ONLINE';
    this.pendingCount = Number(initial.pendingCount || 0);
    this.conflictCount = Number(initial.conflictCount || 0);
  }

  /**
   * Updates badge state.
   * @param {{ status?: 'ONLINE' | 'OFFLINE' | 'SYNCING' | 'CONFLICT', pendingCount?: number, conflictCount?: number }} next
   */
  update(next = {}) {
    if (next.status && STATUS_META[next.status]) {
      this.status = next.status;
    }
    if (next.pendingCount !== undefined) {
      this.pendingCount = Number(next.pendingCount);
    }
    if (next.conflictCount !== undefined) {
      this.conflictCount = Number(next.conflictCount);
    }
    return this.getSnapshot();
  }

  getSnapshot() {
    const meta = STATUS_META[this.status] || STATUS_META.ONLINE;
    return {
      status: this.status,
      label: meta.label,
      toneVar: meta.toneVar,
      banner: meta.banner,
      pendingCount: this.pendingCount,
      conflictCount: this.conflictCount,
    };
  }

  /**
   * Renders semantic HTML using CSS variables only.
   * @returns {string}
   */
  render() {
    const snap = this.getSnapshot();
    const bannerHtml = snap.banner
      ? `<div class="autonmax-card" data-autonmax-offline-banner="true" style="border-color: ${snap.toneVar}; color: var(--color-text);">${snap.banner}</div>`
      : '';

    return [
      `<div data-autonmax-status-wrapper="true">`,
      `  <span class="autonmax-status-badge" data-autonmax-status="${snap.status}" style="border-color: ${snap.toneVar}; color: ${snap.toneVar};">`,
      `    <span>${snap.label}</span>`,
      snap.pendingCount > 0 ? `<span>(${snap.pendingCount} pendente(s))</span>` : '',
      snap.conflictCount > 0 ? `<span>(${snap.conflictCount} conflito(s))</span>` : '',
      `  </span>`,
      bannerHtml,
      `</div>`,
    ]
      .filter(Boolean)
      .join('\n');
  }
}

module.exports = { OperationalStatusBadge, STATUS_META };
~~~~

### app-web/src/components/WhatsAppQrModal.js

- **Bloco:** Bloco 6 — Camada 6 (Interface Dark Cyber Neon SPA/PWA, Offline-First, Capacitor Android & Render)
- **Imports internos (`require` / `import`):** `app-web/src/components/Icons`
- **Exports principais:** `WhatsAppQrModal`
- **Total de linhas:** 77

~~~~javascript
'use strict';

const { icon } = require('./Icons');

/**
 * WhatsApp QR Code connection modal (`#waModal` equivalent) with Skeleton Shimmer.
 */
class WhatsAppQrModal {
  /**
   * @param {{
   *   open?: boolean,
   *   status?: string,
   *   qrCodeBase64?: string | null,
   *   phoneNumber?: string | null,
   *   sessionKey?: string | null
   * }} [state]
   * @returns {string}
   */
  render(state = {}) {
    if (!state.open) return '';

    const status = String(state.status || 'DISCONNECTED').toUpperCase();
    const isConnected = status === 'CONNECTED';
    const isStandby = status === 'STANDBY';

    let qrBoxInner;
    if (isConnected) {
      qrBoxInner = [
        `<div style="display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--color-qr-fg);">`,
        `  ${icon('check-circle', { size: 48 })}`,
        `  <strong>WhatsApp Conectado</strong>`,
        state.phoneNumber ? `<span>${state.phoneNumber}</span>` : '',
        `</div>`,
      ].join('');
    } else if (state.qrCodeBase64) {
      qrBoxInner = `<img src="${state.qrCodeBase64}" alt="WhatsApp QR Code" class="qr-image" data-wa-qr-img="true" />`;
    } else if (isStandby) {
      qrBoxInner = [
        `<div style="display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--color-qr-fg);">`,
        `  ${icon('alert-triangle', { size: 36 })}`,
        `  <strong>Sessão em Standby</strong>`,
        `  <span style="font-size: 0.8rem;">Clique em Gerar Novo QR</span>`,
        `</div>`,
      ].join('');
    } else {
      qrBoxInner = `<div class="qr-skeleton" data-qr-skeleton="true" aria-label="Gerando QR Code..."></div>`;
    }

    const pillClass = isConnected ? 'status-indicator-pill active' : 'status-indicator-pill paused';

    return [
      `<div class="modal-backdrop" data-wa-modal="true" role="dialog" aria-modal="true" aria-label="Conectar WhatsApp do Parceiro">`,
      `  <div class="modal-card glass-cyber">`,
      `    <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 8px;">`,
      `      <span class="cyber-accent">${icon('qr-code', { size: 22 })}</span>`,
      `      <h3 style="margin: 0; font-family: var(--font-heading);">Conectar WhatsApp do Parceiro</h3>`,
      `    </div>`,
      `    <div style="margin-bottom: 10px;">`,
      `      <span class="${pillClass}" data-wa-modal-status="${status}">`,
      `        <span class="indicator-dot"></span>`,
      `        <span>${status}</span>`,
      `      </span>`,
      `    </div>`,
      `    <div class="qr-placeholder">${qrBoxInner}</div>`,
      `    <div style="display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 14px;">`,
      `      <button type="button" class="exec-action-btn" data-wa-action="close">Concluído</button>`,
      `      <button type="button" class="exec-action-btn primary glow-neon" data-wa-action="force-qr">${icon('refresh-cw', { size: 16 })} <span>Gerar Novo QR</span></button>`,
      `      <button type="button" class="logout-btn" data-wa-action="disconnect">${icon('log-out', { size: 16 })} <span>Desconectar</span></button>`,
      `    </div>`,
      `  </div>`,
      `</div>`,
    ].join('\n');
  }
}

module.exports = { WhatsAppQrModal };
~~~~

### app-web/src/config/FrontendInitConfig.js

- **Bloco:** Bloco 6 — Camada 6 (Interface Dark Cyber Neon SPA/PWA, Offline-First, Capacitor Android & Render)
- **Imports internos (`require` / `import`):** `app-web/src/components/OperationalStatusBadge`, `app-web/src/ports/EnvironmentPorts`, `app-web/src/shell/AppShell`, `app-web/src/sync/SyncQueue`, `app-web/src/views/AppointmentsView`, `app-web/src/views/CatalogView`, `app-web/src/views/ChannelQrView`, `app-web/src/views/ConversationsView`, `app-web/src/views/DashboardView`, `app-web/src/views/OrdersView`
- **Exports principais:** `mountAutonmaxUI`, `applyThemeTokens`, `TOKEN_CSS_MAP`
- **Total de linhas:** 202

~~~~javascript
'use strict';

const { createEnvironmentPorts } = require('../ports/EnvironmentPorts');
const { SyncQueue } = require('../sync/SyncQueue');
const { OperationalStatusBadge } = require('../components/OperationalStatusBadge');
const { AppShell } = require('../shell/AppShell');
const { DashboardView } = require('../views/DashboardView');
const { CatalogView } = require('../views/CatalogView');
const { AppointmentsView } = require('../views/AppointmentsView');
const { OrdersView } = require('../views/OrdersView');
const { ConversationsView } = require('../views/ConversationsView');
const { ChannelQrView } = require('../views/ChannelQrView');

const TOKEN_CSS_MAP = Object.freeze({
  surfaceBg: '--surface-bg',
  surfaceCard: '--surface-card',
  surfaceBorder: '--surface-border',
  colorPrimary: '--color-primary',
  colorText: '--color-text',
  colorTextMuted: '--color-text-muted',
  colorSuccess: '--color-success',
  colorWarning: '--color-warning',
  colorDanger: '--color-danger',
  fontSans: '--font-sans',
  fontHeading: '--font-heading',
  brandName: '--brand-name',
  brandLogoUrl: '--brand-logo-url',
});

/**
 * Applies runtime White-Label CSS tokens onto the container element if supported.
 * @param {Record<string, any> | null} container
 * @param {Record<string, string>} themeTokens
 */
function applyThemeTokens(container, themeTokens = {}) {
  if (!container || !container.style || typeof container.style.setProperty !== 'function') {
    return;
  }
  for (const [key, cssVar] of Object.entries(TOKEN_CSS_MAP)) {
    if (themeTokens[key] !== undefined && themeTokens[key] !== null) {
      container.style.setProperty(cssVar, String(themeTokens[key]));
    }
  }
}

/**
 * Mounts the AUTONMAX vNext UI (Invariant 5 — Config-Driven Single Source).
 * Implements Doc 02 Section 5.4 (`FrontendInitConfig`).
 *
 * @param {Record<string, any>} container
 * @param {{
 *   shell_enabled?: boolean,
 *   ui_mode?: 'guided' | 'advanced',
 *   feature_flags?: Record<string, boolean>,
 *   theme_tokens?: Record<string, string>,
 *   output_actions?: Record<string, Function>,
 *   environment_ports?: Record<string, any>,
 *   initialView?: string,
 *   baseUrl?: string,
 *   fetchImpl?: typeof fetch
 * }} [config]
 */
function mountAutonmaxUI(container, config = {}) {
  const shellEnabled = config.shell_enabled !== false;
  let uiMode = config.ui_mode === 'advanced' ? 'advanced' : 'guided';
  const featureFlags = {
    bookings: true,
    orders: true,
    softPause: true,
    ...(config.feature_flags || {}),
  };
  const themeTokens = config.theme_tokens || {};
  const outputActions = config.output_actions || {};
  const ports = createEnvironmentPorts(config.environment_ports || {});

  const badge = new OperationalStatusBadge({
    status: ports.network.isOnline() ? 'ONLINE' : 'OFFLINE',
  });

  const syncQueue = new SyncQueue({
    storage: ports.storage,
    network: ports.network,
    secureAuth: ports.secureAuth,
    baseUrl: config.baseUrl || '',
    fetchImpl: config.fetchImpl,
    onStatusChange: (status) => {
      badge.update({ status });
      render();
    },
  });
  syncQueue.bindAutoFlush();

  let activeViewId = config.initialView || 'dashboard';
  let viewData = {};

  const ctx = {
    get uiMode() {
      return uiMode;
    },
    featureFlags,
    ports,
    syncQueue,
    outputActions,
  };

  const views = {
    dashboard: new DashboardView(ctx),
    catalog: new CatalogView(ctx),
    appointments: new AppointmentsView(ctx),
    orders: new OrdersView(ctx),
    conversations: new ConversationsView(ctx),
    channel: new ChannelQrView(ctx),
  };

  applyThemeTokens(container, themeTokens);

  let lastHtml = '';

  function render(dataOverride) {
    if (dataOverride) {
      viewData = { ...viewData, ...dataOverride };
    }
    const viewInstance = views[activeViewId] || views.dashboard;
    const viewHtml = viewInstance.render(viewData[activeViewId]);
    const operationalHtml = [
      `<div class="autonmax-app" data-autonmax-root="true" data-ui-mode="${uiMode}">`,
      badge.render(),
      viewHtml,
      `</div>`,
    ].join('\n');

    if (shellEnabled) {
      const shellMeta = viewData.shell || {};
      const shell = new AppShell({
        brandName: themeTokens.brandName || 'AUTON.MAX',
        brandLogoUrl: themeTokens.brandLogoUrl || './assets/img/logo-autonmax.jpg',
        activeView: activeViewId,
        featureFlags,
        uiMode,
        partnerName: shellMeta.partnerName || config.partnerName,
        partnerLogoUrl: shellMeta.partnerLogoUrl || config.partnerLogoUrl,
      });
      lastHtml = shell.render(operationalHtml);
    } else {
      lastHtml = operationalHtml;
    }

    if (container && 'innerHTML' in container) {
      container.innerHTML = lastHtml;
    }
    return lastHtml;
  }

  render();

  return {
    get shellEnabled() {
      return shellEnabled;
    },
    get uiMode() {
      return uiMode;
    },
    get activeView() {
      return activeViewId;
    },
    get html() {
      return lastHtml;
    },
    ports,
    syncQueue,
    badge,
    views,
    render,
    setUiMode(nextMode) {
      uiMode = nextMode === 'advanced' ? 'advanced' : 'guided';
      return render();
    },
    navigate(viewId) {
      if (views[viewId]) {
        activeViewId = viewId;
      }
      return render();
    },
    getActiveViewControls() {
      const v = views[activeViewId] || views.dashboard;
      return typeof v.getControls === 'function' ? v.getControls() : [];
    },
    unmount() {
      syncQueue.dispose();
      if (container && 'innerHTML' in container) {
        container.innerHTML = '';
      }
    },
  };
}

module.exports = {
  mountAutonmaxUI,
  applyThemeTokens,
  TOKEN_CSS_MAP,
};
~~~~

### app-web/src/ports/EnvironmentPorts.js

- **Bloco:** Bloco 6 — Camada 6 (Interface Dark Cyber Neon SPA/PWA, Offline-First, Capacitor Android & Render)
- **Imports internos (`require` / `import`):** `app-web/src/storage/CapacitorSqliteAdapter`, `app-web/src/storage/IndexedDbAdapter`
- **Exports principais:** `createEnvironmentPorts`
- **Total de linhas:** 152

~~~~javascript
'use strict';

const { IndexedDbAdapter } = require('../storage/IndexedDbAdapter');
const { CapacitorSqliteAdapter } = require('../storage/CapacitorSqliteAdapter');

/**
 * Creates unified EnvironmentPorts (Invariant 3) abstracting:
 * `storage`, `network`, `filesystem`, `secureAuth`, `clipboard`, `share`, `camera`.
 * Views and components consume ONLY these ports — zero direct runtime/Capacitor/IDB imports.
 * @param {Partial<{
 *   storage: import('../storage/StorageAdapter').StorageAdapter,
 *   network: Record<string, any>,
 *   filesystem: Record<string, any>,
 *   secureAuth: Record<string, any>,
 *   clipboard: Record<string, any>,
 *   share: Record<string, any>,
 *   camera: Record<string, any>,
 *   isNativePlatform: boolean
 * }>} [overrides]
 */
function createEnvironmentPorts(overrides = {}) {
  const isNative =
    overrides.isNativePlatform !== undefined
      ? Boolean(overrides.isNativePlatform)
      : Boolean(globalThis.Capacitor?.isNativePlatform?.());

  const storage =
    overrides.storage ||
    (isNative ? new CapacitorSqliteAdapter() : new IndexedDbAdapter());

  const networkListeners = new Set();
  const network = overrides.network || {
    isOnline() {
      if (typeof globalThis.navigator !== 'undefined' && typeof globalThis.navigator.onLine === 'boolean') {
        return globalThis.navigator.onLine;
      }
      return true;
    },
    onChange(cb) {
      networkListeners.add(cb);
      if (typeof globalThis.window?.addEventListener === 'function') {
        const onOnline = () => cb(true);
        const onOffline = () => cb(false);
        globalThis.window.addEventListener('online', onOnline);
        globalThis.window.addEventListener('offline', onOffline);
        return () => {
          networkListeners.delete(cb);
          globalThis.window.removeEventListener('online', onOnline);
          globalThis.window.removeEventListener('offline', onOffline);
        };
      }
      return () => networkListeners.delete(cb);
    },
  };

  const filesystem = overrides.filesystem || {
    async saveFile(filePath, content) {
      return storage.saveFile(filePath, content);
    },
    async readFile(filePath) {
      return storage.readFile(filePath);
    },
  };

  let memToken = null;
  const secureAuth = overrides.secureAuth || {
    async getToken() {
      if (isNative && globalThis.Capacitor?.Plugins?.SecureStoragePlugin) {
        try {
          const res = await globalThis.Capacitor.Plugins.SecureStoragePlugin.get({
            key: 'autonmax_jwt',
          });
          return res?.value || null;
        } catch {
          return null;
        }
      }
      if (typeof globalThis.sessionStorage !== 'undefined') {
        return globalThis.sessionStorage.getItem('autonmax_jwt');
      }
      return memToken;
    },
    async setToken(token) {
      if (isNative && globalThis.Capacitor?.Plugins?.SecureStoragePlugin) {
        await globalThis.Capacitor.Plugins.SecureStoragePlugin.set({
          key: 'autonmax_jwt',
          value: String(token),
        });
        return;
      }
      if (typeof globalThis.sessionStorage !== 'undefined') {
        globalThis.sessionStorage.setItem('autonmax_jwt', String(token));
        return;
      }
      memToken = String(token);
    },
    async clearToken() {
      if (isNative && globalThis.Capacitor?.Plugins?.SecureStoragePlugin) {
        await globalThis.Capacitor.Plugins.SecureStoragePlugin.remove({
          key: 'autonmax_jwt',
        });
        return;
      }
      if (typeof globalThis.sessionStorage !== 'undefined') {
        globalThis.sessionStorage.removeItem('autonmax_jwt');
        return;
      }
      memToken = null;
    },
  };

  const clipboard = overrides.clipboard || {
    async copy(text) {
      if (globalThis.navigator?.clipboard?.writeText) {
        await globalThis.navigator.clipboard.writeText(String(text));
        return { ok: true };
      }
      return { ok: true, copied: String(text) };
    },
  };

  const share = overrides.share || {
    async share(payload) {
      if (globalThis.navigator?.share) {
        await globalThis.navigator.share(payload);
        return { ok: true, native: true };
      }
      await clipboard.copy(payload?.text || payload?.url || '');
      return { ok: true, fallback: 'clipboard' };
    },
  };

  const camera = overrides.camera || {
    async captureOrScan() {
      return { ok: false, reason: 'CAMERA_NOT_CONFIGURED' };
    },
  };

  return {
    isNative,
    storage,
    network,
    filesystem,
    secureAuth,
    clipboard,
    share,
    camera,
  };
}

module.exports = { createEnvironmentPorts };
~~~~
