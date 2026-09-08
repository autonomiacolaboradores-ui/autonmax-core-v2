const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { PmeAgentConfigurator } = require('./PmeAgentConfigurator');

function loadEnvFile() {
  try {
    const envPath = path.join(__dirname, '..', '..', '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1];
          let value = (match[2] || '').trim();
          if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
          process.env[key] = value;
        }
      }
    }
  } catch (_) {}
}

class MultiProviderLlmRouter {
  constructor(options = {}) {
    loadEnvFile();

    this.timeoutMs = options.timeoutMs || 10000;
    this.keys = {
      grok: options.grokApiKey || options.groqApiKey || process.env.GROK_API_KEY || process.env.XAI_API_KEY || process.env.GROQ_API_KEY || null,
      groq: options.groqApiKey || options.grokApiKey || process.env.GROQ_API_KEY || process.env.GROK_API_KEY || process.env.XAI_API_KEY || null,
      openai: options.openAiApiKey || process.env.OPENAI_API_KEY || null,
      gemini: options.geminiApiKey || process.env.GEMINI_API_KEY || null,
      openrouter: options.openRouterApiKey || process.env.OPENROUTER_API_KEY || null
    };

    this.models = {
      grok: options.grokModel || options.groqModel || (process.env.GROK_API_KEY || process.env.XAI_API_KEY ? 'grok-4.6' : 'openai/gpt-oss-120b'),
      groq: options.groqModel || 'openai/gpt-oss-120b',
      openai: options.openAiModel || 'gpt-4o-mini',
      gemini: options.geminiModel || 'gemini-2.5-flash',
      openrouter: options.openRouterModel || 'deepseek/deepseek-chat'
    };
    
    this.circuitBreaker = {};
    // Instancia o configurador para buscar o prompt compilado (Sprint 10)
    this.pmeConfigurator = new PmeAgentConfigurator();
  }

  async generateResponse(params) {
    const fallbackResponse = this._buildStandardPayload(
      'LOCAL_FALLBACK',
      'LocalMaxEngine',
      'edge-max-v3',
      '[FUNCIONÁRIO DIGITAL MAX - AUTONOMIA-MAX-EDGE] Olá! No momento nossa rede inteligente está passando por uma rápida estabilização. Como posso te ajudar agora?'
    );

    // Timeout de segurança para a cascata completa (20s)
    const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(fallbackResponse), 20000));
    return Promise.race([this._generateResponseInternal(params), timeoutPromise]);
  }

  async _generateResponseInternal({ systemPrompt, userMessage, history = [], partnerId = null, mode = 'pme' }) {
    loadEnvFile();
    this.keys.grok = this.keys.grok || this.keys.groq || process.env.GROK_API_KEY || process.env.XAI_API_KEY || process.env.GROQ_API_KEY || null;
    this.keys.groq = this.keys.groq || this.keys.grok || process.env.GROQ_API_KEY || process.env.GROK_API_KEY || process.env.XAI_API_KEY || null;
    this.keys.openai = this.keys.openai || process.env.OPENAI_API_KEY || null;
    this.keys.gemini = this.keys.gemini || process.env.GEMINI_API_KEY || null;
    this.keys.openrouter = this.keys.openrouter || process.env.OPENROUTER_API_KEY || null;

    let sysText = systemPrompt;
    if (!sysText && partnerId) {
      try {
        sysText = this.pmeConfigurator.compileMaxAttendantPrompt(partnerId);
      } catch (err) {
        console.error(`[LLM_ROUTER] Erro ao compilar prompt do PME:`, err.message);
      }
    }
    
    if (!sysText || sysText.trim().length === 0) {
      sysText = 'Atenda os clientes deste estabelecimento com educação e clareza em português.';
    }

    const promptMessage = userMessage || 'Olá';

    // Roteamento padrão PME
    const priorities = ['groq', 'grok', 'openai', 'gemini', 'openrouter'];

    for (const provider of priorities) {
      if (provider === 'groq') {
        try {
          const groqKey = this.keys.groq || process.env.GROQ_API_KEY;
          if (groqKey && this.isProviderHealthy('groq')) {
            const candidateModels = [this.models.groq || 'llama-3.3-70b-versatile', 'llama3-8b-8192'];
            for (const modelName of candidateModels) {
              try {
                const groqResult = await this._callOpenAiCompatible({
                  host: 'api.groq.com', pathStr: '/openai/v1/chat/completions', apiKey: groqKey, model: modelName,
                  systemPrompt: sysText, userMessage: promptMessage, history
                });
                if (groqResult && groqResult.status === 'SUCCESS' && groqResult.text && groqResult.text.trim()) {
                  console.log(`[AI_ROUTER] ✅ Resposta gerada via GROQ (${modelName}) com sucesso. [mode=${mode}]`);
                  this.recordSuccess('groq');
                  return this._buildStandardPayload('SUCCESS', `Groq (${modelName})`, modelName, groqResult.text.trim());
                }
                if (groqResult && groqResult.shouldTripCircuitBreaker) {
                  this.tripCircuitBreaker('groq', groqResult.reason || 'ERROR');
                  break;
                }
              } catch (e) { }
            }
          }
        } catch (err) {
          this.tripCircuitBreaker('groq', err.message);
        }
      }

      if (provider === 'grok') {
        try {
          const grokKey = this.keys.grok || process.env.XAI_API_KEY || process.env.GROK_API_KEY;
          if (grokKey && this.isProviderHealthy('grok')) {
            const candidateModels = [this.models.grok || 'grok-2-latest', 'grok-beta'];
            for (const modelName of candidateModels) {
              try {
                const grokResult = await this._callOpenAiCompatible({
                  host: 'api.x.ai', pathStr: '/v1/chat/completions', apiKey: grokKey, model: modelName,
                  systemPrompt: sysText, userMessage: promptMessage, history
                });
                if (grokResult && grokResult.status === 'SUCCESS' && grokResult.text && grokResult.text.trim()) {
                  console.log(`[AI_ROUTER] ✅ Resposta gerada via xAI/Grok (${modelName}) com sucesso. [mode=${mode}]`);
                  this.recordSuccess('grok');
                  return this._buildStandardPayload('SUCCESS', `Grok (${modelName})`, modelName, grokResult.text.trim());
                }
                if (grokResult && grokResult.shouldTripCircuitBreaker) {
                  this.tripCircuitBreaker('grok', grokResult.reason || 'ERROR');
                  break;
                }
              } catch (e) { }
            }
          }
        } catch (err) {
          this.tripCircuitBreaker('grok', err.message);
        }
      }

      if (provider === 'openai') {
        try {
          if (this.keys.openai && this.isProviderHealthy('openai')) {
            const candidateModels = [this.models.openai || 'gpt-4o-mini', 'gpt-4o'];
            for (const modelName of candidateModels) {
              try {
                const oaiResult = await this._callOpenAiCompatible({
                  host: 'api.openai.com', pathStr: '/v1/chat/completions', apiKey: this.keys.openai,
                  model: modelName, systemPrompt: sysText, userMessage: promptMessage, history
                });
                if (oaiResult && oaiResult.status === 'SUCCESS' && oaiResult.text && oaiResult.text.trim()) {
                  console.log(`[AI_ROUTER] ✅ Resposta gerada via OPENAI (${modelName}) com sucesso. [mode=${mode}]`);
                  this.recordSuccess('openai');
                  return this._buildStandardPayload('SUCCESS', `OpenAI (${modelName})`, modelName, oaiResult.text.trim());
                }
                if (oaiResult && oaiResult.shouldTripCircuitBreaker) {
                  this.tripCircuitBreaker('openai', oaiResult.reason || 'ERROR');
                  break;
                }
              } catch (e) { }
            }
          }
        } catch (err) {
          this.tripCircuitBreaker('openai', err.message);
        }
      }

      if (provider === 'gemini') {
        try {
          if (this.keys.gemini && this.isProviderHealthy('gemini')) {
            const geminiResult = await this._callGemini(sysText, promptMessage, history);
            if (geminiResult && geminiResult.status === 'SUCCESS' && geminiResult.text && geminiResult.text.trim()) {
              console.log(`[AI_ROUTER] ✅ Resposta gerada via GEMINI (${geminiResult.model}) com sucesso. [mode=${mode}]`);
              this.recordSuccess('gemini');
              return this._buildStandardPayload('SUCCESS', `Gemini (${geminiResult.model})`, geminiResult.model, geminiResult.text.trim());
            }
            if (geminiResult && geminiResult.shouldTripCircuitBreaker) {
              this.tripCircuitBreaker('gemini', geminiResult.reason || 'ERROR');
            }
          }
        } catch (err) {
          this.tripCircuitBreaker('gemini', err.message);
        }
      }

      if (provider === 'openrouter') {
        try {
          if (this.keys.openrouter && this.isProviderHealthy('openrouter')) {
            const candidateModels = [this.models.openrouter || 'deepseek/deepseek-chat', 'meta-llama/llama-3.3-70b-instruct'];
            for (const modelName of candidateModels) {
              try {
                const orResult = await this._callOpenAiCompatible({
                  host: 'openrouter.ai', pathStr: '/api/v1/chat/completions', apiKey: this.keys.openrouter,
                  model: modelName, systemPrompt: sysText, userMessage: promptMessage, history,
                  customHeaders: { 'HTTP-Referer': 'https://autonmax.io', 'X-Title': 'AUTON.MAX' }
                });
                if (orResult && orResult.status === 'SUCCESS' && orResult.text && orResult.text.trim()) {
                  console.log(`[AI_ROUTER] ✅ Resposta gerada via OPENROUTER (${modelName}) com sucesso. [mode=${mode}]`);
                  this.recordSuccess('openrouter');
                  return this._buildStandardPayload('SUCCESS', `OpenRouter (${modelName})`, modelName, orResult.text.trim());
                }
                if (orResult && orResult.shouldTripCircuitBreaker) {
                  this.tripCircuitBreaker('openrouter', orResult.reason || 'ERROR');
                  break;
                }
              } catch (e) { }
            }
          }
        } catch (err) {
          this.tripCircuitBreaker('openrouter', err.message);
        }
      }
    }

    console.warn(`[LLM_ROUTER_FAILOVER] 🛡️ Todos os provedores externos falharam. Acionando Fallback Soberano Local.`);
    return this._buildStandardPayload(
      'LOCAL_FALLBACK', 'LocalMaxEngine', 'edge-max-v3',
      '[FUNCIONÁRIO DIGITAL MAX] Olá! No momento nossa rede inteligente está passando por uma rápida estabilização. Como posso te ajudar agora?'
    );
  }

  _buildStandardPayload(status, providerUsed, model, text) {
    return { status, providerUsed, model, text };
  }

  async _callGemini(systemPrompt, userMessage, history) {
    const candidateModels = [this.models.gemini, 'gemini-1.5-pro'];
    const contents = [];

    for (const h of history) {
      contents.push({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.text }] });
    }
    contents.push({ role: 'user', parts: [{ text: userMessage }] });

    const payload = {
      contents,
      systemInstruction: { parts: [{ text: systemPrompt }] }
    };

    const jsonBody = JSON.stringify(payload);

    for (const modelName of candidateModels) {
      const pathStr = `/v1beta/models/${modelName}:generateContent?key=${this.keys.gemini}`;
      const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': this.keys.gemini };

      let resData;
      try {
        resData = await this._httpRequest('generativelanguage.googleapis.com', pathStr, 'POST', headers, jsonBody, this.timeoutMs);
      } catch (err) {
        // Timeout ou erro de rede propaga imediatamente para o circuit breaker
        return { status: 'FAILED', reason: err.message, shouldTripCircuitBreaker: true };
      }

      const parsed = JSON.parse(resData);

      if (parsed.error) {
        const isCritical = parsed.error.code === 429 || parsed.error.code >= 500;
        if (parsed.error.code === 404) continue;
        return { status: 'FAILED', reason: parsed.error.message || parsed.error.status || 'API_ERROR', shouldTripCircuitBreaker: isCritical };
      }

      const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        return { status: 'SUCCESS', model: modelName, text };
      }
    }

    return { status: 'FAILED', reason: 'ALL_MODELS_FAILED', shouldTripCircuitBreaker: false };
  }

  async _callOpenAiCompatible({ host, pathStr, apiKey, model, systemPrompt, userMessage, history, customHeaders = {} }) {
    const cleanKey = (apiKey || '').replace(/["'\s]/g, '').trim();
    const messages = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    for (const h of history) {
      messages.push({ role: h.role === 'user' ? 'user' : 'assistant', content: h.text });
    }

    messages.push({ role: 'user', content: userMessage });

    const payload = {
      model,
      messages,
      temperature: 0.7
    };

    const jsonBody = JSON.stringify(payload);
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cleanKey}`,
      ...customHeaders
    };

    let resData;
    try {
      resData = await this._httpRequest(host, pathStr, 'POST', headers, jsonBody, this.timeoutMs);
    } catch (err) {
      return { status: 'FAILED', reason: err.message, shouldTripCircuitBreaker: true };
    }

    let parsed = {};
    try {
      parsed = JSON.parse(resData);
    } catch (_) {
      return { status: 'FAILED', reason: 'INVALID_JSON_RESPONSE', shouldTripCircuitBreaker: false };
    }

    if (parsed.error) {
      const detailMsg = parsed.error.message ? `${parsed.error.message} (${parsed.error.code || parsed.error.type || 'error'})` : JSON.stringify(parsed.error);
      const isCritical = parsed.error.code === 429 || parsed.error.code >= 500 || (parsed.error.message && parsed.error.message.includes('TIMEOUT'));
      return { status: 'FAILED', reason: detailMsg, shouldTripCircuitBreaker: isCritical };
    }

    const text = parsed?.choices?.[0]?.message?.content;
    if (text) {
      return { status: 'SUCCESS', text };
    }

    return { status: 'FAILED', reason: 'EMPTY_RESPONSE', shouldTripCircuitBreaker: false };
  }

  isProviderHealthy(providerId) {
     const state = this.circuitBreaker[providerId];
     if (!state) return true;

     if (state.status === 'TRIPPED') {
         if (Date.now() > state.retryAfter) {
             console.log(`[RING_1_HEAL] Circuit Breaker: Provedor ${providerId} restaurado após quarentena de 60s.`);
             state.status = 'CLOSED';
             state.failures = 0;
             return true;
         }
         return false; // Continua pulando (Quarentena ativa)
     }
     return true;
  }

  tripCircuitBreaker(providerId, reason) {
     if (!this.circuitBreaker[providerId]) {
         this.circuitBreaker[providerId] = { failures: 0, status: 'CLOSED' };
     }
     const state = this.circuitBreaker[providerId];
     
     // Falhas graves dão trip imediato
     const isCritical = reason.includes('429') || reason.includes('503') || reason.includes('TIMEOUT');
     
     if (isCritical) {
         state.failures = 3;
     } else {
         state.failures += 1;
     }

     if (state.failures >= 3 && state.status !== 'TRIPPED') {
         console.warn(`[RING_1_HEAL] Circuit Breaker: TRIPPED para ${providerId} (Motivo: ${reason}). Isolando por 60s.`);
         state.status = 'TRIPPED';
         state.retryAfter = Date.now() + 60000; // 60 segundos de quarentena
     } else {
         console.warn(`[RING_1_HEAL] Falha ${state.failures}/3 no provedor ${providerId} (${reason})`);
     }
  }

  recordSuccess(providerId) {
     if (this.circuitBreaker[providerId]) {
         this.circuitBreaker[providerId].failures = 0;
         this.circuitBreaker[providerId].status = 'CLOSED';
     }
  }

  _httpRequest(host, pathStr, method, headers, body, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: host,
          path: pathStr,
          method,
          headers: {
            ...headers,
            'Content-Length': Buffer.byteLength(body)
          }
        },
        res => {
          let data = '';
          res.on('data', chunk => (data += chunk));
          res.on('end', () => {
            if (res.statusCode >= 400) {
              try {
                const parsedErr = JSON.parse(data);
                if (parsedErr.error) {
                  const errMsg = parsedErr.error.message || parsedErr.error.type || `HTTP_${res.statusCode}`;
                  resolve(JSON.stringify({ error: { code: res.statusCode, message: `${errMsg} (HTTP_${res.statusCode})` } }));
                  return;
                }
              } catch (_) {}
              resolve(JSON.stringify({ error: { code: res.statusCode, message: `HTTP_${res.statusCode}` } }));
            } else {
              resolve(data);
            }
          });
        }
      );

      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error(`TIMEOUT`));
      });

      req.on('error', err => reject(err));
      req.write(body);
      req.end();
    });
  }
}

// Trava Anti-Loop de Execução de Ferramentas (Ring 1)
const MAX_TOOL_ITERATIONS = 3;

async function executeAgentToolPipeline(agentContext, toolName, toolParams, callHistory = []) {
    const sameToolCalls = callHistory.filter(
        call => call.toolName === toolName && JSON.stringify(call.params) === JSON.stringify(toolParams)
    );

    if (sameToolCalls.length >= 2) {
        console.warn(`[CIRCUIT_BREAKER] Trava Anti-Loop acionada! Ferramenta '${toolName}' repetida ${sameToolCalls.length}x.`);
        return {
            status: 'CIRCUIT_BREAKER_TRIGGERED',
            message: 'A IA tentou executar a mesma ação repetidamente sem progresso. Execução interrompida por segurança.',
            autoHealingTriggered: true
        };
    }

    if (callHistory.length >= MAX_TOOL_ITERATIONS) {
        console.warn(`[CIRCUIT_BREAKER] Limite máximo de ${MAX_TOOL_ITERATIONS} iterações de ferramentas atingido.`);
        return {
            status: 'MAX_ITERATIONS_REACHED',
            message: 'Limite de profundidade de raciocínio do agente atingido.',
            autoHealingTriggered: true
        };
    }

    callHistory.push({ toolName, params: toolParams, timestamp: Date.now() });
    return null;
}

MultiProviderLlmRouter.MAX_TOOL_ITERATIONS = MAX_TOOL_ITERATIONS;
MultiProviderLlmRouter.executeAgentToolPipeline = executeAgentToolPipeline;

module.exports = MultiProviderLlmRouter;
module.exports.executeAgentToolPipeline = executeAgentToolPipeline;
module.exports.MAX_TOOL_ITERATIONS = MAX_TOOL_ITERATIONS;
