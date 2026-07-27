import type { World } from '../types'

/**
 * State for the city's time-lapse, held in a ref and mutated inside the render
 * loop rather than in React state: at 60fps a state update would re-render
 * every building in the city each frame.
 */
export interface TimelineState {
  /** True while the time-lapse is showing (buildings hidden until their date). */
  active: boolean
  playing: boolean
  /** Current position, and the range it runs over, in epoch milliseconds. */
  at: number
  from: number
  to: number
}

/** How long a full play-through takes, in seconds. */
export const TIMELAPSE_SECONDS = 14

/** Fraction of the timeline a building spends rising out of the ground. */
const RISE_FRACTION = 0.035

export function emptyTimeline(): TimelineState {
  return { active: false, playing: false, at: 0, from: 0, to: 0 }
}

/** The span a world's time-lapse covers: first repo created, through today. */
export function timelineRange(world: World): { from: number; to: number } {
  const dates = world.buildings.map((b) => new Date(b.createdAt).getTime()).filter(Number.isFinite)
  const from = dates.length ? Math.min(...dates) : Date.now()
  const now = Math.max(Date.now(), from + 1)
  // Run a little past today, or the newest repos would still be rising when
  // playback ends and the city would never finish building.
  const tail = (now - from) * RISE_FRACTION
  return { from, to: now + tail }
}

/**
 * How far out of the ground a building has risen at the current position:
 * 0 before it existed, 1 once it's fully built.
 */
export function growthAt(state: TimelineState, createdAt: number): number {
  if (!state.active) return 1
  const rise = Math.max(1, (state.to - state.from) * RISE_FRACTION)
  const progress = (state.at - createdAt) / rise
  return Math.max(0, Math.min(1, progress))
}

/** Ease so buildings settle into place instead of stopping dead. */
export function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

/** The year to show on the scrubber for a given position. */
export function yearAt(ms: number): number {
  return new Date(ms).getFullYear()
}
