# D4 — Combat replay (animation of last turn)

**Task ID:** D4
**Agent:** full-stack-developer
**Status:** ✅ Complete

## Architecture

```
src/lib/game/replay.ts          (NEW) — pure isomorphic builder
  └─ buildTurnEvents(diceRolls, chat, players, monsters, round): TurnEvent[]

src/components/dnd/ReplayOverlay.tsx  (NEW) — overlay UI + playback driver
  ├─ derives all visual state from currentIndex (no setState in effect body)
  ├─ uses CombatTextOverlay (existing) for floating damage/heal text
  └─ uses CONDITIONS (existing) for condition emoji icons

src/components/dnd/BottomPanel.tsx (MODIFIED)
  ├─ new props: onReplay?, hasReplay?
  └─ new button in the "Combat Actions" section header (combat only, hasReplay=true)

src/app/page.tsx (MODIFIED)
  ├─ new state: isReplaying, replayEvents
  ├─ closeReplay defined as early useCallback (used by Escape + combat-end effects)
  ├─ startReplay defined after early returns (uses snapshot)
  ├─ hasReplay derived cheaply (no full buildTurnEvents call on every render)
  ├─ Escape key + combat-end both cancel replay
  ├─ CombatGrid + ReplayOverlay wrapped in <div className="relative flex ..."> so the
  │   overlay's `absolute inset-0` aligns exactly with the grid's box
  └─ anyModalOpen now includes isReplaying (hotkeys suppressed during replay)

src/lib/game/i18n.ts (MODIFIED)
  └─ 4 new keys × 6 languages: ui.replay_turn / replay_skip / replay_close / replay_no_data
```

## TurnEvent type

```ts
type TurnEvent =
  | { type: 'move'; actor: string; from: {x,y}; to: {x,y}; ts: number }
  | { type: 'attack'; actor: string; target: string; hit: boolean; damage?: number; damageType?: string; crit?: boolean; ts: number }
  | { type: 'spell'; actor: string; spellName: string; targets: string[]; damage?: number; ts: number }
  | { type: 'damage'; target: string; amount: number; damageType: string; ts: number }
  | { type: 'heal'; target: string; amount: number; ts: number }
  | { type: 'condition'; target: string; condition: string; applied: boolean; ts: number };
```

## buildTurnEvents reconstruction strategy

Walks the dice rolls for `round === snapshot.round` (chronological), classifying
each by its Russian `label` pattern (stable strings emitted by dm-agent.ts):

| Roll label pattern                          | Event emitted                                  |
|---------------------------------------------|------------------------------------------------|
| `Инициатива`                                | skipped (initiative roll, round 0)             |
| `Атака <monster>...` (player roller)        | attack (target = monster from label)           |
| `Доп. атака N/M по <monster>`               | attack (Extra Attack)                          |
| `Второе оружие (бонус-действие) по <m>`     | attack (off-hand)                              |
| `Атака <monster>...` (monster roller)       | attack (target = nearest alive player)         |
| `Урон по: <monster>...` (paired w/ attack)  | consumed by the preceding attack event         |
| `Урон: <monster>...` (paired w/ attack)     | consumed by the preceding monster-attack event |
| `Урон заклинания (<element>)...`            | spell (targets gathered from following `Урон по <name>...` rolls) |
| `Урон по <name> (половина, спас)`           | standalone damage (or consumed by spell)       |
| `Урон по герою...`                          | damage (target = roller, backlash)             |
| `Лечение` / `Вампиризм` / `Лечение за убийство` | heal (target = roller)                    |
| `Спасбросок <name> (<ability>)`             | skipped (paired with damage rolls already)     |
| `Ячейка заклинания ур.N`                    | skipped (no roll, just a slot-spend record)    |

Each attack roll looks ahead ≤6 rolls for a damage roll by the same `roller`
and consumes it (so it isn't double-counted as a standalone damage event).

For move events: we don't persist previous positions, so moves are inferred
from chat-message movement verbs (`перемещается`, `прыгает`, `отступает`,
`бежит`, `подбирается`, etc.) — the actor's CURRENT position is used as both
`from` and `to` so the visual highlight fires (the token doesn't translate).

For condition events: scanned from chat past-tense verbs (`отравлен`,
`оглушён`, `ослеплён`, etc.) → mapped to condition IDs via `CONDITIONS` table.
De-duplicated per (target, condition) pair.

Spell-name inference: walks a curated list of Russian D&D 5e spell names
(`Огненный шар`, `Магическая стрела`, `Ледяной шторм`, etc.) and falls back
to any `«...»`-quoted text in the chat message.

Damage-type inference: scans the label + notation for Russian/English element
keywords (огн/fire → "fire", холод/cold → "cold", etc.) — same logic as the
existing floating-text color-coding in page.tsx.

## ReplayOverlay component

- **Position**: `absolute inset-0` over the CombatGrid (parent wraps both in a
  `relative` container).
- **Playback**: driven by a single `currentIndex` state + `useEffect` that
  schedules `setCurrentIndex(i+1)` via `setTimeout(600ms)`. The ONLY state
  mutation in the effect body — all visual state is derived.
- **Visual state**: computed by `deriveEffects(ev, posOf)` — a pure function
  returning `{ floats, moveFx, attackFx, spellFx, conditionFx }` for the
  current event. No `useState` for transient effects (lint rule
  `react-hooks/set-state-in-effect` compliant).
- **CombatTextOverlay remount**: the floating-text overlay uses
  `key={`ft-${eventKey}``}` so each event advance triggers a clean remount —
  the existing 1.2s auto-hide animations restart from 0.
- **onClose ref pattern**: `onCloseRef.current = onClose` is updated in a
  `useEffect` (not during render) to satisfy `react-hooks/refs`. The playback
  effect reads via the ref so it doesn't re-run when the parent passes a fresh
  callback identity.
- **finishedRef guard**: prevents the close effect from firing more than once
  when playback completes (avoids the close→setState→re-render→close loop).

## UI/UX

- The "🔁 Повторить ход" button appears in the BottomPanel's "Combat Actions"
  section header — only during combat, only when `hasReplay=true` (cheap check
  for any dice roll or chat line tagged with the current round).
- The overlay shows:
  - Top-right: amber "🔁 Повторить ход" badge (pulsing).
  - Top-center (during spell events): fuchsia spell-name banner.
  - Grid effects layer: move highlight, attack ⚔️ icon + SVG line + target
    ring, spell AoE cell highlights (element color), condition emoji.
  - Floating text (damage/miss/heal numbers) via existing CombatTextOverlay.
  - Bottom: progress bar + "🔁 Повторить ход" (restart) + "⏭ Пропустить" +
    "✕ Закрыть" buttons.
- **Skip**: clears the timer and calls onClose (jumps to end).
- **Close**: same — calls onClose.
- **Restart**: clears timer, resets `currentIndex=0`, replays from start.
- **Escape key**: also closes the replay (added alongside the existing
  targeting-Escape handler).
- **Combat end**: automatically cancels the replay so the player isn't stuck
  watching a finished encounter.
- **Hotkeys suppressed** during replay (anyModalOpen now includes isReplaying).

## Files

**Created:**
- `src/lib/game/replay.ts` (~370 lines)
- `src/components/dnd/ReplayOverlay.tsx` (~430 lines)

**Modified:**
- `src/lib/game/i18n.ts` (+24 keys: 4 × 6 languages)
- `src/components/dnd/BottomPanel.tsx` (+2 props, +1 button in combat-actions header)
- `src/app/page.tsx` (replay state, callbacks, Escape handler, combat-end handler, CombatGrid wrapper, BottomPanel props)

## Verification

- `bun run lint` → **0 errors, 0 warnings** ✅
- `bunx tsc --noEmit` → 0 NEW errors in D4-touched files (2 pre-existing
  `actionPoints` / `maxActionPoints` errors at page.tsx:1542-1543 are
  unchanged from main — verified via `git stash` + re-check).
- Dev server (port 3000) returns HTTP 200 on `/` after the fixes (initial
  ReferenceError on `closeReplay` resolved by moving the callback definition
  ahead of the early returns + Escape effect).
- Recent dev.log shows `GET /api/game/state?room=85WQZE 200` — no runtime
  errors.

## Integration notes for future agents

- The `TurnEvent` type + `buildTurnEvents` are pure (no DB imports). You can
  import them from server routes (e.g. for a future `/api/game/replay`
  endpoint) or from client components.
- The ReplayOverlay is fully self-contained — the only external props are
  `events`, `players`, `monsters`, `lang`, `onClose`. It uses the existing
  CombatTextOverlay + CONDITIONS infrastructure, no new CSS needed.
- If you add new dice-roll label patterns to dm-agent.ts, update
  `buildTurnEvents`'s label classifier in `src/lib/game/replay.ts` to emit
  the appropriate event type.
- The "has anything happened this round?" check in page.tsx is intentionally
  cheap (no full buildTurnEvents call) so it can run on every render without
  blocking. The full event list is built lazily inside `startReplay` only
  when the user actually clicks the replay button.
