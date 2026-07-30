import { describe, expect, it } from 'vitest'
import { ROAD_WIDTH_RATIO, buildWorld } from './github'
import { growthAt, timelineRange, worthIntroducing } from './timeline'
import type { CityRoad, GitHubRepo, GitHubUser, World } from '../types'

// These are the invariants that make a city readable: every street reachable
// from every other, every building fronting one, nothing standing in the road
// and nothing overlapping its neighbour. They were checked by hand for a long
// time, which is exactly how a stale-layout bug reached the browser twice.

function makeUser(login: string, followers = 500): GitHubUser {
  return {
    login,
    name: login,
    avatar_url: '',
    html_url: '',
    bio: null,
    public_repos: 0,
    followers,
    following: 0,
    created_at: '2012-01-01T00:00:00Z',
  }
}

/** Deterministic repo set with a realistic spread of size, stars and forks. */
function makeRepos(count: number, seed = 1): GitHubRepo[] {
  let state = seed >>> 0 || 1
  const rnd = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0xffffffff
  }
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `repo-${i}`,
    full_name: `user/repo-${i}`,
    html_url: '',
    description: null,
    language: 'TypeScript',
    stargazers_count: Math.floor(rnd() ** 4 * 20000),
    forks_count: Math.floor(rnd() ** 3 * 900),
    watchers_count: 0,
    open_issues_count: 0,
    size: Math.floor(rnd() ** 2.2 * 140000) + 5,
    archived: rnd() < 0.15,
    fork: false,
    // Spread creation across a decade so the time-lapse has something to show.
    created_at: `${2014 + (i % 12)}-0${1 + (i % 9)}-01T00:00:00Z`,
    pushed_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
  }))
}

interface Segment {
  a: [number, number]
  b: [number, number]
  length: number
}

function segments(roads: CityRoad[]): Segment[] {
  return roads
    .map(({ a, b }) => ({ a, b, length: Math.hypot(b[0] - a[0], b[1] - a[1]) }))
    .filter((seg) => seg.length >= 0.05)
}

function distanceToSegment(point: [number, number], seg: Segment): number {
  const dx = seg.b[0] - seg.a[0]
  const dz = seg.b[1] - seg.a[1]
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - seg.a[0]) * dx + (point[1] - seg.a[1]) * dz) / (seg.length * seg.length),
    ),
  )
  return Math.hypot(point[0] - (seg.a[0] + dx * t), point[1] - (seg.a[1] + dz * t))
}

/** Number of disconnected pieces the street network falls into. */
function roadComponents(segs: Segment[], roadWidth: number): number {
  const parent = new Map<string, string>()
  const key = (p: [number, number]) => `${Math.round(p[0] / 0.5)},${Math.round(p[1] / 0.5)}`
  const find = (k: string): string => {
    if (!parent.has(k)) parent.set(k, k)
    while (parent.get(k) !== k) {
      parent.set(k, parent.get(parent.get(k) as string) as string)
      k = parent.get(k) as string
    }
    return k
  }
  const union = (x: string, y: string) => {
    const rx = find(x)
    const ry = find(y)
    if (rx !== ry) parent.set(rx, ry)
  }
  for (const seg of segs) union(key(seg.a), key(seg.b))
  // Streets that touch without sharing an endpoint still connect.
  for (const seg of segs) {
    for (const other of segs) {
      if (seg === other) continue
      if (distanceToSegment(seg.a, other) < roadWidth) union(key(seg.a), key(other.a))
      if (distanceToSegment(seg.b, other) < roadWidth) union(key(seg.b), key(other.a))
    }
  }
  return new Set([...parent.keys()].map(find)).size
}

const SIZES = [1, 2, 3, 5, 9, 20, 44, 78, 150]

describe.each(SIZES)('a %i-repo city', (count) => {
  const world: World = buildWorld(makeUser(`user${count}`, count * 40), makeRepos(count))
  const roadWidth = world.spacing * ROAD_WIDTH_RATIO
  const segs = segments(world.roads)

  it('renders one building per repo', () => {
    expect(world.buildings).toHaveLength(count)
  })

  it('has a street network in a single connected piece', () => {
    expect(segs.length).toBeGreaterThan(0)
    expect(roadComponents(segs, roadWidth)).toBe(1)
  })

  it('gives every building a street to front', () => {
    for (const building of world.buildings) {
      const nearest = Math.min(...segs.map((seg) => distanceToSegment(building.position, seg)))
      const plotReach =
        Math.max(building.footprint, building.depth) * 0.5 + 0.85 + roadWidth + world.spacing
      expect(nearest).toBeLessThanOrEqual(plotReach)
    }
  })

  it('leaves a driveway from every plot to the kerb', () => {
    for (const building of world.buildings) {
      const toKerb = Math.hypot(
        building.position[0] - building.roadPoint[0],
        building.position[1] - building.roadPoint[1],
      )
      const driveway = toKerb - (building.depth + 0.85) * 0.5 - building.roadWidth * 0.5
      expect(driveway).toBeGreaterThan(0)
      expect(driveway).toBeLessThan(world.spacing * 2.5)
    }
  })

  it('never stands a building in the road', () => {
    for (const building of world.buildings) {
      const nearest = Math.min(...segs.map((seg) => distanceToSegment(building.position, seg)))
      expect(nearest).toBeGreaterThan(
        roadWidth * 0.5 + Math.max(building.footprint, building.depth) * 0.5 - 0.01,
      )
      // The annex sits behind, so it must clear the street too.
      expect(nearest).toBeGreaterThan(building.annex * 0.5)
    }
  })

  it('never overlaps two buildings, annexes included', () => {
    // The annex stands behind the building, so it is part of how much room a
    // plot actually takes up.
    const extent = (b: World['buildings'][number]) =>
      Math.max(b.footprint, b.depth + b.annex)
    for (let i = 0; i < world.buildings.length; i++) {
      for (let j = i + 1; j < world.buildings.length; j++) {
        const a = world.buildings[i]
        const b = world.buildings[j]
        const apart = Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1])
        expect(apart).toBeGreaterThanOrEqual((extent(a) + extent(b)) / 2)
      }
    }
  })

  it('fits the whole city on the island', () => {
    for (const building of world.buildings) {
      expect(Math.hypot(...building.position)).toBeLessThan(world.cityRadius)
    }
    for (const road of world.roads) {
      expect(Math.hypot(...road.a)).toBeLessThan(world.cityRadius)
      expect(Math.hypot(...road.b)).toBeLessThan(world.cityRadius)
    }
  })
})

describe('the world model', () => {
  it('is stable for the same user', () => {
    const first = buildWorld(makeUser('stable'), makeRepos(30))
    const second = buildWorld(makeUser('stable'), makeRepos(30))
    expect(second.buildings.map((b) => b.position)).toEqual(
      first.buildings.map((b) => b.position),
    )
  })

  it('lays out different users differently', () => {
    const a = buildWorld(makeUser('one'), makeRepos(30))
    const b = buildWorld(makeUser('two'), makeRepos(30))
    expect(b.buildings.map((x) => x.position)).not.toEqual(a.buildings.map((x) => x.position))
  })

  it('ignores forks, so the city is the user’s own work', () => {
    const repos = makeRepos(10)
    repos[0].fork = true
    repos[1].fork = true
    expect(buildWorld(makeUser('forker'), repos).buildings).toHaveLength(8)
  })

  it('makes the largest repo the landmark', () => {
    const repos = makeRepos(12)
    repos[7].size = 999999
    const world = buildWorld(makeUser('landmark'), repos)
    const landmarks = world.buildings.filter((b) => b.landmark)
    expect(landmarks).toHaveLength(1)
    expect(landmarks[0].name).toBe(repos[7].name)
  })

  it('sizes buildings by code, not by stars', () => {
    const repos = makeRepos(6)
    repos[0].size = 200000
    repos[0].stargazers_count = 0
    repos[1].size = 100
    repos[1].stargazers_count = 50000
    const world = buildWorld(makeUser('sizing'), repos)
    const big = world.buildings.find((b) => b.name === repos[0].name) as (typeof world.buildings)[0]
    const small = world.buildings.find((b) => b.name === repos[1].name) as (typeof world.buildings)[0]
    expect(big.height).toBeGreaterThan(small.height)
  })

  it('dims archived repos and lights recently pushed ones', () => {
    const repos = makeRepos(4)
    repos[0].archived = true
    repos[1].archived = false
    repos[1].pushed_at = new Date().toISOString()
    const world = buildWorld(makeUser('activity'), repos)
    const archived = world.buildings.find((b) => b.name === repos[0].name) as (typeof world.buildings)[0]
    const fresh = world.buildings.find((b) => b.name === repos[1].name) as (typeof world.buildings)[0]
    expect(archived.windowLight).toBeLessThan(0.1)
    expect(fresh.windowLight).toBeGreaterThan(0.8)
  })
})

describe('the time-lapse', () => {
  /** A world whose newest repo was created just now. */
  function worldCreatedToday(count = 10) {
    const list = makeRepos(count)
    list[0].created_at = new Date().toISOString()
    list[1].created_at = '2016-02-01T00:00:00Z'
    return buildWorld(makeUser('timelapse'), list)
  }

  it('finishes building every repo, including one created today', () => {
    const world = worldCreatedToday()
    const { from, to } = timelineRange(world)
    const atEnd = { active: true, playing: false, at: to, from, to }
    for (const building of world.buildings) {
      const grown = growthAt(atEnd, new Date(building.createdAt).getTime())
      // Not exactly 1: the clock moves between building the world and reading
      // the range. The bug this guards against left the newest repo at 0.97.
      expect(grown).toBeGreaterThan(0.999)
    }
  })

  it('shows nothing before the first repo existed', () => {
    const world = worldCreatedToday()
    const { from, to } = timelineRange(world)
    const atStart = { active: true, playing: false, at: from, from, to }
    for (const building of world.buildings) {
      expect(growthAt(atStart, new Date(building.createdAt).getTime())).toBe(0)
    }
  })

  it('shows the whole city whenever the time-lapse is off', () => {
    const world = worldCreatedToday()
    const off = { active: false, playing: false, at: 0, from: 0, to: 0 }
    for (const building of world.buildings) {
      expect(growthAt(off, new Date(building.createdAt).getTime())).toBe(1)
    }
  })

  it('skips the intro for a young profile, and plays it for a long history', () => {
    const young = buildWorld(
      makeUser('young'),
      makeRepos(6).map((r) => ({ ...r, created_at: '2026-03-01T00:00:00Z' })),
    )
    expect(worthIntroducing(young)).toBe(false)

    const veteran = buildWorld(
      makeUser('veteran'),
      makeRepos(20).map((r, i) => ({
        ...r,
        created_at: `${2012 + (i % 12)}-01-01T00:00:00Z`,
      })),
    )
    expect(worthIntroducing(veteran)).toBe(true)
  })
})

describe('forks', () => {
  it('gives a forked project an annex, and an unforked one none', () => {
    const list = makeRepos(8)
    list[0].forks_count = 0
    list[1].forks_count = 2
    list[2].forks_count = 40
    list[3].forks_count = 4000
    const world = buildWorld(makeUser('forks'), list)
    const annexOf = (name: string) =>
      world.buildings.find((b) => b.name === name)?.annex ?? -1

    expect(annexOf(list[0].name)).toBe(0)
    // Below the threshold: two forks is noise, not a signal.
    expect(annexOf(list[1].name)).toBe(0)
    expect(annexOf(list[2].name)).toBeGreaterThan(0)
    // More forks, bigger workshop — but bounded, so it never rivals the tower.
    expect(annexOf(list[3].name)).toBeGreaterThan(annexOf(list[2].name))
    expect(annexOf(list[3].name)).toBeLessThanOrEqual(2.2)
  })

  it('keeps the plot deep enough to hold the annex', () => {
    const list = makeRepos(6).map((r) => ({ ...r, forks_count: 500 }))
    const world = buildWorld(makeUser('forky'), list)
    for (const building of world.buildings) {
      const toKerb = Math.hypot(
        building.position[0] - building.roadPoint[0],
        building.position[1] - building.roadPoint[1],
      )
      expect(building.annex).toBeGreaterThan(0)
      // Front of the building to the kerb still clears the road.
      expect(toKerb - building.depth / 2).toBeGreaterThan(building.roadWidth * 0.5)
    }
  })
})
