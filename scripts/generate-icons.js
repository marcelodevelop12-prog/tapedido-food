// Generates TáPedido Food icons: orange background + white hamburger lines
// Pure Node.js — no extra packages required
const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

const outDir = path.join(__dirname, '..', 'assets', 'icons')
fs.mkdirSync(outDir, { recursive: true })

// ── CRC32 ──────────────────────────────────────────────────────────────────
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xFFFFFFFF
  for (const b of buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

// ── PNG chunk ─────────────────────────────────────────────────────────────
function pngChunk(type, data) {
  const tb = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const payload = Buffer.concat([tb, data])
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(payload))
  return Buffer.concat([len, payload, crcBuf])
}

// ── Draw a single pixel: orange or white ──────────────────────────────────
const ORANGE = [0xF9, 0x73, 0x16]
const WHITE  = [0xFF, 0xFF, 0xFF]

function isWhitePixel(x, y, size) {
  const cx = x / size
  const cy = y / size
  const margin = 0.18
  const inH = cx >= margin && cx <= (1 - margin)

  // Three horizontal bars (hamburger icon)
  if (inH && cy >= 0.27 && cy <= 0.35) return true
  if (inH && cy >= 0.45 && cy <= 0.53) return true
  if (inH && cy >= 0.63 && cy <= 0.71) return true
  return false
}

// ── Create PNG buffer ─────────────────────────────────────────────────────
function createPNG(size) {
  // Build raw scanlines: filter-byte(0) + RGB per pixel
  const raw = Buffer.alloc(size * (1 + size * 3))
  let pos = 0
  for (let y = 0; y < size; y++) {
    raw[pos++] = 0 // None filter
    for (let x = 0; x < size; x++) {
      const px = isWhitePixel(x, y, size) ? WHITE : ORANGE
      raw[pos++] = px[0]; raw[pos++] = px[1]; raw[pos++] = px[2]
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 })

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8  // bit depth
  ihdr[9] = 2  // color type: RGB
  // bytes 10-12 = 0 (compression, filter, interlace)

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// ── Create ICO from PNG buffers ───────────────────────────────────────────
// Modern ICO format supports embedded PNG (Vista+), which Electron / Windows 10 handle fine.
function createICO(pngMap) {
  const sizes = Object.keys(pngMap).map(Number).sort((a, b) => a - b)
  const count = sizes.length

  const ICONDIR_SIZE  = 6
  const ICONDIRENTRY  = 16
  const dataOffset    = ICONDIR_SIZE + ICONDIRENTRY * count

  const header = Buffer.alloc(ICONDIR_SIZE)
  header.writeUInt16LE(0, 0)     // reserved
  header.writeUInt16LE(1, 2)     // type: 1 = ICO
  header.writeUInt16LE(count, 4)

  const entries = []
  const images  = []
  let offset = dataOffset

  for (const sz of sizes) {
    const png = pngMap[sz]
    const entry = Buffer.alloc(ICONDIRENTRY)
    entry[0] = sz >= 256 ? 0 : sz    // width  (0 = 256)
    entry[1] = sz >= 256 ? 0 : sz    // height (0 = 256)
    entry[2] = 0                      // color count
    entry[3] = 0                      // reserved
    entry.writeUInt16LE(1, 4)         // planes
    entry.writeUInt16LE(32, 6)        // bit count
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    images.push(png)
    offset += png.length
  }

  return Buffer.concat([header, ...entries, ...images])
}

// ── Generate ──────────────────────────────────────────────────────────────
const sizes = [16, 32, 48, 64, 128, 256, 512]
const pngMap = {}

for (const sz of sizes) {
  const buf = createPNG(sz)
  pngMap[sz] = buf
  const file = path.join(outDir, `icon-${sz}x${sz}.png`)
  fs.writeFileSync(file, buf)
  console.log(`  ✓ ${file}`)
}

// icon.png = 512px (used as Electron window icon)
fs.writeFileSync(path.join(outDir, 'icon.png'), pngMap[512])
console.log(`  ✓ assets/icons/icon.png`)

// icon.ico = all sizes up to 256 (ICO does not benefit from >256 embedded)
const icoSizes = [16, 32, 48, 64, 128, 256]
const icoMap = {}
for (const sz of icoSizes) icoMap[sz] = pngMap[sz]
const ico = createICO(icoMap)
fs.writeFileSync(path.join(outDir, 'icon.ico'), ico)
console.log(`  ✓ assets/icons/icon.ico`)

console.log('\nÍcones gerados com sucesso!')
