'use strict';

const { icon } = require('./Icons');

/**
 * WhatsApp QR Code connection modal (`#waModal` equivalent) with Skeleton Shimmer.
 */
class WhatsAppQrModal {
  /**
   * @param {{
   *   open?: boolean,
   *   status?: string,
   *   qrCodeBase64?: string | null,
   *   phoneNumber?: string | null,
   *   sessionKey?: string | null
   * }} [state]
   * @returns {string}
   */
  render(state = {}) {
    if (!state.open) return '';

    const status = String(state.status || 'DISCONNECTED').toUpperCase();
    const isConnected = status === 'CONNECTED';
    const isStandby = status === 'STANDBY';

    let qrBoxInner;
    if (isConnected) {
      qrBoxInner = [
        `<div style="display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--color-qr-fg);">`,
        `  ${icon('check-circle', { size: 48 })}`,
        `  <strong>WhatsApp Conectado</strong>`,
        state.phoneNumber ? `<span>${state.phoneNumber}</span>` : '',
        `</div>`,
      ].join('');
    } else if (state.qrCodeBase64) {
      qrBoxInner = `<img src="${state.qrCodeBase64}" alt="WhatsApp QR Code" class="qr-image" data-wa-qr-img="true" />`;
    } else if (isStandby) {
      qrBoxInner = [
        `<div style="display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--color-qr-fg);">`,
        `  ${icon('alert-triangle', { size: 36 })}`,
        `  <strong>Sessão em Standby</strong>`,
        `  <span style="font-size: 0.8rem;">Clique em Gerar Novo QR</span>`,
        `</div>`,
      ].join('');
    } else {
      qrBoxInner = `<div class="qr-skeleton" data-qr-skeleton="true" aria-label="Gerando QR Code..."></div>`;
    }

    const pillClass = isConnected ? 'status-indicator-pill active' : 'status-indicator-pill paused';

    return [
      `<div class="modal-backdrop" data-wa-modal="true" role="dialog" aria-modal="true" aria-label="Conectar WhatsApp do Parceiro">`,
      `  <div class="modal-card glass-cyber">`,
      `    <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 8px;">`,
      `      <span class="cyber-accent">${icon('qr-code', { size: 22 })}</span>`,
      `      <h3 style="margin: 0; font-family: var(--font-heading);">Conectar WhatsApp do Parceiro</h3>`,
      `    </div>`,
      `    <div style="margin-bottom: 10px;">`,
      `      <span class="${pillClass}" data-wa-modal-status="${status}">`,
      `        <span class="indicator-dot"></span>`,
      `        <span>${status}</span>`,
      `      </span>`,
      `    </div>`,
      `    <div class="qr-placeholder">${qrBoxInner}</div>`,
      `    <div style="display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 14px;">`,
      `      <button type="button" class="exec-action-btn" data-wa-action="close">Concluído</button>`,
      `      <button type="button" class="exec-action-btn primary glow-neon" data-wa-action="force-qr">${icon('refresh-cw', { size: 16 })} <span>Gerar Novo QR</span></button>`,
      `      <button type="button" class="logout-btn" data-wa-action="disconnect">${icon('log-out', { size: 16 })} <span>Desconectar</span></button>`,
      `    </div>`,
      `  </div>`,
      `</div>`,
    ].join('\n');
  }
}

module.exports = { WhatsAppQrModal };
