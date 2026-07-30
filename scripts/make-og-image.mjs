// Draws the social preview card at public/og.png.
//
// A link to this project used to unfurl as bare text. Rather than commit a
// screenshot that goes stale every time the city changes, the card is drawn
// here from flat rectangles and written as a PNG by hand — Node's zlib is the
// only thing needed, so there is no image dependency and `npm run og`
// reproduces it byte for byte.
//
// No text: the title and description come from the meta tags, and every unfurl
// renders those itself.

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const WIDTH = 1200
const HEIGHT = 630
const HORIZON = 470
const STREET = 26

const pixels = new Uint8Array(WIDTH * HEIGHT * 3)

const rgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]

function setPixel(x, y, [r, g, b]) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return
  const i = (y * WIDTH + x) * 3
  pixels[i] = r
  pixels[i + 1] = g
  pixels[i + 2] = b
}

function fillRect(x0, y0, w, h, color) {
  for (let y = Math.round(y0); y < Math.round(y0 + h); y++) {
    for (let x = Math.round(x0); x < Math.round(x0 + w); x++) setPixel(x, y, color)
  }
}

/** Vertical gradient, for the night sky. */
function fillGradient(top, bottom, height) {
  const a = rgb(top)
  const b = rgb(bottom)
  for (let y = 0; y < height; y++) {
    const t = y / (height - 1)
    const shade = [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t),
    ]
    for (let x = 0; x < WIDTH; x++) setPixel(x, y, shade)
  }
}

function fillDisc(cx, cy, radius, color) {
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius * radius) setPixel(x, y, color)
    }
  }
}

/** The same seeded generator the city itself uses, so the skyline is stable. */
function makeRng(seed) {
  let s = seed >>> 0 || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

fillGradient('#070b16', '#121a2e', HEIGHT)

// Moon, with a soft halo — the bloom pass in the app makes the same shape.
fillDisc(1010, 120, 74, rgb('#0f1730'))
fillDisc(1010, 120, 52, rgb('#141d38'))
fillDisc(1010, 120, 34, rgb('#e2ebff'))

const rng = makeRng(20260728)
const WALL = [rgb('#232939'), rgb('#2b3243'), rgb('#1d2230')]
const WINDOW = rgb('#ffd696')
const SPIRE = rgb('#ffd23f')

for (let i = 0; i < 27; i++) {
  const width = Math.round(26 + rng() * 34)
  const x = Math.round(30 + i * 44 + rng() * 8)
  const height = Math.round(60 + rng() * 215)
  const top = HORIZON - height
  fillRect(x, top, width, height, WALL[i % WALL.length])

  // Windows on a regular grid: a real pattern compresses far better than noise,
  // and at card size the regularity reads as a lit facade either way.
  const lit = rng() < 0.75
  for (let wy = top + 14; wy < HORIZON - 14; wy += 19) {
    for (let wx = x + 7; wx < x + width - 9; wx += 15) {
      if (lit && rng() < 0.62) fillRect(wx, wy, 7, 9, WINDOW)
    }
  }

  // A spire on a few of them, as in the city: rare, so it means something.
  if (rng() < 0.16) {
    for (let s = 0; s < 24; s++) {
      const half = Math.max(1, Math.round((24 - s) / 7))
      fillRect(x + width / 2 - half, top - s, half * 2, 1, SPIRE)
    }
  }
}

// Street with a dashed centreline, then water below the shore.
fillRect(0, HORIZON, WIDTH, STREET, rgb('#33363d'))
for (let x = 20; x < WIDTH; x += 60) fillRect(x, HORIZON + 12, 30, 3, rgb('#d8c463'))
fillRect(0, HORIZON + STREET, WIDTH, HEIGHT - HORIZON - STREET, rgb('#16233a'))

// A band of lighter water, so the lower third isn't a dead slab.
fillRect(0, HORIZON + STREET + 96, WIDTH, 2, rgb('#1b2b46'))
fillRect(0, HORIZON + STREET + 118, WIDTH, 2, rgb('#1b2b46'))

// --- PNG encoding ----------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

const header = Buffer.alloc(13)
header.writeUInt32BE(WIDTH, 0)
header.writeUInt32BE(HEIGHT, 4)
header[8] = 8 // bit depth
header[9] = 2 // truecolour
// compression, filter and interlace methods are all 0

// Each row is prefixed with its filter type; 0 (none) keeps this simple and
// still compresses well, since the artwork is flat colour.
const raw = Buffer.alloc(HEIGHT * (WIDTH * 3 + 1))
for (let y = 0; y < HEIGHT; y++) {
  const rowStart = y * (WIDTH * 3 + 1)
  raw[rowStart] = 0
  pixels.copy?.(raw, rowStart + 1, y * WIDTH * 3, (y + 1) * WIDTH * 3)
  if (!pixels.copy) {
    raw.set(pixels.subarray(y * WIDTH * 3, (y + 1) * WIDTH * 3), rowStart + 1)
  }
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

const out = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'og.png')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, png)
console.log(`wrote ${out} — ${WIDTH}x${HEIGHT}, ${Math.round(png.length / 1024)} KB`)
