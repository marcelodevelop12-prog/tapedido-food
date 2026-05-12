import React, { useEffect, useState, useMemo } from 'react'
import { X, Plus, Minus, Search, ShoppingCart, ChevronLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../../lib/api'
import { formatarMoeda } from '../../lib/utils'

const isElectron = typeof window !== 'undefined' && window.api

const FORMAS_PAGAMENTO = [
  { value: 'dinheiro', label: '💵 Dinheiro' },
  { value: 'pix', label: '💠 Pix' },
  { value: 'debito', label: '💳 Débito' },
  { value: 'credito', label: '💳 Crédito' },
]

const TIPOS_ENTREGA = [
  { value: 'entrega', label: '🛵 Delivery' },
  { value: 'retirada', label: '🏃 Retirada' },
  { value: 'mesa', label: '🪑 Mesa' },
]

export default function NovoPedido({ tipoInicial = 'delivery', mesa, comanda, onFechar, onPedidoCriado }) {
  const [etapa, setEtapa] = useState('itens') // itens, checkout
  const [produtos, setProdutos] = useState([])
  const [categoriaAtiva, setCategoriaAtiva] = useState('Todos')
  const [busca, setBusca] = useState('')
  const [carrinho, setCarrinho] = useState([])
  const [tipo, setTipo] = useState(tipoInicial === 'mesa' ? 'mesa' : 'entrega')
  const [zonas, setZonas] = useState([])
  const [form, setForm] = useState({
    nomeCliente: '', telefone: '', bairro: '', logradouro: '', complemento: '',
    formaPagamento: 'pix', trocoPara: '', observacoes: ''
  })
  const [modalMeioMeio, setModalMeioMeio] = useState(null)
  const [modalPeso, setModalPeso] = useState(null)   // produto kg aguardando peso
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    Promise.all([api.produtos.listar(), api.zonas.listar()]).then(([p, z]) => {
      setProdutos(p.filter(prod => prod.disponivel))
      setZonas(z)
    })
  }, [])

  const categorias = useMemo(() => ['Todos', ...new Set(produtos.map(p => p.categoria).filter(Boolean))], [produtos])

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
    // If product is sold by kg, open weight modal instead of adding directly
    if (produto.unidade === 'kg') {
      setModalPeso(produto)
    } else {
      adicionarItem(produto)
    }
  }

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
    toast.success(`${produto.nome} adicionado!`, { duration: 1000 })
  }

  function adicionarMeioMeio(sabor1, sabor2) {
    const preco = Math.max(sabor1.preco, sabor2.preco)
    setCarrinho(prev => [...prev, {
      menuItemId: sabor1.id,
      nomeItem: `Pizza Meio a Meio`,
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

    setSalvando(true)
    try {
      // Se for mesa, adiciona à comanda
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
        // Cria pedido (delivery ou retirada)
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
    } catch (err) {
      toast.error('Erro ao criar pedido')
    } finally {
      setSalvando(false)
    }
  }

  const pizzas = produtos.filter(p => p.permite_meio_meio)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex">
      <div className="flex flex-col bg-white w-[90vw] max-w-7xl mx-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <button onClick={onFechar} className="p-2 hover:bg-gray-100 rounded-lg">
              <X size={18} />
            </button>
            <h2 className="font-bold text-gray-800 text-lg">
              {mesa ? `${mesa.nome || `Mesa ${mesa.numero}`} — Novo Pedido` : 'Novo Pedido'}
            </h2>
          </div>

          {!mesa && (
            <div className="flex gap-2">
              {TIPOS_ENTREGA.filter(t => t.value !== 'mesa').map(t => (
                <button
                  key={t.value}
                  onClick={() => setTipo(t.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    tipo === t.value ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Produtos */}
          <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-100">
            {/* Categorias + busca */}
            <div className="p-4 border-b border-gray-100 space-y-3">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar produto..."
                  className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div className="flex gap-2 overflow-x-auto">
                {categorias.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategoriaAtiva(cat)}
                    className={`whitespace-nowrap px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      categoriaAtiva === cat ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Lista de produtos */}
            <div className="flex-1 overflow-y-auto p-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 content-start">
              {/* Botão meio a meio */}
              {(categoriaAtiva === 'Todos' || categoriaAtiva === 'Pizzas') && pizzas.length >= 2 && !busca && (
                <button
                  onClick={() => setModalMeioMeio('selecionar')}
                  className="flex flex-col items-center justify-center border-2 border-dashed border-orange-300 rounded-xl p-4 hover:bg-orange-50 transition-colors"
                >
                  <span className="text-3xl mb-1">🍕</span>
                  <span className="font-medium text-orange-600 text-sm">Pizza Meio a Meio</span>
                  <span className="text-xs text-gray-400">Escolher 2 sabores</span>
                </button>
              )}

              {produtosFiltrados.map(produto => (
                <button
                  key={produto.id}
                  onClick={() => handleClicarProduto(produto)}
                  className="flex flex-col border border-gray-100 rounded-xl overflow-hidden hover:shadow-md hover:border-orange-200 transition-all text-left"
                >
                  <img
                    src={produto.imagem || ''}
                    alt={produto.nome}
                    className="w-full h-32 object-cover bg-gray-100"
                    onError={e => { e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(produto.nome)}&background=fed7aa&color=c2410c&size=200` }}
                  />
                  <div className="p-3">
                    <p className="font-semibold text-gray-800 text-sm leading-tight">{produto.nome}</p>
                    <p className="text-orange-600 font-bold text-sm mt-1">{formatarMoeda(produto.preco)}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Carrinho */}
          <div className="flex flex-col w-96 bg-gray-50">
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <ShoppingCart size={16} className="text-orange-500" />
                Pedido
                {carrinho.length > 0 && (
                  <span className="bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-full">{carrinho.length}</span>
                )}
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {carrinho.length === 0 ? (
                <div className="text-center text-gray-400 pt-10">
                  <ShoppingCart size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Clique nos produtos para adicionar</p>
                </div>
              ) : carrinho.map((item, i) => (
                <div key={i} className="bg-white rounded-lg p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{item.nomeItem}</p>
                      {item.descricao && <p className="text-xs text-gray-400">{item.descricao}</p>}
                      {item.observacao && <p className="text-xs text-blue-500">{item.observacao}</p>}
                    </div>
                    <p className="text-sm font-bold text-orange-600 whitespace-nowrap">{formatarMoeda(item.subtotal)}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <button onClick={() => alterarQtd(i, -1)} className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
                      <Minus size={12} />
                    </button>
                    <span className="text-sm font-medium w-6 text-center">{item.quantidade}</span>
                    <button onClick={() => alterarQtd(i, 1)} className="w-6 h-6 rounded-full bg-orange-100 hover:bg-orange-200 flex items-center justify-center">
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Dados do cliente (delivery/retirada) */}
            {tipo !== 'mesa' && (
              <div className="border-t border-gray-200 p-3 space-y-2 max-h-48 overflow-y-auto">
                <input value={form.nomeCliente} onChange={e => setForm(p => ({ ...p, nomeCliente: e.target.value }))} placeholder="Nome do cliente *" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-orange-500" />
                <input value={form.telefone} onChange={e => setForm(p => ({ ...p, telefone: e.target.value }))} placeholder="Telefone" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-orange-500" />
                {tipo === 'entrega' && (
                  <>
                    <select value={form.bairro} onChange={e => setForm(p => ({ ...p, bairro: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-orange-500">
                      <option value="">Bairro / Zona</option>
                      {zonas.map(z => <option key={z.id} value={z.bairro}>{z.bairro} {z.taxa_entrega > 0 ? `(+${formatarMoeda(z.taxa_entrega)})` : '(Grátis)'}</option>)}
                    </select>
                    <input value={form.logradouro} onChange={e => setForm(p => ({ ...p, logradouro: e.target.value }))} placeholder="Endereço" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-orange-500" />
                  </>
                )}
                <div className="flex gap-2">
                  {FORMAS_PAGAMENTO.map(f => (
                    <button key={f.value} onClick={() => setForm(p => ({ ...p, formaPagamento: f.value }))} className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${form.formaPagamento === f.value ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                      {f.value === 'dinheiro' ? '💵' : f.value === 'pix' ? '💠' : '💳'}
                    </button>
                  ))}
                </div>
                {form.formaPagamento === 'dinheiro' && (
                  <input type="number" value={form.trocoPara} onChange={e => setForm(p => ({ ...p, trocoPara: e.target.value }))} placeholder="Troco para R$..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-orange-500" />
                )}
              </div>
            )}

            {/* Totais e botão */}
            <div className="border-t border-gray-200 p-4 space-y-2">
              {taxaEntrega > 0 && (
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Taxa de entrega</span>
                  <span>{formatarMoeda(taxaEntrega)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-gray-800">
                <span>Total</span>
                <span className="text-orange-600 text-lg">{formatarMoeda(total)}</span>
              </div>
              <button
                onClick={finalizar}
                disabled={carrinho.length === 0 || salvando}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {salvando ? 'Salvando...' : tipo === 'mesa' ? 'Adicionar à Comanda' : 'Confirmar Pedido'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Meio a Meio */}
      {modalMeioMeio && <MeioMeioModal pizzas={pizzas} onConfirmar={adicionarMeioMeio} onFechar={() => setModalMeioMeio(null)} />}

      {/* Modal Balança (produtos por kg) */}
      {modalPeso && (
        <ModalPeso
          produto={modalPeso}
          onConfirmar={(qty) => {
            adicionarItem(modalPeso, qty)
            setModalPeso(null)
          }}
          onFechar={() => setModalPeso(null)}
        />
      )}
    </div>
  )
}

function ModalPeso({ produto, onConfirmar, onFechar }) {
  const [peso, setPeso] = useState(0)
  const [manual, setManual] = useState('')
  const [conectado, setConectado] = useState(false)

  useEffect(() => {
    // Check if scale is connected and start listening
    async function init() {
      if (!isElectron) return
      const ok = await window.api.balanca.status()
      setConectado(ok)
      if (ok) {
        window.api.balanca.onPeso((p) => setPeso(p))
      }
    }
    init()
    return () => {
      if (isElectron) window.api.balanca.offPeso()
    }
  }, [])

  const pesoFinal = conectado ? peso : (parseFloat(manual) || 0)
  const subtotal  = pesoFinal * produto.preco

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
                type="number"
                value={manual}
                onChange={e => setManual(e.target.value)}
                placeholder="0.000"
                step="0.001"
                min="0"
                autoFocus
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
            <button
              onClick={onFechar}
              className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => pesoFinal > 0 && onConfirmar(pesoFinal)}
              disabled={pesoFinal <= 0}
              className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
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
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-60 p-4">
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
            className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-lg font-semibold transition-colors disabled:opacity-50"
          >
            Adicionar Pizza Meio a Meio
          </button>
        </div>
      </div>
    </div>
  )
}
