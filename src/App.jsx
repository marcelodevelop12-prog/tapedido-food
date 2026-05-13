import React, { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'

import Layout from './components/Layout'
import Ativacao from './pages/Ativacao/Ativacao'
import LicencaCancelada from './pages/Ativacao/LicencaCancelada'
import Dashboard from './pages/Dashboard/Dashboard'
import Cardapio from './pages/Cardapio/Cardapio'
import Mesas from './pages/Mesas/Mesas'
import Delivery from './pages/Delivery/Delivery'
import Estoque from './pages/Estoque/Estoque'
import Caixa from './pages/Caixa/Caixa'
import Financeiro from './pages/Financeiro/Financeiro'
import Relatorios from './pages/Relatorios/Relatorios'
import Configuracoes from './pages/Configuracoes/Configuracoes'

// Detecta se está rodando no Electron
const isElectron = typeof window !== 'undefined' && window.api

function App() {
  const [carregando, setCarregando] = useState(true)
  const [ativado, setAtivado] = useState(false)
  const [modoDemo, setModoDemo] = useState(false)
  const [cancelada, setCancelada] = useState(false)

  useEffect(() => {
    verificarLicenca()
  }, [])

  async function verificarLicenca() {
    if (!isElectron) {
      // No browser (preview), entra direto em modo demo
      setModoDemo(true)
      setAtivado(true)
      setCarregando(false)
      return
    }

    try {
      // Verifica no Supabase a cada abertura — atualiza DB local antes de decidir
      await window.api.licenca.verificarPeriodico().catch(() => {})

      const resultado = await window.api.licenca.verificar()
      if (resultado.cancelada) {
        setCancelada(true)
      } else if (resultado.ativa) {
        setAtivado(true)
        setModoDemo(resultado.demo)
      }
    } catch (err) {
      console.error('Erro ao verificar licença:', err)
    } finally {
      setCarregando(false)
    }
  }

  function handleAtivado(demo = false) {
    setAtivado(true)
    setModoDemo(demo)
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-orange-50 to-orange-100">
        <div className="text-center">
          <div className="text-5xl mb-4">🍔</div>
          <div className="text-xl font-semibold text-orange-700">Carregando TáPedido Food...</div>
          <div className="mt-3 h-1 w-40 mx-auto bg-orange-200 rounded-full overflow-hidden">
            <div className="h-full bg-orange-500 rounded-full animate-pulse w-2/3" />
          </div>
        </div>
      </div>
    )
  }

  if (cancelada) {
    return (
      <>
        <LicencaCancelada />
        <Toaster position="top-right" />
      </>
    )
  }

  if (!ativado) {
    return (
      <>
        <Ativacao onAtivado={handleAtivado} />
        <Toaster position="top-right" />
      </>
    )
  }

  return (
    <HashRouter>
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      <Routes>
        <Route path="/" element={<Layout modoDemo={modoDemo} />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="cardapio" element={<Cardapio />} />
          <Route path="mesas" element={<Mesas />} />
          <Route path="delivery" element={<Delivery />} />
          <Route path="estoque" element={<Estoque />} />
          <Route path="caixa" element={<Caixa />} />
          <Route path="financeiro" element={<Financeiro />} />
          <Route path="relatorios" element={<Relatorios />} />
          <Route path="configuracoes" element={<Configuracoes />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

export default App
