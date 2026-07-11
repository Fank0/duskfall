// Server-side socket.io client used by Next.js API routes to push real-time
// "state:changed" notifications to the game-sync relay (mini-service on port
// 3003). The relay then broadcasts the event to every browser currently
// joined to the room, so they refetch state immediately instead of waiting
// for the next polling tick.
//
// Gateway rules:
//   - The browser connects via `io("/?XTransformPort=3003")` (handled in
//     `src/lib/game/socket.ts`).
//   - The Next.js server connects DIRECTLY to `http://localhost:3003`
//     (this file). Server-to-server traffic never goes through Caddy.
//
// Resilience:
//   - A single long-lived socket is shared across all requests (module-level
//     singleton). The socket.io client auto-reconnects on disconnect and
//     buffers emits while the connection is down.
//   - `pushStateChange` swallows ALL errors. The realtime layer is a
//     best-effort notification channel — game state mutations must NEVER
//     fail because the relay is unreachable (the polling fallback covers it).

import { io, type Socket } from "socket.io-client";

const RELAY_URL = process.env.GAME_SYNC_URL ?? "http://localhost:3003";

// Module-level singleton — survives across API requests in the long-running
// Next.js dev server. Re-created on hot-reload, which is fine.
let socket: Socket | null = null;

/**
 * Lazily create (or reuse) the long-lived socket.io connection to the
 * game-sync relay. Never throws — if construction fails, returns null.
 */
function getRelaySocket(): Socket | null {
  if (socket) return socket;
  try {
    const s = io(RELAY_URL, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 3000,
      autoConnect: true,
    });
    // Swallow all connection / runtime errors — the relay is optional.
    // The game still works without it (clients fall back to polling).
    s.on("connect_error", () => {
      /* relay down or unreachable — ignore */
    });
    s.on("error", () => {
      /* runtime socket error — ignore */
    });
    socket = s;
    return s;
  } catch {
    /* io() never throws synchronously, but be defensive */
    return null;
  }
}

/**
 * Push a `state:changed` event to every client currently joined to `roomCode`.
 *
 * Fire-and-forget: emits to the relay and returns immediately. The socket.io
 * client buffers the emit while the connection is still being established,
 * so it is safe to call this before the very first connection completes.
 *
 * Always silent on failure — never throws, never rejects.
 */
export function pushStateChange(roomCode: string): void {
  try {
    const code = (roomCode ?? "").toString().toUpperCase().trim();
    if (!code) return;
    const s = getRelaySocket();
    if (!s) return;
    s.emit("room:broadcast", {
      roomCode: code,
      event: "state:changed",
      payload: { reason: "mutation", ts: Date.now() },
    });
  } catch {
    /* swallow — never break the API response over a push failure */
  }
}

/**
 * Async variant for callers that want to await the emit (rare). Most routes
 * should use the sync `pushStateChange` — the emit itself is synchronous
 * from the client's perspective (it queues into the socket.io buffer).
 *
 * Resolves once the emit has been queued (NOT once the relay has broadcast
 * it — that would require an ack round-trip we don't need).
 */
export async function pushStateChangeAsync(roomCode: string): Promise<void> {
  pushStateChange(roomCode);
}
