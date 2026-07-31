import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { abrirBancoLimpo } = require('./helpers/banco.js')

let ctx
beforeEach(() => { ctx = abrirBancoLimpo() })
afterEach(() => ctx.fechar())

const periodo = () => {
  const fim = new Date()
  const inicio = new Date(); inicio.setDate(inicio.getDate() - 7)
  return { inicio: inicio.toISOString(), fim: fim.toISOString() }
}

describe('relatorios.vendas nao duplica venda de mesa', () => {
  it('conta a venda de salao uma vez so', () => {
    // Mesma armadilha do dashboard: fechar mesa lanca no caixa E cria um pedido
    // tipo 'mesa'. O relatorio soma as duas fontes, entao a query de pedidos
    // precisa excluir 'mesa'. Ate 31/07/2026 nao excluia, e o relatorio mostrava
    // o dobro de toda venda de salao.
    ctx.db.caixa.abrir({ valorInicial: 0 })
    ctx.db.caixa.registrarVenda({ valor: 60, formaPagamento: 'dinheiro', refExterna: 'comanda:1' })
    ctx.db.pedidos.criar({
      tipoEntrega: 'mesa', subtotal: 60, total: 60, status: 'entregue', itens: [],
    })

    const soma = ctx.db.relatorios.vendas(periodo()).reduce((a, l) => a + l.receita, 0)
    expect(soma).toBe(60)
  })

  it('soma delivery e mesa sem duplicar', () => {
    ctx.db.caixa.abrir({ valorInicial: 0 })
    ctx.db.caixa.registrarVenda({ valor: 60, formaPagamento: 'dinheiro', refExterna: 'comanda:1' })
    ctx.db.pedidos.criar({ tipoEntrega: 'mesa', subtotal: 60, total: 60, status: 'entregue', itens: [] })
    ctx.db.pedidos.criar({ tipoEntrega: 'entrega', subtotal: 40, total: 40, itens: [] })

    const soma = ctx.db.relatorios.vendas(periodo()).reduce((a, l) => a + l.receita, 0)
    expect(soma).toBe(100)
  })
})

describe('relatorios.custoLucro', () => {
  function vender(nome, { preco, custo, quantidade = 1, tipoEntrega = 'entrega' }) {
    const p = ctx.db.produtos.criar({ nome, preco, custoUnitario: custo, estoqueAtual: 100 })
    ctx.db.pedidos.criar({
      tipoEntrega, subtotal: preco * quantidade, total: preco * quantidade,
      itens: [{ menuItemId: p.id, nomeItem: nome, quantidade, precoUnitario: preco, subtotal: preco * quantidade }],
    })
    return p
  }

  it('calcula lucro e margem por produto', () => {
    vender('X-Burguer', { preco: 20, custo: 8, quantidade: 3 })

    const { itens } = ctx.db.relatorios.custoLucro(periodo())
    const burguer = itens.find(i => i.nome_item === 'X-Burguer')
    expect(burguer.receita).toBe(60)
    expect(burguer.custo).toBe(24)
    expect(burguer.lucro).toBe(36)
    expect(burguer.margem).toBeCloseTo(60, 5)
  })

  it('soma os totais do periodo', () => {
    vender('A', { preco: 20, custo: 8 })
    vender('B', { preco: 10, custo: 2 })

    const { totais } = ctx.db.relatorios.custoLucro(periodo())
    expect(totais.receita).toBe(30)
    expect(totais.custo).toBe(10)
    expect(totais.lucro).toBe(20)
  })

  it('usa o custo congelado, nao o custo atual do produto', () => {
    // A razao de o relatorio existir assim. Se lesse o cadastro, uma alta do
    // fornecedor reescreveria o lucro de meses ja fechados.
    const p = vender('Frango', { preco: 30, custo: 10 })
    ctx.db.produtos.atualizar({ id: p.id, custoUnitario: 25 })

    const { itens } = ctx.db.relatorios.custoLucro(periodo())
    expect(itens.find(i => i.nome_item === 'Frango').custo).toBe(10)
  })

  it('inclui venda de mesa', () => {
    // Diferente de vendas(): itens de mesa estao so em itens_pedido, nao ha
    // segunda fonte, entao nao ha o que duplicar.
    vender('Prato Feito', { preco: 25, custo: 9, tipoEntrega: 'mesa' })

    const { itens } = ctx.db.relatorios.custoLucro(periodo())
    expect(itens.find(i => i.nome_item === 'Prato Feito').lucro).toBe(16)
  })

  it('marca produto sem custo cadastrado', () => {
    // Sem custo, lucro sai igual a receita — o que e mentira. A tela precisa
    // avisar em vez de mostrar o numero seco.
    vender('Sem custo', { preco: 15, custo: 0 })

    const { itens, totais } = ctx.db.relatorios.custoLucro(periodo())
    expect(itens.find(i => i.nome_item === 'Sem custo').semCusto).toBe(true)
    expect(totais.produtosSemCusto).toBe(1)
  })

  it('ignora pedido cancelado', () => {
    const p = ctx.db.produtos.criar({ nome: 'Cancelado', preco: 20, custoUnitario: 5, estoqueAtual: 10 })
    const pedido = ctx.db.pedidos.criar({
      tipoEntrega: 'entrega', subtotal: 20, total: 20,
      itens: [{ menuItemId: p.id, nomeItem: 'Cancelado', quantidade: 1, precoUnitario: 20, subtotal: 20 }],
    })
    ctx.db.pedidos.atualizar({ id: pedido.id, status: 'cancelado' })

    expect(ctx.db.relatorios.custoLucro(periodo()).totais.receita).toBe(0)
  })

  it('devolve totais zerados sem vendas', () => {
    const { itens, totais } = ctx.db.relatorios.custoLucro(periodo())
    expect(itens).toEqual([])
    expect(totais.receita).toBe(0)
    expect(totais.margem).toBe(0)
  })
})

describe('categorias', () => {
  it('ja vem semeada com as categorias que eram fixas no codigo', () => {
    const nomes = ctx.db.categorias.listar().map(c => c.nome)
    expect(nomes).toContain('Lanches')
    expect(nomes).toContain('Bebidas')
  })

  it('renomear reescreve a categoria dos produtos', () => {
    // menu_items.categoria guarda o NOME. Sem reescrever, o produto apontaria
    // para uma categoria inexistente e sumiria dos filtros do cardapio.
    const cat = ctx.db.categorias.listar().find(c => c.nome === 'Lanches')
    const p = ctx.db.produtos.criar({ nome: 'X-Tudo', preco: 25, categoria: 'Lanches' })

    ctx.db.categorias.atualizar({ id: cat.id, nome: 'Sanduiches' })

    const atualizado = ctx.db.produtos.listar().find(x => x.id === p.id)
    expect(atualizado.categoria).toBe('Sanduiches')
  })

  it('recusa remover categoria em uso', () => {
    const cat = ctx.db.categorias.listar().find(c => c.nome === 'Bebidas')
    ctx.db.produtos.criar({ nome: 'Coca', preco: 6, categoria: 'Bebidas' })

    const r = ctx.db.categorias.deletar(cat.id)
    expect(r.sucesso).toBe(false)
    expect(r.erro).toMatch(/produto/i)
    expect(ctx.db.categorias.listar().some(c => c.id === cat.id)).toBe(true)
  })

  it('remove categoria vazia', () => {
    const cat = ctx.db.categorias.listar().find(c => c.nome === 'Outros')
    expect(ctx.db.categorias.deletar(cat.id).sucesso).toBe(true)
    expect(ctx.db.categorias.listar().some(c => c.id === cat.id)).toBe(false)
  })

  it('nova categoria entra no fim da lista', () => {
    const antes = ctx.db.categorias.listar()
    const nova = ctx.db.categorias.criar({ nome: 'Porcoes', icone: '🍟' })
    expect(nova.ordem).toBeGreaterThan(Math.max(...antes.map(c => c.ordem)))
  })
})
