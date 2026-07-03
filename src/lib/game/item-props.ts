// Equipment-slot inference for inventory items.
// Maps an item's name + type to an equip slot, AC bonus, stat bonuses, and
// damage notation. Also defines classes that can't equip heavy armor.

import type { EquipmentSlot, StatKey } from "./types";

/** Classes that cannot equip heavy armor (D&D 5e SRD). */
export const NO_HEAVY_ARMOR_CLASSES: ReadonlySet<string> = new Set([
  "Wizard",
  "Sorcerer",
  "Warlock",
]);

/** Heavy armor name keywords (chest-slot items that exclude casters). */
export const HEAVY_ARMOR_KEYWORDS: string[] = [
  "Кольчуга",
  "Латы",
  "Латные",
  "Латный",
  "Бригантина",
  "Полные латы",
  "Чешуйчатый доспех",
  "Чешуйчатая броня",
];

/** Medium armor name keywords (chest-slot, no class restriction). */
export const MEDIUM_ARMOR_KEYWORDS: string[] = [
  "Кираса",
  "Полулаты",
  "Кольчужная рубаха",
  "Кольчужный нагрудник",
  "Шкурный доспех",
  "Звериный доспех",
];

/** Light armor name keywords (chest-slot, no class restriction). */
export const LIGHT_ARMOR_KEYWORDS: string[] = [
  "Кожаная броня",
  "Кожаный доспех",
  "Дублёная кожа",
  "Проклёпанная кожа",
  "Плетёная кожа",
];

export interface InferredEquipProps {
  equipSlot: EquipmentSlot | null;
  acBonus: number;
  statBonus: Partial<Record<StatKey, number>>;
  damageNotation: string;
  /** True if the item is heavy armor (restricted for casters). */
  isHeavyArmor: boolean;
}

/** Stat keyword → stat key. Used to infer accessory bonuses from names. */
const STAT_KEYWORDS: { stat: StatKey; words: string[] }[] = [
  { stat: "str", words: ["силы", "мощи", "сил", "могущества"] },
  { stat: "dex", words: ["ловкости", "тени", "вор", "воровства"] },
  { stat: "con", words: ["телосложения", "здоровья", "выносливости", "жизни"] },
  { stat: "int", words: ["интеллекта", "магии", "мага", "разума", "учёности"] },
  { stat: "wis", words: ["мудрости", "духовности", "прозрения", "мудреца"] },
  { stat: "cha", words: ["харизмы", "власти", "обаяния", "артиста"] },
];

const WEAPON_KEYWORDS: string[] = [
  "Меч", "Топор", "Кинжал", "Лук", "Арбалет", "Посох", "Булава", "Рапира",
  "Копьё", "Копье", "Секира", "Молот", "Клевец", "Цеп", "Алебарда", "Глефа",
  "Кастет", "Клинок", "Жезл", "Палица", "Стрела",
];

const SHIELD_KEYWORDS: string[] = ["Щит", "баклер", "Баклер"];
const HEAD_KEYWORDS: string[] = ["Шлем", "Капюшон", "Диадема", "Корона", "Венец", "Тиара", "Кокон"];
const LEGS_KEYWORDS: string[] = ["Поножи", "Штаны", "Сапоги", "Башмаки", "Набедренники"];
const HANDS_KEYWORDS: string[] = ["Перчатки", "Рукавицы", "Наручи", "Наруч", "Перчатка"];
const ACCESSORY_KEYWORDS: string[] = ["Кольцо", "Амулет", "Плащ", "Пояс", "Кушак", "Ожерелье", "Талисман"];

/** Default damage notation per weapon name keyword. */
const DEFAULT_WEAPON_DAMAGE: { words: string[]; notation: string }[] = [
  { words: ["Длинный меч", "Меч"], notation: "1d8+3" },
  { words: ["Короткий меч"], notation: "1d6+2" },
  { words: ["Боевой топор", "Топор"], notation: "1d8+3" },
  { words: ["Кинжал", "Кинжалы"], notation: "1d4+2" },
  { words: ["Короткий лук"], notation: "1d6+2" },
  { words: ["Длинный лук", "Лук"], notation: "1d8+2" },
  { words: ["Арбалет"], notation: "1d8+2" },
  { words: ["Посох"], notation: "1d6+1" },
  { words: ["Булава", "Палица"], notation: "1d6+2" },
  { words: ["Рапира"], notation: "1d8+2" },
  { words: ["Копьё", "Копье"], notation: "1d6+2" },
  { words: ["Секира"], notation: "1d10+3" },
  { words: ["Молот"], notation: "1d8+2" },
  { words: ["Клевец"], notation: "1d6+2" },
  { words: ["Цеп"], notation: "1d6+2" },
  { words: ["Кастет"], notation: "1d4+1" },
  { words: ["Клинок"], notation: "1d8+2" },
  { words: ["Жезл"], notation: "1d6+1" },
];

/** Parse a "+N к Классу Доспеха" / "+N AC" pattern from a description. */
function parseACFromDescription(description: string): number {
  if (!description) return 0;
  const patterns = [
    /\+\s*(\d+)\s*к\s*Классу\s*Доспеха/i,
    /\+\s*(\d+)\s*AC/i,
    /\+\s*(\d+)\s*к\s*AC/i,
    /\+\s*(\d+)\s*к\s*брони/i,
  ];
  for (const re of patterns) {
    const m = description.match(re);
    if (m) return Math.max(0, parseInt(m[1], 10) || 0);
  }
  return 0;
}

/** Parse stat bonuses from a description (e.g. "+2 к Силе"). */
function parseStatBonusesFromDescription(description: string): Partial<Record<StatKey, number>> {
  const out: Partial<Record<StatKey, number>> = {};
  if (!description) return out;
  const STAT_RU: { stat: StatKey; words: string[] }[] = [
    { stat: "str", words: ["Сил", "СИЛ"] },
    { stat: "dex", words: ["Лов", "ЛОВ"] },
    { stat: "con", words: ["Тел", "ТЕЛ"] },
    { stat: "int", words: ["Инт", "ИНТ"] },
    { stat: "wis", words: ["Муд", "МУД"] },
    { stat: "cha", words: ["Хар", "ХАР"] },
  ];
  for (const { stat, words } of STAT_RU) {
    for (const w of words) {
      const re = new RegExp(`\\+\\s*(\\d+)\\s*к\\s*${w}`, "i");
      const m = description.match(re);
      if (m) {
        const v = parseInt(m[1], 10) || 0;
        if (v > 0) out[stat] = (out[stat] ?? 0) + v;
      }
    }
  }
  return out;
}

/** Infer the equipment slot and bonuses for an item from its name/type/description. */
export function inferEquipProps(
  itemName: string,
  itemType: string,
  description: string = ""
): InferredEquipProps {
  const name = itemName || "";
  const type = (itemType || "misc").toLowerCase();
  const desc = description || "";

  let equipSlot: EquipmentSlot | null = null;
  let acBonus = 0;
  let statBonus: Partial<Record<StatKey, number>> = {};
  let damageNotation = "";
  let isHeavyArmor = false;

  // Weapons (itemType=weapon or name contains a weapon keyword).
  if (type === "weapon" || WEAPON_KEYWORDS.some((k) => name.includes(k))) {
    equipSlot = "weapon";
    // Pick a default damage notation from name.
    for (const { words, notation } of DEFAULT_WEAPON_DAMAGE) {
      if (words.some((w) => name.includes(w))) {
        damageNotation = notation;
        break;
      }
    }
    if (!damageNotation) damageNotation = "1d6+2";
  }
  // Shields.
  else if (type === "shield" || SHIELD_KEYWORDS.some((k) => name.includes(k))) {
    equipSlot = "shield";
    acBonus = parseACFromDescription(desc) || 2; // default +2
  }
  // Head slot.
  else if (HEAD_KEYWORDS.some((k) => name.includes(k))) {
    equipSlot = "head";
    acBonus = parseACFromDescription(desc) || 1;
  }
  // Chest slot (armor).
  else if (
    type === "armor" ||
    LIGHT_ARMOR_KEYWORDS.some((k) => name.includes(k)) ||
    MEDIUM_ARMOR_KEYWORDS.some((k) => name.includes(k)) ||
    HEAVY_ARMOR_KEYWORDS.some((k) => name.includes(k)) ||
    /броня|доспех/i.test(name)
  ) {
    equipSlot = "chest";
    if (HEAVY_ARMOR_KEYWORDS.some((k) => name.includes(k))) {
      isHeavyArmor = true;
      acBonus = parseACFromDescription(desc) || 4;
    } else if (MEDIUM_ARMOR_KEYWORDS.some((k) => name.includes(k))) {
      acBonus = parseACFromDescription(desc) || 3;
    } else {
      // Light armor default.
      acBonus = parseACFromDescription(desc) || 2;
    }
  }
  // Legs slot.
  else if (LEGS_KEYWORDS.some((k) => name.includes(k))) {
    equipSlot = "legs";
    acBonus = parseACFromDescription(desc) || 0;
    // Boots give +dex
    if (/сапоги|башмаки/i.test(name)) statBonus.dex = (statBonus.dex ?? 0) + 1;
  }
  // Hands slot.
  else if (HANDS_KEYWORDS.some((k) => name.includes(k))) {
    equipSlot = "hands";
    acBonus = parseACFromDescription(desc) || 0;
  }
  // Accessories.
  else if (ACCESSORY_KEYWORDS.some((k) => name.includes(k))) {
    equipSlot = "accessory";
    // Try to infer stat bonus from name keywords.
    for (const { stat, words } of STAT_KEYWORDS) {
      for (const w of words) {
        if (name.toLowerCase().includes(w)) {
          statBonus[stat] = (statBonus[stat] ?? 0) + 1;
        }
      }
    }
    // Cloak → +1 AC.
    if (/плащ/i.test(name)) acBonus = parseACFromDescription(desc) || 1;
    // Amulet → +1 to a stat if not already inferred.
    if (/амулет|ожерелье|талисман/i.test(name) && Object.keys(statBonus).length === 0) {
      statBonus.con = (statBonus.con ?? 0) + 1;
    }
    // Ring → +1 to a stat if not already inferred.
    if (/кольцо/i.test(name) && Object.keys(statBonus).length === 0) {
      statBonus.str = (statBonus.str ?? 0) + 1;
    }
  }

  // Merge in any stat bonuses found in the description (always — even for armor).
  const descStats = parseStatBonusesFromDescription(desc);
  for (const [k, v] of Object.entries(descStats) as [StatKey, number][]) {
    statBonus[k] = (statBonus[k] ?? 0) + v;
  }

  return { equipSlot, acBonus, statBonus, damageNotation, isHeavyArmor };
}

/** True if the given character class cannot equip the named item (heavy armor). */
export function canEquip(itemName: string, charClass: string): boolean {
  const props = inferEquipProps(itemName, "armor", "");
  if (props.equipSlot !== "chest") return true;
  if (!props.isHeavyArmor) return true;
  return !NO_HEAVY_ARMOR_CLASSES.has(charClass);
}

/** Compute the AC breakdown for a player with their equipped items. */
export function computeACBreakdown(
  baseAC: number,
  dexScore: number,
  equippedItems: {
    slot: EquipmentSlot;
    name: string;
    acBonus: number;
  }[]
): { total: number; base: number; dexBonus: number; armor: number; shield: number; other: number } {
  // DEX modifier (capped at +2 for medium/heavy armor — simplified).
  const dexMod = Math.floor((dexScore - 10) / 2);
  // Find chest armor; if medium or heavy, cap dex bonus.
  const chest = equippedItems.find((it) => it.slot === "chest");
  let effectiveDexBonus = dexMod;
  if (chest) {
    const props = inferEquipProps(chest.name, "armor", "");
    if (props.isHeavyArmor) effectiveDexBonus = 0;
    else if (props.acBonus >= 3) effectiveDexBonus = Math.min(2, dexMod);
  }
  const armor = chest?.acBonus ?? 0;
  const shield = equippedItems.find((it) => it.slot === "shield")?.acBonus ?? 0;
  const other = equippedItems
    .filter((it) => it.slot !== "chest" && it.slot !== "shield")
    .reduce((sum, it) => sum + it.acBonus, 0);
  // Use base AC formula: 10 + dex + armor + shield + other; OR override base AC if armor is worn.
  // We use a hybrid: if armor is worn, recompute from 10 + dex + armor + shield + other.
  // Otherwise use the player's base AC + dex (already factored in) + shield + other.
  const total = chest
    ? 10 + effectiveDexBonus + armor + shield + other
    : Math.max(baseAC, 10 + dexMod) + shield + other;
  return { total, base: baseAC, dexBonus: effectiveDexBonus, armor, shield, other };
}
