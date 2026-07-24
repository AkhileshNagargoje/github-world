import type { Building, GitHubRepo, GitHubUser, World } from '../types'

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
 * Scatter buildings randomly across a disk of radius `radius`, using rejection
 * sampling so they keep at least `minDist` apart. The top-ranked landmark is
 * pinned to the center as an anchor; every other building lands anywhere —
 * some near the middle, some out at the edges.
 */
function scatterPositions(
  count: number,
  radius: number,
  minDist: number,
  rng: () => number,
): [number, number][] {
  const out: [number, number][] = [[0, 0]]
  for (let i = 1; i < count; i++) {
    let best: [number, number] = [0, 0]
    let bestDist = -1
    for (let attempt = 0; attempt < 30; attempt++) {
      const a = rng() * Math.PI * 2
      const r = Math.sqrt(rng()) * radius * 0.96 // sqrt → uniform over the disk
      const p: [number, number] = [Math.cos(a) * r, Math.sin(a) * r]
      let nearest = Infinity
      for (const q of out) {
        const d = Math.hypot(p[0] - q[0], p[1] - q[1])
        if (d < nearest) nearest = d
      }
      if (nearest > minDist) {
        best = p
        break
      }
      if (nearest > bestDist) {
        bestDist = nearest
        best = p
      }
    }
    out.push(best)
  }
  return out
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
  const cityRadius = spacing * (1.35 * Math.sqrt(Math.max(1, count)) + 3)
  const minDist = spacing * 1.15
  const positions = scatterPositions(
    count,
    cityRadius,
    minDist,
    makeRng(strSeed(user.login)),
  )

  const buildings: Building[] = scored.map(({ repo, score }, index) => {
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
    let rotationY: number
    const position = positions[index]
    if (landmark) {
      footprint = Math.max(baseFootprint, 3)
      depth = footprint
      rotationY = 0
    } else {
      const ratio = 0.72 + rnd(1) * 0.9 // 0.72..1.62 width:depth
      footprint = baseFootprint * Math.sqrt(ratio)
      depth = baseFootprint / Math.sqrt(ratio)
      rotationY = (rnd(2) - 0.5) * 0.16 // ~±4.5°
    }
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
    }
  })

  return {
    user,
    buildings,
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

const CACHE_PREFIX = 'ghw:world:'
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
