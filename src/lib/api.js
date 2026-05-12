// Camada de abstração da API — funciona em Electron (via IPC) e no browser (dados mock)
const isElectron = typeof window !== 'undefined' && window.api

// ── Mock data para modo browser/preview ────────────────────────────────────
const mockProdutos = [
  { id: 1, nome: 'X-Burguer', categoria: 'Lanches', preco: 18, disponivel: 1, estoque_atual: 50, estoque_minimo: 10, imagem: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80', descricao: 'Hambúrguer artesanal, queijo, alface, tomate e molho especial', custo_unitario: 7.5, unidade: 'un', permite_meio_meio: 0, sort_order: 1 },
  { id: 2, nome: 'X-Bacon', categoria: 'Lanches', preco: 22, disponivel: 1, estoque_atual: 40, estoque_minimo: 8, imagem: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=400&q=80', descricao: 'Hambúrguer, bacon crocante, queijo cheddar e maionese temperada', custo_unitario: 9, unidade: 'un', permite_meio_meio: 0, sort_order: 2 },
  { id: 3, nome: 'X-Salada', categoria: 'Lanches', preco: 16, disponivel: 1, estoque_atual: 45, estoque_minimo: 10, imagem: 'https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?w=400&q=80', descricao: 'Hambúrguer, queijo, alface, tomate, cebola e milho', custo_unitario: 6, unidade: 'un', permite_meio_meio: 0, sort_order: 3 },
  { id: 4, nome: 'Frango Grelhado', categoria: 'Pratos', preco: 28, disponivel: 1, estoque_atual: 30, estoque_minimo: 5, imagem: 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=400&q=80', descricao: 'Filé de frango grelhado, arroz, feijão e salada', custo_unitario: 12, unidade: 'un', permite_meio_meio: 0, sort_order: 4 },
  { id: 5, nome: 'Prato Feito (PF)', categoria: 'Pratos', preco: 18, disponivel: 1, estoque_atual: 60, estoque_minimo: 10, imagem: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&q=80', descricao: 'Arroz, feijão, carne, macarrão e salada completa', custo_unitario: 7, unidade: 'un', permite_meio_meio: 0, sort_order: 5 },
  { id: 6, nome: 'Filé à Parmegiana', categoria: 'Pratos', preco: 35, disponivel: 1, estoque_atual: 20, estoque_minimo: 5, imagem: 'https://images.unsplash.com/photo-1574894709920-11b28e7367e3?w=400&q=80', descricao: 'Filé empanado, molho de tomate, mussarela gratinada, arroz e batata frita', custo_unitario: 14, unidade: 'un', permite_meio_meio: 0, sort_order: 6 },
  { id: 7, nome: 'Pizza Margherita', categoria: 'Pizzas', preco: 45, disponivel: 1, estoque_atual: 20, estoque_minimo: 5, imagem: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400&q=80', descricao: 'Molho de tomate, mussarela e manjericão fresco', custo_unitario: 18, unidade: 'un', permite_meio_meio: 1, sort_order: 7 },
  { id: 8, nome: 'Pizza Calabresa', categoria: 'Pizzas', preco: 48, disponivel: 1, estoque_atual: 20, estoque_minimo: 5, imagem: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&q=80', descricao: 'Molho de tomate, calabresa fatiada, cebola e azeitona', custo_unitario: 19, unidade: 'un', permite_meio_meio: 1, sort_order: 8 },
  { id: 9, nome: 'Coca-Cola 350ml', categoria: 'Bebidas', preco: 6, disponivel: 1, estoque_atual: 100, estoque_minimo: 20, imagem: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=400&q=80', descricao: 'Refrigerante gelado 350ml', custo_unitario: 2.5, unidade: 'un', permite_meio_meio: 0, sort_order: 9 },
  { id: 10, nome: 'Suco de Laranja', categoria: 'Bebidas', preco: 8, disponivel: 1, estoque_atual: 50, estoque_minimo: 10, imagem: 'https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=400&q=80', descricao: 'Suco natural de laranja 400ml', custo_unitario: 3, unidade: 'un', permite_meio_meio: 0, sort_order: 10 },
  { id: 11, nome: 'Água Mineral', categoria: 'Bebidas', preco: 4, disponivel: 1, estoque_atual: 80, estoque_minimo: 20, imagem: 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=400&q=80', descricao: 'Água mineral sem gás 500ml', custo_unitario: 1.2, unidade: 'un', permite_meio_meio: 0, sort_order: 11 },
  { id: 12, nome: 'Brownie', categoria: 'Sobremesas', preco: 12, disponivel: 1, estoque_atual: 30, estoque_minimo: 5, imagem: 'https://images.unsplash.com/photo-1564355808539-22fda35bed7e?w=400&q=80', descricao: 'Brownie de chocolate com nozes e sorvete de baunilha', custo_unitario: 4, unidade: 'un', permite_meio_meio: 0, sort_order: 12 },
  { id: 13, nome: 'Pudim', categoria: 'Sobremesas', preco: 10, disponivel: 1, estoque_atual: 25, estoque_minimo: 5, imagem: 'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=400&q=80', descricao: 'Pudim de leite condensado com calda de caramelo', custo_unitario: 3.5, unidade: 'un', permite_meio_meio: 0, sort_order: 13 },
  { id: 14, nome: 'Açaí 300ml', categoria: 'Sobremesas', preco: 16, disponivel: 1, estoque_atual: 40, estoque_minimo: 8, imagem: 'https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e?w=400&q=80', descricao: 'Açaí batido com guaraná, banana e granola', custo_unitario: 6, unidade: 'un', permite_meio_meio: 0, sort_order: 14 },
  { id: 15, nome: 'Batata Frita', categoria: 'Lanches', preco: 14, disponivel: 1, estoque_atual: 60, estoque_minimo: 10, imagem: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400&q=80', descricao: 'Porção de batata frita crocante com ketchup e maionese', custo_unitario: 4, unidade: 'un', permite_meio_meio: 0, sort_order: 15 },
  { id: 16, nome: 'Onion Rings', categoria: 'Lanches', preco: 16, disponivel: 1, estoque_atual: 30, estoque_minimo: 5, imagem: 'https://images.unsplash.com/photo-1639024471283-03518883512d?w=400&q=80', descricao: 'Anéis de cebola empanados e fritos, crocantes por fora', custo_unitario: 5, unidade: 'un', permite_meio_meio: 0, sort_order: 16 },
  { id: 17, nome: 'Misto Quente', categoria: 'Lanches', preco: 12, disponivel: 1, estoque_atual: 50, estoque_minimo: 10, imagem: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=400&q=80', descricao: 'Pão de forma, presunto e queijo grelhados na chapa', custo_unitario: 3.5, unidade: 'un', permite_meio_meio: 0, sort_order: 17 },
  { id: 18, nome: 'Vitamina de Banana', categoria: 'Bebidas', preco: 10, disponivel: 1, estoque_atual: 30, estoque_minimo: 5, imagem: 'https://images.unsplash.com/photo-1638176067001-1c3f2e9e5d95?w=400&q=80', descricao: 'Vitamina cremosa de banana com leite e mel', custo_unitario: 3.5, unidade: 'un', permite_meio_meio: 0, sort_order: 18 },
  { id: 19, nome: 'Pizza Frango c/ Catupiry', categoria: 'Pizzas', preco: 52, disponivel: 1, estoque_atual: 15, estoque_minimo: 5, imagem: 'https://images.unsplash.com/photo-1565299507177-b0ac66763828?w=400&q=80', descricao: 'Frango desfiado, catupiry cremoso e ervilhas', custo_unitario: 21, unidade: 'un', permite_meio_meio: 1, sort_order: 19 },
  { id: 20, nome: 'Sorvete 2 Bolas', categoria: 'Sobremesas', preco: 14, disponivel: 1, estoque_atual: 35, estoque_minimo: 8, imagem: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=400&q=80', descricao: 'Duas bolas de sorvete à escolha: chocolate, baunilha ou morango', custo_unitario: 5, unidade: 'un', permite_meio_meio: 0, sort_order: 20 },
]

const mockMesas = [
  { id: 1, numero: 1, nome: 'Mesa 1', status: 'livre', capacidade: 4 },
  { id: 2, numero: 2, nome: 'Mesa 2', status: 'ocupada', capacidade: 4 },
  { id: 3, numero: 3, nome: 'Mesa 3', status: 'livre', capacidade: 4 },
  { id: 4, numero: 4, nome: 'Mesa 4', status: 'conta_pedida', capacidade: 4 },
  { id: 5, numero: 5, nome: 'Mesa 5', status: 'ocupada', capacidade: 6 },
]

const mockPedidos = [
  { id: 1, numero_pedido: 1, nome_cliente: 'Ana Paula Ferreira', tipo_entrega: 'entrega', forma_pagamento: 'pix', taxa_entrega: 0, subtotal: 42, total: 42, status: 'em_preparo', criado_em: new Date(Date.now() - 1800000).toISOString(), bairro_entrega: 'Centro', itens: [{ nome_item: 'X-Bacon', quantidade: 1, preco_unitario: 22, subtotal: 22 }, { nome_item: 'Batata Frita', quantidade: 1, preco_unitario: 14, subtotal: 14 }, { nome_item: 'Coca-Cola 350ml', quantidade: 2, preco_unitario: 6, subtotal: 12 }] },
  { id: 2, numero_pedido: 2, nome_cliente: 'Marcos Oliveira', tipo_entrega: 'retirada', forma_pagamento: 'dinheiro', taxa_entrega: 0, subtotal: 64, total: 64, status: 'pronto', criado_em: new Date(Date.now() - 2400000).toISOString(), itens: [{ nome_item: 'Pizza Calabresa', quantidade: 1, preco_unitario: 48, subtotal: 48 }, { nome_item: 'Suco de Laranja', quantidade: 2, preco_unitario: 8, subtotal: 16 }] },
  { id: 3, numero_pedido: 3, nome_cliente: 'Fernanda Costa', tipo_entrega: 'entrega', forma_pagamento: 'credito', taxa_entrega: 5, subtotal: 60, total: 65, status: 'recebido', criado_em: new Date(Date.now() - 600000).toISOString(), bairro_entrega: 'Cabuçu', itens: [{ nome_item: 'Frango Grelhado', quantidade: 2, preco_unitario: 28, subtotal: 56 }, { nome_item: 'Água Mineral', quantidade: 2, preco_unitario: 4, subtotal: 8 }] },
]

const mockCategorias = [
  { id: 1, nome: 'Lanches', icone: '🍔', ordem: 1 },
  { id: 2, nome: 'Pratos', icone: '🍽️', ordem: 2 },
  { id: 3, nome: 'Pizzas', icone: '🍕', ordem: 3 },
  { id: 4, nome: 'Bebidas', icone: '🥤', ordem: 4 },
  { id: 5, nome: 'Sobremesas', icone: '🍨', ordem: 5 },
]

function mockApi() {
  let produtos = [...mockProdutos]
  let pedidos = [...mockPedidos]
  let mesas = [...mockMesas]

  return {
    licenca: {
      verificar: async () => ({ ativa: true, demo: true }),
      ativar: async () => ({ sucesso: false, erro: 'Use a versão desktop para ativar' }),
      ativarDemo: async () => ({ sucesso: true }),
      resetar: async () => ({ sucesso: true }),
      verificarPeriodico: async () => {},
      info: async () => ({ chave: 'DEMO', modo_demo: 1 }),
    },
    loja: {
      get: async () => ({ nome: 'Sabor da Vila', cidade: 'Nova Iguaçu', estado: 'RJ', telefone: '(21) 99999-1234', pix_chave: 'saborvila@pix.com' }),
      update: async (d) => d,
    },
    produtos: {
      listar: async () => produtos,
      criar: async (d) => { const n = { ...d, id: Date.now(), disponivel: 1 }; produtos.push(n); return n },
      atualizar: async (d) => { const i = produtos.findIndex(p => p.id === d.id); if (i >= 0) produtos[i] = { ...produtos[i], ...d }; return produtos[i] },
      deletar: async (id) => { produtos = produtos.filter(p => p.id !== id); return { sucesso: true } },
      toggleDisponivel: async (id) => { const p = produtos.find(p => p.id === id); if (p) p.disponivel = p.disponivel ? 0 : 1; return p },
    },
    categorias: {
      listar: async () => mockCategorias,
      criar: async (d) => ({ ...d, id: Date.now() }),
    },
    mesas: {
      listar: async () => mesas,
      criar: async (d) => { const n = { ...d, id: Date.now(), status: 'livre' }; mesas.push(n); return n },
      atualizar: async (d) => { const i = mesas.findIndex(m => m.id === d.id); if (i >= 0) mesas[i] = { ...mesas[i], ...d }; return mesas[i] },
      deletar: async (id) => { mesas = mesas.filter(m => m.id !== id); return { sucesso: true } },
    },
    comandas: {
      abrir: async (mesaId) => ({ id: Date.now(), mesa_id: mesaId, status: 'aberta', total: 0, itens: [], aberto_em: new Date().toISOString() }),
      fechar: async () => ({ sucesso: true }),
      getByMesa: async (mesaId) => null,
      addItem: async (d) => ({ ...d, id: Date.now() }),
      removeItem: async () => ({ sucesso: true }),
      listarAbertas: async () => [],
    },
    pedidos: {
      listar: async () => pedidos,
      criar: async (d) => { const n = { ...d, id: Date.now(), numero_pedido: pedidos.length + 1, status: 'recebido', criado_em: new Date().toISOString() }; pedidos.unshift(n); return n },
      atualizar: async (d) => { const i = pedidos.findIndex(p => p.id === d.id); if (i >= 0) pedidos[i] = { ...pedidos[i], ...d }; return pedidos[i] },
      getById: async (id) => pedidos.find(p => p.id === id),
      dashboard: async () => ({ receitaHoje: 382.50, pedidosAbertos: 3, pedidosHoje: 8, ticketMedio: 47.81 }),
    },
    estoque: {
      listar: async () => produtos,
      movimentar: async (d) => { const p = produtos.find(p => p.id === d.menuItemId); if (p && d.tipo === 'entrada') p.estoque_atual += d.quantidade; return p },
      alertas: async () => produtos.filter(p => p.estoque_atual <= p.estoque_minimo && p.estoque_minimo > 0),
      historico: async () => [],
    },
    caixa: {
      sessaoAtual: async () => ({ id: 1, aberto_em: new Date(Date.now() - 28800000).toISOString(), valor_inicial: 100, total_dinheiro: 82, total_pix: 116, total_debito: 41, total_credito: 63, total_sangria: 0, total_suprimento: 0, status: 'aberto' }),
      abrir: async (d) => ({ id: Date.now(), ...d, status: 'aberto', aberto_em: new Date().toISOString() }),
      fechar: async () => ({ sucesso: true }),
      sangria: async () => ({ sucesso: true }),
      suprimento: async () => ({ sucesso: true }),
      movimentacoes: async () => [],
      resumo: async () => ({ sessao: {}, movimentacoes: [], totalVendas: 302 }),
    },
    financeiro: {
      contasPagar: async () => [
        { id: 1, descricao: 'Aluguel do estabelecimento', valor: 1800, vencimento: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0], status: 'pendente', categoria: 'Aluguel' },
        { id: 2, descricao: 'Conta de energia elétrica', valor: 380, vencimento: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0], status: 'pendente', categoria: 'Utilidades' },
        { id: 3, descricao: 'Fornecedor Bom Sabor - carnes', valor: 720, vencimento: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0], status: 'pendente', categoria: 'Fornecedores' },
      ],
      contasReceber: async () => [
        { id: 1, descricao: 'Evento corporativo - empresa XYZ', valor: 450, vencimento: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0], status: 'pendente' },
      ],
      criarContaPagar: async (d) => ({ ...d, id: Date.now(), status: 'pendente' }),
      criarContaReceber: async (d) => ({ ...d, id: Date.now(), status: 'pendente' }),
      pagarConta: async () => ({ sucesso: true }),
      receberConta: async () => ({ sucesso: true }),
      fluxoCaixa: async () => ({ entradas: 3820, saidas: 2900, saldo: 920 }),
    },
    fornecedores: {
      listar: async () => [
        { id: 1, nome: 'Distribuidora Bom Sabor', contato: 'João Carlos', telefone: '(21) 3333-1111' },
        { id: 2, nome: 'Bebidas Fluminense', contato: 'Maria Lúcia', telefone: '(21) 3333-2222' },
        { id: 3, nome: 'Padaria Central RJ', contato: 'Roberto Silva', telefone: '(21) 3333-3333' },
      ],
      criar: async (d) => ({ ...d, id: Date.now() }),
      atualizar: async (d) => d,
    },
    entregadores: {
      listar: async () => [
        { id: 1, nome: 'Carlos Moto', telefone: '(21) 99888-7766', veiculo: 'Moto Honda CG 160' },
        { id: 2, nome: 'Pedro Bike', telefone: '(21) 99777-5544', veiculo: 'Bicicleta elétrica' },
      ],
      criar: async (d) => ({ ...d, id: Date.now() }),
    },
    zonas: {
      listar: async () => [
        { id: 1, bairro: 'Centro', municipio: 'Nova Iguaçu', taxa_entrega: 0 },
        { id: 2, bairro: 'Jardim Iguaçu', municipio: 'Nova Iguaçu', taxa_entrega: 3 },
        { id: 3, bairro: 'Cabuçu', municipio: 'Nova Iguaçu', taxa_entrega: 5 },
        { id: 4, bairro: 'Comendador Soares', municipio: 'Nova Iguaçu', taxa_entrega: 4 },
        { id: 5, bairro: 'Moquetá', municipio: 'Nova Iguaçu', taxa_entrega: 3 },
        { id: 6, bairro: 'Rancho Novo', municipio: 'Nova Iguaçu', taxa_entrega: 6 },
      ],
      criar: async (d) => ({ id: Date.now(), bairro: d.bairro, municipio: d.municipio || 'Nova Iguaçu', taxa_entrega: d.taxaEntrega ?? 0 }),
      atualizar: async (d) => ({ id: d.id, bairro: d.bairro, municipio: d.municipio, taxa_entrega: d.taxaEntrega ?? 0 }),
      deletar: async () => ({ sucesso: true }),
    },
    relatorios: {
      vendas: async () => [
        { periodo: '2026-05-05', total_pedidos: 12, receita: 486, ticket_medio: 40.5 },
        { periodo: '2026-05-06', total_pedidos: 18, receita: 724, ticket_medio: 40.2 },
        { periodo: '2026-05-07', total_pedidos: 22, receita: 891, ticket_medio: 40.5 },
        { periodo: '2026-05-08', total_pedidos: 15, receita: 612, ticket_medio: 40.8 },
        { periodo: '2026-05-09', total_pedidos: 20, receita: 810, ticket_medio: 40.5 },
        { periodo: '2026-05-10', total_pedidos: 25, receita: 1024, ticket_medio: 40.96 },
        { periodo: '2026-05-11', total_pedidos: 8, receita: 382, ticket_medio: 47.75 },
      ],
      produtosMaisVendidos: async () => [
        { nome_item: 'X-Bacon', total_vendido: 48, receita: 1056 },
        { nome_item: 'Pizza Calabresa', total_vendido: 35, receita: 1680 },
        { nome_item: 'Batata Frita', total_vendido: 52, receita: 728 },
        { nome_item: 'Coca-Cola 350ml', total_vendido: 98, receita: 588 },
        { nome_item: 'X-Burguer', total_vendido: 40, receita: 720 },
      ],
      estoque: async () => produtos,
    },
    config: {
      get: async () => ({ tempo_entrega_min: 40, tempo_retirada_min: 20, pedido_minimo: 20, impressora_largura: '80mm', aceitar_dinheiro: 1, aceitar_pix: 1, aceitar_debito: 1, aceitar_credito: 1, supabase_loja_id: null, codigo_loja: 'DEMO01' }),
      update: async (d) => d,
      resetDemo: async () => ({ sucesso: true }),
    },
    impressao: {
      comanda: async () => ({ sucesso: true }),
      recibo: async () => ({ sucesso: true }),
    },
    dialog: {
      openFile: async () => ({ canceled: true, filePaths: [] }),
    },
    imagem: {
      salvar: async () => null,
    },
    shell: {
      openExternal: async (url) => { window.open(url, '_blank') },
    },
    balanca: {
      listarPortas: async () => [],
      conectar:     async () => false,
      desconectar:  async () => true,
      status:       async () => false,
      onPeso:       () => {},
      offPeso:      () => {},
    },
    update: {
      verificar:        async () => {},
      baixar:           async () => {},
      instalar:         async () => {},
      versao:           async () => '1.0.0',
      onDisponivel:     () => {},
      onProgresso:      () => {},
      onBaixado:        () => {},
      removerListeners: () => {},
    },

    supabase: {
      statusConexao: async () => false,
      sincronizarLoja: async () => ({ sucesso: true, codigoLoja: 'DEMO01' }),
    },

    garcons: {
      listar: async () => [
        { id: 'mock-1', nome: 'João Silva', codigo: '1234', ativo: true },
        { id: 'mock-2', nome: 'Maria Souza', codigo: '5678', ativo: true },
      ],
      adicionar: async (nome, codigo) => ({ id: 'mock-' + Date.now(), nome, codigo, ativo: true }),
      deletar: async () => ({ sucesso: true }),
    },
  }
}

export const api = isElectron ? window.api : mockApi()
