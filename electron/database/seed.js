function seed(db) {

  // ── Loja ──────────────────────────────────────────────────────────────────
  db.prepare('DELETE FROM lojas').run()
  db.prepare(`
    INSERT INTO lojas (nome, cnpj, telefone, endereco, cidade, estado, cep, pix_chave, pix_tipo, mensagem_recibo)
    VALUES ('Sabor da Vila', '12.345.678/0001-99', '(21) 99999-1234',
      'Rua das Acácias, 456', 'Nova Iguaçu', 'RJ', '26210-000',
      'saborvila@pix.com', 'email',
      'Obrigado pela preferência! Volte sempre. 🍔')
  `).run()

  // ── Configurações ─────────────────────────────────────────────────────────
  db.prepare('DELETE FROM configuracoes').run()
  db.prepare(`
    INSERT INTO configuracoes (loja_id, tempo_entrega_min, tempo_retirada_min, pedido_minimo,
      impressora_largura, aceitar_dinheiro, aceitar_pix, aceitar_debito, aceitar_credito,
      modulos_delivery, modulos_mesas, modulos_estoque, modulos_financeiro)
    VALUES (1, 40, 20, 20, '80mm', 1, 1, 1, 1, 1, 1, 1, 1)
  `).run()

  // ── Categorias ────────────────────────────────────────────────────────────
  db.prepare('DELETE FROM categorias').run()
  const cats = [
    { nome: 'Lanches', icone: '🍔', ordem: 1 },
    { nome: 'Pratos', icone: '🍽️', ordem: 2 },
    { nome: 'Pizzas', icone: '🍕', ordem: 3 },
    { nome: 'Bebidas', icone: '🥤', ordem: 4 },
    { nome: 'Sobremesas', icone: '🍨', ordem: 5 },
  ]
  for (const c of cats) {
    db.prepare('INSERT INTO categorias (nome, icone, ordem, ativo) VALUES (?, ?, ?, 1)').run(c.nome, c.icone, c.ordem)
  }

  // ── Produtos ──────────────────────────────────────────────────────────────
  // Imagens via Unsplash (URLs diretas de fotos de alta qualidade)
  db.prepare('DELETE FROM menu_items').run()
  const produtos = [
    {
      nome: 'X-Burguer', categoria: 'Lanches', preco: 18.00, estoque: 50, minimo: 10, custo: 7.50,
      descricao: 'Hambúrguer artesanal, queijo, alface, tomate e molho especial',
      imagem: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80',
      permiteMeioMeio: false,
    },
    {
      nome: 'X-Bacon', categoria: 'Lanches', preco: 22.00, estoque: 40, minimo: 8, custo: 9.00,
      descricao: 'Hambúrguer, bacon crocante, queijo cheddar e maionese temperada',
      imagem: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=400&q=80',
      permiteMeioMeio: false,
    },
    {
      nome: 'X-Salada', categoria: 'Lanches', preco: 16.00, estoque: 45, minimo: 10, custo: 6.00,
      descricao: 'Hambúrguer, queijo, alface, tomate, cebola e milho',
      imagem: 'https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?w=400&q=80',
      permiteMeioMeio: false,
    },
    {
      nome: 'Frango Grelhado', categoria: 'Pratos', preco: 28.00, estoque: 30, minimo: 5, custo: 12.00,
      descricao: 'Filé de frango grelhado, arroz, feijão e salada',
      imagem: 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=400&q=80',
      permiteMeioMeio: false,
    },
    {
      nome: 'Prato Feito (PF)', categoria: 'Pratos', preco: 18.00, estoque: 60, minimo: 10, custo: 7.00,
      descricao: 'Arroz, feijão, carne, macarrão e salada completa',
      imagem: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&q=80',
      permiteMeioMeio: false,
    },
    {
      nome: 'Filé à Parmegiana', categoria: 'Pratos', preco: 35.00, estoque: 20, minimo: 5, custo: 14.00,
      descricao: 'Filé empanado, molho de tomate, mussarela gratinada, arroz e batata frita',
      imagem: 'https://images.unsplash.com/photo-1574894709920-11b28e7367e3?w=400&q=80',
      permiteMeioMeio: false,
    },
    {
      nome: 'Pizza Margherita', categoria: 'Pizzas', preco: 45.00, estoque: 20, minimo: 5, custo: 18.00,
      descricao: 'Molho de tomate, mussarela e manjericão fresco',
      imagem: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400&q=80',
      permiteMeioMeio: true,
    },
    {
      nome: 'Pizza Calabresa', categoria: 'Pizzas', preco: 48.00, estoque: 20, minimo: 5, custo: 19.00,
      descricao: 'Molho de tomate, calabresa fatiada, cebola e azeitona',
      imagem: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&q=80',
      permiteMeioMeio: true,
    },
    {
      nome: 'Coca-Cola 350ml', categoria: 'Bebidas', preco: 6.00, estoque: 100, minimo: 20, custo: 2.50,
      descricao: 'Refrigerante gelado 350ml',
      imagem: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=400&q=80',
      permiteMeioMeio: false,
    },
    {
      nome: 'Suco de Laranja', categoria: 'Bebidas', preco: 8.00, estoque: 50, minimo: 10, custo: 3.00,
      descricao: 'Suco natural de laranja 400ml',
      imagem: 'https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=400&q=80',
      permiteMeioMeio: false,
    },
    {
      nome: 'Água Mineral', categoria: 'Bebidas', preco: 4.00, estoque: 80, minimo: 20, custo: 1.20,
      descricao: 'Água mineral sem gás 500ml',
      imagem: 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=400&q=80',
      permiteMeioMeio: false,
    },
    {
      nome: 'Brownie', categoria: 'Sobremesas', preco: 12.00, estoque: 30, minimo: 5, custo: 4.00,
      descricao: 'Brownie de chocolate com nozes e sorvete de baunilha',
      imagem: 'https://images.unsplash.com/photo-1564355808539-22fda35bed7e?w=400&q=80',
      permiteMeioMeio: false,
    },
    {
      nome: 'Pudim', categoria: 'Sobremesas', preco: 10.00, estoque: 25, minimo: 5, custo: 3.50,
      descricao: 'Pudim de leite condensado com calda de caramelo',
      imagem: 'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=400&q=80',
      permiteMeioMeio: false,
    },
    {
      nome: 'Açaí 300ml', categoria: 'Sobremesas', preco: 16.00, estoque: 40, minimo: 8, custo: 6.00,
      descricao: 'Açaí batido com guaraná, banana e granola',
      imagem: 'https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e?w=400&q=80',
      permiteMeioMeio: false,
    },
    {
      nome: 'Batata Frita', categoria: 'Lanches', preco: 14.00, estoque: 60, minimo: 10, custo: 4.00,
      descricao: 'Porção de batata frita crocante com ketchup e maionese',
      imagem: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400&q=80',
      permiteMeioMeio: false,
    },
    {
      nome: 'Onion Rings', categoria: 'Lanches', preco: 16.00, estoque: 30, minimo: 5, custo: 5.00,
      descricao: 'Anéis de cebola empanados e fritos, crocantes por fora',
      imagem: 'https://images.unsplash.com/photo-1639024471283-03518883512d?w=400&q=80',
      permiteMeioMeio: false,
    },
    {
      nome: 'Misto Quente', categoria: 'Lanches', preco: 12.00, estoque: 50, minimo: 10, custo: 3.50,
      descricao: 'Pão de forma, presunto e queijo grelhados na chapa',
      imagem: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=400&q=80',
      permiteMeioMeio: false,
    },
    {
      nome: 'Vitamina de Banana', categoria: 'Bebidas', preco: 10.00, estoque: 30, minimo: 5, custo: 3.50,
      descricao: 'Vitamina cremosa de banana com leite e mel',
      imagem: 'https://images.unsplash.com/photo-1638176067001-1c3f2e9e5d95?w=400&q=80',
      permiteMeioMeio: false,
    },
    {
      nome: 'Pizza Frango c/ Catupiry', categoria: 'Pizzas', preco: 52.00, estoque: 15, minimo: 5, custo: 21.00,
      descricao: 'Frango desfiado, catupiry cremoso e ervilhas',
      imagem: 'https://images.unsplash.com/photo-1565299507177-b0ac66763828?w=400&q=80',
      permiteMeioMeio: true,
    },
    {
      nome: 'Sorvete 2 Bolas', categoria: 'Sobremesas', preco: 14.00, estoque: 35, minimo: 8, custo: 5.00,
      descricao: 'Duas bolas de sorvete à escolha: chocolate, baunilha ou morango',
      imagem: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=400&q=80',
      permiteMeioMeio: false,
    },
  ]

  let ordem = 1
  for (const p of produtos) {
    db.prepare(`
      INSERT INTO menu_items (nome, descricao, preco, imagem, categoria, disponivel, sort_order,
        estoque_atual, estoque_minimo, custo_unitario, unidade, permite_meio_meio, adicionais, criado_em)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 'un', ?, '[]', datetime('now'))
    `).run(p.nome, p.descricao, p.preco, p.imagem, p.categoria, ordem++, p.estoque, p.minimo, p.custo, p.permiteMeioMeio ? 1 : 0)
  }

  // ── Mesas ──────────────────────────────────────────────────────────────────
  db.prepare('DELETE FROM mesas').run()
  for (let i = 1; i <= 5; i++) {
    db.prepare('INSERT INTO mesas (numero, nome, status, capacidade) VALUES (?, ?, ?, ?)').run(
      i, `Mesa ${i}`, 'livre', i <= 4 ? 4 : 6
    )
  }

  // ── Fornecedores ──────────────────────────────────────────────────────────
  db.prepare('DELETE FROM fornecedores').run()
  const fornecedores = [
    { nome: 'Distribuidora Bom Sabor', contato: 'João Carlos', telefone: '(21) 3333-1111', email: 'bomsabor@email.com', produtos: 'Carnes, frangos e embutidos' },
    { nome: 'Bebidas Fluminense', contato: 'Maria Lúcia', telefone: '(21) 3333-2222', email: 'fluminense@email.com', produtos: 'Refrigerantes, águas e sucos' },
    { nome: 'Padaria Central RJ', contato: 'Roberto Silva', telefone: '(21) 3333-3333', email: 'padaria@email.com', produtos: 'Pães, bolos e massas' },
  ]
  for (const f of fornecedores) {
    db.prepare(`
      INSERT INTO fornecedores (nome, contato, telefone, email, produtos_fornecidos, ativo)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(f.nome, f.contato, f.telefone, f.email, f.produtos)
  }

  // ── Entregadores ──────────────────────────────────────────────────────────
  db.prepare('DELETE FROM entregadores').run()
  db.prepare("INSERT INTO entregadores (nome, telefone, veiculo, ativo) VALUES ('Carlos Moto', '(21) 99888-7766', 'Moto Honda CG 160', 1)").run()
  db.prepare("INSERT INTO entregadores (nome, telefone, veiculo, ativo) VALUES ('Pedro Bike', '(21) 99777-5544', 'Bicicleta elétrica', 1)").run()

  // ── Zonas de Entrega ──────────────────────────────────────────────────────
  db.prepare('DELETE FROM zonas_entrega').run()
  const zonas = [
    { bairro: 'Centro', taxa: 0 },
    { bairro: 'Jardim Iguaçu', taxa: 3 },
    { bairro: 'Cabuçu', taxa: 5 },
    { bairro: 'Comendador Soares', taxa: 4 },
    { bairro: 'Moquetá', taxa: 3 },
    { bairro: 'Rancho Novo', taxa: 6 },
    { bairro: 'Vila de Cava', taxa: 8 },
    { bairro: 'Austin', taxa: 5 },
  ]
  for (const z of zonas) {
    db.prepare("INSERT INTO zonas_entrega (bairro, municipio, taxa_entrega, ativo) VALUES (?, 'Nova Iguaçu', ?, 1)").run(z.bairro, z.taxa)
  }

  // ── Pedidos Demo ──────────────────────────────────────────────────────────
  db.prepare('DELETE FROM itens_pedido').run()
  db.prepare('DELETE FROM pedidos').run()

  const clientes = [
    { nome: 'Ana Paula Ferreira', tel: '(21) 99111-2222', bairro: 'Centro', endereco: 'Rua Dom Pedro II, 123' },
    { nome: 'Marcos Oliveira', tel: '(21) 99333-4444', bairro: 'Jardim Iguaçu', endereco: 'Av. Governador Portela, 456' },
    { nome: 'Fernanda Costa', tel: '(21) 99555-6666', bairro: 'Cabuçu', endereco: 'Rua do Comércio, 789' },
    { nome: 'Ricardo Santos', tel: '(21) 99777-8888', bairro: 'Comendador Soares', endereco: 'Rua das Flores, 321' },
    { nome: 'Juliana Mendes', tel: '(21) 99999-0000', bairro: 'Moquetá', endereco: 'Av. Abílio Augusto Távora, 654' },
  ]

  const pedidosDemo = [
    { cliente: clientes[0], tipo: 'entrega', forma: 'pix', taxa: 0, itens: [{ nome: 'X-Bacon', preco: 22, qty: 1 }, { nome: 'Batata Frita', preco: 14, qty: 1 }, { nome: 'Coca-Cola 350ml', preco: 6, qty: 2 }], status: 'entregue' },
    { cliente: clientes[1], tipo: 'entrega', forma: 'dinheiro', taxa: 3, troco: 60, itens: [{ nome: 'Pizza Calabresa', preco: 48, qty: 1 }, { nome: 'Suco de Laranja', preco: 8, qty: 2 }], status: 'entregue' },
    { cliente: clientes[2], tipo: 'retirada', forma: 'credito', taxa: 0, itens: [{ nome: 'Frango Grelhado', preco: 28, qty: 2 }, { nome: 'Água Mineral', preco: 4, qty: 2 }], status: 'entregue' },
    { cliente: clientes[3], tipo: 'entrega', forma: 'debito', taxa: 4, itens: [{ nome: 'Filé à Parmegiana', preco: 35, qty: 1 }, { nome: 'Coca-Cola 350ml', preco: 6, qty: 1 }], status: 'entregue' },
    { cliente: clientes[4], tipo: 'entrega', forma: 'pix', taxa: 3, itens: [{ nome: 'X-Burguer', preco: 18, qty: 2 }, { nome: 'Batata Frita', preco: 14, qty: 1 }, { nome: 'Suco de Laranja', preco: 8, qty: 1 }], status: 'entregue' },
    { cliente: clientes[0], tipo: 'entrega', forma: 'pix', taxa: 0, itens: [{ nome: 'Pizza Frango c/ Catupiry', preco: 52, qty: 1 }, { nome: 'Coca-Cola 350ml', preco: 6, qty: 2 }], status: 'em_preparo' },
    { cliente: clientes[1], tipo: 'retirada', forma: 'dinheiro', taxa: 0, troco: 50, itens: [{ nome: 'Prato Feito (PF)', preco: 18, qty: 2 }, { nome: 'Suco de Laranja', preco: 8, qty: 1 }], status: 'pronto' },
    { cliente: clientes[2], tipo: 'entrega', forma: 'pix', taxa: 5, itens: [{ nome: 'X-Bacon', preco: 22, qty: 1 }, { nome: 'X-Salada', preco: 16, qty: 1 }, { nome: 'Coca-Cola 350ml', preco: 6, qty: 2 }], status: 'saiu' },
    { cliente: clientes[3], tipo: 'entrega', forma: 'debito', taxa: 4, itens: [{ nome: 'Pizza Margherita', preco: 45, qty: 1 }, { nome: 'Brownie', preco: 12, qty: 2 }], status: 'recebido' },
    { cliente: clientes[4], tipo: 'retirada', forma: 'credito', taxa: 0, itens: [{ nome: 'Açaí 300ml', preco: 16, qty: 2 }, { nome: 'Vitamina de Banana', preco: 10, qty: 1 }], status: 'entregue' },
  ]

  let numPedido = 1
  for (const p of pedidosDemo) {
    const subtotal = p.itens.reduce((a, b) => a + (b.preco * b.qty), 0)
    const total = subtotal + (p.taxa || 0)
    const horasAtras = Math.floor(Math.random() * 72)
    const criadoEm = new Date(Date.now() - horasAtras * 3600000).toISOString()

    const result = db.prepare(`
      INSERT INTO pedidos (numero_pedido, telefone_cliente, nome_cliente, tipo_entrega,
        endereco_entrega, forma_pagamento, troco_para, taxa_entrega, subtotal, total,
        status, origem, bairro_entrega, criado_em, atualizado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pdv', ?, ?, ?)
    `).run(numPedido++, p.cliente.tel, p.cliente.nome, p.tipo,
      JSON.stringify({ logradouro: p.cliente.endereco, bairro: p.cliente.bairro }),
      p.forma, p.troco || null, p.taxa || 0, subtotal, total,
      p.status, p.cliente.bairro, criadoEm, criadoEm)

    for (const item of p.itens) {
      db.prepare(`
        INSERT INTO itens_pedido (pedido_id, nome_item, quantidade, preco_unitario, subtotal)
        VALUES (?, ?, ?, ?, ?)
      `).run(result.lastInsertRowid, item.nome, item.qty, item.preco, item.preco * item.qty)
    }
  }

  // ── Sessão de Caixa Aberta ────────────────────────────────────────────────
  db.prepare('DELETE FROM caixa_sessoes').run()
  db.prepare('DELETE FROM caixa_movimentacoes').run()
  const sessaoId = db.prepare(`
    INSERT INTO caixa_sessoes (aberto_em, valor_inicial, total_dinheiro, total_pix, total_debito, total_credito, status)
    VALUES (datetime('now', '-8 hours'), 100, 82, 116, 41, 63, 'aberto')
  `).run().lastInsertRowid

  // ── Contas a Pagar Demo ───────────────────────────────────────────────────
  db.prepare('DELETE FROM contas_pagar').run()
  const hoje = new Date()
  const addDias = (d) => new Date(hoje.getTime() + d * 86400000).toISOString().split('T')[0]
  db.prepare("INSERT INTO contas_pagar (descricao, valor, vencimento, status, categoria, criado_em) VALUES ('Aluguel do estabelecimento', 1800, ?, 'pendente', 'Aluguel', datetime('now'))").run(addDias(5))
  db.prepare("INSERT INTO contas_pagar (descricao, valor, vencimento, status, categoria, criado_em) VALUES ('Conta de energia elétrica', 380, ?, 'pendente', 'Utilidades', datetime('now'))").run(addDias(3))
  db.prepare("INSERT INTO contas_pagar (descricao, valor, vencimento, status, categoria, criado_em) VALUES ('Fornecedor Bom Sabor - carnes', 720, ?, 'pendente', 'Fornecedores', datetime('now'))").run(addDias(2))
  db.prepare("INSERT INTO contas_pagar (descricao, valor, vencimento, status, categoria, pago_em, criado_em) VALUES ('Internet e telefone', 150, ?, 'pago', 'Utilidades', datetime('now', '-2 days'), datetime('now'))").run(addDias(-5))

  // ── Contas a Receber Demo ─────────────────────────────────────────────────
  db.prepare('DELETE FROM contas_receber').run()
  db.prepare("INSERT INTO contas_receber (descricao, valor, vencimento, status, criado_em) VALUES ('Evento corporativo - empresa XYZ', 450, ?, 'pendente', datetime('now'))").run(addDias(7))

  console.log('✅ Seed do modo demo concluído — Sabor da Vila carregado!')
}

module.exports = { seed }
