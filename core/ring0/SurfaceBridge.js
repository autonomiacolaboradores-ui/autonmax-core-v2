'use strict';

const { globalEventBus } = require('../ring1/EventBus');

/**
 * SurfaceBridge - Ring 0
 * SPRINT 3: EVENT BUS & PUBLISHER LOCAL
 * 
 * Conecta os listeners de entrada/saída (WhatsApp, Web, SSE) ao EventBus.
 * Garante que mensagens passem pelo mesmo canal padronizado de eventos.
 */
class SurfaceBridge {
  constructor(whatsappDriver, httpServer) {
    this.whatsappDriver = whatsappDriver;
    this.httpServer = httpServer;
    this.bus = globalEventBus;
  }

  boot() {
    this._attachWhatsAppListeners();
    this._attachHttpListeners();
    this._attachEventBusResponders();
    console.log('[SurfaceBridge] Inicializado e conectado ao EventBus (Pub/Sub) assíncrono.');
  }

  _attachWhatsAppListeners() {
    if (!this.whatsappDriver) return;
    
    // ATENÇÃO: O wrapping aqui foi descontinuado porque quebrava drivers de múltiplas sessões (Native Auth).
    // Agora o disparo para o EventBus ocorre diretamente no HttpServer.js (globalHandlers).
  }

  _attachHttpListeners() {
    // Escuta evento de novo QR Code e dispara via SSE
    this.bus.on('whatsapp:qr_updated', (data) => {
      if (this.httpServer && typeof this.httpServer.broadcastSse === 'function') {
        this.httpServer.broadcastSse('qr_update', data.qrDataUrl);
      }
    });

    // subscription:status_changed -> Notifica a UI sobre alteração nos dias do Trial
    this.bus.on('subscription:status_changed', (data) => {
      if (this.httpServer && typeof this.httpServer.broadcastSse === 'function') {
        this.httpServer.broadcastSse('subscription_update', data);
      }
    });
  }

  _attachEventBusResponders() {
    // attendant:reply_generated -> Envia a resposta pronta de volta para a fila do WhatsApp
    this.bus.on('attendant:reply_generated', async (data) => {
      const { remoteJid, text } = data;
      if (this.whatsappDriver && this.whatsappDriver.sock) {
        try {
          await this.whatsappDriver.sock.sendMessage(remoteJid, { text });
          // console.log(`[SurfaceBridge] Resposta enviada via EventBus (Pub/Sub) para ${remoteJid}`);
        } catch (err) {
          console.error('[SurfaceBridge] Erro ao enviar resposta para o WhatsApp via EventBus:', err);
        }
      }
    });
  }
}

module.exports = { SurfaceBridge };
