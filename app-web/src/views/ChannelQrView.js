'use strict';

/**
 * ChannelQrView (Miolo): Pareamento WhatsApp QR Code com degradação elegante offline.
 */
class ChannelQrView {
  constructor(ctx) {
    this.ctx = ctx;
  }

  getControls() {
    const isOnline = this.ctx.ports.network.isOnline();
    const controls = isOnline ? ['connect_session', 'refresh_qr', 'disconnect_session'] : ['offline_notice'];
    if (this.ctx.uiMode === 'advanced' && isOnline) {
      controls.push('multi_line_diagnostics');
    }
    return controls;
  }

  render(session = {}) {
    const mode = this.ctx.uiMode;
    const online = this.ctx.ports.network.isOnline();
    const disabledAttr = online ? '' : 'disabled aria-disabled="true"';

    const qrBlock = !online
      ? `<p style="color: var(--color-warning);">Pareamento QR exige internet ativa.</p>`
      : session.qrCodeBase64
        ? `<img alt="WhatsApp QR Code" src="${session.qrCodeBase64}" />`
        : `<p style="color: var(--color-text-muted);">Status da sessão: ${session.status || 'DISCONNECTED'}</p>`;

    return [
      `<section data-view="channel" data-ui-mode="${mode}">`,
      `  <div class="autonmax-card">`,
      `    <h2 style="font-family: var(--font-heading);">Pareamento WhatsApp</h2>`,
      qrBlock,
      `    <button type="button" class="autonmax-btn" data-action="connect-whatsapp" ${disabledAttr}>Conectar Linha</button>`,
      `  </div>`,
      `</section>`,
    ].join('\n');
  }
}

module.exports = { ChannelQrView };
