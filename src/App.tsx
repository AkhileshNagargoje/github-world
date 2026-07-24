import { useCallback, useEffect, useState } from 'react'
import Scene from './components/Scene'
import UsernameInput from './components/UsernameInput'
import InfoPanel from './components/InfoPanel'
import ProfileBadge from './components/ProfileBadge'
import Legend from './components/Legend'
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

      <Legend visible={showLegend} onClose={() => setShowLegend(false)} />

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
