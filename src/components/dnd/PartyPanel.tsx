"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users, Crown, Heart, Skull } from "lucide-react";
import type { PlayerState } from "@/lib/game/types";
import { abilityModifier } from "@/lib/game/dice";
import { cn } from "@/lib/utils";

export function PartyPanel({
  players,
  youName,
  currentTurnName,
}: {
  players: PlayerState[];
  youName: string;
  currentTurnName: string | null;
}) {
  return (
    <Card className="parchment rune-border border-border/80 gap-0">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm gold-text">
          <span className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Отряд
          </span>
          <Badge variant="secondary" className="text-[10px]">
            {players.filter((p) => p.isAlive && p.hp > 0).length}/{players.length} в строю
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="py-0">
        <ScrollArea className="fantasy-scroll max-h-64 pr-2">
          <ul className="space-y-1.5">
            {players.map((p) => {
              const isYou = p.name === youName;
              const isTurn = currentTurnName === p.name;
              const dead = !p.isAlive || p.hp <= 0;
              const hpPct = p.maxHp > 0 ? (p.hp / p.maxHp) * 100 : 0;
              return (
                <li
                  key={p.id}
                  className={cn(
                    "rounded-md border p-2 transition-all",
                    isTurn
                      ? "border-primary bg-primary/10 animate-pulse-glow"
                      : "border-border/50 bg-stone-900/40",
                    dead && "opacity-50"
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: p.color }}
                    />
                    <span className="truncate text-sm font-semibold">{p.name}</span>
                    {isYou && (
                      <Badge variant="outline" className="shrink-0 border-primary/60 text-[9px] text-primary">
                        Вы
                      </Badge>
                    )}
                    {p.isHost && <Crown className="h-3 w-3 shrink-0 text-amber-300" />}
                    {dead && <Skull className="h-3 w-3 shrink-0 text-red-400" />}
                    {isTurn && (
                      <Badge className="ml-auto shrink-0 bg-primary text-[9px]">Ход</Badge>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{p.raceName} {p.charClass}</span>
                    <span>·</span>
                    <span className="flex items-center gap-0.5">
                      <Heart className="h-2.5 w-2.5 text-red-400" />
                      {p.hp}/{p.maxHp}
                    </span>
                    <span>·</span>
                    <span>AC {p.ac}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/40">
                    <div
                      className={cn(
                        "h-full transition-all duration-500",
                        hpPct > 60 ? "bg-emerald-500" : hpPct > 30 ? "bg-amber-500" : "bg-red-600"
                      )}
                      style={{ width: `${hpPct}%` }}
                    />
                  </div>
                  <div className="mt-0.5 text-[9px] font-mono text-muted-foreground">
                    СИЛ{p.str}({fmt(abilityModifier(p.str))}) ЛОВ{p.dex}({fmt(abilityModifier(p.dex))}) · {p.weaponName}
                  </div>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function fmt(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}
