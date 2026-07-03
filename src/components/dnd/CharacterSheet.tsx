"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Heart, Shield, Coins, Swords, Backpack, Skull, Crown, Sparkles, Scroll as ScrollIcon } from "lucide-react";
import type { PlayerState, InventoryItemState, ConditionState } from "@/lib/game/types";
import { abilityModifier } from "@/lib/game/dice";
import { computeAbilities } from "@/lib/game/abilities";
import { CONDITIONS } from "@/lib/game/conditions";
import { cn } from "@/lib/utils";

const STAT_LABELS: { key: keyof PlayerState; short: string }[] = [
  { key: "str", short: "СИЛ" },
  { key: "dex", short: "ЛОВ" },
  { key: "con", short: "ТЕЛ" },
  { key: "int", short: "ИНТ" },
  { key: "wis", short: "МУД" },
  { key: "cha", short: "ХАР" },
];

const TYPE_STYLES: Record<string, string> = {
  weapon: "bg-red-950/60 text-red-300 border-red-800/60",
  armor: "bg-sky-950/60 text-sky-300 border-sky-800/60",
  potion: "bg-emerald-950/60 text-emerald-300 border-emerald-800/60",
  key: "bg-amber-950/60 text-amber-300 border-amber-800/60",
  misc: "bg-stone-800/60 text-stone-300 border-stone-700/60",
};

export function CharacterSheet({
  player,
  inventory,
  isYou,
  isTurn,
  compact,
  conditions = [],
}: {
  player: PlayerState;
  inventory: InventoryItemState[];
  isYou?: boolean;
  isTurn?: boolean;
  compact?: boolean;
  conditions?: ConditionState[];
}) {
  const hpPct = player.maxHp > 0 ? (player.hp / player.maxHp) * 100 : 0;
  const hpColor =
    hpPct > 60 ? "from-emerald-600 to-emerald-500" : hpPct > 30 ? "from-amber-600 to-amber-500" : "from-red-700 to-red-600";
  const dead = !player.isAlive || player.hp <= 0;

  return (
    <Card
      className={cn(
        "parchment border-border/80 gap-0 transition-all",
        isTurn ? "rune-border ring-1 ring-primary/50 animate-pulse-glow" : "border-border/60",
        isYou && "border-primary/50"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-md border-2 text-xs font-bold text-white"
          style={{
            background: `radial-gradient(circle at 30% 25%, ${player.color}, ${shade(player.color, -30)})`,
            borderColor: shade(player.color, 30),
          }}
        >
          {player.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <h3 className="truncate font-serif text-sm font-bold gold-text">{player.name}</h3>
            {isYou && (
              <Badge variant="outline" className="shrink-0 border-primary/60 px-1 text-[8px] text-primary">
                ВЫ
              </Badge>
            )}
            {player.isHost && <Crown className="h-3 w-3 shrink-0 text-amber-300" />}
            {dead && <Skull className="h-3.5 w-3.5 shrink-0 text-red-400" />}
            {isTurn && (
              <Badge className="ml-auto shrink-0 bg-primary px-1.5 text-[8px]">ВАШ ХОД</Badge>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {player.raceName} {player.charClass} · {player.backgroundName} · ур.{player.level}
          </p>
          <p className="text-[9px] text-muted-foreground/70">{player.weaponName}</p>
        </div>
      </div>

      <CardContent className="px-3 pb-3 pt-0">
        {/* Vitals */}
        <div className="grid grid-cols-3 gap-1.5">
          <Vital icon={<Heart className="h-3 w-3" />} label="HP" value={`${player.hp}/${player.maxHp}`} accent="text-red-400" />
          <Vital icon={<Shield className="h-3 w-3" />} label="AC" value={`${player.ac}`} accent="text-sky-300" />
          <Vital icon={<Coins className="h-3 w-3" />} label="ЗЛТ" value={`${player.gold}`} accent="text-amber-300" />
        </div>

        {/* HP bar */}
        <div className="mt-2">
          <div className="h-2 w-full overflow-hidden rounded-full border border-border/60 bg-stone-900/80">
            <div className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-500", hpColor)} style={{ width: `${hpPct}%` }} />
          </div>
        </div>

        {/* Active conditions */}
        {conditions.length > 0 && (
          <div className="mt-2">
            <div className="flex items-center gap-1.5 pb-1">
              <Skull className="h-3 w-3 text-red-300" />
              <span className="text-[11px] font-semibold gold-text">Состояния</span>
              <Badge variant="secondary" className="ml-auto text-[8px]">{conditions.length}</Badge>
            </div>
            <ul className="flex flex-wrap gap-1">
              {conditions.map((c) => {
                const def = CONDITIONS[c.condition];
                const icon = def?.icon ?? "❓";
                const name = def?.name ?? c.condition;
                const color = def?.color ?? "#888";
                return (
                  <li
                    key={c.id}
                    title={def?.description ?? name}
                    className="flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]"
                    style={{ background: `${color}22`, borderColor: `${color}66`, color }}
                  >
                    <span>{icon}</span>
                    <span className="font-medium">{name}</span>
                    <span className="text-[8px] opacity-70">{c.duration} р</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {!compact && (
          <>
            {/* Stats */}
            <div className="mt-2 grid grid-cols-6 gap-1">
              {STAT_LABELS.map((s) => {
                const val = player[s.key] as number;
                const mod = abilityModifier(val);
                return (
                  <div key={s.key} className="rounded border border-border/40 bg-stone-900/50 px-1 py-0.5 text-center">
                    <div className="text-[8px] text-muted-foreground">{s.short}</div>
                    <div className="text-xs font-bold leading-tight">{val}</div>
                    <div className={cn("text-[9px] font-mono", mod >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {mod >= 0 ? "+" : ""}
                      {mod}
                    </div>
                  </div>
                );
              })}
            </div>

            <Separator className="my-2 bg-border/50" />

            {/* Inventory */}
            <div className="flex items-center gap-1.5 pb-1">
              <Backpack className="h-3 w-3 text-amber-300" />
              <span className="text-[11px] font-semibold gold-text">Снаряжение</span>
              <Badge variant="secondary" className="ml-auto text-[8px]">{inventory.length}</Badge>
            </div>
            <ScrollArea className="fantasy-scroll max-h-40 pr-1">
              {inventory.length === 0 ? (
                <p className="py-2 text-center text-[10px] italic text-muted-foreground">Пусто…</p>
              ) : (
                <ul className="space-y-1">
                  {inventory.map((item) => (
                    <li key={item.id} className="rounded border border-border/40 bg-stone-900/40 p-1.5">
                      <div className="flex items-center justify-between">
                        <span className="truncate text-[11px] font-medium">{item.itemName}</span>
                        {item.quantity > 1 && <Badge variant="outline" className="text-[8px]">x{item.quantity}</Badge>}
                      </div>
                      {item.description && (
                        <p className="mt-0.5 text-[9px] leading-snug text-muted-foreground">{item.description}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>

            <Separator className="my-2 bg-border/50" />

            {/* Abilities */}
            <div className="flex items-center gap-1.5 pb-1">
              <Sparkles className="h-3 w-3 text-amber-300" />
              <span className="text-[11px] font-semibold gold-text">Способности</span>
              <Badge variant="secondary" className="ml-auto text-[8px]">
                {computeAbilities(player, inventory).length}
              </Badge>
            </div>
            <ScrollArea className="fantasy-scroll max-h-44 pr-1">
              <ul className="space-y-1">
                {computeAbilities(player, inventory).map((a) => (
                  <li
                    key={a.id}
                    className={cn(
                      "rounded border p-1.5",
                      a.consumable
                        ? "border-amber-700/50 bg-amber-950/20"
                        : "border-border/40 bg-stone-900/40"
                    )}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="flex items-center gap-1 truncate text-[11px] font-semibold">
                        {a.source === "scroll" && <ScrollIcon className="h-3 w-3 shrink-0 text-amber-300" />}
                        {a.name}
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        {a.consumable && (
                          <Badge className="bg-amber-900/60 text-[7px] text-amber-200">расходуемый</Badge>
                        )}
                        {a.uses && a.uses > 1 && (
                          <Badge variant="outline" className="text-[8px]">x{a.uses}</Badge>
                        )}
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[7px]",
                            a.source === "race" ? "border-emerald-700/50 text-emerald-300" :
                            a.source === "class" ? "border-sky-700/50 text-sky-300" :
                            a.source === "talent" ? "border-purple-700/50 text-purple-300" :
                            "border-amber-700/50 text-amber-300"
                          )}
                        >
                          {a.source === "race" ? "народ" : a.source === "class" ? "класс" : a.source === "talent" ? "талант" : "свиток"}
                        </Badge>
                      </div>
                    </div>
                    <p className="mt-0.5 text-[9px] leading-snug text-muted-foreground">{a.description}</p>
                    {a.castNotation && (
                      <span className="mt-0.5 inline-block font-mono text-[9px] text-red-300">
                        {a.castType === "heal" ? "лечение " : a.castType === "buff" ? "эффект " : "урон "}
                        {a.castNotation}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Vital({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div className="rounded border border-border/50 bg-stone-900/50 px-1.5 py-1 text-center">
      <div className={cn("flex items-center justify-center gap-0.5 text-[8px] uppercase", accent)}>
        {icon}
        {label}
      </div>
      <div className="text-xs font-bold font-mono">{value}</div>
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

void Swords;
