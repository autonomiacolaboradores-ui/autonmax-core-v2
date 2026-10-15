'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { MaxAgentRuntime } = require('../core/ring1/MaxAgentRuntime');
const { PmeAgentConfigurator } = require('../core/ring1/PmeAgentConfigurator');
const BookingDateTime = require('../core/ring2/BookingDateTime');

async function testDisambiguation() {
  console.log('[TEST] Iniciando verificação de regras de desambiguação e telefone brasileiro...');

  // 1. Teste de formatação de telefone
  assert.strictEqual(BookingDateTime.formatBrazilianPhone('5511999998888@s.whatsapp.net'), '(11) 99999-8888');
  assert.strictEqual(BookingDateTime.formatBrazilianPhone('5521988887777'), '(21) 98888-7777');
  assert.strictEqual(BookingDateTime.formatBrazilianPhone('1133334444'), '(11) 3333-4444');
  console.log('✅ Formatação de telefone brasileiro validada');

  // Setup de parceiro com serviços E produtos cadastrados
  const pid = 'parceiro_misto_test';
  const dbPath = path.join(__dirname, 'workspace', `test_disambig_${Date.now()}.json`);
  const pme = new PmeAgentConfigurator(dbPath);

  pme.createDefaultConfig(pid);
  pme.addService(pid, { name: 'Corte Degradê', priceCents: 6000, durationMinutes: 45, category: 'Barbearia' });
  pme.addProduct(pid, { name: 'Pomada Modeladora', priceCents: 3500, stock: 20, unit: 'un', category: 'Produtos' });

  const runtime = new MaxAgentRuntime({ pmeConfigurator: pme });

  // 2. Cliente tenta pedir entrega de um SERVIÇO ("Quero pedir um Corte Degradê")
  const res1 = await runtime.processTurn({
    mode: 'pme',
    partnerId: pid,
    userKey: '5511999991111@s.whatsapp.net',
    userMessage: 'Gostaria de pedir um delivery de Corte Degradê'
  });

  assert.ok(res1.intent.includes('booking'), 'Tentativa de pedir serviço deve redirecionar para intent de booking');
  assert.ok(res1.facts.some(f => f.includes('DESAMBIGUAÇÃO PRODUTO vs SERVIÇO')), 'Deve conter fato de desambiguação clara');
  console.log('✅ Tentativa de pedir SERVIÇO como pedido de entrega foi interceptada e redirecionada para agendamento!');

  // 3. Cliente tenta agendar um PRODUTO ("Quero agendar uma Pomada Modeladora amanhã às 14h")
  const res2 = await runtime.processTurn({
    mode: 'pme',
    partnerId: pid,
    userKey: '5511999992222@s.whatsapp.net',
    userMessage: 'Quero agendar uma Pomada Modeladora amanhã às 14h'
  });

  assert.ok(res2.intent.includes('order'), 'Tentativa de agendar produto deve redirecionar para intent de order');
  assert.ok(res2.facts.some(f => f.includes('DESAMBIGUAÇÃO SERVIÇO vs PRODUTO')), 'Deve conter fato de desambiguação clara');
  console.log('✅ Tentativa de agendar PRODUTO como serviço foi interceptada e redirecionada para pedido de entrega/compra!');

  // Cleanup
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  console.log('\n🎉 TODOS OS TESTES DE REGRAS DE DESAMBIGUAÇÃO PASSARAM COM SUCESSO!');
}

testDisambiguation().catch(err => {
  console.error('❌ Falha:', err);
  process.exit(1);
});
