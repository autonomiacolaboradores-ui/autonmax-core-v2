'use strict';

/**
 * verify_crm_memory.js — Teste e Validação do CRM Inteligente no Max Atendente
 */

const assert = require('node:assert');
const { PmeCrmEngine } = require('../core/ring1/PmeCrmEngine');
const { MaxAgentRuntime } = require('../core/ring1/MaxAgentRuntime');

async function runTests() {
  console.log('🧪 Iniciando testes de validação do CRM Inteligente (Memória de Clientes)...');

  const crm = new PmeCrmEngine();
  const testPartnerId = 'partner_crm_test_' + Date.now();
  const testPhone = '5511988887777@s.whatsapp.net';
  const testName = 'Marcos Silva';

  // 1. Teste de Novo Cliente (Primeiro Contato)
  console.log('1. Testando cadastro e fatos de Novo Cliente...');
  const newCustomer = crm.getOrCreateCustomer(testPartnerId, testPhone, testName, testPhone);
  assert.strictEqual(newCustomer.name, 'Marcos Silva', 'Nome deve ser Marcos Silva');
  assert.strictEqual(newCustomer.phone, '(11) 98888-7777', 'Telefone deve estar no formato (11) 98888-7777');
  assert.strictEqual(newCustomer.totalInteractions, 0, 'Deve ter 0 interações');
  assert.strictEqual(newCustomer.tier, 'NOVO', 'Tier deve ser NOVO');

  const newFact = crm.generateCrmFact(newCustomer);
  assert.ok(newFact.includes('Novo Cliente'), 'Fato deve indicar Novo Cliente');
  assert.ok(newFact.includes('(11) 98888-7777'), 'Fato deve conter o telefone formatado');
  console.log('✅ Novo Cliente validado com sucesso.');

  // 2. Simulação de 5 Pedidos (Pizza Calabresa x4, Pizza Mussarela x1)
  console.log('2. Registrando 5 pedidos para Marcos Silva...');
  for (let i = 1; i <= 4; i++) {
    crm.recordOrder(testPartnerId, testPhone, testName, {
      orderId: `ord_test_${i}`,
      items: [{ productName: 'Pizza Calabresa', quantity: 1, unitPrice: 5000 }],
      totalCents: 5000,
      remoteJid: testPhone
    });
  }
  crm.recordOrder(testPartnerId, testPhone, testName, {
    orderId: 'ord_test_5',
    items: [{ productName: 'Pizza Portuguesa', quantity: 1, unitPrice: 5500 }],
    totalCents: 5500,
    remoteJid: testPhone
  });

  // 3. Simulação de 1 Agendamento de Serviço
  console.log('3. Registrando 1 agendamento de serviço...');
  crm.recordAppointment(testPartnerId, testPhone, testName, {
    appointmentId: 'apt_test_1',
    serviceName: 'Corte Tradicional',
    priceCents: 3500,
    dateStr: '2026-10-14',
    timeSlot: '15:00',
    remoteJid: testPhone
  });

  // 4. Verificação de Métricas Acumuladas (LTV, Recorrência, Favorito)
  console.log('4. Verificando perfil consolidado e LTV no CRM...');
  const updatedCustomer = crm.getOrCreateCustomer(testPartnerId, testPhone, testName, testPhone);
  assert.strictEqual(updatedCustomer.totalOrders, 5, 'Deve ter 5 pedidos');
  assert.strictEqual(updatedCustomer.totalAppointments, 1, 'Deve ter 1 agendamento');
  assert.strictEqual(updatedCustomer.totalInteractions, 6, 'Total de interações deve ser 6');
  assert.strictEqual(updatedCustomer.tier, 'VIP', 'Cliente deve ser classificado como VIP');
  assert.strictEqual(updatedCustomer.topFavorite, 'Pizza Calabresa', 'Item favorito deve ser Pizza Calabresa');
  
  // Total gasto: (4 * 50) + 55 + 35 = 290 reais = 29000 centavos
  assert.strictEqual(updatedCustomer.ltvCents, 29000, 'LTV deve ser 29000 centavos (R$ 290,00)');
  assert.strictEqual(updatedCustomer.ltvReais, '290,00', 'LTV formatado deve ser 290,00');

  const vipFact = crm.generateCrmFact(updatedCustomer);
  console.log('\n--- Fato Gerado para a IA ---\n' + vipFact + '\n-----------------------------\n');
  assert.ok(vipFact.includes('Cliente VIP'), 'Fato deve indicar Cliente VIP');
  assert.ok(vipFact.includes('Pizza Calabresa'), 'Fato deve citar Pizza Calabresa como favorita');
  assert.ok(vipFact.includes('R$ 290,00'), 'Fato deve conter o LTV de R$ 290,00');
  assert.ok(vipFact.includes('DIRETRIZ DE ATENDIMENTO VIP E PERSONALIZADO'), 'Deve incluir a diretriz personalizada');
  console.log('✅ Métricas e diretrizes do CRM VIP validadas com sucesso.');

  // 5. Teste de Injeção de Contexto em MaxAgentRuntime.processTurn
  console.log('5. Testando integração com MaxAgentRuntime.processTurn...');
  const runtime = new MaxAgentRuntime();
  const turnResult = await runtime.processTurn({
    partnerId: testPartnerId,
    userKey: testPhone,
    userMessage: 'Olá, boa noite!',
    pushName: testName
  });

  assert.ok(turnResult && turnResult.facts, 'processTurn deve retornar fatos');
  const hasCrmInFacts = turnResult.facts.some(f => f.includes('[CRM INTELIGENTE - MEMÓRIA HISTÓRICA DO CLIENTE]'));
  assert.ok(hasCrmInFacts, 'Os fatos devem conter o bloco do CRM Inteligente');
  console.log('✅ Injeção em tempo real de CRM no MaxAgentRuntime validada com sucesso.');

  console.log('\n🎉 TODOS OS TESTES DO CRM INTELIGENTE PASSARAM COM 100% DE SUCESSO!\n');
}

runTests().catch(err => {
  console.error('❌ Falha nos testes de CRM:', err);
  process.exit(1);
});
