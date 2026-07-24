interface LegendProps {
  visible: boolean
  onClose: () => void
}

const ITEMS = [
  { icon: '📐', label: 'Building height', desc: 'Repo code size — more code = taller' },
  { icon: '⭐', label: 'Gold spire', desc: 'Stars on the repo' },
  { icon: '🟡', label: 'Gold halo (ground)', desc: 'Stars + forks — popularity' },
  { icon: '💡', label: 'Window glow', desc: 'How recently the repo was pushed to' },
  { icon: '🏗️', label: 'Crane on roof', desc: 'Active — pushed within last 60 days' },
  { icon: '🏛️', label: 'Landmark (center)', desc: 'Highest-scoring repo — balconies + beacon' },
  { icon: '🌙', label: 'Night mode', desc: 'Bloom makes windows, spires & lamps glow' },
]

export default function Legend({ visible, onClose }: LegendProps) {
  if (!visible) return null
  return (
    <div className="legend-panel" role="dialog" aria-label="City legend">
      <button className="legend-close" onClick={onClose} aria-label="Close legend">
        ×
      </button>
      <h3>How to read the city</h3>
      <ul className="legend-list">
        {ITEMS.map((item) => (
          <li key={item.label} className="legend-item">
            <span className="legend-icon">{item.icon}</span>
            <div>
              <strong>{item.label}</strong>
              <span className="legend-desc">{item.desc}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
