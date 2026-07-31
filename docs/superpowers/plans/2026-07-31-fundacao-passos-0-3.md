# Fundação (Passos 0–3) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Travar o schema definitivo, criar a rede de proteção de testes e fechar o isolamento entre lojas no Supabase — tudo antes de 01/08, quando os primeiros lojistas reais começam a usar o sistema.

**Architecture:** Quatro fatias sequenciais sobre o código existente, sem reescrita. O baseline commita o trabalho pendente para tornar tudo reversível; o schema entra num único bloco de migrations idempotentes no `db.js`; os testes rodam contra SQLite real usando o binário do Electron como runtime de Node; a segurança troca a chave anônima por um JWT com a claim `loja_id` nos dois apps antes de fechar as políticas de RLS.

**Tech Stack:** Electron 28, better-sqlite3 9.4 (ABI 119), React 18 + Vite 5, Supabase (Postgres + Edge Functions Deno), Vitest 1.6 rodando sob `ELECTRON_RUN_AS_NODE`.

## Global Constraints

- **Prazo:** os Passos 0–3 deste plano precisam estar concluídos em 31/07/2026. Clientes reais entram 01/08.
- **Schema é irreversível a partir de 01/08.** Toda coluna que qualquer feature futura possa precisar entra na Task 2. Depois disso, mudança de tabela vira migração com dado de cliente em produção.
- **Migrations são idempotentes.** Sempre `try { db.exec('ALTER TABLE ...') } catch {}`, seguindo o padrão já existente em `electron/database/db.js:338-360`. O app roda a mesma migration em toda inicialização.
- **`better-sqlite3` está compilado para o ABI do Electron (NODE_MODULE_VERSION 119).** O Node local é v24 (ABI 137) e **não** consegue carregá-lo. Todo comando de teste roda via `ELECTRON_RUN_AS_NODE=1 electron`, que dá Node v18.18.2 / ABI 119. Verificado em 31/07.
- **Não alterar `electron/sessaoSupabase.js`, `electron/supabaseSync.js` nem as Edge Functions** além do que estas tasks pedem explicitamente — são trabalho de outra sessão, commitado na Task 1.
- **O fallback para a chave anon é obrigatório** até a Task 6. Remover antes derruba o app do garçom.
- **Idioma:** todo código, comentário e mensagem de commit em português, sem acentos nas mensagens de commit (padrão do repositório).
- **Nunca `git push` sem pedir.** Nenhuma task deste plano publica nada sozinha.

---

## Task 1: Baseline limpo e memória do agente

Commitar o trabalho pendente antes de qualquer coisa é o que torna todo erro das
tasks seguintes reversível com um `git revert` sem levar junto o trabalho de
ontem.

**Files:**
- Create: `CLAUDE.md`
- Create: `docs/ESTADO.md`
- Commit (sem modificar): `electron/sessaoSupabase.js`, `electron/database/db.js`, `electron/main.js`, `electron/preload.js`, `electron/supabaseSync.js`, `src/lib/supabaseClient.js`, `supabase/functions/*`, `docs/auditoria-2026-07-30.md`, `docs/fase-3-fechar-o-supabase.md`, `docs/spec-app-garcom-jwt.md`

**Interfaces:**
- Consumes: nada.
- Produces: um HEAD limpo em que `git status` não mostra nada pendente. Todas as tasks seguintes assumem isso.

- [ ] **Step 1: Confirmar que nenhuma outra sessão está escrevendo**

O trabalho pendente é de 30/07 23:40–23:50. Se outra sessão do Claude Code
ainda estiver aberta neste diretório, ela e esta task se sobrescrevem.

Confirmar com o usuário antes de prosseguir: *"Vou commitar o trabalho de
segurança pendente. Confirma que a sessão de ontem à noite está fechada?"*

- [ ] **Step 2: Revisar o que será commitado**

```bash
git status --short
git diff --stat
```

Esperado: 7 arquivos modificados e 3 não rastreados (`docs/spec-app-garcom-jwt.md`,
`electron/sessaoSupabase.js`, `supabase/`).

Ler o diff de `electron/database/db.js` e confirmar que as mudanças são só de
sessão/JWT (`renovarSessaoSupabase`, uso de `sessaoSupabase.tokenAtual`) e não
tocam em lógica de caixa, pedido ou estoque:

```bash
git diff electron/database/db.js
```

Se aparecer qualquer alteração em `caixa`, `pedidos.criar` ou `estoque`, **parar
e reportar ao usuário** — não faz parte do trabalho de segurança e precisa ser
entendido antes de commitar.

- [ ] **Step 3: Commitar o trabalho de segurança**

```bash
git add -A
git commit -m "feat: PDV troca licenca por JWT com a claim loja_id

Prepara a virada da RLS. sessaoSupabase.js guarda o token devolvido pela
Edge Function entrar e o renova quando faltam menos de 7 dias. O cliente
Supabase passa a usar accessToken, que cobre REST e Realtime de uma vez.

tokenAtual() devolve a chave anon quando nao ha token valido. Esse
fallback e o que permite publicar antes de fechar o RLS: sem token, o app
se comporta exatamente como antes.

Inclui as tres Edge Functions (entrar, licenca-ativar, licenca-verificar)
e a spec de adocao para o app do garcom.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Remover os 7 worktrees abandonados**

Todos têm último commit de maio/2026 e nenhum tem trabalho pendente.
Confirmar antes de remover:

```bash
git worktree list
```

```bash
for w in compassionate-black-5a2e05 hungry-hellman-aa77b7 kind-elbakyan-80f04c \
         practical-cori-c4b01f romantic-ardinghelli-2ac034 \
         suspicious-poitras-a86633 wizardly-euler-f417c5; do
  git worktree remove --force ".claude/worktrees/$w"
done
git worktree prune
git worktree list
```

Esperado ao final: apenas `C:/Users/ANDERSON/tapedido-food  [main]`.

- [ ] **Step 5: Criar o `CLAUDE.md`**

Este arquivo é carregado automaticamente a cada sessão. Contém só o que é
permanente. Cada armadilha listada já causou bug real neste projeto.

````markdown
# TáPedido Food — PDV para pequenos negócios alimentícios

Electron 28 + React 18 (Vite) + SQLite local (better-sqlite3) + Supabase
para sincronizar com o app do garçom e validar licença.

## Rodar

```bash
npm run dev      # Vite + Electron juntos
npm test         # Vitest sob ELECTRON_RUN_AS_NODE (ver abaixo)
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
a outra faz toda venda de salão contar duas vezes.

**Venda de mesa percorre dois caminhos.** Ao fechar a conta, ela é lançada no
caixa *e* vira um registro em `pedidos`. Os dois precisam acontecer. O bug que
escondeu meses de venda de salão foi o segundo caminho falhando em silêncio.

**`pedidos.atualizar` tem whitelist de colunas.** Campo fora do `map` é
descartado com um `console.warn` que ninguém vê. Ao adicionar coluna nova que
precise ser atualizável, incluir no `map`.

**`caixa.lancarVenda` deduplica por `refExterna`.** É o que impede o eco do
realtime do app do garçom de lançar a mesma venda duas vezes. Todo caminho que
lança venda precisa passar `refExterna`.

**`better-sqlite3` está compilado para o ABI do Electron (119).** O Node do
sistema (v24, ABI 137) não carrega. Qualquer script que toque o banco roda com
`ELECTRON_RUN_AS_NODE=1 electron ...`, não com `node ...`.

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
````

- [ ] **Step 6: Criar o `docs/ESTADO.md`**

```markdown
# Estado do projeto

Atualizado ao fim de cada task. O que é permanente fica no `CLAUDE.md`;
aqui fica o que muda.

## Onde estamos

**Plano ativo:** `docs/superpowers/plans/2026-07-31-fundacao-passos-0-3.md`
**Task atual:** 1 — Baseline limpo e memória do agente
**Spec:** `docs/superpowers/specs/2026-07-31-remodelagem-tapedido-design.md`

## Contexto que não está no código

- Os primeiros lojistas reais entram em **01/08/2026**. Antes disso o schema é
  livre; depois, toda mudança de tabela vira migração com dado de cliente.
- O app do garçom é outro repositório: `C:\Users\ANDERSON\tapedido-food-garcom`,
  publicado em https://tapedido-food-garcom.vercel.app
- Referência de regra de negócio para delivery: `C:\Users\ANDERSON\DEPGEST`
  (mesmo domínio, TypeScript). `MecOS-APP OFICINA` foi avaliado e descartado —
  domínio de oficina mecânica, sem sobreposição.

## Decisões tomadas

| Data | Decisão | Motivo |
|---|---|---|
| 31/07 | Segurança antes de qualquer feature | Janela sem base instalada fecha em 01/08 |
| 31/07 | Todo o schema entra de uma vez na Task 2 | Depois de 01/08 vira migração arriscada |
| 31/07 | Baixa de estoque desconta o próprio produto, não ficha técnica | É o que o anúncio promete; sem cadastro extra |
| 31/07 | Testes só nos caminhos de dinheiro e estoque | Pega o que custa dinheiro sem virar projeto de testes |
| 31/07 | `db.js` fatiado por domínio junto de cada feature | Evita refatoração grande sem testes |

## Concluído

- (nada ainda)

## Próximo

Tasks 2 a 6 deste plano. Depois, o plano das 8 features do anúncio.
```

- [ ] **Step 7: Commitar a memória**

```bash
git add CLAUDE.md docs/ESTADO.md
git commit -m "docs: CLAUDE.md e ESTADO.md como memoria entre sessoes

CLAUDE.md e carregado automaticamente a cada sessao e guarda so o que e
permanente: arquitetura, comandos e as armadilhas que ja causaram bug em
producao. ESTADO.md guarda o que muda: task atual, decisoes com data,
concluido.

A separacao existe para o CLAUDE.md ficar curto e sempre verdadeiro. Se o
historico crescesse junto, ele poluiria o contexto de toda sessao.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Verificar árvore limpa**

```bash
git status --short
```

Esperado: nenhuma saída.

---

## Task 2: Schema definitivo

O passo irreversível. Todas as colunas que as 8 features do anúncio exigem,
inclusive as que só serão usadas semana que vem.

**Files:**
- Modify: `electron/database/db.js:352-360` (inserir após o bloco de migrations existente)

**Interfaces:**
- Consumes: HEAD limpo da Task 1.
- Produces: as colunas `estoque_movimentacoes.saldo_anterior`, `.saldo_posterior`,
  `.referencia_tipo`, `.referencia_id`; `itens_pedido.custo_unitario`;
  `comanda_itens.custo_unitario`; `entregadores.placa`;
  `pedidos.status_alterado_em`; `configuracoes.impressora_tipo`,
  `.impressora_copias`. Mais os índices `idx_estoque_ref` (único, parcial) e
  `idx_menu_codigo_barras` (parcial). As Tasks 4, 7, 9 do plano de features
  dependem destas colunas.

- [ ] **Step 1: Adicionar as migrations**

Em `electron/database/db.js`, logo após o bloco `CREATE TABLE IF NOT EXISTS
sync_logs` que termina na linha 360, antes do comentário
`// ── Helpers ──`, inserir:

```js
// ── Schema das features do anuncio (31/07/2026) ────────────────────────────
// Entra tudo de uma vez, inclusive o que so sera usado nas features
// seguintes. Motivo: ate 01/08 nao ha dado de cliente e o schema e livre;
// depois disso cada ALTER TABLE vira migracao com banco de lojista em
// producao. Ver docs/superpowers/specs/2026-07-31-remodelagem-tapedido-design.md

// Razao contabil do estoque. saldo_anterior/saldo_posterior tornam o
// historico auditavel: da para reconstruir como o saldo chegou onde chegou,
// em vez de so ver o valor final.
for (const col of ['saldo_anterior REAL', 'saldo_posterior REAL',
                   'referencia_tipo TEXT', 'referencia_id TEXT']) {
  try { db.exec(`ALTER TABLE estoque_movimentacoes ADD COLUMN ${col}`) } catch {}
}

// A protecao contra baixa dupla e do banco, nao do codigo. O caixa ja foi
// mordido por isso: o eco do realtime do app do garcom lancava a mesma venda
// duas vezes e a defesa era heuristica. Aqui a segunda tentativa e recusada
// pelo indice.
try {
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_estoque_ref
    ON estoque_movimentacoes (referencia_tipo, referencia_id, menu_item_id)
    WHERE referencia_tipo IS NOT NULL`)
} catch {}

// Custo fotografado no momento da venda. Sem isto, o relatorio de custo x
// lucro leria o custo ATUAL do produto e um reajuste de fornecedor em
// outubro reescreveria o lucro de agosto. Nao ha conserto depois: o custo da
// epoca nao fica registrado em lugar nenhum.
try { db.exec(`ALTER TABLE itens_pedido ADD COLUMN custo_unitario REAL DEFAULT 0`) } catch {}
try { db.exec(`ALTER TABLE comanda_itens ADD COLUMN custo_unitario REAL DEFAULT 0`) } catch {}

try { db.exec(`ALTER TABLE entregadores ADD COLUMN placa TEXT`) } catch {}

// Alimenta o "ha quanto tempo neste estagio" das colunas do kanban.
try { db.exec(`ALTER TABLE pedidos ADD COLUMN status_alterado_em TEXT`) } catch {}

// Sem impressora_tipo o codigo teria que adivinhar USB ou rede pelo
// preenchimento do IP.
try { db.exec(`ALTER TABLE configuracoes ADD COLUMN impressora_tipo TEXT DEFAULT 'usb'`) } catch {}
try { db.exec(`ALTER TABLE configuracoes ADD COLUMN impressora_copias INTEGER DEFAULT 1`) } catch {}

// Indice parcial: a maioria dos produtos de restaurante nao tem codigo de
// barras. FormProduto grava string vazia quando o campo fica em branco e o
// schema permite NULL; os dois casos ficam de fora.
try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_menu_codigo_barras
    ON menu_items (codigo_barras)
    WHERE codigo_barras IS NOT NULL AND codigo_barras != ''`)
} catch {}
```

- [ ] **Step 2: Verificar que as migrations aplicam num banco vazio**

```bash
cd "C:\Users\ANDERSON\tapedido-food"
```

```powershell
$env:ELECTRON_RUN_AS_NODE = "1"
$env:TAPEDIDO_DB_PATH = "$env:TEMP\schema-check.db"
Remove-Item $env:TAPEDIDO_DB_PATH -ErrorAction SilentlyContinue
& npx electron -e "require('./electron/database/db.js'); console.log('migrations ok')"
```

> A variável `TAPEDIDO_DB_PATH` só passa a ser respeitada na Task 3. Nesta task,
> o banco cai em `./tapedido.db` (raiz do repo) porque `app` é `undefined` fora
> do Electron. Apagar esse arquivo ao final do step 3.

Esperado: `migrations ok`, sem exceção.

- [ ] **Step 3: Verificar que as colunas existem de fato**

```powershell
$env:ELECTRON_RUN_AS_NODE = "1"
& npx electron -e @"
const D = require('better-sqlite3');
const d = new D('./tapedido.db');
const cols = (t) => d.prepare('PRAGMA table_info(' + t + ')').all().map(c => c.name);
const esperado = {
  estoque_movimentacoes: ['saldo_anterior','saldo_posterior','referencia_tipo','referencia_id'],
  itens_pedido: ['custo_unitario'],
  comanda_itens: ['custo_unitario'],
  entregadores: ['placa'],
  pedidos: ['status_alterado_em'],
  configuracoes: ['impressora_tipo','impressora_copias'],
};
let falhou = false;
for (const [tabela, novas] of Object.entries(esperado)) {
  const atuais = cols(tabela);
  for (const c of novas) {
    if (!atuais.includes(c)) { console.log('FALTA: ' + tabela + '.' + c); falhou = true; }
  }
}
const idx = d.prepare(\"SELECT name FROM sqlite_master WHERE type='index'\").all().map(i => i.name);
for (const i of ['idx_estoque_ref','idx_menu_codigo_barras']) {
  if (!idx.includes(i)) { console.log('FALTA indice: ' + i); falhou = true; }
}
console.log(falhou ? 'FALHOU' : 'SCHEMA OK');
"@
```

Esperado: `SCHEMA OK`.

Limpar: `Remove-Item ./tapedido.db, ./tapedido.db-wal, ./tapedido.db-shm -ErrorAction SilentlyContinue`

- [ ] **Step 4: Verificar que o índice único realmente bloqueia baixa dupla**

Este é o comportamento que justifica o índice. Precisa ser provado, não assumido.

```powershell
$env:ELECTRON_RUN_AS_NODE = "1"
& npx electron -e @"
const D = require('better-sqlite3');
const d = new D(':memory:');
d.exec(\`CREATE TABLE estoque_movimentacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, menu_item_id INTEGER NOT NULL,
  tipo TEXT NOT NULL, quantidade REAL NOT NULL, criado_em TEXT NOT NULL,
  referencia_tipo TEXT, referencia_id TEXT);
CREATE UNIQUE INDEX idx_estoque_ref ON estoque_movimentacoes
  (referencia_tipo, referencia_id, menu_item_id) WHERE referencia_tipo IS NOT NULL;\`);
const ins = d.prepare(\"INSERT INTO estoque_movimentacoes (menu_item_id,tipo,quantidade,criado_em,referencia_tipo,referencia_id) VALUES (?,'saida',1,'x',?,?)\");
ins.run(1,'pedido','42');
try { ins.run(1,'pedido','42'); console.log('FALHOU: aceitou baixa dupla'); }
catch (e) { console.log('OK: baixa dupla recusada'); }
ins.run(2,'pedido','42');
console.log('OK: outro produto no mesmo pedido passa');
d.prepare(\"INSERT INTO estoque_movimentacoes (menu_item_id,tipo,quantidade,criado_em) VALUES (1,'entrada',5,'x')\").run();
d.prepare(\"INSERT INTO estoque_movimentacoes (menu_item_id,tipo,quantidade,criado_em) VALUES (1,'entrada',5,'x')\").run();
console.log('OK: movimentacao manual (sem referencia) nao e bloqueada');
"@
```

Esperado, nesta ordem:
```
OK: baixa dupla recusada
OK: outro produto no mesmo pedido passa
OK: movimentacao manual (sem referencia) nao e bloqueada
```

O terceiro caso importa: entrada manual de estoque não tem referência, e o
índice parcial precisa deixá-la passar sem limite.

- [ ] **Step 5: Commitar**

```bash
git add electron/database/db.js
git commit -m "feat: schema definitivo das features do anuncio

Entra tudo de uma vez, inclusive o que so sera usado nas proximas
features. Ate 01/08 nao ha dado de cliente e o schema e livre; depois
disso cada ALTER TABLE vira migracao com banco de lojista em producao.

Destaques:

- estoque_movimentacoes ganha razao contabil (saldo_anterior,
  saldo_posterior) e referencia (referencia_tipo, referencia_id) com
  indice unico parcial. A protecao contra baixa dupla passa a ser do
  banco, nao heuristica no codigo. Movimentacao manual, sem referencia,
  segue livre.

- itens_pedido e comanda_itens ganham custo_unitario. Sem isso o
  relatorio de custo x lucro leria o custo atual do produto e um
  reajuste de fornecedor reescreveria o lucro dos meses passados. Nao
  ha conserto depois: o custo da epoca nao fica registrado.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Atualizar `docs/ESTADO.md`**

Mover a Task 2 para "Concluído" e apontar "Task atual" para a 3. Commitar junto
da próxima task.

---

## Task 3: Infraestrutura de teste

Sem isto não há como testar nada: o `db.js` abre o banco no carregamento do
módulo, num caminho fixo, e o `better-sqlite3` não carrega no Node do sistema.

**Files:**
- Modify: `electron/database/db.js:35-52`
- Modify: `package.json` (script `test` + devDependencies)
- Create: `vitest.config.js`
- Create: `test/helpers/banco.js`
- Create: `test/fumaca.test.js`

**Interfaces:**
- Consumes: schema da Task 2.
- Produces: `npm test` funcionando; `test/helpers/banco.js` exportando
  `abrirBancoLimpo()` que devolve `{ db, fechar }`, usado por toda a Task 4.

- [ ] **Step 1: Tornar o caminho do banco configurável**

Em `electron/database/db.js`, substituir as linhas 35-52 por:

```js
const userDataPath = app ? app.getPath('userData') : '.'
// TAPEDIDO_DB_PATH existe para os testes. Fora do Electron `app` e undefined e
// o banco cairia em ./tapedido.db, dentro do repositorio; com a variavel cada
// suite abre seu proprio arquivo temporario e nada vaza entre testes.
const dbPath = process.env.TAPEDIDO_DB_PATH || path.join(userDataPath, 'tapedido.db')
console.log('[db] dbPath:', dbPath)

// Carrega o token salvo antes de qualquer chamada ao Supabase.
try { sessaoSupabase.configurar(userDataPath) } catch (err) {
  console.warn('[db] sessão do Supabase não carregou:', err.message)
}

let db
try {
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
} catch (err) {
  // `dialog` e undefined fora do Electron. Sem esta guarda, uma falha em teste
  // viraria "cannot read properties of undefined", escondendo o erro real.
  if (dialog) {
    dialog.showErrorBox('Erro: SQLite', `Falha ao abrir o banco de dados:\n${dbPath}\n\n${err.message}\n\nStack:\n${err.stack}`)
    process.exit(1)
  }
  throw err
}
```

Aplicar a mesma guarda de `dialog` no `catch` do `require('better-sqlite3')`
nas linhas 8-13:

```js
try {
  Database = require('better-sqlite3')
} catch (err) {
  if (dialog) {
    dialog.showErrorBox('Erro: better-sqlite3', `Falha ao carregar o banco de dados:\n\n${err.message}\n\nStack:\n${err.stack}`)
    process.exit(1)
  }
  throw err
}
```

- [ ] **Step 2: Instalar Vitest**

Vitest 1.6 é a última linha que suporta com folga o Node 18.18.2 que o Electron
28 embute. `cross-env` é necessário porque o script precisa exportar variável de
ambiente no Windows.

```bash
npm install --save-dev vitest@^1.6.0 cross-env@^7.0.3
```

- [ ] **Step 3: Criar o `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    // Cada arquivo de teste abre seu proprio SQLite. Rodar em paralelo criaria
    // corrida por arquivo de banco e o erro apareceria como falha aleatoria.
    fileParallelism: false,
    testTimeout: 20000,
  },
})
```

- [ ] **Step 4: Adicionar o script de teste**

Em `package.json`, dentro de `scripts`:

```json
"test": "cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run",
"test:watch": "cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs"
```

- [ ] **Step 5: Escrever o teste de fumaça**

Antes de escrever teste de negócio, provar que a infraestrutura funciona. Se
este falhar, nada da Task 4 vai rodar.

`test/fumaca.test.js`:

```js
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'

describe('infraestrutura de teste', () => {
  it('carrega o better-sqlite3 com o ABI do Electron', () => {
    // Se isto falhar com NODE_MODULE_VERSION, o teste nao esta rodando sob
    // ELECTRON_RUN_AS_NODE. Ver o script `test` no package.json.
    const db = new Database(':memory:')
    db.exec('CREATE TABLE t (id INTEGER, nome TEXT)')
    db.prepare('INSERT INTO t VALUES (?, ?)').run(1, 'ok')
    expect(db.prepare('SELECT nome FROM t WHERE id = 1').get().nome).toBe('ok')
    db.close()
  })
})
```

- [ ] **Step 6: Rodar o teste de fumaça**

```bash
npm test
```

Esperado: `1 passed`.

> **Se falhar com erro de ESM/CJS ou o Vitest não subir sob o Electron:** não
> insistir. Trocar para o `node:test`, que é embutido no Node 18 e não tem
> nenhuma camada de transformação. Nesse caso o script vira
> `cross-env ELECTRON_RUN_AS_NODE=1 electron --test test/` e os testes usam
> `const { test } = require('node:test')` + `assert`. O objetivo da Task 4 é o
> mesmo nos dois casos; só muda a sintaxe. Registrar a troca no `ESTADO.md`.

- [ ] **Step 7: Criar o helper de banco limpo**

`test/helpers/banco.js`:

```js
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

/**
 * Abre uma instancia limpa do modulo de banco, com schema aplicado, num arquivo
 * temporario proprio.
 *
 * Por que recarregar o modulo: `db.js` abre a conexao no momento do require e
 * guarda tudo em escopo de modulo. Sem limpar o cache, o segundo teste
 * receberia a conexao do primeiro, com os dados dele dentro.
 */
function abrirBancoLimpo() {
  const arquivo = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'tapedido-teste-')),
    'teste.db'
  )
  process.env.TAPEDIDO_DB_PATH = arquivo

  const caminhoModulo = require.resolve('../../electron/database/db.js')
  delete require.cache[caminhoModulo]
  const db = require(caminhoModulo)

  return {
    db,
    fechar() {
      try { db.getRawDb().close() } catch {}
      delete require.cache[caminhoModulo]
      try { fs.rmSync(path.dirname(arquivo), { recursive: true, force: true }) } catch {}
    },
  }
}

module.exports = { abrirBancoLimpo }
```

- [ ] **Step 8: Provar o isolamento entre testes**

Adicionar a `test/fumaca.test.js`:

```js
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { abrirBancoLimpo } = require('./helpers/banco.js')

describe('isolamento entre testes', () => {
  it('cada abertura comeca com banco vazio', () => {
    const a = abrirBancoLimpo()
    a.db.mesas.criar({ numero: 1, capacidade: 4 })
    expect(a.db.mesas.listar()).toHaveLength(1)
    a.fechar()

    // Se o cache do modulo nao fosse limpo, esta mesa apareceria aqui.
    const b = abrirBancoLimpo()
    expect(b.db.mesas.listar()).toHaveLength(0)
    b.fechar()
  })
})
```

- [ ] **Step 9: Rodar**

```bash
npm test
```

Esperado: `2 passed`.

- [ ] **Step 10: Ignorar artefatos de teste no git**

Adicionar ao `.gitignore`, se ainda não estiverem:

```
tapedido.db
tapedido.db-wal
tapedido.db-shm
```

- [ ] **Step 11: Commitar**

```bash
git add electron/database/db.js package.json package-lock.json vitest.config.js test/ .gitignore
git commit -m "test: infraestrutura de teste sob o runtime do Electron

O projeto nao tinha nenhum teste. Dois obstaculos precisavam cair antes
do primeiro:

better-sqlite3 esta compilado para o ABI do Electron 28 (NODE_MODULE_
VERSION 119) e o Node do sistema e v24 (ABI 137) — nao carrega. Os
testes rodam com ELECTRON_RUN_AS_NODE=1, que da Node 18.18.2 / ABI 119.

db.js abria o banco num caminho fixo no momento do require. Passa a
respeitar TAPEDIDO_DB_PATH, o que da a cada suite um arquivo proprio. O
helper limpa o cache do modulo entre aberturas; sem isso o segundo teste
herdaria a conexao e os dados do primeiro.

As guardas de `dialog` existem porque ele e undefined fora do Electron:
sem elas, uma falha em teste viraria 'cannot read properties of
undefined' e esconderia o erro real.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Testes dos caminhos de dinheiro

Estes testes descrevem o comportamento **atual**, não features novas. Existem
para gritar quando uma task futura quebrar algo. O bug da venda de mesa que
falhou em silêncio por meses é exatamente o que eles pegariam.

**Files:**
- Create: `test/pedidos.test.js`
- Create: `test/caixa.test.js`
- Create: `test/relatorios.test.js`

**Interfaces:**
- Consumes: `abrirBancoLimpo()` de `test/helpers/banco.js` (Task 3).
- Produces: suíte verde que as Tasks do plano de features precisam manter verde.

- [ ] **Step 1: Testes de `pedidos.criar`**

`test/pedidos.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { abrirBancoLimpo } = require('./helpers/banco.js')

let ctx
beforeEach(() => { ctx = abrirBancoLimpo() })
afterEach(() => ctx.fechar())

describe('pedidos.criar', () => {
  it('grava o pedido e seus itens', () => {
    const pedido = ctx.db.pedidos.criar({
      tipoEntrega: 'entrega',
      nomeCliente: 'Ana',
      formaPagamento: 'pix',
      subtotal: 30,
      total: 35,
      taxaEntrega: 5,
      itens: [
        { nomeItem: 'X-Burguer', quantidade: 2, precoUnitario: 15, subtotal: 30 },
      ],
    })

    expect(pedido.id).toBeGreaterThan(0)
    expect(pedido.total).toBe(35)

    const completo = ctx.db.pedidos.getById(pedido.id)
    expect(completo.itens).toHaveLength(1)
    expect(completo.itens[0].nome_item).toBe('X-Burguer')
    expect(completo.itens[0].quantidade).toBe(2)
  })

  it('deriva o subtotal dos itens quando nao vem explicito', () => {
    // A coluna subtotal e NOT NULL. Sem esta derivacao o INSERT falharia.
    const pedido = ctx.db.pedidos.criar({
      tipoEntrega: 'retirada',
      itens: [
        { nomeItem: 'Coca', quantidade: 2, precoUnitario: 5, subtotal: 10 },
        { nomeItem: 'Agua', quantidade: 1, precoUnitario: 3, subtotal: 3 },
      ],
    })
    expect(pedido.subtotal).toBe(13)
  })

  it('numera os pedidos em sequencia', () => {
    const um = ctx.db.pedidos.criar({ tipoEntrega: 'entrega', total: 10, subtotal: 10, itens: [] })
    const dois = ctx.db.pedidos.criar({ tipoEntrega: 'entrega', total: 10, subtotal: 10, itens: [] })
    expect(dois.numero_pedido).toBe(um.numero_pedido + 1)
  })

  it('recusa pedido sem tipoEntrega', () => {
    expect(() => ctx.db.pedidos.criar({ total: 10, itens: [] })).toThrow(/tipoEntrega/)
  })

  it('aceita as chaves em snake_case vindas do renderer', () => {
    // Mesas.jsx enviava snake_case enquanto criar() lia camelCase. Toda venda
    // de salao falhava em silencio por causa disso. O normalizador cobre os
    // dois formatos; este teste impede a regressao.
    const pedido = ctx.db.pedidos.criar({
      tipo_entrega: 'mesa',
      nome_cliente: 'Mesa 3',
      forma_pagamento: 'dinheiro',
      subtotal: 20,
      total: 20,
      itens: [{ nome_item: 'Pastel', quantidade: 1, preco_unitario: 20, subtotal: 20 }],
    })
    expect(pedido.tipo_entrega).toBe('mesa')
    expect(ctx.db.pedidos.getById(pedido.id).itens[0].nome_item).toBe('Pastel')
  })
})
```

> **Se o último teste falhar:** `pedidos.criar` só aceita camelCase. Não
> "consertar" o teste — reportar ao usuário. Significa que o caminho de
> `Mesas.jsx` depende de o renderer enviar exatamente camelCase, e vale
> normalizar as duas formas antes de seguir.

- [ ] **Step 2: Rodar**

```bash
npm test test/pedidos.test.js
```

Esperado: 5 passed. Se algum falhar, ler a mensagem e reportar antes de mudar
código de produção — estes testes descrevem o que **deveria** já funcionar.

- [ ] **Step 3: Testes do caixa**

`test/caixa.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { abrirBancoLimpo } = require('./helpers/banco.js')

let ctx
beforeEach(() => {
  ctx = abrirBancoLimpo()
  ctx.db.caixa.abrir({ valorInicial: 100 })
})
afterEach(() => ctx.fechar())

describe('caixa.registrarVenda', () => {
  it('soma na coluna da forma de pagamento', () => {
    ctx.db.caixa.registrarVenda({ valor: 50, formaPagamento: 'pix', descricao: 'Mesa 1' })
    const sessao = ctx.db.caixa.sessaoAtual()
    expect(sessao.total_pix).toBe(50)
    expect(sessao.total_dinheiro).toBe(0)
  })

  it('normaliza variantes da forma de pagamento', () => {
    // O app do garcom grava 'PIX' e 'Débito'; o PDV grava 'pix' e 'debito'.
    // Sem normalizar, o valor entrava como forma desconhecida e sumia do total
    // da sessao sem aviso nenhum ao lojista.
    ctx.db.caixa.registrarVenda({ valor: 10, formaPagamento: 'PIX', descricao: 'a' })
    ctx.db.caixa.registrarVenda({ valor: 20, formaPagamento: 'Débito', descricao: 'b' })
    ctx.db.caixa.registrarVenda({ valor: 30, formaPagamento: 'cartao de credito', descricao: 'c' })
    const s = ctx.db.caixa.sessaoAtual()
    expect(s.total_pix).toBe(10)
    expect(s.total_debito).toBe(20)
    expect(s.total_credito).toBe(30)
  })

  it('nao lanca a mesma venda duas vezes quando ha refExterna', () => {
    // Esta e a defesa contra o eco do realtime do app do garcom: o PDV fecha a
    // mesa e o evento volta pelo canal, tentando lancar de novo.
    ctx.db.caixa.registrarVenda({ valor: 40, formaPagamento: 'dinheiro', refExterna: 'comanda:abc' })
    ctx.db.caixa.registrarVenda({ valor: 40, formaPagamento: 'dinheiro', refExterna: 'comanda:abc' })
    expect(ctx.db.caixa.sessaoAtual().total_dinheiro).toBe(40)
  })

  it('lanca vendas distintas com referencias distintas', () => {
    ctx.db.caixa.registrarVenda({ valor: 10, formaPagamento: 'dinheiro', refExterna: 'comanda:a' })
    ctx.db.caixa.registrarVenda({ valor: 15, formaPagamento: 'dinheiro', refExterna: 'comanda:b' })
    expect(ctx.db.caixa.sessaoAtual().total_dinheiro).toBe(25)
  })

  it('sangria e suprimento entram no saldo', () => {
    ctx.db.caixa.registrarVenda({ valor: 100, formaPagamento: 'dinheiro', refExterna: 'v:1' })
    ctx.db.caixa.sangria({ valor: 30, descricao: 'troco' })
    ctx.db.caixa.suprimento({ valor: 20, descricao: 'reforco' })
    const s = ctx.db.caixa.sessaoAtual()
    expect(s.total_sangria).toBe(30)
    expect(s.total_suprimento).toBe(20)
    // saldo em dinheiro = inicial + vendas em dinheiro + suprimento - sangria
    expect(s.valor_inicial + s.total_dinheiro + s.total_suprimento - s.total_sangria).toBe(190)
  })
})
```

- [ ] **Step 4: Rodar**

```bash
npm test test/caixa.test.js
```

Esperado: 5 passed.

- [ ] **Step 5: Testes de dashboard e relatórios**

`test/relatorios.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { abrirBancoLimpo } = require('./helpers/banco.js')

let ctx
beforeEach(() => { ctx = abrirBancoLimpo() })
afterEach(() => ctx.fechar())

describe('dashboard', () => {
  it('nao conta a venda de mesa duas vezes', () => {
    // Armadilha central deste projeto: fechar mesa lanca no caixa E cria um
    // pedido tipo 'mesa'. dashboard() soma as duas fontes, entao a query de
    // pedidos precisa excluir 'mesa'. Sem isso, todo salao conta em dobro.
    ctx.db.caixa.abrir({ valorInicial: 0 })
    ctx.db.caixa.registrarVenda({ valor: 60, formaPagamento: 'dinheiro', refExterna: 'comanda:1' })
    ctx.db.pedidos.criar({
      tipoEntrega: 'mesa', nomeCliente: 'Mesa 1', formaPagamento: 'dinheiro',
      subtotal: 60, total: 60, status: 'entregue',
      itens: [{ nomeItem: 'Prato', quantidade: 1, precoUnitario: 60, subtotal: 60 }],
    })

    expect(ctx.db.pedidos.dashboard('hoje').receitaHoje).toBe(60)
  })

  it('soma delivery e mesa sem duplicar', () => {
    ctx.db.caixa.abrir({ valorInicial: 0 })
    ctx.db.caixa.registrarVenda({ valor: 60, formaPagamento: 'dinheiro', refExterna: 'comanda:1' })
    ctx.db.pedidos.criar({
      tipoEntrega: 'mesa', subtotal: 60, total: 60, status: 'entregue', itens: [],
    })
    ctx.db.pedidos.criar({
      tipoEntrega: 'entrega', subtotal: 40, total: 40, itens: [],
    })

    expect(ctx.db.pedidos.dashboard('hoje').receitaHoje).toBe(100)
  })

  it('ignora pedidos cancelados', () => {
    const p = ctx.db.pedidos.criar({ tipoEntrega: 'entrega', subtotal: 25, total: 25, itens: [] })
    ctx.db.pedidos.atualizar({ id: p.id, status: 'cancelado' })
    expect(ctx.db.pedidos.dashboard('hoje').receitaHoje).toBe(0)
  })
})

describe('relatorios', () => {
  const periodo = () => {
    const fim = new Date()
    const inicio = new Date(); inicio.setDate(inicio.getDate() - 7)
    return { inicio: inicio.toISOString(), fim: fim.toISOString() }
  }

  it('produtosMaisVendidos agrega por nome do item', () => {
    ctx.db.pedidos.criar({
      tipoEntrega: 'entrega', subtotal: 30, total: 30,
      itens: [{ nomeItem: 'X-Burguer', quantidade: 2, precoUnitario: 15, subtotal: 30 }],
    })
    ctx.db.pedidos.criar({
      tipoEntrega: 'entrega', subtotal: 15, total: 15,
      itens: [{ nomeItem: 'X-Burguer', quantidade: 1, precoUnitario: 15, subtotal: 15 }],
    })

    const top = ctx.db.relatorios.produtosMaisVendidos(periodo())
    const burguer = top.find(p => p.nome_item === 'X-Burguer')
    expect(burguer.total_vendido).toBe(3)
    expect(burguer.receita).toBe(45)
  })

  it('vendas soma receita e conta pedidos do periodo', () => {
    ctx.db.pedidos.criar({ tipoEntrega: 'entrega', subtotal: 20, total: 20, itens: [] })
    ctx.db.pedidos.criar({ tipoEntrega: 'entrega', subtotal: 30, total: 30, itens: [] })

    const linhas = ctx.db.relatorios.vendas(periodo())
    const soma = linhas.reduce((a, l) => a + l.receita, 0)
    const qtd = linhas.reduce((a, l) => a + l.total_pedidos, 0)
    expect(soma).toBe(50)
    expect(qtd).toBe(2)
  })
})
```

> `dashboard()` devolve `{ receitaHoje, pedidosAbertos, pedidosHoje, ticketMedio }`
> — confirmado em `electron/database/db.js:1184-1189`. O campo chama-se
> `receitaHoje` mesmo quando o periodo pedido e `7dias` ou `30dias`.

- [ ] **Step 6: Rodar a suíte inteira**

```bash
npm test
```

Esperado: todos os arquivos verdes.

- [ ] **Step 7: Commitar**

```bash
git add test/
git commit -m "test: congelar os caminhos de dinheiro do sistema

Descrevem o comportamento atual, nao features novas. Existem para gritar
quando uma mudanca futura quebrar algo — o bug da venda de mesa que
falhou em silencio por meses e exatamente o que eles pegariam.

Cobrem: criacao de pedido com itens, derivacao de subtotal, numeracao,
aceitacao de snake_case vindo do renderer, totalizacao do caixa por
forma de pagamento, normalizacao das variantes que o app do garcom
grava, deduplicacao por refExterna, sangria e suprimento, dashboard sem
contar mesa em dobro, e agregacao dos relatorios.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Atualizar `docs/ESTADO.md`**

Mover Tasks 2–4 para "Concluído", registrar o número de testes e o comando.

---

## Task 5: App do garçom adota o JWT

Pré-requisito da Task 6. Virar a RLS sem isto derruba o app do garçom
justamente no sábado, quando os lojistas começam a usá-lo.

**Files (no repositório `C:\Users\ANDERSON\tapedido-food-garcom`):**
- Modify: `src/lib/supabase.js`
- Create: `src/lib/sessao.js`
- Modify: a tela de login (localizar com `grep -rn "codigo_loja" src/`)

**Interfaces:**
- Consumes: a Edge Function `entrar`, já publicada. Contrato completo em
  `docs/spec-app-garcom-jwt.md`, seção 3.
- Produces: cliente Supabase que envia o JWT em REST **e** Realtime, com
  fallback para a chave anon. A Task 6 depende disso.

- [ ] **Step 1: Ler a spec**

Ler `C:\Users\ANDERSON\tapedido-food\docs\spec-app-garcom-jwt.md` inteira. Ela é
autocontida e descreve o contrato da Edge Function, os códigos de erro e o que
não fazer.

- [ ] **Step 2: Mapear o login atual**

```bash
cd "C:\Users\ANDERSON\tapedido-food-garcom"
git status --short
grep -rn "codigo_loja\|codigo_garcom" src/ --include=*.js --include=*.jsx
```

Esperado: árvore limpa. Identificar o arquivo que hoje valida as credenciais
consultando as tabelas direto.

- [ ] **Step 3: Criar o módulo de sessão**

`src/lib/sessao.js`:

```js
// Sessao do garcom: troca codigo da loja + codigo do garcom por um JWT com a
// claim loja_id, emitido pela Edge Function `entrar`.
//
// Enquanto a RLS nao vira, `tokenAtual()` devolve a chave anon quando nao ha
// token. E esse fallback que permite publicar esta versao antes do corte.
const SUPABASE_URL = 'https://xckystaizmgubayuwtsx.supabase.co'
const CHAVE = 'sessao-garcom'
const RENOVAR_FALTANDO_DIAS = 7

export function lerSessao() {
  try { return JSON.parse(localStorage.getItem(CHAVE)) } catch { return null }
}

export function salvarSessao(sessao) {
  localStorage.setItem(CHAVE, JSON.stringify(sessao))
}

export function limparSessao() {
  localStorage.removeItem(CHAVE)
}

export function tokenValido() {
  const s = lerSessao()
  if (!s?.token || !s?.expira_em) return null
  return new Date(s.expira_em) > new Date() ? s.token : null
}

export function precisaRenovar() {
  const s = lerSessao()
  if (!s?.expira_em) return false
  const faltam = (new Date(s.expira_em) - new Date()) / 86400000
  return faltam < RENOVAR_FALTANDO_DIAS
}

/**
 * Devolve { sessao }, { negado: true } ou { indisponivel: true }.
 *
 * A distincao entre negado e indisponivel importa: sem ela o garcom ve
 * "codigo invalido" quando o problema e a internet do salao.
 */
export async function entrar(codigoLoja, codigoGarcom, anonKey) {
  let resp
  try {
    resp = await fetch(`${SUPABASE_URL}/functions/v1/entrar`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tipo: 'garcom',
        codigo_loja: codigoLoja,
        codigo_garcom: codigoGarcom,
      }),
    })
  } catch {
    return { indisponivel: true }
  }

  if (resp.status >= 500) return { indisponivel: true }

  const corpo = await resp.json().catch(() => null)
  if (!resp.ok || !corpo?.sucesso) return { negado: true }

  salvarSessao(corpo)
  return { sessao: corpo }
}
```

- [ ] **Step 4: Fazer o cliente Supabase usar o token**

Em `src/lib/supabase.js`, substituir a linha 9:

```js
import { createClient } from '@supabase/supabase-js'
import { tokenValido } from './sessao'

const SUPABASE_URL = 'https://xckystaizmgubayuwtsx.supabase.co'
const SUPABASE_ANON_KEY = '<manter a chave que ja esta no arquivo>'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  // accessToken cobre REST e Realtime de uma vez. Se ficasse so no REST, o app
  // continuaria recebendo eventos e pararia de funcionar no dia da virada.
  // Sem token guardado devolve a chave anon: e o fallback que permite publicar
  // antes de a RLS fechar.
  accessToken: async () => tokenValido() ?? SUPABASE_ANON_KEY,
})

export { SUPABASE_ANON_KEY }
```

- [ ] **Step 5: Confirmar a versão do `supabase-js`**

A opção `accessToken` exige `@supabase/supabase-js` >= 2.44.

```bash
node -p "require('./package.json').dependencies['@supabase/supabase-js']"
```

Se for menor que 2.44:

```bash
npm install @supabase/supabase-js@^2.45.0
```

- [ ] **Step 6: Ligar o login à Edge Function**

No arquivo de login localizado no Step 2, trocar a consulta direta às tabelas
por:

```js
import { entrar } from '../lib/sessao'
import { SUPABASE_ANON_KEY } from '../lib/supabase'

const r = await entrar(codigoLoja, codigoGarcom, SUPABASE_ANON_KEY)

if (r.indisponivel) {
  setErro('Serviço indisponível. Verifique a conexão e tente de novo.')
  return
}
if (r.negado) {
  setErro('Código da loja ou do garçom inválido.')
  return
}

// r.sessao traz token, loja_id, nome_loja, garcom_id, garcom_nome, expira_em.
// Usar r.sessao.loja_id — nunca decodificar o JWT no cliente.
prosseguirParaOSalao(r.sessao)
```

Manter todos os `.eq('loja_id', lojaId)` existentes nas consultas. A RLS é a
segunda barreira, não a única.

- [ ] **Step 7: Testar localmente**

```bash
npm run dev
```

Verificar, na ordem:

1. Login com códigos corretos → entra, e `localStorage.getItem('sessao-garcom')`
   contém `token` e `loja_id`.
2. Login com código de garçom errado → mensagem de código inválido, e **nenhum**
   token guardado.
3. Com o token guardado, listar mesas e lançar um item → funciona igual a antes.
   Isto prova que a troca de token não quebrou nada.
4. `localStorage.removeItem('sessao-garcom')` e recarregar → o app continua
   funcionando pela chave anon. Prova do fallback.

Os quatro precisam passar antes de seguir. O item 3 é o mais importante: é a
prova de que a Task 6 não vai derrubar o salão.

- [ ] **Step 8: Commitar**

```bash
git add src/lib/sessao.js src/lib/supabase.js package.json package-lock.json
git add <arquivo de login>
git commit -m "feat: login troca credenciais por JWT com a claim loja_id

Prepara a virada da RLS. O login passa pela Edge Function entrar, que
confere codigo da loja + codigo do garcom e devolve um token assinado
pelo servidor.

accessToken cobre REST e Realtime de uma vez. Se ficasse so no REST, o
app continuaria recebendo eventos e pararia de funcionar no dia do
corte.

Sem token guardado o cliente devolve a chave anon, entao esta versao
pode ser publicada antes de a RLS fechar. Os filtros .eq('loja_id')
continuam nas consultas: a RLS e a segunda barreira, nao a unica.

Erro de credencial e erro de servico sao distinguidos — sem isso o
garcom veria 'codigo invalido' quando o problema e a internet do salao.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 9: Publicar — pedir confirmação ao usuário**

Publicar o app do garçom é uma ação externa e visível. **Perguntar antes:**

*"App do garçom pronto e testado. Posso publicar? Isso o torna a versão que
seus garçons vão usar."*

Só após o "sim", seguir o fluxo de deploy do repositório (Vercel).

- [ ] **Step 10: Confirmar em produção**

Abrir https://tapedido-food-garcom.vercel.app, fazer login real e repetir os
quatro testes do Step 7. A Task 6 só pode começar depois disso.

---

## Task 6: Virada da RLS

A janela que fecha em 01/08. Depois disso, cada lojista instalado é um cliente
que a mudança pode derrubar.

**Files:**
- Nenhum arquivo local. Migrations aplicadas no Supabase via MCP
  (`mcp__4726faba-...__apply_migration`), projeto `xckystaizmgubayuwtsx`.
- Modify: `docs/auditoria-2026-07-30.md` (atualizar a tabela de situação)

**Interfaces:**
- Consumes: PDV (Task 1) e app do garçom (Task 5), ambos publicados e enviando
  o JWT.
- Produces: isolamento entre lojas garantido pelo servidor.

- [ ] **Step 1: Confirmar os dois clientes em produção**

Não prosseguir se qualquer um falhar:

- [ ] App do garçom publicado e logando via `entrar` (Task 5, Step 10)
- [ ] PDV com `sessaoSupabase` commitado (Task 1)
- [ ] Confirmar com o usuário que nenhum lojista real está usando o sistema
      neste momento

- [ ] **Step 2: Levantar o estado real das políticas e colunas**

Não assumir o schema. Consultar:

```sql
select tablename, policyname, cmd, qual, with_check
from pg_policies where schemaname = 'public' order by tablename;
```

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public' and column_name = 'loja_id'
order by table_name;
```

Anotar quais das 10 tabelas (`lojas`, `configuracoes`, `menu_items`, `mesas`,
`comandas`, `comanda_itens`, `pedidos`, `itens_pedido`, `garcons`,
`zonas_entrega`) **não** têm `loja_id`.

- [ ] **Step 3: Resolver as tabelas sem `loja_id`**

Duas situações previstas:

**`lojas`** — a própria linha é a loja. A política usa `id`, não `loja_id`:

```sql
using (id = (auth.jwt() ->> 'loja_id')::uuid)
```

**`itens_pedido`** — se não tiver `loja_id`, a política vai pelo pai:

```sql
using (exists (
  select 1 from public.pedidos p
  where p.id = itens_pedido.pedido_id
    and p.loja_id = (auth.jwt() ->> 'loja_id')::uuid
))
```

> `comanda_itens` **já tem** `loja_id`, preenchido por trigger — ver
> `docs/auditoria-2026-07-30.md`, item 3.3. Confirmar no Step 2 antes de
> assumir.

- [ ] **Step 4: Aplicar as políticas, uma tabela por vez**

Começar por uma tabela de baixo risco (`zonas_entrega`) para validar o formato
antes de aplicar às demais:

```sql
drop policy if exists anon_all_zonas_entrega on public.zonas_entrega;

create policy loja_isolada on public.zonas_entrega
  for all to anon
  using ((auth.jwt() ->> 'loja_id')::uuid = loja_id)
  with check ((auth.jwt() ->> 'loja_id')::uuid = loja_id);
```

Testar imediatamente (Step 5) antes de seguir. Só depois aplicar as demais:

```sql
-- Tabelas com loja_id direto
drop policy if exists anon_all_configuracoes on public.configuracoes;
create policy loja_isolada on public.configuracoes
  for all to anon
  using ((auth.jwt() ->> 'loja_id')::uuid = loja_id)
  with check ((auth.jwt() ->> 'loja_id')::uuid = loja_id);

drop policy if exists anon_all_menu_items on public.menu_items;
create policy loja_isolada on public.menu_items
  for all to anon
  using ((auth.jwt() ->> 'loja_id')::uuid = loja_id)
  with check ((auth.jwt() ->> 'loja_id')::uuid = loja_id);

drop policy if exists anon_all_mesas on public.mesas;
create policy loja_isolada on public.mesas
  for all to anon
  using ((auth.jwt() ->> 'loja_id')::uuid = loja_id)
  with check ((auth.jwt() ->> 'loja_id')::uuid = loja_id);

drop policy if exists anon_all_comandas on public.comandas;
create policy loja_isolada on public.comandas
  for all to anon
  using ((auth.jwt() ->> 'loja_id')::uuid = loja_id)
  with check ((auth.jwt() ->> 'loja_id')::uuid = loja_id);

drop policy if exists anon_all_comanda_itens on public.comanda_itens;
create policy loja_isolada on public.comanda_itens
  for all to anon
  using ((auth.jwt() ->> 'loja_id')::uuid = loja_id)
  with check ((auth.jwt() ->> 'loja_id')::uuid = loja_id);

drop policy if exists anon_all_pedidos on public.pedidos;
create policy loja_isolada on public.pedidos
  for all to anon
  using ((auth.jwt() ->> 'loja_id')::uuid = loja_id)
  with check ((auth.jwt() ->> 'loja_id')::uuid = loja_id);

drop policy if exists anon_all_garcons on public.garcons;
create policy loja_isolada on public.garcons
  for all to anon
  using ((auth.jwt() ->> 'loja_id')::uuid = loja_id)
  with check ((auth.jwt() ->> 'loja_id')::uuid = loja_id);
```

```sql
-- lojas: a propria linha e a loja, entao a coluna e `id`
drop policy if exists anon_all_lojas on public.lojas;
create policy loja_isolada on public.lojas
  for all to anon
  using (id = (auth.jwt() ->> 'loja_id')::uuid)
  with check (id = (auth.jwt() ->> 'loja_id')::uuid);
```

```sql
-- itens_pedido: so aplicar esta versao se o Step 2 mostrar que a tabela NAO
-- tem loja_id. Se tiver, usar o mesmo formato das tabelas diretas acima.
drop policy if exists anon_all_itens_pedido on public.itens_pedido;
create policy loja_isolada on public.itens_pedido
  for all to anon
  using (exists (
    select 1 from public.pedidos p
    where p.id = itens_pedido.pedido_id
      and p.loja_id = (auth.jwt() ->> 'loja_id')::uuid
  ))
  with check (exists (
    select 1 from public.pedidos p
    where p.id = itens_pedido.pedido_id
      and p.loja_id = (auth.jwt() ->> 'loja_id')::uuid
  ));
```

> Os nomes das políticas antigas (`anon_all_<tabela>`) vêm da auditoria. Usar os
> nomes reais que o Step 2 listou — se algum diferir, o `drop policy if exists`
> não remove nada e a política velha continua valendo em paralelo, deixando a
> tabela aberta sem nenhum erro visível.

- [ ] **Step 5: Verificar que a chave pública não lê mais nada**

**Pedir autorização ao usuário antes de rodar** — é uma requisição contra
produção, ainda que só de leitura.

```bash
curl -s "https://xckystaizmgubayuwtsx.supabase.co/rest/v1/pedidos?select=nome_cliente,telefone_cliente&limit=5" \
  -H "apikey: <CHAVE_ANON>" \
  -H "Authorization: Bearer <CHAVE_ANON>"
```

Esperado: `[]`.
Se voltar dado de cliente, a política daquela tabela não pegou. Parar e
investigar antes de continuar.

Repetir para `menu_items`, `mesas` e `comandas`.

- [ ] **Step 6: Verificar que os dois apps continuam funcionando**

O teste que importa. Com a RLS fechada:

- [ ] PDV abre, lista produtos, cria pedido, fecha mesa
- [ ] App do garçom loga, vê as mesas, lança item numa comanda
- [ ] O item lançado pelo garçom aparece no PDV em tempo real
- [ ] Fechar a conta no PDV lança a venda no caixa uma única vez

Se algo quebrar, reverter a política da tabela envolvida imediatamente:

```sql
drop policy if exists loja_isolada on public.<tabela>;
create policy anon_all_<tabela> on public.<tabela>
  for all to anon using (true) with check (true);
```

- [ ] **Step 7: Rodar a suíte de testes**

```bash
cd "C:\Users\ANDERSON\tapedido-food" && npm test
```

Esperado: tudo verde. Os testes são locais (SQLite) e não deveriam ser afetados
pela RLS — se algo falhar aqui, é sinal de que a Task 6 mexeu em algo que não
devia.

- [ ] **Step 8: Atualizar a auditoria e o estado**

Em `docs/auditoria-2026-07-30.md`, atualizar a tabela "Situação das correções":
o item "1.1 RLS — outras 10 tabelas" passa de ❌ **aberto** para ✅, com a data
e a observação de que a virada foi feita sem base instalada.

Atualizar `docs/ESTADO.md`: Tasks 5 e 6 concluídas, fundação fechada.

- [ ] **Step 9: Commitar**

```bash
git add docs/auditoria-2026-07-30.md docs/ESTADO.md
git commit -m "docs: RLS fechada nas 10 tabelas restantes

O isolamento entre lojas passa a ser garantido pelo servidor:
using ((auth.jwt() ->> 'loja_id')::uuid = loja_id). Quem usar a chave
anon crua nao tem a claim e e negado.

Feito hoje de proposito. A spec do app do garcom determina que a virada
so e segura depois que a base instalada atualizar — e nao ha base
instalada: os primeiros lojistas reais entram em 01/08. Amanha isto
seria um evento de migracao com risco de derrubar cliente pagante.

Verificado com curl usando a chave publica: nao le mais dado de loja
nenhuma. PDV e app do garcom seguem operando normalmente.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Definição de pronto

A fundação está fechada quando:

1. `git status` limpo e todo o trabalho de ontem preservado no histórico
2. `CLAUDE.md` e `docs/ESTADO.md` existem e refletem o estado real
3. As colunas e índices da Task 2 existem, e o índice único comprovadamente
   recusa baixa dupla sem bloquear movimentação manual
4. `npm test` verde, cobrindo pedido, caixa, dashboard e relatórios
5. App do garçom publicado usando o JWT, com fallback para a chave anon
6. RLS fechada nas 10 tabelas, comprovada por `curl` com a chave pública
7. PDV e app do garçom operando normalmente com a RLS fechada

A partir daí, todas as 8 features do anúncio são código puro: o schema já está
no lugar, os testes protegem os caminhos de dinheiro e o isolamento entre lojas
não depende mais de nenhuma release.
