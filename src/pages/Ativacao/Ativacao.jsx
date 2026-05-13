import React, { useState } from 'react'
import toast from 'react-hot-toast'

const isElectron = typeof window !== 'undefined' && window.api

export default function Ativacao({ onAtivado }) {
  const [chave, setChave] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [etapa, setEtapa] = useState('inicio') // inicio, ativando, erro

  function formatarChave(valor) {
    const limpo = valor.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 16)
    return limpo.match(/.{1,4}/g)?.join('-') || limpo
  }

  async function handleAtivar(e) {
    e.preventDefault()
    if (chave.replace(/-/g, '').length < 8) {
      toast.error('Digite uma chave de licença válida')
      return
    }

    setCarregando(true)
    setEtapa('ativando')

    try {
      if (!isElectron) {
        toast.error('Ativação disponível apenas na versão desktop')
        setCarregando(false)
        setEtapa('inicio')
        return
      }

      const resultado = await window.api.licenca.ativar(chave.replace(/[^A-Z0-9]/gi, '').toUpperCase())
      if (resultado.sucesso) {
        toast.success(`Licença ativada com sucesso! Bem-vindo${resultado.nomeCliente ? ', ' + resultado.nomeCliente : ''}!`)
        setTimeout(() => onAtivado(false), 1500)
      } else {
        toast.error(resultado.erro || 'Erro ao ativar licença')
        setEtapa('inicio')
      }
    } catch (err) {
      toast.error('Erro inesperado. Tente novamente.')
      setEtapa('inicio')
    } finally {
      setCarregando(false)
    }
  }

  async function handleDemo() {
    if (!isElectron) {
      onAtivado(true)
      return
    }

    setCarregando(true)
    try {
      await window.api.licenca.ativarDemo()
      toast.success('Modo demonstração iniciado!')
      setTimeout(() => onAtivado(true), 800)
    } catch (err) {
      toast.error('Erro ao iniciar demonstração')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-orange-500 to-orange-700">
      {/* Painel esquerdo */}
      <div className="hidden lg:flex flex-col justify-center items-center w-1/2 text-white p-12">
        <div className="text-8xl mb-6">🍔</div>
        <h1 className="text-5xl font-bold mb-3">TáPedido Food</h1>
        <p className="text-xl text-orange-100 text-center max-w-sm">
          Sistema PDV completo para seu negócio alimentício
        </p>
        <div className="mt-10 grid grid-cols-2 gap-4 w-full max-w-sm">
          {[
            { emoji: '🍽️', texto: 'Gestão de Mesas' },
            { emoji: '🛵', texto: 'Controle de Delivery' },
            { emoji: '📦', texto: 'Controle de Estoque' },
            { emoji: '💰', texto: 'Caixa Completo' },
            { emoji: '📊', texto: 'Relatórios PDF' },
            { emoji: '🖨️', texto: 'Impressora Térmica' },
          ].map(({ emoji, texto }) => (
            <div key={texto} className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2">
              <span>{emoji}</span>
              <span className="text-sm">{texto}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Painel direito - formulário */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="text-4xl mb-3 lg:hidden">🍔</div>
            <h2 className="text-2xl font-bold text-gray-800">Ativar Licença</h2>
            <p className="text-gray-500 text-sm mt-1">
              Digite a chave de licença recebida após a compra
            </p>
          </div>

          <form onSubmit={handleAtivar} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Chave de Licença
              </label>
              <input
                type="text"
                value={chave}
                onChange={(e) => setChave(formatarChave(e.target.value))}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center text-lg font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                disabled={carregando}
                autoFocus
              />
              <p className="text-xs text-gray-400 mt-1.5 text-center">
                Encontrada no e-mail de confirmação do Mercado Livre
              </p>
            </div>

            <button
              type="submit"
              disabled={carregando || chave.replace(/-/g, '').length < 8}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {carregando ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Ativando...
                </>
              ) : 'Ativar Licença'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              const isElectronCtx = typeof window !== 'undefined' && window.api
              if (isElectronCtx) {
                window.api.shell.openExternal('https://www.mercadolivre.com.br')
              } else {
                window.open('https://www.mercadolivre.com.br', '_blank')
              }
            }}
            className="w-full mt-3 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            🛒 Comprar Licença — R$ 69,90
          </button>

          <div className="mt-5 p-4 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-700 text-center">
              Licença vitalícia · Pagamento único · Suporte via WhatsApp incluído
            </p>
          </div>

          <p className="text-center text-xs text-gray-400 mt-4">
            TáPedido Food v1.0 · Funciona 100% offline após ativação
          </p>
        </div>
      </div>
    </div>
  )
}
