import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { abrirBancoLimpo } = require('./helpers/banco.js')

describe('infraestrutura de teste', () => {
  it('carrega o better-sqlite3 com o ABI do Electron', () => {
    // Se isto falhar com NODE_MODULE_VERSION, o teste nao esta rodando sob
    // ELECTRON_RUN_AS_NODE. Ver o script `test` no package.json.
    const db = new Database(':memory:')
    db.exec('CREATE TABLE t (id INTEGER, nome TEXT)')
    db.prepare('INSERT INTO t VALUES (?, ?)').run(1, 'ok')
    expect(db.prepare('SELECT nome FROM t WHERE id = 1').get().nome).toBe('ok')
    db.close()
  })
})

describe('isolamento entre testes', () => {
  it('cada abertura comeca com banco vazio', () => {
    const a = abrirBancoLimpo()
    a.db.mesas.criar({ numero: 1, capacidade: 4 })
    expect(a.db.mesas.listar()).toHaveLength(1)
    a.fechar()

    // Se o cache do modulo nao fosse limpo, esta mesa apareceria aqui.
    const b = abrirBancoLimpo()
    expect(b.db.mesas.listar()).toHaveLength(0)
    b.fechar()
  })
})
