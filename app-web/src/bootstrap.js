'use strict';

const { mountAutonmaxUI } = require('./config/FrontendInitConfig');
const { AuthScreen } = require('./components/AuthScreen');
const { WhatsAppQrModal } = require('./components/WhatsAppQrModal');

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

function getLocalDateStr(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parsePriceBrlToCents(raw) {
  let clean = String(raw || '0')
    .replace(/[^\d.,-]/g, '')
    .trim();
  if (clean.includes(',') && clean.includes('.')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else {
    clean = clean.replace(',', '.');
  }
  const num = Number(clean);
  return Number.isFinite(num) && num >= 0 ? Math.round(num * 100) : NaN;
}

const API_BASE_URL_STORAGE_KEY = 'autonmax_api_base_url';

function normalizeApiBaseUrl(raw) {
  const trimmed = String(raw || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function isCapacitorOrLocalWebView() {
  if (typeof window === 'undefined') return false;
  if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) {
    return true;
  }
  const proto = String(window.location?.protocol || '');
  const host = String(window.location?.hostname || '');
  const port = String(window.location?.port || '');
  return (
    proto === 'capacitor:' ||
    proto === 'file:' ||
    (proto === 'https:' && host === 'localhost' && !port)
  );
}

function resolveInitialApiBaseUrl() {
  try {
    const saved = window.localStorage?.getItem(API_BASE_URL_STORAGE_KEY);
    if (saved && saved.trim()) {
      return normalizeApiBaseUrl(saved);
    }
  } catch {
    // Ignore storage read errors
  }
  const buildUrl = window.__AUTONMAX_BUILD_CONFIG__?.apiBaseUrl;
  if (buildUrl && String(buildUrl).trim()) {
    return normalizeApiBaseUrl(buildUrl);
  }
  return '';
}

/**
 * Browser entrypoint that mounts the full-screen AuthScreen until authenticated,
 * mounts AUTON.MAX into `#autonmax-root`, and wires all operational views to `/api/v1/*`.
 */
function initBrowserApp() {
  if (typeof document === 'undefined') return null;

  const root = document.getElementById('autonmax-root');
  if (!root) return null;

  const authMount = document.getElementById('autonmax-auth');
  const modalMount = document.getElementById('autonmax-modal');
  const authScreen = new AuthScreen();
  const waModal = new WhatsAppQrModal();

  const nativeShell = isCapacitorOrLocalWebView();
  const initialApiBaseUrl = resolveInitialApiBaseUrl();

  const state = {
    token: null,
    partner: null,
    apiBaseUrl: initialApiBaseUrl,
    isNativeShell: nativeShell,
    authMode: 'login',
    authMessage: '',
    authError: '',
    sessionKey: null,
    qrPollTimer: null,
    waModalOpen: false,
    waModalData: {
      open: false,
      status: 'DISCONNECTED',
      qrCodeBase64: null,
      phoneNumber: null,
      sessionKey: null,
    },
    catalogItems: [],
    catalogFilter: 'SERVICE',
    catalogSearch: '',
    catalogFormOpen: false,
    catalogEditingItem: null,
    catalogFormError: '',
    appointments: [],
    orders: [],
    conversations: [],
    selectedConvId: null,
    convMessages: [],
    aiTestResult: null,
    pmeSaveFeedback: null,
    specializeDifferentiators: '',
    specializing: false,
    specializeFeedback: null,
    appointmentsCount: 0,
    appointmentsTodayCount: 0,
    ordersCount: 0,
    ordersTodayCount: 0,
    waStatus: 'DISCONNECTED',
  };

  function stopQrPolling() {
    if (state.qrPollTimer) {
      clearTimeout(state.qrPollTimer);
      state.qrPollTimer = null;
    }
  }

  function scheduleQrPolling() {
    stopQrPolling();
    const needsQrPoll = state.waModalOpen || ui.activeView === 'channel';
    if (!needsQrPoll || !state.token || !state.sessionKey) return;
    state.qrPollTimer = setTimeout(() => {
      state.qrPollTimer = null;
      refreshWaQr({ wait: false });
    }, 1500);
  }

  function buildApiUrl(path) {
    const p = String(path || '');
    if (/^https?:\/\//i.test(p)) return p;
    const base = state.apiBaseUrl || '';
    if (!base) return p;
    return `${base}${p.startsWith('/') ? p : `/${p}`}`;
  }

  function setApiBaseUrl(rawUrl) {
    const normalized = normalizeApiBaseUrl(rawUrl);
    state.apiBaseUrl = normalized;
    try {
      if (normalized) {
        window.localStorage?.setItem(API_BASE_URL_STORAGE_KEY, normalized);
      } else {
        window.localStorage?.removeItem(API_BASE_URL_STORAGE_KEY);
      }
    } catch {
      // Ignore storage write errors
    }
    if (ui && typeof ui.setBaseUrl === 'function') {
      ui.setBaseUrl(normalized || window.location.origin);
    }
  }

  async function openAuthenticatedPdf(url, filename) {
    if (!state.token) return { ok: false, error: 'UNAUTHORIZED' };
    const res = await fetch(buildApiUrl(url), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${state.token}`,
        Accept: 'application/pdf',
      },
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson?.error?.message || `Falha ao gerar PDF (HTTP ${res.status})`);
    }
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const popup = window.open(blobUrl, '_blank', 'noopener,noreferrer');
    if (!popup) {
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    setTimeout(() => {
      try {
        URL.revokeObjectURL(blobUrl);
      } catch {
        // Ignore cleanup errors
      }
    }, 60_000);
    return { ok: true, filename };
  }

  const ui = mountAutonmaxUI(root, {
    shell_enabled: true,
    ui_mode: 'guided',
    baseUrl: state.apiBaseUrl || window.location.origin,
    apiBaseUrl: state.apiBaseUrl || window.location.origin,
    output_actions: {
      async exportAppointmentsPdf({ partnerId, dateStr }) {
        if (!state.token || !partnerId) return { ok: false };
        const safeDate = dateStr || getLocalDateStr();
        return openAuthenticatedPdf(
          `/api/v1/partners/${encodeURIComponent(partnerId)}/appointments/pdf?date=${encodeURIComponent(safeDate)}`,
          `agenda_${safeDate}.pdf`
        );
      },
      async exportOrdersPdf({ partnerId, dateStr }) {
        if (!state.token || !partnerId) return { ok: false };
        const safeDate = dateStr || getLocalDateStr();
        return openAuthenticatedPdf(
          `/api/v1/partners/${encodeURIComponent(partnerId)}/orders/pdf?date=${encodeURIComponent(safeDate)}`,
          `pedidos_${safeDate}.pdf`
        );
      },
    },
  });

  async function apiFetch(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    if (state.token) {
      headers.Authorization = `Bearer ${state.token}`;
    }
    const res = await fetch(buildApiUrl(path), { ...options, headers });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) {
      const err = new Error(json?.error?.message || `HTTP ${res.status}`);
      err.status = res.status;
      err.code = json?.error?.code || null;
      throw err;
    }
    return json.data;
  }

  async function persistLocalSnapshot() {
    try {
      if (state.partner) {
        await ui.ports.storage.set('partner_config', 'active_partner', {
          id: 'active_partner',
          partner: state.partner,
          savedAt: Date.now(),
        });
      }
      if (Array.isArray(state.catalogItems) && state.catalogItems.length > 0) {
        for (const item of state.catalogItems) {
          if (item && item.id) {
            await ui.ports.storage.upsert('catalog_items', item);
          }
        }
      }
    } catch {
      // Non-fatal offline cache write error
    }
  }

  async function rehydrateLocalSnapshot() {
    try {
      const cached = await ui.ports.storage.get('partner_config', 'active_partner');
      if (!cached || !cached.partner) return false;
      state.partner = cached.partner;
      const cachedCatalog = await ui.ports.storage.query('catalog_items').catch(() => []);
      if (Array.isArray(cachedCatalog) && cachedCatalog.length > 0) {
        state.catalogItems = cachedCatalog;
      }
      return true;
    } catch {
      return false;
    }
  }

  function renderAuthGate() {
    const isAuthenticated = Boolean(state.token && state.partner);
    if (isAuthenticated) {
      if (authMount) {
        authMount.innerHTML = '';
        authMount.classList.add('is-hidden');
      }
      root.classList.remove('is-hidden');
      ui.render({
        shell: {
          partnerName:
            state.partner.displayName ||
            state.partner.display_name ||
            state.partner.email,
          partnerLogoUrl:
            state.partner.logoDataUrl ||
            state.partner.logo_data_url ||
            './assets/img/logo-autonmax.jpg',
        },
      });
      return;
    }

    root.classList.add('is-hidden');
    if (authMount) {
      authMount.classList.remove('is-hidden');
      authMount.innerHTML = authScreen.render({
        mode: state.authMode,
        error: state.authError,
        message: state.authMessage,
        apiBaseUrl: state.apiBaseUrl,
        showServerConfig: state.isNativeShell && !state.apiBaseUrl,
      });
    }
  }

  function renderWaModal() {
    if (!modalMount) return;
    modalMount.innerHTML = waModal.render({
      ...state.waModalData,
      open: state.waModalOpen,
    });
  }

  function renderCatalogState() {
    ui.render({
      catalog: {
        items: state.catalogItems,
        filterType: state.catalogFilter,
        searchQuery: state.catalogSearch,
        formOpen: state.catalogFormOpen,
        editingItem: state.catalogEditingItem,
        formError: state.catalogFormError,
      },
    });
  }

  function renderConversationsState() {
    ui.render({
      conversations: {
        items: state.conversations,
        selectedConversationId: state.selectedConvId,
        messages: state.convMessages,
      },
    });
  }

  async function refreshWaQr({ force = false, wait = false } = {}) {
    if (!state.token || !state.partner) return;
    try {
      if (!state.sessionKey) {
        const sess = await apiFetch('/api/v1/channels/sessions', {
          method: 'POST',
          body: JSON.stringify({ partnerId: state.partner.id, lineId: 'default' }),
        });
        state.sessionKey = sess.sessionKey;
      }

      const qs = new URLSearchParams();
      if (force) qs.set('force', 'true');
      if (wait) qs.set('wait', 'true');
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      const qrData = await apiFetch(
        `/api/v1/channels/sessions/${encodeURIComponent(state.sessionKey)}/qr${suffix}`
      );

      state.waModalData = {
        open: state.waModalOpen,
        sessionKey: qrData.sessionKey || state.sessionKey,
        status: qrData.status || 'DISCONNECTED',
        qrCodeBase64: qrData.qrCodeBase64 || null,
        phoneNumber: qrData.phoneNumber || null,
      };
      renderWaModal();

      if (ui.activeView === 'channel') {
        ui.render({ channel: qrData });
      } else if (ui.activeView === 'dashboard') {
        ui.render({
          dashboard: {
            partner: state.partner,
            catalog: state.catalogItems,
            waStatus: state.waModalData.status,
            aiTestResult: state.aiTestResult,
          },
        });
      }

      if (
        qrData.status !== 'CONNECTED' &&
        qrData.status !== 'STANDBY' &&
        qrData.status !== 'DISCONNECTED'
      ) {
        scheduleQrPolling();
      } else {
        stopQrPolling();
      }
    } catch {
      renderWaModal();
    }
  }

  async function executeLogout() {
    stopQrPolling();
    state.waModalOpen = false;
    renderWaModal();
    await ui.ports.secureAuth.clearToken();
    await ui.ports.storage.remove('partner_config', 'active_partner').catch(() => { });
    state.token = null;
    state.partner = null;
    state.sessionKey = null;
    state.catalogItems = [];
    state.appointments = [];
    state.orders = [];
    state.conversations = [];
    state.selectedConvId = null;
    state.convMessages = [];
    state.aiTestResult = null;
    state.specializeDifferentiators = '';
    state.specializing = false;
    state.specializeFeedback = null;
    state.authError = '';
    state.authMessage = '';
    renderAuthGate();
  }

  async function hydrateActiveView() {
    if (!state.token || !state.partner) return;
    const pid = encodeURIComponent(state.partner.id || state.partner.partnerId);
    const today = getLocalDateStr();

    try {
      if (ui.activeView === 'dashboard') {
        const [config, catalog, appts, orders, sessions] = await Promise.all([
          apiFetch(`/api/v1/partners/${pid}/config`).catch(() => state.partner),
          apiFetch(`/api/v1/partners/${pid}/catalog`).catch(() => state.catalogItems),
          apiFetch(`/api/v1/partners/${pid}/appointments`).catch(() => []),
          apiFetch(`/api/v1/partners/${pid}/orders`).catch(() => []),
          apiFetch('/api/v1/channels/sessions').catch(() => []),
        ]);
        if (config) state.partner = { ...state.partner, ...config };
        state.catalogItems = Array.isArray(catalog) ? catalog : [];
        const apptsList = Array.isArray(appts) ? appts : [];
        const ordersList = Array.isArray(orders) ? orders : [];
        state.appointments = apptsList;
        state.orders = ordersList;
        const confirmedAppts = apptsList.filter(
          (a) => String(a?.status || 'CONFIRMED').toUpperCase() === 'CONFIRMED'
        );
        const confirmedOrders = ordersList.filter(
          (o) => String(o?.status || 'CONFIRMED').toUpperCase() === 'CONFIRMED'
        );
        const firstSess = Array.isArray(sessions) && sessions[0] ? sessions[0] : null;
        if (firstSess?.sessionKey) state.sessionKey = firstSess.sessionKey;
        state.appointmentsCount = confirmedAppts.length;
        state.appointmentsTodayCount = confirmedAppts.filter(
          (a) => String(a?.date_str || '').slice(0, 10) === today
        ).length;
        state.ordersCount = confirmedOrders.length;
        state.ordersTodayCount = confirmedOrders.filter(
          (o) => String(o?.created_at || '').slice(0, 10) === today
        ).length;
        state.waStatus = firstSess?.status || state.waModalData.status || 'DISCONNECTED';

        await persistLocalSnapshot();
        renderDashboardLocal();
      } else if (ui.activeView === 'catalog') {
        const items = await apiFetch(`/api/v1/partners/${pid}/catalog`).catch(() => state.catalogItems);
        state.catalogItems = Array.isArray(items) ? items : [];
        await persistLocalSnapshot();
        renderCatalogState();
      } else if (ui.activeView === 'appointments') {
        const appts = await apiFetch(`/api/v1/partners/${pid}/appointments`).catch(() => []);
        state.appointments = Array.isArray(appts) ? appts : [];
        ui.render({ appointments: state.appointments });
      } else if (ui.activeView === 'orders') {
        const orders = await apiFetch(`/api/v1/partners/${pid}/orders`).catch(() => []);
        state.orders = Array.isArray(orders) ? orders : [];
        ui.render({ orders: state.orders });
      } else if (ui.activeView === 'conversations') {
        const convs = await apiFetch(`/api/v1/partners/${pid}/conversations`).catch(() => []);
        state.conversations = Array.isArray(convs) ? convs : [];
        if (state.selectedConvId) {
          state.convMessages = await apiFetch(
            `/api/v1/partners/${pid}/conversations/${encodeURIComponent(state.selectedConvId)}/messages`
          ).catch(() => []);
        }
        renderConversationsState();
      } else if (ui.activeView === 'channel') {
        const sessions = await apiFetch('/api/v1/channels/sessions').catch(() => []);
        const current = sessions[0] || {};
        state.sessionKey = state.sessionKey || current.sessionKey || null;
        if (state.sessionKey) {
          await refreshWaQr({ wait: false });
        } else {
          stopQrPolling();
          ui.render({ channel: { status: 'DISCONNECTED' } });
        }
      } else {
        stopQrPolling();
      }
    } catch {
      // Keep cached/local state rendered offline-first
    }
  }

  async function restoreSession() {
    try {
      await ui.ports.storage.initialize();
      const savedToken = await ui.ports.secureAuth.getToken();
      if (!savedToken) {
        renderAuthGate();
        return;
      }
      state.token = savedToken;
      const session = await apiFetch('/api/v1/auth/session');
      if (session?.partner) {
        state.partner = session.partner;
        await persistLocalSnapshot();
        renderAuthGate();
        await hydrateActiveView();
      } else {
        await ui.ports.secureAuth.clearToken();
        state.token = null;
        renderAuthGate();
      }
    } catch (err) {
      const status = Number(err?.status || 0);
      const isAuthRejected = status === 401 || status === 403 || status === 404;
      if (isAuthRejected) {
        await ui.ports.secureAuth.clearToken();
        state.token = null;
        state.partner = null;
        state.authMessage = 'Sessão expirada ou reiniciada. Faça login novamente.';
        renderAuthGate();
        return;
      }

      // Network / 5xx (e.g., Render Free cold start or offline): preserve token & rehydrate cached PME profile
      const rehydrated = await rehydrateLocalSnapshot();
      if (rehydrated && state.token && state.partner) {
        renderAuthGate();
        renderDashboardLocal();
      } else {
        state.token = null;
        state.partner = null;
        renderAuthGate();
      }
    }
  }

  function renderDashboardLocal() {
    if (!state.partner) return;
    ui.render({
      shell: {
        partnerName:
          state.partner.displayName ||
          state.partner.display_name ||
          state.partner.email,
        partnerLogoUrl:
          state.partner.logoDataUrl ||
          state.partner.logo_data_url ||
          './assets/img/logo-autonmax.jpg',
      },
      dashboard: {
        partner: state.partner,
        catalog: state.catalogItems,
        appointmentsCount: state.appointmentsCount,
        appointmentsTodayCount: state.appointmentsTodayCount,
        ordersCount: state.ordersCount,
        ordersTodayCount: state.ordersTodayCount,
        waStatus: state.waStatus,
        aiTestResult: state.aiTestResult,
        pmeSaveFeedback: state.pmeSaveFeedback,
        specializeDifferentiators: state.specializeDifferentiators,
        specializing: state.specializing,
        specializeFeedback: state.specializeFeedback,
      },
    });
  }

  function syncPmeFieldsIntoState() {
    if (!state.partner) return;
    root.querySelectorAll('[data-pme-field]').forEach((el) => {
      const key = el.getAttribute('data-pme-field');
      if (key) state.partner[key] = el.value;
    });
    const diffEl = root.querySelector('[data-specialize-field="differentiators"]');
    if (diffEl) {
      state.specializeDifferentiators = diffEl.value || '';
    }
  }

  function collectPmeFieldsFromDom() {
    syncPmeFieldsIntoState();
    const patch = {};
    root.querySelectorAll('[data-pme-field]').forEach((el) => {
      const key = el.getAttribute('data-pme-field');
      if (key) patch[key] = el.value;
    });
    const activeToggle = root.querySelector('[data-action="toggle-partner-active"]');
    const isActive = activeToggle
      ? Boolean(activeToggle.checked)
      : state.partner?.activeStatus
        ? state.partner.activeStatus === 'ACTIVE'
        : Number(state.partner?.is_active ?? 1) === 1;
    return {
      ...patch,
      activeStatus: isActive ? 'ACTIVE' : 'INACTIVE',
      logoDataUrl: state.partner?.logoDataUrl ?? state.partner?.logo_data_url ?? null,
      pdfFiles: state.partner?.pdfFiles ?? state.partner?.pdf_files ?? [],
      imageFiles: state.partner?.imageFiles ?? state.partner?.image_files ?? [],
    };
  }

  if (authMount) {
    authMount.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('[data-auth-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-auth-action');
      if (action === 'switch-auth') {
        state.authMode = state.authMode === 'login' ? 'register' : 'login';
        state.authError = '';
        state.authMessage = '';
        renderAuthGate();
      }
    });

    authMount.addEventListener('submit', async (ev) => {
      if (!ev.target?.matches?.('[data-auth-form]')) return;
      ev.preventDefault();
      state.authError = '';
      state.authMessage = '';
      const fd = new FormData(ev.target);
      const email = String(fd.get('email') || '').trim();
      const password = String(fd.get('password') || '');
      const displayName = String(fd.get('displayName') || '').trim();
      const submittedApiUrl = String(fd.get('apiBaseUrl') || '').trim();
      if (submittedApiUrl !== state.apiBaseUrl) {
        setApiBaseUrl(submittedApiUrl);
      }

      if (state.isNativeShell && !state.apiBaseUrl) {
        state.authError = 'Informe a URL do servidor da API (ex: https://seu-app.onrender.com).';
        renderAuthGate();
        return;
      }

      try {
        const endpoint =
          state.authMode === 'register' ? '/api/v1/auth/register' : '/api/v1/auth/login';
        const payload =
          state.authMode === 'register'
            ? { email, password, displayName }
            : { email, password };
        const data = await apiFetch(endpoint, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        state.token = data.token;
        state.partner = data.partner;
        await ui.ports.secureAuth.setToken(data.token);
        await persistLocalSnapshot();
        renderAuthGate();
        await hydrateActiveView();
      } catch (err) {
        state.authError = err.message || 'Falha na autenticação.';
        renderAuthGate();
      }
    });
  }

  if (modalMount) {
    modalMount.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('[data-wa-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-wa-action');
      if (action === 'close') {
        state.waModalOpen = false;
        stopQrPolling();
        renderWaModal();
      } else if (action === 'force-qr') {
        state.waModalData = { ...state.waModalData, qrCodeBase64: null, status: 'PAIRING_READY' };
        renderWaModal();
        await refreshWaQr({ force: true, wait: true });
      } else if (action === 'disconnect' && state.sessionKey) {
        await apiFetch(
          `/api/v1/channels/sessions/${encodeURIComponent(state.sessionKey)}/disconnect`,
          { method: 'POST', body: JSON.stringify({ wipeAuth: false }) }
        ).catch(() => { });
        stopQrPolling();
        state.waModalData = {
          ...state.waModalData,
          status: 'DISCONNECTED',
          qrCodeBase64: null,
          phoneNumber: null,
        };
        renderWaModal();
      }
    });
  }

  root.addEventListener('input', (ev) => {
    if (ev.target?.matches?.('[data-specialize-field="differentiators"]')) {
      state.specializeDifferentiators = ev.target.value || '';
      return;
    }
    if (ev.target?.matches?.('[data-catalog-search]')) {
      state.catalogSearch = ev.target.value || '';
      renderCatalogState();
      const input = root.querySelector('[data-catalog-search]');
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }
  });

  root.addEventListener('change', async (ev) => {
    if (ev.target?.matches?.('[data-catalog-form] select[name="type"]')) {
      const form = ev.target.closest('[data-catalog-form]');
      const stockRow = form?.querySelector('[data-catalog-stock-row]');
      const durationWrap = form?.querySelector('[data-catalog-duration-wrap]');
      if (stockRow) {
        stockRow.style.display = ev.target.value === 'PRODUCT' ? 'flex' : 'none';
      }
      if (durationWrap) {
        durationWrap.style.display = ev.target.value === 'SERVICE' ? 'block' : 'none';
      }
      return;
    }

    if (ev.target?.matches?.('[data-catalog-stock-toggle]')) {
      const form = ev.target.closest('[data-catalog-form]');
      const qtyInput = form?.querySelector('[name="stockQuantity"]');
      const label = form?.querySelector('[data-catalog-stock-label]');
      const enabled = Boolean(ev.target.checked);
      if (qtyInput) qtyInput.disabled = !enabled;
      if (label) {
        label.textContent = enabled
          ? 'Estoque controlado'
          : 'Estoque ilimitado (Software/Digital)';
      }
      return;
    }

    const pid = state.partner ? encodeURIComponent(state.partner.id || state.partner.partnerId) : null;
    if (!pid) return;

    if (ev.target?.matches?.('[data-action="toggle-partner-active"]')) {
      const active = Boolean(ev.target.checked);
      const updated = await apiFetch(`/api/v1/partners/${pid}/config`, {
        method: 'PUT',
        body: JSON.stringify({ activeStatus: active ? 'ACTIVE' : 'INACTIVE' }),
      }).catch(() => null);
      if (updated) {
        state.partner = { ...state.partner, ...updated };
      } else {
        state.partner.activeStatus = active ? 'ACTIVE' : 'INACTIVE';
      }
      await hydrateActiveView();
      return;
    }

    const featKey = ev.target?.getAttribute?.('data-feature-toggle');
    if (featKey) {
      const updated = await apiFetch(`/api/v1/partners/${pid}/features`, {
        method: 'PUT',
        body: JSON.stringify({ [featKey]: Boolean(ev.target.checked) }),
      }).catch(() => null);
      if (updated) {
        state.partner.featureFlags = updated;
      }
      return;
    }

    const uploadKind = ev.target?.getAttribute?.('data-pme-upload');
    if (uploadKind && ev.target.files?.length) {
      syncPmeFieldsIntoState();
      state.pmeSaveFeedback = null;
      const files = Array.from(ev.target.files);
      if (uploadKind === 'logo') {
        const dataUrl = await readFileAsDataUrl(files[0]);
        state.partner.logoDataUrl = dataUrl;
      } else if (uploadKind === 'pdfs') {
        const existing = Array.isArray(state.partner.pdfFiles) ? [...state.partner.pdfFiles] : [];
        for (const f of files) {
          if (existing.length >= 5) {
            state.pmeSaveFeedback = { ok: false, message: 'Máximo de 5 PDFs permitidos.' };
            break;
          }
          existing.push({ name: f.name, dataUrl: await readFileAsDataUrl(f) });
        }
        state.partner.pdfFiles = existing;
      } else if (uploadKind === 'images') {
        const existing = Array.isArray(state.partner.imageFiles) ? [...state.partner.imageFiles] : [];
        for (const f of files) {
          if (existing.length >= 10) {
            state.pmeSaveFeedback = { ok: false, message: 'Máximo de 10 imagens permitidas.' };
            break;
          }
          existing.push({ name: f.name, dataUrl: await readFileAsDataUrl(f) });
        }
        state.partner.imageFiles = existing;
      }
      ev.target.value = '';
      renderDashboardLocal();
    }
  });

  root.addEventListener('submit', async (ev) => {
    const pid = state.partner ? encodeURIComponent(state.partner.id || state.partner.partnerId) : null;
    if (!pid) return;

    if (ev.target?.matches?.('[data-catalog-form]')) {
      ev.preventDefault();
      state.catalogFormError = '';
      const fd = new FormData(ev.target);
      const itemId = String(fd.get('itemId') || '').trim();
      const priceCents = parsePriceBrlToCents(fd.get('priceBrl'));
      const rawDuration = Number(fd.get('durationMinutes'));
      const durationMinutes =
        Number.isInteger(rawDuration) && rawDuration > 0 ? rawDuration : 30;
      const itemType = String(fd.get('type') || 'SERVICE').toUpperCase();
      const trackStock = Boolean(
        ev.target.querySelector('[data-catalog-stock-toggle]')?.checked
      );
      const stockQuantity = trackStock
        ? Math.max(0, Math.floor(Number(fd.get('stockQuantity') || 0)))
        : null;
      const payload = {
        name: String(fd.get('name') || '').trim(),
        type: itemType,
        itemType,
        priceCents,
        durationMinutes,
        category: String(fd.get('category') || '').trim() || 'geral',
        description: String(fd.get('description') || '').trim(),
        trackStock,
        stockQuantity,
      };

      if (!payload.name) {
        state.catalogFormError = 'Informe o nome do item.';
        renderCatalogState();
        return;
      }
      if (!Number.isInteger(priceCents) || priceCents < 0) {
        state.catalogFormError = 'Informe um preço válido (ex: 35,00).';
        renderCatalogState();
        return;
      }

      try {
        if (itemId) {
          await apiFetch(`/api/v1/partners/${pid}/catalog/${encodeURIComponent(itemId)}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          });
        } else {
          await apiFetch(`/api/v1/partners/${pid}/catalog`, {
            method: 'POST',
            body: JSON.stringify(payload),
          });
        }
        state.catalogFormOpen = false;
        state.catalogEditingItem = null;
        state.catalogFormError = '';
        await hydrateActiveView();
      } catch (err) {
        const isOffline = !ui.ports.network.isOnline() || err instanceof TypeError;
        if (!itemId && isOffline) {
          const { record } = await ui.views.catalog.createItemOffline(
            state.partner.id || state.partner.partnerId,
            payload
          );
          state.catalogItems = [record, ...state.catalogItems];
          state.catalogFormOpen = false;
          state.catalogEditingItem = null;
          state.catalogFormError = '';
          renderCatalogState();
        } else {
          state.catalogFormError = err?.message || 'Não foi possível salvar o item.';
          renderCatalogState();
        }
      }
      return;
    }

    const opFormConvId = ev.target?.getAttribute?.('data-operator-form');
    if (opFormConvId) {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const text = String(fd.get('text') || '').trim();
      if (!text) return;
      await apiFetch(
        `/api/v1/partners/${pid}/conversations/${encodeURIComponent(opFormConvId)}/operator-message`,
        {
          method: 'POST',
          body: JSON.stringify({ text }),
        }
      ).catch(async () => {
        await ui.views.conversations.sendOperatorMessage({
          conversationId: opFormConvId,
          text,
        });
      });
      await hydrateActiveView();
    }
  });

  root.addEventListener('click', async (ev) => {
    const shellBtn = ev.target.closest('[data-shell-action]');
    if (shellBtn) {
      const shellAction = shellBtn.getAttribute('data-shell-action');
      if (shellAction === 'toggle-mode') {
        ui.setUiMode(ui.uiMode === 'advanced' ? 'guided' : 'advanced');
      } else if (shellAction === 'logout') {
        await executeLogout();
      }
      return;
    }

    const navCatalogBtn = ev.target.closest('[data-nav-catalog]');
    if (navCatalogBtn) {
      state.catalogFilter = navCatalogBtn.getAttribute('data-nav-catalog') || 'ALL';
      state.catalogFormOpen = false;
      state.catalogEditingItem = null;
      ui.navigate('catalog');
      await hydrateActiveView();
      return;
    }

    const navBtn = ev.target.closest('[data-nav-view]');
    if (navBtn) {
      const viewId = navBtn.getAttribute('data-nav-view');
      ui.navigate(viewId);
      await hydrateActiveView();
      return;
    }

    const pid = state.partner ? encodeURIComponent(state.partner.id || state.partner.partnerId) : null;

    const removePdfIdx = ev.target.closest('[data-remove-pdf]')?.getAttribute('data-remove-pdf');
    if (removePdfIdx !== undefined && removePdfIdx !== null && state.partner) {
      syncPmeFieldsIntoState();
      const list = Array.isArray(state.partner.pdfFiles) ? [...state.partner.pdfFiles] : [];
      list.splice(Number(removePdfIdx), 1);
      state.partner.pdfFiles = list;
      renderDashboardLocal();
      return;
    }

    const removeImgIdx = ev.target.closest('[data-remove-img]')?.getAttribute('data-remove-img');
    if (removeImgIdx !== undefined && removeImgIdx !== null && state.partner) {
      syncPmeFieldsIntoState();
      const list = Array.isArray(state.partner.imageFiles) ? [...state.partner.imageFiles] : [];
      list.splice(Number(removeImgIdx), 1);
      state.partner.imageFiles = list;
      renderDashboardLocal();
      return;
    }

    const catAction = ev.target.closest('[data-catalog-action]')?.getAttribute('data-catalog-action');
    if (catAction === 'open-form') {
      state.catalogFormOpen = true;
      state.catalogEditingItem = null;
      renderCatalogState();
      return;
    }
    if (catAction === 'close-form') {
      state.catalogFormOpen = false;
      state.catalogEditingItem = null;
      renderCatalogState();
      return;
    }

    const editId = ev.target.closest('[data-catalog-edit]')?.getAttribute('data-catalog-edit');
    if (editId) {
      state.catalogEditingItem = state.catalogItems.find((i) => i.id === editId) || null;
      state.catalogFormOpen = Boolean(state.catalogEditingItem);
      renderCatalogState();
      return;
    }

    const delId = ev.target.closest('[data-catalog-delete]')?.getAttribute('data-catalog-delete');
    if (delId && pid) {
      await apiFetch(`/api/v1/partners/${pid}/catalog/${encodeURIComponent(delId)}`, {
        method: 'DELETE',
      }).catch(() => { });
      await hydrateActiveView();
      return;
    }

    const exportApptDate = ev.target
      .closest('[data-export-appointments-date]')
      ?.getAttribute('data-export-appointments-date');
    if (exportApptDate && state.partner) {
      await ui.views.appointments.exportAppointmentsPdf({
        partnerId: state.partner.id,
        dateStr: exportApptDate,
      });
      return;
    }

    const cancelApptId = ev.target
      .closest('[data-cancel-appointment]')
      ?.getAttribute('data-cancel-appointment');
    if (cancelApptId && pid) {
      await apiFetch(
        `/api/v1/partners/${pid}/appointments/${encodeURIComponent(cancelApptId)}/cancel`,
        { method: 'POST', body: JSON.stringify({}) }
      ).catch(async () => {
        await ui.views.appointments.cancelAppointmentOffline(state.partner.id, cancelApptId);
      });
      await hydrateActiveView();
      return;
    }

    const shareApptId = ev.target
      .closest('[data-share-appointment]')
      ?.getAttribute('data-share-appointment');
    if (shareApptId) {
      const appt = state.appointments.find((a) => a.id === shareApptId) || {};
      await ui.views.appointments.shareReceipt({
        id: shareApptId,
        text: `Agendamento ${appt.date_str || ''} ${appt.time_slot || ''} - ${appt.client_name || ''}`,
      });
      return;
    }

    const exportOrderDate = ev.target
      .closest('[data-export-orders-date]')
      ?.getAttribute('data-export-orders-date');
    if (exportOrderDate && state.partner) {
      await ui.views.orders.exportOrdersPdf({
        partnerId: state.partner.id,
        dateStr: exportOrderDate,
      });
      return;
    }

    const cancelOrderId = ev.target
      .closest('[data-cancel-order]')
      ?.getAttribute('data-cancel-order');
    if (cancelOrderId && pid) {
      await apiFetch(
        `/api/v1/partners/${pid}/orders/${encodeURIComponent(cancelOrderId)}/cancel`,
        { method: 'POST', body: JSON.stringify({}) }
      ).catch(() => { });
      await hydrateActiveView();
      return;
    }

    const shareOrderId = ev.target
      .closest('[data-share-order]')
      ?.getAttribute('data-share-order');
    if (shareOrderId) {
      const order = state.orders.find((o) => o.id === shareOrderId) || {};
      const itemsTxt = (Array.isArray(order.items) ? order.items : [])
        .map((it) => `${it.qty || 1}x ${it.name || 'Produto'}`)
        .join(', ');
      await ui.views.orders.shareReceipt({
        id: shareOrderId,
        text: `Pedido #${shareOrderId} - ${order.client_name || ''}${itemsTxt ? ` (${itemsTxt})` : ''}`,
      });
      return;
    }

    const convSelectId = ev.target.closest('[data-conv-select]')?.getAttribute('data-conv-select');
    if (convSelectId && pid) {
      if (String(state.selectedConvId || '') === String(convSelectId)) {
        state.selectedConvId = null;
        state.convMessages = [];
        renderConversationsState();
        return;
      }
      state.selectedConvId = convSelectId;
      state.convMessages = [];
      renderConversationsState();
      const loadedMessages = await apiFetch(
        `/api/v1/partners/${pid}/conversations/${encodeURIComponent(convSelectId)}/messages`
      ).catch(() => []);
      if (String(state.selectedConvId || '') === String(convSelectId)) {
        state.convMessages = Array.isArray(loadedMessages) ? loadedMessages : [];
        renderConversationsState();
      }
      return;
    }

    const pauseBtn = ev.target.closest('[data-conv-toggle-pause]');
    if (pauseBtn && pid) {
      const convId = pauseBtn.getAttribute('data-conv-toggle-pause');
      const currentlyPaused = pauseBtn.getAttribute('data-paused') === '1';
      const chatJid = pauseBtn.getAttribute('data-chat-jid') || '';
      const digits = String(chatJid).split('@')[0].split(':')[0].replace(/\D/g, '');
      if (!currentlyPaused && digits && typeof window !== 'undefined') {
        window.open(`https://wa.me/${digits}`, '_blank', 'noopener,noreferrer');
      }
      await apiFetch(
        `/api/v1/partners/${pid}/conversations/${encodeURIComponent(convId)}/pause`,
        {
          method: 'POST',
          body: JSON.stringify({ paused: !currentlyPaused }),
        }
      ).catch(() => { });
      await hydrateActiveView();
      return;
    }

    const actionBtn = ev.target.closest('[data-action]');
    if (!actionBtn) return;
    const action = actionBtn.getAttribute('data-action');
    const today = getLocalDateStr();

    if (action === 'sync-now') {
      await ui.syncQueue.flush();
      await hydrateActiveView();
    } else if (action === 'export-appointments-pdf' && state.partner) {
      await ui.views.appointments.exportAppointmentsPdf({
        partnerId: state.partner.id,
        dateStr: today,
      });
    } else if (action === 'export-orders-pdf' && state.partner) {
      await ui.views.orders.exportOrdersPdf({
        partnerId: state.partner.id,
        dateStr: today,
      });
    } else if (action === 'export-catalog' && state.partner) {
      await ui.views.catalog.exportCatalog(state.partner.id, state.catalogItems, 'json');
    } else if (action === 'specialize-max' && pid) {
      if (state.specializing) return;
      syncPmeFieldsIntoState();
      const businessName = String(
        state.partner?.displayName ?? state.partner?.display_name ?? ''
      ).trim();
      const segment = String(
        state.partner?.storeSegment ?? state.partner?.store_segment ?? ''
      ).trim();
      const differentiators = String(state.specializeDifferentiators || '').trim();

      if (!businessName || !segment) {
        state.specializeFeedback = {
          ok: false,
          message:
            'Preencha o Nome da Empresa e o Segmento em "Identidade do Estabelecimento" antes de especializar o MAX.',
        };
        renderDashboardLocal();
        return;
      }

      const isOffline =
        !ui.ports.network.isOnline() ||
        (typeof navigator !== 'undefined' && navigator.onLine === false);
      if (isOffline) {
        state.specializeFeedback = {
          ok: false,
          message:
            'É necessária conexão com a internet para especializar o MAX. Tente novamente quando estiver online.',
        };
        renderDashboardLocal();
        return;
      }

      state.specializing = true;
      state.specializeFeedback = {
        ok: true,
        message: 'Especializando o MAX para o seu segmento...',
      };
      renderDashboardLocal();

      try {
        const res = await apiFetch(`/api/v1/partners/${pid}/specialize-prompt`, {
          method: 'POST',
          body: JSON.stringify({
            businessName,
            segment,
            differentiators,
          }),
        });
        state.partner.personalityPrompt = res.compiledPrompt;
        state.specializing = false;
        state.specializeFeedback = {
          ok: true,
          message:
            'Prompt especializado gerado! Revise o texto completo abaixo e clique em "Salvar Alterações do Max" para gravar.',
        };
        renderDashboardLocal();
      } catch (err) {
        state.specializing = false;
        state.specializeFeedback = {
          ok: false,
          message:
            err?.message || 'Não foi possível especializar o MAX no momento.',
        };
        renderDashboardLocal();
      }
    } else if (action === 'save-pme-config' && pid) {
      const patch = collectPmeFieldsFromDom();
      try {
        const updated = await apiFetch(`/api/v1/partners/${pid}/config`, {
          method: 'PUT',
          body: JSON.stringify(patch),
        });
        if (updated) state.partner = { ...state.partner, ...updated };
        state.pmeSaveFeedback = {
          ok: true,
          message: 'Alterações do Max salvas no banco com sucesso!',
        };
        await hydrateActiveView();
      } catch (err) {
        state.pmeSaveFeedback = {
          ok: false,
          message: err?.message || 'Erro ao salvar alterações do Max.',
        };
        renderDashboardLocal();
      }
    } else if (action === 'test-ai' && state.partner) {
      try {
        state.aiTestResult = await apiFetch('/api/v1/ai/test', {
          method: 'POST',
          body: JSON.stringify({ partnerId: state.partner.id }),
        });
      } catch (err) {
        state.aiTestResult = { ok: false, error: err.message };
      }
      await hydrateActiveView();
    } else if (action === 'connect-whatsapp' && state.partner) {
      state.waModalOpen = true;
      state.waModalData = {
        open: true,
        status: 'PAIRING_READY',
        qrCodeBase64: null,
        phoneNumber: null,
        sessionKey: state.sessionKey,
      };
      renderWaModal();
      await refreshWaQr({ force: false, wait: true });
    }
  });

  renderAuthGate();
  restoreSession();
  return ui;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBrowserApp);
  } else {
    initBrowserApp();
  }
}

module.exports = { initBrowserApp };
