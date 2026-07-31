// Sessão do PDV no Supabase: troca a licença por um JWT que carrega a claim
// `loja_id`.
//
// POR QUE
// Hoje o PDV fala com o Supabase usando a chave anon crua. Ela é pública e
// anônima: o servidor não tem como saber qual loja está do outro lado. Por isso
// as tabelas de dados ainda estão com política `using (true)` — qualquer um com
// um curl lê e escreve dados de todos os clientes. Mandar `loja_id` num header
// não resolve, porque quem controla o valor é o próprio cliente.
//
// A Edge Function `entrar` confere licença + machine_id e devolve um token
// assinado pelo servidor. Com ele as políticas passam a poder ser:
//
//   using ((auth.jwt() ->> 'loja_id')::uuid = loja_id)
//
// ENQUANTO A VIRADA NÃO ACONTECE
// `tokenAtual()` devolve a chave anon quando não há token válido. É o fallback
// que permite publicar esta versão antes de fechar o RLS: sem token, o app se
// comporta exatamente como antes. O corte só acontece quando as políticas
// mudarem — e isso é feito no servidor, sem release novo.
//
// O token NÃO é o que bloqueia licença revogada; disso cuida a
// `licenca-verificar`. Aqui ele só carrega identidade.
const fs = require('fs')
const path = require('path')

const SUPABASE_URL = 'https://xckystaizmgubayuwtsx.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhja3lzdGFpem1ndWJheXV3dHN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2OTMyMTAsImV4cCI6MjA5NDI2OTIxMH0.kTXm_Vk9cF8shEcUZxOch50eaV9AXNgsjaElGl_Ctqk'

// O token vale 30 dias; renova quando faltar menos que isso. Folga grande de
// propósito: PDV de restaurante fica dias sem internet decente.
const RENOVAR_FALTANDO_DIAS = 7

let arquivo = null
let sessao = null // { token, loja_id, expira_em }
let renovando = null // dedupe: várias chamadas concorrentes usam a mesma promise

function configurar(userDataPath) {
  arquivo = path.join(userDataPath || '.', 'sessao-supabase.json')
  try {
    if (fs.existsSync(arquivo)) sessao = JSON.parse(fs.readFileSync(arquivo, 'utf8'))
  } catch (err) {
    console.warn('[sessao] não consegui ler a sessão salva:', err.message)
    sessao = null
  }
}

function gravar(nova) {
  sessao = nova
  if (!arquivo) return
  try {
    // O token é credencial: só o dono do processo precisa conseguir ler.
    fs.writeFileSync(arquivo, JSON.stringify(nova), { mode: 0o600 })
  } catch (err) {
    // Não é fatal — o token continua em memória até o app fechar.
    console.warn('[sessao] não consegui gravar a sessão:', err.message)
  }
}

function limpar() {
  sessao = null
  if (!arquivo) return
  try { fs.existsSync(arquivo) && fs.unlinkSync(arquivo) } catch {}
}

function msAteVencer() {
  if (!sessao?.expira_em) return -1
  const t = Date.parse(sessao.expira_em)
  return Number.isNaN(t) ? -1 : t - Date.now()
}

function valida() {
  return Boolean(sessao?.token) && msAteVencer() > 0
}

// Chamada a cada requisição do supabase-js. Precisa ser barata e nunca lançar:
// se der qualquer problema, cai na chave anon e o app segue funcionando.
function tokenAtual() {
  try {
    return valida() ? sessao.token : SUPABASE_ANON_KEY
  } catch {
    return SUPABASE_ANON_KEY
  }
}

function lojaDoToken() {
  return valida() ? sessao.loja_id || null : null
}

function precisaRenovar() {
  return !valida() || msAteVencer() < RENOVAR_FALTANDO_DIAS * 86400 * 1000
}

// Devolve { sucesso, lojaId } | { sucesso: false, indisponivel } .
// `indisponivel` distingue "não consegui falar com o servidor" de "credencial
// recusada": no primeiro caso a sessão que já existe é preservada.
async function renovar({ chave, machineId, lojaId }) {
  if (!chave || !machineId) return { sucesso: false, motivo: 'sem licenca' }
  if (renovando) return renovando

  renovando = (async () => {
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/entrar`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tipo: 'pdv', chave, machine_id: machineId, loja_id: lojaId || undefined }),
      })

      if (resp.status >= 500) {
        // Função fora do ar ou JWT_SECRET não configurado: mantém o que tem.
        console.log('[sessao] entrar indisponível:', resp.status)
        return { sucesso: false, indisponivel: true }
      }

      const corpo = await resp.json().catch(() => null)

      if (!resp.ok || !corpo?.sucesso || !corpo?.token) {
        // Recusa explícita (403): a sessão guardada não vale mais nada.
        console.warn('[sessao] entrar recusou:', corpo?.erro || resp.status)
        limpar()
        return { sucesso: false, motivo: corpo?.erro || `HTTP ${resp.status}` }
      }

      gravar({ token: corpo.token, loja_id: corpo.loja_id, expira_em: corpo.expira_em })
      return { sucesso: true, lojaId: corpo.loja_id }
    } catch (err) {
      console.log('[sessao] entrar falhou:', err?.message || err)
      return { sucesso: false, indisponivel: true }
    } finally {
      renovando = null
    }
  })()

  return renovando
}

module.exports = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  configurar,
  tokenAtual,
  lojaDoToken,
  precisaRenovar,
  renovar,
  limpar,
}
