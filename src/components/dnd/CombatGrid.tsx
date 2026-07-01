"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Swords, MapPin, Crosshair } from "lucide-react";
import type { PlayerState, MonsterState } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { GRID_SIZE } from "@/lib/game/state";

export function CombatGrid({
  players,
  monsters,
  combatActive,
  round,
  currentTurnName,
}: {
  players: PlayerState[];
  monsters: MonsterState[];
  combatActive: boolean;
  round: number;
  currentTurnName: string | null;
}) {
  const activeMonsters = monsters.filter((m) => m.isActive);
  const alivePlayers = players.filter((p) => p.isAlive || p.hp > 0);

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
              const cellPlayers = cell?.players ?? [];
              const monster = cell?.monster;
              const tint = (x + y) % 2 === 0 ? "bg-stone-900/40" : "bg-stone-900/70";
              return (
                <div
                  key={idx}
                  className={cn("relative flex items-center justify-center rounded-[2px] border border-border/20", tint)}
                  title={`(${x}, ${y})`}
                >
                  {cellPlayers.length > 0 && (
                    <PlayerToken
                      players={cellPlayers}
                      currentTurnName={currentTurnName}
                    />
                  )}
                  {monster && (
                    <MonsterToken monster={monster} isTurn={currentTurnName === monster.name} />
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

function PlayerToken({ players, currentTurnName }: { players: PlayerState[]; currentTurnName: string | null }) {
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
          <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-stone-800 text-[7px] text-amber-300">
            {players.length}
          </span>
        )}
      </div>
      <div className="mt-0.5 h-[3px] w-[80%] overflow-hidden rounded-full bg-black/50">
        <div className={cn("h-full transition-all duration-500", hpColor)} style={{ width: `${Math.max(0, Math.min(100, hpPct))}%` }} />
      </div>
      <span className="text-[7px] leading-none text-muted-foreground">{p.hp}/{p.maxHp}</span>
    </div>
  );
}

function MonsterToken({ monster, isTurn }: { monster: MonsterState; isTurn: boolean }) {
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
