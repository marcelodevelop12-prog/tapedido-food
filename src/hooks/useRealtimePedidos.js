import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { api } from '../lib/api'

function tocarSomNotificacao() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15)
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.5)
  } catch {
    // Web Audio API pode não estar disponível
  }
}

// pedidos.mesa chega como "Mesa 4" ou "4" — extrai o número
function numeroDaMesa(mesaStr) {
  if (!mesaStr) return null
  const n = parseInt(String(mesaStr).replace(/\D/g, ''), 10)
  return isNaN(n) ? null : n
}

/**
 * Escuta INSERT na tabela `pedidos` do Supabase para a loja atual.
 * Aceita pedidos com origem='comanda' ou 'garcom'.
 *
 * limparPedidosMesa(mesaNumero) recebe o NÚMERO da mesa (inteiro),
 * porque pedidos.mesa é salvo como texto "Mesa N", não como UUID.
 *
 * @param {function} onNovoPedido  Callback chamado a cada pedido novo do garçom
 * @returns {{ pedidosNovos, limparPedidos, limparPedidosMesa }}
 */
export function useRealtimePedidos(onNovoPedido) {
  const [pedidosNovos, setPedidosNovos] = useState([])

  const limparPedidos = useCallback(() => setPedidosNovos([]), [])

  // mesaNumero = mesa.numero (inteiro), pois pedidos.mesa é "Mesa N" (texto)
  const limparPedidosMesa = useCallback((mesaNumero) => {
    setPedidosNovos(prev =>
      prev.filter(p => numeroDaMesa(p.mesa) !== mesaNumero)
    )
  }, [])

  useEffect(() => {
    let channel = null

    async function iniciar() {
      const config = await api.config.get().catch(() => null)
      const lojaId = config?.supabase_loja_id
      if (!lojaId) {
        console.log('[RT pedidos] supabase_loja_id não configurado — realtime desativado')
        return
      }

      // Nome único por invocação — evita canal já subscrito no React Strict Mode
      const channelName = `pedidos-garcom-${lojaId}-${Date.now()}`
      console.log('[RT pedidos] iniciando canal', channelName)

      channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'pedidos', filter: `loja_id=eq.${lojaId}` },
          ({ new: pedido }) => {
            console.log('[RT pedidos] INSERT recebido:', pedido)

            // Aceita 'comanda' ou 'garcom'
            const origemGarcom = pedido.origem === 'comanda' || pedido.origem === 'garcom'
            if (!origemGarcom) {
              console.log('[RT pedidos] ignorado — origem:', pedido.origem)
              return
            }

            setPedidosNovos(prev => [...prev, pedido])
            tocarSomNotificacao()
            onNovoPedido?.(pedido)
          }
        )
        .subscribe((status) => {
          console.log('[RT pedidos] status:', status)
        })
    }

    iniciar()
    return () => { if (channel) supabase.removeChannel(channel) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { pedidosNovos, limparPedidos, limparPedidosMesa }
}
