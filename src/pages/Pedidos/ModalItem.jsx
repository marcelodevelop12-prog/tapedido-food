import React, { useEffect, useState } from 'react'
import { X, Plus, Minus, Check } from 'lucide-react'
import { formatarMoeda } from '../../lib/utils'
import { precoUnitarioItem, subtotalItem } from '../../lib/precoItem'

// Observacoes que o balcao repete o dia inteiro. Um toque em vez de digitar —
// no horario de pico ninguem para para escrever "sem cebola".
const OBSERVACOES_RAPIDAS = [
  'Sem cebola', 'Sem salada', 'Sem molho', 'Bem passado', 'Capricha', 'Para viagem',
]

/**
 * Escolha de adicionais e observacao de um item, antes de ele entrar no
 * carrinho ou quando o operador clica para corrigir uma linha ja adicionada.
 *
 * Nao recebe o produto inteiro de proposito: pizza meio a meio nao tem um
 * produto unico, e o preco base dela e o do sabor mais caro. Quem chama resolve
 * de onde vem o preco.
 */
export default function ModalItem({
  nome,
  precoBase,
  adicionaisDisponiveis = [],
  itemInicial = null,
  // Item vendido por peso ja veio da balanca: um contador de unidades aqui
  // apagaria a pesagem.
  permiteQuantidade = true,
  onConfirmar,
  onFechar,
}) {
  const [quantidade, setQuantidade] = useState(itemInicial?.quantidade || 1)
  const [observacao, setObservacao] = useState(itemInicial?.observacao || '')
  const [escolhidos, setEscolhidos] = useState(() =>
    (itemInicial?.adicionaisEscolhidos || []).map(a => a.nome)
  )

  useEffect(() => {
    function aoTeclar(e) { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  const adicionais = adicionaisDisponiveis.filter(a => escolhidos.includes(a.nome))
  const precoUnitario = precoUnitarioItem(precoBase, adicionais)
  const subtotal = subtotalItem(precoBase, adicionais, quantidade)

  function alternarAdicional(nomeAdicional) {
    setEscolhidos(prev => prev.includes(nomeAdicional)
      ? prev.filter(n => n !== nomeAdicional)
      : [...prev, nomeAdicional])
  }

  // A observacao rapida entra e sai da lista separada por virgula, para o
  // operador poder combinar duas e ainda digitar o resto na mao.
  function alternarObservacaoRapida(texto) {
    setObservacao(atual => {
      const partes = atual.split(',').map(s => s.trim()).filter(Boolean)
      const i = partes.indexOf(texto)
      if (i >= 0) partes.splice(i, 1)
      else partes.push(texto)
      return partes.join(', ')
    })
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">

        <div className="flex items-center justify-between p-5 border-b shrink-0">
          <div className="min-w-0">
            <h3 className="font-bold text-gray-800 truncate">{nome}</h3>
            <p className="text-xs text-gray-400">{formatarMoeda(precoBase)} un</p>
          </div>
          <button onClick={onFechar} className="p-1 hover:bg-gray-100 rounded-lg shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {adicionaisDisponiveis.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Adicionais</label>
              <div className="space-y-2">
                {adicionaisDisponiveis.map(a => {
                  const marcado = escolhidos.includes(a.nome)
                  return (
                    <button
                      key={a.nome}
                      onClick={() => alternarAdicional(a.nome)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 border-2 rounded-xl text-left transition-colors ${
                        marcado ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-orange-300'
                      }`}
                    >
                      <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                        marcado ? 'bg-orange-500 text-white' : 'border-2 border-gray-300'
                      }`}>
                        {marcado && <Check size={13} strokeWidth={3} />}
                      </span>
                      <span className="flex-1 text-sm font-medium text-gray-800">{a.nome}</span>
                      <span className={`text-sm font-semibold ${Number(a.preco) > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                        {Number(a.preco) > 0 ? `+ ${formatarMoeda(a.preco)}` : 'Grátis'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Observação</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {OBSERVACOES_RAPIDAS.map(o => {
                const ativa = observacao.split(',').map(s => s.trim()).includes(o)
                return (
                  <button
                    key={o}
                    onClick={() => alternarObservacaoRapida(o)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      ativa ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-600'
                    }`}
                  >
                    {o}
                  </button>
                )
              })}
            </div>
            <textarea
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              placeholder="Ex.: sem cebola, ponto da carne, trocar a bebida..."
              rows={2}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
            />
          </div>

          <div className={`flex items-center justify-between ${permiteQuantidade ? '' : 'hidden'}`}>
            <label className="text-sm font-semibold text-gray-700">Quantidade</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQuantidade(q => Math.max(1, q - 1))}
                className="w-9 h-9 rounded-full bg-gray-100 hover:bg-red-100 hover:text-red-600 flex items-center justify-center transition-colors"
              >
                <Minus size={15} />
              </button>
              <span className="text-lg font-bold w-8 text-center">{quantidade}</span>
              <button
                onClick={() => setQuantidade(q => q + 1)}
                className="w-9 h-9 rounded-full bg-orange-100 hover:bg-orange-200 flex items-center justify-center transition-colors"
              >
                <Plus size={15} />
              </button>
            </div>
          </div>

        </div>

        <div className="shrink-0 border-t p-5 space-y-3">
          {/* Sempre visivel: se aparecesse so depois do primeiro adicional, o
              rodape cresceria e empurraria a lista para cima no meio do toque. */}
          <div className="flex justify-between text-xs text-gray-500">
            <span>
              {precoUnitario !== precoBase
                ? `${formatarMoeda(precoBase)} + adicionais`
                : 'Preço unitário'}
            </span>
            <span>{formatarMoeda(precoUnitario)} un</span>
          </div>
          <button
            onClick={() => onConfirmar({
              quantidade,
              observacao: observacao.trim(),
              adicionais,
            })}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-xl font-bold transition-colors"
          >
            {itemInicial ? 'Salvar' : 'Adicionar'} — {formatarMoeda(subtotal)}
          </button>
        </div>

      </div>
    </div>
  )
}
