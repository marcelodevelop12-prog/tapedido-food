import React, { useEffect, useState } from 'react'
import { Plus, X, Users, Clock, DollarSign, CreditCard, Smartphone, Banknote, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../../lib/api'
import { formatarMoeda, formatarHora } from '../../lib/utils'
import NovoPedido from '../Pedidos/NovoPedido'
import { useRealtimeMesas } from '../../hooks/useRealtimeMesas'
import { useRealtimePedidos } from '../../hooks/useRealtimePedidos'
import { useRealtimeComandaItens } from '../../hooks/useRealtimeComandaItens'
import { supabase } from '../../lib/supabaseClient'

const COR_STATUS = {
  livre: { bg: 'bg-green-100 border-green-300', text: 'text-green-700', label: 'Livre', dot: 'bg-green-500' },
  ocupada: { bg: 'bg-red-100 border-red-300', text: 'text-red-700', label: 'Ocupada', dot: 'bg-red-500' },
  conta_pedida: { bg: 'bg-yellow-100 border-yellow-300', text: 'text-yellow-700', label: 'Conta Pedida', dot: 'bg-yellow-500' },
}

const FORMAS_PAGAMENTO = [
  { id: 'dinheiro', label: 'Dinheiro', icone: Banknote, cor: 'border-green-400 text-green-700 bg-green-50 hover:bg-green-100' },
  { id: 'pix', label: 'Pix', icone: Smartphone, cor: 'border-blue-400 text-blue-700 bg-blue-50 hover:bg-blue-100' },
  { id: 'debito', label: 'Débito', icone: CreditCard, cor: 'border-orange-400 text-orange-700 bg-orange-50 hover:bg-orange-100' },
  { id: 'credito', label: 'Crédito', icone: CreditCard, cor: 'border-purple-400 text-purple-700 bg-purple-50 hover:bg-purple-100' },
]

export default function Mesas() {
  const [mesas, setMesas] = useState([])
  const [comandas, setComandas] = useState([])
  const [mesaSelecionada, setMesaSelecionada] = useState(null)
  const [comandaAtiva, setComandaAtiva] = useState(null)
  const [mostrarNovoPedido, setMostrarNovoPedido] = useState(false)
  const [mostrarNovasMesas, setMostrarNovasMesas] = useState(false)
  const [novasMesas, setNovasMesas] = useState({ quantidade: 1, capacidade: 4 })
  const [carregando, setCarregando] = useState(true)
  const [mostrarPagamento, setMostrarPagamento] = useState(false)
  const [mesaParaExcluir, setMesaParaExcluir] = useState(null)
  const [excluindo, setExcluindo] = useState(false)

  useRealtimeMesas(setMesas)

  const { pedidosNovos, limparPedidosMesa } = useRealtimePedidos((pedido) => {
    toast(
      `🛎️ Novo pedido — ${pedido.mesa_nome || `Mesa ${pedido.mesa_numero || '?'}`}`,
      { duration: 6000, style: { background: '#f97316', color: '#fff', fontWeight: 600 } }
    )
    api.comandas.listarAbertas().then(setComandas).catch(() => {})
  })

  // Deriva a mesa do estado atualizado (não o snapshot de mesaSelecionada),
  // para garantir que supabase_id já tenha sido preenchido pelo sync inicial do useRealtimeMesas
  const mesaAtualizada = mesaSelecionada
    ? (mesas.find(m => m.id === mesaSelecionada.id) || mesaSelecionada)
    : null

  // Itens do garçom em tempo real para a mesa selecionada
  const { itens: itensSupabase, supabaseComandaId } = useRealtimeComandaItens(mesaAtualizada)

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
    limparPedidosMesa(mesa.numero)

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

  async function fecharConta(mesa, formaPagamento, total) {
    const mesaId = mesa.id
    const comanda = comandaAtiva || comandas.find(c => c.mesa_id === mesaId)

    // ── Atualiza UI imediatamente (antes de qualquer await) ──────────────────
    // Isso impede cliques duplos: o modal some e a mesa fica verde no mesmo render
    // antes de qualquer chamada de rede ser iniciada.
    setMostrarPagamento(false)
    setMesaSelecionada(null)
    setComandaAtiva(null)
    setMesas(prev => prev.map(m => m.id === mesaId ? { ...m, status: 'livre' } : m))
    if (comanda) setComandas(prev => prev.filter(c => c.id !== comanda.id))

    // ── Operações de backend (assíncronas) ───────────────────────────────────
    try {
      await api.caixa.registrarVenda({
        valor: total,
        formaPagamento,
        descricao: mesa.nome || `Mesa ${mesa.numero}`,
      })
    } catch {
      toast.error('Erro ao registrar no caixa')
    }

    try {
      if (comanda) {
        // Mesa aberta pelo PDV: fecha no SQLite (db.js sincroniza com Supabase internamente)
        await api.comandas.fechar(comanda.id)
      } else if (supabaseComandaId) {
        // Mesa aberta pelo garçom: não existe comanda local — fecha direto no Supabase
        console.log('[fecharConta] sem comanda local, fechando pelo supabaseComandaId:', supabaseComandaId)
        await supabase.from('comandas')
          .update({ status: 'fechada', fechado_em: new Date().toISOString() })
          .eq('id', supabaseComandaId)
        const mesaAtualState = mesas.find(m => m.id === mesaId)
        if (mesaAtualState?.supabase_id) {
          await supabase.from('mesas')
            .update({ status: 'livre' })
            .eq('id', mesaAtualState.supabase_id)
        }
      }
      toast.success('Conta fechada!')
    } catch {
      toast.error('Conta registrada no caixa, mas erro ao fechar comanda')
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

  function pedirExclusao(e, mesa) {
    e.stopPropagation()
    if (mesa.status !== 'livre') {
      toast.error('Mesa ocupada, não é possível excluir')
      return
    }
    setMesaParaExcluir(mesa)
  }

  async function confirmarExclusao() {
    if (!mesaParaExcluir) return
    setExcluindo(true)
    try {
      await api.mesas.deletar(mesaParaExcluir.id)
      setMesas(prev => prev.filter(m => m.id !== mesaParaExcluir.id))
      toast.success(`${mesaParaExcluir.nome || `Mesa ${mesaParaExcluir.numero}`} excluída`)
      setMesaParaExcluir(null)
    } catch {
      toast.error('Erro ao excluir mesa')
    } finally {
      setExcluindo(false)
    }
  }

  const comandaPorMesa = (mesaId) => comandas.find(c => c.mesa_id === mesaId)

  const pedidosNovosPorMesa = (mesa) =>
    pedidosNovos.filter(p => {
      const n = parseInt(String(p.mesa || '').replace(/\D/g, ''), 10)
      return n === mesa.numero
    }).length

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Mesas</h2>
          <p className="text-sm text-gray-500">
            {mesas.filter(m => m.status === 'ocupada').length} ocupadas · {mesas.filter(m => m.status === 'livre').length} livres
            {pedidosNovos.length > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
                🛎️ {pedidosNovos.length} novo{pedidosNovos.length > 1 ? 's' : ''}
              </span>
            )}
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
            const novos = pedidosNovosPorMesa(mesa)
            const totalItens = comanda?.itens?.length ?? null
            return (
              <button
                key={mesa.id}
                onClick={() => abrirMesa(mesa)}
                className={`relative border-2 rounded-xl p-4 text-center transition-all hover:shadow-md hover:scale-105 ${cor.bg}`}
              >
                <div className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ${cor.dot}`} />
                <div
                  role="button"
                  onClick={(e) => pedirExclusao(e, mesa)}
                  className="absolute bottom-1.5 right-1.5 p-1.5 rounded-lg bg-white/70 text-gray-400 hover:text-red-500 hover:bg-white transition-colors cursor-pointer z-10"
                  title="Excluir mesa"
                >
                  <Trash2 size={13} />
                </div>

                {novos > 0 && (
                  <span className="absolute -top-2 -left-2 bg-orange-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center animate-bounce shadow-md">
                    {novos}
                  </span>
                )}

                <div className="text-2xl font-extrabold text-gray-800 leading-none">{mesa.numero}</div>
                <div className="text-xs text-gray-500 mt-0.5 mb-1">{mesa.nome ? mesa.nome : 'Mesa'}</div>
                <div className={`text-xs font-semibold ${cor.text}`}>{cor.label}</div>

                {comanda && (
                  <div className="mt-2 text-xs font-semibold text-gray-700">
                    {formatarMoeda(comanda.total)}
                  </div>
                )}

                {totalItens !== null && totalItens > 0 && (
                  <div className="mt-1 inline-flex items-center gap-0.5 bg-gray-200 text-gray-600 text-xs font-medium px-1.5 py-0.5 rounded-full">
                    <Clock size={9} />
                    {totalItens} {totalItens === 1 ? 'item' : 'itens'}
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
      {mesaSelecionada && !mostrarNovoPedido && !mostrarPagamento && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-end z-40">
          <div className="bg-white h-full w-full max-w-md overflow-y-auto shadow-2xl">
            <ComandaDetalhe
              mesa={mesaSelecionada}
              comanda={comandaAtiva || comandaPorMesa(mesaSelecionada.id)}
              itensSupabase={itensSupabase}
              onFechar={() => { setMesaSelecionada(null); setComandaAtiva(null) }}
              onAdicionarItem={() => setMostrarNovoPedido(true)}
              onFecharConta={() => setMostrarPagamento(true)}
              onAtualizar={carregar}
            />
          </div>
        </div>
      )}

      {/* Modal de pagamento */}
      {mostrarPagamento && mesaSelecionada && (
        <ModalPagamento
          mesa={mesaSelecionada}
          comanda={comandaAtiva || comandaPorMesa(mesaSelecionada.id)}
          itensSupabase={itensSupabase}
          onCancelar={() => setMostrarPagamento(false)}
          onConfirmar={(formaPagamento, total) => fecharConta(mesaSelecionada, formaPagamento, total)}
        />
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

      {/* Modal confirmar exclusão */}
      {mesaParaExcluir && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800">Excluir mesa?</h3>
              <button onClick={() => setMesaParaExcluir(null)}><X size={18} /></button>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Tem certeza que deseja excluir a <span className="font-semibold">{mesaParaExcluir.nome || `Mesa ${mesaParaExcluir.numero}`}</span>? Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setMesaParaExcluir(null)}
                className="flex-1 border border-gray-300 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarExclusao}
                disabled={excluindo}
                className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {excluindo ? 'Excluindo...' : 'Excluir'}
              </button>
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

function ComandaDetalhe({ mesa, comanda, itensSupabase, onFechar, onAdicionarItem, onFecharConta, onAtualizar }) {
  async function removerItem(item) {
    try {
      // Item do Supabase tem comanda_id UUID; item local tem comanda_id integer
      if (item._origem === 'supabase') {
        await supabase.from('comanda_itens').delete().eq('id', item.id)
        // onAtualizar não é necessário — o realtime atualiza itensSupabase automaticamente
      } else {
        await api.comandas.removeItem(item.id)
        onAtualizar()
      }
    } catch {
      toast.error('Erro ao remover item')
    }
  }

  // Prefere itens do Supabase (garçom) quando disponíveis; senão usa SQLite local
  const itens = itensSupabase.length > 0
    ? itensSupabase.map(i => ({ ...i, subtotal: i.subtotal ?? (i.preco_unitario * i.quantidade), _origem: 'supabase' }))
    : (comanda?.itens || []).map(i => ({ ...i, _origem: 'local' }))

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
                  <button onClick={() => removerItem(item)} className="text-red-400 hover:text-red-600 p-1">
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
        {(comanda || itensSupabase.length > 0) && itens.length > 0 && (
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

function ModalPagamento({ mesa, comanda, itensSupabase, onCancelar, onConfirmar }) {
  const [formaSelecionada, setFormaSelecionada] = useState(null)
  const [confirmando, setConfirmando] = useState(false)

  const itens = itensSupabase.length > 0
    ? itensSupabase.map(i => ({ ...i, subtotal: i.subtotal ?? (i.preco_unitario * i.quantidade) }))
    : (comanda?.itens || [])

  const total = itens.reduce((a, b) => a + (b.subtotal || 0), 0)

  async function confirmar() {
    if (!formaSelecionada) return
    setConfirmando(true)
    try {
      await onConfirmar(formaSelecionada, total)
    } finally {
      setConfirmando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-800">Fechar Conta</h3>
            <p className="text-sm text-gray-500">{mesa.nome || `Mesa ${mesa.numero}`}</p>
          </div>
          <button onClick={onCancelar} className="p-2 hover:bg-gray-100 rounded-lg">
            <X size={18} />
          </button>
        </div>

        {/* Resumo de itens */}
        {itens.length > 0 && (
          <div className="px-5 pt-4 max-h-40 overflow-y-auto">
            <div className="space-y-1">
              {itens.map((item, i) => (
                <div key={item.id ?? i} className="flex justify-between text-sm text-gray-600">
                  <span>{item.quantidade}x {item.nome_item}</span>
                  <span className="font-medium">{formatarMoeda(item.subtotal)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="px-5 py-3 flex justify-between items-center border-y border-gray-100 mt-3">
          <span className="font-bold text-gray-800">Total</span>
          <span className="font-bold text-orange-600 text-xl">{formatarMoeda(total)}</span>
        </div>

        {/* Formas de pagamento */}
        <div className="p-5 space-y-3">
          <p className="text-sm font-medium text-gray-700">Forma de pagamento</p>
          <div className="grid grid-cols-2 gap-2">
            {FORMAS_PAGAMENTO.map(({ id, label, icone: Icone, cor }) => (
              <button
                key={id}
                onClick={() => setFormaSelecionada(id)}
                className={`flex items-center gap-2 border-2 rounded-xl px-3 py-3 font-medium text-sm transition-all ${
                  formaSelecionada === id
                    ? cor + ' ring-2 ring-offset-1 ring-current scale-105'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                <Icone size={16} />
                {label}
              </button>
            ))}
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={onCancelar}
              className="flex-1 border border-gray-300 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={confirmar}
              disabled={!formaSelecionada || confirmando}
              className="flex-1 bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              {confirmando ? 'Fechando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
