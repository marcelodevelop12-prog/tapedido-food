// Scale (balança) service — manages one SerialPort connection
// Supports Toledo, Filizola, Urano and generic scales (common in Brazil)
let SerialPort, ReadlineParser

try {
  SerialPort    = require('serialport').SerialPort
  ReadlineParser = require('@serialport/parser-readline').ReadlineParser
} catch (e) {
  console.warn('[balanca] serialport não disponível:', e.message)
}

let port       = null
let onPesoCb   = null  // called with (peso: number) on each valid reading

// Parse the weight value out of a raw scale line.
// Handles: "P N  0.500 kg", " 0.500 kg", "0.500", "0500" (grams as integer)
function parseWeight(line) {
  // Match decimal number (Portuguese comma or dot)
  const dec = line.match(/(\d{1,4}[.,]\d{1,3})/)
  if (dec) {
    const val = parseFloat(dec[1].replace(',', '.'))
    // Some scales send grams with 3 decimal places already in kg — sanity check
    if (val >= 0 && val <= 999) return val
  }
  // Integer-only (grams, e.g. "0500" → 0.500 kg)
  const intM = line.match(/\b(\d{3,5})\b/)
  if (intM) {
    const grams = parseInt(intM[1])
    if (grams >= 0 && grams <= 99999) return grams / 1000
  }
  return null
}

async function listarPortas() {
  if (!SerialPort) return []
  try {
    const list = await SerialPort.list()
    return list.map(p => ({ path: p.path, manufacturer: p.manufacturer || '' }))
  } catch {
    return []
  }
}

function conectar(portaPath, baud, onPeso) {
  desconectar()
  if (!SerialPort || !portaPath) return false

  try {
    port = new SerialPort({ path: portaPath, baudRate: parseInt(baud) || 9600, autoOpen: true })
    // Many scales end lines with \r\n; try \n fallback via parser delimiter
    const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }))
    parser.on('data', (raw) => {
      const peso = parseWeight(raw.trim())
      if (peso !== null && peso >= 0 && onPeso) onPeso(peso)
    })
    port.on('error', (err) => console.error('[balanca] erro de porta:', err.message))
    onPesoCb = onPeso
    console.log('[balanca] conectado em', portaPath, '@', baud, 'baud')
    return true
  } catch (err) {
    console.error('[balanca] falha ao conectar:', err.message)
    port = null
    return false
  }
}

function desconectar() {
  if (port) {
    try { if (port.isOpen) port.close() } catch {}
    port = null
    onPesoCb = null
    console.log('[balanca] desconectado')
  }
}

function estaConectado() {
  return !!(port && port.isOpen)
}

module.exports = { listarPortas, conectar, desconectar, estaConectado }
