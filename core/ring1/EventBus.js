'use strict';

const EventEmitter = require('events');

/**
 * EventBus - Ring 1
 * SPRINT 3: EVENT BUS & PUBLISHER LOCAL
 * 
 * Desacopla a comunicação entre componentes usando o Event Bus assíncrono interno.
 * Emissão não-bloqueante via setImmediate para garantir que o emissor devolva
 * a resposta imediatamente sem esperar o processamento dos listeners.
 */
class EventBus extends EventEmitter {
  constructor() {
    super();
    // Aumenta o limite de listeners para evitar warnings de memory leak em alta concorrência
    this.setMaxListeners(50);
  }

  /**
   * Emite um evento de forma assíncrona não-bloqueante.
   * @param {string} event O nome do evento oficial padronizado
   * @param  {...any} args Dados do payload
   */
  emitAsync(event, ...args) {
    setImmediate(() => {
      try {
        this.emit(event, ...args);
      } catch (err) {
        console.error(`[EventBus] Erro ao processar evento ${event}:`, err);
      }
    });
  }
}

// Singleton global para a aplicação (Ring 0 / Ring 1 / Ring 2)
const globalEventBus = new EventBus();

module.exports = { EventBus, globalEventBus };
