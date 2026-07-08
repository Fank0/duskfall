// Crafting system: recipes + craft helpers.
//
// 17 recipes (6 alchemy + 6 forge + 5 enchant). Each recipe specifies a
// crafting station, an ability check (d20 + modifier vs DC), and the
// ingredients consumed on success. On failure:
//   - alchemy: half the ingredients are consumed (volatile reagents).
//   - forge:   no ingredients are consumed (you can re-try).
//   - enchant: the gem/component is consumed but the base item is not.

import type { InventoryItemState, StatKey } from "./types";
import { inferEquipProps } from "./item-props";

export type CraftingStation = "alchemy" | "forge" | "enchant";

export interface RecipeIngredient {
  itemName: string;
  quantity: number;
}

export interface RecipeResult {
  itemName: string;
  itemType: string;
  quantity: number;
  description: string;
  equipSlot?: ReturnType<typeof inferEquipProps>["equipSlot"];
  acBonus?: number;
  statBonus?: Partial<Record<StatKey, number>>;
  damageNotation?: string;
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  station: CraftingStation;
  /** Ability used for the crafting check (drives the modifier). */
  checkAbility: "int" | "str" | "wis";
  checkDC: number;
  ingredients: RecipeIngredient[];
  result: RecipeResult;
}

// ---------- 6 alchemy recipes (potions + scrolls) ----------
const ALCHEMY_RECIPES: Recipe[] = [
  {
    id: "alch_healing_potion",
    name: "Зелье лечения",
    description: "Снадобье, восстанавливающее 2d4+2 HP.",
    station: "alchemy",
    checkAbility: "int",
    checkDC: 10,
    ingredients: [
      { itemName: "Корень мандрагоры", quantity: 1 },
      { itemName: "Чистая вода", quantity: 1 },
    ],
    result: { itemName: "Зелье лечения", itemType: "potion", quantity: 1, description: "Восстанавливает 2d4+2 HP." },
  },
  {
    id: "alch_mana_potion",
    name: "Зелье маны",
    description: "Снадобье, восстанавливающее 1 ячейку заклинания 1-го уровня.",
    station: "alchemy",
    checkAbility: "int",
    checkDC: 12,
    ingredients: [
      { itemName: "Кристалл маны", quantity: 1 },
      { itemName: "Чистая вода", quantity: 1 },
    ],
    result: { itemName: "Зелье маны", itemType: "potion", quantity: 1, description: "Восстанавливает 1 ячейку заклинания 1-го уровня." },
  },
  {
    id: "alch_strength_potion",
    name: "Зелье силы",
    description: "Снадобье, дающее +2 к Силе на 1 час.",
    station: "alchemy",
    checkAbility: "int",
    checkDC: 13,
    ingredients: [
      { itemName: "Кровь тролля", quantity: 1 },
      { itemName: "Корень мандрагоры", quantity: 2 },
    ],
    result: { itemName: "Зелье силы", itemType: "potion", quantity: 1, description: "+2 к Силе на 1 час." },
  },
  {
    id: "alch_fireball_scroll",
    name: "Свиток огненного шара",
    description: "Свиток заклинания: взрыв огня 8d6 (спасбросок ЛОВ — половина).",
    station: "alchemy",
    checkAbility: "int",
    checkDC: 14,
    ingredients: [
      { itemName: "Чернильница мага", quantity: 1 },
      { itemName: "Пыль рубина", quantity: 1 },
      { itemName: "Пергамент", quantity: 1 },
    ],
    result: { itemName: "Свиток огненного шара", itemType: "scroll", quantity: 1, description: "Взрыв огня 20 футов, 8d6 урона (спасбросок ЛОВ — половина). Расходуемый." },
  },
  {
    id: "alch_shield_scroll",
    name: "Свиток щита",
    description: "Свиток заклинания: реакция, +5 AC до конца хода.",
    station: "alchemy",
    checkAbility: "int",
    checkDC: 12,
    ingredients: [
      { itemName: "Чернильница мага", quantity: 1 },
      { itemName: "Пергамент", quantity: 1 },
    ],
    result: { itemName: "Свиток щита", itemType: "scroll", quantity: 1, description: "Реакция: +5 к AC до конца хода. Расходуемый." },
  },
  {
    id: "alch_antidote",
    name: "Противоядие",
    description: "Снадобье, снимающее отравление.",
    station: "alchemy",
    checkAbility: "int",
    checkDC: 10,
    ingredients: [
      { itemName: "Корень мандрагоры", quantity: 1 },
      { itemName: "Серебряная пыль", quantity: 1 },
    ],
    result: { itemName: "Противоядие", itemType: "potion", quantity: 1, description: "Снимает состояние «Отравлен»." },
  },
];

// ---------- 6 forge recipes (weapons + armor + shield) ----------
const FORGE_RECIPES: Recipe[] = [
  {
    id: "forge_iron_sword",
    name: "Железный меч",
    description: "Надёжный клинок: 1d8+3 урона.",
    station: "forge",
    checkAbility: "str",
    checkDC: 12,
    ingredients: [
      { itemName: "Железный слиток", quantity: 2 },
      { itemName: "Деревянная рукоять", quantity: 1 },
    ],
    result: { itemName: "Железный меч", itemType: "weapon", quantity: 1, description: "1d8+3 урона." },
  },
  {
    id: "forge_steel_dagger",
    name: "Стальной кинжал",
    description: "Лёгкий клинок: 1d4+2 урона.",
    station: "forge",
    checkAbility: "str",
    checkDC: 11,
    ingredients: [
      { itemName: "Стальной слиток", quantity: 1 },
      { itemName: "Кожаная обмотка", quantity: 1 },
    ],
    result: { itemName: "Стальной кинжал", itemType: "weapon", quantity: 1, description: "1d4+2 урона." },
  },
  {
    id: "forge_leather_armor",
    name: "Кожаная броня",
    description: "Лёгкая защита: +2 AC.",
    station: "forge",
    checkAbility: "str",
    checkDC: 11,
    ingredients: [
      { itemName: "Кожа", quantity: 3 },
      { itemName: "Кожаная обмотка", quantity: 1 },
    ],
    result: { itemName: "Кожаная броня", itemType: "armor", quantity: 1, description: "+2 к Классу Доспеха." },
  },
  {
    id: "forge_iron_helm",
    name: "Железный шлем",
    description: "Защита головы: +1 AC.",
    station: "forge",
    checkAbility: "str",
    checkDC: 12,
    ingredients: [
      { itemName: "Железный слиток", quantity: 1 },
      { itemName: "Кожаная обмотка", quantity: 1 },
    ],
    result: { itemName: "Железный шлем", itemType: "armor", quantity: 1, description: "+1 к Классу Доспеха." },
  },
  {
    id: "forge_iron_shield",
    name: "Железный щит",
    description: "Надёжная защита: +2 AC.",
    station: "forge",
    checkAbility: "str",
    checkDC: 12,
    ingredients: [
      { itemName: "Железный слиток", quantity: 2 },
      { itemName: "Деревянная доска", quantity: 1 },
    ],
    result: { itemName: "Железный щит", itemType: "armor", quantity: 1, description: "+2 к Классу Доспеха." },
  },
  {
    id: "forge_chainmail",
    name: "Кольчуга",
    description: "Тяжёлая броня: +4 AC (запрещена магам).",
    station: "forge",
    checkAbility: "str",
    checkDC: 15,
    ingredients: [
      { itemName: "Железный слиток", quantity: 4 },
      { itemName: "Кожа", quantity: 1 },
    ],
    result: { itemName: "Кольчуга", itemType: "armor", quantity: 1, description: "+4 к Классу Доспеха. Тяжёлая броня." },
  },
];

// ---------- 5 enchant recipes (rings, amulets, magic items) ----------
const ENCHANT_RECIPES: Recipe[] = [
  {
    id: "ench_ring_protection",
    name: "Кольцо защиты",
    description: "Кольцо: +1 AC.",
    station: "enchant",
    checkAbility: "wis",
    checkDC: 13,
    ingredients: [
      { itemName: "Серебряное кольцо", quantity: 1 },
      { itemName: "Пыль рубина", quantity: 1 },
    ],
    result: { itemName: "Кольцо защиты", itemType: "accessory", quantity: 1, description: "+1 к Классу Доспеха." },
  },
  {
    id: "ench_amulet_health",
    name: "Амулет здоровья",
    description: "Амулет: +2 к Телосложению.",
    station: "enchant",
    checkAbility: "wis",
    checkDC: 14,
    ingredients: [
      { itemName: "Серебряная цепочка", quantity: 1 },
      { itemName: "Кровь тролля", quantity: 1 },
    ],
    result: { itemName: "Амулет здоровья", itemType: "accessory", quantity: 1, description: "+2 к Телосложению." },
  },
  {
    id: "ench_ring_strength",
    name: "Кольцо силы",
    description: "Кольцо: +2 к Силе.",
    station: "enchant",
    checkAbility: "wis",
    checkDC: 14,
    ingredients: [
      { itemName: "Серебряное кольцо", quantity: 1 },
      { itemName: "Кровь тролля", quantity: 1 },
    ],
    result: { itemName: "Кольцо силы", itemType: "accessory", quantity: 1, description: "+2 к Силе." },
  },
  {
    id: "ench_amulet_wisdom",
    name: "Амулет мудрости",
    description: "Амулет: +2 к Мудрости.",
    station: "enchant",
    checkAbility: "wis",
    checkDC: 14,
    ingredients: [
      { itemName: "Серебряная цепочка", quantity: 1 },
      { itemName: "Кристалл маны", quantity: 1 },
    ],
    result: { itemName: "Амулет мудрости", itemType: "accessory", quantity: 1, description: "+2 к Мудрости." },
  },
  {
    id: "ench_cloak_elusion",
    name: "Плащ увертливости",
    description: "Плащ: +1 AC.",
    station: "enchant",
    checkAbility: "wis",
    checkDC: 13,
    ingredients: [
      { itemName: "Кошачий ус", quantity: 2 },
      { itemName: "Серебряная пыль", quantity: 1 },
    ],
    result: { itemName: "Плащ увертливости", itemType: "accessory", quantity: 1, description: "+1 к Классу Доспеха." },
  },
];

/** All 17 crafting recipes. */
export const RECIPES: Recipe[] = [...ALCHEMY_RECIPES, ...FORGE_RECIPES, ...ENCHANT_RECIPES];

/** Lookup a recipe by id. */
export function getRecipe(recipeId: string): Recipe | null {
  return RECIPES.find((r) => r.id === recipeId) ?? null;
}

/** Recipes for a given station. */
export function recipesForStation(station: CraftingStation): Recipe[] {
  return RECIPES.filter((r) => r.station === station);
}

/** True if the inventory has at least the required quantity of each ingredient. */
export function hasIngredients(inventory: InventoryItemState[], ingredients: RecipeIngredient[]): boolean {
  for (const ing of ingredients) {
    const have = inventory
      .filter((it) => it.itemName === ing.itemName)
      .reduce((sum, it) => sum + it.quantity, 0);
    if (have < ing.quantity) return false;
  }
  return true;
}

/** True if the room has the station the recipe requires. */
export function roomHasStation(
  roomStations: { hasAlchemy: boolean; hasForge: boolean; hasEnchant: boolean },
  station: CraftingStation
): boolean {
  if (station === "alchemy") return roomStations.hasAlchemy;
  if (station === "forge") return roomStations.hasForge;
  return roomStations.hasEnchant;
}

/** True if the player can craft the recipe: station present + ingredients available. */
export function canCraft(
  player: { charClass: string },
  inventory: InventoryItemState[],
  roomStations: { hasAlchemy: boolean; hasForge: boolean; hasEnchant: boolean },
  recipeId: string
): boolean {
  void player; // currently no class restrictions on crafting
  const recipe = getRecipe(recipeId);
  if (!recipe) return false;
  if (!roomHasStation(roomStations, recipe.station)) return false;
  return hasIngredients(inventory, recipe.ingredients);
}

/** Status of each ingredient for a recipe (have vs need) — for UI rendering. */
export function ingredientStatus(
  inventory: InventoryItemState[],
  ingredients: RecipeIngredient[]
): { name: string; need: number; have: number; ok: boolean }[] {
  return ingredients.map((ing) => {
    const have = inventory
      .filter((it) => it.itemName === ing.itemName)
      .reduce((sum, it) => sum + it.quantity, 0);
    return { name: ing.itemName, need: ing.quantity, have, ok: have >= ing.quantity };
  });
}

/** Build the result item (with inferred equip props) to add to inventory. */
export function buildResultItem(recipe: Recipe): {
  itemName: string;
  itemType: string;
  quantity: number;
  description: string;
  equipSlot: ReturnType<typeof inferEquipProps>["equipSlot"];
  acBonus: number;
  statBonus: Partial<Record<StatKey, number>>;
  damageNotation: string;
} {
  const base = recipe.result;
  const inferred = inferEquipProps(base.itemName, base.itemType, base.description);
  return {
    itemName: base.itemName,
    itemType: base.itemType,
    quantity: base.quantity,
    description: base.description,
    equipSlot: base.equipSlot ?? inferred.equipSlot,
    acBonus: base.acBonus ?? inferred.acBonus,
    statBonus: base.statBonus ?? inferred.statBonus,
    damageNotation: base.damageNotation ?? inferred.damageNotation,
  };
}

/** Decide how many of each ingredient to consume on a craft attempt.
 *  - alchemy: half the ingredients (rounded up) are consumed on failure.
 *  - forge:   none consumed on failure.
 *  - enchant: ingredients are consumed regardless (the magic is spent). */
export function ingredientConsumptionOnFailure(
  station: CraftingStation,
  ingredients: RecipeIngredient[]
): RecipeIngredient[] {
  if (station === "alchemy") {
    return ingredients.map((ing) => ({ ...ing, quantity: Math.ceil(ing.quantity / 2) }));
  }
  if (station === "enchant") {
    return ingredients.map((ing) => ({ ...ing }));
  }
  // forge
  return [];
}

/** Russian label for a station. */
export function stationLabelRu(station: CraftingStation): string {
  if (station === "alchemy") return "Алхимия";
  if (station === "forge") return "Кузница";
  return "Зачарование";
}

/** Russian label for an ability. */
export function abilityLabelRu(ability: "int" | "str" | "wis"): string {
  if (ability === "int") return "ИНТ";
  if (ability === "str") return "СИЛ";
  return "МУД";
}

// ===== D&D 5e Crafting Combos (V2 B5): item + item = new item =====
export const CRAFTING_COMBOS: { id: string; input1: string; input2: string; output: string; outputDesc: string }[] = [
  { id: "combo_poison_weapon", input1: "Зелье лечения", input2: "Кинжал", output: "Отравленный кинжал", outputDesc: "Кинжал с ядовитым покрытием (+1d4 яда на 3 атаки)." },
  { id: "combo_fire_arrow", input1: "Факел", input2: "Стрела", output: "Огненная стрела", outputDesc: "Стрела с огненным наконечником (+1d4 огня при попадании)." },
  { id: "combo_holy_water", input1: "Святое масло", input2: "Фляга", output: "Святая вода", outputDesc: "Наносит 2d6 урона нежити при попадании." },
  { id: "combo_smoke_bomb", input1: "Масляная бомба", input2: "Факел", output: "Дымовая бомба", outputDesc: "Создаёт облако дыма (затрудняет видимость на 3 клетки)." },
];

export function findCraftingCombo(item1: string, item2: string) {
  return CRAFTING_COMBOS.find(
    (c) => (c.input1 === item1 && c.input2 === item2) || (c.input1 === item2 && c.input2 === item1)
  );
}
