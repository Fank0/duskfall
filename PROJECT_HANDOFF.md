# DUSKFALL — Project Handoff Document

## Quick Start for New Chat
```
Проект DUSKFALL (D&D 5e VTT с ИИ-Мастером) уже создан и работает.
GitHub: https://github.com/Fank0/duskfall
Токен: <YOUR_GITHUB_TOKEN>

Стек: Next.js 16 + TypeScript + Prisma + SQLite + shadcn/ui + DeepSeek V3 (free LLM)
Сервер: bun run dev (порт 3000)
Lint: bun run lint
БД: bun run db:push (после изменения prisma/schema.prisma)

Краткая инструкция: читай /home/z/my-project/worklog.md (последние 200 строк) для контекста.
Подробный анализ механик: ищи "Task ID: 4-a" в worklog.md.
```

## Project State (July 2026)

### What Works
- ✅ DM engine (LLM planning → dice → state mutations → LLM narration)
- ✅ 16×16 tactical grid with tokens, terrain, AoE overlays
- ✅ Character creation (12 classes × 9 races × 10 backgrounds)
- ✅ 126 talents + 22 subclasses (defined; UI for subclass selection at L2)
- ✅ 34 spells + 51 monsters + 103 items
- ✅ 6-language i18n (ru/en/es/de/fr/zh)
- ✅ Auth system (account-based, saves)
- ✅ Combat: initiative, death saves, temp HP, concentration (partially)
- ✅ Action Points (ОД) — BG3/DOS2 hybrid, 4-7 per turn
- ✅ Movement: A* pathfinding (pathfinding.ts)
- ✅ Lighting: torches, darkvision, disadvantage in darkness (lighting.ts)
- ✅ Legendary actions for bosses (legendary.ts — 6 bosses × 3 actions)
- ✅ Tutorial overlay in lobby
- ✅ Auth modal (button-triggered, not auto-popup)
- ✅ Feature badges REMOVED from lobby (per user request)

### What's Lost / Needs Restoration
After a git merge, these features were lost and need recreation:

1. **EnemyPanel.tsx** — component showing enemies + HP + abilities + loot during combat — ✅ DONE (restored this round)
2. **Movement Points (ОХ)** — schema fields (speed, movementUsed, dashActive) + logic in move-token route
3. **Attunement system** — requiresAttunement/attuned fields + /api/game/attune route + UI
4. **11 SRD conditions** — restrained, grappled, paralyzed, charmed, exhaustion, etc. (conditions.ts) — ✅ DONE (added 8: restrained, grappled, paralyzed, charmed, exhaustion, deafened, invisible; total now 18)
5. **Subclass wiring** — resolveTalents merging subclass pool, UI in LevelUpModal
6. **Combat maneuvers** — two-weapon fighting, grapple, shove (dm-agent.ts)
7. **Concentration fix** — setConcentration called on spell cast (dm-agent.ts)
8. **XP table fix** — SRD values (300/900/2700 instead of 200/600/1200) — ✅ DONE (fixed to full SRD table L1→L17)
9. **Monster A* movement** — moveMonsterTowardNearestPlayer using pathfinding
10. **Targeted Attack button** — clicking "Атаковать" enters targeting mode
11. **Fire glow removal** — removed radial gradient around torches on grid
12. **Cover fix** — apply cover AC bonus to player attacks too
13. **Upcasting** — single-target spell damage scaling
14. **Special abilities** — more monster keyword groups (poison, frighten, stun, blind)
15. **weakened condition** — added to ATTACKER_DISADV_CONDS — ✅ DONE (weakened + restrained + paralyzed + exhaustion added)

### Key Files
- `src/lib/game/dm-agent.ts` — DM engine (~2300 lines)
- `src/lib/game/state.ts` — game state helpers
- `src/lib/game/pathfinding.ts` — A* (recreated)
- `src/lib/game/lighting.ts` — lighting/darkvision (recreated)
- `src/lib/game/legendary.ts` — boss legendary actions (recreated)
- `src/lib/game/terrain.ts` — terrain system
- `src/lib/game/conditions.ts` — conditions (needs 11 SRD additions)
- `src/lib/game/subclasses.ts` — 22 subclasses (needs wiring)
- `src/lib/game/i18n.ts` — 6-language dictionary
- `src/app/page.tsx` — main game page
- `src/components/dnd/` — UI components (Lobby, ChatPanel, CombatGrid, BottomPanel, etc.)
- `prisma/schema.prisma` — DB schema

### Recent Commits
- `127895d` — maxDuration 300s for long LLM responses
- `fb7e2ce` — restored pathfinding.ts, lighting.ts, legendary.ts
- `2a1d507` — merge remote + local
- `da91408` — tutorial overlay + lobby.sign_in i18n
- `b22e27d` — removed feature badges

### User Preferences
- Russian UI (primary language)
- Free LLM only (DeepSeek V3 via OpenRouter)
- No feature badges in lobby
- Auth modal should NOT auto-popup — button-triggered only
- Tutorial overlay must exist
- Commit after every change + push to GitHub
