---
name: sparkjs-v2-migration
description: SparkJS 0.1 to 2.0 migration guide—breaking changes, new features, API differences, dependency updates, SparkRenderer changes, multiple viewpoints, R3F integration updates, and fallback patterns. Use when upgrading an existing Spark 0.1 application to v2.0 or understanding what changed between versions.
---

# SparkJS 0.1 → 2.0 Migration Guide

Spark 2.0 is mostly backward-compatible with 0.1. Most apps will work with minimal changes.

## Update Dependencies

```json
{
  "dependencies": {
    "three": "0.180.0",
    "@sparkjsdev/spark": "2.0.0-preview"
  }
}
```

**Minimum THREE.js**: r179 (for 2D array texture support via `THREE.WebGLArrayRenderTarget`).

```shell
npm install @sparkjsdev/spark@2.0.0-preview three@0.180.0
```

Or via importmap (non-bundled):
```html
<script type="importmap">
  {
    "imports": {
      "three": "https://cdnjs.cloudflare.com/ajax/libs/three.js/0.180.0/three.module.js",
      "@sparkjsdev/spark": "https://sparkjs.dev/releases/spark/2.0.0-preview/spark.module.js"
    }
  }
</script>
```

---

## Breaking Changes

### 1. SparkRenderer → Multiple Renderers Model

**Before (0.1)**: One `SparkRenderer`, multiple viewpoints via `.newViewpoint()`.

```typescript
// OLD 0.1 code
const spark = new SparkRenderer({ renderer });
scene.add(spark);
const viewpoint = spark.newViewpoint();
```

**After (2.0)**: Each `SparkRenderer` IS a viewpoint. Create multiple instances.

```typescript
// NEW 2.0 code
const spark = new SparkRenderer({ renderer });
scene.add(spark);

// Second viewpoint = second SparkRenderer
const minimap = new SparkRenderer({
  renderer,
  target: { width: 256, height: 256 },
});
```

**Key differences**:
- `SparkRenderer` must be explicitly added to the scene in 2.0
- `SparkViewpoint` class no longer exists
- Each renderer has independent sort, LoD, and render state
- Multiple renderers share the same underlying `THREE.WebGLRenderer`

### 2. Auto-Created SparkRenderer

In 0.1, Spark auto-created a renderer. In 2.0, Spark still auto-creates one if needed, but for LoD and advanced features you should create your own:

```typescript
// Recommended: explicit SparkRenderer
const spark = new SparkRenderer({ renderer });
scene.add(spark);
```

### 3. SparkRenderer.onBeforeRender Timing

Internal rendering pipeline changed. If you relied on `onBeforeRender` hooks on `SparkRenderer`, test that timing still works for your use case.

### 4. Sort Worker Model

**Before (0.1)**: Worker pool shared across all operations.
**After (2.0)**: Dedicated `.sortWorker` and `.lodWorker` per SparkRenderer. Less blocking, more stable performance.

---

## New Features in 2.0

### Level-of-Detail (LoD)

Render unlimited splat counts within fixed budget:
```typescript
const splats = new SplatMesh({ url: './scene.spz', lod: true });
```

See `sparkjs-v2-lod` skill for full documentation.

### ExtSplats (32-byte Encoding)

Float32 centers for large-coordinate scenes:
```typescript
const splats = new SplatMesh({ url: './scene.spz', extSplats: true });
```

### Paged Streaming (.RAD Files)

Stream huge scenes progressively:
```typescript
const splats = new SplatMesh({ url: './scene-lod.rad', paged: true });
```

### Multiple Chained Modifiers

**Before (0.1)**: Single `objectModifier` / `worldModifier`.
**After (2.0)**: Arrays of modifiers.

```typescript
// OLD
mesh.objectModifier = myModifier;

// NEW (both work, array preferred for chaining)
mesh.objectModifier = myModifier;           // Still works
mesh.objectModifiers = [mod1, mod2, mod3];  // New: chained modifiers
```

### New SplatMesh Options

| New Option | Description |
|------------|-------------|
| `lod` | Enable LoD tree generation |
| `nonLod` | Keep original alongside LoD |
| `paged` | Enable streaming from .RAD |
| `extSplats` | Use 32-byte extended encoding |
| `lodScale` | Per-mesh LoD detail scale |
| `lodAbove` | Only LoD if splat count exceeds threshold |
| `onLoad` | Callback when initialization completes |
| `onFrame` | Per-frame update callback |

### New SparkRenderer Options

| New Option | Description |
|------------|-------------|
| `enableLod` | Enable/disable LoD system |
| `lodSplatScale` | Scale LoD budget |
| `lodSplatCount` | Override absolute LoD budget |
| `pagedExtSplats` | Extended encoding for paged splats |
| `accumExtSplats` | Extended encoding for accumulator |
| `behindFoveate` | Foveation behind viewer |
| `coneFov0/coneFov/coneFoveate` | Foveation cone parameters |
| `target` | Off-screen render target |
| `enable2DGS` | 2D Gaussian splatting mode |
| `covSplats` | Covariance-based encoding |

### New File Format Support

- `.rad` — Spark's LoD tree format (with optional chunked streaming)
- `.sog` / `.zip` — PC-SOGS format support
- Improved `.ply` support (compressed SuperSplat/gsplat variants)

### SplatEdit System

New declarative splat editing with SDF shapes. See `sparkjs-v2-editing` skill.

### Particle Generators

Built-in `generators.snowBox()`, `generators.staticBox()` for particle effects.

---

## Migration Checklist

1. **Update `package.json`**: `@sparkjsdev/spark: "2.0.0-preview"`, `three: ">=0.179.0"`
2. **Run `npm install`**
3. **Check SparkRenderer usage**:
   - Remove `.newViewpoint()` calls → create separate `SparkRenderer` instances
   - Ensure `SparkRenderer` is added to scene: `scene.add(spark)`
4. **Check WebGLRenderer settings**: `antialias: false` recommended
5. **Test existing splat loading**: Should work unchanged
6. **Consider LoD**: Add `lod: true` to large SplatMeshes for performance
7. **Check modifier usage**: `objectModifier` still works, `objectModifiers[]` is new
8. **Test render pipeline**: Verify timing of any `onBeforeRender` hooks
9. **Check THREE.js version**: Must be r179+ for 2D array textures

---

## R3F Migration

### React Three Fiber Integration

The `extend()` pattern is the same. Key change: ensure SparkRenderer renders before SplatMesh.

```tsx
// Same pattern, works in both 0.1 and 2.0
import { extend } from '@react-three/fiber';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
extend({ SparkRenderer, SplatMesh });
```

### New R3F Features

```tsx
// LoD support in R3F
<splatMesh args={[{ url: '/scene.spz', lod: true }]} />

// Extended splats
<splatMesh args={[{ url: '/scene.spz', extSplats: true }]} />

// Streaming
<splatMesh args={[{ url: '/scene-lod.rad', paged: true }]} />
```

---

## Common Migration Issues

### "Cannot read property 'newViewpoint' of undefined"

`SparkViewpoint` removed. Create a second `SparkRenderer` instead.

### Float16 Precision Artifacts (Striping)

Use `extSplats: true` on the affected SplatMesh, or position the SparkRenderer near the scene center.

### Performance Regression After Upgrade

- Check `lodSplatScale` if LoD is enabled (may be rendering more splats)
- Ensure `antialias: false` on WebGLRenderer
- Verify THREE.js version is r179+ (some features may silently degrade)

### Worker Errors

Spark 2.0 uses dedicated workers instead of a pool. If you were managing workers manually, the new model handles this automatically.

### Import Path Changes

All imports remain from `@sparkjsdev/spark`. No subpath changes in v2.0.
