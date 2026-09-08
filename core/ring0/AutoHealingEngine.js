const crypto = require('node:crypto');
const assert = require('node:assert/strict');

// Calibrado empiricamente a partir do telemetry_audit.log
// Operações críticas de borda rodam a ~5-20ms, com picos de ~200-250ms no PubSub
const SLA_MAX_LATENCY_MS = 250; 
const SLA_BURST_THRESHOLD = 3;

const STATUS = {
  HEALTHY: 'HEALTHY',
  QUARANTINED: 'QUARANTINED',
  ISOLATED: 'ISOLATED'
};

class AutoHealingEngine {
  constructor() {
    this.telemetryRecords = [];
    this.subsystemStatus = new Map();
    this.violationCounts = new Map();
  }

  logTelemetry(event) {
    assert.ok(event.subsystem, 'Subsystem ID is required');
    
    const enrichedEvent = {
      ...event,
      timestamp: Date.now(),
      eventId: crypto.randomBytes(16).toString('hex')
    };

    this.telemetryRecords.push(enrichedEvent);
    this.evaluateTelemetry(enrichedEvent);
  }

  evaluateTelemetry(event) {
    // 1. Falha Física de HW / DB WAL
    if (event.error && (event.error.includes('DATABASE_LOCKED') || event.error.includes('CRITICAL_HARDWARE_FAULT'))) {
      this.executeStateRollback(event);
      return;
    }

    // 2. Corrupção de Segurança / Sandbox / Prototype Pollution
    if (event.error && (event.error.includes('SECURITY_ALERT') || event.error.includes('PROTOTYPE_POLLUTION')) || event.type === 'SECURITY_VIOLATION') {
      this.quarantineModule(event.subsystem, 'SECURITY_BREACH_DETECTED');
      return;
    }

    // 3. SLA Violation (Latência)
    if (event.latencyMs && event.latencyMs > SLA_MAX_LATENCY_MS) {
      const violations = (this.violationCounts.get(event.subsystem) || 0) + 1;
      this.violationCounts.set(event.subsystem, violations);

      if (violations >= SLA_BURST_THRESHOLD) {
        this.triggerCircuitBreaker(event.subsystem, 'SLA_VIOLATION_THRESHOLD_EXCEEDED');
      }
    } else if (event.latencyMs && event.latencyMs <= SLA_MAX_LATENCY_MS) {
      // Reset violations on healthy ping
      this.violationCounts.set(event.subsystem, 0);
    }
  }

  triggerCircuitBreaker(subsystem, reason) {
    this.subsystemStatus.set(subsystem, STATUS.ISOLATED);
    this.attemptSoftFix(subsystem);
  }

  quarantineModule(subsystem, reason) {
    this.subsystemStatus.set(subsystem, STATUS.QUARANTINED);
    // Simula a purga de memória (SandboxVM purge)
  }

  attemptSoftFix(subsystem) {
    // Simula reset gracioso da Máquina de Estados Finita (FSM)
    if (this.subsystemStatus.get(subsystem) === STATUS.ISOLATED) {
      this.subsystemStatus.set(subsystem, STATUS.HEALTHY);
      this.violationCounts.set(subsystem, 0); // Reset violações após soft-fix
    }
  }

  executeStateRollback(event) {
    // Simulação do hard rollback via WAL Snapshot
    this.subsystemStatus.set(event.subsystem, STATUS.HEALTHY);
  }

  getStatus(subsystem) {
    return this.subsystemStatus.get(subsystem) || STATUS.HEALTHY;
  }
}

module.exports = { AutoHealingEngine, STATUS, SLA_MAX_LATENCY_MS, SLA_BURST_THRESHOLD };
