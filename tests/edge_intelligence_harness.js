'use strict';

/**
 * Edge Intelligence Harness — 5 asserts obrigatórios
 * Cobre: REGIONAL_NORMALIZE, AUDIO_EXEC_SUMMARY, OFFLINE_ENQUEUE,
 *        OFFLINE_NOTICE, REACTIVATION_CANDIDATES
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const {
  RegionalNormalizer,
  AudioExecutiveSummary,
  OfflineFirstQueue,
  EthicalReactivation,
  getEdgeIntelligence
} = require('../core/ring1/MaxEdgeIntelligence');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅  ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ❌  ${name}`);
    console.error(`       ${e.message}`);
    failed++;
  }
}

// ── Setup: dirs temporários para os testes ────────────────────────────────────
const TMP = path.join(__dirname, '../workspace/edge_intelligence/_test_tmp');
if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(path.join(TMP, 'offline_queue'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'reactivation'),  { recursive: true });

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n🧪 Edge Intelligence Harness\n');

// REGIONAL_NORMALIZE
test('REGIONAL_NORMALIZE: "Uai sô, marca pra mim um corte" → rota booking', () => {
  const rn = new RegionalNormalizer();
  const result = rn.normalize('Uai sô, marca pra mim um corte amanhã');
  assert.ok(result.text.toLowerCase().includes('quero agendar'), `text="${result.text}"`);
  assert.ok(result.regionalHits.length >= 2, `hits=${result.regionalHits.length}`);
  // Simula classify via regex booking
  const bookingRe = /\b(agendar|marcar|hor[aá]rio dispon|vaga|reservar|quando posso|quero agendar)\b/i;
  assert.ok(bookingRe.test(result.text), `Não bateu regex de booking: "${result.text}"`);
});

// AUDIO_EXEC_SUMMARY
test('AUDIO_EXEC_SUMMARY: áudio longo → ok, oneLiner, actionPrompt', () => {
  const rn = new RegionalNormalizer();
  const ae = new AudioExecutiveSummary(rn);
  const transcript = '[ÁUDIO TRANSCRITO DO CLIENTE]: Oi, bom dia! Eu quero marcar um corte de cabelo para amanhã às 10h, meu nome é João Silva. Você tem vaga? Quanto custa? Eu prefiro de manhã mesmo. Pode confirmar?';
  const r = ae.summarize(transcript, ['corte', 'barba', 'escova']);
  assert.ok(r.ok, 'ok deve ser true');
  assert.ok(r.oneLiner && r.oneLiner.length > 0, `oneLiner vazio: "${r.oneLiner}"`);
  assert.ok(r.actionPrompt && r.actionPrompt.length > 0, `actionPrompt vazio: "${r.actionPrompt}"`);
  assert.ok(r.executiveFact.includes('ÁUDIO_RESUMO_EXECUTIVO'), `executiveFact: "${r.executiveFact}"`);
  // Deve extrair campos
  assert.ok(r.serviceName, `serviceName não extraído`);
  assert.ok(r.timeSlot === '10:00', `timeSlot esperado 10:00 mas obteve: ${r.timeSlot}`);
  assert.ok(r.clientName && r.clientName.toLowerCase().includes('jo'), `clientName: ${r.clientName}`);
});

// OFFLINE_ENQUEUE
test('OFFLINE_ENQUEUE: enqueue retorna id hex', () => {
  const q = new OfflineFirstQueue({ dir: path.join(TMP, 'offline_queue') });
  const id = q.enqueue({ partnerId: 'partner_test', remoteJid: '5511@s.whatsapp.net', text: 'quero agendar' });
  assert.ok(typeof id === 'string' && id.length === 6, `id inválido: "${id}"`);
  const pending = q.pending('partner_test');
  assert.ok(pending.length >= 1, `fila vazia após enqueue`);
  assert.ok(pending[0].id === id, `id não bate`);
});

// OFFLINE_NOTICE
test('OFFLINE_NOTICE: survivalNotice contém "instável" ou "conexão"', () => {
  const q = new OfflineFirstQueue({ dir: path.join(TMP, 'offline_queue'), noticeCooldownMs: 0 });
  const r = q.survivalNotice('5511@s.whatsapp.net');
  assert.ok(r.send === true, 'send deve ser true');
  assert.ok(r.message && (r.message.includes('instável') || r.message.includes('conexão')), `mensagem: "${r.message}"`);
  // Dentro do cooldown normal — não floodar
  const q2 = new OfflineFirstQueue({ dir: path.join(TMP, 'offline_queue'), noticeCooldownMs: 5 * 60 * 1000 });
  q2._lastNoticeAt.set('jid_cooldown', Date.now());
  const r2 = q2.survivalNotice('jid_cooldown');
  assert.ok(r2.send === false, 'deve bloquear dentro do cooldown');
});

// REACTIVATION_CANDIDATES
test('REACTIVATION_CANDIDATES: contato com lastSeen −50 dias aparece em candidates(45)', () => {
  const er = new EthicalReactivation({ dir: path.join(TMP, 'reactivation'), defaultDays: 45, cooldownDays: 90 });
  const pid = 'partner_react_test';
  const jid = '55119999@s.whatsapp.net';

  // Registrar contato com lastSeen forçado para -50 dias
  er.touch(pid, jid, 'Ana Souza');
  const data = er._load(pid);
  data.contacts[jid].lastSeen = new Date(Date.now() - 50 * 86400000).toISOString();
  er._save(pid, data);

  const candidates = er.candidates(pid, 45);
  assert.ok(candidates.length >= 1, `candidates vazio (esperava >= 1)`);
  assert.ok(candidates[0].remoteJid === jid, `jid errado: ${candidates[0].remoteJid}`);
  assert.ok(candidates[0].message.includes('Olá'), `mensagem: "${candidates[0].message}"`);
  assert.ok(!candidates[0].message.includes('{nome}'), `template não substituído`);
});

// ─────────────────────────────────────────────────────────────────────────────
// BONUS: singleton funciona
test('SINGLETON: getEdgeIntelligence() retorna instância com .regional .audio .offline .reactivation', () => {
  const ei = getEdgeIntelligence();
  assert.ok(ei.regional, 'regional ausente');
  assert.ok(ei.audio,    'audio ausente');
  assert.ok(ei.offline,  'offline ausente');
  assert.ok(ei.reactivation, 'reactivation ausente');
});

// Cleanup
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} testes | ✅ ${passed} passaram | ❌ ${failed} falharam\n`);
if (failed > 0) process.exit(1);
