import { useEffect, useRef } from 'react'

// Leitor de codigo de barras USB nao e um dispositivo especial do ponto de
// vista do sistema: ele se apresenta como teclado e "digita" o codigo seguido
// de Enter. E por isso que o anuncio pode prometer "plug and play" — nao ha
// driver nem porta para configurar.
//
// O que separa o leitor de uma pessoa digitando e a VELOCIDADE. Um leitor manda
// o codigo inteiro em poucos milissegundos; ninguem digita 13 digitos em 200ms.
// E so nisso que da para confiar, entao e nisso que a deteccao se apoia.

// Intervalo maximo entre duas teclas para ainda ser considerado a mesma
// rajada. Leitores ficam bem abaixo de 30ms; 60 da folga para modelos lentos
// sem chegar perto da digitacao humana (~150ms entre teclas, no minimo).
const INTERVALO_MAX_MS = 60

// Codigo curto demais provavelmente e digitacao. EAN-8 tem 8 digitos, e o
// menor codigo que vale a pena aceitar.
const TAMANHO_MINIMO = 6

/**
 * Escuta o leitor de codigo de barras em qualquer lugar da tela.
 *
 * @param onCodigo   (codigo: string) => void — chamado quando um codigo e lido
 * @param ativo      liga/desliga a escuta (ex.: desligar com modal aberto)
 */
export function useLeitorCodigoBarras(onCodigo, ativo = true) {
  // Guardado em ref para o listener nunca precisar ser recriado: recriar a cada
  // render perderia o buffer no meio de uma leitura.
  const buffer = useRef('')
  const ultimaTecla = useRef(0)
  const callback = useRef(onCodigo)

  useEffect(() => { callback.current = onCodigo }, [onCodigo])

  useEffect(() => {
    if (!ativo) return

    function aoTeclar(e) {
      const agora = Date.now()

      // Pausa longa = comeco de uma leitura nova. Sem isso, teclas soltas que
      // a pessoa digitou antes ficariam grudadas no codigo lido depois.
      if (agora - ultimaTecla.current > INTERVALO_MAX_MS) buffer.current = ''
      ultimaTecla.current = agora

      if (e.key === 'Enter') {
        const codigo = buffer.current
        buffer.current = ''
        if (codigo.length >= TAMANHO_MINIMO) {
          // Impede que o Enter do leitor submeta o formulario que estiver aberto.
          e.preventDefault()
          callback.current?.(codigo)
        }
        return
      }

      // Só caracteres imprimiveis: Shift, Tab, setas etc. nao fazem parte do
      // codigo e quebrariam a contagem de tamanho.
      if (e.key.length === 1) buffer.current += e.key
    }

    window.addEventListener('keydown', aoTeclar, true)
    return () => window.removeEventListener('keydown', aoTeclar, true)
  }, [ativo])
}
