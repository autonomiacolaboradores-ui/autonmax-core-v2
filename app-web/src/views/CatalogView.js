'use strict';

/**
 * CatalogView (Miolo): CRUD Offline-First de produtos/serviços via EnvironmentPorts.storage + SyncQueue.
 */
class CatalogView {
  constructor(ctx) {
    this.ctx = ctx;
  }

  getControls() {
    const controls = ['list_items', 'create_item', 'deactivate_item'];
    if (this.ctx.uiMode === 'advanced') {
      controls.push('version_hash_inspector', 'export_catalog_data');
    }
    return controls;
  }

  /**
   * Creates a catalog item offline/online, persists locally via EnvironmentPorts.storage
   * and enqueues FIFO sync operation with UUID idempotency key.
   */
  async createItemOffline(partnerId, item) {
    const id = item.id || `itm_${Date.now()}`;
    const record = {
      id,
      partnerId,
      name: String(item.name || '').trim(),
      type: String(item.type || 'SERVICE').toUpperCase(),
      priceCents: Number(item.priceCents || 0),
      durationMinutes: Number(item.durationMinutes || 30),
      active: 1,
      updatedAt: Date.now(),
    };
    await this.ctx.ports.storage.upsert('catalog_items', record);
    const syncEntry = await this.ctx.syncQueue.enqueue({
      type: 'catalog.create',
      payload: { partnerId, item: record },
      idempotencyKey: item.idempotencyKey,
    });
    return { record, syncEntry };
  }

  async exportCatalog(partnerId, items = [], format = 'json') {
    if (typeof this.ctx.outputActions?.exportCatalogData === 'function') {
      return this.ctx.outputActions.exportCatalogData({ partnerId, items, format });
    }
    const content = JSON.stringify(items, null, 2);
    await this.ctx.ports.filesystem.saveFile(`catalog_${partnerId}.${format}`, content);
    return { ok: true, local: true };
  }

  render(items = []) {
    const mode = this.ctx.uiMode;
    const list = Array.isArray(items) ? items : [];
    const rows = list
      .map(
        (it) => `<tr>
          <td data-label="Nome">${it.name}</td>
          <td data-label="Tipo">${it.type || it.item_type}</td>
          <td data-label="Valor">R$ ${(Number(it.priceCents ?? it.price_cents ?? 0) / 100).toFixed(2).replace('.', ',')}</td>
          ${mode === 'advanced' ? `<td data-label="Hash">${it.versionHash || it.version_hash || '-'}</td>` : ''}
        </tr>`
      )
      .join('\n');

    return [
      `<section data-view="catalog" data-ui-mode="${mode}">`,
      `  <div class="autonmax-card">`,
      `    <h2 style="font-family: var(--font-heading);">Catálogo</h2>`,
      `    <button type="button" class="autonmax-btn" data-action="export-catalog">Exportar Catálogo</button>`,
      `  </div>`,
      `  <table class="autonmax-table">`,
      `    <thead><tr><th>Nome</th><th>Tipo</th><th>Valor</th>${mode === 'advanced' ? '<th>Hash</th>' : ''}</tr></thead>`,
      `    <tbody>${rows}</tbody>`,
      `  </table>`,
      `</section>`,
    ].join('\n');
  }
}

module.exports = { CatalogView };
