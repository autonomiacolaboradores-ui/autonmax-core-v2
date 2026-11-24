'use strict';

/**
 * OrdersView (Miolo): Pedidos com slot injetável `exportOrdersPdf` e `shareReceipt`.
 */
class OrdersView {
  constructor(ctx) {
    this.ctx = ctx;
  }

  getControls() {
    const controls = ['list_orders', 'cancel_order', 'export_orders_pdf', 'share_receipt'];
    if (this.ctx.uiMode === 'advanced') {
      controls.push('centavos_breakdown', 'payment_audit');
    }
    return controls;
  }

  async exportOrdersPdf({ partnerId, dateStr, items = [] }) {
    if (typeof this.ctx.outputActions?.exportOrdersPdf === 'function') {
      return this.ctx.outputActions.exportOrdersPdf({ partnerId, dateStr, items });
    }
    const text = items
      .map((o) => `#${o.id} - ${o.client_name || o.clientName} - ${o.total_cents || 0}`)
      .join('\n');
    await this.ctx.ports.filesystem.saveFile(`pedidos_${dateStr}.txt`, text);
    return { ok: true, local: true };
  }

  async shareReceipt({ id, text }) {
    if (typeof this.ctx.outputActions?.shareReceipt === 'function') {
      return this.ctx.outputActions.shareReceipt({ type: 'order', id, text });
    }
    return this.ctx.ports.share.share({ title: `Pedido ${id}`, text });
  }

  render(orders = []) {
    const mode = this.ctx.uiMode;
    const list = Array.isArray(orders) ? orders : [];
    const rows = list
      .map(
        (o) => `<tr>
          <td data-label="Pedido">#${o.id}</td>
          <td data-label="Cliente">${o.client_name || o.clientName}</td>
          <td data-label="Total">R$ ${(Number(o.total_cents ?? o.totalCents ?? 0) / 100).toFixed(2).replace('.', ',')}</td>
          <td data-label="Status">${o.status || 'CONFIRMED'}</td>
        </tr>`
      )
      .join('\n');

    return [
      `<section data-view="orders" data-ui-mode="${mode}">`,
      `  <div class="autonmax-card">`,
      `    <h2 style="font-family: var(--font-heading);">Pedidos</h2>`,
      `    <button type="button" class="autonmax-btn" data-action="export-orders-pdf">Exportar Pedidos PDF</button>`,
      `  </div>`,
      `  <table class="autonmax-table">`,
      `    <thead><tr><th>Pedido</th><th>Cliente</th><th>Total</th><th>Status</th></tr></thead>`,
      `    <tbody>${rows}</tbody>`,
      `  </table>`,
      `</section>`,
    ].join('\n');
  }
}

module.exports = { OrdersView };
