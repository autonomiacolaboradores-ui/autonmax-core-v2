'use strict';

// core/ring2/WebSearchEngine.js
// Busca web com falha HONESTA — nunca inventa resultado genérico de sucesso.

class WebSearchEngine {
  static async search(query) {
    const q = String(query || '').trim();
    if (!q) {
      return {
        ok: false,
        query: q,
        source: 'WebSearchEngine',
        results: [],
        summaryText: '',
        reason: 'QUERY_EMPTY',
        message: 'Nenhum termo de pesquisa foi informado.'
      };
    }

    const searchTerm = encodeURIComponent(q);
    const searchUrl = `https://html.duckduckgo.com/html/?q=${searchTerm}`;

    try {
      const res = await fetch(searchUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; Autonmax/3.0; +https://autonomia.local)'
        }
      });

      if (!res.ok) {
        return {
          ok: false,
          query: q,
          source: 'DuckDuckGo HTML',
          results: [],
          summaryText: '',
          reason: `HTTP_${res.status}`,
          message: `A busca web falhou (HTTP ${res.status}). Não há resultados confiáveis para devolver.`
        };
      }

      const html = await res.text();
      const snippetMatches = html.match(/<a class="result__snippet[^>]*>(.*?)<\/a>/gi) || [];
      const titleMatches = html.match(/<a class="result__a[^>]*>(.*?)<\/a>/gi) ||
        html.match(/<a class="result__url[^>]*>(.*?)<\/a>/gi) ||
        [];

      const results = [];
      for (let i = 0; i < Math.min(snippetMatches.length, 5); i++) {
        const snippet = snippetMatches[i].replace(/<[^>]*>/g, '').trim();
        const title = (titleMatches[i] || '').replace(/<[^>]*>/g, '').trim();
        if (snippet) {
          results.push({ title: title || `Resultado ${i + 1}`, snippet });
        }
      }

      if (results.length === 0) {
        return {
          ok: false,
          query: q,
          source: 'DuckDuckGo HTML',
          results: [],
          summaryText: '',
          reason: 'NO_RESULTS',
          message:
            `Não encontrei resultados utilizáveis para "${q}". Tente reformular a busca.`
        };
      }

      return {
        ok: true,
        query: q,
        source: 'DuckDuckGo HTML',
        results,
        summaryText: results.map((r) => `• ${r.title}: ${r.snippet}`).join('\n')
      };
    } catch (err) {
      return {
        ok: false,
        query: q,
        source: 'WebSearchEngine',
        results: [],
        summaryText: '',
        reason: 'NETWORK_OR_PARSE',
        message: `Falha ao pesquisar na web: ${err.message}. Não inventei resultados.`
      };
    }
  }
}

module.exports = WebSearchEngine;
