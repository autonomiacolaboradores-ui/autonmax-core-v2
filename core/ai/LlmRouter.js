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
