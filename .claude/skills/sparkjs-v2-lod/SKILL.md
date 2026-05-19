---
name: sparkjs-v2-lod
description: SparkJS v2.0 Level-of-Detail system—LoD splat trees, streaming .RAD files, paged rendering, ExtSplats for large coordinates, build-lod CLI tool, performance tuning, foveation, and splat budgets. Use when working with large splat scenes, streaming, LoD configuration, or performance optimization.
---

# SparkJS v2.0 Level-of-Detail & Performance

Spark 2.0's LoD system enables rendering huge worlds (100M+ splats) on any device by computing optimal subsets of splats from a tree structure, with a fixed rendering budget.

## Quick Start

### Approach 1: LoD on Load (Simple)

```typescript
import { SplatMesh } from '@sparkjsdev/spark';

// Any splat file → auto-builds LoD tree in background WebWorker
const splats = new SplatMesh({ url: './scene.spz', lod: true });
scene.add(splats);
// Takes 1-3 sec per 1M input splats, up to ~30M splats
```

### Approach 2: Pre-built .RAD File (Recommended)

```shell
# Build LoD tree from command line (requires Rust)
npm run build-lod -- my-scene.ply --quality

# Outputs: my-scene-lod.rad
```

```typescript
// Load pre-built LoD (no lod: true needed, .RAD encodes it)
const splats = new SplatMesh({ url: './my-scene-lod.rad' });
scene.add(splats);
```

### Approach 3: Streaming .RAD (Best UX)

```typescript
// Instant load + progressive streaming
const splats = new SplatMesh({
  url: './my-scene-lod.rad',
  paged: true,
});
scene.add(splats);
```

---

## How LoD Works

Splats are organized in a tree: leaves are original splats, interior nodes are downsampled "merged" splats. Spark computes a "cut" through the tree selecting N splats that:

1. Have **similar screen-space size** (even detail distribution)
2. Are **no smaller than a pixel** (don't waste budget on invisible detail)
3. Stay within **max budget N** (fixed rendering cost)

Algorithm runs in O(N log N) — independent of total splat count. Works across **multiple SplatMesh objects simultaneously**, distributing N splats globally.

### Default Splat Budgets

| Platform | Default Budget |
|----------|---------------|
| Desktop | 2.5M splats |
| iOS | 1.5M |
| Android | 1M |
| Vision Pro | 750K |
| Quest 3 | 500K |

---

## Configuring LoD on SparkRenderer

```typescript
import { SparkRenderer } from '@sparkjsdev/spark';

const spark = new SparkRenderer({
  renderer: webGLRenderer,

  // LoD is enabled by default
  enableLod: true,          // default: true

  // Easiest way to adjust detail vs performance:
  lodSplatScale: 1.5,       // 1.5x default budget (default: 1.0)

  // Or set absolute budget:
  lodSplatCount: 3_000_000, // override platform default

  // Rendering detail threshold
  lodRenderScale: 1.0,      // min pixel size of LoD splats (default: 1.0)
                             // higher (up to 5.0) avoids tiny splats

  // Extended encoding for paged splats (large coordinates)
  pagedExtSplats: false,    // default: false

  // Max GPU memory for paged splats
  maxPagedSplats: 16_777_216, // default: 16M desktop, 6-8M mobile
});
scene.add(spark);
```

### LoD Properties (Adjustable at Runtime)

```typescript
spark.enableLod = true;
spark.lodSplatScale = 2.0;     // Double the budget
spark.lodSplatCount = 5_000_000;
spark.lodRenderScale = 2.0;    // Skip splats smaller than 2px
```

---

## Foveation — Focus Detail Where User Looks

Distribute splat budget unevenly: more detail in center of view, less on periphery and behind.

### SparkRenderer Foveation

```typescript
const spark = new SparkRenderer({
  renderer,
  // Full detail cone (full-width angle in degrees)
  coneFov0: 60,           // 60° full resolution (default: 0 = off)
  // Reduced detail cone
  coneFov: 120,           // 120° reduced resolution
  coneFoveate: 0.5,       // 0.5x detail at edge of coneFov (default: 1.0)
  // Behind the viewer
  behindFoveate: 0.1,     // 10x larger splats behind (default: 1.0)
});
```

### Per-SplatMesh Foveation Override

```typescript
splats.lodScale = 2.0;          // 2x finer for this object
splats.behindFoveate = 0.2;     // Override global behind foveation
splats.coneFov0 = 90;           // Override cone angles
splats.coneFov = 150;
splats.coneFoveate = 0.3;
```

---

## SplatMesh LoD Options

```typescript
const splats = new SplatMesh({
  url: './scene.spz',

  // Enable LoD (builds tree in background)
  lod: true,              // or number for custom tree base (default: 1.5)

  // Keep both LoD and non-LoD versions
  nonLod: true,           // originals in .packedSplats, LoD in .packedSplats.lodSplats

  // Force LoD or non-LoD when both exist
  enableLod: true,        // undefined = auto-select LoD when available

  // Per-mesh detail
  lodScale: 1.0,          // 2.0 = 2x finer, 0.5 = 2x coarser

  // Only build LoD for large meshes
  lodAbove: 100_000,      // skip LoD if < 100K splats

  // Enable paged streaming from .RAD
  paged: true,
});
```

### Switching Between LoD and Non-LoD

```typescript
// Keep both versions available
const splats = new SplatMesh({ url: './scene.spz', lod: true, nonLod: true });
await splats.initialized;

splats.enableLod = false;  // Switch to full-detail original
splats.enableLod = true;   // Switch back to LoD
```

### Re-Creating LoD After Edits

```typescript
// After modifying packed splats...
await splats.packedSplats.createLodSplats();
// LoD tree rebuilt from current data
```

---

## ExtSplats — Large Coordinate Support

PackedSplats uses float16 centers (0.1% precision). Large coordinates cause striping. ExtSplats uses float32 centers (32 bytes/splat vs 16 bytes/splat).

### When to Use ExtSplats

- Splat scenes with coordinates > ~100 units from origin
- Multiple SplatMeshes positioned far apart
- Visible striping or pixelation artifacts

### Enable ExtSplats

```typescript
// On individual SplatMesh
const splats = new SplatMesh({ url: './large-scene.spz', extSplats: true });

// For paged/streaming splats (set on SparkRenderer)
const spark = new SparkRenderer({
  renderer,
  pagedExtSplats: true,   // All paged SplatMeshes use extended encoding
});

// For accumulator (usually not necessary — Spark renders relative to camera)
const spark = new SparkRenderer({
  renderer,
  accumExtSplats: true,   // Extended encoding for intermediate accumulator
});
```

---

## build-lod CLI Tool

Pre-build LoD trees offline for faster loading and streaming.

### Prerequisites

Requires Rust: https://rust-lang.org/tools/install

### Basic Usage

```shell
# Build with quick algorithm (default)
npm run build-lod -- scene.ply

# Build with higher quality
npm run build-lod -- scene.ply --quality

# Multiple files
npm run build-lod -- "splats-dir/*.spz" --quality

# Direct cargo (alternative)
cd rust/build-lod
cargo run --release -- /path/to/scene.ply
```

### Output

Each `input.ply` → `input-lod.rad`

### Key Options

| Option | Description |
|--------|-------------|
| `--quick` | Fast tiny-lod algorithm (default) |
| `--quality` | Higher-quality bhatt-lod algorithm (recommended for production) |
| `--max-sh=#` | Limit max Spherical Harmonics (0-3) |
| `--rad-chunked` | Output chunked RAD for streaming (header + .radc chunks) |
| `--csplat` | Compact encoding |
| `--gsplat` | Higher-precision encoding (default) |

### Chunked Streaming

```shell
npm run build-lod -- scene.ply --quality --rad-chunked
# Outputs: scene-lod.rad + scene-lod-0.radc, scene-lod-1.radc, ...
```

```typescript
// Client loads header, fetches chunks on demand via HTTP Range requests
const splats = new SplatMesh({
  url: './scene-lod.rad',
  paged: true,
});
```

### Supported Input Formats

.ply (including PlayCanvas compressed), .spz, .splat, .ksplat, .sog, .zip (SOGS)

---

## .RAD File Format

Spark's extensible, configurable file format for LoD splat trees:

- Stores precomputed LoD tree
- Enables streaming via HTTP Range requests
- Coarse-to-fine loading: root splats load first, detail fills in progressively
- Supports both PackedSplats (16 byte) and ExtSplats (32 byte) encodings

---

## LoD Algorithms

### tiny-lod (Quick)

- Voxel octree-based, runs in background WebWorker
- 1-3 sec per 1M splats
- Default tree base: 1.5 (smoother transitions than 2.0)
- Good for on-demand LoD creation

### bhatt-lod (Quality)

- Higher-quality downsampling
- Slower, recommended for offline preprocessing
- Use with `--quality` flag in build-lod

### LoD Tree Base

```typescript
// Default base 1.5 (smoother transitions)
new SplatMesh({ url: './scene.spz', lod: true });

// Custom base (1.1 to 2.0)
new SplatMesh({ url: './scene.spz', lod: 2.0 });  // Powers of 2, more abrupt
new SplatMesh({ url: './scene.spz', lod: 1.2 });   // Very smooth, slightly larger tree
```

---

## Performance Tuning

### Splat Budget

```typescript
// Scale approach (recommended — adapts to platform)
spark.lodSplatScale = 0.5;  // Halve budget for better FPS

// Absolute approach
spark.lodSplatCount = 1_000_000;  // Fixed 1M budget
```

### Rendering Parameters

```typescript
// Reduce Gaussian extent (√5 for VR, √8 default)
spark.maxStdDev = Math.sqrt(5);

// Skip tiny splats
spark.lodRenderScale = 2.0;  // Min 2px per splat

// Foveation for VR/large scenes
spark.behindFoveate = 0.1;   // 10x coarser behind viewer
spark.coneFov0 = 60;         // Full detail in 60° cone
spark.coneFov = 120;
spark.coneFoveate = 0.5;
```

### WebGLRenderer

```typescript
const renderer = new THREE.WebGLRenderer({
  antialias: false,  // Critical: no benefit for splats, big perf cost
});
// Consider DPI impact on splat rendering
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
```

### Memory

```typescript
// Limit paged splat memory pool
const spark = new SparkRenderer({
  renderer,
  maxPagedSplats: 8_000_000,  // 8M instead of default 16M
});
```

---

## Multiple Renderers (Multi-Viewpoint)

Spark 2.0 supports independent renderers, each with own splats and sort order.

```typescript
// Main renderer (renders to canvas)
const mainSpark = new SparkRenderer({ renderer });
scene.add(mainSpark);

// Secondary renderer (off-screen)
const minimap = new SparkRenderer({
  renderer,
  target: { width: 256, height: 256 },
  autoUpdate: false,
});

// Render secondary viewpoint
await minimap.update({ scene, camera: minimapCamera });
minimap.renderTarget({ scene, camera: minimapCamera });
const pixels = minimap.readTarget();  // Uint8Array RGBA

// Cleanup when done
minimap.dispose();
```

---

## Quick Reference: LoD Checklist

1. Choose LoD approach: on-load (`lod: true`) or pre-built (`.rad`)
2. For production: pre-build with `build-lod --quality`
3. For streaming: use `--rad-chunked` + `paged: true`
4. Tune `lodSplatScale` for quality/performance balance
5. Use `extSplats: true` if scene has large coordinates
6. Set foveation for VR or focused viewing
7. Adjust per-mesh `lodScale` for important vs background objects
