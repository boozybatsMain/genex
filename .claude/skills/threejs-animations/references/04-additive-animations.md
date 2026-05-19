# Additive Animations

How to layer pose offsets and action overlays on top of base animations using Three.js additive blend mode.

## Concept

**Normal blending**: Weighted average of all active animations → replaces the pose.

**Additive blending**: Computes **delta from a reference pose**, then **adds** that delta on top of whatever the normal blend produces.

```
Final Pose = NormalBlendResult + (AdditiveAnimation × weight)
```

For different value types:
- **Numbers/Vectors**: `result = normalResult + additiveValue × weight`
- **Quaternions**: `result = slerp(normalResult, normalResult × additiveQuat, weight)`

## Creating Additive Clips

### makeClipAdditive

```typescript
THREE.AnimationUtils.makeClipAdditive(
  targetClip: AnimationClip,
  referenceFrame?: number,           // Default: 0
  referenceClip?: AnimationClip,     // Default: targetClip
  fps?: number                       // Default: 30
): AnimationClip
```

Converts each keyframe value to: `value - referenceFrameValue`

**Important**: This modifies the clip **in-place** and sets `clip.blendMode = AdditiveAnimationBlendMode`.

### Basic Additive

```typescript
// Convert clip to additive (uses frame 0 of itself as reference)
THREE.AnimationUtils.makeClipAdditive(aimUpClip);

const action = mixer.clipAction(aimUpClip);
// blendMode is automatically AdditiveAnimationBlendMode
action.setEffectiveWeight(0);
action.play();
```

### Additive with External Reference

When the additive animation should be relative to a **different** animation's pose (e.g., equip animation relative to idle):

```typescript
const idleClip = clips.find(c => c.name === 'Idle');

// Make equip additive, using idle as the "zero" reference
THREE.AnimationUtils.makeClipAdditive(equipClip, 0, idleClip);

const equipAction = mixer.clipAction(equipClip);
equipAction.setLoop(THREE.LoopOnce, 1);
equipAction.clampWhenFinished = true;
equipAction.play();
```

### Additive Pose (Static — Single Frame)

For poses that represent a static offset (e.g., "sad_pose", "sneak_pose"):

```typescript
// First make additive
THREE.AnimationUtils.makeClipAdditive(snoozePoseClip);

// Then extract just 1-2 frames (the pose itself)
const poseClip = THREE.AnimationUtils.subclip(snoozePoseClip, 'snooze_pose', 2, 3, 30);

const action = mixer.clipAction(poseClip);
action.setLoop(THREE.LoopRepeat, Infinity);
action.setEffectiveWeight(0); // Start with no influence
action.play();

// Blend pose in/out dynamically:
action.setEffectiveWeight(0.5); // 50% snooze overlay
```

## Aim Offset System (Practical Example)

Aim offsets let you tilt a character's upper body based on camera pitch, layered additively on top of any locomotion.

### Setup

```typescript
// Load aim offset clips for each direction
const aimOffsetBase = await loadClip('aim_offset_center.fbx');
const aimOffsetUp   = await loadClip('aim_offset_up.fbx');
const aimOffsetDown = await loadClip('aim_offset_down.fbx');

// Make directional clips additive relative to the base/center clip
THREE.AnimationUtils.makeClipAdditive(aimOffsetUp, 0, aimOffsetBase);
THREE.AnimationUtils.makeClipAdditive(aimOffsetDown, 0, aimOffsetBase);

// Create actions
const aimUpAction = mixer.clipAction(aimOffsetUp);
const aimDownAction = mixer.clipAction(aimOffsetDown);

// Start playing at weight 0
aimUpAction.setLoop(THREE.LoopRepeat, Infinity);
aimUpAction.setEffectiveWeight(0);
aimUpAction.play();

aimDownAction.setLoop(THREE.LoopRepeat, Infinity);
aimDownAction.setEffectiveWeight(0);
aimDownAction.play();
```

### Per-Frame Update

```typescript
// In useFrame / render loop:
function updateAimOffset(cameraPitchRadians: number) {
  const maxPitch = Math.PI / 4; // ±45 degrees
  const normalizedPitch = THREE.MathUtils.clamp(
    cameraPitchRadians / maxPitch, -1, 1
  );

  if (normalizedPitch > 0) {
    // Looking up
    aimUpAction.setEffectiveWeight(normalizedPitch);
    aimDownAction.setEffectiveWeight(0);
  } else {
    // Looking down
    aimUpAction.setEffectiveWeight(0);
    aimDownAction.setEffectiveWeight(-normalizedPitch);
  }
}
```

## Combining Additive with Track Filtering

For upper-body-only additive overlays (e.g., shooting while running):

```typescript
function createAdditiveUpperBodyClip(
  clip: THREE.AnimationClip,
  referenceClip?: THREE.AnimationClip,
  referenceFrame: number = 0,
): THREE.AnimationClip {
  // Step 1: Filter to upper body tracks only
  const upperBodyTracks = clip.tracks.filter(track =>
    isUpperBodyBone(track.name.split('.')[0])
  );
  const upperClip = new THREE.AnimationClip(
    clip.name + '_upper_additive',
    clip.duration,
    upperBodyTracks,
  );

  // Step 2: Convert to additive
  if (referenceClip) {
    THREE.AnimationUtils.makeClipAdditive(upperClip, referenceFrame, referenceClip);
  } else {
    THREE.AnimationUtils.makeClipAdditive(upperClip, referenceFrame);
  }

  return upperClip;
}
```

This is the most powerful pattern: an additive animation that only affects specific bones, layered on top of any base animation.

## Official Example Pattern

From Three.js `webgl_animation_skinning_additive_blending`:

```typescript
const baseActions = { idle: {weight:1}, walk: {weight:0}, run: {weight:0} };
const additiveActions = { sneak_pose: {weight:0}, sad_pose: {weight:0} };

for (const anim of model.animations) {
  const name = anim.name;

  if (baseActions[name]) {
    // Normal blend mode — base locomotion
    const action = mixer.clipAction(anim);
    activateAction(action);
    baseActions[name].action = action;

  } else if (additiveActions[name]) {
    // Convert to additive
    THREE.AnimationUtils.makeClipAdditive(anim);

    // For static poses, extract just the pose frame
    if (name.endsWith('_pose')) {
      anim = THREE.AnimationUtils.subclip(anim, name, 2, 3, 30);
    }

    const action = mixer.clipAction(anim);
    activateAction(action);
    additiveActions[name].action = action;
  }
}

function activateAction(action) {
  const clip = action.getClip();
  const settings = baseActions[clip.name] || additiveActions[clip.name];
  setWeight(action, settings.weight);
  action.play();
}

function setWeight(action, weight) {
  action.enabled = true;
  action.setEffectiveTimeScale(1);
  action.setEffectiveWeight(weight);
}
```

## Internal Mechanics

### PropertyMixer Buffer with Additive

```
buffer = [ incoming | accu0 | accu1 | orig | addAccu ]
```

- Normal actions accumulate into `accu0`/`accu1` (frame-interleaved)
- Additive actions accumulate into `addAccu` separately
- Final `apply()` step: `result = normalResult + additiveResult`

### Order of Operations

1. All **normal** mode actions are blended together (weighted average)
2. All **additive** mode actions are accumulated separately
3. Additive values are applied **on top** of the normal result
4. If normal weight < 1, original pose contributes to the gap

### Additive Weight Behavior

- Weight 0 = no additive contribution
- Weight 1 = full additive delta applied
- Weight > 1 = amplified additive (can overshoot)
- Weight < 0 = inverted additive (opposite direction)

## Gotchas

### 1. makeClipAdditive Modifies In-Place

The clip object is modified directly. If you need both the original and additive versions, clone first:

```typescript
const additiveClip = clip.clone();
THREE.AnimationUtils.makeClipAdditive(additiveClip, 0, referenceClip);
```

### 2. Reference Clip Must Share Track Names

`makeClipAdditive` matches tracks by name. If the reference clip uses different bone names, the conversion will produce wrong results or be silently skipped.

### 3. Additive Affects Entire Skeleton

Unless you filter tracks first, an additive animation will affect all bones it has tracks for. Combine with track filtering for partial-body additive (see `createAdditiveUpperBodyClip` above).

### 4. Additive Quaternion Math

For quaternions, additive is multiplication, not addition:
```
result = normalQuaternion × additiveQuaternion^weight
```
This means large weights can produce non-normalized quaternions or unexpected rotations.

### 5. subclip Frame Numbers

`subclip` uses **frame numbers**, not seconds. Convert with: `frame = time × fps`
