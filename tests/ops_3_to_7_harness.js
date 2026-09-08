'use strict';

/**
 * OPS-3 … OPS-7 harness — no Baileys required for core assertions
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const root = path.join(__dirname, '..');
const results = [];
function rec(id, ok, detail) {
  results.push({ id, ok: !!ok, detail: detail || {} });
  const mark = ok ? 'OK' : 'FAIL';
  console.log(`[${mark}] ${id}`, detail && detail.note ? detail.note : '');
}

async function main() {
  // OPS-3 PromptPin
  const PromptPin = require('../core/ring0/PromptPin');
  const pin = PromptPin.verifyAtBoot({
    workspaceRoot: path.join(root, 'workspace'),
    strict: false,
    exitOnCritical: false
  });
  rec('OPS3_PIN_OK', pin.ok === true, { critical: pin.critical });
  rec(
    'OPS3_NO_FORBIDDEN',
    (pin.details && pin.details.forbidden && pin.details.forbidden.length === 0),
    pin.details && pin.details.forbidden
  );
  const forbiddenHit = PromptPin.scanForbidden('Pix Atômico e logística de entregadores', 'test');
  rec('OPS3_GREP_DETECTS_BAD', forbiddenHit.length >= 1, forbiddenHit);

  const sp = require('../core/ring1/SystemPrompt');
  rec(
    'OPS3_SYSTEM_PROMPT_CLEAN',
    !/Pix\s+At/i.test(sp.CONSUMER_UNIVERSAL_ASSISTANT_PROMPT) &&
      !/PENDING_PIX/i.test(sp.PARTNER_UNIVERSAL_EMPLOYEE_PROMPT),
    {}
  );

  // OPS-4 Metrics + Daily report
  const { getMetricsLog } = require('../core/ring1/MetricsEventLog');
  const { DailyReportJob } = require('../core/ring1/DailyReportJob');
  const metrics = getMetricsLog({ rootDir: path.join(root, 'workspace/metrics') });
  metrics.record({ type: 'appointments_created', partnerId: 'harness_pme', meta: { test: true } });
  metrics.record({ type: 'messages_in', partnerId: 'harness_pme' });
  metrics.record({ type: 'conversations_started', partnerId: 'harness_pme' });
  const agg = metrics.aggregate('harness_pme');
  rec('OPS4_METRICS_REAL', agg.counts.appointments_created >= 1 && agg.events >= 3, agg.counts);
  const job = new DailyReportJob({
    metrics,
    reportsRoot: path.join(root, 'workspace/reports/daily')
  });
  const report = job.generate('harness_pme');
  rec(
    'OPS4_DAILY_FILES',
    report.ok && fs.existsSync(report.mdPath) && fs.existsSync(report.pdfPath),
    { md: report.mdPath, pdf: report.pdfPath }
  );

  // OPS-5 Watchdog + SessionManager health
  const WhatsAppSessionManager = require('../core/ring2/WhatsAppSessionManager');
  const WhatsAppWatchdog = require('../core/ring2/WhatsAppWatchdog');
  const sm = new WhatsAppSessionManager({ rootDir: path.join(root, 'workspace/sessions_harness') });
  sm.getOrCreate('pme:default');
  const wd = new WhatsAppWatchdog(sm, { metrics });
  const health = await wd.health();
  rec('OPS5_HEALTH', health.ok === true && health.sessionCount >= 1, health);
  const tick = await wd.tick();
  rec('OPS5_TICK', tick.checked >= 2, tick);

  // OPS-6 ToolsRegistry
  const { ToolsRegistry } = require('../core/ring2/ToolsRegistry');
  const reg = new ToolsRegistry({
    readinessPath: path.join(root, 'workspace/tools_readiness.json')
  });
  const readiness = await reg.selfTest({ live: false });
  rec('OPS6_REQUIRE_GRAPH', readiness.results.some((r) => r.check.startsWith('require:') && r.ok), {
    failed: readiness.failed
  });
  rec('OPS6_READINESS_FILE', fs.existsSync(path.join(root, 'workspace/tools_readiness.json')), {});

  // OPS-7 multi-line
  const sm2 = new WhatsAppSessionManager({ rootDir: path.join(root, 'workspace/sessions_lines') });
  sm2.getOrCreateLine('cafe', 'recepcao');
  sm2.getOrCreateLine('cafe', 'comercial');
  let maxHit = false;
  try {
    sm2.getOrCreateLine('cafe', 'extra');
  } catch (e) {
    maxHit = e.code === 'MAX_LINES_EXCEEDED';
  }
  rec('OPS7_MAX_2_LINES', maxHit && sm2.listLines('cafe').length === 2, sm2.listLines('cafe'));
  rec(
    'OPS7_AUTH_ISOLATED',
    sm2.listLines('cafe')[0].authDirectory !== sm2.listLines('cafe')[1].authDirectory,
    {}
  );

  // HttpServer modules load
  try {
    require('../core/ring2/HttpServer');
    rec('HTTP_SERVER_LOAD', true, {});
  } catch (e) {
    rec('HTTP_SERVER_LOAD', false, { error: e.message });
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  const out = {
    round: 'OPS-3..7',
    total: results.length,
    passed,
    failed,
    results
  };
  console.log(JSON.stringify({ passed, total: results.length, failed }, null, 2));
  fs.writeFileSync(
    path.join(root, 'workspace/ops_3_7_harness_result.json'),
    JSON.stringify(out, null, 2)
  );
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
