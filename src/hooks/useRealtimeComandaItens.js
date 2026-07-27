import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { api } from '../lib/api'

export function useRealtimeComandaItens(mesa) {
  const [itens, setItens] = useState([])
  const [supabaseComandaId, setSupabaseComandaId] = useState(null)
  const channelItensRef = useRef(null)
  const channelComandasRef = useRef(null)

  useEffect(() => {
    if (!mesa) {
      setItens([])
      setSupabaseComandaId(null)
      return
    }

    let cancelado = false

    async function iniciarComanda(mesaSupabaseId, lojaId) {
      // Busca comanda aberta para essa mesa
      const { data: comandas, error: errComanda } = await supabase
        .from('comandas')
        .select('id')
        .eq('loja_id', lojaId)
        .eq('mesa_id', mesaSupabaseId)
        .eq('status', 'aberta')
        .limit(1)

      console.log('[DEBUG] mesaSupabaseId:', mesaSupabaseId)
      console.log('[DEBUG] comandas retornadas:', JSON.stringify(comandas))
      console.log('[DEBUG] errComanda:', errComanda)

      const comandaId = comandas?.[0]?.id
      console.log('[DEBUG] comandaId:', comandaId)
      if (!comandaId || cancelado) return

      console.log('[comanda_itens] comanda encontrada:', comandaId)
      setSupabaseComandaId(comandaId)

      // Busca itens iniciais
      async function buscarItens() {
        const { data } = await supabase
          .from('comanda_itens')
          .select('*')
          .eq('comanda_id', comandaId)
          .order('created_at', { ascending: true })
        if (!cancelado) setItens(data || [])
      }

      await buscarItens()

      // Escuta novos itens em tempo real
      if (channelItensRef.current) supabase.removeChannel(channelItensRef.current)
      channelItensRef.current = supabase
        .channel(`comanda-itens-${comandaId}-${Date.now()}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'comanda_itens',
          filter: `comanda_id=eq.${comandaId}`,
        }, () => buscarItens())
        .subscribe((status) => console.log('[RT comanda_itens] status:', status))
    }

    async function iniciar() {
      const config = await api.config.get().catch(() => null)
      const lojaId = config?.supabase_loja_id
      const mesaSupabaseId = mesa.supabase_id

      console.log('[comanda_itens] mesa.numero=%s supabase_id=%s', mesa.numero, mesaSupabaseId)

      if (!lojaId || !mesaSupabaseId) return

      // Tenta buscar comanda existente
      await iniciarComanda(mesaSupabaseId, lojaId)

      // Escuta INSERT em comandas para essa mesa (caso garcom abra depois)
      if (channelComandasRef.current) supabase.removeChannel(channelComandasRef.current)
      channelComandasRef.current = supabase
        .channel(`comandas-mesa-${mesaSupabaseId}-${Date.now()}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'comandas',
          filter: `mesa_id=eq.${mesaSupabaseId}`,
        }, (payload) => {
          console.log('[comanda_itens] nova comanda detectada:', payload.new.id)
          if (!cancelado) iniciarComanda(mesaSupabaseId, lojaId)
        })
        .subscribe((status) => console.log('[RT comandas-mesa] status:', status))
    }

    iniciar()

    return () => {
      cancelado = true
      if (channelItensRef.current) supabase.removeChannel(channelItensRef.current)
      if (channelComandasRef.current) supabase.removeChannel(channelComandasRef.current)
      channelItensRef.current = null
      channelComandasRef.current = null
    }
  }, [mesa?.id, mesa?.supabase_id]) // eslint-disable-line react-hooks/exhaustive-deps

  return { itens, supabaseComandaId }
}
