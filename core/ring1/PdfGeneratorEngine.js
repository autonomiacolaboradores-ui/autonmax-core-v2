'use strict';

const fs = require('node:fs');
const path = require('node:path');

class PdfGeneratorEngine {
  constructor(reportsDir) {
    this.reportsDir = reportsDir || path.join(__dirname, '..', '..', 'workspace', 'reports');
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  static _escapePdfText(s) {
    const normalized = String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return normalized
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/[^\x20-\x7E\n]/g, '?');
  }

  generatePdfReport({ title, content, author = 'Max - Autonmax', type = 'RELATORIO' }) {
    const timestamp = Date.now();
    const filename = `report_${timestamp}.pdf`;
    const filePath = path.join(this.reportsDir, filename);

    const lines = [];
    lines.push(String(title || 'Relatorio').slice(0, 80));
    lines.push('Autor: ' + author);
    lines.push('Tipo: ' + type);
    lines.push('Data: ' + new Date().toISOString());
    lines.push('');
    const inputLines = String(content || '').split(/\r?\n/);
    for (const ln of inputLines) {
       if (ln.length === 0) {
         lines.push('');
         continue;
       }
       for (let i = 0; i < ln.length; i += 85) {
         lines.push(ln.slice(i, i + 85));
       }
    }

    const contentLines = lines.map((ln) => PdfGeneratorEngine._escapePdfText(ln));
    const ops = ['BT', '/F1 11 Tf', '50 750 Td'];
    contentLines.forEach((ln, idx) => {
      if (idx === 0) ops.push('(' + ln + ') Tj');
      else {
        ops.push('0 -14 Td');
        ops.push('(' + ln + ') Tj');
      }
    });
    ops.push('ET');
    const streamContent = ops.join('\n');

    const objects = [];
    objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
    objects.push(
      '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n'
    );
    objects.push(
      '4 0 obj\n<< /Length ' + streamContent.length + ' >>\nstream\n' + streamContent + '\nendstream\nendobj\n'
    );
    objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    for (const obj of objects) {
      offsets.push(Buffer.byteLength(pdf, 'utf8'));
      pdf += obj;
    }
    const xrefPos = Buffer.byteLength(pdf, 'utf8');
    pdf += 'xref\n0 ' + (objects.length + 1) + '\n';
    pdf += '0000000000 65535 f \n';
    for (let i = 1; i < offsets.length; i++) {
      pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    }
    pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefPos + '\n%%EOF\n';

    const pdfBuffer = Buffer.from(pdf, 'utf8');
    fs.writeFileSync(filePath, pdfBuffer);

    return {
      filename,
      filePath,
      path: filePath,
      downloadUrl: '/reports/' + filename,
      sizeBytes: pdfBuffer.length,
      createdAt: new Date().toISOString()
    };
  }
}

module.exports = PdfGeneratorEngine;
module.exports.PdfGeneratorEngine = PdfGeneratorEngine;
