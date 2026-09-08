# Deploy Max Atendente — 1 cliente = 1 Render

## Sobre a mensagem ruim que você viu

A resposta com “aguardando confirmação da equipe técnica”, “Plano Premium” e link inventado veio da **versão antiga** no Render (backup inicial), **sem** as correções desta linha de código.

Depois do deploy desta pasta, o Max:

- confirma agenda **sozinho** (nunca “equipe técnica”);
- só usa serviços/preços do **catálogo**;
- não inventa upsell nem links.

## Plano free do Render — limite real

No **free**, o serviço **dorme** sem tráfego (~15 min). Quando dorme:

- o processo Node para;
- a sessão Baileys cai;
- o primeiro “boa tarde” pode demorar (cold start) ou o comportamento fica inconsistente até reconectar.

O keep-alive interno (5 min) **ajuda só enquanto o processo está acordado**. Não substitui plano pago nem ping externo 24/7.

**Recomendação produção:** plano que **não desliga** + **disco persistente** em `/workspace` (ou path que o app use para `workspace/`).

## Checklist de deploy (por cliente)

1. Repo/GitHub com este código  
2. Web Service no Render → `npm start`  
3. Env vars (não commitar `.env`):
   - `GROQ_API_KEY` e/ou `GEMINI_API_KEY` (ideal: os dois)
   - `OWNER_WHATSAPP_JID` = DDI+DDD+número do dono (alerta de QR)
   - `RENDER_EXTERNAL_URL` = URL pública do serviço
   - `HYGIENE_MAX_AGE_DAYS=14` (opcional)
4. **Persistent Disk** montado onde o app grava `workspace/` (sessions, agenda, pause)  
5. Deploy → abrir painel → escanear QR  
6. Cadastrar catálogo + horário de funcionamento  
7. Testar: oi · agendar amanhã às 9 · áudio · pausar atendimento  

## O que este código já faz sozinho

| Item | Status |
|------|--------|
| Soft reconnect WA sem apagar creds | sim |
| Soft-pause sem desconectar Baileys + contexto | sim |
| STT falha → pede texto | sim |
| Agenda com catálogo + data legível | sim |
| Rotação de logs/replay antigos | sim |
| Alerta ao dono se WA offline (se `OWNER_WHATSAPP_JID`) | sim |
| Health com estado do WhatsApp | sim |

## O que o free Render não resolve sozinho

- Spin-down / sono do free tier  
- Disco efêmero sem Persistent Disk (QR de novo após redeploy)  
