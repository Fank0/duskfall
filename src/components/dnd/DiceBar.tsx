"use client";

import { Dices, ChevronRight } from "lucide-react";
import type { DiceRollState } from "@/lib/game/types";
import { cn } from "@/lib/utils";

/**
 * DiceBar — миниатюрная полоса с последними бросками костей (1 строка).
 * Расположена над чатом с Мастером. Показывает последние 3-4 броска
 * в компактном виде: метка → результат → успех/провал.
 */
export function DiceBar({ rolls }: { rolls: DiceRollState[] }) {
  const recent = rolls.slice(0, 4);

  return (
    <div className="flex shrink-0 items-center gap-1.5 rounded-md border border-border/50 bg-stone-950/70 px-2 py-1 backdrop-blur overflow-hidden">
      <Dices className="h-3 w-3 shrink-0 text-amber-300" />
      <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
        Кости
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        {recent.length === 0 ? (
          <span className="text-[9px] italic text-muted-foreground/60">
            Кости ещё не брошены…
          </span>
        ) : (
          recent.map((r, i) => (
            <div
              key={r.id}
              className={cn(
                "flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-mono",
                i === 0 && "bg-amber-950/30 border border-amber-700/30",
                r.success === true && "text-emerald-300",
                r.success === false && "text-red-400",
                r.success === null && "text-stone-300",
              )}
              title={`${r.label}: ${r.notation}${r.modifier >= 0 ? "+" : ""}${r.modifier} = ${r.total}${r.target ? ` vs ${r.target}` : ""}`}
            >
              <span className="max-w-[80px] truncate text-muted-foreground">{r.label}</span>
              <span className="font-bold">{r.total}</span>
              {r.target && (
                <span className="text-muted-foreground/60">/{r.target}</span>
              )}
              {i < recent.length - 1 && <ChevronRight className="h-2 w-2 text-muted-foreground/30" />}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
