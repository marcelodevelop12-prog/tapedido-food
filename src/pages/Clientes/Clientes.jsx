import React, { useEffect, useState } from 'react'
import { Search, Plus, Pencil, Phone, MapPin, ShoppingBag } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../../lib/api'

export default function Clientes() {
  const [clientes, setClientes] = useState([])
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [clienteEditando, setClienteEditando] = useState(null) // null | {} (novo) | cliente existente

  useEffect(() => { carregar() }, [])

  async function carregar() {
    try {
      const data = await api.clientes.listar()
      setClientes(data)
    } finally {
      setCarregando(false)
    }
  }

  const clientesFiltrados = clientes.filter(c => {
    if (!busca) return true
    const alvo = busca.toLowerCase().replace(/\D/g, '')
    return c.nome?.toLowerCase().includes(busca.toLowerCase()) ||
      (alvo && c.telefone?.includes(alvo))
  })

  async function salvarCliente(dados) {
    try {
      if (clienteEditando?.id) {
        const atualizado = await api.clientes.atualizar({ id: clienteEditando.id, ...dados })
        setClientes(prev => prev.map(c => c.id === atualizado.id ? atualizado : c))
        toast.success('Cliente atualizado!')
      } else {
        const novo = await api.clientes.criar(dados)
        setClientes(prev => [novo, ...prev])
        toast.success('Cliente cadastrado!')
      }
      setClienteEditando(null)
    } catch (err) {
      toast.error(err?.message || 'Erro ao salvar cliente')
    }
  }

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Clientes</h2>
          <p className="text-sm text-gray-500">{clientes.length} cadastrados</p>
        </div>
        <button
          onClick={() => setClienteEditando({})}
          className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          Novo Cliente
        </button>
      </div>

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por nome ou telefone..."
          className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Cliente</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Telefone</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Endereço</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Pedidos</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {carregando ? (
              Array(5).fill(0).map((_, i) => (
                <tr key={i}>
                  {Array(5).fill(0).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : clientesFiltrados.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-10 text-gray-400">
                  {busca ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado ainda — o cadastro acontece sozinho a cada venda de delivery/retirada com telefone'}
                </td>
              </tr>
            ) : clientesFiltrados.map(cliente => (
              <tr key={cliente.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-800 text-sm">{cliente.nome || '(sem nome)'}</p>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {cliente.telefone && (
                    <span className="flex items-center gap-1.5">
                      <Phone size={12} className="text-gray-400" />
                      {cliente.telefone}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {(cliente.endereco || cliente.bairro) && (
                    <span className="flex items-center gap-1.5">
                      <MapPin size={12} className="text-gray-400 shrink-0" />
                      {[cliente.endereco, cliente.bairro].filter(Boolean).join(', ')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-gray-700">
                    <ShoppingBag size={12} className="text-gray-400" />
                    {cliente.total_pedidos || 0}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center">
                    <button
                      onClick={() => setClienteEditando(cliente)}
                      className="flex items-center gap-1 px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs font-medium transition-colors"
                      title="Editar cliente"
                    >
                      <Pencil size={12} />
                      Editar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {clienteEditando && (
        <ModalCliente
          cliente={clienteEditando}
          onSalvar={salvarCliente}
          onFechar={() => setClienteEditando(null)}
        />
      )}
    </div>
  )
}

function ModalCliente({ cliente, onSalvar, onFechar }) {
  const editando = Boolean(cliente.id)
  const [form, setForm] = useState({
    nome: cliente.nome || '',
    telefone: cliente.telefone || '',
    endereco: cliente.endereco || '',
    bairro: cliente.bairro || '',
  })
  const [salvando, setSalvando] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.telefone.trim()) { toast.error('Informe o telefone'); return }
    setSalvando(true)
    try {
      await onSalvar({
        nome: form.nome.trim(),
        telefone: form.telefone.trim(),
        endereco: form.endereco.trim(),
        bairro: form.bairro.trim(),
      })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-bold text-gray-800">{editando ? 'Editar Cliente' : 'Novo Cliente'}</h3>
          <button onClick={onFechar} className="p-1.5 hover:bg-gray-100 rounded-lg">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
            <input
              value={form.nome}
              onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
              placeholder="Nome do cliente"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telefone *</label>
            <input
              value={form.telefone}
              onChange={e => setForm(p => ({ ...p, telefone: e.target.value }))}
              placeholder="(21) 99999-9999"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bairro</label>
            <input
              value={form.bairro}
              onChange={e => setForm(p => ({ ...p, bairro: e.target.value }))}
              placeholder="Bairro"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Endereço</label>
            <input
              value={form.endereco}
              onChange={e => setForm(p => ({ ...p, endereco: e.target.value }))}
              placeholder="Rua, número, complemento..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onFechar} className="flex-1 border border-gray-300 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={salvando} className="flex-1 bg-orange-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50">
              {salvando ? 'Salvando...' : editando ? 'Salvar' : 'Cadastrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
