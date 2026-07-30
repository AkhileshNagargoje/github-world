interface ExampleCitiesProps {
  /** Hidden once the visitor has looked at anything of their own choosing. */
  visible: boolean
  onPick: (username: string) => void
}

/**
 * A few cities worth seeing, offered on arrival.
 *
 * The app opens on its owner's profile, which is a handful of repos — a small
 * town, and a poor first impression of what the thing does. These are profiles
 * big enough to show a skyline, a long history and a full contributions park.
 */
const EXAMPLES = [
  { login: 'torvalds', note: 'the kernel' },
  { login: 'sindresorhus', note: '150 repos' },
  { login: 'gaearon', note: 'React' },
  { login: 'steipete', note: 'tall skyline' },
]

export default function ExampleCities({ visible, onPick }: ExampleCitiesProps) {
  if (!visible) return null
  return (
    <div className="examples">
      <span className="examples-label">Or visit</span>
      {EXAMPLES.map((example) => (
        <button
          key={example.login}
          className="example-chip"
          onClick={() => onPick(example.login)}
          title={`${example.login} — ${example.note}`}
        >
          {example.login}
        </button>
      ))}
    </div>
  )
}
