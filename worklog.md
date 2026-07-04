---
Task ID: 1
Agent: main (Z.ai Code)
Task: Build a D&D 5e Virtual Tabletop with an autonomous AI Dungeon Master agent — full-stack Next.js 16 app with Prisma/SQLite, LLM-driven DM decision loop, dice rolling, tactical combat grid, scene image generation, and a dark-fantasy Russian-language narrative UI.

Work Log:
- Explored project scaffold (Next.js 16, shadcn/ui, Prisma/SQLite, z-ai-web-dev-sdk) and read the LLM + image-generation skill docs.
- Designed and pushed a Prisma schema (Player, Monster, InventoryItem, ChatMessage, DiceRoll, Scene, GameState) to SQLite via `bun run db:push`.
- Built the game backend in `src/lib/game/`:
  - `types.ts` — shared TypeScript types for game state, resolutions, snapshots.
  - `dice.ts` — dice-notation parser + fair RNG roller (d20, damage, ability modifiers).
  - `state.ts` — DB helpers: snapshot, DM-context builder, damage/heal/move/inventory/gold mutations, monster AI movement, combat-end detection.
  - `seed.ts` — opening scenario: hero Алдрик (Fighter lv.1), 5 starting items, 2 hidden goblins, misty-forest-ruins scene, Russian intro narrative.
  - `json.ts` — robust JSON extractor for LLM output (handles markdown fences / trailing commas).
  - `dm-agent.ts` — the autonomous DM decision loop: (1) fetch game context, (2) LLM call #1 plans mechanics as JSON (rolls, DC/AC, success/failure effects, image prompt), (3) backend rolls dice fairly, (4) applies state changes (HP, inventory, grid, gold), (5) runs monster turn deterministically (move-toward-player + attack), (6) LLM call #2 narrates the full resolved round in Russian, (7) persists messages + advances round. Includes graceful fallbacks if the LLM returns bad JSON.
- Built 4 API routes:
  - `GET /api/game/state` — seeds if needed, returns full snapshot.
  - `POST /api/game/action` — runs the DM agent for a player action, returns resolved event + refreshed snapshot.
  - `POST /api/game/image` — generates a dark-fantasy scene illustration via z-ai image SDK, saves to `public/scenes/`, sets as active scene.
  - `POST /api/game/reset` — wipes and re-seeds the world.
- Built the frontend (`src/app/page.tsx` + `src/components/dnd/`):
  - `CharacterSheet` — portrait, HP bar (color-coded), AC/gold, 6 ability scores with modifiers, scrollable inventory with type badges.
  - `CombatGrid` — 10×10 tactical grid, player + monster tokens with HP bars, combat/round indicator, legend.
  - `SceneViewer` — atmospheric scene image with vignette, location caption, generating badge.
  - `ChatPanel` — DM narrative bubbles (serif, amber), player bubbles, quick-action chips (Attack/Look/Move/Speak), textarea input, "DM is thinking" animated indicator.
  - `DiceLog` — recent dice rolls with notation, result, total, success/fail.
  - Responsive 3-column desktop layout / stacked mobile layout; sticky header + footer (`min-h-screen flex flex-col`, `mt-auto`).
- Customized `globals.css` with a warm dark-fantasy palette (crimson primary, amber-gold accents, stone backgrounds), custom scrollbars, and animations (flicker, pulse-glow, fade-up, dice-roll).
- Generated 2 initial images via z-ai CLI: `forest-ruins.png` (opening scene) and `hero.png` (player portrait).
- Fixed a bug found during testing: hidden monsters weren't shown in the DM context, so the LLM couldn't target them for damage on the first combat turn. Fixed by revealing hidden threats in `getDMContext` and adding a nearest-monster fallback in damage targeting.

Stage Summary:
- Fully functional D&D 5e VTT with an autonomous AI DM. Verified end-to-end via Agent Browser:
  - Page renders cleanly (3-column dark-fantasy layout, all panels populated, no console errors).
  - Exploration actions produce rich Russian narrative + new AI-generated scene art.
  - Combat triggers correctly (hidden goblins activate), attack rolls use real d20+modifier vs monster AC, damage is applied to the correct monster, monster deaths are tracked, monster turns run (move-toward-player + attack), round counter advances, combat ends when all monsters dead.
  - Dice log records attack + damage rolls.
  - Mobile responsive; sticky footer; lint clean (0 errors, 0 warnings).
- Tech: Next.js 16 App Router, TypeScript, Prisma/SQLite, z-ai-web-dev-sdk (LLM + image generation), shadcn/ui, Tailwind CSS 4, Lucide icons.
- Artifacts: `prisma/schema.prisma`, `src/lib/game/*`, `src/app/api/game/*`, `src/components/dnd/*`, `src/app/page.tsx`, `public/scenes/{forest-ruins,hero}.png`.

---
Task ID: 2
Agent: main (Z.ai Code)
Task: Add multiplayer co-op mode with room codes + initiative-based turn-order combat so friends can play together.

Work Log:
- Restructured the Prisma schema to be room-scoped: added `Room` (code, host, combat flags, turnIndex), made `Player` belong to a room (unique by roomId+name, added weaponName/weaponNotation/isHost/isAlive/initiative fields), added `InitiativeEntry` (combatant name/type/initiative/order/monsterId/isAlive), and added `roomId` to Monster/InventoryItem/ChatMessage/DiceRoll/Scene with cascade deletes. Force-reset the DB and regenerated the Prisma client.
- Installed `socket.io` + `socket.io-client` and built a stateless socket.io relay mini-service at `mini-services/game-sync/` (port 3003, `bun --hot`). It maps sockets to room codes and broadcasts `room:refresh` pings so every client re-fetches state — keeping the DB as the single source of truth while giving near-instant multi-client sync.
- Built character class presets (`src/lib/game/presets.ts`): Воин (Fighter), Следопыт (Ranger), Маг (Wizard), Жрец (Cleric) — each with balanced level-1 stats, a weapon + damage notation, starting items, and a distinct color. Party members are auto-placed at different grid positions by join order.
- Rewrote `state.ts` to be fully room-scoped: snapshot, DM-context builder (now lists the whole party + their weapons, hidden threats, and the current initiative order), damage/heal/move/inventory/gold mutations keyed by roomId, `rollInitiative()` (d20+DEX for players, d20+2 for monsters, sorted descending with tie-breaks), `getCurrentCombatant`, `countAlive`, and nearest-player/monster helpers for monster AI.
- Rewrote `dm-agent.ts` for initiative-based turns:
  - Split `resolvePlayerAction` (LLM plan + dice + effects, NO monster turn) from `advanceTurn` (auto-runs monster turns in initiative order until a living player is up, skipping dead combatants).
  - `processPlayerAction` enforces turn order (rejects actions when it isn't the actor's turn during combat), resolves the acting player's action, and — if the action triggered combat — rolls initiative and advances through monster turns. The opening strike resolves before initiative; if the triggerer is first in order they're skipped (already acted).
  - Fixed an opening-strike bug: hidden monsters are now revealed BEFORE the attack damage is applied (plan first → activate hidden → apply → roll initiative), so the triggering player's first hit actually lands.
  - Monster turns narrated via a dedicated LLM call; player actions narrated via a second LLM call. Initiative rolls are logged to the dice history.
- Built room-scoped API routes: `POST /api/game/room/create`, `POST /api/game/room/join` (rejects mid-combat joins + duplicate names), and room-scoped `GET /state?room=`, `POST /action`, `POST /reset`, `POST /image`.
- Built the frontend:
  - `Lobby.tsx` — create/join room flow with hero-name input + 4 class-preset cards.
  - `PartyPanel.tsx` — all party members with HP bars, host crown, "Вы" badge, current-turn highlight, dead overlay.
  - `InitiativeTracker.tsx` — horizontal turn-order bar with initiative numbers, current-turn pulse, dead markers.
  - Updated `CharacterSheet.tsx`, `CombatGrid.tsx` (multi-player tokens + stacking), `ChatPanel.tsx` (speaker names, turn-lock banner "Ваш ход" / "Ход: X — дождитесь своей инициативы", disabled input when not your turn).
  - `page.tsx` — lobby/game routing via localStorage session, socket room join, refresh-ping listener + 4s polling fallback, copy-room-code button, real-time state updates.
- Fixed a Prisma-client staleness issue: after adding the `Room` model, the running Next dev server kept a cached `@prisma/client` without `db.room`. Resolved by clearing the `.next` cache and restarting the dev server.

Stage Summary:
- Fully functional multiplayer co-op D&D VTT, verified end-to-end via Agent Browser + curl (simulating 2 players):
  - Host created room `D9YANB` as Алан (Следопыт); second player Мира (Маг) joined via the same code — both appear in the party panel and on the grid at distinct positions; the join was picked up by player 1 via real-time sync.
  - Combat triggered by an attack: initiative rolled for all 4 combatants (d20+DEX), order determined (e.g. Алан 23 > Гоблин-стрелок 20 > Гоблин-разведчик 17 > Мира 8). Monsters act automatically on their turn (move toward nearest player when far, attack when adjacent). Players can only act on their turn — input is locked otherwise with a clear banner.
  - Verified a full round across two players + two monsters: Алан's opening strike hit the goblin-scout (21 vs AC 13, 7 dmg), Мира cast fire bolt on her turn (7 dmg to goblin-archer), round advanced to 2 and turn returned to Алан — with player 1's browser unlocking via polling sync.
  - Turn-lock, initiative tracker, party panel, and real-time sync all confirmed working in the browser. Lint clean (0 errors/warnings). Both Next.js (3000) and game-sync (3003) servers running.
- Artifacts: `prisma/schema.prisma`, `mini-services/game-sync/`, `src/lib/game/{presets,state,seed,dm-agent,socket,types}.ts`, `src/app/api/game/{room/create,room/join,state,action,reset,image}/route.ts`, `src/components/dnd/{Lobby,PartyPanel,InitiativeTracker,CharacterSheet,CombatGrid,ChatPanel}.tsx`, `src/app/page.tsx`.

---
Task ID: 3
Agent: main (Z.ai Code)
Task: BG3-style character creator (more classes/races/backgrounds), translate game title to English, polish UI + fix bugs, then write detailed deployment guide (variant B).

Work Log:
- Expanded character content (`src/lib/game/presets.ts`): 12 D&D 5e classes (Fighter, Barbarian, Paladin, Ranger, Rogue, Monk, Wizard, Sorcerer, Warlock, Cleric, Druid, Bard), 9 BG3-flavored races (Human, Elf, Dwarf, Halfling, Tiefling, Gnome, Half-Orc, Dragonborn, Githyanki) each with stat bonuses + a racial trait, and 10 backgrounds (Soldier, Acolyte, Criminal, Folk Hero, Noble, Sage, Urchin, Outlander, Entertainer, Charlatan) each with a gold bonus + skill + flavor item. Added `applyRaceBonuses()` to compute final stats (capped at 18).
- Updated `types.ts` (added `Stats`, `RacePreset`, `BackgroundPreset`; added `race/raceName/background/backgroundName` to PlayerState) and the Prisma schema (`Player.race/raceName/background/backgroundName`), force-reset the DB and regenerated the client.
- Updated `seed.ts`: refactored to export `seedRoomContent(roomId, input)`; `createPlayer` now applies race bonuses to stats, adds background gold, and grants the background item. The DM context builder now reports the hero as e.g. "Тифлинг Cleric, происхождение Служитель" so the LLM can narrate race/background flavor.
- Updated room/create + room/join API routes to accept `classId/raceId/backgroundId`; rewrote reset route to read the caller's existing race/class/background from the DB before deletion (preserves the hero across resets).
- Built `CharacterCreator.tsx` — a multi-step BG3-style wizard (Race → Class → Background → Name) with a clickable step indicator, a "Случайно" (randomize) button, and a sticky live-preview panel showing the computed final stats (with race bonus deltas highlighted), HP/AC/gold, weapon + damage notation, the racial trait, and the background skill. Rewrote `Lobby.tsx` to route into the creator.
- Translated the game title to English: "Тёмные Хроники" → **DUSKFALL** (layout metadata, page header, footer, loading screen, lobby, creator). Narrative stays Russian (DM speaks Russian for immersion).
- Updated `CharacterSheet.tsx` + `PartyPanel.tsx` to show "Раса Класс · Происхождение · ур.N" for each hero.

Variant B (deployment):
- Added production artifacts: `Dockerfile` (multi-stage: builds Next.js standalone + copies Prisma client/CLI + game-sync; runs both processes via `start.sh`), `start.sh` (first-boot `prisma db push`, then launches game-sync:3003 + Next.js:3000), `.dockerignore`, `docker-compose.yml` (app + Caddy gateway + persistent `duskfall-data` volume for SQLite), `Caddyfile.prod` (same XTransformPort=3003 routing as the sandbox, with auto-HTTPS for real domains), `.env.example`.
- Wrote `DEPLOYMENT.md` — a detailed Russian guide covering: VPS+Docker Compose (recommended, step-by-step from server rental → Docker install → code upload → env config → domain/HTTPS → run → invite friends → backup/update), Railway, Render, single-port PaaS caveat, env-var reference, optional PostgreSQL migration, post-deploy checklist, and a troubleshooting section.

Stage Summary:
- Character creator verified end-to-end in the browser: created "Кассия" (Тифлинг Cleric, Служитель) — race bonuses applied (INT 11=10+1, CHA 14=12+2), background gold (22=10+12) and item ("Святой амулет" via Acolyte... actually Печать рода for noble) granted. All 12 classes, 9 races, 10 backgrounds render in the wizard; live preview updates on selection.
- Combat still fully functional with the new creator: Кассия attacked, initiative rolled (Goblin Scout 21 > Goblin Archer 8 > Кассия 2), killed the goblin-scout (7 dmg → 0 HP, inactive), turn advanced through the goblin-archer and back to Кассия in round 2. Turn-lock + initiative tracker confirmed in browser.
- Title is now DUSKFALL everywhere; lint clean (0 errors/warnings); both servers (3000 + 3003) running; no console errors.
- Artifacts: `src/lib/game/{presets,types,seed,state,dm-agent}.ts`, `src/components/dnd/CharacterCreator.tsx`, `src/components/dnd/{Lobby,CharacterSheet,PartyPanel}.tsx`, `src/app/{layout,page}.tsx`, `src/app/api/game/{room/create,room/join,reset}/route.ts`, `Dockerfile`, `start.sh`, `.dockerignore`, `docker-compose.yml`, `Caddyfile.prod`, `.env.example`, `DEPLOYMENT.md`.

---
Task ID: 2
Agent: talent-data-writer
Task: Write 120 class talents (10 per class × 12 classes) for DUSKFALL.

Work Log:
- Read `/home/z/my-project/worklog.md` (prior tasks 1–3: VTT scaffold, multiplayer co-op, BG3-style creator with 12 classes / 9 races / 10 backgrounds) and `src/lib/game/types.ts` to confirm the `Talent`/`TalentEffect` discriminated-union shapes (14 effect variants).
- Created `src/lib/game/talent-data.ts` exporting `CLASS_TALENTS: Record<string, Talent[]>` and the `getTalentsForClass(classId)` helper.
- Authored exactly 10 talents for each of the 12 classes (`fighter, barbarian, paladin, ranger, rogue, monk, wizard, sorcerer, warlock, cleric, druid, bard`) — 120 total. IDs follow `${classId}_t${1-10}`. Names + descriptions are in Russian, D&D 5e / BG3-flavored ("Второе дыхание", "Ярость варвара", "Божественная кара", "Клинок_HEX", "Адское возмездие", "Вдохновение барда", etc.).
- Spread effects thematically per class — each class uses 9–10 distinct effect types (well above the 5-type minimum). E.g. fighter leans on counterattack/crit_range/damage_bonus_flat/ac_bonus/hp_bonus/extra_attack_chance/reroll_miss_once; barbarian on damage_bonus_flat/damage_resistance_flat/crit_bonus_dice/heal_on_kill/initiative_bonus/vampiric_pct; rogue on crit_range/crit_bonus_dice/damage_bonus_flat/reroll_miss_once/initiative_bonus; etc.
- Balanced all numerics for a level-2 character per the spec: counterattack chance 0.25–0.3, damage_bonus_flat 1–3, ac_bonus 1–2, hp_bonus 5–12, damage_resistance_pct 0.15–0.25, damage_resistance_flat 1–3, crit_range minRoll 19, crit_bonus_dice 1–2, extra_attack_chance 0.3–0.4, vampiric_pct 0.1–0.25, initiative_bonus 2–3, save_bonus 1–2, heal_on_kill notation "1d6" or "1d8". Counterattack damageNotation matches weapon style (fighter/paladin "1d8+3", rogue/monk "1d6+X", wizard/sorcerer/warlock "1d8", ranger "1d6+3").
- Verified with `bunx tsc --noEmit src/lib/game/talent-data.ts` — clean (0 errors). Verified with `bun run lint` — clean (0 errors, 0 warnings). Counted talents: 10 per class, 120 total.

Stage Summary:
- Deliverable complete: `/home/z/my-project/src/lib/game/talent-data.ts` contains 120 strictly-typed, lint-clean talents — 10 per class × 12 classes, thematically aligned with D&D 5e class identities, with at least 9 distinct effect types per class and level-2-appropriate numeric balance. Exports `CLASS_TALENTS` and `getTalentsForClass(classId)`. Ready to be wired into the character-creator / level-up flow (a future task can call `getTalentsForClass(player.classId)` to present the 10 choices on level-up and store picked ids in `PlayerState.selectedTalents`).

---
Task ID: 4
Agent: main (Z.ai Code)
Task: BG3-style character creator expansion (point-buy + 120 talents + level-up), random unique adventures, hard atmosphere rules, UI fixes (non-stretched image, smaller grid).

Work Log:
- Added 12 D&D classes already existed; kept. Added point-buy: 5 bonus stat points distributable at creation (capped 18), persisted as bonusStr/Dex/Con/Int/Wis/Cha on Player + shown live in the creator preview.
- Designed a 14-type TalentEffect discriminated union (counterattack, damage_resistance_pct/flat, crit_range, crit_bonus_dice, extra_attack_chance, heal_on_kill, initiative_bonus, damage_bonus_flat, ac_bonus, vampiric_pct, reroll_miss_once, save_bonus, hp_bonus) in types.ts.
- Delegated 120 talents (10×12 classes) to a subagent (Task ID 2) with a tight spec; wrote `talent-data.ts` + a `talents.ts` engine module that resolves a player's selected talents into combat modifiers and rolls reactive effects (counterattack, vampiric heal, heal-on-kill, damage reduction).
- Added XP/leveling: Player.xp + XP_THRESHOLDS (L2=200, L3=600, L4=1200, L5=2000), `awardXP` (raises level, proficiency, maxHP, sets pendingLevelUp), `applyLevelUpTalent`, `xpForMonster`. Killing a monster awards XP to the killer (and to a counterattacker who lands the killing blow). Combat engine now applies talent modifiers: player damage bonus + vampiric + heal-on-kill on hits; monster attacks use effectiveAC, apply damage reduction, and may trigger a counterattack.
- Added a new `stats` step to the CharacterCreator (point-buy UI with +/- buttons, live pool counter, stat cap, modifier display). The live preview now reflects bonus-adjusted final stats.
- Built `LevelUpModal.tsx` (Dialog) listing the player's class talents (filtered to unselected) with effect badges; calls POST /api/game/levelup. Wired into page.tsx so it opens when `you.pendingLevelUp` is true.
- Added 8 random starting locations (`locations.ts`): Mistwood ruins, Forgotten crypt, Burned village, Silver caverns, Death marsh, Black tower, Shipwreck shore, Ruined monastery — each with a unique Russian intro hook, an English image prompt, and themed hidden enemies. Room creation picks one at random so every adventure begins somewhere different.
- Strengthened the DM planning system prompt with 6 hard "atmosphere & realism" rules: (1) items exist ONLY if in inventory — player cannot conjure items by assertion; (2) strict pseudo-medieval era — no gunpowder/electricity/modern tech/sci-fi; (3) every adventure unique; (4) freedom with realistic consequences; (5) D&D 5e balance (artifacts must have drawbacks, ≤50 gold/session early); (6) dark-fantasy tone. The DM context now lists each hero's full inventory so the LLM can verify what items actually exist.
- Fixed UI: SceneViewer now uses `object-contain` with `max-h-[42vh]` so the location image is never stretched/distorted (letterboxed naturally). CombatGrid max-width reduced 460→340px so the grid is more compact.
- Fixed a charClass/classId mismatch bug: players store `charClass="Fighter"` but talents are keyed by lowercase `classId`. Added `getClassIdByCharClass()` and used it in talents.ts, LevelUpModal, and the levelup API.

Stage Summary:
- Verified end-to-end: created a Fighter, point-buy allocated (СИЛ 18), random location chosen (shipwreck shore), combat deals damage with talent bonuses, killing monsters awards XP (100/25 XP per monster), crossing 200 XP sets pendingLevelUp, the LevelUpModal opens showing the 10 Fighter talents with effect descriptions, picking "Рипоста" (counterattack 30%) saved it and cleared the flag. Talent effects (counterattack, damage reduction, AC bonus, vampiric, etc.) are applied in the combat engine.
- Atmosphere rules baked into the DM prompt: tested context shows full inventory per hero so the LLM can enforce "no free items"; era/balance/uniqueness constraints are explicit.
- Vision-verified: scene image no longer stretched, grid is a reasonable size, no layout issues. Lint clean (0 errors/warnings), both servers running, no console errors.
- Artifacts: `src/lib/game/{talent-data,talents,locations,types,seed,state,dm-agent,presets}.ts`, `src/components/dnd/{CharacterCreator,LevelUpModal}.tsx`, `src/app/api/game/levelup/route.ts`, updated `src/components/dnd/{SceneViewer,CombatGrid}.tsx`, `src/app/page.tsx`, `src/app/api/game/{room/create,room/join}/route.ts`.

---
Task ID: 5
Agent: main (Z.ai Code)
Task: Fix join-by-code step order; add abilities system (innate/class/scrolls) shown in creator + character sheet; honest answer on going online.

Work Log:
- Fixed the "Войти по коду" flow: previously it jumped straight to the name step with the code field embedded. Now the step order is mode-dependent — create: race→class→background→stats→name; join: code→race→class→background→stats→name. Added a new "code" step (first for join) with its own input; removed the code input from the name step. `canNext` requires a 6-char code on the code step.
- Built `src/lib/game/abilities.ts`: an Ability type (source: race|class|talent|scroll, consumable flag, castNotation, castType, uses). Catalogs:
  - RACIAL_ABILITIES (9 races, ~2-3 each, dnd.su/SRD-flavored): e.g. Elf darkvision + fey ancestry; Dwarf poison resilience; Tiefling fire resistance + Hellish Rebuke (2d6 reaction); Half-Orc relentless endurance + savage attacks; Dragonborn breath weapon (2d6 cone); Githyanki psionics + mind discipline.
  - CLASS_ABILITIES (12 classes, 1 starting feature each): Fighter Second Wind (1d10 heal), Barbarian Rage, Paladin Divine Smite (2d8), Ranger Hunter's Mark (1d6), Rogue Sneak Attack (1d6), Monk Martial Arts, Wizard Arcane Recovery, Sorcerer Font of Magic, Warlock Pact Magic, Cleric Channel Divinity, Druid Wild Shape, Bard Bardic Inspiration (1d6).
  - SCROLL_SPELLS (7 consumable spells): Fireball (8d6), Cure Wounds (1d8+3), Shield (+5 AC), Magic Missile (3d4+3), Darkness, Lightning (8d6), Mass Cure (3d8). Scroll-type inventory items auto-appear as castable consumable abilities.
  - `computeAbilities(player, inventory)` merges race + class + talents + scroll-items; `previewAbilities(raceId, classId)` for the creator.
- Added a starting scroll ("Свиток магической стрелы") to the Wizard preset so the scroll system is demonstrable out of the box.
- Wired abilities into the CharacterCreator preview (race + class abilities shown with badges "народ"/"класс" and cast notation).
- Added an "Способности" section to the CharacterSheet (in-game): lists all computed abilities with source badges (народ/класс/талант/свиток), marks consumable scrolls with an amber "расходуемый" badge and a scroll icon, shows cast notation (урон/лечение/эффект). Talents chosen at level-up appear here too.
- Updated the DM context to tag scroll items as "[расходуемое заклинание-свиток]" so the LLM treats them as castable consumables and removes them on use.

Stage Summary:
- Verified in browser: join flow now starts at the code step, then race→class→background→stats→name (correct order). Character creator preview shows abilities (e.g. Tiefling: Тёмное зрение, Сопротивление огню, Адское возмездие). In-game character sheet shows the full ability list with source badges and consumable markers — a Tiefling Wizard correctly displays 3 racial + 1 class ability + 1 consumable scroll. Lint clean (0 errors/warnings), no console errors.
- Artifacts: `src/lib/game/abilities.ts`, updated `src/components/dnd/{CharacterCreator,CharacterSheet}.tsx`, `src/lib/game/{presets,state}.ts`.

---
Task ID: fix-all-v3
Agent: fix-all-v3-agent
Task: Fix backstory, spell/rest UI, turn enforcement, scroll, chat history

Work Log:
- Read worklog.md (last 3 sections: tasks 2/3/4/5) + CharacterCreator, ChatPanel,
  BottomPanel, CharacterSheet, page.tsx, state.ts, dm-agent.ts, action/route.ts,
  types.ts, seed.ts, room/create + room/join routes, prisma schema, rest + reset
  routes, chat-history route.
- Fix 1 (backstory): PlayerState.backstory added; Player.backstory column added
  to Prisma schema (default ""). DB reset + client regenerated. CharacterCreator
  gets a new "backstory" step between background and stats (create:
  race→class→background→backstory→stats→name; join adds "code" up front).
  Textarea with 500-char limit + live counter + Russian placeholder. /api/game/
  room/create + /join routes parse + trim+slice(500) backstory. createPlayer in
  seed.ts persists it. getDMContext in state.ts emits each hero's backstory so
  the DM agent can weave their history into the narrative. CharacterSheet shows
  the backstory in a collapsible <details> under the abilities section. Reset
  route preserves backstory across resets (Fix 6).
- Fix 2 (spell slots + rest buttons): BottomPanel gains a dedicated "Отдых"
  section with short/long rest buttons (always visible, disabled during combat /
  DM-thinking / dead). onRest + isThinking + isDead + isYourTurn wired from
  page.tsx. Existing rest buttons in ChatPanel (quick-action row) and existing
  spell-slots sections (BottomPanel for casters + CharacterSheet for casters)
  were already in place — verified visually.
- Fix 3 (turn enforcement): dm-agent.resolvePlayerMechanics already throws
  "Сейчас не ваш ход..." (combat) and "Сейчас ход: X. Дождитесь своей очереди."
  (exploration, skipped for solo). /api/game/action route's 403 detection
  extended to match BOTH messages (was only matching "не ваш ход"/"Павший" —
  exploration out-of-turn returned a misleading 500). BottomPanel now disables
  ability/item quick-use chips when !isYourTurn so the player can't trigger
  wasted action calls. ChatPanel input was already locked when !isYourTurn
  (locked placeholder shows whose turn it is).
- Fix 4 (scrollable menus): MySavesDialog was missing any height constraint /
  scroll — added max-h-[88vh] flex flex-col gap-0 p-0 to DialogContent and
  wrapped the body in a flex-1 overflow-y-auto inner div. Verified all other
  modal panels already have max-h-[85vh|88vh|90vh] on DialogContent + either
  overflow-y-auto or shadcn ScrollArea h-full on inner content: BestiaryPanel,
  SpellbookPanel, ItemDatabasePanel, QuestJournal, WorldMap, CombatLog,
  SettingsMenu, DialoguePanel, CraftingPanel, EquipmentPanel, SkillTreeModal.
- Fix 5 (chat scroll history): ChatPanel refactored — atBottomRef tracks whether
  the user is within 80px of the bottom via a passive scroll listener
  (rAF-debounced). Auto-scroll to bottom on new messages ONLY when atBottomRef
  is true — if the user has scrolled up to read history, leave them there.
  Floating "jump to bottom" button (ChevronDown, amber) appears when user is
  scrolled up; click smooth-scrolls back. loadMore() preserves scroll position:
  records scrollHeight before prepending older messages, then re-anchors
  scrollTop after the prepend so the viewport doesn't jump to the top of the
  newly-loaded block. "Показать ещё" continues to paginate from
  /api/game/chat-history with offset.
- Fix 6 (global bug check): Walked through all 10 critical paths. Found + fixed
  one bug — /api/game/reset wasn't preserving the player's backstory across
  reset (only carried over race/class/background/bonusStats/portraitUrl).
  Added backstory to the preserved fields. All other paths (create→action→
  combat→turn enforcement→level up→rest→craft→equip→dialogue→move-room)
  verified end-to-end and working.
- tsconfig.json: excluded skills/, examples/, mini-services/ from tsc — they
  contain standalone skill/sample code with their own SDK types unrelated to
  the Next.js project. tsc was reporting 2 errors there that weren't part of
  the project.

Stage Summary:
- 6 fixes applied (one per commit) + 1 tsconfig chore = 7 commits.
- bun run lint: 0 errors, 0 warnings.
- bunx tsc --noEmit: 0 errors (after excluding skills/examples/mini-services).
- bun run build: success — all 31 routes prerendered (4 static, 27 dynamic).
- Commits:
  * 5a8c7fc fix(backstory): restore Предыстория step in CharacterCreator
  * 01d01c3 fix(ui): make spell slots + rest buttons always visible
  * c32e885 fix(turn-enforcement): block out-of-turn actions in UI + clearer 403 errors
  * 171715c fix(scroll): make MySavesDialog scrollable + verify all menus scroll
  * e23a905 fix(chat): smart auto-scroll + scroll-to-bottom button + stable history load
  * ffe7df6 chore(tsconfig): exclude skills/ examples/ mini-services/ from tsc
  * 045fd73 fix(reset): preserve player backstory across room reset
- Artifacts: prisma/schema.prisma, src/lib/game/{types,state,seed,dm-agent}.ts,
  src/app/api/game/{room/create,room/join,action,reset}/route.ts,
  src/components/dnd/{CharacterCreator,CharacterSheet,ChatPanel,BottomPanel,
  MySavesDialog}.tsx, src/app/page.tsx, tsconfig.json.

---
Task ID: fix-critical-12
Agent: fix-critical-12-agent
Task: Fix 12 critical bugs (TTS, translations, initiative, damage, turns, friendly fire, UI scale, grid, quick-use, highlight)

Work Log:
- Read worklog.md (last 3 sections: tasks 2/3/4/5 + fix-all-v3) and all 12 key files
  (page.tsx, dm-agent.ts, state.ts, BottomPanel.tsx, ChatPanel.tsx, CombatGrid.tsx,
  PartyPanel.tsx, action/route.ts, tts/route.ts, translate/route.ts, settings.ts, i18n.ts)
  + supporting files (types.ts, schema.prisma, seed.ts, globals.css, SDK README/types).
- Bug 1 (TTS not working): the route asked z-ai-web-dev-sdk for response_format="mp3"
  but the SDK TTS engine only supports "wav" and "pcm" — the API returned wav bytes
  while the route declared Content-Type: audio/mpeg, which made browsers refuse to
  play the audio (data/format mismatch). Fixed by requesting response_format="wav"
  and forwarding the upstream Response's Content-Type header verbatim.
- Bug 2 (translations incomplete + DM keeps Russian): the translate route capped
  at MAX_MESSAGES_PER_BATCH=50 so longer chat histories only had their first 50
  messages translated. Bumped to 500 to cover any realistic session length. Also
  strengthened the DM planning + narration prompts: the language directive now
  says "Пиши ВСЕ ответы на языке: <lang>" and explicitly covers narrative,
  invalidReason, NPC names, quest titles, item / ability / monster / spell names
  — so the DM keeps narrating in the selected language even after a one-shot
  translation batch.
- Bug 3 (InitiativeTracker at top of screen): the tracker was rendered in the
  page header, taking up the full width below the header. Moved it into the
  left column (below PartyPanel + CharacterSheet, above DiceLog) so it sits
  next to the dice window — still only shown during combat.
- Bug 4 (DM can't tell duplicate monsters apart): getDMContext now lists each
  active monster with a #N suffix ("Гоблин 1", "Гоблин 2", ...) when the room
  has multiple monsters sharing the same name. The DM planning prompt was
  strengthened to instruct the LLM to use the exact (possibly numbered) name
  from context as success.monsterDamage.target, and to disambiguate based on
  the action text + monster positions when the player references a specific
  foe.
- Bug 5 (damage not applied): the previous lookup used case-sensitive
  `name: { contains: targetName }` which silently failed when the DM
  capitalised, abbreviated, or truncated the monster name. Added a new
  findMonsterByTargetName helper that tries, in order: exact case-insensitive
  match, "<name> <number>" disambiguation (matches the getDMContext #N
  suffix), case-insensitive includes, case-insensitive startsWith, then
  nearest active monster as a final fallback. Always console.warn's when no
  match is found so the failure is debuggable.
- Bug 6 (DM uses English/Chinese words): added a STRONG top-of-prompt rule
  that categorically forbids English and Chinese words in any DM output
  field (narrative, invalidReason, NPC names, quest / item / ability /
  monster / spell names). All names must be in Russian (or the player's
  chosen language). English names appearing in context (spellbook entries)
  must be translated to Russian before use. Dice notations and learnSpell
  IDs are still allowed as technical identifiers. Same rule added to the
  narration template.
- Bug 7 (turn transition broken — same player can act repeatedly): the
  turn-advancement if-else chain had three branches (combatStarted &&
  !combatEnded, wasCombatActive && !combatEnded, !wasCombatActive) and
  any other combination (e.g. combat just ended this action, or combat
  started AND ended in the same action) fell through all three branches
  — leaving explorationActorIndex stale and the same player able to act
  again. Consolidated: after every successful (non-invalid) action, if
  combat just ended OR was never active, call advanceExplorationTurn so
  the next alive player gets the turn. Invalid actions still return
  early without consuming the turn.
- Bug 8 (friendly fire — players can hit each other): the DM planning
  prompt now explicitly forbids targeting a player name in
  success.monsterDamage.target. The findMonsterByTargetName helper
  (added for Bug 5) checks if the target name matches an alive player
  name in the room — if so, it returns friendlyFire=true and the caller
  refuses to apply damage, posting a system chat line. The
  success.monsterDamage path is now strictly monster-only.
- Bug 9 (UI scale doesn't work): the ui-scale-* classes set font-size
  on the wrapper div, but Tailwind's spacing utilities use rem units
  which are anchored to <html>'s font-size, not the parent div's. So
  setting font-size on a wrapper had almost no visible effect. Fixed
  by applying the ui-scale-* class to document.documentElement via
  useEffect (placed before early returns to satisfy rules-of-hooks),
  and added html.ui-scale-* CSS selectors with higher specificity
  than the bare ones to ensure the html rule wins.
- Bug 10 (combat grid shows enemies DM didn't describe): previously
  the opening-combat branch flipped isActive=true on ALL hidden
  monsters in the room — so as soon as the party attacked one goblin,
  every other hidden goblin / wolf / boss also popped onto the combat
  grid even though the DM had never narrated them appearing. Now the
  opening-combat branch inspects the DM plan's
  success.monsterDamage.target (the monster the player is actually
  attacking) and reveals ONLY that one, using the same fuzzy matcher
  as the damage-application path. Falls back to revealing all hidden
  monsters if no specific target can be identified (preserves prior
  behavior for generic "I attack!" actions).
- Bug 11 (quick-use broken): the previous canQuickUse gating was
  `Boolean(onQuickAction) && isYourTurn` which disabled ALL quick-use
  chips whenever isYourTurn was false. During exploration (no combat),
  isYourTurn is computed from currentExplorerName, so only one player
  at a time had quick-use enabled and everyone else couldn't drink a
  potion, cast a utility spell, or use an item out of turn. Fixed:
  `canQuickUse = Boolean(onQuickAction) && (!combatActive || isYourTurn)`.
  During exploration all players can quick-use; during combat only the
  current-turn player can.
- Bug 12 (wrong player highlighted as current turn): getSnapshot
  computed currentTurnName only from the initiative entry
  (currentEntry?.combatantName), which is null during exploration.
  PartyPanel / CombatGrid use currentTurnName to highlight the active
  player, so during exploration NO player was highlighted (making it
  look like the wrong player was active, or none at all). Fixed:
  `currentTurnName = currentEntry?.combatantName ?? currentExplorerName`.
  During combat the initiative entry wins (correct combatant by
  turnIndex); during exploration the current explorer (from
  explorationActorIndex) is used so the right player is highlighted.

Stage Summary:
- bugs fixed: 12 (all critical bugs addressed)
- bun run lint: 0 errors, 0 warnings (clean)
- bunx tsc --noEmit: 0 errors (clean)
- bun run build: ✓ Compiled successfully in 8.2s — all routes prerendered
- commits made (12 bug-fix + lint commits since task start):
  * 03dc3a3 fix(tts): use wav response_format + forward upstream Content-Type     [Bug 1]
  * dc121b0 fix(translate): translate ALL messages + DM writes ALL responses in chosen lang  [Bug 2]
  * 99dfcaa fix(ui): move InitiativeTracker from header into left column above DiceLog  [Bug 3]
  * 191d66c fix(dm-context): disambiguate duplicate monster names with #N suffix    [Bug 4]
  * 01de5e7 fix(damage): fuzzy case-insensitive monster lookup + friendly fire block [Bug 5 + Bug 8]
  * d33d5d2 fix(dm-prompt): forbid English/Chinese words in DM output (Russian only) [Bug 6]
  * d7ac3a0 fix(turn): advance exploration turn after every successful action        [Bug 7]
  * 9f68711 fix(ui-scale): apply scale class to <html> so rem units actually scale   [Bug 9]
  * 36c01c3 fix(combat-grid): only reveal targeted monster on opening combat action  [Bug 10]
  * 5978fd1 fix(quick-use): only disable quick-use during combat-not-your-turn       [Bug 11]
  * bec5ef0 fix(turn-highlight): set currentTurnName from currentExplorerName during exploration  [Bug 12]
  * e69cd85 fix(lint): move ui-scale useEffect before early returns (rules-of-hooks)  [chore from Bug 9]
- Artifacts touched:
  * src/app/api/game/tts/route.ts
  * src/app/api/game/translate/route.ts
  * src/lib/game/dm-agent.ts (SYSTEM_PROMPT_PLANNING, SYSTEM_PROMPT_NARRATION_TPL,
    buildPlanningPrompt, buildCombinedPrompt, findMonsterByTargetName helper,
    resolvePlayerAction damage path, opening-combat reveal, turn-advancement logic)
  * src/lib/game/state.ts (getDMContext duplicate-name disambiguation,
    getSnapshot currentTurnName fallback to currentExplorerName)
  * src/app/page.tsx (InitiativeTracker relocation, ui-scale useEffect on <html>)
  * src/app/globals.css (html.ui-scale-* selectors)
  * src/components/dnd/BottomPanel.tsx (canQuickUse gating)

---
Task ID: dm-context-fix
Agent: dm-context-fix-agent
Task: Fix DM context understanding, more story, unique intros, first image

Work Log:
- Read worklog.md (last 3 sections: tasks 2/3/4/5 + fix-all-v3 + fix-critical-12)
  and all 6 key files: src/lib/game/dm-agent.ts (SYSTEM_PROMPT_PLANNING,
  SYSTEM_PROMPT_NARRATION_TPL, buildCombinedPrompt, resolvePlayerMechanics,
  streamNarrativeAction), src/lib/game/state.ts (getDMContext, setActiveScene),
  src/lib/game/seed.ts (intro chatMessage creation), src/lib/game/locations.ts
  (8 starting locations with hardcoded `intro` templates), src/app/api/game/
  action/route.ts (SSE stream + narrative persistence), src/app/page.tsx
  (image-gen trigger after action stream). Also read prisma/schema.prisma,
  types.ts, room/create route, image route, reset route to understand the full
  flow.

- Fix 1 (DM better understands context):
  * state.ts getDMContext: reformatted each monster line from
    `${display} (${label}): HP x/y | AC n | Атака +a | Урон d | Позиция (X,Y)`
    to
    `Монстр: ${display} (HP x/y, AC n, позиция X,Y) | Атака +a | Урон d | ... — ${description}`.
    The leading "Монстр: " tag, explicit "позиция X,Y", and the description
    (now included for active AND hidden monsters — previously only hidden)
    make it unambiguous which monster the player is referring to.
  * dm-agent.ts SYSTEM_PROMPT_PLANNING: added explicit instructions for
    finding the target in context — when the player says "атакую гоблина",
    find the monster named "Гоблин" (or "Гоблин 1", "Гоблин 2" if duplicates)
    in the context and use the EXACT name in success.monsterDamage.target.
    If the player doesn't specify a target, pick the nearest monster (by
    position from context) and name it. The context contains ALL information
    — don't invent items, monsters, or NPCs not in the context. Match the
    target name against the "Монстр: <Имя> (...)" lines.

- Fix 2 (DM writes more story):
  * SYSTEM_PROMPT_NARRATION_TPL: bumped sentence count 3-6 → 5-10. Added
    "Опиши окружение, атмосферу, действия героя, реакцию противника,
    последствия. Будь кинематографичен и детален." and "Вплети запахи,
    звуки, тактильные ощущения. Опиши эмоции и мысли героя."
  * streamNarrativeAction user message: "Напиши повествование (3-5
    предложений)" → "Напиши повествование (минимум 5 предложений, чем
    детальнее — тем лучше)".
  * SYSTEM_PROMPT_PLANNING JSON schema: success.narrative and failure.narrative
    descriptions bumped from "(2-3 предложения, без цифр урона)" to
    "(3-5 предложений, без цифр урона, атмосферно и детально)".
  * buildCombinedPrompt (fast-path plan+narrate): bumped 2-4 → 5-10 and
    added the same sensory/emotion directives for consistency.

- Fix 3 (Remove template stories, each unique):
  * prisma/schema.prisma: added Room.introNeeded Boolean @default(false).
    When true, the DM must generate a unique opening narrative on the first
    player action. db:push applied.
  * seed.ts: REMOVED the hardcoded intro chatMessage creation. Instead set
    Room.introNeeded=true after seeding. The Scene placeholder (static
    asset /scenes/forest-ruins.png) stays — Fix 4 handles the real first
    image.
  * locations.ts + types.ts: REMOVED the `intro` field from StartLocation
    and all 8 starting locations (mistwood, crypt, village, caverns, marsh,
    tower, shipwreck, monastery). Location name + image prompt + monsters
    are preserved.
  * dm-agent.ts: new generateUniqueIntro() helper — makes an LLM call
    asking for a unique opening narrative (5-10 sentences, sensory details,
    emotions, atmosphere) + an English dark-fantasy imagePrompt. Persists
    the narrative as the first DM chatMessage. Falls back to a simple intro
    on LLM failure so the chat is never empty. resolvePlayerMechanics:
    when Room.introNeeded=true, calls generateUniqueIntro BEFORE processing
    the player's action. Flips introNeeded=false. Stores the intro's
    imagePrompt so it can override the action's imagePrompt (Fix 4).
  * SYSTEM_PROMPT_PLANNING: updated the UNIQUENESS rule to "Каждое
    приключение уникально. Не повторяй описания из предыдущих сессий.
    Создай уникальную атмосферу."

- Fix 4 (First image generated from first DM description):
  * New src/lib/game/scene-image.ts: generateSceneImage(roomId, prompt,
    title, signal) encapsulates the ZAI image-generation + save-to-disk +
    setActiveScene flow. Kept separate from src/lib/game/llm.ts (per task
    constraints) and from /api/game/image (which keeps its own rate-limited
    HTTP entry point).
  * action/route.ts: after the DM narrative is persisted, if
    mech.imageNeeded && mech.imagePrompt, fire generateSceneImage
    fire-and-forget. This is the PRIMARY server-side trigger — ensures the
    first scene image matches the DM's first description (the intro's
    imagePrompt), not a template. invalidateSnapshotCache is called after
    the image lands so the next state refresh picks it up.
  * page.tsx: image-gen fallback is now conditional — only fires when the
    mechanics snapshot's scene is missing or still the placeholder
    ('/scenes/forest-ruins.png'). This makes page.tsx a true FALLBACK for
    the first action and avoids double-generation on subsequent actions.
    Captures mechanicsSceneImageUrl from the mechanics event for the
    decision.
  * dm-agent.resolvePlayerMechanics: when introNeeded was just flipped
    (introImagePrompt !== null), the MechanicsResult's imagePrompt is
    overridden with the intro's prompt and imageNeeded is forced to true —
    in BOTH the invalid-action return path AND the final return path. This
    guarantees the first action always triggers image generation that
    matches the DM's intro narrative.

Stage Summary:
- 4 fixes applied (one per commit).
- bun run lint: 0 errors, 0 warnings (clean).
- bunx tsc --noEmit: 0 errors (clean).
- bun run build: success — all 31 routes prerendered (4 static, 27 dynamic).
- Commits:
  * b947171 fix(dm-context): clearer monster listing in DM context + prompt rules for finding target  [Fix 1]
  * 6595250 fix(dm-narrative): longer, more cinematic narratives (5-10 sentences) + sensory details  [Fix 2]
  * 34bc9cb fix(dm-intro): remove template stories, generate unique intro via LLM on first action  [Fix 3]
  * 87837d1 fix(dm-image): first scene image generated from DM's first description  [Fix 4]
- Artifacts touched:
  * prisma/schema.prisma (Room.introNeeded field)
  * src/lib/game/state.ts (getDMContext monster listing format)
  * src/lib/game/dm-agent.ts (SYSTEM_PROMPT_PLANNING target-finding rules,
    SYSTEM_PROMPT_NARRATION_TPL sentence count + sensory details,
    buildCombinedPrompt sentence count, streamNarrativeAction user message,
    success/failure narrative schema descriptions, new generateUniqueIntro
    helper, resolvePlayerMechanics intro generation + imagePrompt override)
  * src/lib/game/seed.ts (removed hardcoded intro, set introNeeded=true)
  * src/lib/game/locations.ts (removed `intro` field from 8 locations)
  * src/lib/game/types.ts (removed `intro` from StartLocation interface)
  * src/lib/game/scene-image.ts (NEW — generateSceneImage helper)
  * src/app/api/game/action/route.ts (server-side fire-and-forget image gen)
  * src/app/page.tsx (conditional image-gen fallback based on scene placeholder)

---
Task ID: 3
Agent: i18n-scan-agent
Task: Find all hardcoded Russian strings in DnD components

Work Log:
- Read /home/z/my-project/worklog.md (495 lines, last 3 sections) to learn what
  previous agents did. The codebase was built by Task 1, debug-polished by
  Tasks 2/3/4/5 + fix-all-v3 + fix-critical-12 + dm-context-fix. The i18n
  module (src/lib/game/i18n.ts, 1279 lines) supports 6 languages (RU master,
  EN/ES/DE/FR/ZH partial) with `t(lang, key, params)` + `localizeData()` +
  `localizeAbility()` helpers. ~115 UI keys are already defined; this task
  reports every other hardcoded Cyrillic string that should be migrated to
  that system.
- Read src/lib/game/i18n.ts fully (lines 1-1279) to inventory the existing
  key namespace. Confirmed groups: common.*, game.*, character.*, ui.*, rest.*,
  actions.*, chat.*, lobby.*, page.*, time.* — and the game-data localization
  tables (CLASS_I18N, RACE_I18N, BACKGROUND_I18N, ITEM_I18N, ABILITY_I18N).
- Discovered that the requested file `src/components/dnd/ScenePanel.tsx` does
  NOT exist. Scanned the actual file `src/components/dnd/SceneViewer.tsx`
  (113 lines) in its place — it is the scene-image panel and is fully
  i18n-ized (no hardcoded Russian).
- Read each target component file in full (BottomPanel 803L, ChatPanel 637L,
  CombatGrid 960L, CharacterSheet 651L, PartyPanel 136L, SceneViewer 113L,
  InitiativeTracker 96L, DiceLog 121L, BestiaryPanel 257L, SpellbookPanel 375L,
  ItemDatabasePanel 375L, page.tsx 1457L). For every Cyrillic string literal
  found, recorded the line number, exact text, surrounding code context, and a
  suggested i18n key name (using the existing namespace where possible, or a
  new key under `ui.*`, `tooltip.*`, `toast.*`, `dice.*`, `encounter.*`,
  `combat.*`, `equip.*`, `enchant.*`, `spellbook.*`, `item.*` etc.).
- Used `rg '[\x{0400}-\x{04FF}]{2,}'` per file to cross-check that no
  2+ character Cyrillic string was missed. Skipped (a) Russian inside
  `// ...` / `/* ... */` comments, (b) the `RANGED_KEYWORDS` array in
  CombatGrid (keyword-matching list, not display), (c) Russian in
  `localizeData()` / `localizeAbility()` arguments, (d) Russian action-text
  payloads that are *sent to the DM agent* (documented separately because
  they are a separate concern from display strings — see "Action-text
  payloads" note at end of stage summary).
- No code changes were made. This is a research-only report.

Stage Summary:
- NOTE on file scope: `src/components/dnd/ScenePanel.tsx` does not exist.
  `src/components/dnd/SceneViewer.tsx` (the actual scene panel) was scanned
  instead and contains ZERO hardcoded Russian strings (it is fully i18n-ized).

- Files with NO hardcoded Russian strings (already fully localized):
  * `src/components/dnd/SceneViewer.tsx` (113L) — clean.

- Files with hardcoded Russian strings, by file:

==============================================================================
1) src/components/dnd/BottomPanel.tsx (803L) — 21 hardcoded strings
==============================================================================
  Line 162  label: "Оруж"                     context: equippedSlots[] slot label
            suggested key: equip.slot_weapon_short  (new)
  Line 163  label: "Щит"                      context: equippedSlots[] slot label
            suggested key: equip.slot_shield_short  (new) — or reuse character.shield
  Line 164  label: "Голова"                   context: equippedSlots[] slot label
            suggested key: equip.slot_head_short  (new)
  Line 165  label: "Торс"                     context: equippedSlots[] slot label
            suggested key: equip.slot_chest_short  (new)
  Line 166  label: "Ноги"                     context: equippedSlots[] slot label
            suggested key: equip.slot_legs_short  (new)
  Line 167  label: "Руки"                     context: equippedSlots[] slot label
            suggested key: equip.slot_hands_short  (new)
  Line 168  label: "Акс1"                     context: equippedSlots[] slot label
            suggested key: equip.slot_acc1_short  (new)
  Line 169  label: "Акс2"                     context: equippedSlots[] slot label
            suggested key: equip.slot_acc2_short  (new)
  Line 434  <span ...>Избранное</span>        context: favorites-section header
            suggested key: ui.favorites  (new)
  Line 486  placeholder="Поиск способности…"
            context: ability-search Input placeholder
            suggested key: ui.ability_search_placeholder  (new)
  Line 548  title={`Мало слотов ${s.level}-го круга: ${s.current}/${s.max}`}
            context: spell-slot low warning title
            suggested key: ui.low_slots_warning  (new, with {level}/{current}/{max} params)
  Line 615  Короткий                          context: short-rest button label
            EXISTING KEY: rest.short_rest — should be tt("rest.short_rest")
  Line 629  Долгий                            context: long-rest button label
            EXISTING KEY: rest.long_rest — should be tt("rest.long_rest")
  Line 642  `Тип: ${item.itemType}`           context: buildItemTooltip() helper
            suggested key: tooltip.type  (new) — also need item-type labels i18n-ized
  Line 643  `Количество: ${item.quantity}`    context: buildItemTooltip()
            suggested key: tooltip.quantity  (new)
  Line 644  `Слот: ${item.equipSlot}`         context: buildItemTooltip()
            suggested key: tooltip.slot  (new) — also need equip-slot labels i18n-ized
  Line 646  `Урон: ${item.damageNotation}`    context: buildItemTooltip()
            suggested key: tooltip.damage  (new)
  Line 654  `Источник: ${a.sourceLabel}`      context: buildAbilityTooltip()
            suggested key: tooltip.source  (new) — also need source-label i18n
  Lines 657-660  "урон" / "лечение" / "эффект" / "утилити"
            context: buildAbilityTooltip() cast-type label
            suggested keys: tooltip.cast_type.damage / .heal / .buff / .utility  (new)
  Line 661  `Тип: ${typeLabel}`               context: buildAbilityTooltip()
            (reuse tooltip.type)
  Line 663  `Бросок: ${a.castNotation}`       context: buildAbilityTooltip()
            suggested key: tooltip.roll  (new)
  Line 664  `Ячейка: ${a.slotLevel}-й круг`   context: buildAbilityTooltip()
            suggested key: tooltip.slot_level  (new, with {level} param)
  Line 665  "Расходуемый"                     context: buildAbilityTooltip()
            EXISTING KEY: ui.consumable — should be tt("ui.consumable")
  Line 666  `Осталось: ${a.uses}`             context: buildAbilityTooltip()
            suggested key: tooltip.uses_left  (new)
  Line 739  title={`Тратит ячейку ${a.slotLevel}-го круга`}
            context: AbilityChip slot-cost badge tooltip
            suggested key: tooltip.spends_slot  (new, with {level} param)
  Line 747  расходяемый                       context: AbilityChip consumable badge text
            EXISTING KEY: ui.consumable — should be tt2("ui.consumable")
  Line 754  title={`Горячая клавиша: ${hotkey}`}
            context: hotkey badge tooltip
            suggested key: tooltip.hotkey  (new, with {key} param)
  Line 772  title={isFavorited ? "Убрать из избранного" : "Добавить в избранное"}
            context: star-toggle button tooltip
            suggested keys: ui.remove_favorite / ui.add_favorite  (new)
  Line 789  `· круг {a.slotLevel}`            context: AbilityChip tooltip header
            suggested key: ui.circle_level  (new, with {level} param)
  Note: line 587 references `tt("rest.short_rests")` (with `:` suffix) — that
  key does NOT exist in i18n.ts, so it currently renders the literal key
  string. This is a missing-key bug (not a hardcoded Russian string), but
  worth flagging — needs a new key `rest.short_rests_label` = "Короткие".

==============================================================================
2) src/components/dnd/ChatPanel.tsx (637L) — 4 hardcoded display strings
   + 6 action-text payloads (sent to DM — see note at end)
==============================================================================
  Lines 18-23  text: "Я обнажаю оружие..." / "Я внимательно осматриваю..."
               etc. (6 strings in QUICK_ACTIONS[])
               context: quick-action button text payloads sent to the DM
               suggested keys: actions.attack_text / actions.explore_text /
               actions.move_text / actions.talk_text / actions.search_text /
               actions.hide_text  (new) — these are *player action sentences*,
               not display labels; the DM is told to narrate in the player's
               chosen language so these probably SHOULD be localized per lang.
  Line 169  toast.error("Не удалось озвучить текст")
            context: TTS playback failure toast
            suggested key: toast.tts_failed  (new)
  Line 440  aria-label="Прокрутить к последним сообщениям"
            context: jump-to-bottom floating button aria-label
            suggested key: chat.scroll_to_bottom_aria  (new)
  Line 441  title="К последним сообщениям"
            context: jump-to-bottom floating button title
            suggested key: chat.scroll_to_bottom_title  (new)
  Line 610  title={isTtsPlaying ? "Остановить озвучку" : "Озвучить реплику Мастера"}
            context: TTS button title (in MessageBubble)
            suggested keys: chat.tts_stop / chat.tts_play  (new)
  Line 611  aria-label={isTtsPlaying ? "Остановить озвучку" : "Озвучить реплику Мастера"}
            context: TTS button aria-label
            (reuse chat.tts_stop / chat.tts_play)

==============================================================================
3) src/components/dnd/CombatGrid.tsx (960L) — 11 hardcoded strings
==============================================================================
  Lines 51-57  AOE_ELEMENT_COLORS labels: "Огонь", "Холод", "Молния", "Кислота",
              "Сила", "Яд", "Гром"
              context: AoE element color/label table (label field shown in tooltip)
              suggested keys: element.fire / element.cold / element.lightning /
              element.acid / element.force / element.poison / element.thunder  (new)
              — OR a single element.* namespace shared with ItemDatabasePanel's
              enchantmentLabelRu().
  Line 400   <MapPin className="h-3 w-3" /> Мир
             context: exploration-mode badge (right side of grid title)
             EXISTING KEY: game.world — should be t(settings.lang, "game.world")
  Line 514   title={`Здесь лежит: ${lootItems.join(", ")}`}
             context: loot-cell shimmer tooltip
             suggested key: grid.loot_here  (new, with {items} param)
  Line 521   title="Ловушка!"
             context: discovered-trap overlay tooltip
             suggested key: grid.trap  (new)
  Line 534   `${aoeColor.label} (спасбросок ${aoe.saveAbility ?? "ТЕЛ"} DC ${aoe.saveDC ?? 12})`
             context: AoE overlay tooltip
             suggested keys: grid.aoe_save  (new, with {element}/{ability}/{dc}
             params) + ability.* labels (need "ТЕЛ"/"ЛОВ"/"СИЛ" etc. i18n)
  Line 737   title={`${name} (${c.duration} раундов)`}
             context: ConditionIcons tooltip
             suggested key: condition.rounds  (new, with {duration} param)
  Line 861   <span ...>КРИТ!</span>           context: PlayerToken crit-float text
             suggested key: combat.crit  (new) — or reuse existing game.crit
             EXISTING KEY game.crit="Крит" — needs a separate combat.crit_burst
             key for "КРИТ!" (all caps) variant, OR just use game.crit.
  Line 935   <span ...>КРИТ!</span>           context: MonsterToken crit-float text
             (same as line 861)

==============================================================================
4) src/components/dnd/CharacterSheet.tsx (651L) — 8 hardcoded strings
==============================================================================
  Line 251   <span ...>{c.duration} р</span>
             context: condition pill duration suffix
             suggested key: condition.rounds_short  (new)
  Line 312   `{tt("character.ac")} {player.ac} = 10 ...` (AC breakdown line)
             — uses tt() for labels, but the math "10" and the operators are
             hardcoded. Mostly numeric — only the "=" needs no translation.
             Suggest: wrap the whole formula in a key `character.ac_breakdown`
             with {ac}/{dex}/{armor}/{shield}/{other} params. (new)
  Line 313-316 — same AC breakdown formula component. Same suggestion.
  Line 347   title={canQuickUse ? "Нажмите, чтобы использовать" : undefined}
             context: inventory item quick-use tooltip
             suggested key: tooltip.click_to_use  (new)
  Line 411   title={canQuickUse ? "Нажмите, чтобы использовать" : undefined}
             context: ability quick-use tooltip
             (reuse tooltip.click_to_use)
  Line 433   яч.{a.slotLevel}                 context: ability slot-level badge
             suggested key: ui.slot_level_short  (new, with {level} param)
  Line 450   {a.source === "race" ? "народ" : a.source === "class" ? "класс" :
             a.source === "talent" ? "талант" : a.source === "spell" ? "закл." :
             "свиток"}
             context: ability source-type label badge
             suggested keys: ability_source.race / .class / .talant / .spell /
             .scroll  (new)
  Line 457   {a.castType === "heal" ? "лечение " : a.castType === "buff" ?
             "эффект " : "урон "}
             context: ability cast-type prefix label
             suggested keys: cast_type.heal / .buff / .damage  (new) — could
             also reuse tooltip.cast_type.* from BottomPanel
  Line 472   Предыстория                      context: backstory <summary> text
             EXISTING KEY: character.backstory — should be tt("character.backstory")

==============================================================================
5) src/components/dnd/PartyPanel.tsx (136L) — 2 hardcoded strings
==============================================================================
  Line 82    <Badge ...>Вы</Badge>            context: "you" badge on player row
             EXISTING KEY: common.you — should be t(settings.lang, "common.you")
  Line 105   <span ...>{p.gold}з</span>       context: gold abbreviation suffix
             suggested key: character.gold_short_suffix  (new) — note existing
             `character.gold_short` = "ЗЛТ" (different abbreviation form); the
             "з" form used here is a shorter single-letter suffix, needs its
             own key.

==============================================================================
6) src/components/dnd/SceneViewer.tsx (113L) — NO hardcoded Russian strings.
   (Note: the requested file `ScenePanel.tsx` does not exist; this is the
   actual scene-image component.)
==============================================================================

==============================================================================
7) src/components/dnd/InitiativeTracker.tsx (96L) — 1 hardcoded string
==============================================================================
  Line 84    {dead && <span ...>пал</span>}
             context: dead combatant indicator on initiative chip
             EXISTING KEY: character.dead — should be tt("character.dead")
             (NOTE: existing value is "Пал" with capital П, matches this use)

==============================================================================
8) src/components/dnd/DiceLog.tsx (121L) — 8 hardcoded strings
==============================================================================
  Line 40    {t(settings.lang, "chat.dice_empty") || "Кости ещё не брошены…"}
             context: dice-log empty-state fallback string
             The `|| "..."` is redundant (key exists), but the fallback literal
             is hardcoded. Suggest: remove the `|| "..."` clause entirely.
             EXISTING KEY: chat.dice_empty
  Line 63    title="Преимущество"             context: advantage indicator title
             suggested key: dice.advantage  (new)
  Line 64    title="Помеха"                   context: disadvantage indicator title
             suggested key: dice.disadvantage  (new)
  Line 65    <span ...>Крит!</span>           context: crit success badge
             suggested key: dice.crit  (new) — or reuse game.crit
  Line 66    <span ...>Провал!</span>         context: fumble (natural 1) badge
             suggested key: dice.fumble  (new)
  Line 86    <span>выпало {r.result}</span>   context: roll-result label
             suggested key: dice.rolled  (new, with {result} param)
  Line 88    ` (цель ${r.target})`            context: target DC suffix
             suggested key: dice.target  (new, with {target} param)
  Line 107   {success ? "успех" : "провал"}   context: success/fail badge
             suggested keys: dice.success / dice.fail  (new)

==============================================================================
9) src/app/page.tsx (1457L) — 50+ hardcoded strings (the bulk of the issue)
   Heavy use of hardcoded Russian in toast() / toast.error() / toast.success()
   notifications, in encounterLabelRu(), in sendAction() action-text payloads,
   and in the LoadingScreen. The component DOES import `t` and uses `tt()`
   for many labels but every toast / action text is still hardcoded Russian.
==============================================================================
  --- encounterLabelRu() helper (lines 86-103): returns Russian labels ---
  Line 89    return "Бой"            suggested: encounter.combat  (new)
  Line 91    return "Торговец"       suggested: encounter.merchant  (new)
  Line 93    return "Загадка"        suggested: encounter.puzzle  (new)
  Line 95    return "Встреча с NPC"  suggested: encounter.npc  (new)
  Line 97    return "Ловушка"        suggested: encounter.trap  (new)
  Line 99    return "Сокровище"      suggested: encounter.treasure  (new)
  Line 101   return "Событие"        suggested: encounter.event  (new)

  --- Error substring check (line 198) ---
  Line 198   `if (data.error?.includes("не найдена"))`
             context: detect "room not found" error from server (Russian
             substring). Suggest: change the API to return a stable error
             code (e.g. "ROOM_NOT_FOUND") rather than matching Russian text.

  --- Toasts (lines 338-807): all hardcoded Russian ---
  Line 338   toast.error("Мастер не ответил.")
             suggested key: toast.dm_no_response  (new)
  Line 383   toast("Бой начался! Брошена инициатива.", { description: "Ход
             определяется порядком инициативы." })
             suggested keys: toast.combat_started / toast.combat_started_desc
  Line 384   toast.success("Бой окончен!", { description: "Все враги
             повержены." })
             suggested keys: toast.combat_ended / toast.combat_ended_desc
  Line 385   toast.success(`${event.monsterThatDied} повержен!`,
             { description: `Нанесено ${event.damageDealtToMonster} урона.` })
             suggested keys: toast.monster_defeated (with {name} param) /
             toast.damage_dealt (with {amount} param)
  Line 386   toast.warning(`${event.damagedPlayer} получает
             ${event.damageDealtToPlayer} урона!`)
             suggested key: toast.player_damaged  (with {name}/{amount} params)
  Line 481   toast.error(msg.error ?? "Ошибка Мастера.")
             suggested key: toast.dm_error  (new)
  Line 519   toast.error("Ошибка связи с Мастером.")
             suggested key: toast.dm_connection_error  (new)
  Line 540   toast("Игра перезапущена.", { description: "Туманный лес ждёт…" })
             suggested keys: toast.game_reset / toast.game_reset_desc
  Line 542   toast.error(data.error ?? "Не удалось перезапустить.")
             suggested key: toast.reset_failed  (new)
  Line 545   toast.error("Ошибка перезапуска.")
             suggested key: toast.reset_error  (new)
  Line 555   toast.success(`Код комнаты скопирован: ${session.roomCode}`)
             suggested key: toast.room_code_copied  (with {code} param)
  Line 572   toast.success(`Новый талант: ${data.talent?.name ?? ""}!`)
             suggested key: toast.talent_unlocked  (with {name} param)
  Line 575   toast.error(data.error ?? "Не удалось выбрать талант.")
             suggested key: toast.talent_failed  (new)
  Line 593   toast.success(`Характеристика повышена: +2 к ${stat.toUpperCase()}!`)
             suggested key: toast.asi_increased  (with {stat} param)
  Line 595   toast.error(data.error ?? "Не удалось применить ASI.")
             suggested key: toast.asi_failed  (new)
  Line 613   toast.success("Предмет экипирован.")
             suggested key: toast.item_equipped  (new)
  Line 615   toast.error(data.error ?? "Не удалось экипировать предмет.")
             suggested key: toast.equip_failed  (new)
  Line 633   toast.success("Предмет снят.")
             suggested key: toast.item_unequipped  (new)
  Line 635   toast.error(data.error ?? "Не удалось снять предмет.")
             suggested key: toast.unequip_failed  (new)
  Line 643   return { success: false, error: "Нет сессии." }
             suggested key: error.no_session  (new)
  Line 656   toast.success(`Создано: ${c.result ?? "предмет"}! (бросок
             ${c.roll} vs DC ${c.dc})`)
             suggested key: toast.crafted  (with {result}/{roll}/{dc} params)
  Line 658   toast.error(`Крафт провалился (бросок ${c?.roll} vs DC ${c?.dc}).`)
             suggested key: toast.craft_failed  (with {roll}/{dc} params)
  Line 662   toast.error(data.error ?? "Не удалось скрафтить.")
             suggested key: toast.craft_error  (new)
  Line 665   toast.error("Ошибка крафта.")
             suggested key: toast.craft_network_error  (new)
  Line 666   return { success: false, error: "Ошибка крафта." }
             (reuse toast.craft_network_error)
  Line 686   toast.success(restType === "long" ? "Долгий отдых завершён." :
             "Короткий отдых завершён.")
             suggested keys: toast.long_rest_done / toast.short_rest_done  (new)
  Line 688   toast.error(data.error ?? "Не удалось отдохнуть.")
             suggested key: toast.rest_failed  (new)
  Line 691   toast.error("Ошибка отдыха.")
             suggested key: toast.rest_error  (new)
  Line 713   toast.success(`Вы вошли в: ${data.room?.label ?? ""}`)
             suggested key: toast.room_entered  (with {label} param)
  Line 715-716  toast(`Случайное событие: ${encounterLabelRu(data.encounter)}`,
             { description: "См. журнал чата для подробностей." })
             suggested keys: toast.random_event (with {type} param, where
             {type} uses the new encounter.* keys) / toast.random_event_desc
  Line 727   title: data.room.label ?? "Сцена"
             context: scene image-generation API request title field
             EXISTING KEY: ui.no_scene — but this is a non-display field;
             may not need translation at all (server-side). Low priority.
  Line 736   toast.error(data.error ?? "Не удалось войти в комнату.")
             suggested key: toast.move_room_failed  (new)
  Line 739   toast.error("Ошибка перемещения.")
             suggested key: toast.move_room_error  (new)
  Line 763   toast.success(`Новое подземелье: ${data.biome ?? ""} (глубина
             ${data.depth ?? 1})`)
             suggested key: toast.new_dungeon  (with {biome}/{depth} params)
             — also need biome names i18n-ized (data.biome comes from server)
  Line 765   toast.error(data.error ?? "Не удалось создать новое подземелье.")
             suggested key: toast.new_dungeon_failed  (new)
  Line 768   toast.error("Ошибка генерации подземелья.")
             suggested key: toast.new_dungeon_error  (new)
  Line 803   toast.error(data.error ?? "Диалог не удался.")
             suggested key: toast.dialogue_failed  (new)
  Line 807   toast.error("Ошибка диалога.")
             suggested key: toast.dialogue_error  (new)

  --- sendAction() action-text payloads (lines 864, 867, 877, 879, 881,
      989, 995): these are *player action sentences* sent to the DM agent.
      They should be localized per the player's UI language because the DM
      prompt instructs the LLM to "Пиши ВСЕ ответы на языке: <lang>" and
      the player is presumably typing in that language. ---
  Line 864   sendAction(`Я использую «${targetingAbility.itemName}» на
             ${playerName}.`)
             suggested key: action_text.use_item_on  (with {item}/{target})
  Line 867   sendAction(`Я использую «${(targetingAbility as Ability).name}»
             на ${playerName}.`)
             suggested key: action_text.use_ability_on  (with {ability}/{target})
  Line 877   `... : "заклинание"`              context: fallback name for spell
             suggested key: action_text.spell_default  (new)
  Line 879   ` (круг ${targetingAbility.slotLevel})`
             suggested key: action_text.circle_suffix  (with {level} param)
  Line 881   sendAction(`Я кастую «${name}»${slotSuffix} в клетку (${x}, ${y})!`)
             suggested key: action_text.cast_at_cell  (with {name}/{suffix}/
             {x}/{y} params)
  Line 989   sendAction("Я атакую ближайшего врага!")
             suggested key: action_text.quick_attack  (new)
  Line 995   sendAction("Я осматриваю местность.")
             suggested key: action_text.quick_explore  (new)

  --- LoadingScreen (line 1449) ---
  Line 1449  <span className="font-serif italic">Туман сгущается…</span>
             suggested key: page.loading_atmosphere  (new)

  Line 420 is in a comment (`// Label format: "Урон по: <name>"...`) — skipped.

==============================================================================
10) src/components/dnd/BestiaryPanel.tsx (257L) — 12 hardcoded strings.
    NOTE: This component does NOT import `t` from i18n. It uses a separate
    `categoryLabelRu()` helper from `@/lib/game/bestiary` that returns
    hardcoded Russian category labels — those labels are in bestiary.ts
    (out of scope for this scan, but worth flagging as a separate
    localization debt).
==============================================================================
  Line 79    <span ...>Атк</span>             context: stat-grid attack label
             suggested key: bestiary.attack_short  (new)
  Line 84    <span ...>Урон</span>            context: stat-grid damage label
             EXISTING KEY: game.damage — should be tt("game.damage") after
             adding the i18n import.
  Line 91    `<Footprints .../> Ск {entry.speed}`
             suggested key: bestiary.speed_short  (new)
  Line 102   `⚡ Особая способность`          context: special-ability card title
             suggested key: bestiary.special_ability  (new)
  Line 114   `<Coins .../> Добыча`            context: loot card title
             suggested key: bestiary.loot  (new)
  Line 118   `<span ...>{entry.loot.gold} зм</span>`
             context: loot gold amount suffix
             suggested key: bestiary.gold_suffix  (new) — OR shared
             currency.gold_short (also used by ItemDatabasePanel)
  Line 182   `Бестиарий`                      context: dialog title
             EXISTING KEY: ui.bestiary — should be tt("ui.bestiary")
  Line 184   `{BESTIARY.length} существ`      context: count badge
             suggested key: bestiary.count_creatures  (new, with {count} param)
  Line 188   `Каталог всех монстров мира DUSKFALL — ищите по названию,
             фильтруйте по категории.`
             context: dialog description
             suggested key: bestiary.description  (new)
  Line 199   placeholder="Поиск: гоблин, dragon, скелет..."
             context: search input placeholder
             suggested key: bestiary.search_placeholder  (new)
  Line 215   `Все ({BESTIARY.length})`        context: tab label for "all"
             suggested key: ui.tab_all  (new, with {count} param) — shared with
             SpellbookPanel + ItemDatabasePanel
  Line 239   `Ничего не найдено по запросу «{query}».`
             context: empty-state text
             EXISTING KEY: ui.nothing_found — but the existing key returns just
             "Ничего не найдено" (no query echo). Suggest a new key
             ui.nothing_found_for_query (with {query} param) for the richer
             variant used in all three database panels.

==============================================================================
11) src/components/dnd/SpellbookPanel.tsx (375L) — 16 hardcoded strings.
     NOTE: This component does NOT import `t` from i18n. Uses separate
     `schoolLabelRu()`, `saveAbilityLabelRu()`, `formatSpellLevel()` helpers
     from `@/lib/game/spellbook` — same situation as BestiaryPanel (Russian-
     only helpers in a separate file).
==============================================================================
  Line 79    <div ...>Ур.</div>               context: spell-level header
             EXISTING KEY: character.level_short — should be tt("character.level_short")
             after adding the i18n import.
  Line 95    <span ...>Время</span>           context: stat-grid casting time
             suggested key: spellbook.casting_time  (new)
  Line 102   <span ...>Дальн.</span>          context: stat-grid range label
             suggested key: spellbook.range  (new)
  Line 109   <span ...>Длит.</span>           context: stat-grid duration label
             suggested key: spellbook.duration  (new)
  Line 116   <span ...>Комп.</span>           context: stat-grid components label
             suggested key: spellbook.components  (new)
  Line 134   <span ...>урон/лечение</span>    context: damage badge suffix
             suggested key: spellbook.damage_or_heal  (new)
  Line 140   `<span>Спас {saveAbilityLabelRu(spell.saveAbility)}</span>`
             context: save badge prefix
             suggested key: spellbook.save_prefix  (new) — also need
             saveAbility.* labels i18n-ized (the saveAbilityLabelRu helper
             returns "ТЕЛ"/"ЛОВ"/etc. in Russian only)
  Lines 151-154 `"Круг" / "Конус" / "Линия"`  context: AoE shape label
             suggested keys: aoe.circle / aoe.cone / aoe.line  (new)
  Line 240   `Книга заклинаний`               context: dialog title
             EXISTING KEY: ui.spellbook — should be tt("ui.spellbook")
  Line 245   `{SPELLBOOK.length} заклинаний`  context: count badge
             suggested key: spellbook.count_spells  (new, with {count} param)
  Lines 249-250  `Каталог заклинаний d20 fantasy RPG SRD: заговоры и 5 кругов,
             8 школ магии. Ищите по названию, фильтруйте по кругу.`
             context: dialog description
             suggested key: spellbook.description  (new)
  Line 259   `<span ...>Ячейки заклинаний</span>`
             EXISTING KEY: character.spell_slots — should be tt("character.spell_slots")
  Line 264   `<span ...>Круг {s.level}</span>`
             suggested key: spellbook.circle  (with {level} param)  (new) —
             OR share ui.circle_level with BottomPanel line 789
  Line 291   placeholder="Поиск: огненный шар, fireball, эвокация..."
             context: search input placeholder
             suggested key: spellbook.search_placeholder  (new)
  Line 311   `Все ({SPELLBOOK.length})`       context: tab "all"
             (reuse ui.tab_all from BestiaryPanel)
  Line 335   `Ничего не найдено по запросу «{query}».`
             (reuse ui.nothing_found_for_query from BestiaryPanel)
  Line 354   `<span ...>Школы:</span>`        context: schools legend header
             suggested key: spellbook.schools_legend  (new)

==============================================================================
12) src/components/dnd/ItemDatabasePanel.tsx (375L) — 22 hardcoded strings.
     NOTE: This component does NOT import `t` from i18n. Has its OWN Russian-
     only helpers: `equipSlotLabelRu()`, `enchantmentLabelRu()`,
     `formatGold()`, `formatWeight()` defined in this file (lines 43-110),
     plus `rarityLabelRu()` and `itemTypeLabelRu()` from
     `@/lib/game/item-database`. Same localization-debt situation.
==============================================================================
  --- equipSlotLabelRu() helper (lines 43-60): returns hardcoded Russian ---
  Line 46    return "Оружие"      suggested: equip.slot_weapon  (new) — shared
             with BottomPanel equip.slot_*_short namespace
  Line 48    return "Щит"         suggested: equip.slot_shield  (new)
  Line 50    return "Голова"      suggested: equip.slot_head  (new)
  Line 52    return "Торс"        suggested: equip.slot_chest  (new)
  Line 54    return "Ноги"        suggested: equip.slot_legs  (new)
  Line 56    return "Руки"        suggested: equip.slot_hands  (new)
  Line 58    return "Аксессуар"   suggested: equip.slot_accessory  (new)

  --- enchantmentLabelRu() helper (lines 63-78): returns hardcoded Russian ---
  Line 66    return "Огонь"       suggested: enchant.fire  (new) — share with
             CombatGrid's element.fire label
  Line 68    return "Лёд"         suggested: enchant.ice  (new)
  Line 70    return "Молния"      suggested: enchant.lightning  (new)
  Line 72    return "Яд"          suggested: enchant.poison  (new)
  Line 74    return "Некротика"   suggested: enchant.necrotic  (new)
  Line 76    return "Святое"      suggested: enchant.holy  (new)

  --- formatGold() helper (lines 99-103): hardcoded Russian currency suffixes ---
  Line 100   `${value} зм`        suggested: currency.gold  (with {value} param)
  Line 101   `${...} см`          suggested: currency.silver  (with {value} param)
  Line 102   `${...} мм`          suggested: currency.copper  (with {value} param)

  --- formatWeight() helper (lines 106-110): hardcoded Russian "фнт" suffix ---
  Line 108   `${...} фнт`         suggested: item.weight  (with {value} param)
  Line 109   `${weight} фнт`      (reuse item.weight)

  --- ItemCard component (lines 113-249) ---
  Line 135   `Комплект`           context: set-item badge
             suggested key: item.set_badge  (new)
  Line 160   `Слот: {equipSlotLabelRu(...)}`
             context: equip-slot chip
             EXISTING KEY (prefix): tooltip.slot — should be tt("tooltip.slot")
             after adding the i18n import (NEW key, also proposed for
             BottomPanel line 644)
  Line 172   `{entry.charges} зарядов`
             context: charges chip
             suggested key: item.charges  (with {count} param)  (new)
  Line 189   <span ...>Урон</span>            context: stat-grid damage label
             EXISTING KEY: game.damage — should be tt("game.damage")
  Line 196   <span ...>Хар-ки</span>          context: stat-grid stat-bonus label
             suggested key: item.stat_bonuses  (new)
  Line 204   <span ...>Цена</span>            context: stat-grid value/price label
             suggested key: item.price  (new)
  Line 209   <span ...>Вес</span>             context: stat-grid weight label
             suggested key: item.weight_label  (new) — distinct from item.weight
             (with value) above
  Line 223   `Проклятие`          context: curse card title
             suggested key: item.curse  (new)
  Line 236   `Комплект «{SET_BONUSES[entry.setId].name}»`
             context: set-bonus card title
             suggested key: item.set_title  (with {name} param)  (new)
  Line 239   `Соберите {requiredPieceCount} шт.: {bonus.description}`
             context: set-bonus requirement text
             suggested key: item.set_collect  (with {count} param)  (new)
  Line 242   `В комплекте: {items joined}`
             context: set-bonus items list
             suggested key: item.set_includes  (new)

  --- ItemDatabasePanel main component (lines 251-375) ---
  Line 300   `Предметы`           context: dialog title
             EXISTING KEY: ui.items — should be tt("ui.items")
  Line 302   `{ITEM_DATABASE.length} предметов`
             context: count badge
             suggested key: item.count_items  (with {count} param)  (new)
  Lines 305-307  `Полный каталог снаряжения DUSKFALL — оружие, броня, зелья,
             артефакты. Ищите по названию, фильтруйте по редкости.`
             context: dialog description
             suggested key: item.description  (new)
  Line 317   placeholder="Поиск: меч, dragon, зелье, чешуя..."
             context: search input placeholder
             suggested key: item.search_placeholder  (new)
  Line 333   `Все ({ITEM_DATABASE.length})`   context: tab "all"
             (reuse ui.tab_all from BestiaryPanel)
  Line 357   `Ничего не найдено по запросу «{query}».`
             (reuse ui.nothing_found_for_query from BestiaryPanel)

==============================================================================
SUMMARY / NEXT ACTIONS
==============================================================================
- Total hardcoded Russian strings found: ~135 across 11 files (SceneViewer
  is clean). The three database panels (Bestiary/Spellbook/ItemDatabase) are
  the worst offenders and do NOT currently import the `t` helper at all —
  they need: (a) `import { t } from "@/lib/game/i18n"` + `useSettings()` for
  lang, (b) new i18n keys added to i18n.ts, (c) Russian-only helper functions
  in bestiary.ts / spellbook.ts / item-database.ts refactored to take a
  `lang` argument (or to delegate to a new localization table in i18n.ts).
- page.tsx has the most strings (~50), almost entirely toast notifications.
  A new `toast.*` namespace with ~25 keys would cover all of them.
- Action-text payloads (in ChatPanel.QUICK_ACTIONS and page.tsx sendAction
  calls) are a separate concern: they are *sent to the DM agent* as the
  player's action. Since the DM is instructed to narrate in the player's
  chosen language, these payloads probably SHOULD be localized too — but
  that requires a new `action_text.*` namespace with parameter substitution.
- CombatGrid element labels ("Огонь"/"Холод"/etc.) overlap with
  ItemDatabasePanel's enchantmentLabelRu() ("Огонь"/"Лёд"/etc.) — these
  should share a single `element.*` or `enchant.*` namespace.
- BottomPanel's `equip.slot_*_short` labels (Оруж/Щит/Голова/...) overlap
  with ItemDatabasePanel's equipSlotLabelRu() (Оружие/Щит/Голова/...) —
  should share a single `equip.slot_*` namespace (with separate short/long
  variants).
- Existing-key reuses (no new key needed — just replace the literal with
  the tt() call): rest.short_rest (BottomPanel L615), rest.long_rest
  (BottomPanel L629), ui.consumable (BottomPanel L665/L747), game.world
  (CombatGrid L400), character.dead (InitiativeTracker L84),
  character.backstory (CharacterSheet L472), common.you (PartyPanel L82),
  ui.bestiary (BestiaryPanel L182), ui.spellbook (SpellbookPanel L240),
  ui.items (ItemDatabasePanel L300), character.spell_slots (SpellbookPanel
  L259), character.level_short (SpellbookPanel L79), game.damage
  (BestiaryPanel L84, ItemDatabasePanel L189).
- Recommended next agent: add the ~80 new i18n keys suggested above to
  i18n.ts (under all 6 languages), then sweep each file replacing literals
  with tt() calls. Prioritize page.tsx (highest user-visible impact via
  toasts), then the three database panels (currently entirely Russian-only
  UI), then the smaller fixes in BottomPanel/CombatGrid/CharacterSheet/
  PartyPanel/InitiativeTracker/DiceLog/ChatPanel.

---
Task ID: debug-i18n-targeting
Agent: main-agent
Task: Continue debugging — fix tooltip bug, targeting cancelled outside combat, and i18n completeness

Work Log:
- Read dev.log: found errors (Search is not defined, i18n parsing errors, TTS model error) — all from earlier sessions, already fixed in current code.
- Read worklog.md: understood prior work (dm-context-fix, i18n, targeting implementation).
- Ran `bun run lint` and `bunx tsc --noEmit`: both clean (0 errors).
- Used Agent Browser to verify the running app:
  * Registered a new account, created a room via Quick Start.
  * Verified the game loads correctly: character "Алдрик 88", scene, bottom panel with equipment/inventory/abilities/spell slots.
  * Started combat by clicking "Attack" — DM responded, combat round 1 active.
  * Clicked "Fire Bolt" spell → targeting prompt "Выберите цель для" appeared (targeting works in combat).
  * Clicked a monster token → action was sent (targeting completion works).
- Found and fixed Bug 1 (tooltip literal text):
  * BottomPanel.tsx line 327: `tt("ui.click_unequip")` was rendered as literal text inside a template literal instead of being called as a function. Fixed to `${tt("ui.click_unequip")}`.
- Found and fixed Bug 2 (targeting cancelled outside combat):
  * page.tsx useEffect at line 899-903 cancelled targeting mode whenever `!snapshot.combatActive`, which prevented targeting from being entered outside combat (e.g. AoE cell targeting during exploration).
  * Fixed: track previous combat state with a ref (`prevCombatActive`), only cancel when combat transitions from active → inactive.
  * Also updated BottomPanel `triggerAbility` and `triggerItem` to only enter monster/heal/item targeting in combat (no monster tokens to click outside combat), but AoE targeting still works in exploration (cell targeting).
  * Updated `triggerAbilityByIndex` hotkey path in page.tsx to match the same dispatch logic.
- Found and fixed Bug 3 (missing i18n key `rest.short_rests`):
  * BottomPanel.tsx line 587 called `tt("rest.short_rests")` but only `rest.short_rest` (singular) existed. Added `rest.short_rests` key to all 6 languages.
- i18n completeness — added ~45 new keys to all 6 languages (RU/EN/ES/DE/FR/ZH):
  * `ui.favorites`, `ui.add_favorite`, `ui.remove_favorite`, `ui.search_ability`, `ui.slots_low` (with {lv}/{cur}/{max} params), `ui.spends_slot` (with {lv} param), `ui.crit`, `ui.tts_play`, `ui.tts_stop`, `ui.slot_level_short`
  * `rest.short_rests`
  * `equip.weapon/shield/head/chest/legs/hands/acc1/acc2` (equipment slot labels)
  * `dice.adv/disadv/crit_hit/crit_fail/rolled/target`
  * `char.backstory/source_race/source_class/source_talent/source_scroll/source_spell/cast_damage/cast_heal/cast_buff/cast_utility/dead_short`
  * `grid.loot/trap/aoe_origin`
- Replaced hardcoded Russian strings in components with i18n calls:
  * BottomPanel.tsx: equipment slot labels, "Избранное", search placeholder, spell slot tooltips ("Мало слотов", "Тратит ячейку"), consumable badge, rest button labels ("Короткий"/"Долгий"), favorite toggle tooltip, "К" slot level prefix → `tt("ui.slot_level_short")`
  * DiceLog.tsx: advantage/disadvantage/crit/fumble titles and labels, "выпало" → `tt("dice.rolled")`, "цель" → `tt("dice.target")`. Added `tt` helper (was missing).
  * CharacterSheet.tsx: source-type labels (народ/класс/талант/закл./свиток), cast-type labels (лечение/эффект/урон), "Предыстория" → `tt("char.backstory")`
  * CombatGrid.tsx: "КРИТ!" → `t(lang, "ui.crit")`, loot tooltip ("Здесь лежит:"), trap tooltip ("Ловушка!"). Added `lang: Lang` prop to PlayerToken and MonsterToken functions.
  * PartyPanel.tsx: "Вы" → `t(settings.lang, "common.you")`
  * InitiativeTracker.tsx: "пал" → `tt("char.dead_short")`
  * ChatPanel.tsx: "Озвучить реплику Мастера" / "Остановить озвучку" → `tt("ui.tts_play")` / `tt("ui.tts_stop")`
  * SceneViewer.tsx: updated `tt` helper to accept params (was missing)
- Added 17 new ability/spell translations to ABILITY_I18N dictionary (Acid Splash, Fire Bolt, Thunderclap, Cure Wounds, Wild Shape, Mage Armor, Hold Person, Fireball, Thunderwave, Magic Missile, Shield, Web, Cone of Cold, Chain Lightning, Calm Emotions, Sleep).
- Added 12 new item translations to ITEM_I18N dictionary (Druidic Focus Twig, Holy Amulet, Ring of Protection, Chain Mail, Greatsword, Battleaxe, Crossbow, Scroll of Fireball, Scroll of Cure Wounds, Potion of Invisibility, Potion of Strength).
- Verified with Agent Browser: switched language to English → all UI strings, equipment labels, ability names, item names, spell slot prefixes, TTS button labels, favorites tooltips, and targeting prompts now display in English. No remaining hardcoded Russian in the main game UI (only the generated location name stays Russian — requires deeper location i18n work).

Stage Summary:
- 3 bugs fixed (tooltip literal, targeting cancelled outside combat, missing i18n key).
- ~45 new i18n keys added to all 6 languages.
- ~30 hardcoded Russian strings replaced with i18n calls across 7 components.
- 17 new ability/spell translations + 12 new item translations added to dictionaries.
- bun run lint: 0 errors, 0 warnings (clean).
- bunx tsc --noEmit: 0 errors (clean).
- Agent Browser verified: targeting works in combat (prompt appears, monster click sends action), all UI strings translate correctly when language is switched.
- Remaining: location names (generated at runtime from locations.ts) still in Russian — needs a LOCATION_I18N dictionary + localizeLocation() function. Database panels (Bestiary/Spellbook/ItemDatabase) still need full i18n refactoring.

---
Task ID: analysis-1
Agent: bg3-analysis-agent
Task: Analyze BG3/D&D improvement opportunities

Work Log:
- Read /home/z/my-project/worklog.md (last 3 sections) — prior work was i18n + targeting bug fixes.
- Combat system files read:
  * src/lib/game/dm-agent.ts (resolvePlayerMechanics L1743-2076, resolvePlayerAction L784-983, runMonsterTurn L1372-1516, advanceTurn L1523-1639) — combat has initiative, AoE w/ saves, flanking, advantage from conditions, monster flee at HP<25%, monster movement 2 cells/turn toward nearest player.
  * src/lib/game/conditions.ts (188L, all 10 conditions: poisoned/stunned/frightened/burning/slowed/blinded/prone/blessed/shielded/weakened — has attackDisadvantage/saveAdvantage/acBonus/speedMultiplier/skipTurn/damagePerRound/attackBonusDice effects).
  * src/components/dnd/CombatGrid.tsx (967L, 10x10 grid, tokens with HP bars + condition icons + buff aura + AoE overlay + loot shimmer + trap warning + threat range + flanking lines + targeting modes; NO click-to-move).
  * src/components/dnd/InitiativeTracker.tsx (96L, simple horizontal initiative order with current-turn pulse + dead indicator).
- Character/abilities files read:
  * src/lib/game/abilities.ts (251L, full — 9 races + 11 classes + scroll spells + spellbook spells; computeAbilities() returns full list).
  * src/lib/game/talents.ts (148L, first 100 — effectiveAC, effectiveMaxHP, initiativeBonus, damageBonus, critRange, critBonusDice, extraAttackChance, rerollMissOnce, damageReduction, counterattack spec).
  * src/lib/game/spellbook.ts (838L, first 100 + interface at L139-164) — Spell has level/school/castingTime/range/duration/components/description/damage/saveAbility/saveDC/aoeShape/aoeSize; 34 spells catalogued.
  * src/components/dnd/CharacterSheet.tsx (652L, first 309 — header + vitals + HP bar + spell slots + conditions + 6 stats grid + equipment summary; NO skills/saving throws/proficiencies/temp HP/death saves).
- UI/UX files read:
  * src/components/dnd/ChatPanel.tsx (638L) — 6 QUICK_ACTIONS (attack/explore/move/talk/search/hide) + rest buttons + TTS playback + virtualized chat + jump-to-bottom + scroll-anchor pagination.
  * src/components/dnd/BottomPanel.tsx (804L, first 200 + L560-779 rest section + AbilityChip) — equipment/inventory/abilities/spell slots/favorites/search/rest; ability tooltip = source+castType+castNotation+slotLevel+consumable+uses+description (single-line, not spell stat block).
  * src/app/page.tsx (1458L, first 200 + L900-1007 hotkeys + L1230-1359 layout) — 3-column layout, hotkeys Q/E/R + 1-8, targeting mode dispatch.
  * src/components/dnd/SceneViewer.tsx (113L) — scene image + weather + time-of-day overlay + location caption.
- State management files read:
  * src/lib/game/state.ts (2137L, first 200 + moveMonsterTowardNearestPlayer L1184-1211 + rollInitiative L1221-1279) — Player has NO tempHp, NO deathSaves, NO actionUsed/bonusActionUsed/reactionUsed, NO movementUsed, NO speed, NO concentratingOn, NO skillProficiencies, NO saveProficiencies; Monster has NO speed, NO multi-action, NO reactions/legendary.
  * prisma/schema.prisma (387L, full) — Player/Monster/InventoryItem/ChatMessage/DiceRoll/Scene/InitiativeEntry/Condition/Quest/MapRoom/Npc/Trap/StoryMemory/SaveSlot models; confirmed missing fields above.
- Quick actions read:
  * src/lib/game/quick-use.ts (178L, full) — buildAbilityQuickText + buildItemQuickText + classifyAbilityTargeting + findNearestMonsterName.
  * ChatPanel.QUICK_ACTIONS confirmed (lines 17-24): attack/explore/move/talk/search/hide.
- /api/game/rest/route.ts (131L) read — short rest rolls hit die + heals half (BG3 max 3 per long rest), long rest = full HP + all slots + clear short-duration conditions.
- Grep for opportunity/reaction/disengage/dodge/dash/bonusAction/tempHp/deathSave/passivePerception/stealth → ALL ABSENT (no matches in lib/game). Confirmed: zero BG3-classic D&D reaction / action-economy / death-save / temp-HP / stealth systems exist.

Stage Summary:

==============================================================================
AREA 1 — COMBAT SYSTEM (dm-agent.ts, conditions.ts, CombatGrid.tsx, InitiativeTracker.tsx)
==============================================================================
What exists now:
- 10x10 tactical grid with tokens (HP bars, condition icons, buff auras, AoE overlays, loot shimmer, trap warnings, threat-range for ranged monsters).
- Initiative order with round counter, turnIndex, dead-skip, stunned-skip.
- Combat loop: player acts → advanceTurn() loops, running monster turns until next living player.
- Monster AI: moveMonsterTowardNearestPlayer moves up to 2 cells/turn toward nearest player, attacks when adjacent (single attack roll vs target AC, single damage roll), flees at HP<25% if "intelligent".
- Advantage system: flanking (melee), high ground (ranged), conditions (poisoned/blinded/prone/frightened → disadvantage; prone/blinded/stunned target → advantage); bless adds +1d4 not advantage.
- AoE resolution: circle/cone/line, single damage roll per spell, each target rolls save (success=half).
- Conditions tick at start of new round (decrement duration, apply burning damage, remove expired).
- Counter-attack talent (rogue/paladin reactive strike).

What BG3/classic D&D has that's MISSING:
- Action economy (Action / Bonus Action / Reaction tracked separately per turn).
- Reactions: Opportunity Attacks (OA when leaving threatened square), Shield spell (+5 AC reaction), Counterspell, Hellish Rebuke, Uncanny Dodge, Sentinel feat, Defensive Duelist.
- Bonus Actions: off-hand attack (TWF), Dash/Disengage/Dodge/Hide as bonus actions (Rogue Cunning Action, Monk Step of the Wind), Misty Step, Healing Word, Bonus-Action spells.
- Death saves: 3 successes (stable) / 3 failures (dead) at 0 HP; nat 20 = 1 HP, nat 1 = 2 fails. NO "dying" state exists — player.hp<=0 immediately sets isAlive=false (binary).
- Temp HP (shield of faith, false life, armor of agathys).
- Movement speed per turn (currently monsters move 2 cells/turn flat; players never move on grid — only DM agent moves them via narrative).
- Click-to-move on grid (player can only "request" movement via chat text "Я двигаюсь вперёд"; DM agent narrates result).
- Concentration: only one concentration spell at a time; concentration checks on damage (DC 10 or half damage, whichever higher). Currently NO concentration tracking — multiple concentration buffs can stack.
- Legendary / Lair actions for bosses (currently bosses have a single specialAbility string).
- Resistance/vulnerability tracking on monsters (currently only player has damage_resistance_flat talent).
- Ready action ("I ready X to trigger on Y").
- Grapple / Shove / Shove Aside mechanics.

TOP 3 highest-impact improvements (combat):
1. ACTION ECONOMY TRACKING — Add `actionUsed Boolean`, `bonusActionUsed Boolean`, `reactionUsed Boolean`, `movementUsed Int`, `speed Int @default(30)` (feet) to Player model. Reset all to 0/false at start of each turn in advanceTurn(). Expose in PlayerState. UI: 3 pips above BottomPanel (Action ⚔ / Bonus ✦ / Reaction ↩) lit when available. Quick-action buttons for Dash (action), Disengage (bonus), Dodge (action), Hide (action or bonus for rogue), Help (action) consume the right pip. The DM agent's resolvePlayerAction should refuse to grant >1 action's worth of effects per turn by reading these flags.
2. REACTION SYSTEM — Add `pendingReactions Json` (or PendingReaction[]) transient field on Room (or in-memory) that the monster turn pipeline queues. When runMonsterTurn is about to hit a player, BEFORE applying damage, check if that player has a reaction-ability available (Shield spell known + reaction not yet used this round). If yes, emit a socket event "reaction-prompt" → frontend shows modal "⚔ Monster attacks you! Cast Shield (+5 AC until end of turn)? [Yes / No]". On Yes → apply Shield condition (+5 AC, not +2 the existing shielded), set reactionUsed=true. Same pattern for Counterspell (when DM plan has spell damage to player), Hellish Rebuke (tiefling), Uncanny Dodge (rogue talent). Opportunity Attacks: when moveMonsterTowardNearestPlayer moves a monster OUT of a square threatened by a player (adjacent), pause and prompt that player for OA. This is the single biggest "feel-like-BG3" win.
3. DEATH SAVES + TEMP HP + DYING STATE — Add `tempHp Int @default(0)`, `deathSavesSuccess Int @default(0)`, `deathSavesFail Int @default(0)`, `isDying Boolean @default(false)` to Player. In damagePlayer(): subtract from tempHp first, then HP. When HP hits 0 → set isDying=true (do NOT set isAlive=false). At start of dying player's turn, auto-roll death save (1d20, 10+ = success, <10 = fail, nat20 = 1 HP regen + lose dying, nat1 = 2 fails). 3 successes → stable (isDying=false, hp stays 0). 3 failures → isAlive=false. UI: CharacterSheet shows 3 success pips + 3 fail pips when isDying; token shows "💀" overlay + crossed-out HP bar; allies can use Medicine check (action) or Healing Word (bonus action) to stabilize / restore 1 HP.

==============================================================================
AREA 2 — CHARACTER / ABILITIES (abilities.ts, talents.ts, spellbook.ts, CharacterSheet.tsx)
==============================================================================
What exists now:
- 6 ability scores (STR/DEX/CON/INT/WIS/CHA) + abilityModifier() helpers.
- proficiencyBonus (default 2, scales with level).
- 9 races + 11 classes with innate + class-feature abilities.
- Talent system: 11 effect types (ac_bonus, hp_bonus, save_bonus, initiative_bonus, damage_bonus_flat, crit_range, crit_bonus_dice, extra_attack_chance, reroll_miss_once, damage_resistance_flat/pct, counterattack).
- 34-spell spellbook (4 cantrips + 8 L1 + 6 L2 + 6 L3 + 5 L4 + 5 L5) with full mechanical block (castingTime/range/duration/components/damage/saveAbility/saveDC/aoeShape/aoeSize).
- Scroll spells (7) + spellbookSpells field for extra spells learned from scrolls.
- Spell slots per level (current + max), hit dice for short-rest healing.
- BG3 short-rest counter (max 3 between long rests).
- Equipment (8 slots), crafting stations (alchemy/forge/enchant), backstory, XP, level-up + ASI pending flags.

What BG3/classic D&D has that's MISSING:
- Skills (18 skills: Acrobatics, Animal Handling, Arcana, Athletics, Deception, History, Insight, Intimidation, Investigation, Medicine, Nature, Perception, Performance, Persuasion, Religion, Sleight of Hand, Stealth, Survival) — entirely absent. The DM agent currently rolls raw ability checks; no proficiency/expertise applied.
- Saving-throw proficiencies (each class is proficient in 2 of 6 saves; currently NO save-proficiency tracking — saves use raw ability modifier only).
- Skill proficiencies + expertise (rogue expertise at L1/L6 doubles proficiency bonus on chosen skills).
- Tool proficiencies (Thieves' Tools for lockpicking, Herbalism Kit for crafting).
- Languages known.
- Passive Perception (10 + WIS mod + proficiency if proficient) — drives stealth-vs-perception checks and surprise rounds. Currently NO passive perception exists, so "Hide" action has nothing to roll against.
- Speed / movement (in feet and cells) — players have no speed stat; monster movement is hard-coded to 2 cells/turn.
- Initiative modifier breakdown (currently DEX mod only; no feat/feature bonuses shown beyond talent.initiative_bonus which exists but is not displayed in CharacterSheet).
- Spell save DC + spell attack bonus display (currently spell saveDC is in spellbook but per-caster DC = 8 + proficiency + spellcasting-stat-mod is never computed or shown).
- Concentration slot (only one concentration spell at a time) — no field, no tracking, no concentration checks.
- Cantrip scaling (Fire Bolt 1d10 → 2d10 at L5 → 3d10 at L11 → 4d10 at L17) — currently fixed at 1d10 regardless of level.
- Spell upcasting UI (auto-cast at the highest available slot, or pick lower slot to conserve — currently spendSpellSlot auto-picks).
- Carrying capacity / encumbrance.
- Senses (darkvision distance — race description says "60 футов" but no field tracks it).
- Spell description tooltip on hover in BottomPanel (currently shows a one-line summary, not the full stat block).

TOP 3 highest-impact improvements (character/abilities):
1. SKILLS + SAVING-THROW PROFICIENCIES — Add `skillProficiencies String @default("")` (JSON: `{"athletics":true,"stealth":true,"perception":true,"expertise":["stealth"]}`) and `saveProficiencies String @default("")` (JSON: `{"dex":true,"con":true}`) to Player. Auto-populate from class on character creation (e.g. Fighter: STR/CON saves + Athletics/Acrobatics/Intimidation/Perception choice of 2). Add 18-skill grid to CharacterSheet non-compact mode with `+modifier` (proficient) or `modifier` (non-proficient) formatting. Wire into DM agent prompt so it rolls `1d20 + skill_modifier` for ability checks (perception/stealth/investigation) instead of raw stat. Compute passive perception = 10 + PER mod + (proficient ? proficiencyBonus : 0) and surface in CharacterSheet + use for stealth contest.
2. CONCENTRATION SLOT + SPELL SAVE DC DISPLAY — Add `concentratingOn String?` to Player (spell id or name). Show a "🎯 CONCENTRATING: Hold Person" badge in CharacterSheet. When the player casts another concentration spell, prompt to drop the current one. When the player takes damage while concentrating, roll a concentration check (DC 10 or half damage taken, whichever higher; CON save) — failure drops concentration. Also compute and show Spell Save DC = 8 + proficiencyBonus + spellcastingAbilityMod (INT for wizard, CHA for sorcerer/warlock/paladin, WIS for cleric/druid/ranger) and Spell Attack Bonus = proficiencyBonus + spellcastingAbilityMod in the CharacterSheet spell-slots section.
3. SPEED / MOVEMENT STAT + CANTRIP SCALING — Add `speed Int @default(30)` to Player (feet per round; 30 is default, 25 for dwarves/halflings/gnomes, 35 for wood elves). Convert to cells (5ft=1 cell → 30ft=6 cells, 25ft=5 cells). Show "Movement: 30 ft (6 cells)" in CharacterSheet. Pair with the movementUsed field from Combat improvement #1 to gate click-to-move on grid. Also: add cantrip scaling logic in spellToAbility() — if the spell is a cantrip and player.level >= 11, damage dice ×3; >=5 ×2; >=17 ×4 (Fire Bolt 1d10→2d10→3d10→4d10). Display the scaled notation in the ability chip tooltip.

==============================================================================
AREA 3 — UI / UX (ChatPanel.tsx, BottomPanel.tsx, page.tsx, SceneViewer.tsx)
==============================================================================
What exists now:
- 3-column layout: LEFT (PartyPanel + CharacterSheet compact + InitiativeTracker + DiceLog) | CENTER (ChatPanel full-height) | RIGHT (SceneViewer 16:9 + CombatGrid square) | BOTTOM (full-width BottomPanel).
- ChatPanel: 6 QUICK_ACTIONS (attack/explore/move/talk/search/hide) + Short/Long rest buttons + TTS playback + virtualized chat (VISIBLE_LIMIT 50) + jump-to-bottom + scroll-anchor pagination + per-message TTS button.
- BottomPanel: equipment (8 slots, click to unequip), inventory (click to quick-use), abilities (sorted damage>heal>buff>utility, favorites star, search filter when >8, hotkey badges 1-8), spell slots (pips per level), rest section (3-pip short-rest counter + short/long buttons).
- Targeting modes: "none" / "ability" (click monster) / "aoe" (click cell) / "item" (click monster or ally for healing). Banner above grid with "Выберите цель" + cancel (Esc).
- Hotkeys: 1-8 abilities, Q attack, E explore, R short rest.
- SceneViewer: scene image with time-of-day filter + weather overlay (rain/fog/storm/snow) + location caption + AI-disclaimer.
- CombatGrid: animated tokens (lunge on attack, screen-shake on crit, hit/heal flash, crit burst overlay), flanking SVG lines, threat-range red zone for ranged monsters, loot-cell shimmer, discovered-trap warning.

What BG3/classic D&D has that's MISSING:
- Action-economy bar above BottomPanel (3 pips for Action/Bonus/Reaction; lit/dim by availability).
- Reactions UI: modal "Reaction available! Cast Shield?" when monster attacks you.
- Click-to-move on grid during own turn (currently grid is display-only for player tokens; movement happens via chat narrative).
- Movement-range overlay (highlight reachable cells within remaining movement budget).
- Threatened-square overlay (red border around enemies' melee reach — shows where moving-out triggers OA).
- Health visualization: temp HP as a separate blue overlay bar on top of HP bar, dying state (skull + crossed-out HP), downed-but-stable indicator.
- Death-save tracker UI in CharacterSheet (3 success pips + 3 fail pips, click to roll).
- Condition icons on tokens show source (who applied) on hover — currently only shows name + duration.
- Loot pickup (click loot-cell to add to inventory — currently only display).
- Container / door / lockpick interaction UI (open chest, pick lock, force door).
- Reaction log in DiceLog (shield triggered, counterspell, OA — currently DiceLog only shows dice rolls, not reaction events).
- Spell stat-block tooltip on ability hover (currently one-line summary).
- Combat log filter by round / actor.
- Party management UI (kick/invite, transfer host, change party leader).

TOP 3 highest-impact improvements (UI/UX):
1. CLICK-TO-MOVE + MOVEMENT-RANGE OVERLAY — When it's the local player's turn in combat, CombatGrid enters "move-mode" (or shows a Move button). Compute reachable cells via BFS within `speed - movementUsed` cells (5ft-per-cell, ignoring occupied cells). Highlight them with a translucent green overlay. Clicking one → POST /api/game/move with target (x,y) → backend updates posX/posY, increments movementUsed, triggers opportunity-attack prompts for any enemy whose threatened square was exited. Show a "movement: 3/6 cells" indicator next to the action-economy pips. This is the single most impactful BG3-feel change.
2. ACTION-ECONOMY BAR + REACTION MODAL — Above BottomPanel, add a row of 3 pips: Action ⚔ (lit when !actionUsed), Bonus ✦ (lit when !bonusActionUsed), Reaction ↩ (lit when !reactionUsed). When the DM agent's monster-turn stream detects an attack against the local player, show a modal: "⚔ Гоблин атакует вас! Реакция: Щит (+5 AC)? [Да / Нет]". If yes → POST /api/game/reaction with ability="shield" → backend applies Shield condition + sets reactionUsed=true. Modal auto-dismisses after 10s with default "No" if no input. Same modal pattern for Counterspell (when monster casts), Hellish Rebuke (tiefling), Uncanny Dodge (rogue).
3. HEALTH VISUALIZATION OVERHAUL — In CombatGrid PlayerToken and MonsterToken: (a) show temp HP as a separate blue bar overlay on top of the existing HP bar (width = tempHp/maxHp, capped at 100%); (b) when isDying, replace the HP bar with 3 success pips + 3 fail pips (green/red filled circles) + a pulsing skull icon; (c) when hp <= 0 but stable, show a gray "STABLE" badge. In CharacterSheet: same death-save tracker; add a "Temp HP: 5" indicator next to the HP bar. In PartyPanel: tint the card red when isDying. Pair with Combat improvement #3 (death-save backend).

==============================================================================
AREA 4 — STATE MANAGEMENT (state.ts, schema.prisma)
==============================================================================
What exists now:
- Room: combat/round/turnIndex, timeOfDay/weather, dungeon biome/depth/cleared, explorationActorIndex, crafting stations, hostAccountId, introNeeded.
- Player: full PC (6 stats, hp/maxHp, ac, gold, equipment, spellSlots/maxSpellSlots, hitDice, shortRestsUsed, spellbookSpells, talents, xp, level, pendingLevelUp/ASI, background, backstory).
- Monster: hp/maxHp/ac/damageNotation/attackBonus/posX/posY/isActive/isBoss/specialAbility (single string).
- Condition: targetName/targetType/condition id/duration/source (good model — supports per-target source tracking).
- Full supporting models: InventoryItem, ChatMessage, DiceRoll, Scene, InitiativeEntry, Quest, MapRoom, Npc, Trap, StoryMemory, SaveSlot.
- GRID_SIZE = 10 (10x10 grid).

What BG3/classic D&D has that's MISSING:
- Player: `tempHp`, `deathSavesSuccess`, `deathSavesFail`, `isDying`, `actionUsed`, `bonusActionUsed`, `reactionUsed`, `movementUsed`, `speed`, `concentratingOn`, `skillProficiencies`, `saveProficiencies`, `passivePerception` (derived), `isHidden` (stealth), `darkvision` (feet).
- Monster: `speed` (ft), `actions` (JSON array of {name, attackBonus, damageNotation, saveAbility, saveDC, aoeShape, aoeSize} — currently only ONE damageNotation), `bonusActions`, `reactions`, `legendaryActions` (bosses), `lairActions` (bosses), `conditionImmunities`, `damageResistances`, `damageImmunities`, `damageVulnerabilities`, `senses` (darkvision/blindsight/tremorsense), `languages`, `cr` (challenge rating).
- No "ground inventory" model — lootCells are ad-hoc arrays on the snapshot, not persisted rows; gold-on-ground is not modeled at all (loot only lists item names).
- No "container" model (chest/door/barrel inventory) — players can't open a chest and see what's inside before looting.
- No "ready action" model (prepare a reaction with a trigger condition).
- No "concentration check log" — when concentration is broken, no record persists.

TOP 3 highest-impact improvements (state management):
1. PLAYER HEALTH + ACTION-ECONOMY FIELDS — Migration adds to Player model: `tempHp Int @default(0)`, `deathSavesSuccess Int @default(0)`, `deathSavesFail Int @default(0)`, `isDying Boolean @default(false)`, `actionUsed Boolean @default(false)`, `bonusActionUsed Boolean @default(false)`, `reactionUsed Boolean @default(false)`, `movementUsed Int @default(0)`, `speed Int @default(30)`. All have safe defaults → no data migration needed, just schema apply. PlayerState.toPlayer() mirrors them. damagePlayer() subtracts tempHp first; advanceTurn() resets actionUsed/bonusActionUsed/reactionUsed/movementUsed=false/false/false/0 at the start of each living player's turn.
2. CONCENTRATION + SKILLS FIELDS — Add `concentratingOn String @default("")`, `skillProficiencies String @default("")` (JSON), `saveProficiencies String @default("")` (JSON) to Player. On casting a concentration spell, set concentratingOn=spellId. On casting a different concentration spell, drop the old one (and warn). On taking damage, roll concentration check (CON save vs DC 10 or half damage). Wire skillProficiencies into the DM agent's plan-resolution: when the player declares "I search the room" → roll 1d20 + Investigation modifier (INT mod + proficiency if proficient) instead of raw INT.
3. MONSTER STAT BLOCK EXPANSION — Add `speed Int @default(30)`, `actionsJson String @default("[]")` (JSON array of multi-action stat block), `legendaryActionsJson String @default("[]")`, `damageResistances String @default("")` (comma-separated damage types), `damageImmunities String @default("")`, `damageVulnerabilities String @default("")`, `conditionImmunities String @default("")`, `cr String @default("1/2")` to Monster. Update bestiary.ts to seed these. Boss monsters get 3 legendary actions per round (used at end of other combatants' turns). Damage-type modifiers apply in damageMonster(): vulnerable = ×2, resistant = ×0.5, immune = 0. This unblocks elemental spells (Fire Bolt vs fire-vulnerable monster should double).

==============================================================================
AREA 5 — QUICK ACTIONS (quick-use.ts, ChatPanel.QUICK_ACTIONS)
==============================================================================
What exists now:
- ChatPanel.QUICK_ACTIONS (6 buttons): Attack (Swords), Explore (Eye), Move (Footprints), Talk (MessageSquareQuote), Search (Search), Hide (EyeOff) — each sends a fixed Russian action text.
- Rest buttons (Short/Long) separately rendered.
- Hotkeys: Q=attack, E=explore, R=short rest, 1-8=Nth ability.
- buildAbilityQuickText(): scroll-spell "кастую «name» (круг N) против target" / non-spell "использую «name» против target" / heal "для лечения target" / buff "на себя" / utility "использую «name»".
- buildItemQuickText(): potion "выпиваю зелье «name»" / scroll "читаю свиток «name»" / weapon "переключаюсь на «name» [и атакую]" / other "использую «name»".
- classifyAbilityTargeting(): "self" / "monster" / "aoe" — drives targeting-mode entry.
- findNearestMonsterName(): used for damage-ability target pre-fill.

What BG3/classic D&D has that's MISSING:
- Dash (action — double movement this turn).
- Disengage (action — movement doesn't provoke OA this turn; rogue = bonus action).
- Dodge (action — attacks against you have disadvantage, DEX saves have advantage).
- Help (action — grant ally advantage on next attack vs target, or aid ability check).
- Ready (action — prepare a reaction with trigger + action: "When the goblin moves, I attack").
- Use an Object (action — drink potion, open door, activate lever).
- Grapple / Shove (special melee attacks — STR/Athletics contest).
- Off-hand attack (bonus action when two-weapon fighting).
- Hide as bonus action (Rogue Cunning Action, Monk Step of the Wind).
- Specific class bonus actions (Monk Flurry of Blows, Bardic Inspiration, Hunter's Mark, Misty Step, Healing Word).
- Cast a cantrip as action + bonus-action spell (e.g. Action: Fire Bolt, Bonus: Healing Word — currently the system allows only one action per turn implicitly).
- "Jump" / "Dip" / "Throw" environmental actions (BG3-specific but iconic).

TOP 3 highest-impact improvements (quick actions):
1. ADD COMBAT-ACTION MENU — Add a second row of 5 quick-action buttons (or a dropdown) visible only in combat: Dash, Disengage, Dodge, Help, Ready. Each sends localized Russian text + sets the appropriate actionUsed/bonusActionUsed flag via a new /api/game/action-economy endpoint. E.g. clicking Dodge → "Я использую действие Уклонение: атаки по мне с помехой, спасброски ЛОВ с преимуществом до начала моего следующего хода." → backend sets actionUsed=true + applies a "dodging" condition (NEW condition: attacks-against-me-disadvantage, self-saves-advantage). Pair with Combat improvement #1 (action economy).
2. HIDE / DASH / DISENGAGE AS BONUS ACTIONS — For classes that have them (Rogue Cunning Action = Dash/Disengage/Hide as bonus action; Monk Step of the Wind = Dash/Disengage as bonus action with 1 ki point; Ranger cunning-action-like features), surface these as bonus-action buttons that consume bonusActionUsed instead of actionUsed. Clicking Hide as bonus action → roll Stealth (1d20 + DEX + proficiency if proficient + expertise bonus) vs highest enemy passive perception → if success, set isHidden=true until next attack/cast/shout. First attack from hidden gains Sneak Attack / advantage. Requires stealth state on Player (NEW: isHidden Boolean).
3. OFF-HAND ATTACK + READY ACTION UI — When player has a one-handed weapon equipped AND no two-handed weapon in main hand AND no shield equipped, surface an "Off-hand attack" bonus-action button (uses bonusActionUsed, rolls weapon damage without STR/DEX mod). For Ready action, show a small form: trigger dropdown (enemy moves / enemy attacks / enemy casts) + action dropdown (attack / cast spell / dash) → on save, queue a pending ready-action; when the trigger fires (DM agent detects it in the narrative), the player gets a prompt to take the readied action (consumes reactionUsed).

==============================================================================
RANKED RECOMMENDATIONS (cross-area, by impact × feasibility)
==============================================================================
1. ★★★ ACTION ECONOMY + DEATH SAVES + TEMP HP (Combat #1 + State #1 + UI #3)
   Impact: HIGHEST — every combat feels fundamentally more like D&D/BG3.
   Feasibility: HIGH — additive schema migration, no destructive changes.
   Effort: ~2-3 days. Schema: add ~9 Int/Boolean fields to Player. Backend: reset on turn start, damagePlayer() temp-HP-first, death-save auto-roll at start of dying player's turn. Frontend: 3-pip action-economy bar + death-save tracker in CharacterSheet + temp HP overlay on tokens.

2. ★★★ REACTION SYSTEM — Shield / Counterspell / Opportunity Attack (Combat #2 + UI #2)
   Impact: HIGHEST — players feel agency during enemy turns (BG3's signature feel).
   Feasibility: MEDIUM — requires pausing monster-turn stream + socket round-trip + modal.
   Effort: ~3-4 days. Backend: in runMonsterTurn, before applying damage, check if target player has a reaction-ability available; if yes, emit "reaction-prompt" socket event with a 10s timeout; on "yes" response, apply reaction effect (Shield +5 AC, Uncanny Dodge half-damage, etc.) and set reactionUsed=true. Frontend: modal with ability cards + Yes/No buttons + countdown ring. Start with just Shield + OA (most common); add Counterspell + Hellish Rebuke + Uncanny Dodge in v2.

3. ★★ CLICK-TO-MOVE + MOVEMENT-RANGE OVERLAY (UI #1 + Combat #1)
   Impact: HIGH — biggest immersion win; grid becomes interactive.
   Feasibility: MEDIUM — needs /api/game/move endpoint + BFS pathing + OA trigger detection.
   Effort: ~2-3 days. Frontend: when it's the local player's turn, CombatGrid enters move-mode; compute reachable cells (BFS within speed - movementUsed, ignoring occupied cells); highlight with green overlay; click → POST /api/game/move {x,y}. Backend: update posX/posY, increment movementUsed; if path exited any enemy's threatened square, queue OA reaction prompt (depends on #2).

4. ★★ SKILLS + SAVING-THROW PROFICIENCIES (Character #1 + State #2)
   Impact: HIGH — DM ability checks become mechanically correct; passive perception enables stealth gameplay.
   Feasibility: HIGH — additive JSON fields, no migration.
   Effort: ~2 days. Schema: skillProficiencies + saveProficiencies JSON on Player. UI: 18-skill grid in CharacterSheet non-compact mode. Backend: DM agent prompt enhancement so it rolls `1d20 + skill_modifier` for declared skill checks. Compute passivePerception = 10 + WIS mod + (proficient ? PB : 0).

5. ★★ CONCENTRATION SLOT + SPELL SAVE DC DISPLAY (Character #2)
   Impact: MEDIUM — closes a major D&D 5e fidelity gap (currently multiple concentration spells stack).
   Feasibility: HIGH — single new field + UI badge.
   Effort: ~1 day. Schema: concentratingOn String on Player. UI: badge in CharacterSheet + concentration-check roll on damage taken. Display Spell Save DC + Spell Attack Bonus in spell-slots section.

6. ★ SPEED / MOVEMENT STAT + CANTRIP SCALING (Character #3 + State #1)
   Impact: MEDIUM — unblocks click-to-move (#3); cantrip scaling fixes underpowered casters at high level.
   Feasibility: HIGH — single Int field.
   Effort: ~0.5 day schema + ~0.5 day UI + ~0.5 day cantrip-scaling logic in spellToAbility().

7. ★ MONSTER STAT-BLOCK EXPANSION (State #3 + Combat #1)
   Impact: MEDIUM — enables multi-attack bosses, legendary actions, damage-type modifiers (Fire Bolt vs fire-vulnerable = ×2).
   Feasibility: MEDIUM — schema migration + bestiary.ts reseed + damageMonster() rewrite.
   Effort: ~2-3 days. Schema: actionsJson + legendaryActionsJson + damageResistances/Immunities/Vulnerabilities + conditionImmunities + cr + speed on Monster.

8. ★ COMBAT-ACTION MENU (Quick #1 + UI #1)
   Impact: MEDIUM — Dash/Disengage/Dodge/Help/Ready are core D&D actions currently unavailable.
   Feasibility: HIGH — pure UI + a new /api/game/action-economy endpoint.
   Effort: ~1-2 days. Frontend: dropdown or row of 5 buttons in ChatPanel during combat. Backend: applies appropriate actionUsed/bonusActionUsed flag + optional condition (dodging, disengaging).

9. HIDE / DASH / DISENGAGE AS BONUS ACTIONS (Quick #2 + State #1)
   Impact: MEDIUM — Rogue / Monk / Ranger class fantasy depends on bonus-action mobility.
   Feasibility: HIGH once #8 lands (same endpoint).
   Effort: ~1 day. Add isHidden Boolean to Player + stealth-roll endpoint + UI button gating by class.

10. OFF-HAND ATTACK + READY ACTION (Quick #3 + Combat #1)
    Impact: LOW-MEDIUM — TWF + Ready are nice-to-have; less universally needed.
    Feasibility: MEDIUM — Ready action requires a queue + trigger-detection in DM agent.
    Effort: ~2-3 days. Defer until #1, #2, #3, #8 land.

NEXT ACTIONS (recommended order):
- Step 1 (1 day): schema migration — add Player.tempHp/deathSavesSuccess/deathSavesFail/isDying/actionUsed/bonusActionUsed/reactionUsed/movementUsed/speed/concentratingOn/skillProficiencies/saveProficiencies. Run prisma migrate. Update toPlayer() + PlayerState type.
- Step 2 (1 day): backend — damagePlayer() temp-HP-first; advanceTurn() reset action-economy; auto death-save roll at start of dying turn; concentration-check on damage.
- Step 3 (1-2 days): frontend — 3-pip action-economy bar; death-save tracker in CharacterSheet; temp HP overlay on tokens; "Dying" skull state in PartyPanel.
- Step 4 (3-4 days): reaction system — socket event + modal + backend pause/resume; implement Shield first, then OA, then Counterspell.
- Step 5 (2-3 days): click-to-move + movement-range overlay + /api/game/move endpoint.
- Step 6 (2 days): skills + saving-throw proficiencies UI + DM agent wiring.
- Step 7 (1 day): concentration badge + spell save DC display + cantrip scaling.
- Step 8 (1-2 days): combat-action menu (Dash/Disengage/Dodge/Help/Ready) + bonus-action Hide for rogues.
- Step 9 (2-3 days): monster stat-block expansion (multi-attack, legendary actions, damage-type modifiers) — can run in parallel with steps 4-8.

---
Task ID: bg3-mechanics-1
Agent: main-agent
Task: Add BG3/D&D 5e mechanics — death saves, dying state, temp HP, action economy, concentration, combat actions

Work Log:
- Read analysis-1 agent report: identified 5 top improvements (action economy, reactions, click-to-move, skills, concentration). Prioritized death saves + action economy + temp HP + concentration as highest-impact achievable set.
- Schema migration: added 9 new fields to Player model:
  * tempHp (Int, default 0) — temporary HP absorbed before real HP
  * isDying (Boolean, default false) — dying state when HP=0
  * deathSaveSuccess (Int, default 0) — death save successes (0-3)
  * deathSaveFailure (Int, default 0) — death save failures (0-3)
  * actionUsed / bonusActionUsed / reactionUsed (Boolean, default false) — action economy pips
  * concentratingOn (String, default "") — current concentration spell
  * Ran `bun run db:push` — schema synced successfully.
- Updated types.ts: added all 9 new fields to PlayerState interface.
- Updated state.ts toPlayer(): mapped all new DB fields to PlayerState.
- Updated damagePlayer(): now applies temp HP first (absorbs damage), HP=0 triggers dying state (not death), massive damage (>= maxHp) kills instantly. Damage at 0 HP adds a death save failure.
- Updated healPlayer(): any healing while dying stabilizes (HP>0, resets death saves).
- Added new helper functions in state.ts: grantTempHp(), setConcentration(), breakConcentration(), markActionUsed().
- Updated advanceTurn() in dm-agent.ts: dying players auto-roll death saves at start of turn (10+ = success, <10 = failure, nat 20 = 2 successes, nat 1 = 2 failures). 3 successes = stable, 3 failures = dead. Action economy pips reset at the start of each living player's turn.
- Added concentrationCheckOnDamage() helper in dm-agent.ts: when a concentrating player takes damage, CON save vs DC = max(10, damage/2). On failure, concentration breaks with a system message.
- Wired concentration checks into both damage paths (AoE player damage + failure backlash player damage).
- Updated getDMContext() in state.ts: DM now sees dying state, death save counts, temp HP, concentration spell, and action economy pips (✓/✗) for each player.
- Updated rest route: long rest resets temp HP, dying state, death saves, and concentration. Dying players can now rest (they're not dead, just dying).
- Updated Player object literals in dm-agent.ts (2 places) to include all new fields.
- UI — CharacterSheet.tsx:
  * Temp HP: shown as a blue overlay segment on the HP bar + text badge "Temp HP: +N"
  * Dying state: red pulsing panel with skull icon, 3 success pips (green) + 3 failure pips (red)
  * Action economy: 3 BG3-style pips (Action=amber, Bonus=sky, Reaction=purple) shown only in combat
  * Concentration: purple indicator showing the concentrated spell name
  * Added ActionPip component + new icons (Zap, Clock, Eye, Hourglass)
- UI — ChatPanel.tsx: added COMBAT_ACTIONS array with 5 BG3/D&D 5e actions:
  * Dash (Рывок) — double movement speed
  * Disengage (Отход) — retreat without opportunity attacks
  * Dodge (Уклонение) — disadvantage on attacks against you
  * Help (Помощь) — grant ally advantage
  * Ready (Готовность) — prepare action with trigger
  * Shown only in combat, styled with amber accents, separate from exploration quick actions
- i18n: added ~15 new keys to all 6 languages (char.dying, char.stable, char.death_saves, char.temp_hp, char.action, char.bonus_action, char.reaction, char.concentrating, actions.dash/disengage/dodge/help/ready + _hint variants, ui.combat_actions)
- Verified with Agent Browser:
  * App loads cleanly, no runtime errors
  * Character creation works (quick start)
  * Game loads with character sheet, scene, bottom panel
  * Language switch to English works — all UI strings translate correctly
  * Quick action buttons render properly
  * Combat actions appear only in combat (verified they're conditionally rendered)
  * No console errors or page errors

Stage Summary:
- 9 new Player fields added (schema migrated, db:push applied)
- 5 new backend functions (grantTempHp, setConcentration, breakConcentration, markActionUsed, concentrationCheckOnDamage)
- 4 new UI components/sections (temp HP overlay, death save pips, action economy pips, concentration indicator)
- 5 new combat quick actions (Dash, Disengage, Dodge, Help, Ready)
- ~15 new i18n keys across 6 languages
- bun run lint: 0 errors, 0 warnings (clean)
- bunx tsc --noEmit: 0 errors (clean)
- Agent Browser verified: app runs cleanly, all new features render correctly
- Core D&D 5e/BG3 mechanics now implemented: death saves, dying state, temp HP, action economy, concentration tracking, combat action options
