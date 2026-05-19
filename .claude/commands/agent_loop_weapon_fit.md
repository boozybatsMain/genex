---
description: Autonomous weapon-fit auto-placement evaluation loop
model: opus
---

# Weapon-Fit Loop: Autonomous Self-Improving Auto-Placement Tuner

Render five weapons (rifle / pistol / sword / spell-orb / item) on the player in
idle pose at three camera angles, judge the placement, edit the auto-fit math,
re-test. Mirrors the `/agent_loop` spine (baseline → top-3 fix → retest →
selective revert) but with a vision rubric and a **tiny** edit allowlist.

## Usage

- `/agent_loop_weapon_fit` — run one improvement iteration, then stop
- `/agent_loop_weapon_fit baseline` — capture round 1; halt at human gate
- `/agent_loop_weapon_fit analyze` — re-summarize the most recent round (no new fixes)
- `/agent_loop_weapon_fit N` — run N iterations autonomously
- `/agent_loop_weapon_fit approve` — mark round 1 as human-approved (skip the gate)

## Mode

Parse `$ARGUMENTS`:

- **SINGLE-RUN** — empty / `baseline` / `analyze`: run one capture or one full
  iteration, present results, wait for user input.
- **AUTONOMOUS** — argument is a number N: run N iterations without asking
  between them. Stop only on:
  1. `no_progress_count >= 2` (two consecutive iterations with zero kept fixes)
  2. Graduation criterion met for two consecutive rounds:
     * average score across all 5 archetypes ≥ 80,
     * each of {rifle, pistol, sword, spell} ≥ 70 (mundane items exempt).
  3. Critical infrastructure failure.

## Pre-requisite: human approval gate

Round 1 cannot autonomously proceed past capture. It always halts and prints:

```
STOP — please review eval-results/weapon-fit/round-001/ and reply 'ok'
to start the loop.
```

When the user replies "ok" / "approved" / "ship it" / "yes":

```bash
.venv/bin/python -m scripts.run_weapon_fit_loop approve --round 1
```

Subsequent rounds skip the gate.

## Workflow

### 0. Load context (mandatory)

Read these files to reconstruct state across context compactions:

- `eval-results/weapon-fit/iteration-state.json` (`iteration`, `scores`, `no_progress_count`, `consecutive_passing_rounds`)
- `eval-results/weapon-fit/loop-log.json` (last 3 entries)
- `eval-results/weapon-fit/cache/{archetype}.json` (warm GLB cache)
- `.claude/agent-improve-learnings.md` (filter for `weapon-fit` category)

Determine the next iteration number from the state file.

### 1. Service restart (only if Python files were edited last iteration)

```bash
pkill -f "uvicorn src.main:app" || true
sleep 1
cd apps/claude-agent && EVAL_MOCK_FAST=true uv run uvicorn src.main:app --host 0.0.0.0 --port 8000 &
sleep 3
curl -s http://localhost:8000/health
```

If `apps/server/src/utils/meshyPrompts.ts` was edited (server-side), the change
takes effect on the **next** Meshy generation only. The loop must regenerate at
least one weapon (cheapest = item / coffee mug at ~$0.30) to verify the new
clause.

### 2. Pre-flight

- `pnpm dev:client` running on port 5173
- Workspace dir `game_data/worlds/__weapon_fit_eval__/game/manifest.json` exists
- Playwright Chromium installed: `pnpm playwright install chromium`

### 3. Baseline / Re-test capture

```bash
cd apps/claude-agent && .venv/bin/python -m scripts.run_weapon_fit_loop \
    baseline                                # round 1
# or
cd apps/claude-agent && .venv/bin/python -m scripts.run_weapon_fit_loop \
    capture --round $ITERATION              # round N
```

The CLI prints `screenshots_dir` + `targets`. Each archetype dir
(`rifle/0.png`, `rifle/45.png`, `rifle/90.png` + `.json` files) lands under
`eval-results/weapon-fit/round-NNN/{archetype}/`.

If round 1: **STOP** here, print the screenshot dir + the 15 paths in chat,
and wait for the user's "ok" reply.

### 4. Spawn the judge in scoring mode (Phase 1)

```python
Task({
  description: "weapon-fit-judge: score round-NNN",
  subagent_type: "weapon-fit-judge",
  prompt: f"""
You are evaluating round-{round_num:03d} of the weapon-fit loop.

Capture dir: eval-results/weapon-fit/round-{round_num:03d}/
Workspace:   game_data/worlds/__weapon_fit_eval__/game/manifest.json
Cache dir:   eval-results/weapon-fit/cache/

Run your Phase 1 (scoring only). Do NOT propose fixes yet.
Write per-archetype scores to .../{archetype}/scores.json and the aggregate to
.../aggregate.json.
"""
})
```

### 5. Smart attribution + selective revert

After Phase 1, compare the new aggregate against the previous round's aggregate
(if any). For each commit in `eval-results/weapon-fit/fixes.json`:

- Did the targeted metric improve? Keep.
- Did it regress? Revert.

Use the per-archetype scores, not just the average — a fix that helped pistol
but hurt sword should be evaluated on its primary target.

```python
from scripts.run_weapon_fit_loop import (
    commit_fix_weapon_fit, mark_all_kept,
    log_iteration, save_iteration_state, get_no_progress_count, generate_summary,
)
```

### 6. Spawn the judge in fix mode (Phase 2-3)

Only after attribution. Pass the new scores + the kept fix history; the judge
proposes ≤ 3 fixes, each committed via `commit_fix_weapon_fit(idx, files, target_metric, reasoning)`.

The wrapper rejects edits outside the allowlist:
- `apps/claude-agent/src/utils/weapon_orientation.py` (full)
- `apps/claude-agent/src/utils/weapon_fitting.py` (full — Decision 4)
- `apps/claude-agent/src/api/routes.py` (lines 1322 + 1341-1371 only)
- `apps/server/src/utils/meshyPrompts.ts` (lines 75-81 only)

### 7. Save state, log iteration, generate summary

```python
save_iteration_state({
  "iteration": iteration,
  "scores": per_archetype_scores,
  "avg": avg_score,
  "no_progress_count": new_count,
  "consecutive_passing_rounds": new_count,
  "fixes": kept_fixes,
})
log_iteration({
  "iteration": iteration, "scores": ..., "avg": ..., "kept_fixes": ..., "note": "..",
})
generate_summary()  # writes loop-summary.md
```

### 8. No-progress guard

If `no_progress_count >= 2`: hard-stop, restore to `weapon-fit-iter-N-start` tag,
print summary, exit.

### 9. End-of-loop report

```
Weapon-Fit Loop Complete

Iterations: N
Final scores: rifle=84 pistol=72 sword=81 spell=68 item=75 (avg=76)
Kept fixes: 4
Reverted fixes: 2

Read eval-results/weapon-fit/loop-summary.md for the full progression table.
```

ARGUMENTS: $ARGUMENTS
