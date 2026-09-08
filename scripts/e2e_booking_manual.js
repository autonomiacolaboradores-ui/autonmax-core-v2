'use strict';

// scripts/e2e_booking_manual.js
// Script para testar a engine E2E na mão

const { MaxAgentRuntime } = require('../core/ring1/MaxAgentRuntime');
const { PmeAgentConfigurator } = require('../core/ring1/PmeAgentConfigurator');
const PmeBookingTools = require('../core/ring2/PmeBookingTools');
const readline = require('readline');

async function start() {
  console.log('=== MAX ATENDENTE - E2E BOOKING MANUAL ===');
  
  const pme = new PmeAgentConfigurator();
  const pid = 'manual_test_partner';
  pme.createDefaultConfig(pid);
  
  const cfg = pme.getAttendantConfig(pid);
  cfg.catalog = [
    { id: 'srv_1', name: 'Consulta Médica', priceCents: 15000, durationMinutes: 60 },
    { id: 'srv_2', name: 'Retorno', priceCents: 0, durationMinutes: 30 }
  ];
  pme.updateAttendantConfig(pid, cfg);
  
  const runtime = new MaxAgentRuntime({ pmeConfigurator: pme });
  PmeBookingTools.setConfigurator(pme);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const uid = '5511999999999@s.whatsapp.net';

  console.log(`Catálogo: ${cfg.catalog.map(c => c.name).join(', ')}`);
  console.log('Digite sua mensagem (ex: "Quero agendar uma consulta amanhã às 15h, meu nome é João"):');
  
  const promptUser = () => {
    rl.question('> ', async (input) => {
      if (input.toLowerCase() === 'sair' || input.toLowerCase() === 'exit') {
        rl.close();
        return;
      }

      try {
        const res = await runtime.processTurn({
          mode: 'pme',
          partnerId: pid,
          userKey: uid,
          userMessage: input
        });

        console.log('\n[AGENT FACTS]', res.facts);
        
        const draft = runtime._readDraft(pid, uid);
        if (draft) {
          console.log('[DRAFT ATUAL]', draft);
        } else {
          console.log('[DRAFT] (Vazio)');
        }

        const db = pme.getAttendantConfig(pid).existingAppointments;
        console.log(`[BANCO DE DADOS] ${db ? db.length : 0} agendamentos salvos.\n`);

        promptUser();
      } catch (err) {
        console.error('Erro:', err);
        promptUser();
      }
    });
  };

  promptUser();
}

start();
