import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import NovoPedido from '../Pedidos/NovoPedido'

// Tela dedicada do balcao: cardapio, carrinho e pagamento. O pedido criado
// aqui cai na mesma tabela que a esteira de Pedidos le — nao ha caminho de
// dados separado, so navegacao separada.
export default function PDV() {
  const navigate = useNavigate()
  // Remonta o NovoPedido a cada venda concluida: e o jeito de zerar carrinho e
  // dados do cliente sem tirar o balconista da tela pra atender o proximo.
  const [chave, setChave] = useState(0)

  return (
    <NovoPedido
      key={chave}
      tipoInicial="balcao"
      onFechar={() => navigate('/dashboard')}
      onPedidoCriado={() => setChave(c => c + 1)}
    />
  )
}
