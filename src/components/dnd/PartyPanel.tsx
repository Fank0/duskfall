"use client";

import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Users, Crown, Heart, Skull, ChevronDown } from "lucide-react";
import type { PlayerState } from "@/lib/game/types";
import { abilityModifier } from "@/lib/game/dice";
import { useSettings } from "@/lib/game/settings";
import { t } from "@/lib/game/i18n";
import { localizeData } from "@/lib/game/i18n";
import { makeShallowComparator } from "@/lib/game/shallow";
import { cn } from "@/lib/utils";

interface PartyPanelProps {
  players: PlayerState[];
  youName: string;
  currentTurnName: string | null;
}

/**
 * PartyPanel — list of party members with HP bars. Wrapped in React.memo with
 * a custom shallow comparator so it only re-renders when `players` (compared
 * element-by-element), `youName`, or `currentTurnName` actually changes.
 * Settings (collapse state) are read via Zustand and trigger their own update.
 */
export const PartyPanel = memo(function PartyPanel({
  players,
  youName,
  currentTurnName,
}: PartyPanelProps) {
  const settings = useSettings();
  const collapsed = settings.collapsedParty;
  return (
    <Card className="parchment rune-border border-border/80 gap-0">
      <Collapsible open={!collapsed} onOpenChange={(o) => settings.setCollapsedParty(!o)}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer select-none pb-2 transition-colors hover:bg-stone-900/40">
            <CardTitle className="flex items-center justify-between text-sm gold-text">
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4" /> {t(settings.lang, "ui.party")}
              </span>
              <span className="flex items-center gap-1.5">
                <Badge variant="secondary" className="text-[10px]">
                  {players.filter((p) => p.isAlive && p.hp > 0).length}/{players.length} {t(settings.lang, "ui.in_party")}
                </Badge>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", collapsed && "rotate-180")} />
              </span>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
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
                          <Badge className="ml-auto shrink-0 bg-primary text-[9px]">{t(settings.lang, "game.turn")}</Badge>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="font-medium text-stone-300">{localizeData(settings.lang, "race", p.raceName)} {localizeData(settings.lang, "class", p.charClass)}</span>
                        <span>·</span>
                        <span className="text-amber-300/80">{t(settings.lang, "character.level_short")}{p.level}</span>
                        <span>·</span>
                        <span className="flex items-center gap-0.5">
                          <Heart className="h-2.5 w-2.5 text-red-400" />
                          <span className={cn(hpPct <= 30 && "font-bold text-red-400")}>{p.hp}/{p.maxHp}</span>
                        </span>
                        <span>·</span>
                        <span>{t(settings.lang, "character.ac")} {p.ac}</span>
                        {p.gold > 0 && (
                          <>
                            <span>·</span>
                            <span className="text-amber-400">{p.gold}з</span>
                          </>
                        )}
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/40">
                        <div
                          className={cn(
                            "h-full transition-all duration-500",
                            hpPct > 60 ? "bg-emerald-500" : hpPct > 30 ? "bg-amber-500" : "bg-red-600 animate-pulse"
                          )}
                          style={{ width: `${hpPct}%` }}
                        />
                      </div>
                      <div className="mt-0.5 flex items-center justify-between text-[9px] font-mono text-muted-foreground">
                        <span>{t(settings.lang, "character.str")}{p.str}({fmt(abilityModifier(p.str))}) {t(settings.lang, "character.dex")}{p.dex}({fmt(abilityModifier(p.dex))}) {t(settings.lang, "character.con")}{p.con}({fmt(abilityModifier(p.con))})</span>
                        <span className="truncate ml-1 text-stone-400">{p.weaponName}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}, makeShallowComparator<PartyPanelProps>());

function fmt(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}
