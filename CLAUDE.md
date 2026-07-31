# TáPedido Food — PDV para pequenos negócios alimentícios

Electron 28 + React 18 (Vite) + SQLite local (better-sqlite3) + Supabase
para sincronizar com o app do garçom e validar licença.

## Rodar

```bash
npm run dev      # Vite + Electron juntos
npm test         # Vitest sob ELECTRON_RUN_AS_NODE (ver armadilhas)
npm run build    # vite build + electron-builder
```

## Arquitetura

- `electron/main.js` — registra todos os handlers IPC
- `electron/database/db.js` — schema, migrations e o grosso da lógica de negócio
- `electron/preload.js` — expõe `window.api` para o renderer
- `electron/supabaseSync.js` — realtime e espelhamento com o Supabase
- `electron/sessaoSupabase.js` — troca licença por JWT com a claim `loja_id`
- `src/lib/api.js` — fachada do renderer; tem fallback com dados falsos quando
  roda fora do Electron
- `src/pages/<Tela>/` — uma pasta por tela

O renderer **nunca** acessa o banco direto. Sempre via `window.api` → IPC.

## Armadilhas conhecidas

Estas já causaram bug em produção. Ler antes de mexer.

**`dashboard()` conta receita de duas fontes.** Delivery/retirada vem de
`pedidos`; mesa vem de `caixa_movimentacoes` (`tipo='venda'`). A query de
pedidos filtra `tipo_entrega != 'mesa'` **de propósito**. Mexer numa fonte sem
a outra faz toda venda de salão contar duas vezes. O campo devolvido chama-se
`receitaHoje`, mesmo quando o período é `7dias` ou `30dias`.

**Venda de mesa percorre dois caminhos.** Ao fechar a conta, ela é lançada no
caixa *e* vira um registro em `pedidos`. Os dois precisam acontecer. O bug que
escondeu meses de venda de salão foi o segundo caminho falhando em silêncio,
engolido por um `catch` vazio.

**O filtro de mesa vale para todo relatório de receita, não só o dashboard.**
`relatorios.vendas` tem o mesmo `UNION` de duas fontes e precisou do mesmo
`tipo_entrega != 'mesa'` — faltava, e o salão saía em dobro. Ao criar qualquer
consulta nova de receita, decidir explicitamente de qual das duas fontes ela
vem. Já `relatorios.custoLucro` lê só `itens_pedido`, onde mesa não duplica.

**`itens_pedido.custo_unitario` é congelado na venda.** O relatório de lucro lê
dele, nunca de `menu_items.custo_unitario`. Ler o custo atual faria uma
mudança de preço do fornecedor reescrever o lucro de meses já fechados.

**`menu_items.categoria` guarda o nome, não o id.** Renomear categoria precisa
reescrever os produtos junto (`categorias.atualizar` já faz). Esquecer disso
faz os produtos sumirem dos filtros do cardápio.

**`pedidos.atualizar` tem whitelist de colunas.** Campo fora do `map` é
descartado com um `console.warn` que ninguém vê. Ao adicionar coluna nova que
precise ser atualizável, incluir no `map`.

**`caixa.lancarVenda` deduplica por `refExterna`.** É o que impede o eco do
realtime do app do garçom de lançar a mesma venda duas vezes. Todo caminho que
lança venda precisa passar `refExterna`.

**Formas de pagamento chegam em variantes.** O PDV grava `pix`/`debito`; o app
do garçom grava `PIX`/`Débito`/`cartao de credito`. `APELIDOS_PAGAMENTO`
normaliza. Forma não mapeada grava a movimentação mas **não soma** em nenhum
total da sessão — o caixa fecha sem bater e sem explicação.

**`better-sqlite3` está compilado para o ABI do Electron (119).** O Node do
sistema (v24, ABI 137) não carrega. Qualquer script que toque o banco roda com
`ELECTRON_RUN_AS_NODE=1 electron ...`, nunca com `node ...`.

**A chave anon do Supabase está repetida em vários arquivos.** Ao trocar,
procurar em todos: `sessaoSupabase.js`, `supabaseSync.js`, `main.js`,
`src/lib/supabaseClient.js`.

**Migrations rodam a cada inicialização.** Sempre idempotentes:
`try { db.exec('ALTER TABLE ...') } catch {}`.

## Estado atual

Ver `docs/ESTADO.md` — passo atual, o que já foi feito, o que falta.

## Convenções

- Português em código, comentários e commits; commits sem acentos.
- Comentário explica **por que**, não o que o código faz.
- Nunca `git push` sem o usuário pedir.
