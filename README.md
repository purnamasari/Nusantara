# Archipelago: Otherworld

A lightweight browser game: explore a fantastical **Bandung — The Blooming Highlands** on foot or by petal glider, find the five **Flora Spirits**, and awaken the **Petal Gate**.

Built with three.js, TypeScript, Vite and a small React overlay. Real geography provides the rough shape of the land; everything else is generated deterministically from a seed when the region loads.

- Design: [docs/GDD.md](docs/GDD.md)
- Technical plan, budgets and acceptance checklist: [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)

> **Terrain note.** This build uses a **synthetic stand-in heightmap** shaped like the Bandung basin. Real elevation data is waiting on a data-licence review (plan §6.5, decision D1). Landmarks are fictional.

## Play locally

Requires Node 22.18 or newer (the dev tools run `.ts` files directly).

```bash
npm ci
npm run dev        # http://localhost:5173
```

| Key | Action |
|---|---|
| W A S D | Move (flying: thrust, brake, strafe) |
| Mouse | Look / steer (click the game to lock the pointer) |
| Space | Jump · ascend while flying |
| C | Descend while flying |
| Shift | Sprint · boost |
| F | Take off / land |
| E | Collect a spirit · use the Petal Gate |
| Esc | Pause · close menus |
| F3 or \` | Debug panel (FPS, draw calls, position, lat/lon) |

Progress is saved in `localStorage` and survives reloads.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build into `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests (Vitest, Node) |
| `npm run budgets` | Fails if the production build exceeds the size budgets (plan §10.1) |
| `npm run build:e2e && npm run test:e2e` | Browser tests (Playwright, headless Chromium, test hooks enabled) |
| `npm run ci` | Everything above, in CI order |
| `npm run bake -- bandung --synthetic` | Regenerates the region heightmap (`public/regions/bandung/`) |

### Benchmarks

Open a **production** build (`npm run build && npm run preview`) with:

- `?bench=gen`: regenerates the region 11 times and reports per-stage timings.
- `?bench=frame`: flies a scripted 60 s camera path and reports frame-time median and p95.

Results are printed to the console and stored in `window.otherworldBench`. The targets in plan §10.4–10.5 apply to the reference machine (decision D4), not to headless CI.

## How it is built

```
src/lib        seeded hash/RNG/noise, maths, coded errors           (deterministic)
src/geo        geo ↔ grid ↔ world projection, heading convention    (+X east, +Y up, −Z north)
src/heightmap  heightmap codec + metadata schema (shared with tools)
src/content    region definitions (data only), registry, validation
src/terrain    R1–R7 pipeline, HeightField, biome colours, placement (pure, no three.js)
src/rules      collectibles, progression (derived), versioned save
src/bridge     UI store + command interface (useSyncExternalStore)
src/engine     three.js runtime: world, player, camera, systems
src/ui         React overlay (HUD, menus, screens)
tools/         dev-only: heightmap bake, GIS helpers, size budgets
```

- **One terrain truth.** A single `Float32Array` heightfield builds the mesh *and* answers every height and slope query. Both use the same triangle split, so collision matches what you see.
- **Lightweight.** The only runtime dependencies are `three`, `react` and `react-dom`. The game downloads no textures, models or audio; sound effects are synthesised. Region data is a 64 KB raw heightmap plus metadata.
- **Deterministic.** Named seed streams and golden-hash tests pin the generated terrain, colours and vegetation.

### Adding a region

1. Write `src/content/regions/<id>.ts` (bounds, seed, biome, landmarks, five collectibles, portal) and add it to the registry.
2. Run `npm run bake -- <id> --synthetic`. Real-data baking is gated until the licence review is signed off.
3. Add any new flora generators. Engine changes are not needed.

## Deployment

`.github/workflows/deploy.yml` publishes `main` to GitHub Pages once Pages is enabled (Settings → Pages → Source: GitHub Actions). `.github/workflows/ci.yml` runs every check on every push.
