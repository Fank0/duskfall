# D3 — Token size variation (Large 2×2 / Huge 3×3 for big monsters)

**Task ID:** D3
**Agent:** full-stack-developer
**Date:** 2025

## Summary

Added D&D 5e creature size categories (tiny / small / medium / large / huge / gargantuan)
to monsters. Large/Huge/Gargantuan monsters now occupy multiple grid cells (2×2 / 3×3 / 4×4),
with body-aware pathfinding, threat zones, opportunity-attack zones, AoE in-area checks,
and on-grid rendering.

## Files Modified

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Added `size String @default("medium")` to `Monster` model |
| `src/lib/game/types.ts` | Added `size?: string` to `MonsterState` |
| `src/lib/game/state.ts` | `toMonster` includes `size`; `moveMonsterTowardNearestPlayer` uses body-aware distance + pathfinding; clamps top-left so body stays on grid |
| `src/lib/game/pathfinding.ts` | Added `MonsterSize` type + `normalizeSize` / `getMonsterDimension` / `getMonsterVisualScale` / `getMonsterCells` / `getMonsterCenter` / `chebyshevDistanceFromBody` / `getMonsterCellKeys` helpers; added optional `bodyDim` param to `findPath` + `reachableCells` with body-aware `isPassableForBody` check |
| `src/lib/game/dm-agent.ts` | AoE in-area filter uses monster body cells (not just top-left); `computePositionalAdvantage` accepts `targetSize` for body-aware adjacency; sneak-attack ally-adjacency uses body distance; fleeing-monster AI uses body distance |
| `src/lib/game/dungeon-biomes.ts` | `BiomeMonster` + `BiomeBoss` interfaces include `size`; `bestiaryToBiomeMonster` propagates size from bestiary; `scaleBiomeMonster` + `scaleBiomeBoss` return size (bosses default to "huge") |
| `src/lib/game/dungeon-populate.ts` | `spawnMonsters` + `spawnBoss` persist `size` to DB; clamp spawn positions so multi-cell bodies fit on grid |
| `src/lib/game/encounters.ts` | `MonsterTemplate` + `EncounterResult.details.monsters` include `size`; MONSTER_POOL entries marked small where appropriate (goblin, kobold, giant rat); `scaleMonster` returns size |
| `src/components/dnd/CombatGrid.tsx` | Token rendering scales wrapper to `dim × dim` cells; tiny/small tokens render at 70% / 85% centered; MonsterToken accepts `dim` and scales fonts/borders; threat-zone + opp-attack-zone extended for multi-cell bodies; `monsterByCell` maps every body cell to the monster; `occupiedForPath` marks all body cells; comparator includes `size` |
| `src/app/api/game/move-token/route.ts` | Opportunity-attack trigger uses `chebyshevDistanceFromBody` (body-aware adjacency) |

## Architecture

### Size categories → grid dimensions

| Size       | Body cells | Visual scale |
|------------|------------|--------------|
| tiny       | 1×1        | 0.7          |
| small      | 1×1        | 0.85         |
| medium     | 1×1        | 1.0          |
| large      | 2×2        | 1.0          |
| huge       | 3×3        | 1.0          |
| gargantuan | 4×4        | 1.0          |

### Multi-cell A* pathfinding

`findPath(start, goal, terrain, occupied, maxMove, bodyDim=1)` checks ALL body cells
at each candidate top-left position before allowing a step. The goal-cell exemption
(target's cell can be "occupied" so the path can reach adjacency) still applies, but
only to the exact goal cell — the body may not fit there. Monster AI stops 1 short
of the goal via `chebyshevDistanceFromBody(size, x, y, px, py) <= 1`.

### Body-aware distance

`chebyshevDistanceFromBody(size, mx, my, px, py)` returns the minimum Chebyshev
distance from ANY body cell to the target. Returns 0 if overlapping, 1 if
edge-adjacent (in melee reach), 2+ otherwise. Used for:
- Monster AI "am I adjacent?" check
- Opportunity-attack triggering (player moves out of body's reach)
- Sneak-attack ally-adjacency check
- Positional advantage (flanking / high-ground) melee classification

### AoE in-area filter

A multi-cell monster is "in area" if ANY of its body cells overlap the AoE cell set.
Previously a 2×2 ogre at (5,5) would be missed by a fireball centered at (6,6) because
its top-left (5,5) wasn't in the cell set — now it's hit.

### Threat zones + opportunity-attack zones

- Threat zone (ranged monsters): every cell within RADIUS of any body cell
- OA zone (melee monsters): 1-cell ring around the entire bounding box (not just top-left)

### Bestiary size verification

Task-required monster sizes already present in `src/lib/game/bestiary.ts`:
- **Large**: ogre, brown-bear, dire-wolf, giant-spider, troll ✓
- **Huge**: adult-black-dragon, balor, the-bone-lord, valthraxis-the-red, malaphax-demon-prince ✓
- **Gargantuan**: ancient-green-dragon, the-forgotten-one ✓
- **Tiny**: imp, quasit, owl ✓
- **Small**: goblin, goblin-warrior, goblin-shaman, kobold, giant-rat, ice-mephit, lightning-mephit ✓

(Winter Wolf, Pixie, Sprite, Familiar, Gnome, Halfling, Fire/Frost/Storm Giants are
not in the bestiary — out of scope.)

## Backward Compatibility

- All existing 1×1 token behavior preserved (size defaults to "medium").
- Existing `findPath` / `reachableCells` calls without `bodyDim` default to 1 (current behavior).
- Prisma default `size = "medium"` for legacy Monster rows created before this change.
- `computePositionalAdvantage` accepts optional `targetSize` (defaults to "medium").

## Verification

- `bun run lint` → 0 errors, 0 warnings ✓
- `bunx tsc --noEmit` → 30 errors (down from 45 before changes); all remaining errors
  are PRE-EXISTING (verified via `git stash` + re-check). The 15-error reduction is a
  side-effect of code shifts; no new errors were introduced in modified files.
- `bun run db:push` → Prisma client regenerated with `size: string` on Monster ✓
- Dev server log shows normal Prisma queries (including `size` column on Monster) + HTTP 200 responses ✓

## Integration Guide for Future Agents

- To spawn a monster with a specific size, include `size: "large"` (or `small`/`huge`/etc.) in `db.monster.create` / `createMany` data. The DB column has a default of "medium" so omitting it is safe.
- To check if a player is adjacent to a (possibly multi-cell) monster, use `chebyshevDistanceFromBody(monster.size, monster.posX, monster.posY, player.posX, player.posY) <= 1`.
- To find all cells a monster occupies, use `getMonsterCells(monster.size, monster.posX, monster.posY)`.
- To get a monster's center (for AoE origin / attack range), use `getMonsterCenter(monster.size, monster.posX, monster.posY)`.
- For A* pathfinding of a multi-cell creature, pass `bodyDim = getMonsterDimension(monster.size)` as the last argument to `findPath` / `reachableCells`.
