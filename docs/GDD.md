# GAME DESIGN DOCUMENT — Archipelago: Otherworld

| | |
|---|---|
| **Version** | 0.1 — Initial Concept |
| **Status** | Pre-production |
| **Genre** | Fantasy Exploration / Open-World Adventure |
| **Platform** | Web Browser (Desktop-first) |
| **Engine** | Three.js + TypeScript |
| **Game Mode** | Single-player |
| **Target** | Playable weekend prototype, expandable into a larger exploration game |

## 1. High Concept

Archipelago: Otherworld is a lightweight, browser-based fantasy exploration game built on real-world geographic data.

Players explore a fantastical version of Indonesia, where real-world geography becomes the foundation for procedurally generated landscapes, magical ecosystems, mysterious landmarks, and unique regional identities.

Players can walk through the world, fly freely above the terrain, discover hidden locations, collect five unique artifacts in each region, and unlock portals connecting different cities.

Each city represents a distinct fantasy interpretation of its real-world geographic and cultural identity.

The experience combines the freedom of open-world exploration with lightweight procedural generation and a persistent region-unlocking progression system.

**Core fantasy:** Explore a familiar world transformed into something impossible.

**Core experience:** Fly over breathtaking landscapes, descend to investigate mysterious places, discover hidden artifacts, and gradually unlock the fantastical Indonesian archipelago.

### 1.1 Design Pillars

1. **Exploration First** — The world should be enjoyable to explore even when the player is not pursuing a quest.
2. **Real Geography, Fantastical Interpretation** — Geographic data provides spatial structure, while procedural transformation creates the fantasy.
3. **Distinct Regional Identity** — Every region should have its own visual language, atmosphere, landmarks, and collectible theme.
4. **Lightweight by Design** — The world must run in a web browser without requiring photorealistic assets or enormous downloads.
5. **Persistent Discovery** — Discoveries, collected artifacts, and unlocked regions remain saved between sessions.
6. **Expandable World Architecture** — Adding a region should primarily require new data, assets, and generation rules rather than new engine systems.

## 2. Target Experience

The game should feel like a combination of:

- A lightweight, stylized open-world exploration game.
- A fantasy flight and walking adventure.
- A procedural world generator informed by real geography.
- A collection-based progression game.

The game is not intended to simulate real-world aviation or reproduce every real-world building.

Flight is primarily a means of exploration. Walking provides a closer, more intimate way to interact with landmarks, vegetation, artifacts, and environmental details.

### 2.1 Target Audience

- Players who enjoy exploration and discovery.
- Fans of stylized fantasy environments and procedural worlds.
- Players who enjoy collecting items and unlocking new areas.
- Users interested in interactive maps and geography-inspired experiences.

### 2.2 Target Session

The prototype should support short, satisfying sessions of approximately 5–15 minutes.

A player should be able to launch the game, explore a small area, discover an artifact, and make visible progress without needing a lengthy tutorial.

## 3. World and Setting

### 3.1 World Premise

An alternate version of Indonesia exists as a collection of interconnected fantastical regions.

Each region preserves recognizable geographic characteristics while transforming its environment through fantasy elements.

Mountains may become enormous crystalline formations. Forests may contain flowers larger than buildings. Cities may feature futuristic architecture, floating structures, or magical infrastructure.

Ancient portals connect these regions.

The player begins in Bandung and gradually restores access to other regions by discovering artifacts and activating regional portals.

### 3.2 Geographic Foundation

The world is based on real geographic information, including selected elevation data, coastlines, and regional boundaries.

Geographic data provides the underlying structure of the world, but it does not dictate the final appearance of every object.

The world generation pipeline transforms geographic inputs into game-ready environments.

Example transformations:

- Real elevation → exaggerated fantasy mountains.
- Real forests or vegetation zones → enchanted biomes.
- Rivers and lakes → magical waterways.
- Geographic landmarks → fantasy-inspired landmarks.
- Urban areas → stylized fantasy or cyberpunk cityscapes.

Real-world geography should remain recognizable where practical, but artistic freedom takes priority over exact simulation.

### 3.3 Regional World Model

Each region is an independently loadable world area with its own:

- Geographic bounds.
- Terrain configuration.
- Procedural generation seed.
- Biome and material definitions.
- Landmark placements.
- Collectible locations.
- Portal location.
- Exploration and completion state.

The player can teleport between unlocked regions. The initial implementation does not require seamless traversal across the entire Indonesian archipelago.

## 4. Regional Design

The following regions define the intended long-term direction. Only Bandung is required for the initial playable prototype.

### 4.1 Bandung — The Blooming Highlands

**Role:** Starting region.

**Theme:** Enchanted forests, oversized flowers, misty highlands, volcanic terrain, and magical lakes.

**Visual identity:**

- Rolling hills and mountainous terrain.
- Dense vegetation and giant fantasy flowers.
- Soft atmospheric fog.
- Glowing flora and scattered ancient ruins.
- Color palette dominated by greens, pinks, purples, and soft blues.

**Traversal characteristics:**

- Walk through flower fields and forest clearings.
- Fly over hills and valleys.
- Discover artifacts around landmarks and secluded areas.

**Collectible set:** Five Flora Spirits.

**Prototype landmarks:**

- Blooming Highlands.
- Crystal Lake.
- Ancient Greenhouse.

These are fictional game locations, not claims about real-world landmarks.

**Prototype objective:** Collect five Flora Spirits and activate the regional portal.

### 4.2 Jakarta — Neon Abyss

**Theme:** Cyberpunk megacity.

**Visual identity:**

- Stylized skyscrapers.
- Neon lighting and holographic signs.
- Elevated transit systems.
- Vertical architecture and futuristic districts.
- Artificial waterways and glowing infrastructure.

**Collectible set:** Five Data Fragments.

**Traversal identity:** Flying between buildings and exploring selected pedestrian-level districts.

### 4.3 Surabaya — The Sunken Frontier

**Theme:** Mystical maritime civilization.

**Visual identity:**

- Fantasy ports and monumental ships.
- Coastal terrain and broad waterways.
- Ancient structures emerging from the sea.
- Golden sunlight and luminous ocean details.

**Collectible set:** Five Tide Relics.

**Traversal identity:** Exploring coastal landmarks, maritime ruins, and elevated structures.

### 4.4 Yogyakarta — The Forgotten Realm

**Theme:** Ancient temples and forgotten magical knowledge.

**Visual identity:**

- Temple complexes and stone architecture.
- Dense tropical vegetation.
- Volcanic highlands and mist.
- Geometric motifs inspired by regional visual traditions.

**Collectible set:** Five Ancient Seals.

**Traversal identity:** Walking through ruins, finding hidden structures, and flying toward elevated landmarks.

### 4.5 Kalimantan — The Ancient Canopy

**Theme:** An immense, ancient rainforest.

**Visual identity:**

- Giant trees.
- Layered forest canopies.
- Bioluminescent rivers.
- Suspended vegetation and hidden clearings.
- Dense atmospheric depth.

**Collectible set:** Five Canopy Seeds.

**Traversal identity:** Flying above the canopy and landing in selected clearings.

### 4.6 Regional Content Requirements

Each region added after the prototype should define:

- One primary biome.
- One distinctive environmental visual identity.
- At least three major landmarks.
- Five collectible artifacts.
- One portal.
- One traversal or exploration characteristic.
- One region completion state.

These are initial content targets and may change as the game develops.

## 5. Core Gameplay

### 5.1 Core Gameplay Loop

1. Enter an unlocked region.
2. Explore the environment by walking or flying.
3. Discover landmarks and reveal unexplored areas.
4. Find and collect regional artifacts.
5. Complete the collection by gathering five artifacts.
6. Activate the regional portal.
7. Unlock access to the next region.
8. Continue exploring or return to a previously visited region.

Exploration should remain optional and self-directed. Collectibles provide motivation rather than restricting every movement.

### 5.2 Walking

Walking allows the player to explore the environment at ground level.

Requirements:

- Third-person movement.
- Camera-relative directional controls.
- Basic terrain following.
- Ground collision or equivalent movement constraints.
- Interaction with nearby artifacts and portals.
- Smooth movement and camera response.

The prototype does not require complex character animation, climbing, swimming, or advanced physics.

### 5.3 Flying

Flying provides a faster way to traverse terrain and discover distant landmarks.

The initial flight model is arcade-style rather than realistic.

Requirements:

- Smooth acceleration and deceleration.
- Pitch and heading control.
- Controllable altitude.
- Third-person follow camera.
- Clear visual feedback for movement.
- Ability to transition between flying and walking.

Flight should feel responsive and forgiving. Realistic aerodynamic simulation is explicitly out of scope.

The initial prototype may use a simple low-poly aircraft or stylized flying vehicle. The specific vehicle is an implementation decision and does not need to affect the world architecture.

### 5.4 Mode Switching

Players can switch between walking and flying.

The transition must:

- Preserve the player's approximate world position.
- Avoid spawning the player inside terrain.
- Restore the appropriate movement controller.
- Maintain consistent camera behavior.
- Prevent accidental collection or interaction during the transition.

The initial implementation may use an explicit toggle rather than automatic transformation.

### 5.5 Collectibles

Every region contains five unique collectibles.

Requirements:

- Collectibles have stable identifiers.
- Each collectible has a fixed or deterministic location.
- Collected artifacts cannot be collected again.
- The HUD displays progress, such as `3 / 5`.
- Collection triggers visual and audio feedback.
- Collection state persists after leaving the region.

For the prototype, collectible placement can be manually authored using stable world coordinates. Procedural placement is optional and should not delay completion.

### 5.6 Regional Completion

A region becomes complete when the player has collected all five artifacts.

Completion behavior:

- Update regional progress to `5 / 5`.
- Activate the region's portal.
- Display a completion message.
- Persist the completed state.
- Enable teleportation to the next region, according to the progression graph.

The prototype needs only one functional portal. A fully connected regional network can be implemented later.

### 5.7 Teleportation

Teleportation allows travel between unlocked regions.

Requirements:

- Display the list of available regions.
- Clearly distinguish locked, unlocked, visited, and completed regions.
- Load the selected destination.
- Spawn the player at a predefined safe location.
- Restore saved progress for that region.
- Provide a loading state during region transitions.

Teleportation is a region transition, not instantaneous movement through a seamless planet-scale world.

## 6. Exploration and Discovery

### 6.1 Landmark Discovery

Landmarks serve as navigation references and exploration objectives.

The prototype should include three landmarks in Bandung, each with a distinct silhouette or visual signature.

Landmarks may:

- Become visible from a distance.
- Provide visual orientation.
- Reveal nearby points of interest.
- Host collectibles or portals.

### 6.2 Fog of War

The initial fog-of-war system may be simple.

Unexplored areas are visually obscured or absent from the player's map. Explored areas become permanently revealed.

The game does not require detailed real-time fog simulation. A region-level or map-grid exploration representation is sufficient for the MVP.

### 6.3 Map Interface

The map interface should display:

- The current region.
- Known landmarks.
- Collected and uncollected artifacts.
- Explored versus unexplored areas.
- Regional completion progress.
- Available teleport destinations.

The initial map can be a lightweight stylized 2D representation rather than a fully interactive globe.

## 7. Procedural World Generation

### 7.1 Generation Philosophy

The world should be generated deterministically from geographic inputs and configuration data.

The same region configuration and seed should produce a consistent environment.

Procedural generation is used to create visual variation and populate the world, not to generate arbitrary content without constraints.

### 7.2 Generation Pipeline

1. Load regional geographic bounds.
2. Obtain or load the selected elevation dataset.
3. Convert geographic coordinates to local world coordinates.
4. Construct a terrain mesh or heightmap-based surface.
5. Apply controlled fantasy terrain transformations.
6. Assign biome materials.
7. Populate vegetation and environmental props.
8. Place landmarks and collectibles.
9. Initialize collision and traversal data.
10. Make the region available to the player.

### 7.3 Terrain Transformation

Terrain generation may combine real elevation with procedural modification.

Conceptually:

`fantasyHeight = realHeight + proceduralVariation + authoredLandmarkModifiers`

The transformation must preserve reasonable terrain continuity and avoid uncontrolled random spikes.

Fantasy intensity should be configurable per region.

For example:

- Bandung emphasizes rolling hills and organic terrain.
- Jakarta emphasizes urban structures rather than extreme terrain deformation.
- Kalimantan emphasizes dense vegetation and enormous trees.

### 7.4 Determinism

Each region has a stable generation seed.

Deterministic generation ensures:

- Landmark locations remain consistent.
- Collectibles remain discoverable.
- Saved coordinates remain valid.
- Returning players see a recognizable world.
- Procedural content can be regenerated without storing every generated object.

Important gameplay objects should use authored coordinates or stable procedural anchors rather than arbitrary runtime randomness.

### 7.5 World Streaming

The engine must not render every terrain chunk and environmental object simultaneously.

The world runtime should support:

- Loading nearby terrain chunks.
- Unloading distant chunks.
- Reusing generated assets where practical.
- Lower-detail representations for distant terrain.
- Releasing GPU resources when regions are unloaded.

For the weekend prototype, a small bounded region may be loaded as one area. Chunk streaming is a scalable architecture goal, not a reason to delay the first playable build.

## 8. GIS and Coordinate Systems

GIS data provides the spatial foundation for the game.

### 8.1 Geographic Inputs

Potential inputs include:

- Digital elevation models.
- Coastline and water boundaries.
- Regional geographic bounds.
- Selected landmark coordinates.
- Optional land-cover or biome datasets.

Data sources must be selected according to availability, licensing, resolution, and performance requirements.

The MVP should use a small, legally usable dataset rather than downloading detailed data for all of Indonesia.

### 8.2 Coordinate Conversion

Geographic coordinates must be converted into an appropriate local coordinate system before they are used in Three.js.

Requirements:

- Define the coordinate reference system for each dataset.
- Use a suitable local projection for the selected region.
- Normalize game-world scale.
- Keep geographic anchors stable.
- Convert terrain and landmark positions consistently.
- Handle elevation units explicitly.

Raw latitude and longitude values must not be treated as ordinary Cartesian coordinates.

### 8.3 Fantasy Geography

Fantasy transformations must not break the relationship between the terrain and gameplay anchors.

For example, when terrain elevation is modified:

- Collectibles should remain accessible.
- Landmarks should follow the intended terrain surface.
- Walking collision should match the visible terrain.
- Flight and camera systems should use the transformed world.
- Portal positions must remain valid.

The game is not required to preserve real-world distances or elevation ratios exactly.

## 9. Technical Architecture

### 9.1 Technology Stack

- **Language:** TypeScript.
- **3D Engine:** Three.js.
- **Application UI:** React.
- **Build Tool:** Vite.
- **Rendering:** WebGL through Three.js.
- **World Data:** JSON or typed configuration objects.
- **Persistence:** Local storage for the initial prototype.
- **Testing:** Unit tests for gameplay rules and browser-based smoke tests.
- **Deployment:** Static web hosting for the client application.

Additional libraries should be introduced only when they solve a demonstrated problem.

### 9.2 Suggested Modules

- **`WorldManager`** — Loads and unloads regions. Owns region lifecycle.
- **`GISPipeline`** — Loads geographic data. Converts coordinates. Generates terrain geometry.
- **`TerrainGenerator`** — Applies fantasy terrain transformations. Produces terrain meshes and height queries.
- **`BiomeGenerator`** — Selects materials. Places vegetation and environmental props.
- **`PlayerController`** — Coordinates walking and flying. Manages mode transitions.
- **`CameraController`** — Manages third-person camera behavior.
- **`ExplorationSystem`** — Tracks discoveries and explored areas.
- **`CollectibleSystem`** — Detects collection interactions. Updates artifact progress.
- **`PortalSystem`** — Determines portal availability. Coordinates region transitions.
- **`ProgressManager`** — Stores unlock and completion state. Serializes and restores progress.
- **`UIManager`** — Displays HUD, inventory, map, and region status.

### 9.3 Data-Driven Regions

Regions should be defined through configuration rather than hardcoded gameplay logic.

A regional definition should include:

- Region identifier and display name.
- Geographic bounds.
- Generation seed.
- Terrain parameters.
- Biome definitions.
- Landmark anchors.
- Collectible definitions.
- Portal destination.
- Unlock requirements.

Region configuration must be validated before the runtime loads it.

### 9.4 Save Data

The save system should preserve:

- Unlocked regions.
- Completed regions.
- Collected artifact identifiers.
- Discovered landmarks.
- Explored map state.
- Current region.
- Player position where safe and applicable.

Save data should include a schema version to allow future migrations.

Local storage is sufficient for the MVP. Cross-device synchronization and user accounts are out of scope.

## 10. Visual Direction

### 10.1 Art Style

Stylized, lightweight 3D with strong silhouettes, saturated but controlled colors, atmospheric depth, and simplified geometry.

The art direction should prioritize readability and mood over photorealism.

### 10.2 Lighting and Atmosphere

The initial renderer should support:

- Directional sunlight.
- Ambient or environment lighting.
- Distance fog.
- A simple sky treatment.
- Limited emissive materials for magical objects.
- Selective particles and environmental effects.

Expensive post-processing should be avoided until performance is measured.

### 10.3 Asset Strategy

Use:

- Low-poly or stylized reusable models.
- Instanced vegetation.
- Shared materials and geometry.
- Procedurally placed environmental props.
- A small number of authored landmark assets.

Avoid unique high-poly models for every tree, flower, rock, or building.

## 11. UI and Controls

### 11.1 Initial Controls

Suggested desktop controls:

| Key | Action |
|---|---|
| `W / A / S / D` | Move |
| `Mouse` | Rotate camera or aim camera direction |
| `Space` | Jump while walking; ascend while flying |
| `Shift` | Sprint or accelerate while flying |
| `Ctrl` | Descend while flying |
| `F` | Toggle walking and flying modes |
| `E` | Interact with a nearby collectible or portal |
| `M` | Open the regional map |
| `Esc` | Close menus |

Controls are provisional and should be adjusted after playtesting.

### 11.2 HUD

The HUD should display:

- Current region name.
- Current movement mode.
- Collectible progress.
- Interaction prompts.
- Optional compass or heading.
- Region completion notifications.

The HUD should remain unobtrusive and not obscure the world.

### 11.3 Menus

The prototype requires:

- Start screen.
- In-game HUD.
- Regional map.
- Teleport destination menu.
- Region completion notification.
- Loading screen or transition overlay.

A full settings menu, controller remapping, and accessibility configuration can follow later.

## 12. MVP Scope

### 12.1 Objective

Deliver a complete, playable vertical slice demonstrating the core promise of the game:

A player can explore a GIS-inspired fantasy region, walk and fly through it, collect five artifacts, and unlock a portal.

### 12.2 Required Features

**World**

- One bounded region inspired by Bandung.
- One terrain representation based on real geographic elevation.
- One fantasy biome: Forest of Flowers.
- Basic terrain and atmosphere.
- Three recognizable fictional landmarks.

**Player**

- Third-person camera.
- Walking controller.
- Arcade flight controller.
- Mode switching.
- Basic terrain collision or ground following.

**Exploration**

- Five collectible artifacts.
- Collectible interaction and feedback.
- Progress counter.
- One portal.
- Regional completion state.

**Persistence**

- Save collectible progress.
- Save region completion.
- Restore progress after reloading.

**Delivery**

- Runs in a desktop browser.
- Has a usable start-to-game flow.
- Can be deployed as a playable demo.
- Includes basic automated validation.

### 12.3 Optional Features

Implement only if the required features are stable:

- Basic fog of war.
- Landmark discovery notifications.
- Simple ambient sound.
- A minimal regional map.
- One locked destination preview.

### 12.4 Explicitly Out of Scope

- Complete Indonesia map.
- Five fully implemented regions.
- Multiplayer.
- Realistic aircraft physics.
- Combat.
- Complex quests or dialogue.
- Procedural building interiors.
- AI-generated world content at runtime.
- User accounts and cloud saves.
- Seamless flight between distant islands.
- Mobile optimization.
- Full open-world chunk streaming if it jeopardizes the first playable build.

## 13. Weekend Development Plan

### Saturday Morning — World Foundation

- Initialize React, Vite, TypeScript, and Three.js.
- Establish scene, camera, lighting, and render loop.
- Load a small terrain dataset or preprocessed heightmap.
- Build the initial terrain mesh.
- Establish local coordinate conversion.
- Display the terrain in the browser.

**Milestone:** A geographic terrain area renders successfully.

### Saturday Afternoon — Traversal

- Implement walking.
- Implement arcade flight.
- Add camera follow behavior.
- Add basic ground detection.
- Add mode switching.
- Tune controls until movement is understandable.

**Milestone:** The player can explore the terrain on foot and in the air.

### Sunday Morning — Exploration Loop

- Add five artifacts.
- Add collection detection and feedback.
- Display collectible progress.
- Implement portal interaction.
- Unlock the region when all artifacts are collected.

**Milestone:** The core gameplay loop works from beginning to end.

### Sunday Afternoon — Persistence and Polish

- Save and restore progress.
- Add fantasy vegetation and landmark props.
- Improve fog, lighting, and visual identity.
- Add loading and error states.
- Test the complete gameplay loop.
- Deploy the prototype.

**Milestone:** A shareable browser demo is available.

The schedule is an aggressive target. If GIS preprocessing takes longer than expected, use a preprocessed terrain asset while preserving the GIS pipeline as a separate module.

## 14. Performance Requirements

The game must remain lightweight enough for typical modern desktop browsers.

Initial engineering goals:

- Target approximately 60 FPS on a representative desktop.
- Avoid unbounded geometry and texture growth.
- Limit unnecessary draw calls.
- Reuse geometry and materials.
- Avoid regenerating the entire world during ordinary player movement.
- Dispose of resources when they are no longer needed.
- Keep terrain resolution appropriate to the visible area.

These are targets, not measured performance guarantees.

Performance should be tested on the actual prototype before setting strict hardware requirements.

## 15. Risks and Mitigations

| Risk | Description | Mitigation |
|---|---|---|
| GIS Complexity | Geographic data processing consumes the entire weekend. | Select one small area, preprocess its elevation data, and validate coordinate conversion independently. |
| Walking and Flying Integration | Terrain collision and mode transitions become unstable. | Use one shared world coordinate system and a clearly defined controller interface. |
| Procedural Terrain Quality | Random terrain transformations destroy geographic readability or produce unusable slopes. | Use constrained terrain modifications and deterministic parameters. |
| Browser Performance | Vegetation and terrain overwhelm the renderer. | Start with low terrain resolution, instancing, shared materials, and a limited world area. |
| Scope Expansion | The project expands into a complete world simulator before the core game is playable. | Require the Bandung vertical slice to be complete before adding another region. |
| Persistence and Stable Locations | Collectibles move or disappear when procedural content is regenerated. | Use stable identifiers, deterministic seeds, and authored geographic anchors. |

## 16. Acceptance Criteria

The MVP is considered complete when:

1. The game loads in a desktop browser.
2. A bounded terrain region is visible.
3. The player can walk and fly.
4. The camera follows the player correctly.
5. Five unique artifacts can be collected.
6. The HUD correctly tracks collection progress.
7. Collecting all five artifacts activates the portal.
8. Progress survives a browser reload.
9. The region can be explored without critical collision or navigation failures.
10. The game can be deployed and played through a shareable URL.

A playable, polished single-region demo is preferable to several incomplete regions.

## 17. Future Roadmap

**Phase 1 — Vertical Slice**

- Bandung terrain.
- Walking and flying.
- Five collectibles.
- One portal.
- Local persistence.

**Phase 2 — Exploration Systems**

- Regional map.
- Fog of war.
- Landmark discovery.
- Better procedural vegetation.
- More polished traversal.

**Phase 3 — Multi-Region World**

- Jakarta.
- Surabaya.
- Yogyakarta.
- Kalimantan.
- Teleportation between completed regions.

**Phase 4 — World Generation**

- Region-specific generation profiles.
- Better biome transitions.
- Chunk-based terrain streaming.
- More procedural landmarks and points of interest.

**Phase 5 — Long-Term Expansion**

- Additional Indonesian regions.
- More collectible categories.
- Optional exploration challenges.
- Environmental secrets.
- More advanced world customization.

## 18. Final Product Principle

Archipelago: Otherworld should not attempt to compete with large simulation games through geographic completeness or photorealism.

Its defining feature is the transformation of familiar geography into a fantastical world that feels coherent, explorable, and worth discovering.

The first objective is not to build Indonesia.

It is to prove that one small piece of Indonesia can become a compelling fantasy world in which flying, walking, discovering, and unlocking new places form a satisfying gameplay loop.
