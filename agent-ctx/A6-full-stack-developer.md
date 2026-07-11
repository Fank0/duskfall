# Task A6: Terrain transformation chain (DOS2-inspired)

**Agent**: full-stack-developer
**Date**: 2025-01
**Status**: ✅ Complete

## Overview

Implemented reactive surface-to-surface transformations inspired by Divinity:
Original Sin 2. Surfaces now interact with each other in chain reactions: fire
meets water → steam (vision-blocking fog), poison ignites → 2d6 explosion, ice
adjacent to fire melts to water, lightning striking water → electrified surface
that stuns anyone entering, holy water damages Undead.

## Architecture

The system is built around 3 core functions in `surface-effects.ts`:

1. **`processSurfaceReactions(cells)`** — Pure function. Takes the current
   terrain state, scans for adjacent (or same-cell) conflicting surfaces
   (fire+water, ice+fire, poison+fire, water+electrified), and returns the
   transformed cell set + any damage/stun effects to apply. Runs up to 4
   passes for chain reactions.

2. **`tickSurfaces(cells)`** — Pure function. Called at the start of each
   combat round. Decrements surface durations, applies transformation rules:
   - Fire at duration 0 → Smoke (duration 2)
   - Smoke at duration 0 → dissipated (cell cleared)
   - Steam at duration 0 → dissipated
   - Electrified at duration 0 → reverts to plain water
   - Ice adjacent to Fire → melts to Water (priority pass before duration tick)

3. **`applySurfaceAt(roomId, type, x, y, radius, duration, source)`** — Async
   DB-mutating helper. Upserts the target cells with the new surface type +
   duration, loads the full room terrain, runs `processSurfaceReactions` on
   it, persists the transformed cells back to the DB, and returns the reaction
   effects + chat messages for the caller to apply/log.

## Files modified

| File | Change |
|---|---|
| `prisma/schema.prisma` | Added `duration Int @default(0)` field to TerrainCell model. Ran `bun run db:push`. |
| `src/lib/game/surface-effects.ts` | Full rewrite. Defined `SurfaceEffectType` union (fire/water/ice/poison/acid/web/smoke/steam/electrified/holy_water). Added `SURFACE_PROPS` table with visual+mechanical properties. Added `SURFACE_REACTIONS` rule table (fire+water→steam, ice+fire→water, poison+fire→explosion, etc.). Implemented `processSurfaceReactions`, `tickSurfaces`, `applySurfaceAt`, `persistTerrainCells`, `findReaction`, `isSurfaceType`. Updated `applySurfaceEffects` to actually apply per-turn damage from surfaces. Kept `createSurfaceEffect` as a deprecated wrapper for backward compat. |
| `src/lib/game/terrain.ts` | Expanded `TerrainType` union to include the new surface types. Updated `movementCostOf`, `isDifficultTerrain`, `blocksLineOfSight`, `isDamagingTerrain` to handle them. Added `duration?: number` to `TerrainCellState`. Updated `getTerrainCells` to return `duration`. |
| `src/lib/game/state.ts` | Updated `getSnapshot` to include `duration` in the `terrainCells` mapping. Cast `snap.terrainCells` to `TerrainCellState[]` for `coverAcBonus` call. Imported `TerrainCellState` type. |
| `src/lib/game/types.ts` | Added `duration?: number` to the `terrainCells` field of `GameStateSnapshot`. |
| `src/lib/game/dm-agent.ts` | Added imports from `surface-effects.ts`. Added `elementToSurfaceType()` helper (maps AoE element → surface type). Added `applyLightningStrike()` helper (water → electrified conversion + stun). After AoE spell resolution: applies the surface via `applySurfaceAt`, applies reaction damage to monsters/players in affected cells, logs each Russian reaction message. At round start in `advanceTurn`: calls `tickSurfaces` + `persistTerrainCells` alongside `tickConditions`. At player turn start: calls `applySurfaceEffects` to apply per-turn damage from standing on a hazardous surface. |
| `src/components/dnd/CombatGrid.tsx` | Added visual overlays for all new surface types (fire/ice/poison/acid/web/smoke/steam/electrified/holy_water) with proper colors + emoji icons. Updated the terrain legend to include the new surface types. |
| `src/lib/game/i18n.ts` | Added `terrain.fire`, `terrain.ice`, `terrain.poison`, `terrain.acid`, `terrain.web`, `terrain.smoke`, `terrain.steam`, `terrain.electrified`, `terrain.holy_water` keys in all 6 languages (ru/en/es/de/fr/zh). |

## Reaction rules table

```ts
SURFACE_REACTIONS = [
  { a: "fire",   b: "water",   result: "steam",      duration: 3, effect: { type: "fog",    duration: 3 } },
  { a: "ice",    b: "fire",    result: "water",      duration: 3 },
  { a: "poison", b: "fire",    result: "fire",       duration: 2, effect: { type: "damage", amount: "2d6", damageType: "fire" } },
  { a: "water",  b: "electrified", result: "electrified", duration: 2, effect: { type: "stun", duration: 1 } },
  // (each rule has both directions explicitly)
];
```

Plus tick-time transformations:
- Fire duration 0 → Smoke (duration 2)
- Smoke duration 0 → dissipated
- Steam duration 0 → dissipated
- Electrified duration 0 → water (permanent)
- Ice adjacent to Fire → water (priority pass before tick)

## Element → surface mapping (in DM agent)

| Spell element | Surface applied |
|---|---|
| fire      | fire (3 rounds, then → smoke) |
| cold      | ice (3 rounds, DEX save or prone) |
| acid      | acid (2 rounds, -1 AC) |
| poison    | poison (2 rounds, 1d4/round) |
| radiant   | holy_water (2 rounds, 1d6 radiant to Undead) |
| lightning | special — only creates a surface if it strikes existing water (→ electrified + stun) |
| thunder / force / necrotic / psychic | no surface |

## Verification

- `bun run lint` → 0 errors, 0 warnings ✅
- `bunx tsc --noEmit` → 0 errors in surface-effects.ts, terrain.ts, state.ts, types.ts, CombatGrid.tsx. The remaining dm-agent.ts errors are all PRE-EXISTING (confirmed via `git stash` test — they were at lines 1080/1957/2703/2755/2783/2995 before A6, now shifted by my added lines).
- Dev server returns HTTP 200 on `/api/game/state` ✅
- Prisma client regenerated with `duration?: number` field on `TerrainCellCreateInput` ✅

## Integration notes for future agents

1. **Surface application after AoE**: Anywhere the DM agent resolves an AoE
   spell, it now calls `applySurfaceAt` with the spell's element-mapped surface
   type. The function:
   - Upserts the target cells with the surface type + duration
   - Loads the full room terrain
   - Runs `processSurfaceReactions` on it
   - Persists the transformed cells (delete-all + recreate)
   - Returns the reaction effects (damage/stun) for the caller to apply

2. **Per-turn surface damage**: At the start of each player's turn in
   `advanceTurn`, `applySurfaceEffects(roomId, name, x, y, round)` is called
   to roll and apply damage from standing on a damaging surface (fire 1d6,
   poison 1d4, acid 1d6, holy_water 1d6 radiant). This happens AFTER action
   economy reset but BEFORE the player acts.

3. **Round-start surface ticking**: At the start of each new combat round in
   `advanceTurn`, `tickSurfaces(terrainCells)` is called alongside
   `tickConditions`. The new terrain is persisted via `persistTerrainCells`.

4. **Visual rendering**: The CombatGrid renders each surface type with a
   distinct color + emoji icon. Surface cells render at `z-[6]` so they
   appear above terrain features but below loot/traps/AoE overlays.

5. **Lightning is special**: Lightning damage doesn't leave a surface by
   itself — it only converts existing water surfaces to electrified. This is
   handled by the `applyLightningStrike` helper in dm-agent.ts.

6. **Backward compat**: The legacy `createSurfaceEffect` function is kept as
   a deprecated wrapper around `applySurfaceAt`. Existing callers (if any)
   continue to work but now also trigger chain reactions.
