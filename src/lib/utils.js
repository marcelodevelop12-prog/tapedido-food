import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function formatarMoeda(valor) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor || 0)
}

export function formatarData(data) {
  if (!data) return '-'
  const d = new Date(data)
  return d.toLocaleDateString('pt-BR')
}

export function formatarDataHora(data) {
  if (!data) return '-'
  const d = new Date(data)
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function formatarHora(data) {
  if (!data) return '-'
  const d = new Date(data)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function dataHoje() {
  return new Date().toISOString().split('T')[0]
}

export function inicioDia(data) {
  const d = data || new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
}

export function fimDia(data) {
  const d = data || new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).toISOString()
}

export function statusPedidoLabel(status) {
  const map = {
    recebido: 'Recebido',
    em_preparo: 'Em Preparo',
    pronto: 'Pronto',
    saiu: 'Saiu para entrega',
    entregue: 'Entregue',
    cancelado: 'Cancelado',
  }
  return map[status] || status
}

export function statusPedidoCor(status) {
  const map = {
    recebido: 'bg-yellow-100 text-yellow-800',
    em_preparo: 'bg-blue-100 text-blue-800',
    pronto: 'bg-purple-100 text-purple-800',
    saiu: 'bg-orange-100 text-orange-800',
    entregue: 'bg-green-100 text-green-800',
    cancelado: 'bg-red-100 text-red-800',
  }
  return map[status] || 'bg-gray-100 text-gray-800'
}

export function parsearAdicionais(str) {
  try { return typeof str === 'string' ? JSON.parse(str) : (str || []) }
  catch { return [] }
}

export function parsearEndereco(str) {
  try { return typeof str === 'string' ? JSON.parse(str) : (str || {}) }
  catch { return {} }
}
