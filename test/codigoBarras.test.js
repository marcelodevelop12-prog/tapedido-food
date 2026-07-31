import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { abrirBancoLimpo } = require('./helpers/banco.js')

let ctx
beforeEach(() => { ctx = abrirBancoLimpo() })
afterEach(() => ctx.fechar())

describe('produtos.buscarPorCodigoBarras', () => {
  it('encontra o produto pelo codigo', () => {
    ctx.db.produtos.criar({ nome: 'Coca 2L', preco: 12, codigoBarras: '7894900011517' })
    const achado = ctx.db.produtos.buscarPorCodigoBarras('7894900011517')
    expect(achado?.nome).toBe('Coca 2L')
  })

  it('ignora espacos ao redor do codigo', () => {
    // Alguns leitores mandam espaco ou tab junto do codigo.
    ctx.db.produtos.criar({ nome: 'Agua', preco: 3, codigoBarras: '7891000315507' })
    expect(ctx.db.produtos.buscarPorCodigoBarras('  7891000315507 ')?.nome).toBe('Agua')
  })

  it('devolve null para codigo nao cadastrado', () => {
    expect(ctx.db.produtos.buscarPorCodigoBarras('0000000000000')).toBeNull()
  })

  it('devolve null para codigo vazio', () => {
    // Sem esta guarda, produtos com codigo_barras vazio (o padrao do
    // FormProduto) casariam com uma leitura em branco.
    ctx.db.produtos.criar({ nome: 'Sem codigo', preco: 5 })
    expect(ctx.db.produtos.buscarPorCodigoBarras('')).toBeNull()
    expect(ctx.db.produtos.buscarPorCodigoBarras(null)).toBeNull()
    expect(ctx.db.produtos.buscarPorCodigoBarras(undefined)).toBeNull()
  })

  it('encontra produto desativado', () => {
    // De proposito: quem chama precisa distinguir "nao cadastrado" de
    // "cadastrado porem desativado" — sao problemas diferentes para o lojista.
    const p = ctx.db.produtos.criar({ nome: 'Fora de linha', preco: 9, codigoBarras: '111222333' })
    ctx.db.produtos.toggleDisponivel(p.id)
    const achado = ctx.db.produtos.buscarPorCodigoBarras('111222333')
    expect(achado?.nome).toBe('Fora de linha')
    expect(achado.disponivel).toBe(0)
  })
})
