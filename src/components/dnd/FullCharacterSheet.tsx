"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Heart, Shield, Coins, Zap, Star, Scroll as ScrollIcon, Shirt } from "lucide-react";
import type { PlayerState, InventoryItemState, ConditionState } from "@/lib/game/types";
import { abilityModifier } from "@/lib/game/dice";
import { computeAbilities } from "@/lib/game/abilities";
import { CONDITIONS } from "@/lib/game/conditions";
import { useSettings } from "@/lib/game/settings";
import { t, localizeData, localizeAbility } from "@/lib/game/i18n";
import { cn } from "@/lib/utils";

/**
 * FullCharacterSheet — D&D 5e style character sheet modal.
 * Shows all character details: stats, skills, saving throws, equipment,
 * abilities, spells, conditions, backstory.
 */
export function FullCharacterSheet({
  player,
  inventory,
  conditions,
}: {
  player: PlayerState;
  inventory: InventoryItemState[];
  conditions: ConditionState[];
}) {
  const settings = useSettings();
  const tt = (key: string, params?: Record<string, string | number>) => t(settings.lang, key, params);
  const mod = (k: number) => abilityModifier(k);

  const abilities = computeAbilities(player, inventory);
  const equippedItems = inventory.filter((i) =>
    Object.values(player.equipment).includes(i.id)
  );

  const stats: { key: string; label: string; val: number; icon: string }[] = [
    { key: "str", label: tt("character.str"), val: player.str, icon: "💪" },
    { key: "dex", label: tt("character.dex"), val: player.dex, icon: "🏹" },
    { key: "con", label: tt("character.con"), val: player.con, icon: "❤️" },
    { key: "int", label: tt("character.int"), val: player.int, icon: "📖" },
    { key: "wis", label: tt("character.wis"), val: player.wis, icon: "🦉" },
    { key: "cha", label: tt("character.cha"), val: player.cha, icon: "🎭" },
  ];

  const vitals: { icon: React.ReactNode; label: string; value: string; color: string }[] = [
    { icon: <span className="text-base">❤️</span>, label: tt("character.hp"), value: `${player.hp}/${player.maxHp}`, color: "text-red-400" },
    { icon: <span className="text-base">🛡️</span>, label: tt("character.ac"), value: `${player.ac}`, color: "text-sky-300" },
    { icon: <span className="text-base">💰</span>, label: tt("character.gold_short"), value: `${player.gold}`, color: "text-amber-300" },
    { icon: <span className="text-base">⭐</span>, label: tt("character.level_short"), value: `${player.level}`, color: "text-purple-300" },
  ];

  return (
    <ScrollArea className="fantasy-scroll max-h-[80vh]">
      <div className="space-y-4 p-2">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border-2 text-sm font-bold text-white"
            style={{
              background: `radial-gradient(circle at 30% 25%, ${player.color}, ${player.color}99)`,
              borderColor: player.color,
            }}
          >
            {player.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-xl font-bold gold-text">{player.name}</h2>
            <p className="text-xs text-muted-foreground">
              {localizeData(settings.lang, "race", player.raceName)} {player.charClass} · {tt("character.level_short")}{player.level}
            </p>
            <p className="text-[10px] text-muted-foreground/70">
              {localizeData(settings.lang, "background", player.backgroundName)}
            </p>
          </div>
        </div>

        {/* Vitals */}
        <div className="grid grid-cols-4 gap-2">
          {vitals.map((v) => (
            <div key={v.label} className="rounded-lg border border-border/50 bg-stone-900/50 p-2 text-center">
              <div className={cn("flex items-center justify-center gap-1 text-[10px] uppercase", v.color)}>
                {v.icon}
                {v.label}
              </div>
              <div className="text-lg font-bold font-mono">{v.value}</div>
            </div>
          ))}
        </div>

        {/* Temp HP / Dying / Concentration */}
        <div className="flex flex-wrap gap-2">
          {player.tempHp > 0 && (
            <Badge className="bg-sky-950/60 text-sky-200">+{player.tempHp} {tt("char.temp_hp")}</Badge>
          )}
          {player.isDying && (
            <Badge className="bg-red-950/60 text-red-200 animate-pulse">{tt("char.dying")}</Badge>
          )}
          {player.concentratingOn && (
            <Badge className="bg-purple-950/60 text-purple-200">{tt("char.concentrating")}: {localizeAbility(settings.lang, player.concentratingOn)}</Badge>
          )}
          {player.isHost && (
            <Badge className="bg-amber-950/60 text-amber-200">★ {tt("lobby.host")}</Badge>
          )}
        </div>

        <Separator />

        {/* Ability Scores (D&D grid) */}
        <div>
          <h3 className="mb-2 text-sm font-semibold gold-text">{tt("character.stats")}</h3>
          <div className="grid grid-cols-6 gap-1.5">
            {stats.map((s) => (
              <div key={s.key} className="rounded-lg border border-border/50 bg-stone-900/50 p-2 text-center">
                <div className="text-base leading-none">{s.icon}</div>
                <div className="text-[9px] font-semibold uppercase text-muted-foreground">{s.label}</div>
                <div className="text-lg font-bold font-mono text-amber-200">{s.val}</div>
                <div className="text-[10px] text-muted-foreground">
                  {mod(s.val) >= 0 ? `+${mod(s.val)}` : mod(s.val)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Equipment */}
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold gold-text">
            <Shirt className="h-3.5 w-3.5" /> {tt("character.equipment")}
          </h3>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              ["weapon", tt("equip.weapon")],
              ["shield", tt("equip.shield")],
              ["head", tt("equip.head")],
              ["chest", tt("equip.chest")],
              ["legs", tt("equip.legs")],
              ["hands", tt("equip.hands")],
              ["accessory1", tt("equip.acc1")],
              ["accessory2", tt("equip.acc2")],
            ] as const).map(([slot, label]) => {
              const itemId = player.equipment[slot];
              const item = itemId ? inventory.find((i) => i.id === itemId) : null;
              return (
                <div
                  key={slot}
                  className={cn(
                    "rounded border px-2 py-1 text-[10px]",
                    item
                      ? "border-amber-700/50 bg-amber-950/20 text-amber-200"
                      : "border-border/30 bg-stone-900/40 text-muted-foreground/50"
                  )}
                >
                  <span className="text-[8px] uppercase opacity-60">{label}</span>
                  <div className="truncate font-medium">
                    {item ? localizeData(settings.lang, "item", item.itemName) : "—"}
                  </div>
                  {item?.acBonus ? <span className="text-[8px] text-sky-300">+{item.acBonus} AC</span> : null}
                  {item?.damageNotation ? <span className="text-[8px] text-red-300">{item.damageNotation}</span> : null}
                </div>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* Abilities */}
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold gold-text">
            <Zap className="h-3.5 w-3.5" /> {tt("character.abilities")}
          </h3>
          <div className="space-y-1">
            {abilities.map((a) => (
              <div
                key={a.id}
                className={cn(
                  "rounded border px-2 py-1 text-[10px]",
                  a.source === "race" && "border-emerald-700/40 bg-emerald-950/20 text-emerald-200",
                  a.source === "class" && "border-sky-700/40 bg-sky-950/20 text-sky-200",
                  a.source === "talent" && "border-purple-700/40 bg-purple-950/20 text-purple-200",
                  a.source === "scroll" && "border-amber-700/40 bg-amber-950/20 text-amber-200",
                  a.source === "spell" && "border-fuchsia-700/40 bg-fuchsia-950/20 text-fuchsia-200",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{localizeAbility(settings.lang, a.name)}</span>
                  <span className="text-[8px] opacity-60">
                    {tt(`char.source_${a.source}`)}
                    {a.castNotation ? ` · ${a.castNotation}` : ""}
                    {a.slotLevel ? ` · ${tt("character.level_short")}${a.slotLevel}` : ""}
                  </span>
                </div>
                {a.description && (
                  <p className="mt-0.5 text-[9px] leading-snug text-muted-foreground">{a.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Conditions */}
        {conditions.length > 0 && (
          <>
            <Separator />
            <div>
              <h3 className="mb-2 text-sm font-semibold gold-text">{tt("character.conditions")}</h3>
              <div className="flex flex-wrap gap-1">
                {conditions.map((c) => {
                  const def = CONDITIONS[c.condition];
                  return (
                    <Badge key={c.id} variant="outline" className="gap-1 text-[10px]">
                      {def?.icon ?? "❓"} {def?.name ?? c.condition} ({c.duration})
                    </Badge>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Backstory */}
        {player.backstory && player.backstory.trim().length > 0 && (
          <>
            <Separator />
            <div>
              <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold gold-text">
                <ScrollIcon className="h-3.5 w-3.5" /> {tt("char.backstory")}
              </h3>
              <p className="whitespace-pre-wrap text-[10px] leading-relaxed text-amber-100/70">
                {player.backstory.trim()}
              </p>
            </div>
          </>
        )}

        {/* Inventory summary */}
        <Separator />
        <div>
          <h3 className="mb-2 text-sm font-semibold gold-text">{tt("character.inventory")}</h3>
          <div className="flex flex-wrap gap-1">
            {inventory.map((item) => (
              <Badge
                key={item.id}
                variant="secondary"
                className={cn(
                  "text-[9px]",
                  equippedItems.some((e) => e.id === item.id) && "border-amber-600/50"
                )}
              >
                {localizeData(settings.lang, "item", item.itemName)}
                {item.quantity > 1 ? ` ×${item.quantity}` : ""}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
