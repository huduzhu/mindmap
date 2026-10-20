// Generates the app icon: public/favicon.svg plus the PWA PNGs (192, 512,
// maskable-512) in public/icons. The PNGs are rasterised here from the same
// geometry as the SVG (4×4 supersampling, encoded with node:zlib), so the repo
// needs no image tooling and the two can never drift apart.
//
// Design: a central node with four curved branches to smaller coloured nodes,
// in the default preset's colours (theme fill #1d4ed8, branch colours).
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const OUT_DIR = path.join(ROOT, 'public', 'icons')

// Geometry on a 64×64 canvas.
const VIEW = 64
const CORNER = 14
const BG = '#1d4ed8'
const LINE = '#ffffff'
const BRANCH_WIDTH = 4
const CENTER = { x: 32, y: 32, r: 9, fill: '#ffffff' }
const LEAF_R = 6
const BRANCHES = [
  { ctrl: [40, 15], leaf: [50, 16], fill: '#10b981' },
  { ctrl: [40, 49], leaf: [50, 48], fill: '#f59e0b' },
  { ctrl: [24, 15], leaf: [14, 16], fill: '#06b6d4' },
  { ctrl: [24, 49], leaf: [14, 48], fill: '#ef4444' },
]

function svg() {
  const paths = BRANCHES.map(
    (b) =>
      `<path d="M${CENTER.x} ${CENTER.y}Q${b.ctrl[0]} ${b.ctrl[1]} ${b.leaf[0]} ${b.leaf[1]}"/>`,
  ).join('')
  const leaves = BRANCHES.map(
    (b) => `<circle cx="${b.leaf[0]}" cy="${b.leaf[1]}" r="${LEAF_R}" fill="${b.fill}"/>`,
  ).join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEW}" height="${VIEW}" viewBox="0 0 ${VIEW} ${VIEW}">` +
    `<title>Mind Map Studio</title>` +
    `<rect width="${VIEW}" height="${VIEW}" rx="${CORNER}" fill="${BG}"/>` +
    `<g fill="none" stroke="${LINE}" stroke-width="${BRANCH_WIDTH}" stroke-linecap="round">${paths}</g>` +
    leaves +
    `<circle cx="${CENTER.x}" cy="${CENTER.y}" r="${CENTER.r}" fill="${CENTER.fill}"/>` +
    `</svg>\n`
  )
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([length, typeBuf, data, crc])
}

function encodePng(size, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const stride = size * 4
  const raw = Buffer.alloc(size * (stride + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** A quadratic Bézier flattened into short segments. */
function flatten(p0, p1, p2, steps = 32) {
  const points = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    points.push([
      u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
      u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    ])
  }
  return points
}

function insideRoundedRect(x, y, size, radius) {
  const cx = Math.min(Math.max(x, radius), size - radius)
  const cy = Math.min(Math.max(y, radius), size - radius)
  return Math.hypot(x - cx, y - cy) <= radius
}

/**
 * Colour of one sample point in 64-unit icon space, or null when transparent.
 * Checked top layer first, matching the SVG's paint order.
 */
function makeSampler(maskable) {
  const half = BRANCH_WIDTH / 2
  const strokes = BRANCHES.map((b) => {
    const pts = flatten([CENTER.x, CENTER.y], b.ctrl, b.leaf)
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    // Bounding box, so most samples skip the per-segment distance checks.
    const box = [Math.min(...xs) - half, Math.min(...ys) - half]
    box.push(Math.max(...xs) + half, Math.max(...ys) + half)
    return { pts, box }
  })
  const bg = rgb(BG)
  const line = rgb(LINE)
  const leaves = BRANCHES.map((b) => ({ x: b.leaf[0], y: b.leaf[1], color: rgb(b.fill) }))
  const center = rgb(CENTER.fill)
  // Maskable icons may be cropped to a circle of 80% diameter, so the background
  // is full-bleed and the artwork shrinks into that safe zone.
  const scale = maskable ? 0.72 : 1
  return (sx, sy) => {
    if (!maskable && !insideRoundedRect(sx, sy, VIEW, CORNER)) return null
    const x = (sx - VIEW / 2) / scale + VIEW / 2
    const y = (sy - VIEW / 2) / scale + VIEW / 2
    if (Math.hypot(x - CENTER.x, y - CENTER.y) <= CENTER.r) return center
    for (const leaf of leaves) if (Math.hypot(x - leaf.x, y - leaf.y) <= LEAF_R) return leaf.color
    for (const { pts, box } of strokes) {
      if (x < box[0] || y < box[1] || x > box[2] || y > box[3]) continue
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1]
        const [bx, by] = pts[i]
        if (distToSegment(x, y, ax, ay, bx, by) <= half) return line
      }
    }
    return bg
  }
}

function drawIcon(size, maskable) {
  const sample = makeSampler(maskable)
  const rgba = Buffer.alloc(size * size * 4)
  const SS = 4
  const unit = VIEW / size
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let j = 0; j < SS; j++) {
        for (let i = 0; i < SS; i++) {
          const c = sample((x + (i + 0.5) / SS) * unit, (y + (j + 0.5) / SS) * unit)
          if (!c) continue
          r += c[0]
          g += c[1]
          b += c[2]
          a += 1
        }
      }
      const o = (y * size + x) * 4
      if (a > 0) {
        rgba[o] = Math.round(r / a)
        rgba[o + 1] = Math.round(g / a)
        rgba[o + 2] = Math.round(b / a)
      }
      rgba[o + 3] = Math.round((a / (SS * SS)) * 255)
    }
  }
  return encodePng(size, rgba)
}

await mkdir(OUT_DIR, { recursive: true })
await Promise.all([
  writeFile(path.join(ROOT, 'public', 'favicon.svg'), svg()),
  writeFile(path.join(OUT_DIR, 'icon-192.png'), drawIcon(192, false)),
  writeFile(path.join(OUT_DIR, 'icon-512.png'), drawIcon(512, false)),
  writeFile(path.join(OUT_DIR, 'icon-maskable-512.png'), drawIcon(512, true)),
])
console.log('icons written to public/favicon.svg and public/icons/')
