'use strict';

const STATUS_META = Object.freeze({
  ONLINE: {
    label: 'Online',
    toneVar: 'var(--color-success)',
    banner: '',
  },
  OFFLINE: {
    label: 'Modo Offline',
    toneVar: 'var(--color-warning)',
    banner: 'Modo Offline — alterações salvas localmente e na fila de sincronização.',
  },
  SYNCING: {
    label: 'Sincronizando',
    toneVar: 'var(--color-primary)',
    banner: 'Sincronizando alterações pendentes...',
  },
  CONFLICT: {
    label: 'Conflito de Sincronização',
    toneVar: 'var(--color-danger)',
    banner: 'Há conflitos de sincronização aguardando revisão.',
  },
});

/**
 * OperationalStatusBadge (Invariant 6):
 * Discrete connectivity & sync indicator (`ONLINE | OFFLINE | SYNCING | CONFLICT`)
 * mounted inside the operational area independently of AppShell.
 */
class OperationalStatusBadge {
  /**
   * @param {{ status?: 'ONLINE' | 'OFFLINE' | 'SYNCING' | 'CONFLICT', pendingCount?: number, conflictCount?: number }} [initial]
   */
  constructor(initial = {}) {
    this.status = STATUS_META[initial.status] ? initial.status : 'ONLINE';
    this.pendingCount = Number(initial.pendingCount || 0);
    this.conflictCount = Number(initial.conflictCount || 0);
  }

  /**
   * Updates badge state.
   * @param {{ status?: 'ONLINE' | 'OFFLINE' | 'SYNCING' | 'CONFLICT', pendingCount?: number, conflictCount?: number }} next
   */
  update(next = {}) {
    if (next.status && STATUS_META[next.status]) {
      this.status = next.status;
    }
    if (next.pendingCount !== undefined) {
      this.pendingCount = Number(next.pendingCount);
    }
    if (next.conflictCount !== undefined) {
      this.conflictCount = Number(next.conflictCount);
    }
    return this.getSnapshot();
  }

  getSnapshot() {
    const meta = STATUS_META[this.status] || STATUS_META.ONLINE;
    return {
      status: this.status,
      label: meta.label,
      toneVar: meta.toneVar,
      banner: meta.banner,
      pendingCount: this.pendingCount,
      conflictCount: this.conflictCount,
    };
  }

  /**
   * Renders semantic HTML using CSS variables only.
   * @returns {string}
   */
  render() {
    const snap = this.getSnapshot();
    const bannerHtml = snap.banner
      ? `<div class="autonmax-card" data-autonmax-offline-banner="true" style="border-color: ${snap.toneVar}; color: var(--color-text);">${snap.banner}</div>`
      : '';

    return [
      `<div data-autonmax-status-wrapper="true">`,
      `  <span class="autonmax-status-badge" data-autonmax-status="${snap.status}" style="border-color: ${snap.toneVar}; color: ${snap.toneVar};">`,
      `    <span>${snap.label}</span>`,
      snap.pendingCount > 0 ? `<span>(${snap.pendingCount} pendente(s))</span>` : '',
      snap.conflictCount > 0 ? `<span>(${snap.conflictCount} conflito(s))</span>` : '',
      `  </span>`,
      bannerHtml,
      `</div>`,
    ]
      .filter(Boolean)
      .join('\n');
  }
}

module.exports = { OperationalStatusBadge, STATUS_META };
