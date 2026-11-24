'use strict';

const { PartnerRepository } = require('../storage/repositories/PartnerRepository');
const { ConversationRepository } = require('../storage/repositories/ConversationRepository');
const { AppointmentRepository } = require('../storage/repositories/AppointmentRepository');
const { OrderRepository } = require('../storage/repositories/OrderRepository');
const { CatalogService } = require('../domain/CatalogService');
const { BookingService } = require('../domain/BookingService');
const { OrderService } = require('../domain/OrderService');
const { CustomerService } = require('../domain/CustomerService');
const { RegionalNormalizer } = require('../domain/RegionalNormalizer');
const { PromptPin } = require('./PromptPin');
const { InputGuard } = require('./InputGuard');
const { LlmRouter, MAX_TOOL_ITERATIONS } = require('./LlmRouter');
const { AtomicOutputGuard } = require('./AtomicOutputGuard');

const DEFAULT_MAX_CONTEXT_TOKENS = 4096;

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
      'Consulta horários livres para um serviço (item_type = SERVICE) em uma data YYYY-MM-DD.',
    parameters: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'ID do serviço no catálogo.' },
        date_str: { type: 'string', description: 'Data desejada (YYYY-MM-DD ou expressão PT-BR).' },
      },
      required: ['item_id', 'date_str'],
    },
  },
  {
    name: 'book_service',
    description:
      'Registra um agendamento no SQLite. Exige item_type SERVICE e confirmed=true após confirmação explícita do cliente.',
    parameters: {
      type: 'object',
      properties: {
        item_id: { type: 'string' },
        date_str: { type: 'string' },
        time_slot: { type: 'string' },
        client_name: { type: 'string' },
        confirmed: { type: 'boolean' },
        idempotency_key: { type: 'string' },
      },
      required: ['item_id', 'date_str', 'time_slot', 'client_name', 'confirmed'],
    },
  },
  {
    name: 'create_order',
    description:
      'Registra um pedido de produtos (item_type = PRODUCT) calculando o total no banco. Exige confirmed=true.',
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
        confirmed: { type: 'boolean' },
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

    this.catalogService =
      deps.catalogService || new CatalogService({ dbManager: deps.dbManager });
    this.bookingService =
      deps.bookingService ||
      new BookingService({
        dbManager: deps.dbManager,
        appointmentRepository: this.appointmentRepository,
        partnerRepository: this.partnerRepository,
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
    const customer = customerId
      ? this.customerService.findByExternal
        ? this.customerService.getCustomer(partnerId, customerId)
        : null
      : null;

    const catalogBlock =
      catalogItems.length > 0
        ? catalogItems.map((it) => CatalogService.formatContextLine(it)).join('\n')
        : '(Nenhum item ativo cadastrado no catálogo)';

    const partnerSections = [
      basePrompt,
      partner
        ? `\n[ESTABELECIMENTO]\nNome: ${partner.display_name}${partner.store_segment ? ` (${partner.store_segment})` : ''}`
        : '',
      partner?.personality_prompt
        ? `[PERSONALIDADE]\n${partner.personality_prompt}`
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
      `[CATÁLOGO OFICIAL]\n${catalogBlock}`,
      customer && customer.facts && Object.keys(customer.facts).length > 0
        ? `[FATOS DO CLIENTE]\n${JSON.stringify(customer.facts)}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    let systemPrompt = partnerSections;
    const rawHistory = this.conversationRepository.getRecentMessages(
      conversationId,
      historyLimit
    );

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
          return this.bookingService.checkAvailableSlots({
            partnerId,
            itemId: args.item_id,
            dateStr: args.date_str,
          });
        }
        case 'book_service': {
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
      if (toolCalls.length === 0) {
        candidateText = llmRes.text || '';
        break;
      }

      loopMessages.push({
        role: 'assistant',
        content: llmRes.text || '',
        toolCalls,
      });

      let loopAborted = false;
      for (const tc of toolCalls) {
        const sig = `${tc.name}:${JSON.stringify(tc.arguments || {})}`;
        const prevCount = seenCallSignatures.get(sig) || 0;
        if (prevCount >= 2) {
          loopAborted = true;
          break;
        }
        seenCallSignatures.set(sig, prevCount + 1);

        const result = await this._executeTool(tc, {
          partnerId,
          customerId,
          customerPhone,
          defaultClientName: clientName || context.customer?.name || 'Cliente',
        });

        toolResults.push({ toolName: tc.name, arguments: tc.arguments, result });

        if (result && result.ok && result.committed) {
          if (tc.name === 'book_service' && result.appointment) {
            committedTransactions.push({
              type: 'appointment',
              toolName: tc.name,
              record: result.appointment,
            });
          } else if (tc.name === 'create_order' && result.order) {
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
          llmRes.text ||
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
        candidateText = finalRes.text || '';
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

    // 6. Persist OUTBOUND assistant message in SQLite
    this.conversationRepository.addMessage({
      conversationId,
      partnerId,
      direction: 'OUTBOUND',
      role: 'assistant',
      content: guard.text,
      metadata: {
        providerUsed,
        model,
        committedCount: committedTransactions.length,
      },
    });

    return {
      ok: true,
      blocked: false,
      reason: null,
      text: guard.text,
      receipts: guard.receipts,
      guard,
      toolResults,
      committedTransactions,
      providerUsed,
      model,
      tokensEstimated: context.tokensEstimated,
    };
  }
}

module.exports = {
  AgentEngine,
  AGENT_TOOL_DEFINITIONS,
  DEFAULT_MAX_CONTEXT_TOKENS,
  estimateTokens,
};
