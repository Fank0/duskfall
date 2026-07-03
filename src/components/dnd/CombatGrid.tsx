"use client";

import { useMemo } from "react";
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
  flankingLines,
}: {
  players: PlayerState[];
  monsters: MonsterState[];
  combatActive: boolean;
  round: number;
  currentTurnName: string | null;
  conditions: ConditionState[];
  aoe?: AoEOverlay | null;
  flankingLines?: { from: { x: number; y: number }; to: { x: number; y: number } }[];
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

  const cells = useMemo(() => {
    const map = new Map<string, { players: PlayerState[]; monster?: MonsterState }>();
    for (const p of alivePlayers) {
      const key = `${p.posX},${p.posY}`;
      const ex = map.get(key) ?? { players: [] };
      ex.players.push(p);
      map.set(key, ex);
    }
    for (const m of activeMonsters) {
      const key = `${m.posX},${m.posY}`;
      const ex = map.get(key) ?? { players: [] };
      ex.monster = m;
      map.set(key, ex);
    }
    return map;
  }, [alivePlayers, activeMonsters]);

  // AoE cell set for fast lookup.
  const aoeCellSet = useMemo(() => {
    if (!aoe) return null;
    return new Set(aoe.cells.map((c) => `${c.x},${c.y}`));
  }, [aoe]);
  const aoeColor = aoe ? AOE_ELEMENT_COLORS[aoe.element] ?? AOE_ELEMENT_COLORS.force : null;

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
            className="relative grid h-full w-full gap-px rounded-md border border-border/70 bg-stone-950/60 p-1"
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
                  // Convert cell coords to % of grid (each cell = 10%).
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

            {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, idx) => {
              const x = idx % GRID_SIZE;
              const y = Math.floor(idx / GRID_SIZE);
              const cell = cells.get(`${x},${y}`);
              const cellPlayers = cell?.players ?? [];
              const monster = cell?.monster;
              const tint = (x + y) % 2 === 0 ? "bg-stone-900/40" : "bg-stone-900/70";
              const isAoeCell = aoeCellSet?.has(`${x},${y}`);
              return (
                <div
                  key={idx}
                  className={cn("relative flex items-center justify-center rounded-[2px] border border-border/20", tint)}
                  title={`(${x}, ${y})`}
                >
                  {/* AoE overlay — radial gradient fade-out over 2s. */}
                  {isAoeCell && aoeColor && (
                    <div
                      className="pointer-events-none absolute inset-0 z-30 rounded-[2px] animate-fade-out"
                      style={{
                        background: `radial-gradient(circle at center, ${aoeColor.core} 0%, ${aoeColor.edge} 80%)`,
                        animation: "fadeOutAoe 2s ease-out forwards",
                      }}
                      title={aoe ? `${aoeColor.label} (спасбросок ${aoe.saveAbility ?? "ТЕЛ"} DC ${aoe.saveDC ?? 12})` : ""}
                    />
                  )}
                  {cellPlayers.length > 0 && (
                    <PlayerToken
                      players={cellPlayers}
                      currentTurnName={currentTurnName}
                      conditions={condsByTarget.get(cellPlayers[0].name) ?? []}
                    />
                  )}
                  {monster && (
                    <MonsterToken
                      monster={monster}
                      isTurn={currentTurnName === monster.name}
                      conditions={condsByTarget.get(monster.name) ?? []}
                    />
                  )}
                </div>
              );
            })}
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
            className="flex h-3 w-3 items-center justify-center rounded-full border border-black/50 text-[8px] leading-none shadow-sm"
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
}: {
  players: PlayerState[];
  currentTurnName: string | null;
  conditions: ConditionState[];
}) {
  // Show the first player in the cell as the token (others stack).
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
      </div>
      <div className="mt-0.5 h-[3px] w-[80%] overflow-hidden rounded-full bg-black/50">
        <div className={cn("h-full transition-all duration-500", hpColor)} style={{ width: `${Math.max(0, Math.min(100, hpPct))}%` }} />
      </div>
      <span className="text-[7px] leading-none text-muted-foreground">{p.hp}/{p.maxHp}</span>
    </div>
  );
}

function MonsterToken({
  monster,
  isTurn,
  conditions,
}: {
  monster: MonsterState;
  isTurn: boolean;
  conditions: ConditionState[];
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
      </div>
      <div className="mt-0.5 h-[3px] w-[80%] overflow-hidden rounded-full bg-black/50">
        <div className={cn("h-full transition-all duration-500", hpColor)} style={{ width: `${Math.max(0, Math.min(100, hpPct))}%` }} />
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
