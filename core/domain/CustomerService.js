'use strict';

const { CustomerRepository } = require('../storage/repositories/CustomerRepository');
const { DomainError, formatBrazilianPhone } = require('./RegionalNormalizer');

/**
 * Domain service for end-customer CRM profiles, visit counters, and persistent facts.
 */
class CustomerService {
  /**
   * @param {{ dbManager?: import('../storage/DatabaseManager').DatabaseManager, customerRepository?: CustomerRepository }} deps
   */
  constructor(deps = {}) {
    if (!deps.customerRepository && !deps.dbManager) {
      throw new Error('CustomerService requires customerRepository or dbManager');
    }
    this.dbManager = deps.dbManager || null;
    this.customerRepository =
      deps.customerRepository || new CustomerRepository(deps.dbManager);
  }

  /**
   * Creates or updates a customer scoped to `partnerId`.
   * @param {string} partnerId
   * @param {Record<string, unknown>} data
   */
  upsertCustomer(partnerId, data = {}) {
    if (!partnerId) {
      throw new DomainError('VALIDATION_ERROR', 'partnerId é obrigatório.');
    }
    const channel = String(data.channel || 'whatsapp').trim();
    const externalId = String(data.externalId ?? data.external_id ?? '').trim();
    if (!externalId) {
      throw new DomainError('VALIDATION_ERROR', 'externalId é obrigatório.');
    }

    const formattedPhone = data.phone
      ? formatBrazilianPhone(String(data.phone))
      : externalId.includes('@')
        ? formatBrazilianPhone(externalId)
        : null;

    return this.customerRepository.upsert({
      id: data.id,
      partnerId,
      channel,
      externalId,
      name: data.name ? String(data.name).trim() : null,
      phone: formattedPhone,
      facts: data.facts ?? {},
      visitsCount: data.visitsCount ?? data.visits_count ?? 0,
      lastSeenAt: data.lastSeenAt ?? data.last_seen_at,
    });
  }

  /**
   * Fetches a customer strictly belonging to `partnerId`.
   * @param {string} partnerId
   * @param {string} customerId
   */
  getCustomer(partnerId, customerId) {
    const customer = this.customerRepository.findById(customerId, { partnerId });
    if (!customer) {
      throw new DomainError(
        'CUSTOMER_NOT_FOUND',
        `Cliente "${customerId}" não encontrado para este parceiro.`,
        { partnerId, customerId },
        404
      );
    }
    return customer;
  }

  /**
   * Finds a customer by channel + externalId.
   * @param {string} partnerId
   * @param {string} channel
   * @param {string} externalId
   */
  findByExternal(partnerId, channel, externalId) {
    return this.customerRepository.findByExternal(partnerId, channel, externalId);
  }

  /**
   * Lists customers for a partner.
   * @param {string} partnerId
   * @param {{ limit?: number, offset?: number }} [options]
   */
  listCustomers(partnerId, options = {}) {
    return this.customerRepository.listByPartner(partnerId, options);
  }

  /**
   * Merges CRM facts and/or increments visit counter inside a transaction.
   * @param {string} partnerId
   * @param {string} customerId
   * @param {{ factsPatch?: Record<string, unknown>, incrementVisit?: boolean, seenAt?: string }} [options]
   */
  recordInteraction(partnerId, customerId, options = {}) {
    const run = () => {
      let customer = this.getCustomer(partnerId, customerId);
      if (options.factsPatch && Object.keys(options.factsPatch).length > 0) {
        customer = this.customerRepository.updateFacts(
          customerId,
          options.factsPatch,
          { partnerId }
        );
      }
      if (options.incrementVisit) {
        customer = this.customerRepository.incrementVisits(
          customerId,
          options.seenAt || new Date().toISOString(),
          { partnerId }
        );
      }
      return customer;
    };

    return this.dbManager ? this.dbManager.transaction(run) : run();
  }
}

module.exports = { CustomerService };
