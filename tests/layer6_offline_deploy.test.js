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
    assert.equal(files.length, 7, 'Expected 6 views + 1 component file');

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
});
