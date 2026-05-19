---
name: sparkjs-v2-core
description: SparkJS v2.0 core API reference—SplatMesh, SparkRenderer, PackedSplats, ExtSplats, loading splat files, system design, and R3F integration. Use when rendering Gaussian splats, loading splat files, configuring the renderer, or setting up a SparkJS scene. The foundational skill that all other SparkJS skills depend on.
---

# SparkJS v2.0 Core

Advanced 3D Gaussian Splatting renderer for THREE.js. Renders splats alongside traditional triangle meshes using WebGL2. Works on desktop, mobile, and WebXR.

Package: `@sparkjsdev/spark` (v2.0.0-preview). Minimum THREE.js: r179.

## System Design

SparkRenderer traverses the scene graph, collects all SplatMesh splats via SplatAccumulator into a global PackedSplats, sorts them back-to-front, and renders via a single instanced draw call fused with the normal THREE.js render pipeline.

```
SplatMesh (source splats) → SplatAccumulator → PackedSplats → Sort → Render
     ↓                           ↓
  dyno pipeline            SparkRenderer
  (object/world modifiers)  (manages rendering)
```

Key architecture: `SplatMesh` extends `SplatGenerator` extends `THREE.Object3D`. Splats are "programmable" via the `dyno` shader graph system.

---

## SplatMesh

High-level interface for displaying Gaussian splats. Analogous to `THREE.Mesh` but for splat geometry. Added anywhere in scene hierarchy. Obeys `position`, `quaternion`, `rotation` (uniform `scale` only—averages x/y/z).

### Creating a SplatMesh

```typescript
import { SplatMesh } from '@sparkjsdev/spark';

// From URL (auto-detects .ply, .spz, .splat, .ksplat, .sog, .zip, .rad)
const splats = new SplatMesh({ url: './scene.spz' });
scene.add(splats);

// From URL with callbacks
const splats = new SplatMesh({
  url: './scene.ply',
  onProgress: (e) => console.log(`${(e.loaded/e.total*100).toFixed(0)}%`),
  onLoad: (mesh) => console.log(`Loaded ${mesh.numSplats} splats`),
  onFrame: ({ mesh, time, deltaTime }) => {
    // Per-frame updates; call mesh.updateVersion() if changes needed
  },
});

// From PackedSplats
const splats = new SplatMesh({ packedSplats: myPackedSplats });

// From stream (for huge files)
const splats = new SplatMesh({ stream: readableStream, streamLength: bytes });

// Procedural construction
const splats = new SplatMesh({
  constructSplats: (packed) => {
    const c = new THREE.Vector3(), s = new THREE.Vector3(0.01, 0.01, 0.01);
    const q = new THREE.Quaternion(), color = new THREE.Color(1, 0, 0);
    packed.pushSplat(c, s, q, 1.0, color);
  },
});

// With Level-of-Detail
const splats = new SplatMesh({ url: './scene.spz', lod: true });

// With extended precision (large coordinates)
const splats = new SplatMesh({ url: './scene.spz', extSplats: true });

// Streaming from pre-built .RAD
const splats = new SplatMesh({ url: './scene-lod.rad', paged: true });
```

### Constructor Options

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | `string` | URL to fetch splat file (.ply, .spz, .splat, .ksplat, .sog, .zip, .rad) |
| `fileBytes` | `Uint8Array \| ArrayBuffer` | Raw file bytes to decode |
| `stream` | `ReadableStream` | Stream source for huge files |
| `streamLength` | `number` | Byte length of stream |
| `packedSplats` | `PackedSplats` | Use existing PackedSplats as source |
| `maxSplats` | `number` | Reserve capacity for procedural construction |
| `constructSplats` | `(splats: PackedSplats) => void` | Procedural splat creation callback |
| `onProgress` | `(event: ProgressEvent) => void` | Download/decode progress |
| `onLoad` | `(mesh: SplatMesh) => void` | Initialization complete callback |
| `onFrame` | `({ mesh, time, deltaTime }) => void` | Per-frame update callback |
| `editable` | `boolean` | Enable SplatEdit effects (default: `true`) |
| `raycastable` | `boolean` | Participate in THREE.js raycasting (default: `true`) |
| `objectModifiers` | `GsplatModifier[]` | Object-space modifiers before transform |
| `worldModifiers` | `GsplatModifier[]` | World-space modifiers after transform |
| `extSplats` | `boolean \| ExtSplats` | Use 32-byte extended encoding |
| `lod` | `boolean \| number` | Enable LoD (number sets tree base, default 1.5) |
| `nonLod` | `boolean` | Keep original non-LoD splats alongside LoD version |
| `enableLod` | `boolean` | Force LoD on/off when both exist |
| `lodScale` | `number` | Per-mesh LoD detail scale (2.0 = 2x finer) |
| `paged` | `boolean \| PagedSplats \| SplatPager` | Enable paged streaming from .RAD |
| `splatEncoding` | `SplatEncoding` | Override encoding ranges |
| `fileType` | `SplatFileType` | Override file type detection |

### Instance Properties

| Property | Type | Description |
|----------|------|-------------|
| `initialized` | `Promise<SplatMesh>` | Await for load completion |
| `isInitialized` | `boolean` | Whether initialization is complete |
| `recolor` | `THREE.Color` | Tint all splats (default: white) |
| `opacity` | `number` | Global opacity multiplier (default: 1) |
| `maxSh` | `number` | Max Spherical Harmonics level 0-3 (default: 3) |
| `numSplats` | `number` | Current splat count |
| `packedSplats` | `PackedSplats` | The underlying packed splat data |
| `context` | `SplatMeshContext` | Scene/object dyno uniforms |

### Key Methods

```typescript
// Wait for load
await splats.initialized;

// Push a new splat
splats.pushSplat(center, scales, quaternion, opacity, color);

// Iterate all splats (read-only copies—use setSplat to modify)
splats.forEachSplat((index, center, scales, quaternion, opacity, color) => { });

// Get bounding box
const box = splats.getBoundingBox(centersOnly);  // THREE.Box3

// Update pipeline after changing modifiers or maxSh
splats.updateGenerator();

// Signal that splat data changed
splats.updateVersion();

// Raycasting
const raycaster = new THREE.Raycaster();
const intersects = raycaster.intersectObjects([splats]);

// Cleanup
splats.dispose();
```

---

## SparkRenderer

Manages splat rendering. Traverses scene, accumulates splats, sorts, renders. Spark auto-creates one if you don't. For advanced use (LoD tuning, multiple viewpoints, custom shaders), create your own.

### Creating a SparkRenderer

```typescript
import { SparkRenderer } from '@sparkjsdev/spark';

const spark = new SparkRenderer({
  renderer: webGLRenderer,  // Required: your THREE.WebGLRenderer
});
scene.add(spark);  // Must be in the scene hierarchy
```

### Key Constructor Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `renderer` | `THREE.WebGLRenderer` | required | WebGL renderer (use `antialias: false`) |
| `maxStdDev` | `number` | `Math.sqrt(8)` | Max std devs to render Gaussians |
| `minAlpha` | `number` | ~0.002 | Min alpha for splat rendering |
| `minPixelRadius` | `number` | 0 | Min pixel radius |
| `falloff` | `number` | 1.0 | Gaussian kernel falloff (0=flat, 1=normal) |
| `sortRadial` | `boolean` | `true` | Radial sort (true) or Z-depth sort (false) |
| `focalDistance` | `number` | 0 | Depth-of-field focal distance |
| `apertureAngle` | `number` | 0 | Aperture angle in radians |
| `focalAdjustment` | `number` | 1.0 | Adjust projected splat scale |
| `enableLod` | `boolean` | `true` | Enable LoD rendering |
| `lodSplatScale` | `number` | 1.0 | Scale factor for LoD budget |
| `lodSplatCount` | `number` | auto | Override LoD budget (auto: 500K–2.5M) |
| `accumExtSplats` | `boolean` | `false` | Extended encoding for accumulator |
| `pagedExtSplats` | `boolean` | `false` | Extended encoding for paged splats |
| `covSplats` | `boolean` | `false` | Covariance encoding for anisotropic scale |
| `enable2DGS` | `boolean` | `false` | Enable 2D Gaussian splatting |
| `clock` | `THREE.Clock` | new Clock | Synchronize time-based effects |
| `autoUpdate` | `boolean` | `true` | Auto-update splats each frame |
| `extraUniforms` | `object` | undefined | Extra shader uniforms |
| `vertexShader` | `string` | undefined | Custom vertex shader |
| `fragmentShader` | `string` | undefined | Custom fragment shader |
| `transparent` | `boolean` | `true` | Render in transparent pass |
| `depthTest` | `boolean` | `true` | Enable depth testing |
| `target` | `{ width, height, doubleBuffer?, superXY? }` | undefined | Off-screen render target |

### Key Methods

```typescript
// Dispose renderer and GPU resources
spark.dispose();

// Manual update (if autoUpdate is false)
await spark.update({ scene, camera });

// Render to canvas via secondary renderer
spark.render(scene, camera);

// Render to off-screen target
spark.renderTarget({ scene, camera });

// Read back target pixels
const rgba = spark.readTarget();  // Uint8Array

// Render environment map
const envMap = await spark.renderEnvMap({ scene, worldCenter });

// Apply envMap recursively
spark.recurseSetEnvMap(sceneRoot, envMap);
```

---

## PackedSplats

Collection of splats in a cache-efficient 16-byte/splat format. Center xyz as float16, scales as uint8 log-encoded, RGBA as uint8, quaternion as octahedral+angle encoding.

### Creating PackedSplats

```typescript
import { PackedSplats } from '@sparkjsdev/spark';

// Empty
const packed = new PackedSplats();

// From URL
const packed = new PackedSplats({ url: './scene.ply' });

// From raw array
const packed = new PackedSplats({ packedArray: myUint32Array, numSplats: 1000 });

// Procedural
const packed = new PackedSplats({
  construct: (splats) => {
    const c = new THREE.Vector3(), s = new THREE.Vector3(0.01, 0.01, 0.01);
    const q = new THREE.Quaternion(), color = new THREE.Color(1, 1, 1);
    for (let i = 0; i < 100; i++) {
      c.set(Math.random(), Math.random(), Math.random());
      splats.pushSplat(c, s, q, 1.0, color);
    }
  },
});

// With LoD
const packed = new PackedSplats({ url: './scene.spz', lod: true });
```

### Key Methods

```typescript
// Set splat at index
packed.setSplat(index, center, scales, quaternion, opacity, color);

// Push new splat (auto-resizes)
packed.pushSplat(center, scales, quaternion, opacity, color);

// Get splat data
const { center, scales, quaternion, opacity, color } = packed.getSplat(index);

// Iterate
packed.forEachSplat((index, center, scales, quaternion, opacity, color) => { });

// Signal GPU texture needs update
packed.needsUpdate = true;

// Cleanup
packed.dispose();
```

### Encoding Details

| Offset | Field | Size | Encoding |
|--------|-------|------|----------|
| 0-3 | RGBA | 4 bytes | uint8 per channel |
| 4-9 | center xyz | 6 bytes | float16 per axis |
| 10-11 | quat UV | 2 bytes | octahedral axis encoding |
| 12-14 | scale xyz | 3 bytes | uint8 log-encoded (e^-12..e^9) |
| 15 | quat angle | 1 byte | rotation 0..π |

### Spherical Harmonics

Extra SH data stored in `packed.extra`:
- `sh1`: `Uint32Array(numSplats * 2)` — 9 values, signed 7-bit
- `sh2`: `Uint32Array(numSplats * 4)` — 15 values, signed 8-bit
- `sh3`: `Uint32Array(numSplats * 4)` — 21 values, signed 6-bit

Memory: base 16 bytes/splat → up to 56 bytes/splat with SH1+SH2+SH3.

---

## ExtSplats

Extended 32-byte/splat encoding with float32 centers. Use for large scenes where float16 causes quantization artifacts (striping).

```typescript
import { ExtSplats } from '@sparkjsdev/spark';

// From URL
const ext = new ExtSplats({ url: './large-scene.ply' });

// Or enable on SplatMesh
const splats = new SplatMesh({ url: './scene.spz', extSplats: true });
```

### 32-byte Layout

| Offset | Field | Size | Description |
|--------|-------|------|-------------|
| 0-11 | center xyz | 12 bytes | float32 per axis |
| 12-13 | opacity | 2 bytes | float16 |
| 16-21 | color RGB | 6 bytes | float16 per channel |
| 22-27 | ln(scale) xyz | 6 bytes | float16 per axis |
| 28-31 | quaternion | 4 bytes | 10+10+12 bit encoding |

### Utility Functions

```typescript
import { utils } from '@sparkjsdev/spark';

utils.encodeExtSplat(extSplats.extArrays, index, x, y, z, sx, sy, sz, qx, qy, qz, qw, opacity, r, g, b);
const { center, scales, quaternion, color, opacity } = utils.decodeExtSplat(extSplats.extArrays, index);
```

---

## Loading Splats

### Auto-detectable Formats

```typescript
// .ply, .spz, .sog/.zip, .rad — auto-detected from contents
new SplatMesh({ url: './scene.ply' });
new SplatMesh({ url: './scene.spz' });
```

### Non-auto-detectable Formats

```typescript
import { SplatFileType } from '@sparkjsdev/spark';

// .splat and .ksplat need file extension or explicit fileType
new SplatMesh({ url: './scene.splat' });  // detected from extension
new SplatMesh({ url: 'api/blob/abc', fileType: SplatFileType.SPLAT });
new SplatMesh({ url: 'api/blob/def', fileType: SplatFileType.KSPLAT });
```

### SplatLoader (THREE.Loader API)

```typescript
import { SplatLoader } from '@sparkjsdev/spark';

const loader = new SplatLoader();
const packed = await loader.loadAsync(url, (event) => {
  console.log(`${((event.loaded / event.total) * 100).toFixed(1)}%`);
});
const mesh = new SplatMesh({ packedSplats: packed });
scene.add(mesh);
```

### Sharing PackedSplats Across Meshes

```typescript
const packed = new PackedSplats({ url: './clone.ply' });
scene.add(new SplatMesh({ packedSplats: packed }));
scene.add(new SplatMesh({ packedSplats: packed }));
```

---

## R3F Integration Pattern

SparkJS integrates with React Three Fiber via `extend()`:

```tsx
// SparkRenderer.tsx
import { extend, type ThreeElement } from '@react-three/fiber';
import { SparkRenderer as SparkSparkRenderer } from '@sparkjsdev/spark';

extend({ SparkRenderer: SparkSparkRenderer });

declare module '@react-three/fiber' {
  interface ThreeElements {
    sparkRenderer: ThreeElement<typeof SparkSparkRenderer>;
  }
}
```

```tsx
// SplatMesh.tsx
import { extend, type ThreeElement } from '@react-three/fiber';
import { SplatMesh as SparkSplatMesh } from '@sparkjsdev/spark';

extend({ SplatMesh: SparkSplatMesh });

declare module '@react-three/fiber' {
  interface ThreeElements {
    splatMesh: ThreeElement<typeof SparkSplatMesh>;
  }
}
```

```tsx
// Usage in component
function SplatScene() {
  const gl = useThree((s) => s.gl);
  const [ready, setReady] = useState(false);
  const meshRef = useRef<SparkSplatMesh>(null);

  const sparkArgs = useMemo(() => ({ renderer: gl }), [gl]);
  const splatArgs = useMemo(() => ({
    url: '/scene.spz',
    onLoad: (mesh) => console.log('Loaded', mesh.numSplats),
  }), []);

  return (
    <sparkRenderer
      ref={(spark) => { if (spark) setReady(true); }}
      args={[sparkArgs]}
    >
      {ready && <splatMesh ref={meshRef} args={[splatArgs]} />}
    </sparkRenderer>
  );
}
```

**Critical R3F pattern**: SparkRenderer must be created before SplatMesh (it injects shader chunks). Use a `useState` flag to gate SplatMesh rendering.

---

## Performance Quick Reference

- Desktop: 1–5M splats (10–20M+ on high-end)
- Mobile: 1–3M splats
- Quest 3: ~1M splats
- Use `antialias: false` on WebGLRenderer
- Adjust `maxStdDev` (default √8 ≈ 2.83, VR: √5 ≈ 2.24)
- Use LoD for scenes exceeding budget (see `sparkjs-v2-lod`)
