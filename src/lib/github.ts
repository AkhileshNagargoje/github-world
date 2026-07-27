import type { Building, CityRoad, GitHubRepo, GitHubUser, World } from '../types'

const API_BASE = 'https://api.github.com'

/** Thrown for user-facing failures (bad username, rate limit, etc.). */
export class GitHubError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GitHubError'
  }
}

async function getJSON<T>(url: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json' },
    })
  } catch {
    throw new GitHubError('Network error — check your connection and try again.')
  }

  if (res.status === 404) {
    throw new GitHubError('That GitHub user does not exist.')
  }
  if (res.status === 403 || res.status === 429) {
    // Unauthenticated requests are limited to 60/hour per IP.
    throw new GitHubError(
      'GitHub API rate limit reached. Please wait a bit and try again.',
    )
  }
  if (!res.ok) {
    throw new GitHubError(`GitHub API error (${res.status}). Try again later.`)
  }
  return res.json() as Promise<T>
}

/**
 * Fetch up to `maxRepos` of a user's public repos, sorted so the most
 * interesting (recently pushed) ones come first. The GitHub REST API caps
 * `per_page` at 100; we page until we have enough or run out.
 */
async function fetchRepos(login: string, maxRepos: number): Promise<GitHubRepo[]> {
  const perPage = 100
  const pages = Math.ceil(maxRepos / perPage)
  const repos: GitHubRepo[] = []

  for (let page = 1; page <= pages; page++) {
    const batch = await getJSON<GitHubRepo[]>(
      `${API_BASE}/users/${encodeURIComponent(login)}/repos` +
        `?per_page=${perPage}&page=${page}&sort=pushed`,
    )
    repos.push(...batch)
    if (batch.length < perPage) break // no more pages
  }
  return repos.slice(0, maxRepos)
}

/** Deterministic per-id PRNG: `hashId(id)(salt)` → stable value in [0,1). */
function hashId(id: number) {
  return (salt: number): number => {
    let h = Math.imul((id ^ salt) >>> 0, 2654435761) >>> 0
    h ^= h >>> 15
    h = Math.imul(h, 2246822519) >>> 0
    h ^= h >>> 13
    return (h >>> 0) / 0xffffffff
  }
}

/** Whole years between `iso` and now. */
function yearsSince(iso: string): number {
  const then = new Date(iso).getTime()
  const ms = Date.now() - then
  return Math.max(0, Math.floor(ms / (365.25 * 24 * 60 * 60 * 1000)))
}

/** Was this repo pushed to within the last `days` days? */
function isActive(repo: GitHubRepo, days = 60): boolean {
  if (repo.archived) return false
  const pushed = new Date(repo.pushed_at).getTime()
  return Date.now() - pushed < days * 24 * 60 * 60 * 1000
}

/**
 * Weights for the composite "significance" score that drives building HEIGHT
 * and picks the central landmark. Tune these to change what makes a project
 * stand out. Each raw signal is log-scaled before weighting, then all repos
 * are normalized relative to the tallest so proportions look good for any
 * account — big or small.
 *
 * Current mix: 100% code size (repo KB) — rewards projects you actually built
 * a lot of, not just popular ones. Bump the others to blend them back in.
 */
export const SIGNAL_WEIGHTS = {
  /** Repo size in KB — a proxy for how much code/effort went in. */
  codeSize: 1.0,
  /** How recently the repo was pushed to (0 = stale, higher = fresh). */
  recency: 0.0,
  /** Stars — social popularity. */
  stars: 0.0,
  /** Forks + watchers + open issues — how much others engage. */
  engagement: 0.0,
}

/** A 0..~8 freshness score: recently-pushed repos score higher. */
function recencyScore(pushedAt: string): number {
  const days = (Date.now() - new Date(pushedAt).getTime()) / (24 * 60 * 60 * 1000)
  return Math.max(0, 8 - Math.log2(Math.max(1, days)))
}

/**
 * Interior-window-light level (0..1) from how recently the repo was worked on.
 * Archived repos are "finished" and go nearly dark; freshly-pushed repos blaze.
 */
function windowLightLevel(repo: GitHubRepo): number {
  if (repo.archived) return 0.03
  return Math.max(0.06, Math.min(1, 0.06 + (recencyScore(repo.pushed_at) / 8) * 0.94))
}

/** Raw (un-normalized) significance of a single repo, per SIGNAL_WEIGHTS. */
function significance(repo: GitHubRepo): number {
  const w = SIGNAL_WEIGHTS
  const sizeScore = Math.log2(repo.size + 1)
  const starScore = Math.log2(repo.stargazers_count + 1)
  const engagementScore = Math.log2(
    repo.forks_count + repo.watchers_count + repo.open_issues_count + 1,
  )
  return (
    w.codeSize * sizeScore +
    w.recency * recencyScore(repo.pushed_at) +
    w.stars * starScore +
    w.engagement * engagementScore
  )
}

/** Seedable LCG stream in [0,1). */
function makeRng(seed: number) {
  let s = (seed >>> 0) || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

/** Stable 32-bit hash of a string (FNV-1a) for per-user deterministic layout. */
function strSeed(str: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0
  }
  return h
}

/**
 * Place buildings along loose city-block streets. The first repo (landmark)
 * stays close to the middle, but every building still gets deterministic
 * jitter so the layout reads as a planned city, not a perfect spreadsheet.
 */
interface LayoutSlot {
  roadPoint: [number, number]
  roadDir: [number, number]
  roadNormal: [number, number]
}

interface CityLayout {
  slots: LayoutSlot[]
  roads: CityRoad[]
}

/** Street width as a multiple of `spacing` — shared by the layout and the renderer. */
export const ROAD_WIDTH_RATIO = 0.34
/** Roughly 6 buildings front each city block, leaving spare plots to skip to. */
export function blockCountFor(count: number): number {
  return Math.max(1, Math.ceil(count / 6))
}
// Blocks are up to `spacing * 6.4` wide and `spacing * 5.3` deep, so their half
// diagonal reaches ~`spacing * 4.15`. Centers must sit farther apart than twice
// that or the block outlines intersect — which used to collapse the connecting
// roads between them to zero length, fragmenting the network.
// (Plus room for the plots that face outward from each block.)
const BLOCK_GAP = 9.8
const BLOCK_RING = 9.2

function organicCityLayout(
  count: number,
  radius: number,
  spacing: number,
  rng: () => number,
): CityLayout {
  if (count <= 0) return { slots: [], roads: [] }

  const roads: CityRoad[] = []
  const candidates: (LayoutSlot & { rank: number })[] = []
  const blockCount = blockCountFor(count)

  const addCandidate = (
    roadPoint: [number, number],
    roadDir: [number, number],
    roadNormal: [number, number],
    rankPenalty = 0,
  ) => {
    const rank =
      Math.hypot(roadPoint[0], roadPoint[1]) + rng() * spacing * 1.8 + rankPenalty
    candidates.push({ roadPoint, roadDir, roadNormal, rank })
  }

  const addRoadSegment = (a: [number, number], b: [number, number]) => {
    roads.push({ a, b })
  }

  interface Block {
    center: [number, number]
    u: [number, number]
    v: [number, number]
    width: number
    depth: number
    corners: [number, number][]
  }

  const blocks: Block[] = []
  const districtAngle = (rng() - 0.5) * 0.45

  const makeBlock = (center: [number, number], index: number): Block => {
    const angle = districtAngle + (rng() - 0.5) * 0.75 + ((index % 3) - 1) * 0.08
    const u: [number, number] = [Math.cos(angle), Math.sin(angle)]
    const v: [number, number] = [-u[1], u[0]]
    const width = spacing * (4.2 + rng() * 2.2)
    const depth = spacing * (3.4 + rng() * 1.9)
    const hw = width / 2
    const hd = depth / 2
    const corner = (su: number, sv: number): [number, number] => [
      center[0] + u[0] * hw * su + v[0] * hd * sv,
      center[1] + u[1] * hw * su + v[1] * hd * sv,
    ]
    return {
      center,
      u,
      v,
      width,
      depth,
      corners: [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)],
    }
  }

  for (let i = 0; i < blockCount; i++) {
    let center: [number, number] = [0, 0]
    if (i > 0) {
      // Walk outward on a phyllotaxis spiral, growing the ring on every failed
      // attempt so a block always lands clear of the ones already placed.
      for (let attempt = 0; attempt < 40; attempt++) {
        const ring = spacing * BLOCK_RING * Math.sqrt(i) * (1 + attempt * 0.06)
        const angle = i * 2.399963 + rng() * 0.5
        center = [
          Math.cos(angle) * ring + (rng() - 0.5) * spacing,
          Math.sin(angle) * ring + (rng() - 0.5) * spacing,
        ]
        const clear = blocks.every(
          (block) =>
            Math.hypot(center[0] - block.center[0], center[1] - block.center[1]) >
            spacing * BLOCK_GAP,
        )
        if (clear) break
      }
    }
    blocks.push(makeBlock(center, i))
  }

  const boundaryPoint = (block: Block, target: [number, number]): [number, number] => {
    const dx = target[0] - block.center[0]
    const dz = target[1] - block.center[1]
    const len = Math.hypot(dx, dz) || 1
    const dir: [number, number] = [dx / len, dz / len]
    const du = Math.abs(dir[0] * block.u[0] + dir[1] * block.u[1])
    const dv = Math.abs(dir[0] * block.v[0] + dir[1] * block.v[1])
    const tu = du > 0.0001 ? block.width / 2 / du : Infinity
    const tv = dv > 0.0001 ? block.depth / 2 / dv : Infinity
    const t = Math.min(tu, tv)
    return [block.center[0] + dir[0] * t, block.center[1] + dir[1] * t]
  }

  for (const block of blocks) {
    const corners = block.corners
    for (let edgeIndex = 0; edgeIndex < corners.length; edgeIndex++) {
      const a = corners[edgeIndex]
      const b = corners[(edgeIndex + 1) % corners.length]
      addRoadSegment(a, b)

      const dx = b[0] - a[0]
      const dz = b[1] - a[1]
      const length = Math.hypot(dx, dz)
      const roadDir: [number, number] = [dx / length, dz / length]
      const roadNormal: [number, number] = [-roadDir[1], roadDir[0]]
      const slotGap = spacing * 1.5
      const slotCount = Math.max(1, Math.floor(length / slotGap))
      for (let slot = 1; slot <= slotCount; slot++) {
        const t = slot / (slotCount + 1)
        const jitter = (rng() - 0.5) * spacing * 0.35
        const along = Math.max(spacing * 0.5, Math.min(length - spacing * 0.5, t * length + jitter))
        const point: [number, number] = [
          a[0] + roadDir[0] * along,
          a[1] + roadDir[1] * along,
        ]
        // A plot on each side of the street: real blocks are built up on both
        // kerbs, and the spare plots give the placer room to skip a bad fit.
        addCandidate(point, roadDir, roadNormal)
        addCandidate(point, roadDir, [-roadNormal[0], -roadNormal[1]], spacing * 2.5)
      }
    }
  }

  // Link the blocks with a minimum spanning tree over their centers, so every
  // block — and therefore every building fronting it — is reachable by road.
  // (Connecting each block only to the nearest *earlier* one left long detours
  // and, when two blocks overlapped, zero-length stubs that vanished entirely.)
  const blockDistance = (i: number, j: number) =>
    Math.hypot(
      blocks[i].center[0] - blocks[j].center[0],
      blocks[i].center[1] - blocks[j].center[1],
    )
  const connect = (i: number, j: number) => {
    const a = boundaryPoint(blocks[i], blocks[j].center)
    const b = boundaryPoint(blocks[j], blocks[i].center)
    // With BLOCK_GAP separation this is always a real street; the guard just
    // stops a degenerate stub from ever reaching the renderer.
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < spacing * 0.25) return
    addRoadSegment(a, b)
  }

  const linked = new Set<number>([0])
  while (linked.size < blocks.length) {
    let bestFrom = 0
    let bestTo = -1
    let bestDistance = Infinity
    for (const i of linked) {
      for (let j = 0; j < blocks.length; j++) {
        if (linked.has(j)) continue
        const d = blockDistance(i, j)
        if (d < bestDistance) {
          bestDistance = d
          bestFrom = i
          bestTo = j
        }
      }
    }
    if (bestTo < 0) break
    connect(bestFrom, bestTo)
    linked.add(bestTo)
  }

  // A tree alone reads as a branching diagram; add a few short extra links so
  // the network has loops like a real street grid.
  const extraLinks = Math.floor(blocks.length / 3)
  const pairs: { i: number; j: number; d: number }[] = []
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) pairs.push({ i, j, d: blockDistance(i, j) })
  }
  pairs.sort((a, b) => a.d - b.d)
  for (const pair of pairs.slice(blocks.length - 1, blocks.length - 1 + extraLinks)) {
    connect(pair.i, pair.j)
  }

  // Keep every well-separated plot, not just the first `count` — buildWorld
  // picks from these by rank and needs spares to skip past when a wide tower
  // won't fit the next slot along.
  const slots: LayoutSlot[] = []
  const spares: LayoutSlot[] = []
  const sortedCandidates = candidates.sort((a, b) => a.rank - b.rank)
  for (const candidate of sortedCandidates) {
    const clear = slots.every((slot) => {
      // Plots facing each other across the same street don't crowd each other,
      // so only plots on the same kerb need the spacing check.
      const sameSide =
        candidate.roadNormal[0] * slot.roadNormal[0] +
          candidate.roadNormal[1] * slot.roadNormal[1] >
        0
      if (!sameSide) return true
      return (
        Math.hypot(
          candidate.roadPoint[0] - slot.roadPoint[0],
          candidate.roadPoint[1] - slot.roadPoint[1],
        ) > spacing * 1.55
      )
    })
    if (clear) slots.push(candidate)
    else spares.push(candidate)
  }
  // Never return fewer plots than there are buildings to place.
  for (const spare of spares) {
    if (slots.length >= count) break
    slots.push(spare)
  }

  // Keep all plots inside the island even for very large profiles.
  const maxDist = Math.max(
    1,
    ...slots.map((slot) => Math.hypot(...slot.roadPoint)),
    ...roads.flatMap((road) => [Math.hypot(...road.a), Math.hypot(...road.b)]),
  )
  if (maxDist > radius * 0.9) {
    const scale = (radius * 0.9) / maxDist
    const scaledRoads: CityRoad[] = roads.map((road) => ({
      a: [road.a[0] * scale, road.a[1] * scale] as [number, number],
      b: [road.b[0] * scale, road.b[1] * scale] as [number, number],
    }))
    return {
      slots: slots.map(({ roadPoint, roadDir, roadNormal }) => ({
        roadPoint: [roadPoint[0] * scale, roadPoint[1] * scale],
        roadDir,
        roadNormal,
      })),
      roads: scaledRoads,
    }
  }

  return { slots, roads }
}

// Building height range (world units). The most significant repo reaches
// MAX_HEIGHT; everything else scales down proportionally from its score.
const MIN_HEIGHT = 2
const MAX_HEIGHT = 16

// Monochrome building shades — repos render as light near-whites (varied),
// distinguished by height/windows/spire rather than by rainbow language colors.
const REPO_SHADES = ['#e9ecf0', '#e0e4e9', '#eff2f6', '#e3e7ec', '#dae0e6', '#f1f3f6']

/** Log-scaled footprint from fork count. */
function footprintFromForks(forks: number): number {
  return Math.min(4, 1.4 + Math.log2(forks + 1) * 0.35)
}

/** Turn a user + their repos into the renderable World model. */
export function buildWorld(user: GitHubUser, rawRepos: GitHubRepo[]): World {
  // Ignore forks — a city of forks isn't really "your" work.
  const repos = rawRepos.filter((r) => !r.fork)

  const totalStars = repos.reduce((sum, r) => sum + r.stargazers_count, 0)
  const accountAgeYears = yearsSince(user.created_at)

  // Score every repo, then sort by significance so the biggest/best project
  // lands in the center as the landmark and the city grows outward from it.
  const scored = repos.map((repo) => ({ repo, score: significance(repo) }))
  scored.sort((a, b) => b.score - a.score)
  const maxScore = Math.max(1e-6, scored[0]?.score ?? 0)
  const landmarkId = scored[0]?.repo.id

  // Prosperity: blend followers and total stars on a log scale into 0..1.
  const prosperityRaw =
    Math.log2(user.followers + 1) * 0.6 + Math.log2(totalStars + 1) * 0.4
  const prosperity = Math.max(0.05, Math.min(1, prosperityRaw / 16))

  // Larger, more prosperous cities spread out a little more.
  const spacing = 3.2 + prosperity * 1.6

  // Radius the buildings scatter across (no filler city — just the repos,
  // spread out so some sit near the center and some out at the edges).
  const count = scored.length
  // The island has to hold the whole block layout, otherwise the layout gets
  // scaled down to fit and the streets end up narrower than the buildings.
  const blockReach =
    spacing * (BLOCK_RING * Math.sqrt(Math.max(0, blockCountFor(count) - 1)) + 4.4)
  const cityRadius = Math.max(
    spacing * (2.25 * Math.sqrt(Math.max(1, count)) + 4),
    blockReach / 0.88,
  )
  const layout = organicCityLayout(
    count,
    cityRadius,
    spacing,
    makeRng(strSeed(user.login)),
  )
  const positions = layout.slots
  // Plots are claimed biggest-repo-first: each building takes the most central
  // free plot it actually fits on, so wide towers never end up overlapping the
  // neighbour that shares their block corner.
  const takenSlots = new Set<number>()
  const placed: { x: number; z: number; radius: number }[] = []
  const roadWidth = spacing * ROAD_WIDTH_RATIO
  // Street segments, so a plot never gets chosen where the building body would
  // stand in a road crossing behind or beside its own street.
  const roadSegs = layout.roads
    .map(({ a, b }) => ({ a, b, length: Math.hypot(b[0] - a[0], b[1] - a[1]) }))
    .filter((seg) => seg.length >= 0.05)
  const distToRoad = (x: number, z: number, seg: (typeof roadSegs)[number]) => {
    const dx = seg.b[0] - seg.a[0]
    const dz = seg.b[1] - seg.a[1]
    const t = Math.max(
      0,
      Math.min(1, ((x - seg.a[0]) * dx + (z - seg.a[1]) * dz) / (seg.length * seg.length)),
    )
    return Math.hypot(x - (seg.a[0] + dx * t), z - (seg.a[1] + dz * t))
  }

  const buildings: Building[] = scored.map(({ repo, score }) => {
    const landmark = repo.id === landmarkId
    // Height scales relative to the tallest project so proportions read well
    // for any account, whether it has 3 stars or 30,000.
    const baseHeight = MIN_HEIGHT + (score / maxScore) * (MAX_HEIGHT - MIN_HEIGHT)
    const finalHeight = landmark ? baseHeight + 2 : baseHeight
    // Footprint comes from forks, but taller buildings get a wider minimum so
    // skyscrapers read as solid towers rather than thin sticks.
    const minFootprint = Math.max(1.3, Math.min(4, finalHeight * 0.17))
    const baseFootprint = Math.max(footprintFromForks(repo.forks_count), minFootprint)

    // Per-repo deterministic randomness for organic variety (stable across loads).
    const rnd = hashId(repo.id)
    // Give each building a rectangular footprint (area roughly preserved), a
    // slight yaw, and a little jitter within its plot — the landmark stays a
    // grand, square, centered monument.
    let footprint: number
    let depth: number
    if (landmark) {
      footprint = Math.max(baseFootprint, 3)
      depth = footprint
    } else {
      const ratio = 0.72 + rnd(1) * 0.9 // 0.72..1.62 width:depth
      footprint = baseFootprint * Math.sqrt(ratio)
      depth = baseFootprint / Math.sqrt(ratio)
    }

    // Sit the plot back from the street centerline by half a road, half a plot,
    // and a driveway — so the driveway drawn in Building.tsx always lands
    // exactly on the asphalt, whatever the building's proportions.
    const plotDepth = depth + 0.85
    const driveway = spacing * 0.3
    const roadSetback = roadWidth * 0.5 + plotDepth * 0.5 + driveway
    const bodyRadius = Math.max(footprint, depth) * 0.5
    const positionFor = (slot: LayoutSlot): [number, number] => [
      slot.roadPoint[0] + slot.roadNormal[0] * roadSetback,
      slot.roadPoint[1] + slot.roadNormal[1] * roadSetback,
    ]

    let chosen = -1
    // If nothing fits outright, fall back to the free plot that's least
    // crowded rather than simply the next one along.
    let looseSlot = -1
    let looseOverlap = Infinity
    for (let s = 0; s < positions.length; s++) {
      if (takenSlots.has(s)) continue
      const [px, pz] = positionFor(positions[s])
      let worst = 0
      for (const q of placed) {
        worst = Math.max(worst, q.radius + bodyRadius + 0.7 - Math.hypot(px - q.x, pz - q.z))
        if (worst >= looseOverlap) break
      }
      if (worst < looseOverlap) {
        for (const seg of roadSegs) {
          worst = Math.max(
            worst,
            roadWidth * 0.5 + bodyRadius + 0.3 - distToRoad(px, pz, seg),
          )
          if (worst >= looseOverlap) break
        }
      }
      if (worst <= 0) {
        chosen = s
        break
      }
      if (worst < looseOverlap) {
        looseOverlap = worst
        looseSlot = s
      }
    }
    if (chosen < 0) chosen = looseSlot >= 0 ? looseSlot : 0
    takenSlots.add(chosen)

    const plot = positions[chosen]
    const faceRoadAngle = Math.atan2(-plot.roadNormal[0], -plot.roadNormal[1])
    const rotationY = landmark ? faceRoadAngle : faceRoadAngle + (rnd(2) - 0.5) * 0.16
    const position = positionFor(plot)
    placed.push({ x: position[0], z: position[1], radius: bodyRadius })

    return {
      id: repo.id,
      name: repo.name,
      url: repo.html_url,
      description: repo.description,
      language: repo.language,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      sizeKb: repo.size,
      score,
      height: finalHeight,
      footprint,
      depth,
      rotationY,
      // Monochrome: repos are light near-whites (varied), not language colors.
      color: REPO_SHADES[Math.floor(rnd(5) * REPO_SHADES.length)],
      active: isActive(repo),
      windowLight: windowLightLevel(repo),
      landmark,
      position,
      roadWidth,
      roadPoint: plot.roadPoint,
      roadDir: plot.roadDir,
      roadNormal: plot.roadNormal,
    }
  })

  // Last resort for the rare pair that still touches (a profile with more repos
  // than there are good plots): nudge the lesser building deeper into its lot,
  // capped so its driveway stays a driveway rather than a runway.
  const maxNudge = spacing * 1.2
  const nudged = new Map<number, number>()
  for (let pass = 0; pass < 4; pass++) {
    let moved = false
    for (let i = 0; i < buildings.length; i++) {
      for (let j = i + 1; j < buildings.length; j++) {
        const a = buildings[i]
        const b = buildings[j]
        const need =
          (Math.max(a.footprint, a.depth) + Math.max(b.footprint, b.depth)) / 2 + 0.4
        const d = Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1])
        if (d >= need) continue
        // `buildings` is sorted by score, so b is the lesser one.
        const used = nudged.get(b.id) ?? 0
        const push = Math.min(need - d, maxNudge - used)
        if (push <= 0) continue
        nudged.set(b.id, used + push)
        b.position = [
          b.position[0] + b.roadNormal[0] * push,
          b.position[1] + b.roadNormal[1] * push,
        ]
        moved = true
      }
    }
    if (!moved) break
  }

  return {
    user,
    buildings,
    roads: layout.roads,
    prosperity,
    totalStars,
    accountAgeYears,
    spacing,
    cityRadius,
  }
}

/** Fetch a user + their repos and assemble the World. */
export async function fetchWorld(
  username: string,
  maxRepos = 150,
): Promise<World> {
  const login = username.trim()
  if (!login) throw new GitHubError('Please enter a GitHub username.')

  const user = await getJSON<GitHubUser>(
    `${API_BASE}/users/${encodeURIComponent(login)}`,
  )
  const repos = await fetchRepos(user.login, maxRepos)
  const world = buildWorld(user, repos)
  writeCachedWorld(login, world)
  return world
}

// --- localStorage cache so repeat views are instant and rate limits (60/hr for
// unauthenticated requests) fall back to the last-seen city instead of failing.

// Bump on any change to the World shape or the layout — cached entries store a
// fully built World, so a stale one would render with the old geometry.
const CACHE_PREFIX = 'ghw:world:v12:'
/** Cache is served without a network call when fresher than this. */
export const CACHE_FRESH_MS = 15 * 60 * 1000

interface CachedWorld {
  ts: number
  world: World
}

export function readCachedWorld(username: string): CachedWorld | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + username.trim().toLowerCase())
    return raw ? (JSON.parse(raw) as CachedWorld) : null
  } catch {
    return null
  }
}

function writeCachedWorld(username: string, world: World): void {
  try {
    localStorage.setItem(
      CACHE_PREFIX + username.trim().toLowerCase(),
      JSON.stringify({ ts: Date.now(), world }),
    )
  } catch {
    // Quota / private-mode errors are non-fatal.
  }
}
