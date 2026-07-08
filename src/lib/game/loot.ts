// Loot table system for DUSKFALL.
//
// When a monster dies, roll on a tiered loot table to determine what it drops.
// The tier is derived from the monster's maxHp (proxy for CR):
//   - weak (maxHp ≤ 8):     1d4 gold, 25% chance of a mundane item
//   - normal (maxHp ≤ 13):  1d6+1 gold, 40% chance of a mundane/consumable item
//   - elite (maxHp ≤ 20):   2d6 gold, 60% chance of a consumable/scroll
//   - boss (maxHp > 20):    3d6+5 gold, 80% chance of a scroll/gear, +rare roll
//
// All rolls use the dice engine (fair RNG). Drops are persisted to the LootDrop
// model + applied to the killer's inventory/gold. A system chat message announces
// the drop for narrative flavor.

import { rollDice } from "./dice";
import type { InventoryChange } from "./types";

export type LootTier = "weak" | "normal" | "elite" | "boss";

export interface LootItem {
  name: string;
  type: string;        // weapon | armor | potion | scroll | key | misc
  description: string;
}

export interface LootRollResult {
  tier: LootTier;
  gold: number;
  items: LootItem[];
  /** A short Russian narrative line for the chat (e.g. "С тела разбойника выпадает 5 золота и зелье лечения."). */
  narrative: string;
  /** Inventory-change entries compatible with applyInventoryChanges (for the killer). */
  inventoryChanges: InventoryChange[];
}

/** Determine the loot tier from a monster's maxHp. */
export function lootTierFor(maxHp: number): LootTier {
  if (maxHp <= 8) return "weak";
  if (maxHp <= 13) return "normal";
  if (maxHp <= 20) return "elite";
  return "boss";
}

// ---------- Item pools (D&D 5e / dark-fantasy flavored, Russian) ----------

const MUNDANE_ITEMS: LootItem[] = [
  { name: "Ржавый кинжал", type: "weapon", description: "Старый кинжал с зазубренным лезвием. Урон 1d4." },
  { name: "Кожаный поясной кошель", type: "misc", description: "Пустой кошель — но кожа ещё крепкая." },
  { name: "Кремень и огниво", type: "misc", description: "Для разведения огня в сырую погоду." },
  { name: "Сухой паёк", type: "misc", description: "Черствый хлеб и вяленое мясо. Утоляет голод." },
  { name: "Грязный платок", type: "misc", description: "Запахнет потом и кровью — но скроет лицо." },
  { name: "Кость-амулет", type: "misc", description: "Грубый амулет из костей мелких зверей." },
  { name: "Потёртая фляга", type: "misc", description: "Внутри — кислая вода. Лучше, чем ничего." },
  { name: "Связка отмычек", type: "key", description: "Тонкие металлические отмычки. +1 к проверкам Воровства." },
];

const CONSUMABLE_ITEMS: LootItem[] = [
  { name: "Зелье лечения", type: "potion", description: "Восстанавливает 2d4+2 HP." },
  { name: "Зелье ловкости", type: "potion", description: "+2 к ЛОВ на 1 час." },
  { name: "Факел", type: "misc", description: "Горит 1 час, освещает 20 футов." },
  { name: "Связка факелов", type: "misc", description: "5 факелов в холщовой обёртке." },
  { name: "Масляная бомба", type: "potion", description: "Бросок: 1d4 урона огнём в радиусе 5 футов." },
  { name: "Святое масло", type: "potion", description: "Покрытие оружия: +1d4 урона нежити 1 мин." },
  { name: "Антидот", type: "potion", description: "Снимает отравление и даёт преимущество на спасброски от яда 1 час." },
];

const SCROLL_ITEMS: LootItem[] = [
  { name: "Свиток магической стрелы", type: "scroll", description: "Расходуемое заклинание: 3d4+3 урона силой." },
  { name: "Свиток огненного шара", type: "scroll", description: "Расходуемое заклинание: 8d6 урона огнём в радиусе." },
  { name: "Свиток щита", type: "scroll", description: "Расходуемое заклинание: +5 к AC до начала следующего хода." },
  { name: "Свиток лечения", type: "scroll", description: "Расходуемое заклинание: 1d8+3 лечения." },
  { name: "Свиток тьмы", type: "scroll", description: "Расходуемое заклинание: создаёт облако магической тьмы." },
  { name: "Свиток молнии", type: "scroll", description: "Расходуемое заклинание: 8d6 урона электричеством." },
];

const GEAR_ITEMS: LootItem[] = [
  { name: "Кожаный доспех", type: "armor", description: "Лёгкая броня. AC +1 (базовый AC 11 + мод ЛОВ)." },
  { name: "Кольчужная рубаха", type: "armor", description: "Средняя броня. AC 14." },
  { name: "Деревянный щит", type: "armor", description: "+2 к Классу Доспеха." },
  { name: "Стальной шлем", type: "armor", description: "+1 к AC; защита от критических ударов по голове." },
  { name: "Короткий меч", type: "weapon", description: "Лёгкое оружие. Урон 1d6." },
  { name: "Длинный лук", type: "weapon", description: "Дальнобойное оружие. Урон 1d8, дальность 150 футов." },
  { name: "Боевой молот", type: "weapon", description: "Дробящее оружие. Урон 1d8 (1d10 двуручно)." },
  { name: "Кольцо защиты", type: "armor", description: "+1 к AC и спасброскам. Тускло мерцает." },
];

const RARE_ITEMS: LootItem[] = [
  { name: "Амулет здоровья", type: "armor", description: "+2 к ТЕЛ. Гладкий камень тёплый на ощупь." },
  { name: "Кольцо вампира", type: "armor", description: "Лечит носителя на 25% от нанесённого урона." },
  { name: "Перчатки великаньей силы", type: "armor", description: "+2 к СИЛ. Тяжесть в руках напоминает гору." },
  { name: "Плащ теней", type: "armor", description: "+1 к AC; преимущество на Скрытность в темноте." },
  { name: "Огненный жезл", type: "weapon", description: "Метает огненный сгусток: 1d10 урона огнём. 3 заряда." },
  { name: "Чёрный клинок", type: "weapon", description: "+1 к атаке и урону. Жаждет крови нежити." },
];

/** Pick a random item from a pool (deterministic given the RNG state). */
function pick<T>(pool: T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Roll on the loot table for a dead monster. Returns gold + items + narrative. */
export function rollLoot(maxHp: number, monsterName: string, killerName: string): LootRollResult {
  const tier = lootTierFor(maxHp);
  const items: LootItem[] = [];
  const inventoryChanges: InventoryChange[] = [];
  let gold = 0;
  const lines: string[] = [];

  // --- Gold roll ---
  let goldNotation: string;
  switch (tier) {
    case "weak":   goldNotation = "1d4"; break;
    case "normal": goldNotation = "1d6+1"; break;
    case "elite":  goldNotation = "2d6"; break;
    case "boss":   goldNotation = "3d6+5"; break;
  }
  const goldRoll = rollDice(goldNotation);
  gold = goldRoll.total;
  if (gold > 0) {
    lines.push(`${gold} золота`);
  }

  // --- Item roll chance + pool by tier ---
  let itemChance = 0;
  let pool: LootItem[] = [];
  let rareRoll = false;
  switch (tier) {
    case "weak":
      itemChance = 0.25;
      pool = MUNDANE_ITEMS;
      break;
    case "normal":
      itemChance = 0.40;
      pool = [...MUNDANE_ITEMS, ...CONSUMABLE_ITEMS];
      break;
    case "elite":
      itemChance = 0.60;
      pool = [...CONSUMABLE_ITEMS, ...SCROLL_ITEMS, ...GEAR_ITEMS];
      break;
    case "boss":
      itemChance = 0.80;
      pool = [...SCROLL_ITEMS, ...GEAR_ITEMS];
      rareRoll = true; // bosses also roll on the rare table
      break;
  }

  if (Math.random() < itemChance) {
    const item = pick(pool);
    items.push(item);
    inventoryChanges.push({ action: "add", item: item.name, type: item.type, description: item.description });
    lines.push(`${item.name}`);
  }

  // --- Rare item roll (bosses only, 25%) ---
  if (rareRoll && Math.random() < 0.25) {
    const rare = pick(RARE_ITEMS);
    items.push(rare);
    inventoryChanges.push({ action: "add", item: rare.name, type: rare.type, description: rare.description });
    lines.push(`редкая находка: ${rare.name}`);
  }

  // --- Build narrative ---
  let narrative: string;
  if (lines.length === 0) {
    narrative = `С тела ${monsterName} ${killerName} ничего ценного не находит.`;
  } else {
    const list = lines.length === 1 ? lines[0] : lines.slice(0, -1).join(", ") + " и " + lines[lines.length - 1];
    narrative = `${killerName} обыскивает тело ${monsterName} и находит: ${list}.`;
  }

  return { tier, gold, items, narrative, inventoryChanges };
}

/** Russian label for a loot tier (for UI badges). */
export function tierLabel(tier: LootTier): string {
  switch (tier) {
    case "weak":   return "слабый";
    case "normal": return "обычный";
    case "elite":  return "элитный";
    case "boss":   return "босс";
  }
}
