'use strict';

/**
 * DocumentTools — modo Pessoal/PME
 * fetch_url_text · compile_markdown · compile_pdf (texto)
 * Apenas function-calling — sem botões na UI.
 */

const fs = require('node:fs');
const path = require('node:path');
const PdfGeneratorEngine = require('../ring1/PdfGeneratorEngine');

const USER_AGENT = 'Autonmax/3.0 (document-tools; +https://autonomia.local)';

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

class DocumentTools {
  static async fetchUrlText({ url, maxChars } = {}) {
    const tool = 'fetch_url_text';
    try {
      const target = String(url || '').trim();
      if (!/^https?:\/\//i.test(target)) {
        return { status: 'ERROR', ok: false, tool, reason: 'INVALID_URL', message: 'URL deve começar com http:// ou https://' };
      }
      const res = await fetch(target, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,text/plain' },
        redirect: 'follow'
      });
      if (!res.ok) {
        return { status: 'ERROR', ok: false, tool, reason: `HTTP_${res.status}`, message: `Falha ao obter URL (HTTP ${res.status})` };
      }
      const ctype = (res.headers.get('content-type') || '').toLowerCase();
      const raw = await res.text();
      let text = raw;
      if (ctype.includes('html') || /<html/i.test(raw.slice(0, 500))) {
        text = stripHtml(raw);
      }
      const limit = Math.min(50000, Math.max(500, parseInt(maxChars, 10) || 12000));
      const truncated = text.length > limit;
      text = text.slice(0, limit);
      return {
        status: 'SUCCESS',
        ok: true,
        tool,
        url: target,
        content_type: ctype,
        char_count: text.length,
        truncated,
        text
      };
    } catch (err) {
      return { status: 'ERROR', ok: false, tool, reason: 'FETCH_FAILED', message: err.message };
    }
  }

  static compileMarkdown({ title, content, sections } = {}) {
    const tool = 'compile_markdown';
    try {
      const t = String(title || 'Relatório Autonmax').trim();
      const body = String(content || '').trim();
      const extra = Array.isArray(sections) ? sections : [];
      const lines = [
        `# ${t}`,
        '',
        `*Gerado por Max (Autonmax) — ${new Date().toISOString()}*`,
        '',
        body,
        ''
      ];
      for (const s of extra) {
        if (!s) continue;
        if (typeof s === 'string') {
          lines.push(s, '');
        } else {
          lines.push(`## ${s.heading || 'Secção'}`, '', String(s.body || ''), '');
        }
      }
      lines.push('---', '', '*Documento computacional — verificar fontes antes de decisões críticas.*', '');
      const markdown = lines.join('\n');
      const reportsDir = path.join(__dirname, '..', '..', 'workspace', 'reports');
      fs.mkdirSync(reportsDir, { recursive: true });
      const filename = `report_${Date.now()}.md`;
      const filePath = path.join(reportsDir, filename);
      fs.writeFileSync(filePath, markdown, 'utf8');
      return {
        status: 'SUCCESS',
        ok: true,
        tool,
        filename,
        path: filePath,
        markdown,
        bytes: Buffer.byteLength(markdown, 'utf8')
      };
    } catch (err) {
      return { status: 'ERROR', ok: false, tool, reason: 'COMPILE_MD_FAILED', message: err.message };
    }
  }

  static compilePdf({ title, content } = {}) {
    const tool = 'compile_pdf';
    try {
      const engine = new PdfGeneratorEngine();
      const pdf = engine.generatePdfReport({
        title: title || 'Relatório Autonmax',
        content: content || '',
        author: 'Max — Autonmax',
        type: 'PERSONAL_OR_PME_REPORT'
      });
      return {
        status: 'SUCCESS',
        ok: true,
        tool,
        filename: pdf.filename,
        path: pdf.filePath || pdf.path,
        sizeBytes: pdf.sizeBytes,
        note: 'PDF texto simples (sem layout rico). Para documento legível preferir compile_markdown.'
      };
    } catch (err) {
      return { status: 'ERROR', ok: false, tool, reason: 'COMPILE_PDF_FAILED', message: err.message };
    }
  }

  static functionDeclarations() {
    return [
      {
        name: 'fetch_url_text',
        description: 'Extrai texto legível de uma página web (URL http/https). Use para ler/resumir um link específico.',
        parameters: {
          type: 'OBJECT',
          properties: {
            url: { type: 'STRING', description: 'URL completa' },
            maxChars: { type: 'NUMBER', description: 'Limite de caracteres (padrão 12000)' }
          }
        }
      },
      {
        name: 'compile_markdown',
        description: 'Compila um relatório em Markdown e grava ficheiro. Use após pesquisas ou pedidos de texto formal.',
        parameters: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING' },
            content: { type: 'STRING', description: 'Corpo principal em texto/markdown' },
            sections: { type: 'ARRAY', description: 'Secções opcionais {heading, body}' }
          }
        }
      },
      {
        name: 'compile_pdf',
        description: 'Gera PDF de texto simples a partir de título + conteúdo.',
        parameters: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING' },
            content: { type: 'STRING' }
          }
        }
      }
    ];
  }

  static async dispatch(name, args = {}) {
    if (name === 'fetch_url_text') return this.fetchUrlText(args);
    if (name === 'compile_markdown') return this.compileMarkdown(args);
    if (name === 'compile_pdf') return this.compilePdf(args);
    return { status: 'UNKNOWN_TOOL', tool: name };
  }
}

module.exports = DocumentTools;
