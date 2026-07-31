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
