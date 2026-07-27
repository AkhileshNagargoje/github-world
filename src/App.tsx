import { useCallback, useEffect, useRef, useState } from 'react'
import Scene from './components/Scene'
import UsernameInput from './components/UsernameInput'
import InfoPanel from './components/InfoPanel'
import ProfileBadge from './components/ProfileBadge'
import Legend from './components/Legend'
import TokenPanel from './components/TokenPanel'
import { downloadPostcard, renderPostcard } from './lib/postcard'
import Timeline from './components/Timeline'
import { emptyTimeline, timelineRange, yearAt } from './lib/timeline'
import { CACHE_FRESH_MS, fetchWorld, GitHubError, readCachedWorld } from './lib/github'
import type { Building, World } from './types'

const DEFAULT_USERNAME = 'AkhileshNagargoje'

/** Username from the `?u=` query param, if present. */
function usernameFromUrl(): string {
  const u = new URLSearchParams(window.location.search).get('u')
  return u?.trim() || DEFAULT_USERNAME
}

export default function App() {
  const [world, setWorld] = useState<World | null>(null)
  const [selected, setSelected] = useState<Building | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [username, setUsername] = useState(usernameFromUrl)
  const [night, setNight] = useState(false)
  const [showLegend, setShowLegend] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [shared, setShared] = useState(false)
  const [saving, setSaving] = useState(false)
  // Time-lapse state lives in a ref so playback doesn't re-render the city each
  // frame; `timelineTick` is bumped a few times a second just for the scrubber.
  const timeline = useRef(emptyTimeline())
  const [timelineOn, setTimelineOn] = useState(false)
  const [intro, setIntro] = useState(false)
  const [, setTimelineTick] = useState(0)
  const onTimelineTick = useCallback(() => setTimelineTick((n) => n + 1), [])

  const load = useCallback(async (name: string) => {
    setError(null)
    setStale(false)
    setSelected(null)
    setUsername(name)
    // Keep a shareable permalink in the URL bar (?u=username).
    const url = `${window.location.pathname}?u=${encodeURIComponent(name)}`
    window.history.replaceState(null, '', url)

    // Serve a fresh cached city instantly, no network round-trip needed.
    const cached = readCachedWorld(name)
    if (cached && Date.now() - cached.ts < CACHE_FRESH_MS) {
      setWorld(cached.world)
      return
    }

    setLoading(true)
    try {
      const w = await fetchWorld(name)
      setWorld(w)
      if (w.buildings.length === 0) {
        setError(`${w.user.login} has no public repositories to build a city from.`)
      }
    } catch (err) {
      // Fall back to a stale cached city rather than a dead end, e.g. when the
      // GitHub API rate limit (60 requests/hour, unauthenticated) is hit.
      if (cached) {
        setWorld(cached.world)
        setStale(true)
      } else {
        const message =
          err instanceof GitHubError
            ? err.message
            : 'Something went wrong fetching that profile.'
        setError(message)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  /** Save the city on screen as a PNG, captioned with the profile's numbers. */
  const savePostcard = useCallback(async () => {
    if (!world) return
    setSaving(true)
    try {
      const postcard = await renderPostcard(world)
      if (postcard) downloadPostcard(postcard)
      else setError('Could not capture the city — try again once it has rendered.')
    } finally {
      setSaving(false)
    }
  }, [world])

  /** Copy the permalink to this city, so a profile can be shared as a link. */
  const share = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setShared(true)
      window.setTimeout(() => setShared(false), 1800)
    } catch {
      // Clipboard can be blocked; the URL bar already holds the same link.
    }
  }, [])

  // A new profile means a new span of history — and the city introduces itself
  // by building from the first repo forward while the camera drifts around it.
  // Everything worth seeing here used to sit behind a button nobody pressed.
  useEffect(() => {
    if (!world) return
    const { from, to } = timelineRange(world)
    const calm =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    timeline.current = {
      active: !calm,
      playing: !calm,
      at: calm ? to : from,
      from,
      to,
    }
    setTimelineOn(!calm)
    setIntro(!calm)
  }, [world])

  /** Stop the intro and hand the city over, whole, to the viewer. */
  const endIntro = useCallback(() => {
    if (!intro) return
    setIntro(false)
    const state = timeline.current
    state.active = false
    state.playing = false
    state.at = state.to
    setTimelineOn(false)
    onTimelineTick()
  }, [intro, onTimelineTick])

  // The intro is over once playback reaches the present day.
  useEffect(() => {
    if (!intro) return
    const state = timeline.current
    if (state.active && !state.playing && state.at >= state.to) endIntro()
  })

  const playTimeline = useCallback(() => {
    setIntro(false)
    const state = timeline.current
    if (!state.active) {
      // Starting fresh: rewind to before the first repo existed.
      state.active = true
      state.at = state.from
    } else if (state.at >= state.to) {
      state.at = state.from
    }
    state.playing = !state.playing
    setTimelineOn(true)
    onTimelineTick()
  }, [onTimelineTick])

  const scrubTimeline = useCallback(
    (progress: number) => {
      setIntro(false)
      const state = timeline.current
      state.active = true
      state.playing = false
      state.at = state.from + (state.to - state.from) * progress
      onTimelineTick()
    },
    [onTimelineTick],
  )

  const exitTimeline = useCallback(() => {
    setIntro(false)
    const state = timeline.current
    state.active = false
    state.playing = false
    state.at = state.to
    setTimelineOn(false)
    onTimelineTick()
  }, [onTimelineTick])

  // Auto-load the URL's username (or the default) on first mount.
  useEffect(() => {
    load(usernameFromUrl())
  }, [load])

  return (
    <div className="app">
      {world && (
        <Scene
          world={world}
          night={night}
          timeline={timeline}
          onTimelineTick={onTimelineTick}
          intro={intro}
          onIntroCancel={endIntro}
          selectedId={selected?.id ?? null}
          onSelect={setSelected}
          onDeselect={() => setSelected(null)}
        />
      )}

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">🌆</span>
          <span className="brand-name">GitHub World</span>
        </div>
        <UsernameInput initial={username} loading={loading} onSubmit={load} />
        <button
          className="daynight"
          onClick={() => setNight((n) => !n)}
          aria-label={night ? 'Switch to day' : 'Switch to night'}
          title={night ? 'Switch to day' : 'Switch to night'}
        >
          {night ? '☀️' : '🌙'}
        </button>
        <button
          className="legend-btn"
          onClick={() => setShowLegend((v) => !v)}
          aria-label="Toggle legend"
          title="How to read the city"
        >
          ?
        </button>
        <button
          className="legend-btn"
          onClick={() => setShowToken((v) => !v)}
          aria-label="GitHub token"
          title="Add a GitHub token to lift the rate limit"
        >
          🔑
        </button>
        <button
          className="legend-btn"
          onClick={playTimeline}
          disabled={!world}
          aria-label="Play the city's history"
          title="Watch the city get built, repo by repo"
        >
          ⏱
        </button>
        <button
          className="legend-btn"
          onClick={savePostcard}
          disabled={!world || saving}
          aria-label="Save this city as an image"
          title="Save this city as an image"
        >
          {saving ? '…' : '📸'}
        </button>
        <button
          className="legend-btn"
          onClick={share}
          aria-label="Copy link to this city"
          title="Copy link to this city"
        >
          {shared ? '✓' : '🔗'}
        </button>
      </header>

      {world && !loading && <ProfileBadge world={world} />}

      {loading && (
        <div className="overlay">
          <div className="spinner" />
          <p>Building {username}'s city…</p>
        </div>
      )}

      {error && !loading && (
        <div className="toast error" role="alert">
          {error}
        </div>
      )}

      {stale && !loading && !error && (
        <div className="toast" role="status">
          Showing a cached version — GitHub API rate limit reached. Try again
          later for the latest data.
        </div>
      )}

      {selected && (
        <InfoPanel building={selected} onClose={() => setSelected(null)} />
      )}

      {world && (
        <Timeline
          visible={timelineOn}
          playing={timeline.current.playing}
          progress={
            (timeline.current.at - timeline.current.from) /
            Math.max(1, timeline.current.to - timeline.current.from)
          }
          year={yearAt(timeline.current.at)}
          fromYear={yearAt(timeline.current.from)}
          toYear={yearAt(timeline.current.to)}
          onPlayPause={playTimeline}
          onScrub={scrubTimeline}
          onExit={exitTimeline}
        />
      )}

      <Legend visible={showLegend} onClose={() => setShowLegend(false)} />

      <TokenPanel
        visible={showToken}
        onClose={() => setShowToken(false)}
        onSaved={() => load(username)}
      />

      {!world && !loading && !error && (
        <div className="overlay">
          <p>Enter a GitHub username to build a world.</p>
        </div>
      )}

      <footer className="hint">
        Drag to orbit · scroll to zoom · click a building
      </footer>
    </div>
  )
}
