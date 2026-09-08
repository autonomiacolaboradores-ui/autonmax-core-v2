'use strict';

/**
 * DailyReportJob — OPS-4
 * Gera MD + PDF texto diário por partner a partir de MetricsEventLog (contagens reais).
 */

const fs = require('node:fs');
const path = require('node:path');
const { getMetricsLog } = require('./MetricsEventLog');

const REPORTS_ROOT = path.join(__dirname, '../../workspace/reports/daily');

function escapePdfText(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/** Minimal single-page PDF (text lines) — same class as PdfGeneratorEngine simplicity */
function buildSimplePdf(lines) {
  const contentLines = lines.map((l, i) => {
    const y = 800 - i * 14;
    return `BT /F1 10 Tf 40 ${y} Td (${escapePdfText(l).slice(0, 110)}) Tj ET`;
  });
  const stream = contentLines.join('\n');
  const objects = [];
  objects.push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n');
  objects.push('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n');
  objects.push(
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n'
  );
  objects.push(`4 0 obj<< /Length ${Buffer.byteLength(stream)} >>stream\n${stream}\nendstream\nendobj\n`);
  objects.push('5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n');

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += obj;
  }
  const xrefPos = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

class DailyReportJob {
  constructor(options = {}) {
    this.metrics = options.metrics || getMetricsLog();
    this.reportsRoot = options.reportsRoot || REPORTS_ROOT;
    fs.mkdirSync(this.reportsRoot, { recursive: true });
    this._timer = null;
  }

  /**
   * Generate report for one partner/day.
   */
  generate(partnerId, day) {
    const agg = this.metrics.aggregate(partnerId, day);
    const c = agg.counts;
    const lines = [
      `Autonmax — Relatório diário PME`,
      `partnerId: ${agg.partnerId}`,
      `day: ${agg.day}`,
      `generatedAt: ${new Date().toISOString()}`,
      `source: runtime_events (not seed)`,
      ``,
      `conversations_started: ${c.conversations_started}`,
      `messages_in: ${c.messages_in}`,
      `appointments_created: ${c.appointments_created}`,
      `appointments_cancelled: ${c.appointments_cancelled}`,
      `catalog_answered: ${c.catalog_answered}`,
      `handoff_human: ${c.handoff_human}`,
      `paused: ${c.paused}`,
      `unresolved: ${c.unresolved}`,
      `wa_session_down: ${c.wa_session_down}`,
      `wa_qr_required: ${c.wa_qr_required}`,
      `wa_reconnect_ok: ${c.wa_reconnect_ok}`,
      ``,
      `total_events: ${agg.events}`,
      `Non-claim: contagens refletem eventos do runtime, não CRM completo.`
    ];

    const dir = path.join(this.reportsRoot, String(partnerId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_'));
    fs.mkdirSync(dir, { recursive: true });
    const base = path.join(dir, agg.day);
    const mdPath = base + '.md';
    const pdfPath = base + '.pdf';
    fs.writeFileSync(mdPath, lines.join('\n') + '\n');
    fs.writeFileSync(pdfPath, buildSimplePdf(lines));
    return {
      ok: true,
      partnerId: agg.partnerId,
      day: agg.day,
      mdPath,
      pdfPath,
      counts: c,
      events: agg.events
    };
  }

  /** Run for all partners that have metric folders today */
  generateAll(day) {
    const d = day || new Date().toISOString().slice(0, 10);
    const metricsRoot = this.metrics.rootDir;
    const results = [];
    if (!fs.existsSync(metricsRoot)) return results;
    for (const pid of fs.readdirSync(metricsRoot)) {
      const st = fs.statSync(path.join(metricsRoot, pid));
      if (!st.isDirectory()) continue;
      results.push(this.generate(pid, d));
    }
    return results;
  }

  /**
   * Schedule daily job (default 03:00 local check every hour).
   */
  startScheduler(options = {}) {
    const hourUtc = options.hourUtc != null ? options.hourUtc : 6;
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => {
      const now = new Date();
      if (now.getUTCHours() === hourUtc && now.getUTCMinutes() < 5) {
        const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
        try {
          this.generateAll(yesterday);
          console.log('[DAILY_REPORT] generated for', yesterday);
        } catch (e) {
          console.error('[DAILY_REPORT] fail', e.message);
        }
      }
    }, 60 * 1000);
    return this;
  }

  stopScheduler() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }
}

module.exports = { DailyReportJob, buildSimplePdf };
