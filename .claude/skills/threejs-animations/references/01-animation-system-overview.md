# Animation System Overview

The Three.js animation system architecture, core classes, and update pipeline.

## Architecture

```
Scene Graph (Object3D tree)
  │
  ├── SkinnedMesh (with Skeleton → Bone[])
  │
AnimationClip (reusable data)
  ├── KeyframeTrack[] — per-property keyframe sequences
  │     └── name: "BoneName.quaternion"
  │     └── times: Float32Array
  │     └── values: Float32Array
  │
AnimationMixer (player/controller for one object)
  ├── clipAction(clip) → AnimationAction (cached, playback instance)
  │     ├── weight, timeScale, loop, enabled
  │     └── fadeIn(), fadeOut(), crossFadeTo()
  │
  └── update(delta) → internally:
        ├── Phase 1: Evaluate all active actions → accumulate weighted values
        └── Phase 2: Apply accumulated results to scene graph properties
```

## AnimationMixer

The central controller for animations on a single scene graph root.

### Constructor

```typescript
const mixer = new THREE.AnimationMixer(root: THREE.Object3D);
```

- `root` — The Object3D whose descendants this mixer animates.

### Properties

| Property | Type | Default | Description |
|---|---|---|---|
| `time` | `number` | `0` | Global mixer time (seconds). Starts at 0, advances with `update()` |
| `timeScale` | `number` | `1` | Global time multiplier. `0` = pause all actions, `1` = normal |

### Methods

| Method | Returns | Description |
|---|---|---|
| `clipAction(clip, root?, blendMode?)` | `AnimationAction` | Returns (creates if needed) a cached action for the clip. Same clip+root always returns same action |
| `existingAction(clip, root?)` | `AnimationAction \| null` | Returns existing action without creating one |
| `getRoot()` | `Object3D` | Returns the mixer's root object |
| `update(deltaSeconds)` | `this` | **Call once per frame.** Advances global time, evaluates all active actions, applies to scene graph |
| `setTime(seconds)` | `this` | Jumps to a specific time. Resets all actions first |
| `stopAllAction()` | `this` | Deactivates all actions |
| `uncacheAction(clip, root?)` | `void` | Deallocates action. **Stop the action first!** |
| `uncacheClip(clip)` | `void` | Deallocates all actions for this clip. **Stop related actions first!** |
| `uncacheRoot(root)` | `void` | Deallocates everything for this root. **Stop related actions first!** |

### Events

```typescript
mixer.addEventListener('loop', (e) => {
  // e.action: the AnimationAction that completed one loop iteration
  // e.loopDelta: number of loops completed
});

mixer.addEventListener('finished', (e) => {
  // e.action: the AnimationAction that finished all loops
  // e.direction: 1 (forward) or -1 (backward)
});
```

**Important**: The `finished` event may fire ~1 frame before the animation truly completes. Keep a reference to the callback function so you can remove it.

### Update Pipeline Internals

```typescript
update(deltaTime) {
  deltaTime *= this.timeScale;       // Apply global time scale
  this.time += deltaTime;

  // Alternating accumulator index (0 or 1 each frame)
  const accuIndex = this._accuIndex ^= 1;

  // Phase 1: Each active action evaluates keyframe interpolants
  // and writes weighted results into PropertyMixer accumulation buffers
  for (const action of activeActions) {
    action._update(time, deltaTime, timeDirection, accuIndex);
  }

  // Phase 2: Apply accumulated results to actual scene graph properties
  for (const binding of activeBindings) {
    binding.apply(accuIndex);
  }
}
```

Key details:
- Actions stored in a split array: `[active | inactive]` with `_nActiveActions` as boundary
- Frame-interleaved accumulator (`accuIndex ^= 1`) detects changes between frames
- When an action activates: saves original property values. When deactivated: restores them

## AnimationClip

A reusable set of keyframe tracks representing an animation.

### Constructor

```typescript
new THREE.AnimationClip(
  name?: string,           // Default: ''
  duration?: number,       // Default: -1 (auto-calculate from tracks)
  tracks?: KeyframeTrack[],
  blendMode?: number       // NormalAnimationBlendMode (default) or AdditiveAnimationBlendMode
);
```

### Properties

| Property | Type | Description |
|---|---|---|
| `name` | `string` | Used by `findByName()` and `clipAction()` for caching |
| `duration` | `number` | Duration in seconds |
| `tracks` | `KeyframeTrack[]` | Array of per-property keyframe sequences |
| `blendMode` | `number` | `NormalAnimationBlendMode` or `AdditiveAnimationBlendMode` |

### Key Methods

| Method | Description |
|---|---|
| `clone()` | Deep copy |
| `optimize()` | Removes redundant sequential keyframes |
| `resetDuration()` | Recalculates duration from longest track |
| `trim()` | Trims all tracks to clip duration |

### Static Methods

```typescript
// Find clip by name in array
THREE.AnimationClip.findByName(clips, 'Walk');

// Create clips from morph target naming patterns (Walk_001, Walk_002, ...)
THREE.AnimationClip.CreateClipsFromMorphTargetSequences(morphTargets, fps, noLoop);
```

## KeyframeTrack

A timed sequence of keyframes for a single property.

### Track Name Format (PropertyBinding)

The `name` field determines which scene graph property the track controls:

```
nodeName.property              → "mixamorigHips.quaternion"
nodeName.property[accessor]    → "mixamorigHips.rotation[x]"
.property                      → root node property
parentName/nodeName.property   → hierarchical path
.bones[BoneName].property      → skeleton bone
.materials[index].property     → multi-material
.morphTargetInfluences[name]   → morph target
```

### Subclasses

| Subclass | Value Size | Default Interpolation | Use Case |
|---|---|---|---|
| `VectorKeyframeTrack` | 2/3/4 | Linear | Position, scale |
| `QuaternionKeyframeTrack` | 4 | Linear (SLERP) | Rotation |
| `NumberKeyframeTrack` | 1 | Linear | Opacity, morph influence |
| `ColorKeyframeTrack` | 3 | Linear | Material colors |
| `BooleanKeyframeTrack` | 1 | Discrete | Visibility |
| `StringKeyframeTrack` | 1 | Discrete | String properties |

### Interpolation Modes

| Constant | Description |
|---|---|
| `THREE.InterpolateDiscrete` | Step function — no interpolation |
| `THREE.InterpolateLinear` | Linear interpolation (default for most) |
| `THREE.InterpolateSmooth` | Cubic spline interpolation |

### Creating Custom Keyframe Tracks

```typescript
// Position track (3 values per keyframe)
const posTrack = new THREE.VectorKeyframeTrack(
  'Bone.position',
  [0, 1, 2],                    // times
  [0,0,0, 1,2,0, 0,0,0]        // x,y,z for each time
);

// Rotation track (4 values per keyframe — quaternion)
const rotTrack = new THREE.QuaternionKeyframeTrack(
  'Bone.quaternion',
  [0, 1],
  [0,0,0,1, 0,0.707,0,0.707]   // qx,qy,qz,qw for each time
);

// Create clip
const clip = new THREE.AnimationClip('custom', -1, [posTrack, rotTrack]);
```

## PropertyBinding (Internal)

Resolves animation track names to actual scene graph properties.

### How `findNode` Works

1. If nodeName is falsy → returns root
2. Searches `root.children` recursively by `node.name`
3. Also searches `skeleton.bones` array by name (for skeletal animation)

### Why It Matters

- Track names **must match** node names in the scene graph exactly
- When loading FBX animations onto a GLTF model, bone names may differ
- `filterAnimationTracks()` is often needed to remove tracks for bones that don't exist on the target skeleton

## PropertyMixer (Internal)

Handles weighted value accumulation for a single property across multiple actions.

### Buffer Layout

```
buffer = [ incoming | accu0 | accu1 | orig ]
```

- **incoming**: Where interpolants write new keyframe data each frame
- **accu0 / accu1**: Frame-interleaved accumulators (one active per frame)
- **orig**: Original property value, saved on action activation, restored on deactivation

### Accumulation Algorithm (Normal Mode)

```
if (cumulativeWeight === 0) {
  accu = incoming * weight;          // First contribution replaces
} else {
  cumulativeWeight += weight;
  mix = weight / cumulativeWeight;
  accu = lerp(accu, incoming, mix);  // Weighted running average
}
```

If total weight < 1 after all actions: `result = lerp(result, original, 1 - totalWeight)`

### Additive Accumulation

Additive values are tracked separately and added on top of the normal result:
- For numbers: `result = normalResult + additiveValue * weight`
- For quaternions: `result = slerp(normalResult, normalResult * additiveQuat, weight)`

## AnimationUtils

### makeClipAdditive

```typescript
THREE.AnimationUtils.makeClipAdditive(
  targetClip,           // Clip to convert
  referenceFrame?,      // Frame to use as reference pose (default: 0)
  referenceClip?,       // Clip containing reference pose (default: targetClip)
  fps?                  // Frames per second (default: 30)
): AnimationClip
```

Converts keyframe values to **deltas from a reference pose**. The converted clip should use `AdditiveAnimationBlendMode`.

### subclip

```typescript
THREE.AnimationUtils.subclip(
  clip,         // Source clip
  name,         // New clip name
  startFrame,   // Start frame number
  endFrame,     // End frame number
  fps?          // Default: 30
): AnimationClip
```

Extracts a time range from a clip. Useful for splitting long animations or trimming loop ranges.

## Animation Constants

### Loop Modes

| Constant | Description |
|---|---|
| `THREE.LoopOnce` | Play once and stop |
| `THREE.LoopRepeat` | Repeat, jump from end to beginning |
| `THREE.LoopPingPong` | Alternate forward and backward |

### Blend Modes

| Constant | Description |
|---|---|
| `THREE.NormalAnimationBlendMode` | Standard weighted blending (default) |
| `THREE.AdditiveAnimationBlendMode` | Delta added on top of base |
