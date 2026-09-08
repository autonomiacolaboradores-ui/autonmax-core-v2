/**
 * MAX.Session State (MaxSessionState.js)
 * FSM de Estado Persistente (TTL-Backed + Trava Antiloop)
 * RFC-C108 / Ring 1 Cognitive Layer
 *
 * Melhorias v2:
 * - Histórico de transições (audit trail em memória)
 * - Validação opcional de grafo de estados permitidos
 * - Refresh explícito de TTL
 * - Diagnósticos e métricas de sessão
 * - Soft-delete / destroy de sessão
 * - Proteção contra payload mutável externo (deep clone shallow-safe)
 * - Callbacks de transição (hooks leves)
 */

class MaxSessionState {
  /**
   * @param {number} ttlMs - Time-To-Live em milissegundos (default: 30 min)
   * @param {number} maxStepAttempts - Limite estrito de tentativas por etapa (default: 5)
   * @param {object} [options]
   * @param {Record<string, string[]>} [options.allowedTransitions] - Grafo opcional de transições
   * @param {function} [options.onTransition] - Hook chamado após transição bem-sucedida
   * @param {function} [options.onAntiLoopLock] - Hook chamado quando trava antiloop aciona
   * @param {number} [options.maxTransitionHistory=20] - Tamanho do audit trail por sessão
   */
  constructor(ttlMs = 30 * 60 * 1000, maxStepAttempts = 5, options = {}) {
    if (typeof ttlMs !== 'number' || ttlMs < 1000) {
      throw new Error('MaxSessionState: ttlMs must be >= 1000');
    }
    if (typeof maxStepAttempts !== 'number' || maxStepAttempts < 1) {
      throw new Error('MaxSessionState: maxStepAttempts must be >= 1');
    }

    this.ttlMs = ttlMs;
    this.maxStepAttempts = maxStepAttempts;
    this.allowedTransitions = options.allowedTransitions || null;
    this.onTransition = typeof options.onTransition === 'function' ? options.onTransition : null;
    this.onAntiLoopLock = typeof options.onAntiLoopLock === 'function' ? options.onAntiLoopLock : null;
    this.maxTransitionHistory = options.maxTransitionHistory || 20;

    /** @type {Map<string, SessionRecord>} */
    this.sessions = new Map();

    this._stats = {
      sessionsCreated: 0,
      sessionsExpired: 0,
      transitions: 0,
      antiLoopLocks: 0,
      attemptsTotal: 0
    };
  }

  /**
   * Retorna o estado atual ou cria um estado inicial (INITIAL com stepAttempts = 0).
   * @param {string} sessionId
   * @param {string} userId
   * @param {string} domain
   * @returns {SessionRecord}
   */
  getOrCreateSession(sessionId, userId, domain = 'default') {
    this._assertId(sessionId, 'sessionId');
    this._assertId(userId, 'userId');
    this._purgeExpired();

    if (this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId);
      // Segurança: userId da sessão existente não pode ser trocado silenciosamente
      if (session.userId !== userId) {
        throw new Error(
          `MaxSessionState: sessionId "${sessionId}" already bound to a different userId`
        );
      }
      session.lastInteractionAt = Date.now();
      session.expiresAt = Date.now() + this.ttlMs;
      return this._clone(session);
    }

    const now = Date.now();
    const newSession = {
      sessionId,
      userId,
      domain: domain || 'default',
      currentStep: 'INITIAL',
      stepAttempts: 0,
      isAntiLoopLocked: false,
      payload: {},
      transitionHistory: [],
      createdAt: now,
      lastInteractionAt: now,
      expiresAt: now + this.ttlMs
    };

    this.sessions.set(sessionId, newSession);
    this._stats.sessionsCreated += 1;
    return this._clone(newSession);
  }

  /**
   * Incrementa stepAttempts. Se stepAttempts >= maxStepAttempts, marca isAntiLoopLocked = true.
   * @param {string} sessionId
   * @returns {SessionRecord|null}
   */
  incrementAttempt(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    if (session.isAntiLoopLocked) {
      return this._clone(session);
    }

    session.stepAttempts += 1;
    session.lastInteractionAt = Date.now();
    session.expiresAt = Date.now() + this.ttlMs;
    this._stats.attemptsTotal += 1;

    if (session.stepAttempts >= this.maxStepAttempts) {
      session.isAntiLoopLocked = true;
      this._stats.antiLoopLocks += 1;
      if (this.onAntiLoopLock) {
        try {
          this.onAntiLoopLock(this._clone(session));
        } catch (_) {
          /* hooks não devem quebrar o fluxo */
        }
      }
    }

    return this._clone(session);
  }

  /**
   * Aplica transição de estado na jornada, reseta stepAttempts = 0 e atualiza timestamp.
   * Valida grafo de transições se configurado.
   * @param {string} sessionId
   * @param {string} step - Novo passo (ex: AWAITING_PAYMENT)
   * @param {object} payloadPatch - Patch opcional de dados
   * @returns {SessionRecord|null}
   */
  updateState(sessionId, step, payloadPatch = {}) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    if (typeof step !== 'string' || !step.trim()) {
      throw new Error('MaxSessionState.updateState: step must be a non-empty string');
    }

    const fromStep = session.currentStep;
    const toStep = step.trim();

    // Validação opcional de grafo de transições
    if (this.allowedTransitions && fromStep !== toStep) {
      const allowed = this.allowedTransitions[fromStep];
      if (Array.isArray(allowed) && !allowed.includes(toStep)) {
        throw new Error(
          `MaxSessionState: transition ${fromStep} → ${toStep} not allowed. Allowed: [${allowed.join(', ')}]`
        );
      }
    }

    session.currentStep = toStep;
    session.stepAttempts = 0;
    session.isAntiLoopLocked = false;
    session.payload = { ...session.payload, ...(payloadPatch || {}) };
    session.lastInteractionAt = Date.now();
    session.expiresAt = Date.now() + this.ttlMs;

    // Audit trail
    session.transitionHistory.push({
      from: fromStep,
      to: toStep,
      at: Date.now(),
      payloadKeys: Object.keys(payloadPatch || {})
    });
    if (session.transitionHistory.length > this.maxTransitionHistory) {
      session.transitionHistory.shift();
    }

    this._stats.transitions += 1;

    const cloned = this._clone(session);

    if (this.onTransition) {
      try {
        this.onTransition(cloned, fromStep, toStep);
      } catch (_) {
        /* hooks não devem quebrar o fluxo */
      }
    }

    return cloned;
  }

  /**
   * Obtém o estado atual sem criar.
   * @param {string} sessionId
   * @returns {SessionRecord|null}
   */
  getSession(sessionId) {
    this._purgeExpired();
    const session = this.sessions.get(sessionId);
    return session ? this._clone(session) : null;
  }

  /**
   * Força o bloqueio antiloop (uso administrativo / teste).
   * @param {string} sessionId
   * @returns {SessionRecord|null}
   */
  forceAntiLoopLock(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const wasLocked = session.isAntiLoopLocked;
    session.isAntiLoopLocked = true;
    session.lastInteractionAt = Date.now();

    if (!wasLocked) {
      this._stats.antiLoopLocks += 1;
      if (this.onAntiLoopLock) {
        try {
          this.onAntiLoopLock(this._clone(session));
        } catch (_) {}
      }
    }

    return this._clone(session);
  }

  /**
   * Renova TTL sem alterar estado.
   * @param {string} sessionId
   * @returns {boolean}
   */
  touch(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.lastInteractionAt = Date.now();
    session.expiresAt = Date.now() + this.ttlMs;
    return true;
  }

  /**
   * Destrói uma sessão explicitamente.
   * @param {string} sessionId
   * @returns {boolean}
   */
  destroySession(sessionId) {
    return this.sessions.delete(sessionId);
  }

  /**
   * Lista sessionIds ativos (após purge).
   * @returns {string[]}
   */
  listActiveSessionIds() {
    this._purgeExpired();
    return Array.from(this.sessions.keys());
  }

  /**
   * Diagnósticos agregados.
   * @returns {object}
   */
  getStats() {
    this._purgeExpired();
    return {
      ...this._stats,
      activeSessions: this.sessions.size,
      ttlMs: this.ttlMs,
      maxStepAttempts: this.maxStepAttempts
    };
  }

  /**
   * Remove sessões expiradas.
   * @private
   */
  _purgeExpired() {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (session.expiresAt < now) {
        this.sessions.delete(id);
        this._stats.sessionsExpired += 1;
      }
    }
  }

  /**
   * Clona o registro para evitar mutação externa.
   * @private
   */
  _clone(session) {
    return {
      sessionId: session.sessionId,
      userId: session.userId,
      domain: session.domain,
      currentStep: session.currentStep,
      stepAttempts: session.stepAttempts,
      isAntiLoopLocked: session.isAntiLoopLocked,
      payload: { ...session.payload },
      transitionHistory: session.transitionHistory.map(t => ({ ...t, payloadKeys: [...t.payloadKeys] })),
      createdAt: session.createdAt,
      lastInteractionAt: session.lastInteractionAt,
      expiresAt: session.expiresAt
    };
  }

  /**
   * @private
   */
  _assertId(value, name) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`MaxSessionState: ${name} must be a non-empty string`);
    }
  }
}

/**
 * @typedef {Object} SessionRecord
 * @property {string} sessionId
 * @property {string} userId
 * @property {string} domain
 * @property {string} currentStep
 * @property {number} stepAttempts
 * @property {boolean} isAntiLoopLocked
 * @property {object} payload
 * @property {Array<{from: string, to: string, at: number, payloadKeys: string[]}>} transitionHistory
 * @property {number} createdAt
 * @property {number} lastInteractionAt
 * @property {number} expiresAt
 */

module.exports = { MaxSessionState };
