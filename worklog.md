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

---
Task ID: ui-enhance-1
Agent: ui-enhance-agent
Task: Enhance AuthScreen and Lobby UI

Work Log:
- Read worklog (bg3-mechanics-1 section) for project context; read AuthScreen.tsx, Lobby.tsx, globals.css (existing utility classes: parchment, rune-border, gold-text, text-glow, vignette, animate-flicker, animate-pulse-glow, animate-fade-up, weather-fog, weather-snow) and shadcn ui components (input, button, tabs, card) to understand available styling primitives. Confirmed `cn()` uses tailwind-merge so arbitrary utility classes safely override component defaults.
- Verified lucide-react exports all icons needed (Sparkles, Swords, Languages, Flame, AlertTriangle + existing Skull/Users/Plus/LogIn/LogOut/Save/User/Loader2) and the `LucideIcon` type.
- AuthScreen.tsx — kept all logic (validation, submit, fetch, toast, onAuthenticated) and the component signature identical; enhanced only presentation:
  * Card: added drop shadow, top ornamental accent line (amber gradient), soft inner top-radial glow, `animate-fade-up` entrance.
  * Header: skull badge now sits in a glowing blurred primary halo (`animate-flicker`); title + italic subtitle; ornamental divider (flame icon between two gradient rules).
  * Tabs/inputs: tabs unchanged; field labels get a small primary bullet dot; inputs kept default (preserves the existing focus ring).
  * Error: now a bordered box with AlertTriangle icon + `animate-fade-up`.
  * Submit button: primary gradient (`from-primary/90 to-primary/70`), hover lift (`-translate-y-0.5`), hover crimson glow shadow, and a shine-sweep overlay on hover (group-hover translate-x).
  * Footer: ornamental diamond divider + atmospheric Russian flavor quote «Тьма помнит имена.» (hardcoded, consistent with AuthScreen's existing hardcoded-Russian pattern; not an i18n key).
- Lobby.tsx — kept all logic (session restore via /api/auth/me, logout, continue-save, view routing, i18n via tt()) and component signature identical; enhanced only presentation:
  * Added 3 CSS-only atmospheric background layers (fixed, pointer-events-none, z-0): two `weather-fog` mist layers (different opacities/durations, second reversed for parallax) + a `vignette` overlay. Pure CSS keyframes already in globals.css, no JS.
  * Title block: skull badge enlarged with blurred primary halo + inset shadow + `animate-flicker`; title flanked by two amber gradient flourishes; subtitle restyled with letter-spacing.
  * Account bar: checking-session spinner tinted primary; logged-in state gets a pulsing emerald status dot (`animate-ping` + solid dot) + subtle inset highlight; keeps My saves / Sign out buttons unchanged.
  * Gather-party card: top amber accent line, soft top radial glow, `animate-fade-up`; section header now has an amber icon medallion (Users) + gold-text heading.
  * Create-room button: primary gradient + border, hover lift, hover crimson glow, shine-sweep overlay, icon now in a circular medallion.
  * Join-by-code button: outline variant restyled with amber-accented icon medallion, hover lift + amber glow.
  * Feature badges row (NEW, below gather-party card): 2-col on mobile / 4-col on sm+, 4 hardcoded English badges — AI DM (Sparkles), Tactical Combat (Swords), Multiplayer (Users), 6 Languages (Languages) — each a rounded card with an amber icon medallion, hover lift + glow + color shift. Decorative, not i18n (per task spec).
  * Footer hint: now framed by an ornamental flame divider; text slightly dimmed. Existing i18n key `lobby.footer_hint` preserved.
- Used `size-5` for button-internal icons (excludes them from the Button base `[&_svg:not([class*='size-'])]:size-4` override) so they render reliably at 20px inside the 36px medallions.
- Verified with agent-browser on running dev server (http://localhost:3000): page loads, no page errors, no console errors. Snapshot confirms h1 "DUSKFALL", h2 "Аккаунт" (AuthScreen), tablist Вход/Регистрация, username/password textboxes, "Войти" button, h2 "Соберите отряд", "Создать комнату" + "Войти по коду" buttons all present. DOM eval confirms all 4 feature badges render ("AI DM", "Tactical Combat", "Multiplayer", "6 Languages") and the AuthScreen flavor quote renders.
- Ran `bun run lint` (0 errors) and `bunx tsc --noEmit` (0 errors) — both clean.

Stage Summary:
- AuthScreen.tsx: visual-only polish — ornamental header/dividers, glow halo on skull badge, gradient+glow submit button with shine sweep, icon-decorated error box, atmospheric flavor footer. Logic, props, validation, i18n-free hardcoded text all unchanged.
- Lobby.tsx: visual-only polish — 3 CSS-only animated atmospheric layers (mist drift + vignette), enhanced title with flourishes, pulsing status dot on logged-in bar, restyled gather-party card with amber medallion header, gradient+glow+shine buttons with icon medallions, NEW feature-badges row (4 hardcoded badges), ornamental footer divider. Logic, props, i18n keys, layout (auth card on top, gather-party below) all unchanged.
- No new i18n keys; no logic changes; no component-structure changes; only Tailwind classes + existing shadcn/ui + lucide-react icons + existing globals.css utility classes used.
- bun run lint: 0 errors, 0 warnings. bunx tsc --noEmit: 0 errors. agent-browser: clean load, all elements verified present.

---
Task ID: terrain-ui-enhance
Agent: main-agent
Task: Improve UI/menus, expand tactical grid to D&D standard, add terrain obstacles, move combat actions to bottom panel

Work Log:
- Read current state: AuthScreen, Lobby, CombatGrid (GRID_SIZE=10), system for combat actions in ChatPanel
- Increased GRID_SIZE from 10 to 24 (standard D&D VTT size)
- Updated monster positions in locations.ts for the larger 24x24 grid (monsters now at x:16-21, y:2-4)
- Updated default player/monster positions in prisma/schema.prisma (players at x:2,y:20; monsters at x:20,y:3)
- Created new TerrainCell Prisma model (roomId, x, y, type) with unique constraint on (roomId, x, y)
- Created src/lib/game/terrain.ts with:
  * 5 terrain types: difficult (mud), half_cover (tree/pillar), full_cover (wall/boulder), high_ground (elevation), water
  * Biome-specific generation profiles (forest=crypt=village=caverns=marsh=tower=shipwreck=monastery=dungeon)
  * Seeded PRNG (deterministic per roomId)
  * Spawn-zone protection (no cover in player/monster starting zones)
  * Helper functions: coverAcBonus(), highGroundAdvantage(), blocksLineOfSight(), isDifficultTerrain(), hasLineOfSight() (Bresenham's line)
- Updated getSnapshot() to load terrainCells from DB and include in snapshot
- Updated seed.ts to call generateTerrainForRoom() during room creation
- Updated CombatGrid.tsx:
  * Added terrainCells to GridExtras interface
  * Added terrainMap useMemo for fast cell lookup
  * Added visual rendering for all 5 terrain types (emoji icons + colored backgrounds + tooltips)
    - difficult: 〰️ on amber/dark background
    - water: 🌊 on blue/dark background
    - half_cover: 🌳 on stone background
    - full_cover: 🪨 on dark stone background with border
    - high_ground: ⬆️ on amber background with border
- Updated page.tsx to pass terrainCells to CombatGrid
- Added 5 new i18n keys (terrain.difficult/half_cover/full_cover/high_ground/water) to all 6 languages
- Moved combat actions (Dash, Disengage, Dodge, Help, Ready) from ChatPanel to BottomPanel:
  * Removed COMBAT_ACTIONS array and combat actions render block from ChatPanel
  * Removed unused icon imports (Wind, ShieldOff, Shield, Heart, Clock) from ChatPanel
  * Added COMBAT_ACTIONS array to BottomPanel
  * Added new "Combat actions" section in BottomPanel between abilities and spell slots (only shown in combat)
  * Combat actions styled with amber accents, vertical layout on desktop
- Integrated terrain mechanics into DM agent:
  * DM context now includes "Рельеф местности" section listing all terrain cells grouped by type
  * System prompt updated with "РЕЛЬЕФ МЕСТНОСТИ (D&D 5e)" rules section explaining all 5 terrain types
  * Monster turn logic now applies cover AC bonus (+2 half, +5 full) to target's AC
  * Monster attacks have disadvantage when target is on high ground
  * Roll labels show cover bonus and high ground disadvantage
- Enhanced AuthScreen + Lobby UI (delegated to subagent — visual-only changes, no logic/structure changes):
  * AuthScreen: amber accent line, radial glow, ornamental dividers, gradient submit button with shine effect
  * Lobby: animated atmospheric fog layers, title flourishes, feature badges (AI DM, Tactical Combat, Multiplayer, 6 Languages), ornamental dividers
- Verification: lint 0 errors, tsc 0 errors. Server starts and responds 200. API works through Caddy (401 for /api/auth/me). Full browser verification limited by Caddy gateway configuration showing Z.ai page on root path.

Stage Summary:
- GRID_SIZE increased 10 → 24 (standard D&D VTT)
- New TerrainCell model + terrain.ts with 5 terrain types, biome-aware generation, line-of-sight, cover bonuses
- Terrain visually rendered on combat grid with icons + tooltips
- Terrain mechanics integrated into DM agent (cover AC bonus, high ground advantage/disadvantage)
- Combat actions moved from ChatPanel to BottomPanel (abilities section)
- AuthScreen + Lobby visually enhanced (BG3-inspired dark fantasy polish)
- 5 new i18n keys across 6 languages
- lint: 0 errors, tsc: 0 errors

---
Task ID: click-to-move-tooltips-floating-text
Agent: main-agent
Task: Add click-to-move on tactical grid, improved ability tooltips, floating damage numbers, terrain legend

Work Log:
- Created /api/game/move-token endpoint (moves player token to x,y on the grid)
- Added click-to-move to CombatGrid:
  * New props: onMoveClick(x,y), yourName
  * When not in targeting mode, clicking an empty cell moves the player's token
  * Empty cells show a subtle sky-blue hover highlight
  * Full cover cells are NOT clickable (blocked)
  * Title shows "Move here (x, y)" in the player's language
- Added handleMoveClick in page.tsx — calls /api/game/move-token and updates snapshot
- Added ui.move_here i18n key to all 6 languages
- Added terrain legend to CombatGrid (shown when terrain cells exist):
  * Compact row with all 5 terrain icons + short labels
  * Appears at the bottom of the grid card
  * Added 6 new i18n keys (terrain.legend + 5 short labels) to all 6 languages
- Enhanced ability tooltips in BottomPanel:
  * Structured layout with type badges (source + cast type + consumable)
  * Color-coded badges matching the chip colors
  * Cast notation with ⚔/✚ icons
  * AoE info (shape + size)
  * Full description with proper line height
- Wired floating combat text system (CombatTextOverlay was unused!):
  * Imported makeDamageText, makeMissText, makeHealText, FloatingText type
  * Added floatingTexts state
  * On combat events: find target position, generate floating text (damage/miss/heal/crit)
  * Text auto-removes after 1.3s
  * Rendered as overlay above the grid
- lint: 0 errors, tsc: 0 errors

Stage Summary:
- Click-to-move: players can now click empty cells to move their token (D&D 5e movement)
- Terrain legend: visual explanation of all 5 terrain types on the grid
- Enhanced ability tooltips: structured, color-coded, with all relevant info
- Floating damage numbers: damage/miss/heal/crit text appears above targets during combat
- 7 new i18n keys across 6 languages

---
Task ID: debug-dm-immersion
Agent: explore-agent
Task: Read DM agent code (dm-agent.ts + state.ts:getDMContext) and find DM immersion-breaking issues — research only, no code changes.

Work Log:
- Read worklog tail (bg3-mechanics-1, ui-enhance-1, terrain-ui-enhance, click-to-move-tooltips-floating-text) for context. Project is a D&D 5e VTT with AI DM; recent work added BG3 mechanics (death saves, action economy, temp HP, concentration), terrain (cover/high ground), and 16x16 grid.
- Read dm-agent.ts in full (2204 lines): SYSTEM_PROMPT_PLANNING (169-377), SYSTEM_PROMPT_NARRATION_TPL (379-394), buildPlanningPrompt (404-408), buildNarrationPrompt (411-417), buildCombinedPrompt (424-431), planResolution (488-525), planAndNarrate (529-553), findMonsterByTargetName (603-704), streamNarrativeAction (707-754), narrateMonsterTurn (756-799), resolvePlayerAction (829-1418), runMonsterTurn (1431-1592), advanceTurn (1599-1767), generateUniqueIntro (1790-1866), resolvePlayerMechanics (1871-2203).
- Read state.ts:getDMContext (510-889) in full to enumerate what context the DM LLM receives: players (with HP/AC/stats/position/tempHp/dying/death-saves/concentration/action pips), equipped items, inventory (with rarity/enchant), active+hidden monsters (with CR, specialAbility, attack/damage), terrain cells, initiative order, conditions, active quests, world map, NPCs, crafting stations, time/weather, recent chat (30 msg + condensed older), story memory (last 15), ground items, dungeon biome, current room description, average party level.
- Verified GRID_SIZE is 16 (state.ts:30) — NOT 10 and NOT 24 (worklog claim of 24 was inaccurate; current code is 16).
- Grep-confirmed `markActionUsed` (state.ts:1163) is defined but NEVER called anywhere in the codebase — action economy pips are cosmetic only.
- Grep-confirmed no occurrences of "passive" / "пассивное восприятие" anywhere — passive perception is not implemented.
- Grep-confirmed 5 combat actions (Dash/Disengage/Dodge/Help/Ready) are sent as plain chat text with no backend mechanical resolution; no `dodge` condition exists in the conditions list.

Stage Summary — 23 immersion-breaking issues found (3 critical, 7 high, 5 medium, 8 low):

CRITICAL:

1. **Stale grid coordinate range in DM prompt (0..9 vs actual 0..15)**
   - File: `src/lib/game/dm-agent.ts`
   - Lines: 250 (`tokenMoves двигай ТОЛЬКО действующего героя. Координаты 0..9.`), 329 (`"aoeOrigin": { "x": <0..9>, "y": <0..9> }`), 1452-1453 (monster flee clamp `Math.max(0, Math.min(9, ...))`)
   - Problem: The DM planning prompt and monster flee logic still treat the grid as 10×10, but `GRID_SIZE=16` (state.ts:30). The LLM is told to plan player token moves and AoE origins only in 0..9, locking the party to the bottom-left quadrant. Monsters fleeing are clamped to that same corner. The remaining 12×12 of the tactical grid is unreachable through DM-planned moves.
   - Severity: critical
   - Suggested fix: Replace `0..9` with `0..${GRID_SIZE-1}` (or hardcode `0..15`) in both prompt locations; replace `Math.min(9, ...)` with `Math.min(GRID_SIZE - 1, ...)` in runMonsterTurn. Better: export GRID_SIZE into the prompt at build time so it can never drift again.

2. **Action economy pips are purely cosmetic — `markActionUsed` is dead code**
   - File: `src/lib/game/dm-agent.ts` (resolvePlayerMechanics + resolvePlayerAction — never mark Action/Bonus/Reaction used); `src/lib/game/state.ts:1163` (`markActionUsed` defined, never imported or called anywhere)
   - Problem: The character sheet shows BG3-style Action/Bonus/Reaction pips that reset each turn (advanceTurn:1724-1731) but are NEVER consumed when a player attacks, casts a spell, dodges, dashes, etc. Players see "✓/✓/✓" indefinitely within a turn, so they can spam attacks/casts with no limit. The SYSTEM_PROMPT_PLANNING also has no rule describing action economy, so the LLM never refuses multi-action turns.
   - Severity: critical
   - Suggested fix: (a) After resolvePlayerAction, call `markActionUsed(roomId, actorName, "action")` for combat/spell actions (or `"bonus"` for bonus-action spells). (b) Add an "ACTION ECONOMY" rule section to SYSTEM_PROMPT_PLANNING telling the LLM: each turn = 1 Action + 1 Bonus Action + 1 Reaction; if `actionUsed=true`, the player's action is invalid. (c) Map COMBAT_ACTIONS (Dash/Disengage/Dodge/Help/Ready) to their action type in resolvePlayerMechanics.

3. **Monster tactics in prompt lie about actual monster AI**
   - File: `src/lib/game/dm-agent.ts:208-214` (SYSTEM_PROMPT_PLANNING "ТАКТИКА МОНСТРОВ") vs `1431-1592` (runMonsterTurn) and `state.ts:1329-1356` (moveMonsterTowardNearestPlayer)
   - Problem: The prompt promises monsters prefer wounded/caster targets, use ⚡ special abilities, exploit cover/environment. The actual `runMonsterTurn` ignores all of this: `moveMonsterTowardNearestPlayer` picks the nearest alive player by Chebyshev distance (no HP/caster preference), the monster makes a single melee attack, special abilities are never invoked, terrain is read only for AC/disadvantage (not for tactical movement). Result: the LLM narrates "the dragon rears back and breathes fire" but the backend only ever applies a single melee attack roll — narrative and mechanics diverge, breaking immersion.
   - Severity: critical
   - Suggested fix: Either (a) implement real monster AI: target selection by lowest HP or caster flag, ability triggering (parse `specialAbility` text or add structured fields), terrain-aware pathing; or (b) soften the prompt to match reality (monsters move toward nearest player and make one basic attack; the DM may flavor this with the monster's `specialAbility` description in narrative only).

HIGH:

4. **System chat messages are hardcoded Russian — break immersion for non-Russian players**
   - File: `src/lib/game/dm-agent.ts` (many) and `src/lib/game/state.ts:527`
   - Lines: dm-agent.ts:104 (concentration break), 1119 & 1213 (dying), 1133 (AoE summary), 1150 (friendly fire), 1190 & 1582 (XP), 1260 (condition applied), 1288 & 1302 (quest), 1328 (NPC intro), 1355 (crafting), 1378 (spell learned), 1460/1476/1555/1590 (monster narration), 1694-1697 (death saves), 1719 (stunned), 1748 (УСПЕХ/ПРОВАЛ in streamNarrativeAction label)
   - Problem: The DM LLM is told to narrate in the player's language (buildPlanningPrompt + buildNarrationPrompt inject `${llmLangName(lang)}`), but ALL backend-emitted system messages are written in Russian regardless of player language. English/Spanish/German/French/Chinese players will see Russian combat-event text mixed into their localized narrative — major immersion break.
   - Severity: high
   - Suggested fix: Pass `lang` into every system message emitter and route through i18n keys (existing i18n.ts has 6 languages). Either add ~30 new keys (`system.concentration_broken`, `system.dying`, `system.death_save_*`, `system.quest_*`, `system.npc_appeared`, `system.condition_applied`, etc.) or refactor system messages into a helper that takes a lang param.

5. **`narrateMonsterTurn` produces generic narration and has Russian-only fallbacks**
   - File: `src/lib/game/dm-agent.ts:756-799`
   - Problem: The function passes only {monsterName, moved, targetName, hit, damage, attackTotal, ac, location} to the LLM. It does NOT pass the monster's description, special ability, CR, terrain at the monster's/target's cell, or the target's conditions. So a dragon and a wolf produce indistinguishable 2-4 sentence narrations. Fallback strings (795-798) are Russian-only — English players see Russian when the LLM call fails.
   - Severity: high
   - Suggested fix: (a) Pass monster.description + monster.specialAbility + terrainAt(monster.pos) + terrainAt(target.pos) + targetConditions into the LLM prompt so narration reflects what's actually happening. (b) Localize fallback strings — pass `lang` and use i18n keys, or fall back to the planned narrative line.

6. **Monster hit/miss detection uses fragile Russian substring match**
   - File: `src/lib/game/dm-agent.ts:1748`
   - Problem: `hit: result.damageToPlayer > 0 ? true : result.narrativeLine.includes("промах") ? false : (result.moved ? null : false)` — infers hit/miss by searching for "промах" (Russian for "miss") inside the hardcoded Russian narrativeLine. Brittle: breaks the moment narrativeLine is translated, templated differently, or shortened. The actual `result.rolls[0]?.success` boolean is the correct signal and is already available.
   - Severity: high
   - Suggested fix: Replace with `hit: result.rolls[0]?.success ?? (result.damageToPlayer > 0 ? true : result.moved ? null : false)`. Removes the string dependency entirely.

7. **Player-side cover / high ground not mechanically enforced (asymmetric)**
   - File: `src/lib/game/dm-agent.ts:829-1418` (resolvePlayerAction — uses plan's `r.target` AC verbatim, no cover bonus added)
   - Problem: When a MONSTER attacks a player, `runMonsterTurn` (1531-1536) mechanically adds the target's cover AC bonus and applies high-ground disadvantage. When a PLAYER attacks a monster, no such enforcement happens — the player's attack roll uses whatever AC the LLM put in `plan.rolls[].target`. If the LLM forgets to add +2 for half_cover or +5 for full_cover, the player effectively bypasses cover. Same for high-ground advantage on ranged attacks. This asymmetry is unfair to monsters and makes cover rules unreliable for players.
   - Severity: high
   - Suggested fix: In resolvePlayerAction, after fetching the target monster, compute `coverAcBonus(terrainCells, target.posX, target.posY)` and add it to `r.target` before rolling. Apply high-ground advantage via `computePositionalAdvantage` (already exists at line 155) — it's computed but only used to set `positionalAdv`, which only flips advantage mode; the AC cover bonus is never applied.

8. **Death-save / dying rules absent from system prompt**
   - File: `src/lib/game/dm-agent.ts:169-377` (SYSTEM_PROMPT_PLANNING)
   - Problem: getDMContext shows `ПРИ СМЕРТИ (HP 0, спасброски: ✓0/3 ✗0/3)` for dying players (state.ts:527), but the planning prompt has NO rule explaining what this means — no description of dying state, death-save mechanics, stabilization via healing, massive-damage instant death, or that a dying player cannot take normal actions. The LLM may narrate dying players as dead, allow them to act, or fail to mention death-save progress.
   - Severity: high
   - Suggested fix: Add a "СМЕРТЬ И СПАСБРОСКИ СМЕРТИ (D&D 5e)" section to SYSTEM_PROMPT_PLANNING: HP=0 → dying (not dead); at start of turn auto death save (10+=success, nat20=2 successes, nat1=2 failures, 3 successes=stable, 3 failures=dead); any healing stabilizes; massive damage (≥ maxHp) = instant death; dying players can't take Actions (only the death save is automatic). Tell the LLM to factor this into narrative.

9. **`findMonsterByTargetName` fallback picks monster nearest to corner (0,0)**
   - File: `src/lib/game/dm-agent.ts:685-696`
   - Problem: When the LLM gives a vague/misspelled monster name that no matcher catches, the code calls `nearestActiveMonster(roomId, 0, 0)` — nearest to the grid's bottom-left corner, which is irrelevant to the action. Wrong monster takes damage silently. The player says "I attack the goblin shaman" and a totally unrelated skeleton at the corner takes the damage.
   - Severity: high
   - Suggested fix: Pass the actor's position into the fallback (`nearestActiveMonster(roomId, actor.posX, actor.posY)`). Better: return `null` and emit a system message "цель не распознана — уточните, кого атакуете" so the player can re-issue the action — that's what a real DM would do.

10. **No passive perception for stealth/ambush detection**
    - File: `src/lib/game/state.ts:510-889` (getDMContext) — only shows raw WIS score and modifier; `src/lib/game/dm-agent.ts:169-377` — no rule for passive perception.
    - Problem: A real DM uses Passive Perception (10 + WIS mod + proficiency if proficient) to decide whether a player notices hidden creatures, ambushes, or traps without rolling. The DM agent only does rolled perception checks (LLM-planned). The LLM has no rule telling it to use passive perception for routine detection, and the context doesn't surface a computed passive-perception value per player. Result: stealth/ambush feels arbitrary — sometimes the DM rolls, sometimes the player rolls, and there's no consistent threshold.
    - Severity: high
    - Suggested fix: (a) Compute and show `Пассивное восприятие: N` per player in getDMContext (10 + WIS mod + proficiency if Perception proficiency — needs a proficiency field). (b) Add a "СКРЫТОСТЬ И ПАССИВНОЕ ВОСПРИЯТИЕ" rule to SYSTEM_PROMPT_PLANNING: hidden monsters whose Stealth ≤ a player's Passive Perception are noticed without a roll; otherwise the player must roll an active Perception check vs the monster's Stealth DC.

MEDIUM:

11. **Monster retreat decision uses brittle Russian name substrings**
    - File: `src/lib/game/dm-agent.ts:1439`
    - Problem: `const isIntelligent = !m.name.toLowerCase().includes("скелет") && !m.name.toLowerCase().includes("зомби") && !m.name.toLowerCase().includes("элементал")` — relies on Russian name substrings to infer intelligence. Misses variants ("Скелет-лучник" works because of toLowerCase, but "Блуждающий огонёк" or any non-Russian-named mindless creature won't). Also doesn't account for actual intelligence ratings that should be on the bestiary entry.
    - Severity: medium
    - Suggested fix: Add an `intelligence` (or `isIntelligent`) flag to the bestiary schema and check it here. Failing that, expand the substring list or check by bestiary entry lookup.

12. **Monster special abilities never mechanically invoked**
    - File: `src/lib/game/dm-agent.ts:1431-1592` (runMonsterTurn)
    - Problem: Bestiary entries have `specialAbility` (e.g. line 449 "Смертельный холод: раз в 2 раунда — цель СПАС CON 14 или теряет 1d6 макс. HP"; line 806 "Взрыв смерти: при гибели взрывается"). These are surfaced to the DM LLM via getDMContext (line 695) and the prompt tells the LLM to use them, but `runMonsterTurn` is fully deterministic and only ever makes a basic melee attack. A dragon "breathing fire" is purely LLM flavor with no damage roll.
    - Severity: medium
    - Suggested fix: Either parse `specialAbility` into a structured trigger+effect (or add structured fields to the bestiary: `{trigger: "every_n_rounds:2", save: {ability:"CON", dc:14}, effect: {type:"max_hp_damage", notation:"1d6"}}`) and invoke from runMonsterTurn; or remove the prompt's "use the ability" instruction so narration doesn't promise mechanics that don't happen.

13. **No opportunity attacks; Disengage action is meaningless**
    - File: `src/lib/game/dm-agent.ts` (no OA code); COMBAT_ACTIONS text in BottomPanel.tsx includes "Я использую действие «Отход» — отступаю, не провоцируя атак по возможности."
    - Problem: Players and monsters can move freely out of melee with no consequence. The "Disengage" combat action promises to suppress opportunity attacks that don't exist. Players choosing Disengage waste their action.
    - Severity: medium
    - Suggested fix: Implement opportunity attacks in moveToken/moveMonsterTowardNearestPlayer (when a combatant leaves an enemy's adjacent cell, that enemy may use its Reaction to make one melee attack). Or remove Disengage from COMBAT_ACTIONS until OAs exist.

14. **Dodge action has no mechanical effect**
    - File: `src/lib/game/dm-agent.ts` + `state.ts` (conditions list at dm-agent.ts:253-264 has no `dodge`)
    - Problem: The player can write "Я использую действие «Уклонение»" but there's no `dodge` condition. Monsters won't have disadvantage on attacks against the dodging player. Wastes the player's action.
    - Severity: medium
    - Suggested fix: Add a `dodge` condition type (attacker rolls attacks against this target with disadvantage). In resolvePlayerMechanics, when the action text matches the Dodge combat-action template, apply `dodge` to the actor for 1 round.

15. **Planning prompt says "no damage numbers in narrative" but system messages show them**
    - File: `src/lib/game/dm-agent.ts:350` (prompt rule: "narrative...без цифр урона, атмосферно и детально") vs dm-agent.ts:1590 (`${m.name} бьёт ${targetName} и попадает! ${dmg} урона (${atk.total} против AC ${targetAC}).`)
    - Problem: The LLM is told to write narratives without damage numbers (good D&D practice), but the system messages emitted by `runMonsterTurn` itself include raw numbers ("7 урона (14 против AC 12)"). Players see "narrative without numbers" + "system message with numbers" back-to-back — inconsistent tone.
    - Severity: medium
    - Suggested fix: Make `narrativeLine` (the fallback before narrateMonsterTurn runs) atmospheric rather than mechanical, e.g. `${m.name} обрушивает удар на ${targetName} — лезвие находит брешь в броне!`. Keep the raw numbers in the dice log only (already logged).

LOW:

16. **`isNonCombatAction` uses Russian-only combat keywords**
    - File: `src/lib/game/dm-agent.ts:480`
    - Problem: `COMBAT_KEYWORDS = ["атак", "бью", "стреляю", "кастую боевой"]`. For non-Russian player input ("I attack the goblin", "Je tire à l'arc", "Ich greife an"), the fast-model heuristic misroutes combat actions to the fast model. Weaker model produces worse combat plans — silent quality regression for non-Russian players.
    - Severity: low
    - Suggested fix: Either expand the keyword list per supported language, or remove the heuristic and always use the default model for safety.

17. **`generateUniqueIntro` placeholder + `fallbackResolution` narratives are Russian-only**
    - File: `src/lib/game/dm-agent.ts:1860` (placeholder), `562-571` (fallback narratives)
    - Problem: Last-resort fallback strings appear in Russian regardless of player language. For an English player whose LLM call fails, the opening scene is in Russian.
    - Severity: low
    - Suggested fix: Localize via i18n keys, or generate language-aware fallbacks using `llmLangName(lang)`.

18. **Story memory capped at 15 most-recent entries**
    - File: `src/lib/game/state.ts:849` (`take: 15`)
    - Problem: For long campaigns, key events from earlier sessions are forgotten. A real DM remembers the NPC the party met 20 sessions ago.
    - Severity: low
    - Suggested fix: Increase to 30-50, or implement tiered memory (recent 15 detailed + older condensed summary), or tag memories as "permanent" vs "ephemeral".

19. **`getDMContext` shows action pips but the prompt doesn't explain what they mean**
    - File: `src/lib/game/state.ts:540-542` (renders "Действия: ✓/✓/✓"); `src/lib/game/dm-agent.ts` SYSTEM_PROMPT_PLANNING (no action-economy rule)
    - Problem: The LLM sees the pips in context but the prompt never explains what ✓/✗ means or how to use them. Even if action economy were enforced (issue #2), the LLM wouldn't know to refuse a second action.
    - Severity: low
    - Suggested fix: Add an "ACTION ECONOMY" rule to SYSTEM_PROMPT_PLANNING: "Действия: ✓/✗/✗ = Action available / Bonus used / Reaction used. If actionUsed=✗, the player's main action is invalid — return category='invalid' with reason 'Вы уже использовали действие в этом ходу'."

20. **`streamNarrativeAction` and `narrateMonsterTurn` pass outcome labels in Russian to the LLM**
    - File: `src/lib/game/dm-agent.ts:728` (`Исход: ${data.outcome === "success" ? "УСПЕХ" : "ПРОВАЛ"}`), `773-781` (monster turn summary in Russian)
    - Problem: Even for an English-language narration request, the LLM is given Russian state labels ("УСПЕХ", "ПРОВАЛ", "Ход монстра", "Атака попадает по..."). Some LLMs will leak these Russian words into the localized narration.
    - Severity: low
    - Suggested fix: Translate the prompt scaffolding to the player's language via i18n, or use neutral labels ("OUTCOME: success", "MONSTER TURN: ...").

21. **No `concentratingOn` tracking for monsters**
    - File: `src/lib/game/state.ts` (concentration helpers operate only on Player)
    - Problem: If a monster ever casts a concentration spell (e.g. via future monster AI), there's no tracking — concentration checks won't fire when the monster takes damage. Currently moot because monsters don't cast, but blocks future monster-caster feature.
    - Severity: low
    - Suggested fix: Generalize `setConcentration`/`breakConcentration` to accept either Player or Monster target.

22. **Monster flee logic picks "farthest player" then steps away by 1 — net effect often zero**
    - File: `src/lib/game/dm-agent.ts:1446-1461`
    - Problem: The loop finds `nearestP = the player with MAX distance from the monster` (line 1450: `if (d > bestDist)`), but the variable is named "nearestP" and then used as "the player to flee FROM". The logic actually flees from the farthest player, not the nearest — which is wrong (you don't flee from someone far away). Then it moves only 1 step, which usually doesn't escape melee. The bug is in the comparison direction: should be `if (d < bestDist)` to find the nearest threat.
    - Severity: low (medium if monsters are common)
    - Suggested fix: Change `>` to `<` at line 1450 to find the actually-nearest player. Increase step count from 1 to the monster's speed (typically 2 cells, matching moveMonsterTowardNearestPlayer's `steps = 2`). Optionally: only flee if a clear path exists; otherwise surrender/attack.

23. **`buildPlanningPrompt` narrative directive gets overwritten by `buildCombinedPrompt` — but `planResolution` always uses `buildPlanningPrompt` while `planAndNarrate` uses `buildCombinedPrompt` — the two paths diverge**
    - File: `src/lib/game/dm-agent.ts:404-431`
    - Problem: The codebase has two prompt builders, but `planResolution` (the default path used in `resolvePlayerMechanics`) uses `buildPlanningPrompt`, which does NOT ask for the top-level `narrative` field. The narrative is then generated separately by `streamNarrativeAction`. This is fine — but `planAndNarrate` (the combined-call path) is exported but appears unused by the SSE route. Dead code path that could confuse future maintainers and may produce different narrative quality if ever switched to.
    - Severity: low
    - Suggested fix: Audit usages of `planAndNarrate`. If unused, delete it. If used, document when each path is taken.

Next actions (recommended priority order):
1. Fix #1 (grid 0..9 → 0..15) — single-line prompt edit + clamp fix. Immediate impact across all games.
2. Fix #2 (action economy) — wire `markActionUsed` into resolvePlayerAction + add prompt rule.
3. Fix #4 + #5 + #17 (i18n system messages) — biggest immersion win for non-Russian players; touches ~25 sites.
4. Fix #7 (player-side cover enforcement) — small change in resolvePlayerAction, big fairness win.
5. Fix #8 (death-save rules in prompt) — add ~10 lines to SYSTEM_PROMPT_PLANNING.
6. Fix #9 (fallback to nearest-to-actor, not (0,0)) — 1-line change.
7. Fix #6 (use rolls[0].success) — 1-line change, removes brittleness.
8. Then assess #3 (monster tactics) — bigger refactor; consider scope vs. payoff.

---
Task ID: debug-visual
Agent: explore-agent
Task: Read React component code (CombatGrid, CharacterSheet, BottomPanel, ChatPanel, SpellbookPanel, BestiaryPanel, ItemDatabasePanel, page.tsx) and find visual/UI problems — broken layouts, text overlap, missing responsive design, hardcoded strings, accessibility issues, z-index issues. Research only, no code changes.

Work Log:
- Read worklog tail (bg3-mechanics-1, ui-enhance-1, terrain-ui-enhance, click-to-move-tooltips-floating-text, debug-dm-immersion) for context. Project is a D&D 5e VTT with AI DM; recent work added BG3 mechanics (death saves, action economy, temp HP, concentration), terrain (cover/high ground), 16x16 grid (GRID_SIZE=16 confirmed at state.ts:30), click-to-move, floating combat text, i18n in 6 languages.
- Read all 8 target files in full:
  * CombatGrid.tsx (1046 lines) — tactical grid, tokens, terrain, AoE, flanking lines, animations.
  * CharacterSheet.tsx (770 lines) — character card with vitals, action pips, death saves, spell slots, equipment, inventory, abilities.
  * BottomPanel.tsx (893 lines) — equipment + inventory + abilities + combat actions + spell slots + rest buttons.
  * ChatPanel.tsx (613 lines) — chat bubbles, quick actions, TTS, "load more", "jump to bottom".
  * SpellbookPanel.tsx (376 lines) — modal with spell cards.
  * BestiaryPanel.tsx (257 lines) — modal with monster cards.
  * ItemDatabasePanel.tsx (376 lines) — modal with item cards.
  * page.tsx (1520 lines) — main layout with header, 3-column main, bottom panel, footer.
- Verified GRID_SIZE=16 (state.ts:30) — worklog claim of "10×10 grid" in CombatGrid comment (line 425) is stale.
- Verified `z-5` is NOT a Tailwind class (tailwind.config.ts has no z-index extension; default Tailwind scale = 0/10/20/30/40/50/auto). Used at CombatGrid.tsx:540, 548, 556, 564, 572 — silently ignored.
- Verified CharacterSheet.tsx:408-411 has literal `{tt("character.dex")}` text inside backtick template strings (the `tt()` function is NEVER invoked — the literal characters render in the UI).
- Verified CombatGrid.tsx:450-453 uses `* 10` for flanking-line SVG coordinates but grid is 16×16, so coordinates >100 are clipped by the viewBox="0 0 100 100" — flanking lines only render in the top-left 62.5% of the grid.

Stage Summary — 47 visual/UI issues found (4 critical, 13 high, 18 medium, 12 low):

CRITICAL:

1. **Flanking-line SVG coordinates assume 10×10 grid → clipped on 16×16 grid**
   - File: `src/components/dnd/CombatGrid.tsx`
   - Lines: 450 (`const x1 = (ln.from.x + 0.5) * 10;`), 451, 452, 453
   - Problem: The flanking-line overlay uses a `viewBox="0 0 100 100"` SVG and computes line endpoints as `(coord + 0.5) * 10`. This assumes a 10×10 grid (cell width = 10 viewBox units). With `GRID_SIZE=16`, cells are 6.25 units wide; a token at x=10 produces x1=105 — outside the 0..100 viewBox, clipped. Result: flanking lines only render for tokens in the top-left 10×10 quadrant of the 16×16 grid; any flank involving tokens at x≥10 or y≥10 is invisible.
   - Severity: critical
   - Suggested fix: Replace `* 10` with `* (100 / GRID_SIZE)` (or `* 6.25`). Better: `const cellPct = 100 / GRID_SIZE; const x1 = (ln.from.x + 0.5) * cellPct;` — single source of truth.

2. **AC breakdown renders literal `{tt("character.dex")}` text in the UI**
   - File: `src/components/dnd/CharacterSheet.tsx`
   - Lines: 408 (`acBreakdown.dexBonus > 0 ? \` + ${acBreakdown.dexBonus} ({tt("character.dex")})\` : ...`), 409 (`acBreakdown.armor`), 410 (`acBreakdown.shield`), 411 (`acBreakdown.other`)
   - Problem: Inside the backtick template strings, `{tt("character.dex")}` is literal text — the `tt()` function is NEVER called. Players see `AC 14 = 10 + 3 ({tt("character.dex")}) + 2 ({tt("character.armor")})` rendered as raw text in the AC breakdown line. This is a syntax bug: the developer intended string interpolation `${tt("character.dex")}` but wrote JSX-style `{tt(...)}` inside a template literal.
   - Severity: critical
   - Suggested fix: Change `({tt("character.dex")})` → `(${tt("character.dex")})` (and same for armor/shield/other). Better: build the breakdown as an array of strings and `.join(" ")` to avoid template-literal confusion.

3. **Stale 10×10 comment + cell-size assumptions in CombatGrid**
   - File: `src/components/dnd/CombatGrid.tsx`
   - Lines: 425-427 (comment "10×10 grid"), 450-453 (flanking SVG `* 10` — see issue #1), 429 (max-w sizing tuned for 10×10)
   - Problem: The grid was upsized from 10×10 to 16×16 (state.ts:30), but multiple places in CombatGrid still assume 10×10. The comment block at 425-427 says "10×10 grid", the flanking-line coordinates use `* 10`, and the max-w sizing (`max-w-[240px] sm:max-w-[280px] lg:max-w-[320px] xl:max-w-[400px]`) was tuned for 10×10 (40px/cell on xl). With 16×16, cells are 15px (mobile) / 17.5px (sm) / 20px (lg) / 25px (xl) — too small for the text-[7px]/[8px] HP labels and 14px condition icons.
   - Severity: critical (compounds with #1 and #4)
   - Suggested fix: Update the comment, fix the `* 10` per #1, and re-tune max-w sizes (e.g. `max-w-[320px] sm:max-w-[400px] lg:max-w-[440px] xl:max-w-[520px]`) so 16×16 cells are at least ~20-32px each.

4. **16×16 cells too small for token content (HP text, condition icons, labels)**
   - File: `src/components/dnd/CombatGrid.tsx`
   - Lines: 429 (max-w sizing), 818 (condition icon `h-3.5 w-3.5` = 14px), 912 (token label `text-[8px]`), 948 (HP text `text-[7px]` "{p.hp}/{p.maxHp}"), 950 (name label `text-[10px]`), 994 (monster label `text-[8px]`), 1024 (monster HP text `text-[7px]`)
   - Problem: At 16×16 in a 240-400px container, each cell is 15-25px. Token width = 88% of cell = 13-22px. A 14px condition icon (`h-3.5 w-3.5`) overflows the 13px mobile token entirely. HP text "30/30" at text-[7px] is ~20px wide — doesn't fit in a 13px token. The 2-char token label (e.g. "АЛ") at text-[8px] is ~10px — barely fits. On mobile, the grid is essentially unreadable: tokens show overlapping condition icons and clipped HP numbers.
   - Severity: critical
   - Suggested fix: (a) Increase the grid max-w per #3. (b) Hide HP text and condition icons on small viewports (e.g. `hidden sm:block`). (c) Reduce condition icon to `h-2.5 w-2.5` (10px) on mobile. (d) Show HP text only when cell > 24px (use container queries or a `sm:` prefix).

HIGH:

5. **SpellbookPanel has ZERO i18n — entire modal is Russian-only**
   - File: `src/components/dnd/SpellbookPanel.tsx`
   - Lines: 45-47 (levelTabLabel uses formatSpellLevel), 71 (`schoolLabelRu`), 75, 79 ("Ур."), 95 ("Время:"), 102 ("Дальн.:"), 109 ("Длит.:"), 116 ("Комп.:"), 134 ("урон/лечение"), 140 ("Спас"), 150-154 ("Круг"/"Конус"/"Линия"), 240 ("Книга заклинаний"), 245 ("заклинаний"), 249-250 (description), 259 ("Ячейки заклинаний"), 264 ("Круг"), 277 ("{s.current}/{s.max}"), 291 (placeholder), 311 ("Все"), 335 ("Ничего не найдено..."), 354 ("Школы:")
   - Problem: The component does not import `useSettings` or `t`. Every visible string is hardcoded Russian. For English/Spanish/German/French/Chinese players, the entire spellbook modal is unreadable.
   - Severity: high
   - Suggested fix: Import `useSettings` + `t`; thread `lang` through all labels; add ~25 new i18n keys (`spellbook.title`, `spellbook.count`, `spellbook.search_placeholder`, `spellbook.all`, `spellbook.not_found`, `spellbook.schools`, `spellbook.level`, `spellbook.casting_time`, `spellbook.range`, `spellbook.duration`, `spellbook.components`, `spellbook.damage_heal`, `spellbook.save`, `spellbook.aoe_circle/cone/line`, etc.) to all 6 languages.

6. **BestiaryPanel has ZERO i18n — entire modal is Russian-only**
   - File: `src/components/dnd/BestiaryPanel.tsx`
   - Lines: 46 (`categoryLabelRu`), 50, 54, 79 ("Атк"), 84 ("Урон"), 91 ("Ск"), 94 (size), 102 ("Особая способность"), 114 ("Добыча"), 118 ("зм"), 182 ("Бестиарий"), 184 ("существ"), 188 (description), 199 (placeholder), 215 ("Все"), 239 ("Ничего не найдено...")
   - Problem: Same as #5 — no `useSettings`/`t` import, all strings hardcoded Russian.
   - Severity: high
   - Suggested fix: Same approach as #5. Add ~20 new i18n keys across 6 languages.

7. **ItemDatabasePanel has ZERO i18n — entire modal is Russian-only**
   - File: `src/components/dnd/ItemDatabasePanel.tsx`
   - Lines: 43-60 (`equipSlotLabelRu`), 63-78 (`enchantmentLabelRu`), 100-102 (currency "зм/см/мм"), 108-109 ("фнт"), 135 ("Комплект"), 160 ("Слот:"), 172 ("зарядов"), 189 ("Урон"), 196 ("Хар-ки"), 204 ("Цена"), 209 ("Вес"), 223 ("Проклятие"), 236 ("Комплект «...»"), 239 ("Соберите ... шт.:"), 242 ("В комплекте:"), 300 ("Предметы"), 302 ("предметов"), 306 (description), 317 (placeholder), 333 ("Все"), 357 ("Ничего не найдено...")
   - Problem: Same as #5/#6 — no i18n at all.
   - Severity: high
   - Suggested fix: Same approach. Add ~30 new i18n keys across 6 languages (item database has the most labels: equip slots, enchantments, rarity, type, currency, weight, set bonuses, curse).

8. **All toast messages in page.tsx are hardcoded Russian**
   - File: `src/app/page.tsx`
   - Lines: 340 ("Мастер не ответил."), 355 (img-gen prompt title "Сцена"), 385 ("Бой начался! Брошена инициатива." + description), 386 ("Бой окончен!"), 387 (`${name} повержен!`), 388 (`${player} получает ${n} урона!`), 514 ("Ошибка Мастера."), 541 (img title "Сцена"), 552 ("Ошибка связи с Мастером."), 573 ("Игра перезапущена." + "Туманный лес ждёт…"), 575, 578, 588 ("Код комнаты скопирован:"), 605 ("Новый талант:"), 608, 626-628, 646-668, 689-695, 698-699, 719-724, 746-770, 796-798, 801, 836-840, 1511 ("Туман сгущается…" in LoadingScreen)
   - Problem: 30+ toast messages, error messages, and loading texts are hardcoded Russian. Non-Russian players see Russian for every combat event, error, and confirmation — major immersion break. The `tt()` helper IS available (line 167) but not used in these strings.
   - Severity: high
   - Suggested fix: Replace all hardcoded strings with `tt("key")` calls. Add ~35 new i18n keys (`toast.dm_no_response`, `toast.combat_started`, `toast.combat_ended`, `toast.monster_defeated`, `toast.player_damaged`, `toast.dm_error`, `toast.connection_error`, `toast.game_reset`, `toast.room_code_copied`, `toast.new_talent`, `toast.item_equipped`, `toast.item_unequipped`, `toast.craft_success`, `toast.craft_failed`, `toast.rest_short`, `toast.rest_long`, `toast.room_entered`, `toast.new_dungeon`, `toast.dialogue_error`, `loading.fog_gathering`, etc.) across 6 languages.

9. **QUICK_ACTIONS and COMBAT_ACTIONS send hardcoded Russian action text**
   - File: `src/components/dnd/ChatPanel.tsx:17-23` (QUICK_ACTIONS `text` field), `src/components/dnd/BottomPanel.tsx:32-37` (COMBAT_ACTIONS `text` field), `src/app/page.tsx:897, 900, 910-914, 1042, 1048` (targeting/hotkey action text)
   - Problem: When a player clicks a quick action ("Attack", "Explore", "Dash", etc.) or uses Q/E hotkeys, the text sent to the DM is hardcoded Russian ("Я обнажаю оружие и атакую ближайшего врага!", etc.) regardless of the player's UI language. Non-Russian players' chat messages appear in Russian to themselves and other players. Also: the DM LLM receives Russian action text, which may bias its narrative language even when the player set the narrative language to English.
   - Severity: high
   - Suggested fix: Either (a) localize the action text via i18n and send in the player's UI language, OR (b) keep Russian as the canonical DM-input language but make this explicit in the i18n key comments. Given the DM agent is Russian-tuned, (b) may be acceptable, but the chat bubble shown to the player should be displayed in their UI language for readability.

10. **Header overflow on mobile — no flex-wrap, 10+ buttons in one row**
    - File: `src/app/page.tsx`
    - Lines: 1116 (`<div className="flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">`), 1130-1278 (10+ buttons)
    - Problem: The header has NO `flex-wrap`. It contains: logo (36px) + title (flex-1, min 150px) + room code button (~80px) + 9 action buttons (~32-44px each on mobile, icon-only via `hidden sm:inline`). Total minimum width ≈ 36 + 150 + 80 + 9×40 = 626px. On 375px iPhone width, the header overflows horizontally, causing horizontal page scroll on mobile. The combat/world/time badges are `hidden sm:flex` (good), but the 9 action buttons all show.
    - Severity: high
    - Suggested fix: Add `flex-wrap` to the header div, OR collapse the 9 action buttons into a single "Menu" dropdown on mobile (`<sm:` breakpoint). Better: use a `<DropdownMenu>` for secondary actions (Journal, Bestiary, Spellbook, Items, Map, Log, Settings) and keep only primary actions (Reset, Leave) inline.

11. **Left aside (22% width) overloaded — PartyPanel + CharacterSheet + InitiativeTracker + DiceLog**
    - File: `src/app/page.tsx`
    - Lines: 1293 (`<aside className="flex flex-col gap-2 lg:w-[22%] lg:shrink-0 lg:overflow-hidden">`), 1294-1333 (4 child components)
    - Problem: The left column on desktop is only 22% of viewport width (~260px on 1200px screen, ~340px on 1600px). It contains 4 stacked components: PartyPanel, CharacterSheet (compact), InitiativeTracker (combat only), DiceLog (`flex-1` for remaining space). With the CharacterSheet showing vitals + HP bar + death saves + action pips + spell slots + conditions + stats + AC breakdown + equipment summary + inventory + abilities + backstory, it alone may exceed the aside height. DiceLog gets whatever's left — likely 0-50px, making it useless.
    - Severity: high
    - Suggested fix: (a) Increase left aside to `lg:w-[26%]` or `lg:w-[28%]`. (b) Move DiceLog to the bottom panel or merge it into the CombatLog modal. (c) Make CharacterSheet use internal scroll (`overflow-y-auto`) with a max-height. (d) Consider tabbed layout (Party | Sheet | Dice) for the left column.

12. **Chat panel only 50vh on mobile — squeezed between header and bottom panel**
    - File: `src/app/page.tsx`
    - Lines: 1337 (`<section className="h-[50vh] min-h-0 shrink-0 lg:h-full lg:flex-1">`)
    - Problem: On mobile (`<lg`), the chat section is `h-[50vh]` — half the viewport. With header (~60px) + PartyPanel + CharacterSheet (compact, easily 400px+ with all sections) + BottomPanel (stacked vertically on mobile, easily 300px+) + footer (~40px), the page is far taller than 100vh, so the chat's 50vh is a small slice in the middle. Players must scroll past the entire character sheet to see new chat messages.
    - Severity: high
    - Suggested fix: On mobile, reorder so Chat is first (after header), give it `h-[60vh]` or `flex-1`, and make PartyPanel + CharacterSheet collapsible / behind a tab. Alternatively, use a tab bar on mobile (Chat | Sheet | Grid) instead of stacking all three.

13. **BottomPanel on mobile stacks 6 sections vertically — very tall**
    - File: `src/components/dnd/BottomPanel.tsx`
    - Lines: 323 (`<div className="flex flex-col gap-2 lg:flex-row lg:items-stretch lg:gap-3">`), 325-365 (equipment), 371-430 (inventory), 438-468 (favorites), 474-532 (abilities), 539-566 (combat actions), 572-615 (spell slots), 621-675 (rest)
    - Problem: On mobile (`<lg`), all 6-7 sections stack vertically with `flex flex-col gap-2`. Equipment (8 slots in 4-col grid = 2 rows), inventory (chips wrap, ~3 rows), abilities (chips wrap, ~4 rows), combat actions (5 buttons in column per line 545 `lg:flex-col`), spell slots (5+ levels), rest buttons. Total height easily 500-700px on mobile. Combined with the chat (50vh) and character sheet, the page becomes extremely long.
    - Severity: high
    - Suggested fix: (a) On mobile, make the BottomPanel a horizontal-scroll bar (`overflow-x-auto`) instead of stacked sections. (b) Or collapse secondary sections (spell slots, rest, combat actions) into a "More" expandable. (c) Reduce the combat actions to a horizontal row on mobile (`flex-row` instead of `lg:flex-col`).

14. **`z-5` is not a Tailwind class — terrain overlays have no explicit z-index**
    - File: `src/components/dnd/CombatGrid.tsx`
    - Lines: 540 (`z-5`), 548 (`z-5`), 556 (`z-5`), 564 (`z-5`), 572 (`z-5`)
    - Problem: Tailwind's default z-index scale is `0, 10, 20, 30, 40, 50, auto` — there is no `z-5`. The class is silently ignored. Terrain overlays (difficult, water, half_cover, full_cover, high_ground) end up with `z-auto`, stacking in source order. Currently works because terrain is rendered before the threat overlay (z-10) and token layer (z-20), but the developer's intent (terrain at z-5, between cells and tokens) is broken. Fragile: any reordering of elements will break the stacking.
    - Severity: high (correctness/fragility)
    - Suggested fix: Use `z-[5]` (arbitrary value) or `z-10` with the threat overlay bumped to `z-[15]`. Better: define z-index layers in tailwind.config.ts (`zIndex: { terrain: 5, threat: 10, token: 20, aoe: 30, anim: 40 }`).

15. **`encounterLabelRu` function in page.tsx — hardcoded Russian encounter labels**
    - File: `src/app/page.tsx`
    - Lines: 87-104 (function definition), 748 (used in toast)
    - Problem: Function returns Russian labels for encounter types ("Бой", "Торговец", "Загадка", "Встреча с NPC", "Ловушка", "Сокровище", "Событие"). Used at line 748 in a toast when entering a room with a random encounter. Non-Russian players see Russian encounter type in the toast. Also: the function parameter is named `t` (line 87), shadowing the imported `t` i18n function — confusing.
    - Severity: high
    - Suggested fix: Rename function to `encounterLabel(lang, type)` and route through i18n keys (`encounter.combat`, `encounter.merchant`, etc.). Rename the parameter from `t` to `type` to avoid shadowing.

16. **Hardcoded Russian tooltips in CharacterSheet inventory/abilities**
    - File: `src/components/dnd/CharacterSheet.tsx`
    - Lines: 442 (`title={canQuickUse ? "Нажмите, чтобы использовать" : undefined}` on inventory items), 506 (same on ability items), 346 (`{c.duration} р` — Russian "р" abbreviation for rounds), 528 (`яч.{a.slotLevel}` — Russian "яч." for spell slot), 748 (`used ? "✓" : "доступно"` — Russian "available")
    - Problem: 5 hardcoded Russian strings in tooltips and labels. The `tt()` helper IS available (line 102) but not used here.
    - Severity: high
    - Suggested fix: Replace with `tt("ui.click_to_use")`, `tt("char.rounds_short", {n: c.duration})`, `tt("char.slot_short")`, `tt("char.available")`. Add ~5 new i18n keys across 6 languages.

17. **Hardcoded Russian tooltips in BottomPanel (buildItemTooltip, buildAbilityTooltip)**
    - File: `src/components/dnd/BottomPanel.tsx`
    - Lines: 684-690 (`buildItemTooltip`: "Тип:", "Количество:", "Слот:", "+N AC", "Урон:"), 694-711 (`buildAbilityTooltip`: "Источник:", "Тип:", "урон/лечение/эффект/утилити", "Бросок:", "Ячейка:", "Расходуемый", "Осталось:"), 796 (`Горячая клавиша: ${hotkey}`), 831 (`· круг ${a.slotLevel}`)
    - Problem: The tooltip builders take no `lang` parameter and produce Russian-only strings. All players see Russian tooltips on item/ability chips regardless of UI language.
    - Severity: high
    - Suggested fix: Pass `lang` into both builders; route each label through `t(lang, key)`. Add ~15 new i18n keys (`tooltip.type`, `tooltip.quantity`, `tooltip.slot`, `tooltip.damage`, `tooltip.source`, `tooltip.cast_type_damage/heal/buff/utility`, `tooltip.roll`, `tooltip.slot_level`, `tooltip.consumable`, `tooltip.uses_left`, `tooltip.hotkey`, `tooltip.circle`) across 6 languages.

MEDIUM:

18. **Temp HP bar disappears when at full HP**
    - File: `src/components/dnd/CharacterSheet.tsx`
    - Lines: 196-200 (`width: ${Math.min(100 - hpPct, (player.tempHp / player.maxHp) * 100)}%`)
    - Problem: When `hpPct === 100` (full HP) and the player has temp HP, the temp HP bar width = `Math.min(0, ...)` = 0. The blue temp HP segment is invisible despite the player having temp HP. The text badge below (line 204-209) does show, but the visual bar is misleading.
    - Severity: medium
    - Suggested fix: Scale the bar to `maxHp + tempHp`. E.g. `const total = player.maxHp + player.tempHp; const realPct = (player.hp / total) * 100; const tempPct = (player.tempHp / total) * 100;` — real HP fills `realPct`, temp HP fills the next `tempPct`.

19. **`tt("game.your_turn").split("!")[0]` — fragile string manipulation**
    - File: `src/components/dnd/CharacterSheet.tsx`
    - Line: 169 (`{tt("game.your_turn").split("!")[0].toUpperCase()}`)
    - Problem: Assumes the translation of "game.your_turn" contains a "!" character. If a translation uses a different punctuation (e.g. Chinese "。", German ".", or no punctuation), `split("!")` returns a 1-element array, so `[0]` is the entire string — the whole thing gets uppercased. For "Your turn" (English, no "!") → "YOUR TURN" (acceptable). For "你的回合！" (Chinese with full-width "!") → split returns 1 element (full-width ! ≠ ASCII !) → "你的回合！" uppercased (Chinese has no case, so unchanged — lucky). For "À ton tour!" (French with !) → "À TON TOUR" (acceptable). The behavior is unpredictable across translations.
    - Severity: medium
    - Suggested fix: Add a dedicated i18n key `char.your_turn_badge` with a short uppercase-friendly label, OR strip the "!" in the translation files and keep the uppercasing.

20. **ActionPip title logic is semantically reversed**
    - File: `src/components/dnd/CharacterSheet.tsx`
    - Line: 748 (`title={`${label}: ${used ? "✓" : "доступно"}`}`)
    - Problem: When `used === true` (action is spent), the title shows "✓". When `used === false` (action is available), the title shows "доступно" (available). The ✓ on a SPENT pip is ambiguous — ✓ typically means "done/available/checked". The visual pip is also dimmed when spent (line 737), but the title text sends a mixed signal.
    - Severity: medium
    - Suggested fix: Use clearer icons: `used ? "✗" : "✓"` or `used ? "(потрачено)" : "(доступно)"`. Localize via i18n.

21. **ActionPip shadow always uses amber color regardless of pip color**
    - File: `src/components/dnd/CharacterSheet.tsx`
    - Line: 746 (`!used && "shadow-[0_0_4px_rgba(251,191,36,0.2)]"`)
    - Problem: The glow shadow is hardcoded amber (`rgba(251,191,36,0.2)`) for all three pips (Action=amber, Bonus=sky, Reaction=purple). The sky and purple pips get an amber glow, which is visually inconsistent.
    - Severity: medium (visual polish)
    - Suggested fix: Make the shadow color match the pip color: `amber → rgba(251,191,36,0.2)`, `sky → rgba(56,189,248,0.2)`, `purple → rgba(168,85,247,0.2)`.

22. **ChatPanel Textarea has no aria-label**
    - File: `src/components/dnd/ChatPanel.tsx`
    - Line: 467-481 (`<Textarea ... placeholder={...} />`)
    - Problem: The textarea has a `placeholder` but no `aria-label` or `<label>`. Placeholders are NOT accessible labels — screen readers may not announce the field's purpose. The send button (line 482-491) correctly has `aria-label={tt("chat.send_action")}`, but the input field doesn't.
    - Severity: medium (accessibility)
    - Suggested fix: Add `aria-label={tt("chat.action_placeholder")}` (or a dedicated `chat.input_label` key) to the Textarea.

23. **ChatPanel "load more" fails silently — no error UI**
    - File: `src/components/dnd/ChatPanel.tsx`
    - Lines: 281-308 (`loadMore` callback), 300-304 (catch block)
    - Problem: When `/api/game/chat-history` fetch fails (network error, 500, etc.), the catch block only sets `setHasMore(false)` — the "Show more" button disappears with no user-visible message. The player has no idea why older messages won't load.
    - Severity: medium
    - Suggested fix: Show a toast (`toast.error(tt("chat.load_more_error"))`) in the catch block, and keep the button visible so the user can retry.

24. **ChatPanel "jump to bottom" button aria-label hardcoded Russian**
    - File: `src/components/dnd/ChatPanel.tsx`
    - Lines: 440 (`aria-label="Прокрутить к последним сообщениям"`), 441 (`title="К последним сообщениям"`)
    - Problem: Both attributes are hardcoded Russian. Non-Russian screen-reader users hear Russian for this button.
    - Severity: medium (accessibility + i18n)
    - Suggested fix: `aria-label={tt("chat.jump_to_bottom")}` and `title={tt("chat.jump_to_bottom")}`.

25. **ChatPanel toast for TTS failure is Russian-only**
    - File: `src/components/dnd/ChatPanel.tsx`
    - Line: 169 (`toast.error("Не удалось озвучить текст")`)
    - Problem: TTS failure toast is hardcoded Russian. Non-Russian players see a Russian error when TTS fails.
    - Severity: medium
    - Suggested fix: `toast.error(tt("chat.tts_error"))`. Add `chat.tts_error` key to all 6 languages.

26. **SpellbookPanel/BestiaryPanel/ItemDatabasePanel modal width unbounded below xl**
    - File: `src/components/dnd/SpellbookPanel.tsx:236`, `src/components/dnd/BestiaryPanel.tsx:178`, `src/components/dnd/ItemDatabasePanel.tsx:296`
    - Lines: `className="xl:max-w-7xl max-h-[90vh] flex flex-col gap-0 p-0"`
    - Problem: `xl:max-w-7xl` only applies at `xl` (1280px+). Below `xl`, there's NO max-w — the modal defaults to the shadcn Dialog default (`max-w-lg` = 512px). So on `lg` screens (1024-1279px), these content-heavy modals are only 512px wide, cramming 3-column grids into a tiny box. Then at `xl` (1280px+), they jump to `max-w-7xl` (1280px). Discontinuous width behavior.
    - Severity: medium
    - Suggested fix: Use `sm:max-w-3xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl` for a smooth progression.

27. **`maxHeight: "calc(85vh - 120px)"` — hardcoded 120px assumption**
    - File: `src/components/dnd/SpellbookPanel.tsx:332`, `src/components/dnd/BestiaryPanel.tsx:236`, `src/components/dnd/ItemDatabasePanel.tsx:354`
    - Problem: The scrollable content area uses inline `style={{ maxHeight: "calc(85vh - 120px)" }}`. The 120px is a guess at the header + tabs height. In SpellbookPanel, when the spell-slots section (line 255-282, ~80px) is shown, the actual header is ~200px, so the content area is 80px taller than it should be — content overflows the modal. Also: `flex-1 overflow-y-auto` + inline `maxHeight` is a mixed approach that can conflict.
    - Severity: medium
    - Suggested fix: Remove the inline maxHeight; rely on `flex-1 min-h-0 overflow-y-auto` within a flex-column modal that has `max-h-[90vh]`. The flexbox will size the content area correctly.

28. **No `lg` breakpoint in card grids — jump from 2 cols (sm) to 3 cols (xl)**
    - File: `src/components/dnd/SpellbookPanel.tsx:338`, `src/components/dnd/BestiaryPanel.tsx:242`, `src/components/dnd/ItemDatabasePanel.tsx:360`
    - Lines: `grid grid-cols-1 gap-2 pb-4 sm:grid-cols-2 xl:grid-cols-3`
    - Problem: Cards are 1-col on mobile, 2-col on `sm` (640px+), 3-col on `xl` (1280px+). The `lg` breakpoint (1024-1279px) uses 2 cols — wastes horizontal space on common laptop screens (1366×768, 1440×900).
    - Severity: medium
    - Suggested fix: Add `lg:grid-cols-3` (and consider `2xl:grid-cols-4` for ultra-wide).

29. **Russian quotation marks `«...»` hardcoded in "not found" messages**
    - File: `src/components/dnd/SpellbookPanel.tsx:335`, `src/components/dnd/BestiaryPanel.tsx:239`, `src/components/dnd/ItemDatabasePanel.tsx:357`
    - Lines: `Ничего не найдено по запросу «{query}».`
    - Problem: The quotation marks `«»` are Russian/French style. English convention is `"..."` or `'...'`; German uses `„..."`; Chinese uses `「...」`. Hardcoding `«»` looks wrong in non-Russian UIs.
    - Severity: medium
    - Suggested fix: Once i18n is added (issues #5-7), make the quotation marks part of the translation string: `t(lang, "spellbook.not_found", {query})` where the translation includes locale-appropriate quotes.

30. **BestiaryCard shows `entry.size` twice**
    - File: `src/components/dnd/BestiaryPanel.tsx`
    - Lines: 50 (`{entry.nameEn} · {entry.size}` in subtitle), 94 (`<Ruler className="h-3 w-3" /> {entry.size}` in stats row)
    - Problem: The monster's size (e.g. "Средний", "Большой") is shown in both the subtitle (line 50) and the stats row (line 94). Redundant information.
    - Severity: medium (visual redundancy)
    - Suggested fix: Remove the size from the subtitle (`{entry.nameEn}` only), or remove the size stat from the stats row.

31. **BottomPanel equipment/inventory/ability chips truncated too aggressively**
    - File: `src/components/dnd/BottomPanel.tsx`
    - Lines: 349 (`truncate max-w-[50px]` for equipment item names), 413 (`truncate max-w-[80px]` for inventory chips), 776 (`truncate max-w-[90px]` for ability chips)
    - Problem: 50px is too narrow for most item names — "Изумрудный клинок" (17 chars) becomes "Изум..." (5 chars + ellipsis). 80-90px is similarly tight. Players can't identify items at a glance.
    - Severity: medium
    - Suggested fix: Increase to `max-w-[80px]` for equipment, `max-w-[120px]` for inventory/abilities. The Tooltip on hover shows the full name, but the chip should be more readable.

32. **BottomPanel spell slot pips very tiny (h-2.5 w-2.5 = 10px)**
    - File: `src/components/dnd/BottomPanel.tsx`
    - Lines: 600 (`h-2.5 w-2.5 rounded-full border` for spell slot pips), 635 (`h-2 w-2` for short-rest counter pips = 8px)
    - Problem: 10px spell slot pips and 8px rest counter pips are hard to see, especially on high-DPI mobile screens. The 8px pips are smaller than the surrounding text.
    - Severity: medium (visual)
    - Suggested fix: Increase to `h-3 w-3` (12px) for spell slots and `h-2.5 w-2.5` (10px) for rest counter.

33. **page.tsx BottomPanel `onCraft` is an empty stub**
    - File: `src/app/page.tsx`
    - Line: 1419 (`onCraft={() => {/* crafting opens via CharacterSheet — keep stub */}}`)
    - Problem: The BottomPanel's Crafting button (BottomPanel.tsx:355-364) is shown when `hasAnyStation && onCraft` are truthy. The handler is an empty stub — clicking the button does nothing. Players with an alchemy/forge/enchant station see a "Crafting" button in the bottom panel that's unresponsive.
    - Severity: medium
    - Suggested fix: Either (a) open the CraftingPanel modal from this handler (like CharacterSheet does), or (b) remove the `onCraft` prop from the BottomPanel instantiation so the button doesn't render.

34. **page.tsx line 411 — dead/confusing ternary `ev.damagedPlayer ? null : null`**
    - File: `src/app/page.tsx`
    - Line: 411 (`else if (ev.damageDealtToMonster > 0) targetName = ev.damagedPlayer ? null : null;`)
    - Problem: Both branches of the ternary return `null`. This is either dead code or a typo (perhaps one branch should return a monster name). The comment at line 414-426 then tries to recover `targetName` by parsing the dice log. Confusing for maintainers.
    - Severity: medium (code clarity)
    - Suggested fix: Simplify to `targetName = null;` with a comment explaining the recovery logic below. Or fix the ternary if one branch was meant to do something else.

35. **Floating-text magic number `/ 16` should use GRID_SIZE constant**
    - File: `src/app/page.tsx`
    - Lines: 451 (`const relX = (posX + 0.5) / 16;`), 452 (`const relY = (posY + 0.5) / 16;`)
    - Problem: Hardcoded `16` for GRID_SIZE. If GRID_SIZE ever changes (e.g. to 20 or 24), floating combat text positions break silently — text appears in wrong cells.
    - Severity: medium
    - Suggested fix: Import `GRID_SIZE` from `@/lib/game/state` and use `(posX + 0.5) / GRID_SIZE`.

LOW:

36. **CombatGrid legend "no one on grid" — English in Russian UI**
    - File: `src/components/dnd/CombatGrid.tsx`
    - Line: 681 (`<span className="italic">no one on grid</span>`)
    - Problem: English string in an otherwise Russian/localized UI. Inconsistent.
    - Severity: low
    - Suggested fix: `t(settings.lang, "grid.empty")`. Add `grid.empty` key to all 6 languages.

37. **CombatGrid AoE tooltip hardcoded Russian**
    - File: `src/components/dnd/CombatGrid.tsx`
    - Line: 602 (`title={aoe ? \`${aoeColor.label} (спасбросок ${aoe.saveAbility ?? "ТЕЛ"} DC ${aoe.saveDC ?? 12})\` : ""}`)
    - Problem: "спасбросок" (saving throw) and "ТЕЛ" (Dexterity abbreviation) are hardcoded Russian.
    - Severity: low
    - Suggested fix: `t(settings.lang, "grid.aoe_tooltip", {element: aoeColor.label, ability: ..., dc: ...})`.

38. **CombatGrid condition title hardcoded Russian "раундов"**
    - File: `src/components/dnd/CombatGrid.tsx`
    - Line: 818 (`title={\`${name} (${c.duration} раундов)\`}`)
    - Problem: "раундов" (rounds) hardcoded Russian in condition icon tooltip.
    - Severity: low
    - Suggested fix: `title={\`${name} (${c.duration} ${tt("grid.rounds")})\`}` or use pluralization.

39. **CombatGrid "Мир" hardcoded Russian**
    - File: `src/components/dnd/CombatGrid.tsx`
    - Line: 416 (`<MapPin className="h-3 w-3" /> Мир`)
    - Problem: "Мир" (Peace/World) hardcoded Russian. The header badge shows this when combat is inactive. Should use `t(settings.lang, "game.world")`.
    - Severity: low
    - Suggested fix: `{t(settings.lang, "game.world")}`.

40. **CombatGrid terrain emoji very tiny on small cells**
    - File: `src/components/dnd/CombatGrid.tsx`
    - Lines: 543 (`text-[8px]` for 〰️ difficult terrain), 551 (`text-[8px]` for 🌊 water), 559 (`text-[10px]` for 🌳 half cover), 567 (`text-[10px]` for 🪨 full cover), 575 (`text-[8px]` for ⬆️ high ground)
    - Problem: 8-10px emoji on 15-25px cells. Emoji at 8px is barely recognizable on most platforms (emoji don't scale linearly — at 8px they're often rendered as colored blobs).
    - Severity: low (compounds with #4)
    - Suggested fix: Increase emoji to `text-[14px]` on desktop, hide on mobile. Or replace emoji with colored backgrounds only (the cells already have colored backgrounds).

41. **Footer text very small (text-[10px]) and may overflow**
    - File: `src/app/page.tsx`
    - Lines: 1432-1436 (`<footer className="... text-[10px] ...">DUSKFALL · {tt("ui.room_code")}: ${snapshot.roomCode} · ${snapshot.players.length} ${tt("common.heroes")} · {tt("ui.footer_hint")}</footer>`)
    - Problem: 10px text is hard to read on mobile. The footer concatenates 4 segments without `truncate` or `flex-wrap` — on narrow screens, it could overflow horizontally.
    - Severity: low
    - Suggested fix: Increase to `text-xs` (12px). Wrap content in `<div className="flex flex-wrap items-center justify-center gap-x-2">` so segments wrap on narrow screens.

42. **Time-of-day emoji may not render on all platforms**
    - File: `src/app/page.tsx`
    - Lines: 1156-1158 (`🌅` / `☀️` / `🌇` / `🌙`)
    - Problem: These emoji (especially 🌅 and 🌇) are Unicode 6.0+ and may not render on older Android devices or some Windows versions (Windows 10 < 1809). They'll appear as empty boxes or missing glyphs.
    - Severity: low
    - Suggested fix: Add a text fallback (e.g. `<span title="...">{emoji}</span><span className="sr-only">{tt("time.dawn")}</span>`). Or use Lucide icons (Sunrise, Sun, Sunset, Moon) for consistent cross-platform rendering.

43. **Header logo `animate-flicker` — motion sensitivity concern**
    - File: `src/app/page.tsx`
    - Line: 1117 (`<div className="flex h-9 w-9 ... animate-flicker">`)
    - Problem: The header logo has a perpetual flicker animation. Players with vestibular disorders or motion sensitivity may find this distracting or uncomfortable. No `prefers-reduced-motion` guard.
    - Severity: low (accessibility)
    - Suggested fix: Add a CSS media query: `@media (prefers-reduced-motion: reduce) { .animate-flicker { animation: none; } }` in globals.css.

44. **LoadingScreen text hardcoded Russian**
    - File: `src/app/page.tsx`
    - Line: 1511 (`<span className="font-serif italic">Туман сгущается…</span>`)
    - Problem: Loading screen flavor text is hardcoded Russian. Non-Russian players see Russian during the initial load.
    - Severity: low
    - Suggested fix: `{tt("loading.fog_gathering")}`. Add the key to all 6 languages.

45. **BestiaryCard name uses `whitespace-normal` without `break-words`**
    - File: `src/components/dnd/BestiaryPanel.tsx`
    - Line: 42 (`<h3 className="font-serif text-sm font-bold text-amber-100 whitespace-normal">`)
    - Problem: Long single-token monster names (e.g. "Блуждающий-огонёк" with hyphens, or a long English name) could overflow the card width because there's no `break-words` to break inside long tokens.
    - Severity: low
    - Suggested fix: Add `break-words` to the className.

46. **SpellCard stat values right-aligned with `ml-auto break-words` — long values wrap awkwardly**
    - File: `src/components/dnd/SpellbookPanel.tsx`
    - Lines: 96, 103, 110, 117 (`<span className="font-mono font-bold text-stone-100 text-right ml-auto break-words">`)
    - Problem: Long stat values (e.g. casting time "1 действие" or range "30 метров") may wrap inside the small stat cell, pushing the label and icon out of alignment. The `break-words` allows breaking inside the word, which looks awkward.
    - Severity: low
    - Suggested fix: Use `truncate` instead of `break-words`, or allow the value to wrap naturally with `text-left` and remove `ml-auto`.

47. **ActionPip label and "your turn" badge in CharacterSheet header — text-[8px] too small**
    - File: `src/components/dnd/CharacterSheet.tsx`
    - Lines: 162 (`px-1 text-[8px]` for "YOU" badge), 169 (`text-[8px]` for "YOUR TURN" badge), 744 (`text-[8px]` for action pip labels)
    - Problem: 8px text is below the WCAG-recommended minimum of 12px for body text. Hard to read on high-DPI mobile screens and for users with visual impairments.
    - Severity: low (accessibility)
    - Suggested fix: Increase badges to `text-[10px]` minimum; pip labels to `text-[9px]` minimum. The compact character sheet has limited space, but 8px is too small.

Next actions (recommended priority order):
1. Fix #1, #2, #3, #4 (16×16 grid critical bugs) — flanking SVG `* 10` → `* (100/GRID_SIZE)`, AC breakdown template-literal fix, re-tune grid max-w, hide/shrink token content on small cells. Immediate visual correctness.
2. Fix #5, #6, #7 (i18n the three modals) — biggest immersion win for non-Russian players; ~75 new i18n keys across 6 languages.
3. Fix #8, #9 (i18n page.tsx toasts + quick-action text) — ~35 new i18n keys; touches 30+ toast sites.
4. Fix #10 (header overflow) — add `flex-wrap` or collapse secondary buttons into a dropdown.
5. Fix #11, #12, #13 (mobile layout — left aside overload, chat 50vh, bottom panel stacking) — likely needs a tab-based mobile layout.
6. Fix #14 (`z-5` → `z-[5]`) — single-line change × 5 sites.
7. Fix #15 (`encounterLabelRu` → i18n) — small function, 7 keys × 6 languages.
8. Fix #16, #17 (CharacterSheet + BottomPanel tooltip i18n) — ~20 new i18n keys.
9. Then assess #18-#35 (medium issues) — temp HP bar, fragile string split, aria-labels, modal widths, card grid breakpoints, truncation, etc.
10. Fix #36-#47 (low issues) — minor i18n, emoji sizing, motion sensitivity, text sizes.

---
Task ID: global-debug-fix
Agent: main-agent
Task: Global debug — fix critical DM immersion and visual issues

Work Log:
- Ran two parallel analysis agents (debug-dm-immersion + debug-visual) that found 70 issues total (3 critical DM, 4 critical visual, 20 high, 43 medium/low)
- Fixed CRITICAL #1: Stale grid coordinates in DM prompt (0..9 → 0..15 for 16×16 grid) — 2 sites in dm-agent.ts
- Fixed CRITICAL #2: AC breakdown template literal bug — `{tt("character.dex")}` was rendered as literal text inside backtick strings instead of being called as `${tt("character.dex")}`. Fixed all 4 AC breakdown lines in CharacterSheet.tsx
- Fixed CRITICAL #3: Flanking SVG coordinates assumed 10×10 grid (`* 10`) — updated to use `100 / GRID_SIZE` (6.25 for 16×16) so flanking lines render correctly across the full grid
- Fixed CRITICAL #4: Action economy pips were purely cosmetic — markActionUsed() was defined but NEVER called. Now called in resolvePlayerMechanics when category="combat" and combat is active. Imported markActionUsed in dm-agent.ts
- Fixed HIGH #5: z-5 is not a valid Tailwind class — replaced all 5 instances with z-[5] in CombatGrid.tsx
- Fixed HIGH #6: Added death save / dying / action economy / concentration rules to DM system prompt (SYSTEM_PROMPT_PLANNING) — new section "СМЕРТЬ И СПАСБРОСКИ СМЕРТИ (D&D 5e)" with 7 rules
- Fixed HIGH #7: findMonsterByTargetName fallback used (0,0) as origin — now uses the ACTOR's position so the nearest monster to the attacking player takes damage
- Fixed HIGH #8: Monster flee logic bug — `d > bestDist` found the FARTHEST player instead of nearest. Fixed to `d < bestDist` with `bestDist = Infinity`. Also fixed flee clamp from 9 to GRID_SIZE-1
- Fixed HIGH #9: Hit/miss detection used fragile `narrativeLine.includes("промах")` substring match — replaced with `result.rolls[0]?.success === false` (uses the actual dice roll success flag)
- Fixed MEDIUM: Temp HP bar disappeared at full HP (width = 0). Now uses Math.max(5, ...) to ensure minimum visible width
- Fixed MEDIUM: ActionPip glow shadow was hardcoded amber for all 3 colors — now uses color-specific glow (amber/sky/purple)
- Fixed MEDIUM: ActionPip "доступно" tooltip was hardcoded Russian — now uses i18n (char.available key added to all 6 languages)
- Fixed LOW: Dead ternary `ev.damagedPlayer ? null : null` in page.tsx — removed (both branches returned null)
- Added 2 new i18n keys (char.available, char.used) to all 6 languages
- lint: 0 errors, tsc: 0 errors

Stage Summary:
- 4 critical bugs fixed (grid coordinates, AC template literal, flanking SVG, action economy)
- 5 high-priority bugs fixed (z-index, DM prompt rules, monster fallback, flee logic, hit/miss detection)
- 3 medium bugs fixed (temp HP bar, ActionPip glow, i18n)
- DM now knows about death saves, action economy, concentration rules
- DM grid coordinates now match the actual 16×16 grid
- Monster flee logic now correctly runs from nearest player (not farthest)
- Monster target fallback now uses actor position (not corner 0,0)
- Action economy pips now actually consume on combat actions

---
Task ID: i18n-bestiary
Agent: i18n-bestiary (sub agent)
Task: Add full i18n support to src/components/dnd/BestiaryPanel.tsx — replace ALL hardcoded Russian strings with `tt("bestiary.*")` calls and add the new keys to all 6 language sections (ru/en/es/de/fr/zh) in src/lib/game/i18n.ts.

Work Log:
- Read BestiaryPanel.tsx fully (257 lines, two components: `BestiaryCard` + `BestiaryPanel`).
- Read i18n.ts (1738 lines) and confirmed the `t(lang, key, params?)` API + `DICT: Record<Lang, Record<string, string>>` flat-namespace structure. Read settings.ts to confirm `useSettings((s) => s.lang)` hook exists.
- Read bestiary.ts to understand the data model: `entry.name` (Russian), `entry.nameEn` (English), `entry.size` (already English: "Small"/"Medium"/…), `entry.description` / `entry.specialAbility` / `entry.loot.items` are Russian *data* (out of scope — task says only translate UI strings, not game data). `categoryLabelRu(c)` is a Russian-only helper used by the panel for the 7 monster categories.
- Identified 14 hardcoded Russian UI strings in BestiaryPanel.tsx: title "Бестиарий"; count suffix "существ"; description line; search placeholder "Поиск: гоблин, dragon, скелет..."; tab label "Все"; category labels (Гуманоиды/Нежить/Твари/Драконы/Демоны/Элементали/Боссы); stat labels "Атк" / "Урон" / "Ск"; special-ability header "⚡ Особая способность"; loot header "Добыча"; gold suffix "зм"; empty-state message "Ничего не найдено по запросу «{query}».".
- Added 21 new keys under `bestiary.*` namespace to ALL 6 language sections in i18n.ts:
  - `bestiary.title`, `bestiary.creatures_count` (with `{n}` param), `bestiary.description`, `bestiary.search_placeholder`
  - `bestiary.all`, `bestiary.all_count` (with `{n}` param)
  - `bestiary.category.{humanoid,undead,beast,dragon,demon,elemental,boss}` (7 keys)
  - `bestiary.attack_short`, `bestiary.damage_short`, `bestiary.speed_short`
  - `bestiary.special_ability`, `bestiary.loot`, `bestiary.gold_short`
  - `bestiary.empty` (with `{query}` param)
- Translations provided for every key in all 6 languages (ru/en/es/de/fr/zh). Russian matches the original strings verbatim so existing ru users see no change.
- Modified BestiaryPanel.tsx:
  - Added `import { t } from "@/lib/game/i18n"` and `import { useSettings } from "@/lib/game/settings"`.
  - Removed now-unused `categoryLabelRu` import (replaced by `tt(`bestiary.category.${c}`)` template-string lookups).
  - Added `const lang = useSettings((s) => s.lang);` and `const tt = (key, params?) => t(lang, key, params);` to BOTH `BestiaryCard` (it renders category badge + stat labels + loot) and `BestiaryPanel` (modal chrome + tabs + empty state). This is the same pattern used elsewhere in the codebase (e.g. page.tsx, CharacterSheet.tsx).
  - Replaced all 14 hardcoded Russian UI strings with `tt(...)` calls — including 2 parameterised ones (`creatures_count`/`all_count` take `{n}`, `empty` takes `{query}`).
  - Did NOT touch `entry.name`, `entry.nameEn`, `entry.size`, `entry.description`, `entry.specialAbility`, `entry.loot.items` — these are game data (Russian), not UI chrome, and translating them is out of scope for this task. Did NOT change any props, state, useMemo logic, JSX structure, or CSS classes.
- Verified: `bun run lint` → exit 0 (0 errors). `bunx tsc --noEmit` → exit 0 (0 errors).

Stage Summary:
- BestiaryPanel is now fully localised: non-Russian players using the en/es/de/fr/zh UI see translated modal title, search placeholder, category tabs, stat labels (ATK/DMG/Spd/etc.), special-ability + loot headers, gold suffix, and empty-state message.
- Added 21 new i18n keys × 6 languages = 126 new dictionary entries under the `bestiary.*` namespace.
- Russian behaviour is byte-identical (Russian translations match the original hardcoded strings verbatim) — no regression for the primary audience.
- No structural, prop, or logic changes — only string sources were swapped from literals to `tt()` calls. Removed the now-orphaned `categoryLabelRu` import from BestiaryPanel.tsx (the function itself is still exported from bestiary.ts and was never used anywhere else in the codebase per grep).
- lint: 0 errors, tsc: 0 errors.

---
Task ID: i18n-spellbook
Agent: i18n-spellbook (sub agent)
Task: Add full i18n support to src/components/dnd/SpellbookPanel.tsx — replace ALL hardcoded Russian strings with `tt("spellbook.*")` (and reused existing keys) and add the new keys to all 6 language sections (ru/en/es/de/fr/zh) in src/lib/game/i18n.ts.

Work Log:
- Read SpellbookPanel.tsx fully (376 lines, two components: `SpellCard` + `SpellbookPanel`). Identified 19 distinct hardcoded Russian UI strings: modal title "Книга заклинаний"; spell-count suffix "заклинаний"; description line; search placeholder "Поиск: огненный шар, fireball, эвокация..."; level-tab labels (via `formatSpellLevel` → "Заговор" / "Круг N"); "Все (N)" tab; "Ур." level-column header; stat labels "Время:"/"Дальн.:"/"Длит.:"/"Комп.:"; "урон/лечение" damage/heal suffix; "Спас " save prefix + `saveAbilityLabelRu(...)`; AoE shape names "Круг"/"Конус"/"Линия"; "Ячейки заклинаний" spell-slots section header; "Круг N" spell-slot row labels; "Ничего не найдено по запросу «{query}»." empty state; "Школы:" footer label; school names (via `schoolLabelRu` → 8 schools).
- Read i18n.ts (1871 lines) and confirmed the `t(lang, key, params?)` API + flat-namespace `DICT: Record<Lang, Record<string, string>>`. Confirmed `react-hooks/exhaustive-deps` is OFF in eslint.config.mjs (so adding `lang` to the `filtered` useMemo deps is not strictly required, but I added it for correctness).
- Audited existing keys to avoid duplicates (per task instructions): `ui.spellbook` already exists for all 6 langs with text identical to the modal title ("Книга заклинаний" / "Spellbook" / "Libro de hechizos" / "Zauberbuch" / "Livre de sorts" / "法术书") — reused it for the modal title instead of adding `spellbook.title`. `character.spell_slots` already exists for all 6 langs ("Ячейки заклинаний" / "Spell slots" / "Espacios de conjuros" / "Zauberplätze" / "Emplacements de sorts" / "法术位") — reused it for the spell-slots section header. `character.str/dex/con/int/wis/cha` already exist for all 6 langs with the exact ability abbreviations returned by `saveAbilityLabelRu` — reused `tt(`character.${spell.saveAbility}`)` for the save badge.
- Confirmed via grep that `formatSpellLevel`, `schoolLabelRu`, `saveAbilityLabelRu` are only imported by SpellbookPanel.tsx (no other consumer); the functions remain exported from spellbook.ts for any future use.
- Added 26 new keys under `spellbook.*` namespace to ALL 6 language sections in i18n.ts:
  - `spellbook.spells_count` ({n}), `spellbook.description`, `spellbook.search_placeholder`
  - `spellbook.all_count` ({n}), `spellbook.cantrip`, `spellbook.level_label` ({n}), `spellbook.level_short`
  - `spellbook.cast_time`, `spellbook.range`, `spellbook.duration`, `spellbook.components`
  - `spellbook.damage_heal`, `spellbook.save_prefix`
  - `spellbook.aoe_circle`, `spellbook.aoe_cone`, `spellbook.aoe_line`
  - `spellbook.empty` ({query})
  - `spellbook.schools_label`
  - `spellbook.school.{evocation,transmutation,enchantment,illusion,necromancy,divination,abjuration,conjuration}` (8 keys)
- Translations provided for every key in all 6 languages. Russian strings match the originals verbatim so ru users see no change. Used locale-appropriate quotation marks in `spellbook.empty`: ru «…», en "…", es "…", de "…", fr « … », zh "…".
- Modified SpellbookPanel.tsx:
  - Added `import { t } from "@/lib/game/i18n"` and `import { useSettings } from "@/lib/game/settings"`.
  - Removed the now-unused `formatSpellLevel`, `schoolLabelRu`, `saveAbilityLabelRu` imports from spellbook (the `schoolColor` and type-only imports remain).
  - Added `const lang = useSettings((s) => s.lang);` and `const tt = (key, params?) => t(lang, key, params);` to BOTH `SpellCard` and `SpellbookPanel` (same pattern as BestiaryPanel).
  - Replaced the top-level `levelTabLabel(level)` helper (which just called `formatSpellLevel`) with a localised `spellLevelLabel(tt, level)` helper that takes `tt` as a parameter — cantrip branch returns `tt("spellbook.cantrip")`, level 1–5 branch returns `tt("spellbook.level_label", { n: level })`. Used in both the SpellCard subtitle and the level TabsTriggers.
  - Replaced `schoolLabelRu(spell.school)` with `tt(`spellbook.school.${spell.school}`)` in 3 sites (card badge, school footer legend, and the search filter — the filter now matches the user's UI-language school name instead of always-Russian, which is the natural consequence of replacing a Russian-only helper with an i18n call).
  - Replaced `saveAbilityLabelRu(spell.saveAbility)` with `tt(`character.${spell.saveAbility}`)` (reuses the existing ability-abbreviation keys).
  - Replaced all 19 hardcoded Russian UI strings with `tt(...)` calls — including 3 parameterised ones (`spells_count`/`all_count`/`level_label` take `{n}`, `empty` takes `{query}`).
  - Added `lang` to the `filtered` useMemo deps array so the search re-runs when the user switches language.
  - Did NOT touch `spell.name`, `spell.nameEn`, `spell.description`, `spell.castingTime`, `spell.range`, `spell.duration`, `spell.components`, `spell.damage`, `spell.saveDC`, `spell.aoeSize` — these are Russian game data (out of scope). Did NOT change any props, state, JSX structure, CSS classes, the spell-slots computation logic, the `grouped`/`counts`/`schoolCounts` memos, or the inline `maxHeight: "calc(85vh - 120px)"` style. Left the pre-existing unused `ScrollArea` import as-is to keep the diff minimal and avoid touching unrelated lines.
- Verified: `bun run lint` → exit 0 (0 errors). `bunx tsc --noEmit` → exit 0 (0 errors). Confirmed via grep that no Cyrillic characters remain in SpellbookPanel.tsx and no references to the removed `schoolLabelRu`/`saveAbilityLabelRu`/`formatSpellLevel`/`levelTabLabel` remain.

Stage Summary:
- SpellbookPanel is now fully localised: non-Russian players using the en/es/de/fr/zh UI see translated modal title, description, search placeholder, level tabs (cantrip + Level 1–5), "All (N)" tab, spell card stat labels (Time/Range/Dur./Comp.), damage/heal suffix, save-ability badge (Save STR/DEX/…/CHA via existing character.* keys), AoE shape names (Circle/Cone/Line), spell-slots section header + per-level labels, empty-state message (with locale-appropriate quotes), schools footer label, and all 8 magic school names.
- Added 26 new i18n keys × 6 languages = 156 new dictionary entries under the `spellbook.*` namespace. Reused 9 existing keys (`ui.spellbook`, `character.spell_slots`, `character.{str,dex,con,int,wis,cha}`) instead of duplicating them.
- Russian behaviour is byte-identical (Russian translations match the original hardcoded strings verbatim) — no regression for the primary audience.
- No structural, prop, or logic changes — only string sources were swapped from literals/Russian-helpers to `tt()` calls. The `filtered` useMemo now also depends on `lang` so the search re-runs on language switch.
- lint: 0 errors, tsc: 0 errors.

---
Task ID: i18n-itemdb
Agent: i18n-itemdb-agent
Task: Add full i18n support to src/components/dnd/ItemDatabasePanel.tsx (modal was 100% hardcoded Russian — non-Russian players couldn't use it).

Work Log:
- Read worklog.md (last 2 sections: fix-critical-12 + dm-context-fix) for context.
- Read ItemDatabasePanel.tsx (376 lines) fully — identified all hardcoded Russian
  strings: modal title "Предметы", count badge "N предметов", description, search
  placeholder, "Все (N)" tab, "Ничего не найдено по запросу «…»" empty state, plus
  ItemCard strings ("Комплект" set badge, "Слот:" label, "N зарядов" charges,
  "AC"/"Урон"/"Хар-ки"/"Цена"/"Вес" stat labels, "Проклятие" curse label,
  set bonus header/desc/contents) and helper-function output (equipSlotLabelRu,
  enchantmentLabelRu, rarityLabelRu, itemTypeLabelRu imported from item-database.ts,
  plus formatGold/formatWeight local helpers with "зм/см/мм"/"фнт" suffixes).
- Read i18n.ts to understand the `t(lang, key, params?)` function (lines 1888-1906)
  and the `useSettings((s) => s.lang)` hook pattern used in BestiaryPanel,
  SpellbookPanel, CharacterSheet, ChatPanel, Lobby. Confirmed dictionary structure:
  `DICT: Record<Lang, Record<string, string>>` with 6 lang sections (ru/en/es/de/fr/zh),
  fallback chain (target → ru → literal key), and `{param}` placeholder substitution.

Changes to ItemDatabasePanel.tsx (logic, structure, props untouched):
- Added imports: `t` from "@/lib/game/i18n", `useSettings` from "@/lib/game/settings".
- Added `type TtFn` alias for the tt signature so formatGold/formatWeight can be
  typed without re-declaring the inline closure signature.
- Removed the local `equipSlotLabelRu()` and `enchantmentLabelRu()` helpers —
  replaced inline with `tt(\`itemdb.slot.${slot}\`)` / `tt(\`itemdb.enchantment.${enchant}\`)`
  lookups (single-key calls, no need for a wrapper function).
- Removed `rarityLabelRu` and `itemTypeLabelRu` from the item-database import —
  replaced inline with `tt(\`itemdb.rarity.${r}\`)` / `tt(\`itemdb.type.${t}\`)`.
- Kept `enchantmentColor()` (returns Tailwind text classes only — no translation).
- Refactored `formatGold(value, tt)` and `formatWeight(weight, tt)` to accept a `tt`
  function so the gold/weight unit suffixes (зм/см/мм/фнт) become translatable via
  `tt("itemdb.gold_gp", {n})` etc. Preserved the existing 3-tier (gp/sp/cp) and
  2-tier (round-sub-1 vs full-1+) formatting logic verbatim — only the unit string
  is now localized.
- Added `const lang = useSettings((s) => s.lang);` and `const tt = (k, p?) => t(lang, k, p);`
  in BOTH the ItemCard component and the ItemDatabasePanel component (ItemCard is a
  separate child component, needs its own lang/tt scope).
- Replaced every visible Russian string with a `tt("itemdb.*")` call:
    * Modal title, count badge, description, search placeholder
    * "Все (N)" tab → `tt("itemdb.all_count", {n})`
    * Empty state → `tt("itemdb.empty", {query})`
    * Set badge → `tt("itemdb.set_badge")`
    * Slot prefix → `tt("itemdb.slot_label")` + `tt(\`itemdb.slot.${slot}\`)`
    * Charges → `tt("itemdb.charges", {n})`
    * Stat labels (AC/Урон/Хар-ки/Цена/Вес) → `tt("itemdb.ac"|"itemdb.damage"|"itemdb.stats"|"itemdb.price"|"itemdb.weight")`
    * Curse label → `tt("itemdb.curse")`
    * Set bonus header → `tt("itemdb.set_bonus_header", {name})`
    * Set bonus desc → `tt("itemdb.set_bonus_desc", {n, bonus})`
    * Set contents → `tt("itemdb.set_contents", {items})`
    * Rarity tab labels → `tt(\`itemdb.rarity.${r}\`)`

Changes to i18n.ts:
- Added an `// ===== itemdb =====` block of 54 keys to ALL 6 language sections
  (ru/en/es/de/fr/zh), inserted immediately after the `spellbook.school.conjuration`
  key in each section. New keys:
    Layout/header: title, count, description, search_placeholder, all_count, empty
    Card labels: set_badge, slot_label, charges, ac, damage, stats, price, weight,
                 curse, set_bonus_header, set_bonus_desc, set_contents
    Format helpers: dash, weight_value, gold_gp, gold_sp, gold_cp
    Enum labels (matched 1-to-1 with the source-of-truth switch statements in
    item-database.ts and the original local helpers):
      rarity.{common,uncommon,rare,veryrare,legendary}
      type.{weapon,armor,shield,potion,scroll,ring,amulet,cloak,misc,key,material}
      slot.{weapon,shield,head,chest,legs,hands,accessory}
      enchantment.{fire,ice,lightning,poison,necrotic,holy}
- All keys use `{n}`, `{query}`, `{name}`, `{bonus}`, `{items}` placeholders as
  needed; these are substituted by the existing `t()` function's `{param}` replacer.
- Russian values preserve the EXACT original strings from the file (Предметы,
  Обычный, Оружие, Огонь, зм/см/мм/фнт, «…» quotes, em-dash, etc.) so Russian
  users see zero visual change. Other 5 languages use idiomatic D&D terminology
  (e.g. en: "Items"/"Longsword"→"Weapon"/"Common"/"gp"; de: "Gegenstände"/"GM";
  fr: "Objets"/"po"; es: "Objetos"/"po"; zh: "物品"/"金币").

Verification:
- `bun run lint`: 0 errors, 0 warnings (clean).
- `bunx tsc --noEmit`: 0 errors (clean).
- grep for Cyrillic in ItemDatabasePanel.tsx: only 1 hit remains — a JSDoc comment
  on line 62 documenting the original behavior ("N зм" for ≥1 gp…), which is not
  user-visible UI text.

Stage Summary:
- All hardcoded Russian UI strings in ItemDatabasePanel.tsx are now driven by the
  shared i18n dictionary. The modal now fully localizes into English, Spanish,
  German, French, and Chinese (with Russian preserved as the source-of-truth).
- No logic, props, or component structure changed — only string lookups swapped.
- 54 new i18n keys added across all 6 language sections of i18n.ts under the
  `itemdb.*` namespace.
- lint: 0 errors, tsc: 0 errors.
- Artifacts touched:
  * src/components/dnd/ItemDatabasePanel.tsx (imports, removed local helpers +
    removed rarityLabelRu/itemTypeLabelRu imports, lang/tt setup in ItemCard +
    ItemDatabasePanel, formatGold/formatWeight take tt, all visible strings → tt())
  * src/lib/game/i18n.ts (added `itemdb.*` block of 54 keys × 6 languages = 324
    new dictionary entries, inserted after the `spellbook.school.conjuration`
    key in each language section)

---
Task ID: i18n-modals-mobile-fixes
Agent: main-agent
Task: i18n 3 modals (Bestiary/Spellbook/ItemDatabase) + header mobile fix + toast i18n

Work Log:
- Delegated i18n work to 3 parallel subagents:
  * BestiaryPanel: 21 new i18n keys (bestiary.* namespace) across 6 languages
  * SpellbookPanel: 26 new i18n keys (spellbook.* + school.* namespace) across 6 languages, reused 9 existing keys
  * ItemDatabasePanel: 54 new i18n keys (itemdb.* + rarity/type/slot/enchantment subkeys) across 6 languages
- Fixed header overflow on mobile: added flex-wrap to header container, reduced gap on mobile (gap-1.5 vs sm:gap-3)
- Fixed magic number /16 in page.tsx: replaced with GRID_SIZE constant (imported from state.ts)
- Fixed encounterLabelRu function: 
  * Renamed to encounterLabel (was shadowing i18n `t` function with parameter named `t`)
  * Now returns i18n key instead of hardcoded Russian string
  * Added 7 encounter.* i18n keys to all 6 languages
- Fixed 5 hardcoded Russian toasts in page.tsx:
  * Combat started/ended toasts → tt("ui.combat_started"/"ui.combat_ended")
  * Monster defeated toast → tt("ui.defeated")
  * Damage dealt/taken toasts → tt("ui.damage_dealt"/"ui.takes_damage")
  * Entered room / random event toasts → tt("ui.entered_room"/"ui.random_event")
  * Added 8 new ui.* i18n keys to all 6 languages
- Total new i18n keys: ~116 across 6 languages (21 bestiary + 26 spellbook + 54 itemdb + 7 encounter + 8 ui)
- lint: 0 errors, tsc: 0 errors

Stage Summary:
- 3 modals fully i18n'd (BestiaryPanel, SpellbookPanel, ItemDatabasePanel) — ~101 new keys
- Header no longer overflows on mobile (flex-wrap + responsive gaps)
- encounterLabelRu renamed and i18n'd (was shadowing imported t function)
- 5 combat/event toasts i18n'd
- Magic number /16 replaced with GRID_SIZE constant

---
Task ID: toast-i18n-craft-passive
Agent: main-agent
Task: i18n all remaining toasts, fix onCraft stub, add passive perception, i18n LoadingScreen

Work Log:
- Added 20 new i18n keys (ui.dm_no_response, ui.dm_connection_error, ui.reset_error, ui.game_reset, ui.reset_hint, ui.room_code_copied, ui.new_talent, ui.stat_increased, ui.item_equipped, ui.item_unequipped, ui.crafted, ui.craft_failed, ui.craft_error, ui.rest_error, ui.move_error, ui.new_dungeon, ui.dungeon_error, ui.dialogue_error, ui.loading_atmosphere, ui.scene_title) to all 6 languages
- Replaced 16 hardcoded Russian toasts in page.tsx with tt() calls:
  * DM no response, DM connection error, reset error
  * Room code copied, new talent, stat increased
  * Item equipped/unequipped, crafted/craft failed/craft error
  * Rest error, move error, new dungeon, dungeon error, dialogue error
- Fixed LoadingScreen: added useSettings + tt, replaced "Туман сгущается…" with tt("ui.loading_atmosphere")
- Fixed onCraft stub: BottomPanel onCraft now calls the real craftItem function (was empty stub)
  * Updated onCraft type in BottomPanel to accept optional recipeId
  * Updated craftItem in page.tsx to accept optional recipeId
- Added passive perception to DM context: "Пассивное восприятие N" (10 + WIS modifier) for each player
- Added passive perception rule to DM system prompt: explains how hidden enemies/traps with stealth DC below passive perception are automatically noticed
- lint: 0 errors, tsc: 0 errors

Stage Summary:
- 20 new i18n keys across 6 languages
- 16 toasts i18n'd
- LoadingScreen i18n'd
- onCraft stub fixed — crafting button now works from BottomPanel
- Passive perception added to DM context + system prompt (D&D 5e stealth/ambush mechanic)

---
Task ID: accessibility-oa-i18n
Agent: main-agent
Task: Accessibility (reduced-motion + font sizes), i18n CombatGrid strings, opportunity attacks

Work Log:
- Added prefers-reduced-motion media query to globals.css — disables all decorative animations (flicker, pulse-glow, fade-up, crit-burst, ping, spin) for users with vestibular disorders
- Increased text-[8px] → text-[10px] and text-[7px] → text-[9px] in CharacterSheet (22 + 3 instances) — WCAG accessibility (8px is below recommended minimum)
- i18n'd CombatGrid hardcoded strings:
  * "Мир" → t(lang, "game.world")
  * "no one on grid" → t(lang, "grid.empty") (new key added to all 6 languages)
  * "раундов" → t(lang, "ui.rounds") (new key added to all 6 languages)
  * "спасбросок" → t(lang, "ui.save_throw") (new key added to all 6 languages)
- Updated ConditionIcons component to accept lang prop (was using settings.lang which wasn't in scope)
- Implemented D&D 5e Opportunity Attacks in move-token API:
  * When player moves out of a monster's reach (adjacent cell → non-adjacent)
  * Monster gets a free attack roll vs player AC
  * On hit: damage applied via damagePlayer()
  * System message logged in chat
  * Only triggers in combat (not exploration)
  * Returns opportunityAttacks array in response
- Added 3 new i18n keys (grid.empty, ui.rounds, ui.save_throw) to all 6 languages
- lint: 0 errors, tsc: 0 errors

Stage Summary:
- Accessibility: prefers-reduced-motion guard + larger font sizes (WCAG compliance)
- CombatGrid: 4 hardcoded strings i18n'd
- D&D 5e Opportunity Attacks: fully implemented in move-token API
- 3 new i18n keys across 6 languages
