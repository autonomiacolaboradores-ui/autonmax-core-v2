'use strict';

// core/ring2/GeminiToolsDispatcher.js — runtime limpo (PME + Pessoal)
const { PmeAgentConfigurator } = require('../ring1/PmeAgentConfigurator');
const PdfGeneratorEngine = require('../ring1/PdfGeneratorEngine');
const DocumentExtractor = require('./DocumentExtractor');
const WebSearchEngine = require('./WebSearchEngine');
const PmeAttendantTools = require('./PmeAttendantTools');
const DocumentTools = require('./DocumentTools');
const PmeBookingTools = require('./PmeBookingTools');
const GoogleCalendarConnector = require('./GoogleCalendarConnector');
const MaxNativeTools = require('./MaxNativeTools');

class GeminiToolsDispatcher {
  static getFunctionDeclarations() {
    return [
      {
        name: 'WebSearchEngine',
        description: 'Pesquisa em tempo real na web.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: { type: 'STRING', description: 'Termo de pesquisa' }
          }
        }
      },
      {
        name: 'DocumentExtractor',
        description: 'Extrai texto de documentos (PDF, CSV, TXT, JSON).',
        parameters: {
          type: 'OBJECT',
          properties: {
            fileName: { type: 'STRING', description: 'Nome do arquivo' },
            contentBase64: { type: 'STRING', description: 'Conteúdo em base64 (opcional)' }
          }
        }
      },
      {
        name: 'PdfGeneratorEngine',
        description: 'Gera relatório PDF do atendimento PME.',
        parameters: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING', description: 'Título do relatório' },
            content: { type: 'STRING', description: 'Conteúdo textual' }
          }
        }
      },
      {
        name: 'get_pme_metrics',
        description: 'Métricas de desempenho do atendente PME (conversas, agendamentos).',
        parameters: {
          type: 'OBJECT',
          properties: {
            partnerId: { type: 'STRING', description: 'ID do parceiro PME' }
          }
        }
      },
      {
        name: 'get_system_health',
        description: 'Status de saúde do runtime (WhatsApp, LLM, HTTP).',
        parameters: { type: 'OBJECT', properties: {} }
      },
      {
        name: 'getCatalog',
        description: 'Lista catálogo / cardápio configurado no painel PME.',
        parameters: {
          type: 'OBJECT',
          properties: {
            partnerId: { type: 'STRING', description: 'ID do parceiro' }
          }
        }
      },
      {
        name: 'getAvailableSlots',
        description: 'Horários disponíveis para agendamento.',
        parameters: {
          type: 'OBJECT',
          properties: {
            partnerId: { type: 'STRING' },
            dateStr: { type: 'STRING', description: 'Data YYYY-MM-DD' }
          }
        }
      },
      {
        name: 'createAppointment',
        description: 'Cria agendamento no motor PME.',
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
        name: 'getPolicies',
        description: 'Políticas e regras de negócio do atendente PME.',
        parameters: {
          type: 'OBJECT',
          properties: { partnerId: { type: 'STRING' } }
        }
      },
      ...DocumentTools.functionDeclarations(),
      ...PmeAttendantTools.functionDeclarations(),
      ...MaxNativeTools.functionDeclarations(),
      {
        name: 'calendar_list',
        description: 'Lista próximos eventos do Google Calendar do utilizador (requer OAuth).',
        parameters: { type: 'OBJECT', properties: { accessToken: { type: 'STRING' }, maxResults: { type: 'NUMBER' } } }
      },
      {
        name: 'calendar_create',
        description: 'Cria evento no Google Calendar (requer OAuth). summary, start ISO, end ISO ou durationMinutes, remindersMinutes opcional.',
        parameters: {
          type: 'OBJECT',
          properties: {
            accessToken: { type: 'STRING' },
            summary: { type: 'STRING' },
            start: { type: 'STRING' },
            end: { type: 'STRING' },
            durationMinutes: { type: 'NUMBER' },
            remindersMinutes: { type: 'NUMBER' },
            description: { type: 'STRING' }
          }
        }
      },
      {
        name: 'calendar_update',
        description: 'Altera evento Google Calendar por eventId (requer OAuth).',
        parameters: {
          type: 'OBJECT',
          properties: {
            accessToken: { type: 'STRING' },
            eventId: { type: 'STRING' },
            summary: { type: 'STRING' },
            start: { type: 'STRING' },
            end: { type: 'STRING' },
            description: { type: 'STRING' }
          }
        }
      },
      {
        name: 'calendar_cancel',
        description: 'Cancela/apaga evento Google Calendar por eventId (requer OAuth).',
        parameters: {
          type: 'OBJECT',
          properties: {
            accessToken: { type: 'STRING' },
            eventId: { type: 'STRING' }
          }
        }
      },
      {
        name: 'cancel_appointment',
        description: 'Cancela agendamento PME local (dateStr+timeSlot ou appointmentId).',
        parameters: {
          type: 'OBJECT',
          properties: {
            partnerId: { type: 'STRING' },
            dateStr: { type: 'STRING' },
            timeSlot: { type: 'STRING' },
            appointmentId: { type: 'STRING' },
            clientName: { type: 'STRING' }
          }
        }
      }
    ];
  }

  static async dispatch(name, args = {}, serverContext = null) {
    const partnerId =
      (args && args.partnerId) ||
      (serverContext && serverContext.whatsAppDriver && serverContext.whatsAppDriver.connectedPartnerId) ||
      'usr_google_demo_100';

    const pmeConfigurator = new PmeAgentConfigurator();

    try {
      if (name === 'WebSearchEngine' || name === 'web_search_realtime') {
        const query = args.query || '';
        const searchRes = await WebSearchEngine.search(query);
        if (!searchRes.ok) {
          return {
            status: 'ERROR',
            ok: false,
            reason: searchRes.reason || 'SEARCH_FAILED',
            message: searchRes.message,
            results: [],
            summaryText: ''
          };
        }
        return {
          status: 'SUCCESS',
          ok: true,
          results: searchRes.results,
          summaryText: searchRes.summaryText,
          source: searchRes.source
        };
      }

      if (name === 'DocumentExtractor') {
        const fileName = args.fileName || 'documento.pdf';
        const rawContent = args.contentBase64 || '';
        const buffer = Buffer.from(rawContent, 'base64');
        const extracted = DocumentExtractor.extractTextFromBuffer(fileName, buffer, 'application/pdf');
        return { status: 'SUCCESS', extracted };
      }

      if (name === 'PdfGeneratorEngine' || name === 'generateDailyReport') {
        const pdfEngine = new PdfGeneratorEngine();
        const pdf = pdfEngine.generatePdfReport({
          title: args.title || `Relatorio_PME_${Date.now()}`,
          content: args.content || 'Relatório operacional Max',
          author: 'Max - AUTON.MAX',
          type: 'PME_EXECUTIVE_PDF'
        });
        return { status: 'SUCCESS', filename: pdf.filename, path: pdf.path };
      }

      if (name === 'get_pme_metrics') {
        const config = pmeConfigurator.getAttendantConfig(partnerId);
        const metrics = (config && config.metricsHistory) || {};
        return {
          status: 'SUCCESS',
          partnerId,
          conversationsHandled: metrics.conversationsHandled || 0,
          appointmentsCreated: metrics.appointmentsCreated || 0,
          conversionRatePercent: metrics.conversionRatePercent || 0
        };
      }

      if (name === 'get_system_health') {
        return {
          status: 'SUCCESS',
          runtime: 'OK',
          modules: ['RuntimeCore', 'PmeAgentConfigurator', 'WhatsAppDriver', 'MultiProviderLlmRouter']
        };
      }

      if (name === 'getCatalog') {
        const config = pmeConfigurator.getAttendantConfig(partnerId) || pmeConfigurator.createDefaultConfig(partnerId);
        return {
          status: 'SUCCESS',
          ok: true,
          partnerId,
          storeName: (config && (config.storeName || config.displayName)) || null,
          services: (config && config.catalog) || [],
          pdfs: (config && config.pdfs) || [],
          images: (config && config.images) || [],
          workingHours: (config && config.workingHours) || null
        };
      }

      if (name === 'getAvailableSlots') {
        return PmeBookingTools.getAvailableSlots({ ...(args || {}), partnerId });
      }
      if (name === 'createAppointment') {
        return await PmeBookingTools.createAppointment({ ...(args || {}), partnerId });
      }
      if (name === 'getPolicies') {
        return PmeBookingTools.getPolicies({ ...(args || {}), partnerId });
      }

      if (['fetch_url_text', 'compile_markdown', 'compile_pdf'].includes(name)) {
        return DocumentTools.dispatch(name, args || {});
      }

      if (['list_services','get_service_details','get_business_hours','get_store_policies','get_store_profile','search_knowledge_base','get_next_available_slot','validate_booking_ready','get_attendant_metrics','estimate_visit_duration'].includes(name)) {
        return PmeAttendantTools.dispatch(name, { ...(args || {}), partnerId });
      }

      if (name === 'cancel_appointment') {
        return PmeBookingTools.cancelAppointment({ ...(args || {}), partnerId });
      }

      if (['calendar_list', 'calendar_create', 'calendar_update', 'calendar_cancel'].includes(name)) {
        const token =
          (args && (args.accessToken || args.token)) ||
          (serverContext && serverContext.googleAccessToken) ||
          process.env.GOOGLE_ACCESS_TOKEN ||
          null;
        const map = {
          calendar_list: 'LIST',
          calendar_create: 'CREATE',
          calendar_update: 'UPDATE',
          calendar_cancel: 'CANCEL'
        };
        return GoogleCalendarConnector.dispatch(map[name], token, args || {});
      }

      // R1.5/R1.6 native tools (21–30)
      const nativeNames = [
        'book_appointment_confirmed',
        'list_my_appointments',
        'reschedule_appointment',
        'get_travel_time',
        'compare_services',
        'upsell_safe',
        'faq_from_pdf',
        'generate_booking_card',
        'split_bill',
        'unit_convert',
        'follow_url_summarize'
      ];
      if (nativeNames.includes(name)) {
        return MaxNativeTools.dispatch(name, { ...(args || {}), partnerId });
      }

      return { status: 'UNKNOWN_TOOL', tool: name };
    } catch (err) {
      return { status: 'ERROR', tool: name, error: err.message };
    }
  }
}

module.exports = GeminiToolsDispatcher;
