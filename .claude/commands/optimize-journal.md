# Optimization Journal

<!--
  Self-improving knowledge base for /optimize.
  Max 30 entries. When exceeded, the agent MUST consolidate:
  merge duplicates into generalized rules, remove low-value entries.

  Each entry: date, area, fix/attempt, outcome, distilled rule (3-5 lines).
-->

## Proven Patterns

### [2026-02-25] DPR cap on main Canvas
- Area: game-loop
- Fix: Added `dpr={[1, 1.5]}` to GameCanvas `<Canvas>` — was unclamped (up to 9x pixels on 4K)
- Evidence: Single highest-impact fix identified in play-mode performance review
- Rule: Always cap DPR on the main Canvas. Default `[1, 1.5]`, mobile `[1, 1]`.

### [2026-03-28] React.memo + deferred children on RemotePlayer
- Area: remote-players
- Fix: Wrapped RemotePlayer in React.memo, deferred heavy children by one frame
- Evidence: PR #407 — reduced mount cost, kept mount frame cheap
- Rule: Components that mount per-player should use React.memo and defer heavy children.

### [2026-03-28] Pause mixer when distance-culled
- Area: remote-players
- Fix: Set `mixer.timeScale = 0` when player is beyond CULL_DISTANCE
- Evidence: PR #407 — saves CPU for off-screen players
- Rule: Animation mixers should pause when their owner is distance-culled.

### [2026-03-28] Parallel DB queries in server onJoin
- Area: server (reference only — /optimize is client-focused)
- Fix: Promise.all() for independent DB queries instead of sequential awaits
- Evidence: PR #407 — reduced total await time
- Rule: Independent async operations should always be parallelized.

### [2026-01-30] WebGL warmup requires real render, not just compile
- Area: loading
- Fix: Warmup render to 1x1 WebGLRenderTarget (not just gl.compile())
- Evidence: 663ms freeze on first weapon equip; gl.compile() doesn't upload textures/buffers
- Rule: gl.compile() is insufficient. Always do a warmup render to a 1x1 RT for PBR materials.

### [2026-03-24] Zustand selectors must be granular in R3F components
- Area: objects
- Fix: Replace broad `entries` Map subscription with primitive boolean selector
- Evidence: DeathOverlayWidget re-rendered on every tick due to Map subscription
- Rule: Never subscribe to Maps/arrays in Zustand from R3F components. Derive a primitive boolean.

### [2026-02-25] frustumCulled={false} on InstancedMesh wastes GPU
- Area: terrain
- Detection: TreeSystem InstancedMeshes all have frustumCulled={false}
- Evidence: GPU runs vertex shaders for ALL instances every frame regardless of visibility
- Rule: InstancedMesh with >100 instances should have frustumCulled={true} with manually set boundingSphere.

## Failed Attempts

(none yet)
