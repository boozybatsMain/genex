# Animation Bug Prevention Rules

Use these rules before editing animation runtime behavior.

## State Ownership

Each controller owns one domain. Attack code should not secretly clean up guard state; dodge code should not become pack switching code. Cross-domain interrupts should go through explicit controller calls, FSM events, or action plans.

FSM state paths must be observable in `AnimationDebugSnapshot`. If a state can become stuck, add a watchdog trace and a test that proves normal gameplay does not trigger it.

## No Runtime-Dead Parallel Hooks

Do not keep alternate hooks that look like active runtime paths after callers move elsewhere. Move useful helpers into small modules and delete dead hooks. Tests should import helpers from stable helper modules, not from dead runtime hooks.

Remote animation uses `useEquipmentAnimations` plus `AnimFrameContext`. Avoid reintroducing a separate remote locomotion runtime path.

## Fingerprint Every Prepared Clip Category

Any clip category that affects prepared clips or playback startup must be included in pack sync fingerprints:

- URL
- body split
- loop mode
- clip name
- start offset
- structural params

This includes guard, dodge, and unequip clips. Speed-only changes should not force reload because speed is patched live.

## Tests Before Migration

Before extracting or migrating a controller slice, add focused tests that lock current behavior. Run the focused tests after the slice when practical. Mixer simulator tests are preferred for blends, timing, FSM paths, and action ownership.

## Mixer And Action Safety

- Never create a second mixer for upper/lower body or debug replay.
- Never call `mixer.update` from controllers, action plans, or timeline replay.
- Never create actions in frame ticks.
- Never zero/stop the old owner before the new owner has weight.
- Never assume `isRunning()` means an action no longer owns pose; check weight and active targets.
- Restore `timeScale` after reverse playback.
- Use `action.time = 0` for restart-only paths and `reset()` only for lifecycle reset.

## React And Debug UI

Runtime animation paths must remain ref-driven. Do not call React `setState` from per-frame controller logic.

The F7 timeline must be gated, bounded, and read-only:

- bounded snapshot buffer
- selectors that avoid unrelated subscriptions
- no timeline writes back into mixer/actions/game stores
- no heavy lane computation while hidden
- single stable global debug key handling

## Action Plans

Action plans may schedule weights and stops through the existing executor. They must not hide resets, create actions, update mixers, or mutate React state.

## Combo Chain

Sword `combo3` may exist as pack/editor data, but the active gameplay chain intentionally remains `primary -> combo2 -> combo4`. Do not reinsert `combo3` unless the combat design explicitly changes.

## Skill Copy Drift

The `.claude/skills/animation-subsystem` and `.agents/skills/animation-subsystem` copies should stay substantively synchronized. Differences should be limited to required skill metadata/frontmatter.
