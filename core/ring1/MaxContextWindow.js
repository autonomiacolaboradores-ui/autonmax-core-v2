/**
 * MAX.Context Window (MaxContextWindow.js)
 * Ring Buffer epêmero e janela de trabalho (Working Memory).
 * RFC-C108 / Ring 1 Cognitive Layer
 *
 * Melhorias v2:
 * - Estimativa de tokens refinada (CJK / whitespace aware)
 * - Preservação prioritária da última mensagem do usuário
 * - Suporte a metadata por mensagem
 * - Snapshot de uso e pressão de capacidade
 * - Formato OpenAI-compatible para despacho
 * - Proteção contra conteúdo nulo/não-string
 */

class MaxContextWindow {
  /**
   * @param {number} maxTokenCapacity - Capacidade máxima de tokens (default: 4096)
   * @param {object} [options]
   * @param {boolean} [options.preserveLastUserMessage=true]
   */
  constructor(maxTokenCapacity = 4096, options = {}) {
    if (typeof maxTokenCapacity !== 'number' || maxTokenCapacity < 64) {
      throw new Error('MaxContextWindow: maxTokenCapacity must be a number >= 64');
    }

    this.maxTokenCapacity = maxTokenCapacity;
    this.preserveLastUserMessage = options.preserveLastUserMessage !== false;

    /** @type {Array<ContextMessage>} */
    this.buffer = [];
    this.currentTokenCount = 0;
    /** @type {ContextMessage|null} */
    this.systemPrompt = null;

    /** Métricas internas */
    this._stats = {
      messagesPushed: 0,
      messagesEvicted: 0,
      capacityEnforcements: 0,
      lastEvictionAt: null
    };
  }

  /**
   * Define ou atualiza o system prompt (sempre preservado no enforceCapacity).
   * @param {string} content
   * @param {number} [tokenEstimate]
   */
  setSystemPrompt(content, tokenEstimate) {
    const safeContent = this._sanitizeContent(content);
    this.systemPrompt = {
      role: 'system',
      content: safeContent,
      tokenEstimate: tokenEstimate || this._estimateTokens(safeContent),
      timestamp: Date.now(),
      metadata: { pinned: true }
    };
    this._recalculateTokens();
  }

  /**
   * Insere mensagem e soma os tokens.
   * @param {string} role - 'user' | 'assistant' | 'system' | 'tool'
   * @param {string} content
   * @param {number} [tokenEstimate]
   * @param {object} [metadata]
   * @returns {ContextMessage}
   */
  pushMessage(role, content, tokenEstimate = 0, metadata = {}) {
    const allowedRoles = ['user', 'assistant', 'system', 'tool'];
    if (!allowedRoles.includes(role)) {
      throw new Error(`MaxContextWindow: invalid role "${role}". Allowed: ${allowedRoles.join(', ')}`);
    }

    if (role === 'system') {
      this.setSystemPrompt(content, tokenEstimate);
      return { ...this.systemPrompt };
    }

    const safeContent = this._sanitizeContent(content);
    const message = {
      role,
      content: safeContent,
      tokenEstimate: tokenEstimate > 0 ? tokenEstimate : this._estimateTokens(safeContent),
      timestamp: Date.now(),
      metadata: { ...metadata }
    };

    this.buffer.push(message);
    this.currentTokenCount += message.tokenEstimate;
    this._stats.messagesPushed += 1;
    this.enforceCapacity();

    return { ...message };
  }

  /**
   * Remove as mensagens mais antigas se o limite for ultrapassado (preservando system prompt
   * e, opcionalmente, a última mensagem do usuário).
   * @private
   */
  enforceCapacity() {
    const systemTokens = this.systemPrompt ? this.systemPrompt.tokenEstimate : 0;
    const available = Math.max(0, this.maxTokenCapacity - systemTokens);

    if (this.currentTokenCount <= available) return;

    this._stats.capacityEnforcements += 1;

    // Identifica índice da última mensagem de usuário para proteção
    let lastUserIdx = -1;
    if (this.preserveLastUserMessage) {
      for (let i = this.buffer.length - 1; i >= 0; i--) {
        if (this.buffer[i].role === 'user') {
          lastUserIdx = i;
          break;
        }
      }
    }

    while (this.currentTokenCount > available && this.buffer.length > 0) {
      // Se só resta a última mensagem do usuário, para (evita janela vazia)
      if (this.preserveLastUserMessage && this.buffer.length === 1 && lastUserIdx === 0) {
        break;
      }

      // Evita evictar a última mensagem do usuário enquanto houver outras
      if (this.preserveLastUserMessage && lastUserIdx === 0 && this.buffer.length > 1) {
        // Remove a segunda mais antiga (índice 1)
        const removed = this.buffer.splice(1, 1)[0];
        this.currentTokenCount -= removed.tokenEstimate;
        this._stats.messagesEvicted += 1;
        this._stats.lastEvictionAt = Date.now();
        lastUserIdx = 0; // continua protegida
        continue;
      }

      const removed = this.buffer.shift();
      this.currentTokenCount -= removed.tokenEstimate;
      this._stats.messagesEvicted += 1;
      this._stats.lastEvictionAt = Date.now();

      if (lastUserIdx >= 0) lastUserIdx -= 1;
    }

    if (this.currentTokenCount < 0) this.currentTokenCount = 0;
  }

  /**
   * Retorna o buffer atualizado (system + mensagens vivas).
   * @returns {Array<ContextMessage>}
   */
  getLiveContext() {
    const context = [];
    if (this.systemPrompt) {
      context.push({ ...this.systemPrompt, metadata: { ...this.systemPrompt.metadata } });
    }
    return context.concat(
      this.buffer.map(m => ({
        ...m,
        metadata: { ...m.metadata }
      }))
    );
  }

  /**
   * Formato compatível com APIs de chat (OpenAI / Anthropic style).
   * @returns {Array<{role: string, content: string}>}
   */
  getMessagesForLLM() {
    return this.getLiveContext().map(({ role, content }) => ({ role, content }));
  }

  /**
   * Snapshot de uso de tokens e pressão de capacidade.
   * @returns {TokenUsageSnapshot}
   */
  getTokenUsage() {
    const systemTokens = this.systemPrompt ? this.systemPrompt.tokenEstimate : 0;
    const total = systemTokens + this.currentTokenCount;
    return {
      systemTokens,
      bufferTokens: this.currentTokenCount,
      totalTokens: total,
      maxCapacity: this.maxTokenCapacity,
      utilizationRatio: this.maxTokenCapacity > 0 ? total / this.maxTokenCapacity : 0,
      messageCount: this.buffer.length + (this.systemPrompt ? 1 : 0),
      isNearCapacity: total / this.maxTokenCapacity >= 0.85
    };
  }

  /**
   * Estatísticas operacionais do buffer.
   * @returns {object}
   */
  getStats() {
    return {
      ...this._stats,
      currentBufferSize: this.buffer.length,
      hasSystemPrompt: !!this.systemPrompt
    };
  }

  /**
   * Limpa o buffer de mensagens (mantém system prompt).
   */
  clear() {
    this.buffer = [];
    this.currentTokenCount = 0;
  }

  /**
   * Substitui o buffer inteiro (útil para hidratação de sessão).
   * @param {Array<{role: string, content: string, tokenEstimate?: number, metadata?: object}>} messages
   */
  hydrate(messages = []) {
    this.buffer = [];
    this.currentTokenCount = 0;
    for (const msg of messages) {
      if (msg.role === 'system') {
        this.setSystemPrompt(msg.content, msg.tokenEstimate);
      } else {
        this.pushMessage(msg.role, msg.content, msg.tokenEstimate || 0, msg.metadata || {});
      }
    }
  }

  /**
   * Sanitiza conteúdo (null-safe, string coercion, trim control chars).
   * @private
   */
  _sanitizeContent(content) {
    if (content == null) return '';
    let str = typeof content === 'string' ? content : String(content);
    // Remove null bytes e normaliza quebras de linha
    str = str.replace(/\0/g, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return str;
  }

  /**
   * Estimativa refinada de tokens.
   * - CJK (~1.5 chars/token)
   * - Demais (~4 chars/token)
   * - Penalidade leve por whitespace excessivo
   * @private
   */
  _estimateTokens(text) {
    if (!text) return 0;
    const s = String(text);
    // Contagem aproximada de caracteres CJK (CJK Unified + Hiragana/Katakana + Hangul)
    const cjkMatches = s.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g);
    const cjkChars = cjkMatches ? cjkMatches.join('').length : 0;
    const otherChars = s.length - cjkChars;
    const estimate = Math.ceil(cjkChars / 1.5 + otherChars / 4);
    return Math.max(1, estimate);
  }

  /**
   * @private
   */
  _recalculateTokens() {
    this.currentTokenCount = this.buffer.reduce((sum, m) => sum + m.tokenEstimate, 0);
  }
}

/**
 * @typedef {Object} ContextMessage
 * @property {string} role
 * @property {string} content
 * @property {number} tokenEstimate
 * @property {number} timestamp
 * @property {object} [metadata]
 */

/**
 * @typedef {Object} TokenUsageSnapshot
 * @property {number} systemTokens
 * @property {number} bufferTokens
 * @property {number} totalTokens
 * @property {number} maxCapacity
 * @property {number} utilizationRatio
 * @property {number} messageCount
 * @property {boolean} isNearCapacity
 */

module.exports = { MaxContextWindow };
