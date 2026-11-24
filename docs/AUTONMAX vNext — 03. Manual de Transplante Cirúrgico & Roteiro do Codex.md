# **AUTONMAX vNext — 03\. Manual de Transplante Cirúrgico & Roteiro do Codex**

**Estratégia:** Transplante Cirúrgico para Raiz Limpa (o repositório atual permanece congelado e intacto como **Repositório Doador**).  
**Regra de Ouro:** Construir 1 camada por vez. Nenhuma camada superior pode ser iniciada antes que todos os Testes de Contrato (node:test) da camada atual passem 100% em um único processo (zero interferência global).

---

# **1\. Mapa Cirúrgico DE \-\> PARA (Preservação do Ouro)**

O mapeamento a seguir define a extração precisa dos mecanismos validados do repositório doador para a nova estrutura de raiz limpa, detalhando preservações críticas de comportamento e correções obrigatórias de débito técnico durante o transplante.

| Mecanismo Validado | Origem (Doador) | Destino (Raiz Limpa) | Preservar (Ouro) | Corrigir no Transplante |
| :---- | :---- | :---- | :---- | :---- |
| **Geração de QR Code & Conexão Baileys** | `core/ring2/WhatsAppDriver.js` | `core/messaging/adapters/WhatsAppBaileysAdapter.js` | • `QRCode.toDataURL` com cor preta pura (`#000000`), fundo (`#FFFFFF`), `margin: 4`, `scale: 8`.• `syncFullHistory: false` e `shouldSyncHistoryMessage: () => false`.• User-Agent via `Browsers.ubuntu('Chrome')`.• Proteção anti-loop (`fromMe === true` e comparação com próprio número `sock.user.id`).• Backoff progressivo `[2000, 5000, 10000, 20000, 30000, 60000, 120000]` sem wipe de credenciais em quedas transitórias.• Reset do circuit breaker após 2 minutos de estabilidade. | • Remover patch em `node_modules` (tratar timeout de conexão via configuração oficial do Baileys).• Limpar event listeners via `ev.removeAllListeners()` no teardown.• Substituir marcação prévia de `processedMsgIds` por persistência pós-commit no SQLite.• Eliminar descarte silencioso quando STT de áudio falhar (enviar fallback amigável ao cliente). |
| **Isolamento Multi-Sessão** | `core/ring2/WhatsAppSessionManager.js` | `core/messaging/SessionManager.js` | • Padrão de chave de sessão: `pme:{partnerId}:{lineId}`.• Respeito ao limite `MAX_LINES_PER_PARTNER`.• Diretórios `authDir` isolados por credencial. | • Sanitizar caracteres `:` nos caminhos de arquivo/pasta no filesystem (prevenção de conflito no Windows NTFS Streams).• Exigir autorização explícita do `partnerId` antes de resolver e instanciar a sessão. |
| **Soft-Pause com Buffer de Contexto** | `core/ring2/WhatsAppDriver.js` (`bufferPausedMessage`, `formatPausedContextFact`) | `core/messaging/PauseController.js` \+ tabela `conversations` no SQLite | • Manter conexão Baileys 100% ativa no background.• Silenciar respostas automáticas da IA enquanto o operador humano intervém.• Gravar histórico do atendimento humano para retomada sem repetição de perguntas ao cliente. | • Mover persistência de buffers em arquivos soltos JSON para o campo `paused_context_json` na tabela `conversations` do SQLite. |
| **Trava Atômica do System Prompt** | `core/ring0/PromptPin.jscore/ring1/SystemPrompt.jscore/prompts/pme_base.v1.mdcore/config/AttendantDefaults.jsscripts/ci_prompt_guard.js` | `core/ai/PromptPin.jscore/prompts/pme_base.v1.md` | • Verificação rigorosa do hash SHA-256 do arquivo de prompt no boot da aplicação.• Regras invioláveis de identidade, tom e escopo operacional agêntico. | • Consolidação da validação e arquivos dispersos em um módulo único centralizado (`core/ai/PromptPin.js`). |
| **Failover Multi-LLM \+ Trava Anti-Loop de Tools** | `core/ring1/MultiProviderLlmRouter.js` | `core/ai/LlmRouter.js` | • Cascata de failover: Groq \-\> xAI \-\> OpenAI \-\> Gemini \-\> OpenRouter.• Circuit breaker individualizado por provedor.• Trava estrita de iterações em ferramentas: `MAX_TOOL_ITERATIONS = 3`. | • Adicionar suporte nativo a Function Calling / Tools no payload de cada provedor HTTP.• Substituir chamadas com `Promise.race` (sem cancelamento real) por requisições com `AbortController` nativo. |
| **Guarda de Prompt Injection** | `core/ring1/MaxOrchestrator.js` (`INJECTION_PATTERNS`, `_sanitizeUserInput`) | `core/ai/InputGuard.js` | • Sanitização de entradas do usuário usando padrões de inspeção `INJECTION_PATTERNS`. | • Resgatar estritamente as regras de sanitização leve, descartando a arquitetura legada da RFC-C108. |
| **Regras de Agenda, Data PT-BR e Desambiguação Produto vs. Serviço** | `core/ring2/BookingDateTime.jscore/ring2/PmeBookingTools.jscore/ring2/PmeOrderTools.jscore/ring1/MaxEdgeIntelligence.js` (`RegionalNormalizer`)`core/ring1/PdfGeneratorEngine.js` | Módulos em `core/domain/` | • Interpretação contextual de datas e horários legíveis em PT-BR.• Normalização regional de termos e formatos.• Bloqueio físico que impede o agendamento de itens do tipo produto como serviço.• Cálculo monetário estrito em centavos inteiros (`cents`).• Gerador de documentos PDF nativo (sem dependência de headless browsers). | • Mover locks, agendamentos e pedidos para transações atômicas no SQLite único.• Garantir busca de preços SEMPRE no banco de dados via `item_id`, ignorando valores sugeridos pelo payload do modelo. |
| **Transcrição de Áudio** | `core/ring2/AudioHandler.js` | `core/ai/voice/CloudVoiceAdapter.js` (implementando `VoiceAdapter`, ao lado de `LocalVoiceAdapter.js`) | • Processamento de mensagens de voz recebidas por canais de mensageria com suporte a conversão de formato. | • Desacoplar chamadas diretas de infraestrutura utilizando a interface unificada `VoiceAdapter` para alternância entre nuvem e processamento local (`whisper.cpp`/Piper). |

---

# **2\. Lista Explícita de Exclusões (NÃO Atravessa a Ponte)**

Para garantir que a nova raiz permaneça limpa, resiliente e livre de débitos técnicos históricos, o agent Codex está estritamente proibido de transferir ou reimplementar os seguintes itens:

## **Arquivos Órfãos e Módulos Obsoletos**

* `apps/partner/viewmodels/PartnerCockpitViewModel.js`  
* `core/ring1/GeminiLlmEngine.js`  
* `core/ring1/LlmAdapter.js`  
* `core/ring1/MaxCognitiveVault.js`  
* `core/ring1/MaxContextWindow.js`  
* `core/ring1/MaxOrchestrator.js` (exceto o array `INJECTION_PATTERNS` resgatado para o `InputGuard`)  
* `core/ring1/MaxSessionState.js`  
* `core/ring1/PmeAppointmentEngine.js`  
* `core/ring1/PmeCrmEngine.js`  
* `core/ring1/SchedulerEngine.js`  
* `core/ring1/WhatsAppBridge.js`  
* Todo o diretório `core/sandboxVM/**`

## **Mecanismos de Lifecycle e Auto-Cura Incompatíveis**

* `bin/autonmax-daemon.js`  
* `core/ring0/AutoHealingEngine.js`  
* `core/ring0/SurfaceBridge.js`

## **Persistência Fragmentada e Arquivos JSON Avulsos**

* `workspace/attendants_db.json`  
* `booking_drafts.json`  
* Arquivos de lock temporários em `slot_locks/`  
* Históricos de auditoria em `booking_audit/`  
* Qualquer biblioteca ou parser manual de arquivos `.env` (usar `process.loadEnvFile()` nativo do Node.js)

## **Módulos Financeiros Expurgados**

* Rotas API: `/api/v1/ledger/*`, `/api/v1/escrow/*`, `/api/v1/subscription/*`  
* Manipuladores de saldo e tokens: `BRL_BALANCE`, `MAXCOIN_BALANCE`

## **Dependências Obsoletas ou Pesadas (`package.json`)**

* `better-sqlite3` e `sqlite3` (substituídos por `node:sqlite`)  
* `puppeteer` (geração de PDF migrada para mecanismo nativo)  
* *Dependências permitidas:* `@whiskeysockets/baileys`, `qrcode`, `dotenv` (para suporte legado se necessário, preferindo nativo) e opcionalmente `link-preview-js`.

## **Frontend Legado**

* Monolito `public/app.js` e páginas HTML legadas (a nova interface oficial — SPA/PWA Offline-First empacotada em APK Android via Capacitor — é construída do zero na **Camada 6** seguindo o Doc 04).

---

# **3\. Roteiro de Construção em 6 Camadas (Modo Impressora 3D para o Codex)**

O desenvolvimento deve seguir estritamente a sequência de camadas descrita abaixo. É proibido avançar para a camada seguinte sem que todos os testes de contrato da camada atual passem com 100% de sucesso.

```
       [ Camada 6: Interface Híbrida SPA/PWA + Capacitor Android & Deploy Render ]
                              |
       [ Camada 5: Gateway REST, Eventos/Webhooks & Boot ]
                              |
       [ Camada 4: Mensageria Resiliente & Fila Anti-Ban ]
                              |
       [ Camada 3: Motor Agêntico, Trava Atômica Elo 3 & Voice ]
                              |
       [ Camada 2: Domínio PME & Trava Atômica Elo 1 e 2 ]
                              |
       [ Camada 1: Fundação, Storage SQLite & Lifecycle ]
```

---

## **Camada 1 — Fundação, Storage SQLite & Lifecycle**

*Foco:* Infraestrutura básica de dados, persistência transacional com SQLite nativo, isolamento de repositórios e controle do ciclo de vida da aplicação.

*Escopo de Arquivos:*

* `core/storage/DatabaseManager.js`  
* `core/storage/migrations/`  
* `core/storage/repositories/PartnerRepository.js`  
* `core/storage/repositories/AuthRepository.js`  
* `core/storage/repositories/CatalogRepository.js`  
* `core/storage/repositories/CustomerRepository.js`  
* `core/storage/repositories/ConversationRepository.js`  
* `core/storage/repositories/AppointmentRepository.js`  
* `core/storage/repositories/OrderRepository.js`  
* `core/storage/repositories/QueueRepository.js`  
* `core/lifecycle/LifecycleManager.js`

*Critério de Pronto (DoD):*

* Instanciação do SQLite nativo (`node:sqlite`) em modo WAL com `foreign_keys = ON`.  
* Migrações executadas de forma determinística em bancos `:memory:` e arquivo físico.  
* Todos os repositórios implementando isolamento por `partner_id`.  
* Shutdown gracioso gerenciado pelo `LifecycleManager` fecho de conexões e handlers sem deixar processos pendentes.

*Testes de Contrato Obrigatórios (`node --test tests/layer1_storage.test.js`):*

1. **Migrations Limpas:** Migrações devem ser aplicadas sem erros em bancos `:memory:` e arquivos temporários.  
2. **Constraint de Concorrência (Double-booking):** Tentativa de inserção duplicada para a mesma combinação `(partner_id, date_str, time_slot)` deve falhar atomicamente por violação de constraint `UNIQUE` no SQLite.  
3. **Preservação de Snapshot por Soft-delete:** O soft-delete ou alteração de um item no catálogo não pode alterar ou apagar o histórico de agendamentos/pedidos antigos que referenciam o item.  
4. **Encerramento Limpo do Lifecycle:** O `LifecycleManager` deve fechar todos os recursos registrados na ordem inversa de inicialização sem acionar `process.exit` forçado.

---

## **Camada 2 — Domínio PME & Trava Atômica Elo 1 e Elo 2**

*Foco:* Regras de negócio de serviços e produtos, garantia de integridade financeira e bloqueio de ambiguidades operacionais.

*Escopo de Arquivos:*

* `core/domain/CatalogService.js`  
* `core/domain/BookingService.js`  
* `core/domain/OrderService.js`  
* `core/domain/CustomerService.js`  
* `core/domain/PdfService.js`  
* `core/domain/RegionalNormalizer.js`

*Critério de Pronto (DoD):*

* Validação atômica de agendamento (Elo 1): apenas itens do tipo `SERVICE` podem ser agendados em slots de horário.  
* Validação atômica de preço (Elo 2): cálculo do `total_cents` obrigatoriamente realizado via busca no banco pelo `item_id`, ignorando qualquer valor externo.  
* Versionamento automático do catálogo (`version_hash` SHA-256) a cada alteração de produto ou serviço.  
* Emissão de recibos/comprovantes em PDF gerados de forma nativa.

*Testes de Contrato Obrigatórios (`node --test tests/layer2_domain.test.js`):*

1. **Desambiguação de Tipo (Elo 1):** Tentativa de agendar um `item_id` com `type = 'PRODUCT'` deve retornar erro de validação de domínio e abortar a operação.  
2. **Preço Autorizativo do Banco (Elo 2):** O `OrderService` deve ignorar qualquer valor monetário informado na requisição/payload e utilizar exclusivamente o `price_cents` cadastrado no SQLite.  
3. **Integridade do Version Hash:** Qualquer atualização em itens do catálogo de um parceiro deve alterar o `version_hash` retornado pelo `CatalogService`.  
4. **Idempotência de Operação:** Chamadas repetidas utilizando a mesma `idempotency_key` devem retornar o registro existente sem criar duplicatas no banco de dados.  
5. **Bloqueio de Sobreposição por Duração:** Agendar um serviço de 60 minutos às 10:00 e tentar agendar outro serviço às 10:30 no mesmo dia/parceiro deve falhar atomicamente dentro da transação BEGIN IMMEDIATE do BookingService.

---

## **Camada 3 — Motor Agêntico, Trava Atômica Elo 3 & VoiceAdapter**

*Foco:* Orquestração de inteligência artificial, aplicação do Prompt Pin, execução segura de ferramentas (Tools) e tratamento de voz.

*Escopo de Arquivos:*

* `core/ai/PromptPin.js`  
* `core/ai/InputGuard.js`  
* `core/ai/LlmRouter.js`  
* `core/ai/AgentEngine.js`  
* `core/ai/AtomicOutputGuard.js`  
* `core/ai/voice/VoiceAdapter.js`  
* `core/ai/voice/CloudVoiceAdapter.js`  
* `core/ai/voice/LocalVoiceAdapter.js`  
* `core/prompts/pme_base.v1.md`

*Critério de Pronto (DoD):*

* Validação do SHA-256 do prompt base no boot via `PromptPin`.  
* Sanitização de entrada via `InputGuard`.  
* Router com failover ativo entre provedores usando `AbortController` para cancelamento por timeout.  
* Validação atômica de execução (Elo 3\) com `AtomicOutputGuard`: afirmações de confirmação na resposta textual EXIGEM a execução bem-sucedida do tool correspondente no mesmo turno.

*Testes de Contrato Obrigatórios (`node --test tests/layer3_agent.test.js`):*

1. **Bloqueio de Bug Fantasma (Elo 3):** Se a LLM retornar texto afirmando "Agendamento confirmado\!" sem ter chamado a tool `book_service`, o `AtomicOutputGuard` deve interceptar a resposta e impedir o envio.  
2. **Confirmação Determinística (Elo 3):** Quando a LLM executa `book_service(item_id, confirmed: true)` com sucesso, o registro deve ser gravado no SQLite e o recibo oficial determinístico deve ser anexado à resposta.  
3. **Interceptação de Alucinação Financeira:** Se a LLM mencionar no texto um preço divergente (ex: `R$ 10,00`) do valor real retornado pela tool (`R$ 50,00`), o `AtomicOutputGuard` deve barrar ou corrigir a saída.  
4. **Timeout e Cancelamento Real:** O estouro do tempo limite em um provedor deve disparar o `AbortController` cancelando a requisição HTTP e acionando o próximo provedor da lista de failover.  
5. **Persistência de Contexto:** O histórico de conversa deve ser persistido adequadamente no SQLite respeitando o limite máximo de tokens configurado.  
6. **Guarda Anti-Regressão de Prompt (ci\_prompt\_guard):** O PromptPin deve rejeitar prompts contendo padrões proibidos legados ("Pix Atômico", "Finanças/Pix", "Logística / Entrega", "1º Assistente Digital Universal") ou hash SHA-256 divergente.

---

## **Camada 4 — Mensageria Resiliente, Debouncer & Fila Anti-Ban**

*Foco:* Integração com WhatsApp via Baileys, controle de concorrência de mensagens, soft-pause e prevenção de bloqueios por flood.

*Escopo de Arquivos:*

* `core/messaging/ChannelAdapter.js`  
* `core/messaging/adapters/WhatsAppBaileysAdapter.js`  
* `core/messaging/SessionManager.js`  
* `core/messaging/MessageDebouncer.js`  
* `core/messaging/OutboundQueueWorker.js`  
* `core/messaging/PauseController.js`

*Critério de Pronto (DoD):*

* Conexão estável Baileys com geração de QR Code limpo e reconexão progressiva.  
* Agrupamento de mensagens fragmentadas por `MessageDebouncer` antes do envio ao motor agêntico.  
* Fila de saída (`OutboundQueueWorker`) com taxa controlada para mitigação de risco de banimento.  
* Suporte a pausa de atendimento (`PauseController`) gravando o contexto em campo JSON no banco.

*Testes de Contrato Obrigatórios (`node --test tests/layer4_messaging.test.js`):*

1. **Debouncing Eficiente:** O envio de 3 mensagens rápidas seguidas (intervalo \< 500 ms) pelo mesmo cliente deve ser consolidado em 1 única execução no `AgentEngine` com o texto concatenado.  
2. **Idempotência Pós-Commit:** Caso ocorra uma falha no `AgentEngine` antes da conclusão do processamento, o `msgId` NÃO deve ser gravado em `processed_events`, permitindo o reprocessamento da mensagem.  
3. **Comportamento em Soft-Pause:** Mensagens recebidas enquanto a conversa estiver em estado pausado não devem acionar a IA e devem ter seu conteúdo armazenado no campo `paused_context_json` da tabela `conversations`.  
4. **Sanitização de Caminhos no Windows:** A resolução da chave de sessão `pme:usr_1:line_1` deve gerar nomes de pasta e arquivo sem o caractere `:` permitindo leitura e escrita corretas em sistemas Windows NTFS.  
5. **Fallback em Transcrição de Áudio:** Se o componente STT falhar na transcrição de um áudio, uma mensagem de fallback educada deve ser enviada ao cliente em vez de descartar silenciosamente a interação.

---

## **Camada 5 — Gateway REST, Eventos/Webhooks & Boot**

*Foco:* Exposição da API REST de gerenciamento, disparo de webhooks externos, eventos em tempo real via SSE e script de inicialização do sistema.

*Escopo de Arquivos:*

* `core/gateway/Server.js`  
* `core/gateway/middlewares/AuthMiddleware.js`  
* `core/gateway/middlewares/CorsMiddleware.js`  
* `core/gateway/routes/PartnerRoutes.js`  
* `core/gateway/routes/CatalogRoutes.js`  
* `core/gateway/routes/BookingRoutes.js`  
* `core/gateway/routes/OrderRoutes.js`  
* `core/gateway/routes/HealthRoutes.js`  
* `core/gateway/routes/AuthRoutes.js`  
* `core/gateway/routes/ChannelRoutes.js`  
* `core/gateway/routes/ConversationRoutes.js`  
* `core/gateway/routes/WebhookRoutes.js`  
* `core/gateway/routes/FeatureRoutes.js`  
* `core/gateway/events/WebhookDispatcher.js`  
* `core/gateway/events/SseManager.js`  
* `bin/start.js`

*Critério de Pronto (DoD):*

* Servidor HTTP nativo ou leve rodando com suporte a middlewares globais.  
* Implementação integral das rotas especificadas no Blueprint da API REST.  
* Webhooks assinados via HMAC-SHA256 com suporte a retentativas.  
* Script de boot `bin/start.js` orchestrando a inicialização de todas as camadas.

*Testes de Contrato Obrigatórios E2E (`node --test tests/layer5_gateway.test.js`):*

1. **Proteção de Rotas:** Requisições para rotas protegidas sem o cabeçalho de autorização válido devem retornar HTTP `401 Unauthorized`.  
2. **Fluxo E2E de Agendamento:**  
   * Cadastrar um serviço via rota REST `POST /api/v1/partners/:id/catalog`.  
   * Simular mensagem de agendamento via `WhatsAppBaileysAdapter` (mock de entrada).  
   * O `AgentEngine` deve processar e confirmar o agendamento.  
   * As requisições `GET /api/v1/partners/:id/appointments/summary` e `GET /api/v1/partners/:id/appointments` devem retornar exatamente o agendamento realizado.  
3. **Fluxo E2E de Pedido:**  
   * Cadastrar um produto via rota REST `POST /api/v1/partners/:id/catalog`.  
   * Simular mensagem de compra via adaptador de mensageria.  
   * O `AgentEngine` deve processar e confirmar o pedido.  
   * A requisição `GET /api/v1/partners/:id/orders/summary` deve retornar o pedido com o valor `total_cents` correspondente ao banco de dados.  
4. **Execução Global sem Interferência:** Toda a suíte de testes deve rodar em um único comando (`node --test tests/*.test.js`) em processo único, obtendo 100% de aprovação e finalizando com encerramento limpo da aplicação.  
5. **Painel de Chaves e Idempotência Offline:** Desativar a flag "orders" via `PUT /api/v1/partners/:id/features` bloqueia a criação de novos pedidos (HTTP 403 FEATURE\_DISABLED); reenviar um POST de agendamento com o mesmo cabeçalho X-Idempotency-Key retorna o registro original sem duplicação.

---

## **Camada 6 — Interface Híbrida Offline-First (SPA/PWA \+ Capacitor Android) & Deploy Render**

*Foco:* Entregar a interface única (SPA/PWA) com `StorageAdapter` (IndexedDB na Web ↔ SQLite \+ Filesystem nativo no APK Android via Capacitor/Kotlin/Gradle), fila offline `sync_queue` com `idempotency_key` e os blueprints oficiais `render.free.yaml` e `render.starter.yaml` (conforme especificado em detalhe no Doc 04).  
*Trava de Sequência Obrigatória:* O Capacitor (`android/` Kotlin/Gradle) só pode ser acoplado depois que a Camada 5 e a SPA/PWA (com `StorageAdapter` e `sync_queue`) estiverem 100% aprovadas nos testes.

*Escopo de Arquivos:*

* `app-web/src/storage/StorageAdapter.js`  
* `app-web/src/storage/IndexedDbAdapter.js`  
* `app-web/src/storage/CapacitorSqliteAdapter.js`  
* `app-web/src/sync/SyncQueue.js`  
* `app-web/src/shell/` (Casca isolada — navegação externa desligável via `shell_enabled: false`)  
* `app-web/src/theme/tokens.css` (Tokens semânticos CSS injetáveis — zero hexadecimais hardcoded em `views/`)  
* `app-web/src/ports/EnvironmentPorts.js` (Abstração completa: `storage`, `network`, `filesystem`, `secureAuth`, `clipboard`, `share`, `camera`)  
* `app-web/src/config/FrontendInitConfig.js` (Inicializador `mountAutonmaxUI(container, config)` com `shell_enabled`, `ui_mode: 'guided'|'advanced'`, `feature_flags`, `theme_tokens` e `output_actions`)  
* `app-web/src/components/OperationalStatusBadge.js` (Indicador discreto `ONLINE | OFFLINE | SYNCING | CONFLICT` independente da Casca)  
* `app-web/src/views/` (Miolo puro: Painel PME, Catálogo, Agenda, Pedidos, Chats/Soft-Pause, QR Code — com ergonomia mobile-first \>= 44x44px, zero scroll horizontal e tabelas convertidas em cards em telas pequenas)  
* `capacitor.config.ts`  
* `android/` (Kotlin Gradle DSL \+ `network_security_config.xml`)  
* `render.free.yaml`  
* `render.starter.yaml`

*Testes de Contrato Obrigatórios (`node --test tests/layer6_offline_deploy.test.js`):*

1. **Operação Offline \+ sync\_queue:** Criar item no catálogo e cancelar agendamento em modo offline grava no `StorageAdapter` e enfileira operações com `idempotency_key`; ao reconectar, o flush sincroniza na ordem exata sem duplicação.  
2. **Reconciliação de Conflito (409 SLOT\_TAKEN):** Se o servidor rejeitar um agendamento enfileirado offline por conflito de horário, a `sync_queue` marca o item como `CONFLICT` sem travar o restante da fila.  
3. **Validação dos Blueprints Render:** Teste automatizado valida a presença de `render.free.yaml` e `render.starter.yaml`, confirmando `NODE_OPTIONS=--max-old-space-size=384`, `VOICE_STT_DRIVER=cloud`, ausência de `puppeteer`, disco `/var/data` com `sizeGB: 2` no Starter e `DB_PATH`/`SESSIONS_DIR` apontando para `/var/data`.  
4. **Checklist de Segurança Android:** Validação estática de `AndroidManifest.xml` / `network_security_config.xml` confirmando `usesCleartextTraffic="false"`, `allowBackup="false"`, `minSdk >= 24` e `targetSdk >= 35`.  
5. **Separação Casca vs. Miolo & Configuração (FrontendInitConfig):** Montar a UI com `shell_enabled: false` não renderiza a Casca (menu/header externo), mas mantém todas as `views/` e o `OperationalStatusBadge` funcionais; alternar `ui_mode` entre `'guided'` e `'advanced'` ajusta os controles exibidos sem duplicar telas.  
6. **Higiene Estática (Tokens Semânticos & Agnóstica de Runtime):** Verificação estática sobre `app-web/src/views/` e componentes confirma: (a) zero cores hexadecimais hardcoded (`#[0-9a-fA-F]{3,8}`) ou fontes fixas; (b) zero imports diretos de `@capacitor/*` ou `indexedDB` dentro de `views/` (tudo via `EnvironmentPorts`).  
7. **Slots Injetáveis (OutputActions) & Ergonomia:** Injetar um handler mock em `output_actions.exportAppointmentsPdf` e `shareReceipt` substitui a ação local padrão sem alterar a view; validação CSS confirma `min-height/min-width >= 44px` nos controles interativos e ausência de overflow horizontal.

---

# **4\. Prompt-Modelo de Execução para o Codex (Copiar e Colar por Camada)**

Utilize o modelo de prompt abaixo para instruir a execução de cada uma das 5 camadas no Codex. Substitua as marcações `[CAMADA X]` e `[NOME DA CAMADA]` conforme a fase atual.

```
Você é o agente executor Codex responsável por construir a arquitetura limpa do AUTONMAX vNext.

SUA TAREFA ATUAL: Implementar estritamente a [CAMADA X — NOME DA CAMADA].

INSTRUÇÕES DE EXECUÇÃO:

1. LEITURA E CONTEXTO:
   - Leia atentamente as especificações do Blueprint da arquitetura, esquema de banco de dados e rotas.
   - Consulte o repositório doador para transplante dos mecanismos validados conforme o Mapa Cirúrgico (DE -> PARA).
   - Respeite rigorosamente a Lista de Exclusões. NÃO copie arquivos órfãos ou bibliotecas obsoletas.

2. ESCOPO DE IMPLEMENTAÇÃO:
   - Crie/modifique APENAS os arquivos pertencentes à [CAMADA X].
   - NÃO avance para arquivos de camadas superiores.

3. EXECUÇÃO DOS TESTES DE CONTRATO:
   - Crie a suíte de testes correspondente em `tests/layerX_[nome].test.js` utilizando o test runner nativo do Node.js (`node:test` e `node:assert`).
   - Execute os testes no terminal utilizando o comando em processo único:
     `node --test tests/layerX_[nome].test.js`

4. CRITÉRIO DE ACEITAÇÃO:
   - Todos os testes da camada devem passar com 100% de sucesso.
   - O encerramento do processo de teste deve ser limpo, sem handles pendentes ou timeouts.

Ao concluir, forneça um relatório curto com a lista de arquivos criados e a evidência de execução dos testes com sucesso antes de solicitar autorização para a próxima camada.
```

