---
name: sparkjs-v2-router
description: Decision framework for SparkJS v2.0 Gaussian Splatting projects. Routes to specialized SparkJS skills (core, dyno, lod, editing, migration) based on task requirements. Use when working with 3D Gaussian Splats, SparkJS, SplatMesh, or needing guidance on which SparkJS skills to combine.
---

# SparkJS v2.0 Router

Routes to 5 specialized SparkJS v2.0 skills for 3D Gaussian Splatting with THREE.js.

## Routing Protocol

1. **Classify** — Identify primary task type from user request
2. **Match** — Find skill(s) with highest signal match
3. **Combine** — Most SparkJS tasks need 1-2 skills together
4. **Load** — Read matched SKILL.md files before implementation

## Quick Route

### Tier 1: Core (Always Consider)

| Task Type | Skill | Primary Signal Words |
|-----------|-------|---------------------|
| Scene setup, loading splats | `sparkjs-v2-core` | SplatMesh, SparkRenderer, PackedSplats, ExtSplats, loading, url, scene |
| Shader effects, modifiers | `sparkjs-v2-dyno` | dyno, Dyno, shader, modifier, objectModifier, worldModifier, Gsplat, uniform |
| Level of Detail, streaming | `sparkjs-v2-lod` | LoD, LOD, streaming, .RAD, paged, build-lod, lodSplatCount, budget |

### Tier 2: Enhanced (Add When Needed)

| Task Type | Skill | Primary Signal Words |
|-----------|-------|---------------------|
| Editing, procedural, controls | `sparkjs-v2-editing` | SplatEdit, SDF, procedural, constructSplats, pushSplat, SparkControls, FpsMovement |
| Upgrading from 0.1 | `sparkjs-v2-migration` | migrate, upgrade, 0.1, breaking changes, OldSparkRenderer, v2, new features |

## Signal Matching Rules

### Priority Order

1. **Explicit class** — "create SplatMesh" → `sparkjs-v2-core`
2. **Specific technique** — "dyno shader modifier" → `sparkjs-v2-dyno`
3. **Problem domain** — "LoD streaming" → `sparkjs-v2-lod`
4. **Default** — Fall back to `sparkjs-v2-core`

## Common Combinations

### Basic Splat Scene (1 skill)

```
sparkjs-v2-core → SplatMesh, SparkRenderer, scene setup
```

### Splat with Custom Effects (2 skills)

```
sparkjs-v2-core → SplatMesh setup, loading
sparkjs-v2-dyno → objectModifier/worldModifier, Dyno blocks, uniforms
```

### Huge World with Streaming (2 skills)

```
sparkjs-v2-core → SplatMesh, SparkRenderer setup
sparkjs-v2-lod  → LoD tree, .RAD files, paged streaming, performance tuning
```

### Splat Editing Application (3 skills)

```
sparkjs-v2-core    → SplatMesh, PackedSplats setup
sparkjs-v2-editing → SplatEdit, SDF shapes, procedural generation, controls
sparkjs-v2-dyno    → Custom shader effects for edited splats
```

### Migrating from 0.1 (2 skills)

```
sparkjs-v2-migration → Breaking changes, API differences, fallback to OldSparkRenderer
sparkjs-v2-core      → New API reference for replacements
```

## Decision Table

| Scenario | Core | Dyno | LoD | Editing | Migration |
|----------|------|------|-----|---------|-----------|
| Load + display splats | Yes | No | No | No | No |
| Custom reveal animation | Yes | Yes | No | No | No |
| Huge outdoor scene | Yes | No | Yes | No | No |
| Splat painting/erasing | Yes | Maybe | No | Yes | No |
| Procedural splat generation | Yes | No | No | Yes | No |
| Upgrading existing 0.1 app | Yes | No | No | No | Yes |
| AR/VR splat experience | Yes | No | Maybe | No | No |
| Splat explosion effect | Yes | Yes | No | No | No |

## Skill Dependencies

```
sparkjs-v2-core (foundation)
├── sparkjs-v2-dyno (shader effects)
├── sparkjs-v2-lod (streaming + performance)
├── sparkjs-v2-editing (editing + procedural + controls)
└── sparkjs-v2-migration (upgrade guide)
```

## Quick Decision Flowchart

```
User Request
     │
     ▼
┌──────────────────────┐
│ Upgrading from 0.1?  │──Yes──▶ sparkjs-v2-migration + sparkjs-v2-core
└──────────────────────┘
     │ No
     ▼
┌──────────────────────┐
│ LoD / streaming?     │──Yes──▶ sparkjs-v2-lod + sparkjs-v2-core
└──────────────────────┘
     │ No
     ▼
┌──────────────────────┐
│ Custom shader effect? │──Yes──▶ sparkjs-v2-dyno + sparkjs-v2-core
└──────────────────────┘
     │ No
     ▼
┌──────────────────────┐
│ Editing / procedural? │──Yes──▶ sparkjs-v2-editing + sparkjs-v2-core
└──────────────────────┘
     │ No
     ▼
sparkjs-v2-core (default)
```

## R3F Integration Note

When using SparkJS with React Three Fiber, also load `r3f-fundamentals` for R3F patterns. SparkJS components are integrated via the `extend()` pattern:

```tsx
import { extend } from '@react-three/fiber';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
extend({ SparkRenderer, SplatMesh });
// Then use <sparkRenderer> and <splatMesh> in JSX
```
