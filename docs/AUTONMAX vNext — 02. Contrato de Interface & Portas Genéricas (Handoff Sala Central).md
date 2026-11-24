# **AUTONMAX vNext — 02\. Contrato de Interface & Portas Genéricas (Handoff Sala Central)**

**Finalidade:** Definir rigorosamente as portas de entrada (Comandos/REST API), saídas (Eventos/Webhooks/SSE) e adaptadores plugáveis do motor destilado Autonmax vNext.

Regra de Desacoplamento: Este contrato é 100% agnóstico e editável. Ele NÃO assume como os demais motores verticais da suíte central serão conectados; qualquer sistema externo (CRM, Painel PME, Orquestrador, Disparador ou BI) integra-se exclusivamente através destes contratos.

---

# **1\. Modelo de Integração (Arquitetura Hexagonal)**

O Autonmax vNext opera sobre os princípios da Arquitetura Hexagonal (Ports & Adapters), garantindo desacoplamento total entre o núcleo de execução conversacional/transacional e os meios de transporte externos.

* **Portas de Entrada (Driving Ports):**  
  * **API REST JSON (`/api/v1/*`):** Interface HTTP síncrona padronizada para controle, ingestão, consulta e comando.  
  * **Interface Programática JS (`AutonmaxEngine`):** Classe compilada instanciável diretamente em processo Node.js/TypeScript sem necessidade de subir camada HTTP (ideal para micro-serviços consolidados em monorepo).  
* **Portas de Saída (Driven Ports / Notificações):**  
  * **Webhooks HTTP:** Assinados via HMAC-SHA256 (configuráveis por parceiro ou globalmente) para envio push de mutações de estado e interações.  
  * **Stream SSE (`/api/v1/events/stream`):** Server-Sent Events em tempo real para atualização de dashboards, estados de sessão QR Code e alertas de handoff instantâneos.  
* **Adaptadores Plugáveis (Editáveis):**  
  * `ChannelAdapter`: Abstração de canais de mensageria (WhatsApp via Baileys/Evolution por padrão; expansível para Instagram Direct, Telegram, Webchat).  
  * `VoiceAdapter`: Abstração de síntese (TTS) e transcrição (STT) de áudio (Cloud Free, OpenAI Whisper, Piper local, etc.).  
  * `StorageRepositories`: Abstração de persistência relacional (SQLite por padrão local; PostgreSQL para escala distribuída).  
  * `OptionalToolPlugin`: Extensões funcionais isoladas (Google Calendar, WebSearch, Webhooks sob demanda da suíte).

---

# **2\. Segurança, Autenticação e Regras Transversais de API**

## **2.1 Autenticação e Middleware Global**

Todas as rotas sob o prefixo `/api/v1/*` (com exceção das rotas públicas `/health`, `/api/v1/auth/register` e `/api/v1/auth/login`) exigem obrigatoriamente a presença de credenciais válidas. A autenticação aceita dois formatos no cabeçalho HTTP:

* **Sessão de Usuário / Painel:** `Authorization: Bearer <jwt_token>`  
* **Integração Server-to-Server (Suíte Central):** `x-api-key: <INTERNAL_API_KEY>`

## **2.2 Política de Segredos e Verificação Criptográfica**

* **Zero Segredo Hardcoded:** As variáveis `JWT_SECRET` e `WEBHOOK_SIGNING_SECRET` são estritamente obrigatórias. Quando `NODE_ENV=production`, o processo encerra imediatamente o boot (`process.exit(1)`) caso qualquer uma dessas chaves não esteja definida.  
* **Comparação em Tempo Constante:** Toda validação de assinaturas HMAC ou tokens de API utiliza estritamente `crypto.timingSafeEqual` para mitigar ataques de análise de tempo (timing attacks).

## **2.3 Restrições de CORS e Payload**

* **CORS Estrito:** Configurado estritamente via lista branca através da variável `CORS_ALLOWED_ORIGINS`. O uso de wildcard `Access-Control-Allow-Origin: *` é proibido em ambientes de produção.  
* **Limites de Payload:** Aplicados via middleware global centralizado. O limite padrão para requisições JSON é de **2 MiB**. Um limite expandido de **15 MiB** é liberado exclusivamente em rotas rotuladas para upload de documentos e mídias. Validações de schema retornam imediatamente `400 Bad Request`.  
* **Idempotência de Sincronização Offline (`X-Idempotency-Key`):** Todas as rotas mutáveis (`POST`, `PUT`, `DELETE`) aceitam o cabeçalho `X-Idempotency-Key: <uuid>` (obrigatório para replay da `sync_queue` do cliente Offline-First SPA/APK). Requisições repetidas com a mesma chave retornam a resposta original sem duplicar registros; conflitos de estado (ex: horário já ocupado) retornam `409 Conflict` com código semântico (`SLOT_TAKEN`, `VERSION_MISMATCH`).

## **2.4 Envelope Padrão de Resposta**

### **Resposta de Sucesso (HTTP 200 / 201\)**

```
{
  "ok": true,
  "data": {
    "appointmentId": "apt_89f2a4",
    "dateStr": "2026-11-22",
    "timeSlot": "14:00"
  },
  "meta": {
    "requestId": "req_c9a18f2d-4512",
    "timestamp": "2026-11-22T03:14:07.102Z"
  }
}
```

### **Resposta de Erro (HTTP 4xx / 5xx)**

```
{
  "ok": false,
  "error": {
    "code": "SLOT_TAKEN",
    "message": "O horário selecionado não está mais disponível para agendamento.",
    "details": {

      "dateStr": "2026-11-22",

      "timeSlot": "14:00",
      "conflictingAppointmentId": "apt_77d1b3"
    }
  },
  "meta": {
    "requestId": "req_e0129a7c-8811",
    "timestamp": "2026-11-22T03:14:07.105Z"
  }
}
```

---

# **3\. Catálogo de Comandos (API REST `/api/v1/*`)**

## **3.1 Saúde e Observabilidade**

| Método | Rota | Auth | Descrição / Contrato |
| :---- | :---- | :---- | :---- |
| `GET` | `/health` | Isento | **Liveness Probe.** Retorna HTTP 200 `{ "ok": true, "status": "healthy" }`. |
| `GET` | `/api/v1/readiness` | API Key / Bearer | **Readiness Probe.** Avalia saúde de infraestrutura: SQLite, PromptPin SHA-256, sessões ativas, fila outbox e circuit breakers. |

### **Exemplo de Resposta: `GET /api/v1/readiness`**

```
{
  "ok": true,
  "data": {
    "status": "READY",
    "checks": {

      "database": { "status": "UP", "driver": "node:sqlite", "latencyMs": 1.2 },
      "promptPin": { "status": "MATCH", "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
      "outboxQueue": { "status": "HEALTHY", "pendingMessages": 0 },
      "circuitBreakers": {
        "groq": "CLOSED",
        "openai": "CLOSED"
      }
    }
  },
  "meta": { "requestId": "req_001", "timestamp": "2026-11-22T03:00:00.000Z" }
}
```

## **3.2 Identidade & Configuração do Parceiro (PME)**

| Método | Rota | Auth | Descrição / Contrato |
| :---- | :---- | :---- | :---- |
| `POST` | `/api/v1/auth/register` | Isento | Cadastro inicial de parceiro (PME). Retorna dados do parceiro e token de acesso. |
| `POST` | `/api/v1/auth/login` | Isento | Autenticação via e-mail e senha. Retorna JWT Bearer token. |
| `GET` | `/api/v1/auth/session` | Bearer | Valida token atual e retorna dados da sessão ativa. |
| `GET` | `/api/v1/partners/:partnerId/config` | API Key / Bearer | Recupera configurações completas de atendimento e regras de negócio do parceiro. |
| `PUT` | `/api/v1/partners/:partnerId/config` | API Key / Bearer | Atualiza parâmetros de comportamento, prompts e políticas do parceiro. |

### **Payload de Entrada: `PUT /api/v1/partners/:partnerId/config`**

```
{
  "name": "Barbearia Silva vNext",
  "personalityPrompt": "Você é um assistente virtual cortês e objetivo da Barbearia Silva.",

  "welcomeMessage": "Olá! Seja bem-vindo à Barbearia Silva. Como posso te ajudar hoje?",
  "ownerJid": "5511999999999@s.whatsapp.net",
  "pdfFiles": [],
  "imageFiles": [],
  "businessRules": {
    "allowOverbooking": false,
    "maxPendingAppointmentsPerClient": 2,
    "autoConfirmOrders": true
  },
  "businessHours": {
    "timezone": "America/Sao_Paulo",
    "weekly": [
      { "dayOfWeek": 1, "open": "08:00", "close": "18:00" },
      { "dayOfWeek": 2, "open": "08:00", "close": "18:00" },
      { "dayOfWeek": 3, "open": "08:00", "close": "18:00" },
      { "dayOfWeek": 4, "open": "08:00", "close": "18:00" },
      { "dayOfWeek": 5, "open": "08:00", "close": "20:00" },
      { "dayOfWeek": 6, "open": "08:00", "close": "17:00" }
    ]
  },
  "policies": {
    "cancellationWindowHours": 2,
    "refundPolicyText": "Cancelamentos com menos de 2h de antecedência não reembolsam sinal."
  },
  "activeStatus": "ACTIVE"
}
```

## **3.3 Catálogo Canônico (Alimenta a Trava Atômica)**

| Método | Rota | Auth | Descrição / Contrato |
| :---- | :---- | :---- | :---- |
| `GET` | `/api/v1/partners/:partnerId/catalog` | API Key / Bearer | Lista itens do catálogo com filtro opcional `?type=SERVICE|PRODUCT`. |
| `POST` | `/api/v1/partners/:partnerId/catalog` | API Key / Bearer | Cria um item de catálogo e gera seu `version_hash` SHA-256 automaticamente. |
| `PUT` | `/api/v1/partners/:partnerId/catalog/:itemId` | API Key / Bearer | Atualiza o item e recalcula seu `version_hash`. |
| `DELETE` | `/api/v1/partners/:partnerId/catalog/:itemId` | API Key / Bearer | Soft-delete do item (`active = 0`), preservando integridade histórica dos snapshots. |

### **Payload de Entrada: `POST /api/v1/partners/:partnerId/catalog`**

```
{
  "name": "Corte de Cabelo Masculino",
  "type": "SERVICE",
  "priceCents": 5000,
  "durationMinutes": 30,
  "description": "Corte moderno com lavagem inclusa."
}
```

### **Resposta de Sucesso: `POST /api/v1/partners/:partnerId/catalog`**

```
{
  "ok": true,
  "data": {
    "itemId": "itm_c78a91",
    "partnerId": "prt_123",
    "name": "Corte de Cabelo Masculino",
    "type": "SERVICE",
    "priceCents": 5000,
    "durationMinutes": 30,
    "versionHash": "a9f8b2c4e1d305681a9c1e7f609e2b4c102a394857610c128374659102938475",
    "active": 1,
    "createdAt": "2026-11-22T03:00:00.000Z"
  },
  "meta": { "requestId": "req_cat_01", "timestamp": "2026-11-22T03:00:00.000Z" }
}
```

## **3.4 Agendamentos & Pedidos (Fonte Única SQLite)**

| Método | Rota | Auth | Descrição / Contrato |
| :---- | :---- | :---- | :---- |
| `GET` | `/api/v1/partners/:partnerId/appointments` | API Key / Bearer | Lista agendamentos filtrados por query (`?date=YYYY-MM-DD&status=CONFIRMED`). |
| `GET` | `/api/v1/partners/:partnerId/appointments/summary` | API Key / Bearer | Retorna consolidados diários/mensais para dashboards. |
| `POST` | `/api/v1/partners/:partnerId/appointments` | API Key / Bearer | Cria agendamento direto com trava atômica de slot. |
| `POST` | `/api/v1/partners/:partnerId/appointments/:id/cancel` | API Key / Bearer | Cancela agendamento e libera slot no SQLite. |
| `GET` | `/api/v1/partners/:partnerId/appointments/pdf` | API Key / Bearer | Gera relatório PDF binário com a agenda do dia (`?date=YYYY-MM-DD`). |
| `GET` | `/api/v1/partners/:partnerId/orders` | API Key / Bearer | Lista pedidos de produtos (`?date=YYYY-MM-DD&status=CONFIRMED`). |
| `GET` | `/api/v1/partners/:partnerId/orders/summary` | API Key / Bearer | Resumo financeiro e quantitativo de pedidos. |
| `POST` | `/api/v1/partners/:partnerId/orders/:id/cancel` | API Key / Bearer | Cancela pedido e atualiza status no SQLite. |
| `GET` | `/api/v1/partners/:partnerId/orders/pdf` | API Key / Bearer | Gera PDF consolidado de pedidos do dia (`?date=YYYY-MM-DD`). |

### **Payload de Entrada: `POST /api/v1/partners/:partnerId/appointments`**

```
{
  "clientPhone": "5511999998888",
  "clientName": "Carlos Eduardo",
  "itemId": "itm_c78a91",
  "itemVersionHash": "a9f8b2c4e1d305681a9c1e7f609e2b4c102a394857610c128374659102938475",

  "dateStr": "2026-11-25",

  "timeSlot": "14:00"
}
```

## **3.5 Canais, Sessões WhatsApp & Controle de Handoff**

| Método | Rota | Auth | Descrição / Contrato |
| :---- | :---- | :---- | :---- |
| `GET` | `/api/v1/channels/sessions` | API Key / Bearer | Lista status de todas as sessões ativas de mensageria. |
| `POST` | `/api/v1/channels/sessions` | API Key / Bearer | Inicializa uma nova sessão isolada para um determinado `partnerId` e `lineId`. |
| `GET` | `/api/v1/channels/sessions/:sessionKey/qr` | API Key / Bearer | Retorna a imagem base64 do QR Code em `#000000` e seu estado atual. |
| `POST` | `/api/v1/channels/sessions/:sessionKey/disconnect` | API Key / Bearer | Encerra e desvincula a sessão remota no adaptador de canal. |
| `POST` | `/api/v1/channels/sessions/:sessionKey/send` | API Key / Bearer | Envio direto de mensagem injetado na `outbox_queue` com proteção anti-ban. |
| `GET` | `/api/v1/partners/:partnerId/conversations` | API Key / Bearer | Recupera chats ordenados pela data da última mensagem enviada/recebida. |
| `GET` | `/api/v1/partners/:partnerId/conversations/:conversationId/messages` | API Key / Bearer | Retorna histórico paginado de mensagens armazenadas. |
| `POST` | `/api/v1/partners/:partnerId/conversations/:conversationId/pause` | API Key / Bearer | Altera estado de soft-pause da IA na conversa (`{ "paused": true | false }`). |
| `POST` | `/api/v1/partners/:partnerId/conversations/:conversationId/operator-message` | API Key / Bearer | Dispara mensagem enviada por operador humano e registra contexto de intervenção. |

## **3.6 Painel de Chaves / Feature Flags (Vertical Puro & Composição de Bundles)**

Regra de fronteira: O motor opera 100% autônomo como **Vertical Puro**. A Sala de Arquitetura Central utiliza estas chaves (junto com REST e Webhooks) para compor bundles comerciais futuros (ex: Vertical Puro, PME Básico, PME Avançado) sem nenhum acoplamento de grafo no código do Autonmax.

| Método | Rota | Auth | Descrição / Contrato |
| :---- | :---- | :---- | :---- |
| `GET` | `/api/v1/partners/:partnerId/features` | API Key / Bearer | Retorna o estado efetivo das chaves do parceiro combinando defaults globais e overrides do parceiro. |
| `PUT` | `/api/v1/partners/:partnerId/features` | API Key / Bearer | Ativa ou desativa módulos dinamicamente. |

### **Exemplo de Payload das Feature Flags:**

```
{
  "bookings": true,
  "orders": true,
  "voiceStt": true,
  "voiceTts": false,
  "googleCalendar": false,
  "webhooks": false,
  "softPause": true,
  "ownerCommands": true
}
```

---

# **4\. Catálogo de Eventos de Saída (Webhooks & SSE)**

Todos os eventos de saída transmitidos via Webhook HTTP POST possuem o cabeçalho HTTP de verificação `X-Autonmax-Signature: sha256=<hmac_hex>`, calculado sobre o body raw utilizando o `WEBHOOK_SIGNING_SECRET`.

## **Envelope Padrão de Evento**

```
{
  "eventId": "evt_99b1a8f2-3341-4a2e-8b10",
  "eventType": "appointment.confirmed",
  "partnerId": "prt_123",
  "timestamp": "2026-11-22T03:00:00.000Z",
  "payload": {
    "appointmentId": "apt_89f2a4",
    "client": {
      "phone": "5511999998888",
      "name": "Carlos Eduardo"
    },
    "item": {
      "itemId": "itm_c78a91",
      "name": "Corte de Cabelo Masculino",
      "priceCents": 5000,
      "versionHash": "a9f8b2c4e1d305681a9c1e7f609e2b4c102a394857610c128374659102938475"
    },
    "slot": {

      "dateStr": "2026-11-25",

      "timeSlot": "14:00",

      "durationMinutes": 30,
      "timezone": "America/Sao_Paulo"
    }
  }
}
```

## **Eventos Disparados pelo Sistema**

| Evento | Origem | Descrição da Carga (Payload) |
| :---- | :---- | :---- |
| `channel.qr_updated` | Canal | Novo QR Code gerado para pareamento (`{ sessionKey, qrCodeBase64, status }`). |
| `channel.connection_changed` | Canal | Transição de estado (`PAIRING_READY`, `CONNECTED`, `RECONNECTING`, `STANDBY`, `DISCONNECTED`). |
| `message.received` | Conversa | Mensagem de entrada normalizada (texto, áudio transcrito, imagem ou documento). |
| `message.sent` | Outbox | Confirmação de mensagem entregue com sucesso pela fila anti-ban. |
| `appointment.confirmed` | Core | Agendamento gravado e travado com sucesso no SQLite. |
| `appointment.cancelled` | Core | Agendamento cancelado com liberação de horário na agenda. |
| `order.confirmed` | Core | Pedido de produto confirmado com cálculo final em centavos. |
| `order.cancelled` | Core | Pedido de produto cancelado e estornado no estado local. |
| `conversation.handoff_requested` | IA / Guard | Transição para atendimento humano (solicitado pelo cliente, pela IA ou por estouro de loop). |
| `conversation.pause_changed` | Operador | Soft-pause alternado (`{ conversationId, paused: true | false, actor: "operator" | "system" }`). |
| `system.guard_triggered` | Security | O `AtomicOutputGuard` interceptou tentativa de alucinação de preço ou confirmação fantasma. |

---

# **5\. Contratos dos Adaptadores Genéricos (Interfaces Editáveis)**

As definições das interfaces em TypeScript/JSDoc devem ser estritamente respeitadas por qualquer implementação concreta dos adaptadores.

## **5.1 Interface `ChannelAdapter`**

```
/**
 * Adaptador Genérico de Canal de Mensageria.
 */
export interface ChannelAdapter {
  /** Inicializa o cliente de conexão do canal */
  connect(sessionKey: string): Promise<void>;

  /** Encerra a conexão da sessão */
  disconnect(sessionKey: string): Promise<void>;

  /** Retorna o status atual da conexão */
  getStatus(sessionKey: string): Promise<'DISCONNECTED' | 'PAIRING_READY' | 'CONNECTED' | 'RECONNECTING'>;

  /** Retorna o payload base64 do QR Code para conexão se aplicável */
  getQr(sessionKey: string): Promise<{ qrBase64: string; rawText: string } | null>;

  /** Envia uma mensagem estruturada respeitando o outbox */
  sendMessage(
    sessionKey: string,
    recipientId: string,
    payload: { text?: string; mediaUrl?: string; type: 'text' | 'image' | 'audio' | 'document' }
  ): Promise<{ messageId: string; timestamp: string }>;

  /** Atualiza o estado de presença (digitando, gravando áudio) */
  sendPresence(sessionKey: string, recipientId: string, state: 'composing' | 'recording' | 'paused'): Promise<void>;

  /** Registra o callback de escuta de mensagens recebidas */
  onMessage(handler: (event: IncomingMessageEvent) => Promise<void>): void;
}
```

## **5.2 Interface `VoiceAdapter`**

```
/**
 * Adaptador Genérico de Transcrição e Síntese de Áudio.
 */
export interface VoiceAdapter {
  /** Transcreve um buffer de áudio em texto */
  transcribe(
    buffer: Buffer,
    mimeType: string
  ): Promise<{
    ok: boolean;
    text: string;
    provider: string;
    fallbackMessage?: string;
  }>;

  /** Sintetiza texto em um buffer de áudio (formato OGG/Opus recomendado) */
  synthesize(
    text: string,
    options?: { voiceId?: string; speed?: number }
  ): Promise<{
    ok: boolean;
    buffer: Buffer;
    mimeType: 'audio/ogg; codecs=opus' | 'audio/mp3';
  }>;
}
```

## **5.3 Interface `OptionalToolPlugin`**

```
/**
 * Interface para ferramentas externas estendidas executadas pela IA.
 */
export interface OptionalToolPlugin {
  /** Nome identificador da ferramenta */
  name: string;

  /** Descrição clara da utilidade para o LLM */
  description: string;

  /** Schema JSON dos parâmetros aceitos */
  parametersSchema: Record<string, any>;

  /** Função de execução isolada com suporte a contexto da chamada */
  execute(
    args: Record<string, any>,
    context: { partnerId: string; conversationId: string; requestId: string }
  ): Promise<{ ok: boolean; result: any; error?: string }>;
}
```

## **5.4 Contrato de Montagem de Frontend (`FrontendInitConfig`, `EnvironmentPorts` & `OutputActions`)**

Este contrato garante que a Sala de Arquitetura Central possa embutir apenas o Miolo (Views) do Autonmax em qualquer menu unificado sem reescrever telas e mantendo total liberdade tecnológica de framework/CSS/empacotador.

```ts
export interface FrontendInitConfig {
  /** true = Vertical Puro (exibe Casca/navegação própria); false = embutido no host externo (apenas Miolo) */
  shell_enabled: boolean;
  /** Alterna entre fluxo simplificado/guiado e completo/avançado no mesmo código-fonte */
  ui_mode: 'guided' | 'advanced';
  /** Feature flags ativas do parceiro (alinhadas à Seção 3.6) */
  feature_flags: Record<string, boolean>;
  /** Tokens semânticos CSS injetáveis em tempo de execução (White-Label / Tema unificado) */
  theme_tokens?: Partial<{
    surfaceBg: string;
    surfaceCard: string;
    surfaceBorder: string;
    colorPrimary: string;
    colorText: string;
    colorTextMuted: string;
    colorSuccess: string;
    colorWarning: string;
    colorDanger: string;
    fontSans: string;
    fontHeading: string;
    brandName: string;
    brandLogoUrl: string;
  }>;
  /** Slots de ações de saída injetáveis; se omitidos, executam ação local padrão */
  output_actions?: Partial<{
    exportAppointmentsPdf: (payload: { partnerId: string; dateStr: string; items: unknown[] }) => Promise<void>;
    exportOrdersPdf: (payload: { partnerId: string; dateStr: string; items: unknown[] }) => Promise<void>;
    shareReceipt: (payload: { type: 'appointment' | 'order'; id: string; text: string }) => Promise<void>;
    sendOperatorMessage: (payload: { conversationId: string; text: string }) => Promise<void>;
    exportCatalogData: (payload: { partnerId: string; items: unknown[]; format: 'json' | 'csv' }) => Promise<void>;
  }>;
  /** Portas de ambiente abstratas (storage, network, filesystem, secureAuth, clipboard, share, camera) */
  environment_ports?: Record<string, unknown>;
}
```

---

---

# **6\. Matriz de Variáveis de Ambiente (`.env.example` Limpo)**

| Categoria | Chave .env | Obrigatório | Padrão | Descrição |
| :---- | :---- | :---- | :---- | :---- |
| **Infraestrutura** | `PORT` | Sim | `3000` | Porta TCP na qual o servidor HTTP da API REST será aberto. |
|  | `NODE_ENV` | Sim | `development` | Ambiente de execução (`development`, `staging`, `production`). |
|  | `JWT_SECRET` | Sim (Prod) | \- | Segredo para assinatura dos tokens JWT dos parceiros e operadores. |
|  | `INTERNAL_API_KEY` | Sim | \- | Chave de alta prioridade para chamadas Server-to-Server da Sala Central. |
|  | `DB_PATH` | Sim | `./workspace/autonmax.db` | Caminho local do arquivo SQLite (ou String de conexão SQL em adaptadores Postgres). |
|  | `CORS_ALLOWED_ORIGINS` | Sim | `http://localhost:3000` | Domínios autorizados para CORS (separados por vírgula). |
|  | `SESSIONS_DIR` | Sim | `./workspace/sessions` | Diretório de credenciais `baileys_auth` (no Render Starter: `/var/data/sessions`). |
|  | `NODE_OPTIONS` | Sim (Prod) | `--max-old-space-size=384` | Teto de heap V8 obrigatório em containers de 512 MB de RAM (Render Free/Starter) para evitar OOM. |
| **Provedores LLM** | `GROQ_API_KEY` | Não | \- | Chave de API para o provedor Groq (utilizado como LLM primário/fallback rápida). |
|  | `OPENAI_API_KEY` | Não | \- | Chave de API OpenAI (utilizada para modelos GPT e Whisper Cloud). |
|  | `GEMINI_API_KEY` | Não | \- | Chave de API Google Gemini (utilizada para análise multimodal/fallback). |
|  | `XAI_API_KEY` | Não | \- | Chave de API xAI (Grok). |
|  | `OPENROUTER_API_KEY` | Não | \- | Chave OpenRouter para acesso a roteamento unificado de LLMs. |
| **Voz** | `VOICE_STT_DRIVER` | Sim | `cloud` | Driver de transcrição de voz (`cloud`, `local`). |
|  | `VOICE_TTS_DRIVER` | Sim | `off` | Driver de síntese de áudio (`off`, `piper`, `edge`). |
|  | `WHISPER_BIN_PATH` | Não | `/usr/bin/whisper` | Caminho do executável Whisper no sistema local (se driver \= `whisper-local`). |
|  | `PIPER_BIN_PATH` | Não | `/usr/bin/piper` | Caminho do binário Piper TTS no sistema local (se driver \= `piper-local`). |
| **Mensageria** | `DEBOUNCE_WINDOW_MS` | Sim | `2500` | Janela de tempo (ms) para agrupamento de mensagens consecutivas do mesmo cliente (teto máximo: 8000). |
|  | `MAX_LINES_PER_PARTNER` | Sim | `2` | Limite concorrente de linhas/conectores do WhatsApp por parceiro. |
| **Webhooks/Plugins** | `WEBHOOK_TARGET_URL` | Não | \- | Endpoint remoto global para onde os eventos de saída serão notificados via POST. |
|  | `WEBHOOK_SIGNING_SECRET` | Sim (Prod) | \- | Segredo utilizado para assinar o cabeçalho `X-Autonmax-Signature` via HMAC. |
|  | `GOOGLE_CLIENT_ID` | Não | \- | ID de cliente OAuth Google (para plugin opcional `GoogleCalendar`). |
|  | `GOOGLE_CLIENT_SECRET` | Não | \- | Chave secreta OAuth Google (para plugin opcional `GoogleCalendar`). |

