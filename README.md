# AUTONMAX vNext

Motor autônomo de atendimento via WhatsApp com Inteligência Artificial, Trava Atômica de Agendamento/Pedidos sobre SQLite nativo (`node:sqlite`), interface híbrida Offline-First (SPA/PWA + APK Android via Capacitor) e deploy calibrado para containers de 512 MB RAM.

---

## Arquitetura em 6 Camadas

| Camada | Diretório | Responsabilidade |
| :--- | :--- | :--- |
| **1. Fundação & Storage** | `core/storage/`, `core/lifecycle/` | `DatabaseManager` (`node:sqlite` + WAL + PRAGMAs obrigatórios), migrations versionadas (`schema_migrations`), 8 repositórios isolados por `partner_id` e `LifecycleManager` (`SIGINT`/`SIGTERM`). |
| **2. Domínio PME (Elos 1 e 2)** | `core/domain/` | `CatalogService` (`version_hash` SHA-256), `BookingService` (bloqueio de `PRODUCT`, sobreposição de duração, `BEGIN IMMEDIATE`), `OrderService` (preço autorizativo em centavos), `CustomerService`, `PdfService` nativo e `RegionalNormalizer`. |
| **3. Motor Agêntico (Elo 3) & Voz** | `core/ai/`, `core/prompts/` | `PromptPin` (SHA-256 + `ci_prompt_guard`), `InputGuard`, `LlmRouter` (Groq -> xAI -> OpenAI -> Gemini -> OpenRouter com `AbortController`), `AtomicOutputGuard`, `AgentEngine` e `VoiceAdapter` (Cloud/Local). |
| **4. Mensageria Resiliente** | `core/messaging/` | `ChannelAdapter`, `WhatsAppBaileysAdapter`, `SessionManager` (sanitização NTFS + `SESSIONS_DIR`), `MessageDebouncer`, `OutboundQueueWorker` e `PauseController` (Soft-Pause no SQLite). |
| **5. Gateway REST, SSE & Webhooks** | `core/gateway/`, `bin/start.js` | Servidor `node:http` nativo, Auth (`Bearer JWT` / `x-api-key` com `timingSafeEqual`), CORS estrito, Painel de Chaves (`feature_flags`), `X-Idempotency-Key`, SSE e Webhooks HMAC-SHA256. |
| **6. Interface Híbrida & Deploy** | `app-web/`, `android/`, `render.*.yaml` | SPA/PWA Offline-First (`StorageAdapter` + `SyncQueue`), 7 Invariantes Puras de Frontend, empacotamento Android (Capacitor/Kotlin/Gradle) e blueprints Render (`render.free.yaml` / `render.starter.yaml`). |

---

## Pré-requisitos

- **Node.js `>= 24.0.0`** (uso nativo de `node:sqlite`, `node:test`, `fetch`, `AbortController`, `process.loadEnvFile`)
- **npm** (para instalação de `@whiskeysockets/baileys`, `qrcode` e `link-preview-js`)

---

## Configuração Rápida

1. Copie `.env.example` para `.env` e ajuste suas chaves:
   ```bash
   cp .env.example .env
   ```
2. Principais variáveis:
   - `DB_PATH`: caminho do SQLite (padrão `./workspace/autonmax.db`; `/var/data/autonmax.db` no Render Starter)
   - `SESSIONS_DIR`: diretório de credenciais Baileys (padrão `./workspace/sessions`; `/var/data/sessions` no Render Starter)
   - `JWT_SECRET` e `WEBHOOK_SIGNING_SECRET`: obrigatórios quando `NODE_ENV=production`
   - `SERVE_STATIC_UI`: `true` para servir `app-web/dist` diretamente pelo Gateway HTTP
   - `VOICE_STT_DRIVER=cloud` e `VOICE_TTS_DRIVER=off` (recomendado em containers de 512 MB RAM com `NODE_OPTIONS=--max-old-space-size=384`)

---

## Comandos Principais

Execute dentro da pasta `vnext/`:

```bash
# Instalar dependências de produção
npm install

# Gerar build estático da SPA/PWA em app-web/dist
npm run build:web

# Executar auditoria completa + build + suíte de testes das 6 camadas
npm run verify

# Executar apenas a suíte de testes de contrato (Camadas 1 a 6)
npm test

# Iniciar o servidor e o motor de atendimento
npm start
```

---

## Blueprints Oficiais (`docs/`)

- [01. Arquitetura Interna, Schema SQLite & Trava Atômica](./docs/AUTONMAX%20vNext%20%E2%80%94%2001.%20Arquitetura%20Interna,%20Schema%20SQLite%20&%20Trava%20At%C3%B4mica.md)
- [02. Contrato de Interface & Portas Genéricas](./docs/AUTONMAX%20vNext%20%E2%80%94%2002.%20Contrato%20de%20Interface%20&%20Portas%20Gen%C3%A9ricas%20(Handoff%20Sala%20Central).md)
- [03. Manual de Transplante Cirúrgico & Roteiro do Codex](./docs/AUTONMAX%20vNext%20%E2%80%94%2003.%20Manual%20de%20Transplante%20Cir%C3%BArgico%20&%20Roteiro%20do%20Codex.md)
- [04. Arquitetura Híbrida Offline-First (Capacitor) & Deploy Render](./docs/AUTONMAX%20vNext%20%E2%80%94%2004.%20Arquitetura%20H%C3%ADbrida%20Offline-First%20(Capacitor)%20&%20Deploy%20Render.md)
