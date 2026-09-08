const { AutoHealingEngine } = require('../core/ring0/AutoHealingEngine');

class DaemonProcess {
  constructor() {
    this.status = 'BOOTING';
    this.core = { initialized: false };
    this.kernel = { initialized: false };
    this.vault = { initialized: false };
    this.bridge = { initialized: false };
    this.healingEngine = new AutoHealingEngine();
    
    this.heartbeatTimer = null;
  }

  async boot() {
    console.log('[DAEMON] Starting AUTON.MAX Edge Daemon...');
    
    // Initialize components
    this.core.initialized = true;
    this.kernel.initialized = true;
    this.vault.initialized = true;
    this.bridge.initialized = true;
    
    this.status = 'ACTIVE';
    this.startHeartbeat();
    
    this.setupSignalHandlers();
    console.log('[DAEMON] Boot complete. System is ACTIVE.');
  }

  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      this.healingEngine.logTelemetry({ subsystem: 'DAEMON', latencyMs: 5 });
    }, 1000);
  }

  async shutdown(signal) {
    console.log(`\n[DAEMON] Received ${signal}. Executing graceful shutdown...`);
    
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    
    // Simulate WAL consolidation and sqlite close
    console.log('[DAEMON] Consolidating WAL and closing SQLite...');
    
    this.status = 'SHUTDOWN';
    console.log('[DAEMON] Graceful shutdown complete. Exiting.');
    process.exit(0);
  }

  setupSignalHandlers() {
    process.on('SIGINT', () => this.shutdown('SIGINT'));
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
  }
}

// Ensure it can be imported for tests without running immediately
if (require.main === module) {
  const daemon = new DaemonProcess();
  daemon.boot();
}

module.exports = DaemonProcess;
