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

/**
 * AppointmentsView (Miolo): Agenda organizada por dia (`.days-grid` / `.day-card`),
 * cancelamento offline-first e slots injetáveis (`exportAppointmentsPdf`, `shareReceipt`).
 */
class AppointmentsView {
  constructor(ctx) {
    this.ctx = ctx;
  }

  getControls() {
    const controls = ['list_appointments', 'cancel_appointment', 'export_pdf', 'share_receipt'];
    if (this.ctx.uiMode === 'advanced') {
      controls.push('idempotency_audit', 'manual_overbooking_inspect');
    }
    return controls;
  }

  async cancelAppointmentOffline(partnerId, appointmentId, idempotencyKey) {
    const existing = await this.ctx.ports.storage.get('appointments', appointmentId);
    if (existing) {
      await this.ctx.ports.storage.upsert('appointments', {
        ...existing,
        status: 'CANCELLED',
        updatedAt: Date.now(),
      });
    }
    const syncEntry = await this.ctx.syncQueue.enqueue({
      type: 'appointment.cancel',
      payload: { partnerId, appointmentId },
      idempotencyKey,
    });
    return { appointmentId, syncEntry };
  }

  async exportAppointmentsPdf({ partnerId, dateStr, items = [] }) {
    if (typeof this.ctx.outputActions?.exportAppointmentsPdf === 'function') {
      return this.ctx.outputActions.exportAppointmentsPdf({ partnerId, dateStr, items });
    }
    const text = items
      .map((a) => `${a.time_slot || a.timeSlot} - ${a.client_name || a.clientName}`)
      .join('\n');
    await this.ctx.ports.filesystem.saveFile(`agenda_${dateStr}.txt`, text);
    return { ok: true, local: true };
  }

  async shareReceipt({ id, text }) {
    if (typeof this.ctx.outputActions?.shareReceipt === 'function') {
      return this.ctx.outputActions.shareReceipt({ type: 'appointment', id, text });
    }
    return this.ctx.ports.share.share({ title: `Comprovante ${id}`, text });
  }

  render(data = []) {
    const mode = this.ctx.uiMode;
    const list = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [];

    const byDate = new Map();
    for (const appt of list) {
      const dateKey = String(appt.date_str || appt.dateStr || 'Sem Data');
      if (!byDate.has(dateKey)) byDate.set(dateKey, []);
      byDate.get(dateKey).push(appt);
    }

    const sortedDates = Array.from(byDate.keys()).sort();
    const dayCardsHtml = sortedDates.length
      ? sortedDates
          .map((dateStr) => {
            const dayItems = byDate.get(dateStr) || [];
            const rowsHtml = dayItems
              .map((a) => {
                const status = String(a.status || 'CONFIRMED').toUpperCase();
                const isCancelled = status === 'CANCELLED';
                const time = escapeHtml(a.time_slot || a.timeSlot || '--:--');
                const client = escapeHtml(a.client_name || a.clientName || 'Cliente');
                const svc = escapeHtml(a.item_name_snapshot || a.serviceName || '');
                return `<div style="padding:10px;border-radius:12px;background:var(--surface-input);display:flex;flex-direction:column;gap:6px;">
                          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                            <strong>${time} — ${client}</strong>
                            <span class="autonmax-status-badge">${status}</span>
                          </div>
                          ${svc ? `<span style="color:var(--color-text-muted);font-size:0.88rem;">${svc}</span>` : ''}
                          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;">
                            <button type="button" class="exec-action-btn" data-share-appointment="${escapeHtml(a.id)}">Compartilhar</button>
                            ${!isCancelled ? `<button type="button" class="logout-btn" data-cancel-appointment="${escapeHtml(a.id)}">Cancelar</button>` : ''}
                          </div>
                        </div>`;
              })
              .join('\n');

            return `<div class="day-card">
                      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                        <h3 style="margin:0;font-family:var(--font-heading);">${escapeHtml(dateStr)}</h3>
                        <span class="autonmax-status-badge">${dayItems.length} agendamento(s)</span>
                      </div>
                      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px;">${rowsHtml}</div>
                      <button type="button" class="exec-action-btn primary" style="width:100%;" data-export-appointments-date="${escapeHtml(dateStr)}">${icon('file-text', { size: 16 })} <span>Baixar PDF do Dia</span></button>
                    </div>`;
          })
          .join('\n')
      : `<div class="autonmax-card" style="grid-column:1 / -1;text-align:center;color:var(--color-text-muted);">Nenhum agendamento confirmado encontrado.</div>`;

    return [
      `<section data-view="appointments" data-ui-mode="${mode}">`,
      `  <div class="subview-header">`,
      `    <button type="button" class="exec-action-btn" data-nav-view="dashboard">${icon('arrow-left', { size: 16 })} <span>Voltar ao Painel PME</span></button>`,
      `    <h2 style="margin:0;font-family:var(--font-heading);">Agenda Confirmada por Dia</h2>`,
      `    <button type="button" class="exec-action-btn primary glow-neon" data-action="export-appointments-pdf">${icon('file-text', { size: 16 })} <span>Exportar PDF</span></button>`,
      `  </div>`,
      `  <div class="days-grid">${dayCardsHtml}</div>`,
      `</section>`,
    ].join('\n');
  }
}

module.exports = { AppointmentsView };
