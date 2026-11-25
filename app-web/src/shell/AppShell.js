'use strict';

const { icon } = require('../components/Icons');

const PRIMARY_TABS = Object.freeze([
  { id: 'dashboard', label: 'Painel de Configurações', iconName: 'settings', flag: null },
  { id: 'conversations', label: 'Atendimentos Ativos', iconName: 'message-square', flag: null },
]);

const ADVANCED_TABS = Object.freeze([
  { id: 'catalog', label: 'Catálogo', iconName: 'layers', flag: null },
  { id: 'appointments', label: 'Agenda', iconName: 'calendar-check', flag: 'bookings' },
  { id: 'orders', label: 'Pedidos', iconName: 'shopping-cart', flag: 'orders' },
  { id: 'channel', label: 'WhatsApp QR', iconName: 'qr-code', flag: null },
]);

const NAV_ITEMS = Object.freeze([...PRIMARY_TABS, ...ADVANCED_TABS]);

/**
 * AppShell (Invariant 1):
 * Executive Dark Cyber Neon header & navigation shell, completely omitted when
 * `shell_enabled: false` so the host architecture room can embed views directly.
 */
class AppShell {
  /**
   * @param {{
   *   brandName?: string,
   *   brandLogoUrl?: string,
   *   activeView?: string,
   *   featureFlags?: Record<string, boolean>,
   *   uiMode?: 'guided' | 'advanced',
   *   partnerName?: string,
   *   partnerLogoUrl?: string
   * }} [options]
   */
  constructor(options = {}) {
    this.brandName = options.brandName || 'AUTON.MAX';
    this.brandLogoUrl = options.brandLogoUrl || './assets/img/logo-autonmax.jpg';
    this.activeView = options.activeView || 'dashboard';
    this.featureFlags = options.featureFlags || {};
    this.uiMode = options.uiMode === 'advanced' ? 'advanced' : 'guided';
    this.partnerName = options.partnerName || 'Meu Negócio';
    this.partnerLogoUrl = options.partnerLogoUrl || this.brandLogoUrl;
  }

  getVisibleNavItems() {
    const base = this.uiMode === 'advanced' ? NAV_ITEMS : PRIMARY_TABS;
    return base.filter((item) => {
      if (!item.flag) return true;
      return this.featureFlags[item.flag] !== false;
    });
  }

  _renderBrandTitle() {
    if (this.brandName === 'AUTON.MAX') {
      return `AUTON<span class="cyber-accent">.MAX</span>`;
    }
    return this.brandName;
  }

  /**
   * Wraps inner view HTML inside the executive shell header/navigation.
   * @param {string} innerHtml
   * @returns {string}
   */
  render(innerHtml) {
    const navButtons = this.getVisibleNavItems()
      .map((item) => {
        const isActive = item.id === this.activeView;
        const activeClass = isActive ? ' active' : '';
        const activeAttr = isActive ? 'data-active="true"' : '';
        return `<button type="button" class="nav-tab-btn${activeClass}" data-nav-view="${item.id}" ${activeAttr}>${icon(item.iconName, { size: 16 })} <span>${item.label}</span></button>`;
      })
      .join('\n');

    const modeLabel = this.uiMode === 'advanced' ? 'Avançado' : 'Guiado';

    return [
      `<div class="autonmax-shell" data-autonmax-shell="true">`,
      `  <header class="home-header">`,
      `    <div class="brand-cluster">`,
      `      <span class="brand-name">${this._renderBrandTitle()}</span>`,
      `    </div>`,
      `    <nav class="top-nav-tabs" aria-label="Navegação principal">`,
      navButtons,
      `    </nav>`,
      `    <div class="user-cluster">`,
      `      <button type="button" class="autonmax-btn autonmax-btn-secondary" data-shell-action="toggle-mode" title="Alternar modo de interface">Modo: ${modeLabel}</button>`,
      `      <div class="user-profile-chip" data-partner-chip="true">`,
      `        <img src="${this.partnerLogoUrl}" alt="${this.partnerName}" class="user-avatar" onerror="this.style.display='none'" />`,
      `        <span class="user-name">${this.partnerName}</span>`,
      `      </div>`,
      `      <button type="button" class="logout-btn" data-shell-action="logout">${icon('log-out', { size: 16 })} <span>Sair</span></button>`,
      `    </div>`,
      `  </header>`,
      `  <div class="autonmax-main">${innerHtml}</div>`,
      `</div>`,
    ].join('\n');
  }
}

module.exports = { AppShell, NAV_ITEMS, PRIMARY_TABS, ADVANCED_TABS };
