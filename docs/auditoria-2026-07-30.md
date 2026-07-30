# Auditoria — TáPedido Food (30/07/2026)

Escopo: PDV Electron + Supabase, com foco no que ameaça o modelo de negócio
(receita, dados financeiros do cliente, isolamento entre lojas).

Legenda de confiança:
- **[V]** verificado nesta auditoria (consulta ao banco, execução, ou leitura direta do código)
- **[I]** inferido da leitura do código, sem execução

## Situação das correções (30/07/2026)

| Item | Estado |
|---|---|
| 1.1 RLS liberado para `anon` | ❌ **aberto** — exige o rollout da fase 3 |
| 1.2 Chaves de seed adivinháveis | ❌ **aberto** — escrita em produção, aguarda decisão |
| 1.3 Licença forjável no SQLite local | ❌ **aberto** — parte da fase 3 (item 4 do plano) |
| 1.4 DevTools em produção | ✅ corrigido |
| 2.1 Venda de mesa não vira pedido | ✅ corrigido (com o `dashboard()` na mesma mudança) |
| 2.2 Estoque não baixa na venda | ❌ **aberto** — decisão de produto |
| 2.3 Forma de pagamento desconhecida | ✅ corrigido |
| 2.4 `refExterna` ausente no caminho principal | ✅ corrigido |
| 2.5 `resumo().totalVendas` sem delivery | ✅ corrigido |
| 3.1 `codigo_garcom` fixo `1234` | ⚠️ corrigido — **validar contra o app do garçom** |
| 3.2 `codigo_loja` com `Math.random()` | ✅ corrigido |
| 3.3 Realtime sem filtro de loja | ⚠️ parcial — cache limitado; filtro exige `loja_id` em `comanda_itens` (fase 3) |
| 4 Transações e higiene | ✅ corrigido |

⚠️ **3.1 precisa de validação sua.** O `codigo_garcom` da tabela `configuracoes`
não é lido nem exibido em lugar nenhum do PDV — o login documentado usa
`codigo_loja` + o código individual da tabela `garcons`. Randomizei porque um
segredo constante entre todos os inquilinos é falha certa, mas **não tenho acesso
ao código do app do garçom** para confirmar que ele não usa esse campo como
fallback. Se usar, lojas novas ficam sem como descobrir o código.

---

## 1. Receita e anti-pirataria

### 1.1 RLS liberado para `anon` em todas as 11 tabelas — **[V]**

Todas as tabelas de `public` têm uma política `anon_all_*` com
`USING (true) WITH CHECK (true)` para o role `anon`. Confirmado por
`pg_policies` e pelo linter do Supabase (11 avisos `rls_policy_always_true`).

A chave anon está hardcoded em quatro pontos do código
([db.js:21](../electron/database/db.js), [supabaseSync.js:8](../electron/supabaseSync.js),
[main.js:143](../electron/main.js), [supabaseClient.js:3](../src/lib/supabaseClient.js))
e o repositório é público. Com um `curl`, qualquer pessoa pode:

- `SELECT chave FROM licencas` → listar todas as licenças e ativar de graça;
- `UPDATE licencas SET status='revogada'` → derrubar todos os clientes pagantes;
- `DELETE FROM lojas / pedidos / menu_items` → apagar dados de todos os clientes;
- ler nome, telefone e endereço dos consumidores finais de todas as lojas (LGPD).

Já documentado em [fase-3-fechar-o-supabase.md](fase-3-fechar-o-supabase.md).
**O bloqueio declarado naquele doc — "o MCP não enxerga este projeto" — não é mais
verdade**: o projeto `xckystaizmgubayuwtsx` está acessível. O plano pode começar.

### 1.2 Lote de 100 chaves de teste adivinháveis em produção — **[V]**

Inseridas numa única transação em 2026-05-13 20:32:02. 99 seguem o padrão
alternado letra-dígito (`TAPF-A1B2-C3D4-E5F6`, `TAPF-A3B4-C5D6-E7F8`, …) e a
centésima é `TAPF-TEST-0001-2026`. Nenhuma tem `pedido_ml` — nenhuma veio de venda.

Uma delas (`TAPF-A1B2-C3D4-E5F6`) foi entregue a um cliente em 30/07/2026 como
paliativo. As demais continuam ativas e utilizáveis.

### 1.3 O portão de receita é uma linha de SQLite sem proteção — **[I]**

O banco fica em `userData/tapedido.db`, SQLite simples, sem criptografia
([db.js:33](../electron/database/db.js)). `licenca.verificar()` apenas lê a tabela
`licenca` local. Inserir uma linha à mão com qualquer editor de SQLite libera o app.

Pior: `verificarPeriodicamente()` trata "chave não encontrada no Supabase" como
"sem internet" e retorna sem bloquear
([db.js:410](../electron/database/db.js) — `if (error || !data) return`).
Uma licença forjada nunca é invalidada, mesmo com o app online.

O gate de tela também é só estado React (`setAtivado(true)` em
[App.jsx:47](../src/App.jsx)) — não há verificação no processo principal. Todos os
handlers IPC são registrados independentemente do estado da licença.

### 1.4 DevTools abre em produção — **[V]**

[main.js:62](../electron/main.js): `mainWindow.webContents.openDevTools()`, com o
comentário `// diagnóstico — remover após fix`. Está na build 1.2.0 publicada.

Todo cliente abre o PDV com o DevTools escancarado. Além de parecer quebrado,
expõe a chave anon e torna trivial mexer no estado React que controla a licença.
Junto com 1.3, o portão de receita é contornável sem nenhuma ferramenta externa.

Também há um `executeJavaScript` de diagnóstico despejando o HTML do root e a
contagem de stylesheets a cada carga ([main.js:42-51](../electron/main.js)).

---

## 2. Dados financeiros que falham em silêncio

### 2.1 Toda venda de mesa falha ao virar pedido — **[I, alta confiança]**

[Mesas.jsx:151](../src/pages/Mesas/Mesas.jsx) chama `api.pedidos.criar({...})` com
chaves em **snake_case** (`tipo_entrega`, `nome_cliente`, `forma_pagamento`), mas
[db.js:834](../electron/database/db.js) lê **camelCase** (`dados.tipoEntrega`,
`dados.nomeCliente`, `dados.formaPagamento`, `dados.subtotal`).

`tipo_entrega` e `subtotal` são `NOT NULL` no schema
([db.js:185,190](../electron/database/db.js)). Com `undefined` no bind, o INSERT
falha por qualquer caminho possível (erro de bind do better-sqlite3 ou violação de
constraint) — e o `catch { }` vazio em
[Mesas.jsx:165](../src/pages/Mesas/Mesas.jsx) engole o erro sem log nem toast.

Consequências:
- vendas de mesa **nunca** aparecem na página de Pedidos;
- `relatorios.produtosMaisVendidos` ignora todo o consumo de salão;
- o campo `status: 'entregue'` enviado é descartado — `criar()` grava `'recebido'` fixo.

**Armadilha:** o dashboard só está correto *por causa* desse bug.
`dashboard()` soma `receitaPedidos + receitaCaixa`
([db.js:930](../electron/database/db.js)); como a venda de mesa entra no caixa
(`tipo='venda'`) e o pedido nunca é criado, não há dupla contagem. Corrigir os
nomes das chaves **sem** ajustar `dashboard()` passa a contar toda venda de salão
duas vezes.

### 2.2 Estoque nunca baixa com a venda — **[V]**

`estoque.movimentar` só é chamado de um lugar: a tela de Estoque
([Estoque.jsx:36](../src/pages/Estoque/Estoque.jsx)). Nem `pedidos.criar` nem
`comandas.addItem` tocam em `estoque_atual`.

"Controle de Estoque" é um dos seis recursos anunciados na tela de ativação
([Ativacao.jsx:81](../src/pages/Ativacao/Ativacao.jsx)) e na descrição do anúncio.
Na prática o saldo só muda se o lojista digitar manualmente, e `estoque.alertas()`
nunca dispara por consumo.

### 2.3 Forma de pagamento desconhecida some do total da sessão — **[I]**

[db.js:1036-1049](../electron/database/db.js): o `colMap` cobre
`dinheiro | pix | debito | credito`. Qualquer outro valor grava a movimentação mas
**não soma em nenhuma coluna de total da sessão** — só um `console.warn` que o
lojista nunca vê. O caixa fecha sem bater, sem explicação.

As telas do PDV oferecem exatamente as 4 formas mapeadas, então o caminho não é
alcançável pelo PDV. Mas o valor também chega via realtime do app do garçom
([supabaseSync.js:566](../electron/supabaseSync.js)), que não é validado.

### 2.4 Heurística frágil separa venda real de eco do realtime — **[I]**

[supabaseSync.js:558-578](../electron/supabaseSync.js) distingue "mesa fechada pelo
garçom" de "eco da própria escrita do PDV" pela **ausência de `forma_pagamento`**.

- Se o app do garçom um dia fechar sem gravar o campo → a venda **não** é lançada no caixa.
- Se o PDV um dia passar a gravá-lo → toda venda de mesa é lançada **em dobro**.

Existe proteção por `refExterna` em `lancarVenda`
([db.js:1025](../electron/database/db.js)), mas o caminho principal
([Mesas.jsx:117](../src/pages/Mesas/Mesas.jsx)) **não passa `refExterna`** — a
proteção está inativa justamente onde mais importa.

### 2.5 `caixa.resumo().totalVendas` ignora delivery — **[V]**

[db.js:1064](../electron/database/db.js) filtra só `tipo === 'venda'`, deixando
`venda_delivery` de fora, enquanto as colunas `total_*` da sessão incluem os dois.

Hoje a tela de Caixa calcula o total pelas colunas da sessão
([Caixa.jsx:85](../src/pages/Caixa/Caixa.jsx)), então o campo errado não é exibido.
É uma bomba armada para o próximo consumidor de `resumo()`.

---

## 3. Isolamento entre lojas

### 3.1 Código de garçom padrão `1234` para toda loja criada — **[V]**

[supabaseSync.js:160](../electron/supabaseSync.js) grava `codigo_garcom: '1234'` fixo
em toda loja nova. Não há fluxo que obrigue a troca.

### 3.2 `codigo_loja` sorteado com `Math.random()` — **[V]**

[supabaseSync.js:35](../electron/supabaseSync.js). São 6 caracteres de um alfabeto de
32 (≈1,07×10⁹), mas `Math.random()` não é criptográfico e o espaço é pequeno para
força bruta. Combinado com 3.1: adivinhar o código da loja dá acesso ao salão de
outro cliente com a senha `1234`.

### 3.3 Realtime de `comanda_itens` sem filtro no servidor — **[V]**

[supabaseSync.js:531-539](../electron/supabaseSync.js): o canal escuta INSERTs de
`comanda_itens` de **todas as lojas**, porque a tabela não tem `loja_id`. O descarte
é feito no cliente (`itemPertenceALoja`). Ou seja, dados de todos os clientes
trafegam para todos os PDVs instalados.

O cache `donoDaComanda` ([supabaseSync.js:506](../electron/supabaseSync.js)) é um
`Map` que nunca é limpo — num PDV que fica dias ligado, cresce sem limite.

---

## 4. Integridade e higiene

- **Sem transações** em operações compostas: `pedidos.criar` (pedido + itens),
  `estoque.movimentar` (log + saldo), `comandas.addItem` (item + total da comanda).
  Falha no meio deixa dado inconsistente. **[V]**
- `estoque.movimentar` usa `MAX(0, estoque_atual - ?)` — vender acima do saldo zera
  em silêncio em vez de avisar. **[V]**
- `caixa.abrir` ignora `valorInicial` sem avisar quando já existe sessão aberta. **[V]**
- Limpeza de dados de demo só roda se a **mesma sessão** ativou o demo
  (`estaEmDemo` em [main.js:9](../electron/main.js)). Um crash deixa os dados de
  demonstração no banco, e a próxima ativação real herda produtos fictícios. **[I]**
- Chave anon repetida em 4 lugares, incluindo um `createClient` dentro de um handler
  ([main.js:143](../electron/main.js)) que cria um cliente novo a cada chamada. **[V]**

---

## Ordem sugerida

1. **Remover `openDevTools()` e o `executeJavaScript` de diagnóstico** — uma linha,
   entra na próxima build, corta o vetor mais fácil de adulteração.
2. **Revogar as 99 chaves de seed** (preservando a que foi entregue ao cliente).
3. **Executar a fase 3** (Edge Functions + JWT + RLS real). O bloqueio de acesso
   já não existe. É o que separa o produto de "qualquer um revoga todas as licenças".
4. **Corrigir 2.1 e `dashboard()` na mesma mudança** — nunca uma sem a outra.
5. Trocar `codigo_garcom` padrão por sorteio e forçar troca no primeiro acesso.
6. Decidir o que "Controle de Estoque" promete e implementar a baixa automática,
   ou ajustar a comunicação do produto.
