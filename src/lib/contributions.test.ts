import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildWorld, fetchContributions, setToken } from './github'
import { parkLayout, parkReach, PARK_COLUMNS, PARK_ROWS } from './contributionPark'
import type { Contributions, GitHubRepo, GitHubUser } from '../types'

// The contributions path can't be exercised against the real API without a
// token, so the GraphQL response is mocked here — the point is that a missing
// or broken response degrades to "no park", never to a failed city.

function user(login = 'someone'): GitHubUser {
  return {
    login,
    name: login,
    avatar_url: '',
    html_url: '',
    bio: null,
    public_repos: 0,
    followers: 100,
    following: 0,
    created_at: '2015-01-01T00:00:00Z',
  }
}

function repos(count = 6): GitHubRepo[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `repo-${i}`,
    full_name: `someone/repo-${i}`,
    html_url: '',
    description: null,
    language: 'TypeScript',
    stargazers_count: i * 3,
    forks_count: i,
    watchers_count: 0,
    open_issues_count: 0,
    size: 5000 - i * 400,
    archived: false,
    fork: false,
    created_at: '2019-05-01T00:00:00Z',
    pushed_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
  }))
}

function calendarResponse(perDay = 3) {
  return {
    data: {
      user: {
        contributionsCollection: {
          contributionCalendar: {
            totalContributions: perDay * PARK_COLUMNS * PARK_ROWS,
            weeks: Array.from({ length: PARK_COLUMNS }, (_, w) => ({
              contributionDays: Array.from({ length: PARK_ROWS }, (_, d) => ({
                date: `2026-01-${((w + d) % 28) + 1}`,
                contributionCount: perDay,
              })),
            })),
          },
        },
      },
    },
  }
}

/** The token lives in localStorage, which the node test environment lacks. */
function stubStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    key: (index: number) => [...store.keys()][index] ?? null,
    clear: () => store.clear(),
    get length() {
      return store.size
    },
  })
}

function mockFetch(body: unknown, ok = true) {
  const spy = vi.fn().mockResolvedValue({ ok, json: async () => body })
  vi.stubGlobal('fetch', spy)
  return spy
}

beforeEach(() => {
  stubStorage()
})

afterEach(() => {
  setToken('')
  vi.unstubAllGlobals()
})

describe('fetching contributions', () => {
  it('returns nothing without a token, and never calls the API', async () => {
    const spy = mockFetch(calendarResponse())
    setToken('')
    expect(await fetchContributions('someone')).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })

  it('reads the calendar when a token is set', async () => {
    mockFetch(calendarResponse(4))
    setToken('test-token')
    const result = await fetchContributions('someone')
    expect(result).not.toBeNull()
    expect(result?.weeks).toHaveLength(PARK_COLUMNS)
    expect(result?.weeks[0]).toHaveLength(PARK_ROWS)
    expect(result?.busiestDay).toBe(4)
    expect(result?.total).toBe(4 * PARK_COLUMNS * PARK_ROWS)
  })

  it('sends the token as a bearer credential', async () => {
    const spy = mockFetch(calendarResponse())
    setToken('test-token')
    await fetchContributions('someone')
    const [, init] = spy.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer test-token')
    expect(init.method).toBe('POST')
  })

  it('degrades to no park on an error response', async () => {
    mockFetch({ message: 'Bad credentials' }, false)
    setToken('bad-token')
    expect(await fetchContributions('someone')).toBeNull()
  })

  it('degrades to no park on a malformed response', async () => {
    mockFetch({ data: { user: null } })
    setToken('test-token')
    expect(await fetchContributions('someone')).toBeNull()
  })

  it('degrades to no park when the request throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    setToken('test-token')
    expect(await fetchContributions('someone')).toBeNull()
  })
})

describe('the park in the world', () => {
  const contributions: Contributions = {
    total: 1200,
    busiestDay: 12,
    weeks: Array.from({ length: PARK_COLUMNS }, () =>
      Array.from({ length: PARK_ROWS }, () => ({ date: '2026-01-01', count: 5 })),
    ),
  }

  it('is absent when there are no contributions to show', () => {
    expect(buildWorld(user(), repos()).contributions).toBeNull()
  })

  it('grows the island to cover the park', () => {
    const without = buildWorld(user(), repos())
    const with_ = buildWorld(user(), repos(), contributions)
    expect(with_.cityRadius).toBeGreaterThan(without.cityRadius)
    expect(with_.cityReach).toBe(without.cityReach)
  })

  it('keeps every bed on the island', () => {
    const world = buildWorld(user(), repos(), contributions)
    const park = parkLayout(world.cityReach, world.spacing)
    const corners: [number, number][] = [
      [park.center[0] - park.width / 2, park.center[1] - park.depth / 2],
      [park.center[0] + park.width / 2, park.center[1] + park.depth / 2],
    ]
    for (const corner of corners) {
      expect(Math.hypot(...corner)).toBeLessThan(world.cityRadius)
    }
  })

  it('places the park clear of the city itself', () => {
    const world = buildWorld(user(), repos(), contributions)
    const park = parkLayout(world.cityReach, world.spacing)
    expect(park.center[1] - park.depth / 2).toBeGreaterThan(world.cityReach)
    expect(parkReach(world.cityReach, world.spacing)).toBeGreaterThan(world.cityReach)
  })

  it('does not disturb where the buildings stand', () => {
    const without = buildWorld(user(), repos())
    const with_ = buildWorld(user(), repos(), contributions)
    expect(with_.buildings.map((b) => b.position)).toEqual(
      without.buildings.map((b) => b.position),
    )
  })
})
