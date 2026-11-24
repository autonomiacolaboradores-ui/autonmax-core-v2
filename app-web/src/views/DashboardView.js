'use strict';

/**
 * DashboardView (Miolo): Painel PME com resumo operacional e controles guiados/avançados.
 */
class DashboardView {
  constructor(ctx) {
    this.ctx = ctx;
  }

  getControls() {
    const controls = ['status_overview', 'quick_sync'];
    if (this.ctx.uiMode === 'advanced') {
      controls.push('prompt_editor', 'business_rules', 'webhook_diagnostics');
    }
    return controls;
  }

  render(data = {}) {
    const mode = this.ctx.uiMode;
    const advancedBlock =
      mode === 'advanced'
        ? `<div class="autonmax-card" data-advanced-panel="true">
             <h3 style="font-family: var(--font-heading);">Controles Avançados (Prompt, Regras & Webhooks)</h3>
             <p style="color: var(--color-text-muted);">Configurações avançadas do motor e diagnósticos ativos.</p>
             <button type="button" class="autonmax-btn" data-action="sync-now">Forçar Sincronização</button>
           </div>`
        : `<div class="autonmax-card" data-guided-panel="true">
             <h3 style="font-family: var(--font-heading);">Guia Rápido</h3>
             <p style="color: var(--color-text-muted);">Gerencie catálogo, agenda e pedidos em poucos passos.</p>
           </div>`;

    return [
      `<section data-view="dashboard" data-ui-mode="${mode}">`,
      `  <div class="autonmax-card">`,
      `    <h2 style="font-family: var(--font-heading);">Painel PME</h2>`,
      `    <p style="color: var(--color-text-muted);">Agendamentos hoje: ${Number(data.appointmentsCount || 0)} | Pedidos hoje: ${Number(data.ordersCount || 0)}</p>`,
      `  </div>`,
      advancedBlock,
      `</section>`,
    ].join('\n');
  }
}

module.exports = { DashboardView };
