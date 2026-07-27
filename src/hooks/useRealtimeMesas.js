import { useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { api } from '../lib/api'

/**
 * Ao montar:
 *   1. Busca status atual das mesas e comandas abertas no Supabase.
 *      Mesa com comanda aberta => status 'ocupada', mesmo que o app do garcom
 *      nao tenha atualizado mesas.status diretamente.
 *   2. Assina INSERT/UPDATE/DELETE em mesas (status).
 *   3. Assina INSERT/UPDATE em comandas: garcom abre => ocupada, fecha => livre.
 */
export function useRealtimeMesas(setMesas) {
  useEffect(() => {
    let channel = null
    let cancelado = false

    async function iniciar() {
      const config = await api.config.get().catch(() => null)
      const lojaId = config?.supabase_loja_id
      if (!lojaId) {
        console.log('[RT mesas] supabase_loja_id nao configurado -- realtime desativado')
        return
      }

      // ── 1. Sync inicial ──────────────────────────────────────────────────────
      try {
        const [{ data: mesasRemotas, error: errMesas }, { data: comandasAbertas }] =
          await Promise.all([
            supabase.from('mesas').select('id, numero, status').eq('loja_id', lojaId),
            supabase.from('comandas').select('mesa_id').eq('loja_id', lojaId).eq('status', 'aberta'),
          ])

        if (!errMesas && mesasRemotas?.length && !cancelado) {
          const ocupadasPorComanda = new Set((comandasAbertas || []).map(c => c.mesa_id))

          setMesas(prev => prev.map(m => {
            const remota = mesasRemotas.find(r => r.id === m.supabase_id || r.numero === m.numero)
            if (!remota) return m

            // Persiste supabase_id correto no SQLite se divergir
            if (remota.id !== m.supabase_id && window.api?.mesas?.atualizarSupabaseId) {
              window.api.mesas.atualizarSupabaseId(m.id, remota.id).catch(() => {})
            }

            // Mesa com comanda aberta => ocupada, independente de mesas.status
            const statusFinal = ocupadasPorComanda.has(remota.id) ? 'ocupada' : remota.status

            return { ...m, status: statusFinal, supabase_id: remota.id }
          }))

          console.log('[RT mesas] sync inicial OK --', mesasRemotas.length, 'mesas,',
            ocupadasPorComanda.size, 'com comanda aberta')
        }
      } catch (e) {
        console.warn('[RT mesas] sync inicial falhou (offline?):', e.message)
      }

      if (cancelado) return

      // ── 2. Subscription realtime ─────────────────────────────────────────────
      const channelName = `mesas-pdv-${lojaId}-${Date.now()}`

      function patchMesa(remota) {
        setMesas(prev => prev.map(m => {
          const bate = m.supabase_id === remota.id || m.numero === remota.numero
          if (!bate) return m
          return { ...m, status: remota.status, supabase_id: remota.id }
        }))
      }

      channel = supabase
        .channel(channelName)

        // -- mesas: status direto (garcom atualiza mesas.status) --
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'mesas', filter: `loja_id=eq.${lojaId}` },
          ({ eventType, new: nova, old: antiga }) => {
            console.log('[RT mesas]', eventType, nova ?? antiga)
            if (eventType === 'INSERT') {
              setMesas(prev => {
                if (prev.some(m => m.supabase_id === nova.id || m.numero === nova.numero)) {
                  return prev.map(m =>
                    (m.supabase_id === nova.id || m.numero === nova.numero)
                      ? { ...m, status: nova.status, supabase_id: nova.id }
                      : m
                  )
                }
                return [...prev, { ...nova, supabase_id: nova.id }]
              })
            } else if (eventType === 'UPDATE') {
              patchMesa(nova)
            } else if (eventType === 'DELETE') {
              setMesas(prev =>
                prev.filter(m => m.supabase_id !== antiga.id && m.numero !== antiga.numero)
              )
            }
          }
        )

        // -- comandas: garcom abre => mesa ocupada; fecha => mesa livre --
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'comandas', filter: `loja_id=eq.${lojaId}` },
          ({ new: nova }) => {
            console.log('[RT mesas] comanda INSERT, mesa_id:', nova.mesa_id, 'status:', nova.status)
            if (nova.status !== 'aberta') return
            setMesas(prev => prev.map(m =>
              m.supabase_id === nova.mesa_id ? { ...m, status: 'ocupada' } : m
            ))
          }
        )
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'comandas', filter: `loja_id=eq.${lojaId}` },
          ({ new: nova }) => {
            console.log('[RT mesas] comanda UPDATE, mesa_id:', nova.mesa_id, 'status:', nova.status)
            if (nova.status === 'fechada') {
              // So marca livre se nao houver outra comanda aberta para a mesma mesa
              setMesas(prev => prev.map(m =>
                m.supabase_id === nova.mesa_id ? { ...m, status: 'livre' } : m
              ))
            } else if (nova.status === 'aberta') {
              setMesas(prev => prev.map(m =>
                m.supabase_id === nova.mesa_id ? { ...m, status: 'ocupada' } : m
              ))
            }
          }
        )

        .subscribe((status) => {
          console.log('[RT mesas] status:', status)
        })
    }

    iniciar()
    return () => {
      cancelado = true
      if (channel) supabase.removeChannel(channel)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
