class WhatsAppBridge {
  constructor(orchestrator) {
    this.orchestrator = orchestrator;
    this.status = 'DISCONNECTED';
    this.secretaryMode = false;
    this.customMessage = '';
    this.userName = 'Administrador';
    this.authInfoPath = './workspace/auth_info';
  }

  // Simula ou utiliza a inicialização via Baileys com fallback gracioso
  initSession() {
    this.status = 'WAITING_SCAN';
    // String mockada no formato base64 para representar o fallback funcional sem depender de pacotes nativos
    const base64QR = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII='; 
    return {
      status: this.status,
      qrDataUrl: base64QR,
      message: 'Escaneie o QR Code para conectar a AutonomIA'
    };
  }

  setSecretaryMode(active, customMessage = 'Ele está ocupado no momento.', userName = 'Administrador') {
    this.secretaryMode = active;
    this.customMessage = customMessage;
    this.userName = userName;
    return { secretaryMode: this.secretaryMode, userName: this.userName };
  }

  onIncomingMessage(text, customerId) {
    if (this.status !== 'CONNECTED') {
      throw new Error('[WA_BRIDGE_FAULT] WhatsApp não conectado.');
    }

    if (this.secretaryMode) {
      return {
        from: customerId,
        text,
        aiResponse: `Olá! Sou o MAX, atendente virtual da empresa ${this.userName}. ${this.customMessage} Mensagem recebida com sucesso!`
      };
    }

    // Processamento normal (fallback CognitiveEngine)
    return {
      from: customerId,
      text,
      aiResponse: `[AUTONOMIA-WA-REPLY] Processando seu pedido: "${text}"`
    };
  }

  connect() {
    this.status = 'CONNECTED';
    return true;
  }

  disconnect() {
    this.status = 'DISCONNECTED';
    return true;
  }

  getPhoneStatus() {
    return this.status;
  }
}
module.exports = WhatsAppBridge;
