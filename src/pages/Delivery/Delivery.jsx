import React, { useEffect, useState } from 'react'
import { Plus, RefreshCw, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../../lib/api'
import { formatarMoeda, formatarHora, statusPedidoLabel, statusPedidoCor } from '../../lib/utils'
import NovoPedido from '../Pedidos/NovoPedido'

const PIPELINE = [
  { status: 'recebido', label: '📥 Recebido', proximo: 'em_preparo', acaoLabel: 'Iniciar Preparo' },
  { status: 'em_preparo', label: '👨‍🍳 Em Preparo', proximo: 'pronto', acaoLabel: 'Marcar Pronto' },
  { status: 'pronto', label: '✅ Pronto', proximo: 'saiu', acaoLabel: 'Saiu para Entrega' },
  { status: 'saiu', label: '🛵 Saiu', proximo: 'entregue', acaoLabel: 'Confirmar Entrega' },
]

export default function Delivery() {
  const [pedidos, setPedidos] = useState([])
  const [mostrarNovoPedido, setMostrarNovoPedido] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [filtro, setFiltro] = useState('ativos') // ativos, todos

  useEffect(() => { carregar() }, [])

  async function carregar() {
    try {
      const data = await api.pedidos.listar()
      setPedidos(data)
    } finally {
      setCarregando(false)
    }
  }

  async function avancarStatus(pedido) {
    const etapa = PIPELINE.find(p => p.status === pedido.status)
    if (!etapa) return

    try {
      await api.pedidos.atualizar({ id: pedido.id, status: etapa.proximo })
      setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, status: etapa.proximo } : p))
      toast.success(`Pedido #${pedido.numero_pedido} → ${statusPedidoLabel(etapa.proximo)}`)
    } catch {
      toast.error('Erro ao atualizar pedido')
    }
  }

  async function cancelar(pedido) {
    if (!confirm(`Cancelar pedido #${pedido.numero_pedido}?`)) return
    try {
      await api.pedidos.atualizar({ id: pedido.id, status: 'cancelado' })
      setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, status: 'cancelado' } : p))
      toast.success('Pedido cancelado')
    } catch {
      toast.error('Erro ao cancelar')
    }
  }

  const pedidosAtivos = pedidos.filter(p => !['entregue', 'cancelado'].includes(p.status))
  const pedidosFiltrados = filtro === 'ativos' ? pedidosAtivos : pedidos

  // Agrupar por coluna do pipeline
  const colunas = PIPELINE.map(etapa => ({
    ...etapa,
    pedidos: pedidosFiltrados.filter(p => p.status === etapa.status),
  }))

  return (
    <div className="space-y-4 fade-in h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Delivery</h2>
          <p className="text-sm text-gray-500">{pedidosAtivos.length} pedidos em andamento</p>
        </div>
        <div className="flex gap-2">
          <button onClick={carregar} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors" title="Atualizar">
            <RefreshCw size={16} className="text-gray-500" />
          </button>
          <div className="flex border border-gray-200 rounded-lg overflow-hidden">
            <button onClick={() => setFiltro('ativos')} className={`px-3 py-1.5 text-sm font-medium transition-colors ${filtro === 'ativos' ? 'bg-orange-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Ativos</button>
            <button onClick={() => setFiltro('todos')} className={`px-3 py-1.5 text-sm font-medium transition-colors ${filtro === 'todos' ? 'bg-orange-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Todos</button>
          </div>
          <button
            onClick={() => setMostrarNovoPedido(true)}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <Plus size={18} />
            Novo Pedido
          </button>
        </div>
      </div>

      {/* Kanban */}
      {carregando ? (
        <div className="flex gap-4">
          {PIPELINE.map(e => <div key={e.status} className="flex-1 bg-gray-100 rounded-xl h-64 animate-pulse" />)}
        </div>
      ) : (
        <div className="flex gap-4 flex-1 overflow-x-auto pb-2">
          {colunas.map(coluna => (
            <div key={coluna.status} className="flex-1 min-w-64 bg-gray-50 rounded-xl overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <span className="font-semibold text-gray-700 text-sm">{coluna.label}</span>
                <span className="bg-gray-200 text-gray-600 text-xs font-bold px-2 py-0.5 rounded-full">
                  {coluna.pedidos.length}
                </span>
              </div>
              <div className="flex-1 p-3 space-y-2 overflow-y-auto">
                {coluna.pedidos.length === 0 && (
                  <div className="text-center text-gray-300 text-sm py-8">Nenhum pedido</div>
                )}
                {coluna.pedidos.map(pedido => (
                  <CardPedido
                    key={pedido.id}
                    pedido={pedido}
                    etapa={coluna}
                    onAvancar={() => avancarStatus(pedido)}
                    onCancelar={() => cancelar(pedido)}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Coluna Entregues (só quando mostrando todos) */}
          {filtro === 'todos' && (
            <div className="flex-1 min-w-64 bg-green-50 rounded-xl overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-green-200 flex items-center justify-between">
                <span className="font-semibold text-green-700 text-sm">✅ Entregues</span>
                <span className="bg-green-200 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
                  {pedidos.filter(p => p.status === 'entregue').length}
                </span>
              </div>
              <div className="flex-1 p-3 space-y-2 overflow-y-auto">
                {pedidos.filter(p => p.status === 'entregue').map(pedido => (
                  <CardPedido key={pedido.id} pedido={pedido} etapa={null} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {mostrarNovoPedido && (
        <NovoPedido
          tipoInicial="entrega"
          onFechar={() => setMostrarNovoPedido(false)}
          onPedidoCriado={() => { setMostrarNovoPedido(false); carregar() }}
        />
      )}
    </div>
  )
}

function CardPedido({ pedido, etapa, onAvancar, onCancelar }) {
  const [expandido, setExpandido] = useState(false)
  const tempoDecorrido = Math.floor((Date.now() - new Date(pedido.criado_em).getTime()) / 60000)

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
      <div
        className="px-3 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpandido(!expandido)}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-xs font-bold text-gray-400">#{pedido.numero_pedido}</span>
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs text-gray-400">
                {pedido.tipo_entrega === 'entrega' ? '🛵' : pedido.tipo_entrega === 'mesa' ? '🪑' : '🏃'}
              </span>
            </div>
            <p className="font-semibold text-gray-800 text-sm">{pedido.nome_cliente || 'Cliente'}</p>
            {pedido.bairro_entrega && <p className="text-xs text-gray-400">{pedido.bairro_entrega}</p>}
          </div>
          <div className="text-right">
            <p className="font-bold text-orange-600 text-sm">{formatarMoeda(pedido.total)}</p>
            <div className="flex items-center gap-1 text-xs text-gray-400 justify-end mt-0.5">
              <Clock size={10} />
              <span>{tempoDecorrido}min</span>
            </div>
          </div>
        </div>
      </div>

      {expandido && (
        <div className="border-t border-gray-50 px-3 py-2 bg-gray-50">
          {(pedido.itens || []).map((item, i) => (
            <div key={i} className="flex justify-between text-xs text-gray-600 py-0.5">
              <span>{item.quantidade}x {item.nome_item}</span>
              <span>{formatarMoeda(item.subtotal)}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-100">
            <span className="text-xs text-gray-400">{pedido.forma_pagamento}</span>
            <span className="text-xs text-gray-300">·</span>
            <span className="text-xs text-gray-400">{formatarHora(pedido.criado_em)}</span>
          </div>
        </div>
      )}

      {etapa && onAvancar && (
        <div className="border-t border-gray-100 px-3 py-2 flex gap-2">
          <button
            onClick={onAvancar}
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium py-1.5 rounded-lg transition-colors"
          >
            {etapa.acaoLabel}
          </button>
          {onCancelar && (
            <button
              onClick={onCancelar}
              className="px-2 py-1.5 text-red-400 hover:bg-red-50 rounded-lg text-xs transition-colors"
            >
              Cancelar
            </button>
          )}
        </div>
      )}
    </div>
  )
}
