import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { abrirBancoLimpo } = require('./helpers/banco.js')

let ctx
beforeEach(() => { ctx = abrirBancoLimpo() })
afterEach(() => ctx.fechar())

function criarProduto(dados) {
  return ctx.db.produtos.criar({ nome: 'Produto', preco: 10, ...dados })
}

function pedidoCom(itens, extra = {}) {
  return ctx.db.pedidos.criar({
    tipoEntrega: 'entrega', nomeCliente: 'Cliente', itens, ...extra,
  })
}

function saldo(id) {
  return ctx.db.produtos.listar().find(p => p.id === id).estoque_atual
}

function movimentacoes(id) {
  return ctx.db.estoque.historico(id)
}

describe('baixa de estoque ao criar pedido', () => {
  it('desconta a quantidade vendida', () => {
    const p = criarProduto({ estoqueAtual: 10 })
    pedidoCom([{ menuItemId: p.id, nomeItem: p.nome, quantidade: 3, precoUnitario: 10 }])
    expect(saldo(p.id)).toBe(7)
  })

  it('registra saldo anterior e posterior na movimentacao', () => {
    // Sem os dois saldos gravados, uma divergencia futura entre historico e
    // estoque nao teria como ser auditada.
    const p = criarProduto({ estoqueAtual: 10 })
    pedidoCom([{ menuItemId: p.id, nomeItem: p.nome, quantidade: 4, precoUnitario: 10 }])

    const [mov] = movimentacoes(p.id)
    expect(mov.tipo).toBe('saida')
    expect(mov.quantidade).toBe(4)
    expect(mov.saldo_anterior).toBe(10)
    expect(mov.saldo_posterior).toBe(6)
    expect(mov.referencia_tipo).toBe('pedido')
  })

  it('soma as linhas do mesmo produto numa baixa so', () => {
    // Duas linhas do mesmo lanche com observacoes diferentes. Sem somar antes,
    // o indice unico recusaria a segunda e o estoque ficaria alto.
    const p = criarProduto({ estoqueAtual: 10 })
    pedidoCom([
      { menuItemId: p.id, nomeItem: p.nome, quantidade: 2, precoUnitario: 10, observacao: 'sem cebola' },
      { menuItemId: p.id, nomeItem: p.nome, quantidade: 3, precoUnitario: 10, observacao: 'bem passado' },
    ])
    expect(saldo(p.id)).toBe(5)
    expect(movimentacoes(p.id)).toHaveLength(1)
  })

  it('desconta cada produto do pedido', () => {
    const a = criarProduto({ nome: 'A', estoqueAtual: 10 })
    const b = criarProduto({ nome: 'B', estoqueAtual: 4 })
    pedidoCom([
      { menuItemId: a.id, nomeItem: 'A', quantidade: 2, precoUnitario: 10 },
      { menuItemId: b.id, nomeItem: 'B', quantidade: 1, precoUnitario: 10 },
    ])
    expect(saldo(a.id)).toBe(8)
    expect(saldo(b.id)).toBe(3)
  })

  it('nao deixa o saldo negativo', () => {
    const p = criarProduto({ estoqueAtual: 2 })
    pedidoCom([{ menuItemId: p.id, nomeItem: p.nome, quantidade: 5, precoUnitario: 10 }])
    expect(saldo(p.id)).toBe(0)
    expect(movimentacoes(p.id)[0].saldo_posterior).toBe(0)
  })

  it('aceita quantidade fracionaria (venda por kg)', () => {
    const p = criarProduto({ estoqueAtual: 5, unidade: 'kg' })
    pedidoCom([{ menuItemId: p.id, nomeItem: p.nome, quantidade: 0.75, precoUnitario: 40 }])
    expect(saldo(p.id)).toBeCloseTo(4.25, 5)
  })

  it('ignora item sem produto vinculado', () => {
    // Pedido antigo de mesa chegava sem menuItemId. Nao pode explodir.
    const pedido = pedidoCom([{ nomeItem: 'Item solto', quantidade: 1, precoUnitario: 10 }])
    expect(pedido.id).toBeTruthy()
  })

  it('ignora quantidade zero ou negativa', () => {
    const p = criarProduto({ estoqueAtual: 10 })
    pedidoCom([{ menuItemId: p.id, nomeItem: p.nome, quantidade: 0, precoUnitario: 10 }])
    expect(saldo(p.id)).toBe(10)
    expect(movimentacoes(p.id)).toHaveLength(0)
  })
})

describe('idempotencia da baixa', () => {
  it('dois pedidos iguais descontam duas vezes', () => {
    // Pedidos diferentes sao vendas diferentes, mesmo com os mesmos itens.
    const p = criarProduto({ estoqueAtual: 10 })
    const item = [{ menuItemId: p.id, nomeItem: p.nome, quantidade: 2, precoUnitario: 10 }]
    pedidoCom(item)
    pedidoCom(item)
    expect(saldo(p.id)).toBe(6)
  })

  it('o indice unico recusa a segunda baixa do mesmo pedido', () => {
    // Simula o eco do realtime: a mesma baixa chegando duas vezes para o mesmo
    // pedido. A garantia e do banco, nao do codigo.
    const p = criarProduto({ estoqueAtual: 10 })
    const pedido = pedidoCom([{ menuItemId: p.id, nomeItem: p.nome, quantidade: 3, precoUnitario: 10 }])
    expect(saldo(p.id)).toBe(7)

    expect(() => {
      ctx.db.getRawDb().prepare(`
        INSERT INTO estoque_movimentacoes
          (menu_item_id, tipo, quantidade, referencia_tipo, referencia_id, criado_em)
        VALUES (?, 'saida', 3, 'pedido', ?, ?)
      `).run(p.id, String(pedido.id), new Date().toISOString())
    }).toThrow(/UNIQUE/i)

    expect(saldo(p.id)).toBe(7)
  })

  it('entrada manual repetida continua permitida', () => {
    // `referencia_tipo` nulo fica fora do indice parcial: o lojista pode
    // lancar duas entradas iguais no mesmo dia.
    const p = criarProduto({ estoqueAtual: 0 })
    ctx.db.estoque.movimentar({ menuItemId: p.id, tipo: 'entrada', quantidade: 5 })
    ctx.db.estoque.movimentar({ menuItemId: p.id, tipo: 'entrada', quantidade: 5 })
    expect(saldo(p.id)).toBe(10)
  })
})

describe('custo congelado no item do pedido', () => {
  it('grava o custo do produto no momento da venda', () => {
    const p = criarProduto({ estoqueAtual: 10, custoUnitario: 4 })
    const pedido = pedidoCom([{ menuItemId: p.id, nomeItem: p.nome, quantidade: 1, precoUnitario: 10 }])

    const [item] = ctx.db.pedidos.getById(pedido.id).itens
    expect(item.custo_unitario).toBe(4)
  })

  it('mudanca de custo depois nao reescreve a venda passada', () => {
    // O motivo de a coluna existir: sem ela, o relatorio de lucro leria o custo
    // atual e uma alta do fornecedor apagaria o lucro de meses ja fechados.
    const p = criarProduto({ estoqueAtual: 10, custoUnitario: 4 })
    const pedido = pedidoCom([{ menuItemId: p.id, nomeItem: p.nome, quantidade: 1, precoUnitario: 10 }])

    ctx.db.produtos.atualizar({ id: p.id, custoUnitario: 9 })

    const [item] = ctx.db.pedidos.getById(pedido.id).itens
    expect(item.custo_unitario).toBe(4)
  })
})

describe('produto vindo do app do garcom', () => {
  it('traduz o UUID do Supabase para o id local', () => {
    // O garcom manda o id do Supabase. Sem a traducao, a venda de salao entra
    // no historico mas nao mexe no estoque — e nada indica o porque.
    const p = criarProduto({ estoqueAtual: 10 })
    const uuid = '11111111-2222-3333-4444-555555555555'
    ctx.db.getRawDb().prepare('UPDATE menu_items SET supabase_id = ? WHERE id = ?').run(uuid, p.id)

    pedidoCom([{ menu_item_id: uuid, nome_item: 'Produto', quantidade: 2, preco_unitario: 10 }],
      { tipoEntrega: 'mesa' })

    expect(saldo(p.id)).toBe(8)
  })

  it('UUID desconhecido nao derruba o pedido', () => {
    const pedido = pedidoCom([
      { menu_item_id: '99999999-9999-9999-9999-999999999999', nome_item: 'X', quantidade: 1, preco_unitario: 10 },
    ], { tipoEntrega: 'mesa' })
    expect(pedido.id).toBeTruthy()
  })
})
