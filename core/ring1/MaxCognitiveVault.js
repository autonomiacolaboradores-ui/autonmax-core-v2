/**
 * MAX.Cognitive Vault (MaxCognitiveVault.js)
 * Cofre Histórico Inter-Sessões (Fatos e Preferências)
 * RFC-C108 / Ring 1 Cognitive Layer
 *
 * Melhorias v2:
 * - Deduplicação por (category + factValue normalizado)
 * - Soft-decay de confiança por idade
 * - Upsert semântico (atualiza confiança se fato já existe)
 * - Indexação por categoria
 * - Limite de fatos por usuário (LRU-like eviction dos menos confiáveis)
 * - Busca por texto parcial (contains)
 * - Métricas e diagnosticos
 */

class MaxCognitiveVault {
  /**
   * @param {number} minConfidence - Limiar mínimo de confiança para recuperação (default: 0.70)
   * @param {object} [options]
   * @param {number} [options.maxFactsPerUser=100] - Capacidade máxima de fatos por usuário
   * @param {boolean} [options.enableSoftDecay=false] - Aplica decay temporal na recuperação
   * @param {number} [options.decayHalfLifeDays=90] - Meia-vida do decay em dias
   * @param {boolean} [options.upsertOnDuplicate=true] - Atualiza fato existente em vez de duplicar
   */
  constructor(minConfidence = 0.70, options = {}) {
    if (typeof minConfidence !== 'number' || minConfidence < 0 || minConfidence > 1) {
      throw new Error('MaxCognitiveVault: minConfidence must be in [0, 1]');
    }

    this.minConfidence = minConfidence;
    this.maxFactsPerUser = options.maxFactsPerUser || 100;
    this.enableSoftDecay = options.enableSoftDecay === true;
    this.decayHalfLifeDays = options.decayHalfLifeDays || 90;
    this.upsertOnDuplicate = options.upsertOnDuplicate !== false;

    /**
     * Estrutura: Map<userId, Array<FactRecord>>
     * @type {Map<string, Array<FactRecord>>}
     */
    this.store = new Map();

    this._stats = {
      factsPersisted: 0,
      factsUpserted: 0,
      factsEvicted: 0,
      retrievals: 0
    };
  }

  /**
   * Grava uma preferência / fato histórico.
   * Com upsertOnDuplicate=true, atualiza confiança (max) se o fato já existir.
   * @param {string} userId
   * @param {string} category - Ex: "preference", "behavior", "fact"
   * @param {string|object} factValue - Valor do fato (ex: "Prefere entrega rápida")
   * @param {number} confidence - Score de confiança [0..1]
   * @returns {FactRecord}
   */
  persistFact(userId, category, factValue, confidence = 0.8) {
    if (!userId || typeof userId !== 'string') {
      throw new Error('MaxCognitiveVault: userId is required and must be a string');
    }

    const clampedConfidence = this._clampConfidence(confidence);
    const normalizedCategory = (category || 'general').toLowerCase().trim();
    const normalizedValue = this._normalizeValue(factValue);

    if (!this.store.has(userId)) {
      this.store.set(userId, []);
    }

    const facts = this.store.get(userId);

    // Upsert por (category + valor normalizado)
    if (this.upsertOnDuplicate) {
      const existing = facts.find(
        f =>
          f.category === normalizedCategory &&
          this._normalizeValue(f.factValue) === normalizedValue
      );

      if (existing) {
        // Mantém o maior score de confiança e atualiza timestamp
        existing.confidenceScore = Math.max(existing.confidenceScore, clampedConfidence);
        existing.updatedAt = Date.now();
        existing.accessCount = (existing.accessCount || 0) + 1;
        this._stats.factsUpserted += 1;
        return { ...existing };
      }
    }

    const record = {
      id: this._generateId(),
      userId,
      category: normalizedCategory,
      factValue,
      confidenceScore: clampedConfidence,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      accessCount: 0
    };

    facts.push(record);
    this._stats.factsPersisted += 1;

    // Eviction se ultrapassar capacidade
    this._enforceCapacity(userId);

    return { ...record };
  }

  /**
   * Recupera e filtra fatos com confidenceScore >= minConfidence, ordenando pelos mais recentes.
   * Aplica soft-decay opcional.
   * @param {string} userId
   * @param {object} [options]
   * @param {number} [options.minConfidence] - Override do limiar
   * @param {string} [options.category] - Filtrar por categoria
   * @param {number} [options.limit] - Limite de resultados
   * @param {string} [options.contains] - Busca textual parcial no factValue
   * @returns {Array<FactRecord>}
   */
  retrieveRelevantMemories(userId, options = {}) {
    this._stats.retrievals += 1;

    const minConf = options.minConfidence !== undefined ? options.minConfidence : this.minConfidence;
    const category = options.category ? options.category.toLowerCase().trim() : null;
    const limit = options.limit || 20;
    const contains = options.contains ? String(options.contains).toLowerCase() : null;

    const facts = this.store.get(userId) || [];
    const now = Date.now();

    let filtered = facts
      .map(f => {
        const effectiveConfidence = this.enableSoftDecay
          ? this._applyDecay(f.confidenceScore, f.updatedAt, now)
          : f.confidenceScore;
        return { fact: f, effectiveConfidence };
      })
      .filter(({ effectiveConfidence }) => effectiveConfidence >= minConf);

    if (category) {
      filtered = filtered.filter(({ fact }) => fact.category === category);
    }

    if (contains) {
      filtered = filtered.filter(({ fact }) => {
        const val = typeof fact.factValue === 'string'
          ? fact.factValue
          : JSON.stringify(fact.factValue);
        return val.toLowerCase().includes(contains);
      });
    }

    // Ordenar: confiança efetiva desc, depois recência
    filtered.sort((a, b) => {
      if (b.effectiveConfidence !== a.effectiveConfidence) {
        return b.effectiveConfidence - a.effectiveConfidence;
      }
      return b.fact.updatedAt - a.fact.updatedAt;
    });

    // Incrementa accessCount dos retornados
    const result = filtered.slice(0, limit).map(({ fact, effectiveConfidence }) => {
      fact.accessCount = (fact.accessCount || 0) + 1;
      return {
        ...fact,
        effectiveConfidence // expõe o score após decay (se ativo)
      };
    });

    return result;
  }

  /**
   * Atualiza o score de confiança de um fato existente.
   * @param {string} userId
   * @param {string} factId
   * @param {number} newConfidence
   * @returns {FactRecord|null}
   */
  updateConfidence(userId, factId, newConfidence) {
    const facts = this.store.get(userId);
    if (!facts) return null;

    const fact = facts.find(f => f.id === factId);
    if (!fact) return null;

    fact.confidenceScore = this._clampConfidence(newConfidence);
    fact.updatedAt = Date.now();
    return { ...fact };
  }

  /**
   * Remove um fato específico.
   * @param {string} userId
   * @param {string} factId
   * @returns {boolean}
   */
  removeFact(userId, factId) {
    const facts = this.store.get(userId);
    if (!facts) return false;
    const idx = facts.findIndex(f => f.id === factId);
    if (idx === -1) return false;
    facts.splice(idx, 1);
    return true;
  }

  /**
   * Remove fatos de um usuário (útil para GDPR / limpeza).
   * @param {string} userId
   */
  purgeUser(userId) {
    this.store.delete(userId);
  }

  /**
   * Contagem total de fatos armazenados para um usuário.
   * @param {string} userId
   * @returns {number}
   */
  countFacts(userId) {
    return (this.store.get(userId) || []).length;
  }

  /**
   * Lista categorias distintas de um usuário.
   * @param {string} userId
   * @returns {string[]}
   */
  listCategories(userId) {
    const facts = this.store.get(userId) || [];
    return [...new Set(facts.map(f => f.category))];
  }

  /**
   * Diagnósticos agregados.
   * @returns {object}
   */
  getStats() {
    let totalFacts = 0;
    for (const facts of this.store.values()) {
      totalFacts += facts.length;
    }
    return {
      ...this._stats,
      usersWithMemories: this.store.size,
      totalFacts,
      minConfidence: this.minConfidence,
      maxFactsPerUser: this.maxFactsPerUser,
      softDecayEnabled: this.enableSoftDecay
    };
  }

  /**
   * Eviction: remove os fatos de menor confiança (e mais antigos) quando excede capacidade.
   * @private
   */
  _enforceCapacity(userId) {
    const facts = this.store.get(userId);
    if (!facts || facts.length <= this.maxFactsPerUser) return;

    // Ordena: menor confiança primeiro, depois mais antigo
    facts.sort((a, b) => {
      if (a.confidenceScore !== b.confidenceScore) {
        return a.confidenceScore - b.confidenceScore;
      }
      return a.updatedAt - b.updatedAt;
    });

    const toRemove = facts.length - this.maxFactsPerUser;
    facts.splice(0, toRemove);
    this._stats.factsEvicted += toRemove;
  }

  /**
   * Soft-decay exponencial baseado em meia-vida.
   * @private
   */
  _applyDecay(confidence, updatedAt, now) {
    const ageDays = (now - updatedAt) / (1000 * 60 * 60 * 24);
    if (ageDays <= 0) return confidence;
    const halfLife = this.decayHalfLifeDays;
    const decayFactor = Math.pow(0.5, ageDays / halfLife);
    return confidence * decayFactor;
  }

  /**
   * @private
   */
  _clampConfidence(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }

  /**
   * Normaliza valor para comparação de deduplicação.
   * @private
   */
  _normalizeValue(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value.toLowerCase().trim();
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  /**
   * @private
   */
  _generateId() {
    return `fact_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

/**
 * @typedef {Object} FactRecord
 * @property {string} id
 * @property {string} userId
 * @property {string} category
 * @property {string|object} factValue
 * @property {number} confidenceScore
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {number} [accessCount]
 * @property {number} [effectiveConfidence]
 */

module.exports = { MaxCognitiveVault };
