import React, { useEffect, useState } from 'react'
import { FileDown, TrendingUp, Package, BarChart2 } from 'lucide-react'
import { api } from '../../lib/api'
import { formatarMoeda, formatarData } from '../../lib/utils'

export default function Relatorios() {
  const [aba, setAba] = useState('vendas')
  const [periodo, setPeriodo] = useState('7dias')
  const [dadosVendas, setDadosVendas] = useState([])
  const [produtosMaisVendidos, setProdutosMaisVendidos] = useState([])
  const [estoqueRelatorio, setEstoqueRelatorio] = useState([])
  const [carregando, setCarregando] = useState(false)

  useEffect(() => { carregar() }, [periodo])

  function getPeriodo() {
    const fim = new Date()
    const inicio = new Date()
    if (periodo === '7dias') inicio.setDate(inicio.getDate() - 7)
    else if (periodo === '30dias') inicio.setDate(inicio.getDate() - 30)
    else { inicio.setDate(1); fim.setMonth(fim.getMonth() + 1, 0) }
    return { inicio: inicio.toISOString(), fim: fim.toISOString() }
  }

  async function carregar() {
    setCarregando(true)
    try {
      const p = getPeriodo()
      const [vendas, produtos, estoque] = await Promise.all([
        api.relatorios.vendas(p),
        api.relatorios.produtosMaisVendidos(p),
        api.relatorios.estoque(),
      ])
      setDadosVendas(vendas)
      setProdutosMaisVendidos(produtos)
      setEstoqueRelatorio(estoque)
    } finally {
      setCarregando(false)
    }
  }

  function exportarPDF() {
    import('jspdf').then(({ default: jsPDF }) => {
      import('jspdf-autotable').then(() => {
        const doc = new jsPDF()
        doc.setFontSize(18)
        doc.text('TáPedido Food — Relatório de Vendas', 14, 22)
        doc.setFontSize(11)
        doc.setTextColor(100)
        doc.text(`Período: ${periodo === '7dias' ? 'Últimos 7 dias' : periodo === '30dias' ? 'Últimos 30 dias' : 'Mês atual'}`, 14, 32)
        doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`, 14, 40)

        doc.autoTable({
          startY: 50,
          head: [['Período', 'Pedidos', 'Receita', 'Ticket Médio']],
          body: dadosVendas.map(d => [
            d.periodo, d.total_pedidos,
            formatarMoeda(d.receita),
            formatarMoeda(d.ticket_medio),
          ]),
          theme: 'striped',
          headStyles: { fillColor: [249, 115, 22] },
        })

        const totalReceita = dadosVendas.reduce((a, b) => a + b.receita, 0)
        const totalPedidos = dadosVendas.reduce((a, b) => a + b.total_pedidos, 0)
        const y = doc.lastAutoTable.finalY + 10
        doc.setFontSize(12)
        doc.setTextColor(0)
        doc.text(`Total de Pedidos: ${totalPedidos}`, 14, y)
        doc.text(`Receita Total: ${formatarMoeda(totalReceita)}`, 14, y + 8)

        doc.save(`relatorio-vendas-${new Date().toISOString().split('T')[0]}.pdf`)
      })
    })
  }

  const totalReceita = dadosVendas.reduce((a, b) => a + (b.receita || 0), 0)
  const totalPedidos = dadosVendas.reduce((a, b) => a + (b.total_pedidos || 0), 0)
  const ticketMedioGeral = totalPedidos > 0 ? totalReceita / totalPedidos : 0
  const maxReceita = Math.max(...dadosVendas.map(d => d.receita), 1)

  return (
    <div className="space-y-5 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Relatórios</h2>
          <p className="text-sm text-gray-500">Análise de desempenho do negócio</p>
        </div>
        <button
          onClick={exportarPDF}
          className="flex items-center gap-2 border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium text-gray-700 transition-colors"
        >
          <FileDown size={16} />
          Exportar PDF
        </button>
      </div>

      {/* Seletor de período */}
      <div className="flex items-center gap-3">
        <div className="flex border border-gray-200 rounded-lg overflow-hidden">
          {[
            { value: '7dias', label: '7 dias' },
            { value: '30dias', label: '30 dias' },
            { value: 'mes', label: 'Este mês' },
          ].map(p => (
            <button
              key={p.value}
              onClick={() => setPeriodo(p.value)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${periodo === p.value ? 'bg-orange-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Abas */}
      <div className="flex border-b border-gray-200">
        {[
          { key: 'vendas', label: '📊 Vendas', icon: TrendingUp },
          { key: 'produtos', label: '🏆 Mais Vendidos', icon: BarChart2 },
          { key: 'estoque', label: '📦 Estoque', icon: Package },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setAba(key)}
            className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${aba === key ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {carregando ? (
        <div className="text-center text-gray-400 py-10">Carregando relatório...</div>
      ) : (
        <>
          {aba === 'vendas' && (
            <div className="space-y-5">
              {/* Métricas do período */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <p className="text-sm text-green-700 font-medium">Receita Total</p>
                  <p className="text-2xl font-bold text-green-700">{formatarMoeda(totalReceita)}</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <p className="text-sm text-blue-700 font-medium">Total de Pedidos</p>
                  <p className="text-2xl font-bold text-blue-700">{totalPedidos}</p>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                  <p className="text-sm text-orange-700 font-medium">Ticket Médio</p>
                  <p className="text-2xl font-bold text-orange-700">{formatarMoeda(ticketMedioGeral)}</p>
                </div>
              </div>

              {/* Gráfico de barras simples */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <h3 className="font-semibold text-gray-800 mb-4">Receita por Dia</h3>
                {dadosVendas.length === 0 ? (
                  <p className="text-center text-gray-400 py-8">Nenhum dado no período</p>
                ) : (
                  <div className="space-y-2">
                    {dadosVendas.map(d => (
                      <div key={d.periodo} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-20 shrink-0">
                          {d.periodo.length === 10 ? new Date(d.periodo + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : d.periodo}
                        </span>
                        <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-orange-400 to-orange-600 rounded-full flex items-center justify-end pr-2 transition-all duration-500"
                            style={{ width: `${(d.receita / maxReceita) * 100}%` }}
                          >
                            <span className="text-white text-xs font-bold">{formatarMoeda(d.receita)}</span>
                          </div>
                        </div>
                        <span className="text-xs text-gray-400 w-16 text-right">{d.total_pedidos} ped.</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Tabela de dados */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Data</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Pedidos</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Receita</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Ticket Médio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {dadosVendas.map(d => (
                      <tr key={d.periodo} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-700">{d.periodo}</td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-gray-800">{d.total_pedidos}</td>
                        <td className="px-4 py-3 text-right text-sm font-bold text-green-600">{formatarMoeda(d.receita)}</td>
                        <td className="px-4 py-3 text-right text-sm text-gray-600">{formatarMoeda(d.ticket_medio)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {aba === 'produtos' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">#</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Produto</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Qtd. Vendida</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Receita</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {produtosMaisVendidos.map((p, i) => (
                    <tr key={p.nome_item} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-bold text-gray-400">#{i + 1}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-800">
                        {i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : ''}{p.nome_item}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-700">{p.total_vendido} un</td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-green-600">{formatarMoeda(p.receita)}</td>
                    </tr>
                  ))}
                  {produtosMaisVendidos.length === 0 && (
                    <tr><td colSpan={4} className="text-center py-10 text-gray-400">Sem dados no período</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {aba === 'estoque' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Produto</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Categoria</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Estoque</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Custo Unit.</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Valor Total</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {estoqueRelatorio.map(p => {
                    const emAlerta = p.estoque_atual <= p.estoque_minimo && p.estoque_minimo > 0
                    return (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-800">{p.nome}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{p.categoria}</td>
                        <td className="px-4 py-3 text-right text-sm text-gray-700">{p.estoque_atual} {p.unidade}</td>
                        <td className="px-4 py-3 text-right text-sm text-gray-600">{formatarMoeda(p.custo_unitario)}</td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-gray-800">{formatarMoeda(p.estoque_atual * p.custo_unitario)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            p.estoque_atual === 0 ? 'bg-red-100 text-red-700' :
                            emAlerta ? 'bg-orange-100 text-orange-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {p.estoque_atual === 0 ? 'Zerado' : emAlerta ? 'Baixo' : 'OK'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
