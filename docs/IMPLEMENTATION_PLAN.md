# Implementation Plan: Archipelago: Otherworld

This plan covers the MVP, the Bandung vertical slice described in [GDD.md](./GDD.md) §12. No code has been written yet; this document is the plan for review.

**Guiding rule:** *lightweight and easy to regenerate is more important than geographic accuracy.* Real geography only supplies the rough shape of the land. Everything else is generated procedurally from a seed at load time.

---

## 1. Lightweight budget

These are the hard limits for the MVP. If a feature does not fit them, it gets simplified or cut.

| Item | Budget | How we stay under it |
|---|---|---|
| Region data download | **≤ 100 KB** per region | One 256×256 8-bit grayscale PNG heightmap (~30–60 KB) plus a small JSON file |
| Textures / 3D models / audio files | **0** in the MVP | Vertex colours, geometry built from three.js primitives, and sound effects synthesised with WebAudio |
| JS bundle | ≤ 400 KB gzipped | Runtime deps limited to `three`, `react`, `react-dom` |
| Region generation at load | < 300 ms | One 256² heightfield and a seeded scatter. No workers needed at this size |
| Terrain | 1 mesh, ~130k triangles | 256×256 grid, no LOD or streaming in the MVP |
| Vegetation | ≤ 10k instances, ≤ ~100 draw calls total | `InstancedMesh` per species per 500 m cell, plus distance culling |
| Post-processing / shadows | None by default | Fog, gradient sky, and emissive materials give the mood instead |

Physics engines, glTF loaders, texture atlases, terrain streaming, and floating-origin systems are deliberately left out. A bounded 2 km region doesn't need any of them.

---

## 2. Key technical decisions

| Decision | Choice | Why |
|---|---|---|
| World model | **Independent bounded regions**, ~2 km × 2 km each, connected by teleport | Matches GDD §3.3. Small coordinates mean no float-precision problems and no streaming |
| Elevation source | AWS Terrain Tiles (Terrarium PNG, open data), **baked once** into the repo | Reachable and verified: the tile over Tangkuban Perahu decodes to a max of 2,085 m (the real summit is 2,084 m). At runtime the game has no third-party dependency |
| Heightmap format | **8-bit grayscale PNG, 256×256**, plus `min`/`max` metres in JSON | Tiny, viewable in any image editor, and hand-paintable. 8-bit steps are smoothed away at runtime |
| Projection | Local plate carrée normalised to region bounds: **+X = east, −Z = north, Y = up** | Accurate enough over 50 km near the equator, and trivially simple. Raw lat/lon is never used as XYZ |
| Fallback | `--synthetic` bake flag writes a noise heightmap in the same format | If GIS work slips, nothing downstream changes (GDD §13) |
| Height queries / collision | The **same heightfield** that builds the mesh, sampled with the mesh's own triangle split | Walking collision matches the visible terrain exactly (GDD §8.3). No physics engine |
| Art assets | Procedural low-poly geometry from primitives (cones, spheres, cylinders, icosahedra), seeded variations | No downloads, and everything is easy to tweak in code |
| UI | React DOM overlay only. The engine is plain TypeScript. **No react-three-fiber** | The game loop stays imperative and framework-free. React re-renders only when UI state changes |
| UI ⇄ engine bridge | A tiny hand-written store used through `useSyncExternalStore` | No state library needed |
| Config validation | A hand-written validator (~60 lines) | Avoids adding zod for a handful of checks |
| Noise / RNG | Our own seeded 2D simplex noise plus `mulberry32` hashing (~80 lines) | Deterministic and dependency-free |
| Persistence | `localStorage`, versioned schema, **store facts and derive status** | Collected IDs are the source of truth, so completion and unlock state can never disagree |
| Hosting | GitHub Pages via GitHub Actions | Free, static, and gives a shareable URL |

---

## 3. How a region is generated

### 3.1 Offline bake (once per region, one command)

```
npm run region:bake -- bandung          # real elevation from Terrarium tiles
npm run region:bake -- bandung --synthetic   # no network, same output format
```

`tools/bake-region.ts`, about 100 lines, dev-only, using `pngjs`:

1. Read the region's `geo.bounds` from its config.
2. Work out the Terrarium tiles at zoom 10 that cover the bounds. Bandung needs **4 tiles** (x 817–818, y 531–532), ~150 m/px.
3. Download them into `.cache/` (gitignored, skipped if already cached), then decode: `elev = R·256 + G + B/256 − 32768`.
4. Resample to a 256×256 grid over the bounds (bilinear, lat/lon → Web-Mercator pixel).
5. Normalise to 0–255. Write `public/regions/<id>/height.png` and `height.json` (`{ minElevation, maxElevation, bounds, source }`).

Both output files are committed, so the game is fully static and works offline.

### 3.2 Runtime generation (on region load, deterministic from `seed`)

```
fantasyHeight = realHeight × verticalScale          // real geography, exaggerated
              + fbmNoise(seed) × fantasyIntensity    // procedural variation (GDD §7.3)
              + Σ authoredModifiers                  // craters, lake basins, flat pads
```

1. Load the region config and `height.png`, then decode it through a canvas into a `Float32Array` in metres.
2. Convert to game units, then add seeded fBm noise. Noise amplitude is masked by slope so flat valleys stay walkable.
3. Apply authored modifiers: `crater`, `basin` (Crystal Lake), `flatten` (spawn, portal, landmark pads), `raise`.
4. Run 1–2 smoothing passes, which removes the 8-bit stair-stepping and any noise spikes.
5. Build the mesh, coloured per vertex by biome bands (height, slope, and a noise mask for meadows versus forest).
6. Scatter vegetation on a seeded jittered grid, respecting height/slope rules and exclusion zones (pads, lake, landmark footprints).
7. Resolve anchors (lat/lon → x/z → snap to the *final* surface + offset) for spawn, landmarks, collectibles, and the portal.
8. Validate placement: every anchor is in bounds, the spawn slope is walkable, and no collectible is buried or inside a collider. In dev builds, failures show in an error overlay.

The same region config and seed always produce the same world (GDD §7.4). Gameplay objects use **authored lat/lon anchors**; randomness is only used for decoration.

**Region edge:** the terrain falls away into a *sea of mist* (a cloud plane plus fog), so the boundary looks like part of the world. A soft force pushes the player back from the edge. This replaces invisible walls.

---

## 4. Bandung: The Blooming Highlands (MVP content)

| Property | Value |
|---|---|
| Geo bounds | lat −7.15 … −6.70, lon 107.40 … 107.85 (≈ 50 × 50 km real) |
| Game size | 2,000 × 2,000 m (≈ 1:25), heightfield 256² (≈ 7.8 m cells) |
| Vertical | `(elev − minElev) × 0.08`, so ~1,700 m of real relief becomes ~140 m (about 2× exaggeration relative to the horizontal scale) |
| Seed | fixed constant in config |
| Palette | greens, pinks, purples, soft blues; lavender-blue fog; warm low morning sun |
| Particles | ~1,500 drifting petals/pollen in a single `Points` object that follows the camera |

The landmarks are fictional (GDD §4.1), but each one is anchored to fitting real terrain:

| Landmark | Placement | Silhouette |
|---|---|---|
| **Blooming Highlands** | Northern volcanic highland slopes | "Mother Bloom", a ~60 m giant glowing flower visible from anywhere in the region (the main orientation beacon) |
| **Crystal Lake** | `basin` modifier in the low central valley | Lake surface made of **walkable crystal** with glowing hexagonal spires. This avoids needing swimming |
| **Ancient Greenhouse** | Hilltop to the east | Half-ruined geodesic glass dome, overgrown |
| **Petal Gate** (portal) | Flattened pad near spawn in the basin centre | Stone ring, dim and sealed until 5/5 |

**Five Flora Spirits** (stable IDs `bandung.flora.<name>`): rose, orchid, jasmine, lotus, hibiscus. Three sit at the landmarks and two are hidden in secluded spots (a crater rim and a hidden southern valley). Each one is a floating emissive shape with orbiting petals, an additive glow sprite, and a faint tall light pillar that can be seen from a distance. The pillar disappears once the spirit is collected.

**Vegetation species** are all procedural primitives: giant flower (3 colour variants), small glow flower, round canopy tree, highland pine, mushroom cluster, rock, and ruin pillar.

---

## 5. Architecture

```
/
├─ index.html · package.json · vite.config.ts · tsconfig.json · playwright.config.ts
├─ public/regions/bandung/height.png · height.json      ← baked, committed (~50 KB)
├─ tools/bake-region.ts                                 ← dev-only GIS bake
├─ src/
│  ├─ main.tsx
│  ├─ ui/                     React overlay (UIManager)
│  │   App.tsx · StartScreen · LoadingOverlay · Hud · TeleportMenu · MapPanel · Toasts
│  ├─ game/
│  │   Game.ts                composition root: renderer, loop, systems
│  │   store.ts               UI-facing state + commands (useSyncExternalStore)
│  │   engine/                Renderer, Loop, Input (pointer lock), DebugPanel (F3), dispose
│  │   geo/                   projection.ts (geoToWorld / worldToGeo), anchors.ts
│  │   world/
│  │     WorldManager.ts      region lifecycle: load → build → dispose
│  │     GISPipeline.ts       load heightmap + metadata → metres
│  │     TerrainGenerator.ts  fantasy transform, HeightField (getHeight/getNormal), mesh
│  │     modifiers.ts         crater / basin / flatten / raise
│  │     BiomeGenerator.ts    vertex colours + vegetation scatter
│  │     flora/*.ts           procedural geometry generators
│  │     atmosphere.ts        sky dome, fog, lights, mist sea, particles
│  │   player/                PlayerController, WalkController, FlightController, Avatar, Glider
│  │   camera/                CameraController
│  │   systems/               CollectibleSystem, PortalSystem, ExplorationSystem, ProgressManager
│  │   audio/sfx.ts           WebAudio-synthesised chimes / whoosh
│  ├─ content/
│  │   regions/bandung.ts     region definition (data only)
│  │   regions/index.ts       registry + progression graph
│  │   validate.ts            config validator
│  └─ lib/                    rng.ts, noise.ts, math.ts
├─ tests/e2e/smoke.spec.ts
└─ docs/  GDD.md · IMPLEMENTATION_PLAN.md
```

Module names follow GDD §9.2. Runtime deps are `three`, `react`, and `react-dom`. Dev deps are `vite`, `@vitejs/plugin-react`, `typescript`, `vitest`, `@playwright/test`, `pngjs`, and `tsx`.

### 5.1 Region definition (data-driven, GDD §9.3)

```ts
type Anchor = { lat: number; lon: number; offset?: number };   // snapped to final surface + offset

interface RegionDefinition {
  id: RegionId;  name: string;  title: string;  seed: number;
  geo:     { bounds: { south: number; west: number; north: number; east: number }; heightmap: string };
  world:   { size: number; verticalScale: number };
  terrain: { noiseAmplitude: number; noiseScale: number; smoothPasses: number; modifiers: TerrainModifier[] };
  biome:   BiomeDefinition;          // palette, colour bands, fog, sky, sun, vegetation rules, particles
  spawn:   Anchor;
  landmarks:    LandmarkDefinition[];      // ≥ 3, each { id, name, anchor, kind, discoveryRadius, collider? }
  collectibles: CollectibleDefinition[];   // exactly 5, each { id, name, anchor }
  portal:  { anchor: Anchor; leadsTo: RegionId[] };
  unlock:  { requires: RegionId[] };       // completed regions needed; [] for Bandung
}

type TerrainModifier =
  | { kind: 'crater';  at: Anchor; radius: number; depth: number; rim: number }
  | { kind: 'basin';   at: Anchor; radius: number; level: number }
  | { kind: 'flatten'; at: Anchor; radius: number }
  | { kind: 'raise';   at: Anchor; radius: number; height: number };
```

### 5.2 Adding a region later (GDD pillar 6)

1. Create `src/content/regions/jakarta.ts` with the bounds and a seed.
2. Run `npm run region:bake -- jakarta`.
3. Fill in the biome, landmarks, and 5 collectibles, and add any new flora generators (for Jakarta, instanced neon box towers).

No engine changes are needed.

---

## 6. Player, camera, and mode switching

**Walking** (`WalkController`) is a kinematic capsule on the heightfield.

- Camera-relative WASD. Walk 6 m/s, sprint 11 m/s, jump 7 m/s, gravity 25 m/s².
- Ground snapping, plus a slope limit (~50°) that blocks uphill movement on steep slopes.
- Landmarks have simple cylinder colliders with XZ push-out. Small flora has no collision.

**Flying** (`FlightController`) is an arcade model.

- Heading and pitch follow the mouse. W thrusts, S brakes, A/D strafe with a visual bank. Space/Ctrl ascend and descend. Shift boosts.
- Speeds: cruise ~25 m/s, boost ~60 m/s. Velocity is smoothed exponentially, which gives smooth acceleration and deceleration.
- Hovering is allowed, so landing next to an artifact is easy.
- It is forgiving: there is a minimum ground clearance of 2 m (a soft push up, never a crash), an altitude ceiling, and a soft push back at the region edge.
- Feedback: the glider banks with turn rate, the FOV widens with speed (60→75), and wind streaks appear when boosting.
- The vehicle is a stylised low-poly **petal glider** made from primitives. The character is a simple primitive figure that bobs while walking; there is no skeletal animation.

**Mode switching** (`F`) uses explicit transition states (GDD §5.4):

- **Walk → Fly ("takeoff"):** eases up to ground + 4 m over 0.4 s while the glider appears.
- **Fly → Walk ("landing"):** descends quickly with limited control and lands on terrain or on the Crystal Lake surface, then hands control to `WalkController`.
- Interaction is locked during both transitions and for 0.5 s afterwards.
- Invariant, enforced every frame and unit-tested with random positions: `player.y ≥ surface(x, z)`.

**Camera:** a third-person orbit camera behind the player using pointer lock.

- Arm length is ~6 m when walking and ~12 m when flying, with smoothing.
- Terrain clearance is checked by sampling the heightfield along the arm, and pitch is clamped.
- When a menu opens, pointer lock is released and gameplay input pauses.

---

## 7. Gameplay systems and progression

- **CollectibleSystem** checks the 5 artifacts each frame for proximity (radius 4 m) and shows an "E: collect" prompt, both on foot and in flight.
  - On collect: a burst of particles, a synthesised chime, a toast, the HUD count updates, and the game **saves immediately**.
  - Collecting is idempotent: an ID that is already collected is ignored.
- **PortalSystem:** the Petal Gate stays dormant until 5/5. On completion it switches to an animated swirl shader, shows a "Bandung restored!" message, and opens the Teleport menu when the player presses E.
- **Progression graph** (proposed): Bandung → Jakarta → {Yogyakarta, Surabaya} → Kalimantan.
- **Region status** is derived, not stored:
  - `completed` = all 5 IDs collected
  - `unlocked` = every region in `unlock.requires` is completed
  - `visited` = the region was entered at least once
  - The Teleport menu shows locked, unlocked, visited, and completed states (GDD §5.7).
- **MVP portal behaviour:** Jakarta shows as *unlocked* with a "coming soon" preview card (the GDD §12.3 optional "locked destination preview"). The `WorldManager` load/dispose path is still exercised by re-entering Bandung (see open decision 1).
- **ExplorationSystem** (optional MVP feature): a 32×32 revealed-cells bitset per region, a reveal radius of ~150 m, and landmark discovery toasts.
- **Map** (optional): the region's **own `height.png`**, drawn as a colour gradient with hillshading, plus a fog overlay and icons. It is almost free because the data already exists.

### 7.1 Save data (GDD §9.4)

```ts
interface SaveDataV1 {
  version: 1;
  currentRegionId: RegionId;
  collected: string[];               // e.g. "bandung.flora.rose"
  visitedRegions: RegionId[];
  discoveredLandmarks: string[];
  explored: Record<RegionId, string>; // base64 bitset (optional feature)
  player?: { regionId: RegionId; x: number; y: number; z: number; heading: number; mode: 'walk' | 'fly' };
}
```

- Stored under the key `otherworld:save`.
- Saved on collect, on discovery, on region change, every 10 s, and on `visibilitychange`.
- The saved position is restored only if it is in bounds and not inside a collider. Otherwise the player goes to spawn.
- `migrate()` runs on every load. A corrupted save is backed up under a second key and the game starts fresh with a notice.

---

## 8. Rendering and atmosphere

- `WebGLRenderer` with antialiasing; pixel ratio capped at 1.5.
- `MeshLambertMaterial` with vertex colours and flat shading for the low-poly look.
- One `HemisphereLight` and one `DirectionalLight`.
- Linear `Fog` matched to the sky horizon colour.
- The sky dome is a single gradient `ShaderMaterial` with a sun disc. The mist sea is a transparent plane.
- Glow comes from emissive materials and additive sprites, not bloom.
- Vegetation sway is a small vertex-shader injection (`onBeforeCompile`).
- **F3 debug panel:** FPS, draw calls, triangles, and geometry/texture counts from `renderer.info`. It is used to confirm that a region reload returns those counts to baseline (no leaks).

---

## 9. Testing and delivery

**Unit tests (Vitest):**

- Projection round-trip and known distances.
- RNG/noise determinism.
- `HeightField.getHeight` equals the mesh surface.
- Modifiers produce no NaN or spikes.
- The config validator accepts Bandung and rejects bad configs (4 collectibles, duplicate IDs, anchors out of bounds).
- Progression: collecting is idempotent, 5/5 completes the region, and completion unlocks Jakarta.
- Save: round-trip, migration, and recovery from corruption.
- Controllers: fly → walk never ends below the surface across 1,000 seeded random positions, and interaction stays locked during transitions.

**End-to-end smoke test (Playwright, headless Chromium):**

1. Boot, click Start, and check that the canvas is not blank and there are no console errors.
2. Use a dev/test-only `window.__otherworld` hook to warp to each artifact and press E.
3. Check that the HUD shows 5/5 and the portal is active.
4. Reload the page and check that it still shows 5/5.
5. Check that the Teleport menu shows the correct states.

This automatically covers acceptance criteria 1, 2, 5, 6, 7, and 8 (GDD §16). Criteria 3, 4, and 9 are covered by a short manual playtest checklist.

**CI (GitHub Actions):** typecheck, unit tests, build, e2e, then deploy `main` to GitHub Pages (Vite `base: '/Nusantara/'`).

---

## 10. Build order

This mirrors the GDD §13 weekend schedule. Each block has a definition of done (DoD).

| Block | Work | Definition of done |
|---|---|---|
| **0. Prep** (~1 h) | Scaffold Vite + React + TS + three, lint/format, CI. Write `bake-region.ts` and bake Bandung | `npm run dev` shows an empty scene. `height.png` committed (≤ 60 KB). CI green |
| **Sat AM: World** | GISPipeline, projection, HeightField, modifiers, terrain mesh, vertex colours, sky/fog/lights/mist edge | Bandung terrain renders and the volcanoes are recognisable. Debug HUD shows the player's lat/lon. Projection and heightfield tests pass |
| **Sat PM: Traversal** | Walk, fly, takeoff/landing transitions, camera, edge push-back, colliders | 5 minutes of free play with no falling through terrain and no camera clipping. Controller tests pass |
| **Sun AM: Loop** | 5 Flora Spirits, interaction prompt, feedback, HUD x/5, portal activation, completion toast, Teleport menu | Full loop from spawn to an active portal works by hand |
| **Sun PM: Persist + polish** | Save/restore, vegetation scatter, 3 landmarks, petals, sfx, start/loading/error screens, e2e, deploy | Reload keeps progress. e2e green. Shareable GitHub Pages URL |
| **Stretch** (only once all DoDs are met) | Map + fog of war, discovery toasts, ambient sound, Jakarta stub region | Each one gated by the §1 budget |

If the GIS bake causes trouble, switch to `--synthetic` and move on. The output format doesn't change.

---

## 11. Implementation risks

| Risk | Mitigation |
|---|---|
| 8-bit heightmap shows terracing | Smoothing passes plus noise. Switch to RG-packed 16-bit only if it is visible |
| Vegetation pushes the triangle budget | Keep each species under ~60 triangles, cull per cell by distance, cap instance count in config |
| Pointer lock and menus conflict | Release the lock when any menu opens. Show a "click to resume" overlay |
| A collectible ends up unreachable after terrain tweaks | Anchor validation runs on every load (dev overlay) and in unit tests |
| Scope creep into multiple regions | No second region until §10 DoDs and GDD §16 criteria pass |

---

## 12. Open decisions (defaults in **bold**)

1. **MVP portal destination:** **"Jakarta: coming soon" preview card**, or build a minimal Jakarta stub region (flat neon grid plus instanced towers, about half a day) to prove the region-transition path end to end.
2. **Flying vehicle:** **petal glider**, or wings on the character, or a small airship.
3. **Hosting:** **GitHub Pages from this repo.** You'd need to enable Pages with "GitHub Actions" as the source.
4. **UI language:** **English with Indonesian-flavoured names**, or bilingual EN/ID from the start.

## 13. Data attribution

Elevation data comes from AWS Terrain Tiles (Mapzen/Tilezen Terrarium; sources include SRTM, GMTED2010, and ETOPO1). An `ATTRIBUTION.md` will be added alongside the first baked heightmap, following the Tilezen attribution guidelines.
