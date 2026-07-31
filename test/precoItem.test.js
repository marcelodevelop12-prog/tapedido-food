import { describe, it, expect } from 'vitest'
import {
  somaAdicionais, precoUnitarioItem, subtotalItem, somarCarrinho,
} from '../src/lib/precoItem.js'

describe('somaAdicionais', () => {
  it('soma o preco dos adicionais', () => {
    expect(somaAdicionais([{ nome: 'Bacon', preco: 4 }, { nome: 'Cheddar', preco: 3.5 }])).toBe(7.5)
  })

  it('trata adicional sem preco como gratis', () => {
    // Adicional so de instrucao — "ponto da carne", "sem gelo" — e cadastrado
    // com preco vazio no FormProduto e chega aqui como undefined ou string.
    expect(somaAdicionais([{ nome: 'Sem gelo' }, { nome: 'Ponto', preco: '' }])).toBe(0)
  })

  it('devolve zero para lista ausente', () => {
    expect(somaAdicionais(undefined)).toBe(0)
    expect(somaAdicionais(null)).toBe(0)
    expect(somaAdicionais([])).toBe(0)
  })
})

describe('precoUnitarioItem', () => {
  it('devolve o preco base quando nao ha adicionais', () => {
    expect(precoUnitarioItem(24.9, [])).toBe(24.9)
  })

  it('arredonda a soma para centavos', () => {
    // 0.1 + 0.2 em ponto flutuante da 0.30000000000000004. Sem arredondar, esse
    // residuo desce ate o subtotal do pedido e o caixa fecha um centavo fora.
    expect(precoUnitarioItem(0.1, [{ preco: 0.2 }])).toBe(0.3)
  })
})

describe('subtotalItem', () => {
  it('multiplica preco unitario pela quantidade', () => {
    expect(subtotalItem(10, [{ preco: 2 }], 3)).toBe(36)
  })

  it('aceita quantidade fracionaria (venda por kg)', () => {
    expect(subtotalItem(59.9, [], 0.347)).toBe(20.79)
  })

  it('devolve zero para quantidade ausente', () => {
    expect(subtotalItem(10, [], undefined)).toBe(0)
  })
})

describe('somarCarrinho', () => {
  it('soma os subtotais das linhas', () => {
    expect(somarCarrinho([{ subtotal: 15.4 }, { subtotal: 7.5 }, { subtotal: 0.1 }])).toBe(23)
  })

  it('devolve zero para carrinho vazio', () => {
    expect(somarCarrinho([])).toBe(0)
    expect(somarCarrinho(undefined)).toBe(0)
  })
})
