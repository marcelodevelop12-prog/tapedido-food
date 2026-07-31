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
    // O PDV grava 'pix'/'debito'; o app do garcom grava 'PIX'/'Débito'. Sem
    // normalizar, o valor entrava como forma desconhecida e sumia do total da
    // sessao sem aviso nenhum ao lojista.
    ctx.db.caixa.registrarVenda({ valor: 10, formaPagamento: 'PIX', descricao: 'a' })
    ctx.db.caixa.registrarVenda({ valor: 20, formaPagamento: 'Débito', descricao: 'b' })
    ctx.db.caixa.registrarVenda({ valor: 30, formaPagamento: 'cartao de credito', descricao: 'c' })
    const s = ctx.db.caixa.sessaoAtual()
    expect(s.total_pix).toBe(10)
    expect(s.total_debito).toBe(20)
    expect(s.total_credito).toBe(30)
  })

  it('avisa quando a forma de pagamento nao entra em nenhum total', () => {
    // Grava a movimentacao mas nao soma em coluna nenhuma. O aviso existe para
    // a tela mostrar: antes isso so ia para o console e o caixa fechava sem
    // bater, sem explicacao.
    const r = ctx.db.caixa.registrarVenda({ valor: 25, formaPagamento: 'vale refeicao' })
    expect(r.aviso).toMatch(/não entra no total/)
    const s = ctx.db.caixa.sessaoAtual()
    expect(s.total_dinheiro + s.total_pix + s.total_debito + s.total_credito).toBe(0)
  })

  it('nao lanca a mesma venda duas vezes quando ha refExterna', () => {
    // Defesa contra o eco do realtime do app do garcom: o PDV fecha a mesa e o
    // evento volta pelo canal, tentando lancar de novo.
    ctx.db.caixa.registrarVenda({ valor: 40, formaPagamento: 'dinheiro', refExterna: 'comanda:abc' })
    const segunda = ctx.db.caixa.registrarVenda({ valor: 40, formaPagamento: 'dinheiro', refExterna: 'comanda:abc' })
    expect(segunda.duplicada).toBe(true)
    expect(ctx.db.caixa.sessaoAtual().total_dinheiro).toBe(40)
  })

  it('lanca vendas distintas com referencias distintas', () => {
    ctx.db.caixa.registrarVenda({ valor: 10, formaPagamento: 'dinheiro', refExterna: 'comanda:a' })
    ctx.db.caixa.registrarVenda({ valor: 15, formaPagamento: 'dinheiro', refExterna: 'comanda:b' })
    expect(ctx.db.caixa.sessaoAtual().total_dinheiro).toBe(25)
  })

  it('recusa lancamento com o caixa fechado', () => {
    const outro = abrirBancoLimpo() // sem abrir caixa
    const r = outro.db.caixa.registrarVenda({ valor: 10, formaPagamento: 'pix' })
    expect(r.erro).toMatch(/Nenhum caixa aberto/)
    outro.fechar()
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
