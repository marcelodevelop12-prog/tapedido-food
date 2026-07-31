const path = require('path')
const { app, dialog } = require('electron')
const crypto = require('crypto')
const os = require('os')
const { criarImpressao } = require('./impressao')

let Database, supabase, supabaseSync, ws, sessaoSupabase

try {
  Database = require('better-sqlite3')
} catch (err) {
  // `dialog` e undefined fora do Electron (nos testes). Sem esta guarda, a
  // falha viraria "cannot read properties of undefined" e esconderia o erro
  // real — que aqui costuma ser incompatibilidade de ABI do better-sqlite3.
  if (dialog) {
    dialog.showErrorBox('Erro: better-sqlite3', `Falha ao carregar o banco de dados:\n\n${err.message}\n\nStack:\n${err.stack}`)
    process.exit(1)
  }
  throw err
}

try {
  const { createClient } = require('@supabase/supabase-js')
  ws = require('ws')
  supabaseSync = require('../supabaseSync')
  sessaoSupabase = require('../sessaoSupabase')

  supabase = createClient(sessaoSupabase.SUPABASE_URL, sessaoSupabase.SUPABASE_ANON_KEY, {
    // Ver electron/sessaoSupabase.js: devolve o JWT com a claim loja_id quando
    // existe, e a chave anon quando não — o fallback que permite publicar esta
    // versão antes de fechar o RLS.
    accessToken: async () => sessaoSupabase.tokenAtual(),
    global: { fetch: fetch },
    realtime: { transport: ws },
  })
} catch (err) {
  console.error('Aviso: Supabase/supabaseSync falhou ao carregar:', err.message)
  supabaseSync = { fecharComandaSupabase: async () => {}, criarLoja: async () => null, sincronizarTodasMesas: async () => [], listarGarcons: async () => [], adicionarGarcom: async () => {}, deletarGarcom: async () => {}, verificarConexao: async () => false }
  sessaoSupabase = { configurar: () => {}, tokenAtual: () => null, lojaDoToken: () => null, precisaRenovar: () => false, renovar: async () => ({ sucesso: false }), limpar: () => {} }
}

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
  if (dialog) {
    dialog.showErrorBox('Erro: SQLite', `Falha ao abrir o banco de dados:\n${dbPath}\n\n${err.message}\n\nStack:\n${err.stack}`)
    process.exit(1)
  }
  throw err
}

// ── Criação das tabelas ────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS licenca (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chave TEXT NOT NULL,
    machine_id TEXT NOT NULL,
    nome_cliente TEXT,
    email TEXT,
    ativada_em TEXT NOT NULL,
    modo_demo INTEGER DEFAULT 0,
    ultima_verificacao TEXT,
    revogada_em TEXT
  );

  CREATE TABLE IF NOT EXISTS lojas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    cnpj TEXT,
    telefone TEXT,
    endereco TEXT,
    cidade TEXT,
    estado TEXT,
    cep TEXT,
    pix_chave TEXT,
    pix_tipo TEXT,
    logo TEXT,
    cor_primaria TEXT DEFAULT '#f97316',
    cor_secundaria TEXT DEFAULT '#ea580c',
    mensagem_recibo TEXT
  );

  CREATE TABLE IF NOT EXISTS configuracoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loja_id INTEGER,
    tempo_entrega_min INTEGER DEFAULT 40,
    tempo_retirada_min INTEGER DEFAULT 20,
    pedido_minimo REAL DEFAULT 0,
    impressora_nome TEXT,
    impressora_largura TEXT DEFAULT '80mm',
    impressora_ip TEXT,
    impressora_porta INTEGER,
    balanca_porta TEXT,
    balanca_baud INTEGER DEFAULT 9600,
    aceitar_dinheiro INTEGER DEFAULT 1,
    aceitar_pix INTEGER DEFAULT 1,
    aceitar_debito INTEGER DEFAULT 1,
    aceitar_credito INTEGER DEFAULT 1,
    modulos_delivery INTEGER DEFAULT 1,
    modulos_mesas INTEGER DEFAULT 1,
    modulos_estoque INTEGER DEFAULT 1,
    modulos_financeiro INTEGER DEFAULT 1,
    supabase_loja_id TEXT,
    codigo_loja TEXT
  );

  CREATE TABLE IF NOT EXISTS categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loja_id INTEGER,
    nome TEXT NOT NULL,
    icone TEXT,
    ordem INTEGER DEFAULT 0,
    ativo INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loja_id INTEGER,
    nome TEXT NOT NULL,
    descricao TEXT,
    preco REAL NOT NULL,
    imagem TEXT,
    categoria TEXT,
    categoria_id INTEGER,
    disponivel INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    adicionais TEXT,
    estoque_atual REAL DEFAULT 0,
    estoque_minimo REAL DEFAULT 0,
    custo_unitario REAL DEFAULT 0,
    unidade TEXT DEFAULT 'un',
    codigo_barras TEXT,
    permite_meio_meio INTEGER DEFAULT 0,
    criado_em TEXT,
    supabase_id TEXT
  );

  CREATE TABLE IF NOT EXISTS sync_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operacao TEXT NOT NULL,
    status TEXT NOT NULL,
    erro TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS mesas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loja_id INTEGER,
    numero INTEGER NOT NULL,
    nome TEXT,
    status TEXT DEFAULT 'livre',
    capacidade INTEGER DEFAULT 4,
    posicao_x INTEGER DEFAULT 0,
    posicao_y INTEGER DEFAULT 0,
    supabase_id TEXT
  );

  CREATE TABLE IF NOT EXISTS comandas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loja_id INTEGER,
    mesa_id INTEGER NOT NULL,
    status TEXT DEFAULT 'aberta',
    total REAL DEFAULT 0,
    nome_cliente TEXT,
    aberto_em TEXT NOT NULL,
    fechado_em TEXT,
    observacoes TEXT
  );

  CREATE TABLE IF NOT EXISTS comanda_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comanda_id INTEGER NOT NULL,
    menu_item_id INTEGER,
    nome_item TEXT NOT NULL,
    quantidade REAL NOT NULL,
    preco_unitario REAL NOT NULL,
    subtotal REAL NOT NULL,
    sabor_2 TEXT,
    preco_sabor_2 REAL,
    adicionais_escolhidos TEXT,
    observacao TEXT,
    criado_em TEXT
  );

  CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loja_id INTEGER,
    numero_pedido INTEGER NOT NULL,
    telefone_cliente TEXT,
    nome_cliente TEXT,
    tipo_entrega TEXT NOT NULL,
    endereco_entrega TEXT,
    forma_pagamento TEXT,
    troco_para REAL,
    taxa_entrega REAL DEFAULT 0,
    subtotal REAL NOT NULL,
    total REAL NOT NULL,
    status TEXT DEFAULT 'recebido',
    origem TEXT DEFAULT 'pdv',
    mesa INTEGER,
    bairro_entrega TEXT,
    entregador_id INTEGER,
    observacoes TEXT,
    criado_em TEXT NOT NULL,
    atualizado_em TEXT
  );

  CREATE TABLE IF NOT EXISTS itens_pedido (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL,
    menu_item_id INTEGER,
    nome_item TEXT NOT NULL,
    quantidade REAL NOT NULL,
    preco_unitario REAL NOT NULL,
    subtotal REAL NOT NULL,
    sabor_2 TEXT,
    preco_sabor_2 REAL,
    adicionais_escolhidos TEXT,
    observacao TEXT
  );

  CREATE TABLE IF NOT EXISTS estoque_movimentacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loja_id INTEGER,
    menu_item_id INTEGER NOT NULL,
    fornecedor_id INTEGER,
    tipo TEXT NOT NULL,
    quantidade REAL NOT NULL,
    custo_unitario REAL,
    motivo TEXT,
    pedido_id INTEGER,
    criado_em TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS caixa_sessoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loja_id INTEGER,
    aberto_em TEXT NOT NULL,
    fechado_em TEXT,
    valor_inicial REAL DEFAULT 0,
    valor_final REAL,
    total_dinheiro REAL DEFAULT 0,
    total_debito REAL DEFAULT 0,
    total_credito REAL DEFAULT 0,
    total_pix REAL DEFAULT 0,
    total_sangria REAL DEFAULT 0,
    total_suprimento REAL DEFAULT 0,
    status TEXT DEFAULT 'aberto',
    observacoes TEXT
  );

  CREATE TABLE IF NOT EXISTS caixa_movimentacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loja_id INTEGER,
    sessao_id INTEGER NOT NULL,
    pedido_id INTEGER,
    tipo TEXT NOT NULL,
    forma_pagamento TEXT,
    valor REAL NOT NULL,
    troco REAL DEFAULT 0,
    descricao TEXT,
    criado_em TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS contas_pagar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loja_id INTEGER,
    fornecedor_id INTEGER,
    descricao TEXT NOT NULL,
    valor REAL NOT NULL,
    vencimento TEXT NOT NULL,
    pago_em TEXT,
    status TEXT DEFAULT 'pendente',
    categoria TEXT,
    criado_em TEXT
  );

  CREATE TABLE IF NOT EXISTS contas_receber (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loja_id INTEGER,
    descricao TEXT NOT NULL,
    valor REAL NOT NULL,
    vencimento TEXT NOT NULL,
    recebido_em TEXT,
    status TEXT DEFAULT 'pendente',
    criado_em TEXT
  );

  CREATE TABLE IF NOT EXISTS fornecedores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loja_id INTEGER,
    nome TEXT NOT NULL,
    contato TEXT,
    telefone TEXT,
    email TEXT,
    cnpj TEXT,
    produtos_fornecidos TEXT,
    observacoes TEXT,
    ativo INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS entregadores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loja_id INTEGER,
    nome TEXT NOT NULL,
    telefone TEXT,
    veiculo TEXT,
    ativo INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS zonas_entrega (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loja_id INTEGER,
    bairro TEXT NOT NULL,
    municipio TEXT,
    taxa_entrega REAL DEFAULT 0,
    ativo INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loja_id INTEGER,
    nome TEXT NOT NULL,
    telefone TEXT,
    endereco TEXT,
    bairro TEXT,
    cidade TEXT,
    complemento TEXT,
    observacoes TEXT,
    total_pedidos INTEGER DEFAULT 0,
    total_gasto REAL DEFAULT 0,
    criado_em TEXT
  );
`)

// ── Migrate existing databases ──────────────────────────────────────────────
for (const col of ['ultima_verificacao TEXT', 'revogada_em TEXT']) {
  try { db.exec(`ALTER TABLE licenca ADD COLUMN ${col}`) } catch {}
}
try { db.exec(`ALTER TABLE configuracoes ADD COLUMN tema TEXT DEFAULT 'light'`) } catch {}
for (const col of ['supabase_loja_id TEXT', 'codigo_loja TEXT']) {
  try { db.exec(`ALTER TABLE configuracoes ADD COLUMN ${col}`) } catch {}
}
try { db.exec(`ALTER TABLE menu_items ADD COLUMN supabase_id TEXT`) } catch {}
try { db.exec(`ALTER TABLE mesas ADD COLUMN supabase_id TEXT`) } catch {}
try { db.exec(`ALTER TABLE configuracoes ADD COLUMN impressao_automatica INTEGER DEFAULT 0`) } catch {}
// ref_externa identifica a origem da venda (ex.: 'comanda:<uuid>', 'pedido:<id>')
// para que a mesma venda nunca seja lancada duas vezes no caixa.
try { db.exec(`ALTER TABLE caixa_movimentacoes ADD COLUMN ref_externa TEXT`) } catch {}
try {
  db.exec(`CREATE TABLE IF NOT EXISTS sync_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operacao TEXT NOT NULL,
    status TEXT NOT NULL,
    erro TEXT,
    created_at TEXT NOT NULL
  )`)
} catch {}

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
// pelo indice. Movimentacao manual (sem referencia) fica de fora do indice
// parcial e segue livre para repetir.
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

// A tabela `categorias` existia desde sempre mas nunca era preenchida — o
// cardapio usava uma lista fixa no codigo. Semear com essa mesma lista faz a
// tela passar a ler do banco sem o lojista perceber diferenca no primeiro dia.
try {
  const vazia = (db.prepare('SELECT COUNT(*) as n FROM categorias').get()?.n ?? 0) === 0
  if (vazia) {
    const inserir = db.prepare('INSERT INTO categorias (nome, icone, ordem, ativo) VALUES (?, ?, ?, 1)')
    const padrao = [
      ['Lanches', '🍔'], ['Pratos', '🍽️'], ['Pizzas', '🍕'],
      ['Bebidas', '🥤'], ['Sobremesas', '🍰'], ['Outros', '📦'],
    ]
    db.transaction(() => padrao.forEach(([nome, icone], i) => inserir.run(nome, icone, i + 1)))()
  }
} catch {}

// ── Helpers ────────────────────────────────────────────────────────────────
const agora = () => new Date().toISOString()

// O PDV grava 'debito'/'pix'; o app do garcom grava 'Débito'/'PIX'. Sem
// normalizar, o colMap do caixa nao encontra a coluna e o total da sessao
// deixa de somar a venda silenciosamente.
// Apelidos aceitos para as 4 formas que o caixa sabe totalizar. O app do garcom
// grava forma_pagamento livre e chega aqui pelo realtime; sem o mapa, variantes
// como "cartao de credito" caiam no caminho "desconhecida" e o valor ficava fora
// do total da sessao.
const APELIDOS_PAGAMENTO = {
  dinheiro: 'dinheiro', especie: 'dinheiro', money: 'dinheiro', cash: 'dinheiro',
  pix: 'pix',
  debito: 'debito', 'cartao de debito': 'debito', 'cartao debito': 'debito',
  credito: 'credito', 'cartao de credito': 'credito', 'cartao credito': 'credito',
  cartao: 'credito',
}

function normalizarFormaPagamento(valor) {
  const base = String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  return APELIDOS_PAGAMENTO[base] || base
}

function getMachineId() {
  const data = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.cpus()[0]?.model || '',
  ].join('|')
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 32)
}

// Gera as grafias equivalentes de uma mesma chave de licença. O cliente pode
// colar a chave em minúsculas, sem hífens, com espaços ou com os hífens em
// posições erradas. A busca no Supabase é por igualdade exata, então tentamos
// todas as grafias de uma vez.
//
// Formatos em circulação:
//   TAPF-XXXX-XXXX-XXXX  produção atual, 16 alfanuméricos, gerado pela Edge
//                        Function gerar-licenca (crypto.getRandomValues).
//                        Também é o formato do lote de seed/teste de
//                        2026-05-13 (esses não são licenças vendáveis).
//   TPF-XXXX-XXXX-XXXX   legado, 15 alfanuméricos — a Edge Function gerava
//                        assim (faltava o "A" do prefixo) entre 2026-06-26
//                        e 2026-07-30, corrigida na versão 4. Mantido aqui
//                        só para as chaves já emitidas nesse período ainda
//                        ativarem.
//
// Obs.: formatarChave() em src/pages/Ativacao/Ativacao.jsx replica a forma
// canônica só para exibição — esta função é a autoridade da validação.
function variantesDeChave(valor) {
  const limpo = String(valor || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  if (!limpo) return []

  const variantes = new Set()
  variantes.add(limpo) // sem separadores

  // Legado: TPF + 3 blocos de 4 (TPF-XXXX-XXXX-XXXX) — ver nota acima
  if (limpo.startsWith('TPF')) {
    const blocos = limpo.slice(3).match(/.{1,4}/g) || []
    if (blocos.length) variantes.add(['TPF', ...blocos].join('-'))
  }

  // Legado: blocos uniformes de 4 (XXXX-XXXX-XXXX-XXXX)
  const uniformes = limpo.match(/.{1,4}/g) || []
  if (uniformes.length) variantes.add(uniformes.join('-'))

  return [...variantes]
}

// Chama uma Edge Function de licenca. Devolve o corpo da resposta, ou null
// quando nao foi possivel falar com ela (rede caida, funcao fora do ar, 5xx).
// null significa "nao sei" — o chamador cai no caminho antigo, consultando a
// tabela direto. Esse fallback e o que permite publicar esta versao antes de
// fechar o SELECT de `licencas` para anon, sem derrubar quem ja esta instalado.
async function chamarEdgeLicenca(nome, corpo) {
  try {
    const { data, error } = await supabase.functions.invoke(nome, { body: corpo })
    if (error) {
      console.log(`[licenca] edge ${nome} indisponivel:`, error.message)
      return null
    }
    return data || null
  } catch (err) {
    console.log(`[licenca] edge ${nome} excecao:`, err?.message || err)
    return null
  }
}

// Grava a licenca no SQLite local. `chaveCanonica` precisa ser exatamente a
// grafia que esta no Supabase — verificarPeriodicamente() consulta por ela.
function gravarLicencaLocal({ chaveCanonica, machineId, nomeCliente, email, verificadaEm }) {
  db.prepare('DELETE FROM licenca').run()
  db.prepare(`
    INSERT INTO licenca (chave, machine_id, nome_cliente, email, ativada_em, modo_demo, ultima_verificacao)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(chaveCanonica, machineId, nomeCliente || '', email || '', agora(), verificadaEm || agora())
}

// Cria a loja no Supabase depois da ativacao — em background, para nao segurar
// a tela de ativacao esperando rede.
function criarLojaEmBackground(nomeCliente) {
  setImmediate(async () => {
    try {
      const jaTemLoja = db.prepare('SELECT supabase_loja_id FROM configuracoes LIMIT 1').get()
      if (jaTemLoja?.supabase_loja_id) return // ja foi criada

      const lojaLocal = db.prepare('SELECT nome FROM lojas LIMIT 1').get()
      const nomeLoja = lojaLocal?.nome || nomeCliente || 'Minha Loja'
      const resultado = await supabaseSync.criarLoja(db, nomeLoja)
      if (!resultado) return

      const cfg = db.prepare('SELECT id FROM configuracoes LIMIT 1').get()
      if (cfg) {
        db.prepare('UPDATE configuracoes SET supabase_loja_id = ?, codigo_loja = ? WHERE id = ?')
          .run(resultado.lojaId, resultado.codigoLoja, cfg.id)
      } else {
        db.prepare('INSERT INTO configuracoes (supabase_loja_id, codigo_loja) VALUES (?, ?)')
          .run(resultado.lojaId, resultado.codigoLoja)
      }

      // A loja acabou de existir: é o primeiro momento em que dá para pedir o
      // token, e é aqui que a licença fica vinculada a ela no servidor.
      await dbModule.licenca.renovarSessaoSupabase()
    } catch {}
  })
}

function proximoNumeroPedido() {
  const row = db.prepare('SELECT MAX(numero_pedido) as max FROM pedidos').get()
  return (row?.max || 0) + 1
}

// ── Estoque na venda ───────────────────────────────────────────────────────
const UUID_MENU = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Devolve o id local do produto.
 *
 * O item que vem do app do garcom traz o UUID do Supabase, nao o inteiro local
 * — `menu_items.supabase_id` e a ponte. Sem esta traducao a venda de salao
 * feita pelo garcom nunca baixaria estoque, e o motivo seria invisivel: o
 * pedido entra normal, so o estoque nao mexe.
 */
function resolverMenuItemId(valor) {
  if (valor === null || valor === undefined || valor === '') return null
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null

  const texto = String(valor).trim()
  if (/^\d+$/.test(texto)) return Number(texto)
  if (!UUID_MENU.test(texto)) return null

  const local = db.prepare('SELECT id FROM menu_items WHERE supabase_id = ?').get(texto)
  return local?.id ?? null
}

function custoAtualDoProduto(menuItemId) {
  if (!menuItemId) return 0
  const p = db.prepare('SELECT custo_unitario FROM menu_items WHERE id = ?').get(menuItemId)
  return p?.custo_unitario ?? 0
}

/**
 * Desconta do estoque os itens de um pedido. Idempotente por pedido: a segunda
 * chamada nao mexe em nada.
 *
 * A garantia vem do indice unico parcial `idx_estoque_ref` sobre
 * (referencia_tipo, referencia_id, menu_item_id) — e do banco, nao daqui.
 * Heuristica em codigo nao sobrevive a dois processos gravando ao mesmo tempo,
 * que e exatamente o caso quando o eco do realtime chega junto com o PDV.
 *
 * Precisa rodar dentro da transacao de quem chama.
 */
function baixarEstoqueDoPedido(pedidoId, itens) {
  // Uma linha por produto. Duas linhas do mesmo produto no pedido (observacoes
  // diferentes) sao a mesma baixa; sem somar antes, o indice unico recusaria a
  // segunda em silencio e o estoque ficaria alto.
  const porProduto = new Map()
  for (const item of itens) {
    if (!item.menuItemId) continue
    const qtd = Number(item.quantidade) || 0
    if (qtd <= 0) continue
    porProduto.set(item.menuItemId, (porProduto.get(item.menuItemId) || 0) + qtd)
  }
  if (porProduto.size === 0) return

  const lerSaldo = db.prepare('SELECT estoque_atual FROM menu_items WHERE id = ?')
  const gravarSaldo = db.prepare('UPDATE menu_items SET estoque_atual = ? WHERE id = ?')
  const registrar = db.prepare(`
    INSERT OR IGNORE INTO estoque_movimentacoes
      (menu_item_id, tipo, quantidade, custo_unitario, motivo, pedido_id,
       saldo_anterior, saldo_posterior, referencia_tipo, referencia_id, criado_em)
    VALUES (?, 'saida', ?, ?, ?, ?, ?, ?, 'pedido', ?, ?)
  `)

  for (const [menuItemId, quantidade] of porProduto) {
    const saldoAnterior = lerSaldo.get(menuItemId)?.estoque_atual ?? 0
    // Mesmo criterio de `estoque.movimentar`: nao deixa o saldo negativo. Quem
    // vende sem ter cadastrado entrada veria "-12 un" e acharia que e bug.
    const saldoPosterior = Math.max(0, saldoAnterior - quantidade)

    const r = registrar.run(
      menuItemId, quantidade, custoAtualDoProduto(menuItemId),
      `Venda do pedido #${pedidoId}`, pedidoId,
      saldoAnterior, saldoPosterior, String(pedidoId), agora()
    )

    // changes === 0 significa que o indice unico recusou: este pedido ja baixou
    // este produto. Mexer no saldo aqui seria descontar duas vezes.
    if (r.changes > 0) gravarSaldo.run(saldoPosterior, menuItemId)
  }
}

// ── Módulos ────────────────────────────────────────────────────────────────
const dbModule = {
  // ── Licença ──────────────────────────────────────────────────────────────
  licenca: {
    verificar() {
      const row = db.prepare("SELECT * FROM licenca WHERE modo_demo = 0 LIMIT 1").get()
      if (!row) return { ativa: false, demo: false }

      // Bloqueio imediato — sem grace period
      if (row.revogada_em) return { ativa: false, demo: false, cancelada: true }

      return { ativa: true, demo: false }
    },

    async verificarPeriodicamente() {
      const row = db.prepare("SELECT * FROM licenca WHERE modo_demo = 0 LIMIT 1").get()
      if (!row) return

      const machineId = getMachineId()

      // ── Caminho novo: Edge Function ─────────────────────────────────────
      const viaEdge = await chamarEdgeLicenca('licenca-verificar', {
        chave: row.chave,
        machine_id: machineId,
      })

      if (viaEdge) {
        // Hora do SERVIDOR. A tolerancia de dias offline vai se apoiar nisto —
        // usar o relogio local permitiria atrasar a data para nunca vencer.
        db.prepare('UPDATE licenca SET ultima_verificacao = ? WHERE id = ?')
          .run(viaEdge.servidorEm || agora(), row.id)

        // `encontrada: false` e uma resposta afirmativa do servidor: esta chave
        // nao existe. E o caso da licenca forjada direto no SQLite local, que
        // antes passava batido porque "nao encontrada" era tratado como "sem
        // internet". Diferente de falha de rede, que devolve null e cai abaixo.
        const invalida = viaEdge.encontrada === false || viaEdge.status === 'revogada'

        if (invalida) {
          if (!row.revogada_em) {
            db.prepare('UPDATE licenca SET revogada_em = ? WHERE id = ?').run(agora(), row.id)
            console.log('[licenca] invalidada pelo servidor. encontrada:', viaEdge.encontrada, 'status:', viaEdge.status)
          }
        } else if (row.revogada_em) {
          db.prepare('UPDATE licenca SET revogada_em = NULL WHERE id = ?').run(row.id)
        }

        // Licenca ativada em outra maquina. NAO bloqueia por enquanto: o
        // machine_id deriva de hostname/CPU (getMachineId), entao troca de peca
        // ou renomear o computador mudaria o valor e derrubaria cliente legitimo.
        // Fica registrado para decidir a politica depois.
        if (viaEdge.maquinaConfere === false) {
          console.warn('[licenca] machine_id diverge do registrado na ativacao')
        }
        return
      }

      // ── Fallback: consulta direta a tabela ──────────────────────────────
      try {
        const { data, error } = await supabase
          .from('licencas')
          .select('status')
          .eq('chave', row.chave)
          .maybeSingle()

        // Sem internet / Supabase inacessível — não bloqueia
        if (error || !data) return

        db.prepare('UPDATE licenca SET ultima_verificacao = ? WHERE id = ?').run(agora(), row.id)

        if (data.status === 'revogada') {
          if (!row.revogada_em) {
            db.prepare('UPDATE licenca SET revogada_em = ? WHERE id = ?').run(agora(), row.id)
          }
        } else {
          // Licença reativada — limpa marcador de revogação
          if (row.revogada_em) {
            db.prepare('UPDATE licenca SET revogada_em = NULL WHERE id = ?').run(row.id)
          }
        }
      } catch {
        // Erro de rede — ignora, nunca bloqueia sem confirmação
      }
    },

    // Troca a licença por um JWT com a claim `loja_id` (ver
    // electron/sessaoSupabase.js). Só age quando falta pouco para vencer, então
    // pode ser chamada à vontade — no arranque e junto da verificação periódica.
    //
    // Nunca bloqueia nem lança: falhar aqui só significa continuar na chave
    // anon, que é exatamente o comportamento de hoje.
    async renovarSessaoSupabase() {
      try {
        if (!sessaoSupabase.precisaRenovar()) return { sucesso: true, jaValida: true }

        const lic = db.prepare("SELECT chave FROM licenca WHERE modo_demo = 0 LIMIT 1").get()
        if (!lic?.chave) return { sucesso: false, motivo: 'sem licenca ativada' }

        const cfg = db.prepare('SELECT id, supabase_loja_id FROM configuracoes LIMIT 1').get()

        const r = await sessaoSupabase.renovar({
          chave: lic.chave,
          machineId: getMachineId(),
          lojaId: cfg?.supabase_loja_id || null,
        })

        // O servidor é a autoridade sobre qual loja é desta licença: numa
        // reinstalação o PDV cria uma loja nova e chega aqui com o id errado,
        // e é assim que ele volta a apontar para a loja original do cliente.
        if (r.sucesso && r.lojaId && cfg && cfg.supabase_loja_id !== r.lojaId) {
          console.warn(`[sessao] adotando loja do servidor: ${cfg.supabase_loja_id} -> ${r.lojaId}`)
          db.prepare('UPDATE configuracoes SET supabase_loja_id = ? WHERE id = ?').run(r.lojaId, cfg.id)
        }

        return r
      } catch (err) {
        console.log('[sessao] renovação falhou:', err?.message || err)
        return { sucesso: false, indisponivel: true }
      }
    },

    async ativar(chave) {
      if (!chave || chave.trim() === '') {
        return { sucesso: false, erro: 'Chave inválida' }
      }

      const machineId = getMachineId()
      const variantes = variantesDeChave(chave)

      if (variantes.length === 0) {
        return { sucesso: false, erro: 'Chave inválida' }
      }

      // ── Caminho novo: Edge Function com service role ────────────────────
      // Roda no servidor, entao nao depende de o cliente enxergar a tabela.
      // E o que vai permitir fechar o SELECT de `licencas` para anon.
      const viaEdge = await chamarEdgeLicenca('licenca-ativar', {
        chave,
        machine_id: machineId,
      })

      if (viaEdge) {
        if (!viaEdge.sucesso) {
          return { sucesso: false, erro: viaEdge.erro || 'Não foi possível ativar a licença' }
        }
        gravarLicencaLocal({
          chaveCanonica: viaEdge.chave,
          machineId,
          nomeCliente: viaEdge.nomeCliente,
          // A Edge Function nao devolve e-mail de proposito (nao expor PII).
          email: '',
          verificadaEm: viaEdge.servidorEm,
        })
        criarLojaEmBackground(viaEdge.nomeCliente)
        console.log('[licenca:ativar] ativada via Edge Function')
        return { sucesso: true, nomeCliente: viaEdge.nomeCliente }
      }

      // ── Fallback: consulta direta a tabela (versoes antigas do servidor) ──
      try {
        console.log('[licenca:ativar] edge indisponivel, usando consulta direta. variantes:', variantes)

        // Colunas explícitas, não `*`: o endurecimento de `licencas` tirou
        // `email_cliente`/`telefone` do GRANT de anon, e `loja_id` nunca esteve
        // nele. Com `*` o Postgres nega a consulta inteira (42501) e este
        // fallback — que existe justamente para quando a Edge Function cai —
        // deixaria de ativar qualquer licença.
        const { data, error, status, statusText } = await supabase
          .from('licencas')
          .select('id, chave, status, machine_id, nome_cliente, ativada_em, produto')
          .or(variantes.map((v) => `chave.eq.${v}`).join(','))
          .limit(1)

        console.log('[licenca:ativar] resposta Supabase — status:', status, statusText)
        console.log('[licenca:ativar] data:', JSON.stringify(data))
        console.log('[licenca:ativar] error:', JSON.stringify(error))

        if (error) {
          return { sucesso: false, erro: `Erro Supabase: ${error.message} (${error.code})` }
        }

        const registro = data?.[0]

        if (!registro) {
          return { sucesso: false, erro: 'Chave de licença não encontrada' }
        }

        if (registro.status === 'revogada') {
          return { sucesso: false, erro: 'Esta licença foi revogada' }
        }

        if (registro.status === 'usada' && registro.machine_id !== machineId) {
          return { sucesso: false, erro: 'Esta licença já está ativada em outro computador' }
        }

        await supabase
          .from('licencas')
          .update({ status: 'usada', machine_id: machineId, ativada_em: agora() })
          .eq('id', registro.id)

        // Salva a chave exatamente como está no Supabase — verificarPeriodicamente()
        // consulta por igualdade exata usando este valor.
        gravarLicencaLocal({
          chaveCanonica: registro.chave,
          machineId,
          // `email_cliente` não é mais legível por anon (PII fora do GRANT).
          email: '',
          nomeCliente: registro.nome_cliente,
        })
        criarLojaEmBackground(registro.nome_cliente)

        return { sucesso: true, nomeCliente: registro.nome_cliente }
      } catch (err) {
        console.log('[licenca:ativar] exceção:', err)
        return { sucesso: false, erro: 'Erro de conexão. Verifique sua internet.' }
      }
    },

    ativarDemo() {
      // Demo e por sessao: os dados sao semeados e apagados no fechamento
      // (ver main.js before-quit). A linha modo_demo=1 abaixo e o marcador
      // persistente: se o app fechar por crash, o before-quit nao roda e era ela
      // que faltava para saber, no proximo arranque, que o banco tem dado ficticio
      // — sem ela a ativacao real seguinte herdava os produtos de demonstracao.
      // verificar() filtra por modo_demo = 0, entao esta linha nunca libera o app.
      const { seed } = require('./seed')
      seed(db)
      db.prepare('DELETE FROM licenca').run()
      db.prepare(`
        INSERT INTO licenca (chave, machine_id, ativada_em, modo_demo)
        VALUES ('DEMO', ?, ?, 1)
      `).run(getMachineId(), agora())
      return { sucesso: true }
    },

    // Roda no arranque. Só age quando existe o marcador de demo — nunca apaga
    // dados a partir de palpite, porque limparDadosDemo() zera `configuracoes`,
    // onde fica o vinculo da loja com o Supabase.
    limparDemoResidual() {
      const demo = db.prepare('SELECT id FROM licenca WHERE modo_demo = 1 LIMIT 1').get()
      if (!demo) return { limpo: false }
      dbModule.licenca.limparDadosDemo()
      db.prepare('DELETE FROM licenca WHERE modo_demo = 1').run()
      console.log('[licenca] dados de demonstracao residuais removidos')
      return { limpo: true }
    },

    limparDadosDemo() {
      const tables = [
        'menu_items', 'mesas', 'comandas', 'comanda_itens', 'pedidos', 'itens_pedido',
        'estoque_movimentacoes', 'caixa_sessoes', 'caixa_movimentacoes', 'contas_pagar',
        'contas_receber', 'fornecedores', 'entregadores', 'zonas_entrega', 'lojas', 'configuracoes', 'categorias',
      ]
      for (const t of tables) db.prepare(`DELETE FROM ${t}`).run()
    },

    resetar() {
      db.prepare('DELETE FROM licenca').run()
      return { sucesso: true }
    },

    info() {
      return db.prepare('SELECT * FROM licenca LIMIT 1').get()
    },
  },

  // ── Loja ─────────────────────────────────────────────────────────────────
  loja: {
    get() {
      return db.prepare('SELECT * FROM lojas LIMIT 1').get()
    },
    update(dados) {
      const loja = db.prepare('SELECT id FROM lojas LIMIT 1').get()
      if (loja) {
        const campos = Object.keys(dados).map(k => `${k} = ?`).join(', ')
        db.prepare(`UPDATE lojas SET ${campos} WHERE id = ?`).run(...Object.values(dados), loja.id)
      } else {
        const cols = Object.keys(dados).join(', ')
        const vals = Object.keys(dados).map(() => '?').join(', ')
        db.prepare(`INSERT INTO lojas (${cols}) VALUES (${vals})`).run(...Object.values(dados))
      }
      return db.prepare('SELECT * FROM lojas LIMIT 1').get()
    },
  },

  // ── Produtos ──────────────────────────────────────────────────────────────
  produtos: {
    listar() {
      return db.prepare('SELECT * FROM menu_items ORDER BY sort_order, nome').all()
    },
    /**
     * Busca por codigo de barras. Usa o indice parcial idx_menu_codigo_barras.
     *
     * Nao filtra por `disponivel`: se o produto estiver desativado, quem chama
     * precisa saber que ele existe para avisar "produto desativado" em vez de
     * "codigo nao cadastrado" — sao problemas diferentes para o lojista.
     */
    buscarPorCodigoBarras(codigo) {
      const limpo = String(codigo || '').trim()
      if (!limpo) return null
      return db.prepare('SELECT * FROM menu_items WHERE codigo_barras = ?').get(limpo) || null
    },
    criar(dados) {
      const { nome, descricao, preco, imagem, categoria, categoriaId, disponivel,
        adicionais, estoqueAtual, estoqueMinimo, custoUnitario, unidade, codigoBarras,
        permiteMeioMeio, ordemExibicao } = dados
      const result = db.prepare(`
        INSERT INTO menu_items (nome, descricao, preco, imagem, categoria, categoria_id, disponivel,
          adicionais, estoque_atual, estoque_minimo, custo_unitario, unidade, codigo_barras,
          permite_meio_meio, sort_order, criado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(nome, descricao || '', preco, imagem || '', categoria || '', categoriaId || null,
        disponivel !== false ? 1 : 0, JSON.stringify(adicionais || []),
        estoqueAtual || 0, estoqueMinimo || 0, custoUnitario || 0,
        unidade || 'un', codigoBarras || '', permiteMeioMeio ? 1 : 0,
        ordemExibicao || 0, agora())
      const produto = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(result.lastInsertRowid)

      setImmediate(async () => {
        try {
          const cfg = db.prepare('SELECT supabase_loja_id FROM configuracoes LIMIT 1').get()
          if (cfg?.supabase_loja_id) {
            const prodAtual = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(produto.id)
            await supabaseSync.sincronizarProdutoCriado(db, prodAtual, cfg.supabase_loja_id)
          }
        } catch {}
      })

      return produto
    },
    atualizar(dados) {
      const { id, ...rest } = dados
      const prodAntes = db.prepare('SELECT imagem, supabase_id FROM menu_items WHERE id = ?').get(id)
      const map = {
        categoriaId: 'categoria_id', estoqueAtual: 'estoque_atual',
        estoqueMinimo: 'estoque_minimo', custoUnitario: 'custo_unitario',
        codigoBarras: 'codigo_barras', permiteMeioMeio: 'permite_meio_meio',
        ordemExibicao: 'sort_order',
      }
      const setCols = Object.keys(rest).map(k => `${map[k] || k} = ?`).join(', ')
      const vals = Object.entries(rest).map(([k, v]) => {
        if (k === 'adicionais') return JSON.stringify(v)
        if (k === 'disponivel' || k === 'permiteMeioMeio') return v ? 1 : 0
        return v
      })
      db.prepare(`UPDATE menu_items SET ${setCols} WHERE id = ?`).run(...vals, id)
      const produto = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id)

      setImmediate(async () => {
        try {
          const cfg = db.prepare('SELECT supabase_loja_id FROM configuracoes LIMIT 1').get()
          if (cfg?.supabase_loja_id && prodAntes?.supabase_id) {
            const prodAtual = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id)
            await supabaseSync.sincronizarProdutoAtualizado(db, prodAtual, cfg.supabase_loja_id, prodAntes.imagem)
          }
        } catch {}
      })

      return produto
    },
    deletar(id) {
      const prodSnapshot = db.prepare('SELECT id, imagem, supabase_id FROM menu_items WHERE id = ?').get(id)
      db.prepare('DELETE FROM menu_items WHERE id = ?').run(id)

      setImmediate(async () => {
        try {
          const cfg = db.prepare('SELECT supabase_loja_id FROM configuracoes LIMIT 1').get()
          if (cfg?.supabase_loja_id && prodSnapshot?.supabase_id) {
            await supabaseSync.sincronizarProdutoDeletado(db, prodSnapshot, cfg.supabase_loja_id)
          }
        } catch {}
      })

      return { sucesso: true }
    },
    toggleDisponivel(id) {
      db.prepare('UPDATE menu_items SET disponivel = NOT disponivel WHERE id = ?').run(id)
      const produto = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id)

      setImmediate(async () => {
        try {
          const cfg = db.prepare('SELECT supabase_loja_id FROM configuracoes LIMIT 1').get()
          if (cfg?.supabase_loja_id && produto?.supabase_id) {
            await supabaseSync.toggleDisponivelSupabase(db, produto.supabase_id, produto.disponivel !== 0)
          }
        } catch {}
      })

      return produto
    },
  },

  // ── Categorias ────────────────────────────────────────────────────────────
  categorias: {
    listar(incluirInativas = false) {
      const filtro = incluirInativas ? '' : 'WHERE ativo = 1'
      return db.prepare(`SELECT * FROM categorias ${filtro} ORDER BY ativo DESC, ordem, nome`).all()
    },
    criar(dados) {
      const nome = String(dados.nome || '').trim()
      if (!nome) throw new Error('categorias.criar: nome e obrigatorio')

      // Ordem no fim da lista quando nao informada, senao toda categoria nova
      // nasceria com 0 e brigaria com as existentes pelo primeiro lugar.
      const ordem = dados.ordem ?? ((db.prepare('SELECT MAX(ordem) as m FROM categorias').get()?.m ?? 0) + 1)

      const result = db.prepare(`
        INSERT INTO categorias (nome, icone, ordem, ativo) VALUES (?, ?, ?, 1)
      `).run(nome, dados.icone || '', ordem)
      return db.prepare('SELECT * FROM categorias WHERE id = ?').get(result.lastInsertRowid)
    },
    /**
     * Renomear tambem reescreve os produtos daquela categoria.
     *
     * `menu_items.categoria` guarda o NOME, nao o id. Sem reescrever, renomear
     * "Lanches" para "Sanduiches" deixaria todo produto apontando para uma
     * categoria que nao existe mais — eles sumiriam dos filtros do cardapio.
     */
    atualizar(dados) {
      const atual = db.prepare('SELECT * FROM categorias WHERE id = ?').get(dados.id)
      if (!atual) return null

      const nome = dados.nome !== undefined ? String(dados.nome).trim() : atual.nome
      if (!nome) throw new Error('categorias.atualizar: nome nao pode ficar vazio')

      const aplicar = db.transaction(() => {
        db.prepare('UPDATE categorias SET nome = ?, icone = ?, ordem = ?, ativo = ? WHERE id = ?').run(
          nome,
          dados.icone !== undefined ? dados.icone : atual.icone,
          dados.ordem !== undefined ? dados.ordem : atual.ordem,
          dados.ativo !== undefined ? (dados.ativo ? 1 : 0) : atual.ativo,
          dados.id
        )
        if (nome !== atual.nome) {
          db.prepare('UPDATE menu_items SET categoria = ? WHERE categoria = ?').run(nome, atual.nome)
        }
      })
      aplicar()

      return db.prepare('SELECT * FROM categorias WHERE id = ?').get(dados.id)
    },
    // Desativa em vez de apagar: os produtos guardam o nome da categoria, e
    // sumir com a linha nao apagaria a referencia — so tiraria o nome da lista
    // sem tirar do produto.
    deletar(id) {
      const cat = db.prepare('SELECT * FROM categorias WHERE id = ?').get(id)
      if (!cat) return { sucesso: false, erro: 'Categoria nao encontrada' }

      const emUso = db.prepare('SELECT COUNT(*) as n FROM menu_items WHERE categoria = ?').get(cat.nome)?.n ?? 0
      if (emUso > 0) {
        return {
          sucesso: false,
          erro: `${emUso} produto(s) ainda usam "${cat.nome}". Mude a categoria deles primeiro.`,
        }
      }

      db.prepare('UPDATE categorias SET ativo = 0 WHERE id = ?').run(id)
      return { sucesso: true }
    },
  },

  // ── Mesas ──────────────────────────────────────────────────────────────────
  mesas: {
    listar() {
      return db.prepare('SELECT * FROM mesas ORDER BY numero').all()
    },
    criar(dados) {
      const result = db.prepare(`
        INSERT INTO mesas (numero, nome, status, capacidade) VALUES (?, ?, 'livre', ?)
      `).run(dados.numero, dados.nome || `Mesa ${dados.numero}`, dados.capacidade || 4)
      const mesa = db.prepare('SELECT * FROM mesas WHERE id = ?').get(result.lastInsertRowid)
      const supabaseId = crypto.randomUUID()
      db.prepare('UPDATE mesas SET supabase_id = ? WHERE id = ?').run(supabaseId, mesa.id)
      mesa.supabase_id = supabaseId
      return mesa
    },
    atualizar(dados) {
      const { id, ...rest } = dados
      const cols = Object.keys(rest).map(k => `${k} = ?`).join(', ')
      db.prepare(`UPDATE mesas SET ${cols} WHERE id = ?`).run(...Object.values(rest), id)
      return db.prepare('SELECT * FROM mesas WHERE id = ?').get(id)
    },
    deletar(id) {
      const mesa = db.prepare('SELECT * FROM mesas WHERE id = ?').get(id)
      db.prepare('DELETE FROM mesas WHERE id = ?').run(id)
      return { sucesso: true, supabase_id: mesa?.supabase_id || null, numero: mesa?.numero || null }
    },
  },

  // ── Comandas ───────────────────────────────────────────────────────────────
  comandas: {
    abrir(mesaId) {
      const existente = db.prepare(`
        SELECT * FROM comandas WHERE mesa_id = ? AND status = 'aberta'
      `).get(mesaId)
      if (existente) return existente

      const result = db.prepare(`
        INSERT INTO comandas (mesa_id, status, total, aberto_em) VALUES (?, 'aberta', 0, ?)
      `).run(mesaId, agora())
      db.prepare("UPDATE mesas SET status = 'ocupada' WHERE id = ?").run(mesaId)
      return db.prepare('SELECT * FROM comandas WHERE id = ?').get(result.lastInsertRowid)
    },
    fechar(id) {
      const comanda = db.prepare('SELECT * FROM comandas WHERE id = ?').get(id)
      if (!comanda) return { erro: 'Comanda não encontrada' }
      db.prepare("UPDATE comandas SET status = 'fechada', fechado_em = ? WHERE id = ?").run(agora(), id)
      db.prepare("UPDATE mesas SET status = 'livre' WHERE id = ?").run(comanda.mesa_id)
      const mesa = db.prepare('SELECT supabase_id FROM mesas WHERE id = ?').get(comanda.mesa_id)
      console.log('[db] comandas.fechar: mesa_id=%s supabase_id=%s', comanda.mesa_id, mesa?.supabase_id)
      if (mesa?.supabase_id) {
        supabaseSync.fecharComandaSupabase(mesa.supabase_id)
          .then(() => console.log('[db] fecharComandaSupabase concluído'))
          .catch(e => console.error('[db] fecharComandaSupabase falhou:', e.message))
      } else {
        console.warn('[db] mesa sem supabase_id — sync com Supabase ignorado')
      }
      return { sucesso: true }
    },
    getByMesa(mesaId) {
      const comanda = db.prepare(`
        SELECT * FROM comandas WHERE mesa_id = ? AND status = 'aberta'
      `).get(mesaId)
      if (!comanda) return null
      const itens = db.prepare('SELECT * FROM comanda_itens WHERE comanda_id = ?').all(comanda.id)
      return { ...comanda, itens }
    },
    addItem(dados) {
      const { comandaId, menuItemId, nomeItem, quantidade, precoUnitario, sabor2, precoSabor2, adicionaisEscolhidos, observacao } = dados
      const subtotal = precoUnitario * quantidade
      // Item e total da comanda na mesma transacao: um item gravado sem o total
      // recalculado faz a mesa fechar com valor errado.
      const inserir = db.transaction(() => {
        const result = db.prepare(`
          INSERT INTO comanda_itens (comanda_id, menu_item_id, nome_item, quantidade, preco_unitario,
            subtotal, sabor_2, preco_sabor_2, adicionais_escolhidos, observacao, criado_em)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(comandaId, menuItemId || null, nomeItem, quantidade, precoUnitario, subtotal,
          sabor2 || null, precoSabor2 || null, JSON.stringify(adicionaisEscolhidos || []), observacao || '', agora())

        const total = db.prepare('SELECT SUM(subtotal) as t FROM comanda_itens WHERE comanda_id = ?').get(comandaId)
        db.prepare('UPDATE comandas SET total = ? WHERE id = ?').run(total.t || 0, comandaId)
        return result.lastInsertRowid
      })

      return db.prepare('SELECT * FROM comanda_itens WHERE id = ?').get(inserir())
    },
    removeItem(id) {
      const item = db.prepare('SELECT * FROM comanda_itens WHERE id = ?').get(id)
      if (!item) return { erro: 'Item não encontrado' }
      const remover = db.transaction(() => {
        db.prepare('DELETE FROM comanda_itens WHERE id = ?').run(id)
        const total = db.prepare('SELECT SUM(subtotal) as t FROM comanda_itens WHERE comanda_id = ?').get(item.comanda_id)
        db.prepare('UPDATE comandas SET total = ? WHERE id = ?').run(total.t || 0, item.comanda_id)
      })
      remover()
      return { sucesso: true }
    },
    listarAbertas() {
      const comandas = db.prepare(`
        SELECT c.*, m.numero as mesa_numero, m.nome as mesa_nome
        FROM comandas c
        JOIN mesas m ON m.id = c.mesa_id
        WHERE c.status = 'aberta'
        ORDER BY c.aberto_em
      `).all()
      return comandas.map(c => ({
        ...c,
        itens: db.prepare('SELECT * FROM comanda_itens WHERE comanda_id = ?').all(c.id),
      }))
    },
  },

  // ── Pedidos ────────────────────────────────────────────────────────────────
  pedidos: {
    listar(filtros = {}) {
      let query = 'SELECT * FROM pedidos'
      const params = []
      const conds = []

      if (filtros.status) { conds.push('status = ?'); params.push(filtros.status) }
      if (filtros.tipo) { conds.push('tipo_entrega = ?'); params.push(filtros.tipo) }
      if (filtros.data) { conds.push("date(criado_em) = ?"); params.push(filtros.data) }

      if (conds.length) query += ' WHERE ' + conds.join(' AND ')
      query += ' ORDER BY criado_em DESC'
      if (filtros.limit) { query += ' LIMIT ?'; params.push(filtros.limit) }

      const pedidosList = db.prepare(query).all(...params)
      return pedidosList.map(p => ({
        ...p,
        itens: db.prepare('SELECT * FROM itens_pedido WHERE pedido_id = ?').all(p.id),
      }))
    },
    criar(dados) {
      // Aceita camelCase e snake_case. As telas foram escritas nas duas convencoes
      // e o descasamento fazia o INSERT falhar em `tipo_entrega`/`subtotal`
      // (NOT NULL), silenciosamente, em toda venda de mesa.
      const campo = (...nomes) => {
        for (const n of nomes) {
          if (dados[n] !== undefined && dados[n] !== null) return dados[n]
        }
        return undefined
      }

      const tipoEntrega = campo('tipoEntrega', 'tipo_entrega')
      if (!tipoEntrega) {
        throw new Error('pedidos.criar: tipoEntrega e obrigatorio')
      }

      const itens = dados.itens || []
      const itensNorm = itens.map((i) => {
        const menuItemId = resolverMenuItemId(i.menuItemId ?? i.menu_item_id)
        return {
          menuItemId,
          nomeItem: i.nomeItem ?? i.nome_item ?? '',
          quantidade: i.quantidade ?? 0,
          precoUnitario: i.precoUnitario ?? i.preco_unitario ?? 0,
          subtotal: i.subtotal ?? ((i.precoUnitario ?? i.preco_unitario ?? 0) * (i.quantidade ?? 0)),
          sabor2: i.sabor2 ?? i.sabor_2 ?? null,
          precoSabor2: i.precoSabor2 ?? i.preco_sabor_2 ?? null,
          adicionaisEscolhidos: i.adicionaisEscolhidos ?? i.adicionais_escolhidos ?? [],
          observacao: i.observacao ?? '',
          // Congelado agora, de proposito. Se o relatorio de lucro lesse o custo
          // atual do produto, uma mudanca de preco do fornecedor reescreveria o
          // lucro de meses ja fechados — e nao ha como recuperar o valor antigo.
          custoUnitario: custoAtualDoProduto(menuItemId),
        }
      })

      // Sem subtotal explicito, deriva dos itens — a coluna e NOT NULL.
      const subtotal = campo('subtotal') ?? itensNorm.reduce((a, i) => a + (i.subtotal || 0), 0)
      const total = campo('total') ?? subtotal

      // Transacao: pedido e itens entram juntos ou nao entram.
      const inserir = db.transaction(() => {
        const numeroPedido = proximoNumeroPedido()
        const result = db.prepare(`
          INSERT INTO pedidos (numero_pedido, telefone_cliente, nome_cliente, tipo_entrega,
            endereco_entrega, forma_pagamento, troco_para, taxa_entrega, subtotal, total,
            status, origem, mesa, bairro_entrega, entregador_id, observacoes, criado_em, atualizado_em)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          numeroPedido,
          campo('telefoneCliente', 'telefone_cliente') || '',
          campo('nomeCliente', 'nome_cliente') || '',
          tipoEntrega,
          JSON.stringify(campo('enderecoEntrega', 'endereco_entrega') || {}),
          campo('formaPagamento', 'forma_pagamento') || '',
          campo('trocoPara', 'troco_para') || null,
          campo('taxaEntrega', 'taxa_entrega') || 0,
          subtotal, total,
          campo('status') || 'recebido',
          campo('origem') || 'pdv',
          campo('mesa') || null,
          campo('bairroEntrega', 'bairro_entrega') || '',
          campo('entregadorId', 'entregador_id') || null,
          campo('observacoes') || '', agora(), agora()
        )

        const pedidoId = result.lastInsertRowid
        const stmtItem = db.prepare(`
          INSERT INTO itens_pedido (pedido_id, menu_item_id, nome_item, quantidade, preco_unitario,
            subtotal, sabor_2, preco_sabor_2, adicionais_escolhidos, observacao, custo_unitario)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        for (const item of itensNorm) {
          stmtItem.run(pedidoId, item.menuItemId, item.nomeItem, item.quantidade,
            item.precoUnitario, item.subtotal, item.sabor2, item.precoSabor2,
            JSON.stringify(item.adicionaisEscolhidos), item.observacao, item.custoUnitario)
        }

        // Dentro da mesma transacao do pedido: ou a venda e a baixa entram
        // juntas, ou nenhuma das duas entra.
        baixarEstoqueDoPedido(pedidoId, itensNorm)
        return pedidoId
      })

      const pedidoId = inserir()
      return db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedidoId)
    },
    atualizar(dados) {
      const { id, ...rest } = dados
      // Colunas permitidas. Antes o nome da coluna vinha direto da chave enviada
      // pelo renderer e era concatenado no SQL: chave nao mapeada entrava crua na
      // query e um typo derrubava o UPDATE em runtime.
      const map = {
        tipoEntrega: 'tipo_entrega', nomeCliente: 'nome_cliente',
        formaPagamento: 'forma_pagamento', entregadorId: 'entregador_id',
        telefoneCliente: 'telefone_cliente', bairroEntrega: 'bairro_entrega',
        status: 'status', observacoes: 'observacoes', mesa: 'mesa',
        total: 'total', subtotal: 'subtotal', taxa_entrega: 'taxa_entrega',
        kds_status: 'kds_status',
      }

      const colunas = []
      const valores = []
      for (const [chave, valor] of Object.entries(rest)) {
        const coluna = map[chave]
        if (!coluna) {
          console.warn('[pedidos.atualizar] campo ignorado (nao permitido):', chave)
          continue
        }
        colunas.push(`${coluna} = ?`)
        valores.push(valor)
      }

      if (colunas.length === 0) {
        return db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id)
      }

      // Carimba quando o status mudou, nao so quando a linha mudou. E o que
      // permite mostrar ha quanto tempo o pedido esta parado na coluna atual —
      // `atualizado_em` nao serve, porque muda tambem ao trocar o entregador.
      if (rest.status !== undefined) {
        colunas.push('status_alterado_em = ?')
        valores.push(agora())
      }

      db.prepare(`UPDATE pedidos SET ${colunas.join(', ')}, atualizado_em = ? WHERE id = ?`)
        .run(...valores, agora(), id)
      return db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id)
    },
    getById(id) {
      const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id)
      if (!pedido) return null
      return { ...pedido, itens: db.prepare('SELECT * FROM itens_pedido WHERE pedido_id = ?').all(id) }
    },
    dashboard(periodo = 'hoje') {
      const hoje = new Date().toISOString().split('T')[0]
      let dataInicio = hoje
      if (periodo === '7dias') {
        const d = new Date(); d.setDate(d.getDate() - 6)
        dataInicio = d.toISOString().split('T')[0]
      } else if (periodo === '30dias') {
        const d = new Date(); d.setDate(d.getDate() - 29)
        dataInicio = d.toISOString().split('T')[0]
      }

      // Delivery/retirada: receita vem da tabela de pedidos.
      //
      // Mesa fica DE FORA aqui de proposito. Toda venda de salao e lancada no
      // caixa como tipo='venda' (ver Mesas.jsx -> caixa.registrarVenda) e desde
      // a correcao de pedidos.criar tambem gera uma linha em `pedidos`. Somar as
      // duas fontes sem este filtro conta cada venda de mesa duas vezes.
      const receitaPedidos = db.prepare(`
        SELECT COALESCE(SUM(total), 0) as total FROM pedidos
        WHERE date(criado_em) BETWEEN ? AND ?
          AND status != 'cancelado'
          AND COALESCE(tipo_entrega, '') != 'mesa'
      `).get(dataInicio, hoje).total

      // Mesa: receita registrada no caixa (tipo='venda').
      // 'venda_delivery' fica de fora — ja esta contabilizada em receitaPedidos.
      const receitaCaixa = db.prepare(`
        SELECT COALESCE(SUM(valor), 0) as total FROM caixa_movimentacoes
        WHERE date(criado_em) BETWEEN ? AND ? AND tipo = 'venda'
      `).get(dataInicio, hoje).total

      const pedidosAbertos = db.prepare(`
        SELECT COUNT(*) as count FROM pedidos WHERE status IN ('recebido', 'em_preparo', 'pronto', 'saiu')
      `).get()
      const pedidosHoje = db.prepare(`
        SELECT COUNT(*) as count FROM pedidos WHERE date(criado_em) BETWEEN ? AND ? AND status != 'cancelado'
      `).get(dataInicio, hoje)
      const ticketMedio = db.prepare(`
        SELECT COALESCE(AVG(total), 0) as avg FROM pedidos
        WHERE date(criado_em) BETWEEN ? AND ? AND status != 'cancelado'
      `).get(dataInicio, hoje)

      return {
        receitaHoje: receitaPedidos + receitaCaixa,
        pedidosAbertos: pedidosAbertos.count,
        pedidosHoje: pedidosHoje.count,
        ticketMedio: ticketMedio.avg,
      }
    },
  },

  // ── Estoque ────────────────────────────────────────────────────────────────
  estoque: {
    listar() {
      return db.prepare('SELECT * FROM menu_items ORDER BY nome').all()
    },
    movimentar(dados) {
      const { menuItemId, tipo, quantidade, custoUnitario, motivo, fornecedorId, pedidoId } = dados

      const anterior = db.prepare('SELECT estoque_atual FROM menu_items WHERE id = ?').get(menuItemId)
      const saldoAnterior = anterior?.estoque_atual ?? 0
      // MAX(0, ...) zera em silencio quando a saida excede o saldo. Detecta antes
      // para poder avisar, em vez de o estoque simplesmente "sumir".
      const excedeu = (tipo === 'saida' || tipo === 'perda') && quantidade > saldoAnterior

      // Log e saldo precisam entrar juntos, senao o historico diverge do estoque.
      const aplicar = db.transaction(() => {
        db.prepare(`
          INSERT INTO estoque_movimentacoes (menu_item_id, fornecedor_id, tipo, quantidade,
            custo_unitario, motivo, pedido_id, criado_em)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(menuItemId, fornecedorId || null, tipo, quantidade, custoUnitario || null, motivo || '', pedidoId || null, agora())

        if (tipo === 'entrada' || tipo === 'suprimento') {
          db.prepare('UPDATE menu_items SET estoque_atual = estoque_atual + ? WHERE id = ?').run(quantidade, menuItemId)
        } else if (tipo === 'saida' || tipo === 'perda') {
          db.prepare('UPDATE menu_items SET estoque_atual = MAX(0, estoque_atual - ?) WHERE id = ?').run(quantidade, menuItemId)
        } else if (tipo === 'inventario') {
          db.prepare('UPDATE menu_items SET estoque_atual = ? WHERE id = ?').run(quantidade, menuItemId)
        }
      })
      aplicar()

      const produto = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(menuItemId)
      if (excedeu) {
        return {
          ...produto,
          aviso: `Saída de ${quantidade} maior que o saldo (${saldoAnterior}). Estoque zerado.`,
        }
      }
      return produto
    },
    alertas() {
      return db.prepare(`
        SELECT * FROM menu_items WHERE estoque_atual <= estoque_minimo AND estoque_minimo > 0 ORDER BY nome
      `).all()
    },
    historico(produtoId) {
      return db.prepare(`
        SELECT em.*, f.nome as fornecedor_nome
        FROM estoque_movimentacoes em
        LEFT JOIN fornecedores f ON f.id = em.fornecedor_id
        WHERE em.menu_item_id = ? ORDER BY em.criado_em DESC
      `).all(produtoId)
    },
  },

  // ── Caixa ──────────────────────────────────────────────────────────────────
  caixa: {
    sessaoAtual() {
      return db.prepare("SELECT * FROM caixa_sessoes WHERE status = 'aberto' LIMIT 1").get()
    },
    abrir(dados) {
      const existente = db.prepare("SELECT * FROM caixa_sessoes WHERE status = 'aberto' LIMIT 1").get()
      // Ja havia caixa aberto: o valorInicial informado e descartado. Sinaliza
      // em vez de fingir que a abertura aconteceu com o valor pedido.
      if (existente) return { ...existente, jaEstavaAberto: true }
      const result = db.prepare(`
        INSERT INTO caixa_sessoes (aberto_em, valor_inicial, status) VALUES (?, ?, 'aberto')
      `).run(agora(), dados.valorInicial || 0)
      return db.prepare('SELECT * FROM caixa_sessoes WHERE id = ?').get(result.lastInsertRowid)
    },
    fechar(dados) {
      const sessao = db.prepare("SELECT * FROM caixa_sessoes WHERE status = 'aberto' LIMIT 1").get()
      if (!sessao) return { erro: 'Nenhum caixa aberto' }
      db.prepare(`
        UPDATE caixa_sessoes SET status = 'fechado', fechado_em = ?, valor_final = ?, observacoes = ?
        WHERE id = ?
      `).run(agora(), dados.valorFinal || 0, dados.observacoes || '', sessao.id)
      return db.prepare('SELECT * FROM caixa_sessoes WHERE id = ?').get(sessao.id)
    },
    sangria(dados) {
      const sessao = db.prepare("SELECT * FROM caixa_sessoes WHERE status = 'aberto' LIMIT 1").get()
      if (!sessao) return { erro: 'Nenhum caixa aberto' }
      db.prepare(`
        INSERT INTO caixa_movimentacoes (sessao_id, tipo, forma_pagamento, valor, descricao, criado_em)
        VALUES (?, 'sangria', 'dinheiro', ?, ?, ?)
      `).run(sessao.id, dados.valor, dados.descricao || 'Sangria de caixa', agora())
      db.prepare('UPDATE caixa_sessoes SET total_sangria = total_sangria + ? WHERE id = ?').run(dados.valor, sessao.id)
      return { sucesso: true }
    },
    suprimento(dados) {
      const sessao = db.prepare("SELECT * FROM caixa_sessoes WHERE status = 'aberto' LIMIT 1").get()
      if (!sessao) return { erro: 'Nenhum caixa aberto' }
      db.prepare(`
        INSERT INTO caixa_movimentacoes (sessao_id, tipo, forma_pagamento, valor, descricao, criado_em)
        VALUES (?, 'suprimento', 'dinheiro', ?, ?, ?)
      `).run(sessao.id, dados.valor, dados.descricao || 'Suprimento de caixa', agora())
      db.prepare('UPDATE caixa_sessoes SET total_suprimento = total_suprimento + ? WHERE id = ?').run(dados.valor, sessao.id)
      return { sucesso: true }
    },
    // Caminho unico de lancamento de venda. `refExterna` e opcional: quando
    // informada, a mesma venda nunca e lancada duas vezes (protege contra o
    // eco do realtime e contra clique duplo).
    lancarVenda(tipo, dados) {
      const sessao = db.prepare("SELECT * FROM caixa_sessoes WHERE status = 'aberto' LIMIT 1").get()
      if (!sessao) return { erro: 'Nenhum caixa aberto' }

      if (dados.refExterna) {
        const existente = db
          .prepare('SELECT id FROM caixa_movimentacoes WHERE ref_externa = ? LIMIT 1')
          .get(dados.refExterna)
        if (existente) {
          console.log('[caixa] venda ja lancada, ignorando duplicata:', dados.refExterna)
          return { sucesso: true, duplicada: true }
        }
      }

      const forma = normalizarFormaPagamento(dados.formaPagamento) || 'dinheiro'
      const colMap = { dinheiro: 'total_dinheiro', pix: 'total_pix', debito: 'total_debito', credito: 'total_credito' }
      const col = colMap[forma]

      // Forma desconhecida: a movimentacao e gravada, mas nenhuma coluna de total
      // da sessao a acumula — o caixa fecharia sem bater e sem explicacao. Devolve
      // um aviso para a tela mostrar, em vez de so logar no console.
      const aviso = col
        ? null
        : `Forma de pagamento "${dados.formaPagamento}" não é reconhecida pelo caixa. ` +
          `O valor foi registrado na movimentação, mas não entra no total da sessão.`
      if (aviso) console.warn('[caixa]', aviso)

      const lancar = db.transaction(() => {
        db.prepare(`
          INSERT INTO caixa_movimentacoes (sessao_id, tipo, forma_pagamento, valor, descricao, ref_externa, criado_em)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(sessao.id, tipo, forma, dados.valor, dados.descricao || '', dados.refExterna || null, agora())

        if (col) {
          db.prepare(`UPDATE caixa_sessoes SET ${col} = ${col} + ? WHERE id = ?`).run(dados.valor, sessao.id)
        }
      })
      lancar()

      return aviso ? { sucesso: true, aviso } : { sucesso: true }
    },
    registrarVendaDelivery(dados) {
      return dbModule.caixa.lancarVenda('venda_delivery', dados)
    },
    registrarVenda(dados) {
      return dbModule.caixa.lancarVenda('venda', dados)
    },
    movimentacoes(sessaoId) {
      return db.prepare('SELECT * FROM caixa_movimentacoes WHERE sessao_id = ? ORDER BY criado_em DESC').all(sessaoId)
    },
    resumo(sessaoId) {
      const sessao = db.prepare('SELECT * FROM caixa_sessoes WHERE id = ?').get(sessaoId)
      const movs = db.prepare('SELECT * FROM caixa_movimentacoes WHERE sessao_id = ?').all(sessaoId)
      // 'venda' (mesa) + 'venda_delivery'. Antes so 'venda' entrava, o que fazia
      // este total divergir das colunas total_* da sessao, que somam as duas.
      const ehVenda = (m) => m.tipo === 'venda' || m.tipo === 'venda_delivery'
      const totalVendas = movs.filter(ehVenda).reduce((a, b) => a + b.valor, 0)
      return { sessao, movimentacoes: movs, totalVendas }
    },
  },

  // ── Financeiro ─────────────────────────────────────────────────────────────
  financeiro: {
    contasPagar() {
      return db.prepare(`
        SELECT cp.*, f.nome as fornecedor_nome FROM contas_pagar cp
        LEFT JOIN fornecedores f ON f.id = cp.fornecedor_id
        ORDER BY cp.vencimento
      `).all()
    },
    contasReceber() {
      return db.prepare('SELECT * FROM contas_receber ORDER BY vencimento').all()
    },
    criarContaPagar(dados) {
      const result = db.prepare(`
        INSERT INTO contas_pagar (fornecedor_id, descricao, valor, vencimento, status, categoria, criado_em)
        VALUES (?, ?, ?, ?, 'pendente', ?, ?)
      `).run(dados.fornecedorId || null, dados.descricao, dados.valor, dados.vencimento, dados.categoria || '', agora())
      return db.prepare('SELECT * FROM contas_pagar WHERE id = ?').get(result.lastInsertRowid)
    },
    criarContaReceber(dados) {
      const result = db.prepare(`
        INSERT INTO contas_receber (descricao, valor, vencimento, status, criado_em)
        VALUES (?, ?, ?, 'pendente', ?)
      `).run(dados.descricao, dados.valor, dados.vencimento, agora())
      return db.prepare('SELECT * FROM contas_receber WHERE id = ?').get(result.lastInsertRowid)
    },
    pagarConta(id) {
      db.prepare("UPDATE contas_pagar SET status = 'pago', pago_em = ? WHERE id = ?").run(agora(), id)
      return { sucesso: true }
    },
    receberConta(id) {
      db.prepare("UPDATE contas_receber SET status = 'recebido', recebido_em = ? WHERE id = ?").run(agora(), id)
      return { sucesso: true }
    },
    fluxoCaixa(periodo) {
      const { inicio, fim } = periodo
      const entradasContas = db.prepare(`
        SELECT COALESCE(SUM(valor), 0) as total FROM contas_receber
        WHERE status = 'recebido' AND recebido_em BETWEEN ? AND ?
      `).get(inicio, fim).total
      // Inclui vendas de mesa (venda) e delivery (venda_delivery) registradas no caixa
      const entradasCaixa = db.prepare(`
        SELECT COALESCE(SUM(valor), 0) as total FROM caixa_movimentacoes
        WHERE tipo IN ('venda', 'venda_delivery') AND criado_em BETWEEN ? AND ?
      `).get(inicio, fim).total
      const saidas = db.prepare(`
        SELECT COALESCE(SUM(valor), 0) as total FROM contas_pagar
        WHERE status = 'pago' AND pago_em BETWEEN ? AND ?
      `).get(inicio, fim).total
      const entradas = entradasContas + entradasCaixa
      return { entradas, saidas, saldo: entradas - saidas }
    },
  },

  // ── Fornecedores ───────────────────────────────────────────────────────────
  fornecedores: {
    listar() {
      return db.prepare('SELECT * FROM fornecedores WHERE ativo = 1 ORDER BY nome').all()
    },
    criar(dados) {
      const result = db.prepare(`
        INSERT INTO fornecedores (nome, contato, telefone, email, cnpj, produtos_fornecidos, observacoes, ativo)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `).run(dados.nome, dados.contato || '', dados.telefone || '', dados.email || '',
        dados.cnpj || '', dados.produtosFornecidos || '', dados.observacoes || '')
      return db.prepare('SELECT * FROM fornecedores WHERE id = ?').get(result.lastInsertRowid)
    },
    atualizar(dados) {
      const { id, ...rest } = dados
      const cols = Object.keys(rest).map(k => `${k} = ?`).join(', ')
      db.prepare(`UPDATE fornecedores SET ${cols} WHERE id = ?`).run(...Object.values(rest), id)
      return db.prepare('SELECT * FROM fornecedores WHERE id = ?').get(id)
    },
  },

  // ── Entregadores ───────────────────────────────────────────────────────────
  entregadores: {
    // Por padrao so os ativos: quem chama de dentro da tela de pedidos quer a
    // lista de quem pode sair agora. A tela de cadastro pede os inativos junto.
    listar(incluirInativos = false) {
      const filtro = incluirInativos ? '' : 'WHERE ativo = 1'
      return db.prepare(`SELECT * FROM entregadores ${filtro} ORDER BY ativo DESC, nome`).all()
    },
    criar(dados) {
      const result = db.prepare(`
        INSERT INTO entregadores (nome, telefone, veiculo, placa, ativo) VALUES (?, ?, ?, ?, 1)
      `).run(dados.nome, dados.telefone || '', dados.veiculo || '', dados.placa || '')
      return db.prepare('SELECT * FROM entregadores WHERE id = ?').get(result.lastInsertRowid)
    },
    atualizar(dados) {
      const { id, ...rest } = dados
      // Mesma whitelist de `pedidos.atualizar`, pelo mesmo motivo: sem ela o
      // nome da coluna vem do renderer e entra cru na query.
      const map = { nome: 'nome', telefone: 'telefone', veiculo: 'veiculo', placa: 'placa', ativo: 'ativo' }

      const colunas = []
      const valores = []
      for (const [chave, valor] of Object.entries(rest)) {
        const coluna = map[chave]
        if (!coluna) {
          console.warn('[entregadores.atualizar] campo ignorado (nao permitido):', chave)
          continue
        }
        colunas.push(`${coluna} = ?`)
        valores.push(valor)
      }
      if (colunas.length === 0) return db.prepare('SELECT * FROM entregadores WHERE id = ?').get(id)

      valores.push(id)
      db.prepare(`UPDATE entregadores SET ${colunas.join(', ')} WHERE id = ?`).run(...valores)
      return db.prepare('SELECT * FROM entregadores WHERE id = ?').get(id)
    },
    // Desativa em vez de apagar: `pedidos.entregador_id` aponta para ca, e
    // remover a linha faria o historico perder o nome de quem entregou.
    deletar(id) {
      db.prepare('UPDATE entregadores SET ativo = 0 WHERE id = ?').run(id)
      return { sucesso: true }
    },
  },

  // ── Zonas ──────────────────────────────────────────────────────────────────
  zonas: {
    listar() {
      return db.prepare('SELECT * FROM zonas_entrega WHERE ativo = 1 ORDER BY bairro').all()
    },
    criar(dados) {
      const result = db.prepare(`
        INSERT INTO zonas_entrega (bairro, municipio, taxa_entrega, ativo) VALUES (?, ?, ?, 1)
      `).run(dados.bairro, dados.municipio || 'Nova Iguaçu', dados.taxaEntrega || 0)
      return db.prepare('SELECT * FROM zonas_entrega WHERE id = ?').get(result.lastInsertRowid)
    },
    atualizar(dados) {
      const { id, ...rest } = dados
      const map = { taxaEntrega: 'taxa_entrega' }
      const cols = Object.keys(rest).map(k => `${map[k] || k} = ?`).join(', ')
      db.prepare(`UPDATE zonas_entrega SET ${cols} WHERE id = ?`).run(...Object.values(rest), id)
      return db.prepare('SELECT * FROM zonas_entrega WHERE id = ?').get(id)
    },
    deletar(id) {
      db.prepare('UPDATE zonas_entrega SET ativo = 0 WHERE id = ?').run(id)
      return { sucesso: true }
    },
  },

  // ── Relatórios ─────────────────────────────────────────────────────────────
  relatorios: {
    vendas(periodo) {
      const { inicio, fim, agrupamento } = periodo
      const groupBy = agrupamento === 'mes' ? "strftime('%Y-%m', criado_em)"
        : agrupamento === 'semana' ? "strftime('%Y-%W', criado_em)"
        : "date(criado_em)"
      // Une vendas de delivery (pedidos entregue/concluido) com vendas de mesa (caixa_movimentacoes tipo='venda')
      // venda_delivery é excluída pois o pedido já está contado via tabela pedidos
      return db.prepare(`
        SELECT periodo,
          SUM(total_pedidos) as total_pedidos,
          SUM(receita) as receita,
          CASE WHEN SUM(total_pedidos) > 0 THEN CAST(SUM(receita) AS REAL) / SUM(total_pedidos) ELSE 0 END as ticket_medio
        FROM (
          SELECT ${groupBy} as periodo,
            COUNT(*) as total_pedidos,
            COALESCE(SUM(total), 0) as receita
          FROM pedidos
          WHERE criado_em BETWEEN ? AND ?
            AND status IN ('entregue', 'concluido', 'pronto', 'saiu', 'em_preparo', 'recebido')
            AND status != 'cancelado'
            -- Mesa entra pelo UNION abaixo, via caixa_movimentacoes. Sem este
            -- filtro toda venda de salao aparece em dobro no relatorio — era o
            -- caso ate 31/07/2026. O dashboard ja excluia; aqui faltava.
            AND tipo_entrega != 'mesa'
          GROUP BY ${groupBy}
          UNION ALL
          SELECT ${groupBy} as periodo,
            COUNT(*) as total_pedidos,
            COALESCE(SUM(valor), 0) as receita
          FROM caixa_movimentacoes
          WHERE criado_em BETWEEN ? AND ? AND tipo = 'venda'
          GROUP BY ${groupBy}
        ) t
        GROUP BY periodo
        ORDER BY periodo
      `).all(inicio, fim, inicio, fim)
    },
    produtosMaisVendidos(periodo) {
      return db.prepare(`
        SELECT ip.nome_item, SUM(ip.quantidade) as total_vendido, SUM(ip.subtotal) as receita
        FROM itens_pedido ip
        JOIN pedidos p ON p.id = ip.pedido_id
        WHERE p.criado_em BETWEEN ? AND ? AND p.status != 'cancelado'
        GROUP BY ip.nome_item
        ORDER BY total_vendido DESC
        LIMIT 20
      `).all(periodo.inicio, periodo.fim)
    },
    estoque() {
      return db.prepare(`
        SELECT *, (estoque_atual * custo_unitario) as valor_estoque FROM menu_items ORDER BY nome
      `).all()
    },
    /**
     * Custo x lucro por produto no periodo.
     *
     * O custo vem de `itens_pedido.custo_unitario`, congelado no momento da
     * venda — nao do cadastro atual do produto. E o que impede uma alta do
     * fornecedor de reescrever o lucro de meses ja fechados.
     *
     * Diferente de `vendas()`, aqui a mesa entra: itens de mesa estao em
     * `itens_pedido` e nao tem segunda fonte, entao nao ha o que duplicar.
     */
    custoLucro(periodo) {
      const itens = db.prepare(`
        SELECT ip.nome_item,
          SUM(ip.quantidade) as quantidade,
          SUM(ip.subtotal) as receita,
          SUM(COALESCE(ip.custo_unitario, 0) * ip.quantidade) as custo,
          SUM(CASE WHEN COALESCE(ip.custo_unitario, 0) = 0 THEN ip.quantidade ELSE 0 END) as qtd_sem_custo
        FROM itens_pedido ip
        JOIN pedidos p ON p.id = ip.pedido_id
        WHERE p.criado_em BETWEEN ? AND ? AND p.status != 'cancelado'
        GROUP BY ip.nome_item
        ORDER BY (SUM(ip.subtotal) - SUM(COALESCE(ip.custo_unitario, 0) * ip.quantidade)) DESC
      `).all(periodo.inicio, periodo.fim)

      const comMargem = itens.map((i) => {
        const lucro = (i.receita || 0) - (i.custo || 0)
        return {
          ...i,
          lucro,
          margem: i.receita > 0 ? (lucro / i.receita) * 100 : 0,
          // Produto sem custo cadastrado aparece como lucro = receita, o que e
          // mentira. A tela precisa poder avisar em vez de exibir o numero seco.
          semCusto: (i.qtd_sem_custo || 0) > 0,
        }
      })

      const receita = comMargem.reduce((a, i) => a + (i.receita || 0), 0)
      const custo = comMargem.reduce((a, i) => a + (i.custo || 0), 0)
      const lucro = receita - custo

      return {
        itens: comMargem,
        totais: {
          receita, custo, lucro,
          margem: receita > 0 ? (lucro / receita) * 100 : 0,
          produtosSemCusto: comMargem.filter(i => i.semCusto).length,
        },
      }
    },
  },

  // ── Config ──────────────────────────────────────────────────────────────────
  config: {
    get() {
      return db.prepare('SELECT * FROM configuracoes LIMIT 1').get()
    },
    update(dados) {
      // descobre as colunas reais da tabela para nao gerar SQL invalido
      const colunasValidas = new Set(
        db.prepare(`PRAGMA table_info(configuracoes)`).all().map(r => r.name)
      )
      const filtrado = Object.fromEntries(
        Object.entries(dados).filter(([k]) => colunasValidas.has(k) && k !== 'id')
      )
      if (Object.keys(filtrado).length === 0) return db.prepare('SELECT * FROM configuracoes LIMIT 1').get()
      const cfg = db.prepare('SELECT id FROM configuracoes LIMIT 1').get()
      if (cfg) {
        const cols = Object.keys(filtrado).map(k => `${k} = ?`).join(', ')
        db.prepare(`UPDATE configuracoes SET ${cols} WHERE id = ?`).run(...Object.values(filtrado), cfg.id)
      } else {
        const keys = Object.keys(filtrado).join(', ')
        const vals = Object.keys(filtrado).map(() => '?').join(', ')
        db.prepare(`INSERT INTO configuracoes (${keys}) VALUES (${vals})`).run(...Object.values(filtrado))
      }
      return db.prepare('SELECT * FROM configuracoes LIMIT 1').get()
    },
    resetDemo() {
      const tables = ['menu_items', 'mesas', 'comandas', 'comanda_itens', 'pedidos', 'itens_pedido',
        'estoque_movimentacoes', 'caixa_sessoes', 'caixa_movimentacoes', 'contas_pagar',
        'contas_receber', 'fornecedores', 'entregadores', 'zonas_entrega', 'lojas', 'configuracoes', 'categorias']
      for (const t of tables) db.prepare(`DELETE FROM ${t}`).run()
      const { seed } = require('./seed')
      seed(db)
      return { sucesso: true }
    },
  },

  // ── Impressão ───────────────────────────────────────────────────────────────
  // Implementacao em electron/database/impressao.js. Recebe os leitores em vez
  // de importar `dbModule`, que ainda nao existe neste ponto do arquivo.
  impressao: criarImpressao(
    () => db.prepare('SELECT * FROM configuracoes LIMIT 1').get(),
    () => db.prepare('SELECT * FROM lojas LIMIT 1').get()
  ),
}

dbModule.getRawDb = () => db

module.exports = dbModule
