# Certificação Interna — Max Atendente (Autonmax)

| Campo | Valor |
|--------|--------|
| **Produto** | Max Atendente — funcionário digital WhatsApp + agenda PME |
| **Versão certificada** | 3.2.x (linha elite / bigtech / adversarial) |
| **Data** | 2026-09-02 |
| **Tipo** | Certificação interna de produto (não é auditoria externa ISO) |
| **Harness** | `tests/certification_adversarial_harness.js` |
| **Relatório JSON** | `workspace/reports/certification_adversarial_report.json` |

---

## 1. Escopo certificado

Esta certificação cobre **comportamento determinístico de código** nas superfícies:

- Persistência de agenda e painel PME (`attendants_db`, mirror, flush)
- Locks de slot (memória + disco) e concorrência
- Parsing de datas em português (`BookingDateTime.extractDateTime`)
- Hard-fail de catálogo e rejeição fora do expediente
- Soft-pause com preservação de contexto
- Fallback de STT (mensagem ao cliente)
- Regras de prompt (proibição de “equipe técnica” / upsell inventado)
- Higiene de workspace e Product Readiness

**Fora de escopo desta bateria:** sessão Baileys live, provedores LLM em rede, UI browser E2E, API oficial Meta.

---

## 2. Resultado da bateria adversária

| Métrica | Valor |
|---------|--------|
| Casos executados | **39** |
| Aprovados | **39** |
| Falhas | **0** |
| Taxa de sucesso | **100%** |

### Por suíte

| Suíte | Foco | Resultado |
|-------|------|-----------|
| `datetime` | amanhã/hoje/terça + formatFriendly | PASS |
| `panel` | normalização catálogo/horário, flush, reload | PASS |
| `booking` | create, double-book, catalog miss, fora de hora, cancel, slots | PASS |
| `concurrency` | **20** writes paralelos no mesmo slot → **1** sucesso no disco | PASS |
| `prompt` | ban equipe técnica + facts anti-upsell | PASS |
| `audio` | fallback pede texto | PASS |
| `pause` | global pause + buffer de contexto + resume | PASS |
| `ops` | hygiene, readiness, owner alert sem JID | PASS |
| `surface` | exports dos módulos críticos | PASS |
| `quality` | registro canónico + mirror | PASS |

### Ataques adversários cobertos

1. Double-book no mesmo horário  
2. 20 corridas paralelas no mesmo slot  
3. Serviço inexistente no catálogo  
4. Horário 23:00 fora do expediente  
5. Item de catálogo vazio / preço em formatos mistos  
6. “Crash” simulado (novo `PmeAgentConfigurator` lendo o disco)  
7. Pause + mensagens do cliente + resume  
8. Owner alert sem configuração (não pode derrubar o processo)

---

## 3. Correções aplicadas nesta linha (anti-regressão)

| Problema | Correção permanente |
|----------|---------------------|
| Perda de agenda no debounce 200ms | `flush()` síncrono em create/cancel/config |
| Double-book sob corrida | lock em disco `workspace/slot_locks/` + re-check |
| Catálogo inconsistente no painel | `normalizeCatalogItem` + `normalizeWorkingHours` |
| JSON único como SPOF | mirror por parceiro em `workspace/attendants_mirror/` |
| STT falha em silêncio | mensagem fixa pedindo texto |
| Soft-pause “apagava” contexto | buffer + fact na retomada |
| Fala de “equipe técnica” | prompts + facts invioláveis |
| Disco de logs infinito | `WorkspaceHygiene` |
| Write de mirror de todos os parceiros a cada flush | mirror só de parceiros **dirty** |

---

## 4. Critérios de “produto pronto para cliente”

Para operar com confiança comercial (ex.: plano R$ 249):

1. Deploy **desta** linha de código (não o backup antigo do Render)  
2. Host **sem sleep** + volume em `workspace/`  
3. Pelo menos uma key LLM; ideal Groq + Gemini  
4. Catálogo e horário preenchidos no painel  
5. Opcional: `OWNER_WHATSAPP_JID` para alerta de QR/offline  

Checklist de fumaça pós-deploy (manual, 5 min):

- [ ] `/health` responde  
- [ ] `/api/v1/product/readiness` sem `criticalFail` de workspace  
- [ ] WhatsApp pareado  
- [ ] “quero agendar amanhã às 10” → confirma e grava  
- [ ] Segundo cliente no mesmo horário → recusa  
- [ ] Pause no painel → Max não responde; resume → continua  

---

## 5. Declaração

Com base na bateria adversária automatizada de **2026-09-02**, o núcleo de **agenda, painel, concorrência, pause, áudio-fallback e regras de fala** do Max Atendente está **aprovado internamente** com **39/39** casos.

Assinatura de processo: harness `certification_adversarial_harness.js` + este documento + relatório JSON no workspace.

**Limite da certificação:** não substitui teste com WhatsApp real em produção nem SLA de uptime do provedor de hospedagem.

---

## 6. Como reexecutar

```bash
node tests/certification_adversarial_harness.js
```

Exit code `0` = certificação verde; `1` = há regressão.
