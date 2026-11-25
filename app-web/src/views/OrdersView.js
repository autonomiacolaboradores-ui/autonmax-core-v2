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

function formatPriceBrl(cents) {
  return `R$ ${(Number(cents || 0) / 100).toFixed(2).replace('.', ',')}`;
}

/**
 * OrdersView (Miolo): Pedidos organizados por dia (`.days-grid` / `.day-card`),
 * cancelamento e slots injetáveis (`exportOrdersPdf`, `shareReceipt`).
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

  render(data = []) {
    const mode = this.ctx.uiMode;
    const list = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [];

    const byDate = new Map();
    for (const order of list) {
      const dateKey = String(order.created_at || order.createdAt || '').slice(0, 10) || 'Hoje';
      if (!byDate.has(dateKey)) byDate.set(dateKey, []);
      byDate.get(dateKey).push(order);
    }

    const sortedDates = Array.from(byDate.keys()).sort().reverse();
    const dayCardsHtml = sortedDates.length
      ? sortedDates
          .map((dateStr) => {
            const dayOrders = byDate.get(dateStr) || [];
            const rowsHtml = dayOrders
              .map((o) => {
                const status = String(o.status || 'CONFIRMED').toUpperCase();
                const isCancelled = status === 'CANCELLED';
                const total = formatPriceBrl(o.total_cents ?? o.totalCents ?? 0);
                const client = escapeHtml(o.client_name || o.clientName || 'Cliente');
                const items = Array.isArray(o.items) ? o.items : [];
                const itemsHtml = items.length
                  ? `<ul style="margin:4px 0;padding-left:18px;display:flex;flex-direction:column;gap:4px;">
                       ${items
                         .map((it) => {
                           const qty = Number(it.qty ?? it.quantity ?? 1);
                           const itemName = escapeHtml(
                             it.name || it.item_name || it.itemName || 'Produto'
                           );
                           const subCents =
                             it.subtotal_cents ??
                             Number(it.price_cents ?? it.priceCents ?? 0) * qty;
                           return `<li style="white-space:normal;word-break:break-word;line-height:1.4;">
                                     <strong>${qty}x ${itemName}</strong>
                                     <span style="color:var(--color-text-muted);"> — ${formatPriceBrl(subCents)}</span>
                                   </li>`;
                         })
                         .join('\n')}
                     </ul>`
                  : `<span style="color:var(--color-text-muted);font-size:0.88rem;">Itens não especificados</span>`;
                const metaParts = [
                  o.delivery_type || o.deliveryType
                    ? `Entrega: ${escapeHtml(o.delivery_type || o.deliveryType)}`
                    : '',
                  o.payment_method || o.paymentMethod
                    ? `Pagamento: ${escapeHtml(o.payment_method || o.paymentMethod)}`
                    : '',
                  o.address ? `Endereço: ${escapeHtml(o.address)}` : '',
                ].filter(Boolean);

                return `<div style="padding:14px;border-radius:14px;background:var(--surface-input);display:flex;flex-direction:column;gap:8px;">
                          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
                            <strong style="white-space:normal;word-break:break-word;">#${escapeHtml(String(o.id).slice(0, 8))} — ${client}</strong>
                            <span class="autonmax-status-badge">${status}</span>
                          </div>
                          ${itemsHtml}
                          ${metaParts.length ? `<div style="color:var(--color-text-muted);font-size:0.86rem;white-space:normal;word-break:break-word;">${metaParts.join(' • ')}</div>` : ''}
                          <span style="color:var(--color-primary);font-weight:800;font-size:1.05rem;">Total: ${total}</span>
                          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;">
                            <button type="button" class="exec-action-btn" data-share-order="${escapeHtml(o.id)}">Compartilhar</button>
                            ${!isCancelled ? `<button type="button" class="logout-btn" data-cancel-order="${escapeHtml(o.id)}">Cancelar</button>` : ''}
                          </div>
                        </div>`;
              })
              .join('\n');

            return `<div class="day-card">
                      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                        <h3 style="margin:0;font-family:var(--font-heading);">${escapeHtml(dateStr)}</h3>
                        <span class="autonmax-status-badge">${dayOrders.length} pedido(s)</span>
                      </div>
                      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px;">${rowsHtml}</div>
                      <button type="button" class="exec-action-btn primary" style="width:100%;" data-export-orders-date="${escapeHtml(dateStr)}">${icon('file-text', { size: 16 })} <span>Baixar PDF do Dia</span></button>
                    </div>`;
          })
          .join('\n')
      : `<div class="autonmax-card" style="grid-column:1 / -1;text-align:center;color:var(--color-text-muted);">Nenhum pedido confirmado encontrado.</div>`;

    return [
      `<section data-view="orders" data-ui-mode="${mode}">`,
      `  <div class="subview-header">`,
      `    <button type="button" class="exec-action-btn" data-nav-view="dashboard">${icon('arrow-left', { size: 16 })} <span>Voltar ao Painel PME</span></button>`,
      `    <h2 style="margin:0;font-family:var(--font-heading);">Pedidos Confirmados por Dia</h2>`,
      `    <button type="button" class="exec-action-btn primary glow-neon" data-action="export-orders-pdf">${icon('file-text', { size: 16 })} <span>Exportar Pedidos PDF</span></button>`,
      `  </div>`,
      `  <div class="days-grid">${dayCardsHtml}</div>`,
      `</section>`,
    ].join('\n');
  }
}

module.exports = { OrdersView };
