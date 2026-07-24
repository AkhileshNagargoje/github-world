import * as THREE from 'three'

/**
 * A subtle procedural "grass" texture: low-contrast grayscale mottling used as
 * the ground material's `map`, so it multiplies the (prosperity-tinted) ground
 * color into soft natural variation instead of a flat slab. Built once, tiled.
 */
let cached: THREE.Texture | null = null

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

export function getGroundTexture(): THREE.Texture {
  if (cached) return cached
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const r = rng(20260724)

  // Base near-white so it barely darkens the material color.
  ctx.fillStyle = '#f2f2f2'
  ctx.fillRect(0, 0, size, size)

  // Soft blotches (lighter & darker) for large-scale variation.
  for (let i = 0; i < 260; i++) {
    const x = r() * size
    const y = r() * size
    const rad = 6 + r() * 26
    const light = r() < 0.5
    ctx.fillStyle = light
      ? `rgba(255,255,255,${0.05 + r() * 0.12})`
      : `rgba(150,150,150,${0.05 + r() * 0.14})`
    ctx.beginPath()
    ctx.arc(x, y, rad, 0, Math.PI * 2)
    ctx.fill()
  }
  // Fine specks for a grassy grain.
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(120,120,120,0.10)' : 'rgba(255,255,255,0.10)'
    ctx.fillRect(r() * size, r() * size, 1.5, 1.5)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.needsUpdate = true
  cached = tex
  return tex
}
