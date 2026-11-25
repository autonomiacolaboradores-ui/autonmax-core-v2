'use strict';

const { PartnerRepository } = require('../storage/repositories/PartnerRepository');
const { ConversationRepository } = require('../storage/repositories/ConversationRepository');
const { AppointmentRepository } = require('../storage/repositories/AppointmentRepository');
const { OrderRepository } = require('../storage/repositories/OrderRepository');
const { CatalogService } = require('../domain/CatalogService');
const { BookingService } = require('../domain/BookingService');
const { OrderService } = require('../domain/OrderService');
const { CustomerService } = require('../domain/CustomerService');
const {
  RegionalNormalizer,
  TZ,
  buildRollingCalendarSP,
} = require('../domain/RegionalNormalizer');
const { PromptPin } = require('./PromptPin');
const { InputGuard } = require('./InputGuard');
const { LlmRouter, MAX_TOOL_ITERATIONS } = require('./LlmRouter');
const { AtomicOutputGuard } = require('./AtomicOutputGuard');

const DEFAULT_MAX_CONTEXT_TOKENS = 4096;
const HYBRID_OFFERING_NOTICE =
  'Oferecemos produtos e serviços — sobre qual dos dois deseja informações?';

/**
 * Deterministically inspects SQLite catalog items to classify what the PME offers.
 * @param {Array<Record<string, any>>} catalogItems
 */
function analyzeCatalogOfferings(catalogItems = []) {
  const services = [];
  const products = [];
  for (const item of catalogItems) {
    const t = String(item?.item_type || item?.type || '').toUpperCase();
    if (t === 'SERVICE') services.push(item);
    else if (t === 'PRODUCT') products.push(item);
  }
  const hasServices = services.length > 0;
  const hasProducts = products.length > 0;
  const isHybrid = hasServices && hasProducts;
  const mode = isHybrid
    ? 'HYBRID'
    : hasServices
      ? 'SERVICES_ONLY'
      : hasProducts
        ? 'PRODUCTS_ONLY'
        : 'EMPTY';
  return {
    mode,
    isHybrid,
    hasServices,
    hasProducts,
    servicesCount: services.length,
    productsCount: products.length,
  };
}

/**
 * Conservative token estimator (~4 chars per token).
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
  const s = String(text || '');
  return s.length === 0 ? 0 : Math.ceil(s.length / 4);
}

/**
 * Tool schemas locked by `item_id` (Doc 01 Section 3 Elo 2).
 */
const AGENT_TOOL_DEFINITIONS = Object.freeze([
  {
    name: 'get_item_spec',
    description:
      'Retorna a especificação exata (nome, tipo, preço em centavos, duração) de um item do catálogo pelo item_id.',
    parameters: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'ID canônico do item no catálogo.' },
      },
      required: ['item_id'],
    },
  },
  {
    name: 'check_available_slots',
    description:
      'Consulta horários livres para um serviço (item_type = SERVICE) em uma data YYYY-MM-DD do calendário oficial em tempo real (nunca use datas passadas).',
    parameters: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'ID do serviço no catálogo.' },
        date_str: {
          type: 'string',
          description:
            'Data desejada (YYYY-MM-DD ou expressão PT-BR), usando obrigatoriamente o ano e data da tabela de calendário oficial.',
        },
      },
      required: ['item_id', 'date_str'],
    },
  },
  {
    name: 'book_service',
    description:
      'Registra um agendamento no SQLite. Exige item_type SERVICE e data/horário futuro em America/Sao_Paulo. NUNCA chame no mesmo turno em que perguntar "Posso confirmar?" ou "Posso finalizar?"; envie confirmed=true SOMENTE após o cliente confirmar explicitamente em uma mensagem anterior.',
    parameters: {
      type: 'object',
      properties: {
        item_id: { type: 'string' },
        date_str: {
          type: 'string',
          description: 'Data no formato YYYY-MM-DD conforme a tabela oficial do calendário em tempo real.',
        },
        time_slot: { type: 'string', description: 'Horário futuro no formato HH:MM.' },
        client_name: { type: 'string' },
        confirmed: {
          type: 'boolean',
          description: 'Use true SOMENTE após o cliente confirmar explicitamente o resumo do agendamento.',
        },
        idempotency_key: { type: 'string' },
      },
      required: ['item_id', 'date_str', 'time_slot', 'client_name', 'confirmed'],
    },
  },
  {
    name: 'create_order',
    description:
      'Registra um pedido de produtos (item_type = PRODUCT) calculando o total no banco. NUNCA chame no mesmo turno em que perguntar "Posso confirmar?" ou "Posso finalizar?"; envie confirmed=true SOMENTE após o cliente confirmar explicitamente o resumo do pedido.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              item_id: { type: 'string' },
              qty: { type: 'integer' },
            },
            required: ['item_id', 'qty'],
          },
        },
        client_name: { type: 'string' },
        delivery_type: { type: 'string' },
        address: { type: 'string' },
        payment_method: { type: 'string' },
        confirmed: {
          type: 'boolean',
          description: 'Use true SOMENTE após o cliente confirmar explicitamente o resumo do pedido.',
        },
        idempotency_key: { type: 'string' },
      },
      required: ['items', 'client_name', 'confirmed'],
    },
  },
  {
    name: 'cancel_appointment',
    description: 'Cancela um agendamento existente pelo ID e libera o horário.',
    parameters: {
      type: 'object',
      properties: {
        appointment_id: { type: 'string' },
      },
      required: ['appointment_id'],
    },
  },
  {
    name: 'cancel_order',
    description: 'Cancela um pedido existente pelo ID.',
    parameters: {
      type: 'object',
      properties: {
        order_id: { type: 'string' },
      },
      required: ['order_id'],
    },
  },
  {
    name: 'list_customer_records',
    description: 'Lista os agendamentos e pedidos do cliente atual neste estabelecimento.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
]);

function buildPostCommitFallbackText(committedTransactions = []) {
  const hasOrder = committedTransactions.some((c) => c.type === 'order');
  const hasAppt = committedTransactions.some((c) => c.type === 'appointment');
  if (hasOrder && hasAppt) {
    return 'Perfeito! Sua solicitação foi confirmada com sucesso.';
  }
  if (hasOrder) {
    return 'Perfeito! Seu pedido foi confirmado com sucesso.';
  }
  return 'Perfeito! Seu agendamento foi confirmado com sucesso.';
}

/**
 * Conversational AI Turn Orchestrator:
 * - Verifies PromptPin on boot/context build
 * - Sanitizes inputs with InputGuard and normalizes PT-BR expressions
 * - Builds token-budgeted context from SQLite (`messages` + `customers.facts_json` + catalog)
 * - Runs bounded Function Calling loop (max 3 iterations) via LlmRouter
 * - Validates output via AtomicOutputGuard (Elo 3) before persistence/reply
 */
class AgentEngine {
  /**
   * @param {{
   *   dbManager: import('../storage/DatabaseManager').DatabaseManager,
   *   llmRouter?: LlmRouter,
   *   promptPin?: PromptPin,
   *   inputGuard?: InputGuard,
   *   outputGuard?: AtomicOutputGuard,
   *   regionalNormalizer?: RegionalNormalizer,
   *   catalogService?: CatalogService,
   *   bookingService?: BookingService,
   *   orderService?: OrderService,
   *   customerService?: CustomerService,
   *   partnerRepository?: PartnerRepository,
   *   conversationRepository?: ConversationRepository,
   *   appointmentRepository?: AppointmentRepository,
   *   orderRepository?: OrderRepository,
   *   maxContextTokens?: number,
   *   maxToolIterations?: number,
   *   tokenEstimator?: (text: string) => number
   * }} deps
   */
  constructor(deps = {}) {
    if (!deps.dbManager) {
      throw new Error('AgentEngine requires dbManager');
    }

    this.dbManager = deps.dbManager;
    this.partnerRepository =
      deps.partnerRepository || new PartnerRepository(deps.dbManager);
    this.conversationRepository =
      deps.conversationRepository || new ConversationRepository(deps.dbManager);
    this.appointmentRepository =
      deps.appointmentRepository || new AppointmentRepository(deps.dbManager);
    this.orderRepository =
      deps.orderRepository || new OrderRepository(deps.dbManager);

    this.nowFn = typeof deps.nowFn === 'function' ? deps.nowFn : null;
    this.catalogService =
      deps.catalogService || new CatalogService({ dbManager: deps.dbManager });
    this.bookingService =
      deps.bookingService ||
      new BookingService({
        dbManager: deps.dbManager,
        appointmentRepository: this.appointmentRepository,
        partnerRepository: this.partnerRepository,
        nowFn: this.nowFn,
      });
    this.orderService =
      deps.orderService ||
      new OrderService({
        dbManager: deps.dbManager,
        orderRepository: this.orderRepository,
      });
    this.customerService =
      deps.customerService || new CustomerService({ dbManager: deps.dbManager });

    this.promptPin = deps.promptPin || new PromptPin();
    this.inputGuard = deps.inputGuard || new InputGuard();
    this.outputGuard = deps.outputGuard || new AtomicOutputGuard();
    this.regionalNormalizer = deps.regionalNormalizer || new RegionalNormalizer();
    this.llmRouter = deps.llmRouter || new LlmRouter();

    this.maxContextTokens = Number.isInteger(deps.maxContextTokens)
      ? deps.maxContextTokens
      : DEFAULT_MAX_CONTEXT_TOKENS;
    this.maxToolIterations = Math.min(
      MAX_TOOL_ITERATIONS,
      Number.isInteger(deps.maxToolIterations)
        ? deps.maxToolIterations
        : MAX_TOOL_ITERATIONS
    );
    this.tokenEstimator = deps.tokenEstimator || estimateTokens;
  }

  /**
   * Returns canonical Function Calling tool definitions.
   */
  getToolDefinitions() {
    return AGENT_TOOL_DEFINITIONS;
  }

  /**
   * Builds system prompt and token-budgeted conversation history from SQLite.
   * @param {{ partnerId: string, customerId?: string | null, conversationId: string, currentUserMessage: string, historyLimit?: number }} params
   */
  buildContext({
    partnerId,
    customerId = null,
    conversationId,
    currentUserMessage,
    historyLimit = 50,
  }) {
    const basePrompt = this.promptPin.getBasePrompt();
    const partner = this.partnerRepository.findById(partnerId);
    const catalogItems = this.catalogService.listItems(partnerId);
    const offeringSummary = analyzeCatalogOfferings(catalogItems);
    const customer = customerId
      ? this.customerService.findByExternal
        ? this.customerService.getCustomer(partnerId, customerId)
        : null
      : null;

    const catalogBlock =
      catalogItems.length > 0
        ? catalogItems.map((it) => CatalogService.formatContextLine(it)).join('\n')
        : '(Nenhum item ativo cadastrado no catálogo)';

    const offeringDirective = (() => {
      if (offeringSummary.mode === 'HYBRID') {
        return `[OFERTA: HÍBRIDO (${offeringSummary.servicesCount} serviço(s), ${offeringSummary.productsCount} produto(s))] SERVICE->book_service; PRODUCT->create_order; se pedir ambos juntos, confirme UM POR VEZ; 2ª msg->"${HYBRID_OFFERING_NOTICE}"`;
      }
      if (offeringSummary.mode === 'SERVICES_ONLY') {
        return `[OFERTA: SOMENTE SERVIÇOS (${offeringSummary.servicesCount})] Nunca use create_order.`;
      }
      if (offeringSummary.mode === 'PRODUCTS_ONLY') {
        return `[OFERTA: SOMENTE PRODUTOS (${offeringSummary.productsCount})] Nunca use check_available_slots/book_service.`;
      }
      return '[OFERTA: VAZIO] Não invente itens ou preços.';
    })();

    const pdfBlock =
      Array.isArray(partner?.pdf_files) && partner.pdf_files.length > 0
        ? `[MATERIAIS EM PDF]\n${partner.pdf_files
            .map((p, idx) => {
              const name = p?.name || p?.filename || `documento_${idx + 1}.pdf`;
              const excerpt = p?.text || p?.content || p?.excerpt || '';
              return excerpt
                ? `- ${name}: ${String(excerpt).slice(0, 600)}`
                : `- ${name}`;
            })
            .join('\n')}`
        : '';

    const imageBlock =
      Array.isArray(partner?.image_files) && partner.image_files.length > 0
        ? `[IMAGENS DO ESTABELECIMENTO]\n${partner.image_files
            .map((img, idx) => {
              const name = img?.name || img?.filename || `imagem_${idx + 1}`;
              const desc = img?.description ? ` — ${img.description}` : '';
              return `- ${name}${desc}`;
            })
            .join('\n')}`
        : '';

    const calendar = buildRollingCalendarSP(this.nowFn ? this.nowFn() : new Date());
    const calendarBlock = [
      `[CALENDÁRIO OFICIAL EM TEMPO REAL — ${TZ}] ${calendar.now.timeSlot}`,
      calendar.days.map((d) => d.label).join(' | '),
      'Use só ano e datas ISO acima.',
    ].join('\n');

    const partnerSections = [
      basePrompt,
      calendarBlock,
      partner
        ? `\n[ESTABELECIMENTO]\nNome: ${partner.display_name}${partner.store_segment ? ` (${partner.store_segment})` : ''}`
        : '',
      partner?.personality_prompt
        ? `[PERSONALIDADE SOBERANA DO PARCEIRO]\n${partner.personality_prompt}`
        : '',
      partner?.business_rules
        ? `[REGRAS DO NEGÓCIO]\n${partner.business_rules}`
        : '',
      partner?.working_hours
        ? `[HORÁRIO DE FUNCIONAMENTO]\n${JSON.stringify(partner.working_hours)}`
        : '',
      partner?.policies
        ? `[POLÍTICAS]\n${JSON.stringify(partner.policies)}`
        : '',
      pdfBlock,
      imageBlock,
      `[CATÁLOGO OFICIAL]\n${catalogBlock}`,
      customer && customer.facts && Object.keys(customer.facts).length > 0
        ? `[FATOS DO CLIENTE]\n${JSON.stringify(customer.facts)}`
        : '',
      offeringDirective,
    ]
      .filter(Boolean)
      .join('\n\n');

    let systemPrompt = partnerSections;
    const rawHistory = this.conversationRepository.getRecentMessages(
      conversationId,
      historyLimit
    );
    const assistantTurnCount = rawHistory.filter(
      (m) => m.direction === 'OUTBOUND' || m.role === 'assistant'
    ).length;

    const userMsgTokens = this.tokenEstimator(currentUserMessage);
    let systemTokens = this.tokenEstimator(systemPrompt);

    // Reserve budget for current user message; trim system prompt only if absurdly large
    const maxSystemTokens = Math.max(0, this.maxContextTokens - userMsgTokens);
    if (systemTokens > maxSystemTokens && maxSystemTokens > 0) {
      systemPrompt = systemPrompt.slice(0, maxSystemTokens * 4);
      systemTokens = this.tokenEstimator(systemPrompt);
    }

    const availableHistoryTokens = Math.max(
      0,
      this.maxContextTokens - systemTokens - userMsgTokens
    );

    // Pack most recent history messages backwards without exceeding token budget
    const packedReverse = [];
    let usedHistoryTokens = 0;

    for (let i = rawHistory.length - 1; i >= 0; i -= 1) {
      const msg = rawHistory[i];
      const msgContent = String(msg.content || '');
      const msgTokens = this.tokenEstimator(msgContent);
      if (usedHistoryTokens + msgTokens > availableHistoryTokens) {
        break;
      }
      packedReverse.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msgContent,
      });
      usedHistoryTokens += msgTokens;
    }

    const historyMessages = packedReverse.reverse();

    return {
      systemPrompt,
      historyMessages,
      catalogItems,
      offeringSummary,
      assistantTurnCount,
      partner,
      customer,
      tokensEstimated: systemTokens + usedHistoryTokens + userMsgTokens,
    };
  }

  /**
   * Executes a single locked domain tool call scoped strictly to `partnerId`.
   * @private
   */
  async _executeTool(toolCall, context) {
    const name = toolCall.name;
    const args = toolCall.arguments || {};
    const { partnerId, customerId, customerPhone, defaultClientName } = context;

    try {
      switch (name) {
        case 'get_item_spec': {
          const item = this.catalogService.getItemSpec(partnerId, args.item_id);
          return { ok: true, item, price_cents: item.price_cents };
        }
        case 'check_available_slots': {
          const item = this.catalogService.getItemSpec(partnerId, args.item_id);
          if (item.item_type !== 'SERVICE') {
            this.partnerRepository.recordAudit({
              partnerId,
              eventType: 'WRONG_FLOW_INTERCEPTED',
              severity: 'WARN',
              message: `Attempted check_available_slots on ${item.item_type} (${item.id})`,
              metadata: { tool: name, itemId: item.id, itemType: item.item_type },
            });
            return {
              ok: false,
              code: 'WRONG_FLOW_USE_CREATE_ORDER',
              expectedFlow: 'order',
              actualItemType: item.item_type,
              itemName: item.name,
              error: `FLUXO INCORRETO: "${item.name}" é um PRODUCT, não um SERVICE. Use create_order em vez de consultar horários.`,
            };
          }
          return this.bookingService.checkAvailableSlots({
            partnerId,
            itemId: args.item_id,
            dateStr: args.date_str,
          });
        }
        case 'book_service': {
          const item = this.catalogService.getItemSpec(partnerId, args.item_id);
          if (item.item_type !== 'SERVICE') {
            this.partnerRepository.recordAudit({
              partnerId,
              eventType: 'WRONG_FLOW_INTERCEPTED',
              severity: 'WARN',
              message: `Attempted book_service on ${item.item_type} (${item.id})`,
              metadata: { tool: name, itemId: item.id, itemType: item.item_type },
            });
            return {
              ok: false,
              code: 'WRONG_FLOW_USE_CREATE_ORDER',
              expectedFlow: 'order',
              actualItemType: item.item_type,
              itemName: item.name,
              error: `FLUXO INCORRETO: "${item.name}" é um PRODUCT. É proibido agendar produto em book_service; use create_order.`,
            };
          }
          const res = this.bookingService.bookService({
            partnerId,
            itemId: args.item_id,
            dateStr: args.date_str,
            timeSlot: args.time_slot,
            clientName: args.client_name || defaultClientName,
            customerPhone,
            customerId,
            confirmed: args.confirmed,
            idempotencyKey: args.idempotency_key || null,
          });
          return { ...res, committed: true };
        }
        case 'create_order': {
          const orderItems = Array.isArray(args.items) ? args.items : [];
          for (const entry of orderItems) {
            const targetId = entry?.item_id ?? entry?.itemId ?? entry?.catalog_item_id;
            if (!targetId) continue;
            const item = this.catalogService.getItemSpec(partnerId, targetId);
            if (item.item_type !== 'PRODUCT') {
              this.partnerRepository.recordAudit({
                partnerId,
                eventType: 'WRONG_FLOW_INTERCEPTED',
                severity: 'WARN',
                message: `Attempted create_order on ${item.item_type} (${item.id})`,
                metadata: { tool: name, itemId: item.id, itemType: item.item_type },
              });
              return {
                ok: false,
                code: 'WRONG_FLOW_USE_BOOK_SERVICE',
                expectedFlow: 'booking',
                actualItemType: item.item_type,
                itemName: item.name,
                error: `FLUXO INCORRETO: "${item.name}" é um SERVICE. É proibido registrar serviço em create_order; use check_available_slots e book_service.`,
              };
            }
          }
          const res = this.orderService.createOrder({
            partnerId,
            items: args.items,
            clientName: args.client_name || defaultClientName,
            customerPhone,
            customerId,
            deliveryType: args.delivery_type || null,
            address: args.address || null,
            paymentMethod: args.payment_method || null,
            confirmed: args.confirmed,
            idempotencyKey: args.idempotency_key || null,
          });
          return { ...res, committed: true };
        }
        case 'cancel_appointment': {
          return this.bookingService.cancelAppointment({
            partnerId,
            appointmentId: args.appointment_id,
          });
        }
        case 'cancel_order': {
          return this.orderService.cancelOrder({
            partnerId,
            orderId: args.order_id,
          });
        }
        case 'list_customer_records': {
          if (!customerId) {
            return { ok: true, appointments: [], orders: [] };
          }
          const appointments = this.appointmentRepository.listByCustomer(
            customerId,
            { partnerId, limit: 20 }
          );
          const orders = this.orderRepository.listByCustomer(customerId, {
            partnerId,
            limit: 20,
          });
          return { ok: true, appointments, orders };
        }
        default:
          return {
            ok: false,
            error: `UNKNOWN_TOOL: ${name}`,
          };
      }
    } catch (err) {
      return {
        ok: false,
        code: err?.code || 'TOOL_ERROR',
        error: err?.message || 'Tool execution failed',
      };
    }
  }

  /**
   * Runs one full conversational turn: InputGuard -> Persist INBOUND -> ContextBuilder ->
   * Function Calling Loop (max 3) -> AtomicOutputGuard (Elo 3) -> Persist OUTBOUND.
   * @param {{
   *   partnerId: string,
   *   conversationId: string,
   *   customerId?: string | null,
   *   customerPhone?: string | null,
   *   clientName?: string | null,
   *   message: string,
   *   blockHighRiskInjection?: boolean,
   *   signal?: AbortSignal
   * }} params
   */
  async processTurn(params = {}) {
    const {
      partnerId,
      conversationId,
      customerId = null,
      customerPhone = null,
      clientName = null,
      message,
      blockHighRiskInjection = true,
      signal,
    } = params;

    if (!partnerId || !conversationId) {
      throw new Error('AgentEngine.processTurn requires partnerId and conversationId');
    }

    // 1. InputGuard
    const inspection = this.inputGuard.inspect(message, {
      blockHighRisk: blockHighRiskInjection,
    });
    if (inspection.blocked) {
      this.partnerRepository.recordAudit({
        partnerId,
        eventType: 'PROMPT_INJECTION_BLOCKED',
        severity: 'WARN',
        message: 'High-risk prompt injection attempt blocked by InputGuard',
        metadata: { conversationId, matches: inspection.risk.matches },
      });
      return {
        ok: false,
        blocked: true,
        reason: 'PROMPT_INJECTION_BLOCKED',
        text: 'Desculpe, não consegui compreender sua solicitação. Como posso ajudar com nossos serviços ou produtos?',
        toolResults: [],
        committedTransactions: [],
      };
    }

    // 2. Build context BEFORE appending current inbound message so history avoids duplicating current turn
    const normalized = this.regionalNormalizer.normalize(inspection.sanitized);
    const context = this.buildContext({
      partnerId,
      customerId,
      conversationId,
      currentUserMessage: inspection.sanitized,
    });

    // 3. Persist INBOUND message in SQLite
    this.conversationRepository.addMessage({
      conversationId,
      partnerId,
      direction: 'INBOUND',
      role: 'user',
      content: inspection.sanitized,
      metadata:
        normalized.regionalHits.length > 0
          ? { regionalHits: normalized.regionalHits }
          : {},
    });

    const userTurnContent =
      normalized.text && normalized.text !== inspection.sanitized
        ? `${inspection.sanitized}\n[Normalizado PT-BR: ${normalized.text}]`
        : inspection.sanitized;

    const loopMessages = [
      ...context.historyMessages,
      { role: 'user', content: userTurnContent },
    ];

    // 4. Function Calling loop (strictly capped at MAX_TOOL_ITERATIONS = 3)
    const toolResults = [];
    const committedTransactions = [];
    const seenCallSignatures = new Map();
    let turnCommittedFlow = null; // 'booking' | 'order' — enforces 1 flow commit per turn
    let candidateText = '';
    let providerUsed = null;
    let model = null;

    for (let iter = 0; iter < this.maxToolIterations; iter += 1) {
      const llmRes = await this.llmRouter.generate({
        systemPrompt: context.systemPrompt,
        messages: loopMessages,
        tools: AGENT_TOOL_DEFINITIONS,
        signal,
      });

      providerUsed = llmRes.providerUsed;
      model = llmRes.model;

      const toolCalls = Array.isArray(llmRes.toolCalls) ? llmRes.toolCalls : [];
      const isLlmFallback = llmRes.ok === false || llmRes.status === 'LOCAL_FALLBACK';
      if (toolCalls.length === 0) {
        if (committedTransactions.length > 0 && (isLlmFallback || !String(llmRes.text || '').trim())) {
          candidateText = buildPostCommitFallbackText(committedTransactions);
        } else {
          candidateText = llmRes.text || '';
        }
        break;
      }

      loopMessages.push({
        role: 'assistant',
        content: llmRes.text || '',
        toolCalls,
        rawParts: llmRes.rawParts || null,
      });

      const hasBookInBatch = toolCalls.some((tc) => tc.name === 'book_service');
      const hasOrderInBatch = toolCalls.some((tc) => tc.name === 'create_order');
      const batchMixesCommitFlows = hasBookInBatch && hasOrderInBatch;

      let loopAborted = false;
      for (const tc of toolCalls) {
        const sig = `${tc.name}:${JSON.stringify(tc.arguments || {})}`;
        const prevCount = seenCallSignatures.get(sig) || 0;
        if (prevCount >= 2) {
          loopAborted = true;
          break;
        }
        seenCallSignatures.set(sig, prevCount + 1);

        let result;
        const isCommitTool = tc.name === 'book_service' || tc.name === 'create_order';
        const tcFlow = tc.name === 'book_service' ? 'booking' : tc.name === 'create_order' ? 'order' : null;
        if (
          isCommitTool &&
          (batchMixesCommitFlows || (turnCommittedFlow && turnCommittedFlow !== tcFlow))
        ) {
          this.partnerRepository.recordAudit({
            partnerId,
            eventType: 'MIXED_FLOW_INTERCEPTED',
            severity: 'WARN',
            message: `Blocked simultaneous booking + order in same turn (${tc.name})`,
            metadata: { conversationId, tool: tc.name, turnCommittedFlow, batchMixesCommitFlows },
          });
          result = {
            ok: false,
            code: 'MIXED_COMMIT_BLOCKED',
            error:
              'TRAVA DE SEGURANÇA (UM POR VEZ): Não é permitido confirmar serviço e produto no mesmo turno. Peça educadamente para o cliente confirmar um por vez (primeiro o serviço ou primeiro o produto).',
          };
        } else {
          result = await this._executeTool(tc, {
            partnerId,
            customerId,
            customerPhone,
            defaultClientName: clientName || context.customer?.name || 'Cliente',
          });
        }

        toolResults.push({ toolName: tc.name, arguments: tc.arguments, result });

        if (result && result.ok && result.committed) {
          if (tc.name === 'book_service' && result.appointment) {
            turnCommittedFlow = 'booking';
            committedTransactions.push({
              type: 'appointment',
              toolName: tc.name,
              record: result.appointment,
            });
          } else if (tc.name === 'create_order' && result.order) {
            turnCommittedFlow = 'order';
            committedTransactions.push({
              type: 'order',
              toolName: tc.name,
              record: result.order,
            });
          }
        }

        loopMessages.push({
          role: 'tool',
          toolCallId: tc.id,
          name: tc.name,
          content: JSON.stringify(result),
        });
      }

      if (loopAborted) {
        candidateText =
          committedTransactions.length > 0
            ? buildPostCommitFallbackText(committedTransactions)
            : llmRes.text ||
              'Preciso confirmar mais detalhes com você antes de prosseguir.';
        break;
      }

      // If this was the last allowed tool iteration, request one final textual synthesis without tools
      if (iter === this.maxToolIterations - 1) {
        const finalRes = await this.llmRouter.generate({
          systemPrompt: context.systemPrompt,
          messages: loopMessages,
          tools: [],
          signal,
        });
        providerUsed = finalRes.providerUsed;
        model = finalRes.model;
        const isFinalFallback = finalRes.ok === false || finalRes.status === 'LOCAL_FALLBACK';
        if (
          committedTransactions.length > 0 &&
          (isFinalFallback || !String(finalRes.text || '').trim())
        ) {
          candidateText = buildPostCommitFallbackText(committedTransactions);
        } else {
          candidateText = finalRes.text || '';
        }
      }
    }

    // 5. Elo 3 — AtomicOutputGuard (< 2ms)
    const guard = this.outputGuard.validate({
      text: candidateText,
      catalogItems: context.catalogItems,
      toolResults,
      committedTransactions,
    });

    if (guard.blocked) {
      this.partnerRepository.recordAudit({
        partnerId,
        eventType: 'SYSTEM_GUARD_TRIGGERED',
        severity: 'WARN',
        message: `AtomicOutputGuard blocked output: ${guard.reason}`,
        metadata: {
          conversationId,
          reason: guard.reason,
          originalText: guard.originalText,
        },
      });

      return {
        ok: false,
        blocked: true,
        reason: guard.reason,
        text: guard.text,
        guard,
        toolResults,
        committedTransactions,
        providerUsed,
        model,
        tokensEstimated: context.tokensEstimated,
      };
    }

    let finalReplyText = guard.text;
    const isSecondAssistantReply = context.assistantTurnCount === 1;
    if (
      context.offeringSummary?.isHybrid &&
      isSecondAssistantReply &&
      !/oferecemos.*produtos.*servi[cç]os|oferecemos.*servi[cç]os.*produtos/i.test(
        finalReplyText
      )
    ) {
      finalReplyText = finalReplyText
        ? `${finalReplyText}\n\n${HYBRID_OFFERING_NOTICE}`
        : HYBRID_OFFERING_NOTICE;
    }

    // 6. Persist OUTBOUND assistant message in SQLite
    this.conversationRepository.addMessage({
      conversationId,
      partnerId,
      direction: 'OUTBOUND',
      role: 'assistant',
      content: finalReplyText,
      metadata: {
        providerUsed,
        model,
        committedCount: committedTransactions.length,
        offeringMode: context.offeringSummary?.mode || 'EMPTY',
      },
    });

    return {
      ok: true,
      blocked: false,
      reason: null,
      text: finalReplyText,
      receipts: guard.receipts,
      guard,
      toolResults,
      committedTransactions,
      offeringSummary: context.offeringSummary,
      providerUsed,
      model,
      tokensEstimated: context.tokensEstimated,
    };
  }
}

AgentEngine.analyzeCatalogOfferings = analyzeCatalogOfferings;
AgentEngine.HYBRID_OFFERING_NOTICE = HYBRID_OFFERING_NOTICE;

module.exports = {
  AgentEngine,
  AGENT_TOOL_DEFINITIONS,
  DEFAULT_MAX_CONTEXT_TOKENS,
  HYBRID_OFFERING_NOTICE,
  analyzeCatalogOfferings,
  estimateTokens,
};
