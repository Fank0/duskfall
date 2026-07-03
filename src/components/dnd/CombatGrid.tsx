"use client";

import { useEffect, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Swords, MapPin, Crosshair } from "lucide-react";
import type { PlayerState, MonsterState, ConditionState } from "@/lib/game/types";
import { CONDITIONS } from "@/lib/game/conditions";
import { cn } from "@/lib/utils";
import { GRID_SIZE } from "@/lib/game/state";

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

const AOE_ELEMENT_COLORS: Record<string, { core: string; edge: string; label: string }> = {
  fire: { core: "rgba(249,115,22,0.85)", edge: "rgba(234,88,12,0.0)", label: "Огонь" },
  cold: { core: "rgba(59,130,246,0.85)", edge: "rgba(29,78,216,0.0)", label: "Холод" },
  lightning: { core: "rgba(234,179,8,0.9)", edge: "rgba(202,138,4,0.0)", label: "Молния" },
  acid: { core: "rgba(22,163,74,0.85)", edge: "rgba(20,83,45,0.0)", label: "Кислота" },
  force: { core: "rgba(168,85,247,0.85)", edge: "rgba(126,34,206,0.0)", label: "Сила" },
  poison: { core: "rgba(74,222,128,0.85)", edge: "rgba(22,163,74,0.0)", label: "Яд" },
  thunder: { core: "rgba(6,182,212,0.85)", edge: "rgba(8,145,178,0.0)", label: "Гром" },
};

export function CombatGrid({
  players,
  monsters,
  combatActive,
  round,
  currentTurnName,
  conditions,
  aoe,
  lastAnimEvent,
}: {
  players: PlayerState[];
  monsters: MonsterState[];
  combatActive: boolean;
  round: number;
  currentTurnName: string | null;
  conditions: ConditionState[];
  aoe?: AoEOverlay | null;
  lastAnimEvent?: CombatAnimEvent | null;
}) {
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
  }, [alivePlayers, activeMonsters, condsByTarget, currentTurnName]);

  // ===== Animation state =====
  // Animations are driven by refs + Web Animations API to avoid setState-in-effect.
  const gridRef = useRef<HTMLDivElement>(null);
  const tokenRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Track previous positions (item 17 requirement — used to detect token movement).
  const prevPositions = useRef<Map<string, { x: number; y: number }>>(new Map());

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
    <Card className="parchment rune-border border-border/80 gap-0">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2 gold-text">
            <Crosshair className="h-4 w-4" /> Тактическая сетка
          </span>
          <div className="flex items-center gap-2 text-xs font-normal">
            {combatActive ? (
              <span className="flex items-center gap-1 rounded-full border border-red-800/60 bg-red-950/50 px-2 py-0.5 text-red-300 animate-pulse-glow">
                <Swords className="h-3 w-3" /> Бой · Раунд {round}
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full border border-emerald-800/60 bg-emerald-950/40 px-2 py-0.5 text-emerald-300">
                <MapPin className="h-3 w-3" /> Мир
              </span>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mx-auto aspect-square w-full max-w-[340px]">
          <div
            ref={gridRef}
            className="relative grid h-full w-full rounded-md border border-border/70 bg-stone-950/60 p-1"
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
                  const x1 = (ln.from.x + 0.5) * 10;
                  const y1 = (ln.from.y + 0.5) * 10;
                  const x2 = (ln.to.x + 0.5) * 10;
                  const y2 = (ln.to.y + 0.5) * 10;
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
              return (
                <div
                  key={idx}
                  className={cn("relative rounded-[2px] border border-border/20", tint)}
                  title={`(${x}, ${y})`}
                >
                  {/* AoE overlay — radial gradient fade-out over 2s. */}
                  {isAoeCell && aoeColor && (
                    <div
                      className="pointer-events-none absolute inset-0 z-30 rounded-[2px]"
                      style={{
                        background: `radial-gradient(circle at center, ${aoeColor.core} 0%, ${aoeColor.edge} 80%)`,
                        animation: "fadeOutAoe 2s ease-out forwards",
                      }}
                      title={aoe ? `${aoeColor.label} (спасбросок ${aoe.saveAbility ?? "ТЕЛ"} DC ${aoe.saveDC ?? 12})` : ""}
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
                          anim={activeAnim && activeAnim.name === entry.name ? activeAnim : null}
                          critFx={activeCrit && activeCrit.name === entry.name ? activeCrit : null}
                        />
                      ) : (
                        <MonsterToken
                          monster={entry.monster}
                          isTurn={entry.isTurn}
                          conditions={entry.conditions}
                          anim={activeAnim && activeAnim.name === entry.name ? activeAnim : null}
                          critFx={activeCrit && activeCrit.name === entry.name ? activeCrit : null}
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
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
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
            <span className="italic">На сетке никого нет</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Small vertical stack of condition emoji icons shown at the top-right of a token. */
function ConditionIcons({ conditions }: { conditions: ConditionState[] }) {
  if (conditions.length === 0) return null;
  return (
    <div className="absolute -right-1 -top-1 z-10 flex flex-col items-center gap-px">
      {conditions.slice(0, 4).map((c) => {
        const def = CONDITIONS[c.condition];
        const icon = def?.icon ?? "❓";
        const name = def?.name ?? c.condition;
        const color = def?.color ?? "#888";
        return (
          <span
            key={c.id}
            title={`${name} (${c.duration} раундов)`}
            className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-black/50 text-[9px] leading-none shadow-sm"
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

function PlayerToken({
  players,
  currentTurnName,
  conditions,
  anim,
  critFx,
}: {
  players: PlayerState[];
  currentTurnName: string | null;
  conditions: ConditionState[];
  anim: { kind: "hit" | "heal"; id: number } | null;
  critFx: { id: number } | null;
}) {
  const p = players[0];
  const isTurn = currentTurnName === p.name;
  const hpPct = p.maxHp > 0 ? (p.hp / p.maxHp) * 100 : 0;
  const hpColor = hpPct > 60 ? "bg-emerald-500" : hpPct > 30 ? "bg-amber-500" : "bg-red-600";
  return (
    <div className="flex h-full w-full flex-col items-center justify-center p-0.5">
      <div
        className={cn(
          "relative flex aspect-square w-[88%] items-center justify-center rounded-full border-2 text-[8px] font-bold leading-none text-white shadow-md",
          isTurn && "ring-2 ring-amber-300 animate-pulse-glow"
        )}
        style={{
          background: `radial-gradient(circle at 30% 25%, ${p.color}, ${shade(p.color, -25)})`,
          borderColor: shade(p.color, 30),
        }}
        title={players.map((x) => x.name).join(", ")}
      >
        <span className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">{p.name.slice(0, 2).toUpperCase()}</span>
        {players.length > 1 && (
          <span className="absolute -left-0.5 -top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-stone-800 text-[7px] text-amber-300">
            {players.length}
          </span>
        )}
        <ConditionIcons conditions={conditions} />
        <div className="mt-0.5 h-[3px] w-[80%] overflow-hidden rounded-full bg-black/50">
          <div className={cn("h-full transition-all duration-500", hpColor)} style={{ width: `${Math.max(0, Math.min(100, hpPct))}%` }} />
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
            <span key={`text-${critFx.id}`} className="crit-float-text">КРИТ!</span>
          </>
        )}
      </div>
      <span className="text-[7px] leading-none text-muted-foreground">{p.hp}/{p.maxHp}</span>
    </div>
  );
}

function MonsterToken({
  monster,
  isTurn,
  conditions,
  anim,
  critFx,
}: {
  monster: MonsterState;
  isTurn: boolean;
  conditions: ConditionState[];
  anim: { kind: "hit" | "heal"; id: number } | null;
  critFx: { id: number } | null;
}) {
  const hpPct = monster.maxHp > 0 ? (monster.hp / monster.maxHp) * 100 : 0;
  const hpColor = hpPct > 60 ? "bg-emerald-500" : hpPct > 30 ? "bg-amber-500" : "bg-red-600";
  return (
    <div className="flex h-full w-full flex-col items-center justify-center p-0.5">
      <div
        className={cn(
          "relative flex aspect-square w-[88%] items-center justify-center rounded-full border-2 text-[8px] font-bold leading-none text-white shadow-md",
          isTurn && "ring-2 ring-amber-300 animate-pulse-glow"
        )}
        style={{
          background: `radial-gradient(circle at 30% 25%, ${monster.color}, ${shade(monster.color, -25)})`,
          borderColor: shade(monster.color, 30),
        }}
        title={monster.name}
      >
        <span className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">{monster.label}</span>
        <ConditionIcons conditions={conditions} />
        <div className="mt-0.5 h-[3px] w-[80%] overflow-hidden rounded-full bg-black/50">
          <div className={cn("h-full transition-all duration-500", hpColor)} style={{ width: `${Math.max(0, Math.min(100, hpPct))}%` }} />
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
            <span key={`text-${critFx.id}`} className="crit-float-text">КРИТ!</span>
          </>
        )}
      </div>
      <span className="text-[7px] leading-none text-muted-foreground">{monster.hp}/{monster.maxHp}</span>
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
