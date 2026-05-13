const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const ws = require('ws')

const SUPABASE_URL = 'https://xckystaizmgubayuwtsx.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhja3lzdGFpem1ndWJheXV3dHN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2OTMyMTAsImV4cCI6MjA5NDI2OTIxMH0.kTXm_Vk9cF8shEcUZxOch50eaV9AXNgsjaElGl_Ctqk'
const BUCKET = 'product-images'

let _supabase = null

function sb() {
  if (!_supabase) {
    _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: {
        transport: ws,
      },
      global: {
        fetch: fetch,
      },
    })
  }
  return _supabase
}

const agora = () => new Date().toISOString()

// ── Helpers ────────────────────────────────────────────────────────────────

function gerarCodigoLoja() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let codigo = ''
  for (let i = 0; i < 6; i++) {
    codigo += chars[Math.floor(Math.random() * chars.length)]
  }
  return codigo
}

function salvarLog(db, operacao, status, erro = null) {
  try {
    db.prepare(
      'INSERT INTO sync_logs (operacao, status, erro, created_at) VALUES (?, ?, ?, ?)'
    ).run(operacao, status, erro ? String(erro).slice(0, 500) : null, agora())
  } catch {}
}

function extrairStoragePath(publicUrl) {
  if (!publicUrl) return null
  try {
    const match = publicUrl.match(/\/storage\/v1\/object\/public\/product-images\/(.+)/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

async function garantirBucket() {
  try {
    const { data: buckets } = await sb().storage.listBuckets()
    const existe = (buckets || []).find(b => b.name === BUCKET)
    if (!existe) {
      await sb().storage.createBucket(BUCKET, { public: true })
    }
  } catch {}
}

async function uploadImagem(lojaId, supabaseId, imagemUrl) {
  if (!imagemUrl || !imagemUrl.startsWith('file:///')) return null
  try {
    await garantirBucket()

    // Converte file:///C:/... → C:\...  no Windows
    let filePath = imagemUrl.replace('file:///', '')
    if (process.platform === 'win32') {
      filePath = filePath.replace(/\//g, '\\')
      if (filePath.startsWith('\\') && filePath[2] === ':') {
        filePath = filePath.slice(1)
      }
    }

    if (!fs.existsSync(filePath)) return null

    const ext = path.extname(filePath).toLowerCase() || '.jpg'
    const mimeTypes = { '.png': 'image/png', '.webp': 'image/webp' }
    const mimeType = mimeTypes[ext] || 'image/jpeg'
    const storagePath = `${lojaId}/${supabaseId}${ext}`
    const buffer = fs.readFileSync(filePath)

    const { error } = await sb().storage.from(BUCKET).upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: true,
    })
    if (error) return null

    const { data } = sb().storage.from(BUCKET).getPublicUrl(storagePath)
    return data?.publicUrl || null
  } catch {
    return null
  }
}

async function deletarImagemStorage(storagePath) {
  if (!storagePath) return
  try {
    await sb().storage.from(BUCKET).remove([storagePath])
  } catch {}
}

// ── Tarefa 1 — Criação de loja ─────────────────────────────────────────────

async function criarLoja(db, nomeLoja) {
  try {
    const lojaId = crypto.randomUUID()
    const codigoLoja = gerarCodigoLoja()

    const { error: errLoja } = await sb().from('lojas').insert({
      id: lojaId,
      nome: nomeLoja || 'Minha Loja',
      cor_primaria: '#F97316',
      plano: 'compartilhado',
    })

    if (errLoja) {
      console.error('[supabaseSync] erro ao criar loja:', errLoja.message, errLoja.code, errLoja.details)
      salvarLog(db, 'criar_loja', 'erro', errLoja.message)
      return null
    }

    const { error: errCfg } = await sb().from('configuracoes').insert({
      loja_id: lojaId,
      codigo_garcom: '1234',
      codigo_loja: codigoLoja,
    })
    if (errCfg) {
      console.error('[supabaseSync] erro ao criar configuracoes:', errCfg.message, errCfg.code)
      // Tenta UPDATE caso a linha já exista
      await sb().from('configuracoes').update({ codigo_loja: codigoLoja }).eq('loja_id', lojaId)
    }

    salvarLog(db, 'criar_loja', 'sucesso')
    return { lojaId, codigoLoja }
  } catch (err) {
    console.error('[supabaseSync] exceção em criarLoja:', err)
    salvarLog(db, 'criar_loja', 'erro', err.message)
    return null
  }
}

// ── Tarefa 2 — Sincronização de produtos ──────────────────────────────────

async function sincronizarProdutoCriado(db, produto, lojaId) {
  if (!lojaId) return
  try {
    const supabaseId = produto.supabase_id || crypto.randomUUID()

    // Salva o supabase_id localmente se ainda não estava definido
    if (!produto.supabase_id) {
      db.prepare('UPDATE menu_items SET supabase_id = ? WHERE id = ?').run(supabaseId, produto.id)
    }

    let imagemUrl = produto.imagem || null
    if (imagemUrl && imagemUrl.startsWith('file:///')) {
      const url = await uploadImagem(lojaId, supabaseId, imagemUrl)
      if (url) {
        imagemUrl = url
        db.prepare('UPDATE menu_items SET imagem = ? WHERE id = ?').run(url, produto.id)
      }
    }

    const adicionais = produto.adicionais
      ? (typeof produto.adicionais === 'string' ? JSON.parse(produto.adicionais) : produto.adicionais)
      : []

    const { error } = await sb().from('menu_items').insert({
      id: supabaseId,
      loja_id: lojaId,
      name: produto.nome,
      description: produto.descricao || '',
      price: produto.preco,
      image: imagemUrl,
      category: produto.categoria || '',
      available: produto.disponivel !== 0,
      adicionais,
      sort_order: produto.sort_order || 0,
    })

    if (error) salvarLog(db, `produto_criar_${produto.id}`, 'erro', error.message)
    else salvarLog(db, `produto_criar_${produto.id}`, 'sucesso')
  } catch (err) {
    salvarLog(db, `produto_criar_${produto.id}`, 'erro', err.message)
  }
}

async function sincronizarProdutoAtualizado(db, produto, lojaId, imagemAnterior) {
  if (!lojaId || !produto.supabase_id) return
  try {
    let imagemUrl = produto.imagem || null

    if (imagemUrl && imagemUrl.startsWith('file:///')) {
      // Deleta imagem antiga do Storage se era uma URL do Supabase
      if (imagemAnterior && !imagemAnterior.startsWith('file:///')) {
        const oldPath = extrairStoragePath(imagemAnterior)
        if (oldPath) await deletarImagemStorage(oldPath)
      }

      const url = await uploadImagem(lojaId, produto.supabase_id, imagemUrl)
      if (url) {
        imagemUrl = url
        db.prepare('UPDATE menu_items SET imagem = ? WHERE id = ?').run(url, produto.id)
      }
    }

    const adicionais = produto.adicionais
      ? (typeof produto.adicionais === 'string' ? JSON.parse(produto.adicionais) : produto.adicionais)
      : []

    const { error } = await sb().from('menu_items').update({
      name: produto.nome,
      description: produto.descricao || '',
      price: produto.preco,
      image: imagemUrl,
      category: produto.categoria || '',
      available: produto.disponivel !== 0,
      adicionais,
      sort_order: produto.sort_order || 0,
    }).eq('id', produto.supabase_id)

    if (error) salvarLog(db, `produto_atualizar_${produto.id}`, 'erro', error.message)
    else salvarLog(db, `produto_atualizar_${produto.id}`, 'sucesso')
  } catch (err) {
    salvarLog(db, `produto_atualizar_${produto.id}`, 'erro', err.message)
  }
}

async function sincronizarProdutoDeletado(db, produtoSnapshot, lojaId) {
  if (!lojaId || !produtoSnapshot?.supabase_id) return
  try {
    // Deleta imagem do Storage se for URL pública do Supabase
    if (produtoSnapshot.imagem && !produtoSnapshot.imagem.startsWith('file:///')) {
      const storagePath = extrairStoragePath(produtoSnapshot.imagem)
      if (storagePath) await deletarImagemStorage(storagePath)
    }

    const { error } = await sb().from('menu_items').delete().eq('id', produtoSnapshot.supabase_id)
    if (error) salvarLog(db, `produto_deletar_${produtoSnapshot.id}`, 'erro', error.message)
    else salvarLog(db, `produto_deletar_${produtoSnapshot.id}`, 'sucesso')
  } catch (err) {
    salvarLog(db, `produto_deletar_${produtoSnapshot.id}`, 'erro', err.message)
  }
}

async function toggleDisponivelSupabase(db, supabaseId, disponivel) {
  if (!supabaseId) return
  try {
    const { error } = await sb().from('menu_items').update({ available: disponivel }).eq('id', supabaseId)
    if (error) salvarLog(db, `produto_toggle_${supabaseId}`, 'erro', error.message)
  } catch (err) {
    salvarLog(db, `produto_toggle_${supabaseId}`, 'erro', err.message)
  }
}

// ── Status de conexão ──────────────────────────────────────────────────────

async function verificarConexao() {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const { error } = await sb().from('lojas').select('id').limit(1)
    clearTimeout(timer)
    return !error
  } catch {
    return false
  }
}

// ── Garçons ────────────────────────────────────────────────────────────────

async function listarGarcons(lojaId) {
  try {
    const { data, error } = await sb()
      .from('garcons')
      .select('*')
      .eq('loja_id', lojaId)
      .eq('ativo', true)
      .order('nome')
    if (error) return []
    return data || []
  } catch {
    return []
  }
}

async function adicionarGarcom(lojaId, nome, codigo) {
  const { data, error } = await sb()
    .from('garcons')
    .insert({ loja_id: lojaId, nome, codigo, ativo: true })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

async function deletarGarcom(id) {
  const { error } = await sb().from('garcons').delete().eq('id', id)
  if (error) throw new Error(error.message)
  return { sucesso: true }
}

// ── Mesas ──────────────────────────────────────────────────────────────────

async function sincronizarMesaCriada(lojaId, mesa) {
  if (!lojaId) return
  try {
    const { error } = await sb().from('mesas').insert({
      id: mesa.supabase_id,
      loja_id: lojaId,
      numero: mesa.numero,
      nome: mesa.nome || `Mesa ${mesa.numero}`,
      status: mesa.status || 'livre',
    })
    if (error) {
      console.error('[supabaseSync] sincronizarMesaCriada ERRO:', error.message, error.code, error.details)
    } else {
      console.log('[supabaseSync] sincronizarMesaCriada OK: mesa', mesa.numero, '→ supabase_id', mesa.supabase_id)
    }
  } catch (err) {
    console.error('[supabaseSync] sincronizarMesaCriada exceção:', err?.message || err)
  }
}

async function sincronizarMesaAtualizada(lojaId, mesa) {
  if (!lojaId || !mesa.supabase_id) return
  try {
    await sb().from('mesas').update({
      numero: mesa.numero,
      status: mesa.status || 'livre',
    }).eq('id', mesa.supabase_id)
  } catch {}
}

async function sincronizarMesaDeletada(supabaseId) {
  if (!supabaseId) return
  try {
    await sb().from('mesas').delete().eq('id', supabaseId)
  } catch {}
}

async function fecharComandaSupabase(mesaSupabaseId) {
  if (!mesaSupabaseId) {
    console.error('[supabaseSync] fecharComandaSupabase: mesaSupabaseId é null/undefined — abortando')
    return
  }

  console.log('[supabaseSync] fecharComandaSupabase: iniciando para mesa.supabase_id =', mesaSupabaseId)

  // Fecha a comanda ativa no Supabase — erros aqui não bloqueiam o UPDATE da mesa
  try {
    const { data: dataComanda, error: errComanda } = await sb()
      .from('comandas')
      .update({ status: 'fechada', fechado_em: new Date().toISOString() })
      .eq('mesa_id', mesaSupabaseId)
      .eq('status', 'aberta')
      .select('id')
    if (errComanda) {
      console.error('[supabaseSync] UPDATE comandas → ERRO:', errComanda.message, errComanda.details)
    } else {
      console.log('[supabaseSync] UPDATE comandas → OK, linhas afetadas:', dataComanda?.length ?? 0)
    }
  } catch (e) {
    console.error('[supabaseSync] UPDATE comandas → exceção:', e.message)
  }

  // Libera a mesa no Supabase
  try {
    const { data: dataMesa, error: errMesa } = await sb()
      .from('mesas')
      .update({ status: 'livre' })
      .eq('id', mesaSupabaseId)
      .select('id, status')
    if (errMesa) {
      console.error('[supabaseSync] UPDATE mesas → ERRO:', errMesa.message, errMesa.details)
    } else {
      console.log('[supabaseSync] UPDATE mesas → OK:', dataMesa)
    }
  } catch (e) {
    console.error('[supabaseSync] UPDATE mesas → exceção:', e.message)
  }
}

async function sincronizarTodasMesas(lojaId, mesas) {
  if (!lojaId || !mesas?.length) return []
  try {
    const mapeamento = mesas.map(m => ({
      localId: m.id,
      supabaseId: m.supabase_id || crypto.randomUUID(),
      numero: m.numero,
      nome: m.nome || `Mesa ${m.numero}`,
      status: m.status || 'livre',
    }))
    const rows = mapeamento.map(({ supabaseId, numero, nome, status }) => ({
      id: supabaseId,
      loja_id: lojaId,
      numero,
      nome,
      status,
    }))
    console.log('[supabaseSync] sincronizarTodasMesas: enviando', rows.length, 'mesas para loja_id', lojaId)
    console.log('[supabaseSync] rows:', JSON.stringify(rows))
    const { error, data } = await sb().from('mesas').upsert(rows, { onConflict: 'id' })
    if (error) {
      console.error('[supabaseSync] sincronizarTodasMesas ERRO:', error.message, error.code, error.details, error.hint)
      return []
    }
    console.log('[supabaseSync] sincronizarTodasMesas OK:', mapeamento.length, 'mesas. data:', JSON.stringify(data))
    return mapeamento.map(({ localId, supabaseId }) => ({ localId, supabaseId }))
  } catch (err) {
    console.error('[supabaseSync] sincronizarTodasMesas exceção:', err?.message || err)
    return []
  }
}

module.exports = {
  criarLoja,
  sincronizarProdutoCriado,
  sincronizarProdutoAtualizado,
  sincronizarProdutoDeletado,
  toggleDisponivelSupabase,
  verificarConexao,
  listarGarcons,
  adicionarGarcom,
  deletarGarcom,
  salvarLog,
  gerarCodigoLoja,
  sincronizarMesaCriada,
  sincronizarMesaAtualizada,
  sincronizarMesaDeletada,
  sincronizarTodasMesas,
  fecharComandaSupabase,
}
