import React, { useEffect, useState, useRef } from 'react'
import {
  Printer, Clock, Play, MessageSquare, Check, X,
  ChevronDown, ChevronUp, Bell, Bike, CheckCircle2
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../../lib/api'

// ─── Status reais do SQLite ───────────────────────────────────────────────────
// Valores reais da coluna status na tabela pedidos (db.js: DEFAULT 'recebido')
const STATUS_INFO = {
  recebido:   { label: 'Novo',       cor: 'bg-orange-500/20 text-orange-400 border-orange-500/40' },
  em_preparo: { label: 'Preparando', cor: 'bg-purple-500/20 text-purple-400 border-purple-500/40' },
  pronto:     { label: 'Pronto',     cor: 'bg-green-500/20 text-green-400 border-green-500/40' },
  saiu:       { label: 'A Caminho',  cor: 'bg-pink-500/20 text-pink-400 border-pink-500/40' },
  entregue:   { label: 'Entregue',   cor: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  cancelado:  { label: 'Cancelado',  cor: 'bg-red-500/20 text-red-400 border-red-500/40' },
}

// ─── Colunas do kanban ────────────────────────────────────────────────────────
// Só o que está em andamento. Entregue e cancelado saem do fluxo e vão para a
// aba de finalizados — se ficassem aqui, no fim do dia a tela seria uma parede
// de pedidos que ninguém precisa mais olhar.
const COLUNAS = [
  { status: 'recebido',   label: 'Novos',      emoji: '🔔', destaque: true },
  { status: 'em_preparo', label: 'Preparando', emoji: '🍳' },
  { status: 'pronto',     label: 'Prontos',    emoji: '✅' },
  { status: 'saiu',       label: 'A Caminho',  emoji: '🛵' },
]

// Minutos parados na coluna atual a partir dos quais o pedido vira alerta.
// Não é o tempo total prometido ao cliente: é quanto tempo uma etapa pode
// ficar esquecida antes de virar problema.
const MINUTOS_ATENCAO = 15
const MINUTOS_ATRASO  = 30

function minutosParado(pedido) {
  const marco = pedido.status_alterado_em || pedido.criado_em
  if (!marco) return 0
  const ms = Date.now() - new Date(marco).getTime()
  return ms > 0 ? Math.floor(ms / 60000) : 0
}

// ─── Próxima ação por status ──────────────────────────────────────────────────
// Pedidos tipo 'mesa' e 'balcao' entram direto como 'entregue' — venda
// presencial já concluída na hora, sem botão de avanço. 'entregue' e
// 'cancelado' também não têm botão.
// 'mesa_pedido' é o ticket de cozinha (item pedido pelo garçom antes da conta
// fechar): passa pelo mesmo Novo -> Preparando -> Pronto do delivery, mas o
// passo final é "Entregar à Mesa" em vez de "saiu para entrega" — não existe
// deslocamento, é só o garçom levando o prato pra mesa.
function getProximaAcao(pedido) {
  if (pedido.tipo_entrega === 'mesa' || pedido.tipo_entrega === 'balcao') return null
  if (pedido.tipo_entrega === 'mesa_pedido') {
    if (pedido.status === 'recebido')   return { label: 'Aceitar Pedido',     proximo: 'em_preparo', Icon: Play,         cor: 'bg-[#F97316] text-black' }
    if (pedido.status === 'em_preparo') return { label: 'Marcar como Pronto', proximo: 'pronto',     Icon: Check,        cor: 'bg-[#F97316] text-black' }
    if (pedido.status === 'pronto')     return { label: 'Entregar à Mesa',    proximo: 'entregue',   Icon: CheckCircle2, cor: 'bg-[#F97316] text-black' }
    return null
  }
  if (pedido.status === 'recebido')   return { label: 'Aceitar Pedido',      proximo: 'em_preparo', Icon: Play,         cor: 'bg-[#F97316] text-black' }
  if (pedido.status === 'em_preparo') return { label: 'Marcar como Pronto',  proximo: 'pronto',     Icon: Check,        cor: 'bg-[#F97316] text-black' }
  if (pedido.status === 'pronto')     return { label: 'Saiu para Entrega',   proximo: 'saiu',       Icon: Bike,         cor: 'bg-[#F97316] text-black' }
  if (pedido.status === 'saiu')       return { label: 'Entregar ao Cliente', proximo: 'entregue',   Icon: CheckCircle2, cor: 'bg-[#F97316] text-black' }
  return null // entregue, cancelado
}

// ─── Parsear endereço (pode ser JSON string ou objeto) ────────────────────────
// Monta o numero no formato que o wa.me exige: só dígitos, com DDI.
// Sem isso o link abre o WhatsApp sem destinatário e a mensagem não vai
// para ninguém.
function montarNumeroWhatsapp(telefone) {
  const digitos = String(telefone || '').replace(/\D/g, '')
  if (digitos.length < 10) return null
  return digitos.startsWith('55') ? digitos : `55${digitos}`
}

function parsearEndereco(raw) {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return { logradouro: raw } }
}

export default function Pedidos() {
  const [pedidos, setPedidos]             = useState([])
  const [carregando, setCarregando]       = useState(true)
  const [verFinalizados, setVerFinalizados] = useState(false)
  const [, setAgora]                      = useState(Date.now())
  const [expandidos, setExpandidos]       = useState([])
  const [pedidoImpressao, setPedidoImpressao] = useState(null)
  const [loja, setLoja]                   = useState(null)
  const [entregadores, setEntregadores] = useState([])
  const [pedidoParaEnviar, setPedidoParaEnviar] = useState(null)
  const pollingRef = useRef(null)

  useEffect(() => {
    carregar()
    api.loja.get().then(setLoja).catch(() => {})
    api.entregadores.listar().then(setEntregadores).catch(() => setEntregadores([]))
    pollingRef.current = setInterval(carregar, 30000)
    // O contador de minutos precisa andar sozinho. Sem isto, um pedido parado
    // continuaria mostrando "2 min" ate alguem mexer na tela.
    const relogio = setInterval(() => setAgora(Date.now()), 30000)
    return () => { clearInterval(pollingRef.current); clearInterval(relogio) }
  }, [])

  async function carregar() {
    try {
      const [data, tickets] = await Promise.all([
        api.pedidos.listar(),
        api.pedidosCozinha.listar(),
      ])
      // Ticket de cozinha vira um card na mesma esteira, com a mesma forma que
      // um pedido — mas com id prefixado (nunca colide com o id numérico de
      // pedidos) e sem total: ele não representa dinheiro, só que tem item de
      // mesa esperando para ser preparado.
      const ticketsComoCard = tickets.map(t => ({
        id: `cozinha-${t.id}`,
        _origem: 'cozinha',
        _idOriginal: t.id,
        tipo_entrega: 'mesa_pedido',
        status: t.status,
        mesa: t.mesa,
        nome_cliente: t.mesa,
        criado_em: t.criado_em,
        status_alterado_em: t.status_alterado_em,
        itens: [{ nome_item: t.nome_item, quantidade: t.quantidade }],
      }))
      setPedidos([...data, ...ticketsComoCard])
    } finally {
      setCarregando(false)
    }
  }

  // "Saiu para entrega" é o momento natural de registrar quem levou o pedido.
  function avancarStatus(pedido, novoStatus) {
    if (novoStatus === 'saiu' && entregadores.length > 0) {
      setPedidoParaEnviar(pedido)
      return
    }
    atualizarStatus(pedido, novoStatus)
  }

  async function atualizarStatus(pedido, novoStatus, extras = {}) {
    try {
      if (pedido._origem === 'cozinha') {
        // Ticket de cozinha não é venda — não passa nem perto do caixa, só
        // muda de coluna na esteira.
        await api.pedidosCozinha.atualizar({ id: pedido._idOriginal, status: novoStatus })
      } else {
        await api.pedidos.atualizar({ id: pedido.id, status: novoStatus, ...extras })

        // Delivery e retirada só viram dinheiro no caixa quando chegam ao cliente.
        // Pedidos de mesa já foram lançados no fechamento da comanda.
        if (novoStatus === 'entregue' && pedido.tipo_entrega !== 'mesa') {
          const resultado = await api.caixa.registrarVendaDelivery({
            valor: Number(pedido.total || 0),
            formaPagamento: pedido.forma_pagamento,
            descricao: `Pedido #${pedido.numero_pedido}`,
            refExterna: `pedido:${pedido.id}`,
          })
          if (resultado?.erro) {
            toast.error(`Pedido entregue, mas não entrou no caixa: ${resultado.erro}`, { duration: 8000 })
          }
        }
      }

      // Atualiza local imediatamente + recarrega lista do banco
      setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, status: novoStatus } : p))
      const rotulo = pedido._origem === 'cozinha' ? pedido.mesa : `Pedido #${pedido.numero_pedido}`
      toast.success(`${rotulo} → ${STATUS_INFO[novoStatus]?.label || novoStatus}`)
      await carregar()
    } catch {
      toast.error('Erro ao atualizar pedido')
    }
  }

  async function cancelar(pedido) {
    const rotulo = pedido._origem === 'cozinha'
      ? `${pedido.mesa} — ${pedido.itens[0]?.nome_item}`
      : `pedido #${pedido.numero_pedido}`
    if (!confirm(`Cancelar ${rotulo}?`)) return
    await atualizarStatus(pedido, 'cancelado')
  }

  async function abrirImpressao(pedido) {
    // Busca dados completos do pedido para garantir todos os campos
    try {
      const completo = await api.pedidos.getById(pedido.id)
      setPedidoImpressao(completo || pedido)
    } catch {
      setPedidoImpressao(pedido)
    }
  }

  function toggleExpandido(id) {
    setExpandidos(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  function contarPorStatus(status) {
    return pedidos.filter(p => p.status === status).length
  }

  const novos       = contarPorStatus('recebido')
  const emAndamento = pedidos.filter(p => !['entregue', 'cancelado'].includes(p.status)).length

  // Pedido de mesa entra ja como 'entregue': ele nunca passa pelo fluxo de
  // delivery e so aparece na aba de finalizados.
  const finalizados = pedidos.filter(p => ['entregue', 'cancelado'].includes(p.status))

  function imprimirCupom() {
    const styleId = 'print-cupom-style'
    let styleEl = document.getElementById(styleId)
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = styleId
      document.head.appendChild(styleEl)
    }
    styleEl.textContent = `
      @media print {
        body * { visibility: hidden !important; }
        #cupom-impressao, #cupom-impressao * { visibility: visible !important; }
        #cupom-impressao {
          position: fixed !important;
          left: 0 !important; top: 0 !important;
          background: white !important;
          color: black !important;
          width: 80mm !important;
          padding: 8px !important;
          font-family: 'Courier New', monospace !important;
          font-size: 11px !important;
          z-index: 99999 !important;
        }
      }
    `
    window.print()
    setTimeout(() => styleEl?.remove(), 2000)
  }

  return (
    <div className="space-y-4 fade-in">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Pedidos</h2>
          <p className="text-sm text-gray-400 flex items-center gap-2">
            {emAndamento} em andamento
            {novos > 0 && (
              <span className="inline-flex items-center gap-1 bg-[#F97316] text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
                <Bell size={10} /> {novos} novo{novos > 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Alternância fluxo / finalizados */}
      <div className="flex gap-2">
        {[
          { id: false, label: 'Em andamento', count: emAndamento },
          { id: true,  label: 'Finalizados',  count: finalizados.length },
        ].map(t => (
          <button
            key={String(t.id)}
            onClick={() => setVerFinalizados(t.id)}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 border ${
              verFinalizados === t.id
                ? 'bg-[#F97316] text-white border-[#F97316]'
                : 'bg-white/5 text-gray-400 hover:text-white border-white/10'
            }`}
          >
            {t.label}
            <span className={verFinalizados === t.id ? 'opacity-70' : 'opacity-50'}>{t.count}</span>
          </button>
        ))}
      </div>

      {carregando ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array(8).fill(0).map((_, i) => (
            <div key={i} className="h-48 rounded-2xl animate-pulse bg-white/5" />
          ))}
        </div>
      ) : verFinalizados ? (
        finalizados.length === 0 ? (
          <VazioKanban texto="Nenhum pedido finalizado hoje" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {finalizados.map(pedido => (
              pedido._origem === 'cozinha' ? (
                <CardCozinha
                  key={pedido.id}
                  ticket={pedido}
                  proximaAcao={getProximaAcao(pedido)}
                  onAtualizarStatus={avancarStatus}
                  onCancelar={() => cancelar(pedido)}
                />
              ) : (
                <CardPedido
                  key={pedido.id}
                  pedido={pedido}
                  expandido={expandidos.includes(pedido.id)}
                  proximaAcao={getProximaAcao(pedido)}
                  entregador={entregadores.find(e => e.id === pedido.entregador_id)}
                  onToggleExpand={() => toggleExpandido(pedido.id)}
                  onAtualizarStatus={avancarStatus}
                  onCancelar={() => cancelar(pedido)}
                  onImprimir={() => abrirImpressao(pedido)}
                />
              )
            ))}
          </div>
        )
      ) : (
        // Colunas roláveis na horizontal: em tela pequena o operador desliza em
        // vez de perder as etapas finais fora do campo de visão.
        <div className="flex gap-4 overflow-x-auto pb-2">
          {COLUNAS.map(coluna => {
            const daColuna = pedidos.filter(p => p.status === coluna.status)
            return (
              <div key={coluna.status} className="flex-1 min-w-[280px] flex flex-col gap-3">
                <div
                  className={`flex items-center justify-between px-3 py-2 rounded-xl border ${
                    coluna.destaque && daColuna.length > 0
                      ? 'bg-[#F97316]/15 border-[#F97316]/40'
                      : 'bg-white/5 border-white/10'
                  }`}
                >
                  <span className="text-xs font-bold text-white uppercase tracking-wide">
                    {coluna.emoji} {coluna.label}
                  </span>
                  <span className={`text-xs font-black ${
                    coluna.destaque && daColuna.length > 0 ? 'text-[#F97316]' : 'text-gray-500'
                  }`}>
                    {daColuna.length}
                  </span>
                </div>

                {daColuna.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 py-8 text-center text-xs text-gray-600">
                    Vazio
                  </div>
                ) : daColuna.map(pedido => (
                  pedido._origem === 'cozinha' ? (
                    <CardCozinha
                      key={pedido.id}
                      ticket={pedido}
                      proximaAcao={getProximaAcao(pedido)}
                      onAtualizarStatus={avancarStatus}
                      onCancelar={() => cancelar(pedido)}
                    />
                  ) : (
                    <CardPedido
                      key={pedido.id}
                      pedido={pedido}
                      expandido={expandidos.includes(pedido.id)}
                      proximaAcao={getProximaAcao(pedido)}
                      entregador={entregadores.find(e => e.id === pedido.entregador_id)}
                      onToggleExpand={() => toggleExpandido(pedido.id)}
                      onAtualizarStatus={avancarStatus}
                      onCancelar={() => cancelar(pedido)}
                      onImprimir={() => abrirImpressao(pedido)}
                    />
                  )
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de impressão */}
      {pedidoImpressao && (
        <ModalImpressao
          pedido={pedidoImpressao}
          loja={loja}
          onImprimir={imprimirCupom}
          onFechar={() => setPedidoImpressao(null)}
        />
      )}

      {pedidoParaEnviar && (
        <ModalEntregador
          pedido={pedidoParaEnviar}
          entregadores={entregadores}
          onConfirmar={(entregadorId) => {
            const p = pedidoParaEnviar
            setPedidoParaEnviar(null)
            atualizarStatus(p, 'saiu', entregadorId ? { entregadorId } : {})
          }}
          onFechar={() => setPedidoParaEnviar(null)}
        />
      )}
    </div>
  )
}

// Quanto tempo o pedido está parado nesta etapa. É o número que evita o pedido
// esquecido: a hora de entrada não diz nada depois que o salão enche.
function TempoParado({ pedido, hora }) {
  const finalizado = ['entregue', 'cancelado'].includes(pedido.status)
  if (finalizado) {
    return (
      <div className="flex items-center gap-1 text-gray-500 text-xs shrink-0">
        <Clock size={10} />
        <span>{hora}</span>
      </div>
    )
  }

  const min = minutosParado(pedido)
  const cor = min >= MINUTOS_ATRASO
    ? 'bg-red-500/20 text-red-400 border-red-500/40'
    : min >= MINUTOS_ATENCAO
      ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
      : 'text-gray-500 border-transparent'

  return (
    <div
      className={`flex items-center gap-1 text-xs shrink-0 px-1.5 py-0.5 rounded-md border font-medium ${cor}`}
      title={`Nesta etapa desde ${hora}`}
    >
      <Clock size={10} />
      <span>{min < 1 ? 'agora' : `${min} min`}</span>
    </div>
  )
}

function VazioKanban({ texto }) {
  return (
    <div className="text-center py-20 text-gray-500">
      <div className="text-5xl mb-3">📋</div>
      <p className="font-medium">{texto}</p>
    </div>
  )
}

// ─── Card de pedido ───────────────────────────────────────────────────────────

function CardPedido({ pedido, expandido, proximaAcao, entregador, onToggleExpand, onAtualizarStatus, onCancelar, onImprimir }) {
  const isMesa = pedido.tipo_entrega === 'mesa'
  const isNovo = pedido.status === 'recebido'
  const info   = STATUS_INFO[pedido.status] || { label: pedido.status, cor: 'bg-gray-500/20 text-gray-400 border-gray-500/40' }
  const hora   = pedido.criado_em ? new Date(pedido.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--'
  const itens  = pedido.itens || []

  const numeroWhatsapp = montarNumeroWhatsapp(pedido.telefone_cliente)

  function whatsapp() {
    if (!numeroWhatsapp) return
    const nome  = pedido.mesa || pedido.nome_cliente || 'Cliente'
    const lista = itens.map(i => `${i.quantidade}x ${i.nome_item}`).join(', ')
    const msg   = `Ola ${nome}! Seu pedido #${pedido.numero_pedido} (${lista}) - Total: R$ ${Number(pedido.total || 0).toFixed(2)}`
    const url   = `https://wa.me/${numeroWhatsapp}?text=${encodeURIComponent(msg)}`
    window.api?.shell?.openExternal(url)
  }

  return (
    <div
      className={`rounded-2xl border overflow-hidden flex flex-col shadow-xl transition-all ${
        isNovo ? 'ring-1 ring-[#F97316]/40' : ''
      }`}
      style={{ background: '#162035', borderColor: 'rgba(255,255,255,0.08)' }}
    >
      {/* Cabeçalho do card */}
      <div className="px-4 py-3 flex items-center justify-between border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2">
          <span className="text-lg font-black text-[#F97316]">
            #{String(pedido.numero_pedido || 0).padStart(3, '0')}
          </span>
          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md border ${info.cor}`}>
            {info.label}
          </span>
          <span className="text-xs text-gray-500">
            {isMesa ? '🪑' : pedido.tipo_entrega === 'balcao' ? '🧾' : pedido.tipo_entrega === 'entrega' ? '🛵' : '🏃'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white font-black text-sm">
            <span className="text-[#F97316] text-xs mr-0.5">R$</span>
            {Number(pedido.total || 0).toFixed(2)}
          </span>
          <button onClick={onToggleExpand} className="text-gray-500 hover:text-white transition-colors">
            {expandido ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Corpo */}
      <div className="p-4 space-y-3 flex-1">
        {/* Cliente / Mesa + hora */}
        <div className="flex justify-between items-start">
          <div className="space-y-0.5">
            <p className="text-white font-bold text-sm leading-none">
              {pedido.mesa || pedido.nome_cliente || 'Cliente'}
            </p>
            {!isMesa && pedido.bairro_entrega && (
              <p className="text-gray-500 text-xs">{pedido.bairro_entrega}</p>
            )}
            {pedido.forma_pagamento && (
              <p className="text-gray-500 text-xs capitalize">{pedido.forma_pagamento}</p>
            )}
            {entregador && (
              <p className="text-gray-400 text-xs flex items-center gap-1">
                <Bike size={10} /> {entregador.nome}
              </p>
            )}
          </div>
          <TempoParado pedido={pedido} hora={hora} />
        </div>

        {/* Itens */}
        <div className="space-y-1">
          {itens.slice(0, expandido ? 999 : 2).map((item, i) => (
            <div key={i} className="flex justify-between text-xs">
              <span className="text-gray-400">{item.quantidade}x {item.nome_item}</span>
              {expandido && (
                <span className="text-white font-bold ml-2 shrink-0">
                  R$ {Number(item.subtotal ?? (item.quantidade * item.preco_unitario)).toFixed(2)}
                </span>
              )}
            </div>
          ))}
          {!expandido && itens.length > 2 && (
            <p className="text-[10px] text-gray-600 italic">+{itens.length - 2} item(s)</p>
          )}
        </div>

        {/* Botões de ação */}
        <div className="flex gap-2 pt-1">
          {/* Botão principal de avanço de status — só aparece se houver próxima ação */}
          {proximaAcao && (
            <button
              onClick={() => onAtualizarStatus(pedido, proximaAcao.proximo)}
              className={`flex-1 flex items-center justify-center gap-1.5 font-bold text-xs py-2 rounded-xl hover:opacity-90 transition-opacity ${proximaAcao.cor}`}
            >
              <proximaAcao.Icon size={14} />
              {proximaAcao.label}
            </button>
          )}

          <button
            onClick={whatsapp}
            disabled={!numeroWhatsapp}
            title={numeroWhatsapp ? 'Enviar WhatsApp' : 'Pedido sem telefone do cliente'}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 text-gray-400 hover:text-[#F97316] transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-gray-400"
          >
            <MessageSquare size={16} />
          </button>

          <button
            onClick={onImprimir}
            title="Imprimir cupom"
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 text-gray-400 hover:text-[#F97316] transition-colors"
          >
            <Printer size={16} />
          </button>

          {!['entregue', 'cancelado'].includes(pedido.status) && (
            <button
              onClick={onCancelar}
              title="Cancelar pedido"
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 text-gray-400 hover:text-red-500 transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Ticket de cozinha (item de mesa pedido pelo garçom) ──────────────────────
// Card mais simples que CardPedido de proposito: sem preco, sem whatsapp, sem
// impressao — o ticket nao e uma venda, e so um aviso pra cozinha preparar.

function CardCozinha({ ticket, proximaAcao, onAtualizarStatus, onCancelar }) {
  const isNovo = ticket.status === 'recebido'
  const info   = STATUS_INFO[ticket.status] || { label: ticket.status, cor: 'bg-gray-500/20 text-gray-400 border-gray-500/40' }
  const hora   = ticket.criado_em ? new Date(ticket.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--'
  const item   = ticket.itens[0]

  return (
    <div
      className={`rounded-2xl border overflow-hidden flex flex-col shadow-xl transition-all ${
        isNovo ? 'ring-1 ring-[#F97316]/40' : ''
      }`}
      style={{ background: '#162035', borderColor: 'rgba(255,255,255,0.08)' }}
    >
      <div className="px-4 py-3 flex items-center justify-between border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2">
          <span className="text-lg">🍽️</span>
          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md border ${info.cor}`}>
            {info.label}
          </span>
          <span className="text-xs text-gray-500">mesa</span>
        </div>
        <TempoParado pedido={ticket} hora={hora} />
      </div>

      <div className="p-4 space-y-3 flex-1">
        <p className="text-white font-bold text-sm leading-none">{ticket.mesa}</p>
        <p className="text-gray-300 text-sm">{item.quantidade}x {item.nome_item}</p>

        <div className="flex gap-2 pt-1">
          {proximaAcao && (
            <button
              onClick={() => onAtualizarStatus(ticket, proximaAcao.proximo)}
              className={`flex-1 flex items-center justify-center gap-1.5 font-bold text-xs py-2 rounded-xl hover:opacity-90 transition-opacity ${proximaAcao.cor}`}
            >
              <proximaAcao.Icon size={14} />
              {proximaAcao.label}
            </button>
          )}
          {!['entregue', 'cancelado'].includes(ticket.status) && (
            <button
              onClick={onCancelar}
              title="Cancelar ticket"
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 text-gray-400 hover:text-red-500 transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Modal de entregador ──────────────────────────────────────────────────────

function ModalEntregador({ pedido, entregadores, onConfirmar, onFechar }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-sm rounded-2xl p-5 space-y-4" style={{ background: '#162035' }}>
        <div>
          <h3 className="text-white font-bold text-lg">Quem vai levar?</h3>
          <p className="text-gray-400 text-sm">
            Pedido #{String(pedido.numero_pedido || 0).padStart(3, '0')}
            {pedido.bairro_entrega ? ` · ${pedido.bairro_entrega}` : ''}
          </p>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {entregadores.map(e => (
            <button
              key={e.id}
              onClick={() => onConfirmar(e.id)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-left transition-colors"
            >
              <Bike size={18} className="text-[#F97316] shrink-0" />
              <div className="min-w-0">
                <p className="text-white font-medium text-sm truncate">{e.nome}</p>
                {e.veiculo && <p className="text-gray-500 text-xs truncate">{e.veiculo}</p>}
              </div>
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onConfirmar(null)}
            className="flex-1 py-2.5 rounded-xl bg-white/5 text-gray-300 hover:bg-white/10 text-sm font-medium transition-colors"
          >
            Sem entregador
          </button>
          <button
            onClick={onFechar}
            className="px-5 py-2.5 rounded-xl bg-white/5 text-gray-400 hover:text-white text-sm font-medium transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal de impressão ───────────────────────────────────────────────────────

function ModalImpressao({ pedido, loja, onImprimir, onFechar }) {
  const isMesa    = pedido.tipo_entrega === 'mesa'
  const isEntrega = pedido.tipo_entrega === 'entrega'
  const itens     = pedido.itens || []

  // Parseia endereço (pode ser JSON string ou objeto)
  const addr = parsearEndereco(pedido.endereco_entrega)
  const enderecoLinha = addr
    ? [addr.logradouro || addr.rua, addr.numero].filter(Boolean).join(', ')
    : null
  const complemento = addr?.complemento || null

  const subtotal      = Number(pedido.subtotal || 0)
  const taxaEntrega   = Number(pedido.taxa_entrega || 0)
  const total         = Number(pedido.total || 0)
  const trocoPara     = Number(pedido.troco_para || 0)
  const troco         = trocoPara > 0 ? trocoPara - total : 0

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
    >
      <div className="flex flex-col items-center gap-4 w-full max-w-sm max-h-screen overflow-y-auto">

        {/* Botões de controle (não são impressos) */}
        <div className="flex gap-3 no-print">
          <button
            onClick={onImprimir}
            className="flex items-center gap-2 bg-[#F97316] hover:bg-orange-600 text-white font-bold px-6 py-3 rounded-xl transition-colors"
          >
            <Printer size={18} /> Imprimir
          </button>
          <button
            onClick={onFechar}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold px-6 py-3 rounded-xl transition-colors"
          >
            <X size={18} /> Fechar
          </button>
        </div>

        {/* ── CUPOM ── fundo sempre branco, texto sempre preto ── */}
        <div
          id="cupom-impressao"
          style={{
            background: 'white',
            color: 'black',
            fontFamily: "'Courier New', monospace",
            fontSize: '12px',
            lineHeight: '1.5',
            padding: '16px',
            width: '100%',
            borderRadius: '4px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
          }}
        >
          {/* Nome da loja */}
          <div style={{ textAlign: 'center', marginBottom: '12px' }}>
            <div style={{ fontSize: '15px', fontWeight: 900 }}>
              {loja?.nome || 'RESTAURANTE'}
            </div>
            {loja?.cidade && (
              <div style={{ fontSize: '10px', opacity: 0.7 }}>
                {loja.cidade}{loja.estado ? ` - ${loja.estado}` : ''}
              </div>
            )}
            {loja?.telefone && (
              <div style={{ fontSize: '10px', opacity: 0.7 }}>{loja.telefone}</div>
            )}
          </div>

          <Divisor />

          {/* Número, data, tipo */}
          <Linha label="PEDIDO"  valor={`#${String(pedido.numero_pedido || 0).padStart(3, '0')}`} bold />
          <Linha label="Data"    valor={pedido.criado_em ? new Date(pedido.criado_em).toLocaleString('pt-BR') : '-'} />
          <Linha label="Tipo"    valor={isMesa ? 'Mesa' : isEntrega ? 'Delivery' : 'Retirada'} />

          <Divisor />

          {/* Cliente */}
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontWeight: 900, marginBottom: '2px' }}>CLIENTE</div>
            <div>{pedido.mesa || pedido.nome_cliente || 'Cliente'}</div>
            {!isMesa && pedido.telefone_cliente && (
              <div style={{ fontSize: '10px', opacity: 0.7 }}>{pedido.telefone_cliente}</div>
            )}
          </div>

          {/* Endereço — só delivery */}
          {isEntrega && (enderecoLinha || pedido.bairro_entrega) && (
            <>
              <Divisor />
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontWeight: 900, marginBottom: '2px' }}>ENDERECO</div>
                {enderecoLinha && <div style={{ fontSize: '11px' }}>{enderecoLinha}</div>}
                {complemento    && <div style={{ fontSize: '11px' }}>{complemento}</div>}
                {pedido.bairro_entrega && (
                  <div style={{ fontSize: '11px' }}>Bairro: {pedido.bairro_entrega}</div>
                )}
              </div>
            </>
          )}

          <Divisor />

          {/* Itens */}
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontWeight: 900, marginBottom: '4px' }}>ITENS</div>
            {itens.map((item, i) => (
              <div key={i} style={{ marginBottom: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{item.quantidade}x {item.nome_item}</span>
                  <span style={{ fontWeight: 700 }}>
                    R$ {Number(item.subtotal ?? (item.quantidade * item.preco_unitario)).toFixed(2)}
                  </span>
                </div>
                <div style={{ fontSize: '10px', opacity: 0.6, paddingLeft: '8px' }}>
                  R$ {Number(item.preco_unitario || 0).toFixed(2)} un
                  {item.observacao ? ` · ${item.observacao}` : ''}
                </div>
              </div>
            ))}
          </div>

          {/* Observações do pedido */}
          {pedido.observacoes && (
            <>
              <Divisor />
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontWeight: 900, marginBottom: '2px' }}>OBSERVACOES</div>
                <div style={{ fontSize: '11px' }}>{pedido.observacoes}</div>
              </div>
            </>
          )}

          <Divisor />

          {/* Totais */}
          <div style={{ marginBottom: '8px' }}>
            {subtotal > 0 && taxaEntrega > 0 && (
              <Linha label="Subtotal"       valor={`R$ ${subtotal.toFixed(2)}`} />
            )}
            {taxaEntrega > 0 && (
              <Linha label="Taxa de entrega" valor={`R$ ${taxaEntrega.toFixed(2)}`} />
            )}
            <Linha label="TOTAL" valor={`R$ ${total.toFixed(2)}`} bold />
          </div>

          <Divisor />

          {/* Pagamento */}
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontWeight: 900, marginBottom: '2px' }}>PAGAMENTO</div>
            <div style={{ textTransform: 'uppercase' }}>{pedido.forma_pagamento || 'DINHEIRO'}</div>
            {pedido.forma_pagamento === 'dinheiro' && trocoPara > 0 && (
              <>
                <Linha label="Recebido" valor={`R$ ${trocoPara.toFixed(2)}`} />
                {troco >= 0 && <Linha label="Troco" valor={`R$ ${troco.toFixed(2)}`} bold />}
              </>
            )}
          </div>

          <Divisor />

          <div style={{ textAlign: 'center', fontSize: '10px', paddingTop: '4px' }}>
            Obrigado pela preferencia!
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Componentes auxiliares do cupom ─────────────────────────────────────────

function Divisor() {
  return (
    <div style={{
      borderTop: '1px dashed black',
      margin: '6px 0',
    }} />
  )
}

function Linha({ label, valor, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', fontWeight: bold ? 900 : 400 }}>
      <span>{label}</span>
      <span>{valor}</span>
    </div>
  )
}
