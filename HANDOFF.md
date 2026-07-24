# GitHub World — Project Handoff

**Status as of:** 2026-07-24
**Location:** `D:\github worlld`
**Not yet a git repo.** This is the single most important action item — see [Immediate next steps](#immediate-next-steps).

This document exists so a new session (or a new person) can pick this project
up with zero prior context. It covers what the app is, how it works, every
major design decision and *why* it was made, what's polished, what's rough,
and what to do next.

---

## 1. What this is

**GitHub World**: type any GitHub username, see their public profile rendered
as an explorable low-poly 3D world. Drag to orbit, scroll to zoom, click a
building for repo details. No backend — it's a static React app that calls
GitHub's public REST API directly from the browser (no auth token needed for
public data, but see [rate limits](#8-known-issues--rate-limits)).

**Stack:** React + Vite + TypeScript, react-three-fiber + drei (Three.js),
`@react-three/postprocessing` for bloom. Deployable free on Vercel or GitHub
Pages (nothing is deployed yet — still `localhost:5173` only).

**Run it:**
```bash
npm install
npm run dev
```
Opens at `http://localhost:5173`. Loads `AkhileshNagargoje` by default, or use
`?u=<username>` in the URL (e.g. `http://localhost:5173/?u=torvalds`).

**Dev launch config:** `.claude/launch.json` runs `npm run dev -- --port 5173
--strictPort` — used by the Claude Code browser-preview tool, not needed for
normal use.

---

## 2. How a profile becomes a world (the core mapping)

This is the heart of the app: `src/lib/github.ts`, function `buildWorld()`.
**Every visual property below was the result of an explicit conversation with
the user (Akhilesh) — don't casually change these without re-reading section
5 (design history), because most of them were arrived at by trying something
else first and being told it was wrong.**

| Signal | Drives |
|---|---|
| Repo code size (KB) | Building **height** (see `SIGNAL_WEIGHTS`, currently 100% code size) |
| Stars | Gold **spire** on the roof (taller = more stars) + a golden **ground halo** (radius = stars + forks) |
| Forks | Contributes to footprint/halo |
| How recently pushed | **Window light** (0..1) — how brightly the building's windows glow. Archived repos → nearly dark ("finished"). This is the "activity = light" concept, most visible at night. |
| Pushed within last 60 days | A construction **crane** on the roof ("under construction"), unless it's the landmark |
| Repo name | Mounted as **facade signage** (drei `<Text>`) on the front and back faces, like real building signage |
| Highest-scoring repo (by the code-size score) | The **landmark** — centered at world origin, square footprint, extra height, balconies, an octahedron beacon |
| Followers + total stars (log-scaled) | **Prosperity** (0–1) — brightness of lighting, greenness of ground, city scale |
| Account age, repo count | Indirectly affects city size |

**Placement:** buildings are **NOT** on a grid. They're randomly scattered
across a disk (`scatterPositions()`, rejection-sampled so they don't overlap),
seeded deterministically per-username (`strSeed(user.login)`), with the
landmark pinned to the center. This was a deliberate, hard-won decision — see
section 5.

**Color:** buildings are **monochrome** (light near-white shades,
`REPO_SHADES` in `github.ts`), NOT colored by programming language anymore.
The real language color still appears as a small legend dot in the info panel
(`InfoPanel.tsx`, via `colorForLanguage()`). This was also a deliberate
reversal — see section 5.

**Significance score** (`SIGNAL_WEIGHTS` in `github.ts`) is a **tunable dial**,
not a hardcoded rule:
```ts
export const SIGNAL_WEIGHTS = {
  codeSize: 1.0,   // how much you actually built — currently the only signal
  recency: 0.0,     // how recently pushed
  stars: 0.0,       // popularity
  engagement: 0.0,  // forks + watchers + issues
}
```
Change these to change what makes a building tall. This exists because the
user's real complaint was: *"my biggest project (Canyeen Pro) has 0 stars, so
it was a tiny building, while a random 1-star to-do app towered over it."*
Switching height to code-size-only fixed that immediately and was verified
against the user's real repos before shipping.

---

## 3. File map

```
src/
  types.ts                  World / Building / GitHubUser / GitHubRepo types
  main.tsx                  React entry point
  App.tsx                   Top-level state: fetch, cache, ?u= URL sync, day/night toggle
  index.css                 All UI chrome styling (glassmorphism panels, toasts, etc.)

  lib/
    github.ts                THE CORE LOGIC. Fetch + buildWorld() (stat→world mapping),
                              scatter placement, significance scoring, localStorage cache
    languageColors.ts        GitHub linguist color table (used only for the info-panel legend dot)
    buildingTextures.ts      Procedural window texture (2 shared canvas textures, cloned per building)
    groundTexture.ts         Procedural subtle grass/mottling texture for the ground

  components/
    Scene.tsx                Canvas, camera, lights, day/night, Sky/Stars, Bloom postprocessing
    Ground.tsx                The island landmass + surrounding water
    CityDecor.tsx             Roads (MST-connected network), cars, trees, streetlights — NO filler buildings
    Building.tsx               One repo → one building: box + windows + door + spire + halo +
                                crane + landmark balconies + facade name signs
    UsernameInput.tsx         The search box
    InfoPanel.tsx              Selected-building detail card (stars, forks, size, language, link)
    ProfileBadge.tsx           Bottom-left user summary card
```

**No test suite exists.** Verification throughout this project was done via
`tsc --noEmit`, `npm run build`, checking the browser console for runtime
errors, and — critically — **computing the real scoring/placement logic in
plain Node against live GitHub API data** to sanity-check before showing the
user (see the `curl | node -e` patterns used repeatedly in this session; grep
the conversation history for these if you need to re-verify a change).

---

## 4. Everything that's implemented (as of this handoff)

- ✅ Fetch profile + non-fork repos from GitHub REST API (`src/lib/github.ts`)
- ✅ Significance-score-based building height (code size weighted; tunable)
- ✅ Random scattered placement, landmark centered, deterministic per user
- ✅ Monochrome buildings with gold spire (stars) + gold ground halo (stars+forks)
- ✅ Procedural windows with activity-based interior light (brighter = more
  recently active; archived ≈ dark)
- ✅ Facade-mounted repo name signage (front + back faces)
- ✅ Landmark gets balconies + beacon; active non-landmark repos get a crane
- ✅ Island landmass with surrounding water (irregular deterministic coastline)
- ✅ Road network connecting all buildings (minimum spanning tree + nearest
  neighbor, so it's fully connected, not fragmented) — sidewalk + asphalt +
  dashed centerline, like Cities: Skylines
- ✅ Parked cars in road lanes (colored, oriented) — **not animated yet**
- ✅ Trees: grove clusters + street-side trees, avoid building footprints
- ✅ Streetlight beside every building
- ✅ Day/night toggle (🌙/☀️ button in the top bar) — night mode: dark sky +
  stars, moonlight, much brighter window/lamp/spire emissive intensity, bloom
  post-processing (`@react-three/postprocessing`) tuned separately for
  day (subtle) vs night (strong, but tuned to avoid blow-out on bright towers)
- ✅ Click a building → info panel (name, size, stars, forks, language, link)
- ✅ Orbit camera (drei `OrbitControls`), soft shadows (`SoftShadows`)
- ✅ `?u=username` shareable permalink, synced via `history.replaceState`
- ✅ **localStorage caching**: fresh (<15 min) cache loads instantly with zero
  network calls; on fetch failure (rate limit, offline) falls back to stale
  cache with a "showing cached version" notice instead of a dead-end error
- ✅ MIT LICENSE, `.gitignore`, GitHub Pages deploy workflow
  (`.github/workflows/deploy.yml`)
- ⚠️ **README.md is STALE** — it still describes the old design (star-based
  height, language-colored buildings, grid layout, filler-city buildings).
  None of that matches the current app. **Needs a rewrite before this is
  genuinely "open source ready."** This is probably the single most
  actionable leftover task.

---

## 5. Design history — what was tried, what was rejected, and why

This app went through several complete redesigns based on user feedback. If
you're tempted to "improve" something, **read this first** — several
approaches below look reasonable in isolation but were explicitly rejected
after being shown to the user.

1. **v0.1: stars = height, language = color, grid layout.** This was the
   original spec and worked, but the user's real complaint was that a project
   with substantial code but 0 stars (Canyeen Pro) was dwarfed by a trivial
   1-star to-do app. **Fixed by switching height to a tunable
   `SIGNAL_WEIGHTS` score, defaulted to 100% code size.**

2. **Single-number height hid information.** The user pointed out that a
   project can be "big but not popular" or "small but popular," and one
   number can't show both. **Fixed by splitting into independent visual
   channels**: height/footprint = code size, gold spire + halo = stars/forks,
   window glow = recent activity. This is the current, kept design.

3. **Windows/interior detail were added** because the user wanted the city to
   feel like a real city, with light from windows conveying something about
   the project (this is the origin of the "activity = window light" idea,
   which survived every subsequent redesign).

4. **Grid layout → rejected repeatedly, in three different forms:**
   - First a uniform square grid (one building per cell + road between every
     cell) — user: **"it still looks like a grid."**
   - Then large city blocks with buildings packed via BSP-subdivided lots —
     looked better in the dense center but the **surrounding empty square
     lattice over bare ground** was still a giveaway. User: **"make it random,
     not a square grid."**
   - Then an irregular-block version (varied block sizes, circular boundary
     clip) — better, but once combined with **filler buildings** (hundreds of
     generic background buildings to create density), the user said it
     specifically looked like "a grid" again (1 building per grid cell was
     the actual bug in that pass) and separately that it didn't read as a
     real city.

5. **Filler/background buildings (non-repo, decorative) → added, then
   explicitly removed at the user's request.** The user's exact instruction:
   *"remove that extra building you added and random place main building
   anywhere some at edge some anywhere."* This was a firm decision: **no
   fake/filler buildings, ever** — every building on screen must correspond to
   a real repo. Don't reintroduce filler without asking first.

6. **After filler was removed, roads (point-to-point building-to-building,
   just nearest-neighbor) looked like a "network graph / molecule," not a
   city.** This was called out honestly by the assistant itself, and the user
   was offered a choice: (a) filler done right, (b) compact grid downtown
   repos-only, (c) keep scattered + polish. **User chose (c): keep the
   scattered layout, just polish it.** This is the final, current layout
   philosophy — don't relitigate it without the user explicitly reopening the
   density question.

7. **Cities: Skylines was given as a visual reference.** In response, roads
   were upgraded from a flat colored bar to sidewalk + asphalt + dashed
   centerline layers, cars were added, and trees were made to line the
   streets. This is the current road rendering (`CityDecor.tsx`).

8. **Rooftop name labels, first tried as floating billboarded text above each
   building** — user said this was good but wanted them **on the building**
   like real signage (referenced a "Four Points by Sheraton" rooftop sign
   photo). **Fixed by mounting `<Text>` flat on the front and back facades**
   instead of floating above (current `FacadeSign` component in
   `Building.tsx`).

9. **Day/night + bloom added** — night mode was very well received ("this is
   the best the whole thing has looked"). Two issues were flagged and fixed:
   the brightest towers were blowing out to solid white under bloom (fixed by
   raising `luminanceThreshold` and lowering `intensity`/emissive multipliers
   — see `Scene.tsx` and `Building.tsx`), and the night ground was "too
   black" (fixed by lightening ambient/hemisphere intensities and the ground's
   night color).

10. **Island + water added** in response to "add terrain height or water/lake
    park things" — user picked water first. Implemented as an irregular
    deterministic coastline (`ShapeGeometry`, noise-perturbed polygon) with a
    separate water plane below it. **Not yet done:** true reflections,
    rolling terrain, parks — these were explicitly deferred, see section 6.

**Takeaway pattern:** the user reacts very concretely to screenshots and will
tell you exactly what's wrong ("hexagon in the middle," "roads not
connected," "ground too black"). When something looks off, trust that
feedback over any aesthetic argument for why the current approach should
work — it's been wrong multiple times in this project despite reasonable
justifications each time.

---

## 6. What's next / open threads

In the user's own stated priority order, most recent first:

1. **Terrain & water polish** (mid-conversation, not finished):
   - Water is currently a flat plane with material reflectivity tricks, not
     true reflections. User asked about this as a future option.
   - **Rolling terrain / hills** — not implemented. Would need buildings and
     roads to sample terrain height (currently everything assumes flat
     ground at y=0).
   - **Parks** — not implemented as a distinct zone; only scattered tree
     groves exist today.
   - **Districts by language** — floated as an idea (color-tint ground by
     the dominant language in that area) but not built.
   - Beaches/cliff edge for the island were mentioned as a nice-to-have.

2. **Animated traffic** — cars currently sit static in lanes. The user has
   been offered this multiple times but hasn't asked for it yet. Would need a
   `useFrame` loop moving cars along their road segment.

3. **A legend / "how to read this" UI panel** — offered, not yet built.
   Currently a first-time viewer has no way to know that spire=stars,
   glow=activity, etc. without being told.

4. **README rewrite** — see section 4, this is stale and should be fixed
   before treating the repo as genuinely "ready for open source."

5. **Not yet deployed anywhere.** No Vercel/Pages deployment has been done.
   The GitHub Pages Actions workflow exists (`.github/workflows/deploy.yml`)
   but has never run because there's no git remote yet.

---

## 7. Immediate next steps (do these first in a new session)

1. **`git init` + first commit.** This is not a git repository yet. Until
   this happens, **all of this work exists only on this local machine** with
   no history and no backup. This is the single highest-priority action.
   ```bash
   git init
   git add -A
   git commit -m "Initial commit: GitHub World v0.1"
   ```
2. Push to a GitHub remote, then either:
   - Import to Vercel (auto-detects Vite; build command `npm run build`,
     output `dist`), or
   - Enable GitHub Pages via Actions (workflow already exists) — set
     Settings → Pages → Source → GitHub Actions.
3. Rewrite `README.md` to match the actual current app (see section 4) —
   it currently describes a design that was replaced twice.
4. Re-verify GitHub API rate limit behavior in production (60 req/hr
   unauthenticated — see section 8) since Vercel/Pages will have a different,
   shared-by-visitors IP situation for serverless preview but each *browser*
   still calls the API directly client-side, so this is per-visitor, not
   shared — should be fine, but worth confirming once deployed.

---

## 8. Known issues & rate limits

- **GitHub API: 60 unauthenticated requests/hour per IP.** Each profile load
  = up to 3 requests (user + up to 2 pages of repos at 100/page, capped at
  150 repos total via `fetchWorld(username, maxRepos = 150)`). This was hit
  directly during development from testing many profiles back-to-back — the
  app's rate-limit message and the new caching fallback (section 4) both
  exist specifically because of this. **If you see the rate-limit toast
  during testing, that's expected — wait ~1hr or use a cached/previously-seen
  username.**
- **Bundle size**: ~1.2 MB JS (gzip ~340KB) after adding
  `@react-three/postprocessing`. Not code-split. Fine for a demo, worth
  addressing (dynamic import for postprocessing, or accept it) before a real
  public launch.
- **No automated tests.** All verification has been manual: `tsc --noEmit`,
  `npm run build`, browser console checks, and outside-the-app Node scripts
  computing the scoring/placement math against live API data to sanity-check
  logic before presenting it.
- **Screenshots**: throughout this project, the assistant could not reliably
  capture screenshots via its own tooling (the embedded browser pane
  intermittently fails to composite frames) — verification instead relied on
  the user manually screenshotting and describing what they saw. If picking
  this up in a fresh session with the same limitation, expect to lean on the
  user for visual confirmation, and consider it a high-value thing to fix or
  work around if tooling allows.
- **`localStorage` cache** has no size cap or eviction — for a demo project
  this is fine (a handful of usernames at most per browser), but worth a TTL
  cleanup if this gets real traffic.

---

## 9. Quick reference: key tunables

| Want to change... | Edit |
|---|---|
| What makes buildings tall | `SIGNAL_WEIGHTS` in `src/lib/github.ts` |
| Building color scheme | `REPO_SHADES` in `src/lib/github.ts` |
| How spread out / dense the scatter is | `cityRadius`, `minDist` in `buildWorld()` (`github.ts`) |
| Window "activity glow" curve | `windowLightLevel()` in `github.ts` |
| Bloom strength / blow-out threshold | `<Bloom>` props in `Scene.tsx` (separate day vs night values) |
| Day/night lighting levels | `sunIntensity` / `ambientIntensity` in `Scene.tsx` |
| Road/car/tree density | `CityDecor.tsx` (`treeTarget`, car-per-road-length, MST + nearest-neighbor edges) |
| Island shape | `islandGeo` noise coefficients in `Ground.tsx` |
| Cache freshness window | `CACHE_FRESH_MS` in `github.ts` (currently 15 min) |
| Max repos fetched per user | `maxRepos` default in `fetchWorld()` (currently 150) |

---

*End of handoff. If you're a new Claude session reading this: read section 5
before changing the layout, color scheme, or adding filler buildings — those
are the three things that have been explicitly relitigated and settled
multiple times already.*
