'use strict';

/**
 * PmeOrderTools — engine isolada para Pedidos de Produtos
 */

const crypto = require('node:crypto');

let _sharedConfigurator = null;

class PmeOrderTools {
  static setConfigurator(configurator) {
    _sharedConfigurator = configurator;
  }

  static _config(partnerId) {
    if (!_sharedConfigurator) return null;
    return _sharedConfigurator.getAttendantConfig(partnerId);
  }

  static _norm(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  /**
   * 0. parseProductsCatalog(productsText)
   */
  static parseProductsCatalog(productsText) {
    const catalog = [];
    if (!productsText || typeof productsText !== 'string') return catalog;

    const lines = productsText.split(/[\n,]/).map(line => line.trim()).filter(line => line.length > 0);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let priceCents = 0;
      let name = line;

      // Extract price like R$ 80, 80,00, 80.00, 80 reais
      // Match price pattern at the end of string or in parentheses
      const priceMatch = line.match(/(?:\(|-\s*)?(?:R\$|RS|\$)?\s*(\d+)[.,]?(\d{2})?\s*(?:reais)?(?:\))?$/i);
      if (priceMatch) {
        const whole = parseInt(priceMatch[1] || '0', 10);
        const cents = parseInt(priceMatch[2] || '0', 10);
        priceCents = (whole * 100) + cents;
        
        name = line.replace(priceMatch[0], '').trim();
        // clean up trailing hyphens or parens
        name = name.replace(/[-()]+$/, '').trim();
      }

      if (name.length > 0) {
        catalog.push({
          id: `prod_${i + 1}`,
          name: name,
          priceCents: priceCents
        });
      }
    }
    
    console.log(`[ORDER_CATALOG] ${catalog.length} produtos parseados.`);
    return catalog;
  }

  /**
   * 1. resolveProduct(catalog, productName, productId)
   */
  static resolveProduct(catalog, productName, productId) {
    const list = Array.isArray(catalog) ? catalog : [];
    if (!list.length) return null;

    if (productId) {
      const byId = list.find(
        (c) => String(c.id || '') === String(productId)
      );
      if (byId) return byId;
    }

    if (!productName) return null;
    const t = this._norm(productName);

    // Fuzzy match por "includes", preferindo o maior nome (mais específico)
    const matches = list.filter(c => {
        const n = this._norm(c.name);
        return n.includes(t) || t.includes(n);
    });

    if (matches.length > 0) {
        matches.sort((a, b) => b.name.length - a.name.length);
        return matches[0];
    }

    return null;
  }

  /**
   * 2. createOrder(args)
   */
  static async createOrder(args = {}) {
    const partnerId = args.partnerId;
    let clientName = String(args.clientName || '').trim();

    if (!clientName || clientName.startsWith('usr_') || clientName.startsWith('usr_nat_') || clientName.length < 3) {
      clientName = 'Cliente';
    }

    const items = args.items;
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('[PME_ORDER] items é obrigatório e não pode ser vazio');
    }

    let totalAmount = 0;
    for (const item of items) {
      const q = Number(item.quantity);
      if (isNaN(q) || q <= 0) {
        throw new Error(`[PME_ORDER] quantity deve ser número > 0 para o produto: ${item.productName}`);
      }
      const priceCents = Number(item.unitPrice) || 0;
      totalAmount += q * priceCents;
    }

    const orderId = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const orderRow = {
      orderId,
      partnerId,
      clientName,
      customerPhone: args.customerPhone || null, // Tratado upstream
      items,
      totalCents: totalAmount,
      status: 'CONFIRMED',
      createdAt: new Date().toISOString()
    };

    const configFresh = this._config(partnerId);
    if (configFresh) {
      if (!Array.isArray(configFresh.existingOrders)) {
        configFresh.existingOrders = [];
      }
      configFresh.existingOrders.push(orderRow);
      configFresh.updatedAt = new Date().toISOString();

      if (typeof _sharedConfigurator.markDirty === 'function') {
        _sharedConfigurator.markDirty(partnerId);
      }
      // Save directly to persist to disk (workspace/attendants_db.json)
      if (typeof _sharedConfigurator.saveData === 'function') {
        await _sharedConfigurator.saveData();
      } else if (typeof _sharedConfigurator.flush === 'function') {
        _sharedConfigurator.flush();
      }
    }

    console.log(`[ORDER_PERSIST] Pedido salvo: ${orderId} · ${clientName} · Total(Cents): ${totalAmount}`);

    return { ok: true, orderId, order: orderRow, totalReais: (totalAmount / 100).toFixed(2) };
  }

  /**
   * 3. listOrders(partnerId, filters = {})
   */
  static listOrders(partnerId, filters = {}) {
    const config = this._config(partnerId);
    if (!config || !Array.isArray(config.existingOrders)) return [];

    let orders = config.existingOrders;
    
    if (filters.date) {
      orders = orders.filter((o) => {
        if (!o.createdAt) return false;
        return o.createdAt.startsWith(filters.date);
      });
    }

    return orders;
  }

  /**
   * 4. cancelOrder(partnerId, orderId)
   */
  static async cancelOrder(partnerId, orderId) {
    if (!_sharedConfigurator) {
      return { ok: false, message: 'Configurador indisponível' };
    }
    const config = this._config(partnerId);
    if (!config || !Array.isArray(config.existingOrders)) {
      return { ok: false, message: 'Pedido não encontrado' };
    }

    const idx = config.existingOrders.findIndex((o) => String(o.orderId) === String(orderId));
    if (idx < 0) return { ok: false, message: 'Pedido não encontrado' };

    const order = config.existingOrders[idx];
    order.status = 'CANCELLED';
    order.cancelledAt = new Date().toISOString();
    config.updatedAt = new Date().toISOString();

    if (typeof _sharedConfigurator.markDirty === 'function') {
      _sharedConfigurator.markDirty(partnerId);
    }
    if (typeof _sharedConfigurator.saveData === 'function') {
      await _sharedConfigurator.saveData();
    } else if (typeof _sharedConfigurator.flush === 'function') {
      _sharedConfigurator.flush();
    }

    console.log(`[ORDER_PERSIST] Pedido cancelado: ${orderId} · ${order.clientName}`);

    return { ok: true, message: `Pedido ${orderId} cancelado.`, order };
  }
}

module.exports = PmeOrderTools;
