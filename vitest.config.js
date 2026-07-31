import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Sem isto o Vite procura o postcss.config.js do projeto, que usa `export
  // default`; o Node 18 do Electron o carrega como CommonJS e quebra com
  // "Unexpected token 'export'". Nenhum teste daqui toca em CSS, entao a lista
  // vazia so desliga a busca pelo arquivo.
  css: { postcss: { plugins: [] } },
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    // Cada arquivo de teste abre seu proprio SQLite e mexe em
    // process.env.TAPEDIDO_DB_PATH, que e global ao processo. Rodar em paralelo
    // criaria corrida por esse env var e o erro apareceria como falha aleatoria.
    fileParallelism: false,
    testTimeout: 20000,
  },
})
