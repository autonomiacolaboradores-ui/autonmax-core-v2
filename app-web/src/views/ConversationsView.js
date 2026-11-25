'use strict';

const { icon } = require('../components/Icons');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * ConversationsView (Miolo): Controle de Atendimentos Ativos, histórico de mensagens,
 * Soft-Pause por conversa e resposta manual do operador.
 */
class ConversationsView {
  constructor(ctx) {
    this.ctx = ctx;
  }

  getControls() {
    const controls = ['list_conversations', 'toggle_soft_pause', 'send_operator_message'];
    if (this.ctx.uiMode === 'advanced') {
      controls.push('paused_context_viewer');
    }
    return controls;
  }

  async sendOperatorMessage({ conversationId, text }) {
    if (typeof this.ctx.outputActions?.sendOperatorMessage === 'function') {
      return this.ctx.outputActions.sendOperatorMessage({ conversationId, text });
    }
    return this.ctx.syncQueue.enqueue({
      type: 'conversation.operator_message',
      payload: { conversationId, text },
    });
  }

  render(data = []) {
    const mode = this.ctx.uiMode;
    const isArray = Array.isArray(data);
    const list = isArray ? data : Array.isArray(data.items) ? data.items : [];
    const selectedId = !isArray ? data.selectedConversationId || null : null;
    const messages = !isArray && Array.isArray(data.messages) ? data.messages : [];

    const cardsHtml = list.length
      ? list
          .map((c) => {
            const isPaused = Number(c.is_paused) === 1;
            const isSelected = Boolean(selectedId && String(selectedId) === String(c.id));
            const pillClass = isPaused ? 'status-indicator-pill paused' : 'status-indicator-pill active';
            const pillText = isPaused ? 'PAUSADO — HUMANO NO CONTROLE' : 'IA ATIVA';
            const chatLabel = escapeHtml(c.external_chat_id || c.id);
            const pausedCount = Array.isArray(c.paused_context) ? c.paused_context.length : 0;
            return `<div class="knowledge-card" style="display:flex;flex-direction:column;gap:10px;margin-bottom:0;">
                      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
                        <strong>${chatLabel}</strong>
                        <span class="${pillClass}"><span class="indicator-dot"></span><span>${pillText}</span></span>
                      </div>
                      ${mode === 'advanced' ? `<span style="color:var(--color-text-muted);font-size:0.85rem;">Contexto na pausa: ${pausedCount} msg(s)</span>` : ''}
                      <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <button type="button" class="exec-action-btn ${isSelected ? 'primary' : ''}" data-conv-select="${escapeHtml(c.id)}" aria-expanded="${isSelected ? 'true' : 'false'}">${icon(isSelected ? 'x' : 'message-square', { size: 15 })} <span>${isSelected ? 'Ocultar Mensagens' : 'Ver Mensagens'}</span></button>
                        <button type="button" class="exec-action-btn ${isPaused ? 'primary' : ''}" data-conv-toggle-pause="${escapeHtml(c.id)}" data-paused="${isPaused ? '1' : '0'}" data-chat-jid="${escapeHtml(c.external_chat_id || '')}">
                          ${icon(isPaused ? 'play' : 'pause', { size: 15 })} <span>${isPaused ? 'Retomar IA' : 'Assumir / Pausar IA'}</span>
                        </button>
                      </div>
                    </div>`;
          })
          .join('\n')
      : `<div class="autonmax-card" style="grid-column:1 / -1;text-align:center;color:var(--color-text-muted);">Nenhuma conversa ativa encontrada.</div>`;

    const historyHtml = selectedId
      ? `<div class="autonmax-card" style="margin-top:18px;" data-conv-history="${escapeHtml(selectedId)}">
           <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;">
             <h3 style="margin:0;font-family:var(--font-heading);">Histórico da Conversa</h3>
             <button type="button" class="exec-action-btn" data-conv-select="${escapeHtml(selectedId)}" aria-label="Ocultar Mensagens">${icon('x', { size: 15 })} <span>Ocultar Mensagens</span></button>
           </div>
           <div style="display:flex;flex-direction:column;gap:8px;max-height:300px;overflow-y:auto;margin-bottom:12px;">
             ${
               messages.length
                 ? messages
                     .map(
                       (m) => `<div style="padding:8px 12px;border-radius:10px;background:var(--surface-input);">
                                 <strong style="color:var(--color-primary);">${escapeHtml(m.role || m.direction || 'msg')}:</strong>
                                 <span> ${escapeHtml(m.content || '')}</span>
                               </div>`
                     )
                     .join('\n')
                 : '<span style="color:var(--color-text-muted);">Sem mensagens registradas.</span>'
             }
           </div>
           <form data-operator-form="${escapeHtml(selectedId)}" style="display:flex;gap:8px;flex-wrap:wrap;">
             <input type="text" name="text" class="dark-input" style="flex:1;" placeholder="Digite uma resposta manual do operador..." required />
             <button type="submit" class="exec-action-btn primary glow-neon">${icon('send', { size: 16 })} <span>Enviar</span></button>
           </form>
         </div>`
      : '';

    return [
      `<section data-view="conversations" data-ui-mode="${mode}">`,
      `  <div class="attendant-header-banner">`,
      `    <h2 style="margin:0 0 4px;font-family:var(--font-heading);">Controle de Atendimentos</h2>`,
      `    <p style="margin:0;color:var(--color-text-muted);">Monitore conversas no WhatsApp, assuma o atendimento com Soft-Pause ou retome a IA.</p>`,
      `  </div>`,
      `  <div class="catalog-cards-grid">${cardsHtml}</div>`,
      historyHtml,
      `</section>`,
    ]
      .filter(Boolean)
      .join('\n');
  }
}

module.exports = { ConversationsView };
