# GitHub World

**Type any GitHub username and explore that profile as a low-poly 3D city.**

The more active and celebrated the account, the bigger and richer its world. Repos become buildings — height = code size, stars = a gold spire, recent activity = lit windows and a construction crane. The top repo becomes a landmark monument in the city center.

Built with React + Vite + TypeScript and [react-three-fiber](https://github.com/pmndrs/react-three-fiber). No API keys, no backend — it reads GitHub's public REST API straight from the browser.

---

## How GitHub stats map to the world

| GitHub stat | World effect |
| --- | --- |
| Code size | Building **height** — more code = taller. Exact bytes of source with a token; without one, GitHub's repo-size figure, which counts committed images and lockfiles too |
| Stars | Gold **spire** on the roof — taller = more stars |
| Forks | An **annex** behind the building — a workshop for the copies others took away (3+ forks) |
| Recent commits | **Window glow** — brighter when actively worked on |
| Pushed within last 60 days | Construction **crane** on the roof ("under construction") |
| Archived / stale repo | Dark windows ("finished building") |
| Highest-scoring repo | **Landmark** — centered, extra height, balconies, beacon |
| Followers + total stars | **Prosperity** — overall city brightness, greenness, scale |
| Contributions (last year) | **Park** on the south edge — the calendar planted as beds, one per day (needs a token) |

Forked repos are excluded so the city reflects your own work.

### What makes a building tall

Building height is driven by a **composite significance score** — tunable via `SIGNAL_WEIGHTS` in `src/lib/github.ts`. By default it's 100% code size (repo KB), rewarding projects you actually built. Change the weights to blend in stars, recency, or engagement.

| Signal | Default weight | What it rewards |
| --- | --- | --- |
| **Code size** | **1.0** | How much you actually built |
| Recency | 0.0 | Projects you're actively pushing to |
| Stars | 0.0 | Social popularity |
| Engagement | 0.0 | Forks + watchers + open issues |

Heights are normalized relative to your biggest project, so the city looks well-proportioned whether an account has 3 repos or 300.

### Visual language

- **Building color**: monochrome (light near-whites) — language color appears only as a dot in the info panel
- **Layout**: a city grid on an island — repos front the street on both kerbs, square to the kerb, biggest project claiming the most central plot
- **Roads**: evenly spaced avenues and streets running straight in both directions, every crossing a four-way intersection, each street drawn as asphalt with a dashed centerline and a driveway from every building
- **Trees**: street-side trees + random groves + dedicated park zones (green patches)
- **Streetlights**: one beside every building, glow brighter at night
- **Day/night toggle**: night mode adds stars, bloom post-processing, and glowing windows/lamps/spires

## Controls

- **Drag** — orbit the camera
- **Scroll / pinch** — zoom
- **Click a building** — see the repo name, size, stars, forks, language, and a link
- **Click empty ground** — deselect
- **? button (top bar)** — legend explaining the visual language
- **🌙/☀️ button** — toggle day/night
- **⏱ button** — play the city's history, or scrub to any year
- **📸 button** — save the city as a PNG, captioned with the profile's numbers
- **🔗 button** — copy a link to this city
- **🔑 button** — add a GitHub token (lifts the 60/hour rate limit, unlocks the contributions park)

## Quick start

Requires **Node 18+**.

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173) and enter a username. It loads `AkhileshNagargoje` by default.

### Build for production

```bash
npm run build      # outputs to dist/
npm run preview    # serve the production build locally
```

## Deploy

The app is fully static — any static host works.

### Vercel

Import the repo at [vercel.com/new](https://vercel.com/new). Framework preset **Vite** is auto-detected:
- Build command: `npm run build`
- Output directory: `dist`

### GitHub Pages

1. Push to GitHub.
2. In **Settings → Pages**, set the source to **GitHub Actions**.
3. The workflow at `.github/workflows/deploy.yml` handles the rest.

## GitHub API rate limits

Unauthenticated requests are limited to **60 per hour per IP**. Each profile load = ~1–3 requests. If you hit the limit, the app falls back to a cached version if available.

## Project structure

```
src/
  components/
    Building.tsx       # one repo → one building (box, windows, spire, crane, signage)
    Ground.tsx         # island landmass + surrounding water
    CityDecor.tsx      # roads, trees, parks, streetlights
    Scene.tsx          # Canvas, lights, sky, camera, bloom
    Legend.tsx         # "how to read the city" panel
    UsernameInput.tsx  # the search box
    InfoPanel.tsx      # selected-repo details card
    ProfileBadge.tsx   # user overview card
  lib/
    github.ts          # REST fetch + mapping of stats → World model
    languageColors.ts  # linguist language → hex color
    buildingTextures.ts # procedural window textures
    groundTexture.ts   # procedural grass texture
  types.ts             # GitHub + World type definitions
  App.tsx              # state, data loading, layout
  main.tsx             # React entry point
  index.css            # UI chrome styling
```

## Key tunables

| Want to change... | File |
|---|---|
| What makes buildings tall | `SIGNAL_WEIGHTS` in `src/lib/github.ts` |
| Building color scheme | `REPO_SHADES` in `src/lib/github.ts` |
| Block size / how spread out the city is | `spacing` and `block` in `streetNetwork()` (`src/lib/github.ts`) |
| Street width | `ROAD_WIDTH_RATIO` in `src/lib/github.ts` |
| Window glow curve | `windowLightLevel()` in `github.ts` |
| Bloom strength | `<Bloom>` props in `Scene.tsx` |
| Day/night lighting | `sunIntensity` / `ambientIntensity` in `Scene.tsx` |
| Road/tree density | `CityDecor.tsx` |
| Island shape | `islandGeo` noise in `Ground.tsx` |
| Cache freshness | `CACHE_FRESH_MS` in `github.ts` |
| Max repos fetched | `maxRepos` in `fetchWorld()` |

## License

[MIT](./LICENSE)
