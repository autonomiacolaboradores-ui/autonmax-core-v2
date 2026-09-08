'use strict';

const { performance } = require('perf_hooks');
const { globalEventBus } = require('../ring1/EventBus'); // EventBus da Sprint 3

/**
 * AutoHealingSupervisor - SPRINT 7
 * Motor de monitoramento contínuo (Auto-Healing Engine)
 */
class AutoHealingSupervisor {
    constructor() {
        this.rings = {
            ring0: null, // Persistence (SQLite via RuntimeCore)
            ring1: null, // MultiProviderLlmRouter
            ring2: null  // WhatsAppDriver
        };

        this.config = {
            heartbeatIntervalMs: 30000, // 30s — resiliência operacional
            eventLoopThresholdMs: 2000,
            memoryHeapThresholdBytes: 500 * 1024 * 1024 // 500 MB
        };

        this.intervals = {};
        this.bus = globalEventBus;
        this.consecutiveFailuresRing0 = 0;
    }

    registerRing(ringNumber, instance) {
        if (this.rings[`ring${ringNumber}`] !== undefined) {
            this.rings[`ring${ringNumber}`] = instance;
            this.log(`Ring ${ringNumber} registrado com sucesso no Supervisor.`);
        }
    }

    start() {
        this.log('Iniciando Orquestrador de Saúde (Auto-Healing Engine) - Sprint 7...');
        
        // Master Ciclo de Checagem a cada 30 segundos
        this.intervals.masterCycle = setInterval(() => {
            this._checkRing0();
            this._checkRing1();
            this._checkRing2();
            
            // Emite evento de status geral (Telemetria)
            this.bus.emitAsync('health:status_checked', { timestamp: Date.now(), status: 'HEALTHY' });
        }, this.config.heartbeatIntervalMs);

        // Monitoramento de Pressão de Memória
        this.intervals.memory = setInterval(() => {
            const mem = process.memoryUsage();
            if (mem.heapUsed > this.config.memoryHeapThresholdBytes) {
                const cause = `Alto uso de memória: ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`;
                this.triggerHealing('SUPREMO', cause, 'Memory Scrubbing e PRAGMA WAL TRUNCATE', 0);
                
                // Sprint 7: Força um PRAGMA wal_checkpoint(TRUNCATE) seguro
                this._forceWalCheckpoint();

                if (global.gc) {
                    global.gc();
                }
            }
        }, 15000);
    }

    _checkRing0() {
        const runtime = this.rings.ring0;
        if (!runtime || !runtime.isOpen || !runtime.isOpen()) return;

        const db = runtime.getDb();
        if (!db) return;

        try {
            // Sprint 7: Valida se o SQLite responde a uma query simples (SELECT 1)
            const start = performance.now();
            const result = db.prepare('SELECT 1 as alive').get();
            const duration = performance.now() - start;

            if (!result || result.alive !== 1) {
                throw new Error('SQLite falhou no heartbeat');
            }

            if (duration > 500) {
                this.log(`[RING_0] [WARNING] Heartbeat demorou ${duration.toFixed(2)}ms (> 500ms). Ignorando spike isolado.`);
            }

            this.consecutiveFailuresRing0 = 0; // Sucesso, reseta contador
        } catch (err) {
            this.consecutiveFailuresRing0++;
            if (this.consecutiveFailuresRing0 >= 2) {
                this.triggerHealing('RING_0', `Falha no Heartbeat SQLite (2 consecutivas): ${err.message}`, 'Executando PRAGMA wal_checkpoint(TRUNCATE) para aliviar contensão', 0);
                this._forceWalCheckpoint();
                this.consecutiveFailuresRing0 = 0; // Reseta após a cura
            } else {
                this.log(`[RING_0] [WARNING] Falha isolada no Heartbeat SQLite: ${err.message}. Aguardando próxima checagem.`);
            }
        }
    }

    _forceWalCheckpoint() {
        const runtime = this.rings.ring0;
        if (runtime && runtime.isOpen && runtime.isOpen()) {
            const db = runtime.getDb();
            try {
                db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
                this.log('[RING_0][HEAL] Executado wal_checkpoint(TRUNCATE) com sucesso.');
            } catch (walErr) {
                this.log(`[RING_0][ERROR] Falha ao tentar checkpoint: ${walErr.message}`);
            }
        }
    }

    _checkRing1() {
        const router = this.rings.ring1;
        if (!router || !router.circuitBreaker) return;

        let available = 0;
        const providers = Object.keys(router.circuitBreaker);
        
        for (const p of providers) {
            const state = router.circuitBreaker[p];
            // Reseta temporizadores expirados (Sprint 7)
            if (state.status === 'TRIPPED' && Date.now() > state.retryAfter) {
                state.status = 'CLOSED';
                state.failures = 0;
                this.log(`[RING_1][HEAL] Circuit Breaker: Provedor ${p} restaurado por heartbeat.`);
            }
            if (state.status === 'CLOSED') available++;
        }

        if (available === 0 && providers.length > 0) {
            this.triggerHealing('RING_1', 'Todos os provedores LLM indisponíveis', 'Aguardando recuperação ou usando EdgeMax LocalFallback', 0);
        }
    }

    _checkRing2() {
        const ring2 = this.rings.ring2;
        if (!ring2) return;

        // OPS-5: prefer SessionManager / Watchdog health (multi-session)
        if (typeof ring2.health === 'function') {
            Promise.resolve(ring2.health())
              .then((h) => {
                const sessions = (h && h.sessions) || [];
                for (const s of sessions) {
                  if (s.connectionState === 'DISCONNECTED') {
                    this.log(`[RING_2] sessão ${s.sessionKey} DISCONNECTED (watchdog trata reconnect sem wipe)`);
                  }
                }
              })
              .catch((err) => this.log(`[RING_2] health error: ${err.message}`));
            if (typeof ring2.tick === 'function') {
              ring2.tick().catch(() => {});
            }
            return;
        }

        // Legacy single WhatsAppDriver
        const driver = ring2;
        if (driver && driver.sock) {
            const inactiveTime = Date.now() - (driver.lastEventTime || Date.now());
            if (inactiveTime > 45000 && driver.sock.user) {
                this.triggerHealing('RING_2', `Socket Zumbi (Inativa há ${(inactiveTime/1000).toFixed(1)}s)`, 'Chamando whatsappDriver.forceReconnect() silenciosamente', 0);
                if (typeof driver.forceReconnect === 'function') {
                    driver.forceReconnect().catch(err => {
                        this.log(`[RING_2][ERROR] Falha ao forçar reconexão: ${err.message}`);
                    });
                }
            }
        } else if (driver && driver.connectionState === 'DISCONNECTED') {
            if (driver.retryCount < (driver.retryDelays || []).length) {
                this.log(`[RING_2][HEAL] Acelerando retentativa de reconexão do driver...`);
            }
        }
    }

    stop() {
        Object.values(this.intervals).forEach(clearInterval);
        this.log('Supervisor parado.');
    }

    triggerHealing(ring, cause, action, recoveryTimeMs) {
        const logMsg = `[SUPERVISOR][HEAL][${ring}] Diagnóstico: ${cause} -> Ação: ${action}`;
        console.warn(`🛡️ ${logMsg}`);
        
        // Grava apenas anomalias graves no LEDGER_AUDIT.log (Sprint 7)
        if (this.rings.ring0 && typeof this.rings.ring0._writeAuditLog === 'function') {
            this.rings.ring0._writeAuditLog('AUTO_HEALING_TRIGGERED', 'CRITICAL', logMsg);
        }
    }

    log(msg) {
        console.log(`[AUTOHEALING_SUPERVISOR] ${msg}`);
    }
}

module.exports = AutoHealingSupervisor;
