// Shapes we care about from the GitHub REST API, plus the derived model the
// 3D scene consumes. We only type the fields we actually use.

export interface GitHubUser {
  login: string
  name: string | null
  avatar_url: string
  html_url: string
  bio: string | null
  public_repos: number
  followers: number
  following: number
  created_at: string
}

export interface GitHubRepo {
  id: number
  name: string
  full_name: string
  html_url: string
  description: string | null
  language: string | null
  stargazers_count: number
  forks_count: number
  watchers_count: number
  open_issues_count: number
  /** Repo size in KB (roughly the on-disk size — a proxy for code volume). */
  size: number
  archived: boolean
  fork: boolean
  created_at: string
  pushed_at: string
  updated_at: string
}

/** A single building placed in the city, derived from one repo. */
export interface Building {
  id: number
  name: string
  url: string
  description: string | null
  language: string | null
  stars: number
  forks: number
  /** Repo size in KB — GitHub's whole-repository measure, assets included. */
  sizeKb: number
  /**
   * Kilobytes of actual code, and the real driver of building height. Exact
   * with a token (from the languages API); falls back to `sizeKb` without one.
   */
  codeKb: number
  /** Composite significance score used to size the building & pick the landmark. */
  score: number
  /** World height of the box. */
  height: number
  /** World X-width of the box footprint. */
  footprint: number
  /** World Z-depth of the box footprint (differs from width for variety). */
  depth: number
  /** Small yaw (radians) so buildings aren't all perfectly grid-aligned. */
  rotationY: number
  /** Hex color derived from the repo's primary language. */
  color: string
  /** True when the repo was pushed to recently (shows a crane + lit glow). */
  active: boolean
  /** 0..1 interior-window-light level, from how recently the repo was worked on. */
  windowLight: number
  /** True for the user's single most-starred repo — rendered as a monument. */
  landmark: boolean
  /** When the repo was created (ISO) — drives the city's time-lapse. */
  createdAt: string
  /** Depth of the annex out back — how much this project was forked. 0 = none. */
  annex: number
  /** Roof treatment, varied per repo so the skyline isn't a row of flat boxes. */
  roof: 'flat' | 'stepped' | 'pitched' | 'crown'
  /** True for the handful of best-starred repos — only these earn a spire. */
  starred: boolean
  /** Grid position in the world (x, z). */
  position: [number, number]
  /** Width of the street this building fronts (matches what CityDecor draws). */
  roadWidth: number
  /** Point on the road centerline closest to this building. */
  roadPoint: [number, number]
  /** Unit direction vector of the road this building faces. */
  roadDir: [number, number]
  /** Unit vector pointing from the road toward the building. */
  roadNormal: [number, number]
}

/** One day of the contribution calendar. */
export interface ContributionDay {
  /** ISO date (YYYY-MM-DD). */
  date: string
  count: number
}

/**
 * A year of contributions, from GitHub's GraphQL API. Only available when the
 * viewer has supplied a token — the REST API doesn't expose this.
 */
export interface Contributions {
  total: number
  /** 53 weeks of 7 days, oldest first, exactly as the calendar is laid out. */
  weeks: ContributionDay[][]
  busiestDay: number
}

export interface CityRoad {
  a: [number, number]
  b: [number, number]
}

/** Everything the scene needs to render one user's world. */
export interface World {
  user: GitHubUser
  buildings: Building[]
  roads: CityRoad[]
  /** 0..1 measure of overall prosperity — drives lighting & ground lushness. */
  prosperity: number
  /** Total stars across all (non-fork) repos. */
  totalStars: number
  /** Age of the account in whole years. */
  accountAgeYears: number
  /** World-unit distance between building plots (grid spacing). */
  spacing: number
  /** How far the built city reaches from the center (excludes the park). */
  cityReach: number
  /** World radius the whole city (repos + filler fabric) fills. */
  cityRadius: number
  /** A year of contributions, when a token was available to fetch them. */
  contributions: Contributions | null
}
