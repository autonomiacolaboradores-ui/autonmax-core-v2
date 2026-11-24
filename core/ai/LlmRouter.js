'use strict';

const MAX_TOOL_ITERATIONS = 3;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_QUARANTINE_MS = 60_000;
const DEFAULT_PROVIDER_ORDER = Object.freeze([
  'groq',
  'xai',
  'openai',
  'gemini',
  'openrouter',
]);

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
    defaultModel: 'gemini-2.5-flash',
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
      const parts = [];
      if (msg.content) parts.push({ text: String(msg.content) });
      for (const tc of msg.toolCalls) {
        parts.push({
          functionCall: {
            name: tc.name,
            args: parseToolArgs(tc.arguments),
          },
        });
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
    this.providerOrder = Array.isArray(options.providerOrder)
      ? [...options.providerOrder]
      : [...DEFAULT_PROVIDER_ORDER];
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.nowFn = options.nowFn || (() => Date.now());

    const optKeys = options.keys || {};
    this.keys = {
      groq: optKeys.groq ?? options.groqApiKey ?? process.env.GROQ_API_KEY ?? null,
      xai:
        optKeys.xai ??
        options.xaiApiKey ??
        options.grokApiKey ??
        process.env.XAI_API_KEY ??
        process.env.GROK_API_KEY ??
        null,
      openai:
        optKeys.openai ?? options.openAiApiKey ?? process.env.OPENAI_API_KEY ?? null,
      gemini:
        optKeys.gemini ?? options.geminiApiKey ?? process.env.GEMINI_API_KEY ?? null,
      openrouter:
        optKeys.openrouter ??
        options.openRouterApiKey ??
        process.env.OPENROUTER_API_KEY ??
        null,
    };

    const optModels = options.models || {};
    this.models = {
      groq: optModels.groq || options.groqModel || PROVIDER_ENDPOINTS.groq.defaultModel,
      xai: optModels.xai || options.xaiModel || PROVIDER_ENDPOINTS.xai.defaultModel,
      openai:
        optModels.openai || options.openAiModel || PROVIDER_ENDPOINTS.openai.defaultModel,
      gemini:
        optModels.gemini || options.geminiModel || PROVIDER_ENDPOINTS.gemini.defaultModel,
      openrouter:
        optModels.openrouter ||
        options.openRouterModel ||
        PROVIDER_ENDPOINTS.openrouter.defaultModel,
    };

    /** @type {Record<string, { failures: number, status: 'CLOSED' | 'TRIPPED', retryAfter: number, lastReason?: string }>} */
    this.circuitBreaker = {};
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
      /429|503|502|504|TIMEOUT|ABORT/i.test(msg);

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
        const err = new Error(`${errMsg} (HTTP_${response.status})`);
        err.statusCode = response.status;
        err.critical = response.status === 429 || response.status >= 500;
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
  async _callOpenAiProvider(providerId, apiKey, { systemPrompt, messages, tools, toolChoice, signal }) {
    const spec = PROVIDER_ENDPOINTS[providerId];
    const model = this.models[providerId] || spec.defaultModel;
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
  async _callGeminiProvider(apiKey, { systemPrompt, messages, tools, signal }) {
    const model = this.models.gemini || PROVIDER_ENDPOINTS.gemini.defaultModel;
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
      if (part.text) textParts.push(part.text);
      if (part.functionCall) {
        toolCalls.push({
          id: `gemini_call_${i + 1}`,
          name: part.functionCall.name,
          arguments: parseToolArgs(part.functionCall.args),
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
      const apiKey = this.keys[providerId];
      if (!apiKey || !this.isProviderHealthy(providerId)) {
        continue;
      }

      try {
        const res =
          providerId === 'gemini'
            ? await this._callGeminiProvider(apiKey, {
                systemPrompt,
                messages,
                tools,
                signal: params.signal,
              })
            : await this._callOpenAiProvider(providerId, apiKey, {
                systemPrompt,
                messages,
                tools,
                toolChoice: params.toolChoice,
                signal: params.signal,
              });

        this.recordSuccess(providerId);
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
        errors.push({ provider: providerId, reason });
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
