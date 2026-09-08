class LlmAdapter {
  constructor(mode = 'HYBRID') {
    this.mode = mode; // 'LOCAL_OLLAMA', 'CLOUD_API', 'HYBRID'
  }

  async generateResponse(prompt, context = {}) {
    // Adaptação simulada de resposta de IA conectando regras de negócio
    if (this.mode === 'LOCAL_OLLAMA' || this.mode === 'HYBRID') {
      return this.mockLocalOllama(prompt, context);
    } else {
      return this.mockCloudApi(prompt, context);
    }
  }

  mockLocalOllama(prompt, context) {
    return `[OLLAMA-LOCAL] Resposta baseada no contexto seguro: Entendido. Analisei "${prompt}".`;
  }

  mockCloudApi(prompt, context) {
    return `[CLOUD-FALLBACK] Processamento remoto seguro para: "${prompt}".`;
  }
}

module.exports = LlmAdapter;
