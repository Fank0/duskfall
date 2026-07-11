"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, SkipForward, X } from "lucide-react";
import type { PlayerState, MonsterState } from "@/lib/game/types";
import { CONDITIONS } from "@/lib/game/conditions";
import { GRID_SIZE } from "@/lib/game/state";
import { t, type Lang } from "@/lib/game/i18n";
import {
  CombatTextOverlay,
  makeDamageText,
  makeHealText,
  makeMissText,
  type FloatingText,
} from "@/components/dnd/CombatTextOverlay";
import type { TurnEvent } from "@/lib/game/replay";

/**
 * D4 — Combat replay overlay.
 *
 * Renders a full-cover overlay on top of the CombatGrid that visually replays
 * the most recent combat round. Each event plays for ~600ms, then the overlay
 * advances to the next. The overlay is driven entirely by React state +
 * setTimeout (per the task's implementation hint); no external animation
 * library is needed.
 *
 * Visual effects per event type:
 *   move      → amber glow on the actor's cell + a "→" indicator
 *   attack    → "⚔️" icon flashes over the attacker, then a damage number /
 *               "ПРОМАХ" floating text appears over the target (uses the
 *               existing CombatTextOverlay infrastructure).
 *   spell     → spell-name banner at the top + colored AoE cell highlights
 *               on every affected target's cell (element color).
 *   damage    → floating damage text on the target.
 *   heal      → green "+N" floating text on the target.
 *   condition → condition emoji flashes briefly over the target's cell.
 *
 * Architecture note
 * -----------------
 * All per-event visual state (moveFx, attackFx, spellFx, conditionFx, the
 * floating-text list) is DERIVED directly from `events[currentIndex]` + the
 * position lookup. No `useState` is used for transient effects — when the
 * index advances, the derived values change, React re-renders, and the
 * `key={...}` props on the effect layers force a clean DOM remount so CSS
 * animations restart. This keeps the playback `useEffect` free of
 * synchronous `setState` calls (which would trip the
 * `react-hooks/set-state-in-effect` lint rule) — the only state mutation in
 * the effect is `setCurrentIndex` from inside a `setTimeout` callback.
 *
 * The parent MUST wrap this in a `relative` container that has the same
 * dimensions as the CombatGrid (so the overlay lines up with the grid
 * underneath).
 */
export interface ReplayOverlayProps {
  events: TurnEvent[];
  players: PlayerState[];
  monsters: MonsterState[];
  lang: Lang;
  /** Called when the user closes the replay or the playback finishes. */
  onClose: () => void;
}

const STEP_MS = 600;
/** Delay before the first event plays (lets the overlay fade in). */
const INTRO_MS = 500;
/** Delay after the last event finishes before auto-closing (lets the user
 *  see the final effect — without this, a 1-event replay would flash for
 *  only STEP_MS and feel like nothing happened). */
const OUTRO_MS = 1500;

const AOE_ELEMENT_BG: Record<string, string> = {
  fire: "rgba(249,115,22,0.55)",
  cold: "rgba(59,130,246,0.55)",
  lightning: "rgba(234,179,8,0.6)",
  acid: "rgba(22,163,74,0.55)",
  force: "rgba(168,85,247,0.55)",
  poison: "rgba(74,222,128,0.55)",
  thunder: "rgba(6,182,212,0.55)",
  necrotic: "rgba(120,80,180,0.55)",
  radiant: "rgba(251,191,36,0.6)",
  physical: "rgba(220,220,220,0.4)",
};

// ---- Derived visual-state shapes (one per event type) ----------------------

interface MoveFx { actor: string; x: number; y: number; }
interface AttackFx { actor: string; ax: number; ay: number; tx: number; ty: number; }
interface SpellFx { name: string; cells: { x: number; y: number }[]; element: string; }
interface ConditionFx { target: string; x: number; y: number; icon: string; name: string; }

/**
 * Build the floating-text entries + per-event visual state for a single event.
 * Pure function — no React, no side effects.
 */
function deriveEffects(
  ev: TurnEvent,
  posOf: Map<string, { x: number; y: number }>,
): {
  floats: FloatingText[];
  moveFx: MoveFx | null;
  attackFx: AttackFx | null;
  spellFx: SpellFx | null;
  conditionFx: ConditionFx | null;
} {
  const floats: FloatingText[] = [];
  let moveFx: MoveFx | null = null;
  let attackFx: AttackFx | null = null;
  let spellFx: SpellFx | null = null;
  let conditionFx: ConditionFx | null = null;

  if (ev.type === "move") {
    const pos = posOf.get(ev.actor) ?? ev.to;
    moveFx = { actor: ev.actor, x: pos.x, y: pos.y };
  } else if (ev.type === "attack") {
    const apos = posOf.get(ev.actor);
    const tpos = posOf.get(ev.target) ?? { x: 0, y: 0 };
    if (apos) {
      attackFx = { actor: ev.actor, ax: apos.x, ay: apos.y, tx: tpos.x, ty: tpos.y };
    }
    const relX = (tpos.x + 0.5) / GRID_SIZE;
    const relY = (tpos.y + 0.5) / GRID_SIZE;
    if (ev.hit && ev.damage && ev.damage > 0) {
      floats.push(makeDamageText(relX, relY, ev.damage, Boolean(ev.crit), ev.damageType));
    } else if (!ev.hit) {
      floats.push(makeMissText(relX, relY));
    }
  } else if (ev.type === "spell") {
    const cells = ev.targets
      .map((t) => posOf.get(t))
      .filter((p): p is { x: number; y: number } => Boolean(p))
      .map((p) => ({ x: p.x, y: p.y }));
    spellFx = {
      name: ev.spellName,
      cells,
      element: ev.damageType ?? "force",
    };
    if (ev.damage && ev.damage > 0 && cells.length > 0) {
      const perTarget = Math.round(ev.damage / Math.max(1, cells.length));
      for (const c of cells) {
        const relX = (c.x + 0.5) / GRID_SIZE;
        const relY = (c.y + 0.5) / GRID_SIZE;
        floats.push(makeDamageText(relX, relY, perTarget, false, ev.damageType));
      }
    }
  } else if (ev.type === "damage") {
    const pos = posOf.get(ev.target);
    if (pos) {
      const relX = (pos.x + 0.5) / GRID_SIZE;
      const relY = (pos.y + 0.5) / GRID_SIZE;
      floats.push(makeDamageText(relX, relY, ev.amount, false, ev.damageType));
    }
  } else if (ev.type === "heal") {
    const pos = posOf.get(ev.target);
    if (pos) {
      const relX = (pos.x + 0.5) / GRID_SIZE;
      const relY = (pos.y + 0.5) / GRID_SIZE;
      floats.push(makeHealText(relX, relY, ev.amount));
    }
  } else if (ev.type === "condition") {
    const pos = posOf.get(ev.target);
    const def = CONDITIONS[ev.condition];
    if (pos && def) {
      conditionFx = { target: ev.target, x: pos.x, y: pos.y, icon: def.icon, name: def.name };
    }
  }

  return { floats, moveFx, attackFx, spellFx, conditionFx };
}

export function ReplayOverlay({
  events,
  players,
  monsters,
  lang,
  onClose,
}: ReplayOverlayProps) {
  const tt = (key: string, params?: Record<string, string | number>) =>
    t(lang, key, params);

  // The ONLY piece of state — the playback position. Everything else is
  // derived from this + the events list + the position lookup.
  const [currentIndex, setCurrentIndex] = useState(0);

  const timerRef = useRef<number | null>(null);
  // onClose ref so the playback effect doesn't re-run when the parent passes a
  // fresh callback identity (we only want it to depend on `currentIndex`).
  // Updated in an effect (NOT during render) to satisfy the
  // `react-hooks/refs` ESLint rule.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  // Guard so we only fire onClose once when playback finishes (prevents the
  // finish-effect from re-running on the parent's state update).
  const finishedRef = useRef(false);

  // Position lookup for a combatant by name (player OR monster).
  const posOf = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const p of players) map.set(p.name, { x: p.posX, y: p.posY });
    for (const m of monsters) map.set(m.name, { x: m.posX, y: m.posY });
    return map;
  }, [players, monsters]);

  // Clear pending timer on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  // Drive the playback: on every index change, schedule the next step. The
  // only state mutation in this effect is `setCurrentIndex` (from inside a
  // setTimeout) — all visual state is derived during render. Depends ONLY on
  // `currentIndex` + `events` (the onClose callback is read via a ref).
  useEffect(() => {
    if (currentIndex >= events.length) {
      // Playback finished — close (once), but wait OUTRO_MS so the user can
      // see the final event's visual effect before the overlay disappears.
      if (!finishedRef.current) {
        finishedRef.current = true;
        const id = window.setTimeout(() => onCloseRef.current(), OUTRO_MS);
        return () => window.clearTimeout(id);
      }
      return;
    }
    finishedRef.current = false;
    // First event: wait INTRO_MS (fade-in time) before showing it.
    // Subsequent events: wait STEP_MS between events.
    const delay = currentIndex === 0 ? INTRO_MS : STEP_MS;
    timerRef.current = window.setTimeout(() => {
      setCurrentIndex((i) => i + 1);
    }, delay);
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [currentIndex, events]);

  const skipToEnd = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onClose();
  };

  const replayFromStart = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    finishedRef.current = false;
    setCurrentIndex(0);
  };

  // ===== DERIVED visual state for the current event =====
  const ev = currentIndex < events.length ? events[currentIndex] : null;
  const derived = ev ? deriveEffects(ev, posOf) : null;
  const moveFx = derived?.moveFx ?? null;
  const attackFx = derived?.attackFx ?? null;
  const spellFx = derived?.spellFx ?? null;
  const conditionFx = derived?.conditionFx ?? null;
  const floats = derived?.floats ?? [];
  // A stable per-event key so the CombatTextOverlay remounts cleanly when the
  // event advances (its internal animation timers restart from 0).
  const eventKey = ev ? `${currentIndex}-${ev.ts}` : "none";

  const cellPct = 100 / GRID_SIZE;
  const total = events.length;
  const progress = total > 0 ? Math.min(1, (currentIndex + 1) / total) : 0;

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex flex-col rounded-md border-2 border-amber-500/70 bg-stone-950/70 backdrop-blur-sm">
      {/* ===== Top banner: spell name (when active) ===== */}
      <div className="pointer-events-none absolute left-1/2 top-1 z-10 -translate-x-1/2">
        {spellFx && (
          <div
            key={`spell-${eventKey}`}
            className="animate-pulse-glow rounded-md border border-fuchsia-400/70 bg-fuchsia-950/90 px-3 py-1 text-[11px] font-semibold text-fuchsia-100 shadow-lg"
          >
            ✨ {spellFx.name}
          </div>
        )}
      </div>

      {/* ===== Top-right header: replay badge ===== */}
      <div className="absolute right-1 top-1 z-20 flex items-center gap-1.5">
        <span className="flex items-center gap-1 rounded-full border border-amber-500/70 bg-amber-950/80 px-2 py-0.5 text-[10px] font-bold text-amber-200 animate-pulse-glow">
          <RotateCcw className="h-2.5 w-2.5" />
          {tt("ui.replay_turn")}
        </span>
      </div>

      {/* ===== Effects layer (sized to match the inner grid) ===== */}
      <div className="relative flex-1 p-1">
        <div className="relative h-full w-full">
          {/* Move highlight on actor's cell */}
          {moveFx && (
            <div
              key={`mv-${eventKey}`}
              className="pointer-events-none absolute z-20 flex items-center justify-center rounded-[2px] border-2 border-amber-300 bg-amber-400/30 animate-pulse-glow"
              style={{
                left: `${moveFx.x * cellPct}%`,
                top: `${moveFx.y * cellPct}%`,
                width: `${cellPct}%`,
                height: `${cellPct}%`,
              }}
            >
              <span className="text-[10px] drop-shadow-[0_1px_1px_rgba(0,0,0,0.95)]">→</span>
            </div>
          )}

          {/* Attack: ⚔️ icon on attacker + line to target */}
          {attackFx && (
            <>
              <div
                key={`atk-icon-${eventKey}`}
                className="pointer-events-none absolute z-30 flex items-center justify-center rounded-[2px] border-2 border-red-400 bg-red-500/40 animate-pulse-glow"
                style={{
                  left: `${attackFx.ax * cellPct}%`,
                  top: `${attackFx.ay * cellPct}%`,
                  width: `${cellPct}%`,
                  height: `${cellPct}%`,
                }}
              >
                <span className="text-[12px] drop-shadow-[0_1px_1px_rgba(0,0,0,0.95)]">⚔️</span>
              </div>
              {/* SVG line from attacker → target (drawn BEHIND the icon, above cells) */}
              <svg
                key={`atk-line-${eventKey}`}
                className="pointer-events-none absolute inset-0 z-20 h-full w-full"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                <line
                  x1={(attackFx.ax + 0.5) * cellPct}
                  y1={(attackFx.ay + 0.5) * cellPct}
                  x2={(attackFx.tx + 0.5) * cellPct}
                  y2={(attackFx.ty + 0.5) * cellPct}
                  stroke="rgba(248,113,113,0.85)"
                  strokeWidth="0.6"
                  strokeDasharray="1.5 1"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              {/* Pulsing ring on the target cell */}
              <div
                key={`atk-ring-${eventKey}`}
                className="pointer-events-none absolute z-20 rounded-[2px] border-2 border-red-400/80 animate-pulse-glow"
                style={{
                  left: `${attackFx.tx * cellPct}%`,
                  top: `${attackFx.ty * cellPct}%`,
                  width: `${cellPct}%`,
                  height: `${cellPct}%`,
                }}
              />
            </>
          )}

          {/* Spell: AoE cell highlights */}
          {spellFx && spellFx.cells.length > 0 && (
            <>
              {spellFx.cells.map((c, i) => (
                <div
                  key={`spell-cell-${eventKey}-${i}`}
                  className="pointer-events-none absolute z-20 rounded-[2px] border border-white/40 animate-pulse"
                  style={{
                    left: `${c.x * cellPct}%`,
                    top: `${c.y * cellPct}%`,
                    width: `${cellPct}%`,
                    height: `${cellPct}%`,
                    background: AOE_ELEMENT_BG[spellFx.element] ?? AOE_ELEMENT_BG.force,
                  }}
                />
              ))}
            </>
          )}

          {/* Condition: emoji over the target's cell */}
          {conditionFx && (
            <div
              key={`cond-${eventKey}`}
              className="pointer-events-none absolute z-30 flex items-center justify-center animate-pulse-glow"
              style={{
                left: `${conditionFx.x * cellPct}%`,
                top: `${conditionFx.y * cellPct}%`,
                width: `${cellPct}%`,
                height: `${cellPct}%`,
              }}
              title={`${conditionFx.target}: ${conditionFx.name}`}
            >
              <span className="text-[14px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                {conditionFx.icon}
              </span>
            </div>
          )}

          {/* Floating text overlay (damage / miss / heal numbers).
              The `key` forces React to remount CombatTextOverlay on every
              event advance so its internal animation timers reset. */}
          {floats.length > 0 && (
            <CombatTextOverlay key={`ft-${eventKey}`} texts={floats} />
          )}
        </div>
      </div>

      {/* ===== Bottom controls: progress + Skip / Close / Replay ===== */}
      <div className="z-20 flex items-center gap-2 border-t border-amber-500/40 bg-stone-950/90 px-2 py-1.5">
        {/* Progress bar */}
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-mono text-amber-200">
              {Math.min(currentIndex + 1, total)}/{total}
            </span>
            <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-stone-800">
              <div
                className="h-full bg-amber-500 transition-all duration-300"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        </div>
        {/* Replay from start (only visible after the first event) */}
        {currentIndex > 0 && (
          <button
            type="button"
            onClick={replayFromStart}
            className="flex items-center gap-1 rounded-md border border-amber-700/60 bg-amber-950/60 px-2 py-0.5 text-[10px] font-medium text-amber-200 transition-colors hover:bg-amber-900/60"
            title={tt("ui.replay_turn")}
          >
            <RotateCcw className="h-2.5 w-2.5" />
            <span className="hidden sm:inline">{tt("ui.replay_turn")}</span>
          </button>
        )}
        {/* Skip to end */}
        <button
          type="button"
          onClick={skipToEnd}
          className="flex items-center gap-1 rounded-md border border-sky-700/60 bg-sky-950/60 px-2 py-0.5 text-[10px] font-medium text-sky-200 transition-colors hover:bg-sky-900/60"
          title={tt("ui.replay_skip")}
        >
          <SkipForward className="h-2.5 w-2.5" />
          <span className="hidden sm:inline">{tt("ui.replay_skip")}</span>
        </button>
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 rounded-md border border-red-700/60 bg-red-950/60 px-2 py-0.5 text-[10px] font-medium text-red-200 transition-colors hover:bg-red-900/60"
          title={tt("ui.replay_close")}
        >
          <X className="h-2.5 w-2.5" />
          <span className="hidden sm:inline">{tt("ui.replay_close")}</span>
        </button>
      </div>
    </div>
  );
}

/**
 * Convenience helper: returns true if the given events list is non-empty and
 * therefore the replay button should be visible.
 */
export function hasReplayableEvents(events: TurnEvent[]): boolean {
  return events.length > 0;
}
