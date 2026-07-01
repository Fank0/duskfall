"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Swords, MapPin, Crosshair } from "lucide-react";
import type { PlayerState, MonsterState } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { GRID_SIZE } from "@/lib/game/state";

export function CombatGrid({
  player,
  monsters,
  combatActive,
  round,
}: {
  player: PlayerState;
  monsters: MonsterState[];
  combatActive: boolean;
  round: number;
}) {
  const activeMonsters = monsters.filter((m) => m.isActive);

  // Build a lookup of occupied cells.
  const cells = useMemo(() => {
    const map = new Map<string, { player?: boolean; monster?: MonsterState }>();
    map.set(`${player.posX},${player.posY}`, { player: true });
    for (const m of activeMonsters) {
      const key = `${m.posX},${m.posY}`;
      const ex = map.get(key) ?? {};
      ex.monster = m;
      map.set(key, ex);
    }
    return map;
  }, [player, activeMonsters]);

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
        <div className="mx-auto aspect-square w-full max-w-[460px]">
          <div
            className="grid h-full w-full gap-px rounded-md border border-border/70 bg-stone-950/60 p-1"
            style={{
              gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${GRID_SIZE}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, idx) => {
              const x = idx % GRID_SIZE;
              const y = Math.floor(idx / GRID_SIZE);
              const cell = cells.get(`${x},${y}`);
              const isPlayer = cell?.player;
              const monster = cell?.monster;
              // checkerboard tint
              const tint = (x + y) % 2 === 0 ? "bg-stone-900/40" : "bg-stone-900/70";
              return (
                <div
                  key={idx}
                  className={cn(
                    "relative flex items-center justify-center rounded-[2px] border border-border/20",
                    tint
                  )}
                  title={`(${x}, ${y})`}
                >
                  {isPlayer && (
                    <Token
                      label={player.name.slice(0, 2).toUpperCase()}
                      color={player.color}
                      sub={`HP ${player.hp}/${player.maxHp}`}
                      hpPct={(player.hp / player.maxHp) * 100}
                      kind="player"
                    />
                  )}
                  {monster && (
                    <Token
                      label={monster.label}
                      color={monster.color}
                      sub={`${monster.hp}/${monster.maxHp}`}
                      hpPct={(monster.hp / monster.maxHp) * 100}
                      kind="monster"
                      name={monster.name}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: player.color }} />
            {player.name}
          </span>
          {activeMonsters.map((m) => (
            <span key={m.id} className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
              {m.name} ({m.label})
            </span>
          ))}
          {activeMonsters.length === 0 && !combatActive && (
            <span className="italic">Противников на сетке нет</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Token({
  label,
  color,
  sub,
  hpPct,
  kind,
  name,
}: {
  label: string;
  color: string;
  sub: string;
  hpPct: number;
  kind: "player" | "monster";
  name?: string;
}) {
  const hpColor =
    hpPct > 60 ? "bg-emerald-500" : hpPct > 30 ? "bg-amber-500" : "bg-red-600";
  return (
    <div className="flex h-full w-full flex-col items-center justify-center p-0.5">
      <div
        className={cn(
          "relative flex aspect-square w-[88%] items-center justify-center rounded-full border-2 text-[9px] font-bold leading-none text-white shadow-md",
          kind === "player" ? "ring-2 ring-primary/50 animate-pulse-glow" : ""
        )}
        style={{
          background: `radial-gradient(circle at 30% 25%, ${color}, ${shade(color, -25)})`,
          borderColor: shade(color, 30),
        }}
        title={name ?? label}
      >
        <span className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">{label}</span>
      </div>
      <div className="mt-0.5 h-[3px] w-[80%] overflow-hidden rounded-full bg-black/50">
        <div
          className={cn("h-full transition-all duration-500", hpColor)}
          style={{ width: `${Math.max(0, Math.min(100, hpPct))}%` }}
        />
      </div>
      <span className="text-[7px] leading-none text-muted-foreground">{sub}</span>
    </div>
  );
}

/** Darken/lighten a hex color by a percentage amount (-100..100). */
function shade(hex: string, amount: number): string {
  const c = hex.replace("#", "");
  const num = parseInt(
    c.length === 3
      ? c
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : c,
    16
  );
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  const f = amount / 100;
  r = Math.round(Math.max(0, Math.min(255, r + (f > 0 ? (255 - r) * f : r * f))));
  g = Math.round(Math.max(0, Math.min(255, g + (f > 0 ? (255 - g) * f : g * f))));
  b = Math.round(Math.max(0, Math.min(255, b + (f > 0 ? (255 - b) * f : b * f))));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
