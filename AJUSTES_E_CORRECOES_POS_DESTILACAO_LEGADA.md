# Ajustes e Correções Pós-Destilação Legada — AUTON.MAX vNext

**Data de consolidação:** 24/11/2026  
**Baseline inicial (commit Git `7fd217b`):** `AUTONMAX vNext` (6 camadas, 37/37 testes de contrato)  
**Estado atual verificado:** **49/49 testes de contrato passando** (`npm run verify`, `exit 0`), build web estático atualizado (`app-web/dist`, 24 arquivos) e fluxo end-to-end completo validado em runtime.

---

## 1. Visão Geral

Após a destilação arquitetural inicial do sistema legado (`max_atendente_certificado area de trabalho/`) para o **AUTON.MAX vNext**, diversas ondas de evolução e correções reais foram aplicadas sobre o repositório para fechar lacunas operacionais de produção identificadas em auditorias, testes automatizados e testes reais realizados pelo operador humano em navegador, painel PME e chamadas WhatsApp/Gemini.

Em relação ao baseline inicial (`7fd217b`), foram modificados **34 arquivos versionados** e adicionados novos módulos essenciais (totalizando **4.293 inserções** e novas migrations, componentes UI e testes nas Camadas 1 a 6).

---

## 2. Consolidação das Melhorias e Correções Aplicadas

### 2.1 Camada 1 & 2 — Persistência SQLite, Catálogo e Controle de Estoque
* **Extensão de perfil PME (Migration 002)** — [`002_partner_profile_extensions.js`](file:///c:/Users/edini/Desktop/vnext/core/storage/migrations/002_partner_profile_extensions.js):
  * Adicionada coluna `logo_data_url` na tabela `partners` de forma idempotente (`PRAGMA table_info(partners)`).
* **Controle de estoque opcional para produtos digitais/software (Migration 003)** — [`003_catalog_stock_control.js`](file:///c:/Users/edini/Desktop/vnext/core/storage/migrations/003_catalog_stock_control.js), [`CatalogRepository.js`](file:///c:/Users/edini/Desktop/vnext/core/storage/repositories/CatalogRepository.js), [`CatalogService.js`](file:///c:/Users/edini/Desktop/vnext/core/domain/CatalogService.js), [`CatalogRoutes.js`](file:///c:/Users/edini/Desktop/vnext/core/gateway/routes/CatalogRoutes.js):
  * Adicionadas as colunas `track_stock` (`INTEGER DEFAULT 0`) e `stock_quantity` (`INTEGER DEFAULT NULL`) em `catalog_items`.
  * Produtos digitais ou de software podem desativar o controle de estoque (`trackStock: false`), evitando travas falsas de quantidade ilimitada, enquanto produtos físicos ativam o controle numérico com validação via interruptor dedicado na UI ([`CatalogView.js`](file:///c:/Users/edini/Desktop/vnext/app-web/src/views/CatalogView.js#L150-L159)).
  * O campo numérico antigo isolado (`30`) foi substituído pelo campo unificado controlado pelo interruptor liga/desliga estoque.
* **Persistência integral de campos estruturados e anexos do PME** — [`PartnerRepository.js`](file:///c:/Users/edini/Desktop/vnext/core/storage/repositories/PartnerRepository.js#L17-L45), [`PartnerRoutes.js`](file:///c:/Users/edini/Desktop/vnext/core/gateway/routes/PartnerRoutes.js#L49-L90):
  * Implementados os helpers `serializeStructuredField` e `parseTextOrJson`, corrigindo o salvamento e a leitura de `working_hours_json`, `policies_json`, `business_rules`, `personality_prompt`, `welcome_message`, `store_segment`, `owner_jid`, `logo_data_url`, `pdf_files_json` (até 5 PDFs) e `image_files_json` (até 10 imagens) ao clicar em **Salvar Alterações do Max**.

### 2.2 Camada 3 — Motor Agêntico, Gemini Principal, `thoughtSignature` e Trava de Fluxo
* **Gemini como provedor principal + Fallback Intra-Gemini e Multi-Provedor** — [`LlmRouter.js`](file:///c:/Users/edini/Desktop/vnext/core/ai/LlmRouter.js#L1-L56), [`HealthRoutes.js`](file:///c:/Users/edini/Desktop/vnext/core/gateway/routes/HealthRoutes.js#L65-L120):
  * Ordem padrão de provedores atualizada para `['gemini', 'groq', 'xai', 'openai', 'openrouter']`.
  * Corrigido erro `404` do modelo legado `gemini-2.5-flash`: atualizado para `gemini-3-flash-preview` com lista de fallback intra-Gemini (`gemini-flash-lite-latest`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`) e tratamento de indisponibilidade temporária (`503` / alta demanda) com rotação automática entre modelos/provedores.
  * Preservação de `rawParts` e `thoughtSignature` em `toGeminiContents()` ([`LlmRouter.js`](file:///c:/Users/edini/Desktop/vnext/core/ai/LlmRouter.js#L127-L180)), eliminando os erros HTTP `400 Function call is missing a thought_signature in functionCall parts` durante chamadas multi-turno com tools como `create_order` em `gemini-3-flash-preview`, `gemini-flash-lite-latest`, `gemini-3.5-flash` e `gemini-3.5-flash-lite`.
  * Adicionada rota de diagnóstico `POST /api/v1/ai/test` e exposição de `llm` / `circuitBreakers` em `GET /api/v1/readiness`.
* **Detecção Determinística Híbrida + Aviso Educado na 2ª Mensagem** — [`AgentEngine.js`](file:///c:/Users/edini/Desktop/vnext/core/ai/AgentEngine.js#L270-L295):
  * Implementada `analyzeCatalogOfferings(catalogItems)` para classificar deterministicamente o catálogo do banco em `HYBRID`, `SERVICES_ONLY`, `PRODUCTS_ONLY` ou `EMPTY`, sem depender da memória da IA.
  * Quando o estabelecimento oferece produtos e serviços simultaneamente (`HYBRID`), a IA recebe diretiva explícita e comunica educadamente ao final da **2ª mensagem** ao cliente sobre qual dos dois deseja informações.
* **Trava Anti-Fluxo Cruzado + Trava "Um por vez" (`MIXED_COMMIT_BLOCKED` / `MIXED_FLOW_BLOCKED`)** — [`AgentEngine.js`](file:///c:/Users/edini/Desktop/vnext/core/ai/AgentEngine.js#L283-L295), [`AtomicOutputGuard.js`](file:///c:/Users/edini/Desktop/vnext/core/ai/AtomicOutputGuard.js#L209-L270):
  * Bloqueio por tipo de item: `book_service` rejeita `PRODUCT` (`WRONG_FLOW_USE_CREATE_ORDER`) e `create_order` rejeita `SERVICE` (`WRONG_FLOW_USE_BOOK_SERVICE`), com validação adicional no SQLite (`OrderService` / `BookingService`).
  * Bloqueio **Um-por-Vez por turno**: `turnCommittedFlow` e `batchMixesCommitFlows` no `AgentEngine` impedem que `book_service` e `create_order` sejam confirmados juntos no mesmo turno (seja no mesmo lote ou em iterações seguintes), retornando `MIXED_COMMIT_BLOCKED` e gravando auditoria `MIXED_FLOW_INTERCEPTED`.
  * No Elo 3 (`AtomicOutputGuard`), qualquer tentativa de confirmar ambos juntos ou após bloqueio `MIXED_COMMIT_BLOCKED` é interceptada com `MIXED_FLOW_BLOCKED`, substituindo a resposta para pedir que o cliente confirme um por vez.

### 2.3 Camada 4 — Mensageria WhatsApp (Baileys), Reconexão e Soft-Pause Isolado
* **Estabilidade Baileys e QR Code** — [`WhatsAppBaileysAdapter.js`](file:///c:/Users/edini/Desktop/vnext/core/messaging/adapters/WhatsAppBaileysAdapter.js), [`ChannelRoutes.js`](file:///c:/Users/edini/Desktop/vnext/core/gateway/routes/ChannelRoutes.js):
  * Limpeza estrita de listeners (`ev.removeAllListeners()`), proteção contra concorrência em `forceResetPairing`, tratamento de `QR refs attempts ended` (transição limpa para `STANDBY` sem loop de reconexão), recuperação de `Bad MAC` preservando metadados da sessão e resolução assíncrona via `waitForQr()`.
* **Soft-Pause Global vs. Individual por Conversa** — [`SessionManager.js`](file:///c:/Users/edini/Desktop/vnext/core/messaging/SessionManager.js#L348-L385), [`PauseController.js`](file:///c:/Users/edini/Desktop/vnext/core/messaging/PauseController.js), [`ConversationRoutes.js`](file:///c:/Users/edini/Desktop/vnext/core/gateway/routes/ConversationRoutes.js):
  * Validação e teste explícito confirmando que **Assumir / Pausar IA** atua estritamente na conversa selecionada (`conversations.is_paused = 1`), mantendo o socket ativo e deixando todas as demais conversas ativas do mesmo parceiro respondendo normalmente via `AgentEngine`.
  * Ao clicar em assumir, o painel também abre `https://wa.me/<digitos>` em nova aba para agilizar a resposta humana, acumulando mensagens recebidas na pausa em `paused_context_json` para continuidade ao retomar.

### 2.4 Camada 5 & 6 — Gateway HTTP, Eliminação de Cache Preso, UI Dark Cyber e Usabilidade
* **Identidade Visual Onda 3 & Onda 4 (Dark Cyber Neon / Glassmorphism)** — [`tokens.css`](file:///c:/Users/edini/Desktop/vnext/app-web/src/theme/tokens.css), [`AuthScreen.js`](file:///c:/Users/edini/Desktop/vnext/app-web/src/components/AuthScreen.js), [`AppShell.js`](file:///c:/Users/edini/Desktop/vnext/app-web/src/shell/AppShell.js), [`WhatsAppQrModal.js`](file:///c:/Users/edini/Desktop/vnext/app-web/src/components/WhatsAppQrModal.js), [`Icons.js`](file:///c:/Users/edini/Desktop/vnext/app-web/src/components/Icons.js):
  * Substituição integral da interface genérica branca pelo tema escuro (`#050810` / `#00a3ff`), inclusive corrigindo as cores legadas (`#f8fafc` / `#0f766e`) que restavam em [`manifest.webmanifest`](file:///c:/Users/edini/Desktop/vnext/app-web/manifest.webmanifest#L7-L8).
* **Fim da necessidade de `Ctrl + Shift + R` (Cache-First -> Network-First + `no-store`)** — [`sw.js`](file:///c:/Users/edini/Desktop/vnext/app-web/sw.js), [`index.html`](file:///c:/Users/edini/Desktop/vnext/app-web/index.html), [`build_web.js`](file:///c:/Users/edini/Desktop/vnext/scripts/build_web.js), [`Server.js`](file:///c:/Users/edini/Desktop/vnext/core/gateway/Server.js#L373-L390):
  * O Service Worker foi migrado de Cache-First (`autonmax-vnext-shell-v2`) para **Network-First** com versionamento automático por hash SHA-256 de build (`autonmax-vnext-shell-<buildId>`), cache-busting `?v=<buildId>` em `tokens.css` e `app.bundle.js`, registro `{ updateViaCache: 'none' }` com recarregamento único em troca de controller, e cabeçalhos HTTP `Cache-Control: no-cache, no-store, must-revalidate` no `GatewayServer`.
* **Nome completo do produto na confirmação/cards de Pedido** — [`OrdersView.js`](file:///c:/Users/edini/Desktop/vnext/app-web/src/views/OrdersView.js#L76-L94):
  * Cards de pedido agora listam cada item com quantidade, **nome completo sem truncamento** (`white-space: normal; word-break: break-word;`) e subtotal em reais.
* **Contagem real nos cards do Dashboard antes de abrir Agenda/Pedidos** — [`bootstrap.js`](file:///c:/Users/edini/Desktop/vnext/app-web/src/bootstrap.js#L16-L23), [`DashboardView.js`](file:///c:/Users/edini/Desktop/vnext/app-web/src/views/DashboardView.js#L273-L280):
  * Corrigido o bug em que o card **Agendamentos Confirmados** mostrava `0` mesmo havendo agendamento gravado (por filtrar apenas `?date=${today}` em UTC). Agora o dashboard consulta `/appointments` e `/orders`, conta todos os registros `CONFIRMED` gravados (`Confirmados gravados: X`), e usa data local (`getLocalDateStr()`) para o recorte `(Y hoje)`.
* **Alternância `Ver Mensagens` / `Ocultar Mensagens` e troca entre cards** — [`ConversationsView.js`](file:///c:/Users/edini/Desktop/vnext/app-web/src/views/ConversationsView.js#L50-L79), [`bootstrap.js`](file:///c:/Users/edini/Desktop/vnext/app-web/src/bootstrap.js#L883-L902):
  * Clicar novamente no card aberto recolhe o painel de histórico e volta o botão para **Ver Mensagens**; enquanto aberto, o botão exibe **Ocultar Mensagens** (também presente no cabeçalho do histórico); clicar em outro card fecha automaticamente o anterior e abre o novo.

---

## 3. Evidências de Validação em Runtime (Testes Automatizados + Operação Humana)

Todas as melhorias e correções descritas acima foram **aplicadas e validadas em runtime**, combinando:

1. **Validação Automatizada Contínua (`npm run verify`):**
   * `[verify 1/4] PromptPin OK (sha256=f63c0d56c7f136c0...)` — integridade inviolável do prompt base preservada.
   * `[verify 2/4] Static Boundary Audit OK (49 core files checked)` — zero dependências proibidas, zero SQL fora de repositórios/migrations e zero hex/fonte fixa hardcoded em `views/` e `components/`.
   * `[verify 3/4] Web Build OK (24 files -> app-web/dist)` — bundle browser e Service Worker atualizados com hash de build.
   * `[verify 4/4] Layers 1..6 contract test suite` — **49/49 testes aprovados** (`0 falhas`, `0 ignorados`, `exit code 0`).
2. **Validação Live Runtime End-to-End (`bootstrap()` + HTTP Gateway + SQLite + SessionManager + AgentEngine + UI):**
   * Boot real com servidor HTTP ativo (`/health` 200 OK, `/api/v1/readiness` `READY`, cabeçalhos `Cache-Control: no-cache, no-store, must-revalidate` em `/` e `/sw.js`), salvamento integral de perfil PME (textos, logo, PDFs e imagens), criação de produto digital sem estoque (`track_stock: 0, stock_quantity: null`), produto físico com estoque (`track_stock: 1, stock_quantity: 25`), serviço, agendamento futuro + pedido + geração real de PDFs (`application/pdf`), detecção híbrida na 2ª mensagem, bloqueio `MIXED_COMMIT_BLOCKED` com zero commits mistos e Soft-Pause isolado por conversa.
3. **Testes Reais por Operador Humano em Ambiente Real (sessão atual):**
   * Execução real pelo operador usando **WhatsApp + API Gemini** validando criação de pedidos reais (identificando e permitindo corrigir em runtime os erros reais `404` de `gemini-2.5-flash`, `503` em `gemini-flash-latest` e `400 Function call is missing a thought_signature` em `create_order`), verificação real no navegador do card de pedido sem nome completo, carregamento em cache antigo até `Ctrl+Shift+R`, card do dashboard exibindo `0` com `1` agendamento gravado, modal de conversas sem botão de recolher e confirmação do isolamento de pausa por conversa e trava um-por-vez.

> **Conclusão:** Todas as melhorias e correções pós-destilação encontram-se consolidadas no código-fonte, com cobertura de regressão em todas as 6 camadas e evidências completas registradas no relatório paralelo [`RELATORIO_E2E_ESTADO_ATUAL_VNEXT.md`](file:///c:/Users/edini/Desktop/vnext/RELATORIO_E2E_ESTADO_ATUAL_VNEXT.md).
