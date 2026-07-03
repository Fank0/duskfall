// Quick-use helpers: build contextual Russian action text for ability/item
// clicks in the BottomPanel and CharacterSheet.
//
// The text is sent to the DM agent as the player's action — so it should
// carry just enough context (target, slot level, intent) for the LLM to
// resolve mechanics. All strings are Russian (the DM narrates in Russian).
//
// Used by:
//   - src/components/dnd/BottomPanel.tsx
//   - src/components/dnd/CharacterSheet.tsx
//   - src/app/page.tsx (hotkey dispatcher)

import type { Ability } from "./abilities";
import type { InventoryItemState } from "./types";

/** Context that influences quick-use text generation. */
export interface QuickActionContext {
  /** True while combat is active — enables targeting the nearest monster. */
  combatActive: boolean;
  /** Name of the nearest active monster (used as the damage target). */
  nearestMonsterName?: string;
  /**
   * Optional name of the lowest-HP ally (for multi-player heal targeting).
   * If omitted, heals target the actor themselves.
   */
  lowestHpAllyName?: string;
}

const DEFAULT_CTX: QuickActionContext = { combatActive: false };

/**
 * Build a contextual quick-action chat text for an ability click.
 *
 * Examples:
 *   - damage ability in combat (with nearest monster known):
 *       `Я использую «Огненный шар» против Гоблин-воин!`
 *   - damage spell with slot level (circle notation):
 *       `Я кастую «Огненный шар» (круг 3) против Гоблин-воин!`
 *   - heal ability:  `Я использую «Лечение» для лечения себя.`
 *   - buff ability:  `Я использую «Щит» на себя.`
 *   - consumable scroll: `Я читаю свиток «Огненный шар» и кастую заклинание.`
 *   - utility / other: `Я использую «Тёмное зрение».`
 */
export function buildAbilityQuickText(
  a: Ability,
  ctx: QuickActionContext = DEFAULT_CTX
): string {
  const name = a.name;

  // Consumable scrolls always use the "читаю свиток" phrasing, regardless of
  // cast type — they are inventory items consumed on use.
  if (a.source === "scroll" || a.consumable) {
    return `Я читаю свиток «${name}» и кастую заклинание.`;
  }

  // Spellbook spells: use "кастую" phrasing + slot-level (circle) notation
  // for leveled spells. Cantrips omit the circle annotation.
  if (a.source === "spell") {
    const circleSuffix =
      a.slotLevel && a.slotLevel > 0 ? ` (круг ${a.slotLevel})` : "";
    switch (a.castType) {
      case "damage": {
        const target = ctx.combatActive && ctx.nearestMonsterName
          ? ctx.nearestMonsterName
          : "врага";
        return `Я кастую «${name}»${circleSuffix} против ${target}!`;
      }
      case "heal": {
        const target = ctx.lowestHpAllyName ?? "себя";
        return `Я кастую «${name}»${circleSuffix} для лечения ${target}.`;
      }
      case "buff":
        return `Я кастую «${name}»${circleSuffix} на себя.`;
      default:
        return `Я кастую «${name}»${circleSuffix}.`;
    }
  }

  // Non-spell abilities (race / class / talent).
  switch (a.castType) {
    case "damage": {
      const target = ctx.combatActive && ctx.nearestMonsterName
        ? ctx.nearestMonsterName
        : "врага";
      return `Я использую «${name}» против ${target}!`;
    }
    case "heal": {
      const target = ctx.lowestHpAllyName ?? "себя";
      return `Я использую «${name}» для лечения ${target}.`;
    }
    case "buff":
      return `Я использую «${name}» на себя.`;
    default:
      return `Я использую «${name}».`;
  }
}

/**
 * Build a contextual quick-action chat text for an inventory item click.
 *
 * Examples:
 *   - potion:  `Я выпиваю зелье «Лечения».`
 *   - scroll:  `Я читаю свиток «Огненный шар».`
 *   - weapon in combat: `Я переключаюсь на «Железный меч» и атакую!`
 *   - weapon out of combat: `Я переключаюсь на «Железный меч».`
 *   - other:   `Я использую «Факел».`
 */
export function buildItemQuickText(
  item: InventoryItemState,
  ctx: QuickActionContext = DEFAULT_CTX
): string {
  const name = item.itemName;
  // Detect potions by item type OR by name containing "зелье" / "potion".
  const isPotion = item.itemType === "potion" || /зелье|potion/i.test(name);
  // Detect scrolls by item type OR by name starting with "свиток" / "scroll".
  const isScroll = item.itemType === "scroll" || /^свиток|^scroll/i.test(name);
  // Detect weapons by item type OR inferred equip slot.
  const isWeapon = item.itemType === "weapon" || item.equipSlot === "weapon";

  if (isScroll) return `Я читаю свиток «${stripPrefix(name, "свиток")}».`;
  if (isPotion) return `Я выпиваю зелье «${stripPrefix(name, "зелье")}».`;
  if (isWeapon) {
    return ctx.combatActive
      ? `Я переключаюсь на «${name}» и атакую!`
      : `Я переключаюсь на «${name}».`;
  }
  return `Я использую «${name}».`;
}

/** Strip a leading prefix word (e.g. "Свиток огненного шара" → "огненный шар"). */
function stripPrefix(name: string, prefix: string): string {
  const re = new RegExp(`^${prefix}\\s+`, "i");
  return name.replace(re, "");
}

/**
 * Compute the nearest active monster to the given player position.
 * Returns the monster's name, or undefined if there are no active monsters.
 *
 * Used by the parent component to fill QuickActionContext.nearestMonsterName.
 */
export function findNearestMonsterName(
  monsters: { name: string; posX: number; posY: number; isActive: boolean }[],
  fromX: number,
  fromY: number
): string | undefined {
  let best: { name: string; d: number } | null = null;
  for (const m of monsters) {
    if (!m.isActive) continue;
    const d = Math.hypot(m.posX - fromX, m.posY - fromY);
    if (!best || d < best.d) best = { name: m.name, d };
  }
  return best?.name;
}
