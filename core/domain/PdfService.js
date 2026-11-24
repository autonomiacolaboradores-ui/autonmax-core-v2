'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { formatPriceCents, formatFriendly } = require('./RegionalNormalizer');

const MAX_LINE_WIDTH = 85;
const LINES_PER_PAGE = 48;

/**
 * Native PDF 1.4 generator without Puppeteer or headless browsers.
 * Supports in-memory Buffer generation and optional filesystem export.
 */
class PdfService {
  /**
   * @param {{ reportsDir?: string }} [options]
   */
  constructor(options = {}) {
    this.reportsDir = options.reportsDir || null;
  }

  /**
   * Normalizes text to ASCII-safe PDF string literals.
   * @param {string} s
   * @returns {string}
   */
  static escapePdfText(s) {
    const normalized = String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return normalized
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/[^\x20-\x7E]/g, '?');
  }

  /**
   * Wraps and flattens content into printable lines.
   * @param {string} content
   * @param {number} [maxWidth=85]
   * @returns {string[]}
   */
  static wrapLines(content, maxWidth = MAX_LINE_WIDTH) {
    const lines = [];
    for (const ln of String(content || '').split(/\r?\n/)) {
      if (ln.length === 0) {
        lines.push('');
        continue;
      }
      for (let i = 0; i < ln.length; i += maxWidth) {
        lines.push(ln.slice(i, i + maxWidth));
      }
    }
    return lines;
  }

  /**
   * Generates a valid PDF 1.4 Buffer in memory (zero headless browser dependency).
   * @param {{ title: string, content: string, author?: string, type?: string, generatedAt?: string }} payload
   * @returns {Buffer}
   */
  generatePdfBuffer({
    title,
    content,
    author = 'Autonmax vNext',
    type = 'RELATORIO',
    generatedAt = new Date().toISOString(),
  }) {
    const headerLines = [
      String(title || 'Relatorio').slice(0, 80),
      `Autor: ${author}`,
      `Tipo: ${type}`,
      `Data: ${generatedAt}`,
      '',
    ];
    const allLines = [...headerLines, ...PdfService.wrapLines(content)];

    const pages = [];
    for (let i = 0; i < allLines.length; i += LINES_PER_PAGE) {
      pages.push(allLines.slice(i, i + LINES_PER_PAGE));
    }
    if (pages.length === 0) {
      pages.push(['']);
    }

    // Object 1: Catalog, Object 2: Pages, Object 3: Font F1, then pairs of (Page, ContentStream)
    const pageObjIds = [];
    const bodyObjects = [];
    let nextId = 4;

    for (const pageLines of pages) {
      const pageId = nextId++;
      const streamId = nextId++;
      pageObjIds.push(pageId);

      const ops = ['BT', '/F1 11 Tf', '50 750 Td'];
      pageLines.forEach((ln, idx) => {
        const escaped = PdfService.escapePdfText(ln);
        if (idx === 0) {
          ops.push(`(${escaped}) Tj`);
        } else {
          ops.push('0 -14 Td');
          ops.push(`(${escaped}) Tj`);
        }
      });
      ops.push('ET');
      const streamContent = ops.join('\n');

      bodyObjects.push(
        `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${streamId} 0 R /Resources << /Font << /F1 3 0 R >> >> >>\nendobj\n`
      );
      bodyObjects.push(
        `${streamId} 0 obj\n<< /Length ${Buffer.byteLength(streamContent, 'utf8')} >>\nstream\n${streamContent}\nendstream\nendobj\n`
      );
    }

    const objects = [
      '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
      `2 0 obj\n<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjIds.length} >>\nendobj\n`,
      '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
      ...bodyObjects,
    ];

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    for (const obj of objects) {
      offsets.push(Buffer.byteLength(pdf, 'utf8'));
      pdf += obj;
    }

    const xrefPos = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let i = 1; i < offsets.length; i += 1) {
      pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;

    return Buffer.from(pdf, 'utf8');
  }

  /**
   * Generates a PDF and optionally persists it to `outputDir` / `this.reportsDir`.
   * @param {{ title: string, content: string, author?: string, type?: string, outputDir?: string, filename?: string }} options
   */
  generatePdfReport(options) {
    const buffer = this.generatePdfBuffer(options);
    const filename = options.filename || `report_${Date.now()}.pdf`;
    const targetDir = options.outputDir || this.reportsDir;
    let filePath = null;

    if (targetDir) {
      fs.mkdirSync(targetDir, { recursive: true });
      filePath = path.join(targetDir, filename);
      fs.writeFileSync(filePath, buffer);
    }

    return {
      filename,
      filePath,
      sizeBytes: buffer.length,
      buffer,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Builds a daily appointments PDF buffer.
   * @param {{ partnerName: string, dateStr: string, appointments: Array<Record<string, any>> }} params
   */
  buildAppointmentsPdf({ partnerName, dateStr, appointments = [] }) {
    const title = `Agenda Diaria - ${partnerName || 'Estabelecimento'} (${dateStr})`;
    const lines = [
      `Data: ${formatFriendly(dateStr)}`,
      `Total de agendamentos: ${appointments.length}`,
      '------------------------------------------------------------',
    ];

    for (const appt of appointments) {
      lines.push(
        `${appt.time_slot} | ${appt.item_name_snapshot} (${appt.duration_minutes_snapshot} min) | ${appt.client_name} | ${formatPriceCents(appt.price_cents_snapshot)} | ${appt.status}`
      );
    }

    if (appointments.length === 0) {
      lines.push('Nenhum agendamento registrado para esta data.');
    }

    const content = lines.join('\n');
    const buffer = this.generatePdfBuffer({
      title,
      content,
      type: 'AGENDA_DIARIA',
    });

    return { title, content, buffer };
  }

  /**
   * Builds a daily product orders PDF buffer.
   * @param {{ partnerName: string, dateStr: string, orders: Array<Record<string, any>> }} params
   */
  buildOrdersPdf({ partnerName, dateStr, orders = [] }) {
    const title = `Pedidos - ${partnerName || 'Estabelecimento'} (${dateStr || 'Geral'})`;
    let totalConfirmedCents = 0;
    const lines = [
      dateStr ? `Data: ${formatFriendly(dateStr)}` : 'Periodo: Geral',
      `Total de pedidos: ${orders.length}`,
      '------------------------------------------------------------',
    ];

    for (const ord of orders) {
      if (ord.status !== 'CANCELLED') {
        totalConfirmedCents += Number(ord.total_cents || 0);
      }
      const itemsSummary = (ord.items || [])
        .map((it) => `${it.qty}x ${it.name}`)
        .join(', ');
      lines.push(
        `#${ord.id} | ${ord.client_name} | ${itemsSummary} | ${formatPriceCents(ord.total_cents)} | ${ord.status}`
      );
    }

    lines.push('------------------------------------------------------------');
    lines.push(`Total financeiro (nao cancelados): ${formatPriceCents(totalConfirmedCents)}`);

    const content = lines.join('\n');
    const buffer = this.generatePdfBuffer({
      title,
      content,
      type: 'PEDIDOS_DIARIOS',
    });

    return { title, content, buffer };
  }

  /**
   * Builds a deterministic receipt PDF for a confirmed appointment or order.
   * @param {{ kind: 'appointment' | 'order', partnerName: string, record: Record<string, any> }} params
   */
  buildReceiptPdf({ kind, partnerName, record }) {
    const lines = [`Estabelecimento: ${partnerName || 'Estabelecimento'}`];
    let title = 'Comprovante';

    if (kind === 'appointment') {
      title = `Comprovante de Agendamento - ${record.id}`;
      lines.push(`Cliente: ${record.client_name}`);
      lines.push(`Servico: ${record.item_name_snapshot}`);
      lines.push(`Data/Hora: ${formatFriendly(record.date_str, record.time_slot)}`);
      lines.push(`Duracao: ${record.duration_minutes_snapshot} min`);
      lines.push(`Valor: ${formatPriceCents(record.price_cents_snapshot)}`);
      lines.push(`Status: ${record.status}`);
    } else {
      title = `Comprovante de Pedido - ${record.id}`;
      lines.push(`Cliente: ${record.client_name}`);
      for (const item of record.items || []) {
        lines.push(
          `- ${item.qty}x ${item.name} (${formatPriceCents(item.price_cents)} cada) = ${formatPriceCents(item.subtotal_cents ?? item.price_cents * item.qty)}`
        );
      }
      lines.push(`Total: ${formatPriceCents(record.total_cents)}`);
      lines.push(`Status: ${record.status}`);
    }

    const content = lines.join('\n');
    const buffer = this.generatePdfBuffer({
      title,
      content,
      type: kind === 'appointment' ? 'RECIBO_AGENDAMENTO' : 'RECIBO_PEDIDO',
    });

    return { title, content, buffer };
  }
}

module.exports = { PdfService };
