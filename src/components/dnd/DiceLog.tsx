"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dices } from "lucide-react";
import type { DiceRollState } from "@/lib/game/types";
import { cn } from "@/lib/utils";

export function DiceLog({ rolls }: { rolls: DiceRollState[] }) {
  return (
    <Card className="parchment rune-border border-border/80 gap-0">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm gold-text">
          <Dices className="h-4 w-4" /> Кости судьбы
        </CardTitle>
      </CardHeader>
      <CardContent className="py-0">
        {rolls.length === 0 ? (
          <p className="py-3 text-center text-xs italic text-muted-foreground">
            Кости ещё не брошены…
          </p>
        ) : (
          <ul className="max-h-44 space-y-1 overflow-y-auto fantasy-scroll pr-1">
            {rolls.map((r) => {
              const success = r.success;
              return (
                <li
                  key={r.id}
                  className="flex items-center gap-2 rounded-md border border-border/40 bg-stone-900/40 px-2 py-1 text-xs animate-fade-up"
                >
                  <Dices className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{r.label}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {r.notation}
                      {r.modifier ? ` ${r.modifier >= 0 ? "+" : ""}${r.modifier}` : ""} → выпало {r.result}
                      {r.target ? ` (цель ${r.target})` : ""}
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span
                      className={cn(
                        "font-mono text-sm font-bold",
                        r.total >= 20 ? "text-amber-300 text-glow" : "text-foreground"
                      )}
                    >
                      {r.total}
                    </span>
                    {r.success !== null && r.success !== undefined && (
                      <span
                        className={cn(
                          "text-[9px] font-bold uppercase",
                          success ? "text-emerald-400" : "text-red-400"
                        )}
                      >
                        {success ? "успех" : "провал"}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
