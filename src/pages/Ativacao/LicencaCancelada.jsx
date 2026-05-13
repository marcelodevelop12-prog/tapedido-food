import React from 'react'

const isElectron = typeof window !== 'undefined' && window.api

function abrirML() {
  const url = 'https://www.mercadolivre.com.br/sistema-pdv-restaurante-lanchonete-delivery--app-garcom/up/MLBU3958667031'
  if (isElectron) {
    window.api.shell.openExternal(url)
  } else {
    window.open(url, '_blank')
  }
}

export default function LicencaCancelada() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 p-6">
      <div className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-md text-center space-y-6">
        <div className="text-6xl">🔒</div>

        <div>
          <h1 className="text-2xl font-bold text-gray-800 mb-3">Licença Cancelada</h1>
          <p className="text-gray-600 leading-relaxed">
            Sua licença foi cancelada. Para continuar usando o{' '}
            <strong>TáPedido Food</strong>, adquira uma nova licença no Mercado Livre.
          </p>
        </div>

        <button
          onClick={abrirML}
          className="w-full bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-bold py-3.5 rounded-xl text-base transition-colors flex items-center justify-center gap-2"
        >
          🛒 Adquirir Nova Licença — R$ 78,90
        </button>

        <p className="text-xs text-gray-400">
          TáPedido Food v1.0 · Licença vitalícia · Suporte via WhatsApp
        </p>
      </div>
    </div>
  )
}
