# TS-FIX — TypeScript Compilation Error Sweep

**Agent**: full-stack-developer
**Task**: Fix ALL (~35) TypeScript compilation errors so `npx tsc --noEmit` returns 0.
**Date**: 2025 session
**Status**: ✅ COMPLETE — 0 errors, lint clean, dev server 200.

## Result Summary

| Check | Before | After |
|---|---|---|
| `npx tsc --noEmit` | 35 errors | **0 errors** ✅ |
| `bun run lint` | (pre-existing clean) | **0 errors** ✅ |
| `curl http://localhost:3000/` | 200 | **200** ✅ |

## Files Modified (10)

### Type-system fixes (`src/lib/game/`)
1. **`scene-image.ts`** — Added `generateImage(prompt, signal?)` export returning `{ ok, imageUrl? }`. This is the room-less counterpart to `generateSceneImage`. The portrait route already calls this signature; we just had to make the export real.
2. **`types.ts`** — Added `actionPoints?: number` / `maxActionPoints?: number` (optional, presentational) on `PlayerState`. Added three new types: `StatusEffectType` (10-key union mirroring `STATUS_EFFECTS`), `StatusEffectState` (mirrors new Prisma model), `LootDropState` (with parsed `items[]`).
3. **`feats.ts`** — Extended the `FeatId` union with the 10 V2-C6 feat IDs that `ADDITIONAL_FEATS` already used but were never declared in the type: `mage_slayer_feat`, `savage_attacker`, `tavern_brawler`, `athlete`, `alert`, `durable`, `magic_initiate`, `ritual_caster`, `weapon_master`, `lightly_armored`.
4. **`dm-agent.ts`** — Five distinct fixes:
   - Line 1183: PlayerState stub missing 8 fields → added `speed: 30, movementUsed: 0, dashActive: false, fightingStyle: "", gwmActive: false, classLevelsJson: "", isCompanion: false, posZ: 0`.
   - Line 2186: Second PlayerState stub (built from `db.player` row) → added the same 8 fields using `(target as any).X ?? default` + `Boolean(...)` casts.
   - Lines 2990 & 3070: `snap0` → `actorSnap` (the snapshot variable actually in scope inside `resolvePlayerMechanics`). This was a real latent runtime bug — would have thrown `ReferenceError` on the Help-action and Throw-potion paths.
   - Line 3042: `addStoryMemory(roomId, content)` (2 args) → `addStoryMemory(roomId, "event", content)` (3 args). The function signature requires a `type` parameter.
   - Line 3282: `actor.selectedTalents || []` (typed `string | never[]`) → `(actor.selectedTalents || "").split(",").map(s => s.trim()).filter(Boolean)` (typed `string[]`). `hasFeat()` expects `string[]`.

### Component fixes (`src/components/dnd/`)
5. **`CombatGrid.tsx`** line 710 — `cn(isAoeTargetCell && setAoeHoverCell({...}))` → `cn(Boolean(isAoeTargetCell && setAoeHoverCell({...})))`. Wraps the `false | void` result in `Boolean()` to satisfy `ClassValue`. Runtime behaviour unchanged (the setState call still fires conditionally, same as before).
6. **`DialoguePanel.tsx`** line 68 — Added `"quest"` to the `onAction` prop's action union. The panel has a "Спросить о задании" button that calls `handleAction("quest")` — without this fix the union was unsound.
7. **`EnemyPanel.tsx`** line 238 — Replaced `<Crown title="Босс" />` with `<span title="Босс" className="shrink-0"><Crown className="h-3 w-3 text-amber-300" /></span>`. Lucide icons reject the `title` prop at the type level; the span preserves the tooltip.

### Page + Prisma
8. **`src/app/page.tsx`** line 871 — Added `"quest"` to `handleDialogueAction`'s action union (function params are contravariant — without this the parent's callback wouldn't be assignable to the (now wider) DialoguePanel prop).
9. **`prisma/schema.prisma`** — Added two new models:
   - `StatusEffect` (id, roomId, targetName, targetType, effect, duration, magnitude, source, createdAt) — matches what `save-load.ts` already writes/reads.
   - `LootDrop` (id, roomId, monsterName, killerName, gold, itemsJson, round, createdAt).
   - Wired `statusEffects StatusEffect[]` and `lootDrops LootDrop[]` onto the `Room` model.
   - Ran `bun run db:push` to sync the SQLite DB and regenerate `@prisma/client`.

## Verification Commands

```bash
cd /home/z/my-project
npx tsc --noEmit              # exit 0, 0 errors ✓
bun run lint                  # exit 0, 0 warnings ✓
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/   # 200 ✓
```

## Notes for Future Agents

- **Prisma models added**: `StatusEffect` and `LootDrop` are now first-class citizens in the schema. If you build features that read/write status effects or loot drops, use `db.statusEffect.*` / `db.lootDrop.*` directly — the client is regenerated and ready.
- **`StatusEffectState` vs `ConditionState`**: Both exist in `types.ts`. `ConditionState` is the older model (used by the `Condition` Prisma table — string `condition` field, no magnitude). `StatusEffectState` is the newer richer model (string `effect` field + `magnitude`). They are NOT interchangeable — check which one your component imports.
- **`actorSnap` is the snapshot var inside `resolvePlayerMechanics`** (not `snap0` or `snap`). The function fetches it once at line 2804 and reuses it. If you add new code that needs the snapshot, use `actorSnap`.
- **`addStoryMemory(roomId, type, content)`** always takes 3 args. Valid `type` values seen in the codebase: `"event"`, `"quest"`, `"npc_met"`, `"choice"`, `"discovery"`, `"combat"`, `"reward"`.
- **Lucide icons don't accept `title`**: Use `<span title="..."><Icon /></span>` for tooltips, or wire up `@/components/ui/tooltip` for styled tooltips.
