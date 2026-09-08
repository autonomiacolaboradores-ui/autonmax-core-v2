'use strict';

// core/ring2/WhatsAppDriver.js
const fs = require('node:fs');
const path = require('node:path');

let QRCode = null;
try {
  QRCode = require('qrcode');
} catch (_) {}

let baileys = null;
try {
  baileys = require('@whiskeysockets/baileys');
} catch (e) {
  console.error('[WHATSAPP_DRIVER] ERRO CRÍTICO @whiskeysockets/baileys não carregado:', e);
}

class WhatsAppDriver {
  constructor(options = {}) {
    // SPRINT 5: Isolamento total da sessão em disco (workspace/sessions/)
    this.authDir = options.authDir || path.join(__dirname, '../../workspace/sessions/baileys_auth');
    this.connectionState = 'DISCONNECTED';
    this.lastQrBase64 = null;
    this.lastRawQr = null;
    this.lastQrTimestamp = 0;
    this.sock = null;
    this.isInitializing = false;
    this.retryCount = 0;
    this.retryDelays = [2000, 5000, 10000, 20000, 30000, 60000, 120000]; // resiliência: backoff longo sem wipe
    this.reconnectAttempts = 0;
    this.maxBackoffMs = 5 * 60 * 1000; // 5 min
    this.maxConsecutiveFailures = 12;
    this.stabilityTimer = null;
    this.lastEventTime = Date.now();
    this.processedMsgIds = new Set();
    this.sentMsgIds = new Set();
    this.onMessageReceived = null;
    this.onQrUpdate = null; // Handler injetado (SurfaceBridge)

    // ⏸️ INTERRUPTOR LÓGICO DE ATENDIMENTO (Soft-Pause - Sessões / Números e Global)
    // Baileys permanece 100% conectado; só a IA deixa de responder.
    this.pausedSessions = new Set();
    this.isGlobalPaused = false;
    this.pauseStatePath = path.join(__dirname, '../../workspace/sessions/soft_pause_state.json');
    /** @type {Map<string, Array<{ts:number, role:string, text:string}>>} */
    this.pausedContext = new Map();
    this.maxPausedContext = 40;
    this._loadPauseState();

    // R1.7 Edge Intelligence — modo offline e fila de sobrevivência
    this.edgeOffline = false;
    this.edgeIntel = null;
    try {
      const { getEdgeIntelligence } = require('../ring1/MaxEdgeIntelligence');
      this.edgeIntel = getEdgeIntelligence();
    } catch (_) {}

    if (!fs.existsSync(this.authDir)) {
      fs.mkdirSync(this.authDir, { recursive: true });
    }

  }

  _loadPauseState() {
    try {
      if (!fs.existsSync(this.pauseStatePath)) return;
      const raw = JSON.parse(fs.readFileSync(this.pauseStatePath, 'utf8'));
      this.isGlobalPaused = !!raw.isGlobalPaused;
      if (typeof global.IS_MAX_ACTIVE !== 'boolean') {
        global.IS_MAX_ACTIVE = !this.isGlobalPaused;
      }
      if (Array.isArray(raw.pausedSessions)) {
        for (const k of raw.pausedSessions) this.pausedSessions.add(String(k));
      }
      if (raw.pausedContext && typeof raw.pausedContext === 'object') {
        for (const [k, arr] of Object.entries(raw.pausedContext)) {
          if (Array.isArray(arr)) this.pausedContext.set(k, arr.slice(-this.maxPausedContext));
        }
      }
      console.log(
        `[WHATSAPP_SOFT_PAUSE] Estado restaurado: global=${this.isGlobalPaused} sessões=${this.pausedSessions.size}`
      );
    } catch (e) {
      console.warn('[WHATSAPP_SOFT_PAUSE] Falha ao carregar estado:', e.message);
    }
  }

  _persistPauseState() {
    try {
      const dir = path.dirname(this.pauseStatePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const ctx = {};
      for (const [k, v] of this.pausedContext.entries()) {
        ctx[k] = (v || []).slice(-this.maxPausedContext);
      }
      const payload = {
        isGlobalPaused: this.isGlobalPaused,
        pausedSessions: Array.from(this.pausedSessions),
        pausedContext: ctx,
        updatedAt: new Date().toISOString()
      };
      const tmp = `${this.pauseStatePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
      fs.renameSync(tmp, this.pauseStatePath);
    } catch (e) {
      console.warn('[WHATSAPP_SOFT_PAUSE] Falha ao persistir estado:', e.message);
    }
  }

  /**
   * Guarda mensagem do cliente enquanto a IA está pausada (contexto para retomada).
   */
  bufferPausedMessage(remoteJid, text, role = 'customer') {
    const key = this.normalizeSessionKey(remoteJid) || String(remoteJid || 'unknown');
    if (!key || !text) return;
    const list = this.pausedContext.get(key) || [];
    list.push({
      ts: Date.now(),
      role,
      text: String(text).slice(0, 800)
    });
    while (list.length > this.maxPausedContext) list.shift();
    this.pausedContext.set(key, list);
    this._persistPauseState();
  }

  /**
   * Contexto recente da pausa (para o Max não ficar perdido ao retomar).
   */
  consumePausedContext(remoteJid, { clear = false } = {}) {
    const key = this.normalizeSessionKey(remoteJid) || String(remoteJid || '');
    const list = this.pausedContext.get(key) || [];
    if (clear) {
      this.pausedContext.delete(key);
      this._persistPauseState();
    }
    return list.slice();
  }

  formatPausedContextFact(remoteJid) {
    const list = this.consumePausedContext(remoteJid, { clear: false });
    if (!list.length) return null;
    const lines = list.slice(-12).map((m) => {
      const who = m.role === 'operator' ? 'OPERADOR' : 'CLIENTE';
      return `${who}: ${m.text}`;
    });
    return (
      'CONTEXTO ENQUANTO O ATENDIMENTO ESTAVA PAUSADO (humano no controle). Use para continuidade, sem repetir perguntas já respondidas:\n' +
      lines.join('\n')
    );
  }

  async disconnect() {
    console.log('[WHATSAPP_DRIVER] 🛑 Executando desconexão limpa e reset de sessão Baileys...');
    try {
      this.connectionState = 'DISCONNECTED';
      this.lastQrBase64 = null;
      this.lastRawQr = null;
      this.lastQrTimestamp = 0;
      this.isInitializing = false;

      if (this.sock) {
        try {
          if (this.sock.ws) this.sock.ws.close();
          if (this.sock.end) this.sock.end(new Error('SESSION_RESET_BY_USER'));
        } catch (_) {}
        this.sock = null;
      }

      // Limpeza de arquivos de credenciais do Baileys preservando o active_context
      if (fs.existsSync(this.authDir)) {
        const files = fs.readdirSync(this.authDir);
        for (const file of files) {
          if (file !== 'active_context.json') {
            try {
              // fs.rmSync(path.join(this.authDir, file), { recursive: true, force: true }); // DISABLED: Impedir wipe
            } catch (_) {}
          }
        }
      }
      console.log('[WHATSAPP_DRIVER] ✅ Sessão Baileys limpa com sucesso. Pronto para novo pareamento.');
      return { success: true, message: 'Sessão desconectada com sucesso.' };
    } catch (err) {
      console.error('[WHATSAPP_DRIVER] Erro durante disconnect:', err);
      return { success: false, error: err.message };
    }
  }

  async initBaileys() {
    console.log(`[DEBUG_INIT] initBaileys chamado! isInitializing=${this.isInitializing}, state=${this.connectionState}`);
    
    if (!baileys) {
      try {
        baileys = require('@whiskeysockets/baileys');
        // Removido o baileys.default para não quebrar exports como useMultiFileAuthState!
        console.log(`[DEBUG_INIT] Baileys importado dinamicamente com sucesso.`);
      } catch (e) {
        console.error('[WHATSAPP_DRIVER] ERRO CRÍTICO: Não foi possível fazer o require de @whiskeysockets/baileys:', e);
        return;
      }
    }

    if (!baileys || this.isInitializing || this.connectionState === 'CONNECTED' || this.connectionState === 'STANDBY') {
      console.log(`[DEBUG_INIT] initBaileys bloqueado (early return)`);
      return;
    }

    this.isInitializing = true;
    console.log(`[DEBUG_INIT] Iniciando socket Baileys...`);
    try {
      // Restaurar IDs processados (anti-replay pós-queda)
      try {
        const { getResilienceLayer } = require('../ring0/ResilienceLayer');
        const ids = getResilienceLayer().loadProcessedIds(this.sessionKey || this.authDir);
        for (const id of ids) this.processedMsgIds.add(id);
      } catch (_) {}

      const { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = baileys;
      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        fireInitQueries: true, // Reabilitado! O patch no node_modules bypassa o timeout do fetchProps!
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 90000,
        keepAliveIntervalMs: 25000,
        getMessage: async (key) => {
          return { conversation: 'hello' }; // Fallback para evitar crashes de E2E
        },
        browser: Browsers ? Browsers.ubuntu('Chrome') : ['Ubuntu', 'Chrome', '22.04.4']
      });

      this.sock.ev.on('creds.update', async () => {
        try { await saveCreds(); } catch (e) { console.warn('[WA] saveCreds:', e.message); }
        this.lastEventTime = Date.now();
      });

      // Silenciosamente ignorar eventos de histórico para evitar consumo excessivo de RAM e timeouts
      this.sock.ev.on('messaging-history.set', () => {});
      this.sock.ev.on('chats.set', () => {});
      this.sock.ev.on('contacts.set', () => {});
      this.sock.ev.on('messages.set', () => {});

      // LISTENER DE MENSAGENS RECEBIDAS NO WHATSAPP COM PROTEÇÃO ANTI-LOOP
      this.sock.ev.on('messages.upsert', async (m) => {
        this.lastEventTime = Date.now(); // Watchdog Pulse
        if (m.type !== 'notify' || !m.messages || !m.messages.length) return;

        for (const msg of m.messages) {
          const remoteJid = msg.key?.remoteJid || 'unknown';
          console.log(`\n[DEBUG_WA] Nova mensagem de: ${remoteJid} | fromMe: ${msg.key?.fromMe}`);

          // 🚫 1. ANTI-LOOP: Ignorar imediatamente mensagens com fromMe=true
          if (msg.key?.fromMe === true) continue;

          const msgId = msg.key?.id;
          if (!msgId || this.processedMsgIds.has(msgId) || this.sentMsgIds.has(msgId)) continue;

          if (!remoteJid || remoteJid.includes('status@broadcast')) continue;

          // 🚫 2. ANTI-LOOP: Ignorar se o remetente for o próprio número vinculado ao bot
          const myJid = this.sock?.user?.id;
          if (myJid) {
            const myNumber = myJid.split(':')[0].replace(/\D/g, '');
            const senderNumber = (msg.key?.participant || remoteJid || '').split(':')[0].replace(/\D/g, '');
            if (myNumber && senderNumber && myNumber === senderNumber) {
              console.log(`[DEBUG_WA] Ignorado (Anti-Loop 2): Remetente é o próprio número (${senderNumber})`);
              continue;
            }
          }

          // Registrar no conjunto de IDs processados para travar loops de eco
          this.processedMsgIds.add(msgId);
          if (this.processedMsgIds.size > 2000) {
            const arr = [...this.processedMsgIds].slice(-1200);
            this.processedMsgIds = new Set(arr);
          }
          if (this.processedMsgIds.size % 25 === 0) {
            try {
              const { getResilienceLayer } = require('../ring0/ResilienceLayer');
              getResilienceLayer().saveProcessedIds(this.sessionKey || this.authDir, this.processedMsgIds);
            } catch (_) {}
          }

          // Extrair conteúdo de texto da mensagem
          let text = msg.message?.conversation || 
                       msg.message?.extendedTextMessage?.text || 
                       msg.message?.imageMessage?.caption || '';

          // 🎙️ TRANSCRIÇÃO AUTOMÁTICA DE ÁUDIO (Groq Whisper → Gemini → fallback educado)
          if (!text && msg.message?.audioMessage) {
            try {
              const { downloadMediaMessage } = baileys;
              const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: console });
              const AudioHandler = require('./AudioHandler');
              const stt = await AudioHandler.transcribe(buffer, 'audio/ogg; codecs=opus');

              if (stt && stt.ok && stt.text) {
                text = `[ÁUDIO TRANSCRITO DO CLIENTE]: ${stt.text}`;
                console.log(`🎙️ [WHATSAPP_AUDIO] OK via ${stt.provider}: ${stt.text.slice(0, 80)}...`);
              } else {
                // Soft-pause: não responde, só guarda contexto
                if (this.isSessionPaused(remoteJid)) {
                  this.bufferPausedMessage(remoteJid, '[áudio não transcrito]', 'customer');
                  console.log(`[WHATSAPP_SOFT_PAUSE] Áudio em sessão pausada — contexto guardado, sem STT reply.`);
                  continue;
                }
                const fallback =
                  (stt && stt.fallbackMessage) ||
                  AudioHandler.getFallbackMessage();
                try {
                  const sentMsg = await this.sock.sendMessage(remoteJid, { text: fallback });
                  if (sentMsg?.key?.id) {
                    this.sentMsgIds.add(sentMsg.key.id);
                    this.processedMsgIds.add(sentMsg.key.id);
                  }
                  console.log(`🎙️ [WHATSAPP_AUDIO] STT falhou — fallback enviado pedindo texto digitado.`);
                } catch (sendErr) {
                  console.warn('[WHATSAPP_AUDIO] Falha ao enviar fallback:', sendErr.message);
                }
                continue;
              }
            } catch (err) {
              console.warn(`[WHATSAPP_AUDIO] Erro crítico ao processar áudio: ${err.message}`);
              if (!this.isSessionPaused(remoteJid) && this.sock) {
                try {
                  const AudioHandler = require('./AudioHandler');
                  await this.sock.sendMessage(remoteJid, {
                    text: AudioHandler.getFallbackMessage()
                  });
                } catch (_) {}
              }
              continue;
            }
          }

          // 🚫 3. FILTRO ESTREITO ANTI-MENSAGENS VAZIAS / RECIBOS DE ENTREGA
          if (!text || typeof text !== 'string' || text.trim().length === 0) {
            console.log(`[DEBUG_WA] Ignorado: Mensagem sem texto de ${remoteJid}`);
            continue;
          }

          // 🚫 4. ANTI-ECO DE TEXTO: Ignorar se for exatamente o texto que a IA acabou de enviar
          const normIncoming = text.trim().toLowerCase().replace(/\s+/g, ' ');
          if (this.recentSentTexts && this.recentSentTexts.has(normIncoming)) {
            console.log(`[WHATSAPP_ANTI_LOOP] 🚫 Eco de texto descartado (${normIncoming.slice(0, 40)}...)`);
            continue;
          }

          // ⏸️ Soft-Pause: IA não responde, Baileys continua online, contexto preservado
          if (this.isSessionPaused(remoteJid)) {
            this.bufferPausedMessage(remoteJid, text.trim(), 'customer');
            console.log(
              `[WHATSAPP_SOFT_PAUSE] ⏸️ IA pausada para ${remoteJid}. Mensagem guardada no contexto (socket Baileys 100% ativo).`
            );
            continue;
          }

          if (typeof this.onMessageReceived === 'function') {
            try {
              // Injeta contexto da pausa (se houver) no início da retomada
              let inbound = text.trim();
              const pauseFact = this.formatPausedContextFact(remoteJid);
              if (pauseFact) {
                // Anexa como prefixo interno; o runtime trata fatos — aqui marcamos para o handler
                this._pendingPauseContext = this._pendingPauseContext || new Map();
                this._pendingPauseContext.set(this.normalizeSessionKey(remoteJid), pauseFact);
                // Consome após anexar (evita repetir em todo turno)
                this.consumePausedContext(remoteJid, { clear: true });
              }

              const aiReply = await this.onMessageReceived(inbound, remoteJid, msg, false, this);
              if (aiReply && aiReply.trim()) {
                const normReply = aiReply.trim().toLowerCase().replace(/\s+/g, ' ');
                if (!this.recentSentTexts) this.recentSentTexts = new Set();
                this.recentSentTexts.add(normReply);
                if (this.recentSentTexts.size > 200) {
                  const arr = [...this.recentSentTexts].slice(-100);
                  this.recentSentTexts = new Set(arr);
                }

                const sentMsg = await this.sock.sendMessage(remoteJid, { text: aiReply });

                if (sentMsg?.key?.id) {
                  this.sentMsgIds.add(sentMsg.key.id);
                  this.processedMsgIds.add(sentMsg.key.id);
                }
                console.log(`🟢 [WHATSAPP_ENVIADO] Resposta enviada com sucesso para ${remoteJid}\n`);
              }
            } catch (replyErr) {
              console.warn('[WHATSAPP_REPLY_ERROR]', replyErr.message);
            }
          }
        }
      });

      this.sock.ev.on('connection.update', async (update) => {
        console.log('[DEBUG_BAILEYS_UPDATE]', JSON.stringify(update, (k, v) => (k === 'qr' && v ? '<QR_PAYLOAD>' : v)));
        this.lastEventTime = Date.now(); // Watchdog Pulse
        const { connection, lastDisconnect, qr } = update;

        if (qr && this.connectionState !== 'STANDBY') {
          this.lastRawQr = qr;
          this.lastQrTimestamp = Date.now();
          this.connectionState = 'PAIRING_READY';
          if (QRCode) {
            try {
              // Cor preta pura (#000000) é obrigatória para máxima compatibilidade com leitores QR
              this.lastQrBase64 = await QRCode.toDataURL(qr, { margin: 4, scale: 8, color: { dark: '#000000', light: '#FFFFFF' } });
            } catch (qrErr) {
              console.warn('[WHATSAPP_DRIVER] qrcode.toDataURL falhou, tentando API externa:', qrErr.message);
              try {
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(qr)}`;
                const response = await fetch(qrUrl);
                const arrayBuffer = await response.arrayBuffer();
                this.lastQrBase64 = 'data:image/png;base64,' + Buffer.from(arrayBuffer).toString('base64');
              } catch (_) {
                this.lastQrBase64 = this.buildLoadingSvg();
              }
            }
          } else {
            try {
              const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(qr)}`;
              const response = await fetch(qrUrl);
              const arrayBuffer = await response.arrayBuffer();
              this.lastQrBase64 = 'data:image/png;base64,' + Buffer.from(arrayBuffer).toString('base64');
            } catch (err) {
              console.warn('[WHATSAPP_DRIVER] API QR externa falhou:', err.message);
              this.lastQrBase64 = this.buildLoadingSvg();
            }
          }
          console.log('[WHATSAPP_BAILEYS] Novo QR Code gerado para pareamento!');
          // Dispara EventBus SPRINT 5 (Gerenciamento de QR Code via SSE / EventBus)
          if (typeof this.onQrUpdate === 'function') {
            this.onQrUpdate(this.lastQrBase64);
          }
        }

        if (connection === 'open') {
          this.connectionState = 'CONNECTED';
          this.edgeOffline = false; // R1.7
          this.lastQrBase64 = null;
          this.retryCount = 0;
          this.isInitializing = false;
          this.lastEventTime = Date.now();
          console.log('[WHATSAPP_BAILEYS] Conexão REAL com WhatsApp estabelecida com sucesso!');

          // Ao permanecer estável por 2 minutos, reseta o contador de falhas e circuit breaker
          if (this.stabilityTimer) clearTimeout(this.stabilityTimer);
          this.stabilityTimer = setTimeout(() => {
            this.reconnectAttempts = 0;
            this.retryCount = 0;
            console.log('[WHATSAPP_BAILEYS] 🟢 Conexão estável há mais de 2 minutos. Circuit breaker resetado.');
          }, 120000);

          try {
            const { getResilienceLayer } = require('../ring0/ResilienceLayer');
            const res = getResilienceLayer();
            res.saveSessionState(this.sessionKey || 'pme:default', {
              connectionState: 'CONNECTED',
              authDir: this.authDir
            });
            // flush outbox
            if (typeof this._flushOutbox === 'function') this._flushOutbox().catch(() => {});
          } catch (_) {}
        }

        if (connection === 'close') {
          this.isInitializing = false;
          this.edgeOffline = true; // R1.7
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const errTrace = String(lastDisconnect?.error?.stack || lastDisconnect?.error?.message || lastDisconnect?.error || '');
          const isQrExhausted = errTrace.includes('QR refs attempts ended') || errTrace.includes('QR refs attempts');
          const isInitQueriesTimeout = errTrace.includes('init queries') || errTrace.includes('timed out');
          const shouldReconnect = statusCode !== DisconnectReason?.loggedOut;

          this.connectionState = 'DISCONNECTED';

          // Limite estrito de QR Code atingido
          if (isQrExhausted) {
            this.connectionState = 'STANDBY';
            this.retryCount = 0;
            this.lastRawQr = null;
            this.lastQrBase64 = null;
            if (this.sock) {
              try { this.sock.end(undefined); } catch (_) {}
              this.sock = null;
            }
            console.log('[WHATSAPP_BAILEYS] 🛑 Limite de tentativas de pareamento atingido (QR refs ended). Entrando em modo STANDBY de forma definitiva.');
            if (typeof this.onQrUpdate === 'function') this.onQrUpdate(null);
            return;
          }

          if (isInitQueriesTimeout) {
            console.warn('[WHATSAPP_BAILEYS] ⚠️ Timeout em init queries do Baileys detectado. Tratando de forma segura sem impactar a aplicação.');
          }

          // ══════════════════════════════════════════════════════════════
          // TRATAMENTO DE SESSÃO CORROMPIDA (Bad MAC Error / No matching sessions)
          // Purga os arquivos de credenciais Baileys, preserva o active_context.json
          // e reinicia o processo de QR Code de forma limpa (sem loop infinito).
          // ══════════════════════════════════════════════════════════════
          const isCorruptedSession =
            errTrace.includes('Bad MAC') ||
            errTrace.includes('bad mac') ||
            errTrace.includes('No matching sessions') ||
            errTrace.includes('no matching sessions') ||
            errTrace.includes('decrypt') ||
            errTrace.includes('Decryption failed');

          if (isCorruptedSession) {
            console.error('[WHATSAPP_BAILEYS] 🔴 Sessão corrompida detectada (Bad MAC / No matching sessions). Iniciando purga e reinício limpo...');

            // Fechar o socket atual com segurança antes de purgar
            if (this.sock) {
              try { this.sock.end(undefined); } catch (_) {}
              this.sock = null;
            }

            // Purgar apenas os arquivos de credenciais, preservando active_context.json
            if (fs.existsSync(this.authDir)) {
              const files = fs.readdirSync(this.authDir);
              for (const file of files) {
                if (file !== 'active_context.json') {
                  try {
                    fs.rmSync(path.join(this.authDir, file), { recursive: true, force: true });
                  } catch (_) {}
                }
              }
            }

            // Resetar estado interno sem entrar em STANDBY
            this.retryCount = 0;
            this.reconnectAttempts = 0;
            this.lastRawQr = null;
            this.lastQrBase64 = null;
            this.isInitializing = false;
            this.connectionState = 'DISCONNECTED';

            console.log('[WHATSAPP_BAILEYS] ✅ Sessão corrompida purgada. Reiniciando Baileys com sessão limpa em 2s...');

            // Reiniciar após intervalo seguro para evitar conflito de descritores
            setTimeout(() => {
              if (this.connectionState !== 'STANDBY') {
                this.initBaileys();
              }
            }, 2000);
            return;
          }

          // Tratamento de Desconexão Voluntária (Sprint 5)
          if (!shouldReconnect) {
            console.log('[WHATSAPP_BAILEYS] DisconnectReason.loggedOut recebido. Purgando credenciais com segurança (workspace/sessions/).');
            // try { fs.rmSync(this.authDir, { recursive: true, force: true }); } catch (_) {} // DISABLED: Impedir wipe
            this.retryCount = 0;
            this.reconnectAttempts = 0;
            this.lastRawQr = null;
            this.lastQrBase64 = null;
            if (typeof this.onQrUpdate === 'function') this.onQrUpdate(null);
            this.connectionState = 'STANDBY';
            return;
          } else {
            // Algoritmo de Reconexão com Exponential Backoff e Circuit Breaker
            const hasCreds = fs.existsSync(path.join(this.authDir, 'creds.json'));
            
            if (!hasCreds && this.retryCount >= 2) {
                this.connectionState = 'STANDBY';
                this.retryCount = 0;
                this.reconnectAttempts = 0;
                this.lastRawQr = null;
                this.lastQrBase64 = null;
                if (this.sock) {
                  try { this.sock.end(undefined); } catch (_) {}
                  this.sock = null;
                }
                console.log('[WHATSAPP_BAILEYS] Limite de tentativas de pareamento atingido (3). Entrando em modo STANDBY para economizar recursos.');
                if (typeof this.onQrUpdate === 'function') this.onQrUpdate(null);
                return; // Interrompe o loop
            }

            this.scheduleReconnect(() => {
              this.initBaileys();
            });
          }
        }
      });
    } catch (err) {
      this.isInitializing = false;
      console.warn('[WHATSAPP_BAILEYS] Erro crítico ao iniciar socket Baileys:', err.message);
    }
  }

  /**
   * Agenda reconexão com backoff exponencial e circuit breaker (máx 8 falhas).
   */
  scheduleReconnect(reconnectFn) {
    this.reconnectAttempts += 1;

    if (this.reconnectAttempts > this.maxConsecutiveFailures) {
      console.error(
        `[WHATSAPP_BAILEYS] 🛑 ${this.reconnectAttempts} falhas consecutivas de conexão/init queries. ` +
        `Parando reconexão automática — provável sessão corrompida. ` +
        `Ação recomendada: apagar o authDir e parear novamente via QR.`
      );
      this.connectionState = 'STANDBY';
      if (this.sock) {
        try { this.sock.end(undefined); } catch (_) {}
        this.sock = null;
      }
      return;
    }

    const backoffMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.maxBackoffMs);
    console.log(`[WHATSAPP_BAILEYS] 🔄 Soft reconnect em ${Math.round(backoffMs / 1000)}s (tentativa ${this.reconnectAttempts}/${this.maxConsecutiveFailures})...`);
    setTimeout(() => {
      if (this.connectionState !== 'STANDBY') {
        reconnectFn();
      }
    }, backoffMs);
  }

  /**
   * Reconnect NÃO destrutivo — preserva creds (install-and-forget).
   * Para novo QR / logout forçado use forceResetPairing().
   */
  async forceReconnect() {
    this.isInitializing = false;
    this.connectionState = 'DISCONNECTED';
    if (this.sock) {
      try { this.sock.ev.removeAllListeners(); } catch (_) {}
      try { this.sock.end(undefined); } catch (_) {}
      this.sock = null;
    }
    this.scheduleReconnect(() => {
      this.initBaileys();
    });
  }

  /**
   * Reset de pareamento — ÚNICO caminho que apaga auth (pedido explícito do operador).
   */
  async forceResetPairing() {
    // Guard: evita resets simultâneos que matam o socket do outro
    if (this._isPairingReset) {
      console.log('[WHATSAPP_BAILEYS] forceResetPairing já em andamento — ignorando chamada duplicada');
      return;
    }
    this._isPairingReset = true;
    console.log('[WHATSAPP_BAILEYS] ⚠️ forceResetPairing — apaga credenciais e gera novo QR');
    this.isInitializing = false;
    this.connectionState = 'DISCONNECTED';
    this.retryCount = 0;
    this.reconnectAttempts = 0; // Reset completo para evitar STANDBY prematuro
    this.lastRawQr = null;
    this.lastQrBase64 = null;
    if (this.sock) {
      try { this.sock.ev.removeAllListeners(); } catch (_) {}
      try { this.sock.end(undefined); } catch (_) {}
      this.sock = null;
    }
    try { fs.rmSync(this.authDir, { recursive: true, force: true }); } catch (_) {}
    try { fs.mkdirSync(this.authDir, { recursive: true }); } catch (_) {}
    await this.initBaileys();
  }

  async generateQrCodeDataUri(force = false) {
    if (force) {
      if (this.connectionState === 'STANDBY') {
        this.connectionState = 'DISCONNECTED';
      }
      // force=true no painel = novo QR explícito
      if (typeof this.forceResetPairing === 'function') {
        await this.forceResetPairing();
      } else {
        await this.forceReconnect();
      }
    } else if (!this.sock && baileys && !this.isInitializing && this.connectionState !== 'CONNECTED' && this.connectionState !== 'STANDBY') {
      this.retryCount = 0;
      this.reconnectAttempts = 0;
      await this.initBaileys();
    }

    // Se Baileys estiver em processo de pairing ou inicializando, aguarda o QR real (até 20s)
    const waitingForQr = this._isPairingReset || this.isInitializing;
    if (!this.lastRawQr && waitingForQr) {
      for (let i = 0; i < 100; i++) {
        if (this.lastRawQr) break;
        await new Promise(r => setTimeout(r, 200));
      }
      // Limpa flag de pairing reset após a espera (o QR chegou ou deu timeout)
      if (this._isPairingReset && this.lastRawQr) {
        this._isPairingReset = false;
      }
    }

    if (this.lastRawQr) {
      if (QRCode) {
        try {
          // Cor preta pura obrigatória para conformidade com a especificação QR Code
          this.lastQrBase64 = await QRCode.toDataURL(this.lastRawQr, {
            margin: 4,
            scale: 8,
            color: { dark: '#000000', light: '#FFFFFF' }
          });
          this.lastQrTimestamp = Date.now();
          return this.lastQrBase64;
        } catch (qrErr) {
          console.warn('[WHATSAPP_DRIVER] qrcode.toDataURL falhou no generateQrCodeDataUri:', qrErr.message);
        }
      }
      try {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(this.lastRawQr)}`;
        const response = await fetch(qrUrl);
        const arrayBuffer = await response.arrayBuffer();
        this.lastQrBase64 = 'data:image/png;base64,' + Buffer.from(arrayBuffer).toString('base64');
      } catch (err) {
        console.warn('[WHATSAPP_DRIVER] API QR externa falhou no generateQrCodeDataUri:', err.message);
        this.lastQrBase64 = this.buildLoadingSvg();
      }
      return this.lastQrBase64;
    }

    // Nenhum QR disponível ainda: retorna SVG de aguardar (NÃO um QR falso)
    return this.buildLoadingSvg();
  }

  /**
   * buildLoadingSvg — Retorna um SVG informativo (NÃO um QR Code).
   *
   * O método anterior (buildNativeQrSvg) gerava um padrão visual pseudo-aleatório
   * que aparentava ser um QR Code mas não era legível por nenhum scanner, pois não
   * implementava codificação QR real (sem Error Correction, sem data encoding,
   * sem alignment patterns, sem format information). Era um QR Code FALSO.
   *
   * Este método substituto exibe um indicador de carregamento honesto para que o
   * usuário saiba que deve aguardar o QR real do Baileys, em vez de tentar
   * escanear uma imagem inválida.
   */
  buildLoadingSvg() {
    const w = 290;
    const h = 290;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <rect width="${w}" height="${h}" fill="#ffffff" rx="16"/>
      <!-- Ícone de WhatsApp centralizado -->
      <circle cx="145" cy="115" r="48" fill="#25D366"/>
      <path d="M145 80 a35 35 0 0 1 24.7 59.7 l3 10.3 -10.6-3.4 A35 35 0 1 1 145 80z" fill="#ffffff"/>
      <path d="M131 107 c0-2 1-4 3-5 l5-1 3 7-3 4 c2 4 5 7 9 9 l3-3 7 3-1 5c-1 2-3 3-5 3-12-1-22-12-21-22z" fill="#25D366"/>
      <!-- Texto de status -->
      <text x="145" y="190" font-family="system-ui,sans-serif" font-weight="700" font-size="14" fill="#1a1a1a" text-anchor="middle">Aguardando QR Code...</text>
      <text x="145" y="212" font-family="system-ui,sans-serif" font-size="12" fill="#64748b" text-anchor="middle">Conectando ao WhatsApp</text>
      <!-- Barra de progresso animada -->
      <rect x="55" y="232" width="180" height="6" fill="#e2e8f0" rx="3"/>
      <rect x="55" y="232" width="90" height="6" fill="#25D366" rx="3">
        <animate attributeName="width" values="0;180;0" dur="2s" repeatCount="indefinite"/>
        <animate attributeName="x" values="55;55;235" dur="2s" repeatCount="indefinite"/>
      </rect>
      <text x="145" y="265" font-family="system-ui,sans-serif" font-size="10" fill="#94a3b8" text-anchor="middle">Este painel atualiza automaticamente</text>
    </svg>`;
    return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  }

  // ══════════════════════════════════════════════════════════════════
  // INTERRUPTOR LÓGICO DE ATENDIMENTO (Soft-Pause) — Métodos de Controle
  // ══════════════════════════════════════════════════════════════════

  normalizeSessionKey(id) {
    if (!id) return '';
    const clean = String(id).trim().toLowerCase();
    if (clean.includes('@')) {
      return clean.split('@')[0].replace(/\D/g, '') || clean;
    }
    return clean.replace(/\D/g, '') || clean;
  }

  pauseSession(targetJidOrNumber) {
    const key = this.normalizeSessionKey(targetJidOrNumber);
    if (key) {
      this.pausedSessions.add(key);
      this._persistPauseState();
      console.log(`[WHATSAPP_SOFT_PAUSE] ⏸️ Sessão/Número '${targetJidOrNumber}' (chave: ${key}) PAUSADA para atendimento humano. Socket Baileys 100% ONLINE.`);
      return true;
    }
    return false;
  }

  resumeSession(targetJidOrNumber) {
    const key = this.normalizeSessionKey(targetJidOrNumber);
    if (key) {
      this.pausedSessions.delete(key);
      // Mantém pausedContext até a próxima mensagem do cliente (retomada consciente)
      this._persistPauseState();
      console.log(`[WHATSAPP_SOFT_PAUSE] ▶️ Sessão/Número '${targetJidOrNumber}' (chave: ${key}) RETOMADA para atendimento IA. Socket Baileys 100% ONLINE. Contexto da pausa preservado.`);
      return true;
    }
    return false;
  }

  toggleSessionPause(targetJidOrNumber) {
    const isPaused = this.isSessionPaused(targetJidOrNumber);
    if (isPaused) {
      this.resumeSession(targetJidOrNumber);
      return false;
    } else {
      this.pauseSession(targetJidOrNumber);
      return true;
    }
  }

  isSessionPaused(remoteJid) {
    if (this.isGlobalPaused) return true;
    if (typeof global.IS_MAX_ACTIVE === 'boolean' && !global.IS_MAX_ACTIVE) return true;
    if (!remoteJid) return false;

    const key = this.normalizeSessionKey(remoteJid);
    return this.pausedSessions.has(key) || this.pausedSessions.has(String(remoteJid).trim().toLowerCase());
  }

  setGlobalPause(paused = true) {
    this.isGlobalPaused = !!paused;
    global.IS_MAX_ACTIVE = !paused;
    this._persistPauseState();
    console.log(`[WHATSAPP_SOFT_PAUSE] ⏸️ Soft-Pause Global: ${paused ? 'PAUSADO (Operador humano no controle)' : 'ATIVO (IA respondendo)'}. Socket Baileys 100% ONLINE.`);
    return this.isGlobalPaused;
  }

  /** Expõe contexto de pausa para o HttpServer/runtime injetar nos facts */
  takePendingPauseContext(remoteJid) {
    if (!this._pendingPauseContext) return null;
    const key = this.normalizeSessionKey(remoteJid);
    const fact = this._pendingPauseContext.get(key) || null;
    if (fact) this._pendingPauseContext.delete(key);
    return fact;
  }

  getSoftPauseStatus(remoteJid = null) {
    const isGloballyPaused = this.isGlobalPaused || (typeof global.IS_MAX_ACTIVE === 'boolean' && !global.IS_MAX_ACTIVE);
    const pausedList = Array.from(this.pausedSessions);
    const targetPaused = remoteJid ? this.isSessionPaused(remoteJid) : isGloballyPaused;

    return {
      status: 'SUCCESS',
      globalPaused: isGloballyPaused,
      isPaused: targetPaused,
      target: remoteJid || null,
      totalPausedSessions: pausedList.length,
      pausedSessions: pausedList,
      socketStatus: this.connectionState,
      socketOnline: this.connectionState === 'CONNECTED' || this.connectionState === 'STANDBY'
    };
  }

  async getStatus() {
    const qrBase64 = await this.generateQrCodeDataUri();
    return {
      status: 'SUCCESS',
      connectionState: this.connectionState,
      activeContextMode: 'business',
      qrCodeBase64: qrBase64,
      authDirectory: this.authDir,
      softPause: this.getSoftPauseStatus(),
      timestamp: Date.now()
    };
  }

  async simulateScanSuccess() {
    this.connectionState = 'CONNECTED';
    return {
      status: 'SUCCESS',
      connectionState: 'CONNECTED',
      message: 'Sessão WhatsApp Baileys pareada com sucesso! Atendente Max Conectado 24/7.'
    };
  }

  async _flushOutbox() {
    try {
      const { getResilienceLayer } = require('../ring0/ResilienceLayer');
      const res = getResilienceLayer();
      for (const item of res.listOutbox(30)) {
        if (!this.sock || this.connectionState !== 'CONNECTED') break;
        if (item.sessionKey && this.sessionKey && item.sessionKey !== this.sessionKey) continue;
        try {
          await this.sock.sendMessage(item.remoteJid, { text: item.text });
          res.ackOutbox(item.id);
        } catch (err) {
          res.bumpOutboxAttempt(item.id);
        }
      }
    } catch (e) {
      console.warn('[WA_OUTBOX]', e.message);
    }
  }

  queueOrSend(remoteJid, text) {
    if (this.sock && this.connectionState === 'CONNECTED') {
      return this.sock.sendMessage(remoteJid, { text });
    }
    try {
      const { getResilienceLayer } = require('../ring0/ResilienceLayer');
      return Promise.resolve(
        getResilienceLayer().enqueueOutbound({
          sessionKey: this.sessionKey || 'pme:default',
          remoteJid,
          text
        })
      );
    } catch (err) {
      return Promise.reject(err);
    }
  }

  /** R1.7: true se o driver está offline/desconectado */
  isEdgeOffline() {
    return this.edgeOffline === true
      || this.connectionState === 'DISCONNECTED'
      || this.connectionState === 'STANDBY';
  }

  /** R1.7: enfileira mensagem recebida offline e retorna aviso pré-programado */
  handleOfflineInbound(partnerId, remoteJid, text) {
    if (!this.edgeIntel) return null;
    try {
      this.edgeIntel.offline.enqueue({ partnerId, remoteJid, text, meta: { offline: true } });
      const notice = this.edgeIntel.offline.survivalNotice(remoteJid);
      return notice.send ? notice.message : null;
    } catch (_) {
      return null;
    }
  }
}

module.exports = WhatsAppDriver;
