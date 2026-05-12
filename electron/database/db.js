const Database = require('better-sqlite3')
const path = require('path')
const { app } = require('electron')
const crypto = require('crypto')
const os = require('os')
const { createClient } = require('@supabase/supabase-js')
const ws = require('ws')
const supabaseSync = require('../supabaseSync')

const SUPABASE_URL = 'https://tcgsvatpkobjhmnvyhxl.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjZ3N2YXRwa29iamhtbnZ5aHhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNjQ2MjAsImV4cCI6MjA5MDc0MDYyMH0.0z6G8I9JwLLml2CCjkgL7yM_6nLvVKdqSzqtVPzd1gE'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: {
    fetch: fetch,
  },
  realtime: {
    transport: ws,
  },
})

const userDataPath = app ? app.getPath('userData') : '.'
const dbPath = path.join(userDataPath, 'tapedido.db')

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

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
try {
  db.exec(`CREATE TABLE IF NOT EXISTS sync_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operacao TEXT NOT NULL,
    status TEXT NOT NULL,
    erro TEXT,
    created_at TEXT NOT NULL
  )`)
} catch {}

// ── Helpers ────────────────────────────────────────────────────────────────
const agora = () => new Date().toISOString()

function getMachineId() {
  const data = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.cpus()[0]?.model || '',
  ].join('|')
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 32)
}

function proximoNumeroPedido() {
  const row = db.prepare('SELECT MAX(numero_pedido) as max FROM pedidos').get()
  return (row?.max || 0) + 1
}

// ── Módulos ────────────────────────────────────────────────────────────────
const dbModule = {
  // ── Licença ──────────────────────────────────────────────────────────────
  licenca: {
    verificar() {
      const row = db.prepare("SELECT * FROM licenca WHERE modo_demo = 0 LIMIT 1").get()
      if (!row) return { ativa: false, demo: false }

      // If revocation was detected, check whether 24-hour grace period has expired
      if (row.revogada_em) {
        const ms24h = 24 * 60 * 60 * 1000
        const elapsed = Date.now() - new Date(row.revogada_em).getTime()
        if (elapsed > ms24h) return { ativa: false, demo: false, cancelada: true }
      }

      return { ativa: true, demo: false }
    },

    async verificarPeriodicamente() {
      const row = db.prepare("SELECT * FROM licenca WHERE modo_demo = 0 LIMIT 1").get()
      if (!row) return

      // Only check once per week
      const msWeek = 7 * 24 * 60 * 60 * 1000
      if (row.ultima_verificacao) {
        const elapsed = Date.now() - new Date(row.ultima_verificacao).getTime()
        if (elapsed < msWeek) return
      }

      try {
        const { data, error } = await supabase
          .from('licencas')
          .select('status')
          .eq('chave', row.chave)
          .maybeSingle()

        // No internet / Supabase unreachable — never block
        if (error || !data) return

        // Record verification time
        db.prepare('UPDATE licenca SET ultima_verificacao = ? WHERE id = ?').run(agora(), row.id)

        if (data.status === 'revogada') {
          // Record first detection time (do not overwrite if already set)
          if (!row.revogada_em) {
            db.prepare('UPDATE licenca SET revogada_em = ? WHERE id = ?').run(agora(), row.id)
          }
        } else {
          // License reinstated — clear any revocation marker
          if (row.revogada_em) {
            db.prepare('UPDATE licenca SET revogada_em = NULL WHERE id = ?').run(row.id)
          }
        }
      } catch {
        // Network error — silently ignore, never block
      }
    },

    async ativar(chave) {
      if (!chave || chave.trim() === '') {
        return { sucesso: false, erro: 'Chave inválida' }
      }

      const machineId = getMachineId()
      const chaveFinal = chave.trim().toUpperCase()

      try {
        console.log('[licenca:ativar] buscando chave:', chaveFinal)

        const { data, error, status, statusText } = await supabase
          .from('licencas')
          .select('*')
          .eq('chave', chaveFinal)
          .maybeSingle()

        console.log('[licenca:ativar] resposta Supabase — status:', status, statusText)
        console.log('[licenca:ativar] data:', JSON.stringify(data))
        console.log('[licenca:ativar] error:', JSON.stringify(error))

        if (error) {
          return { sucesso: false, erro: `Erro Supabase: ${error.message} (${error.code})` }
        }

        if (!data) {
          return { sucesso: false, erro: 'Chave de licença não encontrada' }
        }

        if (data.status === 'revogada') {
          return { sucesso: false, erro: 'Esta licença foi revogada' }
        }

        if (data.status === 'usada' && data.machine_id !== machineId) {
          return { sucesso: false, erro: 'Esta licença já está ativada em outro computador' }
        }

        await supabase
          .from('licencas')
          .update({ status: 'usada', machine_id: machineId, ativada_em: agora() })
          .eq('id', data.id)

        db.prepare('DELETE FROM licenca').run()
        db.prepare(`
          INSERT INTO licenca (chave, machine_id, nome_cliente, email, ativada_em, modo_demo)
          VALUES (?, ?, ?, ?, ?, 0)
        `).run(chaveFinal, machineId, data.nome_cliente || '', data.email_cliente || '', agora())

        // Cria a loja no Supabase em background — não bloqueia a ativação
        setImmediate(async () => {
          try {
            const jaTemLoja = db.prepare('SELECT supabase_loja_id FROM configuracoes LIMIT 1').get()
            if (jaTemLoja?.supabase_loja_id) return // já foi criada

            const lojaLocal = db.prepare('SELECT nome FROM lojas LIMIT 1').get()
            const nomeLoja = lojaLocal?.nome || data.nome_cliente || 'Minha Loja'
            const resultado = await supabaseSync.criarLoja(db, nomeLoja)
            if (resultado) {
              const cfg = db.prepare('SELECT id FROM configuracoes LIMIT 1').get()
              if (cfg) {
                db.prepare(
                  'UPDATE configuracoes SET supabase_loja_id = ?, codigo_loja = ? WHERE id = ?'
                ).run(resultado.lojaId, resultado.codigoLoja, cfg.id)
              } else {
                db.prepare(
                  'INSERT INTO configuracoes (supabase_loja_id, codigo_loja) VALUES (?, ?)'
                ).run(resultado.lojaId, resultado.codigoLoja)
              }
            }
          } catch {}
        })

        return { sucesso: true, nomeCliente: data.nome_cliente }
      } catch (err) {
        console.log('[licenca:ativar] exceção:', err)
        return { sucesso: false, erro: 'Erro de conexão. Verifique sua internet.' }
      }
    },

    ativarDemo() {
      // Demo is session-only: seed data is loaded but wiped on app close (see main.js before-quit)
      const { seed } = require('./seed')
      seed(db)
      return { sucesso: true }
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
    listar() {
      return db.prepare('SELECT * FROM categorias WHERE ativo = 1 ORDER BY ordem, nome').all()
    },
    criar(dados) {
      const result = db.prepare(`
        INSERT INTO categorias (nome, icone, ordem, ativo) VALUES (?, ?, ?, 1)
      `).run(dados.nome, dados.icone || '', dados.ordem || 0)
      return db.prepare('SELECT * FROM categorias WHERE id = ?').get(result.lastInsertRowid)
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
      const lojaId = db.prepare('SELECT supabase_loja_id FROM configuracoes LIMIT 1').get()?.supabase_loja_id
      if (lojaId) {
        const supabaseId = crypto.randomUUID()
        db.prepare('UPDATE mesas SET supabase_id = ? WHERE id = ?').run(supabaseId, mesa.id)
        mesa.supabase_id = supabaseId
        supabaseSync.sincronizarMesaCriada(lojaId, mesa).catch(() => {})
      }
      return mesa
    },
    atualizar(dados) {
      const { id, ...rest } = dados
      const cols = Object.keys(rest).map(k => `${k} = ?`).join(', ')
      db.prepare(`UPDATE mesas SET ${cols} WHERE id = ?`).run(...Object.values(rest), id)
      const mesa = db.prepare('SELECT * FROM mesas WHERE id = ?').get(id)
      const lojaId = db.prepare('SELECT supabase_loja_id FROM configuracoes LIMIT 1').get()?.supabase_loja_id
      if (lojaId && mesa.supabase_id) {
        supabaseSync.sincronizarMesaAtualizada(lojaId, mesa).catch(() => {})
      }
      return mesa
    },
    deletar(id) {
      const mesa = db.prepare('SELECT * FROM mesas WHERE id = ?').get(id)
      db.prepare('DELETE FROM mesas WHERE id = ?').run(id)
      if (mesa?.supabase_id) {
        supabaseSync.sincronizarMesaDeletada(mesa.supabase_id).catch(() => {})
      }
      return { sucesso: true }
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
      const result = db.prepare(`
        INSERT INTO comanda_itens (comanda_id, menu_item_id, nome_item, quantidade, preco_unitario,
          subtotal, sabor_2, preco_sabor_2, adicionais_escolhidos, observacao, criado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(comandaId, menuItemId || null, nomeItem, quantidade, precoUnitario, subtotal,
        sabor2 || null, precoSabor2 || null, JSON.stringify(adicionaisEscolhidos || []), observacao || '', agora())

      const total = db.prepare('SELECT SUM(subtotal) as t FROM comanda_itens WHERE comanda_id = ?').get(comandaId)
      db.prepare('UPDATE comandas SET total = ? WHERE id = ?').run(total.t || 0, comandaId)
      return db.prepare('SELECT * FROM comanda_itens WHERE id = ?').get(result.lastInsertRowid)
    },
    removeItem(id) {
      const item = db.prepare('SELECT * FROM comanda_itens WHERE id = ?').get(id)
      if (!item) return { erro: 'Item não encontrado' }
      db.prepare('DELETE FROM comanda_itens WHERE id = ?').run(id)
      const total = db.prepare('SELECT SUM(subtotal) as t FROM comanda_itens WHERE comanda_id = ?').get(item.comanda_id)
      db.prepare('UPDATE comandas SET total = ? WHERE id = ?').run(total.t || 0, item.comanda_id)
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
      const numeroPedido = proximoNumeroPedido()
      const result = db.prepare(`
        INSERT INTO pedidos (numero_pedido, telefone_cliente, nome_cliente, tipo_entrega,
          endereco_entrega, forma_pagamento, troco_para, taxa_entrega, subtotal, total,
          status, origem, mesa, bairro_entrega, entregador_id, observacoes, criado_em, atualizado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        numeroPedido, dados.telefoneCliente || '', dados.nomeCliente || '',
        dados.tipoEntrega, JSON.stringify(dados.enderecoEntrega || {}),
        dados.formaPagamento || '', dados.trocoPara || null,
        dados.taxaEntrega || 0, dados.subtotal, dados.total,
        'recebido', dados.origem || 'pdv', dados.mesa || null,
        dados.bairroEntrega || '', dados.entregadorId || null,
        dados.observacoes || '', agora(), agora()
      )

      const pedidoId = result.lastInsertRowid
      for (const item of (dados.itens || [])) {
        db.prepare(`
          INSERT INTO itens_pedido (pedido_id, menu_item_id, nome_item, quantidade, preco_unitario,
            subtotal, sabor_2, preco_sabor_2, adicionais_escolhidos, observacao)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(pedidoId, item.menuItemId || null, item.nomeItem, item.quantidade,
          item.precoUnitario, item.subtotal, item.sabor2 || null, item.precoSabor2 || null,
          JSON.stringify(item.adicionaisEscolhidos || []), item.observacao || '')
      }

      return db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedidoId)
    },
    atualizar(dados) {
      const { id, ...rest } = dados
      const map = {
        tipoEntrega: 'tipo_entrega', nomeCliente: 'nome_cliente',
        formaPagamento: 'forma_pagamento', entregadorId: 'entregador_id',
      }
      const setCols = Object.keys(rest).map(k => `${map[k] || k} = ?`).join(', ')
      db.prepare(`UPDATE pedidos SET ${setCols}, atualizado_em = ? WHERE id = ?`)
        .run(...Object.values(rest), agora(), id)
      return db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id)
    },
    getById(id) {
      const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id)
      if (!pedido) return null
      return { ...pedido, itens: db.prepare('SELECT * FROM itens_pedido WHERE pedido_id = ?').all(id) }
    },
    dashboard() {
      const hoje = new Date().toISOString().split('T')[0]
      const receitaHoje = db.prepare(`
        SELECT COALESCE(SUM(total), 0) as total FROM pedidos
        WHERE date(criado_em) = ? AND status != 'cancelado'
      `).get(hoje)
      const pedidosAbertos = db.prepare(`
        SELECT COUNT(*) as count FROM pedidos WHERE status IN ('recebido', 'em_preparo', 'pronto')
      `).get()
      const pedidosHoje = db.prepare(`
        SELECT COUNT(*) as count FROM pedidos WHERE date(criado_em) = ? AND status != 'cancelado'
      `).get(hoje)
      const ticketMedio = db.prepare(`
        SELECT COALESCE(AVG(total), 0) as avg FROM pedidos
        WHERE date(criado_em) = ? AND status != 'cancelado'
      `).get(hoje)
      return {
        receitaHoje: receitaHoje.total,
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

      return db.prepare('SELECT * FROM menu_items WHERE id = ?').get(menuItemId)
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
      if (existente) return existente
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
    movimentacoes(sessaoId) {
      return db.prepare('SELECT * FROM caixa_movimentacoes WHERE sessao_id = ? ORDER BY criado_em DESC').all(sessaoId)
    },
    resumo(sessaoId) {
      const sessao = db.prepare('SELECT * FROM caixa_sessoes WHERE id = ?').get(sessaoId)
      const movs = db.prepare('SELECT * FROM caixa_movimentacoes WHERE sessao_id = ?').all(sessaoId)
      const totalVendas = movs.filter(m => m.tipo === 'venda').reduce((a, b) => a + b.valor, 0)
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
      const entradas = db.prepare(`
        SELECT COALESCE(SUM(valor), 0) as total FROM contas_receber
        WHERE status = 'recebido' AND recebido_em BETWEEN ? AND ?
      `).get(inicio, fim)
      const saidas = db.prepare(`
        SELECT COALESCE(SUM(valor), 0) as total FROM contas_pagar
        WHERE status = 'pago' AND pago_em BETWEEN ? AND ?
      `).get(inicio, fim)
      return { entradas: entradas.total, saidas: saidas.total, saldo: entradas.total - saidas.total }
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
    listar() {
      return db.prepare('SELECT * FROM entregadores WHERE ativo = 1 ORDER BY nome').all()
    },
    criar(dados) {
      const result = db.prepare(`
        INSERT INTO entregadores (nome, telefone, veiculo, ativo) VALUES (?, ?, ?, 1)
      `).run(dados.nome, dados.telefone || '', dados.veiculo || '')
      return db.prepare('SELECT * FROM entregadores WHERE id = ?').get(result.lastInsertRowid)
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
      return db.prepare(`
        SELECT ${groupBy} as periodo,
          COUNT(*) as total_pedidos,
          COALESCE(SUM(total), 0) as receita,
          COALESCE(AVG(total), 0) as ticket_medio
        FROM pedidos
        WHERE criado_em BETWEEN ? AND ? AND status != 'cancelado'
        GROUP BY ${groupBy}
        ORDER BY periodo
      `).all(inicio, fim)
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
  },

  // ── Config ──────────────────────────────────────────────────────────────────
  config: {
    get() {
      return db.prepare('SELECT * FROM configuracoes LIMIT 1').get()
    },
    update(dados) {
      const cfg = db.prepare('SELECT id FROM configuracoes LIMIT 1').get()
      if (cfg) {
        const cols = Object.keys(dados).map(k => `${k} = ?`).join(', ')
        db.prepare(`UPDATE configuracoes SET ${cols} WHERE id = ?`).run(...Object.values(dados), cfg.id)
      } else {
        const keys = Object.keys(dados).join(', ')
        const vals = Object.keys(dados).map(() => '?').join(', ')
        db.prepare(`INSERT INTO configuracoes (${keys}) VALUES (${vals})`).run(...Object.values(dados))
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
  impressao: {
    comanda(dados) {
      // Implementação futura com electron-pos-printer
      return { sucesso: true }
    },
    recibo(dados) {
      return { sucesso: true }
    },
  },
}

dbModule.getRawDb = () => db

module.exports = dbModule
