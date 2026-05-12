import React, { useEffect, useState } from 'react'
import { TrendingUp, ShoppingBag, AlertTriangle, DollarSign, Clock, Package, ChevronRight } from 'lucide-react'
import { api } from '../../lib/api'
import { formatarMoeda, formatarHora, statusPedidoLabel, statusPedidoCor } from '../../lib/utils'

function CardMetrica({ titulo, valor, icone: Icone, cor, subtitulo }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{titulo}</p>
          <p className={`text-2xl font-bold mt-1 ${cor}`}>{valor}</p>
          {subtitulo && <p className="text-xs text-gray-400 mt-1">{subtitulo}</p>}
        </div>
        <div className={`p-2.5 rounded-lg ${cor === 'text-green-600' ? 'bg-green-100' : cor === 'text-blue-600' ? 'bg-blue-100' : cor === 'text-orange-600' ? 'bg-orange-100' : 'bg-red-100'}`}>
          <Icone size={20} className={cor} />
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [metricas, setMetricas] = useState(null)
  const [pedidosAbertos, setPedidosAbertos] = useState([])
  const [alertasEstoque, setAlertasEstoque] = useState([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    carregarDados()
    const intervalo = setInterval(carregarDados, 30000)
    return () => clearInterval(intervalo)
  }, [])

  async function carregarDados() {
    try {
      const [dashboard, pedidos, alertas] = await Promise.all([
        api.pedidos.dashboard(),
        api.pedidos.listar({ status: null }),
        api.estoque.alertas(),
      ])
      setMetricas(dashboard)
      setPedidosAbertos(pedidos.filter(p => ['recebido', 'em_preparo', 'pronto', 'saiu'].includes(p.status)).slice(0, 5))
      setAlertasEstoque(alertas.slice(0, 5))
    } catch (err) {
      console.error(err)
    } finally {
      setCarregando(false)
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-gray-400">Carregando dados...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6 fade-in">
      <div>
        <h2 className="text-xl font-bold text-gray-800">Visão Geral</h2>
        <p className="text-sm text-gray-500">Resumo do dia de hoje</p>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <CardMetrica
          titulo="Receita Hoje"
          valor={formatarMoeda(metricas?.receitaHoje)}
          icone={DollarSign}
          cor="text-green-600"
          subtitulo={`${metricas?.pedidosHoje || 0} pedidos concluídos`}
        />
        <CardMetrica
          titulo="Pedidos em Aberto"
          valor={metricas?.pedidosAbertos || 0}
          icone={ShoppingBag}
          cor="text-orange-600"
          subtitulo="Aguardando preparo ou entrega"
        />
        <CardMetrica
          titulo="Ticket Médio"
          valor={formatarMoeda(metricas?.ticketMedio)}
          icone={TrendingUp}
          cor="text-blue-600"
          subtitulo="Valor médio por pedido"
        />
        <CardMetrica
          titulo="Alertas Estoque"
          valor={alertasEstoque.length}
          icone={AlertTriangle}
          cor={alertasEstoque.length > 0 ? "text-red-600" : "text-green-600"}
          subtitulo={alertasEstoque.length > 0 ? "Itens abaixo do mínimo" : "Estoque em dia"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pedidos ativos */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <Clock size={18} className="text-orange-500" />
              Pedidos Ativos
            </h3>
            <a href="/delivery" className="text-xs text-orange-500 hover:underline flex items-center gap-1">
              Ver todos <ChevronRight size={14} />
            </a>
          </div>
          <div className="divide-y divide-gray-50">
            {pedidosAbertos.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">
                Nenhum pedido ativo no momento
              </div>
            ) : pedidosAbertos.map(pedido => (
              <div key={pedido.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-500">#{pedido.numero_pedido}</span>
                    <span className="font-medium text-gray-800 text-sm">{pedido.nome_cliente}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-400">
                      {pedido.tipo_entrega === 'entrega' ? '🛵 Delivery' : pedido.tipo_entrega === 'mesa' ? '🪑 Mesa' : '🏃 Retirada'}
                    </span>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-xs text-gray-400">{formatarHora(pedido.criado_em)}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-gray-800">{formatarMoeda(pedido.total)}</div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusPedidoCor(pedido.status)}`}>
                    {statusPedidoLabel(pedido.status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Alertas de estoque */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <Package size={18} className="text-red-500" />
              Alertas de Estoque
            </h3>
            <a href="/estoque" className="text-xs text-orange-500 hover:underline flex items-center gap-1">
              Ir para estoque <ChevronRight size={14} />
            </a>
          </div>
          <div className="divide-y divide-gray-50">
            {alertasEstoque.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">
                ✅ Todos os produtos estão bem estocados!
              </div>
            ) : alertasEstoque.map(item => (
              <div key={item.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <div className="font-medium text-gray-800 text-sm">{item.nome}</div>
                  <div className="text-xs text-gray-400">{item.categoria}</div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-bold ${item.estoque_atual === 0 ? 'text-red-600' : 'text-orange-600'}`}>
                    {item.estoque_atual} {item.unidade}
                  </div>
                  <div className="text-xs text-gray-400">mín: {item.estoque_minimo}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Status do caixa */}
      <CaixaStatus />
    </div>
  )
}

function CaixaStatus() {
  const [sessao, setSessao] = useState(null)

  useEffect(() => {
    api.caixa.sessaoAtual().then(setSessao)
  }, [])

  const totalVendas = sessao
    ? (sessao.total_dinheiro || 0) + (sessao.total_pix || 0) + (sessao.total_debito || 0) + (sessao.total_credito || 0)
    : 0

  return (
    <div className={`rounded-xl p-5 border ${sessao ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${sessao ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <div>
            <p className="font-semibold text-gray-800">
              {sessao ? '✅ Caixa Aberto' : '🔴 Caixa Fechado'}
            </p>
            {sessao && (
              <p className="text-sm text-gray-500">
                Total em vendas hoje: <strong className="text-green-700">{formatarMoeda(totalVendas)}</strong>
              </p>
            )}
          </div>
        </div>
        <a
          href="/caixa"
          className="text-sm font-medium text-orange-600 hover:underline flex items-center gap-1"
        >
          {sessao ? 'Ver caixa' : 'Abrir caixa'}
          <ChevronRight size={16} />
        </a>
      </div>
    </div>
  )
}
