import React, { useEffect, useState } from 'react'
import { DollarSign, TrendingDown, TrendingUp, X, Lock, Unlock } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../../lib/api'
import { formatarMoeda, formatarDataHora } from '../../lib/utils'

export default function Caixa() {
  const [sessao, setSessao] = useState(null)
  const [movimentacoes, setMovimentacoes] = useState([])
  const [modal, setModal] = useState(null) // 'abrir' | 'fechar' | 'sangria' | 'suprimento'
  const [form, setForm] = useState({ valor: '', descricao: '', observacoes: '' })
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { carregar() }, [])

  async function carregar() {
    try {
      const s = await api.caixa.sessaoAtual()
      setSessao(s)
      if (s) {
        const movs = await api.caixa.movimentacoes(s.id)
        setMovimentacoes(movs)
      }
    } finally {
      setCarregando(false)
    }
  }

  async function handleAbrirCaixa(e) {
    e.preventDefault()
    setSalvando(true)
    try {
      const s = await api.caixa.abrir({ valorInicial: parseFloat(form.valor) || 0 })
      setSessao(s)
      setModal(null)
      setForm({ valor: '', descricao: '', observacoes: '' })
      toast.success('Caixa aberto!')
    } catch { toast.error('Erro ao abrir caixa') }
    finally { setSalvando(false) }
  }

  async function handleFecharCaixa(e) {
    e.preventDefault()
    setSalvando(true)
    try {
      await api.caixa.fechar({ valorFinal: parseFloat(form.valor) || 0, observacoes: form.observacoes })
      setSessao(null)
      setMovimentacoes([])
      setModal(null)
      setForm({ valor: '', descricao: '', observacoes: '' })
      toast.success('Caixa fechado!')
    } catch { toast.error('Erro ao fechar caixa') }
    finally { setSalvando(false) }
  }

  async function handleSangria(e) {
    e.preventDefault()
    if (!form.valor || parseFloat(form.valor) <= 0) { toast.error('Informe o valor'); return }
    setSalvando(true)
    try {
      await api.caixa.sangria({ valor: parseFloat(form.valor), descricao: form.descricao })
      carregar()
      setModal(null)
      setForm({ valor: '', descricao: '', observacoes: '' })
      toast.success('Sangria registrada!')
    } catch { toast.error('Erro ao registrar sangria') }
    finally { setSalvando(false) }
  }

  async function handleSuprimento(e) {
    e.preventDefault()
    if (!form.valor || parseFloat(form.valor) <= 0) { toast.error('Informe o valor'); return }
    setSalvando(true)
    try {
      await api.caixa.suprimento({ valor: parseFloat(form.valor), descricao: form.descricao })
      carregar()
      setModal(null)
      setForm({ valor: '', descricao: '', observacoes: '' })
      toast.success('Suprimento registrado!')
    } catch { toast.error('Erro ao registrar suprimento') }
    finally { setSalvando(false) }
  }

  const totalVendas = sessao
    ? (sessao.total_dinheiro || 0) + (sessao.total_pix || 0) + (sessao.total_debito || 0) + (sessao.total_credito || 0)
    : 0
  const saldoEstimado = sessao
    ? (sessao.valor_inicial || 0) + (sessao.total_dinheiro || 0) + (sessao.total_suprimento || 0) - (sessao.total_sangria || 0)
    : 0

  if (carregando) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Carregando...</div>
  }

  return (
    <div className="space-y-5 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Caixa</h2>
          <p className="text-sm text-gray-500">{sessao ? 'Caixa aberto' : 'Caixa fechado'}</p>
        </div>
        {!sessao ? (
          <button onClick={() => setModal('abrir')} className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-medium transition-colors">
            <Unlock size={18} />
            Abrir Caixa
          </button>
        ) : (
          <button onClick={() => setModal('fechar')} className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-medium transition-colors">
            <Lock size={18} />
            Fechar Caixa
          </button>
        )}
      </div>

      {!sessao ? (
        <div className="bg-gray-50 rounded-2xl p-10 text-center">
          <Lock size={48} className="mx-auto text-gray-300 mb-3" />
          <h3 className="font-semibold text-gray-600 mb-1">Caixa Fechado</h3>
          <p className="text-sm text-gray-400 mb-5">Abra o caixa para começar a registrar movimentações</p>
          <button onClick={() => setModal('abrir')} className="bg-green-500 hover:bg-green-600 text-white px-6 py-2.5 rounded-lg font-medium transition-colors">
            Abrir Caixa Agora
          </button>
        </div>
      ) : (
        <>
          {/* Status do caixa */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Dinheiro', valor: sessao.total_dinheiro, cor: 'text-green-600', bg: 'bg-green-50' },
              { label: 'Pix', valor: sessao.total_pix, cor: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'Débito', valor: sessao.total_debito, cor: 'text-purple-600', bg: 'bg-purple-50' },
              { label: 'Crédito', valor: sessao.total_credito, cor: 'text-orange-600', bg: 'bg-orange-50' },
            ].map(({ label, valor, cor, bg }) => (
              <div key={label} className={`${bg} rounded-xl p-4 border border-gray-100`}>
                <p className="text-sm font-medium text-gray-600 mb-1">{label}</p>
                <p className={`text-xl font-bold ${cor}`}>{formatarMoeda(valor || 0)}</p>
              </div>
            ))}
          </div>

          {/* Resumo */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="grid grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-gray-500 mb-1">Abertura do caixa</p>
                <p className="font-bold text-gray-800">{formatarDataHora(sessao.aberto_em)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Troco inicial</p>
                <p className="font-bold text-gray-800">{formatarMoeda(sessao.valor_inicial)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Total em Vendas</p>
                <p className="font-bold text-green-600 text-lg">{formatarMoeda(totalVendas)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Total Sangrias</p>
                <p className="font-bold text-red-500">-{formatarMoeda(sessao.total_sangria)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Total Suprimentos</p>
                <p className="font-bold text-blue-500">+{formatarMoeda(sessao.total_suprimento)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Saldo Estimado (dinheiro)</p>
                <p className="font-bold text-orange-600 text-lg">{formatarMoeda(saldoEstimado)}</p>
              </div>
            </div>
          </div>

          {/* Ações */}
          <div className="flex gap-3">
            <button onClick={() => { setModal('sangria'); setForm({ valor: '', descricao: 'Sangria de caixa', observacoes: '' }) }} className="flex items-center gap-2 border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium text-gray-700 transition-colors">
              <TrendingDown size={16} className="text-red-500" />
              Sangria
            </button>
            <button onClick={() => { setModal('suprimento'); setForm({ valor: '', descricao: 'Suprimento de caixa', observacoes: '' }) }} className="flex items-center gap-2 border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium text-gray-700 transition-colors">
              <TrendingUp size={16} className="text-green-500" />
              Suprimento
            </button>
          </div>

          {/* Histórico de movimentações */}
          {movimentacoes.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="font-semibold text-gray-800">Movimentações do Dia</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {movimentacoes.map(m => (
                  <div key={m.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{m.descricao || m.tipo}</p>
                      <p className="text-xs text-gray-400">{m.forma_pagamento} · {formatarDataHora(m.criado_em)}</p>
                    </div>
                    <span className={`font-bold text-sm ${m.tipo === 'sangria' ? 'text-red-500' : m.tipo === 'suprimento' ? 'text-blue-500' : 'text-green-600'}`}>
                      {m.tipo === 'sangria' ? '-' : '+'}{formatarMoeda(m.valor)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Modais */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-800">
                {modal === 'abrir' ? 'Abrir Caixa' : modal === 'fechar' ? 'Fechar Caixa' : modal === 'sangria' ? 'Sangria de Caixa' : 'Suprimento de Caixa'}
              </h3>
              <button onClick={() => setModal(null)}><X size={18} /></button>
            </div>

            <form onSubmit={modal === 'abrir' ? handleAbrirCaixa : modal === 'fechar' ? handleFecharCaixa : modal === 'sangria' ? handleSangria : handleSuprimento} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {modal === 'abrir' ? 'Valor inicial (troco)' : modal === 'fechar' ? 'Valor contado no caixa' : 'Valor (R$)'}
                </label>
                <input
                  type="number"
                  value={form.valor}
                  onChange={e => setForm(p => ({ ...p, valor: e.target.value }))}
                  placeholder="R$ 0,00"
                  step="0.01"
                  min="0"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  autoFocus
                />
              </div>
              {(modal === 'sangria' || modal === 'suprimento') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                  <input
                    value={form.descricao}
                    onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
                    placeholder="Motivo..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              )}
              {modal === 'fechar' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                  <textarea value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none" rows={2} placeholder="Observações do fechamento..." />
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setModal(null)} className="flex-1 border border-gray-300 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50">Cancelar</button>
                <button type="submit" disabled={salvando} className={`flex-1 py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 ${modal === 'fechar' ? 'bg-red-500 hover:bg-red-600' : modal === 'abrir' ? 'bg-green-500 hover:bg-green-600' : 'bg-orange-500 hover:bg-orange-600'}`}>
                  {salvando ? 'Salvando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
