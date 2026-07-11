"use client";

// Real-time room sync hook for the DUSKFALL VTT.
//
// Wraps the socket.io client (`src/lib/game/socket.ts`) so a component can
// subscribe to "the room changed, please refetch" notifications with one
// call. The hook:
//   1. Joins the socket.io room for `roomCode` whenever it (or `playerName`) changes.
//   2. Listens for BOTH `room:refresh` (legacy client-pinged pings) and
//      `state:changed` (server-pushed after every API mutation).
//   3. Debounces the refresh callback (default 200ms) so a burst of mutations
//      (e.g. monster AI turn → narrative → image) only triggers ONE refetch.
//   4. Cleans up listeners + timers on unmount or room change.
//
// The polling fallback in `page.tsx` still runs at a slower cadence (5s
// during combat, 8s during exploration) as a safety net in case a socket
// event is missed.

import { useEffect, useRef } from "react";
import {
  getSocket,
  joinRoomSocket,
  onRoomRefresh,
  onStateChange,
} from "@/lib/game/socket";

interface UseRoomSocketOptions {
  /** Called (debounced by `debounceMs`) when any refresh signal arrives.
   *  Use this to trigger a state refetch. */
  onRefresh: () => void;
  /** Called IMMEDIATELY (no debounce) when any refresh signal arrives.
   *  Useful for updating "last event" timestamps used by polling skip logic. */
  onEvent?: () => void;
  /** Debounce window in ms. Default 200ms. Set to 0 to disable debouncing. */
  debounceMs?: number;
}

/**
 * Subscribe to real-time updates for a room.
 *
 * @param roomCode   The room code to join. Pass null to skip subscription.
 * @param playerName The current player's name (used for room roster).
 * @param options    { onRefresh, onEvent?, debounceMs? }
 */
export function useRoomSocket(
  roomCode: string | null,
  playerName: string | null,
  { onRefresh, onEvent, debounceMs = 200 }: UseRoomSocketOptions
) {
  // Keep the latest callbacks in refs so the listener effect doesn't need
  // to re-subscribe on every render (which would leak handlers). Refs are
  // updated inside an effect (NOT during render) per the react-hooks/refs
  // rule — see https://react.dev/reference/react/useRef.
  const refreshRef = useRef(onRefresh);
  const eventRef = useRef(onEvent);
  useEffect(() => {
    refreshRef.current = onRefresh;
    eventRef.current = onEvent;
  });

  // Debounce timer handle — cleared on cleanup.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. Join the socket.io room whenever roomCode / playerName changes.
  //    The relay uses this to scope broadcasts to just this room's members.
  useEffect(() => {
    if (!roomCode || !playerName) return;
    joinRoomSocket(roomCode, playerName);
  }, [roomCode, playerName]);

  // 2. Subscribe to refresh signals (both legacy `room:refresh` and the new
  //    server-pushed `state:changed`). Re-subscribes only when roomCode
  //    changes — callbacks are read from refs so they always see the latest
  //    closure without forcing a re-subscribe.
  useEffect(() => {
    if (!roomCode) return;
    // Make sure the socket exists (idempotent — `getSocket` caches it).
    getSocket();

    const trigger = () => {
      // Immediate synchronous hook for the caller (e.g. updating a "last
      // event" ref used to skip the next polling tick).
      eventRef.current?.();
      // Debounced refresh — coalesces a burst of events into one refetch.
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (debounceMs <= 0) {
        refreshRef.current();
        return;
      }
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        refreshRef.current();
      }, debounceMs);
    };

    const offRefresh = onRoomRefresh(trigger);
    const offStateChange = onStateChange(trigger);

    return () => {
      offRefresh();
      offStateChange();
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [roomCode, debounceMs]);
}
