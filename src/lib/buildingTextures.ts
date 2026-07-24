import * as THREE from 'three'

/**
 * Procedural window textures shared by every building. Two tiling textures are
 * generated once on a 2D canvas and reused (cloned only to set per-building
 * `repeat`), so even a 150-building city uploads just two images to the GPU.
 *
 *  - `map`         multiplies the building's language color: white wall with
 *                  darker "glass" rectangles → tinted wall + recessed windows.
 *  - `emissiveMap` black wall with warm rectangles on the *lit* windows only.
 *                  A per-building `emissiveIntensity` (driven by how recently
 *                  the repo was worked on) turns those lights up or down.
 */

const COLS = 4
const ROWS = 4
/** Fraction of windows that are "lit" in the emissive map. */
const LIT_FRACTION = 0.62

let cached: WindowTextures | null = null

export interface WindowTextures {
  map: THREE.Texture
  emissiveMap: THREE.Texture
}

/** Deterministic tiny PRNG so the lit-window pattern is stable across reloads. */
function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

function drawGrid(
  size: number,
  drawCell: (x: number, y: number, w: number, h: number, col: number, row: number) => void,
) {
  const cellW = size / COLS
  const cellH = size / ROWS
  const winW = cellW * 0.58
  const winH = cellH * 0.62
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * cellW + (cellW - winW) / 2
      const y = r * cellH + (cellH - winH) / 2
      drawCell(x, y, winW, winH, c, r)
    }
  }
}

function makeTexture(
  size: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  paint(ctx)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.needsUpdate = true
  return tex
}

function build(): WindowTextures {
  const size = 256
  const rng = makeRng(1337)
  // Decide which windows are lit up-front so map + emissiveMap agree.
  const lit: boolean[] = []
  for (let i = 0; i < COLS * ROWS; i++) lit.push(rng() < LIT_FRACTION)

  const map = makeTexture(size, (ctx) => {
    // White wall so the material's language color shows at full strength.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size, size)
    drawGrid(size, (x, y, w, h, c, r) => {
      const isLit = lit[r * COLS + c]
      // Lit windows read a touch warmer/lighter, dark ones cooler/darker.
      ctx.fillStyle = isLit ? '#6b6152' : '#2f333c'
      ctx.fillRect(x, y, w, h)
    })
  })

  const emissiveMap = makeTexture(size, (ctx) => {
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, size, size)
    drawGrid(size, (x, y, w, h, c, r) => {
      if (!lit[r * COLS + c]) return
      ctx.fillStyle = '#ffe6b0' // warm interior light
      ctx.fillRect(x, y, w, h)
    })
  })

  return { map, emissiveMap }
}

/** Get the shared window textures (built on first use). */
export function getWindowTextures(): WindowTextures {
  if (!cached) cached = build()
  return cached
}
