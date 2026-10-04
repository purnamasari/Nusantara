# Implementation Plan: Archipelago: Otherworld

**Revision 2 — 2026-10-04.** This replaces revision 1 (commit `d732abf`).
**Scope:** the Bandung vertical slice from [GDD.md](./GDD.md) §12.
**Status (updated 2026-10-04):** M0–M8 are implemented on the synthetic Bandung terrain and the game is playable. M9 (real elevation) is gated on decision D1. See §20 for what was verified, what was measured, and what still needs a person.

---

## 0. How to read this plan

Every number or claim in this plan carries one of these labels:

| Label | Meaning |
|---|---|
| **VERIFIED** | Observed directly in this session (2026-10-04). The method is stated. It is valid only for what was actually observed. |
| **COMPUTED** | Pure arithmetic from stated inputs, with no measurement involved. |
| **ESTIMATE** | Reasoned expectation. Nothing has been measured. |
| **TARGET** | A proposed limit. It only counts as a requirement once an automated check enforces it or it has been measured on the reference machine (§10). |
| **TO CHECK** | Must be confirmed during implementation, before anything relies on it. |

No benchmark result, GIS validation result, licensing conclusion, or test outcome in this document has been produced yet. Wherever one is needed, the milestone that produces it is named.

### 0.1 Fixed constraints (not revisited by this plan)

- Three.js engine with a React DOM overlay, TypeScript, and Vite.
- Lightweight, deterministic, seed-based procedural generation.
- Real geography supplies only a rough terrain foundation. The fantasy transformation takes priority over accuracy.
- The world is made of independent bounded regions of about 2 km × 2 km.
- Bandung is the first playable vertical slice.
- The game has no third-party GIS dependency at runtime.
- The MVP stays small enough to build and validate quickly.

---

## 1. Changes since revision 1

1. **Budgets are now measurable.** Each budget defines what it counts, how it is measured, which check enforces it, and what happens when it is exceeded (§10). The 300 ms generation figure is now a TARGET with a benchmark procedure and a fallback. It is no longer a promise.
2. **The heightmap container changed** from an 8-bit PNG decoded through a canvas to a **raw 8-bit binary grid (`height.u8.bin`) plus JSON metadata** (§5).
   - Node tests and the browser now share one decoder.
   - Canvas colour management can no longer alter values.
   - The file size is exact: 65,536 bytes.
   - There are now explicit criteria for switching to 16-bit (§5.4).
3. **The resampling, smoothing, exaggeration, noise, and modifier steps now have a defined order and defined interactions** (§5.5). Fantasy noise and modifiers are now derived from the geographic baseline and named seed streams.
4. **GIS processing is reproducible and validated** (§6).
   - Validation covers tile coverage, the Terrarium formula, resampling across tile seams, orientation, and dimensions.
   - It checks several reference points, not a single summit.
   - Per-tile provenance is recorded.
5. **A data-licensing gate has been added** (§6.5). Rev 1 assumed open data could be redistributed freely. The source documents are more conditional than that, so a person must sign off before any file derived from real data is committed.
6. **Coordinate conventions are now explicit** (§4). There are separate geo, grid, and world spaces, with +X east, +Y up, and −Z north. The heading convention and the brand types that keep raw lat/lon out of three.js code are also defined there.
7. **Terrain sampling has a single source of truth** (§7). One `Float32Array` heightfield feeds both the mesh and collision, through one triangle split and the same interpolation formula. Tests cover corners, edges, diagonals, slopes, and out-of-bounds queries.
8. **The rendering rules are now concrete** (§9). There are 5 vegetation species (rev 1 had 7). Rev 1 contradicted itself by combining a ~100 draw-call limit with up to 112 instanced meshes; that is fixed. Material sharing and distance visibility are defined. LOD, streaming, and floating origin are explicitly excluded until measurements show they are needed.
9. **Architecture now has layers with a single dependency direction**, enforced by a test (§11). Development tools are separated from runtime code. Runtime dependencies are limited to three packages by an allowlist test. Error codes and error handling are defined.
10. **Save data is now v1 with only MVP fields**, and `collected` IDs are the only source of truth for completion and unlock status (§13). Rev 1 stored landmark and exploration fields for features that are optional. Those fields now arrive through a schema migration if and when the features are built.
11. **Milestones are reordered** (§15): synthetic terrain, then orientation, dimensions, and collision, then movement, then gameplay, then vegetation, then the full synthetic slice. Real Bandung data comes last (M9). Every milestone has acceptance criteria and a fallback.
12. **Contradictions have been audited** against the GDD and rev 1 (§17). Corrections include:
    - Ctrl as the descend key: it collides with browser shortcuts like Ctrl+W.
    - The map is required in GDD §11.3 but optional in GDD §12.3.
    - The progression graph is cut down to Bandung → Jakarta (preview only).
    - Rev 1's "verified" elevation claim is relabelled as a single spot check.

---

## 2. Verified facts to date

These are the only items observed so far. Everything else in this plan is computed, estimated, a target, or still to check.

| # | Fact | Method | Label |
|---|---|---|---|
| F1 | Terrarium tiles at `s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` returned HTTP 200 for z7, z10, and z12 tiles from this environment. This says nothing about uptime; the dataset has no stated SLA. | curl | VERIFIED |
| F2 | Tile 12/3272/2125 (near Tangkuban Perahu) decoded with the Terrarium formula to a minimum of 970 m, maximum 2,085 m, and mean 1,375 m. The commonly cited summit height is about 2,084 m, but that reference was not independently checked here. **This is one spot check, not validation.** | pngjs decode | VERIFIED (single tile) |
| F3 | Tile 10/817/531 is 64,598 bytes, with `Last-Modified: 2017-11-19`. Its header is `x-amz-meta-x-imagery-sources: srtm/S07E107.tif, srtm/S08E107.tif, gmted/10S090E_20101117_gmted_mea075.tif`. | HTTP HEAD | VERIFIED (this tile only) |
| F4 | The AWS Open Data registry entry for Terrain Tiles gives its `License` as a link to Tilezen's `attribution.md`. No standard licence identifier is listed. An EU replica bucket (`elevation-tiles-prod-eu`) is listed. | Read the registry YAML | VERIFIED |
| F5 | Tilezen's attribution document says: *"Attribution is required for many terrain tile data providers… you are responsible for researching each project to follow their license terms."* | Read the document | VERIFIED (quote) |
| F6 | The SRTM terms as quoted by Tilezen include: *"Copyright protection is asserted for all products generated by these specifications which are distributed outside of the United States."* The GMTED2010 terms as quoted include: *"Any user who modifies the data is obligated to describe the types of modifications they perform."* USGS asks for credit for both. These are quotes only. **No licensing conclusion is drawn from them.** | Read the document | VERIFIED (quote) |
| F7 | Terrarium decoding is `(R × 256 + G + B / 256) − 32768` metres, in Web Mercator (EPSG:3857), with 256×256 tiles. Tilezen's source table lists SRTM for land at z10, and ETOPO1 for oceans. | Tilezen `formats.md` and `data-sources.md` | VERIFIED (documentation) |
| F8 | The development environment has Node v22.22.0 and npm 10.9.4. Chromium is preinstalled for Playwright. | `node --version`, environment docs | VERIFIED |

---

## 3. MVP feature scope (unchanged from GDD §12)

- **Required:** everything in GDD §12.2.
- **Optional, after M8 only:** the items in GDD §12.3 (fog of war, landmark discovery notifications, ambient sound, minimal map). Whether the map is optional is an open decision (§18, D3).
- **Locked destination preview:** Jakarta appears in the Teleport menu as unlocked but not available. That is the whole Jakarta scope. There is no Jakarta region, terrain, or content in the MVP.
- **Out of scope:** everything in GDD §12.4, plus coastline and land-cover data, which Bandung is inland and doesn't need.

---

## 4. Coordinate conventions

### 4.1 Three separate spaces

| Space | Type | Units and axes | Who uses it |
|---|---|---|---|
| **Geo** | `GeoPoint { lat, lon }` (branded) | WGS84 degrees | Region config anchors, bake tool, debug readout |
| **Grid** | `(r, c)` integer indices | `r = 0 … 255` runs north → south, `c = 0 … 255` runs west → east. Pixel-is-point: samples lie exactly on the bounds edges | Heightmap file, generation pipeline |
| **World** | `WorldPoint` (branded) / `THREE.Vector3` | Game metres. **+X = east, +Y = up, −Z = north.** Origin is at the region centre. The *baseline* (step R2) has y = 0 at the encoded minimum elevation; noise, modifiers and the edge falloff may go below 0 | Everything in three.js, movement, camera |

This is a right-handed frame. East × Up = South (+Z), and East × North = Up. **COMPUTED.**

### 4.2 Conversions

These are the only conversions allowed, and they all live in `src/geo/projection.ts`. Notation: bounds `(S, W, N, E)` in degrees, world size `L = 2000`, grid size `G = 256`.

```
geo  → world : x = (lon − W)/(E − W)·L − L/2        z = (N − lat)/(N − S)·L − L/2
world → geo  : lon = W + (x + L/2)/L·(E − W)        lat = N − (z + L/2)/L·(N − S)
grid → world : x = −L/2 + c·Δ                       z = −L/2 + r·Δ          Δ = L/(G − 1)
grid → geo   : lon = W + c/(G − 1)·(E − W)          lat = N − r/(G − 1)·(N − S)
elevation    : y_baseline = (e − e_min) · verticalScale     (metres in, game metres out)
```

- **The projection is a plate carrée normalised to the region bounds.** It is linear and uses only arithmetic.
- Its distortion is accepted, but the bake tool measures it and fails if the east–west/north–south anisotropy exceeds 2% (§6.3).
- **Keeping lat/lon out of three.js:** `GeoPoint` and `WorldPoint` are distinct branded TypeScript types, and only `geo/` converts between them.
  - Content files author anchors with the `geo(lat, lon)` helper.
  - Engine code only ever receives `WorldPoint` or `Vector3` values.

### 4.3 Heading

- Heading `θ` is measured in radians, with 0 = north (−Z) and π/2 = east (+X), increasing clockwise when seen from above.
- The forward vector is `(sin θ, 0, −cos θ)`, and a three.js object's `rotation.y = −θ` (COMPUTED from the Y-rotation matrix).
- All models, including the avatar and the glider, are authored facing −Z.
- Pitch is positive when the nose is up.

### 4.4 Bandung dimensions

| Quantity | Value | Label |
|---|---|---|
| Bounds | lat −7.15 … −6.70, lon 107.40 … 107.85 | TARGET (design choice) |
| Real extent N–S × E–W | 49,766 m × 49,731 m | COMPUTED |
| Anisotropy | 0.07% (accepted) | COMPUTED |
| World size | 2,000 m × 2,000 m, x and z ∈ [−1000, 1000] | TARGET (design choice) |
| Horizontal scale | 1 : 24.88 (N–S), 1 : 24.87 (E–W) | COMPUTED |
| Grid | 256 × 256 samples, spacing Δ = 7.843 game m (≈ 195 m real) | COMPUTED |
| Float32 resolution at \|1000\| | 2⁻¹⁴ ≈ 6.1 × 10⁻⁵ m, so floating origin is unnecessary | COMPUTED |
| Walkable / flyable boundary | \|x\|, \|z\| ≤ 950 m. The band 950–1000 m is the edge falloff into the mist sea | TARGET |
| Vertical scale | 0.08 game m per real m, about 2× the horizontal scale (initial value, retuned at M9) | TARGET |
| Real relief R (e_max − e_min) | Unknown. Roughly 1,400–2,000 m expected. Measured at the M9 bake | ESTIMATE |

---

## 5. Heightmap data, encoding, and reconstruction

### 5.1 Canonical runtime files (per region)

| File | Content | Size |
|---|---|---|
| `public/regions/<id>/height.u8.bin` | 256×256 `Uint8`, row-major, row 0 = north edge, column 0 = west edge | 65,536 B (COMPUTED) |
| `public/regions/<id>/height.json` | Metadata, see §5.2 | ~2 KB (ESTIMATE) |

**Why raw binary instead of PNG?**

- One decoder (`new Uint8Array(arrayBuffer)`) runs unchanged in Node tests and in browsers.
- Canvas colour management and premultiplied alpha can't alter the values.
- The size is known exactly ahead of time.

The bake tool also writes a human-readable preview PNG, with a north arrow and reference-point crosshairs, to `tools/out/`. That folder is gitignored and never shipped.

### 5.2 Metadata (everything needed to rebuild the baseline deterministically)

```jsonc
{
  "schemaVersion": 1,
  "regionId": "bandung",
  "source": {
    "kind": "terrarium" | "synthetic",
    "zoom": 10, "tiles": [{ "z": 10, "x": 817, "y": 531, "bytes": 0, "sha256": "…",
                            "lastModified": "…", "imagerySources": "…" }],   // terrarium only
    "syntheticSeed": null                                                    // synthetic only
  },
  "bounds": { "south": -7.15, "west": 107.40, "north": -6.70, "east": 107.85 },
  "grid": { "width": 256, "height": 256, "registration": "pixel-is-point",
            "rowOrder": "north-to-south", "colOrder": "west-to-east" },
  "encoding": { "format": "uint8", "minElevationM": 0, "maxElevationM": 0,
                "decode": "min + v / 255 * (max - min)" },
  "resampling": { "method": "bilinear", "sourceCrs": "EPSG:3857",
                  "targetGrid": "plate-carree-normalised-to-bounds" },
  "file": { "name": "height.u8.bin", "bytes": 65536, "sha256": "…" },
  "realExtentM": { "northSouth": 0, "eastWest": 0, "anisotropyPct": 0 },
  "quantization": { "stepM": 0, "maxErrGameM": 0, "rmsErrGameM": 0, "terraceCellsPct": 0 },
  "bake": { "toolVersion": 1, "node": "v22.x", "bakedAt": "…" }
}
```

The zeros above are placeholders. Real values are written by the bake tool and are not fabricated here.

**The final heightfield is fully determined by four inputs:** the bytes of `height.u8.bin`, `height.json`, the region config (the seed and the transform parameters in §5.5), and `generatorVersion` (a constant in code). A golden hash test pins the result (§8.2).

### 5.3 Precision of 8-bit encoding

| Quantity | Formula | Bandung value | Label |
|---|---|---|---|
| Quantisation step (real) | q = R / 255 | 5.5–7.8 m if R = 1,400–2,000 m | ESTIMATE until R is measured |
| Step in game units | q × verticalScale | 0.44–0.63 m at 0.08 | ESTIMATE |
| Max error before smoothing | ± q/2 | ± 0.22–0.31 game m | ESTIMATE |
| RMS error before smoothing (uniform) | q / √12 | 0.13–0.18 game m | ESTIMATE |

**What 8-bit cannot do:**

- It can't represent slopes gentler than one quantisation step per run of cells. On near-flat ground, such as the basin floor, this shows up as **terracing**: flat plateaus separated by steps of about 0.5 m.
- Raising `verticalScale` makes this proportionally worse.
- Smoothing (§5.5) reduces it. Whether smoothing is enough is measured at the bake, using the switching criteria below.

### 5.4 Criteria for switching to 16-bit

The bake tool runs the runtime's own smoothing on two versions of the grid: the float-precision grid and the decoded 8-bit grid. It then compares the two in game units. **Switch to 16-bit if any of the following holds:**

1. The maximum absolute difference is greater than 0.30 m, or the RMS difference is greater than 0.10 m (TARGET thresholds).
2. Terrace metric: among cells whose float slope is under 3°, more than 5% have a slope difference greater than 2° between the 8-bit and float pipelines (TARGET).
3. The visual review at the three standard low-angle viewpoints (spawn pad, basin floor, Crystal Lake shore) shows visible stair-stepping. This needs human sign-off.
4. A later retune pushes `q × verticalScale` above 0.5 m with fewer than 2 smoothing passes.

**The 16-bit format:** `height.u16.bin`, little-endian `Uint16`, normalised over [min, max] (step R/65535, about 0.03 m), with the same metadata schema and `encoding.format = "uint16"`.

- Raw size is 131,072 B, which **exceeds the 100 KB region budget** (COMPUTED). Switching therefore needs one of two things:
  - **(a)** A gzip container decoded with the native `DecompressionStream`. Its size must be measured and come in at 100 KB or less. Two things are TO CHECK: browser support, and whether the host adds a `Content-Encoding` header that would cause the data to be decompressed twice.
  - **(b)** A recorded budget change (§10.7). This needs user approval.
- Either way, the decoder stays shared between Node and the browser.

### 5.5 Reconstruction pipeline (runtime, in fixed order)

| Step | Operation | Notes |
|---|---|---|
| R1 | Decode: `e = min + v/255·(max − min)` (metres) | Exact integer-to-float mapping |
| R2 | Baseline: `b = (e − min) · verticalScale` (game m) | The lowest sample sits at y = 0 |
| R3 | Smoothing: `smoothPasses` passes of the separable binomial `[1 2 1]/4` filter, with edges clamped (edge samples replicated) | Default 2 passes (TARGET) |
| R4 | Fantasy noise: `b += fbm(stream "terrain.fbm", x/λ, z/λ) · A · mask(b̂, slope_b)` | Uses world coordinates, so it doesn't depend on grid resolution |
| R5 | Authored modifiers, applied in the order they are declared in the region config. Kinds: `flatten`, `crater`, `basin`, `raise` | Each has a polynomial (smoothstep) falloff |
| R6 | Edge falloff: inside the 950–1000 m band, blend down to y = −40 | Applied last |
| R7 | Post-generation validation (§8.4) | Errors are fatal |

**How the steps interact:**

- **R2 and R3 commute.** Decoding and exaggeration are affine, and the smoothing kernel's weights sum to 1, so smoothing before or after exaggeration gives the same result up to rounding (COMPUTED). The order is fixed anyway, for bit-reproducibility.
- **Bilinear resampling at bake time (§6.2) and smoothing at runtime both low-pass the terrain.** Peaks and crater rims come out lower than the real ones. This is accepted and not compensated for, and the reference-point tolerances in §6.3 account for it.
- **Vertical exaggeration is a single constant.** Noise amplitude `A` is specified in game metres and is *not* multiplied by `verticalScale`, so tuning one doesn't silently change the other.
- **Noise and modifiers are derived from the geographic baseline.**
  - The noise mask uses the normalised smoothed baseline `b̂ ∈ [0, 1]` and its slope. The default puts more noise on the highlands and little on the basin floor, which keeps the valleys walkable.
  - Modifier levels are relative to the baseline at the anchor. For example, a `basin` level is "8 m below the local baseline".
  - A `flatten` target is the height at the anchor centre after R4.
  - Randomness comes only from named seed streams (§8.1).

### 5.6 Synthetic fallback (same schema, built first)

Running `bake-region --synthetic <id>` writes the **same two files with the same schema**, with `source.kind = "synthetic"`.

- The elevation is a seeded fBm field plus polynomial "volcano" bumps listed in the region config's `synthetic` section. For Bandung, these approximate the basin and the surrounding peaks, so content placed on synthetic terrain carries over reasonably well to real data.
- Nothing downstream of the files knows which source produced them.
- Synthetic terrain is the M1–M8 baseline (§15), and the permanent fallback if real data is blocked (§6.5).

---

## 6. GIS bake (offline, reproducible)

### 6.1 Command and outputs

```
node tools/bake-region.ts bandung              # real (Terrarium), from M9 only
node tools/bake-region.ts bandung --synthetic  # synthetic, from M1
```

- Running `.ts` files directly relies on Node ≥ 22.18 stripping types natively (TO CHECK). If that doesn't work, add `tsx` as a dev dependency.
- The tool is dev-only. It is never imported by `src/`, and CI never runs it in real mode because that needs network access. CI does unit-test its pure functions and validates the committed outputs.

### 6.2 Steps (real mode)

1. Load the region bounds from the region config and validate them (§6.3, V1).
2. Compute the z10 tile range covering the bounds, expanded by one source pixel so bilinear sampling has neighbours.
   - COMPUTED for Bandung: x 817–818, y 531–532, i.e. 4 tiles.
   - Ground resolution at z10 and latitude 6.9° is 151.8 m (COMPUTED, using Tilezen's formula).
3. Fetch the tiles into `.cache/terrarium/` (gitignored). For each tile, record its byte count, sha256, `Last-Modified`, and `x-amz-meta-x-imagery-sources`.
   - **Any HTTP or decode failure aborts the bake.** Partial outputs are never written.
4. Decode every pixel with the Terrarium formula (F7) and stitch the tiles into one mosaic array.
5. For each output sample `(r, c)`: grid → geo (§4.2) → global Web Mercator pixel → bilinear sample from the mosaic. Values are float64 metres.
6. Compute `min` and `max`, then quantise: `v = round((e − min)/(max − min)·255)`.
7. Compute the quantisation report (§5.4), the realExtent and anisotropy figures, and the sha256 of the output. Write the `.bin` file, the `.json` file, and the preview PNG.

### 6.3 Validation

Pure functions are unit-tested in CI from M1. Checks on real data run at M9.

| ID | Check | Pass rule |
|---|---|---|
| V1 | Bounds sanity | S < N, W < E, \|lat\| < 85.0511, each extent between 30 and 80 km, anisotropy ≤ 2% |
| V2 | Tile coverage | The union of the computed tiles' geographic bounds (from the inverse tile formula) contains the bounds plus one source pixel of margin. Tile count ≤ 16 |
| V3 | Tile integrity | Every tile is HTTP 200, a 256×256 PNG, and decodes with all values finite and within [−500, 6,000] m |
| V4 | Decode formula | Fixture pixels decode exactly: (128,0,0) → 0 m; (128,1,0) → 1 m; (128,0,128) → 0.5 m; (127,255,0) → −1 m; (136,8,0) → 2,056 m (COMPUTED) |
| V5 | Mercator maths | lat/lon → pixel → lat/lon round-trips with error < 1e-9°. (−6.70, 107.40) at z10 maps to tile (817, 531) |
| V6 | Resampling and seams | Fixture tiles encoding a linear ramp in global pixel space resample to the analytic ramp within 1e-6, including across tile seams |
| V7 | Grid geometry | Sample (0, 0) is at (N, W) and sample (255, 255) is at (S, E), in both geo and world space |
| V8 | Orientation (fixture) | An asymmetric fixture with a single maximum to the north-east ends up at x > 0, z < 0 in the final heightfield and mesh |
| V9 | Orientation (real data) | For at least 3 summits in different directions (N, S, E), the highest sample within a 3 km window is within 1 km of the reference coordinate. A north–south or east–west flip would move at least one of them |
| V10 | Reference elevations | Summits: sampled max within [ref − 300 m, ref + 50 m], since peaks are smoothed downward. Flat sites: \|sample − ref\| ≤ 50 m |
| V11 | Dimensions | Grid is 256×256, Δ = 7.843 m, mesh bounding box is x, z ∈ [−1000, 1000] ± 1e-3 |
| V12 | Quantisation | The §5.4 criteria are reported. If any one fails, switch to 16-bit |
| V13 | Bake reproducibility | Re-baking from cached tiles on the same machine gives an identical sha256. Across machines, at most 0.1% of samples may differ by ±1 LSB, because Mercator maths uses transcendental functions (TO CHECK) |

**Reference points for V9 and V10.** Coordinates and elevations must come from citable sources before M9. None are trusted from memory.

| Point | Type | Reference |
|---|---|---|
| Tangkuban Perahu summit | summit (north) | TO SOURCE |
| Malabar summit | summit (south) | TO SOURCE |
| An eastern summit (e.g. Manglayang) | summit (east) | TO SOURCE |
| Husein Sastranegara airport | flat | TO SOURCE (published aerodrome elevation) |
| Bandung city centre | flat | TO SOURCE |
| Saguling reservoir (normal water level) | flat, west | TO SOURCE |

### 6.4 What is committed

- **Committed:** the bake tool, its fixtures, and the generated `height.u8.bin` and `height.json`. Real-data outputs are committed only after the gate in §6.5.
- **Never committed:** the tile cache and the preview images.
- The committed outputs are validated in CI: the schema matches, the byte count matches, the sha256 matches the file, decoding works, and the file is within budget.

### 6.5 Data-licensing gate (entry criterion for M9)

The source documents put redistribution terms on the user (F5, F6). So **no file derived from real elevation data is committed or deployed until all of the following are done:**

1. The bake records each tile's imagery sources. Tile 10/817/531 is SRTM + GMTED (F3). The other three tiles are TO CHECK.
2. The current terms are read from each dataset's primary publisher (USGS for SRTM and GMTED2010, NOAA if ETOPO1 appears), not only from Tilezen's summary, whose links are partly stale.
3. A draft `ATTRIBUTION.md` is written. It contains:
   - The required credits.
   - A description of our modifications: resampling, 8-bit quantisation, smoothing, exaggeration, and procedural alteration. This is required by the GMTED wording quoted in F6.
   - A statement that the terrain is fictionalised and must not be used for navigation.
4. Three open questions are listed for human review:
   - **(a)** Does the SRTM clause in F6 affect public redistribution of a derived, coarse heightmap through GitHub or GitHub Pages?
   - **(b)** Does the "Mapzen" credit apply to tiles served from AWS?
   - **(c)** Are there any terms on the Terrain Tiles compilation itself? The registry links only to the attribution document (F4).
5. **The user signs off, recorded in the §19 decision log.** This plan does not and cannot make that decision.

**If sign-off doesn't happen:** synthetic terrain ships. That falls short of GDD §12.2 ("terrain based on real geographic elevation"), which is listed as decision D1 in §18.

---

## 7. Authoritative terrain sampling

### 7.1 One heightfield

- `HeightField` holds a `Float32Array(256 × 256)` of final heights after R1–R6, in row-major grid order. **These exact values become the mesh's vertex y-coordinates, and every height or slope query reads them too.** Nothing else holds a copy of the terrain.
- Queries compute in float64 from the float32 values. The GPU interpolates float32 values, so the two can differ by less than 1e-4 m, which is negligible (ESTIMATE).
- There is no physics engine.

### 7.2 Triangle split and winding

Each cell `(r, c)` with `0 ≤ r, c ≤ 254` has four corners:

```
A = (r, c)     NW        B = (r, c+1)   NE
C = (r+1, c)   SW        D = (r+1, c+1) SE
```

- The diagonal is **A–D (NW → SE)**.
- The two triangles are indexed **[A, C, D]** and **[A, D, B]**. Both normals point to +Y (COMPUTED), so the faces are front-facing from above with three.js's default counter-clockwise winding.
- The vertex count is 65,536, so the largest index is 65,535 and fits a **`Uint16` index buffer** (COMPUTED).

### 7.3 Interpolation (must match the mesh)

Use these local coordinates: `u = (x + L/2)/Δ − c` (eastward) and `v = (z + L/2)/Δ − r` (southward), both in [0, 1].

```
if u ≤ v   (triangle A,C,D):  h = hA + (hD − hC)·u + (hC − hA)·v
else       (triangle A,D,B):  h = hA + (hB − hA)·u + (hD − hB)·v
```

Both formulas reproduce all four corners exactly (COMPUTED). Bilinear interpolation is **not** used for queries.

### 7.4 Boundaries and out-of-bounds queries

- The cell index is `c = clamp(floor((x + L/2)/Δ), 0, 254)`, and the same for `r`. A point exactly on the east or south edge therefore falls in the last cell with `u = 1` or `v = 1`.
- `sample(x, z)` clamps `(x, z)` into [−1000, 1000] and returns the height at the clamped point. `isInside(x, z)` reports whether the point is within the region.
- Gameplay never relies on the clamping, because the movement boundary is ±950 m. Clamping only guarantees that a query never fails.
- Non-finite input makes the dev build assert and the prod build return `NaN`. Callers validate their own inputs.

### 7.5 Slope and normals

- `slopeAt(x, z)` uses the **face normal of the containing triangle**, which is exactly what the player is standing on. It drives walkability and placement.
- Smooth vertex normals (`computeVertexNormals`) are used only for lighting.

### 7.6 Additional walkable surface

The Crystal Lake surface is a flat disc: an anchor, a radius, and a height `h_lake`. The surface query returns `max(terrain, h_lake)` inside the disc. The rendered disc is generated from the same definition, so collision matches what is drawn.

### 7.7 Tests (M1, extended at M4)

All tests run in Node. Tolerances are 1e-4 m unless stated.

- **Grid points:** each grid vertex returns its stored height, including all four corners (±1000, ±1000).
- **Edges:** points along the north, south, east, and west edges, and points exactly at `u = 1` or `v = 1`.
- **Inside cells:** points on the diagonal (`u = v`) match from both sides. Points at the cell centre and on each triangle's interior agree with a three.js `Raycaster` hitting the **built mesh** (tolerance 1e-3).
- **Analytic planes:** a planar fixture tilted 30° returns the exact plane height, and `slopeAt` returns 30° ± 0.01°. A 60° ramp gives 60° ± 0.01°.
- **Out of bounds:** (±5000, 0) and (0, ±5000) return the clamped edge height, and `isInside` returns false. NaN input asserts in dev.
- **Determinism:** two independent builds produce byte-identical Float32 arrays.

---

## 8. Procedural generation and determinism

### 8.1 RNG and noise (shared from `src/lib/`)

- **`hash32(...ints)`:** an integer mixing hash built on `Math.imul`. Pure arithmetic.
- **`deriveSeed(regionSeed, streamName)`:** `hash32(regionSeed, fnv1a(streamName))`.
  - Each consumer gets its own **named stream**: `terrain.fbm`, `flora.glowFlower`, `flora.giantFlower`, `flora.tree`, `flora.rock`, `flora.pillar`, and `synthetic.dem`.
  - Adding or changing one consumer never shifts another consumer's numbers.
- **`mulberry32(seed)`:** a sequential generator, used only where order is naturally fixed.
- **Position-hashed randomness for placement:** jitter, scale, and rotation for candidate `(i, j)` come from `hash32(streamSeed, i, j)`. The result doesn't depend on loop order.
- **`createNoise2D(seed)`:** seeded 2D simplex with an fBm helper. It uses only `+ − × ÷`, `floor`, and precomputed constants.
- **Banned in deterministic layers:** `Math.random`, `Date`, and `performance.now` must not appear in `lib`, `geo`, `heightmap`, `content`, `terrain`, or `rules`. A test scans the source to enforce this.

### 8.2 Version and golden hashes

- `generatorVersion` is a code constant. A **golden-hash test** pins three FNV-1a hashes for Bandung:
  - the final heightfield
  - the terrain vertex colours
  - the vegetation instance matrices
- Changing generation code on purpose means bumping `generatorVersion` and updating the golden hashes in the same commit. An unintended change fails CI.
- Saves are not affected, because they store collectible IDs, and positions are re-validated on load (§13.4).

### 8.3 Determinism across browsers

- **Guarantee:** within one JavaScript engine, the same inputs produce identical outputs.
- **Goal:** Node and Chromium also produce bit-identical heightfields. That's why R1–R6 use only arithmetic, polynomial falloffs, and no `sin`/`cos`/`exp`/`pow`.
  - An e2e test compares the heightfield hash computed in Chromium with the Node golden hash (TO CHECK).
  - If they differ, the comparison falls back to a 1e-5 m tolerance. That has no gameplay impact, because anchors are snapped at load in whichever engine is running.
- Decoration such as instance rotations may use trigonometry, since tiny differences there don't matter.

### 8.4 Post-generation validation (R7, fatal on error)

- **Continuity:** the height difference between 4-neighbours is at most 13.6 m, i.e. slopes of 60° or less (COMPUTED as Δ·tan 60°). Craters are designed to respect this.
- **Flatten pads:** height deviation within the pad radius is ≤ 0.05 m, and slope is ≤ 2°.
- **Placement:**
  - Every anchor is inside the walkable boundary.
  - Spawn and portal are on pads.
  - Every collectible is 0.5 m or more above the surface, has no collider within 3 m, and is at least 100 m from every other collectible.

---

## 9. Rendering (lightweight by default)

### 9.1 Defaults

- **Renderer:** WebGL2, as required by recent three.js releases (TO CHECK against the pinned version).
- `antialias: true`, and pixel ratio = `min(devicePixelRatio, 1.5)`.
- **Shadows off** (`shadowMap.enabled = false`). **No post-processing.** No downloaded textures, models, or audio.
- Small textures generated at runtime are allowed and counted.
- **Lighting:** `MeshLambertMaterial` with flat shading and vertex colours, one `HemisphereLight`, and one `DirectionalLight`.
- **Fog:** linear `Fog`, matched to the sky horizon colour. The far distance is about 1,100 m (TARGET).

### 9.2 Terrain

- One mesh, one draw call, built from `HeightField`.
- 65,536 vertices, 130,050 triangles, `Uint16` indices.
- GPU data is about 3.1 MB: position, normal, and colour as float32 (2,359,296 B) plus the index buffer (780,300 B). COMPUTED.
- There is no chunking or LOD. The terrain is a single draw call either way, and from altitude nearly all of it is in view.

### 9.3 Vegetation

**Species (MVP: 5).** All numbers are TARGETs. "Band" is the normalised baseline height `b̂`.

| Species | Triangles | Instance cap | Placement cell | Band | Max slope | Visible within |
|---|---|---|---|---|---|---|
| Glow flower (small) | ≤ 24 | 4,000 | 14 m | 0.0–0.8 | 25° | 250 m |
| Giant flower | ≤ 120 | 1,500 | 30 m | 0.1–0.7 | 20° | 700 m |
| Round tree | ≤ 80 | 2,500 | 25 m | 0.3–1.0 | 30° | 900 m |
| Rock | ≤ 20 | 1,200 | 35 m | any | 45° | 600 m |
| Ruin pillar | ≤ 40 | 300 | 80 m | 0.2–0.9 | 15° | 900 m |
| **Total** | | **9,500** (cap 10,000) | | | | |

**Placement rules.** These are deterministic and pure; they live in `terrain/placement.ts` and are tested in Node.

1. Each species has its own lattice of placement cells over the walkable area. Candidate `(i, j)` = cell centre + jitter from `hash32(streamSeed, i, j)`.
2. A candidate is rejected if any of these hold:
   - it is outside its height band or over its slope limit
   - the density mask is below threshold (`noise(streamSeed)`, for meadow and forest clumps)
   - it falls inside an exclusion zone: flatten pads, the lake disc, collider footprints + 2 m, or within 3 m of a collectible
   - it fails the acceptance probability `hash < density`
3. If the cap is exceeded, keep the candidates with the lowest hash values. This is order-independent.
4. Y is the surface height minus a small sink. Scale and yaw come from the hash.

**Instancing and visibility.**

- The region is divided into 4×4 visibility cells of 500 m each. Each (cell, species) pair gets one `InstancedMesh`, giving at most 80.
- Every instanced mesh of a species shares **one geometry and one material**. Tint variation comes from `instanceColor`. **There are no per-instance materials and no per-instance `Mesh` objects.**
- Frustum culling uses each `InstancedMesh`'s bounding sphere.
- Once per frame, distance culling sets `visible = false` on any (cell, species) mesh whose cell bounding box is further than that species' visible distance from the camera.
- Optional wind sway (an `onBeforeCompile` injection on the shared species material) is decoration only. It is cut first if frame time is over target.

### 9.4 Other scene objects (draw calls are TARGETs)

| Object | Approach | Draw calls |
|---|---|---|
| Sky dome | Gradient `ShaderMaterial` with sun disc | 1 |
| Mist sea | Large plane at y = −10 | 1 |
| Crystal Lake | Opaque disc, same definition as the walkable surface | 1 |
| Petals / pollen | One `Points` object of ~1,500 points that follows the camera; the shader makes them round, with no texture | 1 |
| Flora Spirits ×5 | Instanced cores, glow quads, and light pillars. The pillars use `fog: false` so they stay visible as beacons. Collected spirits get scale 0 | 3 |
| Portal (Petal Gate) | Ring + swirl disc shader | 2 |
| Landmarks ×3 | Mother Bloom (head uses `fog: false` as a region-wide beacon), crystal spires (instanced), Greenhouse | ≤ 12 |
| Player + glider | Primitives | ≤ 6 |

The material target is **≤ 20 unique materials**, checked with a structural test.

### 9.5 Infrastructure deliberately left out

These are not built unless a measurement points to them:

- **Terrain LOD or chunking:** only if the frame benchmark shows terrain is the bottleneck. That means toggling the terrain off recovers more than 30% of frame time on the reference machine.
- **Streaming:** not applicable to a single 2 km region.
- **Floating origin:** unnecessary, since float32 resolution at ±1000 m is 6.1e-5 m (§4.4).
- **Web Worker generation:** only if the main thread is blocked for more than 1 s during a load (§10.4).
- **Physics engine, post-processing, shadows:** never in the MVP.

---

## 10. Performance budgets and measurement

### 10.1 Budget table

KB here means 1,024 bytes. The reference machine is decision D4 in §18.

| Budget | Counts | Excludes | Measured how | Enforced | Limit | When exceeded |
|---|---|---|---|---|---|---|
| **Initial JS** | Every `.js` file loaded by `index.html` in the **production** build: the entry chunk, statically imported chunks, and modulepreloads | Source maps; the e2e build with test hooks; dynamic chunks (none expected — if one appears, it gets its own limit) | `tools/check-budgets.ts` compresses each file with Node `zlib` gzip level 9 and sums the sizes | CI, after `vite build` | **409,600 B** (warning at 90%) | CI fails, see §10.7 |
| **CSS** | All emitted `.css`, gzip -9 | — | Same script | CI | 20,480 B | CI fails |
| **Region data** | Every file under `public/regions/<id>/`, as raw bytes on disk | Previews in `tools/out/`, the tile cache, and the region config (which counts toward JS) | `fs.stat` | CI | **102,400 B per region** | CI fails |
| **Downloaded media** | Image, model, audio, and font files in `dist/` | One favicon SVG | Extension scan | CI | 0 | CI fails |
| **Runtime dependencies** | `dependencies` in `package.json` | `devDependencies` | Unit test | CI | Exactly `three`, `react`, `react-dom` | CI fails; changing the list requires a plan update |
| **Terrain mesh** | Vertex and triangle counts, index type | — | Unit test on the built geometry | CI | 65,536 / 130,050 / Uint16 | CI fails |
| **Vegetation instances** | Total instances placed for Bandung | — | Unit test on the placement output | CI | ≤ 10,000 | CI fails |
| **Draw calls per frame** | `renderer.info.render.calls` | — | e2e at 5 scripted camera poses (§10.5) | CI (headless) | ≤ 150 | CI fails |
| **Triangles per frame** | `renderer.info.render.triangles` | — | Same | CI (headless) | ≤ 600,000 | CI fails |
| **GPU resource leaks** | `renderer.info.memory.geometries` and `.textures` | — | e2e: load, then `reloadRegion()` 3 times | CI | Counts equal after each reload | CI fails |
| **Generation time** | CPU time from heightmap bytes in memory to "scene ready". Fetch and first-frame shader compilation are measured separately | Network | `?bench=gen` (§10.4) | Manual, on the reference machine, at M1/M4/M7/M9. CI only warns | TARGET: median ≤ 300 ms, p95 ≤ 500 ms. CI warns above 1,500 ms | §10.4 fallbacks |
| **Frame time** | `requestAnimationFrame` deltas along the scripted path | The first 5 s of warm-up | `?bench=frame` (§10.5) | Manual, on the reference machine, at M7 and M9 | TARGET: median ≤ 16.7 ms, p95 ≤ 25 ms | §10.5 fallbacks |

CI's headless Chromium most likely renders in software (TO CHECK), so **CI never measures FPS or GPU time.** It only checks counts and sizes, which are deterministic.

### 10.2 Why the size budgets look achievable (ESTIMATE, to be measured at M0 and M8)

- **JS:** three.js with tree-shaking plus React and ReactDOM is expected to come to roughly 180–230 KB gzipped, and game code another 30–60 KB, for a total estimate of about 210–290 KB. This has not been measured.
- **Region data:** 65,536 B for the binary plus about 2 KB of JSON, which is about 66% of the budget (COMPUTED for the binary, ESTIMATE for the JSON). The 16-bit option does **not** fit uncompressed (§5.4).

### 10.3 Are the terrain and vegetation figures reasonable? (to be verified at M1 and M7)

- **Terrain:** 130,050 triangles in one draw call, about 3.1 MB on the GPU (COMPUTED). This is expected to be a small load for any desktop GPU from 2020 or later (ESTIMATE). **It is verified only when the M1 frame check passes on the reference machine.**
- **Vegetation, worst case if every instance were drawn:** 96k + 180k + 200k + 24k + 12k = 512k triangles (COMPUTED from the caps). Distance limits and frustum culling should bring a typical frame to around 150–350k (ESTIMATE). The ≤ 600k per-frame limit is enforced at fixed poses in CI (§10.1).
- **Where it is more likely to be slow:** on integrated GPUs, fill rate (MSAA at 1.5× pixel ratio, the transparent mist plane, glow quads, and petals) is more likely to cost frame time than vertex count (ESTIMATE). The benchmark path therefore includes a low pass through petals and glow.

### 10.4 Generation benchmark

- **Setup:**
  1. Run a production build with `vite build && vite preview` in Chrome stable on the reference machine.
  2. Close other tabs and use the default window size.
  3. Open the page with `?bench=gen`.
- **Run:** the game regenerates Bandung 11 times from bytes already in memory, discarding the first run as warm-up.
  - It records each pipeline stage with `performance.measure`: decode, baseline, smooth, noise, modifiers, colours, mesh, normals, placement, anchors, validation, GPU upload.
  - It reports the median and p95 of the total plus per-stage medians as a downloadable JSON file, which goes into the measurement log (§10.8).
- **If the target is missed, apply these fallbacks in order:**
  1. Profile and fix the hotspots.
  2. Reduce the fBm octave count. This changes how the terrain looks, so it needs a golden-hash bump.
  3. Make placement cells coarser.
  4. Move generation into a Web Worker. Only do this if the main thread blocks for more than 1 s; it keeps the UI responsive but doesn't cut total time.
  5. Accept the result: generation runs once per load, behind the loading screen, so up to 1 s median is acceptable if it is logged. **Above 1 s, one of steps 1–4 is mandatory.**

### 10.5 Frame benchmark

- **Setup:** same as §10.4, but with `?bench=frame`.
- **The scripted, deterministic 60 s camera path:**
  - Spawn.
  - A low flight over the densest glow-flower cell.
  - Through the petal volume.
  - Hover at Crystal Lake.
  - Circle the Mother Bloom.
  - A high-altitude view of the whole region (the worst case for draw calls).
- **Output:** median and p95 frame time, the maximum draw calls and triangles, and the JS heap size (where `performance.memory` exists). The first 5 s are excluded.
- **The same path's 5 key poses** are used for the CI count checks in §10.1.
- **If the target is missed, apply these fallbacks in order:**
  1. Lower the pixel ratio cap: 1.5 → 1.25 → 1.0.
  2. Turn off MSAA.
  3. Cut vegetation density by 25%, then by 50%.
  4. Shorten each species' visible distance and pull the fog in to match.
  5. Lower each species' triangle count.
  6. Remove wind sway.
  7. Only if the measurements single out terrain (§9.5), consider terrain LOD.

### 10.6 Exceeding a size budget

1. CI fails. Nothing merges over budget.
2. Find the cause. For JS, Vite's per-chunk size output plus the budget script's per-file table should be enough. A bundle visualiser may be added as a dev dependency **only** if those two can't explain it.
3. Fix it, or propose a budget change.

### 10.7 Budget change log

Changing a budget requires the measured numbers, the reason, and user approval, recorded here.

| Date | Budget | Old | New | Measured | Reason | Approved by |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — |

### 10.8 Measurement log

No measurement on the **reference machine** has been taken yet; D4 (which machine) is still open. The rows below come from the cloud development container: headless Chromium 141 with **software WebGL (SwiftShader)**. They are **not** pass/fail measurements for the frame or generation targets. Size and count rows are deterministic and do count.

| Date | Milestone | Machine / browser | Metric | Result | Pass? |
|---|---|---|---|---|---|
| 2026-10-04 | M8 | `vite build` (prod) | Initial JS, gzip -9 | 229,789 B of 409,600 B | Yes |
| 2026-10-04 | M8 | `vite build` (prod) | CSS, gzip -9 | 1,961 B of 20,480 B | Yes |
| 2026-10-04 | M8 | repo | Region data `bandung` (raw) | 66,831 B of 102,400 B | Yes |
| 2026-10-04 | M8 | repo | Downloaded media files | 0 | Yes |
| 2026-10-04 | M7 | headless Chromium, 960×600 | Draw calls / triangles at CI poses 0, 1, 3, 4, 5 | 39 / 207,884 · 31 / 211,434 · 36 / 193,806 · 33 / 210,052 · 36 / 207,446 | Yes (≤ 150 / ≤ 600k) |
| 2026-10-04 | M7 | headless Chromium, 1280×720 | `?bench=frame` max draw calls / triangles along path | 41 / 231,496 | Yes |
| 2026-10-04 | M7 | Node test | Unique materials in the region scene | 16 | Yes (≤ 20) |
| 2026-10-04 | M7 | Node test | Flora instances / instanced meshes | 7,307 / 76 | Yes (≤ 10,000 / ≤ 80) |
| 2026-10-04 | M1 | headless Chromium (SwiftShader) | `?bench=gen` generation (CPU, R1–placement) | median 66.8 ms, p95 166.1 ms | Not judged (non-reference) |
| 2026-10-04 | M1 | headless Chromium (SwiftShader) | `?bench=gen` scene build / first render / total | median 92.8 / 123.2 / 277.5 ms; total p95 394 ms | Not judged (non-reference) |
| 2026-10-04 | M7 | headless Chromium (SwiftShader), 1280×720 | `?bench=frame` frame time | median 462.6 ms, p95 981.1 ms | Not judged: software rendering, not a GPU measurement |
| 2026-10-04 | M7 | headless Chromium (SwiftShader) | JS heap during frame bench | 14 MB | Info |

---

## 11. Architecture

### 11.1 Dependencies

| Kind | Packages |
|---|---|
| **Runtime** (`dependencies`, allowlist-tested) | `three`, `react`, `react-dom`. Exact versions are pinned and the lockfile is committed |
| **Dev only** (`devDependencies`) | `vite`, `@vitejs/plugin-react`, `typescript`, `@types/three`, `@types/react`, `@types/react-dom`, `vitest`, `@playwright/test`, `pngjs` + `@types/pngjs` (bake tool only), `tsx` only if Node type stripping turns out insufficient |
| **Not added without a demonstrated need** | zod, ESLint plugins, state libraries, react-three-fiber, physics, post-processing, noise libraries, bundle visualiser |

### 11.2 Layers and dependency direction

Imports may only point **down** this table. A Vitest test scans the import statements and enforces it, so no ESLint is needed.

| Layer | Directory | Responsibility | May import | three.js / DOM? |
|---|---|---|---|---|
| L0 | `src/lib` | rng, hash, noise, math, coded errors (`GameError`) | — | No |
| L1 | `src/geo` | `GeoPoint`/`WorldPoint`, frames and heading, projection | L0 | No |
| L1 | `src/heightmap` | Codec (u8/u16), metadata schema and validation | L0, `geo` types | No |
| L2 | `src/content` | `RegionDefinition` types, `bandung.ts`, registry (with the Jakarta preview entry), `validate.ts` | L0–L1 | No |
| L2 | `src/terrain` | Pipeline R1–R7, `HeightField`, surface query, biome colours, placement, anchor resolution | L0–L2 | No |
| L2 | `src/rules` | Collectible rules, progression derivation, save schema, migrations, and repository (storage injected) | L0–L2 | No |
| L3 | `src/bridge` | `UiState`, `createStore`, `GameCommands` interface | L0, L2 (`content`, `rules` types) | No |
| L4 | `src/engine` | Renderer, loop, input, `WorldManager`, terrain mesh, flora, atmosphere, landmarks, player, camera, systems, audio, debug panel, test hooks | L0–L3 | Yes (three.js) |
| L4 | `src/ui` | React components and the `useStore` hook | L3 only | DOM / React, never three.js |
| L5 | `src/main.tsx` | Composition root | All | — |
| dev | `tools/` | `bake-region.ts`, `gis/` (Mercator, tiles, mosaic), `check-budgets.ts` | `src` L0–L2 | Node |

`src/` never imports from `tools/`. Because the codec and the projection are shared, encoding and decoding are symmetric and tested once.

### 11.3 Mapping to the GDD §9.2 modules

| GDD module | Implementation |
|---|---|
| WorldManager | `engine/world/WorldManager.ts`: load → generate → build → dispose. Disposal is verified by the leak check |
| GISPipeline | Offline: `tools/bake-region.ts` + `tools/gis/`. Runtime: `heightmap/` loader + `geo/projection.ts` |
| TerrainGenerator | `terrain/` (pure pipeline + `HeightField`) + `engine/world/TerrainMesh.ts` |
| BiomeGenerator | `terrain/biome.ts` (colours) + `terrain/placement.ts` (pure) + `engine/world/Flora.ts` (instancing) |
| PlayerController | `engine/player/` (walk, flight, transitions) |
| CameraController | `engine/camera/` |
| ExplorationSystem | Optional (after M8): `rules/exploration.ts` + engine glue |
| CollectibleSystem | `rules/collectibles.ts` + `engine/systems/CollectibleSystem.ts` |
| PortalSystem | `rules/progression.ts` + `engine/systems/PortalSystem.ts` |
| ProgressManager | `rules/save.ts` + `engine/systems/ProgressManager.ts` |
| UIManager | `ui/` + `bridge/` |

### 11.4 Engine ⇄ React bridge

- **`createStore<UiState>()`** exposes `getSnapshot()` (an immutable object, replaced on change), `subscribe(fn)`, and `set(partial)`.
  - `set` publishes only if a shallow comparison finds a change, and at most once per frame.
- **`UiState`:** `screen` (`start | loading | playing | paused | menu | error`), the loading stage, region name and title, movement mode, collected/total, the prompt, `portalActive`, toasts, teleport options (`{ id, name, status, available }`), and the current error.
- **`useStore(selector)`** wraps `useSyncExternalStore`. Selectors return primitives or stable references, so a component only re-renders when its own slice changes.
- **`GameCommands`** (`start`, `interact`, `teleport(id)`, `closeMenu`, `retry`) is implemented by the engine and passed to the UI through React context. The UI never touches three.js.
- **Pointer lock:** when the lock is lost (for example, Esc), `screen` becomes `paused` and shows a "click to resume" overlay. Opening a menu releases the lock and pauses gameplay input.

### 11.5 Region configuration and validation

- A region is a typed object in `content/regions/<id>.ts` (GDD §9.3), validated by `content/validate.ts`.
- Static checks run in CI for every registered region, and again at runtime before loading:
  - The ID matches `^[a-z]+$`, and the seed is a uint32.
  - The bounds pass V1.
  - Every anchor is inside the bounds.
  - There are **exactly 5 collectibles** per playable region. IDs match `^<regionId>\.[a-z]+\.[a-z0-9-]+$` and are unique across the whole registry.
  - There are at least 3 landmarks.
  - Modifier parameters are positive.
  - `unlock.requires` refers only to existing IDs, the progression graph has no cycles, and exactly one region has an empty `requires` (Bandung).
  - The heightmap metadata matches the region (ID and bounds).
- Generated checks (§8.4) run after generation. Both kinds of check report every issue with a path (e.g. `collectibles[3].anchor`), not just the first one.

### 11.6 Error reporting

Errors have the shape `GameError { code, message, details?, fatal }`.

| Code | Fatal? | Player sees |
|---|---|---|
| `WEBGL2_UNAVAILABLE` | Yes | Error screen: unsupported browser |
| `CONFIG_INVALID` | Yes | Error screen with the code. Should never happen in a release, because CI validates configs |
| `HEIGHTMAP_FETCH_FAILED` | Yes | Error screen with Retry |
| `HEIGHTMAP_INVALID` (length, schema, or metadata mismatch) | Yes | Error screen with the code |
| `GENERATION_INVALID` (R7) | Yes | Error screen with the code |
| `SAVE_CORRUPT` / `SAVE_INCOMPATIBLE` | No | One notice: "Saved progress couldn't be read and was backed up; starting fresh" |
| `SAVE_WRITE_FAILED` | No | One notice: "Progress can't be saved in this browser session" |
| Uncaught exception or rejection | Fatal during load; logged otherwise | Error screen or console |

Every error is also written to the console with its code. The e2e test fails on any `console.error` or uncaught exception.

### 11.7 Test hooks

- `window.__otherworld` provides:
  - `getState`, `warpTo(id | point)`, `interact`, `toggleMode`
  - `reloadRegion`, `heightfieldHash`, `rendererInfo`
  - `setPose(n)` for the benchmark and CI poses
- It is compiled only when `VITE_TEST_HOOKS=true`, i.e. in the e2e build. The budget script fails if the string `__otherworld` appears in the production bundle.

---

## 12. Gameplay

### 12.1 Controls (revised from GDD §11.1, pending D2)

| Key | GDD | Plan | Note |
|---|---|---|---|
| W/A/S/D | Move | Walking: camera-relative movement. Flying: W thrust, S brake, A/D strafe (with visual bank) | — |
| Mouse | Rotate or aim camera | Walking: orbit the camera. Flying: set heading and pitch | Pointer lock |
| Space | Jump / ascend | Same | Default scrolling is prevented |
| Shift | Sprint / accelerate | Same | — |
| **Ctrl** | Descend | **C (proposed)** | Ctrl+W, Ctrl+D and similar are browser shortcuts. While holding W, pressing Ctrl may close the tab, and pages generally can't block that (TO CHECK per browser). Needs approval (D2) |
| F | Toggle walk/fly | Same; ignored during a transition | — |
| E | Interact | Same; prompt shown for the nearest eligible target only | — |
| M | Map | Only active if the optional map is built (D3) | — |
| Esc | Close menus | Closes menus. When playing, the browser always releases pointer lock on Esc, and the game treats that as pause | Browser behaviour |

### 12.2 Walking (all numbers are tuning TARGETs)

- Walk 6 m/s, sprint 11 m/s, acceleration time constant 0.12 s.
- Jump 7 m/s, gravity 25 m/s².
- Maximum walkable slope is 50°, measured with `slopeAt` (the triangle normal). Uphill velocity is removed beyond it.
- Snap to the ground within 0.5 m when going downhill. Capsule radius is 0.4 m.
- Landmark colliders are vertical cylinders only, resolved with an XZ push-out. Flora has no collision.
- A soft push-back keeps the player within ±950 m.
- The variable time step is clamped at 50 ms. Tests use fixed steps.

### 12.3 Flying (arcade, all TARGETs)

- Cruise 25 m/s, boost 60 m/s. Velocity follows an exponential response, with a 0.6 s time constant when accelerating and 1.0 s when slowing to a hover.
- Vertical speed 12 m/s (Space/C). Pitch is clamped to ±60°.
- **Forgiving rules:**
  - Hovering is allowed.
  - Ground clearance is at least 2 m, kept with a soft upward push. The glider never crashes.
  - The ceiling is the highest terrain + 200 m.
  - A soft push-back keeps it within ±950 m.
- **Feedback:**
  - Visual bank of up to 30°, proportional to yaw rate.
  - FOV widens from 60° to 72° with speed.
  - Wind streaks appear while boosting.
- **Vehicle:** a petal glider built from primitives, authored facing −Z.

### 12.4 Mode switching (GDD §5.4)

- **Walk → fly ("takeoff"):** eases up to the surface + 4 m over 0.4 s.
- **Fly → walk ("landing"):** descends at `clamp(2 × height above ground, 15, 80)` m/s, then snaps onto the surface (or the Crystal Lake surface) and hands control to walking.
- **Interaction is locked** during both transitions and for 0.5 s afterwards. F presses are ignored during a transition.
- **Invariant, checked every frame and tested:** `player.y ≥ surface(x, z) − 1e-3`.

### 12.5 Camera

- Third-person orbit. Arm length is 6 m walking and 12 m flying, with a 0.1 s smoothing time constant.
- Pitch is clamped to [−70°, +60°] while walking.
- **Terrain clearance:** sample the surface at 4 points along the arm, and shorten the arm until every point is at least 0.5 m above the surface.
- Collider occlusion isn't handled in the MVP. It's covered by the manual checklist.

### 12.6 Collectibles and portal

- **Interaction:** the interaction radius is 5 m in both modes (TARGET).
- **Collecting** (idempotent: an ID already in `collected` is ignored) triggers:
  - a particle burst
  - a chime synthesised with WebAudio
  - a toast
  - a HUD update to `n / 5`
  - **an immediate save**
- **Portal, dormant:** pressing E shows "The Petal Gate is sealed — n / 5 Flora Spirits".
- **Portal, active (5/5):**
  - Collecting the fifth spirit shows the completion message ("Bandung restored — the Petal Gate awakens"), and the swirl disc turns on.
  - E then opens the **Teleport menu**.
- **Teleport menu (GDD §5.7):**
  - Bandung: *completed*, marked as the current region.
  - Jakarta: *unlocked — not yet available in this build* (the preview from GDD §12.3).
  - There are no other entries in the MVP.
- In the MVP, no player-facing action loads a different region. `WorldManager`'s load and dispose path is exercised by `reloadRegion()` in tests (GDD §7.5).

### 12.7 Bandung content

Landmarks are fictional (GDD §4.1). The geo anchors stay provisional until M9 retuning, but **IDs are stable from M5.**

| ID | Name | Placement intent | Silhouette / collider |
|---|---|---|---|
| `bandung.landmark.blooming-highlands` | Blooming Highlands | Northern highland slopes | Mother Bloom: a ~60 m flower with a fog-exempt glowing head. Stem collider |
| `bandung.landmark.crystal-lake` | Crystal Lake | `basin` modifier in the low central valley | Walkable crystal disc and an instanced ring of spires. Spire colliders |
| `bandung.landmark.ancient-greenhouse` | Ancient Greenhouse | Eastern hilltop | Half-ruined geodesic dome. Pillar colliders |
| `bandung.portal` | Petal Gate | Flattened pad near spawn, in the basin centre | Ring. Collider on the ring posts |

**Flora Spirits:** `bandung.flora.rose`, `.orchid`, `.jasmine`, `.lotus`, `.hibiscus`. Three are at the landmarks; two are in secluded spots (a crater rim and a southern valley).

**Palette:** greens, pinks, purples, and soft blues; lavender-blue fog; a warm, low morning sun.

---

## 13. Persistence

### 13.1 Schema v1

```ts
interface SaveV1 {
  schemaVersion: 1;
  savedAt: string;                         // ISO; informational only
  collected: string[];                     // AUTHORITATIVE
  visitedRegions: RegionId[];              // authoritative for "visited"
  currentRegionId: RegionId;               // convenience
  player: { regionId: RegionId; x: number; y: number; z: number;
            headingRad: number; mode: 'walk' | 'fly' } | null;  // convenience, validated on load
}
```

- The key is `otherworld.save`, with the backup at `otherworld.save.backup`.
- If the optional discovery or fog-of-war features are built, they come in a v2 schema with a migration that adds `discoveredLandmarks` and `explored`. **v1 has no fields reserved for features that don't exist.**

### 13.2 Authoritative and derived data

| Data | Status | Rule |
|---|---|---|
| `collected` | Authoritative | Treated as a set. Unknown IDs are kept, for forward compatibility, but ignored |
| Region completed | Derived | Every collectible ID defined for the region is in `collected` |
| Region unlocked | Derived | Every region in `unlock.requires` is completed. Bandung is always unlocked |
| Region visited | Authoritative | Listed in `visitedRegions` |
| Displayed status | Derived | completed > visited > unlocked > locked |
| Portal active | Derived | The current region is completed |
| Progress `n / 5` | Derived | Size of the region's IDs ∩ `collected` |

This is how GDD §9.4's "unlocked regions" and "completed regions" are preserved. Because they are always recomputed from `collected`, they can never contradict it.

### 13.3 Load, migration, and corruption

1. **Read the key.** If it is missing, start a new game. If reading throws (storage disabled), keep progress in memory only and show `SAVE_WRITE_FAILED` once.
2. **Parse the JSON.** If it fails, or the result isn't an object with a numeric `schemaVersion`, it's corrupt: copy the raw text to `.backup`, start fresh, and show `SAVE_CORRUPT`.
3. **If `schemaVersion` is newer than this build supports:** back it up, start fresh, and show `SAVE_INCOMPATIBLE`. **Never overwrite a newer save without backing it up first.**
4. **Migrate.** Run the ordered pure functions `migrations[v]: Save_v → Save_{v+1}`. v1 has none. The framework itself is unit-tested with a fixture schema.
5. **Normalise.** Remove duplicates and drop malformed entries.

### 13.4 Writing and restoring

- **Writes happen:**
  - immediately on collect
  - on first visit to a region
  - every 10 s, if the player has moved more than 5 m
  - on `visibilitychange` → hidden
  - on `pagehide`
- Each write serialises the whole object, wrapped in try/catch.
- **The saved position is restored only if all of these hold:**
  - it's in the current region and inside the ±950 m boundary
  - it's at least `surface − 1e-3`
  - it's not inside a collider
  - all values are finite
- Otherwise the player starts at spawn. A saved `fly` mode starts as a normal flight; it doesn't play the takeoff.

---

## 14. Automated checks

| Check | Kind | Introduced |
|---|---|---|
| Typecheck (`tsc --noEmit`), production build | CI | M0 |
| Size budgets: initial JS, CSS, region data, media, test hooks absent from the prod bundle | CI script | M0 |
| Runtime dependency allowlist; import-direction rules; banned APIs in deterministic layers | Unit | M0 |
| e2e boot: page loads, canvas present, no console errors | Playwright | M0 |
| Projection, frames, heading; heightmap codec and metadata | Unit | M1 |
| **Terrain sampling** (§7.7); mesh counts and bounding box; orientation fixture (V8) | Unit | M1 |
| **Deterministic generation:** golden hashes; stream isolation (§8.1) | Unit | M1 (heightfield) → M4 (transforms) → M7 (placement) |
| Bake pure functions: V4–V7, plus V11 against fixtures | Unit | M1 |
| Movement invariants, slope limit, camera clearance | Unit (simulation) | M2 / M3 |
| Post-generation validation (§8.4) for Bandung | Unit | M4 |
| **Collectible uniqueness:** exactly 5 per region, global ID uniqueness, spacing | Unit | M5 |
| **Region unlock rules:** progression derivation, graph validity | Unit | M5 |
| Full-loop e2e: collect 5 → portal active → teleport menu statuses | Playwright | M5 |
| **Save/load:** round trip, corruption, newer version, write failure, position validation | Unit + Playwright (reload) | M6 |
| Rendering counts at 5 poses; GPU leak check; material count | Playwright + unit | M7 |
| Chromium heightfield hash matches the Node golden hash (§8.3) | Playwright | M7 |
| Real-data GIS validation V1–V13 | Bake run + unit (on committed output) | M9 |

**CI order:**

1. `npm ci`
2. Typecheck
3. Unit tests
4. Production build
5. Budget check
6. e2e build with test hooks
7. Playwright run against `vite preview`
8. Deploy, from M8, only from the main branch, and only once hosting is decided (D5)

---

## 15. Milestones

The weekend in GDD §13 is the target pace, but the milestone gates take priority: per GDD §16, a polished single region is preferred over speed. As a rough mapping: Saturday morning ≈ M0–M1, Saturday afternoon ≈ M2–M3, Sunday morning ≈ M4–M5, Sunday afternoon ≈ M6–M8. M9, real data, comes after the synthetic slice works.

Each milestone has to meet its acceptance criteria (§16) before the next one starts.

### M0: Skeleton and guardrails
- **Scope:**
  - Scaffold Vite, React, TypeScript, and three.js with versions pinned.
  - An empty scene.
  - The bridge store and the start screen.
  - The CI pipeline (§14, steps 1–7).
  - The budget script, the allowlist, the import-direction test, and the banned-API test.
- **Fallback:** if Playwright can't run in CI, run e2e locally and attach the results to the PR. Typecheck, unit tests, build, and budget checks stay mandatory.

### M1: Synthetic terrain and coordinate proof
- **Scope:**
  - `lib`, `geo`, `heightmap`, and the synthetic bake.
  - Pipeline steps R1–R3 (no noise or modifiers yet).
  - `HeightField` and `TerrainMesh`.
  - Debug panel (F3): FPS, draw calls, triangles, xyz, lat/lon, heading, compass.
  - A debug free camera using three.js's bundled `OrbitControls` addon, dev only.
  - `?bench=gen`.
- **Fallback:** an orientation, dimension, or sampling failure **blocks** progress; there is no workaround. If the benchmark misses its target, log it and continue (generation only runs at load; §10.4 applies).

### M2: Walking and camera
- **Scope:** input with pointer lock, a loop with clamped time step, `WalkController`, `CameraController`, edge push-back, a placeholder avatar, and the pause overlay.
- **Fallback:** if arm sampling can't prevent camera clipping, raise the clearance or shorten the arm. The tested invariant does not change.

### M3: Flight and mode switching
- **Scope:** `FlightController`, takeoff and landing transitions, the interaction lock, and the glider placeholder.
- **Fallback:** if automatic landing feels bad, switch to manual descent with C and an automatic snap below 3 m. The invariant still applies.

### M4: Fantasy transforms and anchors
- **Scope:**
  - Pipeline steps R4–R7: noise mask, modifiers, edge falloff, validation.
  - The Crystal Lake walkable disc.
  - Anchor resolution.
  - A draft of the Bandung config on synthetic terrain.
- **Fallback:** if continuity or pad checks fail, widen falloffs or lower intensity (config only). If that isn't enough, remove that modifier for the MVP.

### M5: Collectibles, portal, progression, and HUD
- **Scope:**
  - `rules/collectibles` and `rules/progression`.
  - The registry, including the Jakarta preview entry.
  - The engine systems.
  - HUD: region, mode, `n / 5`, prompt, heading.
  - The completion message, the Teleport menu, the synthesised chime, and placeholder visuals for spirits and portal.
- **Fallback:** if pointer lock isn't available in headless Chromium (TO CHECK), e2e drives the game through test hooks. Pointer-lock behaviour then moves to the manual checklist.

### M6: Persistence
- **Scope:** `rules/save` (schema, migration framework, repository), `ProgressManager`, the write policy, and position restore.
- **Fallback:** none needed. Storage being unavailable is handled behaviour (§13.3), not a failure.

### M7: Vegetation, landmarks, and atmosphere
- **Scope:**
  - The 5 flora generators, placement, instanced cells, and distance visibility.
  - The 3 landmarks with colliders.
  - Final spirit and portal visuals.
  - Sky, fog, mist sea, and petals.
  - Wind sway, optional.
  - `?bench=frame` and the CI pose checks.
- **Fallback:** the §10.5 levers, applied in order. The levers are config defaults, not a settings menu.

### M8: Synthetic vertical slice complete
- **Scope:** start, loading, and error screens; manual playtest; deploy workflow (if D5 is decided); the full GDD §16 run-through.
- **Fallback:**
  - If hosting isn't decided, CI publishes the build artifact and the demo runs with `vite preview`. The GDD §16 criterion 10 stays open.
  - GDD §12.2's "real geographic elevation" stays open until M9.

### M9: Real Bandung elevation
- **Entry gate:** the §6.5 licensing sign-off is recorded in §19.
- **Scope:**
  - Real mode of the bake tool, with V1–V13.
  - Swap in the real heightmap.
  - Retune `verticalScale`, noise, and anchors (IDs unchanged).
  - Update the golden hashes with a `generatorVersion` bump.
  - Add `ATTRIBUTION.md` and an in-game credits line on the start screen.
  - Re-run every test and both benchmarks.
- **Fallback:**
  - If the licence isn't approved or GIS validation can't pass: ship synthetic terrain and record a deviation from GDD §12.2 (D1).
  - If the quantisation checks fail: switch to 16-bit (§5.4). That needs budget decision D6.

---

## 16. Acceptance checklist

Every box must be ticked before the next milestone starts. Items marked *(manual)* need a person, and their evidence (screenshots or logs) goes into the PR.

### M0: Skeleton and guardrails
- [x] `npm run typecheck` reports 0 errors, and `npm run build` succeeds.
- [x] The budget script prints sizes for initial JS, CSS, region data, and media. A deliberately oversized fixture makes it fail (the script tests itself).
- [x] `dependencies` is exactly `three`, `react`, `react-dom`, with exact versions.
- [x] The import-direction test and the banned-API test pass, and each fails on a planted violation.
- [x] The production bundle doesn't contain `__otherworld`.
- [x] e2e: the page loads, a canvas exists, the start screen is visible, and there are 0 console errors.

### M1: Synthetic terrain and coordinate proof
- [x] Projection tests pass: the four corners and the centre map exactly, round trips are within 1e-9°, and the heading convention holds (θ = 0 → −Z, θ = π/2 → +X).
- [x] The orientation fixture's north-east maximum appears at x > 0, z < 0 (V8).
- [x] The mesh has 65,536 vertices, 130,050 triangles, and `Uint16` indices, and its bounding box is x, z ∈ [−1000, 1000] ± 1e-3.
- [x] All §7.7 sampling tests pass, including corners, edges, diagonals, the 30° and 60° plane slopes, out-of-bounds queries, and the comparison against the mesh with `Raycaster`.
- [x] Codec tests pass: the round trip is exact, and a wrong length gives `HEIGHTMAP_INVALID`.
- [x] The heightfield golden hash is stable across two runs.
- [x] Bake functions V4–V7 pass on fixtures.
- [ ] *(manual)* Seen from above with the compass, the debug "N" pole is at −Z and the fixture marker is in the north-east.
- [ ] *(manual)* `?bench=gen` has been run on the reference machine and the result is logged in §10.8. The target doesn't have to be met at this stage, but a miss must be recorded.

### M2: Walking and camera
- [x] Simulation: 1,000 seeded starts × 600 frames at mixed time steps (1/30–1/144 s) with random input. The player never goes below `surface − 1e-3` or outside ±950 m, and no value becomes NaN.
- [x] On a 60° ramp fixture the player can't walk uphill. On a 30° ramp they can.
- [x] The camera is at least 0.5 m above the surface on every simulated frame.
- [ ] *(manual)* 5 minutes of play: no falling through the terrain, no camera clipping into it, movement is camera-relative, and losing pointer lock shows the pause overlay.

### M3: Flight and mode switching
- [x] Flight simulation over 1,000 seeds: altitude is always at least `surface + 2 − 1e-3`, never above the ceiling, and always within bounds.
- [x] Takeoff ends at least 3 m above the surface. Landing ends grounded (`|y − surface| < 1e-3`) within 6 s from the ceiling.
- [x] `interactionLocked` is true during transitions and for 0.5 s after. Interaction attempts while locked do nothing.
- [x] Pressing F every frame for 300 frames produces no NaN, never goes below the surface, and ends in a valid mode.
- [ ] *(manual)* Flight feels responsive and forgiving: smooth acceleration, readable banking, and FOV feedback.

### M4: Fantasy transforms and anchors
- [x] The final heightfield's golden hash is stable, and changing a `flora.*` stream seed doesn't change it.
- [x] Continuity holds: every 4-neighbour height difference is ≤ 13.6 m.
- [x] Pads deviate by ≤ 0.05 m with slope ≤ 2°. Terrain inside the lake disc is below the lake surface.
- [x] Every anchor passes §8.4 placement validation, and Bandung's config passes static and generated validation.
- [x] *(manual → automated)* Terrain is walkable from spawn to all 3 landmark sites without hitting a slope block (the flight fallback is allowed but not required). (`tests/unit/walkability.test.ts`: a breadth-first search on a 4 m lattice reaches all landmarks, spirits and the gate.)

### M5: Collectibles, portal, progression, and HUD
- [x] Bandung has exactly 5 collectibles, each ID is unique across the registry and correctly prefixed, and every pair is at least 100 m apart.
- [x] Collecting the same ID twice doesn't change the count. Interacting out of range or while locked does nothing.
- [x] At 4/5, the portal is inactive and Jakarta is locked. At 5/5, the portal is active and Jakarta is unlocked but not available. Collection order doesn't matter, and unknown IDs are ignored.
- [x] The graph has no cycles and exactly one start region.
- [x] e2e: warping to each spirit and interacting moves the HUD 1/5 → 5/5. The completion message appears, the portal becomes active, the Teleport menu shows Bandung *completed* and Jakarta *unlocked — not yet available*, and there are 0 console errors.
- [x] The HUD re-renders at most once per state change. A dev render counter over 300 frames of movement with no state change shows no extra renders. (CI measures 20 frames standing still, because 300 software-rendered frames exceed the test timeout.)

### M6: Persistence
- [x] Unit tests pass for:
  - round trip and duplicate removal
  - corrupt JSON → backup + fresh save + one notice
  - newer `schemaVersion` → backup + fresh save + notice
  - `setItem` throwing → play continues with one notice
  - invalid saved positions → spawn
- [x] The migration framework is tested with a fixture schema.
- [x] e2e: collect 3 and reload → 3/5, the same 3 IDs collected, and the other 2 spirits still in the world. Collect the other 2 and reload → 5/5 with the portal active. A valid saved position is restored within 1 m.

### M7: Vegetation, landmarks, and atmosphere
- [x] The placement golden hash is stable. No instance lands inside an exclusion zone. Each species stays within its cap, and the total is ≤ 10,000. Every instance is on the surface within its sink tolerance.
- [x] All instanced meshes of a species share one geometry and one material, and the scene has ≤ 20 unique materials.
- [x] CI at the 5 poses: ≤ 150 draw calls and ≤ 600,000 triangles at every pose.
- [x] The leak check passes: geometry and texture counts are unchanged after 3 calls to `reloadRegion()`. (The baseline is taken after one warm reload at the same pose, because `renderer.info` only counts what has been drawn.)
- [x] Chromium's heightfield hash equals the Node golden hash, or the 1e-5 m tolerance fallback is documented. (Equal. Both are V8; Firefox and Safari are unverified.)
- [ ] *(manual)* `?bench=frame` on the reference machine is logged. Median ≤ 16.7 ms and p95 ≤ 25 ms, **or** §10.5 levers were applied until it passes, **or** the miss is escalated to the user with the data.

### M8: Synthetic vertical slice complete
- [ ] GDD §16 criteria 1–9 all pass on synthetic terrain, criterion 10 passes if hosting is decided, and each is ticked with evidence (§17.2).
- [x] The start, loading, and error screens work. The e2e run covers the `HEIGHTMAP_FETCH_FAILED` path by forcing a 404.
- [ ] All CI checks are green, and every budget is within limits on the production build. (Green locally, including budgets. The GitHub Actions run is checked after push; see §20.)
- [ ] *(manual)* A full playtest, from start to an active portal, in latest Chrome and Firefox. Edge and Safari are best-effort and their results are recorded.

### M9: Real Bandung elevation
- [ ] The licensing sign-off is recorded in §19 **before** any real-data file is committed.
- [ ] V1–V13 pass, and their outputs (including the quantisation report and the reference-point table with cited sources) are committed into `height.json` or the PR.
- [ ] Region data is ≤ 102,400 B. If 16-bit was needed, decision D6 is recorded.
- [ ] Every M0–M8 check passes again, and the golden hashes were updated together with the `generatorVersion` bump.
- [ ] `ATTRIBUTION.md` and the in-game credits line are present.
- [ ] *(manual)* Review screenshots at the 3 standard viewpoints show no visible terracing, and both benchmarks are re-logged.

---

## 17. Consistency audit

### 17.1 GDD vs. plan

| Topic | GDD | Plan | Resolution |
|---|---|---|---|
| Coordinates | §8.2 asks for a defined CRS and local projection, with no axes given | §4: geo, grid, and world spaces; +X east, +Y up, −Z north | Defined. No conflict |
| Region size | "Bounded region", no size given | 2 km × 2 km (constraint) | Consistent |
| Descend key | Ctrl (§11.1) | C | **Conflict.** Browser shortcut risk. Needs approval (D2) |
| Esc | Closes menus | Closes menus; Esc while playing pauses, because of pointer lock | Clarified. No conflict |
| Map | Required by §11.3; optional by §12.3; not in §16 | Optional, after M8 | **Conflict inside the GDD.** Needs a decision (D3) |
| Teleport / portal | §5.6–5.7 "load destination"; §12.2 one portal; §12.3 optional locked preview | Teleport menu with the Jakarta preview; no second region | Resolved using GDD §12. Region loading is tested through hooks |
| Save contents | §9.4 lists unlocked/completed regions, discovered landmarks, explored map | v1 stores facts; unlocked/completed are derived; landmarks and exploration come with a v2 migration if built | Preserved by derivation. Optional features add their own fields |
| Real elevation | §12.2 required | Synthetic first, real at M9 behind a licence gate | GDD §13 allows a preprocessed asset first. Risk if the gate fails (D1) |
| Performance | §14: "targets, not guarantees" | §10: targets until measured | Consistent |
| Collectible placement | §5.5 "stable world coordinates" | Authored `GeoPoint` anchors, converted deterministically, IDs stable | Consistent: both are stable and deterministic |
| Crystal Lake vs. no swimming | §4.1 magical lakes; §5.2 no swimming | Walkable crystal surface | Consistent |
| Audio | §5.5 requires feedback; §12.3 ambient optional | Synthesised chime required; ambient optional | Consistent |

### 17.2 GDD §16 criteria mapped to checks

| # | Criterion | Covered by |
|---|---|---|
| 1 | Loads in a desktop browser | e2e boot (M0), manual browsers (M8) |
| 2 | Bounded terrain visible | M1 mesh tests, e2e canvas, manual |
| 3 | Walk and fly | M2/M3 simulations + manual |
| 4 | Camera follows correctly | M2 clearance test + manual |
| 5 | Five unique artifacts collectible | M5 unit + e2e |
| 6 | HUD tracks progress | M5 e2e |
| 7 | Five artifacts activate the portal | M5 unit + e2e |
| 8 | Progress survives reload | M6 e2e |
| 9 | No critical collision or navigation failures | M2/M3/M4 invariants + M8 playtest |
| 10 | Shareable URL | M8 deploy (D5) |

### 17.3 Corrections to revision 1

| Rev 1 said | Problem | Now |
|---|---|---|
| "Verified: max 2,085 m vs. summit 2,084 m" | One tile spot check presented as validation | F2 relabelled; V9 and V10 added |
| ≤ ~100 draw calls with 7 species × 16 cells | Up to 112 meshes, which breaks its own limit | 5 species; ≤ 150 calls measured at poses |
| Generation < 300 ms as a budget | Never measured | TARGET with a benchmark and fallbacks |
| 8-bit PNG decoded through a canvas | Two decoders; colour-management risk | Raw `.bin` with a shared codec |
| Progression graph across 5 regions | Outside the MVP | Bandung → Jakarta (preview) only |
| Map "almost free" | Treated as in scope | Optional (D3) |
| Open data assumed redistributable | Terms are conditional (F5, F6) | Licence gate (§6.5) |
| "~1,700 m relief", "4 tiles" stated as verified | Not measured | ESTIMATE / COMPUTED labels |
| WorldManager tested by "re-entering Bandung" | A contrived player feature | Test hook `reloadRegion()` |
| Mushroom and pine species, `tsx`, lint/format tooling | Unneeded | Removed, or conditional (`tsx`) |

---

## 18. Open decisions and risks that need your input

| ID | Decision | Default if you don't decide | Needed by |
|---|---|---|---|
| **D1** | **Real elevation data licensing.** After reading `ATTRIBUTION.md` and the open questions in §6.5, do you approve committing and publicly deploying a derived Bandung heightmap? You may want legal advice; this plan doesn't reach a licensing conclusion. If not approved, the MVP ships on synthetic terrain and falls short of GDD §12.2 | Synthetic only | M9 entry |
| **D2** | **Descend key:** change the GDD from Ctrl to C (§12.1) | C | M3 |
| **D3** | **Map:** GDD §11.3 says required and §12.3 says optional. Which applies? | Optional, after M8 | M8 |
| **D4** | **Reference machine** for the frame and generation targets: which device and browser will be used to measure? Suggested: a 2020-or-newer desktop or laptop with integrated graphics (Iris Xe / M1-class), Chrome stable, 1920×1080 | None. Benchmarks can't be judged until this is named | M1 |
| **D5** | **Hosting:** GitHub Pages from this repo needs Pages enabled with "GitHub Actions" as the source. If the repo is private, Pages may require a paid GitHub plan (TO CHECK). Alternatives are Netlify and Cloudflare Pages | GitHub Pages | M8 |
| **D6** | **If 16-bit becomes necessary (§5.4):** use a gzip container (keeping the 100 KB limit), or raise the region-data budget to about 130 KB | gzip container | M9, only if triggered |

Risks handled within the plan, needing no input now:

- Headless pointer lock (M5 fallback).
- Cross-engine floating-point differences (§8.3).
- Integrated-GPU fill rate (§10.5 levers).
- Node type stripping (`tsx` fallback).
- Tile availability during baking (the EU replica bucket, F4; the synthetic fallback).

---

## 19. Decision log

| Date | Decision | By |
|---|---|---|
| 2026-10-04 | MVP portal leads to a Jakarta "unlocked — not yet available" preview, per GDD §12.3 | Plan (from the GDD) |
| 2026-10-04 | Heightmap runtime format is a raw `Uint8` binary with JSON metadata, replacing the PNG | Plan rev 2 |
| 2026-10-04 | Flying vehicle is a petal glider (an implementation decision per GDD §5.3) | Plan |
| 2026-10-04 | Descend key implemented as **C** (plan default for D2). Ctrl is not bound | Plan default, pending user confirmation |
| 2026-10-04 | The map stays optional and is not built (plan default for D3) | Plan default, pending user confirmation |
| 2026-10-04 | GitHub Pages workflow added (plan default for D5); it runs only on `main` once Pages is enabled | Plan default, pending user action |
| 2026-10-04 | Terrain, trees, rocks, ruin pillars, the bloom stem, greenhouse pillars and portal stone share one vertex-coloured Lambert material. This brought the material count from 22 to 16 | Implementation |
| 2026-10-04 | Greenhouse, its pad and the jasmine spirit moved onto the eastern hilltop: on the hillside the pad created a > 60° embankment, which R7 validation rejected | Implementation |
| 2026-10-04 | Player physics substeps (≤ 50 ms per step, ≤ 5 steps per frame), so slow frames still simulate in real time | Implementation |
| 2026-10-04 | Fog near/far grows with camera altitude so aerial views read the landscape; ground level keeps the mist | Implementation |
| — | D1, D4, D6 | Pending, user |

---

## 20. Implementation status (2026-10-04)

**Playable:** start → explore Bandung on foot and by glider → collect 5 Flora Spirits → Petal Gate awakens → Teleport menu (Bandung *completed*, Jakarta *unlocked, not yet available*). Progress and position survive reloads.

| Milestone | Status | Evidence |
|---|---|---|
| M0 Skeleton and guardrails | Done | Guardrail tests, budget checker and its self-test, e2e smoke test |
| M1 Synthetic terrain and coordinates | Done, except the reference-machine benchmark | Projection, sampling, orientation, codec and GIS fixture tests; non-reference `?bench=gen` logged in §10.8 |
| M2 Walking and camera | Automated checks done; manual playtest pending | 1,000 × 600 simulations, ramp tests, camera clearance on every frame |
| M3 Flight and transitions | Automated checks done; flight-feel review pending | Flight simulations, transition and lock tests, e2e keyboard takeoff and landing |
| M4 Fantasy transforms and anchors | Done | Golden hashes, continuity, pads, lake, placement validation, walkability search |
| M5 Collectibles, portal, HUD | Done | Unit rules and e2e full loop including the Teleport menu |
| M6 Persistence | Done | Unit save tests, e2e reload, corrupt-save e2e |
| M7 Vegetation and atmosphere | Done, except the reference-machine frame benchmark | Pose counts, leak check, materials ≤ 20, Chromium = Node hash |
| M8 Full synthetic slice | Code complete. Open: manual playtest in Chrome and Firefox (only headless Chromium exists here), GitHub Actions run, Pages URL (D5) | Start, loading and error screens; e2e for 404 and invalid metadata |
| M9 Real Bandung elevation | Not started; gated on D1 | Bake tool exits with code 2 in real mode |

**Test totals:** 105 unit tests (Vitest) and 12 browser tests (Playwright, headless Chromium), all passing locally.

**Still needs a person:**

- A playtest on real hardware in Chrome and Firefox (GDD §16 criteria 3, 4 and 9 manual parts).
- Naming the reference machine (D4) and running `?bench=gen` / `?bench=frame` there.
- Enabling GitHub Pages (D5).
- The data-licence decision (D1) before M9.

