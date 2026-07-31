const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

/**
 * Abre uma instancia limpa do modulo de banco, com schema aplicado, num arquivo
 * temporario proprio.
 *
 * Por que recarregar o modulo: `db.js` abre a conexao no momento do require e
 * guarda tudo em escopo de modulo. Sem limpar o cache, o segundo teste
 * receberia a conexao do primeiro, com os dados dele dentro.
 */
function abrirBancoLimpo() {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'tapedido-teste-'))
  const arquivo = path.join(pasta, 'teste.db')
  process.env.TAPEDIDO_DB_PATH = arquivo

  const caminhoModulo = require.resolve('../../electron/database/db.js')
  delete require.cache[caminhoModulo]
  const db = require(caminhoModulo)

  return {
    db,
    fechar() {
      try { db.getRawDb().close() } catch {}
      delete require.cache[caminhoModulo]
      delete process.env.TAPEDIDO_DB_PATH
      try { fs.rmSync(pasta, { recursive: true, force: true }) } catch {}
    },
  }
}

module.exports = { abrirBancoLimpo }
