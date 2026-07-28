import type { Building } from '../types'
import { colorForLanguage } from '../lib/languageColors'

interface InfoPanelProps {
  building: Building
  onClose: () => void
}

/** Format a KB size into a compact human-readable string. */
function formatSize(kb: number): string {
  if (kb >= 1024 * 1024) return `${(kb / (1024 * 1024)).toFixed(1)} GB`
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`
  return `${kb} KB`
}

/** Details card shown when a building (repo) is selected. */
export default function InfoPanel({ building, onClose }: InfoPanelProps) {
  return (
    <div className="info-panel" role="dialog" aria-label={`${building.name} details`}>
      <button className="info-close" onClick={onClose} aria-label="Close">
        ×
      </button>

      <div className="info-title">
        {building.landmark && <span className="landmark-badge">★ Landmark</span>}
        <h2>{building.name}</h2>
      </div>

      {building.description && <p className="info-desc">{building.description}</p>}

      <div className="info-stats">
        {/* Code size drives the height, so that is what gets shown. Without a
            token it is the repo's disk size, which is all the REST API gives. */}
        <span
          title={
            building.codeKb === building.sizeKb
              ? 'Repo size on disk (drives building height)'
              : 'Code in this repo (drives building height)'
          }
        >
          📦 {formatSize(building.codeKb)}
        </span>
        <span title="Stars">⭐ {building.stars.toLocaleString()}</span>
        <span title="Forks">🍴 {building.forks.toLocaleString()}</span>
        {building.language && (
          <span title="Primary language" className="info-lang">
            <span
            className="lang-dot"
            style={{ background: colorForLanguage(building.language) }}
          />
            {building.language}
          </span>
        )}
        {building.active && <span className="info-active">🏗 Active</span>}
      </div>

      <a
        className="info-link"
        href={building.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open on GitHub ↗
      </a>
    </div>
  )
}
