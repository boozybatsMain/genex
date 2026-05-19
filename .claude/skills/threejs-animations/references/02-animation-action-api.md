# AnimationAction — Complete API

AnimationAction controls playback of an AnimationClip on a mixer. **Most methods return `this` and can be chained.**

## Creating Actions

```typescript
// Always use mixer.clipAction() — it caches actions
const action = mixer.clipAction(clip);

// With optional root (for AnimationObjectGroup or alternate root)
const action = mixer.clipAction(clip, alternateRoot);

// With explicit blend mode
const action = mixer.clipAction(clip, undefined, THREE.AdditiveAnimationBlendMode);

// DON'T construct directly — no caching:
// new THREE.AnimationAction(mixer, clip) // Avoid this
```

## Properties

### Playback Properties

| Property | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | `false` = action has no effect (but stays scheduled) |
| `paused` | `boolean` | `false` | `true` = effective timeScale becomes 0 |
| `loop` | `Constant` | `LoopRepeat` | `LoopOnce`, `LoopRepeat`, or `LoopPingPong` |
| `repetitions` | `number` | `Infinity` | Number of loop repetitions |
| `clampWhenFinished` | `boolean` | `false` | If `true`, pauses on last frame when finished. If `false`, `enabled` becomes `false` instead |
| `time` | `number` | `0` | Local action time (seconds). Clamped/wrapped to `0...clip.duration` based on loop mode |
| `timeScale` | `number` | `1` | Playback speed. `0` = pause. Negative = reverse |
| `weight` | `number` | `1` | Blending influence `[0, 1]` |
| `blendMode` | `Constant` | `NormalAnimationBlendMode` | `NormalAnimationBlendMode` or `AdditiveAnimationBlendMode` |
| `zeroSlopeAtStart` | `boolean` | `true` | Smooth interpolation at animation start |
| `zeroSlopeAtEnd` | `boolean` | `true` | Smooth interpolation at animation end |

## Methods — Playback Control

### play()

```typescript
action.play(): this
```

Activates the action in the mixer. Important behaviors:
- Won't restart if already finished — call `reset()` first
- Won't play if `paused=true`, `enabled=false`, `weight=0`, or `timeScale=0`
- Must be called for the action to participate in blending at all

### stop()

```typescript
action.stop(): this
```

Immediately stops and **fully resets** the action. Internally calls `reset()`.

### reset()

```typescript
action.reset(): this
```

Sets `paused=false`, `enabled=true`, `time=0`, interrupts fading/warping, removes loop count.

**CRITICAL**: `reset()` briefly produces a "default pose" that can cause T-pose flash during crossfading. When you only need to restart time, set `action.time = 0` directly instead.

### isRunning()

```typescript
action.isRunning(): boolean
```

Returns `true` if time is actively advancing: activated AND not paused AND enabled AND timeScale !== 0 AND no delayed start.

### isScheduled()

```typescript
action.isScheduled(): boolean
```

Returns `true` if activated in the mixer (even if not actually running due to pause/weight/etc).

## Methods — Fading (Weight Control)

### fadeIn / fadeOut

```typescript
action.fadeIn(durationSeconds): this   // Weight: 0 → 1 over duration
action.fadeOut(durationSeconds): this  // Weight: 1 → 0 over duration
```

### crossFadeFrom / crossFadeTo

```typescript
// This action fades IN, fadeOutAction fades OUT
action.crossFadeFrom(fadeOutAction, duration, warp): this

// This action fades OUT, fadeInAction fades IN
action.crossFadeTo(fadeInAction, duration, warp): this
```

- `warp` (boolean): If `true`, timeScales are gradually adjusted to synchronize animation speeds
- **PITFALL**: When `warp=true`, the departing action's `timeScale` is modified and **NOT auto-reset** after crossfade completes. Always call `setEffectiveTimeScale(1)` when reactivating an action that was previously the source of a warped crossfade.

### setEffectiveWeight / getEffectiveWeight

```typescript
action.setEffectiveWeight(weight): this
action.getEffectiveWeight(): number
```

`setEffectiveWeight` sets the weight and stops any scheduled fading. The "effective" weight accounts for the `enabled` state: if `enabled=false`, effective weight is always 0.

### stopFading

```typescript
action.stopFading(): this
```

Stops any scheduled fadeIn/fadeOut.

## Methods — Time Scale Control

### setEffectiveTimeScale / getEffectiveTimeScale

```typescript
action.setEffectiveTimeScale(timeScale): this
action.getEffectiveTimeScale(): number
```

Sets timeScale and stops warping. Effective time scale accounts for `paused` state.

### setDuration

```typescript
action.setDuration(durationSeconds): this
```

Sets timeScale so one loop takes exactly the specified duration.

### warp

```typescript
action.warp(startTimeScale, endTimeScale, duration): this
```

Gradually changes timeScale from `start` to `end` over `duration`.

### halt

```typescript
action.halt(durationSeconds): this
```

Decelerates timeScale to 0 over duration (smooth stop).

### syncWith

```typescript
action.syncWith(otherAction): this
```

One-time sync: sets this action's time and timeScale to match another. Not continuous.

### stopWarping

```typescript
action.stopWarping(): this
```

## Methods — Other

```typescript
action.setLoop(loopMode, repetitions): this
action.startAt(mixerTime): this  // Delayed start (pass mixer.time + delay)
action.getClip(): AnimationClip
action.getMixer(): AnimationMixer
action.getRoot(): Object3D
```

## Recommended Helper Function

From Three.js official examples — always use this when activating/reactivating an action:

```typescript
function setWeight(action: THREE.AnimationAction, weight: number) {
  action.enabled = true;
  action.setEffectiveTimeScale(1);
  action.setEffectiveWeight(weight);
}
```

This prevents leftover state from previous crossfades or disabling from causing issues.

## Common Patterns

### One-Shot Animation (Fire, Attack)

```typescript
action.reset();
action.setLoop(THREE.LoopOnce, 1);
action.clampWhenFinished = true;
action.setEffectiveWeight(1);
action.play();

// Listen for completion
mixer.addEventListener('finished', function onFinished(e) {
  if (e.action === action) {
    mixer.removeEventListener('finished', onFinished);
    action.fadeOut(0.2);
  }
});
```

### Reverse Playback (Unequip = Equip Backwards)

```typescript
action.reset();
action.time = action.getClip().duration;  // Start at end
action.timeScale = -1;                     // Play backwards
action.fadeIn(0.2).play();
```

### Delayed Start

```typescript
action.startAt(mixer.time + 0.5); // Start 0.5s from now
action.play();
```

### Promise-Based One-Shot

```typescript
function playOneShot(mixer, action): Promise<void> {
  return new Promise((resolve) => {
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();

    function onFinished(e) {
      if (e.action === action) {
        mixer.removeEventListener('finished', onFinished);
        resolve();
      }
    }
    mixer.addEventListener('finished', onFinished);
  });
}

// Usage:
await playOneShot(mixer, attackAction);
// Attack finished, transition back to idle
```

## Gotchas & Edge Cases

1. **`play()` is required**: Setting weight > 0 or calling fadeIn alone does NOT activate the action. You must also call `play()`.

2. **`stop()` calls `reset()` internally**: Don't call both. Just call `stop()`.

3. **`clampWhenFinished` only applies on the final loop**: If the action is interrupted (stopped, crossfaded) before completing its last loop, clamping doesn't take effect.

4. **Setting `weight = 0` does NOT set `enabled = false`**: The action remains scheduled in the mixer. For full deactivation, call `stop()`.

5. **`crossFadeTo` warps timeScale**: The departing action's timeScale gets modified when `warp=true` and is NOT auto-restored. This causes the action to play at wrong speed if reused later.

6. **`finished` event fires ~1 frame early**: The action's `time` may not quite equal `clip.duration` when the event fires.

7. **`reset()` can cause T-pose flash**: It briefly puts the skeleton into its rest pose. During crossfading, set `action.time = 0` directly and keep `enabled = true` on the departing action instead.
