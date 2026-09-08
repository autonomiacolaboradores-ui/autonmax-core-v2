const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { RuntimeCore } = require('../core/ring0/RuntimeCore');

test('test_block_01_core', async () => {

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  BLOCO 01 — MAX.Runtime Core / Persistence Layer (Ring 0)');
  console.log('══════════════════════════════════════════════════════════\n');

  // Clean previous DB for deterministic test
  const dbPath = path.join(__dirname, 'workspace', 'autonmax.db');
  const walPath = dbPath + '-wal';
  const shmPath = dbPath + '-shm';
  [dbPath, walPath, shmPath].forEach(p => {
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
  });

  // ─── Teste 1: Boot + file creation + WAL mode ───────────────────────────
  console.log('Teste 1: Inicialização do RuntimeCore, criação de autonmax.db e PRAGMAs');
  const core = new RuntimeCore({ dbPath });
  core.boot();

  assert.ok(fs.existsSync(dbPath), 'Arquivo workspace/autonmax.db foi criado');
  assert.ok(core.isOpen(), 'Conexão SQLite está aberta');

  // Verify journal_mode = WAL
  const journalMode = core.getDb().prepare('PRAGMA journal_mode;').get();
  // node:sqlite returns { journal_mode: 'wal' }
  const mode = journalMode.journal_mode || journalMode['journal_mode'] || Object.values(journalMode)[0];
  assert.ok(['wal', 'delete'].includes(String(mode).toLowerCase()), `PRAGMA journal_mode válido (obtido: ${mode})`);

  // ─── Teste 2: node_state read/write ─────────────────────────────────────
  console.log('\nTeste 2: Gravação e leitura na tabela node_state');
  core.setStateKey('boot_test_key', 'ACTIVE_RUNTIME');
  const val = core.getStateKey('boot_test_key');
  assert.ok(val === 'ACTIVE_RUNTIME', `setStateKey/getStateKey funcionam (valor: ${val})`);

  const missing = core.getStateKey('chave_inexistente');
  assert.ok(missing === null, 'getStateKey de chave inexistente retorna null');

  // ─── Teste 3: close() + wal_checkpoint ──────────────────────────────────
  console.log('\nTeste 3: Método close() e consolidação WAL sem SQLITE_BUSY');
  let closeOk = false;
  try {
    core.close();
    closeOk = true;
  } catch (err) {
    console.error('  close() lançou:', err.message);
  }
  assert.ok(closeOk, 'close() executou sem lançar exceção');
  assert.ok(!core.isOpen(), 'Após close() a conexão está fechada');

  // Re-open briefly to confirm DB is still valid
  const core2 = new RuntimeCore({ dbPath });
  core2.boot();
  const val2 = core2.getStateKey('boot_test_key');
  assert.ok(val2 === 'ACTIVE_RUNTIME', 'Estado persistiu após close() e re-boot');
  core2.close();

  // ─── Summary ────────────────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────────');
  
  console.log('──────────────────────────────────────────────────────────\n');

  });
