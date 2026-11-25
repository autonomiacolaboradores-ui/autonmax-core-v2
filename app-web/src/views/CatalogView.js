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
 * CatalogView (Miolo): Dashboards dedicados de Serviços e Produtos com busca,
 * formulário de criação/edição e persistência offline-first via SyncQueue.
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

  async createItemOffline(partnerId, item) {
    const id = item.id || `itm_${Date.now()}`;
    const record = {
      id,
      partnerId,
      name: String(item.name || '').trim(),
      type: String(item.type || 'SERVICE').toUpperCase(),
      priceCents: Number(item.priceCents || 0),
      durationMinutes: Number(item.durationMinutes || 30),
      category: item.category ? String(item.category).trim() : null,
      description: item.description ? String(item.description).trim() : null,
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

  render(data = []) {
    const mode = this.ctx.uiMode;
    const isArray = Array.isArray(data);
    const rawItems = isArray ? data : Array.isArray(data.items) ? data.items : [];
    const filterType = !isArray && data.filterType ? String(data.filterType).toUpperCase() : 'ALL';
    const searchQuery = !isArray && data.searchQuery ? String(data.searchQuery).trim().toLowerCase() : '';
    const formOpen = !isArray && Boolean(data.formOpen);
    const editingItem = !isArray && data.editingItem ? data.editingItem : null;
    const formError = !isArray && data.formError ? String(data.formError) : '';

    const filtered = rawItems.filter((it) => {
      const t = String(it.type || it.item_type || '').toUpperCase();
      if (filterType !== 'ALL' && t !== filterType) return false;
      if (searchQuery) {
        const hay = `${it.name || ''} ${it.category || ''} ${it.description || ''}`.toLowerCase();
        if (!hay.includes(searchQuery)) return false;
      }
      return true;
    });

    const isService = filterType === 'SERVICE';
    const isProduct = filterType === 'PRODUCT';
    const title = isService
      ? 'Painel de Serviços & Agendamentos'
      : isProduct
        ? 'Painel de Produtos & Pedidos de Compra'
        : 'Catálogo de Serviços & Produtos';
    const countLabel = isService
      ? `${filtered.length} Serviços`
      : isProduct
        ? `${filtered.length} Produtos`
        : `${filtered.length} Itens`;
    const addLabel = isService
      ? '+ Adicionar Novo Serviço'
      : isProduct
        ? '+ Adicionar Novo Produto'
        : '+ Adicionar Item';

    const ruleBanner = isProduct
      ? `<div class="catalog-rule-banner" data-product-rule-banner="true">
           <span>${icon('shopping-cart', { size: 20 })}</span>
           <div>
             <strong>REGRA INVIOLÁVEL DE PEDIDOS DE PRODUTO:</strong>
             <span> Todo item deste painel é uma mercadoria física para entrega ou retirada. O Max processa pedidos e nunca agenda horário na agenda para entrega.</span>
           </div>
         </div>`
      : '';

    const defaultFormType = editingItem
      ? String(editingItem.type || editingItem.item_type || 'SERVICE').toUpperCase()
      : isProduct
        ? 'PRODUCT'
        : 'SERVICE';
    const formPriceBrl = editingItem
      ? (Number(editingItem.priceCents ?? editingItem.price_cents ?? 0) / 100).toFixed(2).replace('.', ',')
      : '';
    const formTrackStock = editingItem
      ? Number(editingItem.track_stock ?? (editingItem.trackStock ? 1 : 0)) === 1
      : false;
    const formStockQty =
      editingItem && (editingItem.stockQuantity ?? editingItem.stock_quantity) !== null &&
      (editingItem.stockQuantity ?? editingItem.stock_quantity) !== undefined
        ? Number(editingItem.stockQuantity ?? editingItem.stock_quantity)
        : 0;

    const formHtml = formOpen
      ? `<form class="autonmax-card" data-catalog-form="true" style="display:flex;flex-direction:column;gap:12px;">
           <input type="hidden" name="itemId" value="${escapeHtml(editingItem?.id || '')}" />
           <h3 style="margin:0;font-family:var(--font-heading);">${editingItem ? 'Editar Item' : addLabel}</h3>
           <input type="text" name="name" class="dark-input" placeholder="Nome *" value="${escapeHtml(editingItem?.name || '')}" required />
           <div class="pme-v2-grid">
             <select name="type" class="dark-input">
               <option value="SERVICE" ${defaultFormType === 'SERVICE' ? 'selected' : ''}>Serviço (Agendamento)</option>
               <option value="PRODUCT" ${defaultFormType === 'PRODUCT' ? 'selected' : ''}>Produto (Pedido)</option>
             </select>
             <input type="text" name="priceBrl" class="dark-input" placeholder="Preço R$ (ex: 50,00)" value="${escapeHtml(formPriceBrl)}" required />
           </div>
           <div class="pme-v2-grid">
             <div data-catalog-duration-wrap="true" style="display:${defaultFormType === 'SERVICE' ? 'block' : 'none'};">
               <input type="number" name="durationMinutes" class="dark-input" min="10" max="480" value="${Number(editingItem?.durationMinutes ?? editingItem?.duration_minutes ?? 30)}" placeholder="Duração (min)" />
             </div>
             <input type="text" name="category" class="dark-input" placeholder="Categoria" value="${escapeHtml(editingItem?.category || '')}" />
           </div>
           <div style="display:${defaultFormType === 'PRODUCT' ? 'flex' : 'none'};align-items:center;gap:12px;flex-wrap:wrap;" data-catalog-stock-row="true">
             <input type="number" name="stockQuantity" class="dark-input" style="flex:1;min-width:140px;" min="0" value="${formStockQty}" placeholder="Quantidade em estoque" ${formTrackStock ? '' : 'disabled'} />
             <label style="display:inline-flex;align-items:center;gap:10px;cursor:pointer;">
               <span class="toggle-switch-hero" aria-label="Controlar estoque">
                 <input type="checkbox" name="trackStock" data-catalog-stock-toggle="true" ${formTrackStock ? 'checked' : ''} />
                 <span class="slider-hero"></span>
               </span>
               <span data-catalog-stock-label="true" style="font-size:0.9rem;color:var(--color-text-muted);">${formTrackStock ? 'Estoque controlado' : 'Estoque ilimitado (Software/Digital)'}</span>
             </label>
           </div>
           <textarea name="description" class="dark-input" rows="3" placeholder="Descrição / Detalhes para o Max">${escapeHtml(editingItem?.description || '')}</textarea>
           ${formError ? `<p class="auth-feedback error" data-catalog-error="true">${escapeHtml(formError)}</p>` : ''}
           <div style="display:flex;gap:10px;justify-content:flex-end;">
             <button type="button" class="exec-action-btn" data-catalog-action="close-form">Cancelar</button>
             <button type="submit" class="exec-action-btn primary glow-neon">${icon('save', { size: 16 })} <span>Salvar Item</span></button>
           </div>
         </form>`
      : '';

    const cardsHtml = filtered.length
      ? filtered
          .map((it) => {
            const itType = String(it.type || it.item_type || 'SERVICE').toUpperCase();
            const price = formatPriceBrl(it.priceCents ?? it.price_cents ?? 0);
            const dur = Number(it.durationMinutes ?? it.duration_minutes ?? 0);
            const trackStock = Number(it.track_stock ?? (it.trackStock ? 1 : 0)) === 1;
            const stockQty = it.stockQuantity ?? it.stock_quantity;
            const stockText =
              itType === 'PRODUCT'
                ? trackStock
                  ? `Estoque: ${Number(stockQty || 0)} un`
                  : 'Estoque: Ilimitado'
                : '';
            return `<div class="knowledge-card" style="display:flex;flex-direction:column;justify-content:space-between;margin-bottom:0;">
                      <div>
                        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;">
                          <h4 style="margin:0;">${escapeHtml(it.name)}</h4>
                          <span class="autonmax-status-badge">${escapeHtml(it.category || itType)}</span>
                        </div>
                        <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px;color:var(--color-primary);font-weight:700;flex-wrap:wrap;">
                          <span>${price}</span>
                          ${itType === 'SERVICE' && dur > 0 ? `<span style="color:var(--color-text-muted);font-weight:500;">${dur} min</span>` : ''}
                          ${stockText ? `<span class="autonmax-status-badge">${stockText}</span>` : ''}
                        </div>
                        <p style="margin:0 0 12px;color:var(--color-text-muted);font-size:0.9rem;">${escapeHtml(it.description || 'Sem descrição.')}</p>
                      </div>
                      <div style="display:flex;gap:8px;justify-content:flex-end;">
                        <button type="button" class="exec-action-btn" data-catalog-edit="${escapeHtml(it.id)}">Editar</button>
                        <button type="button" class="logout-btn" data-catalog-delete="${escapeHtml(it.id)}">${icon('trash-2', { size: 15 })} <span>Excluir</span></button>
                      </div>
                    </div>`;
          })
          .join('\n')
      : `<div class="autonmax-card" style="grid-column:1 / -1;text-align:center;color:var(--color-text-muted);">Nenhum item encontrado.</div>`;

    const advancedTable =
      mode === 'advanced'
        ? `<div class="autonmax-card" data-advanced-panel="true" style="margin-top:16px;">
             <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
               <strong>Auditoria de Version Hash</strong>
               <button type="button" class="autonmax-btn" data-action="export-catalog">Exportar Catálogo</button>
             </div>
             <table class="autonmax-table">
               <thead><tr><th>Nome</th><th>Tipo</th><th>Valor</th><th>Hash</th></tr></thead>
               <tbody>
                 ${filtered
                   .map(
                     (it) => `<tr>
                       <td data-label="Nome">${escapeHtml(it.name)}</td>
                       <td data-label="Tipo">${escapeHtml(it.type || it.item_type)}</td>
                       <td data-label="Valor">${formatPriceBrl(it.priceCents ?? it.price_cents ?? 0)}</td>
                       <td data-label="Hash">${escapeHtml(it.versionHash || it.version_hash || '-')}</td>
                     </tr>`
                   )
                   .join('\n')}
               </tbody>
             </table>
           </div>`
        : '';

    return [
      `<section data-view="catalog" data-ui-mode="${mode}" data-catalog-filter="${filterType}">`,
      `  <div class="subview-header">`,
      `    <button type="button" class="exec-action-btn" data-nav-view="dashboard">${icon('arrow-left', { size: 16 })} <span>Voltar ao Painel PME</span></button>`,
      `    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">`,
      `      <h2 style="margin:0;font-family:var(--font-heading);">${title}</h2>`,
      `      <span class="autonmax-status-badge">${countLabel}</span>`,
      `    </div>`,
      `    <button type="button" class="exec-action-btn primary glow-neon" data-catalog-action="open-form">${icon('plus-circle', { size: 16 })} <span>${addLabel}</span></button>`,
      `  </div>`,
      ruleBanner,
      `  <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center;">`,
      `    <input type="text" class="dark-input" style="flex:1;min-width:220px;" data-catalog-search="true" value="${escapeHtml(searchQuery)}" placeholder="Buscar por nome ou categoria..." />`,
      `    <button type="button" class="exec-action-btn${filterType === 'SERVICE' ? ' primary' : ''}" data-nav-catalog="SERVICE">Serviços</button>`,
      `    <button type="button" class="exec-action-btn${filterType === 'PRODUCT' ? ' primary' : ''}" data-nav-catalog="PRODUCT">Produtos</button>`,
      `    <button type="button" class="exec-action-btn${filterType === 'ALL' ? ' primary' : ''}" data-nav-catalog="ALL">Todos</button>`,
      `  </div>`,
      formHtml,
      `  <div class="catalog-cards-grid">${cardsHtml}</div>`,
      advancedTable,
      `</section>`,
    ]
      .filter(Boolean)
      .join('\n');
  }
}

module.exports = { CatalogView };
