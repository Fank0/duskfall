"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  ScrollIcon, Sparkles, Swords, Heart, Zap, Shield, Package, Wand2,
  Shirt, Hammer, Star, Search,
} from "lucide-react";
import { computeAbilities, type Ability } from "@/lib/game/abilities";
import { useSettings } from "@/lib/game/settings";
import { t } from "@/lib/game/i18n";
import { cn } from "@/lib/utils";
import type { PlayerState, InventoryItemState } from "@/lib/game/types";
import {
  buildAbilityQuickText,
  buildItemQuickText,
  classifyAbilityTargeting,
  type QuickActionContext,
} from "@/lib/game/quick-use";

/**
 * Cast-type sort priority (Item 5 — most-used abilities first).
 * damage > heal > buff > utility/undefined. Within the same priority bucket,
 * the original order is preserved (stable sort).
 */
const CAST_TYPE_PRIORITY: Record<string, number> = {
  damage: 0,
  heal: 1,
  buff: 2,
  utility: 3,
};

function sortAbilitiesByPriority(list: Ability[]): Ability[] {
  // Stable sort: Array.prototype.sort is stable in modern V8 / Node.
  return [...list].sort((a, b) => {
    const pa = CAST_TYPE_PRIORITY[a.castType ?? "utility"] ?? 3;
    const pb = CAST_TYPE_PRIORITY[b.castType ?? "utility"] ?? 3;
    if (pa !== pb) return pa - pb;
    return 0;
  });
}

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
  onRequestTargeting,
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
  /**
   * Targeting-mode request (Item 3): when supplied and combat is active,
   * damage-dealing abilities and AoE spells call this instead of sending the
   * action immediately. The parent enters a targeting mode and waits for the
   * player to click a monster (ability) or grid cell (aoe) on the grid.
   */
  onRequestTargeting?: (ability: Ability, mode: "ability" | "aoe") => void;
}) {
  const settings = useSettings();
  const lang = settings.lang;
  const favoriteAbilities = settings.favoriteAbilities;
  const toggleFavoriteAbility = settings.toggleFavoriteAbility;
  const tt = (key: string, params?: Record<string, string | number>) => t(lang, key, params);

  // Item 5 — sort abilities by cast-type priority (damage > heal > buff > utility).
  // Stable sort preserves source order within the same bucket. Memoized so the
  // reference is stable across re-renders unless the input array identity changes.
  const allAbilities = useMemo(
    () => sortAbilitiesByPriority(computeAbilities(player, inventory)),
    [player, inventory],
  );

  // Item 5 — favorites: surface starred abilities in a dedicated left-of-bar
  // section. Only abilities the player currently has show up here (stale
  // favorites for sold scrolls / unlearned spells are filtered out).
  const favoritedAbilities = useMemo(
    () => allAbilities.filter((a) => favoriteAbilities.includes(a.id)),
    [allAbilities, favoriteAbilities],
  );

  // Item 5 — search filter for the main abilities section. Only shown when
  // the player has more than 8 abilities.
  const [abilitySearch, setAbilitySearch] = useState("");
  const showAbilitySearch = allAbilities.length > 8;
  const filteredAbilities = useMemo(() => {
    if (!showAbilitySearch || abilitySearch.trim() === "") return allAbilities;
    const q = abilitySearch.trim().toLowerCase();
    return allAbilities.filter((a) => a.name.toLowerCase().includes(q));
  }, [allAbilities, abilitySearch, showAbilitySearch]);

  // Use filteredAbilities for the main section, allAbilities for everything else.
  const abilities = filteredAbilities;
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

  /**
   * Item 3 — ability click dispatcher. While combat is active and a
   * targeting callback is supplied, damage-dealing abilities enter ability
   * targeting mode (player picks a monster on the grid) and AoE spells enter
   * AoE targeting mode (player picks a cell on the grid). Self-cast abilities
   * (heal/buff/utility) and any ability used outside combat are sent
   * immediately via the standard quick-use flow.
   */
  const triggerAbility = (a: Ability) => {
    if (!canQuickUse) return;
    const chipId = `abil:${a.id}`;
    if (disabledChips.has(chipId)) return;
    if (combatActive && onRequestTargeting) {
      const kind = classifyAbilityTargeting(a);
      if (kind === "monster") {
        onRequestTargeting(a, "ability");
        return;
      }
      if (kind === "aoe") {
        onRequestTargeting(a, "aoe");
        return;
      }
    }
    triggerQuick(chipId, buildAbilityQuickText(a, quickCtx));
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

        {/* ===== Favorites (избранное) — Item 5 ===== */}
        {/* Pinned abilities the player starred in the main section. Rendered
            between inventory and abilities so they're always one glance away. */}
        {favoritedAbilities.length > 0 && (
          <div className="flex flex-col gap-1 lg:w-auto lg:max-w-[18%]">
            <div className="flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5 text-amber-300" />
              <span className="text-[11px] font-semibold gold-text">Избранное</span>
              <Badge variant="secondary" className="ml-auto text-[8px]">{favoritedAbilities.length}</Badge>
            </div>
            <ScrollArea className="fantasy-scroll max-h-20 lg:max-h-[72px]">
              <div className="flex flex-wrap gap-1.5">
                {favoritedAbilities.map((a) => {
                  const chipId = `abil:${a.id}`;
                  return (
                    <AbilityChip
                      key={a.id}
                      a={a}
                      isFavorited
                      hotkey={null}
                      isDisabled={!canQuickUse || disabledChips.has(chipId)}
                      isPulsing={pulsing.has(chipId)}
                      isSent={sentChips.has(chipId)}
                      canQuickUse={canQuickUse}
                      onTrigger={triggerAbility}
                      onToggleFavorite={toggleFavoriteAbility}
                    />
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Divider */}
        {favoritedAbilities.length > 0 && <div className="hidden lg:block w-px bg-border/40" />}

        {/* ===== Abilities (способности) ===== */}
        <div className="flex flex-col gap-1 lg:flex-1">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-purple-300" />
            <span className="text-[11px] font-semibold gold-text">{tt("character.abilities")}</span>
            {canQuickUse && (
              <span className="text-[9px] italic text-muted-foreground/60">клик — применить</span>
            )}
            <Badge variant="secondary" className="ml-auto text-[8px]">
              {showAbilitySearch && abilitySearch.trim() !== ""
                ? `${abilities.length}/${allAbilities.length}`
                : `${allAbilities.length}`}
            </Badge>
          </div>
          {/* Item 5 — search filter box, only when the player has >8 abilities. */}
          {showAbilitySearch && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-1.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={abilitySearch}
                onChange={(e) => setAbilitySearch(e.target.value)}
                placeholder="Поиск способности…"
                className="h-6 rounded border-border/50 bg-stone-900/60 pl-6 pr-2 text-[10px] placeholder:text-muted-foreground/60"
                data-no-click-sfx
              />
            </div>
          )}
          <ScrollArea className="fantasy-scroll max-h-20 lg:max-h-[72px]">
            <div className="flex flex-wrap gap-1.5">
              {abilities.length === 0 ? (
                <span className="text-[10px] italic text-muted-foreground">
                  {showAbilitySearch && abilitySearch.trim() !== ""
                    ? "Ничего не найдено"
                    : "Нет способностей"}
                </span>
              ) : (
                abilities.map((a, idx) => {
                  const chipId = `abil:${a.id}`;
                  // Item 4 — hotkey number for the first 8 abilities.
                  const hotkey = idx < 8 ? idx + 1 : null;
                  return (
                    <AbilityChip
                      key={a.id}
                      a={a}
                      isFavorited={favoriteAbilities.includes(a.id)}
                      hotkey={hotkey}
                      isDisabled={!canQuickUse || disabledChips.has(chipId)}
                      isPulsing={pulsing.has(chipId)}
                      isSent={sentChips.has(chipId)}
                      canQuickUse={canQuickUse}
                      onTrigger={triggerAbility}
                      onToggleFavorite={toggleFavoriteAbility}
                    />
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
              {slots.map((s) => {
                // Item 5 — low-slots warning: red pulse when <25% remaining.
                const ratio = s.max > 0 ? s.current / s.max : 1;
                const isLow = s.max > 0 && ratio < 0.25;
                return (
                  <div
                    key={s.level}
                    className={cn(
                      "flex flex-col items-center gap-0.5 rounded px-1",
                      isLow && "animate-pulse-glow ring-1 ring-red-500/60",
                    )}
                    title={isLow ? `Мало слотов ${s.level}-го круга: ${s.current}/${s.max}` : `${s.current}/${s.max}`}
                  >
                    <span className={cn("text-[8px]", isLow ? "font-bold text-red-400" : "text-muted-foreground")}>
                      К{s.level}
                    </span>
                    <div className="flex gap-0.5">
                      {Array.from({ length: s.max }).map((_, i) => (
                        <div
                          key={i}
                          className={cn(
                            "h-2.5 w-2.5 rounded-full border",
                            i < s.current
                              ? isLow
                                ? "border-red-500 bg-red-600"
                                : "border-fuchsia-500 bg-fuchsia-600"
                              : "border-border/50 bg-stone-900/60"
                          )}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
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

/**
 * AbilityChip — a single ability chip rendered in the BottomPanel. Shared
 * between the main "Способности" section and the "Избранное" section so the
 * visual treatment stays consistent. The star toggle button is rendered as a
 * sibling of the chip button inside a relative wrapper so clicking the star
 * doesn't trigger the chip's onClick (and nested-button HTML validity is
 * preserved — the star is a sibling <button>, not a descendant).
 */
interface AbilityChipProps {
  a: Ability;
  isFavorited: boolean;
  hotkey: number | null;
  isDisabled: boolean;
  isPulsing: boolean;
  isSent: boolean;
  canQuickUse: boolean;
  onTrigger: (a: Ability) => void;
  onToggleFavorite: (id: string) => void;
}

function AbilityChip({
  a,
  isFavorited,
  hotkey,
  isDisabled,
  isPulsing,
  isSent,
  canQuickUse,
  onTrigger,
  onToggleFavorite,
}: AbilityChipProps) {
  const tooltip = buildAbilityTooltip(a);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative inline-flex">
          <button
            type="button"
            disabled={isDisabled}
            onClick={() => onTrigger(a)}
            className={cn(
              "relative flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] transition-all",
              a.source === "race" && "border-emerald-700/40 bg-emerald-950/20 text-emerald-200",
              a.source === "class" && "border-sky-700/40 bg-sky-950/20 text-sky-200",
              a.source === "talent" && "border-purple-700/40 bg-purple-950/20 text-purple-200",
              a.source === "scroll" && "border-amber-700/40 bg-amber-950/20 text-amber-200",
              a.source === "spell" && "border-fuchsia-700/40 bg-fuchsia-950/20 text-fuchsia-200",
              !["race", "class", "talent", "scroll", "spell"].includes(a.source) && "border-border/40 bg-stone-900/40 text-stone-200",
              a.consumable && "ring-1 ring-amber-700/30",
              canQuickUse && !isDisabled && "cursor-pointer hover:border-amber-500 hover:bg-amber-950/30",
              (!canQuickUse || isDisabled) && "cursor-default",
              isPulsing && "ring-2 ring-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.55)]",
              // Favorited chips get a subtle amber accent border so they stand
              // out at a glance even when scrolled out of the favorites section.
              isFavorited && "border-amber-500/60",
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
            {/* Item 4 — hotkey number badge (1..8) in the corner. */}
            {hotkey !== null && (
              <span
                className="ml-0.5 inline-flex h-3 w-3 items-center justify-center rounded-sm border border-stone-500/60 bg-stone-800/80 text-[7px] font-bold leading-none text-stone-200"
                title={`Горячая клавиша: ${hotkey}`}
              >
                {hotkey}
              </span>
            )}
            {isSent && (
              <span className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-emerald-500 bg-emerald-950 px-1.5 py-px text-[8px] font-medium text-emerald-300 shadow">
                отправлено ✓
              </span>
            )}
          </button>
          {/* Item 5 — star toggle (favorites). Sibling button (not nested)
              absolutely positioned in the top-right corner. */}
          {canQuickUse && (
            <button
              type="button"
              onClick={() => onToggleFavorite(a.id)}
              className={cn(
                "absolute -right-1.5 -top-1.5 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full border transition-colors",
                isFavorited
                  ? "border-amber-400 bg-amber-900/80 hover:bg-amber-800"
                  : "border-stone-500/70 bg-stone-900/90 hover:bg-stone-800",
              )}
              title={isFavorited ? "Убрать из избранного" : "Добавить в избранное"}
            >
              <Star
                className={cn(
                  "h-2 w-2",
                  isFavorited ? "fill-amber-400 text-amber-400" : "text-amber-500/70",
                )}
              />
            </button>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] text-left text-[10px] leading-tight">
        <div className="space-y-0.5">
          <div className="font-semibold text-amber-200">
            {a.name}
            {a.source === "spell" && a.slotLevel && a.slotLevel > 0 && (
              <span className="ml-1 text-fuchsia-300">· круг {a.slotLevel}</span>
            )}
            {hotkey !== null && (
              <span className="ml-1 text-stone-300">· [{hotkey}]</span>
            )}
            {isFavorited && (
              <span className="ml-1 text-amber-300">★</span>
            )}
          </div>
          <div className="text-[9px] text-muted-foreground">{tooltip}</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
