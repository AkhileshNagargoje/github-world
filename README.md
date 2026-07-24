# 🌆 GitHub World

**Type any GitHub username and explore that profile as a low-poly 3D city.**

The more active and celebrated the account, the bigger and richer its world.
Star-studded projects rise as skyscrapers, your most-starred repo becomes a
landmark monument in the center of town, and repos you've pushed to recently
are lit up and "under construction" with a little crane on top.

Built with React + Vite + TypeScript and
[react-three-fiber](https://github.com/pmndrs/react-three-fiber). No API keys,
no backend — it reads GitHub's public REST API straight from the browser.

---

## ✨ How GitHub stats map to the world

| GitHub stat | World effect |
| --- | --- |
| Total repos | Number of buildings in the city |
| Account age | How developed / sprawling the city feels |
| Followers + total stars | Overall size & "prosperity" (bright & lush vs. small & barren) |
| **Significance score** | **Building height (a substantial project → skyscraper)** |
| Forks on a repo | Building width / footprint |
| Primary language | Building color ([linguist](https://github.com/github/linguist) colors) |
| Recent commits | Building lit up + construction crane on top |
| Archived / stale repo | Finished, unlit building |
| Highest-scoring repo | Landmark monument in the city center |

Forked repos are excluded so the city reflects your own work.

### What makes a building grow

Building height (and which repo becomes the landmark) is driven by a **composite
significance score**, not raw stars — because at low star counts a throwaway repo
that got one star would otherwise tower over the project you actually poured work
into. The score blends log-scaled signals, each weighted in
[`src/lib/github.ts`](src/lib/github.ts) via `SIGNAL_WEIGHTS`:

| Signal | What it rewards | Default weight |
| --- | --- | --- |
| **Code size** (repo KB) | How much you actually built | **1.0** |
| Recency | Projects you're actively pushing to | 0.0 |
| Stars | Social popularity | 0.0 |
| Engagement | Forks + watchers + open issues | 0.0 |

Heights are then normalized **relative to your biggest project**, so the city
looks well-proportioned whether an account has 3 stars or 30,000. Tweak the
weights to change what stands out — e.g. bump `stars` back up for a
popularity-first world, or blend `codeSize` + `recency` to favor active,
substantial work.

## 🎮 Controls

- **Drag** — orbit the camera
- **Scroll / pinch** — zoom
- **Click a building** — see the repo name, stars, forks, language, and a link
- **Click empty ground** — deselect

## 🚀 Quick start

Requires **Node 18+**.

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173) and enter a
username. It loads `AkhileshNagargoje` by default so there's a city to explore
right away.

### Build for production

```bash
npm run build      # outputs to dist/
npm run preview    # serve the production build locally
```

## ☁️ Deploy

The app is fully static, so any static host works. `vite.config.ts` sets
`base: './'` so relative asset paths work at a root or a subpath.

### Vercel

Import the repo at [vercel.com/new](https://vercel.com/new). Framework preset
**Vite** is auto-detected:

- Build command: `npm run build`
- Output directory: `dist`

### GitHub Pages

1. Push to GitHub.
2. In **Settings → Pages**, set the source to **GitHub Actions**.
3. Add the workflow below (`.github/workflows/deploy.yml`) — it's included in
   this repo.

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

## ⚠️ GitHub API rate limits

Unauthenticated requests are limited to **60 per hour per IP**. That's plenty
for casual exploration. If you hit the limit, wait an hour or run behind a
lightweight proxy that attaches a token. The app surfaces a friendly message
when the limit is reached.

## 🗂 Project structure

```
src/
  components/
    Building.tsx      # one repo → one low-poly box (+ crane / landmark beacon)
    Ground.tsx        # the lawn; greener when the account is prosperous
    Scene.tsx         # Canvas, lights, sky, camera, OrbitControls
    UsernameInput.tsx # the search box
    InfoPanel.tsx     # selected-repo details card
    ProfileBadge.tsx  # user overview card
  lib/
    github.ts         # REST fetch + mapping of stats → World model
    languageColors.ts # linguist language → hex color
  types.ts            # GitHub + World type definitions
  App.tsx             # state, data loading, layout
  main.tsx            # React entry point
  index.css           # UI chrome styling
```

## 🛣 Roadmap

This is **v0.1**. Ideas for later:

- Roads / districts grouped by language
- Day–night cycle driven by commit activity
- Contribution-graph terrain
- Shareable permalinks (`/?u=username`)
- Optional token input to raise the rate limit

## 🤝 Contributing

Issues and PRs welcome. Keep the aesthetic **low-poly and fast** — clean and
intentional over high-fidelity.

## 📄 License

[MIT](./LICENSE)
