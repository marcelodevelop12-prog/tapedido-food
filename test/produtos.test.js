import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { abrirBancoLimpo } = require('./helpers/banco.js')

let ctx
beforeEach(() => { ctx = abrirBancoLimpo() })
afterEach(() => ctx.fechar())

describe('produtos.atualizar (editar produto ja cadastrado)', () => {
  function novoProduto(overrides = {}) {
    return ctx.db.produtos.criar({
      nome: 'X-Burguer', categoria: 'Lanches', preco: 18, custoUnitario: 7.5,
      unidade: 'un', estoqueAtual: 10, estoqueMinimo: 3, codigoBarras: '',
      imagem: '', ...overrides,
    })
  }

  it('edita nome, categoria, preco, custo, unidade, estoque minimo e codigo de barras', () => {
    const produto = novoProduto()

    const editado = ctx.db.produtos.atualizar({
      id: produto.id,
      nome: 'X-Burguer Especial',
      categoria: 'Pratos',
      preco: 22.5,
      custoUnitario: 9,
      unidade: 'kg',
      estoqueMinimo: 5,
      codigoBarras: '7891000315507',
    })

    expect(editado.nome).toBe('X-Burguer Especial')
    expect(editado.categoria).toBe('Pratos')
    expect(editado.preco).toBe(22.5)
    expect(editado.custo_unitario).toBe(9)
    expect(editado.unidade).toBe('kg')
    expect(editado.estoque_minimo).toBe(5)
    expect(editado.codigo_barras).toBe('7891000315507')
  })

  it('edicao parcial nao apaga campos que nao foram enviados', () => {
    // FormProduto manda o formulario inteiro, mas o backend so deve tocar no
    // que veio em `dados` — outra tela que edite so um campo (ex: so o preco)
    // nao pode zerar o resto do cadastro.
    const produto = novoProduto({ nome: 'X-Bacon', preco: 20 })

    const editado = ctx.db.produtos.atualizar({ id: produto.id, preco: 25 })

    expect(editado.preco).toBe(25)
    expect(editado.nome).toBe('X-Bacon')
    expect(editado.categoria).toBe('Lanches')
    expect(editado.custo_unitario).toBe(7.5)
  })

  it('edicao persiste e e refletida na listagem', () => {
    const produto = novoProduto()
    ctx.db.produtos.atualizar({ id: produto.id, nome: 'Nome Novo' })

    const listado = ctx.db.produtos.listar().find(p => p.id === produto.id)
    expect(listado.nome).toBe('Nome Novo')
  })

  it('edita a imagem do produto', () => {
    const produto = novoProduto({ imagem: '' })
    const editado = ctx.db.produtos.atualizar({ id: produto.id, imagem: 'file:///C:/imgs/x.jpg' })
    expect(editado.imagem).toBe('file:///C:/imgs/x.jpg')
  })
})
