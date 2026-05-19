# Animation Blending & CrossFading

How Three.js blends multiple animations together, and patterns for smooth transitions.

## How Weight Blending Works

### Pipeline (Per Frame)

```
1. For each active action:
   a. Evaluate keyframe interpolants → incoming values
   b. For each animated property:
      PropertyMixer.accumulate(incoming, weight)

2. For each animated property:
   PropertyMixer.apply() → write result to scene graph
```

### Weight Accumulation (Normal Mode)

```
First action:  accu = incoming × weight
Next actions:  cumulativeWeight += weight
               mix = weight / cumulativeWeight
               accu = lerp(accu, incoming, mix)  // Weighted running average

If total weight < 1:
  result = lerp(result, originalValue, 1 - totalWeight)
```

**Key insight**: Weights are implicitly normalized. Two actions with weight 0.5 each produce 50/50 blend. Two actions with weight 1.0 each also produce 50/50 blend (the running average normalizes). But if total weight < 1, the original/rest pose bleeds through.

### Weight Blending Example

```typescript
// 50/50 blend between walk and run
walkAction.setEffectiveWeight(0.5);
runAction.setEffectiveWeight(0.5);

// Equivalent — weights are implicitly normalized:
walkAction.setEffectiveWeight(1.0);
runAction.setEffectiveWeight(1.0);

// But this allows rest pose bleed-through:
walkAction.setEffectiveWeight(0.3);
runAction.setEffectiveWeight(0.3);
// Total = 0.6, so 40% rest pose shows through
```

## CrossFade Patterns

### Pattern 1: Built-in CrossFade (Simple)

```typescript
function crossFade(fromAction, toAction, duration) {
  toAction.enabled = true;
  toAction.setEffectiveWeight(1);
  toAction.time = 0;

  toAction.crossFadeFrom(fromAction, duration, false);
  toAction.play();
}
```

### Pattern 2: T-Pose-Safe CrossFade (Recommended)

The critical fix: keep the departing action **enabled and weighted** during the fade, and avoid calling `reset()` which can flash T-pose:

```typescript
function safeCrossFade(fromAction, toAction, duration) {
  // Keep previous animation fully active during crossfade
  fromAction.enabled = true;
  fromAction.setEffectiveWeight(1);

  // If previous stopped naturally, restart it briefly as pose source
  if (!fromAction.isRunning()) {
    fromAction.play();
  }

  // Setup new animation
  toAction.enabled = true;
  toAction.setEffectiveWeight(1);
  toAction.time = 0;  // Reset time directly — NOT action.reset()

  // CrossFade: smoothly interpolates weights
  toAction.crossFadeFrom(fromAction, duration, false);
  toAction.play();
}
```

### Pattern 3: Synchronized CrossFade (Wait for Loop End)

Useful for transitions that should happen at natural breakpoints:

```typescript
function synchronizedCrossFade(fromAction, toAction, duration) {
  function onLoop(event) {
    if (event.action === fromAction) {
      mixer.removeEventListener('loop', onLoop);
      crossFade(fromAction, toAction, duration);
    }
  }
  mixer.addEventListener('loop', onLoop);
}
```

### Pattern 4: FadeIn / FadeOut (No CrossFade)

For actions that don't overlap the same properties (e.g., upper body only):

```typescript
// Start a new action
action.reset().fadeIn(0.3).play();

// Stop an action
action.fadeOut(0.3);
// Note: action stays "playing" until weight reaches 0
```

## Directional Locomotion Blending

Blend 8 directional animations based on movement angle relative to facing direction.

### Architecture

```
All 8 direction actions play() simultaneously with weight 0
  │
  ▼
Each frame: calculate movement angle → compute primary/secondary weights
  │
  ▼
Smoothly interpolate current weights → target weights (lerp per frame)
  │
  ▼
Set effective weight on each action
```

### Implementation

```typescript
const DIRECTIONS = ['F', 'FR', 'R', 'BR', 'B', 'BL', 'L', 'FL'] as const;
const SECTOR_SIZE = 45; // degrees per direction

// Map from direction to currently playing action
const directionActions = new Map<string, THREE.AnimationAction>();
const currentWeights = new Map<string, number>();
const targetWeights = new Map<string, number>();

// Initialize: all playing at weight 0
for (const dir of DIRECTIONS) {
  const action = mixer.clipAction(clips[dir]);
  action.setEffectiveWeight(0);
  action.play();
  directionActions.set(dir, action);
  currentWeights.set(dir, 0);
  targetWeights.set(dir, 0);
}

// Per frame: compute target weights from movement angle
function updateDirectionWeights(movementAngleDegrees: number) {
  const normalizedAngle = ((movementAngleDegrees % 360) + 360) % 360;
  const primaryIndex = Math.round(normalizedAngle / SECTOR_SIZE) % 8;
  const primaryDir = DIRECTIONS[primaryIndex];

  // Distance from sector center
  const primaryCenter = primaryIndex * SECTOR_SIZE;
  let diff = normalizedAngle - primaryCenter;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  const blendFactor = Math.abs(diff) / (SECTOR_SIZE / 2);

  // Secondary direction
  const secondaryIndex = diff >= 0
    ? (primaryIndex + 1) % 8
    : (primaryIndex + 7) % 8;
  const secondaryDir = DIRECTIONS[secondaryIndex];

  // Set all targets to 0
  for (const dir of DIRECTIONS) {
    targetWeights.set(dir, 0);
  }

  // Primary: 1.0 at center, 0.5 at boundary
  targetWeights.set(primaryDir, 1 - blendFactor * 0.5);
  // Secondary: 0 at center, 0.5 at boundary
  targetWeights.set(secondaryDir, blendFactor * 0.5);
}

// Per frame: smooth interpolation
function applyWeights(delta: number, blendSpeed: number) {
  directionActions.forEach((action, dir) => {
    const current = currentWeights.get(dir) ?? 0;
    const target = targetWeights.get(dir) ?? 0;
    const newWeight = THREE.MathUtils.lerp(current, target, Math.min(1, delta * blendSpeed));

    if (Math.abs(newWeight - current) > 0.001) {
      currentWeights.set(dir, newWeight);
      action.setEffectiveWeight(newWeight);
    }
  });
}
```

## CrossFade Duration Guidelines

| Transition | Recommended Duration | Notes |
|---|---|---|
| Idle ↔ Walk | 0.3 – 0.5s | Smooth, unhurried |
| Walk ↔ Run | 0.2 – 0.3s | Quick but smooth |
| Any → Jump | 0.1 – 0.15s | Fast to feel responsive |
| Jump → Land | 0.15 – 0.2s | Slightly slower for weight |
| Equip/Unequip | 0.15 – 0.25s | Match animation start |
| Fire (one-shot) | 0.05 – 0.1s | Near-instant for responsiveness |
| Mode change (weapon) | 0.2 – 0.3s | Smooth weapon-mode transition |

## Common Pitfalls

### 1. T-Pose Flash During CrossFade

**Cause**: Calling `reset()` on the departing action, or allowing `enabled = false` on the departing action during crossfade.

**Fix**: Set `action.time = 0` directly. Keep `enabled = true` and `weight = 1` on the departing action during crossfade.

### 2. Wrong Speed After CrossFade

**Cause**: `crossFadeTo(target, duration, true)` (with `warp=true`) modifies the source action's `timeScale` to a ratio of clip durations. This value persists.

**Fix**: Use `warp=false`, or always call `setEffectiveTimeScale(1)` when reactivating a previously-warped action.

### 3. Rest Pose Bleeding Through

**Cause**: Total effective weight of all active actions < 1.0.

**Fix**: Ensure at least one action has `weight = 1`, or that weights sum to >= 1.

### 4. Forgotten `play()` Call

**Cause**: `fadeIn()` and `setEffectiveWeight()` don't activate the action in the mixer.

**Fix**: Always call `play()` before or alongside fade operations.

### 5. Weight Oscillation

**Cause**: Multiple competing fade operations on the same action (e.g., calling `fadeIn()` while a `fadeOut()` is still running).

**Fix**: Call `stopFading()` before starting a new fade, or use the `setWeight` helper which stops fading implicitly.
