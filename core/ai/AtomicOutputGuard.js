'use strict';

const { formatFriendly, formatPriceCents } = require('../domain/RegionalNormalizer');

const QUESTION_CLAUSE_RE =
  /\b(posso|quer|deseja|gostaria|vamos|pode)\s+confirmar\b[^.!\n]*\??/gi;

const BOOKING_CONFIRM_CLAIM_RES = [
  /\b(agendamento|hor[aá]rio|reserva|atendimento)\s+(?:j[aá]\s+)?(?:foi\s+|est[aá]\s+)?(confirmad[oa]|agendad[oa]|marcad[oa]|anotad[oa]|registrad[oa]|conclu[ií]d[oa])\b/i,
  /\b(?:acabei\s+de\s+|j[aá]\s+)?(?:agendei|marquei|confirmei|registrei)\s+(?:o\s+seu|seu|sua|a\s+sua|o|a)\s+(?:hor[aá]rio|agendamento|consulta|atendimento|servi[cç]o)\b/i,
  /\b(?:est[aá]|ficou)\s+(?:tudo\s+)?(agendad[oa]|marcad[oa])\b/i,
];

const ORDER_CONFIRM_CLAIM_RES = [
  /\b(pedido|compra|encomenda)\s+(?:j[aá]\s+)?(?:foi\s+|est[aá]\s+)?(confirmad[oa]|anotad[oa]|registrad[oa]|conclu[ií]d[oa]|fechad[oa]|realizad[oa])\b/i,
  /\b(?:acabei\s+de\s+|j[aá]\s+)?(?:confirmei|anotei|registrei|fechei)\s+(?:o\s+seu|seu|sua|o)\s+(?:pedido|compra|encomenda)\b/i,
];

const GENERIC_CONFIRM_CLAIM_RES = [
  /^\s*(?:agendamento|pedido|reserva|hor[aá]rio)?\s*confirmad[oa]\s*[!.]/i,
  /\bconfirmad[oa]\s*(?:com\s+sucesso|para\s+(?:o\s+dia|amanh[aã]|hoje|\d)|no\s+dia|às|!)/i,
  /\b(?:est[aá]|ficou)\s+confirmad[oa]\b/i,
];

/**
 * Parses Brazilian currency mentions (`R$ 50,00`, `R$ 1.250,50`, `R$ 10`) into integer cents.
 * @param {string} text
 * @returns {Array<{ raw: string, cents: number }>}
 */
function extractBrlMentions(text) {
  const results = [];
  const re = /R\$\s*(\d+(?:[.,]\d{1,3})*(?:[.,]\d{1,2})?)/gi;
  let match;

  while ((match = re.exec(String(text || ''))) !== null) {
    const rawNum = match[1];
    let cents = null;

    if (rawNum.includes(',')) {
      const cleaned = rawNum.replace(/\./g, '');
      const [wholeStr, decStr = ''] = cleaned.split(',');
      const whole = parseInt(wholeStr, 10);
      const dec = parseInt(decStr.padEnd(2, '0').slice(0, 2), 10);
      if (!Number.isNaN(whole) && !Number.isNaN(dec)) {
        cents = whole * 100 + dec;
      }
    } else if (rawNum.includes('.')) {
      const parts = rawNum.split('.');
      const last = parts[parts.length - 1];
      if (last.length <= 2) {
        const whole = parseInt(parts.slice(0, -1).join(''), 10);
        const dec = parseInt(last.padEnd(2, '0'), 10);
        if (!Number.isNaN(whole) && !Number.isNaN(dec)) {
          cents = whole * 100 + dec;
        }
      } else {
        const whole = parseInt(parts.join(''), 10);
        if (!Number.isNaN(whole)) {
          cents = whole * 100;
        }
      }
    } else {
      const whole = parseInt(rawNum, 10);
      if (!Number.isNaN(whole)) {
        cents = whole * 100;
      }
    }

    if (cents !== null) {
      results.push({ raw: match[0], cents });
    }
  }

  return results;
}

/**
 * Collects all authoritative prices (in integer cents) from catalog items and executed tool results.
 * @param {Array<Record<string, any>>} catalogItems
 * @param {Array<Record<string, any>>} toolResults
 * @returns {Set<number>}
 */
function collectAllowedCents(catalogItems = [], toolResults = []) {
  const allowed = new Set();

  for (const item of catalogItems) {
    if (item && Number.isInteger(Number(item.price_cents))) {
      allowed.add(Number(item.price_cents));
    }
  }

  for (const tr of toolResults) {
    const res = tr?.result;
    if (!res || typeof res !== 'object') continue;
    const candidates = [
      res.price_cents,
      res.price_cents_snapshot,
      res.total_cents,
      res.appointment?.price_cents_snapshot,
      res.order?.total_cents,
      res.item?.price_cents,
    ];
    for (const c of candidates) {
      if (c !== undefined && c !== null && Number.isInteger(Number(c))) {
        allowed.add(Number(c));
      }
    }
    const items = res.items || res.order?.items || [];
    if (Array.isArray(items)) {
      for (const it of items) {
        if (it?.price_cents !== undefined) allowed.add(Number(it.price_cents));
        if (it?.subtotal_cents !== undefined) allowed.add(Number(it.subtotal_cents));
      }
    }
  }

  return allowed;
}

/**
 * Detects whether text asserts a completed booking or order confirmation.
 * @param {string} text
 * @returns {{ claimed: boolean, kind: 'booking' | 'order' | 'generic' | null }}
 */
function detectConfirmationClaim(text) {
  const cleaned = String(text || '').replace(QUESTION_CLAUSE_RE, ' ');

  for (const re of BOOKING_CONFIRM_CLAIM_RES) {
    if (re.test(cleaned)) {
      return { claimed: true, kind: 'booking' };
    }
  }
  for (const re of ORDER_CONFIRM_CLAIM_RES) {
    if (re.test(cleaned)) {
      return { claimed: true, kind: 'order' };
    }
  }
  for (const re of GENERIC_CONFIRM_CLAIM_RES) {
    if (re.test(cleaned)) {
      return { claimed: true, kind: 'generic' };
    }
  }

  return { claimed: false, kind: null };
}

/**
 * Programmatically builds an immutable receipt block from a persisted SQLite record.
 * @param {{ type: 'appointment' | 'order', record: Record<string, any> }} commit
 * @returns {string}
 */
function formatDeterministicReceipt(commit) {
  if (!commit || !commit.record) return '';

  if (commit.type === 'appointment') {
    const a = commit.record;
    return [
      '[COMPROVANTE OFICIAL DE AGENDAMENTO]',
      `Código: ${a.id}`,
      `Cliente: ${a.client_name}`,
      `Serviço: ${a.item_name_snapshot}`,
      `Data/Hora: ${formatFriendly(a.date_str, a.time_slot)}`,
      `Duração: ${a.duration_minutes_snapshot} min`,
      `Valor: ${formatPriceCents(a.price_cents_snapshot)}`,
      `Status: ${a.status}`,
    ].join('\n');
  }

  if (commit.type === 'order') {
    const o = commit.record;
    const itemLines = (o.items || []).map(
      (it) =>
        `- ${it.qty}x ${it.name} (${formatPriceCents(it.price_cents)}) = ${formatPriceCents(it.subtotal_cents ?? it.price_cents * it.qty)}`
    );
    return [
      '[COMPROVANTE OFICIAL DE PEDIDO]',
      `Código: ${o.id}`,
      `Cliente: ${o.client_name}`,
      'Itens:',
      ...itemLines,
      `Total: ${formatPriceCents(o.total_cents)}`,
      `Status: ${o.status}`,
    ].join('\n');
  }

  return '';
}

/**
 * Elo 3 post-LLM guard (< 2ms):
 * 1. Blocks phantom booking/order confirmations without a persisted SQLite COMMIT.
 * 2. Intercepts hallucinated `R$` monetary values against authoritative SQLite prices.
 * 3. Appends an immutable deterministic receipt for every committed transaction.
 */
class AtomicOutputGuard {
  /**
   * @param {{
   *   phantomFallbackText?: string,
   *   priceFallbackText?: string
   * }} [options]
   */
  constructor(options = {}) {
    this.phantomFallbackText =
      options.phantomFallbackText ||
      'Ainda não concluí o registro no sistema. Para confirmar, por favor me confirme os dados finais para que eu finalize agora.';
    this.priceFallbackText =
      options.priceFallbackText ||
      'Não consegui validar o valor exato informado. Por favor, consulte novamente os valores oficiais do nosso catálogo.';
    this.wrongFlowFallbackText =
      options.wrongFlowFallbackText ||
      'Ops! Produtos seguem pelo fluxo de pedidos e serviços seguem pelo fluxo de agendamentos. Pode me confirmar qual item você deseja para eu seguir pelo caminho correto?';
    this.mixedFlowFallbackText =
      options.mixedFlowFallbackText ||
      'Para evitar qualquer erro, precisamos confirmar um por vez! Você prefere confirmar primeiro o agendamento do serviço ou o pedido do produto?';
  }

  /**
   * Validates LLM output text against authoritative catalog prices and turn commits.
   * @param {{
   *   text: string,
   *   catalogItems?: Array<Record<string, any>>,
   *   toolResults?: Array<Record<string, any>>,
   *   committedTransactions?: Array<{ type: 'appointment' | 'order', toolName: string, record: Record<string, any> }>
   * }} params
   */
  validate({
    text,
    catalogItems = [],
    toolResults = [],
    committedTransactions = [],
  }) {
    const startNs = process.hrtime.bigint();
    let rawText = String(text || '').trim();
    if (
      committedTransactions.length > 0 &&
      /(passando por uma r[aá]pida instabilidade|instabilidade na nossa intelig[eê]ncia)/i.test(
        rawText
      )
    ) {
      const hasOrder = committedTransactions.some((c) => c.type === 'order');
      const hasAppt = committedTransactions.some((c) => c.type === 'appointment');
      rawText =
        hasOrder && hasAppt
          ? 'Perfeito! Sua solicitação foi confirmada com sucesso.'
          : hasOrder
            ? 'Perfeito! Seu pedido foi confirmado com sucesso.'
            : 'Perfeito! Seu agendamento foi confirmado com sucesso.';
    }
    const receipts = committedTransactions
      .map((c) => formatDeterministicReceipt(c))
      .filter(Boolean);

    // 1. Cross-Flow & Mixed-Flow Lock (never book a PRODUCT, order a SERVICE, or mix both in 1 turn)
    const hasMixedFlowBlock = toolResults.some(
      (tr) => tr?.result?.code === 'MIXED_COMMIT_BLOCKED'
    );
    const hasBothCommitTypes =
      committedTransactions.some((c) => c.type === 'appointment') &&
      committedTransactions.some((c) => c.type === 'order');
    const claim = detectConfirmationClaim(rawText);

    if (
      hasBothCommitTypes ||
      (hasMixedFlowBlock && committedTransactions.length === 0 && claim.claimed)
    ) {
      const latencyMs = Number(process.hrtime.bigint() - startNs) / 1e6;
      return {
        ok: false,
        blocked: true,
        reason: 'MIXED_FLOW_BLOCKED',
        claimKind: claim.kind,
        text: this.mixedFlowFallbackText,
        originalText: rawText,
        receipts: [],
        mismatches: [],
        allowedCents: [],
        latencyMs,
      };
    }

    const unresolvedWrongFlow = toolResults.find(
      (tr) =>
        (tr?.result?.code === 'WRONG_FLOW_USE_CREATE_ORDER' ||
          tr?.result?.code === 'WRONG_FLOW_USE_BOOK_SERVICE') &&
        committedTransactions.length === 0
    );
    const hasServices = catalogItems.some(
      (it) => String(it?.item_type || it?.type || '').toUpperCase() === 'SERVICE'
    );
    const hasProducts = catalogItems.some(
      (it) => String(it?.item_type || it?.type || '').toUpperCase() === 'PRODUCT'
    );

    if (
      (unresolvedWrongFlow && claim.claimed) ||
      (unresolvedWrongFlow?.result?.code === 'WRONG_FLOW_USE_CREATE_ORDER' &&
        /\b(agendad[oa]|hor[aá]rio\s+marcad[oa]|agenda\s+confirmada)\b/i.test(rawText)) ||
      (unresolvedWrongFlow?.result?.code === 'WRONG_FLOW_USE_BOOK_SERVICE' &&
        /\b(pedido\s+anotad[oa]|pedido\s+confirmad[oa]|compra\s+confirmada)\b/i.test(rawText)) ||
      (!hasServices && hasProducts && claim.claimed && claim.kind === 'booking') ||
      (hasServices && !hasProducts && claim.claimed && claim.kind === 'order')
    ) {
      const latencyMs = Number(process.hrtime.bigint() - startNs) / 1e6;
      return {
        ok: false,
        blocked: true,
        reason: 'WRONG_FLOW_BLOCKED',
        claimKind: claim.kind,
        text: this.wrongFlowFallbackText,
        originalText: rawText,
        receipts: [],
        mismatches: [],
        allowedCents: [],
        latencyMs,
      };
    }

    // 2. Confirmation Lock (End of Phantom Confirmation Bug)
    if (claim.claimed) {
      const hasMatchingCommit =
        claim.kind === 'booking'
          ? committedTransactions.some((c) => c.type === 'appointment')
          : claim.kind === 'order'
            ? committedTransactions.some((c) => c.type === 'order')
            : committedTransactions.length > 0;

      if (!hasMatchingCommit) {
        const latencyMs = Number(process.hrtime.bigint() - startNs) / 1e6;
        return {
          ok: false,
          blocked: true,
          reason: 'PHANTOM_CONFIRMATION',
          claimKind: claim.kind,
          text: this.phantomFallbackText,
          originalText: rawText,
          receipts: [],
          latencyMs,
        };
      }
    }

    // 2. Price Lock (R$ extraction vs authoritative SQLite catalog/tool cents)
    const mentionedPrices = extractBrlMentions(rawText);
    const allowedCents = collectAllowedCents(catalogItems, toolResults);
    if (mentionedPrices.length > 0 && allowedCents.size > 0) {
      const mismatches = mentionedPrices.filter((m) => !allowedCents.has(m.cents));
      if (mismatches.length > 0) {
        const latencyMs = Number(process.hrtime.bigint() - startNs) / 1e6;
        return {
          ok: false,
          blocked: true,
          reason: 'PRICE_HALLUCINATION',
          mismatches,
          allowedCents: Array.from(allowedCents),
          text: this.priceFallbackText,
          originalText: rawText,
          receipts,
          latencyMs,
        };
      }
    }

    // 3. Deterministic Receipt Attachment
    let finalText = rawText;
    if (receipts.length > 0) {
      const receiptBlock = receipts.join('\n\n');
      finalText = finalText ? `${finalText}\n\n${receiptBlock}` : receiptBlock;
    }

    const latencyMs = Number(process.hrtime.bigint() - startNs) / 1e6;
    return {
      ok: true,
      blocked: false,
      reason: null,
      text: finalText,
      receipts,
      latencyMs,
    };
  }
}

AtomicOutputGuard.extractBrlMentions = extractBrlMentions;
AtomicOutputGuard.detectConfirmationClaim = detectConfirmationClaim;
AtomicOutputGuard.formatDeterministicReceipt = formatDeterministicReceipt;

module.exports = {
  AtomicOutputGuard,
  extractBrlMentions,
  detectConfirmationClaim,
  formatDeterministicReceipt,
};
