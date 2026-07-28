import { useEffect, useState } from 'react'
import { getToken, setToken } from '../lib/github'

interface TokenPanelProps {
  visible: boolean
  onClose: () => void
  /** Called after saving, so the current city can be reloaded with the token. */
  onSaved: () => void
}

/**
 * Optional GitHub token. Without one the API allows 60 requests an hour per IP,
 * which a handful of profile loads uses up; with one it's 5,000. The token never
 * leaves this browser — it goes to localStorage and straight to api.github.com.
 */
export default function TokenPanel({ visible, onClose, onSaved }: TokenPanelProps) {
  const [value, setValue] = useState('')

  useEffect(() => {
    if (visible) setValue(getToken())
  }, [visible])

  if (!visible) return null

  const save = () => {
    setToken(value)
    onSaved()
    onClose()
  }

  const clear = () => {
    setToken('')
    setValue('')
    onSaved()
  }

  return (
    <div className="legend-panel" role="dialog" aria-label="GitHub token">
      <button className="legend-close" onClick={onClose} aria-label="Close">
        ✕
      </button>
      <h2>GitHub token</h2>
      <p className="legend-note">
        GitHub allows 60 requests an hour without one. A token raises that to
        5,000. It is stored only in this browser and sent only to
        api.github.com.
      </p>
      <input
        className="token-input"
        type="password"
        value={value}
        spellCheck={false}
        autoComplete="off"
        placeholder="ghp_… (classic token)"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        aria-label="GitHub personal access token"
      />
      <div className="token-actions">
        <button className="token-save" onClick={save}>
          Save
        </button>
        <button className="token-clear" onClick={clear}>
          Clear
        </button>
      </div>
      <p className="legend-note">
        Create one at{' '}
        <a
          href="https://github.com/settings/tokens/new?description=GitHub%20World"
          target="_blank"
          rel="noreferrer"
        >
          github.com/settings/tokens
        </a>{' '}
        — a <strong>classic</strong> token with <code>read:user</code> ticked.
        Fine-grained tokens are refused by the GraphQL API this uses for the
        contributions park and exact code sizes.
      </p>
    </div>
  )
}
