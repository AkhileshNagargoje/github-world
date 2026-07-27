/**
 * Geometry for the contributions park — the GitHub calendar laid out as planted
 * beds on the edge of the city, one bed per day, taller and greener the busier
 * the day was.
 *
 * Shared by the layout (which has to make the island big enough to hold it) and
 * the renderer, so the two can't disagree about where the park is.
 */

export const PARK_COLUMNS = 53
export const PARK_ROWS = 7

export interface ParkLayout {
  /** Size of one day's bed. */
  cell: number
  width: number
  depth: number
  /** Center of the park, south of the city grid. */
  center: [number, number]
  /** Tallest a bed grows on the busiest day. */
  maxHeight: number
}

/** Where the park sits and how big it is, given how far the city reaches. */
export function parkLayout(cityReach: number, spacing: number): ParkLayout {
  // Wide enough that a day's bed is still legible, but not so wide that the
  // park dwarfs a small city — a 9-repo profile was getting a park three times
  // the width of its own streets.
  const width = Math.max(cityReach * 1.5, spacing * 10)
  const cell = width / PARK_COLUMNS
  const depth = cell * PARK_ROWS
  const gap = spacing * 2.2
  return {
    cell,
    width,
    depth,
    center: [0, cityReach + gap + depth / 2],
    maxHeight: Math.max(1.2, cell * 2.4),
  }
}

/** How far the park extends from the city center — what the island must cover. */
export function parkReach(cityReach: number, spacing: number): number {
  const park = parkLayout(cityReach, spacing)
  return Math.hypot(park.width / 2, park.center[1] + park.depth / 2)
}
