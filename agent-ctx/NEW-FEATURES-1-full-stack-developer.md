# Task ID: NEW-FEATURES-1 — 3 New Gameplay Features

**Agent:** full-stack-developer
**Task:** Add three new gameplay features to enrich the DUSKFALL experience:
1. Floating damage numbers in combat (BG3-style) — already partially existed; now plumbed end-to-end with an explicit `damageType` on the resolved event.
2. Loot drops from defeated monsters — grid-placed 💰 icons auto-picked-up on walk-over.
3. Status effect icons on tokens (BG3-style) — upgraded the existing `ConditionIcons` to 16px + shadcn Tooltip.

## Architecture Overview

### Feature 1 — Floating damage numbers (BG3-style)

**Goal:** when damage is dealt to a monster or player, show a floating damage
number on the combat grid that rises ~40px over 1.2s and fades out, color-coded
by damage type (fire=orange, cold=cyan, lightning=yellow, poison=green,
necrotic=purple, radiant=gold, physical=gray). Crits show larger text + a
golden radial burst + sparkles.

**What already existed:**
- `CombatTextOverlay.tsx` + `makeDamageText()` + `makeHealText()` + `makeMissText()`.
- `page.tsx` already derived `targetName` / `damage` / `isCrit` from the
  resolved event and inferred the damage type from the dice-log label by
  keyword matching (`"огн"` → fire, `"холод"` → cold, etc.).
- The animation already rose upward + faded out at 1.2s; crits already had a
  golden burst + sparkles.

**What was missing:**
- The damage type was inferred on the CLIENT from the dice-log label, which is
  fragile (only works when the label contains the keyword) and duplicates logic
  already in `inferDamageType()` on the server.
- The animation rose ~112px (1.5px × 75 ticks) — way more than the spec's 40px.

**What I changed:**
1. `src/lib/game/types.ts` — added `damageType: string` to `ResolvedEvent`.
2. `src/lib/game/dm-agent.ts`:
   - Added `damageType: string` to the `ResolutionResult` interface.
   - Added a `let lastDamageType = ""` accumulator in `resolvePlayerAction`.
   - Set it at every damage-dealing site:
     - AoE block: `lastDamageType = element` (fire/cold/lightning/etc.).
     - Single-target monster damage: `lastDamageType = damageType ?? "physical"`
       (from `inferDamageType(branch.monsterDamage.notation, actor)`).
     - Player backlash damage: `lastDamageType = "physical"` (fallback).
   - Added `damageType: lastDamageType` to the `resolvePlayerAction` return.
   - Added `damageType: res.damageType` to the `resolvePlayerMechanics` return.
   - Added `damageType: ""` to all 14 early-return `MechanicsResult` stubs
     (dash / disengage / dodge / rest / craft / move / etc.) so TypeScript is
     happy with the new required field.
3. `src/app/page.tsx`:
   - `setLastAnimEvent({...})` now forwards `damageType: (ev as any).damageType`.
   - The floating-text derivation now prefers `ev.damageType` and only falls
     back to the dice-log label inference when the event doesn't carry one.
4. `src/components/dnd/CombatGrid.tsx` — added `damageType?: string` to
   `CombatAnimEvent` (plumbed for future hit-flash color tinting).
5. `src/components/dnd/CombatTextOverlay.tsx` — tuned the rise from
   `setOffset((o) => o - 1.5)` to `setOffset((o) => o - 0.55)` so the text
   rises ~41px over 1.2s (0.55 × 75 ticks ≈ 41px), matching the spec.

**Result:** every damage event now carries an explicit `damageType` from the
server → the floating text is reliably color-coded. Crits still show the golden
burst + sparkles (unchanged). Misses still show "ПРОМАХ" (unchanged). Heals
still show green `+N` (unchanged).

---

### Feature 2 — Loot drops from defeated monsters

**Goal:** when a monster dies, drop loot on its grid cell. Render a 💰 icon on
the grid. When a player walks onto the cell, auto-pickup the item into their
inventory, remove the icon, show a toast: "💰 Подобрано: [item] ×N".

**Architecture decisions:**

1. **Reuse the existing `LootDrop` Prisma model** (added in TS-FIX) rather than
   adding a new model. The task description showed a simplified schema
   (`{id, roomId, x, y, itemName, quantity, createdAt}`) but the actual
   `LootDrop` model already had `monsterName`/`killerName`/`gold`/`itemsJson`/
   `round` for the LootLog panel. I added the new grid-placement columns as
   OPTIONAL fields with defaults so the existing LootLog / save-load code keeps
   working:
   - `x Int @default(-1)` — -1 = legacy LootLog row, >= 0 = grid loot cell.
   - `y Int @default(-1)`
   - `itemName String @default("")` — single item name for grid loot.
   - `quantity Int @default(1)`
   - `pickedUp Boolean @default(false)` — soft-delete flag.

2. **Distinct from the legacy `lootCells` system.** The existing `lootCells`
   (item 20) maps `__ground__` inventory items to deterministic hash positions.
   The new `lootDrops` uses explicit (x, y) at the monster's death cell. Both
   coexist — `lootCells` is for legacy/seed ground items, `lootDrops` is for
   monster death loot.

3. **Auto-pickup is server-side.** The `/api/game/move-token` route calls
   `pickupLootAtPosition(roomId, x, y, playerName)` AFTER moving the token,
   then returns `pickedUpLoot` in the response so page.tsx can show a toast.

**Files modified:**

1. `prisma/schema.prisma` — added `x`, `y`, `itemName`, `quantity`, `pickedUp`
   to `LootDrop`. Ran `bun run db:push` — Prisma client regenerated.
2. `src/lib/game/types.ts` — added `LootDropCellState` interface and
   `lootDrops: LootDropCellState[]` to `GameStateSnapshot`.
3. `src/lib/game/state.ts`:
   - Imported `LootDropCellState`.
   - Added `db.lootDrop.findMany({ where: { roomId, x: { gte: 0 }, pickedUp: false }})`
     to the `getSnapshot` Promise.all.
   - Mapped the rows to `LootDropCellState[]` and added `lootDrops` to the
     snapshot.
   - Added `dropLootOnGrid(roomId, x, y, itemName, quantity, monsterName, killerName?, round?)`
     helper — creates a LootDrop row with x/y/itemName/quantity set.
   - Added `pickupLootAtPosition(roomId, x, y, playerName)` helper — for each
     unpicked-up LootDrop at (x,y): looks up the item in the item database via
     `findItemByName`, adds it to the player's inventory via
     `addDatabaseItemToInventory` (retains authored stats), falls back to a
     generic InventoryItem row if the item isn't in the DB, then soft-deletes
     the LootDrop row by setting `pickedUp = true`. Returns the picked-up
     items list.
   - Modified the existing monster death loot block in `damageMonster`:
     replaced `addDatabaseItemToInventory(roomId, "__ground__", entry)` with
     `dropLootOnGrid(roomId, m.posX, m.posY, entry.name, 1, m.name)`.
     ALSO drops 1-2 named items from `bestiaryEntry.loot.items` (50% chance
     per item, max 2) so unique monster loot like "Ржавый кинжал" or "Кольцо
     защиты +1" actually appears on the grid.
4. `src/app/api/game/move-token/route.ts`:
   - Imported `pickupLootAtPosition`.
   - After `moveToken(...)`, calls `pickupLootAtPosition(room.id, x, y, playerName)`.
   - Returns `pickedUpLoot` in the JSON response.
5. `src/components/dnd/CombatGrid.tsx`:
   - Added `lootDrops?` to `GridExtras`.
   - Added `lootDropMap` memo (Map of "x,y" → item info).
   - Renders a 💰 icon at each loot drop cell with `bg-amber-500/15` +
     `border-amber-400/40` + `animate-pulse` so it stands out. Tooltip shows
     the item name + quantity + slain monster name.
   - Updated `gridExtrasEqual` to include `lootDrops` in the shallow-equal
     check so the memo re-renders on kill/pickup.
6. `src/app/page.tsx`:
   - Passes `lootDrops: snapshot.lootDrops` via `gridExtras`.
   - In `handleMoveClick`, after a successful move, loops over
     `data.pickedUpLoot` and calls `toast.success(tt("ui.loot_picked_up", {item, qty}))`
     for each item.
7. `src/lib/game/i18n.ts` — added `ui.loot_picked_up` to all 6 languages:
   - ru: "💰 Подобрано: {item} ×{qty}"
   - en: "💰 Picked up: {item} ×{qty}"
   - es: "💰 Recogido: {item} ×{qty}"
   - de: "💰 Aufgehoben: {item} ×{qty}"
   - fr: "💰 Ramassé : {item} ×{qty}"
   - zh: "💰 拾取：{item} ×{qty}"

**Dev-server cache fix (important!):** After running `bun run db:push`, the
Next.js dev server's module cache for `@prisma/client` was stale — the cached
PrismaClient instance didn't have the `lootDrop` delegate, causing
`db.lootDrop.findMany` to throw `Cannot read properties of undefined`.
Fix: `src/lib/db.ts` now validates the cached instance has the `lootDrop`
delegate before reusing it; if not, it discards the stale instance and creates
a fresh `PrismaClient`. A `touch next.config.ts` forced the dev server to do a
full reload and pick up the regenerated Prisma client.

---

### Feature 3 — Status effect icons on tokens (BG3-style)

**Goal:** show small 16px circular icons next to each token showing the first
3-4 active conditions. On hover, show a tooltip with the condition name +
remaining duration + source. If more than 4 conditions, show "+N".

**What already existed:**
- `ConditionIcons` component in `CombatGrid.tsx` already:
  - Rendered the first 4 conditions as 14px (h-3.5 w-3.5) circular icons.
  - Used the `CONDITIONS` constant from `conditions.ts` for icon + color + name.
  - Showed a native `title` tooltip with name + duration + description + source.
  - Positioned at top-right (`-right-1 -top-1`) — not overlapping the token.
  - Showed a "+N" indicator for >4 conditions.

**What I changed:**
1. `src/components/dnd/CombatGrid.tsx`:
   - Imported `Tooltip, TooltipTrigger, TooltipContent` from `@/components/ui/tooltip`.
   - Upgraded `ConditionIcons`:
     - 16px icons (`h-4 w-4` instead of `h-3.5 w-3.5`) per spec.
     - Wrapped each icon in a shadcn `<Tooltip>` with `<TooltipTrigger asChild>`
       + `<TooltipContent side="left">` showing:
       - Condition name (RU + EN in parentheses).
       - Remaining duration (in rounds).
       - Source (if any).
       - Full description.
     - The "+N" overflow badge is now a styled pill (`bg-stone-900/90` +
       `border-amber-700/40`) instead of plain text.

**Note on condition → emoji mapping:** the spec listed example mappings
(poisoned=🤢, stunned=💫, burning=🔥, frightened=😱, invisible=👻). The existing
`conditions.ts` already maps all 18 conditions to emojis + colors. I left
`conditions.ts` unchanged (it's the source of truth and may be used elsewhere)
and the `ConditionIcons` component renders whatever `CONDITIONS[c.condition]`
returns. The existing mappings are very close to the spec (poisoned=🤢,
stunned=💫, burning=🔥, frightened=😨 (vs spec's 😱), invisible=👻, etc.).

---

## File Inventory

**Modified files (12):**
1. `prisma/schema.prisma` — LootDrop model extended with x/y/itemName/quantity/pickedUp.
2. `src/lib/db.ts` — defensive PrismaClient cache invalidation (lootDrop delegate check).
3. `src/lib/game/types.ts` — added `damageType` to ResolvedEvent; added `LootDropCellState` interface; added `lootDrops` to GameStateSnapshot.
4. `src/lib/game/state.ts` — imported LootDropCellState; added lootDrop query to getSnapshot; added `lootDrops` to snapshot; added `dropLootOnGrid` + `pickupLootAtPosition` helpers; rewired damageMonster loot block to use dropLootOnGrid at the monster's death cell + drop bestiary named items.
5. `src/lib/game/dm-agent.ts` — added `damageType: string` to ResolutionResult; added `lastDamageType` accumulator in resolvePlayerAction; set it at AoE / single-target / backlash sites; added `damageType` to all 14 early-return stubs + the two main returns.
6. `src/lib/game/i18n.ts` — added `ui.loot_picked_up` to all 6 languages.
7. `src/app/page.tsx` — handleMoveClick toast for pickedUpLoot; lastAnimEvent forwards damageType; floating-text derivation prefers ev.damageType; gridExtras passes lootDrops.
8. `src/app/api/game/move-token/route.ts` — calls pickupLootAtPosition after moveToken; returns pickedUpLoot.
9. `src/components/dnd/CombatGrid.tsx` — added damageType to CombatAnimEvent; added lootDrops to GridExtras; added lootDropMap memo; renders 💰 icons; updated gridExtrasEqual; upgraded ConditionIcons to 16px + shadcn Tooltip.
10. `src/components/dnd/CombatTextOverlay.tsx` — tuned rise to ~40px (0.55px/tick × 75 ticks).

**No new files. No new packages. No mini-service changes.**

---

## Verification

- `bun run db:push` — Prisma client regenerated successfully ✅
- `bun run lint` — 0 errors, 0 warnings ✅
- `npx tsc --noEmit` — 0 errors ✅
- `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/` — 200 ✅
- `/api/game/state?room=...` — returns 200 with `lootDrops: []` in the snapshot ✅
- LootDrop SQL query confirmed in dev.log with all new columns (x, y, itemName, quantity, pickedUp) ✅

---

## Integration Notes for Future Agents

1. **LootDrop model is now dual-purpose.** Legacy LootLog rows have `x = -1`
   (the default). Grid-placed loot rows have `x >= 0` AND `pickedUp = false`.
   When querying for the LootLog panel, filter by `x: -1` (or just include all
   rows — the panel ignores the new columns). When querying for grid loot,
   filter by `x: { gte: 0 }, pickedUp: false`.

2. **`dropLootOnGrid` is the single entry point for grid loot.** If you want
   to drop loot from a non-monster source (e.g. a chest, a quest reward), call
   `dropLootOnGrid(roomId, x, y, itemName, quantity, sourceName)`.

3. **`pickupLootAtPosition` is idempotent.** It only picks up `pickedUp: false`
   rows. Calling it on an empty cell returns `[]`.

4. **The `damageType` field on `ResolvedEvent` is now REQUIRED.** Any new
   action path that returns a `MechanicsResult` must include `damageType`
   (use `""` when no damage was dealt, or the inferred type when it was).

5. **The PrismaClient cache invalidation in `src/lib/db.ts`** checks for the
   `lootDrop` delegate. If you add a NEW Prisma model in the future, update
   the check to verify that model instead (or in addition) — otherwise the
   dev server's cached PrismaClient won't have the new model after
   `bun run db:push`. The simplest fix is to `touch next.config.ts` to force
   a full dev server reload after schema changes.
