import React, { useEffect, useState } from 'react'
import { FileDown, TrendingUp, Package, BarChart2, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../../lib/api'
import { formatarMoeda, formatarData } from '../../lib/utils'

const LABEL_PERIODO = {
  '7dias': 'Últimos 7 dias',
  '30dias': 'Últimos 30 dias',
  mes: 'Mês atual',
}

const CUSTO_LUCRO_VAZIO = {
  itens: [],
  totais: { receita: 0, custo: 0, lucro: 0, margem: 0, produtosSemCusto: 0 },
}

export default function Relatorios() {
  const [aba, setAba] = useState('vendas')
  const [periodo, setPeriodo] = useState('7dias')
  const [dadosVendas, setDadosVendas] = useState([])
  const [produtosMaisVendidos, setProdutosMaisVendidos] = useState([])
  const [estoqueRelatorio, setEstoqueRelatorio] = useState([])
  const [custoLucro, setCustoLucro] = useState(CUSTO_LUCRO_VAZIO)
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
      const [vendas, produtos, estoque, lucro] = await Promise.all([
        api.relatorios.vendas(p),
        api.relatorios.produtosMaisVendidos(p),
        api.relatorios.estoque(),
        api.relatorios.custoLucro(p).catch(() => CUSTO_LUCRO_VAZIO),
      ])
      setDadosVendas(vendas)
      setProdutosMaisVendidos(produtos)
      setEstoqueRelatorio(estoque)
      setCustoLucro(lucro || CUSTO_LUCRO_VAZIO)
    } finally {
      setCarregando(false)
    }
  }

  // Cada aba define seu proprio conteudo de PDF. Antes o botao exportava
  // sempre a tabela de vendas, mesmo com outra aba aberta: o lojista pedia o
  // relatorio de estoque e recebia o de vendas, sem nenhum aviso.
  function montarPdfDaAba() {
    if (aba === 'produtos') {
      return {
        arquivo: 'produtos-mais-vendidos',
        titulo: 'Produtos Mais Vendidos',
        head: [['#', 'Produto', 'Qtd. Vendida', 'Receita']],
        body: produtosMaisVendidos.map((p, i) => [
          i + 1, p.nome_item, `${p.total_vendido} un`, formatarMoeda(p.receita),
        ]),
        resumo: [`Produtos listados: ${produtosMaisVendidos.length}`],
      }
    }

    if (aba === 'estoque') {
      const valorTotal = estoqueRelatorio.reduce((a, p) => a + (p.estoque_atual * p.custo_unitario || 0), 0)
      return {
        arquivo: 'estoque',
        titulo: 'Posição de Estoque',
        head: [['Produto', 'Categoria', 'Estoque', 'Custo Unit.', 'Valor Total', 'Situação']],
        body: estoqueRelatorio.map(p => [
          p.nome, p.categoria || '-', `${p.estoque_atual} ${p.unidade || ''}`.trim(),
          formatarMoeda(p.custo_unitario), formatarMoeda(p.estoque_atual * p.custo_unitario),
          p.estoque_atual === 0 ? 'Zerado'
            : (p.estoque_atual <= p.estoque_minimo && p.estoque_minimo > 0) ? 'Baixo' : 'OK',
        ]),
        resumo: [`Valor imobilizado em estoque: ${formatarMoeda(valorTotal)}`],
      }
    }

    if (aba === 'lucro') {
      const t = custoLucro.totais
      const resumo = [
        `Receita: ${formatarMoeda(t.receita)}`,
        `Custo: ${formatarMoeda(t.custo)}`,
        `Lucro bruto: ${formatarMoeda(t.lucro)}  (margem ${t.margem.toFixed(1)}%)`,
      ]
      // O aviso vai no PDF tambem: o numero seco levaria o lojista a decidir
      // preco em cima de um lucro inflado.
      if (t.produtosSemCusto > 0) {
        resumo.push(`Atencao: ${t.produtosSemCusto} produto(s) sem custo cadastrado — o lucro deles esta superestimado.`)
      }
      return {
        arquivo: 'custo-lucro',
        titulo: 'Custo x Lucro',
        head: [['Produto', 'Qtd.', 'Receita', 'Custo', 'Lucro', 'Margem']],
        body: custoLucro.itens.map(i => [
          i.semCusto ? `${i.nome_item} (sem custo)` : i.nome_item,
          i.quantidade, formatarMoeda(i.receita), formatarMoeda(i.custo),
          formatarMoeda(i.lucro), `${i.margem.toFixed(1)}%`,
        ]),
        resumo,
      }
    }

    return {
      arquivo: 'vendas',
      titulo: 'Relatório de Vendas',
      head: [['Período', 'Pedidos', 'Receita', 'Ticket Médio']],
      body: dadosVendas.map(d => [
        new Date(d.periodo + 'T12:00:00').toLocaleDateString('pt-BR'),
        d.total_pedidos, formatarMoeda(d.receita), formatarMoeda(d.ticket_medio),
      ]),
      resumo: [
        `Total de Pedidos: ${dadosVendas.reduce((a, b) => a + (b.total_pedidos || 0), 0)}`,
        `Receita Total: ${formatarMoeda(dadosVendas.reduce((a, b) => a + (b.receita || 0), 0))}`,
      ],
    }
  }

  async function exportarPDF() {
    const { arquivo, titulo, head, body, resumo } = montarPdfDaAba()
    if (body.length === 0) {
      toast.error('Nada para exportar neste período')
      return
    }

    const { default: jsPDF } = await import('jspdf')
    await import('jspdf-autotable')

    const doc = new jsPDF()
    doc.setFontSize(18)
    doc.text(`TáPedido Food — ${titulo}`, 14, 22)
    doc.setFontSize(11)
    doc.setTextColor(100)
    doc.text(`Período: ${LABEL_PERIODO[periodo]}`, 14, 32)
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`, 14, 40)

    doc.autoTable({
      startY: 50, head, body,
      theme: 'striped',
      headStyles: { fillColor: [249, 115, 22] },
    })

    let y = doc.lastAutoTable.finalY + 10
    doc.setFontSize(12)
    doc.setTextColor(0)
    for (const linha of resumo) {
      doc.text(linha, 14, y)
      y += 8
    }

    doc.save(`relatorio-${arquivo}-${new Date().toISOString().split('T')[0]}.pdf`)
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
          { key: 'lucro', label: '💰 Custo × Lucro', icon: TrendingUp },
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
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {new Date(d.periodo + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </td>
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

          {aba === 'lucro' && (
            <div className="space-y-5">
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <p className="text-sm text-green-700 font-medium">Receita</p>
                  <p className="text-2xl font-bold text-green-700">{formatarMoeda(custoLucro.totais.receita)}</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <p className="text-sm text-red-700 font-medium">Custo</p>
                  <p className="text-2xl font-bold text-red-700">{formatarMoeda(custoLucro.totais.custo)}</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <p className="text-sm text-blue-700 font-medium">Lucro Bruto</p>
                  <p className="text-2xl font-bold text-blue-700">{formatarMoeda(custoLucro.totais.lucro)}</p>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                  <p className="text-sm text-orange-700 font-medium">Margem</p>
                  <p className="text-2xl font-bold text-orange-700">{custoLucro.totais.margem.toFixed(1)}%</p>
                </div>
              </div>

              {custoLucro.totais.produtosSemCusto > 0 && (
                <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800">
                    <p className="font-semibold">
                      {custoLucro.totais.produtosSemCusto} produto(s) sem custo cadastrado
                    </p>
                    <p className="text-amber-700">
                      O lucro deles aparece igual à receita, o que superestima o total. Preencha o
                      custo em <strong>Cardápio → editar produto</strong> para o número ficar real.
                    </p>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Produto</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Qtd.</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Receita</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Custo</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Lucro</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Margem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {custoLucro.itens.map(i => (
                      <tr key={i.nome_item} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-800">
                          {i.nome_item}
                          {i.semCusto && (
                            <span className="ml-2 text-[10px] uppercase font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                              sem custo
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-gray-700">{i.quantidade}</td>
                        <td className="px-4 py-3 text-right text-sm text-gray-700">{formatarMoeda(i.receita)}</td>
                        <td className="px-4 py-3 text-right text-sm text-gray-600">{formatarMoeda(i.custo)}</td>
                        <td className={`px-4 py-3 text-right text-sm font-bold ${i.lucro >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatarMoeda(i.lucro)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-gray-600">{i.margem.toFixed(1)}%</td>
                      </tr>
                    ))}
                    {custoLucro.itens.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-10 text-gray-400">Sem vendas no período</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
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
