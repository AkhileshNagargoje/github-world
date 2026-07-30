import { parkReach } from './contributionPark'
import type {
  Building,
  CityRoad,
  Contributions,
  GitHubRepo,
  GitHubUser,
  World,
} from '../types'

const API_BASE = 'https://api.github.com'

/** Thrown for user-facing failures (bad username, rate limit, etc.). */
export class GitHubError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GitHubError'
  }
}

const TOKEN_KEY = 'ghw:token'

/**
 * An optional GitHub token, kept only in this browser's localStorage and sent
 * straight to api.github.com. Unauthenticated requests are capped at 60/hour
 * per IP, which a few profile loads will exhaust; a token raises that to 5,000.
 * A classic token with no scopes ticked is enough — this only reads public data.
 */
export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setToken(token: string): void {
  try {
    const trimmed = token.trim()
    if (trimmed) localStorage.setItem(TOKEN_KEY, trimmed)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Private-mode errors are non-fatal.
  }
}

async function getJSON<T>(url: string): Promise<T> {
  let res: Response
  const token = getToken()
  try {
    res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
  } catch {
    throw new GitHubError('Network error — check your connection and try again.')
  }

  if (res.status === 404) {
    throw new GitHubError('That GitHub user does not exist.')
  }
  if (res.status === 401) {
    throw new GitHubError('That GitHub token was rejected. Check it, or clear it.')
  }
  if (res.status === 403 || res.status === 429) {
    throw new GitHubError(
      token
        ? 'GitHub API rate limit reached. Please wait a bit and try again.'
        : 'GitHub API rate limit reached (60/hour without a token). Add a token with the 🔑 button, or wait a bit.',
    )
  }
  if (!res.ok) {
    throw new GitHubError(`GitHub API error (${res.status}). Try again later.`)
  }
  return res.json() as Promise<T>
}

/**
 * A year of contributions, which only GitHub's GraphQL API exposes — and that
 * API rejects unauthenticated requests outright. Without a token this returns
 * null and the city simply has no park; it is never an error the viewer sees.
 */
/** POST a GraphQL query with the stored token. Null when there's no token. */
async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
  const token = getToken()
  if (!token) return null
  try {
    const res = await fetch(`${API_BASE}/graphql`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    })
    if (!res.ok) return null
    const body = await res.json()
    return (body?.data as T) ?? null
  } catch {
    // Nothing here is load-bearing: the city falls back to the REST data.
    return null
  }
}

/**
 * Bytes of actual code per repo, which only GraphQL will give in one request.
 *
 * The REST `size` field measures the whole repository on disk, so a project
 * with a few megabytes of images towers over one with twice the source in it.
 * This is what building height should be measuring.
 */
interface RepoLanguagePage {
  user?: {
    repositories?: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null }
      nodes: { name: string; languages: { edges: { size: number }[] } }[]
    }
  }
}

export async function fetchCodeSizes(login: string): Promise<Map<string, number> | null> {
  const query = `query($login: String!, $cursor: String) {
    user(login: $login) {
      repositories(first: 100, after: $cursor, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) {
        pageInfo { hasNextPage endCursor }
        nodes { name languages(first: 25) { edges { size } } }
      }
    }
  }`

  const sizes = new Map<string, number>()
  let cursor: string | null = null
  // Two pages covers the 150-repo cap the REST fetch uses.
  for (let page = 0; page < 2; page++) {
    const data: RepoLanguagePage | null = await graphql<RepoLanguagePage>(query, {
      login,
      cursor,
    })
    const repositories: NonNullable<
      NonNullable<RepoLanguagePage['user']>['repositories']
    > | undefined = data?.user?.repositories
    if (!repositories?.nodes) break
    for (const node of repositories.nodes) {
      const bytes = node.languages.edges.reduce(
        (sum: number, edge: { size: number }) => sum + (edge.size ?? 0),
        0,
      )
      if (bytes > 0) sizes.set(node.name.toLowerCase(), bytes)
    }
    if (!repositories.pageInfo.hasNextPage) break
    cursor = repositories.pageInfo.endCursor
  }
  return sizes.size ? sizes : null
}

export async function fetchContributions(login: string): Promise<Contributions | null> {
  const token = getToken()
  if (!token) return null

  const query = `query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks { contributionDays { date contributionCount } }
        }
      }
    }
  }`

  try {
    const res = await fetch(`${API_BASE}/graphql`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables: { login } }),
    })
    if (!res.ok) return null
    const body = await res.json()
    const calendar =
      body?.data?.user?.contributionsCollection?.contributionCalendar
    if (!calendar?.weeks?.length) return null

    const weeks = calendar.weeks.map((week: { contributionDays: unknown[] }) =>
      week.contributionDays.map((day) => {
        const d = day as { date: string; contributionCount: number }
        return { date: d.date, count: d.contributionCount ?? 0 }
      }),
    )
    const busiestDay = weeks
      .flat()
      .reduce((max: number, day: { count: number }) => Math.max(max, day.count), 0)
    return {
      total: calendar.totalContributions ?? 0,
      weeks,
      busiestDay,
    }
  } catch {
    // A missing park is not worth failing the whole city over.
    return null
  }
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

/**
 * Kilobytes of code in a repo. Prefers the real total from the languages API,
 * which counts source only; falls back to REST's `size`, which measures the
 * whole repository on disk — a few megabytes of committed images will dwarf a
 * project with twice the source in it.
 */
function codeKbFor(repo: GitHubRepo, codeBytes: Map<string, number> | null): number {
  const bytes = codeBytes?.get(repo.name.toLowerCase())
  return bytes ? bytes / 1024 : repo.size
}

/** Raw (un-normalized) significance of a single repo, per SIGNAL_WEIGHTS. */
function significance(repo: GitHubRepo, codeKb: number): number {
  const w = SIGNAL_WEIGHTS
  const sizeScore = Math.log2(codeKb + 1)
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


/** Street width as a multiple of `spacing` — shared by the layout and renderer. */
export const ROAD_WIDTH_RATIO = 0.34

/** A plot fronting a street: where it meets the kerb, and which way it faces. */
interface LayoutSlot {
  roadPoint: [number, number]
  roadDir: [number, number]
  roadNormal: [number, number]
}

export interface CityLayout {
  slots: LayoutSlot[]
  roads: CityRoad[]
}

/**
 * A plain city grid: evenly spaced streets running straight in both
 * directions, every crossing a real intersection. The grid is square-ish and
 * sized to the repo count, and every street is built up on both sides.
 */
export function streetNetwork(count: number, spacing: number, rng: () => number): CityLayout {
  if (count <= 0) return { slots: [], roads: [] }

  // Size the grid so its streets are mostly built up: too many and the
  // buildings scatter thinly across them, too few and they run out of plots.
  const side = Math.max(2, Math.round((1 + Math.sqrt(1 + 1.05 * Math.max(1, count))) / 2))

  // One block size for the whole city, so avenues line up end to end.
  const block = spacing * 3.6
  const half = (block * (side - 1)) / 2
  const at = (i: number) => i * block - half

  // Avenues (north-south) and streets (east-west), full width each, so every
  // crossing joins four ways and the network is connected by construction.
  const roads: CityRoad[] = []
  for (let i = 0; i < side; i++) {
    for (let j = 0; j < side - 1; j++) {
      roads.push({ a: [at(i), at(j)], b: [at(i), at(j + 1)] })
      roads.push({ a: [at(j), at(i)], b: [at(j + 1), at(i)] })
    }
  }

  // Plots down both kerbs of every street, clear of the intersections at each
  // end, ranked so the city fills from the middle outward. Tighten the spacing
  // and retry if the streets came out shorter than the profile needs — running
  // out of plots is what used to crash the layout on tiny profiles.
  let candidates: (LayoutSlot & { rank: number })[] = []
  for (let attempt = 0; attempt < 5 && candidates.length < count; attempt++) {
    candidates = []
    const tightening = 0.75 ** attempt
    // Plots sit close together — buildings are 2-4 wide, so this is a terrace
    // with a little breathing room, not houses stranded in their own fields.
    const slotGap = spacing * 1.0 * tightening
    const endClearance = spacing * 0.55 * tightening
    for (const road of roads) {
      const dx = road.b[0] - road.a[0]
      const dz = road.b[1] - road.a[1]
      const length = Math.hypot(dx, dz)
      const usable = length - endClearance * 2
      if (usable <= 0) continue
      const roadDir: [number, number] = [dx / length, dz / length]
      const normal: [number, number] = [-roadDir[1], roadDir[0]]
      const slots = Math.max(1, Math.floor(usable / slotGap))
      for (let i = 0; i < slots; i++) {
        // Evenly spaced along the kerb — on a grid the facades should line up.
        const along = endClearance + (usable * (i + 0.5)) / slots
        const point: [number, number] = [
          road.a[0] + roadDir[0] * along,
          road.a[1] + roadDir[1] * along,
        ]
        const rank = Math.hypot(point[0], point[1]) + rng() * spacing * 0.3
        candidates.push({ roadPoint: point, roadDir, roadNormal: normal, rank })
        candidates.push({
          roadPoint: point,
          roadDir,
          roadNormal: [-normal[0], -normal[1]],
          rank: rank + spacing * 0.4,
        })
      }
    }
  }
  candidates.sort((a, b) => a.rank - b.rank)

  return {
    slots: candidates.map(({ roadPoint, roadDir, roadNormal }) => ({
      roadPoint,
      roadDir,
      roadNormal,
    })),
    roads,
  }
}

// Building height range (world units). The most significant repo reaches
// MAX_HEIGHT; everything else scales down proportionally from its score.
const MIN_HEIGHT = 2
const MAX_HEIGHT = 16

// Monochrome building shades — repos render as light near-whites (varied),
// distinguished by height/windows/spire rather than by rainbow language colors.
const REPO_SHADES = ['#e9ecf0', '#e0e4e9', '#eff2f6', '#e3e7ec', '#dae0e6', '#f1f3f6']

/**
 * Roof treatment. Low buildings get pitched roofs like houses, tall ones get
 * stepped setbacks or a crown, so the skyline has a silhouette instead of
 * being a row of identical flat boxes.
 */
function roofFor(
  landmark: boolean,
  height: number,
  roll: number,
): 'flat' | 'stepped' | 'pitched' | 'crown' {
  if (landmark) return 'crown'
  if (height < 4.5) return roll < 0.65 ? 'pitched' : 'flat'
  if (height > 11) return roll < 0.45 ? 'stepped' : roll < 0.6 ? 'crown' : 'flat'
  return roll < 0.3 ? 'stepped' : 'flat'
}

/**
 * Depth of the annex behind a building — a workshop out back, standing for the
 * copies of a project other people took away. Forks otherwise only nudged the
 * footprint, which is invisible next to a fifteen-unit tower.
 *
 * Only projects that were actually forked get one, so it reads as a fact about
 * the repo rather than as decoration on every building.
 */
function annexFor(forks: number): number {
  if (forks < 3) return 0
  return Math.min(2.2, 0.6 + Math.log2(forks) * 0.22)
}

/** Log-scaled footprint from fork count. */
function footprintFromForks(forks: number): number {
  return Math.min(4, 1.4 + Math.log2(forks + 1) * 0.35)
}

/** Turn a user + their repos into the renderable World model. */
export function buildWorld(
  user: GitHubUser,
  rawRepos: GitHubRepo[],
  contributions: Contributions | null = null,
  codeBytes: Map<string, number> | null = null,
): World {
  // Ignore forks — a city of forks isn't really "your" work.
  const repos = rawRepos.filter((r) => !r.fork)

  const totalStars = repos.reduce((sum, r) => sum + r.stargazers_count, 0)
  const accountAgeYears = yearsSince(user.created_at)

  // Score every repo, then sort by significance so the biggest/best project
  // lands in the center as the landmark and the city grows outward from it.
  const scored = repos.map((repo) => {
    const codeKb = codeKbFor(repo, codeBytes)
    return { repo, codeKb, score: significance(repo, codeKb) }
  })
  scored.sort((a, b) => b.score - a.score)
  const maxScore = Math.max(1e-6, scored[0]?.score ?? 0)
  const landmarkId = scored[0]?.repo.id

  // A spire should read as an award, not decoration. Only the best-starred
  // handful earn one — giving every repo with a single star a spire made a
  // 19,000-star project look exactly like a 1-star one.
  const starRanking = [...repos]
    .filter((repo) => repo.stargazers_count > 0)
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
  const spireCount = Math.max(1, Math.round(starRanking.length * 0.15))
  const spired = new Set(starRanking.slice(0, spireCount).map((repo) => repo.id))

  // Prosperity: blend followers and total stars on a log scale into 0..1.
  const prosperityRaw =
    Math.log2(user.followers + 1) * 0.6 + Math.log2(totalStars + 1) * 0.4
  const prosperity = Math.max(0.05, Math.min(1, prosperityRaw / 16))

  // Larger, more prosperous cities spread out a little more.
  const spacing = 3.2 + prosperity * 1.6

  // Radius the buildings scatter across (no filler city — just the repos,
  // spread out so some sit near the center and some out at the edges).
  const count = scored.length
  const layout = streetNetwork(count, spacing, makeRng(strSeed(user.login)))
  const positions = layout.slots
  // Plots are claimed biggest-repo-first: each building takes the most central
  // free plot it actually fits on, so wide towers never end up overlapping a
  // neighbour or standing in a crossing street.
  const takenSlots = new Set<number>()
  const placed: { x: number; z: number; radius: number }[] = []
  const roadWidth = spacing * ROAD_WIDTH_RATIO
  // Every street exists before a single building is placed, so the fit test
  // below can check plots against the whole network.
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

  const buildings: Building[] = scored.map(({ repo, score, codeKb }) => {
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
    // The annex stands inside the plot, so the plot — and every clearance
    // computed from it — has to grow to hold it.
    const annex = annexFor(repo.forks_count)
    const plotDepth = depth + annex + 0.85
    const driveway = spacing * 0.3
    const roadSetback = roadWidth * 0.5 + plotDepth * 0.5 + driveway
    const bodyRadius = Math.max(footprint, depth + annex) * 0.5
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

    // Plots sit close together so streets read as terraces, which means a wide
    // building covers the frontage of its neighbours. Claim those too, rather
    // than leaving them to be filled by something that would clip this one.
    const claimed = positions[chosen]
    for (let s = 0; s < positions.length; s++) {
      if (takenSlots.has(s)) continue
      const other = positions[s]
      const sameSide =
        other.roadNormal[0] * claimed.roadNormal[0] +
          other.roadNormal[1] * claimed.roadNormal[1] >
        0
      if (!sameSide) continue
      const apart = Math.hypot(
        other.roadPoint[0] - claimed.roadPoint[0],
        other.roadPoint[1] - claimed.roadPoint[1],
      )
      if (apart < bodyRadius + 1.4) takenSlots.add(s)
    }

    const plot = positions[chosen]
    const faceRoadAngle = Math.atan2(-plot.roadNormal[0], -plot.roadNormal[1])
    // Square to the street: a grid city's buildings line up with the kerb.
    const rotationY = faceRoadAngle
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
      codeKb: Math.round(codeKb),
      annex,
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
      createdAt: repo.created_at,
      roof: roofFor(landmark, finalHeight, rnd(7)),
      starred: spired.has(repo.id),
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
        // Annex included: it stands behind the building and takes up plot too.
        const need =
          (Math.max(a.footprint, a.depth + a.annex) +
            Math.max(b.footprint, b.depth + b.annex)) /
            2 +
          0.4
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

  const roads = layout.roads

  // Size the island from what the layout actually came out as, so the city
  // neither overflows the coastline nor floats in a sea of empty grass.
  const cityReach = Math.max(
    spacing * 5,
    ...buildings.map((b) => Math.hypot(...b.position) + Math.max(b.footprint, b.depth)),
    ...roads.flatMap((road) => [Math.hypot(...road.a), Math.hypot(...road.b)]),
  )
  // The contributions park sits off the south edge, so the island has to cover
  // it too — otherwise half the calendar would be planted in the sea.
  const reach = contributions ? Math.max(cityReach, parkReach(cityReach, spacing)) : cityReach
  const cityRadius = reach * 1.18 + spacing * 2

  return {
    user,
    buildings,
    roads,
    contributions,
    prosperity,
    totalStars,
    accountAgeYears,
    spacing,
    cityReach,
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
  // Contributions need a token; without one this resolves to null and the city
  // is built exactly as before, minus its park.
  // Both need a token; without one they resolve to null and the city is built
  // from the REST data exactly as before.
  const [contributions, codeBytes] = await Promise.all([
    fetchContributions(user.login),
    fetchCodeSizes(user.login),
  ])
  const world = buildWorld(user, repos, contributions, codeBytes)
  writeCachedWorld(login, world)
  return world
}

// --- localStorage cache so repeat views are instant and rate limits (60/hr for
// unauthenticated requests) fall back to the last-seen city instead of failing.

// Bump on any change to the World shape or the layout — cached entries store a
// fully built World, so a stale one would render with the old geometry.
const CACHE_PREFIX = 'ghw:world:v20:'
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

/** Drop worlds cached by an earlier version — they'd never be read again. */
function dropStaleCacheVersions(): void {
  try {
    const stale: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('ghw:world:') && !key.startsWith(CACHE_PREFIX)) {
        stale.push(key)
      }
    }
    stale.forEach((key) => localStorage.removeItem(key))
  } catch {
    // Private-mode errors are non-fatal.
  }
}

function writeCachedWorld(username: string, world: World): void {
  try {
    dropStaleCacheVersions()
    localStorage.setItem(
      CACHE_PREFIX + username.trim().toLowerCase(),
      JSON.stringify({ ts: Date.now(), world }),
    )
  } catch {
    // Quota / private-mode errors are non-fatal.
  }
}
