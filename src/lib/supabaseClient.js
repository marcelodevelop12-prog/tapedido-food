import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://xckystaizmgubayuwtsx.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhja3lzdGFpem1ndWJheXV3dHN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2OTMyMTAsImV4cCI6MjA5NDI2OTIxMH0.kTXm_Vk9cF8shEcUZxOch50eaV9AXNgsjaElGl_Ctqk'

// O renderer assina canais de realtime direto (useRealtimeMesas, useRealtimePedidos,
// useRealtimeComandaItens, Mesas.jsx), então precisa do mesmo JWT que o processo
// main — senão, no dia em que as políticas passarem a exigir a claim `loja_id`,
// as consultas do main continuariam funcionando e só o realtime da tela cairia.
//
// Quem obtém e renova o token é o main (electron/sessaoSupabase.js); aqui é só
// leitura via IPC. Sem token — ou fora do Electron — cai na chave anon e o
// comportamento é o de hoje.
const buscarToken = async () => {
  try {
    const t = await window.api?.sessao?.token()
    return t || SUPABASE_ANON_KEY
  } catch {
    return SUPABASE_ANON_KEY
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  accessToken: buscarToken,
  realtime: { params: { eventsPerSecond: 10 } },
})
