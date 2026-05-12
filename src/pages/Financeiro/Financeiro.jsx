import React, { useEffect, useState } from 'react'
import { Plus, TrendingDown, TrendingUp, X, CheckCircle, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../../lib/api'
import { formatarMoeda, formatarData } from '../../lib/utils'

export default function Financeiro() {
  const [aba, setAba] = useState('pagar')
  const [contasPagar, setContasPagar] = useState([])
  const [contasReceber, setContasReceber] = useState([])
  const [fluxo, setFluxo] = useState({ entradas: 0, saidas: 0, saldo: 0 })
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({ descricao: '', valor: '', vencimento: '', categoria: '', fornecedorId: '' })
  const [salvando, setSalvando] = useState(false)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => { carregar() }, [])

  async function carregar() {
    try {
      const inicio = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
      const fim = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString()
      const [pagar, receber, f] = await Promise.all([
        api.financeiro.contasPagar(),
        api.financeiro.contasReceber(),
        api.financeiro.fluxoCaixa({ inicio, fim }),
      ])
      setContasPagar(pagar)
      setContasReceber(receber)
      setFluxo(f)
    } finally {
      setCarregando(false)
    }
  }

  async function pagar(id) {
    try {
      await api.financeiro.pagarConta(id)
      setContasPagar(prev => prev.map(c => c.id === id ? { ...c, status: 'pago' } : c))
      toast.success('Conta paga!')
      carregar()
    } catch { toast.error('Erro ao pagar conta') }
  }

  async function receber(id) {
    try {
      await api.financeiro.receberConta(id)
      setContasReceber(prev => prev.map(c => c.id === id ? { ...c, status: 'recebido' } : c))
      toast.success('Recebimento registrado!')
      carregar()
    } catch { toast.error('Erro ao registrar recebimento') }
  }

  async function criarConta(e) {
    e.preventDefault()
    if (!form.descricao || !form.valor || !form.vencimento) { toast.error('Preencha todos os campos'); return }
    setSalvando(true)
    try {
      if (aba === 'pagar') {
        const nova = await api.financeiro.criarContaPagar({ ...form, valor: parseFloat(form.valor) })
        setContasPagar(prev => [nova, ...prev])
      } else {
        const nova = await api.financeiro.criarContaReceber({ ...form, valor: parseFloat(form.valor) })
        setContasReceber(prev => [nova, ...prev])
      }
      setModal(null)
      setForm({ descricao: '', valor: '', vencimento: '', categoria: '' })
      toast.success('Conta criada!')
      carregar()
    } catch { toast.error('Erro ao criar conta') }
    finally { setSalvando(false) }
  }

  const hoje = new Date().toISOString().split('T')[0]
  const contas = aba === 'pagar' ? contasPagar : contasReceber
  const vencidas = contas.filter(c => c.status === 'pendente' && c.vencimento < hoje)
  const pendentes = contas.filter(c => c.status === 'pendente' && c.vencimento >= hoje)
  const pagas = contas.filter(c => c.status === 'pago' || c.status === 'recebido')

  function corStatus(conta) {
    if (conta.status === 'pago' || conta.status === 'recebido') return 'text-green-600'
    if (conta.vencimento < hoje) return 'text-red-600'
    const diasAte = Math.floor((new Date(conta.vencimento) - new Date()) / 86400000)
    if (diasAte <= 3) return 'text-orange-600'
    return 'text-gray-600'
  }

  return (
    <div className="space-y-5 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Financeiro</h2>
          <p className="text-sm text-gray-500">Contas a pagar e receber</p>
        </div>
        <button
          onClick={() => setModal('criar')}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          <Plus size={18} />
          Nova Conta
        </button>
      </div>

      {/* Fluxo do mês */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-green-700 mb-1">
            <TrendingUp size={16} />
            <span className="text-sm font-medium">Entradas do Mês</span>
          </div>
          <p className="text-2xl font-bold text-green-700">{formatarMoeda(fluxo.entradas)}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-700 mb-1">
            <TrendingDown size={16} />
            <span className="text-sm font-medium">Saídas do Mês</span>
          </div>
          <p className="text-2xl font-bold text-red-700">{formatarMoeda(fluxo.saidas)}</p>
        </div>
        <div className={`${fluxo.saldo >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'} border rounded-xl p-4`}>
          <p className={`text-sm font-medium mb-1 ${fluxo.saldo >= 0 ? 'text-blue-700' : 'text-red-700'}`}>Saldo do Mês</p>
          <p className={`text-2xl font-bold ${fluxo.saldo >= 0 ? 'text-blue-700' : 'text-red-700'}`}>{formatarMoeda(fluxo.saldo)}</p>
        </div>
      </div>

      {/* Abas */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setAba('pagar')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${aba === 'pagar' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          💸 Contas a Pagar ({contasPagar.filter(c => c.status === 'pendente').length})
        </button>
        <button
          onClick={() => setAba('receber')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${aba === 'receber' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          💰 Contas a Receber ({contasReceber.filter(c => c.status === 'pendente').length})
        </button>
      </div>

      {carregando ? (
        <div className="text-center text-gray-400 py-10">Carregando...</div>
      ) : (
        <div className="space-y-6">
          {/* Vencidas */}
          {vencidas.length > 0 && (
            <section>
              <h3 className="font-semibold text-red-600 mb-2 flex items-center gap-2">
                <AlertTriangle size={16} />
                Vencidas ({vencidas.length})
              </h3>
              <ListaContas contas={vencidas} aba={aba} onPagar={pagar} onReceber={receber} corStatus={corStatus} />
            </section>
          )}

          {/* Pendentes */}
          {pendentes.length > 0 && (
            <section>
              <h3 className="font-semibold text-gray-700 mb-2">Pendentes ({pendentes.length})</h3>
              <ListaContas contas={pendentes} aba={aba} onPagar={pagar} onReceber={receber} corStatus={corStatus} />
            </section>
          )}

          {vencidas.length === 0 && pendentes.length === 0 && (
            <div className="text-center py-10 text-gray-400">
              <CheckCircle size={40} className="mx-auto mb-2 text-green-300" />
              <p>Nenhuma conta pendente!</p>
            </div>
          )}

          {/* Pagas */}
          {pagas.length > 0 && (
            <section>
              <h3 className="font-semibold text-gray-400 mb-2">Histórico — {aba === 'pagar' ? 'Pagas' : 'Recebidas'} ({pagas.length})</h3>
              <ListaContas contas={pagas} aba={aba} corStatus={corStatus} />
            </section>
          )}
        </div>
      )}

      {modal === 'criar' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-800">Nova Conta a {aba === 'pagar' ? 'Pagar' : 'Receber'}</h3>
              <button onClick={() => setModal(null)}><X size={18} /></button>
            </div>
            <form onSubmit={criarConta} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição *</label>
                <input value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} placeholder="Ex: Fornecedor de carnes" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$) *</label>
                <input type="number" value={form.valor} onChange={e => setForm(p => ({ ...p, valor: e.target.value }))} placeholder="0,00" step="0.01" min="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vencimento *</label>
                <input type="date" value={form.vencimento} onChange={e => setForm(p => ({ ...p, vencimento: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" required />
              </div>
              {aba === 'pagar' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                  <select value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                    <option value="">Selecione</option>
                    {['Aluguel', 'Utilidades', 'Fornecedores', 'Salários', 'Marketing', 'Outros'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setModal(null)} className="flex-1 border border-gray-300 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50">Cancelar</button>
                <button type="submit" disabled={salvando} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                  {salvando ? 'Salvando...' : 'Criar Conta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function ListaContas({ contas, aba, onPagar, onReceber, corStatus }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-100">
          <tr>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Descrição</th>
            {aba === 'pagar' && <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Categoria</th>}
            <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Valor</th>
            <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Vencimento</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Status</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Ação</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {contas.map(c => (
            <tr key={c.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 text-sm font-medium text-gray-800">{c.descricao}</td>
              {aba === 'pagar' && <td className="px-4 py-3 text-sm text-gray-500">{c.categoria || '-'}</td>}
              <td className="px-4 py-3 text-right text-sm font-bold text-gray-800">{formatarMoeda(c.valor)}</td>
              <td className={`px-4 py-3 text-right text-sm font-medium ${corStatus(c)}`}>{formatarData(c.vencimento)}</td>
              <td className="px-4 py-3 text-center">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  c.status === 'pago' || c.status === 'recebido' ? 'bg-green-100 text-green-700' :
                  c.vencimento < new Date().toISOString().split('T')[0] ? 'bg-red-100 text-red-700' :
                  'bg-yellow-100 text-yellow-700'
                }`}>
                  {c.status === 'pago' ? 'Pago' : c.status === 'recebido' ? 'Recebido' : c.status === 'cancelado' ? 'Cancelado' : 'Pendente'}
                </span>
              </td>
              <td className="px-4 py-3 text-center">
                {(c.status === 'pendente' || c.status === 'vencido') && (
                  <button
                    onClick={() => aba === 'pagar' ? onPagar(c.id) : onReceber(c.id)}
                    className="text-xs px-3 py-1 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors"
                  >
                    {aba === 'pagar' ? 'Pagar' : 'Recebido'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
