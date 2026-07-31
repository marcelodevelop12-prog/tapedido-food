# Remodelagem do TáPedido Food — entregar 100% do anúncio

**Data:** 31/07/2026 (sexta-feira)
**Contexto:** os primeiros lojistas reais começam a usar o sistema em 01/08 (sábado).

## 1. O problema

O anúncio do produto promete 8 recursos que hoje não existem, ou existem só pela
metade. O levantamento completo está na seção 2. Três deles são especialmente
graves porque o sistema **aparenta** tê-los — há tela de configuração que não faz
nada por trás:

- a tela de impressora coleta IP, porta, largura e nome, e o backend é um stub
  que retorna `{ sucesso: true }` sem imprimir ([db.js:1553](../../../electron/database/db.js));
- o cadastro de produto salva `codigo_barras`, e nenhuma tela de venda consulta
  esse campo;
- a auditoria já registrou que o estoque nunca baixa com a venda.

Some-se a isso a pendência de segurança de
[auditoria-2026-07-30.md](../../auditoria-2026-07-30.md): as tabelas do Supabase
ainda estão com `USING (true)`, o que expõe dados de todos os lojistas a quem
tiver a chave pública.

## 2. Estado atual, promessa por promessa

Levantamento feito por leitura direta do código em 30–31/07.

| Promessa do anúncio | Estado | Evidência |
|---|---|---|
| Mesa, delivery e retirada na mesma tela | ✅ | `NovoPedido.jsx` |
| Pizza meio a meio com cálculo automático | ✅ | `NovoPedido.jsx:572` |
| Adicionais e observações **por item** | ❌ sem UI | dado modelado, produto vai direto ao carrinho (`NovoPedido.jsx:60`) |
| App do garçom cai no PDV | ⚠️ inseguro | realtime funciona; RLS aberta |
| Mapa de mesas em tempo real | ✅ | `Mesas.jsx` |
| Fechamento com forma de pagamento | ✅ | `ModalPagamento` |
| **Kanban** de etapas do delivery | ⚠️ é lista com filtros | `Delivery.jsx` |
| Taxa de entrega por bairro | ✅ | `zonas_entrega` |
| Cadastro de entregadores | ❌ sem UI | backend existe (`db.js:1427`), só dados de seed |
| Histórico completo | ⚠️ parcial | filtros por status, sem busca por período |
| Produtos com foto | ✅ | upload local ou URL |
| Categorias personalizadas | ❌ lista fixa | `FormProduto.jsx:6` ignora a tabela `categorias` |
| Ativar/desativar item | ✅ | toggle no cardápio |
| Adicionais por produto | ⚠️ cadastra, não usa | mesmo caso de "adicionais por item" |
| **Baixa automática de estoque** | ❌ não existe | `estoque.movimentar` só é chamado pela tela de Estoque |
| Alertas de estoque mínimo | ⚠️ só reage a ajuste manual | consequência do item acima |
| Entrada manual e inventário | ✅ | `ModalMovimentacao` |
| Caixa (abertura, 4 formas, sangria, fechamento) | ✅ | `Caixa.jsx` |
| Contas a pagar/receber com alerta | ⚠️ alerta é cor na tela | `Financeiro.jsx:80` |
| Fluxo de caixa mensal | ✅ | `financeiro.fluxoCaixa` |
| Faturamento diário/semanal/mensal | ✅ | `Relatorios.jsx` |
| Produtos mais vendidos | ✅ | `relatorios.produtosMaisVendidos` |
| **Custo × lucro por produto** | ❌ não existe | nenhuma query calcula margem |
| Exportação em PDF | ⚠️ só aba Vendas | `Relatorios.jsx:42` |
| Impressora térmica 58/80mm USB ou rede | ❌ **stub vazio** | `db.js:1553` |
| Leitor de código de barras USB | ❌ campo morto | busca filtra só por nome |
| Balança serial/USB | ✅ | `electron/balanca.js` |

**Padrão recorrente:** em três casos (categorias, entregadores, adicionais) o
backend está pronto e só a UI não foi ligada. São as features mais baratas da
lista.

## 3. Decisões tomadas

Decididas com o dono do produto em 31/07:

| Decisão | Escolha |
|---|---|
| Segurança | Fase 0, antes de qualquer feature |
| Ordem das features | risco de reclamação/reembolso primeiro |
| `db.js` (1572 linhas) | fatiar por domínio, incrementalmente, junto de cada feature |
| Testes | Vitest só nos caminhos de dinheiro e estoque |
| Memória do agente | `CLAUDE.md` na raiz + `docs/ESTADO.md` |
| Baixa de estoque | desconta o **próprio produto vendido**, não ficha técnica |
| Baseline | commitar o trabalho de segurança pendente antes de começar |
| Virada da RLS | hoje, aproveitando a ausência de base instalada |

## 4. A restrição que organiza o plano

Enquanto não há dado de cliente, **o schema é livre**. A partir de sábado,
qualquer mudança de tabela vira migração com risco de perder dado de lojista
pagante. Código de feature, ao contrário, pode ser adicionado a qualquer momento
sem esse risco.

Disso decorre a regra central deste plano:

> **Todo o schema entra hoje, de uma vez — inclusive o das features que só serão
> implementadas depois. A partir daí, toda feature restante é código puro.**

O mesmo raciocínio vale para a segurança, por um motivo diferente. A
[spec do app do garçom](../../spec-app-garcom-jwt.md) determina que a virada da
RLS só é segura depois que a base instalada tiver atualizado o app. **Não existe
base instalada hoje.** Esse bloqueio desaparece hoje e reaparece sábado.

As duas coisas que ficam mais caras a cada dia são, portanto, o schema e a RLS.
Nenhuma feature tem essa propriedade.

## 5. Arquitetura

Nenhuma reescrita. O plano é uma sequência de fatias verticais: cada uma entrega
uma promessa inteira (schema já pronto + backend + UI + teste quando toca
dinheiro) e deixa o app funcionando ao final. Parar no meio do plano deixa um
sistema íntegro.

### 5.1 Modularização do backend

Cada fatia extrai do `db.js` apenas o módulo que precisa tocar, seguindo o
padrão um-arquivo-por-domínio que o DEPGEST já usa (`electron/ipc/pedidos.ts`,
`motoboys.ts`, `estoque.ts`, …):

```
electron/database/
  db.js            ← schema, migrations e cola entre módulos
  impressao.js     ← criado na fatia da impressora
  estoque.js       ← criado na fatia da baixa automática
  pedidos.js       ← criado na fatia de adicionais por item
  relatorios.js    ← criado na fatia de custo × lucro
```

Nenhuma fatia existe só para refatorar. Ao fim das 8, o `db.js` ficou reduzido
sem que jamais tenha havido uma "fase de refatoração" parada.

### 5.2 Referência de regras de negócio

Do **DEPGEST** (`C:\Users\ANDERSON\DEPGEST`), mesmo domínio, vem:

- o padrão de razão contábil do estoque: `saldo_anterior` / `saldo_posterior` /
  `referencia_tipo` + `referencia_id`, que dá idempotência de graça;
- a modelagem de entregadores e entregas (`electron/ipc/motoboys.ts`).

É referência de modelagem, não cópia de código — a stack dele é TypeScript, a
nossa é JavaScript.

O **MecOS-APP OFICINA** foi avaliado e descartado: domínio de ordem de serviço
de oficina mecânica, sem sobreposição útil com PDV de alimentação.

## 6. Passo 1 — o schema definitivo

O passo irreversível. Um único migration com tudo que as 8 features exigem.

### 6.1 Ledger de estoque

`estoque_movimentacoes` hoje tem `menu_item_id`, `tipo`, `quantidade`,
`custo_unitario`, `motivo`, `pedido_id`. Falta o que torna a baixa automática
segura:

```sql
ALTER TABLE estoque_movimentacoes ADD COLUMN saldo_anterior REAL;
ALTER TABLE estoque_movimentacoes ADD COLUMN saldo_posterior REAL;
ALTER TABLE estoque_movimentacoes ADD COLUMN referencia_tipo TEXT;
ALTER TABLE estoque_movimentacoes ADD COLUMN referencia_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_estoque_ref
  ON estoque_movimentacoes (referencia_tipo, referencia_id, menu_item_id)
  WHERE referencia_tipo IS NOT NULL;
```

O índice único é a proteção contra baixa dupla. O sistema já foi mordido por
esse tipo de erro no caixa — o eco do realtime do app do garçom lançava a mesma
venda duas vezes. Aqui o banco recusa a segunda tentativa em vez de confiar em
heurística no código.

`saldo_anterior`/`saldo_posterior` tornam o histórico auditável: dá para
reconstruir como o saldo chegou onde chegou, em vez de só ver o valor final.

### 6.2 Custo fotografado na venda

```sql
ALTER TABLE itens_pedido  ADD COLUMN custo_unitario REAL DEFAULT 0;
ALTER TABLE comanda_itens ADD COLUMN custo_unitario REAL DEFAULT 0;
```

Sem isso o relatório de custo × lucro leria o custo **atual** do produto. Um
reajuste do fornecedor em outubro reescreveria o lucro de agosto. A coluna
precisa existir antes do primeiro pedido real, ou o histórico nasce errado — e
não há como corrigi-lo depois, porque o custo da época não fica registrado em
lugar nenhum.

### 6.3 Demais colunas

```sql
ALTER TABLE entregadores  ADD COLUMN placa TEXT;
ALTER TABLE pedidos       ADD COLUMN status_alterado_em TEXT;
ALTER TABLE configuracoes ADD COLUMN impressora_tipo TEXT DEFAULT 'usb';
ALTER TABLE configuracoes ADD COLUMN impressora_copias INTEGER DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_menu_codigo_barras
  ON menu_items (codigo_barras)
  WHERE codigo_barras IS NOT NULL AND codigo_barras != '';
```

O índice é parcial porque a maioria dos produtos de restaurante não tem código
de barras — indexar as linhas vazias só ocuparia espaço. `FormProduto.jsx` grava
string vazia quando o campo não é preenchido, e o schema permite `NULL`; os dois
casos precisam ficar de fora.

`status_alterado_em` alimenta o "há quanto tempo neste estágio" das colunas do
kanban. `impressora_tipo` distingue USB de rede — hoje o código teria que
adivinhar pelo preenchimento do IP.

### 6.4 O que NÃO precisa de schema

Verificado por leitura: `adicionais_escolhidos` e `observacao` **já existem** em
`itens_pedido` e `comanda_itens`; a tabela `categorias` e `menu_items.categoria_id`
**já existem**; `menu_items.codigo_barras` **já existe**. Estas features são
100% código.

## 7. Sequência de execução

### Passo 0 — Baseline limpo *(~20 min)*

1. Revisar e commitar o trabalho de segurança pendente no diretório principal
   (`sessaoSupabase.js`, `supabase/functions/*`, alterações em `db.js`,
   `main.js`, `preload.js`, `supabaseSync.js`) como commit próprio.
2. Remover os 7 worktrees abandonados em `.claude/worktrees/` — todos com último
   commit de maio/2026.
3. Criar `CLAUDE.md` e `docs/ESTADO.md`.

Commitar antes de começar é o que torna qualquer erro das etapas seguintes
reversível com um `git revert` sem levar junto o trabalho de ontem.

### Passo 1 — Schema definitivo *(~1h)*

A seção 6, num único migration. **Irreversível a partir de sábado.**

### Passo 2 — Rede de proteção *(~1,5h)*

Instalar Vitest e adicionar o script `test` ao `package.json` — hoje não existe
nenhum. Os testes rodam contra um SQLite temporário, sem mocks, e descrevem o
comportamento **atual** — não as features novas:

- `pedidos.criar` grava pedido e itens, e falha atomicamente;
- fechamento de mesa gera exatamente uma venda no caixa e um pedido;
- `caixa.lancarVenda` respeita `refExterna` (não lança em duplicidade);
- `dashboard()` não conta venda de mesa duas vezes;
- `relatorios.vendas` e `produtosMaisVendidos` batem com o que foi inserido.

Estes testes existem para gritar quando um passo seguinte quebrar algo. O bug da
venda de mesa que falhou em silêncio por meses é exatamente o que eles pegariam.

### Passo 3 — Segurança completa *(~2,5h)* — janela que fecha sábado

1. Atualizar `tapedido-food-garcom` para usar `accessToken` + login via a Edge
   Function `entrar`, conforme a seção 4 da
   [spec](../../spec-app-garcom-jwt.md). O repo está limpo em
   `C:\Users\ANDERSON\tapedido-food-garcom` e hoje usa a chave anon crua
   (`src/lib/supabase.js:9`).
2. Publicar o app do garçom.
3. Virar a RLS das 10 tabelas restantes para
   `using ((auth.jwt() ->> 'loja_id')::uuid = loja_id)`.
4. Verificar end-to-end: PDV e garçom funcionando normalmente **e** um `curl`
   com a chave pública já não conseguindo ler dado de loja nenhuma.

O passo 1 é pré-requisito do 3. Virar a RLS sem atualizar o app do garçom o
derruba justamente no sábado, quando os lojistas começam a usá-lo.

### Passos 4+ — As 8 promessas, por risco de reembolso

| # | Fatia | Módulo extraído | Teste |
|---|---|---|---|
| 4 | Impressora térmica | `impressao.js` | não (não toca dinheiro) |
| 5 | Leitor de código de barras | — | não |
| 6 | Adicionais e observação por item | `pedidos.js` | sim (altera total) |
| 7 | Baixa automática de estoque | `estoque.js` | sim |
| 8 | Entregadores + kanban | — | não |
| 9 | Categorias + custo×lucro + PDF | `relatorios.js` | sim (custo×lucro) |

#### 4. Impressora térmica

`electron-pos-printer@1.2.1` **já está no `package.json`** — nunca foi usado. O
stub em `db.js:1553` é substituído por `electron/database/impressao.js`, com
suporte a USB (por nome de impressora no Windows) e rede (IP:porta), largura
58/80mm, e uso do `impressora_tipo` do Passo 1. A impressão automática ao fechar
mesa já é chamada em `Mesas.jsx` e em `supabaseSync.js` — passa a funcionar de
verdade sem alteração nas chamadas.

#### 5. Leitor de código de barras

Leitores USB emulam teclado: digitam os dígitos e enviam Enter. A implementação
é um listener na tela de venda que acumula teclas em rajada (intervalo curto
entre elas), e ao receber Enter consulta `menu_items.codigo_barras` pelo índice
criado no Passo 1 e adiciona o produto ao carrinho. Nada a instalar — é o "plug
and play" que o anúncio promete.

#### 6. Adicionais e observação por item

Modal ao clicar num produto que tenha adicionais cadastrados, permitindo
escolher complementos e escrever observação ("sem cebola"). O carrinho já
suporta a estrutura (`adicionaisEscolhidos`, `observacao`), e `pedidos.criar` já
persiste os dois campos. O trabalho é de UI e de garantir que o preço dos
adicionais entre no subtotal.

#### 7. Baixa automática de estoque

Ponto de acoplamento: `pedidos.criar`, que já é transacional. A baixa entra
**dentro da mesma transação** — pedido, itens e movimentação de estoque entram
juntos ou não entram.

- desconta o próprio `menu_item_id` do item vendido;
- `referencia_tipo='pedido'`, `referencia_id=<id do pedido>` → o índice único
  impede baixa dupla;
- cancelar pedido gera movimentação de estorno, não apaga a original;
- venda acima do saldo **avisa** em vez de zerar em silêncio (hoje
  `MAX(0, saldo - n)` esconde o problema).

Mesa: a baixa acontece no fechamento da comanda, que é quando `pedidos.criar` é
chamado — uma única vez, não a cada item adicionado.

#### 8. Entregadores + kanban

Backend de entregadores já existe; falta a tela (em Configurações, junto de
Zonas de Entrega). O kanban substitui a lista com filtros por colunas reais
(Recebido, Em Preparo, Pronto, Saiu, Entregue) com o cartão avançando de coluna,
usando `status_alterado_em` para mostrar o tempo em cada etapa.

#### 9. Categorias + custo × lucro + PDF

Categorias: trocar o array fixo de `FormProduto.jsx` por consulta à tabela
`categorias`, com CRUD no cardápio. Custo × lucro: nova aba em Relatórios,
usando `itens_pedido.custo_unitario` do Passo 1 — receita, custo, margem
absoluta e percentual por produto. PDF: estender a exportação existente às abas
que hoje não têm botão.

## 8. Memória do agente

Dois arquivos, com propósitos distintos:

**`CLAUDE.md`** (raiz) — carregado automaticamente pelo Claude Code a cada
sessão. Contém só o que é permanente: stack, arquitetura, comandos, e as
armadilhas conhecidas que já causaram bug neste projeto. Em especial:

- `dashboard()` só está correto porque filtra `tipo_entrega != 'mesa'`; mexer
  numa das duas fontes de receita sem a outra faz contar em dobro;
- `pedidos.atualizar` tem whitelist de colunas — campo fora dela é ignorado com
  um `console.warn` que ninguém vê;
- venda de mesa entra no caixa **e** vira pedido; são caminhos distintos;
- a chave anon está repetida em vários pontos do código.

**`docs/ESTADO.md`** — o que muda: passo atual, o que foi concluído, o que falta,
decisões tomadas com a data. Atualizado ao fim de cada fatia.

A separação importa: o `CLAUDE.md` fica curto e sempre verdadeiro; o histórico,
que cresce, não polui o contexto de toda sessão.

## 9. Escopo — o que fica de fora

Não cabe em um dia. Explicitamente adiado, sem prejuízo do sábado:

- **Testes de UI.** Só o backend de dinheiro/estoque é coberto.
- **Refatoração cosmética.** Nenhum módulo é extraído sem uma feature que o
  exija.
- **Alerta proativo de vencimento** (push, e-mail, som). O anúncio diz "alertas
  de vencimento"; o destaque visual na tela cumpre isso.
- **Busca avançada no histórico.** Os filtros por status mais a exportação
  cobrem "histórico completo".
- **Ficha técnica de estoque.** Decisão de produto registrada na seção 3.

## 10. Risco reconhecido

As 8 features não cabem no dia. A avaliação honesta:

| | |
|---|---|
| Fecha hoje com folga | Passos 0 a 3 — baseline, memória, schema, testes, segurança |
| Fecha hoje se o dia render | Impressora, código de barras, adicionais por item |
| Provavelmente escorrega | Estoque, kanban, entregadores, categorias, custo×lucro |

O que escorregar **não bloqueia o sábado**: com o schema já no lugar, essas
features entram na semana como código puro, sem tocar no banco do lojista.

O que não pode escorregar é o Passo 1 e o Passo 3 — os dois únicos itens cuja
janela fecha sozinha.

## 11. Critérios de aceitação

O plano está cumprido quando:

1. Um `curl` com a chave pública não lê dado de nenhuma loja.
2. PDV e app do garçom operam normalmente com a RLS fechada.
3. `npm test` passa, cobrindo os caminhos de dinheiro e estoque.
4. Uma impressora térmica 58mm ou 80mm, USB ou rede, imprime um cupom real.
5. Bipar um código de barras adiciona o produto ao carrinho.
6. Um item pode ser vendido com adicionais e observação próprios.
7. Vender baixa o estoque uma única vez; cancelar estorna.
8. O lojista cadastra seus próprios entregadores e suas próprias categorias.
9. Relatórios mostram margem por produto e exportam em PDF.
10. `CLAUDE.md` e `docs/ESTADO.md` refletem o estado real ao fim de cada fatia.
