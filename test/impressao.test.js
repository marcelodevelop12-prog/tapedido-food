import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { montarCupom, montarComanda, semAcento, linhaDupla, COLUNAS } =
  require('../electron/database/impressao.js')

const loja = { nome: 'Lanchonete do Ze', cidade: 'Nova Iguacu', estado: 'RJ' }

const pedido = {
  tipo: 'entrega',
  numeroPedido: 7,
  nomeCliente: 'Ana',
  total: 35,
  subtotal: 30,
  taxaEntrega: 5,
  formaPagamento: 'dinheiro',
  trocoPara: 50,
  itens: [
    { quantidade: 2, nomeItem: 'X-Burguer', subtotal: 30, observacao: 'sem cebola' },
  ],
}

describe('largura do papel', () => {
  it('respeita as colunas de cada papel', () => {
    expect(COLUNAS['58mm']).toBe(32)
    expect(COLUNAS['80mm']).toBe(48)
  })

  it('nenhuma linha estoura a largura do papel', () => {
    // Estourar a largura faz a impressora quebrar a linha no meio de um valor,
    // e o total sai partido em duas linhas.
    for (const largura of ['58mm', '80mm']) {
      const colunas = COLUNAS[largura]
      for (const linha of montarCupom(pedido, loja, colunas)) {
        expect(linha.texto.length).toBeLessThanOrEqual(colunas)
      }
    }
  })
})

describe('montarCupom', () => {
  it('alinha rotulo a esquerda e valor a direita', () => {
    const l = linhaDupla('TOTAL', 'R$ 35.00', 32)
    expect(l).toHaveLength(32)
    expect(l.startsWith('TOTAL')).toBe(true)
    expect(l.endsWith('R$ 35.00')).toBe(true)
  })

  it('mostra subtotal e taxa quando ha entrega', () => {
    const texto = montarCupom(pedido, loja, 48).map(l => l.texto).join('\n')
    expect(texto).toMatch(/Subtotal\s+R\$ 30\.00/)
    expect(texto).toMatch(/Taxa de entrega\s+R\$ 5\.00/)
    expect(texto).toMatch(/TOTAL\s+R\$ 35\.00/)
  })

  it('omite subtotal e taxa quando nao ha entrega', () => {
    // Cupom de mesa com "Taxa de entrega R$ 0,00" confunde o cliente.
    const semTaxa = { ...pedido, tipo: 'mesa', taxaEntrega: 0 }
    const texto = montarCupom(semTaxa, loja, 48).map(l => l.texto).join('\n')
    expect(texto).not.toMatch(/Taxa de entrega/)
    expect(texto).toMatch(/TOTAL/)
  })

  it('calcula o troco a partir do valor recebido', () => {
    const texto = montarCupom(pedido, loja, 48).map(l => l.texto).join('\n')
    expect(texto).toMatch(/Recebido\s+R\$ 50\.00/)
    expect(texto).toMatch(/Troco\s+R\$ 15\.00/)
  })

  it('nao mostra troco quando nao foi informado', () => {
    const semTroco = { ...pedido, trocoPara: null }
    const texto = montarCupom(semTroco, loja, 48).map(l => l.texto).join('\n')
    expect(texto).not.toMatch(/Troco/)
  })

  it('aceita itens em snake_case e em camelCase', () => {
    // O cupom e montado tanto a partir do SQLite (snake_case) quanto do que a
    // tela manda (camelCase). Ler so um formato deixaria o item sem nome.
    const misto = {
      ...pedido,
      itens: [
        { quantidade: 1, nome_item: 'Do banco', preco_unitario: 10 },
        { quantidade: 1, nomeItem: 'Da tela', precoUnitario: 20 },
      ],
    }
    const texto = montarCupom(misto, loja, 48).map(l => l.texto).join('\n')
    expect(texto).toContain('Do banco')
    expect(texto).toContain('Da tela')
  })

  it('deriva o subtotal do item quando so vem preco unitario', () => {
    const semSubtotal = {
      ...pedido,
      itens: [{ quantidade: 3, nomeItem: 'Coxinha', precoUnitario: 5 }],
    }
    const texto = montarCupom(semSubtotal, loja, 48).map(l => l.texto).join('\n')
    expect(texto).toMatch(/3x Coxinha\s+R\$ 15\.00/)
  })

  it('imprime a observacao do item', () => {
    const texto = montarCupom(pedido, loja, 48).map(l => l.texto).join('\n')
    expect(texto).toContain('sem cebola')
  })
})

describe('montarComanda', () => {
  it('nao mostra preco', () => {
    // A comanda vai para a cozinha: preco ali so polui.
    const texto = montarComanda(pedido, 48).map(l => l.texto).join('\n')
    expect(texto).not.toContain('R$')
    expect(texto).toContain('2x X-Burguer')
    expect(texto).toContain('sem cebola')
  })
})

describe('semAcento', () => {
  it('remove acentos sem perder a letra', () => {
    // Impressora termica generica nao tem tabela de acentos confiavel: o
    // acento vira caractere trocado no cupom do cliente.
    expect(semAcento('Preço Ação João Piauí')).toBe('Preco Acao Joao Piaui')
  })

  it('nao quebra com nulo', () => {
    expect(semAcento(null)).toBe('')
    expect(semAcento(undefined)).toBe('')
  })
})
