# Plano de implementação — Loja online enxuta do AUTON.MAX

**Escopo:** loja pública de produtos com retirada ou entrega combinada manualmente, sem cadastro/atribuição de motorista, sem rota de vendedor e sem otimização logística.

**Projeto:** `C:\Users\edini\Desktop\max_atendente_certificado`  
**Referência analisada:** `RAIO_X_ENGENHARIA_AUTONOMIA_ERP_2.2.1.md` (ERP Xiquim Vargas). As instruções e decisões do documento de referência não são requisitos para o AUTON.MAX; foram aproveitados apenas conceitos aplicáveis.

## 1. Resumo executivo

A recomendação é implementar a loja como uma nova superfície de venda integrada ao cadastro atual de produtos e à área atual de pedidos. O cliente acessa uma página pública, escolhe produtos e quantidades, informa contato, seleciona retirada ou entrega, revisa o total e envia o pedido. O AUTON.MAX grava o pedido como **PENDENTE**, mostra-o ao lojista para aceitar, preparar, marcar pronto/concluído ou cancelar e pode encaminhar uma notificação pelo WhatsApp.

Na entrega, o MVP registra endereço e instruções e deixa a combinação/transporte a cargo do lojista. Não há motorista, rota, geolocalização, comprovante de entrega ou promessa de rastreamento. Para serviços, a vitrine pode exibir os serviços já cadastrados e direcionar o cliente ao fluxo de agendamento existente; não se deve converter serviço em item de pedido de produto nem criar agenda paralela.

## 2. O que o raio-X oferece e o que faz sentido aproveitar

O raio-X descreve um ERP mais amplo, com loja, vendedores, rotas, motoristas, estoque, separação e entrega. Para o AUTON.MAX, as ideias aproveitáveis são:

- catálogo público com disponibilidade, preço e descrição;
- pedido com cliente, itens, quantidades, valores e forma de atendimento;
- distinção clara entre retirada e entrega;
- estados operacionais visíveis ao comerciante e ao cliente;
- validação do pedido e comunicação de confirmação;
- regras explícitas para mínimo de compra, prazo e política de atendimento.

Não se recomenda importar a arquitetura, os papéis de motorista/vendedor, roteirização, prova de entrega, compras/fornecedores ou o fluxo completo de ERP. Isso aumentaria o escopo e criaria dependências que não existem no AUTON.MAX.

## 3. Diagnóstico do AUTON.MAX observado

- O projeto é um monólito CommonJS em Node.js, com servidor HTTP nativo, páginas e JavaScript em `public/`, módulos organizados por `core/ring0`, `core/ring1` e `core/ring2`, e dependência `better-sqlite3`.
- `PmeAgentConfigurator` mantém `products` e `services`; produto inclui `id`, nome, preço em centavos, estoque, unidade, categoria, descrição e `active`. O cadastro de produto é a fonte que a loja deve reutilizar, sem duplicar catálogo.
- A API atual oferece operações de catálogo em `/api/v1/pme/:partnerId/products` e `/services`. Os handlers vistos não mostram autenticação local nesses blocos; essa superfície e as permissões precisam ser auditadas antes de criar endpoints públicos e administrativos novos.
- `PmeOrderTools.createOrder` persiste pedidos internos em `existingOrders` no arquivo JSON, grava preço recebido nos itens e inicia com `CONFIRMED`. A listagem/relatório atual lê esse array. O contrato atual não representa origem do pedido, endereço, retirada/entrega ou aceite/preparo.
- `public/pedidos.html` é um relatório interno de pedidos, não uma loja pública. A entrega de arquivos estáticos é feita pelo `HttpServer` lendo caminhos sob `publicDir`; a nova página precisa seguir a estrutura existente e tratar cuidadosamente a resolução de rotas/caminhos.
- `RuntimeCore` já inicializa SQLite e `PmeAppointmentEngine` usa transações para impedir colisões de agenda. Esse padrão transacional é pertinente para reservas de estoque e pedidos simultâneos, mas não se deve alterar o fluxo de agendamento de serviços para atender ao e-commerce.

**Conclusão técnica:** é viável compartilhar os produtos e integrar os pedidos na operação atual, mas não é seguro simplesmente aceitar o carrinho do navegador e chamar o método interno atual. A loja requer validação no servidor, uma máquina de estados própria e persistência/atualização atômica adequada.

## 4. Objetivos e limites do MVP

### Incluído

1. Ativação e configuração da loja por estabelecimento.
2. Página pública com identidade básica, produtos ativos e disponíveis, preço e informações de retirada/entrega.
3. Carrinho, validação de quantidade, mínimo de compra e cálculo do total no servidor.
4. Checkout sem exigir conta do cliente: nome e telefone; endereço obrigatório somente para entrega.
5. Pedido online com identificação única e estado inicial pendente de aceite.
6. Painel do lojista com fila de pedidos, detalhes e transições de estado válidas.
7. Notificação operacional por WhatsApp quando a integração já disponível for apropriada; falha de envio não pode perder o pedido.
8. Registro de origem online, histórico de mudanças e totais em centavos.
9. Fluxo de atendimento de serviços que aponta para os serviços cadastrados e para o agendamento já existente.

### Fora do MVP

- motoristas, cadastro de frota, rota de vendedor, roteirização, GPS, rastreio e comprovante de entrega;
- marketplace com múltiplas lojas em um mesmo carrinho;
- pagamento online/cartão ou confirmação automática de Pix;
- reserva de horário de serviço através do checkout de produto;
- promoções complexas, cupons, programa de pontos, nota fiscal e integração fiscal;
- controle avançado de estoque por depósito, lote ou variação de produto.

## 5. Experiência e fluxos

### 5.1 Comerciante: preparar a loja

1. Habilitar/desabilitar a loja e definir slug/URL pública estável.
2. Definir nome, descrição, contato, horário/instruções, retirada permitida e entrega permitida.
3. Definir pedido mínimo e, opcionalmente, taxa fixa de entrega e observação/área atendida em texto. No MVP, não calcular rotas nem validar CEP por geocodificação.
4. Marcar produtos já cadastrados como visíveis na loja e ajustar disponibilidade/estoque no cadastro existente.
5. Abrir a URL pública em uma prévia e conferir o que o cliente vê.

### 5.2 Cliente: comprar produto

1. Abrir URL pública da loja; ver apenas produtos ativos, publicados e disponíveis.
2. Adicionar produtos e quantidades ao carrinho. O preço mostrado é informativo até a confirmação do servidor.
3. Escolher retirada ou entrega, conforme configuração da loja.
4. Informar nome e telefone; para entrega, informar endereço e complemento/referência. Campo de observação é opcional e limitado.
5. Revisar itens, subtotal, taxa de entrega, total, mínimo e política de pagamento. MVP oferece pagamento na retirada/entrega ou instruções manuais definidas pela loja; nenhum pagamento pode aparecer como confirmado sem integração verificável.
6. Enviar uma vez e receber número do pedido e estado “Aguardando confirmação da loja”. Reenvio por falha de rede deve usar chave de idempotência para não duplicar.

### 5.3 Comerciante: atender pedido

1. Ver novo pedido com origem “Loja online”, contato, itens, valores, modo de atendimento e endereço somente quando necessário.
2. Aceitar ou recusar/cancelar, informando motivo quando recusado; aceitar inicia preparação.
3. Marcar como pronto para retirada ou pronto para combinar/realizar entrega. A entrega fica sob organização manual do comerciante.
4. Marcar concluído e, se necessário, cancelar conforme transições permitidas. Registrar quem/quando alterou o estado.
5. Notificação ao cliente informa o estado, mas deve evitar divulgar endereço ou detalhes sensíveis em logs/notificações indevidas.

### 5.4 Serviços

A área pública de serviços pode listar nome, descrição, preço indicativo e duração se estiverem publicados. A ação principal é “Agendar/consultar horário”, que usa o mecanismo de agendamento existente e suas validações. Não criar pedido de produto, reserva de estoque ou rota para serviço.

## 6. Modelo de dados recomendado

Fazer uma etapa curta de auditoria de SQLite/configurador e escolher uma fonte canônica antes de codificar. Não duplicar produtos. Manter leitura compatível dos pedidos históricos em `existingOrders`.

### Configuração da loja (por partnerId)

- `storeEnabled`, `storeSlug`, `storeDescription`;
- `pickupEnabled`, `deliveryEnabled`;
- `minimumOrderCents`;
- `deliveryFeeCents` (opcional, fixo e explicitamente configurado);
- `storeHours`/`fulfillmentInstructions` ou campos mínimos equivalentes;
- produto com `storeVisible` e eventual imagem/ordem de exibição, preservando `active`, `stock`, preço, unidade e demais atributos atuais.

### Pedido online

Tabela SQLite dedicada recomendada se a auditoria confirmar que os pedidos ainda vivem apenas no JSON. Campos mínimos: `id`, `partner_id`, `order_number`, `idempotency_key`, `source='ONLINE'`, `customer_name`, `customer_phone`, `fulfillment_mode` (`PICKUP`/`DELIVERY`), endereço estruturado quando entrega, observação limitada, subtotal/taxa/total em centavos, método e estado de pagamento, estado do pedido, timestamps e revisão/versão. Itens em tabela filha com `product_id`, nome/unidade/preço unitário capturados no momento da compra, quantidade e total da linha. Capturar nome e preço evita que uma alteração futura do catálogo reescreva o histórico.

Transições de estado sugeridas: `PENDING` → `ACCEPTED` ou `CANCELLED`; `ACCEPTED` → `PREPARING` ou `CANCELLED`; `PREPARING` → `READY` ou `CANCELLED`; `READY` → `COMPLETED` ou `CANCELLED`. O rótulo de `READY` varia na interface conforme retirada/entrega. Não introduzir `ROTA` ou atribuição de motorista.

### Estoque

- Sempre conferir preço, produto ativo/publicado e quantidade disponível no backend na criação do pedido; ignorar total/preço enviado pelo navegador.
- Definir em fase de auditoria se `stock` atual é realmente controlado ou apenas informativo. Se controlado, criar regra única e transacional: validar e reservar/decrementar apenas ao aceitar, ou reservar com expiração desde o pedido pendente; documentar e aplicar a mesma regra ao WhatsApp para não haver dupla venda.
- Se o WhatsApp e a loja não puderem compartilhar um bloqueio atômico de estoque na primeira entrega, exibir disponibilidade como sujeita à confirmação e não prometer estoque reservado. Não atualizar estoque com chamadas JSON concorrentes sem serialização/transação.
- Cancelamentos devem liberar reserva/devolver saldo exatamente uma vez, com registro auditável. Pedidos concluídos não liberam estoque.

## 7. Arquitetura e alterações por área

### Backend

- Adicionar serviço de domínio isolado para loja/pedido online no padrão dos módulos `core/ring1`/`core/ring2` existentes; manter regras fora dos handlers HTTP.
- Adicionar endpoints públicos de leitura para loja habilitada, catálogo público e criação do pedido. Exemplo conceitual: `GET /loja/:slug`, `GET /api/public/stores/:slug`, `POST /api/public/stores/:slug/orders`.
- Adicionar endpoints de administração autenticados e sempre escopados por `partnerId`: leitura/atualização da configuração, listagem/detalhe e transição de estado. Exemplo: `/api/v1/pme/:partnerId/store` e `/api/v1/pme/:partnerId/online-orders/:id`.
- Usar parâmetros SQL, validação de entrada, limite de corpo, rate limit básico e resposta sem dados privados em endpoints públicos. Verificar no servidor que a sessão autenticada pertence ao `partnerId` em rotas administrativas; não confiar em `partnerId` enviado no corpo/URL sem autorização.
- Manter pedido criado mesmo se notificação WhatsApp falhar; usar tentativa/retry observável, sem criar outro pedido.
- Atender idempotência, chave de pedido público não enumerável, limites de comprimento e proteção contra abuso. Não expor dados de outros parceiros pelo `slug` ou `partnerId`.

### Frontend

- Criar página pública responsiva dentro de `public/`, reaproveitando tipografia/estilos locais quando razoável e sem tornar a loja dependente de login do painel.
- Incluir configuração de loja no painel existente, usando os controles e padrões já adotados em `public/index.html` e `public/app.js`.
- Adaptar `public/pedidos.html` ou criar aba/lista dedicada para destacar “Loja online” e permitir transições. Preservar listagem/relatório dos pedidos WhatsApp existentes.
- Renderizar conteúdo de catálogo com escape de texto; nunca inserir HTML vindo do nome/descrição diretamente. Tratar carregamento, loja fechada/desabilitada, catálogo vazio, produto esgotado, erro de rede e confirmação de pedido.

### Persistência e migração

- Fazer migrações SQLite idempotentes no padrão já usado por `RuntimeCore` e iniciar tabelas/índices com os demais componentes.
- Garantir transação para criação, cálculo total, idempotência e baixa/reserva de estoque. Considerar chave única para `idempotency_key` por loja e índices por parceiro/estado/data.
- Preservar JSON existente como compatibilidade/configuração conforme o resultado da auditoria. Não fazer migração destrutiva nem regravar pedidos legados automaticamente sem backup e comparação.
- Definir adaptação para que relatórios existentes possam exibir pedidos online sem corromper o contrato antigo. A opção mais simples pode ser um leitor agregado que normaliza ambos os formatos; evitar escrever pedido online diretamente em `existingOrders` se não houver atomicidade/concorrência.

## 8. Segurança, privacidade e confiabilidade

- Separar rotas explicitamente públicas das rotas de gestão; todas as mutações de catálogo/configuração/status devem exigir sessão e autorização do lojista correto.
- Nunca confiar em preço, total, taxa, estoque ou estado fornecidos pelo navegador.
- Validar telefone, quantidades inteiras/decimais segundo unidade, endereço condicional, tamanho de texto, número de itens e produto pertencente à loja.
- Guardar apenas dados necessários; restringir endereço completo ao painel autorizado e ao pedido em si. Redigir telefone/endereço em logs de erro.
- Usar HTTPS na implantação pública, cookies/tokens com política adequada e proteção contra CSRF quando baseada em cookie; configurar CORS de forma restrita, sem curingas para endpoints administrativos.
- Rate limit de consulta/criação, resposta anti-enumeração e limites por IP/loja; CAPTCHA só se abuso real justificar.
- Fazer backup e retenção definida; auditar mudanças de estado e ações do lojista.
- Resolver e validar caminhos estáticos sob `publicDir` para evitar path traversal ao introduzir rotas de slug; slug deve aceitar apenas formato restrito.

## 9. Sequência de implementação

### Fase 0 — Auditoria e decisões técnicas

1. Confirmar estrutura real de autenticação e autorização nas rotas de catálogo/pedidos; identificar middleware e superfície pública atual.
2. Confirmar como o SQLite é obtido pelo `RuntimeCore`, inicialização e backup; mapear configuração JSON e eventual divergência com `pme_configs_v2`.
3. Verificar semântica de `stock` e se pedidos WhatsApp alteram saldo; escolher regra comum de concorrência.
4. Definir formato do slug, limites da loja, taxa, pagamento manual e política de cancelamento.
5. Definir compatibilidade do painel de pedidos e relatórios.

**Saída:** decisão de fonte de verdade para loja/pedidos/estoque, contratos e migração reversível documentados.

### Fase 1 — Base do domínio e API

1. Criar migrações e modelos mínimos de configuração, pedido e itens, ou adaptar contratos existentes somente se transação e compatibilidade forem demonstradas.
2. Criar validação central de catálogo e total; adicionar criação idempotente e estados/transições válidos.
3. Implementar rotas públicas de leitura/criação com escopo pela loja habilitada.
4. Implementar rotas autenticadas de configuração, listagem/detalhe e transição.
5. Expor pedidos online na leitura unificada do painel/relatórios sem alterar registros antigos.

**Pronto quando:** não é possível alterar preço/partnerId/estado pelo cliente, duplicar pedido por retry ou aceitar transição inválida; dois checkouts simultâneos não vendem além do estoque controlado.

### Fase 2 — Loja pública e configuração

1. Implementar configuração mínima no painel: habilitação, slug, retirada/entrega, mínimo, taxa fixa e instruções.
2. Adicionar publicação/ordem dos produtos ao cadastro existente.
3. Implementar catálogo público, carrinho e checkout mobile-first.
4. Adicionar tela de confirmação e consulta de estado por token aleatório e limitado, sem expor lista de clientes.
5. Adicionar página de serviços com encaminhamento ao agendamento atual, se isso couber sem duplicar interface e regras.

**Pronto quando:** todos os estados de interface e combinações inválidas têm mensagens claras; conteúdo do catálogo é escapado; nenhuma página de painel fica acessível como endpoint público por engano.

### Fase 3 — Operação, notificações e compatibilidade

1. Incluir novos pedidos na fila do lojista, diferenciando origem e modo de atendimento.
2. Implementar ações de aceitar, preparar, pronto, concluir e cancelar com histórico.
3. Integrar aviso WhatsApp de novo pedido e atualização ao cliente, com retry e falha visível.
4. Validar coexistência com pedidos feitos via WhatsApp e com os relatórios PDF/local.
5. Criar logs de auditoria sem dados pessoais desnecessários e mecanismo de suporte/reprocessamento de notificação.

### Fase 4 — Piloto e liberação gradual

1. Habilitar inicialmente para conta de teste/lojistas opt-in.
2. Acompanhar criação, duplicidade, divergência de total, conflito de estoque, taxa de recusa, falhas de notificação e tempo em estado pendente.
3. Corrigir problemas antes de ativar por padrão; manter chave de desligamento imediato por loja.
4. Após dados do piloto, decidir se precisa de pagamento integrado ou logística — como etapas separadas, não condição para a loja básica.

## 10. Plano de verificação dos fluxos

Na implementação, cobrir testes automatizados e um roteiro manual de ponta a ponta. Casos mínimos:

1. Loja desativada/slug inexistente não revela catálogo nem aceita pedido.
2. Loja ativa mostra somente produto ativo, publicado e em estoque; produto privado, inativo e esgotado não pode ser pedido.
3. Produto removido/desativado ou preço alterado entre abrir carrinho e enviar é validado com o catálogo atual; o cliente recebe total correto ou erro recuperável.
4. Quantidade inválida, carrinho vazio, mínimo não atingido e taxa de entrega habilitada/desabilitada são tratados corretamente.
5. Retirada não exige endereço; entrega exige endereço; modo não permitido é rejeitado no servidor.
6. Cliente envia pedido com pagamento manual e vê estado pendente; comerciante aceita, prepara, marca pronto e conclui; painel e relatórios mostram o mesmo total.
7. Comerciante recusa/cancela; estoque reservado é liberado uma vez, se aplicável.
8. Retry/reenvio da mesma submissão retorna o mesmo pedido; duas submissões distintas criam dois pedidos.
9. Checkout concorrente com estoque limitado não aceita quantidade maior que a disponível, segundo a regra escolhida.
10. Usuário de uma loja não lê, atualiza, cancela ou transiciona pedido de outra loja; endpoint público não expõe telefone/endereço de pedidos alheios.
11. Falha do WhatsApp não apaga pedido nem gera cópia; retry da notificação não repete a venda.
12. Pedido legado via WhatsApp continua aparecendo no relatório atual e não é alterado por migração/consulta da loja.
13. Serviço listado leva ao agendamento já existente e não baixa estoque nem entra como produto.
14. Revisão manual em navegador móvel/desktop, navegação por teclado, estados de erro e recarregamento após confirmação.

## 11. Riscos e decisões em aberto

- **Estoque inconsistente:** hoje produtos guardam `stock`, mas o método observado `PmeOrderTools.createOrder` não verifica catálogo nem reduz saldo. É preciso acordar se o valor representa saldo real e alinhar a regra com pedidos de WhatsApp.
- **Persistência JSON:** o configurador grava com debounce. Esse padrão pode ser adequado para configuração simples, mas não deve sustentar sozinho vários checkouts concorrentes e mutações de estoque; preferir transações SQLite para o livro de pedidos online.
- **Segurança existente:** handlers atuais de produtos/serviços e pedidos analisados não deixam claro o enforcement local de sessão. Auditar o ciclo completo do `HttpServer` antes de expor rotas ou ampliar as permissões; a loja pública deve ter allowlist explícita.
- **Pagamento:** sem provedor integrado, “pedido recebido” não significa “pedido pago”. O painel e os comprovantes devem deixar esse estado inequívoco.
- **Atendimento da entrega:** sem motorista/rota, o comerciante assume combinar horário e transporte. Comunicar isso no checkout para evitar expectativa de rastreio.
- **Produto por peso/variação:** o MVP deve restringir quantidade a inteiro por unidade ou definir decimal de forma consistente; não aceitar ambiguidades.

## 12. Critérios de aceite do MVP

- Lojista consegue habilitar e configurar sua loja sem editar arquivo ou chamar API manualmente.
- Cliente consegue encontrar produto, fechar pedido com retirada ou entrega e receber número/status sem criar conta.
- Valores e itens são recalculados pelo backend com catálogo vigente e persistidos de modo idempotente.
- O comerciante consegue aceitar, preparar, marcar pronto, concluir ou cancelar; mudanças aparecem corretamente no painel.
- O mesmo catálogo atende loja e agente, sem duplicação de produto; serviço segue exclusivamente pelo fluxo de agendamento.
- Entrega funciona sem motorista, vendedor em rota, GPS ou roteirização e comunica claramente a organização manual.
- Pedidos online coexistem com pedidos WhatsApp e relatórios atuais; dados históricos permanecem íntegros.
- Não há exposição cruzada entre lojistas, criação duplicada por retry ou venda acima do estoque configurado sob concorrência.
- A loja pode ser desabilitada imediatamente por parceiro e globalmente por configuração operacional.

## Recomendação final

Implementar primeiro a loja de **produtos**, com retirada e entrega manual, estados `PENDING` a `COMPLETED/CANCELLED`, pagamento ainda fora do sistema e painel único de operação. Reaproveitar o cadastro atual e o contexto de parceiro, mas criar persistência transacional para novos pedidos após confirmar a integração do banco. Expor serviços em paralelo somente como catálogo que encaminha ao agendamento existente. Esta delimitação entrega a ideia útil do raio-X sem importar a logística de vendedores e motoristas.
