"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Heart,
  Shield,
  Coins,
  Swords,
  Backpack,
  Skull,
} from "lucide-react";
import type { PlayerState, InventoryItemState } from "@/lib/game/types";
import { abilityModifier } from "@/lib/game/dice";
import { cn } from "@/lib/utils";

const STAT_LABELS: { key: keyof PlayerState; short: string; full: string }[] = [
  { key: "str", short: "СИЛ", full: "Сила" },
  { key: "dex", short: "ЛОВ", full: "Ловкость" },
  { key: "con", short: "ТЕЛ", full: "Телосложение" },
  { key: "int", short: "ИНТ", full: "Интеллект" },
  { key: "wis", short: "МУД", full: "Мудрость" },
  { key: "cha", short: "ХАР", full: "Харизма" },
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
}: {
  player: PlayerState;
  inventory: InventoryItemState[];
}) {
  const hpPct = player.maxHp > 0 ? (player.hp / player.maxHp) * 100 : 0;
  const hpColor =
    hpPct > 60 ? "from-emerald-600 to-emerald-500" : hpPct > 30 ? "from-amber-600 to-amber-500" : "from-red-700 to-red-600";
  const isDead = player.hp <= 0;

  return (
    <Card className="parchment rune-border border-border/80 gap-0">
      {/* Portrait + identity */}
      <div className="relative px-4 pt-4">
        <div className="flex items-center gap-3">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 border-primary/70 bg-stone-900 animate-flicker">
            {player.portraitUrl ? (
              <img
                src={player.portraitUrl}
                alt={player.name}
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Swords className="h-7 w-7 text-primary" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <h2 className="truncate font-serif text-lg font-bold gold-text text-glow">
              {player.name}
            </h2>
            <p className="text-xs text-muted-foreground">
              {player.charClass} · Уровень {player.level}
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {isDead && (
                <Badge variant="outline" className="border-red-700 bg-red-950/60 text-red-300">
                  <Skull className="mr-1 h-3 w-3" /> Повержен
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      <CardContent className="px-4 pt-3">
        {/* Vitals */}
        <div className="grid grid-cols-3 gap-2">
          <Vital
            icon={<Heart className="h-4 w-4" />}
            label="HP"
            value={`${player.hp}/${player.maxHp}`}
            accent="text-red-400"
          />
          <Vital
            icon={<Shield className="h-4 w-4" />}
            label="AC"
            value={`${player.ac}`}
            accent="text-sky-300"
          />
          <Vital
            icon={<Coins className="h-4 w-4" />}
            label="Золото"
            value={`${player.gold}`}
            accent="text-amber-300"
          />
        </div>

        {/* HP bar */}
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Heart className="h-3 w-3 text-red-400" /> Здоровье
            </span>
            <span>
              {player.hp} / {player.maxHp}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full border border-border/60 bg-stone-900/80">
            <div
              className={cn(
                "h-full rounded-full bg-gradient-to-r transition-all duration-500",
                hpColor
              )}
              style={{ width: `${hpPct}%` }}
            />
          </div>
        </div>

        {/* Stats grid */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {STAT_LABELS.map((s) => {
            const val = player[s.key] as number;
            const mod = abilityModifier(val);
            return (
              <div
                key={s.key}
                className="rounded-md border border-border/60 bg-stone-900/50 px-2 py-1.5 text-center"
              >
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {s.short}
                </div>
                <div className="text-base font-bold leading-tight">{val}</div>
                <div className={cn("text-[11px] font-mono", mod >= 0 ? "text-emerald-400" : "text-red-400")}>
                  {mod >= 0 ? "+" : ""}
                  {mod}
                </div>
              </div>
            );
          })}
        </div>

        <Separator className="my-3 bg-border/60" />

        {/* Inventory */}
        <div className="flex items-center gap-2 pb-1">
          <Backpack className="h-4 w-4 text-amber-300" />
          <h3 className="text-sm font-semibold gold-text">Снаряжение</h3>
          <Badge variant="secondary" className="ml-auto text-[10px]">
            {inventory.length} предм.
          </Badge>
        </div>
        <ScrollArea className="fantasy-scroll max-h-56 pr-2">
          {inventory.length === 0 ? (
            <p className="py-3 text-center text-xs italic text-muted-foreground">
              Сумки пусты…
            </p>
          ) : (
            <ul className="space-y-1.5">
              {inventory.map((item) => (
                <li
                  key={item.id}
                  className="rounded-md border border-border/50 bg-stone-900/40 p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{item.itemName}</span>
                    {item.quantity > 1 && (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        x{item.quantity}
                      </Badge>
                    )}
                  </div>
                  {item.description && (
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      {item.description}
                    </p>
                  )}
                  <Badge
                    variant="outline"
                    className={cn("mt-1 text-[9px] uppercase tracking-wide", TYPE_STYLES[item.itemType] ?? TYPE_STYLES.misc)}
                  >
                    {item.itemType}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function Vital({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-stone-900/50 px-2 py-1.5 text-center">
      <div className={cn("flex items-center justify-center gap-1 text-[10px] uppercase tracking-wide", accent)}>
        {icon}
        {label}
      </div>
      <div className="text-sm font-bold font-mono">{value}</div>
    </div>
  );
}
