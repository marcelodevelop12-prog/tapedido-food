import React, { useEffect, useState } from 'react'

const isElectron = typeof window !== 'undefined' && window.api

export default function UpdateNotification() {
  const [estado, setEstado] = useState(null) // null | 'disponivel' | 'baixando' | 'pronto'
  const [versao, setVersao] = useState('')
  const [progresso, setProgresso] = useState(0)

  useEffect(() => {
    if (!isElectron || !window.api.update) return

    window.api.update.onDisponivel((info) => {
      setVersao(info.version || '')
      setEstado('disponivel')
    })

    window.api.update.onProgresso((p) => {
      setProgresso(p.percent || 0)
      setEstado('baixando')
    })

    window.api.update.onBaixado(() => {
      setEstado('pronto')
    })

    return () => window.api.update.removerListeners()
  }, [])

  if (!estado) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-white dark:bg-[#1e2140] rounded-xl shadow-2xl border border-gray-200 dark:border-[#2d3462] p-4 w-80">
      {estado === 'disponivel' && (
        <>
          <div className="flex items-start gap-3">
            <span className="text-2xl">🔄</span>
            <div className="flex-1">
              <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm">
                Nova atualização disponível
                {versao && <span className="ml-1 text-orange-500">v{versao}</span>}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Baixe agora e reinicie para aplicar.
              </p>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => { window.api.update.baixar(); setEstado('baixando') }}
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
            >
              Baixar Agora
            </button>
            <button
              onClick={() => setEstado(null)}
              className="px-3 py-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm rounded-lg transition-colors"
            >
              Depois
            </button>
          </div>
        </>
      )}

      {estado === 'baixando' && (
        <>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">⬇️</span>
            <div>
              <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm">Baixando atualização...</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{progresso}% concluído</p>
            </div>
          </div>
          <div className="w-full bg-gray-200 dark:bg-[#252845] rounded-full h-2">
            <div
              className="bg-orange-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progresso}%` }}
            />
          </div>
        </>
      )}

      {estado === 'pronto' && (
        <>
          <div className="flex items-start gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm">Atualização pronta!</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Reinicie o aplicativo para concluir.
              </p>
            </div>
          </div>
          <button
            onClick={() => window.api.update.instalar()}
            className="w-full mt-3 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
          >
            Reiniciar e Atualizar
          </button>
        </>
      )}
    </div>
  )
}
