import type { World } from '../types'

/**
 * Export the city on screen as a shareable PNG — the rendered frame with the
 * profile's headline numbers printed along the bottom.
 *
 * The WebGL frame is read straight off the canvas rather than re-rendered, so
 * what lands in the file is exactly what was on screen, postprocessing and all.
 * That relies on the canvas being created with `preserveDrawingBuffer` (see
 * Scene.tsx) — without it the buffer is cleared before this can read it.
 */

const BAR_HEIGHT_RATIO = 0.13

/** Compact number for the caption: 65211 -> "65.2k". */
function compact(value: number): string {
  if (value < 1000) return String(value)
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`
  return `${(value / 1_000_000).toFixed(1)}m`
}

/** The stats printed along the bottom of the postcard. */
function caption(world: World): string {
  const parts = [
    `${world.buildings.length} ${world.buildings.length === 1 ? 'repo' : 'repos'}`,
    `${compact(world.totalStars)} stars`,
    `${compact(world.user.followers)} followers`,
  ]
  return parts.join('  ·  ')
}

export interface PostcardResult {
  blob: Blob
  filename: string
}

/**
 * Compose the postcard. Returns null when there's no rendered canvas to read,
 * or when the browser refuses to export it.
 */
export async function renderPostcard(world: World): Promise<PostcardResult | null> {
  const source = document.querySelector('canvas')
  if (!source || source.width === 0 || source.height === 0) return null

  const width = source.width
  const bar = Math.round(width * BAR_HEIGHT_RATIO * 0.5)
  const height = source.height + bar

  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  const ctx = out.getContext('2d')
  if (!ctx) return null

  // The rendered city, then a solid band beneath it for the caption.
  ctx.drawImage(source, 0, 0)
  ctx.fillStyle = '#0b1020'
  ctx.fillRect(0, source.height, width, bar)

  const pad = Math.round(width * 0.025)
  const nameSize = Math.round(bar * 0.34)
  const metaSize = Math.round(bar * 0.24)
  const baseline = source.height + bar * 0.44

  const displayName = world.user.name || world.user.login
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#f2f4f8'
  ctx.font = `600 ${nameSize}px system-ui, -apple-system, Segoe UI, sans-serif`
  ctx.fillText(displayName, pad, baseline)

  const nameWidth = ctx.measureText(displayName).width
  ctx.fillStyle = '#8a93a6'
  ctx.font = `400 ${metaSize}px system-ui, -apple-system, Segoe UI, sans-serif`
  ctx.fillText(`@${world.user.login}`, pad + nameWidth + pad * 0.6, baseline)

  ctx.fillStyle = '#c8cedb'
  ctx.fillText(caption(world), pad, source.height + bar * 0.75)

  // Branding, right-aligned so it reads as a footer rather than a watermark.
  ctx.textAlign = 'right'
  ctx.fillStyle = '#ffd23f'
  ctx.font = `600 ${metaSize}px system-ui, -apple-system, Segoe UI, sans-serif`
  ctx.fillText('GitHub World', width - pad, baseline)
  ctx.fillStyle = '#6d768a'
  ctx.font = `400 ${Math.round(metaSize * 0.85)}px system-ui, -apple-system, Segoe UI, sans-serif`
  ctx.fillText(
    'akhileshnagargoje.github.io/github-world',
    width - pad,
    source.height + bar * 0.75,
  )

  const blob = await new Promise<Blob | null>((resolve) =>
    out.toBlob(resolve, 'image/png'),
  )
  if (!blob) return null

  return { blob, filename: `github-world-${world.user.login}.png` }
}

/** Save a composed postcard to the user's downloads. */
export function downloadPostcard({ blob, filename }: PostcardResult): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Give the download a moment to start before releasing the object URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
