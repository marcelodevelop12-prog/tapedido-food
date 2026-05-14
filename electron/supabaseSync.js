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

// â"€â"€ Helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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

    // Converte file:///C:/... -> C:\...  no Windows
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

// â"€â"€ Tarefa 1 â€" Criacao de loja â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

async function criarLoja(db, nomeLoja) {
  try {
    const lojaId = crypto.randomUUID()
    const codigoLoja = gerarCodigoLoja()

    const { error: errLoja } = await sb().from('lojas').insert({
      id: lojaId,
      nome: nomeLoja || 'Minha Loja',
      cor_primaria: '#F97316',
      plano: 'compartilhado',
      codigo_loja: codigoLoja,
      ativo: true,
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
      // Tenta UPDATE caso a linha jÃ¡ exista
      await sb().from('configuracoes').update({ codigo_loja: codigoLoja }).eq('loja_id', lojaId)
    }

    salvarLog(db, 'criar_loja', 'sucesso')
    return { lojaId, codigoLoja }
  } catch (err) {
    console.error('[supabaseSync] excecao em criarLoja:', err)
    salvarLog(db, 'criar_loja', 'erro', err.message)
    return null
  }
}

// â"€â"€ Tarefa 2 â€" Sincronizacao de produtos â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

async function sincronizarProdutoCriado(db, produto, lojaId) {
  if (!lojaId) return
  try {
    const supabaseId = produto.supabase_id || crypto.randomUUID()

    // Salva o supabase_id localmente se ainda nao estava definido
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
    // Deleta imagem do Storage se for URL publica do Supabase
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

// â"€â"€ Status de conexao â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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

// â"€â"€ Garcons â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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

// â"€â"€ Mesas â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

async function sincronizarMesaCriada(lojaId, mesa) {
  if (!lojaId) return null
  const { error } = await sb().from('mesas').insert({
    id: mesa.supabase_id,
    loja_id: lojaId,
    numero: mesa.numero,
    status: mesa.status || 'livre',
  })
  if (!error) {
    console.log('[supabaseSync] sincronizarMesaCriada OK: mesa', mesa.numero, mesa.supabase_id)
    return mesa.supabase_id
  }

  console.error('[supabaseSync] sincronizarMesaCriada ERRO:', error.message, error.code, error.details)

  // Conflict: mesa with same numero already exists in Supabase (previous sync).
  // Fetch existing id so SQLite uses the same UUID the garcom app already knows.
  try {
    const { data: existente } = await sb()
      .from('mesas')
      .select('id')
      .eq('loja_id', lojaId)
      .eq('numero', mesa.numero)
      .maybeSingle()
    if (existente?.id) {
      console.log('[supabaseSync] sincronizarMesaCriada: reusing existing id', existente.id, 'for mesa', mesa.numero)
      return existente.id
    }
  } catch (e) {
    console.error('[supabaseSync] sincronizarMesaCriada fallback error:', e.message)
  }
  return null
}

async function sincronizarMesaAtualizada(lojaId, mesa) {
  if (!lojaId || !mesa.supabase_id) return
  const { error } = await sb().from('mesas').update({
    numero: mesa.numero,
    status: mesa.status || 'livre',
  }).eq('id', mesa.supabase_id)
  if (error) {
    console.error('[supabaseSync] sincronizarMesaAtualizada ERRO:', error.message, error.code)
  }
}

async function sincronizarMesaDeletada(supabaseId) {
  if (!supabaseId) return
  const { error } = await sb().from('mesas').delete().eq('id', supabaseId)
  if (error) {
    console.error('[supabaseSync] sincronizarMesaDeletada ERRO:', error.message, error.code)
  }
}

async function fecharComandaSupabase(mesaSupabaseId) {
  if (!mesaSupabaseId) {
    console.error('[supabaseSync] fecharComandaSupabase: mesaSupabaseId e null/undefined â€" abortando')
    return
  }

  console.log('[supabaseSync] fecharComandaSupabase: iniciando para mesa.supabase_id =', mesaSupabaseId)

  // Fecha a comanda ativa no Supabase â€" erros aqui nao bloqueiam o UPDATE da mesa
  try {
    const { data: dataComanda, error: errComanda } = await sb()
      .from('comandas')
      .update({ status: 'fechada', fechado_em: new Date().toISOString() })
      .eq('mesa_id', mesaSupabaseId)
      .eq('status', 'aberta')
      .select('id')
    if (errComanda) {
      console.error('[supabaseSync] UPDATE comandas -> ERRO:', errComanda.message, errComanda.details)
    } else {
      console.log('[supabaseSync] UPDATE comandas -> OK, linhas afetadas:', dataComanda?.length ?? 0)
    }
  } catch (e) {
    console.error('[supabaseSync] UPDATE comandas -> excecao:', e.message)
  }

  // Libera a mesa no Supabase
  try {
    const { data: dataMesa, error: errMesa } = await sb()
      .from('mesas')
      .update({ status: 'livre' })
      .eq('id', mesaSupabaseId)
      .select('id, status')
    if (errMesa) {
      console.error('[supabaseSync] UPDATE mesas -> ERRO:', errMesa.message, errMesa.details)
    } else {
      console.log('[supabaseSync] UPDATE mesas -> OK:', dataMesa)
    }
  } catch (e) {
    console.error('[supabaseSync] UPDATE mesas -> excecao:', e.message)
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
    console.error('[supabaseSync] sincronizarTodasMesas excecao:', err?.message || err)
    return []
  }
}


// Reconcile supabase_ids on startup.
// Ensures SQLite mesas use the same UUID as Supabase (and the garcom app).
// Called once when the app starts. rawDb = better-sqlite3 instance.
async function reconciliarMesasStartup(rawDb, lojaId) {
  if (!lojaId) return
  try {
    const { data: remotas, error } = await sb()
      .from('mesas')
      .select('id, numero')
      .eq('loja_id', lojaId)

    if (error || !remotas?.length) return

    const locais = rawDb.prepare('SELECT id, numero, supabase_id FROM mesas').all()
    let atualizadas = 0

    for (const local of locais) {
      const remota = remotas.find(r => r.id === local.supabase_id || r.numero === local.numero)
      if (remota && remota.id !== local.supabase_id) {
        rawDb.prepare('UPDATE mesas SET supabase_id = ? WHERE id = ?').run(remota.id, local.id)
        console.log('[supabaseSync] reconciliar: mesa', local.numero, local.supabase_id, '->', remota.id)
        atualizadas++
      }
    }

    if (atualizadas > 0) {
      console.log('[supabaseSync] reconciliar: fixed', atualizadas, 'mesa(s)')
    }
  } catch (e) {
    console.error('[supabaseSync] reconciliarMesasStartup error:', e.message)
  }
}

// ── Realtime ──────────────────────────────────────────────────────────────────

function iniciarRealtime(lojaId, mainWindow, db) {
  if (!lojaId) return

  sb().channel('pdv-realtime')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'comanda_itens',
    }, (payload) => {
      console.log('[Realtime] comanda_itens INSERT:', payload.new)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('realtime:novoItem', payload.new)
      }
    })
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'comandas',
      filter: `loja_id=eq.${lojaId}`,
    }, (payload) => {
      console.log('[Realtime] comandas UPDATE:', payload.new)
      if (payload.new.status !== 'fechada') return
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('realtime:comandaFechada', payload.new)
      }
      // Registra venda no caixa automaticamente
      try {
        const formaPagamento = payload.new.forma_pagamento || 'dinheiro'
        const total = payload.new.total || 0
        if (total > 0) {
          db.caixa.registrarVenda({
            formaPagamento,
            valor: total,
            descricao: `Mesa fechada pelo garçom`,
          })
          console.log('[Realtime] venda registrada no caixa:', total, formaPagamento)
        }
      } catch (err) {
        console.error('[Realtime] erro ao registrar venda:', err.message)
      }
    })
    .subscribe((status) => {
      console.log('[Realtime] status:', status)
    })
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
  reconciliarMesasStartup,
  fecharComandaSupabase,
  iniciarRealtime,
}

