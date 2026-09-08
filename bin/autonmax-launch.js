require('dotenv').config();
const DaemonProcess = require('./autonmax-daemon');
const HttpServer = require('../core/ring2/HttpServer');
const { RuntimeCore } = require('../core/ring0/RuntimeCore');
const { PartnerAuthManager } = require('../core/ring1/PartnerAuthManager');
const PromptPin = require('../core/ring0/PromptPin');
const { ToolsRegistry } = require('../core/ring2/ToolsRegistry');
const path = require('node:path');

console.log('==================================================');
console.log('🚀 AUTON.MAX — PME (OPS-3…7 runtime)');
console.log('==================================================\n');

console.log('[LAUNCHER] Step 0: PromptPin (OPS-3)...');
const pinResult = PromptPin.verifyAtBoot({
  workspaceRoot: path.join(__dirname, '../workspace'),
  strict: true,
  exitOnCritical: false
});
if (pinResult.critical) {
  console.error('[LAUNCHER] PROMPT_PIN CRITICAL — arranque em modo degradado (não usar promessa antiga em produção)');
}

console.log('[LAUNCHER] Step 0b: ToolsRegistry self-test (OPS-6)...');
const toolsRegistry = new ToolsRegistry();
toolsRegistry.selfTest({ live: false }).then((report) => {
  console.log(`[LAUNCHER] Tools readiness ok=${report.ok} failed=${report.failed}/${report.total}`);
}).catch((e) => console.warn('[LAUNCHER] tools selfTest', e.message));

console.log('[LAUNCHER] Step 0c: Runtime Hardening (OPS-R)...');
try { require('../core/ring0/RuntimeHardening').bootReport(); } catch (e) { console.warn('[LAUNCHER] Falha no hardening:', e.message); }

console.log('[LAUNCHER] Step 0d: Product Readiness...');
try {
  const { runProductReadiness } = require('../core/ring0/ProductReadiness');
  const pr = runProductReadiness();
  console.log(`[LAUNCHER] Product readiness score=${pr.score}% ok=${pr.ok} critical=${(pr.criticalFail || []).join(',') || 'none'}`);
  if (pr.warnings && pr.warnings.length) {
    console.warn(`[LAUNCHER] Warnings: ${pr.warnings.join(', ')}`);
  }
} catch (e) {
  console.warn('[LAUNCHER] Product readiness:', e.message);
}

console.log('[LAUNCHER] Step 1: Inicializando Daemon Engine de Borda (Ring 0)...');
const daemon = new DaemonProcess();

daemon.boot().then(async () => {
    console.log('[LAUNCHER] Step 2: Subindo Servidor HTTP (Ring 2)...');
    
    const runtime = new RuntimeCore();
    runtime.boot();
    const authManager = new PartnerAuthManager(runtime);

    const httpServer = new HttpServer({
      port: process.env.PORT || 3000,
      host: '0.0.0.0',
      runtime,
      authManager
    });

    // PME personality: prefer pinned base; partner configurator still wins when set
    const defaultPartnerId = 'usr_google_demo_100';
    const defaultAttendantConfig = httpServer.pmeConfigurator.getAttendantConfig(defaultPartnerId);
    if (!defaultAttendantConfig.personalityPrompt || !defaultAttendantConfig.personalityPrompt.includes('Max')) {
      const { MAX_SOVEREIGN_SYSTEM_PROMPT } = require('../core/config/AttendantDefaults');
      httpServer.pmeConfigurator.updateAttendantConfig(defaultPartnerId, {
        personalityPrompt: MAX_SOVEREIGN_SYSTEM_PROMPT
      });
      console.log('[LAUNCHER] System Prompt PME default injetado (configurator).');
    }

    await httpServer.start();

    console.log(`\n✅ [GO-LIVE] Servidor Autonmax ativo em http://0.0.0.0:${httpServer.port}`);
    console.log(`[GO-LIVE] OPS: prompt-pin · tools-readiness · wa multi-session · watchdog · metrics/daily · multi-line`);
    console.log(`[GO-LIVE] Daemon Ativo. Pressione Ctrl+C para Desligamento Gracioso.`);
});
