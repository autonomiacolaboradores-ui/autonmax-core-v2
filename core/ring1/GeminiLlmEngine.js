const MultiProviderLlmRouter = require('./MultiProviderLlmRouter');

class GeminiLlmEngine {
  constructor(options = {}) {
    this.router = new MultiProviderLlmRouter(options);
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY || null;
    this.modelName = options.modelName || 'gemini-1.5-flash';
  }

  formatPayload({ systemPrompt, userMessage, history = [] }) {
    const contents = [];
    for (const h of history) {
      contents.push({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }]
      });
    }
    contents.push({
      role: 'user',
      parts: [{ text: userMessage || 'Olá' }]
    });
    const payload = { contents };
    const sysText = systemPrompt || 'Você é o assistente executivo MAX do AUTON.MAX v2.0.';
    payload.systemInstruction = { parts: [{ text: sysText }] };
    return payload;
  }

  async generateResponse({ systemPrompt, userMessage, history = [] }) {
    // If an explicit apiKey option was provided to GeminiLlmEngine, pass it through
    if (this.apiKey) {
      this.router.keys.gemini = this.apiKey;
    }

    const res = await this.router.generateResponse({ systemPrompt, userMessage, history });
    
    // Map to expected GeminiLlmEngine output structure for backwards compatibility
    return {
      status: res.status === 'SUCCESS' ? 'SUCCESS' : (res.status === 'SOVEREIGN_FALLBACK' ? 'SOVEREIGN_FALLBACK' : 'OFFLINE_FALLBACK'),
      model: res.model || this.modelName,
      text: res.text,
      providerUsed: res.providerUsed
    };
  }
}

module.exports = GeminiLlmEngine;
