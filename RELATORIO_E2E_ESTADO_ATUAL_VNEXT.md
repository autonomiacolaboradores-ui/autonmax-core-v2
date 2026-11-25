# Relatório End-to-End e Estado Atual — AUTON.MAX vNext

**Data da execução:** 24/11/2026 (22:13–22:14 BRT / 2026-11-25T01:14Z)  
**Versão do pacote:** `autonmax-vnext@4.0.0-vnext` (`node >= 24.0.0`, Node executado: `v24.19.0`)  
**Comando oficial de verificação:** `npm run verify` (`node scripts/verify.js`)  
**Status Final:** **APROVADO (`exit 0` — 49/49 testes passando em 6 suítes, 0 falhas, 0 ignorados)**

---

## 1. Resumo Executivo do Estado Atual

O **AUTON.MAX vNext** está íntegro, compilado (`app-web/dist`, 24 arquivos) e validado de ponta a ponta em todas as suas 6 camadas arquiteturais:

| Camada / Gate | Escopo Validado | Resultado Observado | Tempo |
| :--- | :--- | :--- | :--- |
| **Gate 1 — PromptPin** | SHA-256 do prompt base [`pme_base.v1.md`](file:///c:/Users/edini/Desktop/vnext/core/prompts/pme_base.v1.md) | `MATCH` (`f63c0d56c7f136c0...`) | Instantâneo |
| **Gate 2 — Static Boundary Audit** | Dependências proibidas, SQL fora de repo/migration, higiene UI | `OK` (**49 arquivos core** auditados) | Instantâneo |
| **Gate 3 — Web Build** | Empacotamento SPA/PWA + hash no `sw.js` e `index.html` | `OK` (**24 arquivos** -> `app-web/dist`) | Instantâneo |
| **Layer 1 — Foundation & SQLite** | Migrations 001–003, `idx_appointments_unique_slot`, soft-delete, `LifecycleManager`, multi-tenant | **6/6 PASS** | `838.87 ms` |
| **Layer 2 — Domínio PME (Elos 1 e 2)** | Desambiguação `SERVICE` vs `PRODUCT`, preço do SQLite em centavos, `version_hash`, idempotência, sobreposição, CRM e `PdfService` | **6/6 PASS** | `130.36 ms` |
| **Layer 3 — Motor Agêntico (Elo 3) & Voz** | Anti-bug fantasma, recibo determinístico, anti-alucinação financeira, `AbortController` + failover, tokens, `PromptPin`, STT fallback, `LlmRouter`, híbrido + 2ª msg, trava Um-por-Vez (`MIXED_COMMIT_BLOCKED`) | **10/10 PASS** | `562.07 ms` |
| **Layer 4 — Mensageria Baileys & Fila** | Debouncer, idempotência pós-commit, Soft-Pause isolado + multi-conversa ativa, caminhos NTFS Windows, QR `#000000`, `Bad MAC`, `forceResetPairing`, Soft-Pause global | **9/9 PASS** | `845.29 ms` |
| **Layer 5 — Gateway REST, SSE & Boot E2E** | Auth JWT 401/isenções, E2E Agendamento + PDF, E2E Pedido + PDF, Painel de Chaves, idempotência offline, 409, HMAC, `bin/start.js`, `SERVE_STATIC_UI=true` + `no-store`, E2E Salvar PME completo (logo, PDFs, imagens) | **7/7 PASS** | `3236.56 ms` |
| **Layer 6 — SPA/PWA Offline-First & Deploy** | `SyncQueue` FIFO offline, conflito `409`, Blueprints Render, Android Manifest/Gradle, `FrontendInitConfig`, higiene estática, Onda 3 (`AuthScreen`/`AppShell`/`WhatsAppQrModal`), Onda 4 (`Dashboard`/`Catalog`/`Orders`/`Conversations` + toggle mensagens), E2E Produto c/ interruptor de estoque & Serviço | **11/11 PASS** | `90.95 ms` |
| **TOTAL DA SUÍTE** | **6 suítes / 49 testes de contrato + E2E** | **49 PASS / 0 FAIL** | **`3539.41 ms`** |

---

## 2. Log Completo da Execução Oficial (`npm run verify`)

```text
> autonmax-vnext@4.0.0-vnext verify
> node scripts/verify.js

[verify 1/4] PromptPin OK (sha256=f63c0d56c7f136c0...)
[verify 2/4] Static Boundary Audit OK (49 core files checked)
[verify 3/4] Web Build OK (24 files -> app-web/dist)
[verify 4/4] Running Layers 1..6 contract test suite...
▶ Layer 1 — Foundation, SQLite Storage & LifecycleManager
  ✔ 1. Migrations limpas em :memory: e em arquivo temporário com PRAGMAs obrigatórios (360.7465ms)
  ✔ 2. Constraint de concorrência (double-booking): falha atômica em idx_appointments_unique_slot (21.3025ms)
  ✔ 3. Preservação por Soft-delete: alteração e desativação de catálogo preservam histórico (41.3978ms)
  ✔ 4. Encerramento limpo: LifecycleManager fecha recursos em ordem inversa sem travar (394.3078ms)
  ✔ 5. Contrato completo dos Repositórios: Auth, Customers, Conversations, Queue e Audit/Integrations (9.7391ms)
  ✔ 6. Isolamento multi-tenant por partner_id e parametrização de DB_PATH (8.0895ms)
✔ Layer 1 — Foundation, SQLite Storage & LifecycleManager (838.8679ms)
▶ Layer 2 — Domínio PME & Trava Atômica (Elo 1 e Elo 2)
  ✔ 1. Desambiguação de Tipo (Elo 1): tentar agendar PRODUCT falha e não grava no banco (20.9826ms)
  ✔ 2. Preço Autorizativo do Banco (Elo 2): OrderService ignora preço externo e calcula em centavos do SQLite (8.9678ms)
  ✔ 3. Integridade do version_hash: atualização de nome, descrição, duração ou preço recalcula SHA-256 (8.7696ms)
  ✔ 4. Idempotência de Operação: mesma idempotencyKey retorna registro existente sem duplicar (50.3301ms)
  ✔ 5. Bloqueio de Sobreposição por Duração: 60 min às 10:00 bloqueia 10:30 atomicamente (16.9903ms)
  ✔ 6. Normalização PT-BR, CustomerService CRM e PdfService nativo sem Puppeteer (20.7568ms)
✔ Layer 2 — Domínio PME & Trava Atômica (Elo 1 e Elo 2) (130.3569ms)
▶ Layer 3 — Motor Agêntico, Trava Atômica (Elo 3) & VoiceAdapter
  ✔ 1. Bloqueio de Bug Fantasma (Elo 3): LLM afirma confirmação sem chamar book_service -> interceptado (29.4867ms)
  ✔ 2. Confirmação Determinística (Elo 3): book_service grava no SQLite e anexa recibo oficial (60.0394ms)
  ✔ 3. Interceptação de Alucinação Financeira: LLM cita R$ 10,00 para item de R$ 50,00 -> barrado (9.3872ms)
[AI_ROUTER] FAIL provider=groq model=openai/gpt-oss-120b status=ERR reason=TIMEOUT (40ms)
[AI_ROUTER] OK provider=xai model=grok-2-latest
  ✔ 4. Timeout e Cancelamento Real (AbortController) + Failover entre provedores (59.3991ms)
  ✔ 5. Persistência de Contexto no SQLite e respeito estrito ao teto máximo de tokens (9.387ms)
  ✔ 6. Guarda Anti-Regressão de Prompt (ci_prompt_guard) + PromptPin SHA-256 + InputGuard (7.7649ms)
  ✔ 7. VoiceAdapter (CloudVoiceAdapter fallback STT + TTS off & LocalVoiceAdapter) (311.5202ms)
  ✔ 8. LlmRouter Onda 1: leitura dinâmica de GROQ_API_KEY, fallback intra-Groq em 400 tool_use_failed, getDiagnostics() e contexto PME completo (14.9437ms)
  ✔ 9. Detecção Determinística Híbrida (Serviços + Produtos), Aviso na 2ª Mensagem & Bloqueio Anti-Fluxo Cruzado (47.581ms)
  ✔ 10. Trava Um-Por-Vez (MIXED_COMMIT_BLOCKED): impede confirmar serviço e produto no mesmo turno (8.7456ms)
✔ Layer 3 — Motor Agêntico, Trava Atômica (Elo 3) & VoiceAdapter (562.0725ms)
▶ Layer 4 — Mensageria Resiliente, Debouncer & Fila Anti-Ban
  ✔ 1. Debouncing Eficiente: 3 mensagens rápidas consolidam em 1 única chamada ao AgentEngine (169.2444ms)
  ✔ 2. Idempotência Pós-Commit: falha no AgentEngine NÃO grava processed_events, permitindo reprocessamento (166.9738ms)
  ✔ 3. Comportamento em Soft-Pause: não aciona AgentEngine e acumula em paused_context_json (81.5485ms)
  ✔ 4. Sanitização de Caminhos no Windows: pme:usr_1:line_1 gera caminho sem ":" e valida limite por parceiro (15.7573ms)
  ✔ 5. Fallback em Transcrição de Áudio + WhatsAppBaileysAdapter (QR #000000, removeAllListeners, anti-loop) (102.602ms)
  ✔ 6. QR refs attempts ended -> STANDBY sem loop de reconexão (67.218ms)
  ✔ 7. Bad MAC purga credenciais do authDir preservando metadados e agenda reconexão limpa (78.8865ms)
  ✔ 8. forceResetPairing protege contra concorrência e waitForQr resolve ao chegar QR (109.8475ms)
  ✔ 9. Soft-Pause Global via SQLite (partners.is_active = 0) mantém socket, bloqueia AgentEngine e acumula contexto (48.802ms)
✔ Layer 4 — Mensageria Resiliente, Debouncer & Fila Anti-Ban (845.2928ms)
▶ Layer 5 — Gateway REST, Eventos/Webhooks & Boot E2E
  ✔ 1. Proteção de Rotas: rotas protegidas sem credencial retornam 401; /health e /register são isentas (653.1815ms)
  ✔ 2. Fluxo E2E de Agendamento: REST catalog -> Baileys mock -> AgentEngine -> GET /appointments + PDF (619.7077ms)
  ✔ 3. Fluxo E2E de Pedido: REST catalog -> Baileys mock -> AgentEngine -> GET /orders/summary com total_cents do SQLite (376.9146ms)
  ✔ 4. Painel de Chaves (403 FEATURE_DISABLED), Idempotência Offline (X-Idempotency-Key), 409 SLOT_TAKEN e Webhooks HMAC (358.0568ms)
  ✔ 5. Boot oficial (vnext/bin/start.js) + Rotas de Conversa/Soft-Pause + Encerramento limpo via LifecycleManager (431.3161ms)
  ✔ 6. SERVE_STATIC_UI=true serve app-web/dist com fallback SPA e proteção contra path traversal (435.7809ms)
  ✔ 7. E2E Salvar Alterações do Max: persiste TODOS os campos PME, textos puros, logo, PDFs e imagens no SQLite (358.6777ms)
✔ Layer 5 — Gateway REST, Eventos/Webhooks & Boot E2E (3236.5579ms)
▶ Layer 6 — Interface Híbrida Offline-First (SPA/PWA + Capacitor) & Deploy Render
  ✔ 1. Operação Offline + SyncQueue: cria item e cancela agendamento offline e sincroniza em ordem FIFO com X-Idempotency-Key (44.857ms)
  ✔ 2. Reconciliação de Conflito (409 SLOT_TAKEN): marca CONFLICT sem travar o restante da fila FIFO (3.0129ms)
  ✔ 3. Validação dos Blueprints Render (render.free.yaml & render.starter.yaml) (3.1452ms)
  ✔ 4. Checklist de Segurança Android (Manifest, Network Security Config & Gradle DSL) (3.6288ms)
  ✔ 5. Separação Casca vs. Miolo & Configuração (FrontendInitConfig: shell_enabled & ui_mode) (2.7059ms)
  ✔ 6. Higiene Estática: zero cores hex hardcoded, zero fontes fixas e zero @capacitor/indexedDB em views/ e components/ (3.2723ms)
  ✔ 7. Slots Injetáveis (OutputActions) & Ergonomia Mobile-First em tokens.css (2.192ms)
  ✔ 8. Identidade Visual Onda 3: AuthScreen, AppShell Executivo & WhatsAppQrModal (1.7635ms)
  ✔ 9. Onda 4 Views Completas: DashboardView PME, CatalogView (Serviços/Produtos), Appointments/Orders por Dia & ConversationsView (3.4988ms)
  ✔ 10. E2E Produto Fictício + Interruptor de Estoque (Ilimitado para Software vs Controlado) persiste no SQLite e exibe na seção de Produtos (14.385ms)
  ✔ 11. E2E Serviço Fictício: criação, persistência no SQLite e exibição na seção de Serviços (4.7208ms)
✔ Layer 6 — Interface Híbrida Offline-First (SPA/PWA + Capacitor) & Deploy Render (90.9543ms)
ℹ tests 49
ℹ suites 6
ℹ pass 49
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 3539.4079
[verify] ALL CHECKS AND TESTS PASSED (exit 0)
```

---

## 3. Evidência de Execução Live End-to-End em Runtime (`bootstrap()`)

Além da suíte `npm run verify`, foi executado um fluxo live integrado via [`bin/start.js`](file:///c:/Users/edini/Desktop/vnext/bin/start.js) (`bootstrap()`) em ambiente temporário isolado com `SERVE_STATIC_UI=true`, HTTP Gateway real, SQLite migrations 001–003, `SessionManager`, `AgentEngine` e renderização UI (`FrontendInitConfig`), encerrando com `lifecycle.shutdown()` sem erros (`exit 0`).

### Saída observada do fluxo live E2E:

```json
{
  "health": {
    "ok": true,
    "status": "healthy"
  },
  "staticCacheControl": "no-cache, no-store, must-revalidate",
  "swCacheControl": "no-cache, no-store, must-revalidate",
  "readinessStatus": "READY",
  "promptPin": {
    "status": "MATCH",
    "sha256": "f63c0d56c7f136c0d2f311383d12d67fdfb5f8cb86e3e3287e9b5f85df2ed00a"
  },
  "pmeSaved": {
    "displayName": "E2E Studio Pro",
    "storeSegment": "Software & Consultoria",
    "pdfs": 1,
    "images": 1,
    "hasLogo": true
  },
  "catalog": {
    "serviceId": "cb654a69-ff9c-43c6-9c3f-3a00adb929ed",
    "prodUnlimitedTrackStock": 0,
    "prodUnlimitedQty": null,
    "prodControlledTrackStock": 1,
    "prodControlledQty": 25
  },
  "transactions": {
    "futureApptId": "63626ae3-c301-464c-9c17-d50de19c264e",
    "totalConfirmedAppts": 1,
    "orderId": "79f3f52b-8086-40cb-b513-53942fc09942",
    "orderTotalCents": 19980,
    "totalConfirmedOrders": 1,
    "pdfApptType": "application/pdf",
    "pdfOrdType": "application/pdf"
  },
  "messagingAndLocks": {
    "convA_turn1_ok": true,
    "convA_turn2_hybridNoticeAppended": true,
    "convA_mixedBlockedZeroCommits": true,
    "convA_paused_reply": true,
    "convB_active_notPaused": true
  },
  "uiRendering": {
    "dashboardShowsApptCount": true,
    "ordersShowsFullProductName": true
  }
}
```

---

## 4. Inventário Técnico do Estado Atual

* **Motor de Banco e Domínio:** SQLite nativo (`node:sqlite`, WAL + foreign keys), migrations `001_initial_schema.js`, `002_partner_profile_extensions.js`, `003_catalog_stock_control.js`, travas atômicas de double-booking e preço autorizativo em centavos no servidor.
* **Motor de IA:** [`LlmRouter.js`](file:///c:/Users/edini/Desktop/vnext/core/ai/LlmRouter.js) com provedor primário **Gemini** (`gemini-3-flash-preview` + fallback intra-Gemini e multi-provedor Groq/xAI/OpenAI/OpenRouter, preservação de `thoughtSignature`/`rawParts`), [`PromptPin.js`](file:///c:/Users/edini/Desktop/vnext/core/ai/PromptPin.js) travado em `sha256=f63c0d56c7f136c0...`, detecção determinística `HYBRID`, trava anti-fluxo cruzado e trava Um-por-Vez (`MIXED_COMMIT_BLOCKED` / `MIXED_FLOW_BLOCKED`).
* **Mensageria WhatsApp:** [`WhatsAppBaileysAdapter.js`](file:///c:/Users/edini/Desktop/vnext/core/messaging/adapters/WhatsAppBaileysAdapter.js) + [`SessionManager.js`](file:///c:/Users/edini/Desktop/vnext/core/messaging/SessionManager.js) + [`PauseController.js`](file:///c:/Users/edini/Desktop/vnext/core/messaging/PauseController.js) com debouncer, idempotência pós-commit, Soft-Pause global (`partners.is_active`) e Soft-Pause isolado por conversa (`conversations.is_paused`).
* **Frontend PWA / SPA Offline-First:** Dark Cyber Neon (`tokens.css`), Service Worker Network-First versionado por hash de build (`dist/sw.js` `autonmax-vnext-shell-26d60b1618d2` / build corrente), `SyncQueue` FIFO offline, contagem real de agendamentos/pedidos confirmados no Dashboard, exibição completa do nome do produto em Pedidos e botão alternável `Ver Mensagens` / `Ocultar Mensagens` em Conversas Ativas.
* **Diretório Legado Intocado:** `max_atendente_certificado area de trabalho/` permanece preservado sem modificações.
