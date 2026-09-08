'use strict';
/**
 * CI — anti-regressão de personalidade genérica / Pix de plataforma / logística pitch.
 * Exit 1 se padrões proibidos reaparecerem em prompts canónicos ou SystemPrompt.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const targets = [
  'core/ring1/SystemPrompt.js',
  'core/prompts/pme_base.v1.md',
  'core/config/AttendantDefaults.js'
];

const FORBIDDEN = [
  /Pix Atômico/i,
  /Finanças\/Pix/i,
  /conciliação de pagamentos Pix/i,
  /Logística \/ Entrega/i,
  /1º Assistente Digital Universal criado pela AutonomIA Systems/i
];

let failed = false;
for (const rel of targets) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) {
    console.warn('SKIP missing', rel);
    continue;
  }
  const text = fs.readFileSync(fp, 'utf8');
  for (const re of FORBIDDEN) {
    if (re.test(text)) {
      console.error('FORBIDDEN', rel, String(re));
      failed = true;
    }
  }
}

// compileMaxAttendantPrompt must exist and syncPersonalityFromV2
const cfg = fs.readFileSync(path.join(ROOT, 'core/ring1/PmeAgentConfigurator.js'), 'utf8');
if (!cfg.includes('syncPersonalityFromV2')) {
  console.error('MISSING syncPersonalityFromV2');
  failed = true;
}
if (!cfg.includes('IDENTIDADE E PERSONALIDADE')) {
  console.error('MISSING identity block');
  failed = true;
}

if (failed) {
  console.error('ci_prompt_guard FAILED');
  process.exit(1);
}
console.log('ci_prompt_guard OK');
