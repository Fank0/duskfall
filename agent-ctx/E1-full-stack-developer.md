# Task E1 — WebSocket push for turn changes (replace polling)

**Agent:** full-stack-developer
**Date:** 2025-07-11
**Status:** ✅ Complete

## Task summary

Replaced pure-polling state sync with real-time WebSocket push. When an API
route mutates game state (DM action, rest, move-token, move-room, party-chat,
attune, equip, craft, level-up), the backend now emits a `state:changed`
event through the `game-sync` socket.io relay (port 3003). Every browser
joined to that room receives the event instantly and refetches state
(debounced 200ms). Polling remains as a slower (5s) safety-net fallback.

## Architecture

```
┌─────────────────┐                                ┌──────────────────┐
│  Next.js API    │  emit "room:broadcast"         │  game-sync relay │
│  route handlers │  { event:"state:changed" }     │  (port 3003)     │
│  (port 3000)    │ ────────────────────────────►  │  socket.io       │
└─────────────────┘   server-to-server (direct)    └────────┬─────────┘
       ▲                                                    │
       │  io("http://localhost:3003")                       │ io.to(code)
       │  (long-lived singleton socket)                     │ .emit("state:changed")
       │                                                    ▼
┌──────┴──────────┐                            ┌──────────────────────────┐
│  src/lib/       │                            │  Browser (page.tsx)      │
│  realtime.ts    │                            │  io("/?XTransformPort=   │
│  pushStateChange│                            │       3003")             │
└─────────────────┘                            │  useRoomSocket hook      │
                                               │  → fetchState(force)     │
                                               │  (debounced 200ms)       │
                                               └──────────────────────────┘
```

## Files created

| File | Purpose |
|---|---|
| `src/lib/realtime.ts` | Server-side socket.io client (singleton). Exports `pushStateChange(roomCode)` which emits `room:broadcast` to the game-sync relay. Swallows all errors — never breaks the API. |
| `src/hooks/useRoomSocket.ts` | React hook. Joins the socket.io room, listens for BOTH `room:refresh` (legacy) and `state:changed` (new), debounces the refresh callback (200ms). Cleans up on unmount or room change. |

## Files modified

| File | Change |
|---|---|
| `src/lib/game/socket.ts` | Added `onStateChange(cb)` helper — subscribes to the new `state:changed` event from the relay. |
| `src/app/page.tsx` | Replaced 3 separate socket-related `useEffect`s (join + listen + lastSocketPingRef) with a single `useRoomSocket()` call. Slowed polling from 1.5s/5s (combat/exploration) to a uniform 5s safety net (per task spec). Removed unused `joinRoomSocket` and `onRoomRefresh` imports. |
| `src/app/api/game/action/route.ts` | Added `pushStateChange(roomCode)` (1) after mechanics resolved (turn change → other players see it instantly), (2) after narrative persisted, (3) after fire-and-forget scene image completes. |
| `src/app/api/game/rest/route.ts` | Added push after rest mutations. |
| `src/app/api/game/move-token/route.ts` | Added push after token move (and opportunity attacks). |
| `src/app/api/game/move-room/route.ts` | Added push after party moves to a new map room. |
| `src/app/api/game/party-chat/route.ts` | Added push after a party chat message is stored. |
| `src/app/api/game/attune/route.ts` | Added push after attune/unattune. |
| `src/app/api/game/equip/route.ts` | Added push in BOTH equip and unequip branches. |
| `src/app/api/game/craft/route.ts` | Added push in BOTH success and failure branches (ingredients change either way). |
| `src/app/api/game/levelup/route.ts` | Added push in BOTH ASI and talent-pick branches. |

## Key design decisions

1. **Two event types coexist.** The new `state:changed` event is the primary
   push (server-fired after mutations). The legacy `room:refresh` event
   (fired by `pingRoom()` on the client after the acting player's own
   mutations) still works — `useRoomSocket` listens for both and debounces
   them together, so no duplicate refetches.

2. **Server-side singleton socket.** `src/lib/realtime.ts` keeps ONE
   long-lived socket.io connection to the relay at `http://localhost:3003`.
   All API routes share it. The socket.io client auto-reconnects and
   buffers emits while disconnected — so `pushStateChange` is safe to call
   even before the first connection completes.

3. **Silent failure.** `pushStateChange` wraps everything in try/catch and
   swallows errors. The realtime layer is best-effort — the game still
   works without it (clients fall back to 5s polling). No API response
   will ever fail because the relay is down.

4. **Fire-and-forget.** `pushStateChange` is synchronous (the socket.io
   client `.emit()` queues into its buffer). API routes don't `await` it,
   so it adds zero latency to the response.

5. **Debounced frontend refetch.** A monster AI turn fires multiple
   mutations (move → attack → narrative → maybe image). The 200ms debounce
   in `useRoomSocket` coalesces these into ONE `fetchState` call.

6. **Polling skip optimization preserved.** The pre-existing logic in
   `page.tsx` skips a polling tick if a socket push arrived within the
   last 5s. The `onEvent` callback in `useRoomSocket` updates
   `lastSocketPingRef` synchronously, so this optimization works for the
   new `state:changed` events too.

## Verification

- ✅ `bun run lint` — 0 errors, 0 warnings.
- ✅ Dev server (port 3000) responding 200 to state polls.
- ✅ game-sync relay (port 3003) listening.
- ✅ No changes to `mini-services/game-sync/index.ts` needed — the existing
  `room:broadcast` handler already supports arbitrary event names, so
  `{ event: "state:changed", payload }` works out of the box.
- ✅ No new dependencies — `socket.io-client` was already in `package.json`.

## What other agents should know

- If you add a NEW API route that mutates game state, import `pushStateChange`
  from `@/lib/realtime` and call it after the mutation (before returning the
  response). One line. Don't await it.
- The frontend polls at 5s as a safety net. Don't reduce this below 5s —
  the socket handles instant updates, and aggressive polling wastes
  resources.
- The `useRoomSocket` hook in `src/hooks/useRoomSocket.ts` is the canonical
  way to subscribe to room updates. Pass `onRefresh` (debounced) and
  optional `onEvent` (immediate, for things like updating a "last event"
  timestamp).
