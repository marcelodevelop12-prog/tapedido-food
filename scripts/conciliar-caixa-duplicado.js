/**
 * Remove os lançamentos duplicados de caixa gerados pelo eco do realtime.
 *
 * Contexto: até a correção, fechar uma mesa pelo PDV lançava a venda duas
 * vezes — uma pelo próprio PDV e outra quando o listener de realtime recebia
 * o eco da própria alteração. O lançamento-eco sempre tem a descrição
 * "Mesa fechada pelo garçom", forma de pagamento "dinheiro" e acontece
 * poucos segundos depois do lançamento verdadeiro.
 *
 * Este script identifica esses pares, remove o eco e desconta o valor do
 * total da sessão correspondente.
 *
 * Roda via Electron porque o better-sqlite3 do projeto é compilado para o ABI
 * dele, não para o do Node instalado.
 *
 * Uso (com o PDV FECHADO):
 *   npx electron scripts/conciliar-caixa-duplicado.js            → simula
 *   npx electron scripts/conciliar-caixa-duplicado.js --apply    → aplica
 *   npx electron scripts/conciliar-caixa-duplicado.js --db <path>
 */
const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')

const DESCRICAO_ECO = 'Mesa fechada pelo garçom'
const JANELA_SEGUNDOS = 5

const args = process.argv.slice(2)
const aplicar = args.includes('--apply')
const idxDb = args.indexOf('--db')
const dbPath = idxDb >= 0
  ? args[idxDb + 1]
  : path.join(process.env.APPDATA || '', 'tapedido-food', 'tapedido.db')

if (!fs.existsSync(dbPath)) {
  console.error('Banco não encontrado:', dbPath)
  process.exit(1)
}

const db = new Database(dbPath)

const vendas = db.prepare(`
  SELECT id, sessao_id, forma_pagamento, valor, descricao, criado_em
  FROM caixa_movimentacoes
  WHERE tipo LIKE 'venda%'
  ORDER BY criado_em
`).all()

const emSegundos = (iso) => new Date(iso).getTime() / 1000

// Um eco só é eco se houver um lançamento real logo antes dele.
const ecos = []
vendas.forEach((mov, i) => {
  if (mov.descricao !== DESCRICAO_ECO) return
  for (let j = i - 1; j >= 0; j--) {
    const anterior = vendas[j]
    if (anterior.descricao === DESCRICAO_ECO) continue
    const delta = emSegundos(mov.criado_em) - emSegundos(anterior.criado_em)
    if (delta >= 0 && delta <= JANELA_SEGUNDOS) ecos.push({ eco: mov, original: anterior, delta })
    break
  }
})

if (ecos.length === 0) {
  console.log('Nenhum lançamento duplicado encontrado. Nada a fazer.')
  process.exit(0)
}

console.log(`Banco: ${dbPath}`)
console.log(`\n${ecos.length} lançamento(s) duplicado(s):\n`)
const porSessao = new Map()
for (const { eco, original, delta } of ecos) {
  console.log(
    `  id ${String(original.id).padStart(3)} ${original.descricao.slice(0, 12).padEnd(12)} ` +
    `${original.forma_pagamento.padEnd(9)} R$ ${original.valor.toFixed(2).padStart(7)}` +
    `   ->  remover eco id ${String(eco.id).padStart(3)} ` +
    `${eco.forma_pagamento.padEnd(9)} R$ ${eco.valor.toFixed(2).padStart(7)}  (+${delta.toFixed(1)}s)`
  )
  const chave = `${eco.sessao_id}|${eco.forma_pagamento}`
  porSessao.set(chave, (porSessao.get(chave) || 0) + eco.valor)
}

const total = ecos.reduce((a, b) => a + b.eco.valor, 0)
console.log(`\n  Total a estornar: R$ ${total.toFixed(2)}\n`)

console.log('Ajuste nos totais das sessões:')
const colMap = { dinheiro: 'total_dinheiro', pix: 'total_pix', debito: 'total_debito', credito: 'total_credito' }
for (const [chave, valor] of porSessao) {
  const [sessaoId, forma] = chave.split('|')
  const col = colMap[forma]
  const atual = db.prepare(`SELECT ${col} v FROM caixa_sessoes WHERE id = ?`).get(sessaoId)
  console.log(`  sessão ${sessaoId}: ${col} ${atual.v.toFixed(2)} -> ${(atual.v - valor).toFixed(2)}`)
}

// ── Etapa 2 ──────────────────────────────────────────────────────────────────
// Vendas gravadas com a forma de pagamento acentuada/maiúscula ("Débito",
// "PIX") vindas do app do garçom não batiam no colMap, então entraram na lista
// de movimentações mas nunca somaram no total da sessão. São vendas de verdade:
// aqui a forma é normalizada e o valor é somado à coluna correta.
const normalizar = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()

const naoNormalizadas = db.prepare(`
  SELECT id, sessao_id, forma_pagamento, valor
  FROM caixa_movimentacoes
  WHERE tipo LIKE 'venda%'
`).all().filter(m => m.forma_pagamento !== normalizar(m.forma_pagamento))

const faltantes = new Map()
for (const m of naoNormalizadas) {
  const chave = `${m.sessao_id}|${normalizar(m.forma_pagamento)}`
  faltantes.set(chave, (faltantes.get(chave) || 0) + m.valor)
}

if (naoNormalizadas.length > 0) {
  const totalFaltante = naoNormalizadas.reduce((a, b) => a + b.valor, 0)
  console.log(`\n${naoNormalizadas.length} venda(s) real(is) que nunca somaram no total da sessão (R$ ${totalFaltante.toFixed(2)}):`)
  for (const [chave, valor] of faltantes) {
    const [sessaoId, forma] = chave.split('|')
    const col = colMap[forma]
    if (!col) { console.log(`  sessão ${sessaoId}: forma "${forma}" sem coluna — ignorada`); continue }
    const atual = db.prepare(`SELECT ${col} v FROM caixa_sessoes WHERE id = ?`).get(sessaoId)
    console.log(`  sessão ${sessaoId}: ${col} ${atual.v.toFixed(2)} -> ${(atual.v + valor).toFixed(2)}`)
  }
}

if (!aplicar) {
  console.log('\nSIMULAÇÃO — nada foi alterado. Rode com --apply para aplicar.')
  process.exit(0)
}

const backup = `${dbPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`
fs.copyFileSync(dbPath, backup)
console.log(`\nBackup criado: ${backup}`)

const executar = db.transaction(() => {
  for (const { eco } of ecos) {
    db.prepare('DELETE FROM caixa_movimentacoes WHERE id = ?').run(eco.id)
  }
  for (const [chave, valor] of porSessao) {
    const [sessaoId, forma] = chave.split('|')
    const col = colMap[forma]
    if (col) {
      db.prepare(`UPDATE caixa_sessoes SET ${col} = ${col} - ? WHERE id = ?`).run(valor, sessaoId)
    }
  }

  // Etapa 2: normaliza a forma e recupera os valores que faltaram nos totais
  for (const m of naoNormalizadas) {
    db.prepare('UPDATE caixa_movimentacoes SET forma_pagamento = ? WHERE id = ?')
      .run(normalizar(m.forma_pagamento), m.id)
  }
  for (const [chave, valor] of faltantes) {
    const [sessaoId, forma] = chave.split('|')
    const col = colMap[forma]
    if (col) {
      db.prepare(`UPDATE caixa_sessoes SET ${col} = ${col} + ? WHERE id = ?`).run(valor, sessaoId)
    }
  }
})
executar()

console.log(`\nAPLICADO`)
console.log(`  ${ecos.length} lançamento(s) duplicado(s) removido(s): -R$ ${total.toFixed(2)}`)
console.log(`  ${naoNormalizadas.length} venda(s) recuperada(s) nos totais da sessão`)
// Necessário: sob Electron o processo não encerra sozinho ao fim do script.
process.exit(0)
