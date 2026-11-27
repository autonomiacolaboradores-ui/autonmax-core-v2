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

const FEATURE_LABELS = Object.freeze({
  bookings: 'Agendamentos',
  orders: 'Pedidos',
  voiceStt: 'Transcrição de Áudio (STT)',
  voiceTts: 'Voz (TTS)',
  webhooks: 'Webhooks',
  softPause: 'Soft-Pause',
  ownerCommands: 'Comandos do Dono',
});

/**
 * DashboardView (Miolo): Painel PME completo com Hero Card ON/OFF,
 * Identidade, Grade 6 Cards, Ações Executivas, Testar IA e Painel Avançado.
 */
class DashboardView {
  constructor(ctx) {
    this.ctx = ctx;
  }

  getControls() {
    const controls = ['status_overview', 'quick_sync'];
    if (this.ctx.uiMode === 'advanced') {
      controls.push('prompt_editor', 'business_rules', 'webhook_diagnostics');
    }
    return controls;
  }

  render(data = {}) {
    const mode = this.ctx.uiMode;
    const partner = data.partner || {};
    const isActive = partner.activeStatus
      ? partner.activeStatus === 'ACTIVE'
      : Number(partner.is_active ?? 1) === 1;

    const displayName = partner.displayName || partner.display_name || '';
    const storeSegment = partner.storeSegment || partner.store_segment || '';
    const ownerJid = partner.ownerJid || partner.owner_jid || '';
    const welcomeMessage = partner.welcomeMessage || partner.welcome_message || '';
    const logoUrl =
      partner.logoDataUrl || partner.logo_data_url || './assets/img/logo-autonmax.jpg';
    const personalityPrompt =
      partner.personalityPrompt || partner.personality_prompt || '';
    const businessRulesRaw = partner.businessRules ?? partner.business_rules ?? '';
    const businessRulesText =
      typeof businessRulesRaw === 'string'
        ? businessRulesRaw
        : businessRulesRaw
          ? JSON.stringify(businessRulesRaw, null, 2)
          : '';
    const workingHoursRaw = partner.workingHours ?? partner.working_hours ?? '';
    const workingHoursText =
      typeof workingHoursRaw === 'string'
        ? workingHoursRaw
        : workingHoursRaw
          ? JSON.stringify(workingHoursRaw, null, 2)
          : '';
    const policiesRaw = partner.policies ?? '';
    const policiesText =
      typeof policiesRaw === 'string'
        ? policiesRaw
        : policiesRaw
          ? JSON.stringify(policiesRaw, null, 2)
          : '';
    const saveFeedback = data.pmeSaveFeedback || null;
    const specializeDifferentiators = String(data.specializeDifferentiators || '');
    const specializing = Boolean(data.specializing);
    const specializeFeedback = data.specializeFeedback || null;

    const pdfFiles = Array.isArray(partner.pdfFiles || partner.pdf_files)
      ? partner.pdfFiles || partner.pdf_files
      : [];
    const imageFiles = Array.isArray(partner.imageFiles || partner.image_files)
      ? partner.imageFiles || partner.image_files
      : [];

    const catalog = Array.isArray(data.catalog) ? data.catalog : [];
    const services = catalog.filter(
      (i) => String(i.type || i.item_type || '').toUpperCase() === 'SERVICE'
    );
    const products = catalog.filter(
      (i) => String(i.type || i.item_type || '').toUpperCase() === 'PRODUCT'
    );

    const waStatus = String(data.waStatus || 'DISCONNECTED').toUpperCase();
    const waLabel =
      waStatus === 'CONNECTED'
        ? 'Conectado (Socket Ativo)'
        : waStatus === 'PAIRING_READY'
          ? 'Pronto para parear'
          : waStatus === 'STANDBY'
            ? 'Standby'
            : 'Desconectado';

    const servicesPreview = services.length
      ? services
          .slice(0, 3)
          .map((s) => escapeHtml(s.name))
          .join(' • ')
      : 'Nenhum serviço cadastrado ainda. Clique para abrir o painel.';
    const productsPreview = products.length
      ? products
          .slice(0, 3)
          .map((p) => escapeHtml(p.name))
          .join(' • ')
      : 'Nenhum produto cadastrado ainda. Clique para abrir o painel.';

    const pdfListHtml = pdfFiles
      .map(
        (f, idx) =>
          `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;border-radius:10px;background:var(--surface-input);">
             <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(f.name || `PDF ${idx + 1}`)}</span>
             <button type="button" class="logout-btn" data-remove-pdf="${idx}" aria-label="Remover PDF">${icon('trash-2', { size: 14 })}</button>
           </div>`
      )
      .join('');

    const imgListHtml = imageFiles
      .map(
        (f, idx) =>
          `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;border-radius:10px;background:var(--surface-input);">
             <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(f.name || `Imagem ${idx + 1}`)}</span>
             <button type="button" class="logout-btn" data-remove-img="${idx}" aria-label="Remover Imagem">${icon('trash-2', { size: 14 })}</button>
           </div>`
      )
      .join('');

    const aiTest = data.aiTestResult || null;
    const aiTestHtml = aiTest
      ? `<div class="autonmax-card" data-ai-test-result="true" style="margin-bottom:16px;">
           <strong>${aiTest.ok ? 'IA Online' : 'Falha no Teste de IA'}</strong>
           ${aiTest.providerUsed ? `<span> — ${escapeHtml(aiTest.providerUsed)} (${escapeHtml(aiTest.model || '')})</span>` : ''}
           <p style="margin:6px 0 0;color:var(--color-text-muted);">${escapeHtml(aiTest.text || aiTest.error || '')}</p>
         </div>`
      : '';

    const features = {
      ...this.ctx.featureFlags,
      ...(partner.featureFlags || partner.feature_flags || {}),
    };
    const featureTogglesHtml = Object.entries(FEATURE_LABELS)
      .map(([key, label]) => {
        const checked = features[key] !== false ? 'checked' : '';
        return `<label style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px;border-radius:12px;background:var(--surface-input);cursor:pointer;">
                  <span>${label}</span>
                  <input type="checkbox" data-feature-toggle="${key}" ${checked} />
                </label>`;
      })
      .join('');

    const advancedBlock =
      mode === 'advanced'
        ? `<div class="autonmax-card" data-advanced-panel="true">
             <h3 style="font-family: var(--font-heading); margin-top: 0;">Painel de Chaves & Sincronização Avançada</h3>
             <p style="color: var(--color-text-muted);">Ative ou desative módulos do parceiro e force a sincronização da fila offline.</p>
             <div class="pme-v2-grid" style="margin-bottom: 14px;">${featureTogglesHtml}</div>
             <button type="button" class="autonmax-btn" data-action="sync-now">${icon('refresh-cw', { size: 16 })} <span>Forçar Sincronização</span></button>
           </div>`
        : '';

    const appointmentsCount = Number(data.appointmentsCount || 0);
    const appointmentsTodayCount = Number(data.appointmentsTodayCount ?? 0);
    const ordersCount = Number(data.ordersCount || 0);
    const ordersTodayCount = Number(data.ordersTodayCount ?? 0);

    return [
      `<section data-view="dashboard" data-ui-mode="${mode}">`,
      `  <div class="attendant-header-banner">`,
      `    <h2 style="font-family: var(--font-heading); margin: 0 0 6px;">Atendente Digital Max</h2>`,
      `    <p style="margin: 0; color: var(--color-text-muted);">Seu atendente de operações e vendas autônomo para o WhatsApp 24/7.</p>`,
      `  </div>`,
      `  <div class="attendant-hero-card">`,
      `    <div>`,
      `      <div class="status-indicator-pill ${isActive ? 'active' : 'paused'}" data-hero-status-pill="true">`,
      `        <span class="indicator-dot"></span>`,
      `        <span>${isActive ? 'ATIVO E ATENDENDO' : 'PAUSADO'}</span>`,
      `      </div>`,
      `      <h3 style="font-family: var(--font-heading); margin: 10px 0 4px;">Max — Executivo Virtual de Atendimento</h3>`,
      `      <p style="margin: 0; color: var(--color-text-muted);">Seu funcionário de I.A. atende clientes, esclarece dúvidas, consulta preços e realiza agendamentos pelo WhatsApp.</p>`,
      `    </div>`,
      `    <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">`,
      `      <label class="toggle-switch-hero" aria-label="Ativar ou pausar Max">`,
      `        <input type="checkbox" data-action="toggle-partner-active" ${isActive ? 'checked' : ''} />`,
      `        <span class="slider-hero"></span>`,
      `      </label>`,
      `      <span style="font-size:0.85rem;font-weight:700;color:var(--color-primary);">${isActive ? 'Max Online' : 'Max Pausado'}</span>`,
      `    </div>`,
      `  </div>`,
      `  <div class="max-executive-actions-grid">`,
      `    <button type="button" class="exec-action-btn primary glow-neon" data-action="export-appointments-pdf">${icon('file-text', { size: 18 })} <span>Gerar Relatório Diário</span></button>`,
      `    <div class="knowledge-card" style="margin:0;display:flex;align-items:center;gap:12px;">`,
      `      <div class="k-icon">${icon('qr-code', { size: 20 })}</div>`,
      `      <div><div style="font-size:0.8rem;color:var(--color-text-muted);">Conexão WhatsApp</div><strong data-wa-status-label="true">${waLabel}</strong></div>`,
      `    </div>`,
      `    <button type="button" class="exec-action-btn glow-blue" data-action="connect-whatsapp">${icon('qr-code', { size: 18 })} <span>Conectar WhatsApp</span></button>`,
      `  </div>`,
      `  <div style="display:flex;justify-content:flex-end;margin-bottom:16px;">`,
      `    <button type="button" class="exec-action-btn" data-action="test-ai">${icon('sparkles', { size: 16 })} <span>Testar IA (Groq)</span></button>`,
      `  </div>`,
      aiTestHtml,
      `  <div class="knowledge-card">`,
      `    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">`,
      `      <div class="k-icon">${icon('store', { size: 20 })}</div>`,
      `      <h4 style="margin:0;font-family:var(--font-heading);">Identidade do Estabelecimento</h4>`,
      `    </div>`,
      `    <div style="display:flex;flex-direction:column;gap:12px;">`,
      `      <input type="text" class="dark-input" data-pme-field="displayName" value="${escapeHtml(displayName)}" placeholder="Nome exibido no Header" />`,
      `      <div class="pme-v2-grid">`,
      `        <input type="text" class="dark-input" data-pme-field="storeSegment" value="${escapeHtml(storeSegment)}" placeholder="Segmento (ex: Barbearia, Software, Clínica)" />`,
      `        <input type="text" class="dark-input" data-pme-field="ownerJid" value="${escapeHtml(ownerJid)}" placeholder="WhatsApp do Dono (ex: 5511999990000)" />`,
      `      </div>`,
      `      <input type="text" class="dark-input" data-pme-field="welcomeMessage" value="${escapeHtml(welcomeMessage)}" placeholder="Mensagem de boas-vindas padrão" />`,
      `      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">`,
      `        <img src="${escapeHtml(logoUrl)}" alt="Logo" class="user-avatar" onerror="this.style.display='none'" />`,
      `        <label class="exec-action-btn" style="cursor:pointer;">`,
      `          ${icon('upload', { size: 16 })} <span>Mudar Logo</span>`,
      `          <input type="file" accept="image/*" style="display:none;" data-pme-upload="logo" />`,
      `        </label>`,
      `        <button type="button" class="exec-action-btn primary" style="margin-left:auto;" data-action="save-pme-config">${icon('save', { size: 16 })} <span>Salvar Identidade</span></button>`,
      `      </div>`,
      `    </div>`,
      `  </div>`,
      `  <div class="pme-v2-grid">`,
      `    <div class="knowledge-card">`,
      `      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px;">`,
      `        <div style="display:flex;align-items:center;gap:10px;"><div class="k-icon">${icon('file-text', { size: 20 })}</div><h4 style="margin:0;">Instruções do Max (Prompt)</h4></div>`,
      `        <button type="button" class="exec-action-btn primary" data-action="specialize-max" ${specializing ? 'disabled' : ''}>${icon('sparkles', { size: 16 })} <span>${specializing ? 'Especializando o MAX para o seu segmento...' : 'Especializar o MAX'}</span></button>`,
      `      </div>`,
      `      <label style="display:block;margin:0 0 6px;font-size:0.85rem;color:var(--color-text-muted);">Diferenciais e Principais Atividades da Empresa</label>`,
      `      <textarea class="dark-input" rows="2" maxlength="450" data-specialize-field="differentiators" placeholder="Ex.: atendimento com hora marcada, garantia nos serviços, entrega rápida...">${escapeHtml(specializeDifferentiators)}</textarea>`,
      specializeFeedback
        ? `      <p class="auth-feedback ${specializeFeedback.ok ? 'success' : 'error'}" data-specialize-feedback="true" style="margin:10px 0;">${escapeHtml(specializeFeedback.message)}</p>`
        : '',
      `      <label style="display:block;margin:10px 0 6px;font-size:0.85rem;color:var(--color-text-muted);">Prompt Completo do Atendente (revise antes de salvar)</label>`,
      `      <textarea class="dark-input" rows="6" data-pme-field="personalityPrompt" placeholder="Defina regras, tom de voz e comportamento...">${escapeHtml(personalityPrompt)}</textarea>`,
      `      <label style="display:block;margin:10px 0 6px;font-size:0.85rem;color:var(--color-text-muted);">Regras de Negócio</label>`,
      `      <textarea class="dark-input" rows="3" data-pme-field="businessRules" placeholder="Regras comerciais, prazos, garantia...">${escapeHtml(businessRulesText)}</textarea>`,
      `    </div>`,
      `    <div class="knowledge-card">`,
      `      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;"><div class="k-icon">${icon('upload', { size: 20 })}</div><h4 style="margin:0;">Base de Conhecimento (PDFs ${pdfFiles.length}/5 & Imagens ${imageFiles.length}/10)</h4></div>`,
      `      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;">${pdfListHtml}${imgListHtml}</div>`,
      `      <div style="display:flex;gap:8px;flex-wrap:wrap;">`,
      `        <label class="exec-action-btn" style="flex:1;cursor:pointer;">${icon('file-text', { size: 16 })} <span>Adicionar PDFs</span><input type="file" accept=".pdf" multiple style="display:none;" data-pme-upload="pdfs" /></label>`,
      `        <label class="exec-action-btn" style="flex:1;cursor:pointer;">${icon('upload', { size: 16 })} <span>Adicionar Imagens</span><input type="file" accept="image/*" multiple style="display:none;" data-pme-upload="images" /></label>`,
      `      </div>`,
      `    </div>`,
      `    <div class="knowledge-card" style="display:flex;flex-direction:column;justify-content:space-between;">`,
      `      <div>`,
      `        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><div class="k-icon">${icon('calendar-check', { size: 20 })}</div><span class="autonmax-status-badge">${services.length} Serviços</span></div>`,
      `        <h4 style="margin:0 0 6px;">Catálogo de Serviços</h4>`,
      `        <p style="color:var(--color-text-muted);font-size:0.9rem;">${servicesPreview}</p>`,
      `      </div>`,
      `      <button type="button" class="exec-action-btn primary" data-nav-catalog="SERVICE">${icon('layers', { size: 16 })} <span>Gerenciar Serviços (Dashboard)</span></button>`,
      `    </div>`,
      `    <div class="knowledge-card" style="display:flex;flex-direction:column;justify-content:space-between;">`,
      `      <div>`,
      `        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><div class="k-icon">${icon('shopping-bag', { size: 20 })}</div><span class="autonmax-status-badge">${products.length} Produtos</span></div>`,
      `        <h4 style="margin:0 0 6px;">Catálogo de Produtos</h4>`,
      `        <p style="color:var(--color-text-muted);font-size:0.9rem;">${productsPreview}</p>`,
      `      </div>`,
      `      <button type="button" class="exec-action-btn primary" data-nav-catalog="PRODUCT">${icon('shopping-bag', { size: 16 })} <span>Gerenciar Produtos (Dashboard)</span></button>`,
      `    </div>`,
      `    <div class="knowledge-card">`,
      `      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;"><div class="k-icon">${icon('clock', { size: 20 })}</div><h4 style="margin:0;">Horários & Agenda</h4></div>`,
      `      <textarea class="dark-input" rows="4" data-pme-field="workingHours" placeholder="Ex: Seg a Sáb das 09:00 às 18:00...">${escapeHtml(workingHoursText)}</textarea>`,
      `    </div>`,
      `    <div class="knowledge-card">`,
      `      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;"><div class="k-icon">${icon('shield', { size: 20 })}</div><h4 style="margin:0;">Políticas Internas</h4></div>`,
      `      <textarea class="dark-input" rows="4" data-pme-field="policies" placeholder="Cancelamento, Pix, cartão, trocas...">${escapeHtml(policiesText)}</textarea>`,
      `    </div>`,
      `  </div>`,
      `  <div class="pme-v2-grid" style="margin-top:16px;">`,
      `    <div class="knowledge-card" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">`,
      `      <div><h4 style="margin:0 0 4px;">Agendamentos Confirmados</h4><p style="margin:0;color:var(--color-text-muted);" data-appointments-count="true">Confirmados gravados: <strong>${appointmentsCount}</strong>${appointmentsTodayCount > 0 ? ` (${appointmentsTodayCount} hoje)` : ''}</p></div>`,
      `      <button type="button" class="exec-action-btn primary" data-nav-view="appointments">${icon('calendar-check', { size: 16 })} <span>Abrir Agenda</span></button>`,
      `    </div>`,
      `    <div class="knowledge-card" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">`,
      `      <div><h4 style="margin:0 0 4px;">Pedidos Confirmados</h4><p style="margin:0;color:var(--color-text-muted);" data-orders-count="true">Confirmados gravados: <strong>${ordersCount}</strong>${ordersTodayCount > 0 ? ` (${ordersTodayCount} hoje)` : ''}</p></div>`,
      `      <button type="button" class="exec-action-btn primary" data-nav-view="orders">${icon('shopping-cart', { size: 16 })} <span>Abrir Pedidos</span></button>`,
      `    </div>`,
      `  </div>`,
      saveFeedback
        ? `<p class="auth-feedback ${saveFeedback.ok ? 'success' : 'error'}" data-pme-save-feedback="true" style="margin-top:14px;">${escapeHtml(saveFeedback.message)}</p>`
        : '',
      `  <div style="margin-top:16px;">`,
      `    <button type="button" class="exec-action-btn primary glow-neon" style="width:100%;" data-action="save-pme-config">${icon('save', { size: 18 })} <span>Salvar Alterações do Max</span></button>`,
      `  </div>`,
      advancedBlock,
      `</section>`,
    ]
      .filter(Boolean)
      .join('\n');
  }
}

module.exports = { DashboardView };
