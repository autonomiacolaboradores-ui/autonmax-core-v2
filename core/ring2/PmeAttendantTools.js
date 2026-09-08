'use strict';

/**
 * PmeAttendantTools — ferramentas nativas do atendente PME (sem botões de UI).
 * Só function-calling. Dados da base do parceiro (catalog / policies / V2 / métricas).
 */

const { PmeAgentConfigurator } = require('../ring1/PmeAgentConfigurator');
const PmeBookingTools = require('./PmeBookingTools');

function cfg(partnerId) {
  const c = new PmeAgentConfigurator();
  return c.getAttendantConfig(partnerId || 'usr_google_demo_100') || c.createDefaultConfig(partnerId);
}

function findService(config, serviceName, serviceId) {
  const catalog = config.catalog || [];
  if (serviceId) {
    const byId = catalog.find((x) => x.id === serviceId);
    if (byId) return byId;
  }
  if (serviceName) {
    const q = String(serviceName).toLowerCase();
    return (
      catalog.find((x) => String(x.name).toLowerCase() === q) ||
      catalog.find((x) => String(x.name).toLowerCase().includes(q))
    );
  }
  return null;
}

class PmeAttendantTools {
  static functionDeclarations() {
    return [
      {
        name: 'list_services',
        description: 'Lista serviços/produtos do catálogo PME com preço e duração.',
        parameters: {
          type: 'OBJECT',
          properties: { partnerId: { type: 'STRING' } }
        }
      },
      {
        name: 'get_service_details',
        description: 'Detalhes de um serviço específico (preço, duração, descrição).',
        parameters: {
          type: 'OBJECT',
          properties: {
            partnerId: { type: 'STRING' },
            serviceName: { type: 'STRING' },
            serviceId: { type: 'STRING' }
          }
        }
      },
      {
        name: 'get_business_hours',
        description: 'Horário de funcionamento do estabelecimento.',
        parameters: {
          type: 'OBJECT',
          properties: { partnerId: { type: 'STRING' } }
        }
      },
      {
        name: 'get_store_policies',
        description: 'Políticas de cancelamento, pagamento e regras do PME.',
        parameters: {
          type: 'OBJECT',
          properties: { partnerId: { type: 'STRING' } }
        }
      },
      {
        name: 'get_store_profile',
        description: 'Nome da loja, segmento e identidade pública do atendente.',
        parameters: {
          type: 'OBJECT',
          properties: { partnerId: { type: 'STRING' } }
        }
      },
      {
        name: 'search_knowledge_base',
        description: 'Busca texto na base de conhecimento (PDFs/docs cadastrados no painel).',
        parameters: {
          type: 'OBJECT',
          properties: {
            partnerId: { type: 'STRING' },
            query: { type: 'STRING', description: 'Termo a procurar nos documentos' }
          }
        }
      },
      {
        name: 'get_next_available_slot',
        description: 'Primeiro horário livre para um serviço numa data (usa duração do catálogo).',
        parameters: {
          type: 'OBJECT',
          properties: {
            partnerId: { type: 'STRING' },
            dateStr: { type: 'STRING' },
            serviceName: { type: 'STRING' },
            serviceId: { type: 'STRING' }
          }
        }
      },
      {
        name: 'validate_booking_ready',
        description:
          'Verifica se já há nome do cliente, serviço e horário para agendar. Se faltar algo, indica o que pedir.',
        parameters: {
          type: 'OBJECT',
          properties: {
            partnerId: { type: 'STRING' },
            clientName: { type: 'STRING' },
            serviceName: { type: 'STRING' },
            dateStr: { type: 'STRING' },
            timeSlot: { type: 'STRING' }
          }
        }
      },
      {
        name: 'get_attendant_metrics',
        description: 'Métricas do atendente: conversas, agendamentos, taxa de conversão.',
        parameters: {
          type: 'OBJECT',
          properties: { partnerId: { type: 'STRING' } }
        }
      },
      {
        name: 'estimate_visit_duration',
        description: 'Estima duração total de um ou mais serviços do catálogo (minutos).',
        parameters: {
          type: 'OBJECT',
          properties: {
            partnerId: { type: 'STRING' },
            serviceNames: {
              type: 'ARRAY',
              description: 'Lista de nomes de serviços'
            }
          }
        }
      }
    ];
  }

  static async dispatch(name, args = {}) {
    const partnerId = args.partnerId || 'usr_google_demo_100';
    try {
      switch (name) {
        case 'list_services': {
          const c = cfg(partnerId);
          const services = (c.catalog || []).map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description || '',
            priceCents: s.priceCents,
            priceLabel: `R$ ${((s.priceCents || 0) / 100).toFixed(2)}`,
            durationMinutes: s.durationMinutes || 30
          }));
          return { status: 'SUCCESS', ok: true, partnerId, count: services.length, services };
        }
        case 'get_service_details': {
          const c = cfg(partnerId);
          const svc = findService(c, args.serviceName, args.serviceId);
          if (!svc) {
            return {
              status: 'ERROR',
              ok: false,
              reason: 'SERVICE_NOT_FOUND',
              message: 'Serviço não encontrado no catálogo do estabelecimento.'
            };
          }
          return {
            status: 'SUCCESS',
            ok: true,
            service: {
              id: svc.id,
              name: svc.name,
              description: svc.description || '',
              priceCents: svc.priceCents,
              priceLabel: `R$ ${((svc.priceCents || 0) / 100).toFixed(2)}`,
              durationMinutes: svc.durationMinutes || 30
            }
          };
        }
        case 'get_business_hours': {
          const c = cfg(partnerId);
          return {
            status: 'SUCCESS',
            ok: true,
            workingHours: c.workingHours || null,
            message: c.workingHours
              ? `Atendemos ${c.workingHours.days.join(', ')} das ${c.workingHours.startTime} às ${c.workingHours.endTime}.`
              : 'Horário não configurado no painel.'
          };
        }
        case 'get_store_policies': {
          const c = cfg(partnerId);
          return { status: 'SUCCESS', ok: true, policies: c.policies || {} };
        }
        case 'get_store_profile': {
          const c = cfg(partnerId);
          return {
            status: 'SUCCESS',
            ok: true,
            profile: {
              partnerId,
              storeName: c.storeName || c.displayName || null,
              attendantName: c.attendantName || 'Max',
              displayName: c.displayName || null,
              storeSegment: c.storeSegment || null,
              isActive: c.isActive !== false,
              hasCustomPersonality: !!(c.personalityPrompt && c.personalityPrompt.length > 40)
            }
          };
        }
        case 'search_knowledge_base': {
          const c = cfg(partnerId);
          const q = String(args.query || '').trim().toLowerCase();
          const pdfs = c.pdfs || [];
          if (!q) {
            return { status: 'ERROR', ok: false, reason: 'QUERY_EMPTY', message: 'Informe o termo de busca.' };
          }
          const hits = [];
          for (const doc of pdfs) {
            const text = String(doc.text || '');
            const name = String(doc.name || 'documento');
            if (name.toLowerCase().includes(q) || text.toLowerCase().includes(q)) {
              const idx = text.toLowerCase().indexOf(q);
              const snippet =
                idx >= 0
                  ? text.slice(Math.max(0, idx - 80), idx + q.length + 120)
                  : text.slice(0, 200);
              hits.push({ name, snippet: snippet.trim() });
            }
          }
          // V2 sqlite texts already mirrored into config.pdfs when loaded by compile path
          return {
            status: 'SUCCESS',
            ok: true,
            query: args.query,
            hitCount: hits.length,
            hits,
            message:
              hits.length === 0
                ? 'Nada encontrado na base de conhecimento cadastrada.'
                : `Encontrei ${hits.length} trecho(s).`
          };
        }
        case 'get_next_available_slot': {
          let slots = PmeBookingTools.getAvailableSlots({
            partnerId,
            dateStr: args.dateStr,
            serviceName: args.serviceName,
            serviceId: args.serviceId
          });
          if (slots && typeof slots.then === 'function') slots = await slots;
          if (slots && slots.ok && slots.slots && slots.slots.length) {
            return {
              status: 'SUCCESS',
              ok: true,
              dateStr: slots.dateStr,
              dateFriendly: slots.dateFriendly,
              next: slots.slots[0],
              slots: slots.slots.slice(0, 8),
              durationMinutes: slots.durationMinutes,
              totalFree: slots.slots.length,
              service: slots.service,
              message: slots.message
            };
          }
          // Sem vaga no dia pedido → busca próximos dias
          const nextOpen = PmeBookingTools.findNextOpenSlot({
            partnerId,
            dateStr: args.dateStr,
            serviceName: args.serviceName,
            serviceId: args.serviceId
          });
          if (nextOpen && nextOpen.ok) {
            return {
              status: 'SUCCESS',
              ok: true,
              dateStr: nextOpen.dateStr,
              dateFriendly: nextOpen.dateFriendly,
              next: nextOpen.next,
              durationMinutes: nextOpen.durationMinutes,
              totalFree: nextOpen.totalFree,
              service: nextOpen.service,
              searchedAhead: true,
              message: nextOpen.message
            };
          }
          return {
            status: 'ERROR',
            ok: false,
            reason: 'NO_SLOTS',
            message: 'Não há horários livres para essa data/serviço nos próximos dias.',
            detail: slots
          };
        }
        case 'validate_booking_ready': {
          const missing = [];
          if (!String(args.clientName || '').trim()) missing.push('clientName');
          if (!String(args.serviceName || '').trim()) missing.push('serviceName');
          if (!String(args.dateStr || '').trim()) missing.push('dateStr');
          if (!String(args.timeSlot || '').trim()) missing.push('timeSlot');
          const ready = missing.length === 0;
          return {
            status: 'SUCCESS',
            ok: true,
            ready,
            missing,
            message: ready
              ? 'Dados completos — pode chamar createAppointment.'
              : `Falta confirmar: ${missing.join(', ')}.`
          };
        }
        case 'get_attendant_metrics': {
          const c = cfg(partnerId);
          const m = c.metricsHistory || {};
          return {
            status: 'SUCCESS',
            ok: true,
            metrics: {
              conversationsHandled: m.conversationsHandled || 0,
              appointmentsCreated: m.appointmentsCreated || 0,
              conversionRatePercent: m.conversionRatePercent || 0
            }
          };
        }
        case 'estimate_visit_duration': {
          const c = cfg(partnerId);
          const names = Array.isArray(args.serviceNames) ? args.serviceNames : [];
          let total = 0;
          const breakdown = [];
          for (const n of names) {
            const svc = findService(c, n, null);
            const mins = svc ? Number(svc.durationMinutes) || 30 : 30;
            total += mins;
            breakdown.push({ serviceName: n, durationMinutes: mins, found: !!svc });
          }
          if (!names.length) {
            return { status: 'ERROR', ok: false, reason: 'NO_SERVICES', message: 'Informe serviceNames.' };
          }
          return { status: 'SUCCESS', ok: true, totalMinutes: total, breakdown };
        }
        default:
          return { status: 'UNKNOWN_TOOL', tool: name };
      }
    } catch (err) {
      return { status: 'ERROR', ok: false, tool: name, reason: err.message };
    }
  }
}

module.exports = PmeAttendantTools;
