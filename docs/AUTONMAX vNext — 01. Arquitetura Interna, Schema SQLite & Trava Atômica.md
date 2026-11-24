# **AUTONMAX vNext — 01\. Arquitetura Interna, Schema SQLite & Trava Atômica**

**Status:** Blueprint Oficial (Fase 3 — Motor Destilado)  
**Princípios Inegociáveis:** Zero Frankenstein · 100% Open-Source / Self-Hosted Ready · Node.js 24 (node:sqlite \+ Repository Pattern) · Portas Genéricas (Arquitetura Hexagonal).

---

# **1\. Visão Macro e Topologia dos 5 Blocos Desacoplados**

O motor puro do Autonmax é organizado em 5 camadas com fluxo unidirecional de dependências. Nenhuma camada interna possui conhecimento sobre transporte HTTP ou SDKs de mensageria (ex: Baileys) diretamente.

```
 [ core/gateway ]  --->  REST API / SSE / Webhooks / Auth Middleware / LifecycleManager
        │
        ▼
[ core/messaging ] --->  ChannelAdapter (WhatsApp/Baileys), Debouncer, OutboundQueue, SoftPause
        │
        ▼
    [ core/ai ]    --->  LLMRouter, Function Calling, PromptPin, AtomicOutputGuard, Multimodal
        │
        ▼
  [ core/domain ]  --->  Regras de Negócio Puras, Locks Transacionais, Cálculo exato em Centavos
        │
        ▼
 [ core/storage ]  --->  DatabaseSync (node:sqlite), WAL Mode, Migrations Versionadas, Repositories
```

## **Matriz de Responsabilidades e Regras de Importação**

| Bloco | Responsabilidade Primária | Pode Importar | Proibido Importar |
| :---- | :---- | :---- | :---- |
| `core/storage` | Persistência única (`node:sqlite`), execução de migrations versionadas, isolamento SQL via Repositories. | `node:sqlite`, `node:fs`, `node:path`, utilitários base de hash/crypto. | `core/domain`, `core/ai`, `core/messaging`, `core/gateway`, Baileys, Express/Fastify. |
| `core/domain` | Regras de negócio puras, validação de transações, cálculo financeiro em centavos, modelos de entidade. | `core/storage` (interfaces/repositories), utilitários base. | `core/ai`, `core/messaging`, `core/gateway`, Baileys, clientes HTTP de terceiros. |
| `core/ai` | Roteamento LLM, validação de schemas de tools, guardião de prompts, sanitização e garantias pós-execução. | `core/domain`, `core/storage`, fetch / node:https nativo (zero SDKs externos de LLM). | `core/messaging`, `core/gateway`, Baileys, dependências diretas de I/O de rede de transporte. |
| `core/messaging` | Adaptação de canais de mensageria, gerenciamento de sessões, debouncer de mensagens, fila anti-ban durável. | `core/ai`, `core/domain`, `core/storage`, `@whiskeysockets/baileys`, adaptadores de áudio/imagem. | `core/gateway`, endpoints REST, renderização de UI. |
| `core/gateway` | Exposição de interfaces REST/SSE, recepção de webhooks, autenticação JWT/API-Key, encerramento gracioso. | `core/messaging`, `core/ai`, `core/domain`, `core/storage`, frameworks Web HTTP. | Código de infraestrutura de transporte de terceiros diretamente nos handlers. |

**Nota Cross-Lab (Doc 04):** Para a especificação detalhada da interface cliente SPA/PWA \+ APK Android Offline-First (`StorageAdapter` \+ `sync_queue`) e blueprints de deploy no Render, consulte o **Doc 04** (*AUTONMAX vNext — 04\. Arquitetura Híbrida Offline-First (Capacitor) & Deploy Render*).

---

# **2\. Persistência Unificada: Schema SQLite & Repository Pattern**

## **Diretrizes de Infraestrutura de Dados**

* **Motor:** Execução via `node:sqlite` (`DatabaseSync`). Os caminhos de persistência são parametrizados por ambiente: `DB_PATH` (padrão `./workspace/autonmax.db`; no Render Starter `/var/data/autonmax.db`) e `SESSIONS_DIR` (padrão `./workspace/sessions`; no Render Starter `/var/data/sessions`).  
* **Pragmas Obrigatórios no Boot:**

```
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```

* **Desacoplamento por Repositories:** Consultas SQL são estritamente restritas a arquivos em `core/storage/repositories/` (`PartnerRepository.js`, `AuthRepository.js`, `CatalogRepository.js`, `CustomerRepository.js`, `ConversationRepository.js`, `AppointmentRepository.js`, `OrderRepository.js` e `QueueRepository.js`). A aplicação interage exclusivamente através das interfaces exportadas.  
* **Migrations:** Gerenciadas via scripts no diretório `core/storage/migrations/`, controladas e rastreadas atomicamente na tabela `schema_migrations`.  
* **Sanitização para Windows (NTFS):** Identificadores de sessão ou chaves contendo caracteres reservados (ex: `pme:partner1`) são sanitizados utilizando `replace(/[^a-zA-Z0-9_-]/g, '_')` antes de qualquer interação com o sistema de arquivos local para impedir falhas relacionadas a Alternate Data Streams (ADS).

## **DDL Completo (Schema de Produção)**

```sql
-- Controle de Migrações
CREATE TABLE IF NOT EXISTS schema_migrations (
version INTEGER PRIMARY KEY,
applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

```sql
-- Parceiros / Estabelecimentos
CREATE TABLE IF NOT EXISTS partners (
id TEXT PRIMARY KEY,
email TEXT UNIQUE NOT NULL,
password_hash TEXT,
display_name TEXT NOT NULL,
store_segment TEXT,
is_active INTEGER DEFAULT 1,
personality_prompt TEXT,
business_rules TEXT,
working_hours_json TEXT,
policies_json TEXT,
welcome_message TEXT DEFAULT 'Olá! Como posso te ajudar hoje?',
pdf_files_json TEXT DEFAULT '[]',
image_files_json TEXT DEFAULT '[]',
owner_jid TEXT,
feature_flags_json TEXT DEFAULT '{"bookings":true,"orders":true,"voiceStt":true,"voiceTts":false,"googleCalendar":false,"webhooks":false,"softPause":true,"ownerCommands":true}',
created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

```sql
-- Sessões de Usuários Administrativos / Painel
CREATE TABLE IF NOT EXISTS user_sessions (
token_hash TEXT PRIMARY KEY,
partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
expires_at INTEGER NOT NULL,
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

```sql
-- Catálogo de Produtos e Serviços
CREATE TABLE IF NOT EXISTS catalog_items (
id TEXT PRIMARY KEY,
partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
item_type TEXT NOT NULL CHECK(item_type IN ('SERVICE', 'PRODUCT')),
name TEXT NOT NULL,
description TEXT DEFAULT '',
price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
duration_minutes INTEGER DEFAULT 30,
category TEXT DEFAULT 'geral',
active INTEGER DEFAULT 1,
version_hash TEXT NOT NULL,
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

```sql
-- Clientes Finais (CRM)
CREATE TABLE IF NOT EXISTS customers (
id TEXT PRIMARY KEY,
partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
channel TEXT NOT NULL,
external_id TEXT NOT NULL,
name TEXT,
phone TEXT,
facts_json TEXT DEFAULT '{}',
visits_count INTEGER DEFAULT 0,
last_seen_at DATETIME,
UNIQUE(partner_id, channel, external_id)
);
```

```sql
-- Conversas Ativas e Estado de Transbordo Humano
CREATE TABLE IF NOT EXISTS conversations (
id TEXT PRIMARY KEY,
partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
customer_id TEXT NOT NULL REFERENCES customers(id),
channel TEXT NOT NULL,
external_chat_id TEXT NOT NULL,
is_paused INTEGER DEFAULT 0,
human_requested INTEGER DEFAULT 0,
paused_context_json TEXT DEFAULT '[]',
last_message_at DATETIME,
UNIQUE(partner_id, channel, external_chat_id)
);
```

```sql
-- Historico Detalhado de Mensagens (Auditoria e Janela de Tokens)
CREATE TABLE IF NOT EXISTS messages (
id TEXT PRIMARY KEY,
conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
partner_id TEXT NOT NULL,
direction TEXT NOT NULL CHECK(direction IN ('INBOUND', 'OUTBOUND')),
role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'operator', 'system')),
content_type TEXT DEFAULT 'text',
content TEXT NOT NULL,
metadata_json TEXT DEFAULT '{}',
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

```sql
-- Agendamentos de Serviços
CREATE TABLE IF NOT EXISTS appointments (
id TEXT PRIMARY KEY,
partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
customer_id TEXT REFERENCES customers(id),
catalog_item_id TEXT NOT NULL REFERENCES catalog_items(id),
item_name_snapshot TEXT NOT NULL,
price_cents_snapshot INTEGER NOT NULL,
duration_minutes_snapshot INTEGER NOT NULL,
client_name TEXT NOT NULL,
customer_phone TEXT,
date_str TEXT NOT NULL,
time_slot TEXT NOT NULL,
status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK(status IN ('CONFIRMED', 'CANCELLED', 'COMPLETED')),
idempotency_key TEXT UNIQUE,
external_calendar_id TEXT,
created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

```sql
-- Índice Único Parcial anti-Double Booking para Agendamentos
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_unique_slot
ON appointments(partner_id, date_str, time_slot)
WHERE status = 'CONFIRMED';
```

```sql
-- Pedidos de Produtos
CREATE TABLE IF NOT EXISTS orders (
id TEXT PRIMARY KEY,
partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
customer_id TEXT REFERENCES customers(id),
client_name TEXT NOT NULL,
customer_phone TEXT,
items_json TEXT NOT NULL,
total_cents INTEGER NOT NULL CHECK(total_cents >= 0),
payment_method TEXT,
delivery_type TEXT,
address TEXT,
notes TEXT,
status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK(status IN ('CONFIRMED', 'CANCELLED', 'DELIVERED')),
idempotency_key TEXT UNIQUE,
created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

```sql
-- Idempotência de Eventos Recebidos
CREATE TABLE IF NOT EXISTS processed_events (
event_key TEXT PRIMARY KEY,
session_key TEXT NOT NULL,
processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

```sql
-- Fila de Envio Outbound (Persistência Durável)
CREATE TABLE IF NOT EXISTS outbox_queue (
id TEXT PRIMARY KEY,
session_key TEXT NOT NULL,
channel TEXT NOT NULL,
recipient_id TEXT NOT NULL,
payload_json TEXT NOT NULL,
status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'SENT', 'FAILED')),
attempts INTEGER DEFAULT 0,
next_attempt_at INTEGER NOT NULL,
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

```sql
-- Lembretes Agendados
CREATE TABLE IF NOT EXISTS reminders (
id TEXT PRIMARY KEY,
partner_id TEXT NOT NULL,
appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
recipient_id TEXT NOT NULL,
fire_at INTEGER NOT NULL,
status TEXT DEFAULT 'PENDING',
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

```sql
-- Log Unificado de Auditoria
CREATE TABLE IF NOT EXISTS audit_logs (
id INTEGER PRIMARY KEY AUTOINCREMENT,
partner_id TEXT,
event_type TEXT NOT NULL,
severity TEXT NOT NULL,
message TEXT NOT NULL,
metadata_json TEXT,
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

```sql
-- Integrações de Parceiros
CREATE TABLE IF NOT EXISTS partner_integrations (
id TEXT PRIMARY KEY,
partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
provider TEXT NOT NULL,
credentials_json TEXT NOT NULL,
expires_at INTEGER,
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
UNIQUE(partner_id, provider)
);
```

```sql
-- Índices Adicionais de Leitura
CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_outbox_status_next ON outbox_queue(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_appointments_partner_date ON appointments(partner_id, date_str);
CREATE INDEX IF NOT EXISTS idx_orders_partner_created ON orders(partner_id, created_at);
```

```

---

## 3. Trava Atômica Encadeada por Item (Fim da Alucinação e do Bug Fantasma)

A arquitetura substitui a interpretação de texto livre por três elos encadeados e validados no banco de dados.
```

\+-----------------------------------------------------------------------------------+  
\| ELO 1: Registro Canônico com Hash                                                 \|  
\| Hash SHA-256 (id\|item\_type\|name\|description\|price\_cents\|duration\_minutes)          \|  
\| Injetado no ContextBuilder: \[id\] Nome — R\$ XX,XX (Tipo)                           \|  
\+-----------------------------------------------------------------------------------+  
│  
▼  
\+-----------------------------------------------------------------------------------+  
\| ELO 2: Function Calling Travado no SQLite                                         \|  
\| Executa queries diretas via Repositories. Impedimento físico de agendar PRODUCT   \|  
\| ou inventar valores. Mutação atômica protegida por idx\_appointments\_unique\_slot   \|  
\+-----------------------------------------------------------------------------------+  
│  
▼  
\+-----------------------------------------------------------------------------------+  
\| ELO 3: AtomicOutputGuard \+ Recibo Determinístico                                  \|  
\| Valida menções de R\$ vs Catálogo real (\<2ms). Valida status de COMMIT atômico.    \|  
\| Anexa recibo imutável gerado pelos dados retornados do banco.                     \|  
\+-----------------------------------------------------------------------------------+

```

### Detalhamento dos Elos

1. **Elo 1 — Registro Canônico com Hash (`catalog_items.version_hash`):**
   * O hash SHA-256 é recalculado a cada mutação de item no catálogo: `SHA256(id|item_type|name|description|price_cents|duration_minutes)`.
   * O `ContextBuilder` busca os dados diretamente do SQLite a cada turno e renderiza as ferramentas com o catálogo indexado no formato: `[id] Nome — R$ XX,XX (Tipo)`.

2. **Elo 2 — Function Calling Travado por `item_id`:**
   * `get_item_spec({ item_id })`: Retorna a especificação exata persistida no banco.
   * `check_available_slots({ item_id, date_str })`: Garante que `item_type === 'SERVICE'` e calcula os slots disponíveis consultando os agendamentos ocupados no SQLite.
   * `book_service({ item_id, date_str, time_slot, client_name, confirmed })`: Valida se `confirmed === true` e se `item_type === 'SERVICE'`. Em caso de sucesso, lê nome, preço e duração direto do banco e executa o `INSERT` dentro de uma transação `BEGIN IMMEDIATE`. Além da proteção contra duplo agendamento no mesmo horário dada pelo índice único `idx_appointments_unique_slot`, o `BookingService` executa dentro da transação a verificação de sobreposição de intervalo `[start_min, start_min + duration_minutes]` contra os agendamentos `CONFIRMED` do mesmo dia (impedindo, por exemplo, que um serviço de 60 min às 10:00 colida com outro às 10:30).
   * `create_order({ items: [{ item_id, qty }], client_name, delivery_type, address, payment_method, confirmed })`: Valida se `confirmed === true` e se todos os itens possuem `item_type === 'PRODUCT'`. O valor total (`total_cents`) é calculado multiplicando as quantidades pelos preços em centavos obtidos no SQLite.
   * `cancel_appointment`, `cancel_order`, `list_customer_records`: Operações diretas via chave primária.

3. **Elo 3 — Guardião de Saída (`AtomicOutputGuard`) + Recibo Determinístico:**
   * Executa em menos de 2ms antes do envio da mensagem.
   * **Trava de Preço:** Extrai os valores monetários (`R$`) presentes no texto gerado pela IA e compara com a especificação real retornada pelas ferramentas. Qualquer discrepância bloqueia o envio da mensagem.
   * **Trava de Confirmação:** Se o texto indicar que um agendamento ou pedido foi concluído (ex: "confirmado", "anotado"), mas nenhuma ferramenta retornou `ok: true` no turno atual, a resposta é rejeitada.
   * **Recibo Determinístico:** Em transações concluídas, o sistema ignora a formatação textual da IA para a confirmação e anexa um bloco legível de recibo construído programmaticamente com base nos dados do banco.

---

## 4. Pipeline de Mensageria Resiliente (WhatsApp/Baileys + Omnichannel)

* **Debouncer de Mensagens Picadas (`MessageDebouncer`):** As mensagens recebidas dentro da janela configurada (`DEBOUNCE_WINDOW_MS`, padrão 2500ms, teto de 8000ms) para um mesmo par `(partnerId, chatId)` são agrupadas em um único buffer e enviadas conjuntamente ao motor de IA.
* **Garantia de Idempotência:** A gravação do identificador em `processed_events` ocorre em conjunto com a gravação da resposta na `outbox_queue` sob a mesma transação no SQLite.
```

Mensagem Inbound ──► MessageDebouncer (2.5s) ──► Processamento LLM ──► Transação SQLite \[ processed\_events \+ outbox\_queue \]

```

* **Fila Durável Anti-Ban (`OutboundQueue`):** O worker do canal lê as mensagens com status `PENDING` na `outbox_queue` e aplica o fluxo de envio:
  1. Sinaliza visualização da mensagem (*read receipt*).
  2. Emite o estado `composing` ou `recording` por um período proporcional ao tamanho do texto (1.5s a 5s).
  3. Despacha a mensagem pelo socket.
  4. Atualiza o registro para `SENT`.
* **Soft-Pause Persistido:** O estado de atendimento humano é armazenado na tabela `conversations` (`is_paused = 1`). Durante o transbordo, as mensagens trocadas entre o cliente e o operador são consolidadas no campo `paused_context_json`, permitindo o resgate do contexto quando a IA reassumir o atendimento.
* **Gestão de Sockets Baileys:** Antes de instanciar uma nova conexão no processo de reconexão, o sistema executa `ev.removeAllListeners()` na instância anterior. As tentativas seguem backoff exponencial com jitter e um padrão de *circuit breaker* para impedir reconexões contínuas em falhas transitórias de rede.

---

## 5. Inteligência, Multimodalidade e `VoiceAdapter` Plugável

* **Failover Multi-LLM e Timeouts Ativos:** Cascata de execução configurada na ordem: **Groq $\rightarrow$ xAI $\rightarrow$ OpenAI $\rightarrow$ Gemini $\rightarrow$ OpenRouter**. O controle de tempo limite utiliza instâncias de `AbortController` vinculadas às requisições HTTP subjacentes. A execução em loop de ferramentas é limitada a no máximo 3 iterações por turno.
* **Integridade do System Prompt (`PromptPin`):** No boot, o arquivo `core/prompts/pme_base.v1.md` tem seu hash SHA-256 verificado. As mensagens de entrada são filtradas por padronização contra padrões de *prompt injection*.
* **Contexto por Janela de Tokens:** As mensagens históricas são carregadas da tabela `messages` até o limite configurado de tokens (ex: 4.096 tokens), acompanhadas das propriedades salvas no campo `customers.facts_json`.
* **`VoiceAdapter` (Arquitetura STT/TTS):**
  * `VOICE_STT_DRIVER`: Suporte a `cloud` (Groq Whisper / Gemini Multimodal) ou `local` (`whisper.cpp`). Caso ocorra falha no processamento do áudio, a IA responde com uma mensagem de suporte solicitando o envio em texto.
  * `VOICE_TTS_DRIVER`: Alternação entre `off`, `piper` e `edge`. Os arquivos de saída são convertidos para o container `audio/ogg; codecs=opus` com suporte ao envio em formato de nota de voz (PTT) do WhatsApp.
  * Nota de Engenharia de RAM (Alinhamento Doc 04): Em ambientes de container com teto de 512 MB de RAM (ex: Render Free/Starter), é obrigatório configurar NODE_OPTIONS=--max-old-space-size=384. Nesses ambientes, os drivers locais pesados (whisper.cpp e Piper) são proibidos, devendo-se utilizar estritamente VOICE_STT_DRIVER=cloud e VOICE_TTS_DRIVER=off (ou edge).
* **Processamento de Imagens e Documentos:** Imagens e arquivos PDF são encaminhados aos adaptadores correspondentes para extração de texto ou análise visual antes de serem passados para o contexto de decisão da IA.

---

## 6. Ciclo de Vida e Confiabilidade (`LifecycleManager`)

O processo possui um único manipulador centralizado para os sinais `SIGINT` e `SIGTERM`.
```

\[ SIGINT / SIGTERM \]  
│  
▼

1. Bloqueio de novas conexões HTTP e interrupção de novos timers de debouncer.  
   │  
   ▼  
2. Drenagem e finalização dos turnos em execução (timeout limite: 10s).  
   │  
   ▼  
3. Encerramento dos workers da fila outbox e timers secundários.  
   │  
   ▼  
4. Limpeza de listeners (`removeAllListeners()`) e encerramento dos sockets Baileys.  
   │  
   ▼  
5. Execução do checkpoint WAL: `PRAGMA wal_checkpoint(TRUNCATE);` e encerramento do SQLite.  
   │  
   ▼  
6. Término do processo com status code 0\.

