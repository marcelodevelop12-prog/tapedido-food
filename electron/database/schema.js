const { sqliteTable, text, integer, real, blob } = require('drizzle-orm/sqlite-core')

// ── Licença ────────────────────────────────────────────────────────────────
const licenca = sqliteTable('licenca', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chave: text('chave').notNull(),
  machineId: text('machine_id').notNull(),
  nomeCliente: text('nome_cliente'),
  email: text('email'),
  ativadaEm: text('ativada_em').notNull(),
  modoDemo: integer('modo_demo', { mode: 'boolean' }).default(false),
})

// ── Loja ───────────────────────────────────────────────────────────────────
const lojas = sqliteTable('lojas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nome: text('nome').notNull(),
  cnpj: text('cnpj'),
  telefone: text('telefone'),
  endereco: text('endereco'),
  cidade: text('cidade'),
  estado: text('estado'),
  cep: text('cep'),
  pixChave: text('pix_chave'),
  pixTipo: text('pix_tipo'),
  logo: text('logo'),
  corPrimaria: text('cor_primaria').default('#f97316'),
  corSecundaria: text('cor_secundaria').default('#ea580c'),
  mensagemRecibo: text('mensagem_recibo'),
})

// ── Configurações ──────────────────────────────────────────────────────────
const configuracoes = sqliteTable('configuracoes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  lojaId: integer('loja_id'),
  tempoEntregaMin: integer('tempo_entrega_min').default(40),
  tempoRetiradaMin: integer('tempo_retirada_min').default(20),
  pedidoMinimo: real('pedido_minimo').default(0),
  impressoraNome: text('impressora_nome'),
  impressoraLargura: text('impressora_largura').default('80mm'),
  impressoraIp: text('impressora_ip'),
  impressoraPorta: integer('impressora_porta'),
  balancaPorta: text('balanca_porta'),
  balancaBaud: integer('balanca_baud').default(9600),
  aceitar_dinheiro: integer('aceitar_dinheiro', { mode: 'boolean' }).default(true),
  aceitar_pix: integer('aceitar_pix', { mode: 'boolean' }).default(true),
  aceitar_debito: integer('aceitar_debito', { mode: 'boolean' }).default(true),
  aceitar_credito: integer('aceitar_credito', { mode: 'boolean' }).default(true),
  modulos_delivery: integer('modulos_delivery', { mode: 'boolean' }).default(true),
  modulos_mesas: integer('modulos_mesas', { mode: 'boolean' }).default(true),
  modulos_estoque: integer('modulos_estoque', { mode: 'boolean' }).default(true),
  modulos_financeiro: integer('modulos_financeiro', { mode: 'boolean' }).default(true),
})

// ── Categorias ─────────────────────────────────────────────────────────────
const categorias = sqliteTable('categorias', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  lojaId: integer('loja_id'),
  nome: text('nome').notNull(),
  icone: text('icone'),
  ordem: integer('ordem').default(0),
  ativo: integer('ativo', { mode: 'boolean' }).default(true),
})

// ── Produtos ───────────────────────────────────────────────────────────────
const menuItems = sqliteTable('menu_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  lojaId: integer('loja_id'),
  nome: text('nome').notNull(),
  descricao: text('descricao'),
  preco: real('preco').notNull(),
  imagem: text('imagem'),
  categoria: text('categoria'),
  categoriaId: integer('categoria_id'),
  disponivel: integer('disponivel', { mode: 'boolean' }).default(true),
  ordemExibicao: integer('sort_order').default(0),
  adicionais: text('adicionais'), // JSON
  estoqueAtual: real('estoque_atual').default(0),
  estoqueMinimo: real('estoque_minimo').default(0),
  custoUnitario: real('custo_unitario').default(0),
  unidade: text('unidade').default('un'), // un, kg, porcao, litro
  codigoBarras: text('codigo_barras'),
  permiteMeioMeio: integer('permite_meio_meio', { mode: 'boolean' }).default(false),
  criadoEm: text('criado_em'),
})

// ── Mesas ──────────────────────────────────────────────────────────────────
const mesas = sqliteTable('mesas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  lojaId: integer('loja_id'),
  numero: integer('numero').notNull(),
  nome: text('nome'),
  status: text('status').default('livre'), // livre, ocupada, conta_pedida
  capacidade: integer('capacidade').default(4),
  posicaoX: integer('posicao_x').default(0),
  posicaoY: integer('posicao_y').default(0),
})

// ── Comandas ───────────────────────────────────────────────────────────────
const comandas = sqliteTable('comandas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  lojaId: integer('loja_id'),
  mesaId: integer('mesa_id').notNull(),
  status: text('status').default('aberta'), // aberta, fechada, cancelada
  total: real('total').default(0),
  nomeCliente: text('nome_cliente'),
  abertoEm: text('aberto_em').notNull(),
  fechadoEm: text('fechado_em'),
  observacoes: text('observacoes'),
})

// ── Itens da Comanda ───────────────────────────────────────────────────────
const comandaItens = sqliteTable('comanda_itens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  comandaId: integer('comanda_id').notNull(),
  menuItemId: integer('menu_item_id'),
  nomeItem: text('nome_item').notNull(),
  quantidade: real('quantidade').notNull(),
  precoUnitario: real('preco_unitario').notNull(),
  subtotal: real('subtotal').notNull(),
  sabor2: text('sabor_2'),
  precoSabor2: real('preco_sabor_2'),
  adicionaisEscolhidos: text('adicionais_escolhidos'), // JSON
  observacao: text('observacao'),
  criadoEm: text('criado_em'),
})

// ── Pedidos ────────────────────────────────────────────────────────────────
const pedidos = sqliteTable('pedidos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  lojaId: integer('loja_id'),
  numeroPedido: integer('numero_pedido').notNull(),
  telefoneCliente: text('telefone_cliente'),
  nomeCliente: text('nome_cliente'),
  tipoEntrega: text('tipo_entrega').notNull(), // entrega, retirada, mesa
  enderecoEntrega: text('endereco_entrega'), // JSON
  formaPagamento: text('forma_pagamento'),
  trocoPara: real('troco_para'),
  taxaEntrega: real('taxa_entrega').default(0),
  subtotal: real('subtotal').notNull(),
  total: real('total').notNull(),
  status: text('status').default('recebido'), // recebido, em_preparo, pronto, saiu, entregue, cancelado
  origem: text('origem').default('pdv'), // pdv, whatsapp, app
  mesa: integer('mesa'),
  bairroEntrega: text('bairro_entrega'),
  entregadorId: integer('entregador_id'),
  observacoes: text('observacoes'),
  criadoEm: text('criado_em').notNull(),
  atualizadoEm: text('atualizado_em'),
})

// ── Itens do Pedido ────────────────────────────────────────────────────────
const itensPedido = sqliteTable('itens_pedido', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  pedidoId: integer('pedido_id').notNull(),
  menuItemId: integer('menu_item_id'),
  nomeItem: text('nome_item').notNull(),
  quantidade: real('quantidade').notNull(),
  precoUnitario: real('preco_unitario').notNull(),
  subtotal: real('subtotal').notNull(),
  sabor2: text('sabor_2'),
  precoSabor2: real('preco_sabor_2'),
  adicionaisEscolhidos: text('adicionais_escolhidos'), // JSON
  observacao: text('observacao'),
})

// ── Estoque / Movimentações ────────────────────────────────────────────────
const estoqueMovimentacoes = sqliteTable('estoque_movimentacoes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  lojaId: integer('loja_id'),
  menuItemId: integer('menu_item_id').notNull(),
  fornecedorId: integer('fornecedor_id'),
  tipo: text('tipo').notNull(), // entrada, saida, inventario, perda
  quantidade: real('quantidade').notNull(),
  custoUnitario: real('custo_unitario'),
  motivo: text('motivo'),
  pedidoId: integer('pedido_id'),
  criadoEm: text('criado_em').notNull(),
})

// ── Caixa ─────────────────────────────────────────────────────────────────
const caixaSessoes = sqliteTable('caixa_sessoes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  lojaId: integer('loja_id'),
  abertoEm: text('aberto_em').notNull(),
  fechadoEm: text('fechado_em'),
  valorInicial: real('valor_inicial').default(0),
  valorFinal: real('valor_final'),
  totalDinheiro: real('total_dinheiro').default(0),
  totalDebito: real('total_debito').default(0),
  totalCredito: real('total_credito').default(0),
  totalPix: real('total_pix').default(0),
  totalSangria: real('total_sangria').default(0),
  totalSuprimento: real('total_suprimento').default(0),
  status: text('status').default('aberto'), // aberto, fechado
  observacoes: text('observacoes'),
})

const caixaMovimentacoes = sqliteTable('caixa_movimentacoes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  lojaId: integer('loja_id'),
  sessaoId: integer('sessao_id').notNull(),
  pedidoId: integer('pedido_id'),
  tipo: text('tipo').notNull(), // venda, sangria, suprimento, ajuste
  formaPagamento: text('forma_pagamento'), // dinheiro, debito, credito, pix
  valor: real('valor').notNull(),
  troco: real('troco').default(0),
  descricao: text('descricao'),
  criadoEm: text('criado_em').notNull(),
})

// ── Financeiro ─────────────────────────────────────────────────────────────
const contasPagar = sqliteTable('contas_pagar', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  lojaId: integer('loja_id'),
  fornecedorId: integer('fornecedor_id'),
  descricao: text('descricao').notNull(),
  valor: real('valor').notNull(),
  vencimento: text('vencimento').notNull(),
  pagoEm: text('pago_em'),
  status: text('status').default('pendente'), // pendente, pago, vencido, cancelado
  categoria: text('categoria'),
  criadoEm: text('criado_em'),
})

const contasReceber = sqliteTable('contas_receber', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  lojaId: integer('loja_id'),
  descricao: text('descricao').notNull(),
  valor: real('valor').notNull(),
  vencimento: text('vencimento').notNull(),
  recebidoEm: text('recebido_em'),
  status: text('status').default('pendente'), // pendente, recebido, vencido, cancelado
  criadoEm: text('criado_em'),
})

// ── Fornecedores ───────────────────────────────────────────────────────────
const fornecedores = sqliteTable('fornecedores', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  lojaId: integer('loja_id'),
  nome: text('nome').notNull(),
  contato: text('contato'),
  telefone: text('telefone'),
  email: text('email'),
  cnpj: text('cnpj'),
  produtosFornecidos: text('produtos_fornecidos'),
  observacoes: text('observacoes'),
  ativo: integer('ativo', { mode: 'boolean' }).default(true),
})

// ── Entregadores ───────────────────────────────────────────────────────────
const entregadores = sqliteTable('entregadores', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  lojaId: integer('loja_id'),
  nome: text('nome').notNull(),
  telefone: text('telefone'),
  veiculo: text('veiculo'),
  ativo: integer('ativo', { mode: 'boolean' }).default(true),
})

// ── Zonas de Entrega ───────────────────────────────────────────────────────
const zonasEntrega = sqliteTable('zonas_entrega', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  lojaId: integer('loja_id'),
  bairro: text('bairro').notNull(),
  municipio: text('municipio'),
  taxaEntrega: real('taxa_entrega').default(0),
  ativo: integer('ativo', { mode: 'boolean' }).default(true),
})

// ── Clientes ───────────────────────────────────────────────────────────────
const clientes = sqliteTable('clientes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  lojaId: integer('loja_id'),
  nome: text('nome').notNull(),
  telefone: text('telefone'),
  endereco: text('endereco'),
  bairro: text('bairro'),
  cidade: text('cidade'),
  complemento: text('complemento'),
  observacoes: text('observacoes'),
  totalPedidos: integer('total_pedidos').default(0),
  totalGasto: real('total_gasto').default(0),
  criadoEm: text('criado_em'),
})

module.exports = {
  licenca,
  lojas,
  configuracoes,
  categorias,
  menuItems,
  mesas,
  comandas,
  comandaItens,
  pedidos,
  itensPedido,
  estoqueMovimentacoes,
  caixaSessoes,
  caixaMovimentacoes,
  contasPagar,
  contasReceber,
  fornecedores,
  entregadores,
  zonasEntrega,
  clientes,
}
