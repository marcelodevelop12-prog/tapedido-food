const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
const updater = require('./updater')
const supabaseSync = require('./supabaseSync')

let mainWindow
let estaEmDemo = false

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'default',
    title: 'TáPedido Food',
    icon: path.join(__dirname, '../assets/icons/icon.png'),
    show: false,
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    mainWindow.maximize()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  // ── Database handlers ────────────────────────────────────────────────────
  // Must be inside whenReady so app.getPath('userData') is available in db.js
  const db = require('./database/db')

  // Licença
  ipcMain.handle('licenca:verificar', () => db.licenca.verificar())
  ipcMain.handle('licenca:ativar', (_, chave) => db.licenca.ativar(chave))
  ipcMain.handle('licenca:ativarDemo', () => {
    estaEmDemo = true
    return db.licenca.ativarDemo()
  })
  ipcMain.handle('licenca:resetar', () => db.licenca.resetar())
  ipcMain.handle('licenca:verificarPeriodico', () => db.licenca.verificarPeriodicamente())
  ipcMain.handle('licenca:info', () => db.licenca.info())

  // Loja
  ipcMain.handle('loja:get', () => db.loja.get())
  ipcMain.handle('loja:update', (_, dados) => db.loja.update(dados))

  // Produtos / Cardápio
  ipcMain.handle('produtos:listar', () => db.produtos.listar())
  ipcMain.handle('produtos:criar', (_, dados) => db.produtos.criar(dados))
  ipcMain.handle('produtos:atualizar', (_, dados) => db.produtos.atualizar(dados))
  ipcMain.handle('produtos:deletar', (_, id) => db.produtos.deletar(id))
  ipcMain.handle('produtos:toggleDisponivel', (_, id) => db.produtos.toggleDisponivel(id))

  // Categorias
  ipcMain.handle('categorias:listar', () => db.categorias.listar())
  ipcMain.handle('categorias:criar', (_, dados) => db.categorias.criar(dados))

  // Mesas
  ipcMain.handle('mesas:listar', () => db.mesas.listar())
  ipcMain.handle('mesas:criar', (_, dados) => db.mesas.criar(dados))
  ipcMain.handle('mesas:atualizar', (_, dados) => db.mesas.atualizar(dados))
  ipcMain.handle('mesas:deletar', (_, id) => db.mesas.deletar(id))

  // Comandas
  ipcMain.handle('comandas:abrir', (_, mesaId) => db.comandas.abrir(mesaId))
  ipcMain.handle('comandas:fechar', (_, id) => db.comandas.fechar(id))
  ipcMain.handle('comandas:getByMesa', (_, mesaId) => db.comandas.getByMesa(mesaId))
  ipcMain.handle('comandas:addItem', (_, dados) => db.comandas.addItem(dados))
  ipcMain.handle('comandas:removeItem', (_, id) => db.comandas.removeItem(id))
  ipcMain.handle('comandas:listarAbertas', () => db.comandas.listarAbertas())

  // Pedidos
  ipcMain.handle('pedidos:listar', (_, filtros) => db.pedidos.listar(filtros))
  ipcMain.handle('pedidos:criar', (_, dados) => db.pedidos.criar(dados))
  ipcMain.handle('pedidos:atualizar', (_, dados) => db.pedidos.atualizar(dados))
  ipcMain.handle('pedidos:getById', (_, id) => db.pedidos.getById(id))
  ipcMain.handle('pedidos:dashboard', () => db.pedidos.dashboard())

  // Estoque
  ipcMain.handle('estoque:listar', () => db.estoque.listar())
  ipcMain.handle('estoque:movimentar', (_, dados) => db.estoque.movimentar(dados))
  ipcMain.handle('estoque:alertas', () => db.estoque.alertas())
  ipcMain.handle('estoque:historico', (_, produtoId) => db.estoque.historico(produtoId))

  // Caixa
  ipcMain.handle('caixa:sessaoAtual', () => db.caixa.sessaoAtual())
  ipcMain.handle('caixa:abrir', (_, dados) => db.caixa.abrir(dados))
  ipcMain.handle('caixa:fechar', (_, dados) => db.caixa.fechar(dados))
  ipcMain.handle('caixa:sangria', (_, dados) => db.caixa.sangria(dados))
  ipcMain.handle('caixa:suprimento', (_, dados) => db.caixa.suprimento(dados))
  ipcMain.handle('caixa:movimentacoes', (_, sessaoId) => db.caixa.movimentacoes(sessaoId))
  ipcMain.handle('caixa:resumo', (_, sessaoId) => db.caixa.resumo(sessaoId))

  // Financeiro
  ipcMain.handle('financeiro:contasPagar', () => db.financeiro.contasPagar())
  ipcMain.handle('financeiro:contasReceber', () => db.financeiro.contasReceber())
  ipcMain.handle('financeiro:criarContaPagar', (_, dados) => db.financeiro.criarContaPagar(dados))
  ipcMain.handle('financeiro:criarContaReceber', (_, dados) => db.financeiro.criarContaReceber(dados))
  ipcMain.handle('financeiro:pagarConta', (_, id) => db.financeiro.pagarConta(id))
  ipcMain.handle('financeiro:receberConta', (_, id) => db.financeiro.receberConta(id))
  ipcMain.handle('financeiro:fluxoCaixa', (_, periodo) => db.financeiro.fluxoCaixa(periodo))

  // Fornecedores
  ipcMain.handle('fornecedores:listar', () => db.fornecedores.listar())
  ipcMain.handle('fornecedores:criar', (_, dados) => db.fornecedores.criar(dados))
  ipcMain.handle('fornecedores:atualizar', (_, dados) => db.fornecedores.atualizar(dados))

  // Entregadores
  ipcMain.handle('entregadores:listar', () => db.entregadores.listar())
  ipcMain.handle('entregadores:criar', (_, dados) => db.entregadores.criar(dados))

  // Zonas de entrega
  ipcMain.handle('zonas:listar', () => db.zonas.listar())
  ipcMain.handle('zonas:criar', (_, dados) => db.zonas.criar(dados))
  ipcMain.handle('zonas:atualizar', (_, dados) => db.zonas.atualizar(dados))
  ipcMain.handle('zonas:deletar', (_, id) => db.zonas.deletar(id))

  // Relatórios
  ipcMain.handle('relatorios:vendas', (_, periodo) => db.relatorios.vendas(periodo))
  ipcMain.handle('relatorios:produtosMaisVendidos', (_, periodo) => db.relatorios.produtosMaisVendidos(periodo))
  ipcMain.handle('relatorios:estoque', () => db.relatorios.estoque())

  // Configurações
  ipcMain.handle('config:get', () => db.config.get())
  ipcMain.handle('config:update', (_, dados) => db.config.update(dados))
  ipcMain.handle('config:resetDemo', () => db.config.resetDemo())

  // Impressão
  ipcMain.handle('impressao:comanda', (_, dados) => db.impressao.comanda(dados))
  ipcMain.handle('impressao:recibo', (_, dados) => db.impressao.recibo(dados))

  // Diálogo de arquivo
  ipcMain.handle('dialog:openFile', async (_, options) => {
    const result = await dialog.showOpenDialog(mainWindow, options)
    return result
  })

  // Upload de imagem do produto — abre seletor, copia para userData/images/, retorna file:// URL
  ipcMain.handle('imagem:salvar', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    })
    if (result.canceled || !result.filePaths.length) return null

    const src = result.filePaths[0]
    const imagesDir = path.join(app.getPath('userData'), 'images')
    if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true })

    const ext = path.extname(src)
    const dest = path.join(imagesDir, `img_${Date.now()}${ext}`)
    fs.copyFileSync(src, dest)

    // Return a file:// URL so Electron's renderer can load it directly
    return 'file:///' + dest.replace(/\\/g, '/')
  })

  // Abre URL no navegador padrão do sistema
  ipcMain.handle('shell:openExternal', (_, url) => shell.openExternal(url))

  // ── Supabase / App Garçom ─────────────────────────────────────────────────
  ipcMain.handle('supabase:statusConexao', () => supabaseSync.verificarConexao())

  ipcMain.handle('supabase:sincronizarLoja', async () => {
    try {
      const cfg = db.config.get()
      console.log('[SYNC] cfg atual:', JSON.stringify(cfg))
      if (cfg?.supabase_loja_id) {
        return { sucesso: true, codigoLoja: cfg.codigo_loja, jaExistia: true }
      }
      const loja = db.loja.get()
      console.log('[SYNC] loja local:', JSON.stringify(loja))
      const nomeLoja = loja?.nome || 'Minha Loja'
      const resultado = await supabaseSync.criarLoja(db.getRawDb(), nomeLoja)
      console.log('[SYNC] resultado criarLoja:', JSON.stringify(resultado))
      if (!resultado) return { sucesso: false, erro: 'Não foi possível conectar ao Supabase' }
      const updateResult = db.config.update({ supabase_loja_id: resultado.lojaId, codigo_loja: resultado.codigoLoja })
      console.log('[SYNC] update config:', JSON.stringify(updateResult))

      // Sincroniza mesas existentes com o Supabase
      const mesas = db.mesas.listar()
      if (mesas.length > 0) {
        const mapeamento = await supabaseSync.sincronizarTodasMesas(resultado.lojaId, mesas)
        const rawDb = db.getRawDb()
        for (const { localId, supabaseId } of mapeamento) {
          rawDb.prepare('UPDATE mesas SET supabase_id = ? WHERE id = ?').run(supabaseId, localId)
        }
        console.log('[SYNC] mesas sincronizadas:', mapeamento.length)
      }

      return { sucesso: true, codigoLoja: resultado.codigoLoja }
    } catch (err) {
      console.error('[SYNC] erro geral:', err)
      return { sucesso: false, erro: err.message }
    }
  })

  ipcMain.handle('garcons:listar', async () => {
    const cfg = db.config.get()
    if (!cfg?.supabase_loja_id) return []
    return supabaseSync.listarGarcons(cfg.supabase_loja_id)
  })

  ipcMain.handle('garcons:adicionar', async (_, nome, codigo) => {
    const cfg = db.config.get()
    if (!cfg?.supabase_loja_id) throw new Error('Loja ainda não configurada no Supabase')
    return supabaseSync.adicionarGarcom(cfg.supabase_loja_id, nome, codigo)
  })

  ipcMain.handle('garcons:deletar', async (_, id) => {
    return supabaseSync.deletarGarcom(id)
  })

  // ── Balança serial ────────────────────────────────────────────────────────
  const balanca = require('./balanca')

  ipcMain.handle('balanca:listarPortas', () => balanca.listarPortas())

  ipcMain.handle('balanca:conectar', (_, porta, baud) => {
    return balanca.conectar(porta, baud, (peso) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('balanca:peso', peso)
      }
    })
  })

  ipcMain.handle('balanca:desconectar', () => {
    balanca.desconectar()
    return true
  })

  ipcMain.handle('balanca:status', () => balanca.estaConectado())

  // Update handlers
  updater.registrarHandlers()

  console.log('handlers registered')

  createWindow()
  updater.setupUpdater(mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  // Wipe demo data so the next launch starts fresh with the activation screen
  if (estaEmDemo) {
    try {
      const db = require('./database/db')
      db.licenca.limparDadosDemo()
    } catch {}
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
