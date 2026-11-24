'use strict';

const NAV_ITEMS = Object.freeze([
  { id: 'dashboard', label: 'Painel', flag: null },
  { id: 'catalog', label: 'Catálogo', flag: null },
  { id: 'appointments', label: 'Agenda', flag: 'bookings' },
  { id: 'orders', label: 'Pedidos', flag: 'orders' },
  { id: 'conversations', label: 'Chats', flag: null },
  { id: 'channel', label: 'WhatsApp QR', flag: null },
]);

/**
 * AppShell (Invariant 1):
 * External navigation shell (header + nav), completely omitted when `shell_enabled: false`
 * so the host architecture room can embed views directly.
 */
class AppShell {
  /**
   * @param {{ brandName?: string, brandLogoUrl?: string, activeView?: string, featureFlags?: Record<string, boolean>, uiMode?: 'guided' | 'advanced' }} [options]
   */
  constructor(options = {}) {
    this.brandName = options.brandName || 'AUTONMAX vNext';
    this.brandLogoUrl = options.brandLogoUrl || '';
    this.activeView = options.activeView || 'dashboard';
    this.featureFlags = options.featureFlags || {};
    this.uiMode = options.uiMode === 'advanced' ? 'advanced' : 'guided';
  }

  getVisibleNavItems() {
    return NAV_ITEMS.filter((item) => {
      if (!item.flag) return true;
      return this.featureFlags[item.flag] !== false;
    });
  }

  /**
   * Wraps inner view HTML inside the external shell header/navigation.
   * @param {string} innerHtml
   * @returns {string}
   */
  render(innerHtml) {
    const navButtons = this.getVisibleNavItems()
      .map((item) => {
        const activeAttr = item.id === this.activeView ? 'data-active="true"' : '';
        return `<button type="button" class="autonmax-btn autonmax-btn-secondary" data-nav-view="${item.id}" ${activeAttr}>${item.label}</button>`;
      })
      .join('\n');

    return [
      `<div class="autonmax-shell" data-autonmax-shell="true">`,
      `  <header class="autonmax-header">`,
      `    <strong style="font-family: var(--font-heading); color: var(--color-primary);">${this.brandName}</strong>`,
      `    <span style="color: var(--color-text-muted);">Modo: ${this.uiMode}</span>`,
      `  </header>`,
      `  <nav class="autonmax-nav" aria-label="Navegação principal">`,
      navButtons,
      `  </nav>`,
      `  <div class="autonmax-main">${innerHtml}</div>`,
      `</div>`,
    ].join('\n');
  }
}

module.exports = { AppShell, NAV_ITEMS };
