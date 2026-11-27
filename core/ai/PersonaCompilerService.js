'use strict';

const { InputGuard } = require('./InputGuard');
const { LlmRouter } = require('./LlmRouter');

/**
 * Layer 3 — Universal Agnostic Communication & Sales Prompt (system default for new partners).
 */
const DEFAULT_AGNOSTIC_SALES_PROMPT = `# REGRA DE OURO DA LINGUAGEM (SIMPLES E ACESSÍVEL)
- Fale sempre a língua do cliente, de forma simples, clara, acolhedora e direta.
- Evite jargões complicados ou palavras técnicas difíceis do setor. Traduza qualquer detalhe técnico em benefício prático no dia a dia do cliente (resultado, economia de tempo, segurança, praticidade ou tranquilidade).

# MOTOR AGNÓSTICO DE VENDAS (LEITURA DINÂMICA DO CATÁLOGO)
- Antes de apresentar qualquer oferta, responder dúvidas ou defender preço, leia obrigatoriamente o nome, a descrição, a duração e o valor oficial dos itens cadastrados no catálogo.
- Construa sua explicação e seus argumentos na hora, combinando a necessidade que o cliente contou com os benefícios reais escritos na descrição de cada produto ou serviço.
- Use sempre a fórmula de apresentação: Necessidade do cliente + Benefício prático extraído do catálogo + Próximo passo leve.
- Nunca invente funcionalidades, descontos, prazos, links ou valores fora do catálogo oficial.

# TÁTICAS UNIVERSAIS DE COMUNICAÇÃO E PERSUASÃO
1. Ritmo de WhatsApp (Curto, Humano e Uma Pergunta por Vez):
   - Escreva mensagens curtas e fáceis de ler no celular (no máximo 2 a 3 parágrafos breves).
   - Faça apenas UMA pergunta por mensagem. Conduza a conversa passo a passo, sem atropelar.
   - Mantenha tom próximo, seguro e consultivo — como um especialista experiente que quer realmente ajudar o cliente a fazer a melhor escolha.
2. Entendimento Antes da Oferta:
   - Se o cliente ainda não souber exatamente o que precisa, entenda primeiro a necessidade dele antes de listar tudo o que existe no catálogo. Se ele já pedir diretamente um item, preço ou horário específico, responda de forma objetiva e conduza ao atendimento sem enrolar.
3. Ancoragem Antes do Preço:
   - Sempre que possível, evite jogar preço seco. Mostre primeiro o valor prático da solução e o benefício que o cliente ganha (ou o transtorno que evita) ao resolver o problema, para que o valor oficial do catálogo faça sentido perto do retorno.
4. Regra da 1 Tentativa Consultiva (Não Desista na Primeira Recusa):
   - Diante de qualquer resistência ou "não preciso agora", nunca recue de primeira.
   - Faça 1 tentativa consultiva inteligente conectando a realidade do cliente ao benefício prático do item. Só recue com total elegância se ele mantiver a recusa na resposta seguinte.
5. Conexão Natural Entre Ofertas (Sem Misturar Fluxos):
   - Se o cliente demonstrar outra necessidade complementar que exista no catálogo, aponte como as duas soluções se ajudam na prática — mas sempre finalize uma solicitação de cada vez (nunca misture fechamento de produto com agendamento de serviço no mesmo turno).
6. Fechamento Suave:
   - Termine sempre com um convite leve e claro para o próximo passo (tirar uma dúvida objetiva, ver horários disponíveis ou avançar para a confirmação).

# FÓRMULA UNIVERSAL DE CONTORNO DE OBJEÇÕES
Sempre que o cliente trouxer uma objeção, aplique estes 3 passos na hora usando os dados reais do catálogo:
1. Validar sem confrontar: Mostre que a preocupação faz sentido ("Entendo totalmente...", "Faz todo sentido pensar nisso...").
2. Reenquadrar com foco no benefício prático:
   - Se for preço ("tá caro"): Compare o valor oficial do item com o custo ou transtorno de adiar a solução, destacando a qualidade e o resultado prático descritos no catálogo.
   - Se for dúvida ou insegurança ("será que resolve?" / "medo de dar errado"): Destaque os diferenciais reais da empresa, a clareza no atendimento e os detalhes oficiais do catálogo.
   - Se for indecisão ("vou pensar" / "falar com outra pessoa"): Ajude o cliente a resumir o ponto principal que ele precisa resolver hoje para facilitar a decisão.
3. Pergunta leve de avanço: Feche com uma pergunta simples que mantenha a conversa viva.

# LIMITES INVIOLÁVEIS
- Nunca invente informações, preços, prazos ou condições fora da base oficial cadastrada da empresa.
- Quando perguntado sobre áudio, deixe claro com transparência que você ouve e entende os áudios enviados pelos clientes e responde rapidinho em texto.
- Nunca diga que precisa consultar "equipe técnica" para ver disponibilidade ou concluir atendimento quando a agenda ou o catálogo oficial estiverem disponíveis — consulte a base oficial e conduza diretamente.
- Só finalize um pedido ou agendamento depois de apresentar o resumo claro e receber o "sim" explícito do cliente.`;

const FIELD_LIMITS = Object.freeze({
  businessName: 80,
  segment: 80,
  differentiators: 450,
  postura_especialista: 240,
  dominio_tecnico_pratico: 320,
  duvidas_e_dores_comuns: 280,
  limites_eticos_do_segmento: 240,
});

const MONETARY_PATTERNS = Object.freeze([
  /R\$\s*\d+(?:[.,]\d{1,3})*(?:[.,]\d{2})?/gi,
  /(?:US\$|USD|EUR|€|\$)\s*\d+(?:[.,]\d{1,3})*(?:[.,]\d{2})?/gi,
  /\b\d+(?:[.,]\d{1,2})?\s*reais\b/gi,
]);

const DISCOUNT_PATTERNS = Object.freeze([
  /\b\d+(?:[.,]\d+)?\s*%\s*(?:de\s+desconto|off|desconto)?/gi,
  /\bdesconto\s+de\s+\d+(?:[.,]\d+)?\s*%/gi,
]);

const URL_PATTERNS = Object.freeze([
  /https?:\/\/[^\s)>"']+/gi,
  /\bwww\.[^\s)>"']+/gi,
  /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|com\.br|net|org|io|app|dev|br|co)(?:\/[^\s)>"']*)?/gi,
]);

/**
 * Strips prompt-injection signatures (reusing InputGuard patterns), control chars,
 * and excessive line breaks, then truncates cleanly to `maxLen`.
 * @param {unknown} raw
 * @param {number} maxLen
 * @returns {string}
 */
function sanitizeUserField(raw, maxLen) {
  let text = typeof raw === 'string' ? raw : String(raw ?? '');
  text = text.replace(/\0/g, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (const pattern of InputGuard.INJECTION_PATTERNS) {
    const globalRe = new RegExp(pattern.source, 'gi');
    text = text.replace(globalRe, ' ');
  }

  text = text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();

  if (Number.isInteger(maxLen) && maxLen > 0 && text.length > maxLen) {
    text = text.slice(0, maxLen).trim();
  }
  return text;
}

/**
 * Deterministically strips monetary figures, percentage discounts, URLs/links,
 * and prompt-injection artifacts from LLM-generated Layer 2 specialist fields,
 * enforcing strict character limits.
 * @param {unknown} raw
 * @param {number} maxLen
 * @returns {string}
 */
function sanitizeSpecialistText(raw, maxLen) {
  let text = sanitizeUserField(raw, 4000);

  for (const re of URL_PATTERNS) {
    text = text.replace(re, '');
  }
  for (const re of MONETARY_PATTERNS) {
    text = text.replace(re, '');
  }
  for (const re of DISCOUNT_PATTERNS) {
    text = text.replace(re, '');
  }

  text = text
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,.;:])\s*([,.;:])+/g, '$1')
    .replace(/\n+/g, ' ')
    .trim();

  if (Number.isInteger(maxLen) && maxLen > 0 && text.length > maxLen) {
    text = text.slice(0, maxLen).trim();
  }
  return text;
}

/**
 * Resiliently parses a JSON object from LLM text (including ```json ... ``` blocks).
 * @param {string} rawText
 * @returns {Record<string, unknown> | null}
 */
function parseJsonResilient(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return null;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [];
  if (fenced && fenced[1]) {
    candidates.push(fenced[1].trim());
  }
  candidates.push(text);

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(text.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Try next candidate
    }
  }
  return null;
}

/**
 * Extracts only safe item names and types (never prices) for specialization context.
 * @param {Array<Record<string, any>>} catalogItems
 * @returns {Array<{ name: string, type: string }>}
 */
function extractSafeCatalogContext(catalogItems = []) {
  if (!Array.isArray(catalogItems)) return [];
  const out = [];
  for (const item of catalogItems) {
    if (!item) continue;
    const name = sanitizeSpecialistText(item.name || item.title || '', 80);
    if (!name) continue;
    const rawType = String(item.type || item.item_type || 'SERVICE').toUpperCase();
    const type = rawType === 'PRODUCT' ? 'PRODUCT' : 'SERVICE';
    out.push({ name, type });
    if (out.length >= 25) break;
  }
  return out;
}

/**
 * Builds deterministic structured Layer 2 fallback when no LLM provider is available
 * or when a provider fails/returns invalid JSON.
 * @param {{ businessName: string, segment: string, differentiators?: string, catalogItems?: Array<{ name: string, type: string }> }} params
 */
function buildFallbackLayer2({ businessName, segment, differentiators = '', catalogItems = [] }) {
  const seg = segment || 'atendimento especializado';
  const hasServices = catalogItems.some((i) => i.type === 'SERVICE');
  const hasProducts = catalogItems.some((i) => i.type === 'PRODUCT');
  const scopeHint =
    hasServices && hasProducts
      ? 'serviços e produtos'
      : hasProducts
        ? 'produtos'
        : 'serviços';
  const diffHint = differentiators
    ? ` valorizando os diferenciais reais de ${businessName}`
    : '';

  return {
    postura_especialista: sanitizeSpecialistText(
      `Atue como um especialista experiente em ${seg}, acolhendo o cliente com clareza, empatia e linguagem simples, traduzindo detalhes técnicos em benefícios práticos${diffHint}.`,
      FIELD_LIMITS.postura_especialista
    ),
    dominio_tecnico_pratico: sanitizeSpecialistText(
      `Domine as boas práticas de ${seg}, avalie o objetivo real do cliente antes de indicar ${scopeHint} do catálogo oficial e oriente sobre cuidados essenciais de uso, preparo ou manutenção para gerar o melhor resultado.`,
      FIELD_LIMITS.dominio_tecnico_pratico
    ),
    duvidas_e_dores_comuns: sanitizeSpecialistText(
      `Antecipe dúvidas frequentes de clientes de ${seg} sobre qual opção escolher, tempo de atendimento e resultados esperados, fazendo perguntas objetivas para entender a necessidade específica de cada pessoa.`,
      FIELD_LIMITS.duvidas_e_dores_comuns
    ),
    limites_eticos_do_segmento: sanitizeSpecialistText(
      `Nunca faça diagnósticos definitivos, promessas de resultado garantido ou recomendações técnicas críticas em ${seg} sem a devida avaliação presencial ou técnica quando o caso exigir análise individual.`,
      FIELD_LIMITS.limites_eticos_do_segmento
    ),
  };
}

/**
 * Compiles the 3 clean identity layers into a single owner-reviewable prompt string.
 * @param {{
 *   layer1: { businessName: string, segment: string, differentiators: string },
 *   layer2: {
 *     postura_especialista: string,
 *     dominio_tecnico_pratico: string,
 *     duvidas_e_dores_comuns: string,
 *     limites_eticos_do_segmento: string
 *   },
 *   layer3?: string
 * }} params
 * @returns {string}
 */
function compileIdentityPrompt({ layer1, layer2, layer3 = DEFAULT_AGNOSTIC_SALES_PROMPT }) {
  const layer1Lines = [
    '# IDENTIDADE E DIFERENCIAIS DA EMPRESA',
    `- Empresa: ${layer1.businessName}`,
    `- Segmento: ${layer1.segment}`,
  ];
  if (layer1.differentiators) {
    layer1Lines.push(`- Diferenciais e Atividades Principais: ${layer1.differentiators}`);
  }

  const layer2Lines = [
    '# ESPECIALIZAÇÃO NO SEGMENTO',
    `- Postura de Especialista: ${layer2.postura_especialista}`,
    `- Domínio Técnico Prático: ${layer2.dominio_tecnico_pratico}`,
    `- Dúvidas e Dores Comuns: ${layer2.duvidas_e_dores_comuns}`,
    `- Limites Éticos do Segmento: ${layer2.limites_eticos_do_segmento}`,
  ];

  return [layer1Lines.join('\n'), layer2Lines.join('\n'), layer3].join('\n\n');
}

/**
 * Three-Layer Identity Compiler ("Especializar o MAX"):
 * - Layer 1: Exact sanitized business identity & differentiators from user input.
 * - Layer 2: Segment specialization generated purely from the LLM's internal knowledge
 *   via `LlmRouter` (zero web search, zero tools, strict JSON + deterministic sanitization
 *   + deterministic fallback when offline/unconfigured).
 * - Layer 3: Universal Agnostic Sales & Communication Prompt (`DEFAULT_AGNOSTIC_SALES_PROMPT`).
 */
class PersonaCompilerService {
  /**
   * @param {{ llmRouter?: LlmRouter }} [deps]
   */
  constructor(deps = {}) {
    this.llmRouter = deps.llmRouter || new LlmRouter();
  }

  /**
   * Generates a complete 3-layer specialized identity prompt for a partner.
   * @param {{
   *   businessName: string,
   *   segment: string,
   *   differentiators?: string,
   *   catalogItems?: Array<Record<string, any>>
   * }} params
   */
  async generateSpecializedPersona({
    businessName,
    segment,
    differentiators = '',
    catalogItems = [],
  } = {}) {
    const cleanBusinessName = sanitizeUserField(businessName, FIELD_LIMITS.businessName);
    const cleanSegment = sanitizeUserField(segment, FIELD_LIMITS.segment);
    const cleanDifferentiators = sanitizeUserField(
      differentiators,
      FIELD_LIMITS.differentiators
    );

    if (!cleanBusinessName || !cleanSegment) {
      const err = new Error('businessName e segment são obrigatórios.');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }

    const safeCatalog = extractSafeCatalogContext(catalogItems);
    const fallbackLayer2 = buildFallbackLayer2({
      businessName: cleanBusinessName,
      segment: cleanSegment,
      differentiators: cleanDifferentiators,
      catalogItems: safeCatalog,
    });

    const systemPrompt = [
      'Você é um especialista em treinamento de atendentes comerciais de WhatsApp em português do Brasil.',
      'Use EXCLUSIVAMENTE seu conhecimento interno sobre o segmento informado — não invente links, URLs, preços, valores em R$ nem descontos percentuais.',
      'Retorne APENAS um objeto JSON válido (sem texto extra antes ou depois) contendo exatamente estas 4 chaves de string:',
      `- "postura_especialista" (máximo ${FIELD_LIMITS.postura_especialista} caracteres): como um especialista experiente desse segmento pensa, acolhe e traduz termos técnicos em linguagem simples para o cliente.`,
      `- "dominio_tecnico_pratico" (máximo ${FIELD_LIMITS.dominio_tecnico_pratico} caracteres): conhecimentos essenciais, critérios de avaliação, cuidados importantes e boas práticas que um profissional veterano dessa área domina para orientar bem o cliente.`,
      `- "duvidas_e_dores_comuns" (máximo ${FIELD_LIMITS.duvidas_e_dores_comuns} caracteres): as dúvidas, sintomas ou problemas mais frequentes dos clientes desse segmento e quais informações úteis o especialista costuma observar ou perguntar para entender o caso.`,
      `- "limites_eticos_do_segmento" (máximo ${FIELD_LIMITS.limites_eticos_do_segmento} caracteres): o que um especialista responsável desse ramo nunca afirma ou promete sem avaliação presencial/técnica prévia.`,
    ].join('\n');

    const catalogLines =
      safeCatalog.length > 0
        ? safeCatalog.map((it) => `- ${it.name} (${it.type})`).join('\n')
        : '(Nenhum item cadastrado ainda)';

    const userMessage = [
      `Empresa: ${cleanBusinessName}`,
      `Segmento: ${cleanSegment}`,
      cleanDifferentiators ? `Diferenciais e atividades reais: ${cleanDifferentiators}` : null,
      `Contexto de atuação (somente nomes e tipos do catálogo, sem preços):\n${catalogLines}`,
      'Gere o JSON estrito com as 4 chaves.',
    ]
      .filter(Boolean)
      .join('\n');

    let layer2 = fallbackLayer2;
    let providerUsed = 'deterministic_fallback';
    let model = 'none';

    if (this.llmRouter && typeof this.llmRouter.generate === 'function') {
      try {
        const llmRes = await this.llmRouter.generate({
          systemPrompt,
          userMessage,
          tools: [],
        });

        if (llmRes && llmRes.ok && llmRes.text) {
          const parsed = parseJsonResilient(llmRes.text);
          if (parsed) {
            const sanitizedPostura = sanitizeSpecialistText(
              parsed.postura_especialista,
              FIELD_LIMITS.postura_especialista
            );
            const sanitizedDominio = sanitizeSpecialistText(
              parsed.dominio_tecnico_pratico,
              FIELD_LIMITS.dominio_tecnico_pratico
            );
            const sanitizedDuvidas = sanitizeSpecialistText(
              parsed.duvidas_e_dores_comuns,
              FIELD_LIMITS.duvidas_e_dores_comuns
            );
            const sanitizedLimites = sanitizeSpecialistText(
              parsed.limites_eticos_do_segmento,
              FIELD_LIMITS.limites_eticos_do_segmento
            );

            const hasAtLeastOneField = Boolean(
              sanitizedPostura || sanitizedDominio || sanitizedDuvidas || sanitizedLimites
            );
            if (hasAtLeastOneField) {
              layer2 = {
                postura_especialista: sanitizedPostura || fallbackLayer2.postura_especialista,
                dominio_tecnico_pratico:
                  sanitizedDominio || fallbackLayer2.dominio_tecnico_pratico,
                duvidas_e_dores_comuns:
                  sanitizedDuvidas || fallbackLayer2.duvidas_e_dores_comuns,
                limites_eticos_do_segmento:
                  sanitizedLimites || fallbackLayer2.limites_eticos_do_segmento,
              };
              providerUsed = llmRes.providerUsed || 'llm';
              model = llmRes.model || 'unknown';
            }
          }
        }
      } catch {
        // Fall back cleanly to deterministic structured specialization
      }
    }

    const layer1 = {
      businessName: cleanBusinessName,
      segment: cleanSegment,
      differentiators: cleanDifferentiators,
    };

    const compiledPrompt = compileIdentityPrompt({
      layer1,
      layer2,
      layer3: DEFAULT_AGNOSTIC_SALES_PROMPT,
    });

    return {
      compiledPrompt,
      layers: {
        layer1,
        layer2,
        layer3: DEFAULT_AGNOSTIC_SALES_PROMPT,
      },
      providerUsed,
      model,
      charCount: compiledPrompt.length,
    };
  }
}

/**
 * Convenience function delegating to `PersonaCompilerService`.
 */
async function generateSpecializedPersona(params = {}, deps = {}) {
  const compiler = new PersonaCompilerService(deps);
  return compiler.generateSpecializedPersona(params);
}

PersonaCompilerService.DEFAULT_AGNOSTIC_SALES_PROMPT = DEFAULT_AGNOSTIC_SALES_PROMPT;
PersonaCompilerService.FIELD_LIMITS = FIELD_LIMITS;

module.exports = {
  PersonaCompilerService,
  DEFAULT_AGNOSTIC_SALES_PROMPT,
  FIELD_LIMITS,
  generateSpecializedPersona,
  compileIdentityPrompt,
  sanitizeUserField,
  sanitizeSpecialistText,
  parseJsonResilient,
  extractSafeCatalogContext,
  buildFallbackLayer2,
};
