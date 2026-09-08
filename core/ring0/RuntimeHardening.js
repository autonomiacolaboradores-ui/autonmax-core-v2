'use strict';

const fs = require('node:fs');
const path = require('node:path');

const WORKSPACE_DIR = path.join(__dirname, '..', '..', 'workspace');

function ensureWorkspaceLayout() {
  const dirs = [
    'sessions',
    'sessions/baileys_auth',
    'sessions/pme',
    'sessions/personal',
    'resilience',
    'reports',
    'agent_memory',
    'runtime_excellence/idempotency'
  ];

  for (const d of dirs) {
    const fullPath = path.join(WORKSPACE_DIR, d);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }
}

function googleIsolationSnapshot() {
  const disabled = process.env.DISABLE_GOOGLE_AUTH === 'true';
  return {
    DISABLE_GOOGLE_AUTH: process.env.DISABLE_GOOGLE_AUTH || 'false',
    bookingMode: disabled ? 'local_pdf' : 'google_calendar',
    loginMode: disabled ? 'native_only' : 'google_oauth_active',
    calendarToolsBlocked: disabled
  };
}

function assertCriticalModules() {
  const critical = [
    '../ring0/RuntimeCore',
    '../ring1/MaxAgentRuntime',
    '../ring1/PartnerAuthManager',
    '../ring2/HttpServer',
    '../ring2/WhatsAppDriver'
  ];

  const result = { ok: true, missing: [] };
  for (const mod of critical) {
    try {
      require.resolve(mod);
    } catch (e) {
      result.ok = false;
      result.missing.push(mod);
    }
  }
  return result;
}

function bootReport() {
  ensureWorkspaceLayout();
  const isolation = googleIsolationSnapshot();
  const modules = assertCriticalModules();

  const report = {
    timestamp: new Date().toISOString(),
    status: modules.ok ? 'OK' : 'DEGRADED',
    isolationSnapshot: isolation,
    missingModules: modules.missing
  };

  console.log('[RUNTIME_HARDENING]', JSON.stringify(report));
  return report;
}

module.exports = {
  ensureWorkspaceLayout,
  googleIsolationSnapshot,
  assertCriticalModules,
  bootReport
};
