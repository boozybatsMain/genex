# Three.js Animation System

Comprehensive guide to Three.js AnimationMixer, AnimationAction, animation blending, additive animations, bone masking, and game-ready animation architectures.

## When to Use This Skill

Use when working with:
- **AnimationMixer** setup, update loops, and disposal
- **AnimationAction** playback — play, stop, fade, crossfade, weight, timeScale
- **Animation blending** — weighted blending between multiple concurrent animations
- **Additive animations** — layering pose offsets or actions on top of base animations
- **Bone masking / partial body** — animating upper body separately from lower body
- **Directional locomotion** — 8-directional blending (walk/jog/sprint in all directions)
- **Animation state machines** — FSM patterns for game character animation
- **R3F / drei integration** — `useAnimations` hook, `useFrame` update patterns
- **Animation loading** — FBX/GLTF clip loading, caching, track filtering
- **Performance** — prebinding, caching, memory management, disposal

## Quick Reference

### Core Architecture

```
AnimationClip (data)
  └── KeyframeTrack[] (per-property keyframes)
        └── PropertyBinding (resolves track name → scene graph property)

AnimationMixer (player/controller)
  └── AnimationAction (playback instance of a clip)
        └── PropertyMixer (weighted accumulation buffer)
```

### Essential Pattern — Play an Animation

```typescript
const mixer = new THREE.AnimationMixer(model);
const action = mixer.clipAction(clip);
action.play();

// In render loop:
mixer.update(delta);
```

### Essential Pattern — CrossFade Between Animations

```typescript
// Ensure target is ready
nextAction.enabled = true;
nextAction.setEffectiveWeight(1);
nextAction.time = 0;

// CrossFade (false = don't warp timeScale)
nextAction.crossFadeFrom(currentAction, 0.3, false);
nextAction.play();
```

### Essential Pattern — Additive Animation Layer

```typescript
// Convert clip to additive (deltas from reference pose)
THREE.AnimationUtils.makeClipAdditive(clip, 0, referenceClip);

const action = mixer.clipAction(clip);
action.setEffectiveWeight(0); // Start silent
action.play();

// Later, blend in:
action.setEffectiveWeight(0.8);
```

### Essential Pattern — Upper/Lower Body Split

```typescript
function filterTracksByBones(clip, boneNames) {
  const boneSet = new Set(boneNames);
  const tracks = clip.tracks.filter(t => boneSet.has(t.name.split('.')[0]));
  return new THREE.AnimationClip(clip.name + '_filtered', -1, tracks);
}

const upperClip = filterTracksByBones(shootClip, UPPER_BODY_BONES);
const lowerClip = filterTracksByBones(runClip, LOWER_BODY_BONES);

mixer.clipAction(upperClip).play();
mixer.clipAction(lowerClip).play();
```

## Progressive Learning Path

### Level 1: Core System
Load `references/01-animation-system-overview.md` — AnimationMixer, AnimationClip, KeyframeTrack, PropertyBinding, update pipeline

### Level 2: Action Control
Load `references/02-animation-action-api.md` — Complete AnimationAction API: play/stop/reset, loop modes, weight, timeScale, enabled, clampWhenFinished

### Level 3: Blending & CrossFading
Load `references/03-blending-crossfading.md` — Weight accumulation internals, fadeIn/fadeOut, crossFadeTo/crossFadeFrom, synchronized transitions, directional blending

### Level 4: Additive Animations
Load `references/04-additive-animations.md` — AdditiveAnimationBlendMode, makeClipAdditive, subclip, pose overlays, aim offsets

### Level 5: Bone Masking & Layers
Load `references/05-bone-masking-layers.md` — Track filtering for partial body, upper/lower split, layered architecture (base + action + additive), combining approaches

### Level 6: State Machines & Game Patterns
Load `references/06-state-machines-patterns.md` — Animation FSM, R3F/drei integration, useAnimations hook, performance optimization, disposal, common pitfalls

## Critical Rules

### DO

- **One mixer per animated object** — not one per animation
- **Call `mixer.update(delta)` once per frame** — not per action
- **Keep departing actions enabled during crossfade** — prevents T-pose flash
- **Use `action.time = 0` instead of `action.reset()`** when you only need to restart time — `reset()` can cause brief T-pose
- **Always `play()` actions before fading** — `fadeIn`/`setEffectiveWeight` alone won't activate the action
- **Pre-bind animations** — call `mixer.clipAction(clip)` for all clips during initialization to avoid frame hitches
- **Cache FBX/GLTF loads** — use a shared promise cache to deduplicate concurrent requests
- **Strip root motion tracks** — filter out hip position/rotation tracks if handling movement via physics

### DON'T

- **Don't call both `stop()` and `reset()`** — `stop()` already calls `reset()` internally
- **Don't forget to reset timeScale after crossFadeTo** — the source action's timeScale gets warped and stays warped
- **Don't use `setState` in `useFrame`** — use refs for per-frame animation state to avoid React re-renders
- **Don't create/destroy actions frequently** — `clipAction()` is cached, reuse the same action instances
- **Don't use multiple mixers on the same skeleton** — they fight over shared bones. Use track filtering instead

## External Resources

- [Animation System Manual](https://threejs.org/docs/#manual/en/introduction/Animation-system)
- [AnimationMixer API](https://threejs.org/docs/api/en/animation/AnimationMixer.html)
- [AnimationAction API](https://threejs.org/docs/api/en/animation/AnimationAction.html)
- [Skinning Blending Example](https://threejs.org/examples/webgl_animation_skinning_blending)
- [Additive Blending Example](https://threejs.org/examples/webgl_animation_skinning_additive_blending)
- [drei useAnimations](https://github.com/pmndrs/drei#useanimations)
