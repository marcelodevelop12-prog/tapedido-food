import React, { useEffect, useState } from 'react'
import { Plus, X, Users, Clock, DollarSign } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../../lib/api'
import { formatarMoeda, formatarHora } from '../../lib/utils'
import NovoPedido from '../Pedidos/NovoPedido'

const COR_STATUS = {
  livre: { bg: 'bg-green-100 border-green-300', text: 'text-green-700', label: 'Livre', dot: 'bg-green-500' },
  ocupada: { bg: 'bg-red-100 border-red-300', text: 'text-red-700', label: 'Ocupada', dot: 'bg-red-500' },
  conta_pedida: { bg: 'bg-yellow-100 border-yellow-300', text: 'text-yellow-700', label: 'Conta Pedida', dot: 'bg-yellow-500' },
}

export default function Mesas() {
  const [mesas, setMesas] = useState([])
  const [comandas, setComandas] = useState([])
  const [mesaSelecionada, setMesaSelecionada] = useState(null)
  const [comandaAtiva, setComandaAtiva] = useState(null)
  const [mostrarNovoPedido, setMostrarNovoPedido] = useState(false)
  const [mostrarNovasMesas, setMostrarNovasMesas] = useState(false)
  const [novasMesas, setNovasMesas] = useState({ quantidade: 1, capacidade: 4 })
  const [carregando, setCarregando] = useState(true)

  useEffect(() => { carregar() }, [])

  async function carregar() {
    try {
      const [m, c] = await Promise.all([api.mesas.listar(), api.comandas.listarAbertas()])
      setMesas(m)
      setComandas(c)
    } finally {
      setCarregando(false)
    }
  }

  async function abrirMesa(mesa) {
    if (mesa.status === 'livre') {
      try {
        const comanda = await api.comandas.abrir(mesa.id)
        setMesas(prev => prev.map(m => m.id === mesa.id ? { ...m, status: 'ocupada' } : m))
        setComandaAtiva(comanda)
        setMesaSelecionada(mesa)
        setMostrarNovoPedido(true)
      } catch {
        toast.error('Erro ao abrir mesa')
      }
    } else {
      const comanda = comandas.find(c => c.mesa_id === mesa.id)
      setComandaAtiva(comanda || null)
      setMesaSelecionada(mesa)
    }
  }

  async function fecharConta(mesa) {
    if (!confirm(`Fechar conta da ${mesa.nome || `Mesa ${mesa.numero}`}?`)) return
    try {
      const comanda = comandas.find(c => c.mesa_id === mesa.id)
      if (comanda) {
        await api.comandas.fechar(comanda.id)
        setMesas(prev => prev.map(m => m.id === mesa.id ? { ...m, status: 'livre' } : m))
        setComandas(prev => prev.filter(c => c.id !== comanda.id))
        toast.success('Conta fechada!')
        setMesaSelecionada(null)
        setComandaAtiva(null)
      }
    } catch {
      toast.error('Erro ao fechar conta')
    }
  }

  async function criarMesas() {
    try {
      for (let i = 1; i <= novasMesas.quantidade; i++) {
        const maxNum = Math.max(...mesas.map(m => m.numero), 0)
        await api.mesas.criar({ numero: maxNum + i, capacidade: novasMesas.capacidade })
      }
      await carregar()
      setMostrarNovasMesas(false)
      toast.success('Mesa(s) criada(s)!')
    } catch {
      toast.error('Erro ao criar mesa')
    }
  }

  const comandaPorMesa = (mesaId) => comandas.find(c => c.mesa_id === mesaId)

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Mesas</h2>
          <p className="text-sm text-gray-500">
            {mesas.filter(m => m.status === 'ocupada').length} ocupadas · {mesas.filter(m => m.status === 'livre').length} livres
          </p>
        </div>
        <button
          onClick={() => setMostrarNovasMesas(true)}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          <Plus size={18} />
          Nova Mesa
        </button>
      </div>

      {/* Legenda */}
      <div className="flex gap-4 text-sm">
        {Object.entries(COR_STATUS).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${v.dot}`} />
            <span className="text-gray-600">{v.label}</span>
          </div>
        ))}
      </div>

      {/* Grid de mesas */}
      {carregando ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
          {Array(6).fill(0).map((_, i) => <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : mesas.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">🪑</div>
          <p className="font-medium">Nenhuma mesa cadastrada</p>
          <button onClick={() => setMostrarNovasMesas(true)} className="mt-3 text-orange-500 hover:underline text-sm">
            Criar mesas agora
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
          {mesas.map(mesa => {
            const cor = COR_STATUS[mesa.status] || COR_STATUS.livre
            const comanda = comandaPorMesa(mesa.id)
            return (
              <button
                key={mesa.id}
                onClick={() => abrirMesa(mesa)}
                className={`relative border-2 rounded-xl p-4 text-center transition-all hover:shadow-md hover:scale-105 ${cor.bg}`}
              >
                <div className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ${cor.dot}`} />
                <div className="text-3xl mb-1">🪑</div>
                <div className="font-bold text-gray-800 text-sm">{mesa.nome || `Mesa ${mesa.numero}`}</div>
                <div className={`text-xs font-medium mt-1 ${cor.text}`}>{cor.label}</div>
                {comanda && (
                  <div className="mt-2 text-xs font-semibold text-gray-700">
                    {formatarMoeda(comanda.total)}
                  </div>
                )}
                <div className="flex items-center justify-center gap-1 mt-1 text-xs text-gray-400">
                  <Users size={10} />
                  <span>{mesa.capacidade}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Detalhe da mesa selecionada */}
      {mesaSelecionada && !mostrarNovoPedido && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-end z-40">
          <div className="bg-white h-full w-full max-w-md overflow-y-auto shadow-2xl">
            <ComandaDetalhe
              mesa={mesaSelecionada}
              comanda={comandaAtiva || comandaPorMesa(mesaSelecionada.id)}
              onFechar={() => { setMesaSelecionada(null); setComandaAtiva(null) }}
              onAdicionarItem={() => setMostrarNovoPedido(true)}
              onFecharConta={() => fecharConta(mesaSelecionada)}
              onAtualizar={carregar}
            />
          </div>
        </div>
      )}

      {/* Modal criar mesas */}
      {mostrarNovasMesas && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-800">Criar Mesas</h3>
              <button onClick={() => setMostrarNovasMesas(false)}><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade de mesas</label>
                <input
                  type="number"
                  value={novasMesas.quantidade}
                  onChange={e => setNovasMesas(prev => ({ ...prev, quantidade: parseInt(e.target.value) || 1 }))}
                  min="1" max="20"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Capacidade (lugares)</label>
                <input
                  type="number"
                  value={novasMesas.capacidade}
                  onChange={e => setNovasMesas(prev => ({ ...prev, capacidade: parseInt(e.target.value) || 4 }))}
                  min="1" max="20"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setMostrarNovasMesas(false)} className="flex-1 border border-gray-300 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancelar</button>
                <button onClick={criarMesas} className="flex-1 bg-orange-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-orange-600">Criar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Novo pedido para mesa */}
      {mostrarNovoPedido && mesaSelecionada && (
        <NovoPedido
          tipoInicial="mesa"
          mesa={mesaSelecionada}
          comanda={comandaAtiva || comandaPorMesa(mesaSelecionada.id)}
          onFechar={() => { setMostrarNovoPedido(false); carregar() }}
          onPedidoCriado={() => { setMostrarNovoPedido(false); carregar() }}
        />
      )}
    </div>
  )
}

function ComandaDetalhe({ mesa, comanda, onFechar, onAdicionarItem, onFecharConta, onAtualizar }) {
  async function removerItem(itemId) {
    try {
      await api.comandas.removeItem(itemId)
      onAtualizar()
    } catch {
      toast.error('Erro ao remover item')
    }
  }

  const itens = comanda?.itens || []
  const total = itens.reduce((a, b) => a + (b.subtotal || 0), 0)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-5 border-b border-gray-100">
        <div>
          <h3 className="font-bold text-gray-800 text-lg">{mesa.nome || `Mesa ${mesa.numero}`}</h3>
          <p className="text-sm text-gray-500">{itens.length} itens na comanda</p>
        </div>
        <button onClick={onFechar} className="p-2 hover:bg-gray-100 rounded-lg">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {itens.length === 0 ? (
          <div className="text-center text-gray-400 py-10">
            <div className="text-4xl mb-2">📋</div>
            <p className="text-sm">Comanda vazia</p>
          </div>
        ) : (
          <div className="space-y-2">
            {itens.map(item => (
              <div key={item.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                <div>
                  <p className="font-medium text-gray-800 text-sm">{item.quantidade}x {item.nome_item}</p>
                  {item.observacao && <p className="text-xs text-gray-400">{item.observacao}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800">{formatarMoeda(item.subtotal)}</span>
                  <button onClick={() => removerItem(item.id)} className="text-red-400 hover:text-red-600 p-1">
                    <X size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-bold text-gray-800 text-lg">Total</span>
          <span className="font-bold text-orange-600 text-xl">{formatarMoeda(total)}</span>
        </div>
        <button
          onClick={onAdicionarItem}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
        >
          <Plus size={16} />
          Adicionar Itens
        </button>
        {comanda && itens.length > 0 && (
          <button
            onClick={onFecharConta}
            className="w-full bg-green-500 hover:bg-green-600 text-white py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            <DollarSign size={16} />
            Fechar Conta
          </button>
        )}
      </div>
    </div>
  )
}
