---
description: Create a new animation subsystem (e.g., football, sword, magic) with full player/multiplayer/module integration
---

# Add Animation Subsystem

You are tasked with creating a complete animation subsystem for the player character. This includes loading FBX clips, creating animation actions, body splits, 8-directional blending, transitions, remote player support, and wiring to gameplay mechanics.

## CRITICAL: USE STANDARD WORKFLOW COMMANDS

This command follows the project's **Research → Plan → Implement** workflow. Each phase MUST use the corresponding standard command's prompt as your operating instructions for that phase:

| Phase | Command Prompt to Follow | Animation Context to Inject |
|-------|--------------------------|----------------------------|
| **RESEARCH** | `.claude/commands/research_codebase.md` | Animation-specific research scope (see Step 1 below) |
| **PLAN** | `.claude/commands/create_plan.md` | Animation-specific plan structure (see Step 2 below) |
| **IMPLEMENT** | `.claude/commands/implement_plan.md` | Animation-specific implementation rules (see Step 3 below) |

**How this works**: At each phase, you read the standard command's prompt and follow its full process, but with the animation-specific context injected from this file. The standard commands define HOW to research/plan/implement. This file defines WHAT to research/plan/implement.

## FIRST: Load Required Skills

Read BOTH skill files IMMEDIATELY before doing anything else:

**1. Three.js Animation Fundamentals** (foundational knowledge):
```
.claude/skills/threejs-animations/SKILL.md
```
This covers AnimationMixer, AnimationAction API, blending/crossfading mechanics, additive animations, bone masking, and R3F/drei integration. Load its deeper references on demand when writing animation code (see the skill's Progressive Learning Path).

**2. Animation Subsystem** (project-specific patterns):
```
.claude/skills/animation-subsystem/SKILL.md
```
This is the project-specific **knowledge base** — it contains overview, file map, conventions, key questions, verification checklist, and bug prevention rules. Use it as your primary reference throughout all phases.

The animation-subsystem skill builds on top of threejs-animations. When you need to understand *how Three.js blending works*, refer to threejs-animations. When you need to understand *how this project uses blending*, refer to animation-subsystem.

## Context Resumption

This command supports **intermediate files** so work can be resumed in a new context window. At any step boundary, the user may provide:

- **A research file** (from Step 1) → Skip to Step 2 (PLAN), reading the research file for context
- **A plan file** (from Step 2) → Skip to Step 3 (IMPLEMENT), reading the plan file for context
- **Both files** → Skip to Step 3 with full context

When resuming, always read the provided file(s) fully before proceeding.

## Initial Response

When this command is invoked:

1. **If a research/plan file path was provided** → Read it, determine which step to resume from, and continue
2. **If a name or description was provided** (e.g., `/add_animations football`) → Begin from Step 1
3. **If no parameters provided** → Ask the user what animation subsystem they want to create

---

## Step 1: RESEARCH — Follow `/research_codebase` Prompt

**Read `.claude/commands/research_codebase.md` and follow its full process**, with the following animation-specific scope injected:

### Animation Research Scope

**Research question to investigate**: "How should the {name} animation subsystem be built? What are the requirements, what exists in the codebase to model after, and what integration points are needed?"

#### 1a. Gather from User Prompt First

Before starting the research_codebase flow, extract what the user already told you. **Do NOT re-ask questions the user already answered.** Look for:
- Subsystem name
- What animations are needed
- Any specific behavior described
- R2 URLs or asset locations mentioned

#### 1b. Ask Remaining Animation-Specific Questions

Only ask what you genuinely don't know. Skip questions you can determine yourself from the codebase.

**Questions to ask the user (only if not already answered):**

1. **Subsystem name**: What is the name? (e.g., "football", "sword", "dance")

2. **Animation R2 URLs**: Where are the FBX files hosted? Provide R2 bucket URLs or local `public/animations/` paths. Which clips are **looping** (idle, walk, run) vs **one-shot** (kick, throw, emote)?

3. **Blending behavior**: Should some blend together? For example, should the character be able to run while holding a football (like the weapon system where upper body holds weapon + lower body runs), or should the animations take over the entire body (like a dance)?

4. **Overlay vs replace**: Does this subsystem layer on top of base animations (like spell-cast — upper body casts, legs keep running), or take over completely (like weapon — all clips are subsystem-specific)?

5. **Mode entry/exit**: What triggers mode activation? Is there an equip/unequip transition animation? (e.g., "pressing F equips football" or "automatic when near a ball")

6. **Jump handling**: Does this subsystem have its own jump animations, or should base jump clips play?

7. **Mechanics binding** (can defer to Step 5): What gameplay actions trigger which animations? (e.g., "left click → kick", "E → pass")

**Questions you should figure out yourself** (don't ask the user):
- Multiplayer sync: Analyze existing schema and determine what new fields are needed
- Module config: Check if AnimationStateGraphModule needs updates
- File structure: Follow the established pattern from weapon/spell-cast subsystems
- Body split specifics: Use the established split functions from `skeleton.utils`

#### 1c. Animation-Specific Research Areas

When following the `research_codebase` process, target these specific areas:

- Read the current `PlayerModel.tsx` integration points
- Check `MovementSystem.ts` for how modes are sent
- Check `CharacterState` schema for existing fields
- Identify the closest existing subsystem to use as a reference (weapon or spell-cast)
- Search `thoughts/shared/` for any existing research/plans about the requested animation type

#### 1d. Research Output

The research document should include these animation-specific sections (in addition to the standard `research_codebase` format):

```markdown
## Requirements (from user)
- Subsystem name: {name}
- Animation clips: [list with looping/one-shot labels]
- R2 URLs: [list]
- Blending strategy: [overlay/replace]
- Mode entry/exit: [trigger mechanism]
- Jump handling: [own jumps / base jumps]
- Mechanics: [action bindings]

## Codebase Analysis
- Reference subsystem: [weapon/spell-cast]
- PlayerModel.tsx integration point: [line numbers]
- Schema fields needed: [list with types]
- MoveMessage fields needed: [list]
- Server handler changes: [list]
- Module config changes: [if any]

## Architecture Decision
- Strategy: [overlay at weight X / replace]
- Body split plan: [full-body locomotion / split one-shots]
- Directional variants: [8-dir walk/run, all-direction sprint, etc.]
- Mode enum: [list all modes]

## Files to Create/Modify
[Complete file list]
```

### ⛔ PHASE GATE 1 — STOP HERE

**YOU MUST STOP NOW.** Do not proceed to Step 2. Tell the user:

> **Research is complete.** I've saved the findings to `[file path]`. Please review the research document — especially the Architecture Decision and Files to Create/Modify sections. When you're ready, say "continue" to proceed to planning, or give me feedback to adjust.

**Wait for the user to respond.**

---

## Step 2: PLAN — Follow `/create_plan` Prompt

**Read `.claude/commands/create_plan.md` and follow its full process**, with the following animation-specific structure injected:

If resuming from a research file, read it fully first and pass it as context to the create_plan flow.

### Animation-Specific Plan Structure

The plan MUST include these animation-specific sections (in addition to the standard `create_plan` format):

1. **Mode enum** — List all animation modes with naming convention (`{Name}AnimMode.{Name}Idle`, etc.)
2. **Mode category sets** — Which modes are idle, directional, jump, one-shot
3. **Body split plan** — For each clip type, which split function to use (or full-body)
4. **File list** — All files that will be created/modified, following the skill's "New Subsystem File Structure"
5. **Sync field plan** — Any new fields needed in CharacterState, MoveMessage, server handlers
6. **Constants list** — All tunable parameters with default values

### Animation Plan Phases

The plan should be structured into these phases:

```markdown
## Phase 1: Core Animation Files
- types.ts, constants, animation configs
- Loader hook (FBX loading, body splits, action creation)
- Transitions hook (enter/exit mode)
- Jump system hook (if applicable)
- Locomotion hook (mode resolution, 8-dir blend)
- Orchestrator hook (pipeline composition)
- Remote locomotion hook
- Barrel export

## Phase 2: Integration & Wiring
- PlayerModel.tsx integration
- Multiplayer sync (CharacterState, MoveMessage, server handlers)
- RemotePlayer.tsx integration
- AnimationStateGraph config (if applicable)

## Phase 3: Mechanics Binding
- Input system wiring
- Trigger callbacks for gameplay actions
- One-shot action connections

## Phase 4: Verification & Polish
- Automated checks (type-check, lint, build)
- Full verification checklist
- Manual testing guidance
```

### ⛔ PHASE GATE 2 — STOP HERE

**YOU MUST STOP NOW.** Do not proceed to Step 3. Tell the user:

> **Plan is complete.** I've saved it to `[file path]`. Please review the plan — especially the Mode Enum, Body Split Plan, File Creation Order, and Sync Field Plan. When you're ready, say "continue" to start implementation, or give me feedback to adjust.

**Wait for the user to respond.**

---

## Step 3: IMPLEMENT — Follow `/implement_plan` Prompt

**Read `.claude/commands/implement_plan.md` and follow its full process**, with the following animation-specific rules injected:

If resuming from a plan file, read it fully first and pass it as context to the implement_plan flow.

### CRITICAL: Load Animation References Before Writing Code

Before writing ANY animation code, load these references:

**From `threejs-animations` skill** (load on demand as needed):
- `threejs-animations/references/03-blending-crossfading.md` — Weight accumulation, crossfade mechanics
- `threejs-animations/references/05-bone-masking-layers.md` — Track filtering for body splits

**From `animation-subsystem` skill** (always load before implementation):
- `references/02-implementation-patterns.md` — Code templates for every hook type
- `references/03-bug-prevention-rules.md` — The 8 critical anti-patterns to avoid

### Animation Implementation Rules

These rules are **mandatory** for all animation code and supplement the standard `implement_plan` process:

**Per-file verification** — After creating each animation file, verify against:
- [ ] Clips cloned before body splitting (Rule 6)
- [ ] Track names verified or filter results checked (Rule 1)
- [ ] No track overlap between simultaneous actions (Rule 2)
- [ ] Pelvis quaternion intact in locomotion, locked in jumps (Rule 3)
- [ ] Crossfade durations ≤ 0.3s for transitions, ≤ 0.2s for jumps (Rule 4)
- [ ] No state machine gaps in mode resolution (Rule 8)
- [ ] All state in useRef, never useState (except loading flags)

**Animation code rules**:
- ALWAYS create a constants file separate from `animation.constants.ts`
- ALWAYS include remote player support
- ALWAYS use useRef for animation state (never useState)
- ALWAYS clone clips before body splitting
- ALWAYS verify bone names from loaded FBX track data
- NEVER create a second AnimationMixer
- NEVER assume bone priority exists in Three.js (it doesn't)
- NEVER use crossfade durations > 0.5s
- NEVER strip pelvis quaternion tracks (lock them instead)

### Sync Field Implementation

When implementing multiplayer sync fields, follow the 6-step pipeline:
1. `CharacterState` schema (`packages/shared/src/game/character/character.state.ts`)
2. `MoveMessage` type (`packages/shared/src/types/messages/MoveMessage.ts`)
3. Client sends in `MovementSystem.ts`
4. Server receives in `apps/server/src/rooms/messages/move.ts`
5. Server copies to schema in `apps/server/src/rooms/sandbox.room.ts`
6. Client reads in remote hooks

---

## Step 4: BIND — Mechanics Wiring (Part of `/implement_plan`)

This step is part of the implementation phase but deserves explicit attention:

Ask the user about mechanics bindings (if deferred from Step 1):
- What gameplay actions trigger which animations?
- Are these input-driven (InputSystem), event-driven (EventBus), or physics-driven?
- Are they one-shot (kick), toggle (crouch), or continuous (channeled spell)?

Wire trigger callbacks from the orchestrator hook to the appropriate input system.

---

## Step 5: VERIFY — Automated + Manual Checks

### Automated Checks

```bash
pnpm type-check && pnpm lint && pnpm build
```

All three must pass with zero errors.

### Verification Checklist

Run the full checklist from the skill's "Verification Checklist" section.

### Manual Testing Guidance

Present this to the user:
1. Enter the new mode — character should transition smoothly from idle
2. Move in all 8 directions — directional blending should be smooth
3. Sprint in all directions — sprint clips should play correctly
4. Jump in mode — 3-phase should sequence correctly (start → inAir → land)
5. Exit mode — should return to base animations cleanly
6. Trigger one-shot actions — should play and return to locomotion
7. Test with a second player (multiplayer) — remote player should mirror local behavior
8. Rapid mode switching — no T-pose, crab pose, or corruption

---

## Step 6: DEBUG & TUNE — Iterative Polish

After verification, explicitly ask the user:

> **The animation subsystem is implemented and passes all automated checks. Would you like to:**
>
> 1. **Debug any visual issues** — Describe what you see and when. I'll investigate the root cause (not add compensating hacks — Rule 7).
>
> 2. **Tune animation parameters** — Crossfade durations, blend speeds, grace periods, overlay weights.
>
> 3. **Test multiplayer** — Check that remote players mirror local behavior.
>
> 4. **We're good** — Everything looks right, let's finalize.

### Common Debug Scenarios

| User Reports | Likely Cause | Where to Look |
|---|---|---|
| "T-pose flash on enter/exit" | Weight dropping to 0 during transition | Transitions hook — ensure outgoing action stays enabled during crossfade |
| "Crab pose" or twisted body | Multi-way blend from state gap or stale actions | Locomotion hook — check for 1-frame gaps in mode resolution |
| "Arms spread wide" (remote) | 50/50 blend — base not faded out | Remote locomotion — mirror local fadeout logic |
| "Snappy/jarring transition" | Crossfade too short or instant swap | Constants file — increase crossfade duration (stay ≤ 0.5s) |
| "Floaty/mushy transition" | Crossfade too long | Constants file — decrease crossfade duration |
| "Wrong direction animation" | Movement angle calculation off | Locomotion hook — check `getDirectionBlendWeights` input |
| "Jump animation cuts off" | Land phase too short or missing grace frames | Jump system — check phase hold duration |
| "Character sinks/floats" | Pelvis quaternion stripped or wrong Y offset | Loader — verify pelvis tracks intact; check collider height |
| "Idle jitter" | Missing grace period | Locomotion hook — add/increase `MOVEMENT_GRACE_PERIOD` |

---

## Step 7: LEARN — Update Knowledge Base If New Patterns Discovered

After the subsystem is implemented and verified, evaluate whether the process revealed any **new knowledge** not already captured in the animation skill references. This is the same feedback loop used by `/fix_animations`.

### When to Update

Update the knowledge base if any of these occurred during implementation:

1. **A new body-split recipe was needed** that doesn't match existing `skeleton.utils` patterns → Add to `references/02-implementation-patterns.md`
2. **A new bug pattern was discovered** during verification → Add to `references/03-bug-prevention-rules.md` and to `/fix_animations` Step 1 taxonomy
3. **The file structure template needed changes** → Update `SKILL.md` "New Subsystem File Structure" section
4. **A new sync field pattern was needed** → Add to `references/01-architecture-patterns.md` multiplayer sync section
5. **A new verification check was discovered** → Add to the checklist in both `SKILL.md` and `references/03-bug-prevention-rules.md`
6. **The existing patterns had an undocumented edge case** → Add as an edge case note in the relevant reference

### How to Update

**Always read the target file first** to find the right insertion point. Follow the existing formatting conventions. Additions should be concise — the skill references must stay scannable.

After updating, tell the operator:

```
## Knowledge Base Updated

New patterns from this implementation have been added to the animation skill:

- **[What was updated]**: [Brief description]
- **File(s) changed**: [list]

This will help future animation subsystem creation and bug prevention.
```

---

## Context Management

This is a large task. Use subagents when context grows large:
- **codebase-locator** to find integration points without loading full files
- **codebase-analyzer** to understand specific component details
- **codebase-pattern-finder** to find similar patterns in weapon/spell subsystems

Load skill references progressively — only load a reference file when you're about to start the step that needs it.

## Important Rules

### Phase Gates (HIGHEST PRIORITY)

- **NEVER proceed past a ⛔ PHASE GATE without explicit user approval**
- **NEVER combine research + plan + implementation in one response**
- **ALWAYS stop after completing each phase and wait for user to say "continue"**
- **ALWAYS present your output for review before moving to the next phase**
- If the user gives feedback at a gate, incorporate it and wait again

### Standard Workflow Integration

- **ALWAYS read the relevant standard command prompt** before starting each phase
- The standard commands define HOW to do the work (process, sub-agents, document format)
- This file defines WHAT to focus on (animation-specific scope, questions, rules)
- When the standard command and this file conflict, this file's animation-specific rules take precedence for domain decisions; the standard command's process takes precedence for workflow decisions

### Knowledge Feedback Loop

- **ALWAYS run Step 7 (LEARN)** after a verified implementation — The knowledge base must grow with every new subsystem
