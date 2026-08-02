import React, { useState, useEffect } from 'react'
import { X, Plus, Trash2, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../../lib/api'

const isElectron = typeof window !== 'undefined' && window.api

// Usada só até as categorias do banco chegarem, e como rede de segurança se a
// consulta falhar — um select vazio impediria de cadastrar produto.
const CATEGORIAS_PADRAO = ['Lanches', 'Pratos', 'Pizzas', 'Bebidas', 'Sobremesas', 'Outros']
const UNIDADES = [
  { value: 'un', label: 'Unidade (un)' },
  { value: 'kg', label: 'Quilograma (kg)' },
  { value: 'porcao', label: 'Porção' },
  { value: 'litro', label: 'Litro' },
]

export default function FormProduto({ produto, onSalvar, onFechar }) {
  const [form, setForm] = useState({
    nome: '', descricao: '', preco: '', categoria: 'Lanches', imagem: '',
    unidade: 'un', codigoBarras: '', estoqueAtual: '', estoqueMinimo: '',
    custoUnitario: '', permiteMeioMeio: false, disponivel: true,
    adicionais: [],
  })
  const [novoAdicional, setNovoAdicional] = useState({ nome: '', preco: '' })
  const [salvando, setSalvando] = useState(false)
  const [uploadando, setUploadando] = useState(false)
  const [categorias, setCategorias] = useState(CATEGORIAS_PADRAO)

  useEffect(() => {
    api.categorias.listar()
      .then(lista => {
        const nomes = (lista || []).map(c => c.nome).filter(Boolean)
        if (nomes.length) setCategorias(nomes)
      })
      .catch(() => {})
  }, [])

  async function handleUploadImagem() {
    if (!isElectron) return
    setUploadando(true)
    try {
      const url = await window.api.imagem.salvar()
      if (url) set('imagem', url)
    } finally {
      setUploadando(false)
    }
  }

  // Fora do Electron nao existe dialogo nativo de arquivo (window.api.imagem
  // nao existe); le o arquivo local e guarda como data URL no mesmo campo
  // `imagem`, que ja aceita URL como texto livre.
  function handleArquivoLocal(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Selecione um arquivo de imagem'); return }
    if (file.size > 2 * 1024 * 1024) { toast.error('Imagem muito grande (máx. 2MB)'); return }
    const reader = new FileReader()
    reader.onload = () => set('imagem', reader.result)
    reader.readAsDataURL(file)
  }

  useEffect(() => {
    if (produto) {
      let adicionais = []
      try { adicionais = typeof produto.adicionais === 'string' ? JSON.parse(produto.adicionais) : (produto.adicionais || []) }
      catch { adicionais = [] }
      setForm({
        nome: produto.nome || '',
        descricao: produto.descricao || '',
        preco: produto.preco || '',
        categoria: produto.categoria || 'Lanches',
        imagem: produto.imagem || '',
        unidade: produto.unidade || 'un',
        codigoBarras: produto.codigo_barras || '',
        estoqueAtual: produto.estoque_atual ?? '',
        estoqueMinimo: produto.estoque_minimo ?? '',
        custoUnitario: produto.custo_unitario || '',
        permiteMeioMeio: produto.permite_meio_meio === 1 || produto.permite_meio_meio === true,
        disponivel: produto.disponivel !== 0,
        adicionais,
      })
    }
  }, [produto])

  function set(campo, valor) {
    setForm(prev => ({ ...prev, [campo]: valor }))
  }

  function adicionarAdicional() {
    if (!novoAdicional.nome.trim()) return
    set('adicionais', [...form.adicionais, { nome: novoAdicional.nome, preco: parseFloat(novoAdicional.preco) || 0 }])
    setNovoAdicional({ nome: '', preco: '' })
  }

  function removerAdicional(idx) {
    set('adicionais', form.adicionais.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.nome.trim() || !form.preco) return

    setSalvando(true)
    try {
      await onSalvar({
        nome: form.nome.trim(),
        descricao: form.descricao.trim(),
        preco: parseFloat(form.preco),
        categoria: form.categoria,
        imagem: form.imagem.trim(),
        unidade: form.unidade,
        codigoBarras: form.codigoBarras.trim(),
        estoqueAtual: parseFloat(form.estoqueAtual) || 0,
        estoqueMinimo: parseFloat(form.estoqueMinimo) || 0,
        custoUnitario: parseFloat(form.custoUnitario) || 0,
        permiteMeioMeio: form.permiteMeioMeio,
        disponivel: form.disponivel,
        adicionais: form.adicionais,
      })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-800">
            {produto ? 'Editar Produto' : 'Novo Produto'}
          </h3>
          <button onClick={onFechar} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Preview da imagem */}
          {form.imagem && (
            <div className="flex justify-center">
              <img
                src={form.imagem}
                alt="Preview"
                className="h-32 w-32 object-cover rounded-xl border border-gray-200"
                onError={e => { e.target.src = '' }}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Produto *</label>
              <input
                value={form.nome}
                onChange={e => set('nome', e.target.value)}
                placeholder="Ex: X-Burguer Especial"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                required
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
              <textarea
                value={form.descricao}
                onChange={e => set('descricao', e.target.value)}
                placeholder="Ingredientes e detalhes do produto..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Preço de Venda (R$) *</label>
              <input
                type="number"
                value={form.preco}
                onChange={e => set('preco', e.target.value)}
                placeholder="0,00"
                step="0.01"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Custo Unitário (R$)</label>
              <input
                type="number"
                value={form.custoUnitario}
                onChange={e => set('custoUnitario', e.target.value)}
                placeholder="0,00"
                step="0.01"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
              <select
                value={form.categoria}
                onChange={e => set('categoria', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                {/* Produto antigo pode estar numa categoria ja removida; sem
                    isto o select cairia na primeira opcao e trocaria a
                    categoria dele sem ninguem pedir. */}
                {(categorias.includes(form.categoria) ? categorias : [form.categoria, ...categorias])
                  .filter(Boolean)
                  .map(c => <option key={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unidade de Venda</label>
              <select
                value={form.unidade}
                onChange={e => set('unidade', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                {UNIDADES.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estoque Atual</label>
              <input
                type="number"
                value={form.estoqueAtual}
                onChange={e => set('estoqueAtual', e.target.value)}
                placeholder="0"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estoque Mínimo</label>
              <input
                type="number"
                value={form.estoqueMinimo}
                onChange={e => set('estoqueMinimo', e.target.value)}
                placeholder="0"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Código de Barras</label>
              <input
                value={form.codigoBarras}
                onChange={e => set('codigoBarras', e.target.value)}
                placeholder="Ex: 7891000315507"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Imagem do Produto</label>
              <div className="flex gap-2">
                {isElectron ? (
                  <button
                    type="button"
                    onClick={handleUploadImagem}
                    disabled={uploadando}
                    className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-300 text-orange-700 rounded-lg text-sm font-medium hover:bg-orange-100 transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    <Upload size={15} />
                    {uploadando ? 'Carregando...' : 'Escolher arquivo'}
                  </button>
                ) : (
                  <label className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-300 text-orange-700 rounded-lg text-sm font-medium hover:bg-orange-100 transition-colors whitespace-nowrap cursor-pointer">
                    <Upload size={15} />
                    Escolher arquivo
                    <input type="file" accept="image/*" onChange={handleArquivoLocal} className="hidden" />
                  </label>
                )}
                <input
                  value={form.imagem}
                  onChange={e => set('imagem', e.target.value)}
                  placeholder="Ou cole uma URL: https://..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Formatos aceitos: JPG, PNG, WEBP</p>
            </div>
          </div>

          {/* Opções */}
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.disponivel}
                onChange={e => set('disponivel', e.target.checked)}
                className="w-4 h-4 text-orange-500 rounded"
              />
              <span className="text-sm text-gray-700">Produto disponível</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.permiteMeioMeio}
                onChange={e => set('permiteMeioMeio', e.target.checked)}
                className="w-4 h-4 text-orange-500 rounded"
              />
              <span className="text-sm text-gray-700">Permite meio a meio</span>
            </label>
          </div>

          {/* Adicionais */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Adicionais / Complementos</label>
            <div className="flex gap-2 mb-2">
              <input
                value={novoAdicional.nome}
                onChange={e => setNovoAdicional(prev => ({ ...prev, nome: e.target.value }))}
                placeholder="Nome do adicional"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), adicionarAdicional())}
              />
              <input
                type="number"
                value={novoAdicional.preco}
                onChange={e => setNovoAdicional(prev => ({ ...prev, preco: e.target.value }))}
                placeholder="Preço"
                step="0.01"
                min="0"
                className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <button
                type="button"
                onClick={adicionarAdicional}
                className="p-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
            {form.adicionais.length > 0 && (
              <div className="space-y-1.5">
                {form.adicionais.map((a, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-sm text-gray-700">{a.nome}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-orange-600">+ R$ {a.preco.toFixed(2)}</span>
                      <button
                        type="button"
                        onClick={() => removerAdicional(i)}
                        className="text-red-400 hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onFechar}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="px-6 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {salvando ? 'Salvando...' : produto ? 'Salvar Alterações' : 'Criar Produto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
