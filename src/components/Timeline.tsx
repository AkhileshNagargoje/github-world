interface TimelineProps {
  visible: boolean
  playing: boolean
  /** Position through the time-lapse, 0..1. */
  progress: number
  year: number
  fromYear: number
  toYear: number
  onPlayPause: () => void
  onScrub: (progress: number) => void
  onExit: () => void
}

/**
 * Scrubber for the city's time-lapse: play it through, or drag to a year and
 * see what the profile looked like then.
 */
export default function Timeline({
  visible,
  playing,
  progress,
  year,
  fromYear,
  toYear,
  onPlayPause,
  onScrub,
  onExit,
}: TimelineProps) {
  if (!visible) return null
  return (
    <div className="timeline" role="group" aria-label="City time-lapse">
      <button
        className="timeline-play"
        onClick={onPlayPause}
        aria-label={playing ? 'Pause' : 'Play'}
        title={playing ? 'Pause' : 'Play'}
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <span className="timeline-year" aria-live="off">
        {year}
      </span>
      <input
        className="timeline-range"
        type="range"
        min={0}
        max={1000}
        value={Math.round(progress * 1000)}
        onChange={(e) => onScrub(Number(e.target.value) / 1000)}
        aria-label={`Year, ${fromYear} to ${toYear}`}
      />
      <button className="timeline-exit" onClick={onExit} aria-label="Show the whole city">
        ✕
      </button>
    </div>
  )
}
