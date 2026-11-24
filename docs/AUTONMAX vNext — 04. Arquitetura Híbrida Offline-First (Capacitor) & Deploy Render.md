# **AUTONMAX vNext — 04\. Arquitetura Híbrida Offline-First (Capacitor) & Deploy Render**

**Status:** Blueprint Oficial Cross-Lab (Alinhado aos Docs 01, 02 e 03\)  
**Posicionamento:** Vertical Puro 100% autônomo · Interface Única Híbrida (SPA/PWA \+ APK Android Offline-First via Capacitor / Kotlin / Gradle) · Deploy Render calibrado para 512 MB de RAM.

# **1\. Vertical Puro & Regra de Fronteira (Zero Acoplamento de Grafo)**

O Autonmax vNext opera integralmente sozinho como um Vertical Puro de mensageria WhatsApp e atendimento por Inteligência Artificial dotado de Trava Atômica de Agendamento. Ele entrega valor completo de forma autônoma sem requerer dependências externas de outros produtos da suíte.

**Fronteira inviolável:** Este documento e a implementação de código do motor **NÃO projetam o grafo** de aplicações de terceiros e **NÃO possuem acoplamento direto** com outros motores ou ecossistemas.

A integração futura conduzida pela **Sala de Arquitetura Central** para a montagem de *bundles* comerciais (ex.: Vertical Puro, PME Básico, PME Avançado) ocorre exclusivamente através das portas genéricas de entrada e saída padronizadas no **Doc 02**:

* Interface REST pública (`/api/v1/*`);  
* Webhooks assinados via chave secreta (`HMAC-SHA256`);  
* Stream de eventos via `Server-Sent Events` (SSE);  
* **Painel de Chaves e Feature Flags** por parceiro (`/api/v1/partners/:partnerId/features`).

```
+-----------------------------------------------------------------------------------+

|                              AUTONMAX vNext ENGINE                                |
|                                                                                   |
|  +--------------------+   +-----------------------+   +------------------------+  |
|  | SPA / PWA / APK    |   | Core Engine (Node.js) |   | SQLite Single Source   |  |
|  | (Capacitor Native) | < | Baileys + Multi-LLM   | > | (BEGIN IMMEDIATE / WAL)|  |
|  +--------------------+   +-----------------------+   +------------------------+  |
+----------------------------------------|------------------------------------------+
                                         | (ISOLATION BOUNDARY)
                                         v
+-----------------------------------------------------------------------------------+
|                        GENERIC INTEGRATION LAYER (DOC 02)                         |
|                                                                                   |
|   [ REST API ]        [ SSE Event Stream ]    [ Webhooks HMAC ]   [ Feature Flags]|
|  /api/v1/*            /api/v1/events          POST /webhook       /partners/flags |
+-----------------------------------------------------------------------------------+
```

# **2\. Mapeamento Obrigatório de Servidor por Ferramenta**

## **Veredito sobre a Regra de Isenção de Servidor**

**A Regra de Isenção de Servidor NÃO se aplica ao Autonmax.**

Embora a interface cliente (SPA/PWA web e APK Android) opere com capacidade **Offline-First** para consulta de dados cadastrados e enfileiramento local de ações do lojista, o núcleo operacional do vertical — o atendimento autônomo 24/7 via WhatsApp — exige obrigatoriamente um servidor backend ativo continuous-on.

Essa infraestrutura de servidor é necessária para:

1. Manter a conexão WebSocket persistente e ininterrupta do engine `Baileys`;  
2. Executar o debouncer de mensagens e a fila de saída com cadência anti-banamento com o celular do lojista desligado ou sem rede;  
3. Proteger segredos de infraestrutura (chaves privadas de LLMs, segredos JWT e assinaturas HMAC) fora do alcance da aplicação cliente;  
4. Garantir a integridade da trava atômica anti-double-booking no banco de dados SQLite compartilhado.

## **Auditoria Completa por Ferramenta / Recurso**

| Ferramenta / Recurso | Camada de Execução | Disponibilidade Offline | Justificativa Técnica |
| :---- | :---- | :---- | :---- |
| **SPA/PWA (Shell de Interface: Painel PME, Catálogo, Agenda, Pedidos, Chats)** | Camada Estática Gratuita (Render Static Site / CDN) ou embutida no APK Android (Capacitor) / servida pelo gateway | **100% Offline** | Assets estáticos (HTML/CSS/JS) são armazenados localmente via Service Worker no PWA e empacotados dentro do binário nativo do APK. |
| **Consulta de Catálogo, Agenda Confirmada, Pedidos e Histórico de Chats em Cache** | 100% Local (Cliente via StorageAdapter — IndexedDB na Web / SQLite nativo no APK) | **100% Offline** | Dados sincronizados são persistidos no armazenamento local do dispositivo, permitindo leitura instantânea em Modo Avião. |
| **Visualização e Exportação de PDFs já baixados** | 100% Local (Cliente via @capacitor/filesystem no APK / Blob na Web) | **100% Offline** | Arquivos binários baixados anteriormente são armazenados na sandbox de arquivos do dispositivo ou em cache de blobs. |
| **CRUD de Catálogo, Config do Atendente, Soft-Pause, Cancelamentos e Criação Manual de Agenda/Pedido** | Híbrido Local \+ Servidor (sync\_queue com X-Idempotency-Key) | **Offline com Fila** | A alteração é aplicada imediatamente na UI e salva na `sync_queue` local. Ao reconectar, a fila é enviada sequencialmente ao backend. |
| **Conexão WhatsApp (Baileys 24/7, Pareamento QR Code, Reconexão e `baileys_auth`)** | Exige Servidor Ativo | **Exige Internet** | Demanda socket TCP/WebSocket aberto 24h por dia com os servidores da Meta e guarda o estado criptografado das chaves de sessão no servidor. |
| **Debouncer de Mensagens Picadas, Fila Anti-Ban (`outbox_queue`) e Motor Agêntico IA (Multi-LLM \+ Trava Atômica \+ STT/TTS)** | Exige Servidor Ativo | **Exige Internet** | Processamento autônomo do canal do cliente final. Exige consumo seguro de chaves de API (`GROQ`, `OPENAI`, `GEMINI`) sem expor credenciais no cliente. |
| **Fonte Única de Verdade SQLite (`BEGIN IMMEDIATE` \+ `idx_appointments_unique_slot`)** | Exige Servidor Ativo | **Exige Internet** | Coordenação transacional atômica para evitar reservas duplicadas entre clientes concorrentes no WhatsApp e edições manuais no painel. |
| **Webhooks HMAC-SHA256, Stream SSE Tempo Real, Lembretes (`reminders`) e Plugin OAuth Google Calendar** | Exige Servidor Ativo | **Exige Internet** | Disparo programado por cron interno, validação de assinaturas criptográficas server-side e callbacks de autenticação OAuth 2.0. |

# **3\. Arquitetura Híbrida de Motor Único: WebView (SPA/PWA) \+ APK Android Offline-First (Capacitor)**

A aplicação utiliza uma base de código única para a interface web (SPA/PWA limpa em Vite/React ou HTML5 Vanilla com ESM) que roda nativamente em navegadores modernos e é empacotada em um binário Android APK via **Capacitor (Kotlin / Gradle)**.

## **3.1 Camada de Persistência Unificada (`StorageAdapter`)**

A camada de dados do cliente abstrai o ambiente de execução por meio de uma interface TypeScript unificada. A escolha da implementação concreta é feita em tempo de inicialização via `Capacitor.isNativePlatform()`.

```
// src/storage/StorageAdapter.ts

export interface StorageAdapter {
  get<T>(store: string, key: string): Promise<T | null>;
  set<T>(store: string, key: string, value: T): Promise<void>;
  query<T>(store: string, predicate?: (item: T) => boolean): Promise<T[]>;
  upsert<T extends { id: string }>(store: string, item: T): Promise<void>;
  enqueueSync(action: { type: string; payload: Record<string, unknown>; idempotencyKey: string }): Promise<void>;
  getPendingSync(): Promise<Array<{ id: string; type: string; payload: Record<string, unknown>; idempotencyKey: string; timestamp: number }>>;
  markSynced(id: string): Promise<void>;
  markConflict(id: string, reason: string): Promise<void>;
  saveFile(path: string, content: Blob | ArrayBuffer): Promise<string>;
  readFile(path: string): Promise<Blob>;
}
```

### **Implementação Web (`IndexedDbAdapter`)**

Utiliza `IndexedDB` para armazenar o espelho local das coleções (`partner_config`, `catalog_items`, `appointments`, `orders`, `conversations`, `messages`, `sync_queue`). Tokens de autenticação de sessão web utilizam cookies seguros com flag HttpOnly ou sessionStorage.

### **Implementação APK Android (CapacitorSqliteAdapter)**

Utiliza o plugin `@capacitor-community/sqlite` para gerenciar um banco SQLite nativo no ecossistema Android, permitindo consultas estruturadas de alta performance e suporte à fila de sincronização. Arquivos binários e relatórios PDF usam o plugin `@capacitor/filesystem`.

**Regra de Segurança de Tokens:** No APK Android, é **estritamente proibido** armazenar tokens JWT ou credenciais de API em `localStorage` ou `IndexedDB` em texto plano. O token de sessão deve ser armazenado na Android Keystore por meio do plugin capacitor-secure-storage-plugin ou equivalente com criptografia AES-256-GCM.

```
// src/storage/AdapterFactory.ts
import { Capacitor } from '@capacitor/core';
import { IndexedDbAdapter } from './IndexedDbAdapter';
import { CapacitorSqliteAdapter } from './CapacitorSqliteAdapter';
import type { StorageAdapter } from './StorageAdapter';

let instance: StorageAdapter | null = null;

export async function getStorageAdapter(): Promise<StorageAdapter> {
  if (!instance) {
    if (Capacitor.isNativePlatform()) {
      const sqlite = new CapacitorSqliteAdapter();
      await sqlite.initialize();
      instance = sqlite;
    } else {
      const idb = new IndexedDbAdapter();
      await idb.initialize();
      instance = idb;
    }
  }
  return instance;
}
```

## **3.2 Mapa de Disponibilidade Offline & Motor `sync_queue`**

```
                                  OFFLINE FIRST DATA FLOW
                                  
 [ Ação do Usuário no App ]
             |
             v
+--------------------------+
| Grava em DB Local        |
| (IndexedDB / SQLite App) |
+--------------------------+
             |
             v
+--------------------------+        Sem Conexão
| Enfileira em sync_queue  | ------------------------> [ Mantém Pendente no App ]
| (UUID Idempotency Key)   |                               (Exibe status sincronizando)
+--------------------------+
             |
             | Conexão Detectada (@capacitor/network)
             v
+-----------------------------------------------------------------------------------+
| WORKER DE SINCRONIZAÇÃO (Order FIFO)                                              |
|                                                                                   |
| POST /api/v1/sync                                                                 |
| Header: X-Idempotency-Key: <UUID>                                                 |
| Header: Authorization: Bearer <JWT Keystore>                                      |
+-----------------------------------------------------------------------------------+
             |
             +-----------------------+-----------------------+
             | 200 OK                | 409 CONFLICT          | 5xx Error
             v                       v                       v
+------------------------+  +--------------------+  +--------------------+
| markSynced(id)         |  | markConflict(id)   |  | Mantém na fila     |
| Apaga da sync_queue    |  | Exibe banner UI    |  | Tenta com Backoff  |
+------------------------+  +--------------------+  +--------------------+
```

A disponibilidade funcional é dividida em três níveis de conectividade:

### **(a) 100% Offline Nativo (Modo Avião)**

Navegação completa no aplicativo, leitura do catálogo de produtos e serviços, consulta à agenda de horários confirmados, visualização de pedidos efetuados, leitura do histórico de conversas previamente sincronizado e abertura de relatórios PDF salvos localmente.

### **(b) Offline com Fila de Sincronização (`sync_queue` \+ `X-Idempotency-Key`)**

Permite operações de criação, alteração e remoção local:

* Criar, editar ou desativar itens do catálogo;  
* Alterar configurações gerais, instruções do agente IA e horários de funcionamento;  
* Criar ou cancelar agendamentos e pedidos manuais;  
* Alternar a chave de interrupção manual (`soft-pause`);  
* Enfileirar mensagens enviadas pelo operador humano no chat.

**Protocolo de Sincronização:**

1. Cada operação offline gera um registro na tabela local `sync_queue` com uma chave única de idempotência (`idempotency_key` em formato UUIDv4).  
2. O serviço de monitoramento de rede (`@capacitor/network` em dispositivos móveis ou `navigator.onLine` no navegador) dispara a execução do worker de sincronização ao restabelecer a conexão.  
3. O worker processa a fila em ordem cronológica (FIFO), enviando cada item ao Gateway (Doc 02\) contendo o cabeçalho HTTP `X-Idempotency-Key: <UUID>`.  
4. O backend valida a chave no SQLite do servidor. Se a requisição já tiver sido processada anteriormente, retorna o resultado em cache sem duplicar efeitos colaterais.

**Resolução de Conflitos:**

* Para cadastros de catálogo e configurações do sistema, adota-se a estratégia *last-write-wins* acompanhada pelo envio e checagem do hash de versão (`version_hash`).  
* Para reservas de agenda que retornarem erro HTTP `409 CONFLICT` (`SLOT_TAKEN`), o item da `sync_queue` recebe o status `CONFLICT`. O aplicativo notifica o lojista com um alerta visual na interface sem interromper a execução dos demais itens pendentes da fila.

### **(c) Exige Internet (com Degradação Elegante)**

Operações que requerem conectividade ativa: pareamento inicial via QR Code no WhatsApp, recebimento de eventos via stream SSE, visualização em tempo real do estado do socket Baileys, testes diretos de prompt da IA e fluxo de autorização OAuth do Google Calendar.

Quando o dispositivo estiver sem acesso à rede, a interface do usuário exibe um banner informativo não bloqueante (*"Modo Offline — alterações salvas localmente e na fila de sincronização"*) e desabilita os botões dependentes de rede direta, preservando o uso do restante da aplicação.

## **3.3 Travas de Build Android (Capacitor / Kotlin / Gradle)**

Momento exato de acoplamento: O empacotamento da aplicação mobile com Capacitor deve ser iniciado exclusivamente na **Camada 6** do projeto — após as APIs do Gateway (Camada 5\) e a interface SPA/PWA cobrirem 100% dos testes de contrato e integração da `sync_queue` com a suíte `node:test`.

### **Configuração do Gradle Android (`android/app/build.gradle.kts`)**

```
plugins {
    id("com.android.application")
    kotlin("android")
}

android {
    namespace = "br.com.autonmax.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "br.com.autonmax.app"
        minSdk = 24
        targetSdk = 35
        versionCode = 10000
        versionName = "1.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = signingConfigs.getByName("debug") // Substituir por releaseKey em CI/CD
        }
    }
    
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation(fileTree(mapOf("dir" to "libs", "include" to listOf("*.jar"))))
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation(project(":capacitor-android"))
    implementation(project(":capacitor-community-sqlite"))
    implementation(project(":capacitor-filesystem"))
    implementation(project(":capacitor-secure-storage-plugin"))
}
```

### **Manifesto do Android (`android/app/src/main/AndroidManifest.xml`)**

```
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />

    <application
        android:allowBackup="false"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:usesCleartextTraffic="false"
        android:networkSecurityConfig="@xml/network_security_config"
        android:theme="@style/AppTheme">

        <activity
            android:name=".MainActivity"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
            android:exported="true"
            android:label="@string/title_activity_main"
            android:launchMode="singleTask"
            android:theme="@style/AppTheme.NoActionBar">

            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

### **Segurança de Rede (`android/app/src/main/res/xml/network_security_config.xml`)**

```
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
    <domain-config cleartextTrafficPermitted="true">
        <!-- Permitido exclusivamente para desenvolvimento local em emulador -->
        <domain includeSubdomains="false">10.0.2.2</domain>
        <domain includeSubdomains="false">localhost</domain>
    </domain-config>
</network-security-config>
```

### **Configuração do Capacitor (`capacitor.config.ts`)**

```
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.autonmax.app',
  appName: 'AUTONMAX vNext',
  webDir: 'app-web/dist',
  server: {
    androidScheme: 'https',
    cleartext: false
  },
  plugins: {
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      androidIsEncryption: true,
      androidBiometric: {
        biometricAuth: false,
        biometricTitle: "Autenticação Biométrica",
        biometricSubTitle: "Confirme sua identidade para acessar o banco local"
      }
    }
  }
};

export default config;
```

## **3.4 As 7 Invariantes Puras de Frontend (Conformidade Cross-Lab)**

A arquitetura de interface do Autonmax vNext adota 7 invariantes puras de frontend que garantem total desacoplamento, reuso e capacidade White-Label, mantendo absoluta agnóstica tecnológica quanto a frameworks, bibliotecas CSS, empacotadores ou bancos locais:

* **Invariante 1 — Separação Casca (Shell) vs. Miolo (Views):** Isolar toda navegação externa (barra superior, menu lateral, barra inferior, cabeçalho de marca) em `app-web/src/shell/`, completamente separada das telas funcionais em `app-web/src/views/` (Painel PME, Catálogo, Agenda, Pedidos, Chats/Soft-Pause, Pareamento QR). A Casca é controlada por `shell_enabled` (`true` por padrão no Vertical Puro; `false` quando embutido externamente pela Sala Central).  
* **Invariante 2 — Tokens Semânticos (Zero Estilo Hardcoded):** Proibido usar cores hexadecimais, fontes fixas ou assets de marca hardcoded dentro de `app-web/src/views/` ou componentes. Toda a UI consome exclusivamente variáveis CSS semânticas injetáveis em tempo de execução (`--surface-bg`, `--surface-card`, `--surface-border`, `--color-primary`, `--color-text`, `--color-text-muted`, `--color-success`, `--color-warning`, `--color-danger`, `--font-sans`, `--font-heading`, `--brand-name`, `--brand-logo-url`), garantindo White-Label nativo e unificação visual.  
* **Invariante 3 — UI Agnóstica de Runtime (Portas de Ambiente):** Expandir o padrão do `StorageAdapter` para um conjunto completo de **Portas de Ambiente (`app-web/src/ports/EnvironmentPorts.js`)** cobrindo: `storage` (persistência local), `network` (estado online/offline), `filesystem` (leitura/gravação de PDFs e anexos), `secureAuth` (armazenamento protegido de tokens), `clipboard` (copiar códigos/recibos), `share` (compartilhamento nativo/web) e `camera` (leitura/captura). Regra inviolável: arquivos em `app-web/src/views/` e componentes de UI **jamais** podem importar `@capacitor/*`, `IndexedDB` ou APIs nativas diretamente — tudo passa por `EnvironmentPorts`.  
* **Invariante 4 — Ergonomia Fluida (Toque ↔ Desktop):** Design *mobile-first* obrigatório: todos os elementos interativos possuem alvo de toque mínimo de `44x44px`; zero rolagem horizontal (`overflow-x: hidden` e layouts fluidos); todas as listagens/tabelas densas (Agenda, Pedidos, Catálogo, Atendimentos) convertem-se automaticamente em cartões empilhados em telas pequenas sem duplicar telas.  
* **Invariante 5 — Interface Dirigida por Configuração (FrontendInitConfig):** Um único código-fonte inicializado por `mountAutonmaxUI(container, config)` recebendo: `{ shell_enabled: true|false, ui_mode: 'guided'|'advanced', feature_flags: {...}, theme_tokens: {...}, output_actions: {...}, environment_ports?: {...} }`.  
  * `ui_mode: 'guided'` exibe fluxo simplificado/guiado (ideal para onboarding e operação enxuta); `ui_mode: 'advanced'` exibe controles completos (prompts, regras avançadas, webhooks, diagnósticos). Proibido duplicar telas por perfil.  
* **Invariante 6 — Transparência de Estado Operacional (Independente da Casca):** O indicador discreto e não bloqueante de conectividade (`ONLINE` \| `OFFLINE` \| `SYNCING` \| `CONFLICT`) reside em um componente reutilizável montado dentro da área operacional (não preso exclusivamente à Casca), garantindo visibilidade mesmo quando `shell_enabled: false`, com degradação elegante dos recursos online-only (QR, SSE, OAuth).  
* **Invariante 7 — Ações de Saída Injetáveis (OutputActions):** Todos os pontos de saída externa do Autonmax funcionam como *slots* configuráveis via `output_actions`:  
  * `exportAppointmentsPdf(payload)` (padrão local: gera/baixa PDF via `filesystem`/`share`)  
  * `exportOrdersPdf(payload)` (padrão local: gera/baixa PDF)  
  * `shareReceipt(payload)` (padrão local: `share` ou `clipboard`)  
  * `sendOperatorMessage(payload)` (padrão local: envia via API/fila offline)  
  * `exportCatalogData(payload)` (padrão local: download JSON/CSV)

Quando injetados externamente na inicialização, os slots delegam a ação ao host sem alterar o código interno das telas.

# **4\. Blueprints Oficiais de Deploy no Render (Free vs. Starter)**

## **4.1 Engenharia de Memória (Teto Rígido de 512 MB de RAM)**

Os planos *Free* e *Starter* da plataforma Render operam com um limite rígido de **512 MB de RAM**. Para garantir a estabilidade do processo e evitar o encerramento do container por estouro de memória (*Out-Of-Memory / OOM-Kill*), devem ser aplicadas as seguintes configurações de infraestrutura:

1. **Alocação de Heap do Node.js:** Definir a variável de ambiente `NODE_OPTIONS=--max-old-space-size=384`. Essa margem reserva 384 MB para o Heap da aplicação V8 e preserva aproximadamente 128 MB de memória para a execução do sistema operacional Linux, gerenciamento do protocolo TCP/WebSocket do Baileys e buffers de escrita WAL do SQLite.  
2. **Proibição de Dependências Pesadas:** É proibido executar ferramentas de automação baseadas em navegadores headless (`puppeteer` / Chromium) ou motores de IA executados localmente (`whisper.cpp`, Piper TTS).  
3. **Processamento de Voz em Nuvem:** A conversão de áudio para texto deve obrigatoriamente utilizar a integração via API externa (`VOICE_STT_DRIVER=cloud` apontando para Groq Whisper ou Google Gemini API), zerando a carga de memória local do servidor. O sintetizador de voz deve operar desativado (`VOICE_TTS_DRIVER=off`) ou utilizar chamadas a APIs de nuvem.  
4. **Manutenção do Armazenamento:** Execução periódica do procedimento de limpeza do SQLite (`PRAGMA wal_checkpoint(PASSIVE)`) e descarte de credenciais de pré-chaves expiradas do Baileys para conter a utilização de recursos.

## **4.2 Blueprint 1 — `render.free.yaml` (Modo Free — US\$ 0/mês — Testes & Homologação)**

```
# render.free.yaml — AUTONMAX vNext (Modo Free: US$ 0/mês — Testes, Demo & Homologação)
# ATENÇÃO: Plano Free possui disco efêmero e hiberna após 15 min sem requisições HTTP.
services:
  - type: web
    name: autonmax-vnext-free
    runtime: node
    region: oregon
    plan: free
    buildCommand: npm ci --omit=dev
    startCommand: node bin/start.js
    healthCheckPath: /health
    autoDeploy: true
    envVars:
      - key: NODE_VERSION
        value: 24.19.0
      - key: NODE_ENV
        value: production
      - key: NODE_OPTIONS
        value: --max-old-space-size=384
      - key: DB_PATH
        value: ./workspace/autonmax.db
      - key: SESSIONS_DIR
        value: ./workspace/sessions
      - key: VOICE_STT_DRIVER
        value: cloud
      - key: VOICE_TTS_DRIVER
        value: off
      - key: DEBOUNCE_WINDOW_MS
        value: "2500"
      - key: MAX_LINES_PER_PARTNER
        value: "2"
      - key: JWT_SECRET
        generateValue: true
      - key: INTERNAL_API_KEY
        generateValue: true
      - key: WEBHOOK_SIGNING_SECRET
        generateValue: true
      - key: CORS_ALLOWED_ORIGINS
        sync: false
      - key: GROQ_API_KEY
        sync: false
      - key: OPENAI_API_KEY
        sync: false
      - key: GEMINI_API_KEY
        sync: false
      - key: OPENROUTER_API_KEY
        sync: false
```

## **4.3 Blueprint 2 — `render.starter.yaml` (Modo Starter — Produção 24/7 com Disco Persistido)**

```
# render.starter.yaml — AUTONMAX vNext (Modo Starter: Produção 24/7 sem hibernação + Disco Persistido)
services:
  - type: web
    name: autonmax-vnext-prod
    runtime: node
    region: oregon
    plan: starter
    buildCommand: npm ci --omit=dev
    startCommand: node bin/start.js
    healthCheckPath: /health
    autoDeploy: true
    disk:
      name: autonmax-data
      mountPath: /var/data
      sizeGB: 2
    envVars:
      - key: NODE_VERSION
        value: 24.19.0
      - key: NODE_ENV
        value: production
      - key: NODE_OPTIONS
        value: --max-old-space-size=384
      - key: DB_PATH
        value: /var/data/autonmax.db
      - key: SESSIONS_DIR
        value: /var/data/sessions
      - key: VOICE_STT_DRIVER
        value: cloud
      - key: VOICE_TTS_DRIVER
        value: off
      - key: DEBOUNCE_WINDOW_MS
        value: "2500"
      - key: MAX_LINES_PER_PARTNER
        value: "2"
      - key: JWT_SECRET
        generateValue: true
      - key: INTERNAL_API_KEY
        generateValue: true
      - key: WEBHOOK_SIGNING_SECRET
        generateValue: true
      - key: CORS_ALLOWED_ORIGINS
        sync: false
      - key: GROQ_API_KEY
        sync: false
      - key: OPENAI_API_KEY
        sync: false
      - key: GEMINI_API_KEY
        sync: false
      - key: XAI_API_KEY
        sync: false
      - key: OPENROUTER_API_KEY
        sync: false
      - key: WEBHOOK_TARGET_URL
        sync: false
```

```

### 4.4 Matriz Comparativa (Render Free vs. Render Starter)

| Característica / Recurso | Render Free | Render Starter |
| :--- | :--- | :--- |
| **Custo Mensal** | US$ 0.00 / mês | ~US$ 7.00 / mês (serviço) + US$ 0.25/GB disco |
| **Comportamento de Hibernação** | Entra em hibernação após 15 minutos sem tráfego HTTP | **Sempre ativo (24/7/365)** sem hibernação |
| **Tipo de Disco Local** | Efêmero (dados são apagados no restart ou deploy) | **Persistido (Montagem em `/var/data`)** |
| **Teto de Memória RAM** | 512 MB de RAM | 512 MB de RAM |
| **Conexão WhatsApp (Baileys)** | Desconecta na hibernação; requer nova leitura de QR Code ao reiniciar | **Mantém o WebSocket ativo continuamente** |
| **Persistência do SQLite** | Perde agendamentos e histórico local a cada reinicialização | **Dados integrados e seguros contra deploys e restarts** |
| **Caso de Uso Recomendado** | Ambientes de homologação, demonstrações e testes automatizados | **Produção comercial para PME** |

### 4.5 Cálculo Justificado do Disco Persistido (`sizeGB: 2` para 12–24 Meses)

O provisionamento do disco rígido montado em `/var/data` no plano Render Starter com o tamanho de **2 GB** atende à projeção de consumo de dados para 12 a 24 meses por instância PME:

| Componente do Sistema | Estimativa Mensal | Carga Acumulada em 24 Meses |
| :--- | :--- | :--- |
| **SQLite `autonmax.db` + WAL**<br>*(Tabelas: `messages`, `appointments`, `orders`, `customers`, `audit_logs` e índices)* | ~500 mensagens/dia por parceiro (~1 KB médio por mensagem) = ~15 MB/mês em texto bruto. Incluindo índices B-Tree e logs de auditoria = ~20 MB/mês. | **~480 MB** (aloca-se ~500 MB considerando o tamanho das páginas do SQLite). |
| **Sessões e Chaves `baileys_auth`**<br>*(Até 2 linhas por parceiro)* | Armazenamento de tokens de sessão, credenciais de par de chaves e controle de estado do Baileys (com rotação e descarte ativo de pre-keys antigas). | **~30 MB** (tamanho estável limitado por rotina de faxina). |
| **Base de Conhecimento PME e Arquivos Temporários** | Até 5 documentos (PDF/Texto) por parceiro para consulta do agente IA + relatórios temporários de exportação. | **~100 MB** (com controle de cota de uploads). |
| **Margem Transacional WAL & Operações Internas** | Reservado para crescimento do arquivo de log transacional (`autonmax.db-wal`), execução de `VACUUM` e backups temporários locais. | **~370 MB**. |
| **Consumo Total Projetado (24 Meses)** | — | **~1,0 GB** |
| **Volume Provisionado (`sizeGB: 2`)** | — | **2,0 GB (50% de folga operacional)** |

O tamanho inicial de **2 GB** garante suporte operacional continuo por até dois anos sem riscos de indisponibilidade por escassez de armazenamento, mantendo custos previsíveis de infraestrutura. Caso a instância seja convertida para um ambiente multi-tenant com maior concorrência, o volume pode ser expandido na plataforma Render sem interrupção dos serviços.
```

