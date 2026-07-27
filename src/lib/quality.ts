/**
 * Render quality. A phone GPU running this at full resolution with ambient
 * occlusion and bloom turns a 60fps city into a slideshow, so the scene starts
 * at a tier matched to the device and steps down further if frames actually
 * start dropping (see the PerformanceMonitor in Scene.tsx).
 */
export type QualityTier = 'low' | 'high'

export interface QualitySettings {
  tier: QualityTier
  /** Device-pixel-ratio clamp for the canvas. */
  dpr: [number, number]
  shadowMapSize: number
  /** Ambient occlusion costs a full depth pass — the first thing to go. */
  ambientOcclusion: boolean
  softShadowSamples: number
  starCount: number
}

/**
 * Guess a starting tier. Deliberately conservative: a coarse pointer or a
 * narrow viewport means a phone or tablet, and a low core count means a weak
 * machine whatever its screen.
 */
export function detectTier(): QualityTier {
  if (typeof window === 'undefined') return 'high'
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  // Width only: a short desktop window is still a desktop, and judging on the
  // smaller dimension flagged an ordinary 12-core machine as a phone.
  const narrow = window.innerWidth < 700
  const fewCores = (navigator.hardwareConcurrency ?? 8) <= 4
  return coarse || narrow || fewCores ? 'low' : 'high'
}

export function settingsFor(tier: QualityTier): QualitySettings {
  if (tier === 'low') {
    return {
      tier,
      // Phones report a device pixel ratio of 3 or more; rendering the city at
      // that resolution is the single most expensive thing we could do.
      dpr: [1, 1.25],
      shadowMapSize: 1024,
      ambientOcclusion: false,
      softShadowSamples: 4,
      starCount: 900,
    }
  }
  return {
    tier,
    dpr: [1, 2],
    shadowMapSize: 2048,
    ambientOcclusion: true,
    softShadowSamples: 8,
    starCount: 2500,
  }
}
