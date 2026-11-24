'use strict';

/**
 * AppointmentsView (Miolo): Agenda com cancelamento offline-first e slots injetáveis
 * (`exportAppointmentsPdf` e `shareReceipt`).
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

  render(appointments = []) {
    const mode = this.ctx.uiMode;
    const list = Array.isArray(appointments) ? appointments : [];
    const rows = list
      .map(
        (a) => `<tr>
          <td data-label="Horário">${a.time_slot || a.timeSlot}</td>
          <td data-label="Cliente">${a.client_name || a.clientName}</td>
          <td data-label="Serviço">${a.item_name_snapshot || a.serviceName || ''}</td>
          <td data-label="Status">${a.status || 'CONFIRMED'}</td>
        </tr>`
      )
      .join('\n');

    return [
      `<section data-view="appointments" data-ui-mode="${mode}">`,
      `  <div class="autonmax-card">`,
      `    <h2 style="font-family: var(--font-heading);">Agenda</h2>`,
      `    <button type="button" class="autonmax-btn" data-action="export-appointments-pdf">Exportar PDF</button>`,
      `  </div>`,
      `  <table class="autonmax-table">`,
      `    <thead><tr><th>Horário</th><th>Cliente</th><th>Serviço</th><th>Status</th></tr></thead>`,
      `    <tbody>${rows}</tbody>`,
      `  </table>`,
      `</section>`,
    ].join('\n');
  }
}

module.exports = { AppointmentsView };
