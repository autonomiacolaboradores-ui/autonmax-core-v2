'use strict';

/**
 * test_all_pme_flows.js — Bateria Completa de Testes de Todos os Fluxos
 *
 * Valida de ponta a ponta:
 * 1. CRUD de Catálogo Item por Item (Serviços e Produtos)
 * 2. Seletor de Modo Operacional FSM (SERVICOS_AGENDAMENTO vs PRODUTOS_PEDIDOS vs HIBRIDO)
 * 3. Barreiras Anti-Alucinação (Itens Inválidos e Trava de Falsas Confirmações)
 * 4. Extração Automática de Dados do WhatsApp (Telefone BR + PushName + Zero Interrogação)
 * 5. Consciência Temporal (Data/Hora de São Paulo em Tempo Real)
 * 6. CRM Inteligente (Memória de Clientes, LTV, Recorrência e Item Favorito)
 */

const assert = require('node:assert');
const { PmeCrmEngine } = require('../core/ring1/PmeCrmEngine');
const { MaxAgentRuntime } = require('../core/ring1/MaxAgentRuntime');
const { PmeAgentConfigurator } = require('../core/ring1/PmeAgentConfigurator');
const BookingDateTime = require('../core/ring2/BookingDateTime');

async function runAllFlowsTests() {
  console.log('══════════════════════════════════════════════════════════════════');
  console.log('🚀 INICIANDO BATERIA COMPLETA DE TESTES DE FLUXOS DO MAX ATENDENTE');
  console.log('══════════════════════════════════════════════════════════════════\n');

  const testPartnerId = 'partner_flow_test_' + Date.now();
  const configurator = new PmeAgentConfigurator();
  const runtime = new MaxAgentRuntime({ pmeConfigurator: configurator });
  const crm = new PmeCrmEngine();

  // ──────────────────────────────────────────────────────────────────────────
  // FLUXO 1: CRUD ITEM POR ITEM & NORMALIZAÇÃO (SERVIÇOS E PRODUTOS)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('📦 [FLUXO 1] Testando CRUD de Serviços e Produtos...');
  
  const rawService = {
    name: 'Corte Degradê Navalhado',
    priceCents: 4500,
    priceLabel: 'R$ 45,00',
    durationMinutes: 40,
    category: 'Cabelo',
    description: 'Corte com acabamento navalhado e toalha quente',
    active: true
  };
  const normService = PmeAgentConfigurator.normalizeCatalogItem(rawService, 0);
  assert.strictEqual(normService.name, 'Corte Degradê Navalhado');
  assert.strictEqual(normService.priceCents, 4500);
  assert.strictEqual(normService.durationMinutes, 40);
  assert.strictEqual(normService.active, true);

  const rawProduct = {
    name: 'Hambúrguer Artesanal Duplo',
    priceCents: 3800,
    stock: 50,
    unit: 'un',
    category: 'Lanches',
    description: '2x burger 160g com queijo cheddar e bacon crocante',
    active: true
  };
  const normProduct = PmeAgentConfigurator.normalizeProductItem(rawProduct, 0);
  assert.strictEqual(normProduct.name, 'Hambúrguer Artesanal Duplo');
  assert.strictEqual(normProduct.priceCents, 3800);
  assert.strictEqual(normProduct.stock, 50);
  assert.strictEqual(normProduct.unit, 'un');
  assert.strictEqual(normProduct.active, true);

  // Salva no configurador
  configurator.updateAttendantConfig(testPartnerId, {
    catalog: [normService],
    workingHours: { mon: '09:00 - 18:00', tue: '09:00 - 18:00' }
  });
  const savedCfg = configurator.getAttendantConfig(testPartnerId);
  assert.strictEqual(savedCfg.catalog.length, 1);
  assert.strictEqual(savedCfg.catalog[0].name, 'Corte Degradê Navalhado');
  console.log('  ✅ Normalização e cadastro item a item validados com sucesso.\n');

  // ──────────────────────────────────────────────────────────────────────────
  // FLUXO 2: SELETOR DE MODO OPERACIONAL FSM (ROTEAMENTO ESTRITO)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('🎛️ [FLUXO 2] Testando Seletor de Modo Operacional FSM...');
  
  // 2.1 Modo: SERVICOS_AGENDAMENTO (Deve recusar pedido de produtos)
  savedCfg.operation_mode = 'SERVICOS_AGENDAMENTO';
  const orderInServiceMode = await runtime.processTurn({
    partnerId: testPartnerId,
    userKey: '5511999990001@s.whatsapp.net',
    userMessage: 'Quero pedir 2 hambúrgueres para entrega',
    pushName: 'Carlos'
  });
  assert.ok(orderInServiceMode && orderInServiceMode.facts, 'Deve retornar fatos operacionais');
  const hasServiceRestriction = orderInServiceMode.facts.some(f => f.includes('RESTRIÇÃO OPERACIONAL') && f.includes('EXCLUSIVAMENTE'));
  assert.ok(hasServiceRestriction, 'Deve bloquear pedido quando em modo SERVICOS_AGENDAMENTO');
  console.log('  ✅ Modo SERVICOS_AGENDAMENTO bloqueou tentativa de pedido de produto.');

  // 2.2 Modo: PRODUTOS_PEDIDOS (Deve recusar agendamento de serviço)
  savedCfg.operation_mode = 'PRODUTOS_PEDIDOS';
  const bookingInProductMode = await runtime.processTurn({
    partnerId: testPartnerId,
    userKey: '5511999990001@s.whatsapp.net',
    userMessage: 'Gostaria de agendar um horário para amanhã às 14h',
    pushName: 'Carlos'
  });
  assert.ok(bookingInProductMode && bookingInProductMode.facts);
  const hasProductRestriction = bookingInProductMode.facts.some(f => f.includes('RESTRIÇÃO OPERACIONAL') || f.includes('apenas com pedidos/compras') || f.includes('não realiza agendamentos'));
  assert.ok(hasProductRestriction, 'Deve bloquear agendamento quando em modo PRODUTOS_PEDIDOS');
  console.log('  ✅ Modo PRODUTOS_PEDIDOS bloqueou tentativa de agendamento de serviço.');

  // 2.3 Modo: HIBRIDO (Permite ambos)
  savedCfg.operation_mode = 'HIBRIDO';
  assert.strictEqual(runtime._getOperationMode(testPartnerId), 'HIBRIDO');
  console.log('  ✅ Modo HIBRIDO configurado e reconhecido pelo runtime.\n');

  // ──────────────────────────────────────────────────────────────────────────
  // FLUXO 3: EXTRAÇÃO AUTOMÁTICA DE DADOS DO WHATSAPP (ZERO INTERROGAÇÃO)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('📱 [FLUXO 3] Testando Extração de Dados do WhatsApp...');
  
  const testJid = '5511987654321@s.whatsapp.net';
  const extractedPhone = crm.formatPhone(testJid);
  assert.strictEqual(extractedPhone, '(11) 98765-4321', 'Deve formatar JID para (11) 98765-4321');

  const customerExtracted = crm.getOrCreateCustomer(testPartnerId, testJid, 'Camila Ribeiro', testJid);
  assert.strictEqual(customerExtracted.name, 'Camila Ribeiro', 'Nome deve ser extraído do pushName');
  assert.strictEqual(customerExtracted.phone, '(11) 98765-4321', 'Telefone deve ser o formatado');

  const factsBlockSample = runtime.formatFactsBlock({
    facts: ['Fact test']
  });
  assert.ok(factsBlockSample.includes('NUNCA pergunte nome completo ou telefone ao cliente'), 'Instrução de zero-asking deve estar presente');
  console.log('  ✅ Extração automática de telefone BR e nome sem interrogação validada.\n');

  // ──────────────────────────────────────────────────────────────────────────
  // FLUXO 4: CONSCIÊNCIA TEMPORAL (AMERICA/SAO_PAULO EM TEMPO REAL)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('⏰ [FLUXO 4] Testando Consciência Temporal em Tempo Real...');
  
  const todayInfo = BookingDateTime.todayInfo();
  assert.ok(todayInfo.dateStr && todayInfo.dateStr.match(/^\d{4}-\d{2}-\d{2}$/), 'Data deve ter formato YYYY-MM-DD');
  assert.ok(todayInfo.dayOfWeekName, 'Deve ter nome do dia da semana por extenso');
  assert.ok(todayInfo.timeStr && todayInfo.timeStr.match(/^\d{2}:\d{2}$/), 'Hora deve ter formato HH:mm');
  console.log(`  ✅ Data/Hora atual sincronizada: ${todayInfo.label} às ${todayInfo.timeStr}.\n`);

  // ──────────────────────────────────────────────────────────────────────────
  // FLUXO 5: TRAVAS ANTI-ALUCINAÇÃO & SEGURANÇA
  // ──────────────────────────────────────────────────────────────────────────
  console.log('🛡️ [FLUXO 5] Testando Barreiras Anti-Alucinação...');
  
  // 5.1 Rejeição de produto que não existe no catálogo
  const fakeProductOrder = await runtime.processTurn({
    partnerId: testPartnerId,
    userKey: testJid,
    userMessage: 'Quero comprar um Item Fantasma Que Nao Existe',
    pushName: 'Camila Ribeiro'
  });
  assert.ok(fakeProductOrder && fakeProductOrder.facts);
  const mentionsFake = fakeProductOrder.facts.some(f => f.includes('não foi encontrado no catálogo') || f.includes('Item Fantasma'));
  assert.ok(mentionsFake, 'Deve alertar que o item não existe no catálogo');

  // 5.2 Trava absoluta em confirmação: proibido confirmar sem gravação real
  assert.ok(factsBlockSample.includes('Só diga que está confirmado se aparecer \'AGENDAMENTO CONFIRMADO ✅\''), 'Trava de agendamento presente');
  assert.ok(factsBlockSample.includes('Só diga que está confirmado se aparecer \'PEDIDO REALIZADO E CONFIRMADO COM SUCESSO ✅\''), 'Trava de pedido presente');
  console.log('  ✅ Travas anti-alucinação e segurança de confirmação validadas.\n');

  // ──────────────────────────────────────────────────────────────────────────
  // FLUXO 6: CRM INTELIGENTE & MEMÓRIA HISTÓRICA (LTV, VIP, PREFERÊNCIAS)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('🧠 [FLUXO 6] Testando CRM Inteligente e Memória de Clientes...');
  
  const crmPartner = 'partner_crm_flow_' + Date.now();
  const crmJid = '5521998881234@s.whatsapp.net';
  const crmName = 'Eduardo Silveira';

  // 6.1 Primeiro contato (Novo Cliente)
  const crmNew = crm.getOrCreateCustomer(crmPartner, crmJid, crmName, crmJid);
  assert.strictEqual(crmNew.tier, 'NOVO');
  assert.strictEqual(crmNew.totalInteractions, 0);
  const factNew = crm.generateCrmFact(crmNew);
  assert.ok(factNew.includes('Novo Cliente (Primeiro Contato'));
  assert.ok(factNew.includes('(21) 99888-1234'));

  // 6.2 Registra múltiplos pedidos e agendamento para tornar VIP
  crm.recordOrder(crmPartner, crmJid, crmName, {
    orderId: 'ord_crm_1',
    items: [{ productName: 'Pizza Calabresa Especial', quantity: 1 }],
    totalCents: 6000,
    remoteJid: crmJid
  });
  crm.recordOrder(crmPartner, crmJid, crmName, {
    orderId: 'ord_crm_2',
    items: [{ productName: 'Pizza Calabresa Especial', quantity: 2 }],
    totalCents: 12000,
    remoteJid: crmJid
  });
  crm.recordAppointment(crmPartner, crmJid, crmName, {
    appointmentId: 'apt_crm_1',
    serviceName: 'Barba e Cabelo',
    priceCents: 8000,
    dateStr: '2026-10-14',
    timeSlot: '16:00',
    remoteJid: crmJid
  });

  const crmVip = crm.getOrCreateCustomer(crmPartner, crmJid, crmName, crmJid);
  assert.strictEqual(crmVip.tier, 'VIP', 'Cliente deve ser VIP após R$ 260 de consumo');
  assert.strictEqual(crmVip.totalOrders, 2, '2 pedidos registrados');
  assert.strictEqual(crmVip.totalAppointments, 1, '1 agendamento registrado');
  assert.strictEqual(crmVip.ltvCents, 26000, 'LTV deve ser 26000 centavos');
  assert.strictEqual(crmVip.topFavorite, 'Pizza Calabresa Especial', 'Item favorito deve ser Pizza Calabresa Especial');

  const factVip = crm.generateCrmFact(crmVip);
  assert.ok(factVip.includes('Cliente VIP'), 'Deve conter Cliente VIP');
  assert.ok(factVip.includes('Pizza Calabresa Especial'), 'Deve citar o favorito');
  assert.ok(factVip.includes('R$ 260,00'), 'Deve exibir o LTV R$ 260,00');
  assert.ok(factVip.includes('DIRETRIZ DE ATENDIMENTO VIP E PERSONALIZADO'), 'Deve incluir a diretriz personalizada');

  // 6.3 Teste de injeção automática no processTurn
  const turnWithCrm = await runtime.processTurn({
    partnerId: crmPartner,
    userKey: crmJid,
    userMessage: 'Olá, gostaria de saber se vocês estão abertos',
    pushName: crmName
  });
  assert.ok(turnWithCrm && turnWithCrm.facts);
  const crmFactPresent = turnWithCrm.facts.some(f => f.includes('[CRM INTELIGENTE - MEMÓRIA HISTÓRICA DO CLIENTE]'));
  assert.ok(crmFactPresent, 'O bloco de CRM deve ser injetado nos fatos de processTurn');

  console.log('  ✅ CRM Inteligente, cálculo de LTV, item favorito e injeção validados com sucesso.\n');

  console.log('══════════════════════════════════════════════════════════════════');
  console.log('🎉 SUCESSO ABSOLUTO: 100% DOS TESTES DE TODOS OS FLUXOS PASSARAM!');
  console.log('══════════════════════════════════════════════════════════════════');
}

runAllFlowsTests().catch(err => {
  console.error('\n❌ ERRO NA EXECUÇÃO DOS TESTES:\n', err);
  process.exit(1);
});
