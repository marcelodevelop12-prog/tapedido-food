# Estado do projeto

Atualizado ao fim de cada task. O que é permanente fica no `CLAUDE.md`;
aqui fica o que muda.

## Onde estamos

**Plano ativo:** `docs/superpowers/plans/2026-07-31-fundacao-passos-0-3.md`
**Task atual:** Features do anúncio (5 e 6 bloqueadas — ver abaixo)
**Spec:** `docs/superpowers/specs/2026-07-31-remodelagem-tapedido-design.md`

## Contexto que não está no código

- Os primeiros lojistas reais entram em **01/08/2026**. Antes disso o schema é
  livre; depois, toda mudança de tabela vira migração com dado de cliente.
- O app do garçom é outro repositório: `C:\Users\ANDERSON\tapedido-food-garcom`,
  publicado em https://tapedido-food-garcom.vercel.app
- Referência de regra de negócio para delivery: `C:\Users\ANDERSON\DEPGEST`
  (mesmo domínio, TypeScript). `MecOS-APP OFICINA` foi avaliado e descartado —
  domínio de oficina mecânica, sem sobreposição.
- O anúncio promete 8 recursos que ainda não existem. Levantamento completo na
  seção 2 do spec.

## Decisões tomadas

| Data | Decisão | Motivo |
|---|---|---|
| 31/07 | Segurança antes de qualquer feature | Janela sem base instalada fecha em 01/08 |
| 31/07 | Todo o schema entra de uma vez na Task 2 | Depois de 01/08 vira migração arriscada |
| 31/07 | Baixa de estoque desconta o próprio produto, não ficha técnica | É o que o anúncio promete; sem cadastro extra |
| 31/07 | Testes só nos caminhos de dinheiro e estoque | Pega o que custa dinheiro sem virar projeto de testes |
| 31/07 | `db.js` fatiado por domínio junto de cada feature | Evita refatoração grande sem testes |
| 31/07 | Trabalhar direto na `main` | Projeto de um dev só, prazo de um dia; cada task commita separada e reverte sozinha |
| 31/07 | Não publicar nada por ora; features primeiro | Publicar em duas etapas dobraria o risco na véspera; sai tudo numa release só |

## Concluído

### Task 1 — Baseline limpo e memória do agente (31/07)

- Trabalho de segurança de 30/07 commitado em `4b8dddd1` (JWT no PDV, três
  Edge Functions, spec do app do garçom). Verificado antes de commitar que o
  diff não toca em caixa, pedido nem estoque.
- Removidos 7 worktrees abandonados em `.claude/worktrees/`, todos com último
  commit de maio/2026.
- Criados `CLAUDE.md` e este arquivo.

### Task 2 — Schema definitivo (31/07, `72d0fa36`)

Todas as colunas das 8 features entraram de uma vez, antes de existir dado de
cliente. Verificado que aplicam num banco novo e que o índice único parcial
recusa baixa dupla do mesmo pedido, aceita outro produto no mesmo pedido e não
atrapalha entrada manual repetida.

### Task 3 — Infraestrutura de teste (31/07, `5d38b50d`)

`npm test` passa a existir. Três obstáculos caíram: o ABI do `better-sqlite3`
(resolvido rodando sob `ELECTRON_RUN_AS_NODE`), o caminho fixo do banco
(`TAPEDIDO_DB_PATH`), e o `postcss.config.js` em ESM que o Node 18 lia como
CommonJS (config de postcss inline no `vitest.config.js`).

### Task 4 — Testes dos caminhos de dinheiro (31/07, `80af3df2`)

19 testes em 4 arquivos, todos verdes. Congelam o comportamento atual de
pedido, caixa, dashboard e relatórios.

### Task 5 — App do garçom adota o JWT (31/07, parcial)

Código pronto e compilando, commitado em `6f0cb89` no repo do garçom. **Teste
end-to-end e publicação pendentes** — ver bloqueio abaixo.

O que mudou lá: `src/lib/sessao.js` novo, `accessToken` no cliente Supabase com
fallback para a chave anon, e a validação migrou da tela de código da loja para
a de login (a Edge Function recebe os dois códigos juntos). Isso também fechou
uma brecha: a tela antiga respondia se um código de loja existia, o que
permitia varrer códigos válidos.

### Feature 1 — Impressora térmica de verdade (31/07, `460e14cb`)

O stub vazio virou `electron/database/impressao.js`. Cupom e comanda são
montados uma vez como lista de linhas e despachados para USB (spooler do
Windows, via `electron-pos-printer`) ou rede (ESC/POS cru em socket TCP na
porta 9100) — são transportes sem nada em comum além do texto.

Na tela de configuração, o nome da impressora deixou de ser digitado e virou
lista das instaladas: um espaço a mais no nome fazia a impressão falhar calada.
Tem botão de cupom de teste, que salva a configuração antes de imprimir.

Acentos são removidos de propósito — impressora térmica tem code page
inconsistente e "ção" saía como lixo.

### Feature 2 — Leitor de código de barras (31/07, `2eac7e60`)

`src/hooks/useLeitorCodigoBarras.js` + `produtos.buscarPorCodigoBarras`.

O leitor USB não tem driver: ele se apresenta como teclado. O que o distingue
de alguém digitando é a velocidade — mais de 60ms entre teclas reinicia o
buffer. Código não cadastrado e produto desativado dão mensagens diferentes,
porque são problemas diferentes para o lojista.

### Feature 3 — Adicionais e observação por item (31/07)

`src/pages/Pedidos/ModalItem.jsx` + `src/lib/precoItem.js`.

Clicar num produto que tem adicionais cadastrados abre o modal; produto sem
adicionais continua entrando direto no carrinho com um clique — o caminho
rápido do balcão não podia ficar mais lento. Qualquer linha do carrinho ganha
observação pelo lápis, inclusive produto sem adicionais.

A conta de preço saiu da tela para `src/lib/precoItem.js` e ganhou teste: o
componente React não é testável sob o runtime atual. De quebra, todo valor
agora volta arredondado em centavos — antes `12.90 + 2.50` entrava no pedido
como `15.400000000000002`.

O item guarda `precoBase` separado de `precoUnitario`; sem isso, editar os
adicionais de uma linha somaria duas vezes o que já estava embutido no preço.

### `JWT_SECRET` — resolvido (31/07)

O secret foi cadastrado e a Edge Function `entrar` saiu do 503. Testada de
ponta a ponta:

| Cenário | Resultado |
|---|---|
| Loja `4W48D8` + código `4321` | 200, token com `loja_id` certo |
| Token levado ao PostgREST | **200 — o Postgres valida a assinatura** |
| Código de garçom errado | 403 `Credenciais invalidas` |
| Loja inexistente | 403 (mesma mensagem — não dá para enumerar lojas) |
| Campos vazios | 400 |
| PDV, máquina errada | 403 `Licenca em uso em outra maquina` |
| PDV, licença revogada | 403 `Licenca revogada` |

O teste do PostgREST era o que importava: prova que o segredo cadastrado é
mesmo o do projeto. Com um valor aleatório, o token seria emitido normalmente
e só falharia depois da virada da RLS — quando já seria tarde.

### Feature 4 — Baixa automática de estoque (31/07)

`pedidos.criar` passou a descontar o estoque dentro da **mesma transação** do
pedido: ou os dois entram, ou nenhum entra. É o único caminho que cria pedido
no sistema, então não há venda que escape.

Três coisas que o caminho exigiu e não eram óbvias:

- **A venda de mesa não mandava o id do produto.** `Mesas.jsx` montava os itens
  só com nome, quantidade e preço. Sem o id, a baixa não teria como acontecer —
  e o pedido entraria normal, sem nada indicando o motivo.
- **O item vindo do garçom traz UUID do Supabase, não o id local.**
  `resolverMenuItemId` traduz pela coluna `menu_items.supabase_id`.
- **Linhas repetidas do mesmo produto viram uma baixa só.** Dois X-Burguer com
  observações diferentes são duas linhas; sem somar antes, o índice único
  recusaria a segunda em silêncio e o estoque ficaria alto.

A idempotência é do banco (`idx_estoque_ref`), não de heurística em código —
`INSERT OR IGNORE` e o saldo só muda se a linha entrou. Isso é o que segura o
eco do realtime chegando junto com o PDV.

Junto veio `itens_pedido.custo_unitario`, congelado no momento da venda. Sem
ele, o relatório de custo × lucro leria o custo atual e uma alta do fornecedor
reescreveria o lucro de meses já fechados — sem volta.

Efeito colateral bom: o alerta de estoque baixo do Dashboard já existia mas era
letra morta, porque o estoque só mexia por lançamento manual. Agora ele vale.

### Feature 5 — Entregadores e kanban de delivery (31/07)

**Cadastro de entregadores** em Configurações → Entrega, junto das zonas: é a
mesma decisão do lojista, na mesma tela. Backend ganhou `atualizar` e `deletar`
(com whitelist de colunas, igual `pedidos.atualizar`).

`deletar` **desativa, não apaga**. `pedidos.entregador_id` aponta para lá;
apagar a linha faria o pedido antigo perder o nome de quem entregou. Por isso
`listar()` devolve só os ativos por padrão e `listar(true)` inclui os inativos
— é assim que a tela permite reativar quem voltou.

**Kanban** substituiu a lista com filtros. Quatro colunas do fluxo (Novos,
Preparando, Prontos, A Caminho); entregue e cancelado saem para a aba
Finalizados, senão no fim do dia a tela vira uma parede de pedidos que ninguém
precisa mais olhar. Pedido de mesa entra já como `entregue` e nunca aparece no
fluxo.

Cada card mostra **há quanto tempo está parado naquela etapa** — âmbar aos 15
min, vermelho aos 30. É o número que evita o pedido esquecido; a hora de
entrada não diz nada depois que o salão enche.

Isso exigiu `pedidos.atualizar` carimbar `status_alterado_em` **só quando o
status muda**. `atualizado_em` não serve: ele muda também ao trocar o
entregador, e o cronômetro da etapa zeraria sem o pedido ter andado.

### Feature 6 — Categorias, custo × lucro e PDF (31/07)

**Bug de dinheiro encontrado e corrigido.** `relatorios.vendas` somava pedidos
*e* `caixa_movimentacoes`, mas — ao contrário do dashboard — não excluía
`tipo_entrega = 'mesa'`. Toda venda de salão aparecia **em dobro** no relatório.
Uma venda de R$ 60 virava R$ 120. Provado com teste antes de corrigir; o teste
ficou.

**Custo × lucro** (`relatorios.custoLucro`) usa o `custo_unitario` congelado em
`itens_pedido` pela Feature 4, não o cadastro atual. Mesa entra aqui (itens de
mesa só existem em `itens_pedido`, não há segunda fonte para duplicar).
Produto sem custo cadastrado é marcado: senão o lucro sairia igual à receita e
o lojista formaria preço em cima de um número inflado.

**PDF** passou a exportar a aba aberta. Antes o botão gerava sempre a tabela de
vendas — pedir o relatório de estoque devolvia o de vendas, sem aviso.

**Categorias** deixaram de ser lista fixa no código. A tabela `categorias` já
existia e nunca era usada; agora é semeada com as mesmas 6 categorias que
estavam no código, então o primeiro dia é idêntico para quem já usa.

Renomear reescreve a categoria dos produtos, porque `menu_items.categoria`
guarda o **nome**, não o id — sem isso os produtos apontariam para uma
categoria inexistente e sumiriam dos filtros. Remover é recusado enquanto
houver produto usando, com a contagem na mensagem.

## 🚧 BLOQUEIO ATIVO — a virada da RLS depende de release publicada

Descoberto ao testar: **o JWT do PDV não está na versão que os clientes têm.**
A tag `v1.2.0` aponta para `f720c792`; o commit que ensina o PDV a pegar token
é `4b8dddd1`, posterior. Ou seja, todo PDV instalado hoje fala com o Supabase
usando a chave anon crua.

Existe uma licença real ativada em máquina de cliente (loja
`ed3a1bc2-dfc9-4fd0-b1be-0102cc80d191`). Virar a RLS antes de esse PDV estar
atualizado **para a sincronização dele** — silenciosamente, porque o cliente
não vê erro de RLS, vê dado que não chega.

Ordem obrigatória:

1. Publicar o app do garçom (Vercel). Seguro: sem token, cai no fallback anon.
2. Publicar release do PDV com o JWT. Mesmo fallback.
3. **Confirmar que o PDV do cliente real atualizou e está pegando token** —
   dá para ver nos logs da função `entrar`.
4. Só então virar a RLS.

O passo 3 é o portão e não dá para apressar: depende do auto-update chegar na
máquina do cliente. Enquanto a RLS não vira, nada está quebrado — mas os dados
das 10 tabelas seguem legíveis por qualquer um com a chave anon.

## Próximo

1. Publicar o app do garçom e uma release do PDV (ambos pedem confirmação —
   são ações para fora).
2. Task 6: virada da RLS, só depois de confirmar que o PDV do cliente real
   está pegando token.

Features restantes do anúncio, na ordem de risco de reclamação:

4. Baixa automática de estoque em `pedidos.criar`, com o ledger idempotente
   que a Task 2 já preparou.
5. Cadastro de entregadores (tela) e kanban de delivery de verdade.
6. Categorias personalizadas, relatório de custo × lucro e exportação em PDF.

## Rodada de ajustes pós-teste (31/07, antes da release)

O usuário testou o app e trouxe 13 itens. Pedido explícito: o item 2
(estoque como insumo) fica por último porque exige decisão de modelagem —
os outros 12 entraram nesta sessão.

**Bugs corrigidos, todos com a mesma causa raiz: o mock de
`src/lib/api.js` (modo browser/preview) guardava dados fixos, sem estado.**
Cada "ação" no mock devolvia sempre a mesma resposta, então a tela seguinte
(`carregar()`) sobrescrevia a atualização otimista com o dado velho.

- **Item 9** — Financeiro: `pagarConta`/`receberConta` no mock não mutavam a
  lista; `contasPagar`/`contasReceber` viraram arrays mutáveis no escopo de
  `mockApi()`, igual o padrão já usado em `entregadores`/`categorias`.
- **Item 11** — Caixa: `sessaoAtual()` no mock devolvia sempre uma sessão
  aberta fixa, e `fechar()` não zerava nada — por isso "reabria sozinho".
  Agora há um `caixaSessao` mutável; `fechar()` põe `null` e `abrir()` cria
  sessão nova com totais zerados.
- **Item 13** — Mesas: o listener `onComandaFechada` (evento vindo do app do
  garçom via IPC) chamava `api.mesas.listar()` — um replace completo pelo
  SQLite local, cuja coluna `status` não reflete mesas que o garçom abriu
  direto no Supabase. Piscava as outras mesas como livres por alguns segundos
  até o próximo evento corrigir. `useRealtimeMesas` já tem assinatura própria
  e mais precisa em `comandas`; o listener agora só recarrega `comandas`.

**Backend real (Electron/SQLite) verificado correto nesses três — só o
mock estava errado.** Não testado ao vivo em Electron desta vez (app não foi
aberto nesta sessão); os 84 testes de Vitest continuam verdes e o
`build:react` segue limpo.

**Features novas:**

- **Item 1** — menu lateral: "Pedidos" reordenado para logo após "Dashboard"
  (`src/components/Layout.jsx`).
- **Item 3** — logo da loja: campo `lojas.logo` (coluna já existia, nunca
  usada) recebe upload por `<input type="file">` + `FileReader` → data URL,
  sem IPC novo. Ainda não é impresso no cupom térmico (`impressao.js` é só
  texto) — se isso for esperado, é tarefa separada.
- **Item 4 e 5** — Configurações → Licença perdeu o bloco duplicado (2º
  "Comprar Licença", "Falar com Suporte", "2ª licença 40% off") e a caixa
  "Sobre o TáPedido Food" redundante com a aba própria. A aba Sobre passou a
  mostrar tipo de licença + versão, perdeu a seção Suporte e a frase sobre
  SQLite; manteve "Verificar Atualizações".
- **Item 10** — upload de imagem do produto: o caminho Electron
  (`window.api.imagem.salvar`, diálogo nativo) já existia e funcionava; só
  não aparecia fora do Electron. Adicionado fallback com
  `<input type="file">` + data URL para quem testa pelo browser.
- **Item 8** — responsável do caixa: colunas `caixa_sessoes.aberto_por` /
  `fechado_por` (migration idempotente), campo obrigatório no modal de
  abrir/fechar, exibido como "Aberto por" no resumo. Não existe tela de
  histórico de sessões passadas — ficou só no registro da sessão atual.
- **Item 7** — cadastro de clientes: tabela `clientes` nova (telefone como
  chave única). `pedidos.criar` grava/atualiza o cliente sempre que
  `tipoEntrega !== 'mesa'` (mesa não tem telefone real). No Novo Pedido, sair
  do campo telefone busca o cadastro e preenche nome/bairro/endereço — só
  campos vazios, não sobrescreve o que o balconista já digitou.
- **Item 6** — backup: `db.backup()` nativo do better-sqlite3 (cópia
  consistente mesmo com WAL ativo) para exportar; restaurar fecha a conexão,
  apaga os sidecars `-wal`/`-shm`, copia o arquivo escolhido por cima do banco
  e reinicia o app (`app.relaunch()`) — só um processo novo abre o banco
  trocado com segurança. Validação mínima antes de sobrescrever: confere que
  o arquivo tem a tabela `pedidos`. Aba nova em Configurações.

**Item 12** — escopo decidido com o usuário: rateio simples, sem papéis de
usuário nem login (isso viraria projeto separado, arriscado demais pra
véspera de lançamento). Implementado em `ModalPagamento` (`Mesas.jsx`):
contador de pessoas + "valor por pessoa" calculado na hora de fechar a
conta. Não muda como o pagamento é registrado — continua um total único, uma
forma de pagamento só; é só o cálculo pra dizer quanto cada um paga.

## Item 2 (parte 1) — editar produto pela tela de Estoque (31/07)

**Causa raiz: não era bug, era funcionalidade que nunca existiu nessa tela.**
`Estoque.jsx` só tinha "Entrada" e "Ajustar", os dois abrindo
`ModalMovimentacao` — um formulário de *quantidade*, não de cadastro. Não
havia nenhum caminho, quebrado ou não, para editar nome/categoria/preço/
custo/unidade/código de barras/imagem a partir dessa tela. O backend
`produtos.atualizar` (usado pelo Cardápio) já fazia tudo isso corretamente —
confirmado por `test/produtos.test.js` (4 testes novos) antes de mexer em
qualquer UI, para não corrigir algo que já funcionava.

Adicionado botão "Editar" por linha, abrindo o mesmo `FormProduto` que o
Cardápio usa. Testado ao vivo no browser: editar o preço do X-Burguer pela
tela de Estoque e ver o novo valor refletido no Cardápio — os dois batem no
mesmo `menu_items`. 88 testes verdes, `build:react` limpo.

**Modelagem de insumo/ficha técnica (parte 2 do item 2) continua em aberto**
— usuário pediu para não mexer nisso ainda ("depois voltamos a isso").

## Separação PDV × Pedidos (31/07)

O menu "Pedidos" misturava balcão (catálogo/carrinho/pagamento) com
acompanhamento pós-venda (esteira Novos/Preparando/Prontos/A Caminho). Só
navegação mudou — nenhum dado novo, nenhuma tabela nova.

- `src/pages/PDV/PDV.jsx` (novo) — rota `/pdv`, primeiro item do menu, logo
  após Dashboard. Renderiza o mesmo `NovoPedido` que já existia; ao criar um
  pedido, remonta via `key` para zerar carrinho e ficar pronta pro próximo
  cliente sem sair da tela — igual um PDV de verdade, não devolve o
  balconista pro dashboard a cada venda.
- `Delivery.jsx` (a tela "Pedidos") perdeu o botão "+ Novo Pedido" e o modal
  que ele abria — a esteira agora só mostra status. Continua sendo o mesmo
  componente, mesma leitura de `api.pedidos.listar()`.
- Testado ao vivo: pedido criado em `/pdv` aparece na coluna "Novos" de
  `/delivery` sem nenhum passo manual — os dois batem no mesmo `pedidos`
  local/Supabase, como já batiam antes.

## Rodada de QA com cliente real (31/07 → 01/08, antes da release)

Usuário testou com venda real e trouxe mais três problemas.

**Balcão não devia passar pela esteira de delivery.** Venda presencial (mesa
ou balcão) já foi aceita no ato — pedir "Aceitar Pedido" depois não faz
sentido pra esse tipo de negócio. `PDV.jsx` passou a abrir `NovoPedido` com
`tipoInicial="balcao"`; ao finalizar, `tipo === 'balcao'` pula
`pedidos.criar` com esteira e vai direto pra `caixa.registrarVendaDelivery`
(mesmo caminho que mesa usa), com `refExterna` pra não duplicar. Pedido some
da tela Pedidos e cai direto no caixa.

**Entregador não tinha onde ser atribuído na venda.** Campo opcional
adicionado em `NovoPedido.jsx`, só aparece pra `tipo === 'entrega'` e só se
houver entregador cadastrado — não força cadastro pra quem não usa.

**Não existia cadastro de clientes visível.** `src/pages/Clientes/` nova:
busca, tabela, criar/editar. O backend (`clientes.criar/atualizar`) já
existia desde o Item 7, só faltava tela.

**Pedido de mesa fechado pelo garçom não virava venda no PDV — bug de
dinheiro escondido.** `comandas` UPDATE (status→fechada) no
`supabaseSync.js` lançava no caixa mas nunca chamava `db.pedidos.criar`;
por isso a venda ficava fora de qualquer relatório que lê `pedidos` (nenhum
relatório de receita usa essa fonte pra mesa, mas outros consumos, tipo
histórico de pedidos, ficavam cegos pra ela). Corrigido: o mesmo handler
agora também cria o `pedidos` com os itens da comanda.

**Itens da comanda não apareciam na esteira em tempo real pro garçom
acompanhar.** Criada `pedidos_cozinha` — tabela separada, **sem nenhum
campo de dinheiro**, de propósito: reusar `pedidos`/`itens_pedido` exigiria
auditar de novo toda query de receita documentada acima. Cada item inserido
via `comanda_itens` (Supabase) vira uma linha aqui; a esteira (`Delivery.jsx`)
lê `pedidosCozinha.listar()` junto com `pedidos.listar()` e mostra como
card (`CardCozinha`) com o fluxo Novo→Preparando→Pronto→Entregar à Mesa.
Ao fechar a conta (`Mesas.jsx` ou o UPDATE do Supabase), todos os tickets
da mesa são marcados `entregue` via `pedidosCozinha.resolverPorMesa`.
Push notification pro app do garçom quando fica "Pronto" — combinado com o
usuário que fica pra próxima atualização.

**Cadastro de colaboradores.** Tabela `colaboradores` (nome + função),
funções fixas pré-cadastradas (Garçom/Caixa/Gerente) — tela em
Configurações, mesmo padrão de `entregadores` (soft-delete). Passam a ser
selecionáveis ao abrir/fechar caixa, substituindo o campo de texto livre.

**Histórico de Caixa.** `caixa.sessoes(dias)` no backend; seção sempre
visível na tela de Caixa com filtro 7/15/30 dias — sem isso não havia como
auditar quem abriu/fechou.

**Estoque também cadastra produto, não só ajusta quantidade.** Botão "Novo
Produto" adicionado na tela de Estoque, abrindo o mesmo `FormProduto` do
Cardápio — pra quem pensa em "cadastrar estoque" (refrigerante, cerveja)
sem passar pela tela de Cardápio.

88 testes verdes, `build:react` limpo. Verificação completa ao vivo (todos
os fluxos desta rodada) explicitamente adiada pelo usuário pra depois da
release ("deixa para testar só no final").

## Pendente

- **Item 2 (parte 2)** — decisão de modelagem: `menu_items` hoje é o próprio
  produto vendável, sem insumo/ficha técnica. Aguardando o usuário — próxima
  atualização.
- Push notification pro app do garçom quando o ticket da cozinha fica
  "Pronto" — próxima atualização.
- App do garçom aparecendo "Offline" na tela demo: mencionado pelo usuário,
  não investigado — não ficou claro se é só mock da demonstração ou conexão
  real quebrada.
- Verificação end-to-end completa da rodada de QA acima (mesa fechada pelo
  garçom virando pedido, esteira da cozinha, colaboradores no caixa,
  histórico) — adiada pelo usuário pra depois da release publicada.
