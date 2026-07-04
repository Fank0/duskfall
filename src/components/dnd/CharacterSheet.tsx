"use client";

import { memo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Heart, Shield, Coins, Swords, Backpack, Skull, Crown, Sparkles, Scroll as ScrollIcon, ScrollText, Shirt, Hammer } from "lucide-react";
import type { PlayerState, InventoryItemState, ConditionState, EquipmentSlot } from "@/lib/game/types";
import { abilityModifier } from "@/lib/game/dice";
import { computeAbilities, type Ability } from "@/lib/game/abilities";
import { CONDITIONS } from "@/lib/game/conditions";
import { getClassIdByCharClass, isCasterClass } from "@/lib/game/presets";
import { computeACBreakdown, inferEquipProps } from "@/lib/game/item-props";
import { shallowEqual } from "@/lib/game/shallow";
import { useSettings } from "@/lib/game/settings";
import { t } from "@/lib/game/i18n";
import { cn } from "@/lib/utils";
import {
  buildAbilityQuickText,
  buildItemQuickText,
  classifyAbilityTargeting,
  type QuickActionContext,
} from "@/lib/game/quick-use";

// Lazy-load the heavy EquipmentPanel + CraftingPanel modals (item 24:
// dynamic import with ssr:false). These are only shown when the player
// clicks "Открыть" / "Крафт" — deferring them keeps the inventory sheet
// render path fast on first paint.
const EquipmentPanel = dynamic(
  () => import("./EquipmentPanel").then((m) => m.EquipmentPanel),
  { ssr: false }
);
const CraftingPanel = dynamic(
  () => import("./CraftingPanel").then((m) => m.CraftingPanel),
  { ssr: false }
);

const STAT_LABELS: { key: keyof PlayerState; short: string }[] = [
  { key: "str", short: "character.str" },
  { key: "dex", short: "character.dex" },
  { key: "con", short: "character.con" },
  { key: "int", short: "character.int" },
  { key: "wis", short: "character.wis" },
  { key: "cha", short: "character.cha" },
];

export const CharacterSheet = memo(function CharacterSheet({
  player,
  inventory,
  isYou,
  isTurn,
  compact,
  conditions = [],
  onEquip,
  onUnequip,
  hasAlchemy = false,
  hasForge = false,
  hasEnchant = false,
  onCraft,
  onQuickAction,
  combatActive = false,
  nearestMonsterName,
  onRequestTargeting,
}: {
  player: PlayerState;
  inventory: InventoryItemState[];
  isYou?: boolean;
  isTurn?: boolean;
  compact?: boolean;
  conditions?: ConditionState[];
  onEquip?: (itemId: string, slot?: EquipmentSlot) => Promise<void>;
  onUnequip?: (slot: EquipmentSlot | "accessory1" | "accessory2") => Promise<void>;
  hasAlchemy?: boolean;
  hasForge?: boolean;
  hasEnchant?: boolean;
  onCraft?: (recipeId: string) => Promise<{ success: boolean; result?: string; roll?: number; dc?: number; error?: string }>;
  /**
   * Quick-use handler — when supplied, abilities and inventory items become
   * clickable. Clicking sends a contextual action text (e.g.
   * `Я использую "Огненный шар" против врага!`) which the parent feeds into
   * the chat / DM action stream. Restored "система быстрого применения".
   */
  onQuickAction?: (text: string) => void;
  /** True while combat is active — enables targeted damage text (Item 1). */
  combatActive?: boolean;
  /** Name of the nearest active monster — used as damage target in text. */
  nearestMonsterName?: string;
  /**
   * Targeting-mode request (Item 3). When supplied and combat is active,
   * damage-dealing abilities and AoE spells call this instead of sending the
   * action immediately. The parent enters a targeting mode and waits for the
   * player to pick a monster (ability) or grid cell (aoe) on the grid.
   */
  onRequestTargeting?: (ability: Ability, mode: "ability" | "aoe") => void;
}) {
  const [equipOpen, setEquipOpen] = useState(false);
  const [craftOpen, setCraftOpen] = useState(false);
  // UI language (i18n-restore)
  const lang = useSettings((s) => s.lang);
  const tt = (key: string, params?: Record<string, string | number>) => t(lang, key, params);
  const hasAnyStation = hasAlchemy || hasForge || hasEnchant;
  const hpPct = player.maxHp > 0 ? (player.hp / player.maxHp) * 100 : 0;
  const hpColor =
    hpPct > 60 ? "from-emerald-600 to-emerald-500" : hpPct > 30 ? "from-amber-600 to-amber-500" : "from-red-700 to-red-600";
  const dead = !player.isAlive || player.hp <= 0;

  // Quick-use context (Item 1): drives contextual action text — e.g. damage
  // abilities target the nearest monster during combat, scrolls use the
  // «читаю свиток» phrasing, spells include their slot level (круг N).
  const quickCtx: QuickActionContext = {
    combatActive,
    nearestMonsterName,
  };

  // Spell slots — only for casters. Show a row of filled/empty circles per level.
  const isCaster = isCasterClass(getClassIdByCharClass(player.charClass));
  const slotLevels = Object.keys(player.maxSpellSlots)
    .map(Number)
    .filter((n) => Number.isInteger(n) && player.maxSpellSlots[String(n)] > 0)
    .sort((a, b) => a - b);

  // Equipped items + AC breakdown (compact display in the sheet header).
  const equippedItemsForAC = (Object.entries(player.equipment) as [keyof typeof player.equipment, string | null][])
    .map(([slot, id]) => {
      if (!id) return null;
      const it = inventory.find((i) => i.id === id);
      if (!it) return null;
      const props = inferEquipProps(it.itemName, it.itemType, it.description);
      const slotEquip: EquipmentSlot =
        slot === "accessory1" || slot === "accessory2" ? "accessory" : (slot as EquipmentSlot);
      return { slot: slotEquip, name: it.itemName, acBonus: props.acBonus };
    })
    .filter(Boolean) as { slot: EquipmentSlot; name: string; acBonus: number }[];
  const acBreakdown = computeACBreakdown(player.ac, player.dex, equippedItemsForAC);
  const equippedCount = equippedItemsForAC.length;

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
                {tt("common.you").toUpperCase()}
              </Badge>
            )}
            {player.isHost && <Crown className="h-3 w-3 shrink-0 text-amber-300" />}
            {dead && <Skull className="h-3.5 w-3.5 shrink-0 text-red-400" />}
            {isTurn && (
              <Badge className="ml-auto shrink-0 bg-primary px-1.5 text-[8px]">{tt("game.your_turn").split("!")[0].toUpperCase()}</Badge>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {player.raceName} {player.charClass} · {player.backgroundName} · {tt("character.level_short")}{player.level}
          </p>
          <p className="text-[9px] text-muted-foreground/70">{player.weaponName}</p>
        </div>
      </div>

      <CardContent className="px-3 pb-3 pt-0">
        {/* Vitals */}
        <div className="grid grid-cols-3 gap-1.5">
          <Vital icon={<Heart className="h-3 w-3" />} label="HP" value={`${player.hp}/${player.maxHp}`} accent="text-red-400" />
          <Vital icon={<Shield className="h-3 w-3" />} label="AC" value={`${player.ac}`} accent="text-sky-300" />
          <Vital icon={<Coins className="h-3 w-3" />} label={tt("character.gold_short")} value={`${player.gold}`} accent="text-amber-300" />
        </div>

        {/* HP bar */}
        <div className="mt-2">
          <div className="h-2 w-full overflow-hidden rounded-full border border-border/60 bg-stone-900/80">
            <div className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-500", hpColor)} style={{ width: `${hpPct}%` }} />
          </div>
        </div>

        {/* Spell slots (casters only) — shown in both compact and full modes */}
        {isCaster && slotLevels.length > 0 && (
          <div className="mt-2 rounded border border-border/40 bg-stone-900/40 px-2 py-1.5">
            <div className="mb-1 flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-purple-300" />
              <span className="text-[10px] font-semibold gold-text">{tt("character.spell_slots")}</span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {slotLevels.map((lv) => {
                const max = player.maxSpellSlots[String(lv)] ?? 0;
                const cur = player.spellSlots[String(lv)] ?? 0;
                return (
                  <div key={lv} className="flex items-center gap-1" title={`${tt("character.level_short")}${lv}: ${cur}/${max}`}>
                    <span className="text-[9px] font-mono text-muted-foreground">{tt("character.level_short")}{lv}</span>
                    <div className="flex gap-0.5">
                      {Array.from({ length: max }).map((_, i) => (
                        <span
                          key={i}
                          className={cn(
                            "h-2 w-2 rounded-full border transition-colors",
                            i < cur
                              ? "border-purple-400/80 bg-purple-500 shadow-[0_0_4px_rgba(168,85,247,0.6)]"
                              : "border-border/60 bg-stone-800/80"
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

        {/* Active conditions */}
        {conditions.length > 0 && (
          <div className="mt-2">
            <div className="flex items-center gap-1.5 pb-1">
              <Skull className="h-3 w-3 text-red-300" />
              <span className="text-[11px] font-semibold gold-text">{tt("character.conditions")}</span>
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
                    <div className="text-[8px] text-muted-foreground">{tt(s.short)}</div>
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

            {/* Equipment summary + button */}
            <div className="flex items-center justify-between gap-2 pb-1">
              <div className="flex items-center gap-1.5">
                <Shirt className="h-3 w-3 text-amber-300" />
                <span className="text-[11px] font-semibold gold-text">{tt("character.equipment")}</span>
                <Badge variant="secondary" className="text-[8px]">{equippedCount}/8</Badge>
              </div>
              <div className="flex items-center gap-1">
                {isYou && hasAnyStation && onCraft && (
                  <button
                    type="button"
                    onClick={() => setCraftOpen(true)}
                    className="rounded border border-purple-700/40 bg-purple-950/30 px-2 py-0.5 text-[10px] text-purple-200 transition-colors hover:bg-purple-950/50"
                    title={tt("character.crafting")}
                  >
                    <Hammer className="inline h-3 w-3" /> {tt("character.crafting")}
                  </button>
                )}
                {isYou && onEquip && onUnequip && (
                  <button
                    type="button"
                    onClick={() => setEquipOpen(true)}
                    className="rounded border border-amber-700/40 bg-amber-950/30 px-2 py-0.5 text-[10px] text-amber-200 transition-colors hover:bg-stone-800/60"
                  >
                    {tt("ui.open")}
                  </button>
                )}
              </div>
            </div>
            {/* AC breakdown line */}
            <div className="mb-2 rounded border border-sky-800/40 bg-sky-950/20 px-2 py-1 text-[9px] text-sky-200">
              AC {player.ac} = 10
              {acBreakdown.dexBonus > 0 ? ` + ${acBreakdown.dexBonus} (ЛОВ)` : acBreakdown.dexBonus < 0 ? ` ${acBreakdown.dexBonus} (ЛОВ)` : ""}
              {acBreakdown.armor > 0 ? ` + ${acBreakdown.armor} (броня)` : ""}
              {acBreakdown.shield > 0 ? ` + ${acBreakdown.shield} (щит)` : ""}
              {acBreakdown.other > 0 ? ` + ${acBreakdown.other} (прочее)` : ""}
            </div>

            <Separator className="my-2 bg-border/50" />

            {/* Inventory */}
            <div className="flex items-center gap-1.5 pb-1">
              <Backpack className="h-3 w-3 text-amber-300" />
              <span className="text-[11px] font-semibold gold-text">{tt("character.inventory")}</span>
              {isYou && onQuickAction && (
                <span className="ml-1 text-[8px] italic text-amber-300/70">клик — использовать</span>
              )}
              <Badge variant="secondary" className="ml-auto text-[8px]">{inventory.length}</Badge>
            </div>
            <ScrollArea className="fantasy-scroll max-h-40 pr-1">
              {inventory.length === 0 ? (
                <p className="py-2 text-center text-[10px] italic text-muted-foreground">{tt("character.empty")}</p>
              ) : (
                <ul className="space-y-1">
                  {inventory.map((item) => {
                    // Quick-use: clicking an inventory item sends a contextual
                    // action to the chat. Only enabled for the local player
                    // ("isYou") when the parent supplies onQuickAction.
                    const canQuickUse = isYou && onQuickAction;
                    const handleQuickUse = canQuickUse
                      ? () => onQuickAction(buildItemQuickText(item, quickCtx))
                      : undefined;
                    return (
                      <li
                        key={item.id}
                        onClick={handleQuickUse}
                        title={canQuickUse ? "Нажмите, чтобы использовать" : undefined}
                        className={cn(
                          "rounded border border-border/40 bg-stone-900/40 p-1.5",
                          canQuickUse &&
                            "cursor-pointer transition-colors hover:border-amber-600/40 hover:bg-stone-800/50"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="truncate text-[11px] font-medium">{item.itemName}</span>
                          {item.quantity > 1 && <Badge variant="outline" className="text-[8px]">x{item.quantity}</Badge>}
                        </div>
                        {item.description && (
                          <p className="mt-0.5 text-[9px] leading-snug text-muted-foreground">{item.description}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>

            <Separator className="my-2 bg-border/50" />

            {/* Abilities */}
            <div className="flex items-center gap-1.5 pb-1">
              <Sparkles className="h-3 w-3 text-amber-300" />
              <span className="text-[11px] font-semibold gold-text">{tt("character.abilities")}</span>
              {isYou && onQuickAction && (
                <span className="ml-1 text-[8px] italic text-amber-300/70">клик — применить</span>
              )}
              <Badge variant="secondary" className="ml-auto text-[8px]">
                {computeAbilities(player, inventory).length}
              </Badge>
            </div>
            <ScrollArea className="fantasy-scroll max-h-44 pr-1">
              <ul className="space-y-1">
                {computeAbilities(player, inventory).map((a) => {
                  // Quick-use: clicking an ability sends a contextual action to
                  // the chat. Damage → "против врага", heal → "для лечения",
                  // buff → neutral, scroll → "читаю свиток".
                  // Item 3: if combat is active and the parent supplies
                  // onRequestTargeting, damage/AoE abilities request targeting
                  // instead of sending immediately.
                  const canQuickUse = isYou && onQuickAction;
                  const handleQuickUse = canQuickUse
                    ? () => {
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
                        onQuickAction(buildAbilityQuickText(a, quickCtx));
                      }
                    : undefined;
                  return (
                    <li
                      key={a.id}
                      onClick={handleQuickUse}
                      title={canQuickUse ? "Нажмите, чтобы использовать" : undefined}
                      className={cn(
                        "rounded border p-1.5",
                        a.consumable
                          ? "border-amber-700/50 bg-amber-950/20"
                          : "border-border/40 bg-stone-900/40",
                        canQuickUse &&
                          "cursor-pointer transition-colors hover:border-amber-600/40 hover:bg-stone-800/50"
                      )}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="flex items-center gap-1 truncate text-[11px] font-semibold">
                          {a.source === "scroll" && <ScrollIcon className="h-3 w-3 shrink-0 text-amber-300" />}
                          {a.source === "spell" && <Sparkles className="h-3 w-3 shrink-0 text-purple-300" />}
                          {a.name}
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                          {a.consumable && (
                            <Badge className="bg-amber-900/60 text-[7px] text-amber-200">расходуемый</Badge>
                          )}
                          {a.slotLevel && a.slotLevel > 0 && (
                            <Badge variant="outline" className="text-[7px] border-purple-700/50 text-purple-300">
                              яч.{a.slotLevel}
                            </Badge>
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
                              a.source === "spell" ? "border-fuchsia-700/50 text-fuchsia-300" :
                              "border-amber-700/50 text-amber-300"
                            )}
                          >
                            {a.source === "race" ? "народ" : a.source === "class" ? "класс" : a.source === "talent" ? "талант" : a.source === "spell" ? "закл." : "свиток"}
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
                  );
                })}
              </ul>
            </ScrollArea>

            {/* Backstory (player-authored) — collapsed preview under abilities. */}
            {player.backstory && player.backstory.trim().length > 0 && (
              <details className="mt-2 rounded border border-amber-700/30 bg-amber-950/10 px-2 py-1.5">
                <summary className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold gold-text">
                  <ScrollText className="h-3 w-3 text-amber-300" />
                  Предыстория
                </summary>
                <p className="mt-1 whitespace-pre-wrap text-[10px] leading-relaxed text-amber-100/70">
                  {player.backstory.trim()}
                </p>
              </details>
            )}
          </>
        )}
      </CardContent>

      {/* Equipment modal — rendered for the local player. */}
      {isYou && onEquip && onUnequip && (
        <EquipmentPanel
          player={player}
          inventory={inventory}
          open={equipOpen}
          onOpenChange={setEquipOpen}
          onEquip={onEquip}
          onUnequip={onUnequip}
        />
      )}
      {/* Crafting modal — rendered for the local player when a station is available. */}
      {isYou && hasAnyStation && onCraft && (
        <CraftingPanel
          player={player}
          inventory={inventory}
          hasAlchemy={hasAlchemy}
          hasForge={hasForge}
          hasEnchant={hasEnchant}
          open={craftOpen}
          onOpenChange={setCraftOpen}
          onCraft={onCraft}
        />
      )}
    </Card>
  );
}, characterSheetComparator);

/**
 * Custom shallow comparator for CharacterSheet. Compares primitive flags with
 * Object.is, arrays element-by-element (cheap identity check — adequate for
 * the inventory/conditions lists whose element identities only change when the
 * underlying snapshot actually changes), and a per-field check on the `player`
 * object so a brand-new player reference with the same data does NOT trigger
 * an unnecessary re-render.
 */
function characterSheetComparator(
  prev: CharacterSheetProps,
  next: CharacterSheetProps
): boolean {
  // Primitive + function props.
  if (
    !Object.is(prev.isYou, next.isYou) ||
    !Object.is(prev.isTurn, next.isTurn) ||
    !Object.is(prev.compact, next.compact) ||
    !Object.is(prev.hasAlchemy, next.hasAlchemy) ||
    !Object.is(prev.hasForge, next.hasForge) ||
    !Object.is(prev.hasEnchant, next.hasEnchant) ||
    !Object.is(prev.onEquip, next.onEquip) ||
    !Object.is(prev.onUnequip, next.onUnequip) ||
    !Object.is(prev.onCraft, next.onCraft) ||
    !Object.is(prev.onQuickAction, next.onQuickAction) ||
    !Object.is(prev.combatActive, next.combatActive) ||
    !Object.is(prev.nearestMonsterName, next.nearestMonsterName) ||
    !Object.is(prev.onRequestTargeting, next.onRequestTargeting)
  ) {
    return false;
  }
  // Player: per-field check on the values that affect rendering.
  if (!playerEqual(prev.player, next.player)) return false;
  // Inventory + conditions: shallow element-wise (identity on items).
  if (!shallowArrayIdentity(prev.inventory, next.inventory)) return false;
  if (!shallowArrayIdentity(prev.conditions ?? [], next.conditions ?? [])) return false;
  return true;
}

type CharacterSheetProps = {
  player: PlayerState;
  inventory: InventoryItemState[];
  isYou?: boolean;
  isTurn?: boolean;
  compact?: boolean;
  conditions?: ConditionState[];
  onEquip?: (itemId: string, slot?: EquipmentSlot) => Promise<void>;
  onUnequip?: (slot: EquipmentSlot | "accessory1" | "accessory2") => Promise<void>;
  hasAlchemy?: boolean;
  hasForge?: boolean;
  hasEnchant?: boolean;
  onCraft?: (recipeId: string) => Promise<{ success: boolean; result?: string; roll?: number; dc?: number; error?: string }>;
  onQuickAction?: (text: string) => void;
  combatActive?: boolean;
  nearestMonsterName?: string;
  onRequestTargeting?: (ability: Ability, mode: "ability" | "aoe") => void;
};

// Note: quick-action text generation now lives in @/lib/game/quick-use
// (buildAbilityQuickText / buildItemQuickText) and is consumed directly by
// the inline click handlers above. This keeps a single source of truth for
// the action-text rules across BottomPanel + CharacterSheet + hotkeys.

/** Compare two PlayerState objects on the fields that affect rendering. */
function playerEqual(a: PlayerState, b: PlayerState): boolean {
  if (Object.is(a, b)) return true;
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.charClass === b.charClass &&
    a.raceName === b.raceName &&
    a.backgroundName === b.backgroundName &&
    a.weaponName === b.weaponName &&
    a.color === b.color &&
    a.level === b.level &&
    a.hp === b.hp &&
    a.maxHp === b.maxHp &&
    a.ac === b.ac &&
    a.gold === b.gold &&
    a.str === b.str &&
    a.dex === b.dex &&
    a.con === b.con &&
    a.int === b.int &&
    a.wis === b.wis &&
    a.cha === b.cha &&
    a.isAlive === b.isAlive &&
    a.isHost === b.isHost &&
    a.pendingLevelUp === b.pendingLevelUp &&
    a.pendingASI === b.pendingASI &&
    shallowStringArrayEqual(a.selectedTalents, b.selectedTalents) &&
    shallowEqual(a.spellSlots, b.spellSlots) &&
    shallowEqual(a.maxSpellSlots, b.maxSpellSlots) &&
    shallowEqual(a.equipment, b.equipment)
  );
}

/** Length + element-wise string equality (for selectedTalents). */
function shallowStringArrayEqual(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Length + element-identity check for arrays (cheap pre-filter). */
function shallowArrayIdentity<T>(a: T[], b: T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
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
