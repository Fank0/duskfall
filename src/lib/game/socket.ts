// Client-side socket.io helper for real-time room sync.
// Connects through the Caddy gateway via ?XTransformPort=3003.

import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket && socket.connected) return socket;
  if (!socket) {
    socket = io("/?XTransformPort=3003", {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1500,
    });
  }
  return socket;
}

/** Join a room on the relay so you receive refresh pings. */
export function joinRoomSocket(roomCode: string, playerName: string) {
  const s = getSocket();
  s.emit("room:join", { roomCode: roomCode.toUpperCase(), playerName });
}

/** Ping everyone in the room to re-fetch state (call after a mutation). */
export function pingRoom(roomCode: string) {
  const s = getSocket();
  s.emit("room:ping", { roomCode: roomCode.toUpperCase() });
}

/** Subscribe to refresh signals. Returns an unsubscribe fn. */
export function onRoomRefresh(cb: () => void): () => void {
  const s = getSocket();
  const handler = () => cb();
  s.on("room:refresh", handler);
  return () => {
    s.off("room:refresh", handler);
  };
}

/**
 * Subscribe to `state:changed` signals — pushed by the Next.js API routes
 * (via the game-sync relay) after every game-state mutation (turn change,
 * monster action, chat message, combat start/end, equip, craft, level-up…).
 *
 * The frontend treats this as a "refetch now" notification: on receipt it
 * calls `fetchState(roomCode, true)` (debounced by the caller, typically via
 * the `useRoomSocket` hook). Returns an unsubscribe fn.
 */
export function onStateChange(cb: () => void): () => void {
  const s = getSocket();
  const handler = () => cb();
  s.on("state:changed", handler);
  return () => {
    s.off("state:changed", handler);
  };
}
