'use strict';

/**
 * ProductReadiness — checklist de produto (nível big-tech)
 * Roda no boot e expõe /api/v1/product/readiness
 */

const fs = require('node:fs');
const path = require('node:path');

const WORKSPACE = path.join(__dirname, '../../workspace');

function check(name, ok, detail, severity = 'info') {
  return { name, ok: !!ok, detail: detail || '', severity: ok ? 'ok' : severity };
}

function runProductReadiness(options = {}) {
  const checks = [];
  const env = process.env;

  // 1. LLM keys (pelo menos uma)
  const hasLlm =
    !!(env.GROQ_API_KEY || env.GEMINI_API_KEY || env.OPENAI_API_KEY || env.OPENROUTER_API_KEY || env.DEEPSEEK_API_KEY);
  checks.push(
    check(
      'llm_keys',
      hasLlm,
      hasLlm ? 'Pelo menos um provedor LLM configurado' : 'Nenhuma GROQ/GEMINI/OPENAI/OPENROUTER key',
      'critical'
    )
  );

  // 2. Dual STT ideal
  checks.push(
    check(
      'stt_fallback',
      !!(env.GROQ_API_KEY && env.GEMINI_API_KEY),
      env.GROQ_API_KEY && env.GEMINI_API_KEY
        ? 'Groq + Gemini (fallback de áudio OK)'
        : 'Ideal: GROQ_API_KEY e GEMINI_API_KEY juntos',
      'warn'
    )
  );

  // 3. Workspace gravável
  let workspaceWritable = false;
  try {
    if (!fs.existsSync(WORKSPACE)) fs.mkdirSync(WORKSPACE, { recursive: true });
    const probe = path.join(WORKSPACE, '.write_probe');
    fs.writeFileSync(probe, String(Date.now()));
    fs.unlinkSync(probe);
    workspaceWritable = true;
  } catch (e) {
    workspaceWritable = false;
  }
  checks.push(
    check(
      'workspace_writable',
      workspaceWritable,
      workspaceWritable ? WORKSPACE : 'workspace/ não gravável — agenda e sessão em risco',
      'critical'
    )
  );

  // 4. attendants_db
  const dbPath = path.join(WORKSPACE, 'attendants_db.json');
  let attendantsOk = false;
  let partners = 0;
  try {
    if (fs.existsSync(dbPath)) {
      const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      partners = Object.keys(data || {}).length;
      attendantsOk = true;
    } else {
      attendantsOk = true; // será criado
    }
  } catch (e) {
    attendantsOk = false;
  }
  checks.push(
    check(
      'attendants_db',
      attendantsOk,
      attendantsOk ? `OK (${partners} parceiro(s))` : 'attendants_db.json corrompido',
      'critical'
    )
  );

  // 5. Sessão WA path
  const sessionsDir = path.join(WORKSPACE, 'sessions');
  checks.push(
    check(
      'sessions_dir',
      fs.existsSync(sessionsDir) || workspaceWritable,
      'workspace/sessions para Baileys + soft-pause',
      'warn'
    )
  );

  // 6. Owner alert
  checks.push(
    check(
      'owner_alert',
      !!env.OWNER_WHATSAPP_JID,
      env.OWNER_WHATSAPP_JID ? 'OWNER_WHATSAPP_JID definido' : 'Sem alerta ao dono se WA cair',
      'warn'
    )
  );

  // 7. Persistência módulos
  let bookingFlush = false;
  try {
    const { PmeAgentConfigurator } = require('../ring1/PmeAgentConfigurator');
    const c = new PmeAgentConfigurator();
    bookingFlush = typeof c.flush === 'function';
  } catch (_) {}
  checks.push(
    check('booking_flush', bookingFlush, bookingFlush ? 'flush() síncrono disponível' : 'sem flush', 'critical')
  );

  // 8. Superpoderes de produto
  const superpowers = [
    { id: 'booking_catalog', label: 'Agenda + catálogo hard-fail' },
    { id: 'soft_pause', label: 'Soft-pause com contexto' },
    { id: 'stt_fallback_msg', label: 'Áudio → texto se STT falhar' },
    { id: 'disk_slot_lock', label: 'Lock de slot em disco' },
    { id: 'prompt_no_team', label: 'Sem “equipe técnica” na agenda' },
    { id: 'hygiene', label: 'Rotação de logs' }
  ];

  const criticalFail = checks.filter((c) => !c.ok && c.severity === 'critical');
  const warnFail = checks.filter((c) => !c.ok && c.severity === 'warn');

  return {
    ok: criticalFail.length === 0,
    score: Math.round((checks.filter((c) => c.ok).length / checks.length) * 100),
    checks,
    superpowers,
    criticalFail: criticalFail.map((c) => c.name),
    warnings: warnFail.map((c) => c.name),
    timestamp: new Date().toISOString()
  };
}

module.exports = { runProductReadiness };
