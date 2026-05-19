# Bone Masking & Animation Layers

Three.js does **not** natively support bone-level animation masking (unlike Unity or Unreal Engine). This reference covers workarounds and architectures for partial-body animation.

## The Problem

In game animation, you often need:
- Run animation on legs + shoot animation on upper body
- Walk animation on full body + additive aim offset on spine/arms
- Crouch transition on legs only while upper body continues current action

Three.js's AnimationMixer always applies an action to **all bones in its tracks**. There is no built-in mask or layer system.

## Solution: Track Filtering

The primary workaround: create new `AnimationClip` objects containing only the tracks for the bones you want to animate.

### Core Utility

```typescript
function filterTracksByBones(
  clip: THREE.AnimationClip,
  boneNames: Set<string>,
  newClipName: string,
): THREE.AnimationClip {
  const filteredTracks = clip.tracks.filter((track) => {
    const boneName = track.name.split('.')[0];
    return boneNames.has(boneName);
  });
  const newClip = new THREE.AnimationClip(newClipName, -1, filteredTracks);
  newClip.resetDuration();
  return newClip;
}
```

### Defining Body Regions

```typescript
// Typical Mixamo rig bone names
const UPPER_BODY_BONES = new Set([
  'mixamorigSpine', 'mixamorigSpine1', 'mixamorigSpine2',
  'mixamorigNeck', 'mixamorigHead', 'mixamorigHeadTop_End',
  'mixamorigLeftShoulder', 'mixamorigLeftArm', 'mixamorigLeftForeArm',
  'mixamorigLeftHand', 'mixamorigLeftHandThumb1', /* ... finger bones ... */
  'mixamorigRightShoulder', 'mixamorigRightArm', 'mixamorigRightForeArm',
  'mixamorigRightHand', 'mixamorigRightHandThumb1', /* ... finger bones ... */
]);

const LOWER_BODY_BONES = new Set([
  'mixamorigHips',
  'mixamorigLeftUpLeg', 'mixamorigLeftLeg', 'mixamorigLeftFoot', 'mixamorigLeftToeBase',
  'mixamorigRightUpLeg', 'mixamorigRightLeg', 'mixamorigRightFoot', 'mixamorigRightToeBase',
]);
```

### Flexible Pattern Matching

For models with varying naming conventions, use pattern matching instead of exact names:

```typescript
const UPPER_BODY_PATTERNS = [
  'Spine', 'Neck', 'Head',
  'Shoulder', 'Arm', 'ForeArm', 'Hand', 'Thumb', 'Index', 'Middle', 'Ring', 'Pinky',
];

const LOWER_BODY_PATTERNS = [
  'Hips', 'UpLeg', 'Leg', 'Foot', 'Toe',
];

function isUpperBodyTrack(trackName: string): boolean {
  const boneName = trackName.split('.')[0].toLowerCase();
  return UPPER_BODY_PATTERNS.some(p => boneName.includes(p.toLowerCase()));
}

function isLowerBodyTrack(trackName: string): boolean {
  const boneName = trackName.split('.')[0].toLowerCase();
  return LOWER_BODY_PATTERNS.some(p => boneName.includes(p.toLowerCase()));
}
```

### Convenience Functions

```typescript
function createUpperBodyClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  const tracks = clip.tracks.filter(t => isUpperBodyTrack(t.name));
  return new THREE.AnimationClip(clip.name + '_upperBody', clip.duration, tracks);
}

function createLowerBodyClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  const tracks = clip.tracks.filter(t => isLowerBodyTrack(t.name));
  return new THREE.AnimationClip(clip.name + '_lowerBody', clip.duration, tracks);
}

function createAdditiveUpperBodyClip(
  clip: THREE.AnimationClip,
  referenceClip?: THREE.AnimationClip,
  referenceFrame: number = 0,
): THREE.AnimationClip {
  const upperClip = createUpperBodyClip(clip);
  upperClip.name = clip.name + '_upperBody_additive';

  if (referenceClip) {
    THREE.AnimationUtils.makeClipAdditive(upperClip, referenceFrame, referenceClip);
  } else {
    THREE.AnimationUtils.makeClipAdditive(upperClip, referenceFrame);
  }
  return upperClip;
}
```

## Layered Animation Architecture

Emulating Unreal Engine's animation layer system in Three.js:

```
┌──────────────────────────────────────────────────────┐
│ Layer 3: Additive Overlays (aim offset, emotion)     │
│   → AdditiveAnimationBlendMode, upper body only      │
│   → Weight: 0–1, always playing                      │
├──────────────────────────────────────────────────────┤
│ Layer 2: Action Layer (fire, reload, equip)          │
│   → NormalAnimationBlendMode, upper body only        │
│   → One-shot actions, crossfade between them         │
├──────────────────────────────────────────────────────┤
│ Layer 1: Base Locomotion (idle, walk, run, jump)     │
│   → NormalAnimationBlendMode, full body              │
│   → Crossfade between states                         │
└──────────────────────────────────────────────────────┘
```

### Implementation

```typescript
class LayeredAnimationSystem {
  private mixer: THREE.AnimationMixer;

  // Layer 1: Full-body locomotion
  private locomotionActions: Map<string, THREE.AnimationAction>;
  private currentLocomotion: string = 'idle';

  // Layer 2: Upper-body actions (track-filtered, normal mode)
  private actionLayerClips: Map<string, THREE.AnimationClip>;
  private currentActionLayer: THREE.AnimationAction | null = null;

  // Layer 3: Additive overlays (track-filtered + additive)
  private additiveActions: Map<string, THREE.AnimationAction>;

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(root);
    this.locomotionActions = new Map();
    this.actionLayerClips = new Map();
    this.additiveActions = new Map();

    // Setup Layer 1: Full-body locomotion
    for (const clip of clips.filter(c => isLocomotion(c.name))) {
      const action = this.mixer.clipAction(clip);
      action.play();
      action.setEffectiveWeight(c.name === 'idle' ? 1 : 0);
      this.locomotionActions.set(clip.name, action);
    }

    // Setup Layer 2: Upper-body action clips (prepared but not playing)
    for (const clip of clips.filter(c => isAction(c.name))) {
      const upperClip = createUpperBodyClip(clip);
      this.actionLayerClips.set(clip.name, upperClip);
    }

    // Setup Layer 3: Additive overlays
    for (const clip of clips.filter(c => isOverlay(c.name))) {
      const additiveClip = createAdditiveUpperBodyClip(clip);
      const action = this.mixer.clipAction(additiveClip);
      action.setEffectiveWeight(0);
      action.play();
      this.additiveActions.set(clip.name, action);
    }
  }

  // Layer 1: Change locomotion state
  setLocomotion(state: string, fadeDuration = 0.3) {
    if (state === this.currentLocomotion) return;
    const fromAction = this.locomotionActions.get(this.currentLocomotion);
    const toAction = this.locomotionActions.get(state);
    if (!toAction) return;

    if (fromAction) {
      fromAction.enabled = true;
      fromAction.setEffectiveWeight(1);
    }
    toAction.enabled = true;
    toAction.setEffectiveWeight(1);
    toAction.time = 0;
    if (fromAction) {
      toAction.crossFadeFrom(fromAction, fadeDuration, false);
    }
    toAction.play();
    this.currentLocomotion = state;
  }

  // Layer 2: Play one-shot upper body action
  playAction(name: string, fadeDuration = 0.15): Promise<void> {
    return new Promise((resolve) => {
      const clip = this.actionLayerClips.get(name);
      if (!clip) { resolve(); return; }

      // Fade out current action layer
      if (this.currentActionLayer) {
        this.currentActionLayer.fadeOut(fadeDuration);
      }

      const action = this.mixer.clipAction(clip);
      action.reset();
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.fadeIn(fadeDuration);
      action.play();
      this.currentActionLayer = action;

      const onFinished = (e: { action: THREE.AnimationAction }) => {
        if (e.action === action) {
          this.mixer.removeEventListener('finished', onFinished);
          action.fadeOut(fadeDuration);
          this.currentActionLayer = null;
          resolve();
        }
      };
      this.mixer.addEventListener('finished', onFinished);
    });
  }

  // Layer 3: Set additive overlay weight
  setOverlayWeight(name: string, weight: number) {
    const action = this.additiveActions.get(name);
    if (action) action.setEffectiveWeight(weight);
  }

  update(delta: number) {
    this.mixer.update(delta);
  }
}
```

## Why Not Multiple Mixers?

You might think: "Use one mixer for upper body, another for lower body." This is **NOT recommended** because:

1. **Bone conflicts**: Both mixers try to write to shared bones (e.g., Spine is affected by both body halves)
2. **No blending between mixers**: Each mixer's `update()` independently overwrites property values
3. **Skeleton inconsistency**: The two mixers don't coordinate their accumulation buffers
4. **donmccurdy (Three.js maintainer) advises against it**: "I would not go as far as trying to split individual KeyframeTracks out of a clip, or creating mixer for every bone."

**Exception**: If your model has truly separate armatures (e.g., a turret on a vehicle), separate mixers per armature are fine.

## Filtering Non-Existent Bone Tracks

When loading animations from a different source (e.g., weapon animations from Mixamo onto your character), the animation may reference bones that don't exist on the target skeleton. These produce console warnings and waste processing.

```typescript
function filterAnimationTracks(
  clip: THREE.AnimationClip,
  skeleton: THREE.Skeleton,
): THREE.AnimationClip {
  const boneNames = new Set(skeleton.bones.map(b => b.name));

  const validTracks = clip.tracks.filter((track) => {
    const boneName = track.name.split('.')[0];
    return boneNames.has(boneName);
  });

  return new THREE.AnimationClip(clip.name, clip.duration, validTracks);
}
```

## Root Motion Removal

Many FBX animations include root motion (hip position/rotation change). For physics-driven characters, strip these:

```typescript
function removeRootMotion(clip: THREE.AnimationClip): THREE.AnimationClip {
  const tracks = clip.tracks.filter((track) => {
    const name = track.name.toLowerCase();
    // Remove hip translation and rotation
    if (name.includes('hips.position') || name.includes('mixamorighips.position')) return false;
    if (name.includes('hips.quaternion') || name.includes('mixamorighips.quaternion')) return false;
    if (name.includes('hips.rotation') || name.includes('mixamorighips.rotation')) return false;
    return true;
  });
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}
```

## Practical Examples from Game Development

### Example 1: Run + Shoot

```typescript
// Full body run (Layer 1)
const runAction = mixer.clipAction(runClip);
runAction.play();

// Upper body shoot (Layer 2, track-filtered)
const shootUpperClip = createUpperBodyClip(shootClip);
const shootAction = mixer.clipAction(shootUpperClip);
shootAction.setLoop(THREE.LoopOnce, 1);
shootAction.clampWhenFinished = true;
shootAction.reset().play();
// Result: legs run, upper body shoots
```

### Example 2: Walk + Crouch Transition (Lower Body Only)

```typescript
// Keep walking upper body
// Crouch only affects lower body
const crouchLowerClip = createLowerBodyClip(crouchTransitionClip);
const crouchAction = mixer.clipAction(crouchLowerClip);
crouchAction.setLoop(THREE.LoopOnce, 1);
crouchAction.clampWhenFinished = true;
crouchAction.fadeIn(0.2).play();
```

### Example 3: Locomotion + Aim Offset (Additive Upper Body)

```typescript
// Base: walk (full body)
const walkAction = mixer.clipAction(walkClip);
walkAction.play();

// Additive: aim up/down (upper body only)
const aimUpAdditive = createAdditiveUpperBodyClip(aimUpClip, aimCenterClip);
const aimAction = mixer.clipAction(aimUpAdditive);
aimAction.setEffectiveWeight(0);
aimAction.play();

// Per frame: set weight based on camera pitch
aimAction.setEffectiveWeight(pitchNormalized);
```

## Design Guidelines

1. **Pre-split clips at load time** — don't filter tracks every frame
2. **Cache split clips** — store upper/lower variants alongside originals
3. **Use additive for continuous modifiers** — aim offset, lean, emotion overlays
4. **Use normal mode track-filtered for discrete actions** — fire, reload, equip
5. **Keep a "full body" locomotion base** — ensures all bones always have a valid pose
6. **Define body regions once** — share bone name sets across all split operations
7. **Test with SkeletonHelper** — visualize which bones are being animated

```typescript
const helper = new THREE.SkeletonHelper(model);
scene.add(helper);
```
