const { contextBridge, ipcRenderer } = require('electron')

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args)

contextBridge.exposeInMainWorld('api', {
  // Licença
  licenca: {
    verificar: () => invoke('licenca:verificar'),
    ativar: (chave) => invoke('licenca:ativar', chave),
    ativarDemo: () => invoke('licenca:ativarDemo'),
    resetar: () => invoke('licenca:resetar'),
    verificarPeriodico: () => invoke('licenca:verificarPeriodico'),
    info: () => invoke('licenca:info'),
  },

  // Loja
  loja: {
    get: () => invoke('loja:get'),
    update: (dados) => invoke('loja:update', dados),
  },

  // Produtos
  produtos: {
    listar: () => invoke('produtos:listar'),
    criar: (dados) => invoke('produtos:criar', dados),
    atualizar: (dados) => invoke('produtos:atualizar', dados),
    deletar: (id) => invoke('produtos:deletar', id),
    toggleDisponivel: (id) => invoke('produtos:toggleDisponivel', id),
  },

  // Categorias
  categorias: {
    listar: () => invoke('categorias:listar'),
    criar: (dados) => invoke('categorias:criar', dados),
  },

  // Mesas
  mesas: {
    listar: () => invoke('mesas:listar'),
    criar: (dados) => invoke('mesas:criar', dados),
    atualizar: (dados) => invoke('mesas:atualizar', dados),
    deletar: (id) => invoke('mesas:deletar', id),
  },

  // Comandas
  comandas: {
    abrir: (mesaId) => invoke('comandas:abrir', mesaId),
    fechar: (id) => invoke('comandas:fechar', id),
    getByMesa: (mesaId) => invoke('comandas:getByMesa', mesaId),
    addItem: (dados) => invoke('comandas:addItem', dados),
    removeItem: (id) => invoke('comandas:removeItem', id),
    listarAbertas: () => invoke('comandas:listarAbertas'),
  },

  // Pedidos
  pedidos: {
    listar: (filtros) => invoke('pedidos:listar', filtros),
    criar: (dados) => invoke('pedidos:criar', dados),
    atualizar: (dados) => invoke('pedidos:atualizar', dados),
    getById: (id) => invoke('pedidos:getById', id),
    dashboard: (periodo) => invoke('pedidos:dashboard', periodo),
  },

  // Estoque
  estoque: {
    listar: () => invoke('estoque:listar'),
    movimentar: (dados) => invoke('estoque:movimentar', dados),
    alertas: () => invoke('estoque:alertas'),
    historico: (produtoId) => invoke('estoque:historico', produtoId),
  },

  // Caixa
  caixa: {
    sessaoAtual: () => invoke('caixa:sessaoAtual'),
    abrir: (dados) => invoke('caixa:abrir', dados),
    fechar: (dados) => invoke('caixa:fechar', dados),
    registrarVenda: (dados) => invoke('caixa:registrarVenda', dados),
    registrarVendaDelivery: (dados) => invoke('caixa:registrarVendaDelivery', dados),
    sangria: (dados) => invoke('caixa:sangria', dados),
    suprimento: (dados) => invoke('caixa:suprimento', dados),
    movimentacoes: (sessaoId) => invoke('caixa:movimentacoes', sessaoId),
    resumo: (sessaoId) => invoke('caixa:resumo', sessaoId),
  },

  // Financeiro
  financeiro: {
    contasPagar: () => invoke('financeiro:contasPagar'),
    contasReceber: () => invoke('financeiro:contasReceber'),
    criarContaPagar: (dados) => invoke('financeiro:criarContaPagar', dados),
    criarContaReceber: (dados) => invoke('financeiro:criarContaReceber', dados),
    pagarConta: (id) => invoke('financeiro:pagarConta', id),
    receberConta: (id) => invoke('financeiro:receberConta', id),
    fluxoCaixa: (periodo) => invoke('financeiro:fluxoCaixa', periodo),
  },

  // Fornecedores
  fornecedores: {
    listar: () => invoke('fornecedores:listar'),
    criar: (dados) => invoke('fornecedores:criar', dados),
    atualizar: (dados) => invoke('fornecedores:atualizar', dados),
  },

  // Entregadores
  entregadores: {
    listar: () => invoke('entregadores:listar'),
    criar: (dados) => invoke('entregadores:criar', dados),
  },

  // Zonas
  zonas: {
    listar: () => invoke('zonas:listar'),
    criar: (dados) => invoke('zonas:criar', dados),
    atualizar: (dados) => invoke('zonas:atualizar', dados),
    deletar: (id) => invoke('zonas:deletar', id),
  },

  // Relatórios
  relatorios: {
    vendas: (periodo) => invoke('relatorios:vendas', periodo),
    produtosMaisVendidos: (periodo) => invoke('relatorios:produtosMaisVendidos', periodo),
    estoque: () => invoke('relatorios:estoque'),
  },

  // Config
  config: {
    get: () => invoke('config:get'),
    update: (dados) => invoke('config:update', dados),
    resetDemo: () => invoke('config:resetDemo'),
  },

  // Impressão
  impressao: {
    comanda: (dados) => invoke('impressao:comanda', dados),
    recibo: (dados) => invoke('impressao:recibo', dados),
  },

  // Dialog
  dialog: {
    openFile: (options) => invoke('dialog:openFile', options),
  },

  // Imagem local
  imagem: {
    salvar: () => invoke('imagem:salvar'),
  },

  // Shell — abre URLs no navegador padrão
  shell: {
    openExternal: (url) => invoke('shell:openExternal', url),
  },

  // Auto-update
  update: {
    verificar: () => invoke('update:verificar'),
    baixar: () => invoke('update:baixar'),
    instalar: () => invoke('update:instalar'),
    versao: () => invoke('update:versao'),
    onDisponivel: (cb) => ipcRenderer.on('update:disponivel', (_, info) => cb(info)),
    onProgresso: (cb) => ipcRenderer.on('update:progresso', (_, p) => cb(p)),
    onBaixado: (cb) => ipcRenderer.on('update:baixado', () => cb()),
    removerListeners: () => {
      ipcRenderer.removeAllListeners('update:disponivel')
      ipcRenderer.removeAllListeners('update:progresso')
      ipcRenderer.removeAllListeners('update:baixado')
    },
  },

  // Supabase / App Garçom
  supabase: {
    statusConexao: () => invoke('supabase:statusConexao'),
    sincronizarLoja: () => invoke('supabase:sincronizarLoja'),
    sincronizarMesas: () => invoke('supabase:sincronizarMesas'),
  },

  garcons: {
    listar: () => invoke('garcons:listar'),
    adicionar: (nome, codigo) => invoke('garcons:adicionar', nome, codigo),
    deletar: (id) => invoke('garcons:deletar', id),
  },

  // Balança serial
  balanca: {
    listarPortas:  ()           => invoke('balanca:listarPortas'),
    conectar:      (porta, baud) => invoke('balanca:conectar', porta, baud),
    desconectar:   ()           => invoke('balanca:desconectar'),
    status:        ()           => invoke('balanca:status'),
    // Push events from main process → renderer
    onPeso:  (cb) => ipcRenderer.on('balanca:peso', (_, peso) => cb(peso)),
    offPeso: ()   => ipcRenderer.removeAllListeners('balanca:peso'),
  },
})
