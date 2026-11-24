'use strict';

/**
 * ConversationsView (Miolo): Chats e controle de Soft-Pause / Intervenção Humana.
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

  render(conversations = []) {
    const mode = this.ctx.uiMode;
    const list = Array.isArray(conversations) ? conversations : [];
    const rows = list
      .map(
        (c) => `<tr>
          <td data-label="Chat">${c.external_chat_id || c.id}</td>
          <td data-label="Pausa IA">${Number(c.is_paused) === 1 ? 'PAUSADO' : 'ATIVO'}</td>
          ${mode === 'advanced' ? `<td data-label="Contexto">${(c.paused_context || []).length} msg(s)</td>` : ''}
        </tr>`
      )
      .join('\n');

    return [
      `<section data-view="conversations" data-ui-mode="${mode}">`,
      `  <div class="autonmax-card">`,
      `    <h2 style="font-family: var(--font-heading);">Conversas & Soft-Pause</h2>`,
      `  </div>`,
      `  <table class="autonmax-table">`,
      `    <thead><tr><th>Chat</th><th>Pausa IA</th>${mode === 'advanced' ? '<th>Contexto</th>' : ''}</tr></thead>`,
      `    <tbody>${rows}</tbody>`,
      `  </table>`,
      `</section>`,
    ].join('\n');
  }
}

module.exports = { ConversationsView };
