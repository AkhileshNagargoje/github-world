import type { World } from '../types'

/** Small overview card of the current user in a corner of the screen. */
export default function ProfileBadge({ world }: { world: World }) {
  const { user, buildings, totalStars, accountAgeYears, prosperity } = world
  const prosperityLabel =
    prosperity > 0.66 ? 'Thriving' : prosperity > 0.33 ? 'Growing' : 'Sprouting'

  return (
    <div className="profile-badge">
      <img src={user.avatar_url} alt="" width={48} height={48} />
      <div className="profile-meta">
        <a href={user.html_url} target="_blank" rel="noopener noreferrer">
          {user.name || user.login}
        </a>
        <span className="profile-login">@{user.login}</span>
        <div className="profile-stats">
          <span>{buildings.length} buildings</span>
          <span>⭐ {totalStars.toLocaleString()}</span>
          <span>{user.followers.toLocaleString()} followers</span>
        </div>
        <div className="profile-tags">
          <span>{accountAgeYears}y old</span>
          <span className="prosperity">{prosperityLabel}</span>
        </div>
      </div>
    </div>
  )
}
