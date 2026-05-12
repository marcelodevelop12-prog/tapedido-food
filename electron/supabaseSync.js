const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const ws = require('ws')

const SUPABASE_URL = 'https://tcgsvatpkobjhmnvyhxl.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjZ3N2YXRwa29iamhtbnZ5aHhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNjQ2MjAsImV4cCI6MjA5MDc0MDYyMH0.0z6G8I9JwLLml2CCjkgL7yM_6nLvVKdqSzqtVPzd1gE'
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

    try {
      await sb().from('configuracoes').insert({
        loja_id: lojaId,
        codigo_garcom: '1234',
      })
    } catch {}

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
    await sb().from('mesas').insert({
      id: mesa.supabase_id,
      loja_id: lojaId,
      numero: mesa.numero,
      status: mesa.status || 'livre',
    })
  } catch {}
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

async function sincronizarTodasMesas(lojaId, mesas) {
  if (!lojaId || !mesas?.length) return []
  try {
    const mapeamento = mesas.map(m => ({
      localId: m.id,
      supabaseId: m.supabase_id || crypto.randomUUID(),
      numero: m.numero,
      status: m.status || 'livre',
    }))
    const rows = mapeamento.map(({ supabaseId, numero, status }) => ({
      id: supabaseId,
      loja_id: lojaId,
      numero,
      status,
    }))
    const { error } = await sb().from('mesas').upsert(rows, { onConflict: 'id' })
    if (error) return []
    return mapeamento.map(({ localId, supabaseId }) => ({ localId, supabaseId }))
  } catch {
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
}
