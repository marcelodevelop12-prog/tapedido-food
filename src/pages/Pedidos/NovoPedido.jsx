import React, { useEffect, useState, useMemo } from 'react'
import { X, Plus, Minus, Search, ShoppingCart } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../../lib/api'
import { formatarMoeda } from '../../lib/utils'
import { useLeitorCodigoBarras } from '../../hooks/useLeitorCodigoBarras'

const isElectron = typeof window !== 'undefined' && window.api

const FORMAS_PAGAMENTO = [
  { value: 'dinheiro', label: 'Dinheiro', emoji: '💵' },
  { value: 'pix',      label: 'Pix',      emoji: '📱' },
  { value: 'debito',   label: 'Débito',   emoji: '💳' },
  { value: 'credito',  label: 'Crédito',  emoji: '🏦' },
]

export default function NovoPedido({ tipoInicial = 'delivery', mesa, comanda, onFechar, onPedidoCriado }) {
  const [produtos, setProdutos] = useState([])
  const [categoriaAtiva, setCategoriaAtiva] = useState('Todos')
  const [busca, setBusca] = useState('')
  const [carrinho, setCarrinho] = useState([])
  const [tipo, setTipo] = useState(tipoInicial === 'mesa' ? 'mesa' : 'entrega')
  const [zonas, setZonas] = useState([])
  const [form, setForm] = useState({
    nomeCliente: '', telefone: '', bairro: '', logradouro: '', complemento: '',
    formaPagamento: 'pix', trocoPara: '', observacoes: '',
  })
  const [modalMeioMeio, setModalMeioMeio] = useState(null)
  const [modalPeso, setModalPeso] = useState(null)
  const [salvando, setSalvando] = useState(false)

  const [pedidoMinimo, setPedidoMinimo] = useState(0)

  useEffect(() => {
    Promise.all([api.produtos.listar(), api.zonas.listar()]).then(([p, z]) => {
      setProdutos(p.filter(prod => prod.disponivel))
      setZonas(z)
    })
    api.config.get().then(c => setPedidoMinimo(Number(c?.pedido_minimo) || 0)).catch(() => {})
  }, [])

  const categorias = useMemo(() =>
    ['Todos', ...new Set(produtos.map(p => p.categoria).filter(Boolean))],
  [produtos])

  const produtosFiltrados = useMemo(() => produtos.filter(p => {
    const matchCat = categoriaAtiva === 'Todos' || p.categoria === categoriaAtiva
    const matchBusca = !busca || p.nome.toLowerCase().includes(busca.toLowerCase())
    return matchCat && matchBusca
  }), [produtos, categoriaAtiva, busca])

  const taxaEntrega = useMemo(() => {
    if (tipo !== 'entrega') return 0
    const zona = zonas.find(z => z.bairro === form.bairro)
    return zona?.taxa_entrega || 0
  }, [tipo, form.bairro, zonas])

  const subtotal = useMemo(() => carrinho.reduce((a, b) => a + b.subtotal, 0), [carrinho])
  const total = subtotal + taxaEntrega

  function handleClicarProduto(produto) {
    if (produto.unidade === 'kg') {
      setModalPeso(produto)
    } else {
      adicionarItem(produto)
    }
  }

  // Leitor de codigo de barras. Fica desligado com modal aberto para o codigo
  // nao cair na tela errada enquanto o operador escolhe sabor ou pesa produto.
  useLeitorCodigoBarras(async (codigo) => {
    // O leitor "digita" o codigo, entao os digitos tambem caem na busca. Limpar
    // aqui evita a lista ficar vazia depois de bipar.
    setBusca('')

    let produto
    try {
      produto = await api.produtos.buscarPorCodigoBarras(codigo)
    } catch {
      toast.error('Erro ao buscar o código lido')
      return
    }

    if (!produto) {
      toast.error(`Código ${codigo} não cadastrado em nenhum produto`)
      return
    }
    if (!produto.disponivel) {
      // Diferente de "nao cadastrado": aqui o lojista so precisa reativar.
      toast.error(`${produto.nome} está desativado no cardápio`)
      return
    }

    handleClicarProduto(produto)
  }, !modalMeioMeio && !modalPeso)

  function adicionarItem(produto, quantidade = 1, obs = '', adicionais = []) {
    const precoBase = produto.preco
    const precoAdicionais = adicionais.reduce((a, b) => a + b.preco, 0)
    const precoUnitario = precoBase + precoAdicionais

    const existente = carrinho.find(c =>
      c.menuItemId === produto.id && c.observacao === obs &&
      JSON.stringify(c.adicionaisEscolhidos) === JSON.stringify(adicionais)
    )

    if (existente) {
      setCarrinho(prev => prev.map(c =>
        c === existente
          ? { ...c, quantidade: c.quantidade + quantidade, subtotal: (c.quantidade + quantidade) * precoUnitario }
          : c
      ))
    } else {
      setCarrinho(prev => [...prev, {
        menuItemId: produto.id,
        nomeItem: produto.nome,
        quantidade,
        precoUnitario,
        subtotal: quantidade * precoUnitario,
        observacao: obs,
        adicionaisEscolhidos: adicionais,
      }])
    }
    toast.success(`${produto.nome} adicionado!`, { duration: 900 })
  }

  function adicionarMeioMeio(sabor1, sabor2) {
    const preco = Math.max(sabor1.preco, sabor2.preco)
    setCarrinho(prev => [...prev, {
      menuItemId: sabor1.id,
      nomeItem: 'Pizza Meio a Meio',
      quantidade: 1,
      precoUnitario: preco,
      subtotal: preco,
      observacao: '',
      adicionaisEscolhidos: [],
      sabor2: sabor2.nome,
      precoSabor2: sabor2.preco,
      descricao: `${sabor1.nome} + ${sabor2.nome}`,
    }])
    setModalMeioMeio(null)
    toast.success('Pizza meio a meio adicionada!')
  }

  function alterarQtd(index, delta) {
    setCarrinho(prev => prev.map((c, i) => {
      if (i !== index) return c
      const novaQtd = c.quantidade + delta
      if (novaQtd <= 0) return null
      return { ...c, quantidade: novaQtd, subtotal: novaQtd * c.precoUnitario }
    }).filter(Boolean))
  }

  async function finalizar() {
    if (carrinho.length === 0) { toast.error('Adicione ao menos um item'); return }
    if (tipo === 'entrega' && !form.nomeCliente) { toast.error('Informe o nome do cliente'); return }
    // Pedido mínimo vale só para entrega e incide sobre os itens, não sobre a taxa
    if (tipo === 'entrega' && pedidoMinimo > 0 && subtotal < pedidoMinimo) {
      toast.error(`Pedido mínimo para entrega é ${formatarMoeda(pedidoMinimo)} (sem a taxa). Faltam ${formatarMoeda(pedidoMinimo - subtotal)}.`)
      return
    }

    setSalvando(true)
    try {
      if (tipo === 'mesa' && comanda) {
        for (const item of carrinho) {
          await api.comandas.addItem({
            comandaId: comanda.id,
            menuItemId: item.menuItemId,
            nomeItem: item.nomeItem,
            quantidade: item.quantidade,
            precoUnitario: item.precoUnitario,
            sabor2: item.sabor2 || null,
            precoSabor2: item.precoSabor2 || null,
            adicionaisEscolhidos: item.adicionaisEscolhidos,
            observacao: item.observacao,
          })
        }
        toast.success('Itens adicionados à comanda!')
      } else {
        await api.pedidos.criar({
          nomeCliente: form.nomeCliente,
          telefoneCliente: tipo === 'mesa' ? 'mesa-' + (mesa?.numero ?? mesa?.id ?? 'X') : form.telefone,
          tipoEntrega: tipo,
          enderecoEntrega: { logradouro: form.logradouro, bairro: form.bairro, complemento: form.complemento },
          formaPagamento: form.formaPagamento,
          trocoPara: form.formaPagamento === 'dinheiro' && form.trocoPara ? parseFloat(form.trocoPara) : null,
          bairroEntrega: form.bairro,
          taxaEntrega,
          subtotal,
          total,
          observacoes: form.observacoes,
          itens: carrinho,
        })
        toast.success('Pedido criado!')
      }
      onPedidoCriado?.()
    } catch {
      toast.error('Erro ao criar pedido')
    } finally {
      setSalvando(false)
    }
  }

  const pizzas = produtos.filter(p => p.permite_meio_meio)

  return (
    <div className="fixed inset-0 z-50 flex bg-white overflow-hidden">

      {/* ═══════════════════════════════════════
          COLUNA ESQUERDA — 70% — Produtos
      ═══════════════════════════════════════ */}
      <div className="flex flex-col overflow-hidden" style={{ width: '70%' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={onFechar}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Voltar"
            >
              <X size={20} className="text-gray-600" />
            </button>
            <h2 className="font-bold text-gray-800 text-lg">
              {mesa ? `${mesa.nome || `Mesa ${mesa.numero}`} — Adicionar Itens` : 'Novo Pedido'}
            </h2>
          </div>

          {!mesa && (
            <div className="flex gap-2">
              {[
                { value: 'entrega',  label: '🛵 Delivery' },
                { value: 'retirada', label: '🏃 Retirada' },
              ].map(t => (
                <button
                  key={t.value}
                  onClick={() => setTipo(t.value)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    tipo === t.value
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Busca + Categorias */}
        <div className="px-5 pt-3 pb-2 border-b border-gray-100 shrink-0 space-y-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar produto ou bipar código de barras..."
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {categorias.map(cat => (
              <button
                key={cat}
                onClick={() => setCategoriaAtiva(cat)}
                className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium transition-colors shrink-0 ${
                  categoriaAtiva === cat
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-orange-50 hover:text-orange-600'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Grade de produtos */}
        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-4 gap-4 content-start">
          {/* Botão pizza meio a meio */}
          {(categoriaAtiva === 'Todos' || categoriaAtiva === 'Pizzas') && pizzas.length >= 2 && !busca && (
            <button
              onClick={() => setModalMeioMeio('selecionar')}
              className="flex flex-col items-center justify-center border-2 border-dashed border-orange-300 rounded-xl p-4 hover:bg-orange-50 transition-colors min-h-[160px]"
            >
              <span className="text-4xl mb-2">🍕</span>
              <span className="font-semibold text-orange-600 text-sm text-center leading-tight">Pizza Meio a Meio</span>
              <span className="text-xs text-gray-400 mt-1">2 sabores</span>
            </button>
          )}

          {produtosFiltrados.map(produto => (
            <button
              key={produto.id}
              onClick={() => handleClicarProduto(produto)}
              className="flex flex-col border border-gray-100 rounded-xl overflow-hidden hover:shadow-lg hover:border-orange-200 transition-all text-left min-h-[160px]"
            >
              <img
                src={produto.imagem || ''}
                alt={produto.nome}
                className="w-full object-cover bg-gray-100"
                style={{ height: '112px' }}
                onError={e => {
                  e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(produto.nome)}&background=fed7aa&color=c2410c&size=200`
                }}
              />
              <div className="flex-1 p-2.5 flex flex-col justify-between">
                <p className="font-semibold text-gray-800 text-sm leading-tight line-clamp-2">{produto.nome}</p>
                <p className="text-orange-600 font-bold text-sm mt-1">{formatarMoeda(produto.preco)}</p>
              </div>
            </button>
          ))}

          {produtosFiltrados.length === 0 && (
            <div className="col-span-4 text-center py-16 text-gray-400">
              <p className="text-4xl mb-2">🔍</p>
              <p>Nenhum produto encontrado</p>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════
          COLUNA DIREITA — 30% — Resumo
      ═══════════════════════════════════════ */}
      <div className="flex flex-col bg-gray-50 border-l border-gray-200 overflow-hidden" style={{ width: '30%' }}>

        {/* Título do carrinho */}
        <div className="px-5 py-3 border-b border-gray-200 shrink-0">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <ShoppingCart size={18} className="text-orange-500" />
            Pedido
            {carrinho.length > 0 && (
              <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full font-semibold">
                {carrinho.reduce((a, b) => a + b.quantidade, 0)}
              </span>
            )}
          </h3>
        </div>

        {/* Corpo rolável: itens + dados do cliente + pagamento */}
        <div className="flex-1 overflow-y-auto">

          {/* Itens do carrinho */}
          <div className="p-4 space-y-2">
            {carrinho.length === 0 ? (
              <div className="text-center text-gray-400 py-10">
                <ShoppingCart size={36} className="mx-auto mb-2 opacity-25" />
                <p className="text-sm">Clique nos produtos para adicionar</p>
              </div>
            ) : carrinho.map((item, i) => (
              <div key={i} className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 leading-tight">{item.nomeItem}</p>
                    {item.descricao && <p className="text-xs text-gray-400 mt-0.5">{item.descricao}</p>}
                    {item.observacao && <p className="text-xs text-blue-500 mt-0.5">{item.observacao}</p>}
                    {item.adicionaisEscolhidos?.length > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">{item.adicionaisEscolhidos.map(a => a.nome).join(', ')}</p>
                    )}
                  </div>
                  <p className="text-sm font-bold text-orange-600 whitespace-nowrap">{formatarMoeda(item.subtotal)}</p>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => alterarQtd(i, -1)}
                    className="w-7 h-7 rounded-full bg-gray-100 hover:bg-red-100 hover:text-red-600 flex items-center justify-center transition-colors"
                  >
                    <Minus size={13} />
                  </button>
                  <span className="text-sm font-bold w-6 text-center">{item.quantidade}</span>
                  <button
                    onClick={() => alterarQtd(i, 1)}
                    className="w-7 h-7 rounded-full bg-orange-100 hover:bg-orange-200 flex items-center justify-center transition-colors"
                  >
                    <Plus size={13} />
                  </button>
                  <span className="ml-auto text-xs text-gray-400">{formatarMoeda(item.precoUnitario)} un</span>
                </div>
              </div>
            ))}
          </div>

          {/* Dados do cliente — somente delivery/retirada */}
          {tipo !== 'mesa' && (
            <div className="px-4 pb-4 space-y-2 border-t border-gray-200 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Dados do Cliente</p>
              <input
                value={form.nomeCliente}
                onChange={e => setForm(p => ({ ...p, nomeCliente: e.target.value }))}
                placeholder="Nome do cliente *"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
              />
              <input
                value={form.telefone}
                onChange={e => setForm(p => ({ ...p, telefone: e.target.value }))}
                placeholder="Telefone"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
              />
              {tipo === 'entrega' && (
                <>
                  <select
                    value={form.bairro}
                    onChange={e => setForm(p => ({ ...p, bairro: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                  >
                    <option value="">Bairro / Zona de entrega</option>
                    {zonas.map(z => (
                      <option key={z.id} value={z.bairro}>
                        {z.bairro} {z.taxa_entrega > 0 ? `(+${formatarMoeda(z.taxa_entrega)})` : '(Grátis)'}
                      </option>
                    ))}
                  </select>
                  <input
                    value={form.logradouro}
                    onChange={e => setForm(p => ({ ...p, logradouro: e.target.value }))}
                    placeholder="Endereço completo"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                  />
                  <input
                    value={form.complemento}
                    onChange={e => setForm(p => ({ ...p, complemento: e.target.value }))}
                    placeholder="Complemento (opcional)"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                  />
                </>
              )}
              <textarea
                value={form.observacoes}
                onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))}
                placeholder="Observações do pedido..."
                rows={2}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white resize-none"
              />
            </div>
          )}

          {/* Forma de pagamento — somente delivery/retirada */}
          {tipo !== 'mesa' && (
            <div className="px-4 pb-4 border-t border-gray-200 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Pagamento</p>
              <div className="grid grid-cols-2 gap-2">
                {FORMAS_PAGAMENTO.map(f => (
                  <button
                    key={f.value}
                    onClick={() => setForm(p => ({ ...p, formaPagamento: f.value }))}
                    className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 font-medium text-sm transition-all ${
                      form.formaPagamento === f.value
                        ? 'border-orange-500 bg-orange-50 text-orange-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-orange-200'
                    }`}
                  >
                    <span className="text-2xl">{f.emoji}</span>
                    <span className="text-xs">{f.label}</span>
                  </button>
                ))}
              </div>
              {form.formaPagamento === 'dinheiro' && (
                <input
                  type="number"
                  value={form.trocoPara}
                  onChange={e => setForm(p => ({ ...p, trocoPara: e.target.value }))}
                  placeholder="Troco para R$..."
                  className="w-full mt-2 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                />
              )}
            </div>
          )}

        </div>

        {/* Rodapé fixo: totais + botão confirmar */}
        <div className="shrink-0 border-t border-gray-200 bg-white px-5 py-4 space-y-2">
          {subtotal > 0 && taxaEntrega > 0 && (
            <div className="flex justify-between text-sm text-gray-500">
              <span>Subtotal</span>
              <span>{formatarMoeda(subtotal)}</span>
            </div>
          )}
          {taxaEntrega > 0 && (
            <div className="flex justify-between text-sm text-gray-500">
              <span>Taxa de entrega</span>
              <span>{formatarMoeda(taxaEntrega)}</span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="font-bold text-gray-800 text-base">Total</span>
            <span className="font-bold text-orange-600 text-xl">{formatarMoeda(total)}</span>
          </div>
          <button
            onClick={finalizar}
            disabled={carrinho.length === 0 || salvando}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3.5 rounded-xl font-bold text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {salvando
              ? 'Salvando...'
              : tipo === 'mesa'
                ? `Adicionar à Comanda — ${formatarMoeda(total)}`
                : `Confirmar Pedido — ${formatarMoeda(total)}`}
          </button>
        </div>

      </div>

      {/* Modal Meio a Meio */}
      {modalMeioMeio && (
        <MeioMeioModal
          pizzas={pizzas}
          onConfirmar={adicionarMeioMeio}
          onFechar={() => setModalMeioMeio(null)}
        />
      )}

      {/* Modal Balança */}
      {modalPeso && (
        <ModalPeso
          produto={modalPeso}
          onConfirmar={(qty) => { adicionarItem(modalPeso, qty); setModalPeso(null) }}
          onFechar={() => setModalPeso(null)}
        />
      )}
    </div>
  )
}

// ── Modais (lógica inalterada) ────────────────────────────────────────────────

function ModalPeso({ produto, onConfirmar, onFechar }) {
  const [peso, setPeso] = useState(0)
  const [manual, setManual] = useState('')
  const [conectado, setConectado] = useState(false)

  useEffect(() => {
    async function init() {
      if (!isElectron) return
      const ok = await window.api.balanca.status()
      setConectado(ok)
      if (ok) window.api.balanca.onPeso(p => setPeso(p))
    }
    init()
    return () => { if (isElectron) window.api.balanca.offPeso() }
  }, [])

  const pesoFinal = conectado ? peso : (parseFloat(manual) || 0)
  const subtotal = pesoFinal * produto.preco

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-bold text-gray-800">⚖️ {produto.nome}</h3>
          <button onClick={onFechar} className="p-1 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-5">
          {conectado ? (
            <div className="text-center">
              <p className="text-xs text-green-600 font-medium mb-2">Leitura da balança em tempo real</p>
              <div className="bg-gray-950 rounded-xl p-6 font-mono">
                <span className="text-5xl font-bold text-green-400">{peso.toFixed(3)}</span>
                <span className="text-2xl text-green-600 ml-2">kg</span>
              </div>
              <p className="text-xs text-gray-400 mt-2">Coloque o produto na balança</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
                ⚠️ Balança não conectada. Configure em <strong>Configurações → Balança</strong> ou digite o peso manualmente.
              </div>
              <label className="block text-sm font-medium text-gray-700">Peso (kg)</label>
              <input
                type="number" value={manual} onChange={e => setManual(e.target.value)}
                placeholder="0.000" step="0.001" min="0" autoFocus
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-2xl font-mono text-center focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          )}
          {pesoFinal > 0 && (
            <div className="flex justify-between items-center bg-orange-50 rounded-lg px-4 py-3">
              <span className="text-sm text-gray-600">{pesoFinal.toFixed(3)} kg × {formatarMoeda(produto.preco)}/kg</span>
              <span className="font-bold text-orange-600">{formatarMoeda(subtotal)}</span>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={onFechar} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Cancelar</button>
            <button
              onClick={() => pesoFinal > 0 && onConfirmar(pesoFinal)}
              disabled={pesoFinal <= 0}
              className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              Confirmar {pesoFinal > 0 ? `${pesoFinal.toFixed(3)} kg` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function MeioMeioModal({ pizzas, onConfirmar, onFechar }) {
  const [sabor1, setSabor1] = useState(null)
  const [sabor2, setSabor2] = useState(null)

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-bold text-gray-800">🍕 Pizza Meio a Meio</h3>
          <button onClick={onFechar}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">1º Sabor</label>
            <div className="grid grid-cols-2 gap-2">
              {pizzas.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSabor1(p)}
                  className={`p-3 border-2 rounded-lg text-left text-sm transition-colors ${sabor1?.id === p.id ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-orange-300'}`}
                >
                  <div className="font-medium">{p.nome}</div>
                  <div className="text-orange-600 text-xs">{formatarMoeda(p.preco)}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">2º Sabor</label>
            <div className="grid grid-cols-2 gap-2">
              {pizzas.filter(p => p.id !== sabor1?.id).map(p => (
                <button
                  key={p.id}
                  onClick={() => setSabor2(p)}
                  className={`p-3 border-2 rounded-lg text-left text-sm transition-colors ${sabor2?.id === p.id ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-orange-300'}`}
                >
                  <div className="font-medium">{p.nome}</div>
                  <div className="text-orange-600 text-xs">{formatarMoeda(p.preco)}</div>
                </button>
              ))}
            </div>
          </div>
          {sabor1 && sabor2 && (
            <div className="bg-orange-50 rounded-lg p-3 text-sm text-orange-800">
              <strong>{sabor1.nome}</strong> + <strong>{sabor2.nome}</strong><br />
              Preço: <strong>{formatarMoeda(Math.max(sabor1.preco, sabor2.preco))}</strong> (maior sabor)
            </div>
          )}
          <button
            onClick={() => sabor1 && sabor2 && onConfirmar(sabor1, sabor2)}
            disabled={!sabor1 || !sabor2}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-lg font-semibold disabled:opacity-50"
          >
            Adicionar Pizza Meio a Meio
          </button>
        </div>
      </div>
    </div>
  )
}
