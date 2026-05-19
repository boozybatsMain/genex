# Terrain System Skill

Agent reference for terrain-related architecture, GameDefinition parameters, and physics collider lifecycle. Use when modifying terrain settings, sculpt tools, or debugging terrain physics issues.

## Architecture Overview

### Heightfield Data Flow

```
heightmapRef (Float32Array, row-major, unscaled)
  ↓ mutated by useSculptBrush
  ↓ version counters bumped
  ↓
TerrainEntity useEffect [version, sculpt.heightmapVersion, heightScale, resolution, terrainSize]
  ↓ transposes row→column-major, scales by heightScale
  ↓
PhysicsManager.createHeightfieldGround('__terrain_ground__', { nrows, ncols, heights, scale })
  ↓ creates Rapier heightfield collider + syncBroadPhase()
```

### Two Heightfield Creation Paths

| Path | Source | When | Authority |
|------|--------|------|-----------|
| TerrainEntity useEffect | In-memory `heightmapRef.current` (includes unsaved sculpt data) | version/heightmapVersion change | **Primary** (client-managed) |
| rehydrateFromDefinition | Definition URL fetch or procedural generation | WorldSession.setDefinition() | Secondary (skipped when TerrainEntity mounted) |

**Client-managed flag**: TerrainEntity sets `physics.setClientManagedHeightfield(true)` on mount. When set, `rehydrateFromDefinition` skips the terrain heightfield block entirely, preventing stale definition data from overwriting in-memory sculpted changes.

### Sculpt Save Pipeline

```
Sculpt stroke → heightmapRef mutated → heightmapVersion++
  ↓
During sculpting (2s debounce):
  uploadHeightmapBinary(worldId, data) → skipNextDefinitionSync() → patch definition
  ↓
On sculpt exit (mode switch):
  Immediate upload → patch definition (NO skipNextDefinitionSync)
  → setDefinition fires but rehydrate skips terrain (client-managed)
```

### Mode Transition (Edit → Play)

1. `saveSculptState()` — snapshots brush config
2. `setSculptState({ enabled: false })` — disables sculpt
3. `editorFlushPatch()` — flushes pending transform patches
4. Character snap via `getGroundHeight()` + `CHARACTER_GROUND_OFFSET`
5. `play()` — starts physics simulation
6. React re-render → sculpt exit flush uploads heightmap

## Terrain Path Prefix

All terrain settings live under `/worldSpec/environment/terrain/` in the GameDefinition JSON.

## Water Parameters

| Parameter | Path | Type | Range | Default | Description |
|-----------|------|------|-------|---------|-------------|
| enabled | `water/enabled` | boolean | - | false | Enable/disable water rendering |
| level | `water/level` | number | 0-50 | 2.5 | Water surface height in world units |
| color | `water/color` | string | hex | #1a6b8a | Water surface color |
| opacity | `water/opacity` | number | 0-1 | 0.75 | Water transparency |
| flowSpeed | `water/flowSpeed` | number | 0-3 | 0.4 | Water animation speed |
| shallowColor | `water/shallowColor` | string | hex | #4a9ead | Shallow water tint |
| distortionScale | `water/distortionScale` | number | 0-20 | 3.7 | Reflection distortion intensity |
| waveScale | `water/waveScale` | number | 0.1-10 | 1.0 | Visual wave size (Water addon `size` uniform, scales normal map UV) |

### Water Rendering

- Uses Three.js `Water` addon (mirror reflection — renders entire scene 2x per frame at 512x512)
- Density map masking via injected shader: `smoothstep(0.02, 0.3, density)` alpha fade
- `transparent = true` for edge blending
- `paintWater` tool: paints density map AND lowers terrain to `waterLevel - depthOffset` so water renders without holes

## Tree Parameters

| Parameter | Path | Type | Range | Default | Description |
|-----------|------|------|-------|---------|-------------|
| enabled | `trees/enabled` | boolean | - | true | Enable/disable tree rendering |
| density | `trees/density` | number | 0-20 | 8 | Tree density (higher = more trees) |
| treePresets | `trees/treePresets` | string[] | ALL_PRESETS | ['Oak Medium', 'Pine Medium', 'Aspen Medium', 'Bush 1'] | Selected ez-tree preset names |
| scaleMin | `trees/scaleMin` | number | 0.1-2.0 | 0.3 | Minimum tree scale |
| scaleMax | `trees/scaleMax` | number | 0.1-2.0 | 0.6 | Maximum tree scale |
| treeSeed | `trees/treeSeed` | number | 0-65536 | 42 | Tree placement seed (independent from heightmap seed) |
| barkTint | `trees/barkTint` | string | hex | #ffffff | Bark color tint |
| leafTint | `trees/leafTint` | string | hex | #ffffff | Leaf color tint |
| branchLevels | `trees/branchLevels` | number | 1-3 | 2 | Branch detail level |
| windStrength | `trees/windStrength` | number | 0-2 | 0.4 | Wind animation strength |
| windSpeed | `trees/windSpeed` | number | 0-2 | 0.8 | Wind animation speed |

### Available Tree Presets

Ash Small, Ash Medium, Ash Large, Aspen Small, Aspen Medium, Aspen Large, Bush 1, Bush 2, Bush 3, Oak Small, Oak Medium, Oak Large, Pine Small, Pine Medium, Pine Large, Trellis

### Notes

- Tree-specific seed (`treeSeed`) only reshuffles Poisson positions; density maps and brush placements are preserved
- Main terrain seed (`heightmap/seed`) regenerates heightmap shape; density maps become misaligned
- Tree colliders use `Math.max(0.25, dims.radius * scale)` minimum floor
- Trees blocked from water areas: density map check + 3x3 neighbor water check
- `frustumCulled={false}` on InstancedMesh — shader distance fade handles culling

## Grass Parameters (DEACTIVATED)

Grass system is currently commented out with `TODO(2)` markers. When re-enabled:

| Parameter | Path | Type | Range | Default | Description |
|-----------|------|------|-------|---------|-------------|
| enabled | `grass/enabled` | boolean | - | false | Enable/disable grass rendering |
| density | `grass/density` | number | 0-500 | 200 | Grass blade density |

## Heightmap Parameters

| Parameter | Path | Type | Range | Default | Description |
|-----------|------|------|-------|---------|-------------|
| seed | `heightmap/seed` | number | 0-99999 | 42 | Procedural generation seed |
| resolution | `heightmap/resolution` | number | 64/128/256 | 256 | Heightmap grid resolution |
| heightScale | `heightmap/heightScale` | number | 0-100 | 60 | Vertical scale multiplier (0 = perfectly flat) |

## Sculpt System

### Sculpt Modes and Tools

| Mode | Entity ID | Tools | Brush Defaults |
|------|-----------|-------|----------------|
| Terrain | `__terrain__` | Raise, Lower, Smooth, Flatten | size:6, strength:0.011, hardness:0.05 |
| Trees | `__terrain_trees__` | Paint, Erase | size:3, strength:0.15, hardness:0.2 |
| Water | `__terrain_water__` | Paint, Erase | size:6, strength:0.1, hardness:0.1 |

### Sculpt UI Architecture

Sculpt controls are integrated into the EntitySettingsPanel (right-side panel). When sculpt is active, each category's settings hook (`useTerrainSettings`, `useTreeSettings`, `useWaterSettings`) renders:
1. Mode toggle (Segmented: Terrain/Trees/Water)
2. Category-specific sculpt-relevant settings (tree presets, terrain falloff)
3. Tool buttons (Segmented)
4. Brush sliders (Size/Strength/Hardness)
5. Undo/Redo + Exit Sculpt actions

Shared sculpt sections built via `sculptSections.ts`: `buildSculptSections()`, `buildSculptActions()`, `handleSculptFieldChange()`.

### Key Stores

- `useSculptBridgeStore` (sculpt.store.ts): Bridge between Canvas (TerrainEntity/useSculptBrush) and DOM (settings panels). Contains sculptState, setSculptState, undo/redo, version counters, density map accessors.
- `sculptToolbarOpen`: Boolean tracking whether sculpt mode is active (legacy name from removed floating toolbar)
- `sculptMode`: Active category ('terrain' | 'trees' | 'water')

## Example Agent Patches

### Enable water with custom settings
```json
[
  { "op": "replace", "path": "/worldSpec/environment/terrain/water/enabled", "value": true },
  { "op": "replace", "path": "/worldSpec/environment/terrain/water/level", "value": 8 },
  { "op": "replace", "path": "/worldSpec/environment/terrain/water/flowSpeed", "value": 0.6 }
]
```

### Change tree presets
```json
[
  { "op": "replace", "path": "/worldSpec/environment/terrain/trees/treePresets", "value": ["Pine Small", "Pine Medium", "Pine Large", "Bush 1"] }
]
```

## Key Files

| File | Purpose |
|------|---------|
| `TerrainEntity.tsx` | Main R3F component — heightmap loading, physics sync, sculpt wiring, sub-system mounting |
| `useSculptBrush.ts` | Sculpt brush logic — pointer handling, density map painting, undo/redo history |
| `sculptSections.ts` | Shared sculpt UI sections builder for entity settings panels |
| `useTerrainSettings.ts` | Terrain settings hook — debounced heightmap upload, sculpt mode view |
| `useTreeSettings.ts` | Tree settings hook — presets, distribution, sculpt mode view |
| `useWaterSettings.ts` | Water settings hook — level, color, distortion, sculpt mode view |
| `WaterSurface.tsx` | Water rendering — Three.js Water addon with density masking shader |
| `TreeSystem.tsx` | Tree rendering — InstancedMesh with Poisson placement + brush trees |
| `PhysicsManager.ts` | Heightfield collider lifecycle — createHeightfieldGround, rehydrate guards |
| `sculpt.store.ts` | Zustand bridge store — Canvas ↔ DOM sculpt state |

## Deferred: C5 Micro-Freeze Optimization

The sculpt system experiences a brief freeze on stroke end caused by 5 synchronous operations:
1. Splatmap regeneration O(res^2)
2. DataTexture allocation
3. Material recreation with shader injection
4. Physics heightfield rebuild O(res^2)
5. Player snap-to-terrain

**Planned fix** (separate PR): Move splatmap generation to `requestIdleCallback` or Web Worker, update texture in-place instead of recreating, and batch material recreation. Requires profiling data.
