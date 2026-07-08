"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Dices, ChevronRight } from "lucide-react";
import type { InitiativeEntryState, PlayerState, MonsterState } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { useSettings } from "@/lib/game/settings";
import { t } from "@/lib/game/i18n";

export function InitiativeTracker({
  initiatives,
  turnIndex,
  players,
  monsters,
  combatActive,
  round,
}: {
  initiatives: InitiativeEntryState[];
  turnIndex: number;
  players: PlayerState[];
  monsters: MonsterState[];
  combatActive: boolean;
  round: number;
}) {
  const settings = useSettings();
  const lang = settings.lang;
  const tt = (key: string, params?: Record<string, string | number>) => t(lang, key, params);

  if (!combatActive || initiatives.length === 0) return null;

  function colorFor(name: string, type: string): string {
    if (type === "player") {
      const p = players.find((x) => x.name === name);
      return p?.color ?? "#888";
    }
    const m = monsters.find((x) => x.name === name);
    return m?.color ?? "#16a34a";
  }

  function isDead(name: string, type: string): boolean {
    if (type === "player") {
      const p = players.find((x) => x.name === name);
      return !p || !p.isAlive || p.hp <= 0;
    }
    const m = monsters.find((x) => x.name === name);
    return !m || !m.isActive || m.hp <= 0;
  }

  return (
    <Card className="parchment rune-border border-border/80 gap-0 overflow-hidden">
      <CardContent className="py-2">
        <div className="mb-1.5 flex items-center gap-2">
          <Dices className="h-4 w-4 text-amber-300" />
          <span className="text-xs font-semibold gold-text">{tt("game.initiative")}</span>
          <span className="ml-auto text-[10px] text-muted-foreground">{tt("game.round")} {round}</span>
        </div>
        <div className="flex gap-1.5 overflow-x-auto fantasy-scroll pb-1">
          {initiatives.map((e, i) => {
            const isCurrent = i === turnIndex;
            const isNext = i === (turnIndex + 1) % initiatives.length;
            const dead = isDead(e.combatantName, e.combatantType);
            const label =
              e.combatantType === "player"
                ? e.combatantName
                : monsters.find((m) => m.name === e.combatantName)?.label ?? e.combatantName;
            return (
              <div key={e.id} className="flex items-center">
                <div
                  className={cn(
                    "flex min-w-[64px] flex-col items-center rounded-md border px-2 py-1 transition-all",
                    isCurrent
                      ? "border-primary bg-primary/15 scale-105 animate-pulse-glow"
                      : isNext
                        ? "border-amber-600/50 bg-amber-950/20"
                        : "border-border/50 bg-stone-900/40",
                    dead && "opacity-40"
                  )}
                >
                  <div className="flex items-center gap-1">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: colorFor(e.combatantName, e.combatantType) }}
                    />
                    <span className="truncate text-[10px] font-semibold">{label}</span>
                  </div>
                  <span className="font-mono text-xs font-bold text-amber-300">{e.initiative}</span>
                  {isCurrent && <span className="text-[8px] text-primary">▶ {tt("game.now")}</span>}
                  {isNext && !isCurrent && !dead && <span className="text-[8px] text-amber-400">→ {tt("game.next")}</span>}
                  {dead && <span className="text-[8px] text-red-400">{tt("char.dead_short")}</span>}
                </div>
                {i < initiatives.length - 1 && (
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
