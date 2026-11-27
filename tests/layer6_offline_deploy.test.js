'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { IndexedDbAdapter } = require('../app-web/src/storage/IndexedDbAdapter');
const { CapacitorSqliteAdapter } = require('../app-web/src/storage/CapacitorSqliteAdapter');
const { SyncQueue } = require('../app-web/src/sync/SyncQueue');
const { createEnvironmentPorts } = require('../app-web/src/ports/EnvironmentPorts');
const { mountAutonmaxUI } = require('../app-web/src/config/FrontendInitConfig');
const { AuthScreen } = require('../app-web/src/components/AuthScreen');
const { WhatsAppQrModal } = require('../app-web/src/components/WhatsAppQrModal');
const { AppShell } = require('../app-web/src/shell/AppShell');
const { DatabaseManager } = require('../core/storage/DatabaseManager');
const { PartnerRepository } = require('../core/storage/repositories/PartnerRepository');
const { CatalogService } = require('../core/domain/CatalogService');
const { toCatalogDto } = require('../core/gateway/routes/CatalogRoutes');

const VNEXT_ROOT = path.resolve(__dirname, '..');

function createMockNetwork(initialOnline = true) {
  let online = initialOnline;
  const listeners = new Set();
  return {
    isOnline: () => online,
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    setOnline(next) {
      online = Boolean(next);
      for (const cb of Array.from(listeners)) {
        cb(online);
      }
    },
  };
}

describe('Layer 6 — Interface Híbrida Offline-First (SPA/PWA + Capacitor) & Deploy Render', () => {
  test('1. Operação Offline + SyncQueue: cria item e cancela agendamento offline e sincroniza em ordem FIFO com X-Idempotency-Key', async () => {
    const storage = new IndexedDbAdapter();
    await storage.initialize();
    const network = createMockNetwork(false);
    const ports = createEnvironmentPorts({ storage, network });
    await ports.secureAuth.setToken('jwt-offline-token');

    const sentRequests = [];
    const mockFetch = async (url, init) => {
      sentRequests.push({
        url,
        method: init.method,
        headers: init.headers,
        body: init.body ? JSON.parse(init.body) : null,
      });
      return {
        ok: true,
        status: 200,
        async json() {
          return { ok: true };
        },
      };
    };

    const container = { innerHTML: '', style: { setProperty() {} } };
    const ui = mountAutonmaxUI(container, {
      shell_enabled: true,
      ui_mode: 'guided',
      baseUrl: 'https://api.autonmax.local',
      fetchImpl: mockFetch,
      environment_ports: ports,
    });

    try {
      assert.equal(await ui.syncQueue.getStatus(), 'OFFLINE');

      // Seed local appointment, then create catalog item & cancel appointment offline
      await storage.upsert('appointments', {
        id: 'appt-off-1',
        partnerId: 'prt-1',
        status: 'CONFIRMED',
      });

      const catAction = await ui.views.catalog.createItemOffline('prt-1', {
        id: 'itm-off-1',
        name: 'Corte Offline',
        type: 'SERVICE',
        priceCents: 6000,
        idempotencyKey: 'idem-cat-001',
      });
      assert.equal(catAction.record.name, 'Corte Offline');

      await ui.views.appointments.cancelAppointmentOffline(
        'prt-1',
        'appt-off-1',
        'idem-cancel-001'
      );

      // Local storage reflects both offline updates immediately
      const localAppt = await storage.get('appointments', 'appt-off-1');
      assert.equal(localAppt.status, 'CANCELLED');
      assert.equal((await storage.getPendingSync()).length, 2);

      // Reconnect triggers automatic flush; also await explicit flush to verify FIFO order
      network.setOnline(true);
      await new Promise((r) => setTimeout(r, 20));
      if ((await storage.getPendingSync()).length > 0) {
        await ui.syncQueue.flush();
      }

      assert.equal(sentRequests.length, 2);
      assert.equal(sentRequests[0].url, 'https://api.autonmax.local/api/v1/partners/prt-1/catalog');
      assert.equal(sentRequests[0].headers['X-Idempotency-Key'], 'idem-cat-001');
      assert.equal(sentRequests[0].headers.Authorization, 'Bearer jwt-offline-token');

      assert.equal(
        sentRequests[1].url,
        'https://api.autonmax.local/api/v1/partners/prt-1/appointments/appt-off-1/cancel'
      );
      assert.equal(sentRequests[1].headers['X-Idempotency-Key'], 'idem-cancel-001');
      assert.equal((await storage.getPendingSync()).length, 0);
      assert.equal(await ui.syncQueue.getStatus(), 'ONLINE');
    } finally {
      ui.unmount();
    }
  });

  test('2. Reconciliação de Conflito (409 SLOT_TAKEN): marca CONFLICT sem travar o restante da fila FIFO', async () => {
    const storage = new CapacitorSqliteAdapter();
    await storage.initialize();
    const network = createMockNetwork(true);

    const processedPaths = [];
    const syncQueue = new SyncQueue({
      storage,
      network,
      baseUrl: 'https://api.autonmax.local',
      fetchImpl: async (url) => {
        processedPaths.push(url);
        if (url.endsWith('/appointments')) {
          return {
            ok: false,
            status: 409,
            async json() {
              return { ok: false, error: { code: 'SLOT_TAKEN' } };
            },
          };
        }
        return {
          ok: true,
          status: 201,
          async json() {
            return { ok: true };
          },
        };
      },
    });

    await syncQueue.enqueue({
      type: 'appointment.create',
      payload: { partnerId: 'prt-1', itemId: 'svc-1', dateStr: '2026-12-20', timeSlot: '10:00' },
      idempotencyKey: 'idem-conflict-1',
    });
    await syncQueue.enqueue({
      type: 'catalog.create',
      payload: { partnerId: 'prt-1', item: { id: 'prd-after', name: 'Produto OK', type: 'PRODUCT', priceCents: 2000 } },
      idempotencyKey: 'idem-ok-2',
    });

    const flushRes = await syncQueue.flush();
    assert.equal(flushRes.conflicts, 1);
    assert.equal(flushRes.synced, 1);
    assert.equal(flushRes.remaining, 0);
    assert.equal(processedPaths.length, 2);

    const conflicts = await storage.getConflicts();
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].status, 'CONFLICT');
    assert.equal(conflicts[0].conflictReason, 'SLOT_TAKEN');
    assert.equal(await syncQueue.getStatus(), 'CONFLICT');
  });

  test('3. Validação dos Blueprints Render (render.free.yaml & render.starter.yaml)', () => {
    const freeYaml = fs.readFileSync(path.join(VNEXT_ROOT, 'render.free.yaml'), 'utf8');
    const starterYaml = fs.readFileSync(path.join(VNEXT_ROOT, 'render.starter.yaml'), 'utf8');
    const pkgJson = fs.readFileSync(path.join(VNEXT_ROOT, 'package.json'), 'utf8');

    for (const [label, yaml] of [
      ['render.free.yaml', freeYaml],
      ['render.starter.yaml', starterYaml],
    ]) {
      assert.match(yaml, /NODE_OPTIONS[\s\S]*?--max-old-space-size=384/, `${label} missing V8 384MB cap`);
      assert.match(yaml, /VOICE_STT_DRIVER[\s\S]*?cloud/, `${label} missing cloud STT`);
      assert.match(yaml, /VOICE_TTS_DRIVER[\s\S]*?off/, `${label} missing TTS off`);
      assert.doesNotMatch(yaml, /puppeteer/i, `${label} must not reference puppeteer`);
    }

    assert.match(freeYaml, /plan:\s*free/);
    assert.match(starterYaml, /plan:\s*starter/);
    assert.match(starterYaml, /mountPath:\s*\/var\/data/);
    assert.match(starterYaml, /sizeGB:\s*2/);
    assert.match(starterYaml, /DB_PATH[\s\S]*?\/var\/data\/autonmax\.db/);
    assert.match(starterYaml, /SESSIONS_DIR[\s\S]*?\/var\/data\/sessions/);

    assert.doesNotMatch(pkgJson, /puppeteer|better-sqlite3|sqlite3/i);
  });

  test('4. Checklist de Segurança Android (Manifest, Network Security Config & Gradle DSL)', () => {
    const manifest = fs.readFileSync(
      path.join(VNEXT_ROOT, 'android/app/src/main/AndroidManifest.xml'),
      'utf8'
    );
    const netSec = fs.readFileSync(
      path.join(VNEXT_ROOT, 'android/app/src/main/res/xml/network_security_config.xml'),
      'utf8'
    );
    const gradle = fs.readFileSync(
      path.join(VNEXT_ROOT, 'android/app/build.gradle.kts'),
      'utf8'
    );
    const capConfig = fs.readFileSync(
      path.join(VNEXT_ROOT, 'capacitor.config.ts'),
      'utf8'
    );

    assert.match(manifest, /android:usesCleartextTraffic="false"/);
    assert.match(manifest, /android:allowBackup="false"/);
    assert.match(manifest, /android:networkSecurityConfig="@xml\/network_security_config"/);
    assert.match(netSec, /<base-config\s+cleartextTrafficPermitted="false">/);
    assert.match(gradle, /minSdk\s*=\s*24/);
    assert.match(gradle, /targetSdk\s*=\s*35/);
    assert.match(gradle, /isMinifyEnabled\s*=\s*true/);
    assert.match(gradle, /isShrinkResources\s*=\s*true/);
    assert.match(capConfig, /webDir:\s*'app-web\/dist'/);
    assert.match(capConfig, /cleartext:\s*false/);
  });

  test('5. Separação Casca vs. Miolo & Configuração (FrontendInitConfig: shell_enabled & ui_mode)', () => {
    const cssProps = new Map();
    const container = {
      innerHTML: '',
      style: {
        setProperty(k, v) {
          cssProps.set(k, v);
        },
      },
    };

    const embedded = mountAutonmaxUI(container, {
      shell_enabled: false,
      ui_mode: 'guided',
      theme_tokens: {
        colorPrimary: '#115e59',
        brandName: 'Host White-Label',
      },
    });

    try {
      // Shell omitted, operational views & OperationalStatusBadge active
      assert.equal(embedded.html.includes('data-autonmax-shell="true"'), false);
      assert.equal(embedded.html.includes('data-autonmax-status="ONLINE"'), true);
      assert.equal(embedded.html.includes('data-view="dashboard"'), true);
      assert.equal(cssProps.get('--color-primary'), '#115e59');

      // Guided vs Advanced switches controls cleanly in the same view source
      const guidedControls = embedded.getActiveViewControls();
      assert.equal(guidedControls.includes('prompt_editor'), false);

      embedded.setUiMode('advanced');
      assert.equal(embedded.uiMode, 'advanced');
      const advancedControls = embedded.getActiveViewControls();
      assert.equal(advancedControls.includes('prompt_editor'), true);
      assert.equal(embedded.html.includes('data-advanced-panel="true"'), true);

      // Navigate across all 6 views cleanly
      for (const viewId of ['catalog', 'appointments', 'orders', 'conversations', 'channel']) {
        embedded.navigate(viewId);
        assert.equal(embedded.html.includes(`data-view="${viewId}"`), true);
      }
    } finally {
      embedded.unmount();
    }

    // With shell_enabled: true, AppShell renders header & nav
    const standalone = mountAutonmaxUI(container, { shell_enabled: true });
    try {
      assert.equal(standalone.html.includes('data-autonmax-shell="true"'), true);
      assert.equal(standalone.html.includes('data-autonmax-status="ONLINE"'), true);
    } finally {
      standalone.unmount();
    }
  });

  test('6. Higiene Estática: zero cores hex hardcoded, zero fontes fixas e zero @capacitor/indexedDB em views/ e components/', () => {
    const dirsToScan = [
      path.join(VNEXT_ROOT, 'app-web/src/views'),
      path.join(VNEXT_ROOT, 'app-web/src/components'),
    ];

    const files = [];
    for (const dir of dirsToScan) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith('.js')) {
          files.push(path.join(dir, entry.name));
        }
      }
    }
    assert.equal(files.length, 10, 'Expected 6 views + 4 component files');

    const hexColorRe = /#[0-9a-fA-F]{3,8}\b/;
    const runtimeImportRe = /@capacitor\/|indexedDB|localStorage/i;
    const fixedFontRe = /font-family\s*:(?!\s*var\(--)/i;

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf8');
      const name = path.basename(filePath);
      assert.equal(hexColorRe.test(content), false, `Hardcoded hex color found in ${name}`);
      assert.equal(runtimeImportRe.test(content), false, `Direct runtime/Capacitor/IDB reference in ${name}`);
      assert.equal(fixedFontRe.test(content), false, `Hardcoded font-family found in ${name}`);
    }
  });

  test('7. Slots Injetáveis (OutputActions) & Ergonomia Mobile-First em tokens.css', async () => {
    const exportedPayloads = [];
    const sharedPayloads = [];

    const ui = mountAutonmaxUI(
      { innerHTML: '', style: { setProperty() {} } },
      {
        shell_enabled: false,
        output_actions: {
          async exportAppointmentsPdf(payload) {
            exportedPayloads.push(payload);
            return { ok: true, hostHandled: true };
          },
          async shareReceipt(payload) {
            sharedPayloads.push(payload);
            return { ok: true, hostHandled: true };
          },
        },
      }
    );

    try {
      const pdfRes = await ui.views.appointments.exportAppointmentsPdf({
        partnerId: 'prt-1',
        dateStr: '2026-12-20',
        items: [{ id: 'a1', time_slot: '10:00', client_name: 'Ana' }],
      });
      assert.equal(pdfRes.hostHandled, true);
      assert.equal(exportedPayloads.length, 1);

      const shareRes = await ui.views.appointments.shareReceipt({
        id: 'a1',
        text: 'Comprovante Teste',
      });
      assert.equal(shareRes.hostHandled, true);
      assert.equal(sharedPayloads[0].type, 'appointment');
    } finally {
      ui.unmount();
    }

    const css = fs.readFileSync(
      path.join(VNEXT_ROOT, 'app-web/src/theme/tokens.css'),
      'utf8'
    );
    assert.match(css, /min-height:\s*44px/);
    assert.match(css, /min-width:\s*44px/);
    assert.match(css, /overflow-x:\s*hidden/);
    assert.match(css, /@media\s*\(max-width:\s*767px\)/);
    assert.match(css, /\.autonmax-table\s+thead\s*\{\s*display:\s*none;/);
  });

  test('8. Identidade Visual Onda 3: AuthScreen, AppShell Executivo & WhatsAppQrModal', () => {
    const authScreen = new AuthScreen();
    const loginHtml = authScreen.render({ mode: 'login' });
    assert.match(loginHtml, /data-auth-screen="true"/);
    assert.match(loginHtml, /Bem-vindo ao/);
    assert.match(loginHtml, /Entrar/);
    assert.match(loginHtml, /Criar Conta/);
    assert.equal(loginHtml.includes('name="displayName"'), false);

    const registerHtml = authScreen.render({ mode: 'register', error: 'Credenciais inválidas' });
    assert.equal(registerHtml.includes('name="displayName"'), true);
    assert.match(registerHtml, /Credenciais inválidas/);

    const shell = new AppShell({
      brandName: 'AUTON.MAX',
      partnerName: 'Barbearia Alpha',
      activeView: 'dashboard',
      uiMode: 'guided',
    });
    const shellHtml = shell.render('<div data-inner="true"></div>');
    assert.match(shellHtml, /AUTON<span class="cyber-accent">\.MAX<\/span>/);
    assert.match(shellHtml, /Painel de Configurações/);
    assert.match(shellHtml, /Atendimentos Ativos/);
    assert.match(shellHtml, /Barbearia Alpha/);
    assert.match(shellHtml, /data-shell-action="logout"/);

    // shell_enabled: false omits AppShell
    const embedded = mountAutonmaxUI(
      { innerHTML: '', style: { setProperty() {} } },
      { shell_enabled: false }
    );
    try {
      assert.equal(embedded.html.includes('data-autonmax-shell="true"'), false);
    } finally {
      embedded.unmount();
    }

    const modal = new WhatsAppQrModal();
    const skeletonHtml = modal.render({ open: true, status: 'PAIRING_READY', qrCodeBase64: null });
    assert.match(skeletonHtml, /data-wa-modal="true"/);
    assert.match(skeletonHtml, /data-qr-skeleton="true"/);

    const qrHtml = modal.render({
      open: true,
      status: 'PAIRING_READY',
      qrCodeBase64: 'data:image/png;base64,AAAA',
    });
    assert.match(qrHtml, /data-wa-qr-img="true"/);
    assert.equal(qrHtml.includes('data-qr-skeleton="true"'), false);

    const connectedHtml = modal.render({
      open: true,
      status: 'CONNECTED',
      phoneNumber: '5511999990000',
    });
    assert.match(connectedHtml, /WhatsApp Conectado/);
    assert.match(connectedHtml, /5511999990000/);
  });

  test('9. Onda 4 Views Completas: DashboardView PME, CatalogView (Serviços/Produtos), Appointments/Orders por Dia & ConversationsView', () => {
    const ui = mountAutonmaxUI(
      { innerHTML: '', style: { setProperty() {} } },
      { shell_enabled: false, ui_mode: 'guided' }
    );

    try {
      // 1. DashboardView PME
      const dashHtml = ui.render({
        dashboard: {
          partner: {
            displayName: 'Barbearia Alpha',
            activeStatus: 'ACTIVE',
            personalityPrompt: 'Seja cordial',
            workingHours: '09:00 às 18:00',
            policies: 'Pix e Cartão',
          },
          catalog: [
            { id: 's1', name: 'Corte', type: 'SERVICE', priceCents: 5000, durationMinutes: 45 },
            { id: 'p1', name: 'Pomada', type: 'PRODUCT', priceCents: 3500 },
          ],
          appointmentsCount: 3,
          ordersCount: 2,
          waStatus: 'CONNECTED',
          aiTestResult: { ok: true, providerUsed: 'groq', model: 'llama-3.3-70b', text: 'Online!' },
        },
      });
      assert.match(dashHtml, /Atendente Digital Max/);
      assert.match(dashHtml, /ATIVO E ATENDENDO/);
      assert.match(dashHtml, /data-action="toggle-partner-active"/);
      assert.match(dashHtml, /data-action="test-ai"/);
      assert.match(dashHtml, /data-ai-test-result="true"/);
      assert.match(dashHtml, /1 Serviços/);
      assert.match(dashHtml, /1 Produtos/);
      assert.match(dashHtml, /Confirmados gravados:\s*<strong>3<\/strong>/);
      assert.match(dashHtml, /Confirmados gravados:\s*<strong>2<\/strong>/);
      assert.match(dashHtml, /Salvar Alterações do Max/);

      // 2. CatalogView (PRODUCT mode shows inviolable order rule banner)
      ui.navigate('catalog');
      const prodHtml = ui.render({
        catalog: {
          items: [
            { id: 's1', name: 'Corte', type: 'SERVICE', priceCents: 5000, durationMinutes: 45 },
            { id: 'p1', name: 'Pomada', type: 'PRODUCT', priceCents: 3500 },
          ],
          filterType: 'PRODUCT',
          formOpen: true,
        },
      });
      assert.match(prodHtml, /Painel de Produtos/);
      assert.match(prodHtml, /REGRA INVIOLÁVEL DE PEDIDOS DE PRODUTO/);
      assert.match(prodHtml, /Pomada/);
      assert.equal(prodHtml.includes('Corte'), false);
      assert.match(prodHtml, /data-catalog-form="true"/);

      // 3. AppointmentsView grouped by day
      ui.navigate('appointments');
      const apptHtml = ui.render({
        appointments: [
          {
            id: 'a1',
            date_str: '2026-12-20',
            time_slot: '10:00',
            client_name: 'Ana',
            item_name_snapshot: 'Corte',
            status: 'CONFIRMED',
          },
        ],
      });
      assert.match(apptHtml, /days-grid/);
      assert.match(apptHtml, /2026-12-20/);
      assert.match(apptHtml, /data-export-appointments-date="2026-12-20"/);
      assert.match(apptHtml, /data-cancel-appointment="a1"/);

      // 4. OrdersView grouped by day (including full product name)
      ui.navigate('orders');
      const orderHtml = ui.render({
        orders: [
          {
            id: 'ord-1234',
            created_at: '2026-12-20T14:00:00Z',
            client_name: 'Bruno',
            items: [
              {
                name: 'Pomada Modeladora Premium Efeito Seco',
                qty: 2,
                price_cents: 1750,
                subtotal_cents: 3500,
              },
            ],
            total_cents: 3500,
            status: 'CONFIRMED',
          },
        ],
      });
      assert.match(orderHtml, /days-grid/);
      assert.match(orderHtml, /2026-12-20/);
      assert.match(orderHtml, /2x Pomada Modeladora Premium Efeito Seco/);
      assert.match(orderHtml, /R\$ 35,00/);
      assert.match(orderHtml, /data-export-orders-date="2026-12-20"/);

      // 5. ConversationsView with Soft-Pause, toggle Ver/Ocultar Mensagens & operator reply form
      ui.navigate('conversations');
      const convItems = [
        { id: 'c1', external_chat_id: '5511999990001@s.whatsapp.net', is_paused: 1 },
        { id: 'c2', external_chat_id: '5511999990002@s.whatsapp.net', is_paused: 0 },
      ];
      const convHtml = ui.render({
        conversations: {
          items: convItems,
          selectedConversationId: 'c1',
          messages: [{ role: 'customer', content: 'Oi, preciso de ajuda' }],
        },
      });
      assert.match(convHtml, /PAUSADO — HUMANO NO CONTROLE/);
      assert.match(convHtml, /Retomar IA/);
      assert.match(convHtml, /data-chat-jid="5511999990001@s\.whatsapp\.net"/);
      assert.match(convHtml, /data-conv-select="c1"[^>]*aria-expanded="true"[^>]*>.*Ocultar Mensagens/);
      assert.match(convHtml, /data-conv-select="c2"[^>]*aria-expanded="false"[^>]*>.*Ver Mensagens/);
      assert.match(convHtml, /data-conv-history="c1"/);
      assert.match(convHtml, /data-operator-form="c1"/);
      assert.match(convHtml, /Oi, preciso de ajuda/);

      // Trocar para c2 recolhe c1 e abre c2
      const convSwitchHtml = ui.render({
        conversations: {
          items: convItems,
          selectedConversationId: 'c2',
          messages: [{ role: 'customer', content: 'Segunda conversa' }],
        },
      });
      assert.equal(convSwitchHtml.includes('data-conv-history="c1"'), false);
      assert.match(convSwitchHtml, /data-conv-history="c2"/);
      assert.match(convSwitchHtml, /data-conv-select="c1"[^>]*aria-expanded="false"[^>]*>.*Ver Mensagens/);
      assert.match(convSwitchHtml, /data-conv-select="c2"[^>]*aria-expanded="true"[^>]*>.*Ocultar Mensagens/);

      // Recolher fecha o painel e volta botão para Ver Mensagens
      const convCollapsedHtml = ui.render({
        conversations: {
          items: convItems,
          selectedConversationId: null,
          messages: [],
        },
      });
      assert.equal(convCollapsedHtml.includes('data-conv-history='), false);
      assert.equal(convCollapsedHtml.includes('Ocultar Mensagens'), false);
      assert.match(convCollapsedHtml, /Ver Mensagens/);
    } finally {
      ui.unmount();
    }
  });

  test('10. E2E Produto Fictício + Interruptor de Estoque (Ilimitado para Software vs Controlado) persiste no SQLite e exibe na seção de Produtos', () => {
    const dbManager = new DatabaseManager({ dbPath: ':memory:' });
    dbManager.init();
    const partnerRepo = new PartnerRepository(dbManager);
    const catalogService = new CatalogService({ dbManager });
    const partner = partnerRepo.create({
      id: 'prt-prod-test',
      email: 'soft@autonmax.dev',
      displayName: 'SoftHouse',
    });

    const ui = mountAutonmaxUI(
      { innerHTML: '', style: { setProperty() {} } },
      { shell_enabled: false, ui_mode: 'guided' }
    );

    try {
      // 1. Cadastra produto fictício de software sem limitação de estoque (trackStock: false)
      const createdSoftware = catalogService.createItem(partner.id, {
        name: 'Licença Software AUTONMAX Pro',
        type: 'PRODUCT',
        priceCents: 19900,
        durationMinutes: 30,
        category: 'Software',
        description: 'Licença mensal ilimitada',
        trackStock: false,
        stockQuantity: null,
      });
      assert.equal(createdSoftware.track_stock, 0);
      assert.equal(createdSoftware.stock_quantity, null);

      // 2. Cadastra produto físico com estoque controlado (trackStock: true, stockQuantity: 15)
      const createdPhysical = catalogService.createItem(partner.id, {
        name: 'Kit Hardware NFC',
        type: 'PRODUCT',
        priceCents: 8900,
        category: 'Hardware',
        trackStock: true,
        stockQuantity: 15,
      });
      assert.equal(createdPhysical.track_stock, 1);
      assert.equal(createdPhysical.stock_quantity, 15);

      // 3. Recarrega do SQLite (simulando reload/reabertura da seção de Produtos)
      const persisted = catalogService
        .listItems(partner.id, { type: 'PRODUCT' })
        .map(toCatalogDto);
      assert.equal(persisted.length, 2);

      // 4. Renderiza CatalogView na seção de Produtos com formulário aberto
      ui.navigate('catalog');
      const html = ui.render({
        catalog: {
          items: persisted,
          filterType: 'PRODUCT',
          formOpen: true,
        },
      });

      assert.match(html, /data-catalog-stock-toggle="true"/);
      assert.match(html, /Licença Software AUTONMAX Pro/);
      assert.match(html, /R\$ 199,00/);
      assert.match(html, /Estoque: Ilimitado/);
      assert.match(html, /Kit Hardware NFC/);
      assert.match(html, /Estoque: 15 un/);
    } finally {
      ui.unmount();
      dbManager.close();
    }
  });

  test('11. E2E Serviço Fictício: criação, persistência no SQLite e exibição na seção de Serviços', () => {
    const dbManager = new DatabaseManager({ dbPath: ':memory:' });
    dbManager.init();
    const partnerRepo = new PartnerRepository(dbManager);
    const catalogService = new CatalogService({ dbManager });
    const partner = partnerRepo.create({
      id: 'prt-svc-test',
      email: 'svc@autonmax.dev',
      displayName: 'Studio Tech',
    });

    const ui = mountAutonmaxUI(
      { innerHTML: '', style: { setProperty() {} } },
      { shell_enabled: false, ui_mode: 'guided' }
    );

    try {
      // 1. Cadastra serviço fictício no SQLite
      const created = catalogService.createItem(partner.id, {
        name: 'Consultoria de Implantação',
        type: 'SERVICE',
        priceCents: 25000,
        durationMinutes: 60,
        category: 'Consultoria',
        description: 'Implantação completa com treinamento.',
      });
      assert.equal(created.item_type, 'SERVICE');
      assert.equal(created.price_cents, 25000);
      assert.equal(created.duration_minutes, 60);

      // 2. Recarrega do SQLite (simulando persistência após salvar/reabrir)
      const persisted = catalogService
        .listItems(partner.id, { type: 'SERVICE' })
        .map(toCatalogDto);
      assert.equal(persisted.length, 1);
      assert.equal(persisted[0].name, 'Consultoria de Implantação');

      // 3. Renderiza CatalogView na seção de Serviços
      ui.navigate('catalog');
      const html = ui.render({
        catalog: {
          items: persisted,
          filterType: 'SERVICE',
          formOpen: false,
        },
      });

      assert.match(html, /Painel de Serviços & Agendamentos/);
      assert.match(html, /1 Serviços/);
      assert.match(html, /Consultoria de Implantação/);
      assert.match(html, /R\$ 250,00/);
      assert.match(html, /60 min/);
    } finally {
      ui.unmount();
      dbManager.close();
    }
  });

  test('12. EnvironmentPorts.secureAuth persiste JWT em localStorage na Web (migrando sessionStorage) e mantém isolamento no modo nativo', async () => {
    const prevLocal = globalThis.localStorage;
    const prevSession = globalThis.sessionStorage;
    const prevCap = globalThis.Capacitor;

    const makeWebStore = () => {
      const m = new Map();
      return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: (k) => m.delete(k),
      };
    };

    try {
      const localMock = makeWebStore();
      const sessionMock = makeWebStore();
      globalThis.localStorage = localMock;
      globalThis.sessionStorage = sessionMock;
      delete globalThis.Capacitor;

      // 1. Web: setToken grava em localStorage (sobrevive ao fechar aba)
      const webPorts = createEnvironmentPorts({ isNativePlatform: false });
      await webPorts.secureAuth.setToken('jwt-web-persistent-30d');
      assert.equal(localMock.getItem('autonmax_jwt'), 'jwt-web-persistent-30d');
      assert.equal(await webPorts.secureAuth.getToken(), 'jwt-web-persistent-30d');

      // 2. Migração transparente de sessionStorage legado -> localStorage
      localMock.removeItem('autonmax_jwt');
      sessionMock.setItem('autonmax_jwt', 'jwt-migrated-from-session');
      assert.equal(await webPorts.secureAuth.getToken(), 'jwt-migrated-from-session');
      assert.equal(localMock.getItem('autonmax_jwt'), 'jwt-migrated-from-session');

      // 3. clearToken limpa ambos
      await webPorts.secureAuth.clearToken();
      assert.equal(localMock.getItem('autonmax_jwt'), null);
      assert.equal(sessionMock.getItem('autonmax_jwt'), null);

      // 4. Modo nativo (Capacitor): NUNCA grava em localStorage; usa SecureStoragePlugin
      const nativeVault = new Map();
      globalThis.Capacitor = {
        isNativePlatform: () => true,
        Plugins: {
          SecureStoragePlugin: {
            async set({ key, value }) { nativeVault.set(key, value); },
            async get({ key }) { return { value: nativeVault.get(key) || null }; },
            async remove({ key }) { nativeVault.delete(key); },
          },
        },
      };
      const nativePorts = createEnvironmentPorts({ isNativePlatform: true });
      await nativePorts.secureAuth.setToken('jwt-android-keystore');
      assert.equal(localMock.getItem('autonmax_jwt'), null);
      assert.equal(await nativePorts.secureAuth.getToken(), 'jwt-android-keystore');
      await nativePorts.secureAuth.clearToken();
      assert.equal(await nativePorts.secureAuth.getToken(), null);
    } finally {
      if (prevLocal === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = prevLocal;
      if (prevSession === undefined) delete globalThis.sessionStorage;
      else globalThis.sessionStorage = prevSession;
      if (prevCap === undefined) delete globalThis.Capacitor;
      else globalThis.Capacitor = prevCap;
    }
  });

  test('13. DashboardView renderiza "Especializar o MAX" reutilizando displayName/storeSegment sem duplicar campos e exibe estado de carregamento/feedback', () => {
    const ui = mountAutonmaxUI(
      { innerHTML: '', style: { setProperty() {} } },
      { shell_enabled: false, ui_mode: 'guided' }
    );

    try {
      const idleHtml = ui.render({
        dashboard: {
          partner: {
            displayName: 'Clínica Solar',
            storeSegment: 'Dermatologia',
            personalityPrompt: 'Prompt atual',
          },
          specializeDifferentiators: 'Atendimento com hora marcada e avaliação digital.',
          specializing: false,
          specializeFeedback: null,
        },
      });

      // Reaproveita inputs existentes sem duplicar
      assert.equal((idleHtml.match(/data-pme-field="displayName"/g) || []).length, 1);
      assert.equal((idleHtml.match(/data-pme-field="storeSegment"/g) || []).length, 1);
      assert.match(idleHtml, /data-specialize-field="differentiators"/);
      assert.match(idleHtml, /Atendimento com hora marcada e avaliação digital\./);
      assert.match(idleHtml, /data-action="specialize-max"[^>]*>.*Especializar o MAX/);

      // Estado de carregamento: botão desabilitado + feedback claro
      const loadingHtml = ui.render({
        dashboard: {
          partner: { displayName: 'Clínica Solar', storeSegment: 'Dermatologia' },
          specializing: true,
          specializeFeedback: {
            ok: true,
            message: 'Especializando o MAX para o seu segmento...',
          },
        },
      });
      assert.match(loadingHtml, /data-action="specialize-max"\s+disabled/);
      assert.match(loadingHtml, /Especializando o MAX para o seu segmento\.\.\./);
      assert.match(loadingHtml, /data-specialize-feedback="true"/);
    } finally {
      ui.unmount();
    }
  });

  test('14. Exportação de PDFs (Agenda, Pedidos e Relatório Diário) em bootstrap.js envia Authorization Bearer via fetch+Blob (sem window.open anônimo)', () => {
    const bootstrapSrc = fs.readFileSync(
      path.join(VNEXT_ROOT, 'app-web/src/bootstrap.js'),
      'utf8'
    );
    assert.match(bootstrapSrc, /async function openAuthenticatedPdf\(url, filename\)/);
    assert.match(bootstrapSrc, /Authorization:\s*`Bearer \$\{state\.token\}`/);
    assert.match(bootstrapSrc, /URL\.createObjectURL\(blob\)/);
    assert.doesNotMatch(
      bootstrapSrc,
      /window\.open\(\s*`\/api\/v1\/partners\/\$\{encodeURIComponent\(partnerId\)\}\/(?:appointments|orders)\/pdf/
    );
  });
});
