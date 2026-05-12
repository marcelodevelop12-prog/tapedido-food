import React, { useEffect, useState } from 'react'
import { Plus, Search, Edit2, Trash2, ToggleLeft, ToggleRight, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../../lib/api'
import { formatarMoeda } from '../../lib/utils'
import FormProduto from './FormProduto'

const CATEGORIAS_ICONE = {
  'Lanches': '🍔', 'Pratos': '🍽️', 'Pizzas': '🍕',
  'Bebidas': '🥤', 'Sobremesas': '🍨',
}

export default function Cardapio() {
  const [produtos, setProdutos] = useState([])
  const [busca, setBusca] = useState('')
  const [categoriaAtiva, setCategoriaAtiva] = useState('Todos')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [produtoEditando, setProdutoEditando] = useState(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => { carregar() }, [])

  async function carregar() {
    try {
      const data = await api.produtos.listar()
      setProdutos(data)
    } finally {
      setCarregando(false)
    }
  }

  const categorias = ['Todos', ...new Set(produtos.map(p => p.categoria).filter(Boolean))]

  const produtosFiltrados = produtos.filter(p => {
    const matchBusca = !busca || p.nome.toLowerCase().includes(busca.toLowerCase())
    const matchCat = categoriaAtiva === 'Todos' || p.categoria === categoriaAtiva
    return matchBusca && matchCat
  })

  async function toggleDisponivel(produto) {
    try {
      const atualizado = await api.produtos.toggleDisponivel(produto.id)
      setProdutos(prev => prev.map(p => p.id === produto.id ? { ...p, disponivel: atualizado.disponivel } : p))
      toast.success(atualizado.disponivel ? 'Produto ativado' : 'Produto desativado')
    } catch {
      toast.error('Erro ao alterar produto')
    }
  }

  async function excluir(produto) {
    if (!confirm(`Excluir "${produto.nome}"?`)) return
    try {
      await api.produtos.deletar(produto.id)
      setProdutos(prev => prev.filter(p => p.id !== produto.id))
      toast.success('Produto excluído')
    } catch {
      toast.error('Erro ao excluir produto')
    }
  }

  function editarProduto(produto) {
    setProdutoEditando(produto)
    setMostrarForm(true)
  }

  async function salvarProduto(dados) {
    try {
      if (produtoEditando) {
        const atualizado = await api.produtos.atualizar({ ...dados, id: produtoEditando.id })
        setProdutos(prev => prev.map(p => p.id === produtoEditando.id ? atualizado : p))
        toast.success('Produto atualizado!')
      } else {
        const novo = await api.produtos.criar(dados)
        setProdutos(prev => [...prev, novo])
        toast.success('Produto criado!')
      }
      setMostrarForm(false)
      setProdutoEditando(null)
    } catch {
      toast.error('Erro ao salvar produto')
    }
  }

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Cardápio</h2>
          <p className="text-sm text-gray-500">{produtos.length} produtos cadastrados</p>
        </div>
        <button
          onClick={() => { setProdutoEditando(null); setMostrarForm(true) }}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          <Plus size={18} />
          Novo Produto
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar produto..."
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {categorias.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoriaAtiva(cat)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                categoriaAtiva === cat
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {CATEGORIAS_ICONE[cat] || ''} {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid de produtos */}
      {carregando ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array(10).fill(0).map((_, i) => (
            <div key={i} className="bg-gray-100 rounded-xl h-48 animate-pulse" />
          ))}
        </div>
      ) : produtosFiltrados.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">🔍</div>
          <p className="font-medium">Nenhum produto encontrado</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {produtosFiltrados.map(produto => (
            <div
              key={produto.id}
              className={`bg-white rounded-xl border overflow-hidden shadow-sm transition-all hover:shadow-md ${
                !produto.disponivel ? 'opacity-60' : ''
              }`}
            >
              <div className="relative">
                <img
                  src={produto.imagem || '/placeholder.jpg'}
                  alt={produto.nome}
                  className="w-full h-36 object-cover bg-gray-100"
                  onError={e => { e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(produto.nome)}&background=fed7aa&color=c2410c&size=200` }}
                />
                <button
                  onClick={() => toggleDisponivel(produto)}
                  className={`absolute top-2 right-2 p-1.5 rounded-full shadow-md transition-colors ${
                    produto.disponivel ? 'bg-green-500 text-white' : 'bg-gray-400 text-white'
                  }`}
                  title={produto.disponivel ? 'Desativar' : 'Ativar'}
                >
                  {produto.disponivel ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                </button>
                {!produto.disponivel && (
                  <div className="absolute inset-0 bg-gray-900/40 flex items-center justify-center">
                    <span className="bg-gray-800 text-white text-xs px-2 py-1 rounded">Indisponível</span>
                  </div>
                )}
              </div>
              <div className="p-3">
                <p className="font-semibold text-gray-800 text-sm truncate">{produto.nome}</p>
                <p className="text-xs text-gray-400 mb-2">{produto.categoria}</p>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-orange-600">{formatarMoeda(produto.preco)}</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => editarProduto(produto)}
                      className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={() => excluir(produto)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Excluir"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-gray-50">
                  <span className="text-xs text-gray-400">Estoque</span>
                  <span className={`text-xs font-medium ${produto.estoque_atual <= produto.estoque_minimo && produto.estoque_minimo > 0 ? 'text-red-500' : 'text-gray-600'}`}>
                    {produto.estoque_atual} {produto.unidade}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {mostrarForm && (
        <FormProduto
          produto={produtoEditando}
          onSalvar={salvarProduto}
          onFechar={() => { setMostrarForm(false); setProdutoEditando(null) }}
        />
      )}
    </div>
  )
}
