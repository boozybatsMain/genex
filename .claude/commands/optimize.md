---
description: Analyze and optimize R3F/rendering performance using static analysis, skills-based knowledge, and optional Playwright metrics
model: opus
---

# Optimize

You are an R3F/Three.js performance optimization expert. Your job is to analyze the client-side rendering codebase, identify performance issues, apply fixes, and verify results.

## Step 0: Read the Optimization Journal

Read `.claude/commands/optimize-journal.md` if it exists.

- **Proven Patterns**: Prioritize checking for these known issues. If you find an instance, the fix is already documented.
- **Failed Attempts**: Do NOT repeat these. If the same situation arises, skip it or propose a different approach.

## Step 1: Load Mandatory Skills

Read ALL of these skill files IMMEDIATELY before doing any analysis:

1. `.claude/skills/r3f-performance/SKILL.md` — Optimization checklist, draw call reduction, LOD, profiling
2. `.claude/skills/r3f-fundamentals/SKILL.md` — Canvas config, useFrame, scene hierarchy
3. `.claude/skills/threejs/SKILL.md` — Full Three.js API reference
4. `.claude/skills/react-best-practices/SKILL.md` — 45 Vercel optimization rules (8 priority categories)

## Step 2: Detect Mode

### Argument Parsing
- If `$ARGUMENTS` contains `--no-bench`, skip Step 2.5 and Step 6 bench re-run
- Strip `--no-bench` from arguments before passing to area detection

Parse `$ARGUMENTS` (after stripping `--no-bench`) to determine your mode:

### `/optimize` (no args) — Full Scan
- Analyze the entire `apps/client1/src/components/canvas/` directory
- Apply the full optimization checklist (see Step 3)
- Check all areas: game-loop, objects, terrain, remote-players, particles, post-fx, loading, splats

### `/optimize <area>` — Targeted Analysis
- Focus on the specified area only

| Area | Files to Analyze | Key Checks |
|------|-----------------|------------|
| `terrain` | `TerrainEntity.tsx`, `TreeSystem.tsx`, `GrassSystem.tsx`, `WaterSurface.tsx`, `terrainSplatMaterial.ts` | frustumCulled, material caching, instancing efficiency, LOD |
| `remote-players` | `RemotePlayer.tsx`, `PlayerModel.tsx`, `usePlayerAnimations.ts` | React.memo, distance culling, mixer pause, warmup skip |
| `particles` | `ThreeParticlesEffect.tsx`, `ParticleSystemPool.ts`, `OptimizedParticles.tsx`, `Explosion.tsx` | Object pooling, frustum culling, frame throttling, disposal |
| `post-fx` | `PostFXRenderer.tsx`, `PostFXEffectComposer.tsx`, `effects/` | Lazy loading, uniform updates in useFrame, effect disposal |
| `loading` | `useCharacterPreload.ts`, `webglWarmup.ts`, `loaders.ts` | Phased preloading, warmup render, FBX cache |
| `splats` | `SharedSparkRenderer.tsx`, `SplatObjectRenderer.tsx` | Shared renderer, LOD config, reveal animation cleanup |
| `objects` | `WorldObject.tsx`, `WorldObjects.tsx`, `objectRendering.ts` | Suspense boundaries, geometry creation, despawn animation |
| `game-loop` | `useGameLoop.ts`, `PhysicsSystem.ts`, `GameLoop.tsx` | Priority ordering, redundant reads, interpolation efficiency |

### `/optimize --measure <url>` — Metrics Capture Only
- Run: `npx tsx scripts/perf-measure.ts <url>`
- Present results. No analysis or fixes.

## Step 2.5: Run Performance Bench (default, skip with --no-bench)

Unless `$ARGUMENTS` contains `--no-bench`:

1. Check if Chromium is available:
   ```bash
   npx playwright install --dry-run chromium 2>/dev/null
   ```
   If not installed, warn: "Skipping bench — run `npx playwright install chromium` to enable." and continue to Step 3.

2. Run the bench script:
   ```bash
   npx tsx scripts/perf-bench.ts --save --compare 2>&1
   ```

3. If the script fails (non-zero exit or timeout), warn and continue with static analysis only.

4. If it succeeds, store the results for use in Step 4 (Present Findings) and Step 6 (Verification — re-run bench for before/after delta).

## Step 3: Analysis Workflow

### 3a. Run static checks first
```bash
bash scripts/perf-static-checks.sh
```
This gives you a baseline of known anti-patterns.

### 3b. Spawn codebase-analyzer sub-agents
For each target area, spawn a `codebase-analyzer` agent to investigate:
- Read the target files
- Identify anti-patterns against the loaded skills
- Return findings with file:line references

### 3c. Apply the optimization checklist

**From r3f-performance skill** (in priority order):
- [ ] Draw calls < 100 for complex scenes
- [ ] Instancing for repeated objects (>100 identical meshes)
- [ ] LOD for large/distant objects
- [ ] Geometry merged where possible (static scenes)
- [ ] Textures compressed (KTX2/Basis)
- [ ] DPR capped (max 2, ideally `[1, 1.5]`)
- [ ] Lazy loading for heavy assets
- [ ] Proper disposal on unmount
- [ ] Frustum culling enabled (disable only with comment)
- [ ] Shadows optimized or disabled

**From react-best-practices skill** (by priority):
- CRITICAL: `async-parallel` (Promise.all for independent ops), `bundle-dynamic-imports` (next/dynamic for heavy components)
- HIGH: `server-parallel-fetching`, `server-serialization`
- MEDIUM: `rerender-defer-reads` (store.getState() in useFrame), `rerender-memo` (React.memo), `rerender-derived-state` (primitive selectors)
- LOW: `js-index-maps`, `js-set-map-lookups`, `js-cache-property-access`

**From the Practical 3D Optimization Guide:**

1. **Code Efficiency & Draw Call Management**
   - Eliminate redundant logic in hot paths
   - Share materials and geometries across objects
   - GPU instancing for identical meshes (1 draw call per unique mesh)

2. **Data-Oriented Design**
   - Contiguous memory layouts (typed arrays over scattered objects)
   - Minimize cache misses (avoid random access patterns)
   - Sort data for branch prediction (process similar objects together)

3. **Bandwidth & Asset Quantization**
   - Weld redundant vertices
   - Index reordering for vertex cache
   - Half-float positions where full precision isn't needed
   - Octahedron normal mapping (4 bytes for tangent space)
   - GPU-compressed textures

4. **Culling Strategies**
   - View frustum culling (default on, verify bounding spheres)
   - Spatial partitioning for large worlds
   - Occlusion culling for dense scenes
   - Behind-camera culling (dot product check)
   - Distance-based culling with fade

5. **Visual "Cheating" & LODs**
   - Mesh LOD (swap geometry by distance)
   - Billboard impostors for distant objects
   - Octahedral impostors for high-quality fakes
   - Distance fog to hide pop-in

6. **Stability & Worst-Case Management**
   - Shared budgets for particles/effects
   - Dynamic throttling (prioritize nearby effects)
   - Dynamic resolution scaling

### 3d. Cross-reference with bench results
If bench results are available (from Step 2.5), prioritize findings that correlate with measured bottlenecks (e.g., high draw calls in a specific scene, low FPS in terrain scene).

### 3e. Cross-reference with journal
Check if any findings match proven patterns or failed attempts in the journal.

### 3e. If user provides profiling data
When the user mentions symptoms ("FPS drops to 20", "terrain is laggy", "loading takes 10 seconds") or provides profiling data (FrameProfiler output, Chrome DevTools screenshots), use this to prioritize findings.

## Step 4: Present Findings

```
Performance Analysis: [mode]

Issues Found: N (critical: X, high: X, medium: X, low: X)

Critical:
- [file.tsx:line] — [description] (source: [skill/rule])

High:
- [file.tsx:line] — [description] (source: [skill/rule])

Medium:
- [file.tsx:line] — [description] (source: [skill/rule])

Low:
- [file.tsx:line] — [description] (source: [skill/rule])

Proposed fixes: [N fixable automatically, M require manual review]
Shall I apply the fixes?
```

Wait for user approval before applying fixes.

## Step 5: Apply Fixes

For each approved fix:
1. Read the target file
2. Apply the change using Edit tool
3. Reference the source skill/rule in a code comment ONLY if the fix is non-obvious

## Step 6: Verification

After applying fixes:

```bash
# Static pattern checks
bash scripts/perf-static-checks.sh

# Type checking
pnpm type-check

# Build
pnpm build
```

If bench was run in Step 2.5 (and `--no-bench` was not passed), re-run for before/after comparison:
```bash
npx tsx scripts/perf-bench.ts --compare 2>&1
```

If the dev server is running, optionally capture live world metrics:
```bash
npx tsx scripts/perf-measure.ts http://localhost:5173/world/<worldId>
```

## Step 7: Update the Journal

Append entries to `.claude/commands/optimize-journal.md` for significant findings:

**For successful fixes** — add to "Proven Patterns":
```markdown
### [YYYY-MM-DD] Short description
- Area: <area>
- Fix: <what was changed>
- Evidence: <measurable impact or rule source>
- Rule: <generalized principle for future runs>
```

**For failed attempts** — add to "Failed Attempts":
```markdown
### [YYYY-MM-DD] Short description
- Area: <area>
- Attempted: <what was tried>
- Outcome: <what went wrong>
- Rule: <what to avoid in the future>
```

**Consolidation**: If the journal exceeds 30 entries, consolidate:
- Merge duplicates into generalized rules
- Remove entries superseded by broader rules
- Keep the most impactful entries

## Step 8: Output Summary

```
Optimization Complete

Mode: [full-scan | targeted: <area>]
Files Analyzed: N
Issues Found: N (critical: X, high: X, medium: X, low: X)
Issues Fixed: N

Changes Applied:
- [file.tsx:line] — [description] (source: [skill/rule])
- [file.tsx:line] — [description] (source: [skill/rule])

Verification:
- Static checks: PASS (N/N anti-patterns resolved)
- Type check: PASS
- Build: PASS
- Metrics: [before] → [after] (if available)

Bench Results (if run):
- Before: [scene metrics summary from Step 2.5]
- After: [scene metrics summary from Step 6 re-run]
- Delta: [+/-% per metric, flag regressions >10%]

Journal: Updated with N new entries (total: N/30)

Remaining Issues (not auto-fixable):
- [description] — requires manual review
```

ARGUMENTS: $ARGUMENTS
