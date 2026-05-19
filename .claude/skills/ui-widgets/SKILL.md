---
name: ui-widgets
description: >
  HUD and UI widget configuration for manifest.json ui.widgets array. 15 container
  types: specialized (team-scoreboard, stats-bar, ammo-counter, crosshair,
  win-modal, death-overlay, minimap, kill-feed), generic (modal, panel-left,
  panel-right, corner, bar-top, bar-bottom), world-space (3d-object). Cyberpunk
  minimalist design system with Kode Mono font, no widget backgrounds, corner
  radial gradients, GPU post-processing for modals.
---

# UI Widgets — Cyberpunk Minimalist HUD System

================================================================================

## 1. DESIGN PRINCIPLES

================================================================================

### Visual Philosophy

- **No widget backgrounds** — text floats over the game, backed only by corner radial gradients
- **Single font**: Kode Mono (weight 400-700) for all HUD text
- **One shared corner gradient** per active corner (radial gradient, ~32% opacity, ~250px radius)
- **Post-processing for modals** — death and victory use GPU post-effects (vignette + desaturation + tint), not CSS overlays
- **Smooth transitions** — CSS transitions for all state changes
- **Minimal chrome** — no borders, no frames, no rounded rects on HUD elements
- **Text-shadow for readability** — `text-shadow: 0 1px 3px rgba(0,0,0,0.8)` on floating text

### Color System

| Purpose         | Color                                  | Notes                           |
| --------------- | -------------------------------------- | ------------------------------- |
| Primary text    | `#ffffff` / `rgba(255,255,255,0.9)`    | All HUD labels and values       |
| Secondary text  | `rgba(255,255,255,0.5)`                | Compass directions, subtle info |
| Health normal   | `rgba(160,168,180,0.74)`               | Default stat bar fill           |
| Health danger   | Interpolates toward red                | Linear interpolation 30%→0%     |
| Health critical | `rgba(255,51,51,1.0)`                  | At 0% HP, pulse below 15%       |
| Kill feed text  | `#ff6b6b` (killer), `#69b7ff` (victim) | Text-shadow for readability     |
| Corner gradient | `rgba(0,0,0,0.32)` → `transparent`     | Radial, emanates from corner    |
| Death glow      | `rgba(255,0,0,0.8/0.5/0.3)`            | Triple-layer text-shadow        |
| Victory glow    | Warm golden tint via post-effect       | GPU vignette + desaturation     |

### HP Color Transition

Two layers work together:

1. **Color interpolation** (30%→0%): Bar fill color smoothly transitions from normal gray to red
2. **Pulse animation** (<15%): CSS pulse keyframe activates at critical threshold

### Typography Rules

- Font: `font-kode-mono` (Tailwind class) everywhere
- Stat labels/values: `text-[11px]` to `text-[13px]`
- Kill feed entries: `text-[11px]`
- Death title: `text-5xl font-bold uppercase`
- Timer/scoreboard: `text-sm` to `text-base`
- Always `uppercase` for labels (HEALTH, AMMO, ELIMINATED)
- Letter-spacing: default (Kode Mono has built-in tracking)

================================================================================

## 2. WIDGET SYSTEM ARCHITECTURE

================================================================================

### Pipeline Overview

```
GameDefinition.ui.widgets[]
  → WidgetRenderer (routes by containerType)
    → Corner-eligible? → Group by corner position → CornerContainer
      → Radial gradient backdrop + stacked WidgetItems
    → Non-corner specialized? → Direct render (crosshair, win-modal, death-overlay, team-scoreboard)
    → Generic? → GenericWidget with content layout
    → World-space? → WorldSpaceWidget (3D attached)
```

### Container Type Classification

**Corner-eligible** (grouped into CornerContainer with shared gradient):

- `corner` — Generic corner widget
- `stats-bar` — HP/stat bars (default: bottom-right)
- `ammo-counter` — Ammo segments (default: bottom-right)
- `minimap` — Canvas 2D minimap (default: bottom-left)
- `kill-feed` — Elimination feed (default: top-right)
- `zone-info` — Zone stage/alive/lobby HUD (default: top-left)

**Non-corner specialized** (rendered directly, not in corners):

- `crosshair` — Aim reticle (always center screen)
- `win-modal` — Victory screen (full-screen, triggers post-effect)
- `team-scoreboard` — Team scores + timer (top-center)
- `death-overlay` — Death/elimination screen (full-screen, triggers post-effect)

**Generic** (wrap custom content layouts):

- `modal` — Full-screen modal overlay
- `panel-left` / `panel-right` — Side panels
- `bar-top` / `bar-bottom` — Horizontal bars at screen edges

**World-space**:

- `3d-object` — Attached to a world object in 3D space

### Corner Grouping System

The `CORNER_TYPES` set in WidgetRenderer determines which containerTypes are corner-eligible. Corner widgets are grouped by their `cornerPosition` (from `container.cornerPosition` or `DEFAULT_CORNER_POSITIONS[containerType]`). Each corner gets ONE shared `CornerContainer` with a radial gradient backdrop. Widgets stack vertically within their corner.

### Default Corner Positions

| containerType  | Default Corner                          |
| -------------- | --------------------------------------- |
| `stats-bar`    | `bottom-right`                          |
| `ammo-counter` | `bottom-right`                          |
| `minimap`      | `bottom-left`                           |
| `kill-feed`    | `top-right`                             |
| `zone-info`    | `top-left`                              |
| `corner`       | Must specify `container.cornerPosition` |

### Data Source Resolution

Data sources bind module state to widget props:

```json
{
  "id": "stats",
  "moduleId": "Vitals/CharacterStats@1",
  "path": "$.players[$self].stats"
}
```

- `moduleId`: Full canonical module ID (e.g., `Vitals/CharacterStats@1`)
- `path`: JSONPath into the module's synced state
- `$self`: Replaced with the local player's ID at runtime
- `divideBy`: Divide numeric values (e.g., `1000` to convert ms→s)
- `precision`: Round to N decimal places

### Conditional Visibility (showWhen)

```json
"showWhen": { "sourceId": "eliminationActive", "equals": true }
```

Operators:

- `equals`: Exact match (strict equality)
- `notEquals`: Not equal
- `exists`: Value is not null/undefined
- `truthy`: Value is truthy (not null, undefined, 0, false, "")

================================================================================

## 3. ALL 15 CONTAINER TYPES — COMPLETE REFERENCE

================================================================================

### 1. `stats-bar` — Health/Stat Bars

Corner-eligible. Default position: `bottom-right`.

```json
{
  "id": "player-stats",
  "containerType": "stats-bar",
  "specializedConfig": {
    "showValues": true,
    "showPercentage": false,
    "animationSpeed": "normal"
  },
  "dataSources": [
    { "id": "stats", "moduleId": "Vitals/CharacterStats@1", "path": "$.players[$self].stats" }
  ],
  "visibility": { "showInPlayMode": true, "showInEditMode": false }
}
```

**specializedConfig fields:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `showValues` | boolean | `true` | Show numeric current/max values |
| `showPercentage` | boolean | `false` | Show percentage instead of values |
| `animationSpeed` | `"instant"` \| `"fast"` \| `"normal"` \| `"slow"` | `"normal"` | Fill bar transition speed |

**Behavior:**

- Renders one bar per stat (health, mana, stamina, etc.)
- Health bar color interpolates gray→red as HP drops below 30%
- Pulse animation activates below 15% HP
- No background — text-shadow provides readability

### 2. `ammo-counter` — Ammo Segments

Corner-eligible. Default position: `bottom-right`.

```json
{
  "id": "ammo-display",
  "containerType": "ammo-counter",
  "specializedConfig": {
    "showValues": true
  },
  "dataSources": [
    { "id": "stats", "moduleId": "Vitals/CharacterStats@1", "path": "$.players[$self].stats" }
  ],
  "visibility": { "showInPlayMode": true, "showInEditMode": false }
}
```

**IMPORTANT:** When `Equipment/Weapons@1` module is present, you MUST include an ammo-counter widget AND ensure `Vitals/CharacterStats@1` has an `ammo` stat.

### 3. `crosshair` — Aim Reticle

Not corner-eligible. Always centered on screen.

```json
{
  "id": "aim-crosshair",
  "containerType": "crosshair",
  "specializedConfig": {
    "crosshairStyle": "cross",
    "crosshairSize": "medium",
    "crosshairColor": "rgba(255,255,255,0.9)",
    "opacity": 0.9,
    "thickness": 2,
    "gap": 4
  },
  "dataSources": [],
  "visibility": { "showInPlayMode": true, "showInEditMode": false }
}
```

**specializedConfig fields:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `crosshairStyle` | `"cross"` \| `"dot"` \| `"circle"` \| `"square"` \| `"diamond"` | `"cross"` | Shape |
| `crosshairSize` | `"small"` \| `"medium"` \| `"large"` | `"medium"` | Overall size |
| `crosshairColor` | string (CSS color) | `"rgba(255,255,255,0.9)"` | Color |
| `opacity` | number (0-1) | `0.9` | Overall opacity |
| `thickness` | number (px) | `2` | Line/border thickness |
| `gap` | number (px) | `4` | Gap from center |

**REQUIRED** when `Equipment/Weapons@1` uses rifle or spellcast weapon types.

### 4. `team-scoreboard` — Team Scores + Timer

Not corner-eligible. Renders at top-center of screen.

```json
{
  "id": "team-scoreboard",
  "containerType": "team-scoreboard",
  "specializedConfig": {
    "theme": "esports",
    "showTimer": true,
    "showScores": true
  },
  "dataSources": [
    { "id": "teams", "moduleId": "Social/TeamState@1", "path": "$.teams" },
    {
      "id": "timeRemaining",
      "moduleId": "Objectives/ScoreTracker@1",
      "path": "$.formattedTimeRemaining"
    },
    { "id": "scoreTeams", "moduleId": "Objectives/ScoreTracker@1", "path": "$.teams" }
  ],
  "visibility": { "showInPlayMode": true, "showInEditMode": false }
}
```

**REQUIRED** for team-based games.

**Competitive/TDM timer invariant:** `Objectives/ScoreTracker@1.config.maxDurationMs`
must be a positive duration (600000 is the default 10-minute match), this widget
must set `showTimer: true`, and the `timeRemaining` dataSource must bind to
`Objectives/ScoreTracker@1.$.formattedTimeRemaining`. Without `maxDurationMs`,
ScoreTracker does not populate formatted timer state and the HUD has no time limit.

**Literal id rule:** `TeamUIWidget` looks up data sources by exact id. Use
`id: "teams"` for `Social/TeamState@1.$.teams`, `id: "timeRemaining"` for formatted
timer text, and `id: "scoreTeams"` for `Objectives/ScoreTracker@1.$.teams`.
`id: "scores"` and `path: "$.scores"` are ignored because ScoreTracker snapshots do
not expose `scores`.

### 5. `win-modal` — Victory Screen

Not corner-eligible. Full-screen overlay. Triggers GPU post-processing effect (warm golden vignette + desaturation).

**For team games (ScoreTracker):**

```json
{
  "id": "victory-modal",
  "containerType": "win-modal",
  "specializedConfig": {
    "theme": "esports",
    "showFinalScore": true,
    "showRestartButton": true
  },
  "dataSources": [
    { "id": "result", "moduleId": "Objectives/ScoreTracker@1", "path": "$.result" },
    { "id": "teams", "moduleId": "Social/TeamState@1", "path": "$.teams" },
    { "id": "scoreTeams", "moduleId": "Objectives/ScoreTracker@1", "path": "$.teams" }
  ],
  "visibility": { "showInPlayMode": true, "showInEditMode": false }
}
```

**For elimination/BR games:**

```json
{
  "id": "victory-modal",
  "containerType": "win-modal",
  "specializedConfig": { "theme": "esports", "showFinalScore": false, "showRestartButton": false },
  "dataSources": [
    { "id": "result", "moduleId": "Gameplay/Elimination@1", "path": "$.winnerDeclared" },
    { "id": "winner", "moduleId": "Gameplay/Elimination@1", "path": "$.winnerId" }
  ],
  "visibility": { "showInPlayMode": true, "showInEditMode": false }
}
```

**NOTE:** BR uses `showRestartButton: false` because match auto-resets via `round.reset`.
Data sources come from `Gameplay/Elimination@1` (NOT `Objectives/ScoreTracker@1`).

**ScoreTracker win-modal rule:** For ScoreTracker games, bind `result` to
`Objectives/ScoreTracker@1.$.result` and bind final scores with `scoreTeams` to
`$.teams`. Do not use `$.scores`.

### 6. `death-overlay` — Death/Elimination Screen

Not corner-eligible. Full-screen overlay. Triggers GPU post-processing effect (red vignette + desaturation).

```json
{
  "id": "death-screen",
  "containerType": "death-overlay",
  "visibility": { "showInPlayMode": true, "showInEditMode": false }
}
```

**No dataSources needed.** The DeathOverlayWidget internally reads from:

- `Progression/StateChannel@1` → `$.players[$self].status.isDead`
- `Progression/StateChannel@1` → `$.players[$self].status.respawnAt`
- `Gameplay/Elimination@1` → `$.players[$self].placement` (for BR placement display)

**Behavior:**

- Shows "ELIMINATED" with placement number only for Battle Royale / standalone elimination when placement is enabled
- Shows "YOU DIED" with respawn countdown in non-BR mode
- Activates GPU post-effect (vignette + desaturation + red tint)
- Post-effect clears when player respawns or enters spectator mode

**DuelQueue / TDM copy rule:** placement copy (`You placed #...`) is Battle
Royale-only. For duel queues and ordinary respawn combat, explicitly disable it:

```json
{
  "id": "widget-death-overlay",
  "containerType": "death-overlay",
  "specializedConfig": { "showPlacement": false },
  "visibility": { "showInPlayMode": true, "showInEditMode": false }
}
```

**IMPORTANT:** Do NOT use the old `eliminated-screen` corner widget pattern. Use `death-overlay` instead — it handles everything internally with proper post-processing.

### 7. `minimap` — Canvas 2D Minimap

Corner-eligible. Default position: `bottom-left`.

```json
{
  "id": "minimap",
  "containerType": "minimap",
  "dataSources": [
    { "id": "zone", "moduleId": "Gameplay/DynamicZone@1", "path": "$.zones.safe-zone" }
  ],
  "specializedConfig": {
    "mapSize": 180,
    "mapWorldRadius": 110,
    "playerDotColor": "#00ff88",
    "enemyDotColor": "#ffffff",
    "zoneBorderColor": "#ffffff",
    "nextZoneBorderColor": "#ff6600",
    "showCompass": false,
    "showEnemies": false,
    "playerCentered": true,
    "showTerrain": true,
    "terrainColorLow": "#2d5a1e",
    "terrainColorHigh": "#8fbc5a"
  },
  "visibility": { "showInPlayMode": true, "showInEditMode": false }
}
```

**specializedConfig fields:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `mapSize` | number (px) | `180` | Minimap diameter (50-400) |
| `mapWorldRadius` | number | `250` | World radius shown on map |
| `playerDotColor` | string (hex) | `"#00ff00"` | Local player chevron color |
| `enemyDotColor` | string (hex) | `"#ffffff"` | Remote player dot color |
| `zoneBorderColor` | string (hex) | `"#ffffff"` | Current safe zone border |
| `nextZoneBorderColor` | string (hex) | `"#ff6600"` | Next zone border (dashed) |
| `showCompass` | boolean | `false` | Show N/S/E/W labels |
| `showEnemies` | boolean | `true` | Show remote player dots |
| `playerCentered` | boolean | `false` | Center map on local player |
| `showTerrain` | boolean | `false` | Render terrain heightmap |
| `terrainColorLow` | string (hex) | `"#2d5a1e"` | Low-elevation color |
| `terrainColorHigh` | string (hex) | `"#8fbc5a"` | High-elevation color |

**CRITICAL mapWorldRadius sizing:** Set `mapWorldRadius` to `terrainSize * 0.55` (terrain half-size + 10% padding). Example: terrain size 200 → `mapWorldRadius: 110`.

**NOTE:** The `path` in dataSources for zone MUST point to a specific zone by ID matching the zone `id` in the DynamicZone module config (e.g., `$.zones.safe-zone`).

### 8. `kill-feed` — Elimination Feed

Corner-eligible. Default position: `top-right`.

```json
{
  "id": "kill-feed",
  "containerType": "kill-feed",
  "specializedConfig": {
    "maxEntries": 5,
    "entryDurationMs": 4000
  },
  "dataSources": [],
  "visibility": { "showInPlayMode": true, "showInEditMode": false }
}
```

**specializedConfig fields:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `maxEntries` | number | `5` | Max visible entries |
| `entryDurationMs` | number | `4000` | How long each entry stays visible |

**No dataSources needed.** The KillFeedWidget internally subscribes to elimination events from the Colyseus room state.

### 9. `zone-info` — Zone Stage / Alive Count / Lobby HUD

Corner-eligible. Default position: `top-left`.

```json
{
  "id": "zone-info",
  "containerType": "zone-info",
  "dataSources": [],
  "specializedConfig": {
    "position": "top-left"
  },
  "visibility": { "showInPlayMode": true, "showInEditMode": false }
}
```

**No dataSources needed.** The ZoneInfoWidget internally reads from:

- `Gameplay/DynamicZone@1` → zone stage number, status (holding/transitioning)
- `Progression/Rounds@1` → lobby waiting, connected player count, min players, lobby countdown
- `Gameplay/Elimination@1` → alive count

**Behavior:**

- Shows `◎ Zone N` with shrinking indicator when zone is active
- Shows `● N alive` with pulse animation when count decreases
- Shows "Waiting for players" with player dots (filled/hollow) during lobby
- Shows 3-2-1 countdown with increasing font size, then "GO!" flash
- Returns null when no module state is available (e.g., in edit mode)

**IMPORTANT:** Do NOT use separate `corner` widgets for zone-stage, zone-timer, alive-count, lobby-waiting, and lobby-countdown. Use a single `zone-info` widget — it handles ALL of these internally with proper animations, phase flash effects, and player dot indicators. The old multi-widget corner pattern is deprecated.

### 10. `corner` — Generic Corner Widget

Corner-eligible. Must specify `container.cornerPosition`.

```json
{
  "id": "alive-count",
  "containerType": "corner",
  "container": { "cornerPosition": "top-right" },
  "dataSources": [
    { "id": "aliveCount", "moduleId": "Gameplay/Elimination@1", "path": "$.aliveCount" },
    { "id": "eliminationActive", "moduleId": "Gameplay/Elimination@1", "path": "$.active" }
  ],
  "content": {
    "structure": [
      {
        "id": "count-text",
        "type": "text",
        "dataBinding": "aliveCount",
        "format": "{value} players alive"
      }
    ],
    "styles": { "container": "text-white text-sm font-medium px-3 py-1.5" }
  },
  "visibility": { "showInPlayMode": true, "showInEditMode": false },
  "showWhen": { "sourceId": "eliminationActive", "equals": true }
}
```

### 10-11. `bar-top` / `bar-bottom` — Horizontal Bars

```json
{
  "id": "timer-bar",
  "containerType": "bar-top",
  "dataSources": [
    {
      "id": "timeRemaining",
      "moduleId": "Objectives/ScoreTracker@1",
      "path": "$.formattedTimeRemaining"
    }
  ],
  "content": {
    "structure": [{ "id": "timer", "type": "text", "dataBinding": "time", "format": "{value}" }],
    "styles": { "container": "text-white text-sm text-center py-2" }
  },
  "visibility": { "showInPlayMode": true, "showInEditMode": false }
}
```

### 12-13. `panel-left` / `panel-right` — Side Panels

```json
{
  "id": "inventory",
  "containerType": "panel-right",
  "dataSources": [],
  "content": {
    "structure": [{ "id": "title", "type": "text", "format": "Inventory" }],
    "styles": { "container": "text-white p-4" }
  },
  "visibility": { "showInPlayMode": true, "showInEditMode": false }
}
```

### 14. `modal` — Generic Full-Screen Modal

```json
{
  "id": "pause-menu",
  "containerType": "modal",
  "dataSources": [],
  "content": {
    "structure": [{ "id": "title", "type": "text", "format": "PAUSED" }],
    "styles": { "container": "text-white text-2xl text-center" }
  },
  "visibility": { "showInPlayMode": true, "showInEditMode": false }
}
```

### 15. `3d-object` — World-Space Widget

```json
{
  "id": "interaction-prompt",
  "containerType": "3d-object",
  "container": {
    "targetObjectId": "chest-1",
    "position": "above",
    "proximityConfig": { "enabled": true, "maxDistance": 5, "playerOnly": true }
  },
  "interaction": {
    "actionKey": "E",
    "actionText": "Open",
    "bindingId": "interact"
  },
  "dataSources": [],
  "visibility": { "showInPlayMode": true, "showInEditMode": true }
}
```

`position`: `"above"` | `"front"` | `"custom"` (use `offset` for custom positioning)

================================================================================

## 4. BATTLE ROYALE WIDGET RECIPES

================================================================================

### Complete BR Widget Set

A typical battle royale game needs these widgets:

```json
"widgets": [
  // Bottom-right: HP + Ammo
  {
    "id": "player-stats",
    "containerType": "stats-bar",
    "specializedConfig": { "showValues": true, "animationSpeed": "normal" },
    "dataSources": [{ "id": "stats", "moduleId": "Vitals/CharacterStats@1", "path": "$.players[$self].stats" }],
    "visibility": { "showInPlayMode": true, "showInEditMode": false }
  },
  {
    "id": "ammo-display",
    "containerType": "ammo-counter",
    "specializedConfig": { "showValues": true },
    "dataSources": [{ "id": "stats", "moduleId": "Vitals/CharacterStats@1", "path": "$.players[$self].stats" }],
    "visibility": { "showInPlayMode": true, "showInEditMode": false }
  },

  // Center: Crosshair
  {
    "id": "aim-crosshair",
    "containerType": "crosshair",
    "specializedConfig": { "crosshairStyle": "cross", "crosshairSize": "medium", "crosshairColor": "rgba(255,255,255,0.9)", "opacity": 0.9, "thickness": 2, "gap": 4 },
    "dataSources": [],
    "visibility": { "showInPlayMode": true, "showInEditMode": false }
  },

  // Top-left: Zone info (handles zone stage, alive count, lobby waiting, countdown — all in one)
  {
    "id": "zone-info",
    "containerType": "zone-info",
    "dataSources": [],
    "specializedConfig": { "position": "top-left" },
    "visibility": { "showInPlayMode": true, "showInEditMode": false }
  },

  // Top-right: Kill feed
  {
    "id": "kill-feed",
    "containerType": "kill-feed",
    "specializedConfig": { "maxEntries": 5, "entryDurationMs": 4000 },
    "dataSources": [],
    "visibility": { "showInPlayMode": true, "showInEditMode": false }
  },

  // Bottom-left: Minimap
  {
    "id": "minimap",
    "containerType": "minimap",
    "dataSources": [{ "id": "zone", "moduleId": "Gameplay/DynamicZone@1", "path": "$.zones.safe-zone" }],
    "specializedConfig": {
      "mapSize": 180, "mapWorldRadius": 110,
      "playerDotColor": "#00ff88", "zoneBorderColor": "#ffffff", "nextZoneBorderColor": "#ff6600",
      "showCompass": false, "showEnemies": false, "playerCentered": true,
      "showTerrain": true, "terrainColorLow": "#2d5a1e", "terrainColorHigh": "#8fbc5a"
    },
    "visibility": { "showInPlayMode": true, "showInEditMode": false }
  },

  // Full-screen overlays
  {
    "id": "death-screen",
    "containerType": "death-overlay",
    "visibility": { "showInPlayMode": true, "showInEditMode": false }
  },
  {
    "id": "victory-modal",
    "containerType": "win-modal",
    "specializedConfig": { "theme": "esports", "showFinalScore": false, "showRestartButton": false },
    "dataSources": [
      { "id": "result", "moduleId": "Gameplay/Elimination@1", "path": "$.winnerDeclared" },
      { "id": "winner", "moduleId": "Gameplay/Elimination@1", "path": "$.winnerId" }
    ],
    "visibility": { "showInPlayMode": true, "showInEditMode": false }
  }
]
```

### BR Corner Layout

| Corner         | Widgets                 | Notes                                                                       |
| -------------- | ----------------------- | --------------------------------------------------------------------------- |
| `top-left`     | zone-info               | Single specialized widget handles zone stage, alive count, lobby, countdown |
| `top-right`    | kill-feed               | Elimination feed                                                            |
| `bottom-left`  | minimap                 | Solo                                                                        |
| `bottom-right` | stats-bar, ammo-counter | Stack vertically                                                            |

================================================================================

## 5. DATA SOURCES REFERENCE

================================================================================

### Common Module Paths

| Module                       | Common Paths                                                                                                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Vitals/CharacterStats@1`    | `$.players[$self].stats` (all stats), `$.players[$self].stats.ammo` (single stat)                                                                                             |
| `Progression/StateChannel@1` | `$.players[$self].status.isDead`, `$.players[$self].status.respawnAt`, `$.players[$self].status.eliminationPlacement`                                                         |
| `Objectives/ScoreTracker@1`  | `$.result`, `$.teams`, `$.formattedTimeRemaining`                                                                                                                             |
| `Social/TeamState@1`         | `$.teams`                                                                                                                                                                     |
| `Gameplay/Elimination@1`     | `$.aliveCount`, `$.active`, `$.winnerDeclared`, `$.winnerId`, `$.players[$self].placement`                                                                                    |
| `Gameplay/DynamicZone@1`     | `$.zones.<zoneId>` (full zone object), `$.zones.<zoneId>.stageNumber`, `$.zones.<zoneId>.status`, `$.zones.<zoneId>.phaseTimeRemainingMs`, `$.zones.<zoneId>.damagePerSecond` |
| `Progression/Rounds@1`       | `$.lobbyWaiting`, `$.connectedPlayerCount`, `$.minPlayers`, `$.lobbyCountdownSec`, `$.formattedTimeRemaining`                                                                 |

### `$self` Substitution

`$self` in JSONPath is replaced with the local player's session ID at runtime. Use it whenever accessing per-player data (stats, status, placement).

### Numeric Formatting

- `"divideBy": 1000` — Divides the raw value (useful for ms→s conversion)
- `"precision": 0` — Rounds to integer
- `"precision": 1` — One decimal place

================================================================================

## 6. showWhen CONDITIONAL VISIBILITY

================================================================================

### Operators

| Operator    | Example                                             | Behavior                    |
| ----------- | --------------------------------------------------- | --------------------------- |
| `equals`    | `{ "sourceId": "active", "equals": true }`          | Strict equality check       |
| `notEquals` | `{ "sourceId": "status", "notEquals": "inactive" }` | Not equal                   |
| `exists`    | `{ "sourceId": "data", "exists": true }`            | Value is not null/undefined |
| `truthy`    | `{ "sourceId": "countdown", "truthy": true }`       | Value is truthy             |

### Common Patterns

```json
// Show only during active match
"showWhen": { "sourceId": "eliminationActive", "equals": true }

// Show only when dead
"showWhen": { "sourceId": "isDead", "equals": true }

// Show during lobby (waiting for players)
"showWhen": { "sourceId": "lobbyWaiting", "equals": true }

// Show lobby countdown (only when countdown is active)
"showWhen": { "sourceId": "lobbyCountdownSec", "truthy": true }

// Show zone info (hide when zone is inactive)
"showWhen": { "sourceId": "status", "notEquals": "inactive" }
```

### CRITICAL: `truthy` vs `equals: false` for lobby-countdown

Use `{ "sourceId": "lobbyCountdownSec", "truthy": true }`.
Do NOT use `{ "sourceId": "lobbyWaiting", "equals": false }` — that stays true after the round starts because `lobbyWaiting` becomes `false` (not `null`), causing the countdown to remain visible over zone info. `lobbyCountdownSec` is `null` when not in lobby countdown, so `truthy` correctly hides the widget.

================================================================================

## 7. POST-PROCESSING MODAL EFFECTS

================================================================================

### How It Works

`death-overlay` and `win-modal` trigger GPU post-processing effects via `useModalOverlayStore`:

```
Widget component mounts/becomes visible
  → calls useModalOverlayStore.getState().setActiveOverlay('death' | 'victory')
  → PostFXEffectComposer reads store, injects ModalOverlayEffect
  → GLSL shader applies vignette + desaturation + color tint
  → Widget unmounts → setActiveOverlay(null) → effect removed
```

### Effect Presets

| Overlay   | Vignette      | Desaturation | Tint                       |
| --------- | ------------- | ------------ | -------------------------- |
| `death`   | Strong (0.85) | High (0.7)   | Red (1.0, 0.2, 0.2)        |
| `victory` | Medium (0.6)  | Medium (0.5) | Warm gold (1.0, 0.85, 0.6) |

**Manifests don't configure post-effects.** The widget components handle the store calls internally. Just use the correct `containerType` and the post-effect activates automatically.

================================================================================

## 8. GENERIC WIDGET CONTENT SYSTEM

================================================================================

Generic containers (`corner`, `bar-top`, `bar-bottom`, `panel-left`, `panel-right`, `modal`) use a `content` object to define their layout:

```json
"content": {
  "structure": [
    { "id": "label", "type": "text", "format": "Score:" },
    { "id": "value", "type": "text", "dataBinding": "score", "format": "{value}" }
  ],
  "styles": {
    "container": "text-white text-sm flex gap-2 items-center px-3 py-1.5"
  }
}
```

### ContentElement Types

- `text` — Text element with optional `dataBinding` and `format`
- `list` — List of items
- `div` / `span` — Container elements

### Data Binding

- `dataBinding`: References a `dataSources[].id` to get the value
- `format`: Template string where `{value}` is replaced with the bound data

### Styles

- `styles.container`: Tailwind classes for the wrapper element
- `styles.elementClassMap`: Per-element-id class overrides

================================================================================

## 9. ANTI-PATTERNS

================================================================================

1. **Don't use `bg-*` backgrounds on widgets** — The corner gradient system handles readability. Adding backgrounds creates visual clutter.

2. **Don't use fonts other than Kode Mono** — Use `font-kode-mono` class. No Inter, no system fonts on HUD elements.

3. **Don't set `fixed` positioning on specialized widgets** — The corner grouping system handles all positioning. Specialized widgets should not set their own `position: fixed`.

4. **Don't duplicate death displays** — Use `death-overlay` containerType, not a `corner` widget with isDead data binding. The old `eliminated-screen` corner widget pattern is deprecated.

5. **Don't use `Vitals/CharacterStats@1` for isDead/respawnAt** — Death/respawn state lives in `Progression/StateChannel@1`. CharacterStats only has stat values (health, mana, ammo).

6. **Don't use `equals: false` for nullable values** — Use `truthy` instead. `equals: false` matches the literal boolean `false`, not `null`/`undefined`.

7. **Don't use `stageIndex` for display** — Use `stageNumber` (1-indexed). `stageIndex` is 0-indexed and confusing to players.

8. **Don't use separate `corner` widgets for zone/lobby/alive data** — Use a single `zone-info` containerType widget instead. It handles zone stage, alive count, lobby waiting (with player dots), and 3-2-1-GO countdown all in one widget with proper animations. The old pattern of separate `corner` widgets for zone-stage, zone-timer, alive-count, lobby-waiting, and lobby-countdown is deprecated and renders as ugly unstyled text.
