"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Swords, MapPin, Crosshair } from "lucide-react";
import type { PlayerState, MonsterState, ConditionState } from "@/lib/game/types";
import { CONDITIONS } from "@/lib/game/conditions";
import { cn } from "@/lib/utils";
import { GRID_SIZE } from "@/lib/game/state";
import { useSettings } from "@/lib/game/settings";
import { t, type Lang } from "@/lib/game/i18n";
import { shallowEqual } from "@/lib/game/shallow";

/** AoE overlay info passed from the page (transient — lasts ~2s). */
export interface AoEOverlay {
  shape: "circle" | "cone" | "line";
  size: number;
  origin: { x: number; y: number };
  cells: { x: number; y: number }[];
  element: string;
  saveDC?: number;
  saveAbility?: string;
}

/** Combat animation event (transient — drives hit-flash, lunge, shake, crit burst). */
export interface CombatAnimEvent {
  /** Monotonic id — increments per event so the receiver can detect a new one. */
  id: number;
  actorName: string | null;
  targetName: string | null;
  damage: number;
  isCrit: boolean;
  isHeal: boolean;
}

/** Loot / trap cell overlay info (item 20). */
export interface GridExtras {
  lootCells: { x: number; y: number; itemName: string }[];
  traps: { x: number; y: number; discovered: boolean }[];
  terrainCells?: { x: number; y: number; type: string }[];
}

/** Keywords that mark a monster as ranged (used for threat-range overlay, item 20). */
const RANGED_KEYWORDS = ["лук", "bow", "арбалет", "cross", "праща", "sling", "starb", "star"];

function isRangedMonster(m: MonsterState): boolean {
  const name = `${m.name} ${m.label} ${m.damageNotation}`.toLowerCase();
  return RANGED_KEYWORDS.some((kw) => name.includes(kw));
}

const AOE_ELEMENT_COLORS: Record<string, { core: string; edge: string; label: string }> = {
  fire: { core: "rgba(249,115,22,0.85)", edge: "rgba(234,88,12,0.0)", label: "Огонь" },
  cold: { core: "rgba(59,130,246,0.85)", edge: "rgba(29,78,216,0.0)", label: "Холод" },
  lightning: { core: "rgba(234,179,8,0.9)", edge: "rgba(202,138,4,0.0)", label: "Молния" },
  acid: { core: "rgba(22,163,74,0.85)", edge: "rgba(20,83,45,0.0)", label: "Кислота" },
  force: { core: "rgba(168,85,247,0.85)", edge: "rgba(126,34,206,0.0)", label: "Сила" },
  poison: { core: "rgba(74,222,128,0.85)", edge: "rgba(22,163,74,0.0)", label: "Яд" },
  thunder: { core: "rgba(6,182,212,0.85)", edge: "rgba(8,145,178,0.0)", label: "Гром" },
};

export interface CombatGridProps {
  players: PlayerState[];
  monsters: MonsterState[];
  combatActive: boolean;
  round: number;
  currentTurnName: string | null;
  conditions: ConditionState[];
  aoe?: AoEOverlay | null;
  lastAnimEvent?: CombatAnimEvent | null;
  gridExtras?: GridExtras;
  /**
   * Item 3 — targeting mode:
   *   - "none":    normal grid (no click handlers).
   *   - "ability": monster tokens become clickable; clicking a cell with a
   *               monster calls onMonsterTargetClick(monsterId).
   *   - "aoe":     every cell becomes clickable; clicking a cell calls
   *               onCellTargetClick(x, y).
   */
  targetingMode?: "none" | "ability" | "aoe" | "item";
  /** Called when the player clicks a monster token in ability/item-targeting mode. */
  onMonsterTargetClick?: (monsterId: string) => void;
  /** Called when the player clicks a player token in ability/item-targeting mode (for healing allies). */
  onPlayerTargetClick?: (playerName: string) => void;
  /** Called when the player clicks a grid cell in aoe-targeting mode. */
  onCellTargetClick?: (x: number, y: number) => void;
  /** Called when the player clicks an empty cell to move their token (click-to-move). */
  onMoveClick?: (x: number, y: number) => void;
  /** The current player's name (for click-to-move — only this player's token moves). */
  yourName?: string;
  /** The current player's position (for range highlighting during targeting). */
  yourPosition?: { x: number; y: number } | null;
  /** Range in cells for the current targeting action (1 = melee, 5 = ranged, 6 = move). */
  targetingRange?: number;
}

/**
 * CombatGrid — 10×10 tactical grid with token layer + animations. Wrapped in
 * React.memo with a custom comparator that compares the relevant grid-rendering
 * fields (positions, HP, AC, conditions) element-by-element so a fresh snapshot
 * with identical grid state does NOT trigger a re-render.
 */
export const CombatGrid = memo(function CombatGrid({
  players,
  monsters,
  combatActive,
  round,
  currentTurnName,
  conditions,
  aoe,
  lastAnimEvent,
  gridExtras,
  targetingMode = "none",
  onMonsterTargetClick,
  onPlayerTargetClick,
  onCellTargetClick,
  onMoveClick,
  yourName,
  yourPosition,
  targetingRange,
}: CombatGridProps) {
  const settings = useSettings();
  const tokenShape = settings.tokenShape;
  const showTokenNames = settings.showTokenNames;

  const activeMonsters = monsters.filter((m) => m.isActive);
  const alivePlayers = players.filter((p) => p.isAlive || p.hp > 0);

  // Group conditions by target name (id -> ConditionState[]).
  const condsByTarget = useMemo(() => {
    const map = new Map<string, ConditionState[]>();
    for (const c of conditions) {
      const arr = map.get(c.targetName) ?? [];
      arr.push(c);
      map.set(c.targetName, arr);
    }
    return map;
  }, [conditions]);

  // ===== Token placement: flat list of token "entries" (player stack or single monster).
  type TokenEntry =
    | {
        kind: "player";
        key: string;
        players: PlayerState[];
        name: string;
        x: number;
        y: number;
        color: string;
        isTurn: boolean;
        conditions: ConditionState[];
      }
    | {
        kind: "monster";
        key: string;
        monster: MonsterState;
        name: string;
        x: number;
        y: number;
        color: string;
        isTurn: boolean;
        conditions: ConditionState[];
      };

  const tokenEntries: TokenEntry[] = useMemo(() => {
    // Outside combat, the grid is empty — no tokens shown.
    // Tokens (players + monsters) only appear when combat is active.
    if (!combatActive) return [];
    const cellMap = new Map<string, PlayerState[]>();
    for (const p of alivePlayers) {
      const k = `${p.posX},${p.posY}`;
      const arr = cellMap.get(k) ?? [];
      arr.push(p);
      cellMap.set(k, arr);
    }
    const entries: TokenEntry[] = [];
    for (const [k, ps] of cellMap) {
      const [x, y] = k.split(",").map(Number);
      const p = ps[0];
      entries.push({
        kind: "player",
        key: `p-${p.name}`,
        players: ps,
        name: p.name,
        x,
        y,
        color: p.color,
        isTurn: currentTurnName === p.name,
        conditions: condsByTarget.get(p.name) ?? [],
      });
    }
    for (const m of activeMonsters) {
      entries.push({
        kind: "monster",
        key: `m-${m.id}`,
        monster: m,
        name: m.name,
        x: m.posX,
        y: m.posY,
        color: m.color,
        isTurn: currentTurnName === m.name,
        conditions: condsByTarget.get(m.name) ?? [],
      });
    }
    return entries;
  }, [combatActive, alivePlayers, activeMonsters, condsByTarget, currentTurnName]);

  // ===== Animation state =====
  // Animations are driven by refs + Web Animations API to avoid setState-in-effect.
  const gridRef = useRef<HTMLDivElement>(null);
  const tokenRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Track previous positions (item 17 requirement — used to detect token movement).
  const prevPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  // V2 D7: AoE preview — hovered cell during AoE targeting.
  const [aoeHoverCell, setAoeHoverCell] = useState<{ x: number; y: number } | null>(null);

  // Detect movement: when positions change, apply a brief glow animation to
  // moved tokens via the Web Animations API (no React state involved).
  useEffect(() => {
    const moved: { name: string; el: HTMLDivElement }[] = [];
    for (const entry of tokenEntries) {
      const prev = prevPositions.current.get(entry.name);
      if (prev && (prev.x !== entry.x || prev.y !== entry.y)) {
        const el = tokenRefs.current.get(entry.name);
        if (el) moved.push({ name: entry.name, el });
      }
    }
    // Update previous positions for next comparison.
    for (const entry of tokenEntries) {
      prevPositions.current.set(entry.name, { x: entry.x, y: entry.y });
    }
    for (const { el } of moved) {
      el.animate(
        [
          { filter: "drop-shadow(0 0 6px rgba(251,191,36,0.65))" },
          { filter: "drop-shadow(0 0 6px rgba(251,191,36,0.65))", offset: 0.7 },
          { filter: "drop-shadow(0 0 0 rgba(251,191,36,0))" },
        ],
        { duration: 420, easing: "ease-out" }
      );
    }
  }, [tokenEntries]);

  // React to combat anim events. All effects are applied imperatively via
  // WAAPI or by remounting overlay elements (keyed by event id) — no setState.
  const animId = lastAnimEvent?.id ?? 0;
  useEffect(() => {
    if (!lastAnimEvent) return;
    const ev = lastAnimEvent;

    // Screen shake on crit or large damage (>=10).
    if ((ev.isCrit || ev.damage >= 10) && gridRef.current) {
      gridRef.current.animate(
        [
          { transform: "translate(0,0)" },
          { transform: "translate(-4px,2px)" },
          { transform: "translate(4px,-2px)" },
          { transform: "translate(-3px,3px)" },
          { transform: "translate(0,0)" },
        ],
        { duration: 300, easing: "ease-in-out" }
      );
    }

    // Attack lunge — lean the attacker toward the target.
    if (ev.actorName && ev.targetName) {
      const attacker = tokenEntries.find((t) => t.name === ev.actorName);
      const target = tokenEntries.find((t) => t.name === ev.targetName);
      if (attacker && target) {
        const dx = target.x - attacker.x;
        const dy = target.y - attacker.y;
        const mag = Math.hypot(dx, dy) || 1;
        const lungeDx = (dx / mag) * 0.4;
        const lungeDy = (dy / mag) * 0.4;
        const el = tokenRefs.current.get(ev.actorName);
        if (el) {
          el.animate(
            [
              { transform: "translate(0,0)" },
              { transform: `translate(${lungeDx * 100}%, ${lungeDy * 100}%)`, offset: 0.4 },
              { transform: "translate(0,0)" },
            ],
            { duration: 300, easing: "ease-out" }
          );
        }
      }
    }
  }, [lastAnimEvent, tokenEntries]);

  // Whether this token is the current anim target (drives overlay rendering).
  const activeAnim: { name: string; kind: "hit" | "heal"; id: number } | null =
    lastAnimEvent && (lastAnimEvent.damage > 0 || lastAnimEvent.isHeal) && lastAnimEvent.targetName
      ? { name: lastAnimEvent.targetName, kind: lastAnimEvent.isHeal ? "heal" : "hit", id: animId }
      : null;
  const activeCrit: { name: string; id: number } | null =
    lastAnimEvent && lastAnimEvent.isCrit && lastAnimEvent.targetName
      ? { name: lastAnimEvent.targetName, id: animId }
      : null;

  // ===== AoE cell set + color =====
  const aoeCellSet = useMemo(() => {
    if (!aoe) return null;
    return new Set(aoe.cells.map((c) => `${c.x},${c.y}`));
  }, [aoe]);
  const aoeColor = aoe ? AOE_ELEMENT_COLORS[aoe.element] ?? AOE_ELEMENT_COLORS.force : null;

  // ===== Loot cells + traps (item 20) =====
  const lootCells = gridExtras?.lootCells;
  const traps = gridExtras?.traps;
  const lootCellMap = useMemo(() => {
    if (!lootCells?.length) return null;
    const m = new Map<string, string[]>();
    for (const c of lootCells) {
      const k = `${c.x},${c.y}`;
      const arr = m.get(k) ?? [];
      arr.push(c.itemName);
      m.set(k, arr);
    }
    return m;
  }, [lootCells]);
  const trapMap = useMemo(() => {
    if (!traps?.length) return null;
    const m = new Map<string, boolean>();
    for (const t of traps) m.set(`${t.x},${t.y}`, t.discovered);
    return m;
  }, [traps]);

  // ===== D&D 5e terrain: difficult (mud), cover (pillars/trees), high ground, water =====
  const terrainMap = useMemo(() => {
    // Terrain only renders during combat — outside combat the grid is empty.
    if (!combatActive) return null;
    const cells = gridExtras?.terrainCells;
    if (!cells?.length) return null;
    const m = new Map<string, string>();
    for (const c of cells) m.set(`${c.x},${c.y}`, c.type);
    return m;
  }, [combatActive, gridExtras?.terrainCells]);

  // ===== Threat range: faint red zone around ranged monsters (item 20) =====
  const threatCells = useMemo(() => {
    const ranged = activeMonsters.filter(isRangedMonster);
    if (ranged.length === 0) return null;
    const set = new Set<string>();
    const RADIUS = 5;
    for (const m of ranged) {
      for (let dx = -RADIUS; dx <= RADIUS; dx++) {
        for (let dy = -RADIUS; dy <= RADIUS; dy++) {
          const x = m.posX + dx;
          const y = m.posY + dy;
          if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) continue;
          if (Math.hypot(dx, dy) > RADIUS) continue;
          set.add(`${x},${y}`);
        }
      }
    }
    return set;
  }, [activeMonsters]);

  // D&D 5e (MASTER-PLAN 2.4): Opportunity Attack threat zones — cells adjacent
  // to melee monsters. Moving out of these cells provokes opportunity attacks.
  // Shown as a red dashed border during move mode in combat.
  const oppAttackCells = useMemo(() => {
    if (!combatActive) return null;
    const melee = activeMonsters.filter((m) => !isRangedMonster(m));
    if (melee.length === 0) return null;
    const set = new Set<string>();
    for (const m of melee) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const x = m.posX + dx;
          const y = m.posY + dy;
          if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) continue;
          set.add(`${x},${y}`);
        }
      }
    }
    return set;
  }, [activeMonsters, combatActive]);

  // ===== Range highlighting: show reachable cells during targeting =====
  const rangeCells = useMemo(() => {
    if (!yourPosition || !targetingRange || targetingMode === "none") return null;
    const set = new Set<string>();
    const px = yourPosition.x;
    const py = yourPosition.y;
    for (let dx = -targetingRange; dx <= targetingRange; dx++) {
      for (let dy = -targetingRange; dy <= targetingRange; dy++) {
        const x = px + dx;
        const y = py + dy;
        if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) continue;
        if (Math.hypot(dx, dy) > targetingRange) continue;
        set.add(`${x},${y}`);
      }
    }
    return set;
  }, [yourPosition, targetingRange, targetingMode]);

  // ===== Item 3: targeting-mode helpers =====
  const monsterByCell = useMemo(() => {
    const m = new Map<string, MonsterState>();
    for (const mon of activeMonsters) {
      const k = `${mon.posX},${mon.posY}`;
      if (!m.has(k)) m.set(k, mon);
    }
    return m;
  }, [activeMonsters]);
  // Player cell lookup for ally targeting (heal/buff)
  const playerByCell = useMemo(() => {
    const m = new Map<string, PlayerState>();
    for (const pl of alivePlayers) {
      const k = `${pl.posX},${pl.posY}`;
      if (!m.has(k)) m.set(k, pl);
    }
    return m;
  }, [alivePlayers]);
  const isTargetingActive = targetingMode !== "none";
  const gridCursorClass =
    targetingMode === "ability" || targetingMode === "aoe" || targetingMode === "item"
      ? "cursor-crosshair"
      : undefined;

  // ===== Flanking lines (unchanged from combat-v2) =====
  const flankingLines = useMemo(() => {
    if (!combatActive || !currentTurnName) return [];
    const acting = alivePlayers.find((p) => p.name === currentTurnName);
    if (!acting) return [];
    const allies = alivePlayers.filter((p) => p.name !== currentTurnName);
    const lines: { from: { x: number; y: number }; to: { x: number; y: number } }[] = [];
    for (const enemy of activeMonsters) {
      const dx = acting.posX - enemy.posX;
      const dy = acting.posY - enemy.posY;
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) continue;
      for (const ally of allies) {
        const alx = ally.posX - enemy.posX;
        const aly = ally.posY - enemy.posY;
        if (Math.max(Math.abs(alx), Math.abs(aly)) !== 1) continue;
        const sameRow = dy === 0 && aly === 0 && Math.sign(alx) === -Math.sign(dx) && Math.abs(alx) === Math.abs(dx);
        const sameCol = dx === 0 && alx === 0 && Math.sign(aly) === -Math.sign(dy) && Math.abs(aly) === Math.abs(dy);
        if (sameRow || sameCol) {
          lines.push({ from: { x: acting.posX, y: acting.posY }, to: { x: ally.posX, y: ally.posY } });
        }
      }
    }
    return lines;
  }, [combatActive, currentTurnName, alivePlayers, activeMonsters]);

  const cellPct = 100 / GRID_SIZE;

  return (
    <Card className="parchment rune-border border-border/80 gap-0 py-0 flex-1 min-h-0 overflow-hidden flex flex-col">
      <CardHeader className="pb-1 pt-1.5 px-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2 gold-text">
            <Crosshair className="h-4 w-4" /> {t(settings.lang, "ui.tactical_grid")}
          </span>
          <div className="flex items-center gap-2 text-xs font-normal">
            {isTargetingActive ? (
              <span className="flex items-center gap-1 rounded-full border border-amber-500/60 bg-amber-950/50 px-2 py-0.5 text-amber-300 animate-pulse-glow">
                <Crosshair className="h-3 w-3" />
                {targetingMode === "ability" || targetingMode === "item" ? t(settings.lang, "ui.target_select") : t(settings.lang, "ui.aoe_select")}
              </span>
            ) : combatActive ? (
              <span className="flex items-center gap-1 rounded-full border border-red-800/60 bg-red-950/50 px-2 py-0.5 text-red-300 animate-pulse-glow">
                <Swords className="h-3 w-3" /> {t(settings.lang, "game.combat")} · {t(settings.lang, "game.round")} {round}
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full border border-emerald-800/60 bg-emerald-950/40 px-2 py-0.5 text-emerald-300">
                <MapPin className="h-3 w-3" /> {t(settings.lang, "game.world")}
              </span>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-y-auto fantasy-scroll px-2 pb-1 pt-0">
        {/* Tactical grid: square shape, sized to fit the right column without
            forcing scroll. Capped at 320px on lg, expands to 400px on xl
            (1920px+ screens) so the 10×10 grid is more usable for tactical
            positioning. Kept at 400px (not larger) so the SceneViewer + grid
            + optional targeting banner all fit vertically at 1080px.
            (audit-v2: grid was 280px — too small at 1920px.) */}
        <div className="mx-auto aspect-square w-full max-w-[200px] sm:max-w-[240px] lg:max-w-[280px] xl:max-w-[340px]">
          <div
            ref={gridRef}
            className={cn(
              "relative grid h-full w-full rounded-md border border-border/70 bg-stone-950/60 p-1",
              isTargetingActive && "ring-1 ring-amber-500/60",
              gridCursorClass,
            )}
            style={{
              gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${GRID_SIZE}, minmax(0, 1fr))`,
            }}
          >
            {/* Flanking SVG overlay (drawn BEHIND tokens but above cells). */}
            {flankingLines && flankingLines.length > 0 && (
              <svg
                className="pointer-events-none absolute inset-1 z-20 h-[calc(100%-0.5rem)] w-[calc(100%-0.5rem)]"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                {flankingLines.map((ln, i) => {
                  // GRID_SIZE=16, so each cell = 100/16 = 6.25 units in the 0..100 viewBox.
                  const cellUnit = 100 / GRID_SIZE;
                  const x1 = (ln.from.x + 0.5) * cellUnit;
                  const y1 = (ln.from.y + 0.5) * cellUnit;
                  const x2 = (ln.to.x + 0.5) * cellUnit;
                  const y2 = (ln.to.y + 0.5) * cellUnit;
                  return (
                    <line
                      key={i}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="rgba(34,197,94,0.55)"
                      strokeWidth="0.6"
                      strokeDasharray="1.5 1.5"
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}
              </svg>
            )}

            {/* Cell backdrop */}
            {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, idx) => {
              const x = idx % GRID_SIZE;
              const y = Math.floor(idx / GRID_SIZE);
              const tint = (x + y) % 2 === 0 ? "bg-stone-900/40" : "bg-stone-900/70";
              const isAoeCell = aoeCellSet?.has(`${x},${y}`);
              const lootItems = lootCellMap?.get(`${x},${y}`);
              const trapDiscovered = trapMap?.get(`${x},${y}`);
              const isTrap = trapMap?.has(`${x},${y}`);
              const isThreat = threatCells?.has(`${x},${y}`);
              const inRange = rangeCells?.has(`${x},${y}`);
              const terrainType = terrainMap?.get(`${x},${y}`);
              // Item 3 — targeting-mode cell flags:
              const monsterInCell = targetingMode === "ability" || targetingMode === "item" ? monsterByCell.get(`${x},${y}`) : undefined;
              const playerInCell = targetingMode === "ability" || targetingMode === "item" ? playerByCell.get(`${x},${y}`) : undefined;
              const isAoeTargetCell = targetingMode === "aoe";
              const isAoePreviewCell = isAoeTargetCell && aoeHoverCell && (() => {
                const dx = Math.abs(x - aoeHoverCell.x);
                const dy = Math.abs(y - aoeHoverCell.y);
                return Math.max(dx, dy) <= 2;
              })();
              // Click-to-move: ONLY in combat. When not in combat, the grid
              // is display-only (no click handlers on empty cells).
              const canMoveHere = combatActive && targetingMode === "none" && onMoveClick && !monsterInCell && !playerInCell && terrainType !== "full_cover";
              // D&D 5e (MASTER-PLAN 2.4): Opportunity Attack zone — must be after canMoveHere.
              const isOppAttack = oppAttackCells?.has(`${x},${y}`) && canMoveHere;
              const cellClick =
                monsterInCell && onMonsterTargetClick
                  ? () => onMonsterTargetClick(monsterInCell.id)
                  : playerInCell && onPlayerTargetClick
                  ? () => onPlayerTargetClick(playerInCell.name)
                  : isAoeTargetCell && onCellTargetClick
                  ? () => onCellTargetClick(x, y)
                  : canMoveHere
                  ? () => onMoveClick!(x, y)
                  : undefined;
              return (
                <div
                  key={idx}
                  onClick={cellClick}
                  className={cn(
                    "relative rounded-[2px] border border-border/20",
                    tint,
                    // AoE-targeting: every cell is clickable + hover highlight.
                    isAoeTargetCell && setAoeHoverCell({ x, y }),
                    isAoeTargetCell &&
                      "cursor-crosshair border-amber-400/40 hover:bg-amber-500/30 hover:border-amber-400/80",
                    // Ability-targeting: only cells with a monster are clickable.
                    monsterInCell &&
                      "cursor-crosshair ring-2 ring-red-400/70 animate-pulse-glow hover:bg-red-500/25",
                    playerInCell && !monsterInCell &&
                      "cursor-crosshair ring-2 ring-emerald-400/70 animate-pulse-glow hover:bg-emerald-500/25",
                    // Click-to-move: empty cells show a subtle hover highlight.
                    canMoveHere &&
                      "cursor-pointer hover:bg-sky-500/15 hover:border-sky-400/40",
                  )}
                  title={
                    monsterInCell
                      ? `${t(settings.lang, "ui.select_target")}: ${monsterInCell.name} (${monsterInCell.hp}/${monsterInCell.maxHp} HP)`
                      : playerInCell
                      ? `${t(settings.lang, "ui.select_target")}: ${playerInCell.name} (${playerInCell.hp}/${playerInCell.maxHp} HP)`
                      : isAoeTargetCell
                      ? `${t(settings.lang, "ui.cast_at")} (${x}, ${y})`
                      : canMoveHere
                      ? `${t(settings.lang, "ui.move_here")} (${x}, ${y})`
                      : `(${x}, ${y})`
                  }
                >
                  {/* Threat-range overlay (faint red zone around ranged monsters) */}
                  {isThreat && (
                    <div
                      className="pointer-events-none absolute inset-0 z-10 rounded-[2px] bg-red-700/15"
                      title={t(settings.lang, "ui.threat_zone")}
                    />
                  )}
                  {/* D&D 5e (MASTER-PLAN 2.4): Opportunity Attack zone — orange
                      dashed border on cells adjacent to melee monsters in move mode. */}
                  {isOppAttack && (
                    <div
                      className="pointer-events-none absolute inset-0 z-[8] rounded-[2px] border border-dashed border-orange-500/50 bg-orange-500/10"
                      title="⚠️ Зона атаки по возможности — отход провоцирует атаку!"
                    />
                  )}
                  {/* Range highlight: shows reachable cells during targeting (blue glow) */}
                  {inRange && !isThreat && (
                    <div
                      className="pointer-events-none absolute inset-0 z-[3] rounded-[2px] bg-sky-500/10 border border-sky-400/20"
                    />
                  )}
                  {/* D&D 5e terrain features */}
                  {terrainType === "difficult" && (
                    <div
                      className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center rounded-[2px] bg-amber-950/40"
                      title={t(settings.lang, "terrain.difficult")}
                    >
                      <span className="text-[8px] opacity-60">〰️</span>
                    </div>
                  )}
                  {terrainType === "water" && (
                    <div
                      className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center rounded-[2px] bg-blue-950/50"
                      title={t(settings.lang, "terrain.water")}
                    >
                      <span className="text-[8px] opacity-70">🌊</span>
                    </div>
                  )}
                  {terrainType === "half_cover" && (
                    <div
                      className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center rounded-[2px] bg-stone-700/60 border border-stone-500/40"
                      title={t(settings.lang, "terrain.half_cover")}
                    >
                      <span className="text-[10px] opacity-80">🌳</span>
                    </div>
                  )}
                  {terrainType === "full_cover" && (
                    <div
                      className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center rounded-[2px] bg-stone-800/90 border-2 border-stone-600/60"
                      title={t(settings.lang, "terrain.full_cover")}
                    >
                      <span className="text-[10px]">🪨</span>
                    </div>
                  )}
                  {terrainType === "high_ground" && (
                    <div
                      className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center rounded-[2px] bg-amber-600/30 border border-amber-400/40"
                      title={t(settings.lang, "terrain.high_ground")}
                    >
                      <span className="text-[8px] opacity-80">⬆️</span>
                    </div>
                  )}
                  {/* Loot cell shimmer (item 20) */}
                  {lootItems && lootItems.length > 0 && (
                    <div
                      className="pointer-events-none absolute inset-0 z-10 rounded-[2px] loot-shimmer"
                      title={`${t(settings.lang, "grid.loot")}: ${lootItems.join(", ")}`}
                    />
                  )}
                  {/* Discovered trap (item 20) */}
                  {isTrap && trapDiscovered && (
                    <div
                      className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[2px] bg-red-900/55 text-[10px]"
                      title={t(settings.lang, "grid.trap")}
                    >
                      <span>⚠️</span>
                    </div>
                  )}
                  {/* AoE overlay — radial gradient fade-out over 2s. */}
                  {isAoeCell && aoeColor && (
                    <div
                      className="pointer-events-none absolute inset-0 z-30 rounded-[2px]"
                      style={{
                        background: `radial-gradient(circle at center, ${aoeColor.core} 0%, ${aoeColor.edge} 80%)`,
                        animation: "fadeOutAoe 2s ease-out forwards",
                      }}
                      title={aoe ? `${aoeColor.label} (${t(settings.lang, "ui.save_throw")} ${aoe.saveAbility ?? "ТЕЛ"} DC ${aoe.saveDC ?? 12})` : ""}
                    />
                  )}
                </div>
              );
            })}

            {/* ===== Token layer — absolutely positioned, transitions on left/top. ===== */}
            <div className="pointer-events-none absolute inset-1 z-20">
              {tokenEntries.map((entry) => {
                const left = `${entry.x * cellPct}%`;
                const top = `${entry.y * cellPct}%`;
                const width = `${cellPct}%`;
                const height = `${cellPct}%`;
                return (
                  <div
                    key={entry.key}
                    className="absolute"
                    style={{
                      left,
                      top,
                      width,
                      height,
                      transition: "left 0.4s ease, top 0.4s ease",
                    }}
                  >
                    <div
                      ref={(el) => {
                        if (el) tokenRefs.current.set(entry.name, el);
                        else tokenRefs.current.delete(entry.name);
                      }}
                      className="h-full w-full"
                    >
                      {entry.kind === "player" ? (
                        <PlayerToken
                          players={entry.players}
                          currentTurnName={currentTurnName}
                          conditions={entry.conditions}
                          tokenShape={tokenShape}
                          showName={showTokenNames}
                          anim={activeAnim && activeAnim.name === entry.name ? activeAnim : null}
                          critFx={activeCrit && activeCrit.name === entry.name ? activeCrit : null}
                          lang={settings.lang}
                        />
                      ) : (
                        <MonsterToken
                          monster={entry.monster}
                          isTurn={entry.isTurn}
                          conditions={entry.conditions}
                          tokenShape={tokenShape}
                          showName={showTokenNames}
                          anim={activeAnim && activeAnim.name === entry.name ? activeAnim : null}
                          critFx={activeCrit && activeCrit.name === entry.name ? activeCrit : null}
                          lang={settings.lang}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[9px] text-muted-foreground">
          {alivePlayers.map((p) => (
            <span key={p.id} className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
              {p.name}
            </span>
          ))}
          {activeMonsters.map((m) => (
            <span key={m.id} className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: m.color }} />
              {m.name} ({m.label})
            </span>
          ))}
          {alivePlayers.length === 0 && activeMonsters.length === 0 && (
            <span className="italic">{t(settings.lang, "grid.empty")}</span>
          )}
        </div>
      </CardContent>
      {/* D&D 5e terrain legend — shown only when terrain cells exist. */}
      {terrainMap && terrainMap.size > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/40 px-3 py-1.5 text-[9px] text-muted-foreground">
          <span className="font-semibold gold-text">{t(settings.lang, "terrain.legend")}:</span>
          <span className="flex items-center gap-0.5"><span>〰️</span> {t(settings.lang, "terrain.difficult_short")}</span>
          <span className="flex items-center gap-0.5"><span>🌳</span> {t(settings.lang, "terrain.half_cover_short")}</span>
          <span className="flex items-center gap-0.5"><span>🪨</span> {t(settings.lang, "terrain.full_cover_short")}</span>
          <span className="flex items-center gap-0.5"><span>⬆️</span> {t(settings.lang, "terrain.high_ground_short")}</span>
          <span className="flex items-center gap-0.5"><span>🌊</span> {t(settings.lang, "terrain.water_short")}</span>
        </div>
      )}
    </Card>
  );
}, combatGridComparator);

/**
 * Custom comparator for CombatGrid. Re-renders only when:
 * - combat/round/turn state changed
 * - players' grid-relevant fields changed (position, HP, color, alive, name)
 * - monsters' grid-relevant fields changed (position, HP, color, isActive, name, label, damageNotation)
 * - conditions list changed (length + id+condition+duration)
 * - aoe / lastAnimEvent reference changed
 * - gridExtras.lootCells / traps changed
 */
function combatGridComparator(prev: CombatGridProps, next: CombatGridProps): boolean {
  if (
    !Object.is(prev.combatActive, next.combatActive) ||
    !Object.is(prev.round, next.round) ||
    !Object.is(prev.currentTurnName, next.currentTurnName) ||
    !Object.is(prev.aoe, next.aoe) ||
    !Object.is(prev.lastAnimEvent, next.lastAnimEvent) ||
    !Object.is(prev.targetingMode, next.targetingMode) ||
    !Object.is(prev.onMonsterTargetClick, next.onMonsterTargetClick) ||
    !Object.is(prev.onCellTargetClick, next.onCellTargetClick)
  ) {
    return false;
  }
  if (!playersGridEqual(prev.players, next.players)) return false;
  if (!monstersGridEqual(prev.monsters, next.monsters)) return false;
  if (!conditionsListEqual(prev.conditions, next.conditions)) return false;
  if (!gridExtrasEqual(prev.gridExtras, next.gridExtras)) return false;
  return true;
}

function playersGridEqual(a: PlayerState[], b: PlayerState[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.name !== y.name ||
      x.color !== y.color ||
      x.hp !== y.hp ||
      x.maxHp !== y.maxHp ||
      x.ac !== y.ac ||
      x.isAlive !== y.isAlive ||
      x.posX !== y.posX ||
      x.posY !== y.posY ||
      x.portraitUrl !== y.portraitUrl
    ) {
      return false;
    }
  }
  return true;
}

function monstersGridEqual(a: MonsterState[], b: MonsterState[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.name !== y.name ||
      x.label !== y.label ||
      x.color !== y.color ||
      x.hp !== y.hp ||
      x.maxHp !== y.maxHp ||
      x.ac !== y.ac ||
      x.posX !== y.posX ||
      x.posY !== y.posY ||
      x.isActive !== y.isActive ||
      x.damageNotation !== y.damageNotation
    ) {
      return false;
    }
  }
  return true;
}

function conditionsListEqual(a: ConditionState[], b: ConditionState[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.targetName !== y.targetName ||
      x.condition !== y.condition ||
      x.duration !== y.duration
    ) {
      return false;
    }
  }
  return true;
}

function gridExtrasEqual(
  a: GridExtras | undefined,
  b: GridExtras | undefined
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return shallowEqual(a.lootCells, b.lootCells) && shallowEqual(a.traps, b.traps);
}

/** Small vertical stack of condition emoji icons shown at the top-right of a token. */
function ConditionIcons({ conditions, lang }: { conditions: ConditionState[]; lang: Lang }) {
  if (conditions.length === 0) return null;
  return (
    <div className="absolute -right-1 -top-1 z-10 flex flex-col items-center gap-px">
      {conditions.slice(0, 4).map((c) => {
        const def = CONDITIONS[c.condition];
        const icon = def?.icon ?? "❓";
        const name = def?.name ?? c.condition;
        const desc = def?.description ?? "";
        const color = def?.color ?? "#888";
        const sourceTag = c.source ? ` · Источник: ${c.source}` : "";
        return (
          <span
            key={c.id}
            title={`${name} (${c.duration} ${t(lang, "ui.rounds")})\n${desc}${sourceTag}`}
            className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-black/50 text-[9px] leading-none shadow-sm cursor-help"
            style={{ background: `${color}cc` }}
          >
            {icon}
          </span>
        );
      })}
      {conditions.length > 4 && (
        <span className="text-[7px] leading-none text-amber-300/80">+{conditions.length - 4}</span>
      )}
    </div>
  );
}

/** Buff aura — emerald glow for blessed/shielded, red/orange for poisoned/burning (item 18). */
function BuffAura({ conditions }: { conditions: ConditionState[] }) {
  const hasBless = conditions.some((c) => c.condition === "blessed" || c.condition === "shielded");
  const hasHarm = conditions.some((c) => c.condition === "poisoned" || c.condition === "burning");
  if (!hasBless && !hasHarm) return null;
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 rounded-full",
        hasBless ? "aura-blessed" : "aura-harmed"
      )}
    />
  );
}

/** Compute a continuous HP-color from percentage: 100%=green → 50%=yellow → 0%=red. */
function hpGradientColor(pct: number): string {
  const clamped = Math.max(0, Math.min(100, pct));
  if (clamped >= 50) {
    // green (#22c55e) → yellow (#eab308)
    const t = (100 - clamped) / 50;
    const r = Math.round(0x22 + (0xea - 0x22) * t);
    const g = Math.round(0xc5 + (0xb3 - 0xc5) * t);
    const b = Math.round(0x5e + (0x08 - 0x5e) * t);
    return `rgb(${r},${g},${b})`;
  }
  // yellow (#eab308) → red (#dc2626)
  const t = (50 - clamped) / 50;
  const r = Math.round(0xea + (0xdc - 0xea) * t);
  const g = Math.round(0xb3 + (0x26 - 0xb3) * t);
  const b = Math.round(0x08 + (0x26 - 0x08) * t);
  return `rgb(${r},${g},${b})`;
}

function PlayerToken({
  players,
  currentTurnName,
  conditions,
  tokenShape,
  showName,
  anim,
  critFx,
  lang,
}: {
  players: PlayerState[];
  currentTurnName: string | null;
  conditions: ConditionState[];
  tokenShape: "round" | "square";
  showName: boolean;
  anim: { kind: "hit" | "heal"; id: number } | null;
  critFx: { id: number } | null;
  lang: Lang;
}) {
  const p = players[0];
  const isTurn = currentTurnName === p.name;
  const hpPct = p.maxHp > 0 ? (p.hp / p.maxHp) * 100 : 0;
  const hpColor = hpGradientColor(hpPct);
  const shapeClass = tokenShape === "square" ? "rounded-md" : "rounded-full";
  const hasPortrait = Boolean(p.portraitUrl);
  return (
    <div className="flex h-full w-full flex-col items-center justify-center p-0.5">
      <div
        className={cn(
          "relative flex aspect-square w-[88%] items-center justify-center border-2 text-[8px] font-bold leading-none text-white shadow-md",
          shapeClass,
          isTurn && "ring-2 ring-amber-300 animate-pulse-glow"
        )}
        style={{
          background: hasPortrait
            ? undefined
            : `radial-gradient(circle at 30% 25%, ${p.color}, ${shade(p.color, -25)})`,
          borderColor: shade(p.color, 30),
          backgroundImage: hasPortrait ? `url(${p.portraitUrl})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
        title={players.map((x) => `${x.name} (${x.hp}/${x.maxHp} HP)`).join(", ")}
      >
        {!hasPortrait && (
          <span className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">{p.name.slice(0, 2).toUpperCase()}</span>
        )}
        {players.length > 1 && (
          <span className="absolute -left-0.5 -top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-stone-800 text-[7px] text-amber-300">
            {players.length}
          </span>
        )}
        <BuffAura conditions={conditions} />
        <ConditionIcons conditions={conditions} lang={lang} />
        {p.concentratingOn && (
          <div className="conc-indicator pointer-events-none absolute inset-0 rounded-full" title={`Концентрация: ${p.concentratingOn}`} />
        )}

        {/* HP bar — thin (3px), at bottom of token, color gradient green→yellow→red. */}
        <div
          className="absolute bottom-0 left-1/2 h-[3px] w-[80%] -translate-x-1/2 overflow-hidden rounded-full bg-black/60"
          title={`${p.hp}/${p.maxHp} HP (${Math.round(hpPct)}%) · AC ${p.ac} · ${p.raceName} ${p.charClass} ур.${p.level}`}
        >
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${Math.max(0, Math.min(100, hpPct))}%`, background: hpColor }}
          />
        </div>

        {/* Hit/heal flash overlay (item 17) */}
        {anim && (
          <div
            key={anim.id}
            className={cn("pointer-events-none absolute inset-0 z-30", anim.kind === "hit" ? "token-hit-flash" : "token-heal-flash")}
          />
        )}
        {/* Crit burst overlay (item 17) */}
        {critFx && (
          <>
            <div key={`burst-${critFx.id}`} className="pointer-events-none absolute inset-0 z-30 crit-burst-overlay" />
            <span key={`text-${critFx.id}`} className="crit-float-text">{t(lang, "ui.crit")}</span>
          </>
        )}
      </div>
      <span className="text-[7px] leading-none text-muted-foreground">{p.hp}/{p.maxHp}</span>
      {showName && (
        <span className="mt-0.5 max-w-full truncate rounded bg-black/60 px-1 text-[10px] leading-tight text-amber-100">
          {p.name}
        </span>
      )}
    </div>
  );
}

function MonsterToken({
  monster,
  isTurn,
  conditions,
  tokenShape,
  showName,
  anim,
  critFx,
  lang,
}: {
  monster: MonsterState;
  isTurn: boolean;
  conditions: ConditionState[];
  tokenShape: "round" | "square";
  showName: boolean;
  anim: { kind: "hit" | "heal"; id: number } | null;
  critFx: { id: number } | null;
  lang: Lang;
}) {
  const hpPct = monster.maxHp > 0 ? (monster.hp / monster.maxHp) * 100 : 0;
  const hpColor = hpGradientColor(hpPct);
  const shapeClass = tokenShape === "square" ? "rounded-md" : "rounded-full";
  return (
    <div className="flex h-full w-full flex-col items-center justify-center p-0.5">
      <div
        className={cn(
          "relative flex aspect-square w-[88%] items-center justify-center border-2 text-[8px] font-bold leading-none text-white shadow-md",
          shapeClass,
          isTurn && "ring-2 ring-amber-300 animate-pulse-glow"
        )}
        style={{
          background: `radial-gradient(circle at 30% 25%, ${monster.color}, ${shade(monster.color, -25)})`,
          borderColor: shade(monster.color, 30),
        }}
        title={`${monster.name} (${monster.hp}/${monster.maxHp} HP, AC ${monster.ac})`}
      >
        {/* D&D 5e Tooltip card (MASTER-PLAN 5.1): full monster info on hover. */}
        <div className="info-tooltip" style={{ display: "none" }} id={`tt-${monster.id}`}>
          <div className="mb-1 font-bold text-amber-200">{monster.name}</div>
          <div className="flex justify-between"><span className="text-muted-foreground">HP:</span><span className="text-red-300">{monster.hp}/{monster.maxHp}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">AC:</span><span className="text-sky-300">{monster.ac}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Атака:</span><span>+{monster.attackBonus}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Урон:</span><span>{monster.damageNotation}</span></div>
          {monster.resistances && monster.resistances.length > 0 && (
            <div className="flex justify-between"><span className="text-muted-foreground">Сопр:</span><span className="text-blue-300">{monster.resistances.join(", ")}</span></div>
          )}
          {monster.immunities && monster.immunities.length > 0 && (
            <div className="flex justify-between"><span className="text-muted-foreground">Иммун:</span><span className="text-indigo-300">{monster.immunities.join(", ")}</span></div>
          )}
          {monster.isBoss && <div className="mt-1 text-amber-300 font-bold">⚡ БОСС</div>}
          {monster.specialAbility && <div className="mt-1 text-[9px] text-amber-200/80">⚡ {monster.specialAbility}</div>}
        </div>
        <span className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">{monster.label}</span>
        <BuffAura conditions={conditions} />
        <ConditionIcons conditions={conditions} lang={lang} />

        {/* HP bar — thin (3px), at bottom of token, color gradient green→yellow→red. */}
        <div
          className="absolute bottom-0 left-1/2 h-[3px] w-[80%] -translate-x-1/2 overflow-hidden rounded-full bg-black/60"
          title={`${monster.hp}/${monster.maxHp} HP`}
        >
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${Math.max(0, Math.min(100, hpPct))}%`, background: hpColor }}
          />
        </div>

        {/* Hit/heal flash overlay (item 17) */}
        {anim && (
          <div
            key={anim.id}
            className={cn("pointer-events-none absolute inset-0 z-30", anim.kind === "hit" ? "token-hit-flash" : "token-heal-flash")}
          />
        )}
        {/* Crit burst overlay (item 17) */}
        {critFx && (
          <>
            <div key={`burst-${critFx.id}`} className="pointer-events-none absolute inset-0 z-30 crit-burst-overlay" />
            <span key={`text-${critFx.id}`} className="crit-float-text">{t(lang, "ui.crit")}</span>
          </>
        )}
      </div>
      <span className="text-[7px] leading-none text-muted-foreground">{monster.hp}/{monster.maxHp}</span>
      {showName && (
        <span className="mt-0.5 max-w-full truncate rounded bg-black/60 px-1 text-[10px] leading-tight text-amber-100">
          {monster.name}
        </span>
      )}
    </div>
  );
}

function shade(hex: string, amount: number): string {
  const c = hex.replace("#", "");
  const num = parseInt(c.length === 3 ? c.split("").map((ch) => ch + ch).join("") : c, 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  const f = amount / 100;
  r = Math.round(Math.max(0, Math.min(255, r + (f > 0 ? (255 - r) * f : r * f))));
  g = Math.round(Math.max(0, Math.min(255, g + (f > 0 ? (255 - g) * f : g * f))));
  b = Math.round(Math.max(0, Math.min(255, b + (f > 0 ? (255 - b) * f : b * f))));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
