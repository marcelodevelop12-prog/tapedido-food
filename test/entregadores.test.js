import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { abrirBancoLimpo } = require('./helpers/banco.js')

let ctx
beforeEach(() => { ctx = abrirBancoLimpo() })
afterEach(() => ctx.fechar())

describe('cadastro de entregadores', () => {
  it('cria com placa e veiculo', () => {
    const e = ctx.db.entregadores.criar({
      nome: 'Carlos', telefone: '21999990000', veiculo: 'Moto CG 160', placa: 'KXR-2B18',
    })
    expect(e.nome).toBe('Carlos')
    expect(e.placa).toBe('KXR-2B18')
    expect(e.ativo).toBe(1)
  })

  it('lista so os ativos por padrao', () => {
    const a = ctx.db.entregadores.criar({ nome: 'Ativo' })
    ctx.db.entregadores.criar({ nome: 'Saiu' })
    ctx.db.entregadores.deletar(ctx.db.entregadores.listar().find(e => e.nome === 'Saiu').id)

    const ativos = ctx.db.entregadores.listar()
    expect(ativos.map(e => e.nome)).toEqual(['Ativo'])
    expect(ativos[0].id).toBe(a.id)
  })

  it('inclui os inativos quando pedido', () => {
    ctx.db.entregadores.criar({ nome: 'Ativo' })
    const fora = ctx.db.entregadores.criar({ nome: 'Saiu' })
    ctx.db.entregadores.deletar(fora.id)

    expect(ctx.db.entregadores.listar(true)).toHaveLength(2)
  })

  it('desativar preserva o nome no historico do pedido', () => {
    // O motivo de nao apagar a linha: `pedidos.entregador_id` aponta para ca.
    // Apagar faria o pedido antigo perder quem entregou.
    const e = ctx.db.entregadores.criar({ nome: 'Carlos' })
    const pedido = ctx.db.pedidos.criar({
      tipoEntrega: 'entrega', nomeCliente: 'Cliente', itens: [],
    })
    ctx.db.pedidos.atualizar({ id: pedido.id, entregadorId: e.id })

    ctx.db.entregadores.deletar(e.id)

    const aindaExiste = ctx.db.entregadores.listar(true).find(x => x.id === e.id)
    expect(aindaExiste.nome).toBe('Carlos')
    expect(aindaExiste.ativo).toBe(0)
    expect(ctx.db.pedidos.getById(pedido.id).entregador_id).toBe(e.id)
  })

  it('reativa quem voltou', () => {
    const e = ctx.db.entregadores.criar({ nome: 'Carlos' })
    ctx.db.entregadores.deletar(e.id)
    ctx.db.entregadores.atualizar({ id: e.id, ativo: 1 })
    expect(ctx.db.entregadores.listar()).toHaveLength(1)
  })

  it('descarta campo fora da whitelist', () => {
    const e = ctx.db.entregadores.criar({ nome: 'Carlos' })
    const r = ctx.db.entregadores.atualizar({ id: e.id, nome: 'Carlos Jr', comissao: 999 })
    expect(r.nome).toBe('Carlos Jr')
    expect(r.comissao).toBeUndefined()
  })
})

describe('status_alterado_em', () => {
  function novoPedido() {
    return ctx.db.pedidos.criar({ tipoEntrega: 'entrega', nomeCliente: 'Cliente', itens: [] })
  }

  it('e carimbado quando o status muda', () => {
    const p = novoPedido()
    const atualizado = ctx.db.pedidos.atualizar({ id: p.id, status: 'em_preparo' })
    expect(atualizado.status_alterado_em).toBeTruthy()
  })

  it('nao e carimbado quando so o entregador muda', () => {
    // E o que separa este campo de `atualizado_em`: trocar o entregador nao
    // pode zerar o cronometro da etapa no kanban.
    const p = novoPedido()
    const comStatus = ctx.db.pedidos.atualizar({ id: p.id, status: 'pronto' })
    const marco = comStatus.status_alterado_em

    const so = ctx.db.pedidos.atualizar({ id: p.id, entregadorId: 1 })
    expect(so.status_alterado_em).toBe(marco)
  })
})
