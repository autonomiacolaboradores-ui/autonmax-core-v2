'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * FILOSOFIA CENTRAL DO FUNCIONÁRIO DIGITAL "MAX" (PADRÃO REUTILIZÁVEL)
 *
 * Filosofia de assessoria executiva e tom de voz padrão para TODOS os funcionários digitais
 * criados no ecossistema AUTON.MAX chamados "Max".
 */
const MAX_EXECUTIVE_ADVISOR_PHILOSOPHY = `
[FILOSOFIA EXECUTIVA SÊNIOR DE OPERAÇÕES — ASSESSORIA MAX]
1. NOME FIXO: Seu nome é sempre "Max". Você é um executivo sênior de operações e conselheiro estratégico premium.
2. POSTURA CONSULTIVA: Não aja como um formulário conversacional ou chatbot básico. Você é um conselheiro executivo que ajuda o parceiro a construir seu funcionário digital com maestria.
3. FLUXO ESTRATÉGICO: Faça UMA pergunta por vez. Avance do macro para o micro. Apresente opções claras e explique brevemente o porquê de cada decisão.
4. ADAPTAÇÃO AO PORTE DO NEGÓCIO: Identifique o estágio da empresa e adapte a complexidade do catálogo e da rotina operacional de acordo com as respostas.
`.trim();

// Limites do Painel PME (Sprint 10)
const MAX_PDFS    = 5;
const MAX_IMAGES  = 10;

class PmeAgentConfigurator {
  constructor(dbPath) {
    this.dbPath = dbPath || path.join(__dirname, '..', '..', 'workspace', 'attendants_db.json');
    this.ensureDbDirectory();
    this.attendants = this.loadData();
    /** @type {Set<string>} */
    this._dirtyPartners = new Set();
    this._lastFlushMs = 0;
  }

  markDirty(partnerId) {
    if (partnerId) this._dirtyPartners.add(String(partnerId));
  }

  ensureDbDirectory() {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  loadData() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const raw = fs.readFileSync(this.dbPath, 'utf8');
        if (!raw || raw.trim() === '') {
          throw new Error('Arquivo vazio (Empty JSON)');
        }
        return JSON.parse(raw);
      }
    } catch (err) {
      console.warn(`[PME_CONFIGURATOR][RING_0_HEAL] Falha ao ler DB (${err.message}). Restaurando do Shadow Backup em memória RAM.`);
      if (this.attendants && Object.keys(this.attendants).length > 0) {
        this.saveData();
        return this.attendants;
      }
    }
    return {};
  }

  /**
   * Persistência debounced (UI / updates em lote).
   * Para agendamentos use flush() — gravação imediata anti-perda.
   */

  _mergeFromDisk() {
    if (fs.existsSync(this.dbPath)) {
      try {
        const raw = fs.readFileSync(this.dbPath, 'utf8');
        if (raw && raw.trim() !== '') {
          const diskData = JSON.parse(raw);
          for (const [pid, diskConfig] of Object.entries(diskData)) {
            if (this.attendants[pid]) {
              const memConfig = this.attendants[pid];
              if (diskConfig.existingAppointments) {
                if (!memConfig.existingAppointments) memConfig.existingAppointments = [];
                const memAppIds = new Set(
                  memConfig.existingAppointments.map((a) => a && (a.appointmentId || a.id)).filter(Boolean)
                );
                for (const diskApp of diskConfig.existingAppointments) {
                  const dId = diskApp && (diskApp.appointmentId || diskApp.id);
                  if (dId && !memAppIds.has(dId)) {
                    memConfig.existingAppointments.push(diskApp);
                  }
                }
              }
              if (
                (!memConfig.catalog || memConfig.catalog.length === 0) &&
                diskConfig.catalog &&
                diskConfig.catalog.length > 0
              ) {
                memConfig.catalog = diskConfig.catalog;
              }
              if (
                (!memConfig.services || memConfig.services.length === 0) &&
                diskConfig.services &&
                diskConfig.services.length > 0
              ) {
                memConfig.services = diskConfig.services;
              }
              if (
                (!memConfig.products || memConfig.products.length === 0) &&
                diskConfig.products &&
                diskConfig.products.length > 0
              ) {
                memConfig.products = diskConfig.products;
              }
              if (
                (!memConfig.workingHours || !memConfig.workingHours.startTime) &&
                diskConfig.workingHours
              ) {
                memConfig.workingHours = diskConfig.workingHours;
              }
            } else {
              this.attendants[pid] = diskConfig;
            }
          }
        }
      } catch (mergeErr) {
        console.warn('[PME_CONFIGURATOR] Merge failed:', mergeErr.message);
      }
    }
  }

  saveData() {
    this._mergeFromDisk();
    if (this._saveTimeout) clearTimeout(this._saveTimeout);
    this._saveTimeout = setTimeout(() => {
      this._saveTimeout = null;
      this._saveDataImmediate();
    }, 200);
  }

  /** Flush síncrono — agenda, pause, catálogo crítico */
  flush() {
    if (this._saveTimeout) {
      clearTimeout(this._saveTimeout);
      this._saveTimeout = null;
    }
    return this._saveDataImmediate();
  }

  _saveDataImmediate() {
    try {
      const start = Date.now();
      const tmpPath = `${this.dbPath}.tmp`;

      this._mergeFromDisk();

      const jsonStr = JSON.stringify(this.attendants, null, 2);
      fs.writeFileSync(tmpPath, jsonStr, 'utf8');
      fs.renameSync(tmpPath, this.dbPath);

      // Mirror só de parceiros dirty (ou todos se nenhum marcado)
      try {
        const mirrorDir = path.join(path.dirname(this.dbPath), 'attendants_mirror');
        if (!fs.existsSync(mirrorDir)) fs.mkdirSync(mirrorDir, { recursive: true });
        const ids =
          this._dirtyPartners && this._dirtyPartners.size
            ? Array.from(this._dirtyPartners)
            : Object.keys(this.attendants);
        for (const pid of ids) {
          const cfg = this.attendants[pid];
          if (!cfg) continue;
          const safe = String(pid).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
          const mTmp = path.join(mirrorDir, `${safe}.json.tmp`);
          const mPath = path.join(mirrorDir, `${safe}.json`);
          fs.writeFileSync(mTmp, JSON.stringify(cfg, null, 2), 'utf8');
          fs.renameSync(mTmp, mPath);
        }
        if (this._dirtyPartners) this._dirtyPartners.clear();
        this._lastFlushMs = Date.now();
      } catch (mirErr) {
        console.warn('[PME_CONFIGURATOR] mirror:', mirErr.message);
      }

      try {
        const { getResilienceLayer } = require('../ring0/ResilienceLayer');
        getResilienceLayer().shadowAttendantsDb(this.dbPath);
      } catch (_) {}

      const duration = Date.now() - start;
      if (duration > 150) {
        console.warn(`[PME_CONFIGURATOR] Gravação atômica demorou ${duration}ms`);
      }
      return true;
    } catch (err) {
      console.error('[PME_CONFIGURATOR] Erro crítico ao salvar dados:', err.message);
      return false;
    }
  }

  /**
   * Normaliza item de catálogo do painel (id, tag, preço, duração).
   */
  static normalizeCatalogItem(raw, index = 0) {
    const item = raw && typeof raw === 'object' ? raw : {};
    const name = String(item.name || item.serviceName || item.title || '').trim();
    if (!name) return null;
    const id =
      String(item.id || item.serviceId || '').trim() ||
      `svc_${Date.now().toString(36)}_${index}`;
    const durationMinutes = Math.max(
      15,
      Math.min(480, Number(item.durationMinutes || item.duration || item.durationMin) || 30)
    );
    let priceCents =
      item.priceCents != null
        ? Number(item.priceCents)
        : item.price != null
          ? Math.round(Number(String(item.price).replace(/[^\d.,]/g, '').replace(',', '.')) * 100)
          : null;
    if (priceCents != null && !Number.isFinite(priceCents)) priceCents = null;
    const priceLabel =
      item.priceLabel ||
      (priceCents != null
        ? `R$ ${(priceCents / 100).toFixed(2).replace('.', ',')}`
        : item.price
          ? String(item.price)
          : null);
    const tag =
      String(item.tag || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_') ||
      `svc_${name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .slice(0, 40)}`;
    return {
      id,
      name,
      tag,
      durationMinutes,
      priceCents,
      priceLabel,
      description: item.description ? String(item.description).slice(0, 500) : undefined,
      active: item.active !== false
    };
  }

  static normalizeWorkingHours(raw) {
    const wh = raw && typeof raw === 'object' ? raw : {};
    const dayMap = {
      seg: 'Segunda',
      segunda: 'Segunda',
      ter: 'Terça',
      terca: 'Terça',
      terça: 'Terça',
      qua: 'Quarta',
      quarta: 'Quarta',
      qui: 'Quinta',
      quinta: 'Quinta',
      sex: 'Sexta',
      sexta: 'Sexta',
      sab: 'Sábado',
      sabado: 'Sábado',
      sábado: 'Sábado',
      dom: 'Domingo',
      domingo: 'Domingo'
    };
    let days = Array.isArray(wh.days) ? wh.days : ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
    days = days
      .map((d) => {
        const k = String(d || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim();
        return dayMap[k] || d;
      })
      .filter(Boolean);
    const startTime = String(wh.startTime || wh.start || '09:00').slice(0, 5);
    const endTime = String(wh.endTime || wh.end || '18:00').slice(0, 5);
    const slotStepMinutes = Math.max(
      10,
      Math.min(120, Number(wh.slotStepMinutes || wh.slotStep || 30) || 30)
    );
    return { days, startTime, endTime, slotStepMinutes };
  }

  /**
   * Obtém a configuração completa do Max para o parceiro informado.
   * Sprint 10: retorna também pdfs (máx 5) e images (máx 10).
   */

  /**
   * Normaliza item de serviço para agendamento (id, nome, preço, duração, categoria, descrição).
   */
  static normalizeServiceItem(raw, index = 0) {
    const item = raw && typeof raw === 'object' ? raw : {};
    const name = String(item.name || item.serviceName || item.title || '').trim();
    if (!name) return null;
    const id = String(item.id || item.serviceId || '').trim() || ('srv_' + Date.now().toString(36) + '_' + index);
    const durationMinutes = Math.max(15, Math.min(480, Number(item.durationMinutes || item.duration || item.durationMin) || 60));
    let priceCents = item.priceCents != null ? Number(item.priceCents) : null;
    if (priceCents == null && item.price != null) {
      priceCents = Math.round(Number(String(item.price).replace(/[^\d.,]/g, '').replace(',', '.')) * 100);
    }
    if (priceCents != null && !Number.isFinite(priceCents)) priceCents = null;
    const priceLabel = item.priceLabel || (priceCents != null ? 'R$ ' + (priceCents / 100).toFixed(2).replace('.', ',') : (item.price ? String(item.price) : 'Consulte'));
    const category = String(item.category || 'Geral').trim();
    const description = item.description ? String(item.description).slice(0, 500) : '';
    const active = item.active !== false;

    return {
      id,
      name,
      durationMinutes,
      priceCents: priceCents || 0,
      priceLabel,
      category,
      description,
      active
    };
  }

  /**
   * Normaliza item de produto para venda/pedido (id, nome, preço, estoque, unidade, categoria, descrição).
   */
  static normalizeProductItem(raw, index = 0) {
    const item = raw && typeof raw === 'object' ? raw : {};
    const name = String(item.name || item.productName || item.title || '').trim();
    if (!name) return null;
    const id = String(item.id || item.productId || '').trim() || ('prd_' + Date.now().toString(36) + '_' + index);
    let priceCents = item.priceCents != null ? Number(item.priceCents) : null;
    if (priceCents == null && item.price != null) {
      priceCents = Math.round(Number(String(item.price).replace(/[^\d.,]/g, '').replace(',', '.')) * 100);
    }
    if (priceCents != null && !Number.isFinite(priceCents)) priceCents = null;
    const priceLabel = item.priceLabel || (priceCents != null ? 'R$ ' + (priceCents / 100).toFixed(2).replace('.', ',') : (item.price ? String(item.price) : 'Consulte'));
    const stock = item.stock != null ? item.stock : 99;
    const unit = String(item.unit || 'un').trim();
    const category = String(item.category || 'Geral').trim();
    const description = item.description ? String(item.description).slice(0, 500) : '';
    const active = item.active !== false;

    return {
      id,
      name,
      priceCents: priceCents || 0,
      priceLabel,
      stock,
      unit,
      category,
      description,
      active
    };
  }

  getAttendantConfig(partnerId = 'usr_google_demo_100') {
    if (!this.attendants[partnerId]) {
      this.attendants[partnerId] = this.createDefaultConfig(partnerId);
      this.saveData();
    }
    // Garantir campos Sprint 10 caso config seja de versão anterior
    const config = this.attendants[partnerId];
    if (!Array.isArray(config.pdfs))   config.pdfs   = [];
    if (!Array.isArray(config.images)) config.images = [];
    if (!config.displayName)           config.displayName = config.attendantName || 'Max';

    // Suporte robusto a Serviços e Produtos estruturados (Sprint 12)
    if (!Array.isArray(config.services) || config.services.length === 0) {
      if (Array.isArray(config.catalog) && config.catalog.length > 0) {
        config.services = config.catalog.map((c, i) => PmeAgentConfigurator.normalizeServiceItem(c, i)).filter(Boolean);
      } else {
        if (!Array.isArray(config.services)) config.services = [];
      }
    }
    if (config.services.length > 0) {
      config.catalog = config.services;
    } else if (Array.isArray(config.catalog) && config.catalog.length > 0) {
      config.services = config.catalog;
    }
    if (!Array.isArray(config.products)) {
      config.products = [];
    }
    return config;
  }

  /**
   * Retorna o partnerId da configuração modificada mais recentemente.
   */
  getLatestActivePartnerId() {
    let latestId = 'usr_google_demo_100';
    let latestTime = 0;
    for (const [id, config] of Object.entries(this.attendants)) {
      if (config.updatedAt) {
        const time = new Date(config.updatedAt).getTime();
        if (time > latestTime) {
          latestTime = time;
          latestId = id;
        }
      }
    }
    return latestId;
  }

  /**
   * Cria configuração padrão Sprint 10 — sem referências a cashback ou MaxCoin.
   */
  createDefaultConfig(partnerId) {
    return {
      partnerId,
      attendantName: 'Max',
      displayName: '',               // Sprint 10: nome exibido no header
      role: 'Atendente Vendedor Digital',
      isActive: true,
      isOnboarded: false,
      currentStep: 1,
      catalog: [],
      workingHours: {
        days: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'],
        startTime: '09:00',
        endTime: '18:00'
      },
      activeChats: {},
      existingAppointments: [],
      policies: {
        cancellationPolicy: 'Nenhuma política cadastrada.',
        paymentMethods: 'Nenhuma política cadastrada.',
        minAdvanceHours: 2,
        otherRules: ''
      },
      personalityPrompt: require('../config/AttendantDefaults').MAX_SOVEREIGN_SYSTEM_PROMPT,
      // Sprint 10 — Base de Conhecimento visual
      pdfs: [],      // máx 5 — cada item: { id, name, sizeBytes, uploadedAt }
      images: [],    // máx 10 — cada item: { id, name, sizeBytes, dataUrl, uploadedAt }
      metricsHistory: {
        conversationsHandled: 0,
        appointmentsCreated: 0
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Atualiza as configurações gerais do Max para o parceiro.
   * (Método original preservado — Sprint 10 não o altera.)
   */
  updateAttendantConfig(partnerId = 'usr_google_demo_100', updates = {}) {
    const config = this.getAttendantConfig(partnerId);

    if (typeof updates.isActive === 'boolean') config.isActive = updates.isActive;
    if (typeof updates.isOnboarded === 'boolean') config.isOnboarded = updates.isOnboarded;
    if (updates.currentStep) config.currentStep = updates.currentStep;
    if (updates.catalog && Array.isArray(updates.catalog)) {
      config.catalog = updates.catalog
        .map((item, i) => PmeAgentConfigurator.normalizeCatalogItem(item, i))
        .filter(Boolean);
    }
    if (updates.workingHours) {
      config.workingHours = PmeAgentConfigurator.normalizeWorkingHours({
        ...config.workingHours,
        ...updates.workingHours
      });
    }
    if (updates.policies) config.policies = { ...config.policies, ...updates.policies };
    if (updates.welcomeMsg) config.welcomeMsg = updates.welcomeMsg;
    if (updates.personalityPrompt) config.personalityPrompt = updates.personalityPrompt;
    if (updates.customCharacteristics) config.customCharacteristics = updates.customCharacteristics;
    if (updates.attachedFiles && Array.isArray(updates.attachedFiles)) config.attachedFiles = updates.attachedFiles;
    if (typeof updates.ownerJid === 'string' || typeof updates.ownerPhone === 'string') {
      config.ownerJid = String(updates.ownerJid || updates.ownerPhone || '').trim();
      config.ownerPhone = config.ownerJid;
    }
    if (typeof updates.storeName === 'string' && updates.storeName.trim()) {
      config.storeName = updates.storeName.trim();
    }
    if (typeof updates.displayName === 'string' && updates.displayName.trim()) {
      config.displayName = updates.displayName.trim();
    }

    config.updatedAt = new Date().toISOString();
    config.configVersion = (Number(config.configVersion) || 0) + 1;
    this.markDirty(partnerId);
    // Painel / config: flush imediato (não arriscar debounce em crash)
    this.flush();
    return config;
  }

  // ══════════════════════════════════════════════════════════════════
  // Sprint 10 — NOVOS MÉTODOS DO PAINEL PME
  // ══════════════════════════════════════════════════════════════════

  /**
   * Atualiza o nome exibido no header e o prompt/instruções do Max.
   *
   * @param {string} partnerId
   * @param {{ displayName?: string, personalityPrompt?: string, storeName?: string, storeSegment?: string }} updates
   * @returns {object} config atualizada
   */
  updateProfileAndPrompt(partnerId = 'usr_google_demo_100', updates = {}) {
    const config = this.getAttendantConfig(partnerId);

    if (typeof updates.displayName === 'string' && updates.displayName.trim()) {
      config.displayName = updates.displayName.trim();
    }
    if (typeof updates.personalityPrompt === 'string' && updates.personalityPrompt.trim()) {
      config.personalityPrompt = updates.personalityPrompt.trim();
    }
    if (typeof updates.storeName === 'string' && updates.storeName.trim()) {
      config.storeName = updates.storeName.trim();
    }
    if (typeof updates.storeSegment === 'string' && updates.storeSegment.trim()) {
      config.storeSegment = updates.storeSegment.trim();
    }

    config.updatedAt = new Date().toISOString();
    config.configVersion = (Number(config.configVersion) || 0) + 1;
    this.flush();
    return config;
  }

  /**
   * Adiciona um PDF à base de conhecimento do parceiro.
   * Bloqueia se já houver MAX_PDFS (5) documentos.
   *
   * @param {string} partnerId
   * @param {{ id?: string, name: string, sizeBytes: number, text?: string }} fileMeta
   * @returns {{ success: boolean, config?: object, error?: string }}
   */
  addPdfDocument(partnerId = 'usr_google_demo_100', fileMeta = {}) {
    const config = this.getAttendantConfig(partnerId);

    if (config.pdfs.length >= MAX_PDFS) {
      return {
        success: false,
        error: `Limite de ${MAX_PDFS} PDFs atingido. Remova um documento antes de adicionar outro.`
      };
    }

    const newPdf = {
      id: fileMeta.id || ('pdf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
      name: fileMeta.name || 'documento.pdf',
      sizeBytes: fileMeta.sizeBytes || 0,
      text: fileMeta.text || '',
      url: fileMeta.url || '',
      uploadedAt: new Date().toISOString()
    };

    config.pdfs.push(newPdf);
    config.updatedAt = new Date().toISOString();
    this.saveData();
    return { success: true, config, file: newPdf };
  }

  /**
   * Adiciona uma Imagem à base de conhecimento do parceiro.
   * Bloqueia se já houver MAX_IMAGES (10) imagens.
   *
   * @param {string} partnerId
   * @param {{ id?: string, name: string, sizeBytes: number, dataUrl?: string }} fileMeta
   * @returns {{ success: boolean, config?: object, error?: string }}
   */
  addImageDocument(partnerId = 'usr_google_demo_100', fileMeta = {}) {
    const config = this.getAttendantConfig(partnerId);

    if (config.images.length >= MAX_IMAGES) {
      return {
        success: false,
        error: `Limite de ${MAX_IMAGES} imagens atingido. Remova uma imagem antes de adicionar outra.`
      };
    }

    const newImage = {
      id: fileMeta.id || ('img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
      name: fileMeta.name || 'imagem.png',
      sizeBytes: fileMeta.sizeBytes || 0,
      dataUrl: fileMeta.dataUrl || '',
      url: fileMeta.url || '',
      uploadedAt: new Date().toISOString()
    };

    config.images.push(newImage);
    config.updatedAt = new Date().toISOString();
    this.saveData();
    return { success: true, config, file: newImage };
  }

  /**
   * Remove individualmente um PDF ou uma Imagem da base de conhecimento.
   *
   * @param {string} partnerId
   * @param {string} fileId    - ID do arquivo a remover
   * @param {'pdf'|'image'} fileType - Tipo do arquivo
   * @returns {{ success: boolean, config?: object, error?: string }}
   */
  removeKnowledgeFile(partnerId = 'usr_google_demo_100', fileId, fileType) {
    const config = this.getAttendantConfig(partnerId);

    if (fileType === 'pdf') {
      const before = config.pdfs.length;
      config.pdfs = config.pdfs.filter(f => f.id !== fileId);
      if (config.pdfs.length === before) {
        return { success: false, error: `PDF com id "${fileId}" não encontrado.` };
      }
    } else if (fileType === 'image') {
      const before = config.images.length;
      config.images = config.images.filter(f => f.id !== fileId);
      if (config.images.length === before) {
        return { success: false, error: `Imagem com id "${fileId}" não encontrada.` };
      }
    } else {
      return { success: false, error: 'fileType deve ser "pdf" ou "image".' };
    }

    config.updatedAt = new Date().toISOString();
    this.saveData();
    return { success: true, config };
  }


  /**
   * Candidatos de partnerId (evita personalidade genérica por mismatch de ID).
   */
  resolvePartnerIdCandidates(partnerId) {
    const ids = [];
    const push = (id) => {
      if (id && !ids.includes(id)) ids.push(id);
    };
    push(partnerId);
    push(this.getLatestActivePartnerId && this.getLatestActivePartnerId());
    push('usr_google_demo_100');
    try {
      for (const id of Object.keys(this.attendants || {})) push(id);
    } catch (_) {}
    return ids.filter(Boolean);
  }

  readV2ConfigRow(partnerId) {
    const candidates = [
      path.join(__dirname, '..', '..', 'workspace', 'autonmax.db'),
      path.join(__dirname, '..', '..', 'workspace', 'runtime.db')
    ];
    for (const sqlitePath of candidates) {
      try {
        if (!fs.existsSync(sqlitePath)) continue;
        const { DatabaseSync } = require('node:sqlite');
        const db = new DatabaseSync(sqlitePath, { open: true });
        const row = db.prepare('SELECT * FROM pme_configs_v2 WHERE partner_id = ?').get(partnerId);
        db.close();
        if (row) return row;
      } catch (err) {
        console.error(`[PME_CONFIGURATOR] readV2ConfigRow (${sqlitePath}):`, err.message);
      }
    }
    return null;
  }

  /**
   * Espelha prompt V2 → personalityPrompt (JSON) para o runtime WA/chat usar sempre a mesma fonte.
   */
  syncPersonalityFromV2(partnerId, promptInstructions) {
    const text = typeof promptInstructions === 'string' ? promptInstructions.trim() : '';
    if (!partnerId) return null;
    const config = this.getAttendantConfig(partnerId);
    if (text) {
      config.personalityPrompt = text;
      config.updatedAt = new Date().toISOString();
      this.attendants[partnerId] = config;
      this.saveData();
    }
    return config;
  }


  /**
   * Compila o prompt do sistema para o Max atuar como atendente de WhatsApp.
   * Soberania do Usuário: Se o usuário preencher as "Instruções do Max", essa identidade
   * substitui 100% a identidade padrão temporária do sistema.
   */
  compileMaxAttendantPrompt(partnerId = 'usr_google_demo_100') {
    let config = this.getAttendantConfig(partnerId);

    // 1. Tentar ler configurações V2 persistidas no SQLite (pme_configs_v2)
    let v2Config = null;
    try {
      const sqlitePath = path.join(__dirname, '..', '..', 'workspace', 'autonmax.db');
      if (fs.existsSync(sqlitePath)) {
        const { DatabaseSync } = require('node:sqlite');
        const db = new DatabaseSync(sqlitePath, { open: true });
        v2Config = db.prepare('SELECT * FROM pme_configs_v2 WHERE partner_id = ?').get(partnerId);
        db.close();
      }
    } catch (err) {
      console.error(`[PME_CONFIGURATOR] Erro crítico ao ler SQLite V2 para ${partnerId}:`, err.message);
    }

    let customPrompt = '';
    let businessRules = {};
    let pdfList = (config && config.pdfs) || [];
    let resolvedPartnerId = partnerId;

    // Varrer candidatos: V2 SQLite + JSON personalityPrompt (corrige mismatch de partnerId)
    const candidates = typeof this.resolvePartnerIdCandidates === 'function'
      ? this.resolvePartnerIdCandidates(partnerId)
      : [partnerId];

    for (const cid of candidates) {
      const cfg = this.getAttendantConfig(cid);
      const v2 = typeof this.readV2ConfigRow === 'function' ? this.readV2ConfigRow(cid) : null;
      const fromV2 = v2 && (v2.prompt_instructions || '').trim();
      const fromJson = (cfg.personalityPrompt || '').trim();
      if (fromV2) {
        customPrompt = fromV2;
        v2Config = v2;
        config = cfg;
        resolvedPartnerId = cid;
        break;
      }
      if (fromJson && fromJson.length > 20) {
        customPrompt = fromJson;
        config = cfg;
        resolvedPartnerId = cid;
        if (v2) v2Config = v2;
        break;
      }
    }

    if (v2Config) {
      if (!customPrompt) customPrompt = (v2Config.prompt_instructions || '').trim();
      try {
        businessRules = typeof v2Config.business_rules === 'string'
          ? JSON.parse(v2Config.business_rules || '{}')
          : (v2Config.business_rules || {});
      } catch (_) {}
      try {
        if (v2Config.pdf_files) {
          const parsedPdfs = JSON.parse(v2Config.pdf_files || '[]');
          if (Array.isArray(parsedPdfs) && parsedPdfs.length > 0) pdfList = parsedPdfs;
        }
      } catch (_) {}
    }
    if (!customPrompt) {
      customPrompt = (config.personalityPrompt || '').trim();
    }

    // SOBERANIA TOTAL DO PME: A única referência de personalidade é o que o usuário configurou no painel.
    const userConfiguredPersonality = String(customPrompt || '').trim() || 'Atenda os clientes deste estabelecimento com educação, cordialidade e presteza.';

    // Catálogo Estruturado de Serviços (Agendamento)
    let servicesList = (Array.isArray(config.services) && config.services.length > 0)
      ? config.services.filter(s => s.active !== false)
      : (Array.isArray(config.catalog) && config.catalog.length > 0 ? config.catalog : []);
    
    let catalogStr = servicesList.length > 0
      ? servicesList.map(s => `• [SERVIÇO] ${s.name} | Preço: ${s.priceLabel || ('R$ ' + ((s.priceCents || 0) / 100).toFixed(2).replace('.', ','))} | Duração: ${s.durationMinutes || 60} min | Categoria: ${s.category || 'Geral'}${s.description ? ' | ' + s.description : ''}`).join('\n')
      : (businessRules.catalog || 'Nenhum serviço específico cadastrado.');

    // Catálogo Estruturado de Produtos (Pedidos de Compra/Entrega)
    let productsList = (Array.isArray(config.products) && config.products.length > 0)
      ? config.products.filter(p => p.active !== false)
      : [];
    
    let productsStr = productsList.length > 0
      ? productsList.map(p => `• [PRODUTO] ${p.name} | Preço: ${p.priceLabel || ('R$ ' + ((p.priceCents || 0) / 100).toFixed(2).replace('.', ','))} | Estoque: ${p.stock} ${p.unit || 'un'} | Categoria: ${p.category || 'Geral'}${p.description ? ' | ' + p.description : ''}`).join('\n')
      : (businessRules.products || 'Nenhum produto físico cadastrado para venda.');

    const hoursStr = (businessRules.schedules !== undefined && businessRules.schedules !== null)
      ? (businessRules.schedules || 'Consulte nossos horários de atendimento.')
      : (config.workingHours ? `Dias: ${config.workingHours.days.join(', ')} das ${config.workingHours.startTime} às ${config.workingHours.endTime}` : 'Segunda a Sábado em horário comercial');

    const policyStr = (businessRules.policies !== undefined && businessRules.policies !== null)
      ? (businessRules.policies || 'Sem políticas restritivas.')
      : (config.policies ? `Cancelamento: ${config.policies.cancellationPolicy} | Pagamento: ${config.policies.paymentMethods}` : 'Conforme regras internas do estabelecimento.');

    // Base de conhecimento: PDFs
    const pdfsStr = (pdfList && pdfList.length > 0)
      ? pdfList.map(f => `• PDF [${f.name}]: ${f.text || '(documento cadastrado)'}`).join('\n\n')
      : 'Nenhum PDF cadastrado.';

    const nowStr = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const weekday = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long' });
    const now = `${nowStr} (Hoje é ${weekday})`;

    return `
[INSTRUÇÕES E PERSONALIDADE DO ATENDENTE — DEFINIDAS NO PAINEL DO ESTABELECIMENTO]
ATENÇÃO: Este bloco define SUA IDENTIDADE, TOM DE VOZ e PERSONALIDADE. Você DEVE incorporá-lo em TODAS as suas respostas, sem exceção. Mesmo ao seguir instruções operacionais abaixo, mantenha sempre esta personalidade.

${userConfiguredPersonality}

[INFORMAÇÕES OPERACIONAIS DO ESTABELECIMENTO]
• DATA E HORA ATUAL DO SISTEMA: ${now}

• CATÁLOGO DE SERVIÇOS & PREÇOS:
${catalogStr}

• CATÁLOGO DE PRODUTOS PARA VENDA:
${productsStr}

• HORÁRIOS DE FUNCIONAMENTO:
${hoursStr}

• POLÍTICAS INTERNAS:
${policyStr}

• BASE DE CONHECIMENTO (DOCUMENTOS PDF CADASTRADOS):
${pdfsStr}

[DIRETRIZES OPERACIONAIS DE ATENDIMENTO]
- Canal WhatsApp: seja objetivo, ágil, acolhedor e educado.
- Responda apenas com base nas informações do estabelecimento acima.
- NUNCA invente, modifique ou resuma os nomes dos produtos/serviços. Cite-os EXATAMENTE como estão no catálogo.
- Antes de agendar um serviço, garanta que o cliente confirmou o serviço, data e horário.
- Antes de fechar um pedido de produto, garanta a lista de itens, quantidades, endereço para entrega ou retirada, e forma de pagamento.

[REGRA DE OURO INVIOLÁVEL: SEPARAÇÃO TOTAL ENTRE SERVIÇOS E PRODUTOS]
1. SERVIÇOS SÃO EXCLUSIVOS PARA AGENDAMENTO COM HORA MARCADA:
   - Todo item do "CATÁLOGO DE SERVIÇOS" requer data e horário na agenda.
   - NUNCA lance um serviço como pedido de entrega/compra.
   - Se o cliente disser "quero pedir [Serviço]" ou "entrega [Serviço]", esclareça imediatamente: "[Serviço] é um atendimento realizado com hora marcada em nossa agenda. Vamos agendar seu horário? Para qual dia e horário você prefere?"

2. PRODUTOS SÃO EXCLUSIVOS PARA PEDIDOS DE COMPRA, ENTREGA OU RETIRADA:
   - Todo item do "CATÁLOGO DE PRODUTOS" é uma mercadoria física para delivery ou retirada.
   - NUNCA tente agendar um horário na agenda para um produto físico.
   - Se o cliente disser "quero agendar [Produto]", esclareça imediatamente: "[Produto] é um produto físico para pronta entrega ou retirada. Você gostaria de receber no seu endereço ou retirar em nossa loja?"
`.trim();
  }

  /**
   * Registra um novo agendamento na agenda do Max.
   */

  // ── GESTÃO DE SERVIÇOS (AGENDAMENTO COM HORA MARCADA) ──────────────────────
  listServices(partnerId = 'usr_google_demo_100') {
    const config = this.getAttendantConfig(partnerId);
    return config.services || [];
  }

  addService(partnerId = 'usr_google_demo_100', serviceData = {}) {
    const config = this.getAttendantConfig(partnerId);
    const item = PmeAgentConfigurator.normalizeServiceItem(serviceData, config.services.length);
    if (!item || !item.name) {
      return { success: false, error: 'Nome do serviço é obrigatório.' };
    }
    config.services.push(item);
    config.catalog = config.services;
    config.updatedAt = new Date().toISOString();
    this.saveData();
    return { success: true, service: item, services: config.services };
  }

  updateService(partnerId = 'usr_google_demo_100', serviceId, updates = {}) {
    const config = this.getAttendantConfig(partnerId);
    const idx = config.services.findIndex(s => s.id === serviceId);
    if (idx === -1) {
      return { success: false, error: 'Serviço com id "' + serviceId + '" não encontrado.' };
    }
    const current = config.services[idx];
    const merged = { ...current, ...updates, id: current.id };
    const normalized = PmeAgentConfigurator.normalizeServiceItem(merged, idx);
    config.services[idx] = normalized;
    config.catalog = config.services;
    config.updatedAt = new Date().toISOString();
    this.saveData();
    return { success: true, service: normalized, services: config.services };
  }

  deleteService(partnerId = 'usr_google_demo_100', serviceId) {
    const config = this.getAttendantConfig(partnerId);
    const before = config.services.length;
    config.services = config.services.filter(s => s.id !== serviceId);
    if (config.services.length === before) {
      return { success: false, error: 'Serviço não encontrado.' };
    }
    config.catalog = config.services;
    config.updatedAt = new Date().toISOString();
    this.saveData();
    return { success: true, services: config.services };
  }

  // ── GESTÃO DE PRODUTOS (PEDIDOS DE COMPRA / ENTREGA / RETIRADA) ────────────
  listProducts(partnerId = 'usr_google_demo_100') {
    const config = this.getAttendantConfig(partnerId);
    return config.products || [];
  }

  addProduct(partnerId = 'usr_google_demo_100', productData = {}) {
    const config = this.getAttendantConfig(partnerId);
    const item = PmeAgentConfigurator.normalizeProductItem(productData, config.products.length);
    if (!item || !item.name) {
      return { success: false, error: 'Nome do produto é obrigatório.' };
    }
    config.products.push(item);
    config.updatedAt = new Date().toISOString();
    this.saveData();
    return { success: true, product: item, products: config.products };
  }

  updateProduct(partnerId = 'usr_google_demo_100', productId, updates = {}) {
    const config = this.getAttendantConfig(partnerId);
    const idx = config.products.findIndex(p => p.id === productId);
    if (idx === -1) {
      return { success: false, error: 'Produto com id "' + productId + '" não encontrado.' };
    }
    const current = config.products[idx];
    const merged = { ...current, ...updates, id: current.id };
    const normalized = PmeAgentConfigurator.normalizeProductItem(merged, idx);
    config.products[idx] = normalized;
    config.updatedAt = new Date().toISOString();
    this.saveData();
    return { success: true, product: normalized, products: config.products };
  }

  deleteProduct(partnerId = 'usr_google_demo_100', productId) {
    const config = this.getAttendantConfig(partnerId);
    const before = config.products.length;
    config.products = config.products.filter(p => p.id !== productId);
    if (config.products.length === before) {
      return { success: false, error: 'Produto não encontrado.' };
    }
    config.updatedAt = new Date().toISOString();
    this.saveData();
    return { success: true, products: config.products };
  }

  addAppointment(partnerId, appointment) {
    const config = this.getAttendantConfig(partnerId);
    const newApp = {
      id: appointment.id || `app_${Date.now()}`,
      clientName: appointment.clientName || 'Cliente WhatsApp',
      customerPhone: appointment.customerPhone || null,
      serviceName: appointment.serviceName || 'Atendimento Geral',
      dateStr: appointment.dateStr || new Date().toISOString().split('T')[0],
      timeSlot: appointment.timeSlot || '14:00',
      priceCents: appointment.priceCents || 10000,
      status: 'CONFIRMED',
      createdAt: new Date().toISOString()
    };
    config.existingAppointments.push(newApp);
    config.metricsHistory.appointmentsCreated += 1;
    config.metricsHistory.conversationsHandled += 1;
    config.updatedAt = new Date().toISOString();
    this.saveData();
    return newApp;
  }
}

let _defaultPmeInstance = null;
function getInstance(dbPath) {
  if (!_defaultPmeInstance || dbPath) {
    _defaultPmeInstance = new PmeAgentConfigurator(dbPath);
  }
  return _defaultPmeInstance;
}

PmeAgentConfigurator.getInstance = getInstance;
PmeAgentConfigurator.getAttendantConfig = (partnerId) => getInstance().getAttendantConfig(partnerId);
PmeAgentConfigurator.saveData = () => getInstance().saveData();
PmeAgentConfigurator.markDirty = (partnerId) => getInstance().markDirty(partnerId);
PmeAgentConfigurator.flush = () => getInstance().flush();

module.exports = {
  PmeAgentConfigurator,
  getInstance,
  getAttendantConfig: (partnerId) => getInstance().getAttendantConfig(partnerId),
  saveData: () => getInstance().saveData(),
  markDirty: (partnerId) => getInstance().markDirty(partnerId),
  flush: () => getInstance().flush(),
  MAX_EXECUTIVE_ADVISOR_PHILOSOPHY,
  MAX_PDFS,
  MAX_IMAGES
};
