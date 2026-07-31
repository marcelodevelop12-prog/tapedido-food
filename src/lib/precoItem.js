// O preco de um item de pedido nasce de duas partes: o preco do produto no
// cardapio e os adicionais que o cliente escolheu. A conta vive aqui, fora da
// tela, porque e conta de dinheiro e precisa de teste — componente React nao e
// testavel sob o runtime atual (ver "Armadilhas" no CLAUDE.md).

// Dinheiro em ponto flutuante acumula sujeira: 12.90 + 2.50 dá 15.400000000000002,
// e tres desses num pedido viram um centavo de diferenca entre o cupom e o caixa.
// Toda saida daqui volta arredondada para centavos.
function centavos(valor) {
  return Math.round(valor * 100) / 100
}

/** Soma o preco dos adicionais escolhidos. Adicional sem preco vale zero. */
export function somaAdicionais(adicionais) {
  if (!Array.isArray(adicionais)) return 0
  return centavos(adicionais.reduce((total, a) => total + (Number(a?.preco) || 0), 0))
}

/** Preco de uma unidade do item, ja com os adicionais. */
export function precoUnitarioItem(precoBase, adicionais) {
  return centavos((Number(precoBase) || 0) + somaAdicionais(adicionais))
}

/**
 * Subtotal da linha do carrinho.
 * `quantidade` pode ser fracionaria — produto vendido por kg usa o peso aqui.
 */
export function subtotalItem(precoBase, adicionais, quantidade) {
  return centavos(precoUnitarioItem(precoBase, adicionais) * (Number(quantidade) || 0))
}

/** Total do carrinho a partir dos subtotais ja calculados das linhas. */
export function somarCarrinho(itens) {
  if (!Array.isArray(itens)) return 0
  return centavos(itens.reduce((total, i) => total + (Number(i?.subtotal) || 0), 0))
}
