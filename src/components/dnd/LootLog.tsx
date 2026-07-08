"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Coins, Package, Skull, Swords, Sparkles } from "lucide-react";
import type { LootDropState } from "@/lib/game/types";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<string, typeof Coins> = {
  weapon: Swords,
  armor: Sparkles,
  potion: Package,
  scroll: Package,
  key: Package,
  misc: Package,
};

const TYPE_STYLE: Record<string, string> = {
  weapon: "border-red-800/50 bg-red-950/30 text-red-300",
  armor: "border-sky-800/50 bg-sky-950/30 text-sky-300",
  potion: "border-emerald-800/50 bg-emerald-950/30 text-emerald-300",
  scroll: "border-purple-800/50 bg-purple-950/30 text-purple-300",
  key: "border-amber-800/50 bg-amber-950/30 text-amber-300",
  misc: "border-stone-700/50 bg-stone-800/40 text-stone-300",
};

/**
 * LootLog — a compact panel showing the last 20 loot drops in the room.
 * Each entry lists: killer ← monster, gold, and item badges with type-colored
 * icons. Older drops fade out. Shown in the left column under the DiceLog.
 */
export function LootLog({ drops }: { drops: LootDropState[] }) {
  return (
    <Card className="parchment rune-border border-border/80 gap-0">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm gold-text">
          <span className="flex items-center gap-2">
            <Coins className="h-4 w-4" /> Добыча
          </span>
          <Badge variant="secondary" className="text-[10px]">
            {drops.length} {drops.length === 1 ? "находка" : "находок"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="py-0">
        {drops.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-4 text-center">
            <Package className="h-5 w-5 text-muted-foreground/40" />
            <p className="text-[10px] italic text-muted-foreground">
              Повергайте врагов, чтобы собрать добычу…
            </p>
          </div>
        ) : (
          <ScrollArea className="fantasy-scroll max-h-56 pr-2">
            <ul className="space-y-1.5">
              {drops.map((d, idx) => (
                <li
                  key={d.id}
                  className={cn(
                    "rounded-md border border-border/40 bg-stone-900/40 p-1.5 transition-all",
                    idx === 0 && "border-amber-700/50 bg-amber-950/20 animate-fade-up"
                  )}
                >
                  {/* Header: killer ← monster + round */}
                  <div className="flex items-center gap-1 text-[10px]">
                    <Skull className="h-2.5 w-2.5 shrink-0 text-red-400" />
                    <span className="truncate font-semibold text-amber-200">{d.killerName}</span>
                    <span className="text-muted-foreground">←</span>
                    <span className="truncate text-muted-foreground">{d.monsterName}</span>
                    <span className="ml-auto shrink-0 text-[8px] text-muted-foreground/70">
                      Р{d.round}
                    </span>
                  </div>

                  {/* Gold + items */}
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {d.gold > 0 && (
                      <Badge
                        variant="outline"
                        className="border-amber-700/50 bg-amber-950/40 px-1.5 py-0 text-[9px] text-amber-200"
                        title="Золото"
                      >
                        <Coins className="mr-0.5 h-2.5 w-2.5" />
                        {d.gold}
                      </Badge>
                    )}
                    {d.items.map((item, i) => {
                      const Icon = TYPE_ICON[item.type] ?? Package;
                      return (
                        <Badge
                          key={i}
                          variant="outline"
                          className={cn(
                            "px-1.5 py-0 text-[9px]",
                            TYPE_STYLE[item.type] ?? TYPE_STYLE.misc
                          )}
                          title={item.description}
                        >
                          <Icon className="mr-0.5 h-2.5 w-2.5" />
                          {item.name}
                        </Badge>
                      );
                    })}
                    {d.gold === 0 && d.items.length === 0 && (
                      <span className="text-[9px] italic text-muted-foreground">
                        пусто
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
