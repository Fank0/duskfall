# B6 — NPC Schedule Events (time-based NPC movement + time-locked quests)

Task ID: **B6**
Agent: full-stack-developer
Branch: build on top of B2 (Day/night NPC schedule, already implemented per worklog)

## Goal

Make NPCs time-aware: at specific times of day they should (1) move between
locations, (2) offer quests only at specific times, (3) refuse dialogue while
sleeping/busy, and (4) have time-specific in-character dialogue via LLM hints.

## Architecture

### Data layer (Prisma)

`prisma/schema.prisma` — added `schedule String @default("")` to the `Npc`
model. The schedule is a JSON-serialised array of `NpcScheduleEntry`:

```ts
type NpcScheduleEntry = {
  timeOfDay: 'dawn' | 'day' | 'dusk' | 'night';
  location: string;
  activity: string;
  availableQuests?: string[];
  dialogueHint?: string;
};
```

`bun run db:push` was run — Prisma client regenerated. The `toNpc` mapper in
`src/lib/game/state.ts` parses the JSON string into `NpcScheduleEntry[]`,
tolerating empty/malformed values.

### Pure helpers (client-safe)

`src/lib/game/npc-schedule-client.ts` — pure read-only helpers, NO DB imports
so they can be imported by client components:

- `getNpcActiveSchedule(npc, timeOfDay): NpcScheduleEntry | null`
- `isActivitySleeping(activity): boolean` — true when activity text mentions
  сон/спит/sleep/отдыхает в постел
- `isActivityBusy(activity): boolean` — true when activity text mentions
  занят/busy (patrol is NOT considered busy — the night-patrol quest is still
  offerable from a patrolling NPC)
- `isNpcUnavailableForDialogue(npc, timeOfDay): { unavailable, reason?, activity?, location? }`
- `getScheduledQuests(npcs, timeOfDay): Array<{npcName, questTitle}>`

### Server helpers (DB-touching)

`src/lib/game/npc-schedule.ts` — re-exports the client-safe helpers PLUS:

- `applyScheduleForTimeOfDay(roomId, newTOD, prevTOD?): Promise<string[]>`
  — called from `advanceExplorationTurn` when the cycle advances. For each
  living NPC with a schedule:
    1. If the new entry's `location` differs from the NPC's current location,
       move them (`setNpcLocation`) + write a system chat line
       "📍 X перемещается: A → B (activity)."
    2. For each `availableQuests` title in the new entry that wasn't in the
       previous entry AND isn't already in the quest journal, create the quest
       via `createQuest` + write a system chat line
       "✨ Новый доступный квест от X: «title»".
  Idempotent — safe to call multiple times with the same `newTOD`.

- `serializeSchedule(entries): string` — JSON.stringify wrapper.
- `applyNpcSchedule(roomId, name, entries)` — wrapper around `setNpcSchedule`.

### State mutations (state.ts)

- `setNpcSchedule(roomId, name, entries)` — overwrites the schedule JSON.
- `setNpcLocation(roomId, name, location)` — overwrites the NPC's location.
- `upsertNpc(...)` — unchanged signature (the schedule is set separately
  via `setNpcSchedule` to keep `upsertNpc` backward compatible).

### DM context (state.ts `getDMContext`)

The `=== NPC в локации ===` block now annotates each NPC with their current
schedule entry:
- ` | Сейчас: <activity> (<location>)`
- ` [НЕДОСТУПЕН: <reason>]` when sleeping/busy
- ` | Доступные квесты сейчас: <comma-separated>` when entry has
  `availableQuests` and the NPC isn't unavailable
- ` | Подсказка для диалога: <dialogueHint>` when present

The DM LLM uses this to weave time-of-day flavour into narration.

### Dialogue route (`/api/game/dialogue`)

After loading the NPC + before processing the action:
1. Parse the NPC's `schedule` JSON into `NpcScheduleEntry[]`.
2. If `isNpcUnavailableForDialogue` returns `unavailable: true`:
   - Write the reason as a system chat message
     ("💤 X сейчас спит. Вернитесь утром." or
      "🛑 X сейчас занят: <activity>. Вернитесь попозже.")
   - Return `{ ok: true, narrative: reason, snapshot, stock: [], tradeOutcome: null }`
     so the dialogue panel shows the message inline.
3. Otherwise, extract `dialogueHint`, `activity`, `location` from the active
   schedule entry and pass them to `runLlmDialogue` (3 new optional params).
4. `runLlmDialogue` now includes a "Расписание NPC: ..." line in the system
   prompt so the LLM produces time-aware in-character replies
   ("я ужинаю", "сейчас моя смена патруля" etc.).

### Time-of-day tick (`advanceExplorationTurn`)

When the cycle advances (every 5 turns), after the existing "Время суток
меняется" chat line, the function lazily imports `applyScheduleForTimeOfDay`
from `./npc-schedule` (lazy to break the circular import at module-eval time)
and calls it. Failures are wrapped in try/catch so a schedule bug can never
freeze the exploration turn.

### Seed (`src/lib/game/seed.ts`)

Added `seedSampleNpcs(roomId)` called from `seedRoomContent`. Seeds 3 sample
NPCs with full daily schedules:

1. **Торин** (ally, friendly) — old tracker.
   - day: Рыночная площадь, закупка припасов
   - dusk: Таверна «Старый дуб», ужин
   - night: Окрестности деревни, **Патруль** → offers «Ночной патруль» quest

2. **Мерлин** (merchant, neutral) — travelling merchant.
   - dawn: Лавка Мерлина, открытие лавки
   - day: Лавка Мерлина, торговля
   - dusk: Таверна «Старый дуб», ужин и подсчёт выручки
   - night: Комната Мерлина над лавкой, **Спит** (no dialogue at night)

3. **Капитан стражи** (questgiver, neutral) — guard captain.
   - day: Плац казарм, обучение новобранцев
   - dusk: Казармы стражи, разбор рапортов
   - night: Сторожевая башня, дежурство → offers «Ночная стража» quest

### UI

**`src/app/page.tsx`** — NPC dropdown now shows a per-NPC status badge:
- 💤 + activity when sleeping/busy (rose-400)
- The current activity when available (emerald-400, truncated to 14 chars)
- Falls back to the bare role label when no schedule entry

**`src/components/dnd/DialoguePanel.tsx`** — added optional `timeOfDay` prop
(passed from page.tsx via `snapshot.timeOfDay`). The header subtitle now shows
`disposition · currentLocation · currentActivity`, plus a rose-300 alert line
when the NPC is unavailable. The panel still opens (so the player can see the
"💤 спит" message inline); the dialogue route writes a system chat line and
returns the reason as `narrative`.

### i18n (`src/lib/game/i18n.ts`)

Added 5 new keys to ALL 6 language blocks (ru/en/es/de/fr/zh):
- `ui.npc_sleeping`
- `ui.npc_busy`
- `ui.npc_activity`
- `ui.npc_schedule_quest`
- `ui.npc_moves`

(These keys are available for future UI surfaces; the runtime chat messages
are emitted directly in Russian by the server for now, matching the existing
chat-message convention.)

## File inventory

### Created
- `src/lib/game/npc-schedule.ts` — server-side schedule logic (DB-touching)
- `src/lib/game/npc-schedule-client.ts` — pure client-safe helpers
- `agent-ctx/B6-full-stack-developer.md` — this file

### Modified
- `prisma/schema.prisma` — added `schedule String @default("")` to `Npc`
- `src/lib/game/types.ts` — added `TimeOfDay`, `NpcScheduleEntry`, `schedule`
  on `NpcState`
- `src/lib/game/state.ts` — `toNpc` parses schedule JSON; new
  `setNpcSchedule` + `setNpcLocation`; `getDMContext` annotates NPCs with
  schedule info; `advanceExplorationTurn` calls `applyScheduleForTimeOfDay`
- `src/lib/game/seed.ts` — imports `NpcScheduleEntry`, `upsertNpc`,
  `setNpcSchedule`; new `seedSampleNpcs` function called from
  `seedRoomContent`; SAMPLE_NPCS constant with 3 sample NPCs
- `src/app/api/game/dialogue/route.ts` — blocks dialogue with sleeping/busy
  NPCs; passes `dialogueHint`/`activity`/`location` to `runLlmDialogue`;
  `runLlmDialogue` gets 3 new optional params + a "Расписание NPC" system
  prompt line
- `src/components/dnd/DialoguePanel.tsx` — new `timeOfDay` prop; header
  shows current activity/location + rose alert when unavailable
- `src/app/page.tsx` — passes `timeOfDay` to `DialoguePanel`; NPC dropdown
  shows per-NPC availability badge
- `src/lib/game/i18n.ts` — 5 new keys × 6 languages

## Verification

- `bun run db:push` — Prisma client regenerated successfully ✅
- `bun run lint` — 0 errors, 0 warnings ✅
- `bunx tsc --noEmit` — 0 NEW errors in B6-touched files
  (npc-schedule.ts, npc-schedule-client.ts, dialogue/route.ts, seed.ts,
  state.ts, types.ts). All remaining tsc errors are PRE-EXISTING
  (per worklog for A6: dm-agent.ts, feats.ts, save-load.ts, etc.) ✅

## Integration guide for future agents

- To make a NEW NPC time-aware, call `setNpcSchedule(roomId, name, entries)`.
  The `entries` array is the canonical source of truth.
- To make a NEW quest time-locked, add its title to an entry's
  `availableQuests`. The quest is auto-offered the first time the matching
  time-of-day begins; subsequent cycles are no-ops because the journal
  already contains it.
- To block dialogue without making the NPC "sleep", use the literal word
  "занят" or "busy" in the activity text. Any other activity (including
  "патруль") allows dialogue.
- The pure helpers in `npc-schedule-client.ts` are safe to import from any
  client component. The server-side `npc-schedule.ts` MUST stay server-only
  (it imports `@/lib/db`).
- The `applyScheduleForTimeOfDay` call site is in `advanceExplorationTurn`
  in `state.ts`. To trigger a schedule tick from a different code path
  (e.g. weather change, long rest), import `applyScheduleForTimeOfDay`
  lazily (dynamic `await import`) to avoid circular-dependency issues at
  module-eval time.

## Known limitations

- The NPC `location` field is updated to match the schedule entry's location
  when time advances. There is NO mechanical effect on the tactical grid —
  NPCs aren't tokens on the combat grid, so this is purely narrative.
- The `dialogueHint` is a free-form Russian hint, not a structured prompt.
  The LLM may or may not weave it into the reply — it's a soft hint.
- The auto-offered quests are created with a generic description; the DM is
  expected to flesh them out via subsequent narration. The player can see
  them in the quest journal immediately.
- Sample NPCs are seeded for every new room. If the DM introduces a new NPC
  via the `npc` field in the DM planning response, that NPC gets an empty
  schedule (so no time-locked behaviour unless explicitly set later).
