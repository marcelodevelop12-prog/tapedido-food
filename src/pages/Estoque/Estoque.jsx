import React, { useEffect, useState } from 'react'
import { Search, AlertTriangle, Plus, TrendingDown, TrendingUp, Package } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../../lib/api'
import { formatarMoeda } from '../../lib/utils'

export default function Estoque() {
  const [produtos, setProdutos] = useState([])
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('todos') // todos, alertas
  const [modalMovimentacao, setModalMovimentacao] = useState(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => { carregar() }, [])

  async function carregar() {
    try {
      const data = await api.estoque.listar()
      setProdutos(data)
    } finally {
      setCarregando(false)
    }
  }

  const produtosFiltrados = produtos.filter(p => {
    const matchBusca = !busca || p.nome.toLowerCase().includes(busca.toLowerCase())
    const matchFiltro = filtro === 'todos' || (filtro === 'alertas' && p.estoque_atual <= p.estoque_minimo && p.estoque_minimo > 0)
    return matchBusca && matchFiltro
  })

  const totalAlertas = produtos.filter(p => p.estoque_atual <= p.estoque_minimo && p.estoque_minimo > 0).length
  const valorTotal = produtos.reduce((a, b) => a + (b.estoque_atual * b.custo_unitario), 0)

  async function salvarMovimentacao(dados) {
    try {
      await api.estoque.movimentar(dados)
      toast.success('Estoque atualizado!')
      setModalMovimentacao(null)
      carregar()
    } catch {
      toast.error('Erro ao movimentar estoque')
    }
  }

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Estoque</h2>
          <p className="text-sm text-gray-500">{produtos.length} produtos · Valor total: {formatarMoeda(valorTotal)}</p>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <Package size={16} />
            <span className="text-sm font-medium">Total de Produtos</span>
          </div>
          <p className="text-2xl font-bold text-gray-800">{produtos.length}</p>
        </div>
        <div className={`bg-white rounded-xl p-4 border shadow-sm ${totalAlertas > 0 ? 'border-red-200' : 'border-gray-100'}`}>
          <div className={`flex items-center gap-2 mb-1 ${totalAlertas > 0 ? 'text-red-600' : 'text-green-600'}`}>
            <AlertTriangle size={16} />
            <span className="text-sm font-medium">Alertas de Estoque</span>
          </div>
          <p className={`text-2xl font-bold ${totalAlertas > 0 ? 'text-red-600' : 'text-gray-800'}`}>{totalAlertas}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 text-green-600 mb-1">
            <TrendingUp size={16} />
            <span className="text-sm font-medium">Valor em Estoque</span>
          </div>
          <p className="text-2xl font-bold text-gray-800">{formatarMoeda(valorTotal)}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar produto..."
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <div className="flex border border-gray-200 rounded-lg overflow-hidden">
          <button onClick={() => setFiltro('todos')} className={`px-3 py-2 text-sm font-medium transition-colors ${filtro === 'todos' ? 'bg-orange-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Todos</button>
          <button onClick={() => setFiltro('alertas')} className={`px-3 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${filtro === 'alertas' ? 'bg-red-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            <AlertTriangle size={13} />
            Alertas {totalAlertas > 0 && `(${totalAlertas})`}
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Produto</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Categoria</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Estoque Atual</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Estoque Mínimo</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Custo Unit.</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Valor Total</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {carregando ? (
              Array(5).fill(0).map((_, i) => (
                <tr key={i}>
                  {Array(7).fill(0).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : produtosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-10 text-gray-400">Nenhum produto encontrado</td>
              </tr>
            ) : produtosFiltrados.map(produto => {
              const emAlerta = produto.estoque_atual <= produto.estoque_minimo && produto.estoque_minimo > 0
              const zerado = produto.estoque_atual === 0
              return (
                <tr key={produto.id} className={`hover:bg-gray-50 transition-colors ${emAlerta ? 'bg-red-50/30' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {emAlerta && <AlertTriangle size={14} className={zerado ? 'text-red-500' : 'text-orange-400'} />}
                      <div>
                        <p className="font-medium text-gray-800 text-sm">{produto.nome}</p>
                        <p className="text-xs text-gray-400">{produto.unidade}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{produto.categoria}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-sm font-bold ${zerado ? 'text-red-600' : emAlerta ? 'text-orange-600' : 'text-gray-800'}`}>
                      {produto.estoque_atual} {produto.unidade}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-500">{produto.estoque_minimo} {produto.unidade}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-600">{formatarMoeda(produto.custo_unitario)}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-gray-800">
                    {formatarMoeda(produto.estoque_atual * produto.custo_unitario)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => setModalMovimentacao({ produto, tipo: 'entrada' })}
                        className="flex items-center gap-1 px-2 py-1 bg-green-100 hover:bg-green-200 text-green-700 rounded text-xs font-medium transition-colors"
                        title="Entrada de estoque"
                      >
                        <TrendingUp size={12} />
                        Entrada
                      </button>
                      <button
                        onClick={() => setModalMovimentacao({ produto, tipo: 'inventario' })}
                        className="flex items-center gap-1 px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-xs font-medium transition-colors"
                        title="Ajuste de inventário"
                      >
                        Ajustar
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {modalMovimentacao && (
        <ModalMovimentacao
          produto={modalMovimentacao.produto}
          tipoInicial={modalMovimentacao.tipo}
          onSalvar={salvarMovimentacao}
          onFechar={() => setModalMovimentacao(null)}
        />
      )}
    </div>
  )
}

function ModalMovimentacao({ produto, tipoInicial, onSalvar, onFechar }) {
  const [form, setForm] = useState({
    tipo: tipoInicial || 'entrada',
    quantidade: '',
    custoUnitario: produto.custo_unitario || '',
    motivo: '',
  })
  const [salvando, setSalvando] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.quantidade || parseFloat(form.quantidade) <= 0) {
      toast.error('Informe a quantidade')
      return
    }
    setSalvando(true)
    try {
      await onSalvar({
        menuItemId: produto.id,
        tipo: form.tipo,
        quantidade: parseFloat(form.quantidade),
        custoUnitario: parseFloat(form.custoUnitario) || 0,
        motivo: form.motivo,
      })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-bold text-gray-800">Movimentação de Estoque</h3>
          <button onClick={onFechar} className="p-1.5 hover:bg-gray-100 rounded-lg">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="font-medium text-gray-800">{produto.nome}</p>
            <p className="text-sm text-gray-500">Estoque atual: <strong>{produto.estoque_atual} {produto.unidade}</strong></p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Tipo</label>
            <div className="flex gap-2">
              {['entrada', 'inventario', 'perda'].map(t => (
                <button key={t} type="button" onClick={() => setForm(p => ({ ...p, tipo: t }))}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors capitalize ${form.tipo === t ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {t === 'entrada' ? '📥 Entrada' : t === 'inventario' ? '📋 Inventário' : '❌ Perda'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {form.tipo === 'inventario' ? 'Quantidade Real (inventário)' : 'Quantidade'}
            </label>
            <input
              type="number"
              value={form.quantidade}
              onChange={e => setForm(p => ({ ...p, quantidade: e.target.value }))}
              placeholder="0"
              min="0"
              step="0.01"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              required
            />
          </div>

          {form.tipo === 'entrada' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Custo Unitário (R$)</label>
              <input
                type="number"
                value={form.custoUnitario}
                onChange={e => setForm(p => ({ ...p, custoUnitario: e.target.value }))}
                placeholder="0,00"
                step="0.01"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo (opcional)</label>
            <input
              value={form.motivo}
              onChange={e => setForm(p => ({ ...p, motivo: e.target.value }))}
              placeholder="Ex: Compra do fornecedor..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onFechar} className="flex-1 border border-gray-300 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={salvando} className="flex-1 bg-orange-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50">
              {salvando ? 'Salvando...' : 'Confirmar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
