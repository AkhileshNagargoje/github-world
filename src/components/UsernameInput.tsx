import { useState, type FormEvent } from 'react'

interface UsernameInputProps {
  initial?: string
  loading: boolean
  onSubmit: (username: string) => void
}

/** The floating search box for entering a GitHub username. */
export default function UsernameInput({
  initial = '',
  loading,
  onSubmit,
}: UsernameInputProps) {
  const [value, setValue] = useState(initial)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (trimmed && !loading) onSubmit(trimmed)
  }

  return (
    <form className="search" onSubmit={handleSubmit}>
      <input
        type="text"
        value={value}
        placeholder="Enter a GitHub username…"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-label="GitHub username"
        onChange={(e) => setValue(e.target.value)}
        disabled={loading}
      />
      <button type="submit" disabled={loading || !value.trim()}>
        {loading ? 'Building…' : 'Explore'}
      </button>
    </form>
  )
}
