# GitHub World — Project Handoff

**Status as of:** 2026-07-28
**Live:** https://akhileshnagargoje.github.io/github-world/
**Repo:** https://github.com/AkhileshNagargoje/github-world (deploys on every push to `main`)

This document exists so a new session — or a new person — can pick the project
up cold. It covers what the app is, the decisions that are settled, and the
traps that have already cost time.

---

## 1. What this is

Type any GitHub username and see that profile as an explorable low-poly 3D
city. Static React app, no backend: it calls GitHub's public API straight from
the browser.

**Stack:** React + Vite + TypeScript, react-three-fiber + drei,
`@react-three/postprocessing` for bloom and ambient occlusion, vitest for the
layout invariants.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 93 tests, all pure — no browser needed
npm run build
```

`?u=<username>` loads a profile; `?u=<username>&repo=<name>` opens on one
building with the camera on it.

---

## 2. How a profile becomes a city

All of this lives in `src/lib/github.ts`, in `buildWorld()`.

| Signal | Drives |
|---|---|
| Bytes of code | Building **height**. Real source bytes with a token, else GitHub's disk-size figure |
| Stars | A gold **spire**, but only on the best-starred ~15% of repos |
| Forks | An **annex** behind the building (3+ forks) |
| Last push | **Window light**, and a **crane** if pushed within 60 days |
| Archived | Windows nearly dark |
| Biggest repo by code | The **landmark**: extra height, balconies, a beacon |
| Followers + stars | **Prosperity** — lighting, ground colour, city scale |
| Repo creation dates | The **time-lapse** |
| Contributions (token only) | The **park** off the south edge |

**Height is measured in code, not repo size.** GitHub's REST `size` field is the
whole repository on disk: one of Akhilesh's projects is 1,871 KB on disk but
104 KB of code — the rest is photographs — while another is 118 KB on disk and
195 KB of code. The disk figure ranked the photo album nearly twice as tall.
Real bytes come from the languages API, which REST only exposes one repo at a
time (fatal at 60 requests/hour), so it goes through GraphQL with the token.

---

## 3. Settled decisions — do not relitigate without asking

1. **The layout is a plain grid.** Straight avenues and streets, four-way
   crossings, plots evenly spaced, buildings square to the kerb. This replaced
   three organic attempts in one day — scattered blocks, packed blocks, and a
   jittered street graph — each of which read as "boxes sprinkled on a mesh" in
   screenshots. The user's words: *"just keep normal city grid straight roads
   interconnection."* An earlier version of this document advised the opposite;
   that advice was wrong and cost hours.
2. **No filler buildings.** Every building on screen is a real repo.
3. **Monochrome buildings.** Language colour appears only as a dot in the info
   panel.
4. **No cars.** Asked for explicitly.
5. **No gold halos on the ground.** Tried, disliked, removed.
6. **No `Co-Authored-By: Claude` trailers in commits.** One such commit put
   "claude" in the repo's Contributors sidebar, and removing it needed a
   force-push, deleted deployments, and finally deleting and recreating the
   whole repository — GitHub keeps force-pushed commits alive for up to 30 days.

---

## 4. Traps that have already cost time

- **Bump `CACHE_PREFIX` whenever the World shape or the layout changes.**
  `src/lib/github.ts` caches a fully built World in localStorage. Forget this
  and browsers keep replaying the old city under new code — reloading cannot
  clear it. This has bitten twice; it is currently `v19`.
- **A fresh cache is served with zero network calls**, so anything that depends
  on new credentials must force a refetch. Saving a token does this now.
- **Run the tests.** `npm test` covers the invariants that make a city
  readable: one connected street network, a street for every building, a
  driveway to every kerb, nothing standing in the road, nothing overlapping —
  annexes included. Every layout change so far that looked fine by eye broke at
  least one of them.
- **The GraphQL features need a classic token with `read:user`.** Fine-grained
  tokens are refused. Without a token the park and real code sizes are simply
  absent, which is by design.

---

## 5. What is not done

- **`og:image` is unset**, so shared links unfurl as bare text. Needs a
  screenshot committed to `public/` and two meta tags. The 📸 button produces a
  suitable image.
- **Framerate has never been measured** on a 150-repo city. Quality adapts by
  device and by drei's `PerformanceMonitor`, but nobody has watched the number.
- **Buildings are not instanced.** Each is its own mesh plus a text sign.
- **The bundle is ~1.15 MB** (three.js), with postprocessing split out.
- **The default profile is a small city**, so a first-time visitor sees a
  village rather than something impressive.

---

## 6. File map

```
src/
  lib/
    github.ts            REST + GraphQL fetch, buildWorld(), the grid layout, cache
    timeline.ts          time-lapse maths: what has been built by a given moment
    quality.ts           device tier -> render settings
    contributionPark.ts  geometry of the contributions park, shared with the layout
    postcard.ts          canvas -> captioned PNG
    buildingTextures.ts  procedural windows, shared across buildings by tiling
    layout.test.ts       city invariants across 1..150 repos
    contributions.test.ts GraphQL paths, mocked; code-size ranking
  components/
    Scene.tsx            canvas, lights, camera, timeline driver, focus camera
    Building.tsx         one repo: tower, roof, annex, spire, crane, sign
    CityDecor.tsx        roads, trees, parks, streetlights, night light pools
    ContributionPark.tsx the calendar as planted beds
    Ground.tsx           island, beach shelf, water
    Effects.tsx          SSAO + bloom, lazily loaded
    Timeline.tsx         the scrubber
    TokenPanel.tsx       optional GitHub token
```
