"use client";

import { memo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ScrollIcon, Sparkles, Swords, Heart, Zap, Shield, Package, Wand2,
} from "lucide-react";
import { computeAbilities, type Ability } from "@/lib/game/abilities";
import { useSettings } from "@/lib/game/settings";
import { t } from "@/lib/game/i18n";
import { cn } from "@/lib/utils";
import type { PlayerState, InventoryItemState } from "@/lib/game/types";

/**
 * BottomPanel — full-width horizontal bar at the bottom of the game screen.
 *
 * Per the user's hand-drawn plan:
 *   "вся оставшаяся нижняя часть экрана, вдоль до правого угла это инвентарь
 *    игрока и его скилы, спелы"
 *
 * Shows three horizontal sections:
 *   1. Инвентарь — clickable item chips (quick-use)
 *   2. Способности — clickable ability chips (race/class/talent/scroll/spell)
 *   3. Спелл-слоты — remaining spell slots per level (for casters)
 *
 * All items/abilities are clickable when `onQuickAction` is provided — clicking
 * sends a contextual action to the DM (same as clicking in CharacterSheet).
 */
export const BottomPanel = memo(function BottomPanel({
  player,
  inventory,
  onQuickAction,
}: {
  player: PlayerState;
  inventory: InventoryItemState[];
  onQuickAction?: (text: string) => void;
}) {
  const settings = useSettings();
  const lang = settings.lang;
  const tt = (key: string, params?: Record<string, string | number>) => t(lang, key, params);
  const abilities = computeAbilities(player, inventory);
  const canQuickUse = Boolean(onQuickAction);

  // Spell slots: player.spellSlots is already a parsed object (Record<string, number>)
  const slots: { level: number; current: number; max: number }[] = [];
  try {
    const parsed = player.spellSlots || {};
    const maxParsed = player.maxSpellSlots || {};
    for (const lv of Object.keys(maxParsed)) {
      const mx = maxParsed[lv] ?? 0;
      const cur = parsed[lv] ?? 0;
      if (mx > 0) slots.push({ level: Number(lv), current: cur, max: mx });
    }
  } catch {}
  const hasSpellSlots = slots.length > 0;

  const buildAbilityText = (a: Ability): string => {
    if (a.castType === "heal") return `Я использую «${a.name}» для лечения.`;
    if (a.castType === "damage") return `Я использую «${a.name}» против врага!`;
    if (a.consumable) return `Я читаю свиток «${a.name}».`;
    return `Я использую «${a.name}».`;
  };

  const buildItemText = (item: InventoryItemState): string => {
    const name = item.itemName;
    if (item.itemType === "potion") return `Я выпиваю зелье «${name}».`;
    if (item.itemType === "scroll") return `Я читаю свиток «${name}».`;
    if (item.itemType === "weapon") return `Я переключаюсь на «${name}».`;
    return `Я использую «${name}».`;
  };

  return (
    <Card className="parchment rune-border border-border/80 p-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch lg:gap-3">
        {/* ===== Inventory (items) ===== */}
        <div className="flex flex-col gap-1 lg:w-1/3">
          <div className="flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5 text-amber-300" />
            <span className="text-[11px] font-semibold gold-text">{tt("character.inventory")}</span>
            {canQuickUse && (
              <span className="text-[9px] italic text-muted-foreground/60">клик — использовать</span>
            )}
            <Badge variant="secondary" className="ml-auto text-[8px]">{inventory.length}</Badge>
          </div>
          <ScrollArea className="fantasy-scroll max-h-20 lg:max-h-16">
            <div className="flex flex-wrap gap-1">
              {inventory.length === 0 ? (
                <span className="text-[10px] italic text-muted-foreground">Инвентарь пуст</span>
              ) : (
                inventory.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!canQuickUse}
                    onClick={() => canQuickUse && onQuickAction?.(buildItemText(item))}
                    title={canQuickUse ? "Нажмите, чтобы использовать" : item.itemName}
                    className={cn(
                      "flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] transition-colors",
                      item.itemType === "potion" && "border-rose-700/40 bg-rose-950/20 text-rose-200",
                      item.itemType === "scroll" && "border-amber-700/40 bg-amber-950/20 text-amber-200",
                      item.itemType === "weapon" && "border-sky-700/40 bg-sky-950/20 text-sky-200",
                      item.itemType === "armor" && "border-emerald-700/40 bg-emerald-950/20 text-emerald-200",
                      !["potion", "scroll", "weapon", "armor"].includes(item.itemType) && "border-border/40 bg-stone-900/40 text-stone-200",
                      canQuickUse && "cursor-pointer hover:border-amber-500 hover:bg-amber-950/30",
                      !canQuickUse && "cursor-default"
                    )}
                  >
                    {item.itemType === "potion" && <Heart className="h-2.5 w-2.5" />}
                    {item.itemType === "scroll" && <ScrollIcon className="h-2.5 w-2.5" />}
                    {item.itemType === "weapon" && <Swords className="h-2.5 w-2.5" />}
                    <span className="truncate max-w-[80px]">{item.itemName}</span>
                    {item.quantity > 1 && <span className="text-[8px] opacity-70">×{item.quantity}</span>}
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Divider */}
        <div className="hidden lg:block w-px bg-border/40" />

        {/* ===== Abilities (race/class/talent/scroll/spell) ===== */}
        <div className="flex flex-col gap-1 lg:flex-1">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-purple-300" />
            <span className="text-[11px] font-semibold gold-text">{tt("character.abilities")}</span>
            {canQuickUse && (
              <span className="text-[9px] italic text-muted-foreground/60">клик — применить</span>
            )}
            <Badge variant="secondary" className="ml-auto text-[8px]">{abilities.length}</Badge>
          </div>
          <ScrollArea className="fantasy-scroll max-h-20 lg:max-h-16">
            <div className="flex flex-wrap gap-1">
              {abilities.length === 0 ? (
                <span className="text-[10px] italic text-muted-foreground">Нет способностей</span>
              ) : (
                abilities.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    disabled={!canQuickUse}
                    onClick={() => canQuickUse && onQuickAction?.(buildAbilityText(a))}
                    title={canQuickUse ? `Нажмите, чтобы использовать: ${a.name}` : a.name}
                    className={cn(
                      "flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] transition-colors",
                      a.source === "race" && "border-emerald-700/40 bg-emerald-950/20 text-emerald-200",
                      a.source === "class" && "border-sky-700/40 bg-sky-950/20 text-sky-200",
                      a.source === "talent" && "border-purple-700/40 bg-purple-950/20 text-purple-200",
                      a.source === "scroll" && "border-amber-700/40 bg-amber-950/20 text-amber-200",
                      a.source === "spell" && "border-fuchsia-700/40 bg-fuchsia-950/20 text-fuchsia-200",
                      !["race", "class", "talent", "scroll", "spell"].includes(a.source) && "border-border/40 bg-stone-900/40 text-stone-200",
                      a.consumable && "ring-1 ring-amber-700/30",
                      canQuickUse && "cursor-pointer hover:border-amber-500 hover:bg-amber-950/30",
                      !canQuickUse && "cursor-default"
                    )}
                  >
                    {a.source === "spell" && <Wand2 className="h-2.5 w-2.5" />}
                    {a.source === "scroll" && <ScrollIcon className="h-2.5 w-2.5" />}
                    {a.source === "class" && <Zap className="h-2.5 w-2.5" />}
                    {a.source === "race" && <Shield className="h-2.5 w-2.5" />}
                    <span className="truncate max-w-[90px]">{a.name}</span>
                    {a.slotLevel && <span className="text-[8px] opacity-70">я{a.slotLevel}</span>}
                    {a.consumable && <span className="text-[7px] opacity-60">✦</span>}
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Divider */}
        {hasSpellSlots && <div className="hidden lg:block w-px bg-border/40" />}

        {/* ===== Spell slots (casters only) ===== */}
        {hasSpellSlots && (
          <div className="flex flex-col gap-1 lg:w-auto">
            <div className="flex items-center gap-1.5">
              <Wand2 className="h-3.5 w-3.5 text-fuchsia-300" />
              <span className="text-[11px] font-semibold gold-text">Слоты</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {slots.map((s) => (
                <div key={s.level} className="flex flex-col items-center gap-0.5">
                  <span className="text-[8px] text-muted-foreground">К{s.level}</span>
                  <div className="flex gap-0.5">
                    {Array.from({ length: s.max }).map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          "h-2.5 w-2.5 rounded-full border",
                          i < s.current
                            ? "border-fuchsia-500 bg-fuchsia-600"
                            : "border-border/50 bg-stone-900/60"
                        )}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
});
