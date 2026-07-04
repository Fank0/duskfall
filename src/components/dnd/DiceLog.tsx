"use client";

import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dices, ChevronDown } from "lucide-react";
import type { DiceRollState } from "@/lib/game/types";
import { useSettings } from "@/lib/game/settings";
import { t } from "@/lib/game/i18n";
import { makeShallowComparator } from "@/lib/game/shallow";
import { cn } from "@/lib/utils";

/**
 * DiceLog renders the latest dice rolls. Wrapped in React.memo with a custom
 * shallow comparator: the only meaningful prop is `rolls` (array of roll
 * records), which is compared element-by-element. The settings store is read
 * via a hook and triggers its own re-render via Zustand, so the comparator
 * only needs to gate on prop identity.
 */
export const DiceLog = memo(function DiceLog({ rolls }: { rolls: DiceRollState[] }) {
  const settings = useSettings();
  const collapsed = settings.collapsedDiceLog;
  return (
    <Card className="parchment rune-border border-border/80 gap-0">
      <Collapsible open={!collapsed} onOpenChange={(o) => settings.setCollapsedDiceLog(!o)}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer select-none pb-2 transition-colors hover:bg-stone-900/40">
            <CardTitle className="flex items-center justify-between text-sm gold-text">
              <span className="flex items-center gap-2">
                <Dices className="h-4 w-4" /> {t(settings.lang, "ui.dice")}
              </span>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", collapsed && "rotate-180")} />
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="py-0">
            {rolls.length === 0 ? (
              <p className="py-3 text-center text-xs italic text-muted-foreground">
                {t(settings.lang, "chat.dice_empty") || "Кости ещё не брошены…"}
              </p>
            ) : (
              <ul className="max-h-28 space-y-1 overflow-y-auto fantasy-scroll pr-1">
                {rolls.map((r) => {
                  const success = r.success;
                  const isAdv = r.advantageMode === "advantage";
                  const isDisadv = r.advantageMode === "disadvantage";
                  const bothRolls = r.allRolls && r.allRolls.length > 1 ? r.allRolls : null;
                  const isCrit = r.result === 20;
                  const isFumble = r.result === 1;
                  return (
                    <li
                      key={r.id}
                      className={cn(
                        "flex items-center gap-2 rounded-md border px-2 py-1 text-xs animate-fade-up",
                        isCrit ? "border-amber-500/60 bg-amber-950/30" : isFumble ? "border-red-500/60 bg-red-950/30" : "border-border/40 bg-stone-900/40",
                      )}
                    >
                      <Dices className={cn("h-3.5 w-3.5 shrink-0", isCrit ? "text-amber-300" : "text-amber-400/70")} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span className="truncate font-medium">{r.label}</span>
                          {isAdv && <span title="Преимущество" className="shrink-0 text-emerald-400 font-bold">↑</span>}
                          {isDisadv && <span title="Помеха" className="shrink-0 text-red-400 font-bold">↓</span>}
                          {isCrit && <span className="shrink-0 text-[9px] font-bold text-amber-300 uppercase">Крит!</span>}
                          {isFumble && <span className="shrink-0 text-[9px] font-bold text-red-400 uppercase">Провал!</span>}
                        </div>
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {r.notation}
                          {r.modifier ? ` ${r.modifier >= 0 ? "+" : ""}${r.modifier}` : ""} →{" "}
                          {bothRolls ? (
                            <span>
                              {" "}
                              {bothRolls.map((v, i) => {
                                const kept = v === r.result;
                                return (
                                  <span key={i}>
                                    {i > 0 && " / "}
                                    <span className={cn(kept && "font-bold text-amber-300")}>{v}</span>
                                    {!kept && <span className="text-muted-foreground/60 line-through"> {v}</span>}
                                  </span>
                                );
                              })}
                            </span>
                          ) : (
                            <span>выпало {r.result}</span>
                          )}
                          {r.target ? ` (цель ${r.target})` : ""}
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <span
                          className={cn(
                            "font-mono text-sm font-bold",
                            isCrit ? "text-amber-300 text-glow" : isFumble ? "text-red-400" : "text-foreground",
                          )}
                        >
                          {r.total}
                        </span>
                        {r.success !== null && r.success !== undefined && (
                          <span
                            className={cn(
                              "text-[9px] font-bold uppercase",
                              success ? "text-emerald-400" : "text-red-400",
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
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}, makeShallowComparator<{ rolls: DiceRollState[] }>());
