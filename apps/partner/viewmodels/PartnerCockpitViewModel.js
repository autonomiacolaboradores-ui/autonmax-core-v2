/**
 * Partner Cockpit View Model — modo PME (catálogo + status do atendente)
 * Financeiro removido.
 */
'use strict';

class PartnerCockpitViewModel {
  constructor(opts = {}) {
    this.catalogService = opts.catalogService || null;
    this.state = {
      partner: { id: null, businessName: '', category: '' },
      catalog: [],
      aiAgentStatus: 'ACTIVE'
    };
    this.listeners = [];
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  notify() {
    this.listeners.forEach(listener => listener(this.state));
  }

  async initialize(partner) {
    this.state.partner = partner || { id: null, businessName: '', category: '' };
    if (this.catalogService && typeof this.catalogService.list === 'function') {
      try {
        this.state.catalog = await this.catalogService.list(this.state.partner.id) || [];
      } catch (_) {
        this.state.catalog = [];
      }
    }
    this.notify();
  }

  setAiAgentStatus(status) {
    this.state.aiAgentStatus = status;
    this.notify();
  }
}

module.exports = PartnerCockpitViewModel;
