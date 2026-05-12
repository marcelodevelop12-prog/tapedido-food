import React, { useEffect, useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, BookOpen, Grid3X3, Truck, Package,
  DollarSign, TrendingUp, BarChart2, Settings, ChevronLeft, ChevronRight
} from 'lucide-react'
import { api } from '../lib/api'
import UpdateNotification from './UpdateNotification'

const navItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/cardapio', icon: BookOpen, label: 'Cardápio' },
  { path: '/mesas', icon: Grid3X3, label: 'Mesas' },
  { path: '/delivery', icon: Truck, label: 'Delivery' },
  { path: '/estoque', icon: Package, label: 'Estoque' },
  { path: '/caixa', icon: DollarSign, label: 'Caixa' },
  { path: '/financeiro', icon: TrendingUp, label: 'Financeiro' },
  { path: '/relatorios', icon: BarChart2, label: 'Relatórios' },
  { path: '/configuracoes', icon: Settings, label: 'Configurações' },
]

export default function Layout({ modoDemo }) {
  const [recolhido, setRecolhido] = useState(false)
  const [tema, setTema] = useState('light')
  const location = useLocation()

  useEffect(() => {
    api.config.get().then(cfg => {
      const t = cfg?.tema || 'light'
      setTema(t)
      document.documentElement.classList.toggle('dark', t === 'dark')
    }).catch(() => {})
  }, [])

  function toggleTema() {
    const novo = tema === 'light' ? 'dark' : 'light'
    setTema(novo)
    document.documentElement.classList.toggle('dark', novo === 'dark')
    api.config.update({ tema: novo }).catch(() => {})
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <aside className={`flex flex-col bg-gray-900 text-white transition-all duration-300 ${recolhido ? 'w-16' : 'w-56'}`}>
        {/* Logo */}
        <div className={`flex items-center gap-3 px-4 py-5 border-b border-gray-700 ${recolhido ? 'justify-center' : ''}`}>
          <span className="text-2xl">🍔</span>
          {!recolhido && (
            <div>
              <div className="font-bold text-orange-400 text-sm leading-tight">TáPedido</div>
              <div className="text-xs text-gray-400">Food PDV</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {navItems.map(({ path, icon: Icon, label }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 mx-2 my-0.5 rounded-lg text-sm transition-all duration-150
                ${isActive
                  ? 'bg-orange-500 text-white font-medium'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }
                ${recolhido ? 'justify-center px-2' : ''}`
              }
              title={recolhido ? label : undefined}
            >
              <Icon size={18} className="shrink-0" />
              {!recolhido && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Recolher */}
        <button
          onClick={() => setRecolhido(!recolhido)}
          className="flex items-center justify-center gap-2 px-4 py-3 border-t border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors text-xs"
        >
          {recolhido ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /><span>Recolher</span></>}
        </button>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 shadow-sm">
          <h1 className="text-lg font-semibold text-gray-800">
            {navItems.find(n => location.pathname.startsWith(n.path))?.label || 'TáPedido Food'}
          </h1>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span>{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</span>
            <button
              onClick={toggleTema}
              title={tema === 'light' ? 'Ativar modo escuro' : 'Ativar modo claro'}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-base"
            >
              {tema === 'light' ? '🌙' : '☀️'}
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>

        {/* Footer demo banner */}
        {modoDemo && (
          <div className="bg-amber-400 text-amber-900 text-center text-xs font-semibold py-1.5 px-4">
            ⚠️ VERSÃO DEMONSTRAÇÃO — Dados fictícios. Ative sua licença para uso real.
          </div>
        )}
      </div>

      <UpdateNotification />
    </div>
  )
}
