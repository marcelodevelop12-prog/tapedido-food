import React, { useEffect, useState } from 'react'
import { X, Plus, Pencil, Trash2, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../../lib/api'

/**
 * Gerencia as categorias do cardápio.
 *
 * Renomear aqui reescreve a categoria dos produtos no backend — `menu_items`
 * guarda o nome, não o id. Remover só é permitido quando nenhum produto usa a
 * categoria; o backend recusa e devolve o motivo.
 */
export default function ModalCategorias({ onFechar, onAlterou }) {
  const [categorias, setCategorias] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [nova, setNova] = useState({ nome: '', icone: '' })
  const [editando, setEditando] = useState(null) // { id, nome, icone }
  const [salvando, setSalvando] = useState(false)
  const [mudou, setMudou] = useState(false)

  useEffect(() => { carregar() }, [])

  async function carregar() {
    try {
      setCategorias(await api.categorias.listar() || [])
    } catch {
      toast.error('Erro ao carregar categorias')
    } finally {
      setCarregando(false)
    }
  }

  function fechar() {
    if (mudou) onAlterou?.()
    onFechar()
  }

  async function adicionar(e) {
    e.preventDefault()
    const nome = nova.nome.trim()
    if (!nome) { toast.error('Informe o nome da categoria'); return }
    if (categorias.some(c => c.nome.toLowerCase() === nome.toLowerCase())) {
      toast.error(`"${nome}" já existe`)
      return
    }
    setSalvando(true)
    try {
      const criada = await api.categorias.criar({ nome, icone: nova.icone.trim() })
      setCategorias(prev => [...prev, criada])
      setNova({ nome: '', icone: '' })
      setMudou(true)
      toast.success('Categoria criada!')
    } catch { toast.error('Erro ao criar categoria') }
    finally { setSalvando(false) }
  }

  async function salvarEdicao() {
    const nome = editando.nome.trim()
    if (!nome) { toast.error('O nome não pode ficar vazio'); return }
    setSalvando(true)
    try {
      const atualizada = await api.categorias.atualizar({
        id: editando.id, nome, icone: editando.icone.trim(),
      })
      setCategorias(prev => prev.map(c => c.id === atualizada.id ? atualizada : c))
      setEditando(null)
      setMudou(true)
      // O aviso importa: quem renomeia não espera que os produtos mudem junto.
      toast.success('Categoria renomeada — os produtos dela foram atualizados')
    } catch { toast.error('Erro ao salvar categoria') }
    finally { setSalvando(false) }
  }

  async function remover(cat) {
    if (!window.confirm(`Remover a categoria "${cat.nome}"?`)) return
    try {
      const r = await api.categorias.deletar(cat.id)
      if (!r?.sucesso) {
        // Mensagem do backend: diz quantos produtos travam a remoção.
        toast.error(r?.erro || 'Não foi possível remover', { duration: 6000 })
        return
      }
      setCategorias(prev => prev.filter(c => c.id !== cat.id))
      setMudou(true)
      toast.success('Categoria removida')
    } catch { toast.error('Erro ao remover categoria') }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh]">

        <div className="flex items-center justify-between p-5 border-b shrink-0">
          <div>
            <h3 className="font-bold text-gray-800 text-lg">Categorias do Cardápio</h3>
            <p className="text-xs text-gray-400">Usadas ao cadastrar produtos e nos filtros</p>
          </div>
          <button onClick={fechar} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {carregando ? (
            <p className="text-sm text-gray-400 text-center py-6">Carregando...</p>
          ) : categorias.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Nenhuma categoria cadastrada</p>
          ) : categorias.map(cat => (
            <div key={cat.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2.5">
              {editando?.id === cat.id ? (
                <>
                  <input
                    value={editando.icone}
                    onChange={e => setEditando(p => ({ ...p, icone: e.target.value }))}
                    placeholder="🍔"
                    className="w-12 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <input
                    value={editando.nome}
                    onChange={e => setEditando(p => ({ ...p, nome: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') salvarEdicao(); if (e.key === 'Escape') setEditando(null) }}
                    autoFocus
                    className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <button
                    onClick={salvarEdicao}
                    disabled={salvando}
                    className="text-green-600 hover:text-green-700 p-1 rounded transition-colors disabled:opacity-40"
                    title="Salvar"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    onClick={() => setEditando(null)}
                    className="text-gray-400 hover:text-gray-600 p-1 rounded transition-colors"
                    title="Cancelar"
                  >
                    <X size={16} />
                  </button>
                </>
              ) : (
                <>
                  <span className="w-6 text-center">{cat.icone || '•'}</span>
                  <span className="flex-1 font-medium text-gray-800 text-sm">{cat.nome}</span>
                  <button
                    onClick={() => setEditando({ id: cat.id, nome: cat.nome, icone: cat.icone || '' })}
                    className="text-gray-400 hover:text-blue-600 p-1 rounded transition-colors"
                    title="Renomear categoria"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => remover(cat)}
                    className="text-gray-400 hover:text-red-600 p-1 rounded transition-colors"
                    title="Remover categoria"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <form onSubmit={adicionar} className="shrink-0 border-t p-5 flex gap-2">
          <input
            value={nova.icone}
            onChange={e => setNova(p => ({ ...p, icone: e.target.value }))}
            placeholder="🍟"
            className="w-14 px-2 py-2 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <input
            value={nova.nome}
            onChange={e => setNova(p => ({ ...p, nome: e.target.value }))}
            placeholder="Nova categoria"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <button
            type="submit"
            disabled={salvando}
            className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            <Plus size={15} />
            Add
          </button>
        </form>

      </div>
    </div>
  )
}
