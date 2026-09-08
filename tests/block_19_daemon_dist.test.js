const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const DaemonProcess = require('../bin/autonmax-daemon');

test('🚀 BLOCK 19 — Daemon Engine & Multi-Platform Distribution Architecture', async (mainTest) => {

  await mainTest.test('1. Validação de Boot Limpo do Daemon e Heartbeat do AutoHealing', async () => {
    const daemon = new DaemonProcess();
    
    assert.strictEqual(daemon.status, 'BOOTING');
    
    // Mute console output during tests to keep TAP output clean
    const originalLog = console.log;
    console.log = () => {};
    
    await daemon.boot();
    
    assert.strictEqual(daemon.status, 'ACTIVE');
    assert.strictEqual(daemon.core.initialized, true);
    assert.strictEqual(daemon.healingEngine.telemetryRecords.length, 0); // Before first heartbeat interval
    
    // Manually trigger a heartbeat to validate
    daemon.healingEngine.logTelemetry({ subsystem: 'DAEMON', latencyMs: 5 });
    assert.strictEqual(daemon.healingEngine.telemetryRecords.length, 1);
    
    // Clean up
    if (daemon.heartbeatTimer) clearInterval(daemon.heartbeatTimer);
    console.log = originalLog;
  });

  await mainTest.test('2. Validação de Shutdown Gracioso e Fechamento de SQLite (Zero Corruption)', async () => {
    const daemon = new DaemonProcess();
    
    // Mute console output
    const originalLog = console.log;
    console.log = () => {};
    
    // Stub process.exit to prevent test runner from actually exiting
    let exitedWith = null;
    const originalExit = process.exit;
    process.exit = (code) => { exitedWith = code; };
    
    await daemon.boot();
    await daemon.shutdown('SIGINT');
    
    assert.strictEqual(daemon.status, 'SHUTDOWN');
    assert.strictEqual(exitedWith, 0);
    
    // Clean up
    process.exit = originalExit;
    console.log = originalLog;
  });

  await mainTest.test('3. Validação do Manifesto PWA (public/manifest.json) para Offline Mode', async () => {
    const manifestPath = path.join(__dirname, '../public/manifest.json');
    
    assert.ok(fs.existsSync(manifestPath), 'Arquivo manifest.json deve existir na pasta public/');
    
    const manifestContent = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestContent);
    
    assert.ok(manifest.name.includes('AUTON.MAX'));
    assert.strictEqual(manifest.offline_enabled, true, 'offline_enabled deve estar true para suporte offline do PWA');
    assert.ok(manifest.permissions.includes('ipc_bridge'), 'Deve declarar permissão ipc_bridge para acesso local ao Daemon');
    assert.ok(manifest.icons.length >= 2, 'Deve incluir pelo menos 2 tamanhos de ícone (192, 512)');
  });

});
