# Animation Implementation Patterns

This reference is for adding or changing animation behavior after the controller/FSM/action-plan refactor.

## New Action Or State Checklist

Before changing runtime behavior:

1. Define or update clips in `AnimationPackDef`.
2. Add semantic action keys or derived runtime metadata in `packConverter.ts` only when data cannot express the behavior already.
3. Add focused tests that lock current behavior or specify the new behavior.
4. Add or update controller state transitions.
5. Emit trace labels for starts, handoffs, recovery, blocked inputs, and watchdogs.
6. Ensure `AnimationDebugSnapshot` and Timeline can show the state/action.
7. Add remote event/context mapping if gameplay replication needs it.
8. Run focused animation tests and type-check before manual verification.

## Controller Pattern

```ts
export interface ExampleControllerInput {
  refs: GenericActionRefs;
  pack: AnimationPack;
  frame: AnimFrameContext;
  nowMs: number;
  trace: (event: AnimationTraceInput) => void;
  sendFsm: (event: AnimationStateEvent) => void;
}

export function tickExampleController(input: ExampleControllerInput): ExampleControllerResult {
  if (!input.frame.active) return { handled: false };
  // Read refs, apply weights, send trace/FSM events.
  return { handled: true };
}
```

Keep controllers deterministic. Pass clocks, trace sinks, physics impulses, and network sends as services instead of reading globals inside the controller.

## Action Lifecycle

- Use `action.time = 0` for restart-only behavior.
- Use `reset()` only when intentionally clearing full lifecycle state.
- Call `play()` before an action owns weight.
- Do not stop a departing action before a replacement owns the relevant bones.
- Do not rely only on `isRunning()` for cleanup; clamped one-shots and active weight targets can still own pose.
- Restore positive `timeScale` after reverse unequip or any other reverse playback path.
- Keep clip default speed at `cfg.speed ?? 1.0` across loader paths.

## Action Plans

Use action plans for repeated, readable weight operations:

```ts
executeActionPlan({
  label: 'guard.fullBodyOwnership',
  steps: [
    { kind: 'instant', key: 'guard:idle', action: guardIdle, weight: 1 },
    { kind: 'target', key: 'idle:default', action: defaultIdle, weight: 0, speed: 12 },
  ],
  trace,
});
```

Do not put lifecycle resets, mixer updates, action creation, or React state in action plans.

## Pack Fingerprints

Pack sync fingerprints must include every clip category that affects prepared clips or playback startup:

- idles
- directional sets
- jump variants
- equip and unequip
- crouch transitions
- fire/attack
- reload
- hit reactions
- guard
- dodge
- death
- turn clips

Include URL, body split, loop, clip name, start offset, and structural params. Keep speed out of reload fingerprints because speed is live-editable.

## Adding Unarmed Fighting

Start from pack data, not new hook families:

1. Add fighter/unarmed clips to `AnimationPackDef` with semantic fire/action keys.
2. Add attack variants to controller state only for behavior that differs from current sword/ranged actions.
3. Write mixer simulator scenarios for jab/cross/hook, heavy, guard/dodge interactions, death interrupt, and remote observation.
4. Add trace labels such as `attack:fighter:start`, `attack:fighter:combo`, and `attack:fighter:recover`.
5. Verify F7 Live/Timeline/Remote shows the action state, active action weights, and markers.

## Remote Behavior

Remote players use the same orchestrator through `AnimFrameContext`. Put reusable remote-only helpers under `animation-system/remote/`, but do not create a parallel runtime hook that competes with `useEquipmentAnimations`.

## Tests

Use the mixer simulator when action timing, weights, crossfades, or FSM state paths matter. Use mock actions for small controller helpers. Keep tests focused and run them after each extraction or migration slice.
