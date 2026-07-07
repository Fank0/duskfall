"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Skull,
  Ghost,
  Swords,
  Shield,
  Heart,
  Crosshair,
  Eye,
  EyeOff,
  ChevronDown,
  Sparkles,
  Crown,
  Flame,
  Droplet,
  Wind,
  type LucideIcon,
} from "lucide-react";
import type { MonsterState, ConditionState } from "@/lib/game/types";
import { cn } from "@/lib/utils";

const CONDITION_ICON: Record<string, LucideIcon> = {
  poisoned: Droplet,
  bleeding: Droplet,
  burning: Flame,
  frightened: Ghost,
  blessed: Sparkles,
  shielded: Shield,
  enraged: Swords,
  slowed: Wind,
  stunned: Sparkles,
  marked: Crosshair,
  restrained: Wind,
  grappled: Wind,
  paralyzed: Sparkles,
  charmed: Sparkles,
  exhaustion: Flame,
  prone: Wind,
  blinded: EyeOff,
  deafened: EyeOff,
  weakened: Swords,
};

const CONDITION_COLOR: Record<string, string> = {
  poisoned: "border-emerald-700/50 bg-emerald-950/40 text-emerald-300",
  bleeding: "border-red-700/50 bg-red-950/40 text-red-300",
  burning: "border-orange-700/50 bg-orange-950/40 text-orange-300",
  frightened: "border-purple-700/50 bg-purple-950/40 text-purple-300",
  blessed: "border-amber-600/50 bg-amber-950/40 text-amber-200",
  shielded: "border-sky-700/50 bg-sky-950/40 text-sky-300",
  enraged: "border-rose-700/50 bg-rose-950/40 text-rose-300",
  slowed: "border-cyan-700/50 bg-cyan-950/40 text-cyan-300",
  stunned: "border-yellow-700/50 bg-yellow-950/40 text-yellow-300",
  marked: "border-amber-700/50 bg-amber-950/40 text-amber-300",
  restrained: "border-stone-600/50 bg-stone-800/40 text-stone-300",
  grappled: "border-stone-600/50 bg-stone-800/40 text-stone-300",
  paralyzed: "border-fuchsia-700/50 bg-fuchsia-950/40 text-fuchsia-300",
  charmed: "border-pink-700/50 bg-pink-950/40 text-pink-300",
  exhaustion: "border-gray-600/50 bg-gray-800/40 text-gray-300",
  prone: "border-stone-600/50 bg-stone-800/40 text-stone-300",
  blinded: "border-gray-600/50 bg-gray-800/40 text-gray-300",
  deafened: "border-gray-600/50 bg-gray-800/40 text-gray-300",
  weakened: "border-red-800/50 bg-red-950/40 text-red-300",
};

function condLabel(id: string): string {
  const map: Record<string, string> = {
    poisoned: "Яд", bleeding: "Кровь", burning: "Огонь", frightened: "Испуг",
    blessed: "Благо", shielded: "Щит", enraged: "Ярость", slowed: "Замедл",
    stunned: "Оглуш", marked: "Метка", restrained: "Связан", grappled: "Хватка",
    paralyzed: "Паралич", charmed: "Очарован", exhaustion: "Истощ",
    prone: "Сбит", blinded: "Слеп", deafened: "Глух", weakened: "Ослабл",
  };
  return map[id] ?? id;
}

/**
 * EnemyPanel — a dedicated threats panel showing all revealed enemies in the
 * room during combat (and hidden-threat count during exploration). Each enemy
 * card shows HP bar, AC, attack notation, resistances/immunities, active
 * conditions, boss special abilities, and expandable flavor text.
 *
 * Hidden monsters (isActive=false && hp>0) are concealed from the player —
 * only the count is revealed as "Скрытые угрозы" for D&D-style suspense.
 */
export function EnemyPanel({
  monsters,
  conditions,
  currentTurnName,
  combatActive,
}: {
  monsters: MonsterState[];
  conditions: ConditionState[];
  currentTurnName: string | null;
  combatActive: boolean;
}) {
  const revealed = monsters.filter((m) => m.isActive || m.hp <= 0);
  const aliveRevealed = revealed.filter((m) => m.hp > 0);
  const deadRevealed = revealed.filter((m) => m.hp <= 0);
  const hiddenCount = monsters.filter((m) => !m.isActive && m.hp > 0).length;
  const bossCount = aliveRevealed.filter((m) => m.isBoss).length;

  return (
    <Card className="parchment rune-border border-border/80 gap-0">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-red-300">
            <Skull className="h-4 w-4" /> Враги
          </span>
          <div className="flex items-center gap-1.5">
            {bossCount > 0 && (
              <Badge
                variant="outline"
                className="border-amber-500/60 bg-amber-950/40 text-[10px] text-amber-200"
                title="Босс"
              >
                <Crown className="mr-0.5 h-2.5 w-2.5" /> {bossCount}
              </Badge>
            )}
            {hiddenCount > 0 && (
              <Badge
                variant="outline"
                className="border-amber-700/50 bg-amber-950/30 text-[10px] text-amber-300"
                title="Противники, которых вы ещё не обнаружили"
              >
                <EyeOff className="mr-1 h-2.5 w-2.5" />
                {hiddenCount} скрыто
              </Badge>
            )}
            <Badge
              variant="secondary"
              className={cn(
                "text-[10px]",
                aliveRevealed.length === 0
                  ? "bg-emerald-950/40 text-emerald-300"
                  : "bg-red-950/40 text-red-300"
              )}
            >
              {aliveRevealed.length === 0
                ? "Угроз нет"
                : `${aliveRevealed.length} в бою`}
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="py-0">
        {revealed.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-5 text-center">
            <Ghost className="h-6 w-6 text-muted-foreground/40" />
            <p className="text-xs italic text-muted-foreground">
              {combatActive
                ? "Все замеченные враги повержены…"
                : "Тишина. Но кто знает, что таится во тьме."}
            </p>
          </div>
        ) : (
          <ScrollArea className="fantasy-scroll max-h-72 pr-2">
            <ul className="space-y-1.5">
              {revealed.map((m) => (
                <EnemyRow
                  key={m.id}
                  monster={m}
                  isTurn={combatActive && currentTurnName === m.name}
                  conditions={conditions}
                />
              ))}
            </ul>
          </ScrollArea>
        )}

        {hiddenCount > 0 && revealed.length === 0 && (
          <div className="mt-2 flex items-center justify-center gap-1.5 rounded-md border border-amber-900/40 bg-amber-950/20 px-2 py-1.5 text-[10px] text-amber-300">
            <EyeOff className="h-3 w-3" />
            <span className="font-medium">Замечена скрытая угроза ×{hiddenCount}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EnemyRow({
  monster,
  isTurn,
  conditions,
}: {
  monster: MonsterState;
  isTurn: boolean;
  conditions: ConditionState[];
}) {
  const [expanded, setExpanded] = useState(false);
  const dead = monster.hp <= 0;
  const hpPct = monster.maxHp > 0 ? Math.max(0, Math.min(100, (monster.hp / monster.maxHp) * 100)) : 0;
  const hpColor = dead
    ? "bg-stone-700"
    : hpPct > 60
      ? "bg-emerald-500"
      : hpPct > 30
        ? "bg-amber-500"
        : "bg-red-600";

  const hasDescription = monster.description && monster.description.trim().length > 0;
  const hasSpecial = monster.specialAbility && monster.specialAbility.trim().length > 0;
  const myConditions = conditions.filter((c) => c.targetName === monster.name);

  return (
    <li
      className={cn(
        "rounded-md border p-2 transition-all",
        isTurn
          ? "border-primary bg-primary/10 animate-pulse-glow"
          : dead
            ? "border-stone-800/60 bg-stone-950/40"
            : monster.isBoss
              ? "border-amber-700/50 bg-amber-950/15"
              : "border-border/50 bg-stone-900/40",
        dead && "opacity-60"
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-black/40"
          style={{ background: monster.color }}
        />
        <span
          className={cn(
            "truncate text-sm font-semibold",
            dead && "line-through decoration-red-500/60"
          )}
        >
          {monster.name}
        </span>
        {monster.isBoss && (
          <Crown className="h-3 w-3 shrink-0 text-amber-300" title="Босс" />
        )}
        {isTurn && (
          <Badge className="ml-auto shrink-0 bg-primary text-[9px]">
            <Swords className="mr-0.5 h-2.5 w-2.5" /> Ход
          </Badge>
        )}
        {dead && (
          <Badge
            variant="outline"
            className="ml-auto shrink-0 border-stone-700 bg-stone-900/60 text-[9px] text-stone-400"
          >
            <Skull className="mr-0.5 h-2.5 w-2.5" /> Повержен
          </Badge>
        )}
      </div>

      {/* Label + position */}
      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="rounded bg-black/30 px-1 font-mono uppercase tracking-wide text-amber-200/80">
          {monster.label}
        </span>
        <span>·</span>
        <span className="flex items-center gap-0.5">
          <Crosshair className="h-2.5 w-2.5" />
          ({monster.posX},{monster.posY})
        </span>
      </div>

      {/* HP bar */}
      <div className="mt-1.5 flex items-center gap-2">
        <Heart className={cn("h-3 w-3 shrink-0", dead ? "text-stone-600" : "text-red-400")} />
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/40">
          <div className={cn("h-full transition-all duration-500", hpColor)} style={{ width: `${hpPct}%` }} />
        </div>
        <span className={cn("shrink-0 font-mono text-[10px]", dead ? "text-stone-500" : "text-red-300")}>
          {monster.hp}/{monster.maxHp}
        </span>
      </div>

      {/* Stats row: AC, attack */}
      <div className="mt-1 flex flex-wrap items-center gap-1 text-[9px]">
        <Badge variant="outline" className="border-sky-900/50 bg-sky-950/30 px-1.5 py-0 text-sky-200" title="Класс доспеха">
          <Shield className="mr-0.5 h-2.5 w-2.5" /> AC {monster.ac}
        </Badge>
        <Badge variant="outline" className="border-orange-900/50 bg-orange-950/30 px-1.5 py-0 text-orange-200" title="Бонус атаки · Урон">
          <Swords className="mr-0.5 h-2.5 w-2.5" />
          +{monster.attackBonus} · {monster.damageNotation}
        </Badge>
        {isTurn && (
          <Badge variant="outline" className="ml-auto border-primary/60 bg-primary/15 px-1.5 py-0 text-primary">
            <Sparkles className="mr-0.5 h-2.5 w-2.5" /> Атакует
          </Badge>
        )}
      </div>

      {/* Resistances / immunities */}
      {!dead && (monster.resistances?.length || monster.immunities?.length || monster.conditionImmunities?.length) ? (
        <div className="mt-1 flex flex-wrap items-center gap-1 text-[8px]">
          {monster.resistances?.map((r) => (
            <Badge key={`res-${r}`} variant="outline" className="border-blue-800/50 bg-blue-950/30 px-1 py-0 text-blue-200" title={`Сопротивление: ${r}`}>
              ⟲{r}
            </Badge>
          ))}
          {monster.immunities?.map((i) => (
            <Badge key={`imm-${i}`} variant="outline" className="border-indigo-800/50 bg-indigo-950/30 px-1 py-0 text-indigo-200" title={`Иммунитет: ${i}`}>
              ◉{i}
            </Badge>
          ))}
          {monster.conditionImmunities?.map((c) => (
            <Badge key={`cimm-${c}`} variant="outline" className="border-violet-800/50 bg-violet-950/30 px-1 py-0 text-violet-200" title={`Иммунитет к состоянию: ${c}`}>
              ⊘{condLabel(c)}
            </Badge>
          ))}
        </div>
      ) : null}

      {/* Active conditions */}
      {!dead && myConditions.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {myConditions.map((c) => {
            const Icon = CONDITION_ICON[c.condition] ?? Sparkles;
            const color = CONDITION_COLOR[c.condition] ?? "border-border/50 bg-stone-800/40 text-stone-300";
            return (
              <span
                key={c.id}
                title={`${condLabel(c.condition)} (${c.duration} раунд.)`}
                className={cn(
                  "inline-flex items-center gap-0.5 rounded border px-1 py-0 font-mono text-[8px] leading-none",
                  color
                )}
              >
                <Icon className="h-2 w-2" />
                {condLabel(c.condition)}
                <span className="opacity-70">{c.duration}</span>
              </span>
            );
          })}
        </div>
      )}

      {/* Boss special ability */}
      {hasSpecial && !dead && (
        <div className="mt-1 rounded border border-amber-900/40 bg-amber-950/20 px-1.5 py-1 text-[9px] leading-relaxed text-amber-200/90">
          <span className="font-semibold">⚡ {monster.specialAbility}</span>
        </div>
      )}

      {/* Description (expandable) */}
      {(hasDescription || hasSpecial) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 flex w-full items-center gap-1 text-[9px] text-muted-foreground transition-colors hover:text-amber-200"
        >
          <ChevronDown className={cn("h-2.5 w-2.5 transition-transform", expanded && "rotate-180")} />
          <span className="italic">{expanded ? "Скрыть" : "Описание"}</span>
          <Eye className="ml-auto h-2.5 w-2.5 opacity-50" />
        </button>
      )}
      {expanded && hasDescription && (
        <p className="mt-1 rounded border border-border/40 bg-black/30 p-1.5 text-[10px] leading-relaxed text-muted-foreground">
          {monster.description}
        </p>
      )}
    </li>
  );
}
