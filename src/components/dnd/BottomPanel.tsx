"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  ScrollIcon, Sparkles, Swords, Heart, Zap, Shield, Package, Wand2,
  Shirt, Hammer,
} from "lucide-react";
import { computeAbilities, type Ability } from "@/lib/game/abilities";
import { useSettings } from "@/lib/game/settings";
import { t } from "@/lib/game/i18n";
import { cn } from "@/lib/utils";
import type { PlayerState, InventoryItemState } from "@/lib/game/types";
import {
  buildAbilityQuickText,
  buildItemQuickText,
  type QuickActionContext,
} from "@/lib/game/quick-use";

/**
 * BottomPanel — full-width horizontal bar at the bottom of the game screen.
 *
 * Per the user's plan:
 *   "снаряжение и экиперовка должна быть рядом со способностями"
 *   "сделай полосу инвентаря шире"
 *
 * Sections (left → right):
 *   1. Снаряжение — equipped items (8 slots), clickable to unequip
 *   2. Инвентарь — clickable item chips (quick-use)
 *   3. Способности — clickable ability chips (race/class/talent/scroll/spell)
 *   4. Спелл-слоты — remaining spell slots per level (for casters)
 *
 * Quick-use visual feedback (Item 2):
 *   - Click → 300ms amber pulse ring on the chip
 *   - Click → 1.5s "отправлено ✓" sent hint badge
 *   - Click → 500ms disabled (double-click protection)
 *   - Hover → shadcn Tooltip with full ability/item description
 *   - Slot-level abilities show a prominent "КN" colored circle
 *   - Consumable scrolls show a small "расходуемый" badge
 */
export const BottomPanel = memo(function BottomPanel({
  player,
  inventory,
  onQuickAction,
  onUnequip,
  hasAnyStation = false,
  onCraft,
  combatActive = false,
  nearestMonsterName,
}: {
  player: PlayerState;
  inventory: InventoryItemState[];
  onQuickAction?: (text: string) => void;
  onUnequip?: (slot: string) => void | Promise<void>;
  hasAnyStation?: boolean;
  onCraft?: () => void;
  /** True while combat is active — enables targeted damage text. */
  combatActive?: boolean;
  /** Name of the nearest active monster — used as damage target in text. */
  nearestMonsterName?: string;
}) {
  const settings = useSettings();
  const lang = settings.lang;
  const tt = (key: string, params?: Record<string, string | number>) => t(lang, key, params);
  const abilities = computeAbilities(player, inventory);
  const canQuickUse = Boolean(onQuickAction);

  // Equipment — find equipped items by id from inventory
  const eq = player.equipment || {};
  const equippedSlots: { slot: string; label: string; item?: InventoryItemState }[] = [
    { slot: "eqWeapon", label: "Оруж" },
    { slot: "eqShield", label: "Щит" },
    { slot: "eqHead", label: "Голова" },
    { slot: "eqChest", label: "Торс" },
    { slot: "eqLegs", label: "Ноги" },
    { slot: "eqHands", label: "Руки" },
    { slot: "eqAccessory1", label: "Акс1" },
    { slot: "eqAccessory2", label: "Акс2" },
  ].map(({ slot, label }) => {
    const id = (eq as any)[slot] as string | null | undefined;
    const item = id ? inventory.find((i) => i.id === id) : undefined;
    return { slot, label, item };
  });
  const equippedCount = equippedSlots.filter((s) => s.item).length;

  // Spell slots
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

  // Quick-use context (Item 1): drives contextual action text — e.g. damage
  // abilities target the nearest monster during combat, scrolls use the
  // «читаю свиток» phrasing, spells include their slot level (круг N).
  const quickCtx: QuickActionContext = {
    combatActive,
    nearestMonsterName,
  };

  // ===== Item 2: Quick-use visual feedback state =====
  // For each chip id we track three transient states:
  //   pulsing       — 300ms amber ring pulse after click
  //   disabledChips — 500ms double-click protection
  //   sentChips     — 1.5s "отправлено ✓" hint badge
  // All three use immutable Set state so React detects every change.
  const [pulsing, setPulsing] = useState<Set<string>>(() => new Set());
  const [disabledChips, setDisabledChips] = useState<Set<string>>(() => new Set());
  const [sentChips, setSentChips] = useState<Set<string>>(() => new Set());
  // Pending timeout ids per chip — cleaned up on unmount.
  const feedbackTimers = useRef<Map<string, number[]>>(new Map());

  // Cleanup all pending feedback timers on unmount.
  useEffect(() => {
    const map = feedbackTimers.current;
    return () => {
      for (const ids of map.values()) {
        for (const id of ids) window.clearTimeout(id);
      }
      map.clear();
    };
  }, []);

  const triggerQuick = (id: string, text: string) => {
    if (!canQuickUse) return;
    // Double-click protection — ignore if still in cooldown.
    if (disabledChips.has(id)) return;
    onQuickAction?.(text);
    setPulsing((prev) => new Set(prev).add(id));
    setDisabledChips((prev) => new Set(prev).add(id));
    setSentChips((prev) => new Set(prev).add(id));
    const t1 = window.setTimeout(() => {
      setPulsing((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }, 300);
    const t2 = window.setTimeout(() => {
      setDisabledChips((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }, 500);
    const t3 = window.setTimeout(() => {
      setSentChips((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }, 1500);
    const prev = feedbackTimers.current.get(id) ?? [];
    feedbackTimers.current.set(id, [...prev, t1, t2, t3]);
  };

  return (
    <Card className="parchment rune-border border-border/80 p-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch lg:gap-3">
        {/* ===== Equipment (снаряжение) ===== */}
        <div className="flex flex-col gap-1 lg:w-[18%]">
          <div className="flex items-center gap-1.5">
            <Shirt className="h-3.5 w-3.5 text-amber-300" />
            <span className="text-[11px] font-semibold gold-text">Снаряжение</span>
            <Badge variant="secondary" className="ml-auto text-[8px]">{equippedCount}/8</Badge>
          </div>
          <div className="grid grid-cols-4 gap-1 lg:grid-cols-2">
            {equippedSlots.map(({ slot, label, item }) => (
              <button
                key={slot}
                type="button"
                disabled={!onUnequip || !item}
                onClick={() => item && onUnequip?.(slot)}
                title={item ? `${item.itemName} — клик, чтобы снять` : label}
                className={cn(
                  "flex flex-col items-center justify-center rounded border px-1 py-0.5 text-[8px] transition-colors",
                  item
                    ? "border-amber-700/50 bg-amber-950/20 text-amber-200"
                    : "border-border/30 bg-stone-900/40 text-muted-foreground/50",
                  onUnequip && item && "cursor-pointer hover:border-red-500 hover:bg-red-950/30",
                  (!onUnequip || !item) && "cursor-default"
                )}
              >
                <span className="text-[7px] opacity-70">{label}</span>
                <span className="truncate max-w-[50px] text-[9px] font-medium">
                  {item ? item.itemName : "—"}
                </span>
              </button>
            ))}
          </div>
          {hasAnyStation && onCraft && (
            <button
              type="button"
              onClick={onCraft}
              className="mt-1 rounded border border-purple-700/40 bg-purple-950/30 px-2 py-0.5 text-[9px] text-purple-200 transition-colors hover:bg-purple-950/50"
              title="Крафт"
            >
              <Hammer className="inline h-2.5 w-2.5" /> Крафт
            </button>
          )}
        </div>

        {/* Divider */}
        <div className="hidden lg:block w-px bg-border/40" />

        {/* ===== Inventory (предметы) ===== */}
        <div className="flex flex-col gap-1 lg:w-[27%]">
          <div className="flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5 text-amber-300" />
            <span className="text-[11px] font-semibold gold-text">{tt("character.inventory")}</span>
            {canQuickUse && (
              <span className="text-[9px] italic text-muted-foreground/60">клик — использовать</span>
            )}
            <Badge variant="secondary" className="ml-auto text-[8px]">{inventory.length}</Badge>
          </div>
          <ScrollArea className="fantasy-scroll max-h-20 lg:max-h-[72px]">
            <div className="flex flex-wrap gap-1">
              {inventory.length === 0 ? (
                <span className="text-[10px] italic text-muted-foreground">Инвентарь пуст</span>
              ) : (
                inventory.map((item) => {
                  const chipId = `item:${item.id}`;
                  const isDisabled = !canQuickUse || disabledChips.has(chipId);
                  const isPulsing = pulsing.has(chipId);
                  const isSent = sentChips.has(chipId);
                  const tooltip = buildItemTooltip(item);
                  return (
                    <Tooltip key={item.id}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          disabled={isDisabled}
                          onClick={() => triggerQuick(chipId, buildItemQuickText(item, quickCtx))}
                          className={cn(
                            "relative flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] transition-all",
                            item.itemType === "potion" && "border-rose-700/40 bg-rose-950/20 text-rose-200",
                            item.itemType === "scroll" && "border-amber-700/40 bg-amber-950/20 text-amber-200",
                            item.itemType === "weapon" && "border-sky-700/40 bg-sky-950/20 text-sky-200",
                            item.itemType === "armor" && "border-emerald-700/40 bg-emerald-950/20 text-emerald-200",
                            !["potion", "scroll", "weapon", "armor"].includes(item.itemType) && "border-border/40 bg-stone-900/40 text-stone-200",
                            canQuickUse && !disabledChips.has(chipId) && "cursor-pointer hover:border-amber-500 hover:bg-amber-950/30",
                            (!canQuickUse || disabledChips.has(chipId)) && "cursor-default",
                            isPulsing && "ring-2 ring-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.55)]",
                          )}
                        >
                          {item.itemType === "potion" && <Heart className="h-2.5 w-2.5" />}
                          {item.itemType === "scroll" && <ScrollIcon className="h-2.5 w-2.5" />}
                          {item.itemType === "weapon" && <Swords className="h-2.5 w-2.5" />}
                          <span className="truncate max-w-[80px]">{item.itemName}</span>
                          {item.quantity > 1 && <span className="text-[8px] opacity-70">×{item.quantity}</span>}
                          {isSent && (
                            <span className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-emerald-500 bg-emerald-950 px-1.5 py-px text-[8px] font-medium text-emerald-300 shadow">
                              отправлено ✓
                            </span>
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[240px] text-left text-[10px] leading-tight">
                        <div className="space-y-0.5">
                          <div className="font-semibold text-amber-200">{item.itemName}</div>
                          <div className="text-[9px] text-muted-foreground">{tooltip}</div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Divider */}
        <div className="hidden lg:block w-px bg-border/40" />

        {/* ===== Abilities (способности) ===== */}
        <div className="flex flex-col gap-1 lg:flex-1">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-purple-300" />
            <span className="text-[11px] font-semibold gold-text">{tt("character.abilities")}</span>
            {canQuickUse && (
              <span className="text-[9px] italic text-muted-foreground/60">клик — применить</span>
            )}
            <Badge variant="secondary" className="ml-auto text-[8px]">{abilities.length}</Badge>
          </div>
          <ScrollArea className="fantasy-scroll max-h-20 lg:max-h-[72px]">
            <div className="flex flex-wrap gap-1">
              {abilities.length === 0 ? (
                <span className="text-[10px] italic text-muted-foreground">Нет способностей</span>
              ) : (
                abilities.map((a) => {
                  const chipId = `abil:${a.id}`;
                  const isDisabled = !canQuickUse || disabledChips.has(chipId);
                  const isPulsing = pulsing.has(chipId);
                  const isSent = sentChips.has(chipId);
                  const tooltip = buildAbilityTooltip(a);
                  return (
                    <Tooltip key={a.id}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          disabled={isDisabled}
                          onClick={() => triggerQuick(chipId, buildAbilityQuickText(a, quickCtx))}
                          className={cn(
                            "relative flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] transition-all",
                            a.source === "race" && "border-emerald-700/40 bg-emerald-950/20 text-emerald-200",
                            a.source === "class" && "border-sky-700/40 bg-sky-950/20 text-sky-200",
                            a.source === "talent" && "border-purple-700/40 bg-purple-950/20 text-purple-200",
                            a.source === "scroll" && "border-amber-700/40 bg-amber-950/20 text-amber-200",
                            a.source === "spell" && "border-fuchsia-700/40 bg-fuchsia-950/20 text-fuchsia-200",
                            !["race", "class", "talent", "scroll", "spell"].includes(a.source) && "border-border/40 bg-stone-900/40 text-stone-200",
                            a.consumable && "ring-1 ring-amber-700/30",
                            canQuickUse && !disabledChips.has(chipId) && "cursor-pointer hover:border-amber-500 hover:bg-amber-950/30",
                            (!canQuickUse || disabledChips.has(chipId)) && "cursor-default",
                            isPulsing && "ring-2 ring-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.55)]",
                          )}
                        >
                          {a.source === "spell" && <Wand2 className="h-2.5 w-2.5" />}
                          {a.source === "scroll" && <ScrollIcon className="h-2.5 w-2.5" />}
                          {a.source === "class" && <Zap className="h-2.5 w-2.5" />}
                          {a.source === "race" && <Shield className="h-2.5 w-2.5" />}
                          <span className="truncate max-w-[90px]">{a.name}</span>
                          {/* Item 2 — prominent slot-level badge: colored circle "КN". */}
                          {a.slotLevel && a.slotLevel > 0 && (
                            <span
                              className="ml-0.5 inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full border border-fuchsia-400/70 bg-fuchsia-900/70 px-1 text-[8px] font-bold leading-none text-fuchsia-100"
                              title={`Тратит ячейку ${a.slotLevel}-го круга`}
                            >
                              К{a.slotLevel}
                            </span>
                          )}
                          {/* Item 2 — consumable badge for scrolls. */}
                          {a.consumable && (
                            <span className="ml-0.5 inline-flex items-center rounded border border-amber-700/50 bg-amber-950/60 px-1 text-[7px] font-medium leading-none text-amber-200">
                              расходуемый
                            </span>
                          )}
                          {isSent && (
                            <span className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-emerald-500 bg-emerald-950 px-1.5 py-px text-[8px] font-medium text-emerald-300 shadow">
                              отправлено ✓
                            </span>
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[260px] text-left text-[10px] leading-tight">
                        <div className="space-y-0.5">
                          <div className="font-semibold text-amber-200">
                            {a.name}
                            {a.source === "spell" && a.slotLevel && a.slotLevel > 0 && (
                              <span className="ml-1 text-fuchsia-300">· круг {a.slotLevel}</span>
                            )}
                          </div>
                          <div className="text-[9px] text-muted-foreground">{tooltip}</div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })
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

/** Build a one-line tooltip summary for an inventory item. */
function buildItemTooltip(item: InventoryItemState): string {
  const parts: string[] = [];
  parts.push(`Тип: ${item.itemType}`);
  if (item.quantity > 1) parts.push(`Количество: ${item.quantity}`);
  if (item.equipSlot) parts.push(`Слот: ${item.equipSlot}`);
  if (item.acBonus > 0) parts.push(`+${item.acBonus} AC`);
  if (item.damageNotation) parts.push(`Урон: ${item.damageNotation}`);
  if (item.description) parts.push(item.description);
  return parts.join(" · ");
}

/** Build a one-line tooltip summary for an ability. */
function buildAbilityTooltip(a: Ability): string {
  const parts: string[] = [];
  parts.push(`Источник: ${a.sourceLabel}`);
  if (a.castType) {
    const typeLabel =
      a.castType === "damage" ? "урон" :
      a.castType === "heal" ? "лечение" :
      a.castType === "buff" ? "эффект" :
      a.castType === "utility" ? "утилити" : a.castType;
    parts.push(`Тип: ${typeLabel}`);
  }
  if (a.castNotation) parts.push(`Бросок: ${a.castNotation}`);
  if (a.slotLevel && a.slotLevel > 0) parts.push(`Ячейка: ${a.slotLevel}-й круг`);
  if (a.consumable) parts.push("Расходуемый");
  if (a.uses && a.uses > 1) parts.push(`Осталось: ${a.uses}`);
  if (a.description) parts.push(a.description);
  return parts.join(" · ");
}
