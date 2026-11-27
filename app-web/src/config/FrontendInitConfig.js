'use strict';

const { createEnvironmentPorts } = require('../ports/EnvironmentPorts');
const { SyncQueue } = require('../sync/SyncQueue');
const { OperationalStatusBadge } = require('../components/OperationalStatusBadge');
const { AppShell } = require('../shell/AppShell');
const { DashboardView } = require('../views/DashboardView');
const { CatalogView } = require('../views/CatalogView');
const { AppointmentsView } = require('../views/AppointmentsView');
const { OrdersView } = require('../views/OrdersView');
const { ConversationsView } = require('../views/ConversationsView');
const { ChannelQrView } = require('../views/ChannelQrView');

const TOKEN_CSS_MAP = Object.freeze({
  surfaceBg: '--surface-bg',
  surfaceCard: '--surface-card',
  surfaceBorder: '--surface-border',
  colorPrimary: '--color-primary',
  colorText: '--color-text',
  colorTextMuted: '--color-text-muted',
  colorSuccess: '--color-success',
  colorWarning: '--color-warning',
  colorDanger: '--color-danger',
  fontSans: '--font-sans',
  fontHeading: '--font-heading',
  brandName: '--brand-name',
  brandLogoUrl: '--brand-logo-url',
});

/**
 * Applies runtime White-Label CSS tokens onto the container element if supported.
 * @param {Record<string, any> | null} container
 * @param {Record<string, string>} themeTokens
 */
function applyThemeTokens(container, themeTokens = {}) {
  if (!container || !container.style || typeof container.style.setProperty !== 'function') {
    return;
  }
  for (const [key, cssVar] of Object.entries(TOKEN_CSS_MAP)) {
    if (themeTokens[key] !== undefined && themeTokens[key] !== null) {
      container.style.setProperty(cssVar, String(themeTokens[key]));
    }
  }
}

/**
 * Mounts the AUTONMAX vNext UI (Invariant 5 — Config-Driven Single Source).
 * Implements Doc 02 Section 5.4 (`FrontendInitConfig`).
 *
 * @param {Record<string, any>} container
 * @param {{
 *   shell_enabled?: boolean,
 *   ui_mode?: 'guided' | 'advanced',
 *   feature_flags?: Record<string, boolean>,
 *   theme_tokens?: Record<string, string>,
 *   output_actions?: Record<string, Function>,
 *   environment_ports?: Record<string, any>,
 *   initialView?: string,
 *   baseUrl?: string,
 *   fetchImpl?: typeof fetch
 * }} [config]
 */
function mountAutonmaxUI(container, config = {}) {
  const shellEnabled = config.shell_enabled !== false;
  let uiMode = config.ui_mode === 'advanced' ? 'advanced' : 'guided';
  const featureFlags = {
    bookings: true,
    orders: true,
    softPause: true,
    ...(config.feature_flags || {}),
  };
  const themeTokens = config.theme_tokens || {};
  const outputActions = config.output_actions || {};
  const ports = createEnvironmentPorts(config.environment_ports || {});

  const badge = new OperationalStatusBadge({
    status: ports.network.isOnline() ? 'ONLINE' : 'OFFLINE',
  });

  const syncQueue = new SyncQueue({
    storage: ports.storage,
    network: ports.network,
    secureAuth: ports.secureAuth,
    baseUrl: config.apiBaseUrl ?? config.baseUrl ?? '',
    fetchImpl: config.fetchImpl,
    onStatusChange: (status) => {
      badge.update({ status });
      render();
    },
  });
  syncQueue.bindAutoFlush();

  let activeViewId = config.initialView || 'dashboard';
  let viewData = {};

  const ctx = {
    get uiMode() {
      return uiMode;
    },
    featureFlags,
    ports,
    syncQueue,
    outputActions,
  };

  const views = {
    dashboard: new DashboardView(ctx),
    catalog: new CatalogView(ctx),
    appointments: new AppointmentsView(ctx),
    orders: new OrdersView(ctx),
    conversations: new ConversationsView(ctx),
    channel: new ChannelQrView(ctx),
  };

  applyThemeTokens(container, themeTokens);

  let lastHtml = '';

  function render(dataOverride) {
    if (dataOverride) {
      viewData = { ...viewData, ...dataOverride };
    }
    const viewInstance = views[activeViewId] || views.dashboard;
    const viewHtml = viewInstance.render(viewData[activeViewId]);
    const operationalHtml = [
      `<div class="autonmax-app" data-autonmax-root="true" data-ui-mode="${uiMode}">`,
      badge.render(),
      viewHtml,
      `</div>`,
    ].join('\n');

    if (shellEnabled) {
      const shellMeta = viewData.shell || {};
      const shell = new AppShell({
        brandName: themeTokens.brandName || 'AUTON.MAX',
        brandLogoUrl: themeTokens.brandLogoUrl || './assets/img/logo-autonmax.jpg',
        activeView: activeViewId,
        featureFlags,
        uiMode,
        partnerName: shellMeta.partnerName || config.partnerName,
        partnerLogoUrl: shellMeta.partnerLogoUrl || config.partnerLogoUrl,
      });
      lastHtml = shell.render(operationalHtml);
    } else {
      lastHtml = operationalHtml;
    }

    if (container && 'innerHTML' in container) {
      container.innerHTML = lastHtml;
    }
    return lastHtml;
  }

  render();

  return {
    get shellEnabled() {
      return shellEnabled;
    },
    get uiMode() {
      return uiMode;
    },
    get activeView() {
      return activeViewId;
    },
    get html() {
      return lastHtml;
    },
    ports,
    syncQueue,
    badge,
    views,
    render,
    setUiMode(nextMode) {
      uiMode = nextMode === 'advanced' ? 'advanced' : 'guided';
      return render();
    },
    setBaseUrl(nextBaseUrl) {
      syncQueue.baseUrl = String(nextBaseUrl || '').trim().replace(/\/+$/, '');
    },
    navigate(viewId) {
      if (views[viewId]) {
        activeViewId = viewId;
      }
      return render();
    },
    getActiveViewControls() {
      const v = views[activeViewId] || views.dashboard;
      return typeof v.getControls === 'function' ? v.getControls() : [];
    },
    unmount() {
      syncQueue.dispose();
      if (container && 'innerHTML' in container) {
        container.innerHTML = '';
      }
    },
  };
}

module.exports = {
  mountAutonmaxUI,
  applyThemeTokens,
  TOKEN_CSS_MAP,
};
