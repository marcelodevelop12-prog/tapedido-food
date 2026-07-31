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
