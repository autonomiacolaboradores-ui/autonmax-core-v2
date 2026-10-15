'use strict';

/**
 * PmeCrmEngine — CRM Inteligente e Memória de Clientes para o Max Atendente
 *
 * Inspirado nos conceitos de CRM do ERP Xiquim Vargas (tabelas clientes e cliente_interacoes),
 * adaptado para a realidade ágil do WhatsApp e PME:
 * - Identificação automática sem perguntar dados ao cliente
 * - Armazenamento de LTV (Lifetime Value), total de pedidos e agendamentos
 * - Rastreio da última compra e produto/serviço favorito
 * - Injeção de contexto de alto impacto para respostas ultra-personalizadas da IA
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DB_PATH = path.join(__dirname, '../../workspace/autonmax.db');

class PmeCrmEngine {
  constructor() {
    this._db = null;
    this._initDb();
  }

  _getDb() {
    if (this._db) return this._db;
    try {
      const Database = require('better-sqlite3');
      this._db = new Database(DB_PATH);
      return this._db;
    } catch (_) {
      try {
        const { DatabaseSync } = require('node:sqlite');
        this._db = new DatabaseSync(DB_PATH, { open: true });
        return this._db;
      } catch (err) {
        console.error('[PME_CRM] Erro ao abrir banco de dados SQLite:', err.message);
        return null;
      }
    }
  }

  _initDb() {
    const db = this._getDb();
    if (!db) return;

    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS pme_customers (
          id TEXT PRIMARY KEY,
          partner_id TEXT NOT NULL,
          phone TEXT NOT NULL,
          name TEXT NOT NULL,
          remote_jid TEXT,
          total_orders INTEGER DEFAULT 0,
          total_appointments INTEGER DEFAULT 0,
          ltv_cents INTEGER DEFAULT 0,
          last_item_name TEXT,
          last_interaction_at DATETIME,
          favorite_items TEXT DEFAULT '[]',
          notes TEXT DEFAULT '',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(partner_id, phone)
        );

        CREATE INDEX IF NOT EXISTS idx_pme_customers_partner_phone ON pme_customers(partner_id, phone);
        CREATE INDEX IF NOT EXISTS idx_pme_customers_jid ON pme_customers(remote_jid);

        CREATE TABLE IF NOT EXISTS pme_customer_timeline (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          partner_id TEXT NOT NULL,
          customer_phone TEXT NOT NULL,
          type TEXT NOT NULL,
          item_name TEXT,
          amount_cents INTEGER DEFAULT 0,
          details_json TEXT DEFAULT '{}',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_pme_timeline_cust ON pme_customer_timeline(partner_id, customer_phone);
      `);
      console.log('[PME_CRM] Tabelas de CRM inicializadas com sucesso.');
    } catch (err) {
      console.error('[PME_CRM] Erro ao criar tabelas no SQLite:', err.message);
    }
  }

  /**
   * Formata telefone para o padrão brasileiro: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
   */
  formatPhone(rawJidOrPhone) {
    if (!rawJidOrPhone) return '';
    let str = String(rawJidOrPhone).split('@')[0].split(':')[0].replace(/\D/g, '');
    if (str.startsWith('55') && (str.length === 12 || str.length === 13)) {
      str = str.substring(2);
    }
    if (str.length === 11) {
      return `(${str.substring(0, 2)}) ${str.substring(2, 7)}-${str.substring(7)}`;
    }
    if (str.length === 10) {
      return `(${str.substring(0, 2)}) ${str.substring(2, 6)}-${str.substring(6)}`;
    }
    return str;
  }

  /**
   * Limpa e padroniza o nome vindo do WhatsApp
   */
  cleanName(pushName, fallback = 'Cliente') {
    if (!pushName || typeof pushName !== 'string') return fallback;
    const clean = pushName.trim();
    if (
      clean.length < 2 ||
      clean.startsWith('usr_') ||
      clean.startsWith('usr_nat_') ||
      /^\d+$/.test(clean) ||
      clean.toLowerCase() === 'anon'
    ) {
      return fallback;
    }
    return clean;
  }

  /**
   * Obtém ou cadastra automaticamente o cliente pelo telefone/JID
   */
  getOrCreateCustomer(partnerId, rawPhoneOrJid, pushName, remoteJid) {
    const db = this._getDb();
    const pid = partnerId || 'usr_google_demo_100';
    const phone = this.formatPhone(rawPhoneOrJid);
    const jid = remoteJid || (String(rawPhoneOrJid).includes('@') ? rawPhoneOrJid : null);
    const validName = this.cleanName(pushName, 'Cliente');

    if (!db || !phone) {
      return {
        id: 'cust_mem',
        partner_id: pid,
        phone: phone || '(00) 00000-0000',
        name: validName,
        total_orders: 0,
        total_appointments: 0,
        ltv_cents: 0,
        last_item_name: null,
        last_interaction_at: null,
        isNew: true,
        tier: 'NOVO'
      };
    }

    try {
      let row = db.prepare('SELECT * FROM pme_customers WHERE partner_id = ? AND phone = ?').get(pid, phone);

      if (!row) {
        const id = 'cust_' + crypto.randomBytes(6).toString('hex');
        db.prepare(`
          INSERT INTO pme_customers (id, partner_id, phone, name, remote_jid, total_orders, total_appointments, ltv_cents, favorite_items, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 0, 0, 0, '[]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(id, pid, phone, validName, jid);

        row = db.prepare('SELECT * FROM pme_customers WHERE id = ?').get(id);
      } else {
        // Se o cliente existia com nome genérico e agora temos o nome real via pushName, atualiza
        const shouldUpdateName = validName !== 'Cliente' && (row.name === 'Cliente' || row.name.startsWith('usr_'));
        const shouldUpdateJid = jid && row.remote_jid !== jid;

        if (shouldUpdateName || shouldUpdateJid) {
          db.prepare(`
            UPDATE pme_customers 
            SET name = CASE WHEN ? != 'Cliente' THEN ? ELSE name END,
                remote_jid = COALESCE(?, remote_jid),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(validName, validName, jid, row.id);
          row = db.prepare('SELECT * FROM pme_customers WHERE id = ?').get(row.id);
        }
      }

      return this._decorateCustomer(row);
    } catch (err) {
      console.error('[PME_CRM] Erro em getOrCreateCustomer:', err.message);
      return {
        id: 'cust_fallback',
        partner_id: pid,
        phone,
        name: validName,
        total_orders: 0,
        total_appointments: 0,
        ltv_cents: 0,
        isNew: true,
        tier: 'NOVO'
      };
    }
  }

  /**
   * Adiciona métricas computadas e classificação do cliente
   */
  _decorateCustomer(row) {
    if (!row) return null;

    const totalOrders = Number(row.total_orders) || 0;
    const totalAppointments = Number(row.total_appointments) || 0;
    const totalInteractions = totalOrders + totalAppointments;
    const ltvCents = Number(row.ltv_cents) || 0;
    const ltvReais = (ltvCents / 100).toFixed(2).replace('.', ',');

    let tier = 'NOVO';
    if (totalInteractions >= 5 || ltvCents >= 25000) {
      tier = 'VIP';
    } else if (totalInteractions >= 2) {
      tier = 'RECORRENTE';
    }

    // Calcula tempo desde a última interação
    let daysSinceLast = null;
    let timeAgoLabel = 'primeiro contato';
    if (row.last_interaction_at) {
      // Trata strings UTC do SQLite
      const dateStr = String(row.last_interaction_at).includes('Z') || String(row.last_interaction_at).includes('+')
        ? row.last_interaction_at
        : row.last_interaction_at + 'Z';
      const lastDate = new Date(dateStr);
      const diffMs = Math.max(0, Date.now() - lastDate.getTime());
      daysSinceLast = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (daysSinceLast <= 0) {
        timeAgoLabel = 'hoje';
      } else if (daysSinceLast === 1) {
        timeAgoLabel = 'ontem';
      } else if (daysSinceLast < 30) {
        timeAgoLabel = `há ${daysSinceLast} dias`;
      } else {
        const months = Math.floor(daysSinceLast / 30);
        timeAgoLabel = `há cerca de ${months} ${months === 1 ? 'mês' : 'meses'}`;
      }
    }

    // Identifica item favorito
    let favorites = [];
    try {
      favorites = typeof row.favorite_items === 'string' ? JSON.parse(row.favorite_items || '[]') : (row.favorite_items || []);
    } catch (_) {}

    const topFavorite = favorites.length > 0 ? favorites[0].name : row.last_item_name;

    return {
      ...row,
      totalOrders,
      totalAppointments,
      totalInteractions,
      ltvCents,
      ltvReais,
      tier,
      isNew: totalInteractions === 0,
      daysSinceLast,
      timeAgoLabel,
      topFavorite
    };
  }

  /**
   * Registra um pedido concluído com sucesso
   */
  recordOrder(partnerId, rawPhoneOrJid, clientName, details = {}) {
    const db = this._getDb();
    if (!db) return;

    const pid = partnerId || 'usr_google_demo_100';
    const phone = this.formatPhone(rawPhoneOrJid);
    const validName = this.cleanName(clientName, 'Cliente');
    const totalCents = Number(details.totalCents) || 0;
    const items = Array.isArray(details.items) ? details.items : [];
    const firstItemName = items.length > 0 ? (items[0].productName || items[0].name) : 'Pedido';

    try {
      // Garante que o cliente existe
      this.getOrCreateCustomer(pid, phone, validName, details.remoteJid);

      // Atualiza lista de favoritos
      const cust = db.prepare('SELECT favorite_items FROM pme_customers WHERE partner_id = ? AND phone = ?').get(pid, phone);
      let favorites = [];
      try { favorites = JSON.parse(cust?.favorite_items || '[]'); } catch (_) {}

      for (const it of items) {
        const itName = it.productName || it.name;
        if (!itName) continue;
        const existing = favorites.find(f => f.name.toLowerCase() === itName.toLowerCase());
        if (existing) {
          existing.count = (existing.count || 1) + (Number(it.quantity) || 1);
        } else {
          favorites.push({ name: itName, count: Number(it.quantity) || 1, type: 'PRODUCT' });
        }
      }
      favorites.sort((a, b) => (b.count || 0) - (a.count || 0));

      // Atualiza tabela de clientes
      db.prepare(`
        UPDATE pme_customers
        SET total_orders = total_orders + 1,
            ltv_cents = ltv_cents + ?,
            last_item_name = ?,
            last_interaction_at = CURRENT_TIMESTAMP,
            favorite_items = ?,
            name = CASE WHEN ? != 'Cliente' AND (name = 'Cliente' OR name LIKE 'usr_%') THEN ? ELSE name END,
            updated_at = CURRENT_TIMESTAMP
        WHERE partner_id = ? AND phone = ?
      `).run(totalCents, firstItemName, JSON.stringify(favorites.slice(0, 10)), validName, validName, pid, phone);

      // Registra na timeline de interações
      db.prepare(`
        INSERT INTO pme_customer_timeline (partner_id, customer_phone, type, item_name, amount_cents, details_json, created_at)
        VALUES (?, ?, 'ORDER', ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(pid, phone, firstItemName, totalCents, JSON.stringify(details));

      console.log(`[PME_CRM] Pedido registrado no CRM para ${validName} (${phone}) | Total: R$ ${(totalCents/100).toFixed(2)}`);
    } catch (err) {
      console.error('[PME_CRM] Erro ao registrar pedido no CRM:', err.message);
    }
  }

  /**
   * Registra um agendamento confirmado com sucesso
   */
  recordAppointment(partnerId, rawPhoneOrJid, clientName, details = {}) {
    const db = this._getDb();
    if (!db) return;

    const pid = partnerId || 'usr_google_demo_100';
    const phone = this.formatPhone(rawPhoneOrJid);
    const validName = this.cleanName(clientName, 'Cliente');
    const serviceName = details.serviceName || 'Serviço';
    const priceCents = Number(details.priceCents) || 0;

    try {
      this.getOrCreateCustomer(pid, phone, validName, details.remoteJid);

      const cust = db.prepare('SELECT favorite_items FROM pme_customers WHERE partner_id = ? AND phone = ?').get(pid, phone);
      let favorites = [];
      try { favorites = JSON.parse(cust?.favorite_items || '[]'); } catch (_) {}

      const existing = favorites.find(f => f.name.toLowerCase() === serviceName.toLowerCase());
      if (existing) {
        existing.count = (existing.count || 1) + 1;
      } else {
        favorites.push({ name: serviceName, count: 1, type: 'SERVICE' });
      }
      favorites.sort((a, b) => (b.count || 0) - (a.count || 0));

      db.prepare(`
        UPDATE pme_customers
        SET total_appointments = total_appointments + 1,
            ltv_cents = ltv_cents + ?,
            last_item_name = ?,
            last_interaction_at = CURRENT_TIMESTAMP,
            favorite_items = ?,
            name = CASE WHEN ? != 'Cliente' AND (name = 'Cliente' OR name LIKE 'usr_%') THEN ? ELSE name END,
            updated_at = CURRENT_TIMESTAMP
        WHERE partner_id = ? AND phone = ?
      `).run(priceCents, serviceName, JSON.stringify(favorites.slice(0, 10)), validName, validName, pid, phone);

      db.prepare(`
        INSERT INTO pme_customer_timeline (partner_id, customer_phone, type, item_name, amount_cents, details_json, created_at)
        VALUES (?, ?, 'APPOINTMENT', ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(pid, phone, serviceName, priceCents, JSON.stringify(details));

      console.log(`[PME_CRM] Agendamento registrado no CRM para ${validName} (${phone}) | Serviço: ${serviceName}`);
    } catch (err) {
      console.error('[PME_CRM] Erro ao registrar agendamento no CRM:', err.message);
    }
  }

  /**
   * Constrói o bloco de memória e fatos de CRM para enriquecer a LLM
   */
  generateCrmFact(customer) {
    if (!customer) return '';

    const phone = customer.phone || '';
    const name = customer.name || 'Cliente';
    const hasName = name && name !== 'Cliente' && !name.startsWith('usr_');

    if (customer.isNew) {
      return (
        `[CRM INTELIGENTE - MEMÓRIA HISTÓRICA DO CLIENTE]\n` +
        `• Status: Novo Cliente (Primeiro Contato com o Estabelecimento)\n` +
        `• Telefone Cadastrado: ${phone}\n` +
        `${hasName ? `• Nome Extraído do WhatsApp: ${name}\n` : ''}` +
        `• Histórico: Sem compras ou agendamentos anteriores.\n` +
        `• DIRETRIZ DE ATENDIMENTO PERSONALIZADO:\n` +
        `  - Dê boas-vindas calorosas e faça com que o cliente se sinta bem recebido.\n` +
        `  - ${hasName ? `Cumprimente o cliente chamando-o pelo nome "${name}".` : 'Não pergunte o nome do cliente de imediato, atenda de forma fluida.'}\n` +
        `  - Apresente as opções de catálogo e agendamento de forma clara e convidativa.\n` +
        `  - NUNCA pergunte o telefone do cliente, pois já foi extraído automaticamente.`
      );
    }

    const tierLabel = customer.tier === 'VIP' ? 'Cliente VIP (Alta Frequência)' : 'Cliente Recorrente';
    const lastItemText = customer.last_item_name ? `Última escolha: ${customer.last_item_name} ${customer.timeAgoLabel}.` : '';
    const favoriteText = customer.topFavorite ? `Item mais pedido / favorito: ${customer.topFavorite}.` : '';

    return (
      `[CRM INTELIGENTE - MEMÓRIA HISTÓRICA DO CLIENTE]\n` +
      `• Perfil do Cliente: ${tierLabel}\n` +
      `• Nome: ${name}\n` +
      `• Telefone: ${phone}\n` +
      `• Histórico Consolidado: ${customer.totalInteractions} pedidos/agendamentos realizados | Gasto Total acumulado: R$ ${customer.ltvReais}\n` +
      (lastItemText ? `• ${lastItemText}\n` : '') +
      (favoriteText ? `• ${favoriteText}\n` : '') +
      `• DIRETRIZ DE ATENDIMENTO VIP E PERSONALIZADO:\n` +
      `  - Trate ${name} pelo primeiro nome com entusiasmo e cordialidade de cliente habitual da casa!\n` +
      `  - Exemplo de saudação sugerida: "Olá ${name}, que bom falar com você de novo! ${customer.topFavorite ? `Vai ser ${customer.topFavorite} hoje ou quer experimentar outra opção?` : 'Como posso te ajudar hoje?'}"\n` +
      `  - NUNCA pergunte o nome nem o telefone de ${name}, pois ele já é cliente fidelizado cadastrado no sistema.`
    );
  }

  /**
   * Lista clientes para exibição ou consulta
   */
  listCustomers(partnerId, options = {}) {
    const db = this._getDb();
    if (!db) return [];
    const pid = partnerId || 'usr_google_demo_100';
    const limit = Number(options.limit) || 50;

    try {
      const rows = db.prepare(`
        SELECT * FROM pme_customers 
        WHERE partner_id = ? 
        ORDER BY ltv_cents DESC, updated_at DESC 
        LIMIT ?
      `).all(pid, limit);

      return rows.map(r => this._decorateCustomer(r));
    } catch (err) {
      console.error('[PME_CRM] Erro ao listar clientes:', err.message);
      return [];
    }
  }
}

// Instância singleton para uso em todo o Max Atendente
const pmeCrm = new PmeCrmEngine();

module.exports = {
  PmeCrmEngine,
  pmeCrm
};
