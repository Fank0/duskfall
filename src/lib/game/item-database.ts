// Comprehensive item database for DUSKFALL.
//
// 108 entries organized by rarity:
//   Common (45), Uncommon (30), Rare (20), Very Rare (8), Legendary (5).
// Each entry has Russian primary name + English secondary name, balanced
// d20 fantasy RPG values (gold-piece value, weight, AC bonus, stat bonuses, damage
// notation, enchantment type, charges).
//
// Includes set items: the three dragon-scale pieces form the "Драконья
// чешуя" set — collecting all three grants +2 AC bonus (per atmosphere rules).
// Includes artifact weapons with curses (Sword of Kas, Hand of Vecna,
// Orb of Dragonkind, Book of Vile Darkness, Blackrazor).
//
// Helpers:
//   - getItemsByRarity(rarity)
//   - getItemsByType(type)
//   - getItemById(id)
//   - findItemByName(name)   (case-insensitive RU/EN match)
//   - rarityColor(rarity)    (Tailwind badge/ring/dot/text classes)
//   - rarityLabelRu(rarity)
//   - getSetItems(setId)
//   - countSetPiecesOwned(setId, ownedItemNames)
//   - getSetActiveBonuses(setId, ownedItemNames)
//   - randomItemByRarity(rarity)
//   - generateLoot(partyLevel, rarityBias?)
//   - itemEntryToInventoryChange(entry)

import type { InventoryChange } from "./types";

export type ItemRarity =
  | "common"
  | "uncommon"
  | "rare"
  | "veryrare"
  | "legendary";

export type ItemType =
  | "weapon"
  | "armor"
  | "shield"
  | "potion"
  | "scroll"
  | "ring"
  | "amulet"
  | "cloak"
  | "misc"
  | "key"
  | "material";

export interface ItemEntry {
  id: string;
  /** Russian name (primary). */
  name: string;
  /** English name (secondary). */
  nameEn: string;
  type: ItemType;
  rarity: ItemRarity;
  equipSlot?: "weapon" | "shield" | "head" | "chest" | "legs" | "hands" | "accessory";
  acBonus?: number;
  statBonus?: {
    str?: number;
    dex?: number;
    con?: number;
    int?: number;
    wis?: number;
    cha?: number;
  };
  damageNotation?: string;
  description: string;
  /** Gold-piece value (1 = 1 gp). */
  value: number;
  /** Weight in pounds. */
  weight: number;
  enchantment?: "fire" | "ice" | "lightning" | "poison" | "necrotic" | "holy";
  /** Number of charges (for staves / rings with daily powers). */
  charges?: number;
  /** Optional set id (e.g. "dragon_scale") — owning all pieces grants a bonus. */
  setId?: string;
  /** Optional curse text — for legendary artifacts. Rendered in red. */
  curse?: string;
  /** D&D 5e: requires attunement (short-rest ritual to bond; max 3 attuned items per character). */
  requiresAttunement?: boolean;
}

// ============================================================
// COMMON (45) — everyday gear, weapons, light armor, potions, adventuring supplies.
// ============================================================
const COMMON_ITEMS: ItemEntry[] = [
  // --- Weapons (15) ---
  { id: "iron_sword", name: "Железный меч", nameEn: "Iron Sword", type: "weapon", rarity: "common", equipSlot: "weapon", damageNotation: "1d8+3", description: "Надёжный клинок. 1d8+3 рубящего урона.", value: 15, weight: 3 },
  { id: "dagger", name: "Кинжал", nameEn: "Dagger", type: "weapon", rarity: "common", equipSlot: "weapon", damageNotation: "1d4+1", description: "Лёгкий клинок для ближнего боя или метания. 1d4+1 урона.", value: 2, weight: 1 },
  { id: "shortbow", name: "Короткий лук", nameEn: "Shortbow", type: "weapon", rarity: "common", equipSlot: "weapon", damageNotation: "1d6+1", description: "Простой лук для стрельбы на 80 футов. 1d6+1 колющего урона.", value: 25, weight: 2 },
  { id: "longbow", name: "Длинный лук", nameEn: "Longbow", type: "weapon", rarity: "common", equipSlot: "weapon", damageNotation: "1d8+1", description: "Дальнобойный лук. 1d8+1 колющего урона, дальность 150 футов.", value: 50, weight: 2 },
  { id: "crossbow", name: "Лёгкий арбалет", nameEn: "Light Crossbow", type: "weapon", rarity: "common", equipSlot: "weapon", damageNotation: "1d8+1", description: "Арбалет с тетивой. 1d8+1 колющего урона.", value: 25, weight: 5 },
  { id: "battle_axe", name: "Боевой топор", nameEn: "Battle Axe", type: "weapon", rarity: "common", equipSlot: "weapon", damageNotation: "1d8+3", description: "Тяжёлый топор. 1d8+3 рубящего урона.", value: 10, weight: 4 },
  { id: "warhammer", name: "Молот войны", nameEn: "Warhammer", type: "weapon", rarity: "common", equipSlot: "weapon", damageNotation: "1d8+2", description: "Молот с железным набалдашником. 1d8+2 дробящего урона.", value: 15, weight: 2 },
  { id: "mace", name: "Булава", nameEn: "Mace", type: "weapon", rarity: "common", equipSlot: "weapon", damageNotation: "1d6+2", description: "Увесистая булава. 1d6+2 дробящего урона.", value: 5, weight: 4 },
  { id: "quarterstaff", name: "Боевой посох", nameEn: "Quarterstaff", type: "weapon", rarity: "common", equipSlot: "weapon", damageNotation: "1d6+1", description: "Длинный деревянный посох. 1d6+1 дробящего урона. Двуручное.", value: 2, weight: 4 },
  { id: "staff_simple", name: "Посох", nameEn: "Staff", type: "weapon", rarity: "common", equipSlot: "weapon", damageNotation: "1d6+1", description: "Деревянный посох — фокус для магии. 1d6+1 дробящего урона.", value: 2, weight: 4 },
  { id: "spear", name: "Копьё", nameEn: "Spear", type: "weapon", rarity: "common", equipSlot: "weapon", damageNotation: "1d6+2", description: "Универсальное копьё. 1d6+2 колющего урона, можно метать.", value: 1, weight: 3 },
  { id: "rapier", name: "Рапира", nameEn: "Rapier", type: "weapon", rarity: "common", equipSlot: "weapon", damageNotation: "1d8+2", description: "Тонкий фехтовальный клинок. 1d8+2 колющего урона.", value: 25, weight: 2 },
  { id: "greatsword", name: "Двуручный меч", nameEn: "Greatsword", type: "weapon", rarity: "common", equipSlot: "weapon", damageNotation: "2d6+3", description: "Огромный двуручный клинок. 2d6+3 рубящего урона.", value: 50, weight: 6 },
  { id: "greataxe", name: "Двуручный топор", nameEn: "Greataxe", type: "weapon", rarity: "common", equipSlot: "weapon", damageNotation: "1d12+3", description: "Тяжёлый боевой топор. 1d12+3 рубящего урона.", value: 30, weight: 7 },
  { id: "club", name: "Дубина", nameEn: "Club", type: "weapon", rarity: "common", equipSlot: "weapon", damageNotation: "1d4+1", description: "Простая дубина. 1d4+1 дробящего урона.", value: 1, weight: 2 },

  // --- Armor + Shield (5) ---
  { id: "leather_armor", name: "Кожаная броня", nameEn: "Leather Armor", type: "armor", rarity: "common", equipSlot: "chest", acBonus: 2, description: "Лёгкая защита. +2 к Классу Доспеха.", value: 10, weight: 10 },
  { id: "padded_armor", name: "Стёганая броня", nameEn: "Padded Armor", type: "armor", rarity: "common", equipSlot: "chest", acBonus: 1, description: "Слой ваты и ткани. +1 к Классу Доспеха.", value: 5, weight: 8 },
  { id: "studded_armor", name: "Проклёпанная кожа", nameEn: "Studded Leather", type: "armor", rarity: "common", equipSlot: "chest", acBonus: 2, description: "Кожа с металлическими заклёпками. +2 к Классу Доспеха.", value: 45, weight: 13 },
  { id: "iron_helm", name: "Железный шлем", nameEn: "Iron Helm", type: "armor", rarity: "common", equipSlot: "head", acBonus: 1, description: "Защита головы. +1 к Классу Доспеха.", value: 5, weight: 2 },
  { id: "wooden_shield", name: "Деревянный щит", nameEn: "Wooden Shield", type: "shield", rarity: "common", equipSlot: "shield", acBonus: 2, description: "Деревянный щит, окованный железом. +2 к Классу Доспеха.", value: 10, weight: 6 },

  // --- Accessories / clothing (3) ---
  { id: "leather_gloves", name: "Кожаные перчатки", nameEn: "Leather Gloves", type: "misc", rarity: "common", equipSlot: "hands", description: "Прочные перчатки из выделанной кожи.", value: 1, weight: 1 },
  { id: "leather_boots", name: "Кожаные сапоги", nameEn: "Leather Boots", type: "misc", rarity: "common", equipSlot: "legs", statBonus: { dex: 1 }, description: "Удобные сапоги. +1 к Ловкости (незначительно).", value: 2, weight: 2 },
  { id: "holy_symbol", name: "Святой символ", nameEn: "Holy Symbol", type: "misc", rarity: "common", description: "Фокус для божественной магии — амулет с изображением божества.", value: 5, weight: 1 },

  // --- Consumables (1) ---
  { id: "health_potion", name: "Зелье лечения", nameEn: "Health Potion", type: "potion", rarity: "common", description: "Восстанавливает 2d4+2 HP при выпивании.", value: 50, weight: 0.5 },

  // --- Adventuring gear (16) ---
  { id: "torch", name: "Факел", nameEn: "Torch", type: "misc", rarity: "common", description: "Горит 1 час, освещает 20 футов. Можно использовать как оружие (1d4+1 огнём).", value: 1, weight: 1 },
  { id: "rope", name: "Верёвка", nameEn: "Rope", type: "misc", rarity: "common", description: "Пеньковая верёвка, 50 футов. Выдерживает до 300 фунтов.", value: 1, weight: 5 },
  { id: "rations", name: "Сухой паёк", nameEn: "Rations", type: "misc", rarity: "common", description: "Запас еды на 7 дней путешествия.", value: 5, weight: 2 },
  { id: "waterskin", name: "Бурдюк с водой", nameEn: "Waterskin", type: "misc", rarity: "common", description: "Кожаный бурдюк на 4 пинты воды.", value: 2, weight: 5 },
  { id: "backpack", name: "Рюкзак", nameEn: "Backpack", type: "misc", rarity: "common", description: "Кожаный рюкзак для переноски снаряжения.", value: 2, weight: 5 },
  { id: "bedroll", name: "Спальный мешок", nameEn: "Bedroll", type: "misc", rarity: "common", description: "Скатка для сна в полевых условиях.", value: 1, weight: 7 },
  { id: "tinderbox", name: "Огниво", nameEn: "Tinderbox", type: "misc", rarity: "common", description: "Кремень, огниво и трут для розжига.", value: 5, weight: 1 },
  { id: "iron_spikes", name: "Железные колья", nameEn: "Iron Spikes", type: "misc", rarity: "common", description: "10 железных кольев. Заклинить дверь, закрепить верёвку.", value: 1, weight: 5 },
  { id: "lantern", name: "Фонарь", nameEn: "Lantern", type: "misc", rarity: "common", description: "Масляный фонарь. Освещает 30 футов, горит 6 часов на пинте масла.", value: 1, weight: 2 },
  { id: "oil_flask", name: "Флакон масла", nameEn: "Oil Flask", type: "misc", rarity: "common", description: "Пинта лампового масла. Можно поджечь и бросить (1d4+1 огнём).", value: 1, weight: 1 },
  { id: "chalk", name: "Мел", nameEn: "Chalk", type: "misc", rarity: "common", description: "Кусок мела для пометок в подземелье.", value: 1, weight: 0.1 },
  { id: "mirror", name: "Зеркало", nameEn: "Mirror", type: "misc", rarity: "common", description: "Стальное зеркало. Отражает свет, помогает против василисков.", value: 5, weight: 0.5 },
  { id: "simple_map", name: "Карта", nameEn: "Map", type: "misc", rarity: "common", description: "Схематичная карта местности с пометками торговца.", value: 1, weight: 0.1 },
  { id: "bandages", name: "Бинты", nameEn: "Bandages", type: "misc", rarity: "common", description: "Чистые бинты для перевязки ран. Стабилизируют умирающего.", value: 5, weight: 0.5 },
  { id: "lockpick", name: "Отмычка", nameEn: "Lockpick", type: "misc", rarity: "common", description: "Тонкий металлический инструмент для вскрытия замков.", value: 2, weight: 0.1 },
  { id: "whetstone", name: "Точильный камень", nameEn: "Whetstone", type: "misc", rarity: "common", description: "Точильный брусок для правки лезвий в полевых условиях.", value: 1, weight: 1 },

  // --- Class-specific starting items (4) ---
  { id: "quiver_arrows", name: "Колчан стрел", nameEn: "Quiver of Arrows", type: "misc", rarity: "common", description: "Колчан с 20 стрелами для лука.", value: 1, weight: 1 },
  { id: "thieves_tools", name: "Воровские инструменты", nameEn: "Thieves' Tools", type: "misc", rarity: "common", description: "Набор отмычек, пилок и крючков. Бонус к проверкам взлома.", value: 10, weight: 1 },
  { id: "spellbook", name: "Книга заклинаний", nameEn: "Spellbook", type: "misc", rarity: "common", description: "Пергаментный фолиант с известными заклинаниями мага.", value: 25, weight: 3 },
  { id: "prayer_beads", name: "Деревянные четки", nameEn: "Prayer Beads", type: "misc", rarity: "common", description: "Фокус для медитации монаха. Помогает концентрации.", value: 1, weight: 0.1 },

  // --- Materials (1) ---
  { id: "iron_ingot", name: "Железный слиток", nameEn: "Iron Ingot", type: "material", rarity: "common", description: "Кусок очищенного железа. Сырьё для кузнечного дела.", value: 1, weight: 1 },
];

// ============================================================
// UNCOMMON (30) — minor magic items, masterwork gear, +1 weapons, low-tier scrolls/potions.
// ============================================================
const UNCOMMON_ITEMS: ItemEntry[] = [
  // --- Magic weapons (5) ---
  { id: "steel_sword_plus1", name: "Стальной меч +1", nameEn: "Steel Sword +1", type: "weapon", rarity: "uncommon", equipSlot: "weapon", damageNotation: "1d8+4", description: "Магически укреплённый клинок. +1 к атаке и урону. 1d8+4 рубящего урона.", value: 200, weight: 3 },
  { id: "elven_bow", name: "Эльфийский лук", nameEn: "Elven Bow", type: "weapon", rarity: "uncommon", equipSlot: "weapon", damageNotation: "1d8+2", description: "Изящный лук из лунного дерева. +1 к атаке. 1d8+2 колющего урона.", value: 150, weight: 2 },
  { id: "dwarven_axe", name: "Дварфский топор", nameEn: "Dwarven Axe", type: "weapon", rarity: "uncommon", equipSlot: "weapon", damageNotation: "1d8+4", description: "Мастерская работа дварфских кузнецов. +1 к атаке и урону. 1d8+4 рубящего урона.", value: 250, weight: 4 },
  { id: "silver_dagger", name: "Серебряный кинжал", nameEn: "Silver Dagger", type: "weapon", rarity: "uncommon", equipSlot: "weapon", damageNotation: "1d4+2", description: "Клинок из очистительного серебра. Урон нежити и оборотням полным. 1d4+2 колющего урона.", value: 100, weight: 1 },
  { id: "arcane_staff", name: "Магический посох", nameEn: "Arcane Staff", type: "weapon", rarity: "uncommon", equipSlot: "weapon", damageNotation: "1d6+2", description: "Посох с вделанным кристаллом — фокус для магии. +1 к атакам заклинаниями. 1d6+2 дробящего урона.", value: 150, weight: 4 },

  // --- Medium/heavy armor (2) ---
  { id: "chain_mail", name: "Кольчуга", nameEn: "Chain Mail", type: "armor", rarity: "uncommon", equipSlot: "chest", acBonus: 4, description: "Тяжёлая броня из железных колец. +4 к Классу Доспеха. Запрещена магам.", value: 75, weight: 55 },
  { id: "scale_mail", name: "Чешуйчатый доспех", nameEn: "Scale Mail", type: "armor", rarity: "uncommon", equipSlot: "chest", acBonus: 3, description: "Средняя броня из металлических пластин. +3 к Классу Доспеха.", value: 50, weight: 45 },

  // --- Accessories (6) ---
  { id: "ring_protection_plus1", name: "Кольцо защиты +1", nameEn: "Ring of Protection +1", type: "ring", rarity: "uncommon", equipSlot: "accessory", acBonus: 1, description: "Кольцо с защитным заклинанием. +1 к Классу Доспеха и спасброскам.", value: 100, weight: 0 },
  { id: "amulet_health", name: "Амулет здоровья", nameEn: "Amulet of Health", type: "amulet", rarity: "uncommon", equipSlot: "accessory", statBonus: { con: 2 }, description: "Амулет с рубиновой каплей. +2 к Телосложению.", value: 200, weight: 0.5 },
  { id: "ring_strength", name: "Кольцо силы", nameEn: "Ring of Strength", type: "ring", rarity: "uncommon", equipSlot: "accessory", statBonus: { str: 2 }, description: "Кольцо с гравировкой руны Силы. +2 к Силе.", value: 200, weight: 0 },
  { id: "cloak_resistance", name: "Плащ сопротивления", nameEn: "Cloak of Resistance", type: "cloak", rarity: "uncommon", equipSlot: "accessory", acBonus: 1, description: "Плащ, ткущийся из нитей мана-потока. +1 к Классу Доспеха и спасброскам.", value: 100, weight: 1 },
  { id: "boots_striding", name: "Сапоги стремительности", nameEn: "Boots of Striding", type: "misc", rarity: "uncommon", equipSlot: "legs", statBonus: { dex: 1 }, description: "Сапоги с лёгким зачарованием скорости. +1 к Ловкости, +5 футов к скорости.", value: 150, weight: 2 },
  { id: "bracers_archery", name: "Наручи лучника", nameEn: "Bracers of Archery", type: "misc", rarity: "uncommon", equipSlot: "hands", description: "Кожаные наручи с гравировкой стрелы. +2 к атаке и урону из лука.", value: 100, weight: 1 },

  // --- Scrolls (4) ---
  { id: "scroll_fireball", name: "Свиток огненного шара", nameEn: "Scroll of Fireball", type: "scroll", rarity: "uncommon", description: "Взрыв огня радиусом 20 футов. 8d6 урона огнём (спасбросок ЛОВ — половина). Расходуемый.", value: 200, weight: 0 },
  { id: "scroll_magic_missile", name: "Свиток магической стрелы", nameEn: "Scroll of Magic Missile", type: "scroll", rarity: "uncommon", description: "Три силы-снаряда, каждый 1d4+1. Не промахиваются. Расходуемый.", value: 50, weight: 0 },
  { id: "scroll_shield", name: "Свиток щита", nameEn: "Scroll of Shield", type: "scroll", rarity: "uncommon", description: "Реакция: +5 к Классу Доспеха до конца хода. Расходуемый.", value: 50, weight: 0 },
  { id: "scroll_cure_wounds", name: "Свиток лечения ран", nameEn: "Scroll of Cure Wounds", type: "scroll", rarity: "uncommon", description: "Восстанавливает 1d8+3 HP касанием. Расходуемый.", value: 50, weight: 0 },

  // --- Potions (4) ---
  { id: "potion_greater_healing", name: "Зелье большого лечения", nameEn: "Potion of Greater Healing", type: "potion", rarity: "uncommon", description: "Восстанавливает 4d4+4 HP при выпивании.", value: 100, weight: 0.5 },
  { id: "potion_mana", name: "Зелье маны", nameEn: "Potion of Mana", type: "potion", rarity: "uncommon", description: "Восстанавливает 1 ячейку заклинания 1-го уровня.", value: 75, weight: 0.5 },
  { id: "potion_strength", name: "Зелье силы", nameEn: "Potion of Strength", type: "potion", rarity: "uncommon", description: "+2 к Силе на 1 час после выпивания.", value: 100, weight: 0.5 },
  { id: "potion_speed", name: "Зелье скорости", nameEn: "Potion of Speed", type: "potion", rarity: "uncommon", description: "Действие + бонус-действие в течение 1 минуты. Скорость +30 футов.", value: 100, weight: 0.5 },

  // --- Tools & trinkets (3) ---
  { id: "silver_holy_symbol", name: "Серебряный святой символ", nameEn: "Silver Holy Symbol", type: "misc", rarity: "uncommon", description: "Освящённый фокус. +1 к спасброскам божественной магии.", value: 25, weight: 0.5 },
  { id: "magnifying_glass", name: "Лупа", nameEn: "Magnifying Glass", type: "misc", rarity: "uncommon", description: "Линза в латунной оправе. Преимущество на проверках Анализа мелких деталей.", value: 50, weight: 0.5 },
  { id: "thieves_tools_masterwork", name: "Мастерские воровские инструменты", nameEn: "Masterwork Thieves' Tools", type: "misc", rarity: "uncommon", description: "Тонкой работы отмычки. +1 к проверкам взлома замков и обезвреживания ловушек.", value: 50, weight: 1 },

  // --- Materials (6) ---
  { id: "healing_herb", name: "Целебная трава", nameEn: "Healing Herb", type: "material", rarity: "uncommon", description: "Пучок целебной травы. Компонент для зелий лечения.", value: 5, weight: 0.1 },
  { id: "mandrake_root", name: "Корень мандрагоры", nameEn: "Mandrake Root", type: "material", rarity: "uncommon", description: "Изогнутый корень, похожий на человека. Компонент алхимии.", value: 5, weight: 0.1 },
  { id: "mana_crystal", name: "Кристалл маны", nameEn: "Mana Crystal", type: "material", rarity: "uncommon", description: "Сине-зелёный кристалл, мерцающий магией. Компонент для зелий маны.", value: 25, weight: 0.5 },
  { id: "troll_blood", name: "Кровь тролля", nameEn: "Troll Blood", type: "material", rarity: "uncommon", description: "Зелёная вязкая жидкость в склянке. Компонент для зелий регенерации и силы.", value: 20, weight: 0.5 },
  { id: "ruby_dust", name: "Пыль рубина", nameEn: "Ruby Dust", type: "material", rarity: "uncommon", description: "Молотый рубин для зачарования и свитков огня.", value: 50, weight: 0.1 },
  { id: "silver_dust", name: "Серебряная пыль", nameEn: "Silver Dust", type: "material", rarity: "uncommon", description: "Серебряная пудра для зачарования и противоядий.", value: 10, weight: 0.1 },
];

// ============================================================
// RARE (20) — distinctive magic items, elemental weapons, dragon scales (set pieces).
// ============================================================
const RARE_ITEMS: ItemEntry[] = [
  // --- Elemental weapons (4) ---
  { id: "flaming_sword", name: "Пламенный меч", nameEn: "Flaming Sword", type: "weapon", rarity: "rare", equipSlot: "weapon", damageNotation: "1d8+3", enchantment: "fire", description: "Клинок пылает магическим огнём. 1d8+3 рубящего + 1d6 урона огнём. Можно зажечь факел.", value: 1500, weight: 3 },
  { id: "frost_axe", name: "Ледяной топор", nameEn: "Frost Axe", type: "weapon", rarity: "rare", equipSlot: "weapon", damageNotation: "1d8+3", enchantment: "ice", description: "Лезвие покрыто инеем. 1d8+3 рубящего + 1d6 урона холодом. Замедляет цель.", value: 1200, weight: 4 },
  { id: "lightning_hammer", name: "Молот молний", nameEn: "Lightning Hammer", type: "weapon", rarity: "rare", equipSlot: "weapon", damageNotation: "1d8+2", enchantment: "lightning", description: "При ударе раздаётся раскат грома. 1d8+2 дробящего + 1d6 урона молнией.", value: 1500, weight: 3 },
  { id: "poison_dagger", name: "Отравленный кинжал", nameEn: "Poison Dagger", type: "weapon", rarity: "rare", equipSlot: "weapon", damageNotation: "1d4+1", enchantment: "poison", description: "Клинок покрыт ядом. 1d4+1 колющего + 1d6 урона ядом. СПАС КОН 13 или отравлен.", value: 800, weight: 1 },

  // --- Magic armor (1) ---
  { id: "elven_chain", name: "Эльфийская кольчуга", nameEn: "Elven Chain", type: "armor", rarity: "rare", equipSlot: "chest", acBonus: 4, description: "Лёгкая, как шёлк, кольчуга из мифрила. +4 к Классу Доспеха. Можно носить магам.", value: 1500, weight: 20 },

  // --- Cloaks & accessories (5) ---
  { id: "cloak_elvenkind", name: "Плащ эльфийского рода", nameEn: "Cloak of Elvenkind", type: "cloak", rarity: "rare", equipSlot: "accessory", statBonus: { dex: 1 }, description: "Плащ цвета лесной тени. +1 к Ловкости, преимущество на Скрытность.", value: 1500, weight: 1 },
  { id: "ring_invisibility", name: "Кольцо невидимости", nameEn: "Ring of Invisibility", type: "ring", rarity: "rare", equipSlot: "accessory", description: "Действие: стать невидимым. Заканчивается при атаке или заклинании.", value: 2000, weight: 0 },
  { id: "ring_protection_plus2", name: "Кольцо защиты +2", nameEn: "Ring of Protection +2", type: "ring", rarity: "rare", equipSlot: "accessory", acBonus: 2, description: "Сильнее обычного защитного кольца. +2 к Классу Доспеха и спасброскам.", value: 1500, weight: 0 },
  { id: "amulet_wisdom_plus2", name: "Амулет мудрости +2", nameEn: "Amulet of Wisdom +2", type: "amulet", rarity: "rare", equipSlot: "accessory", statBonus: { wis: 2 }, description: "Сапфировый амулет прозрения. +2 к Мудрости.", value: 1500, weight: 0.5 },
  { id: "boots_elvenkind", name: "Сапоги эльфийского рода", nameEn: "Boots of Elvenkind", type: "misc", rarity: "rare", equipSlot: "legs", statBonus: { dex: 2 }, description: "Бесшумные сапоги из лунного дерева. +2 к Ловкости, беззвучные шаги.", value: 1200, weight: 1 },

  // --- Hands / head (2) ---
  { id: "gloves_missiles", name: "Перчатки снарядов", nameEn: "Gloves of Missile Snaring", type: "misc", rarity: "rare", equipSlot: "hands", description: "Реакция: уменьшить урон от снаряда на 1d10+5. +2 к Ловкости рук.", value: 1200, weight: 0.5 },
  { id: "helm_telepathy", name: "Шлем телепатии", nameEn: "Helm of Telepathy", type: "armor", rarity: "rare", equipSlot: "head", acBonus: 1, description: "Шлем с кристаллом на лбу. +1 AC. Действие: читать поверхностные мысли на 30 футов.", value: 1500, weight: 2 },

  // --- Charged staff (1) ---
  { id: "staff_fire", name: "Посох огня", nameEn: "Staff of Fire", type: "weapon", rarity: "rare", equipSlot: "weapon", damageNotation: "1d6+2", enchantment: "fire", charges: 10, description: "Посох с огненным ядром. 10 зарядов: Огненный шар (8d6) или Стена огня. 1d6+2 дробящего урона. Регенерация 1d6+4 зарядов на рассвете.", value: 2000, weight: 4 },

  // --- Dragon scale set pieces (3) ---
  { id: "dragon_scale_red", name: "Красная драконья чешуя", nameEn: "Red Dragon Scale", type: "material", rarity: "rare", setId: "dragon_scale", description: "Чешуя взрослого красного дракона. Часть комплекта «Драконья чешуя» — соберите 3 штуки для +2 AC.", value: 1500, weight: 5 },
  { id: "dragon_scale_blue", name: "Синяя драконья чешуя", nameEn: "Blue Dragon Scale", type: "material", rarity: "rare", setId: "dragon_scale", description: "Чешуя синего дракона, пронизанная молнией. Часть комплекта «Драконья чешуя» — соберите 3 штуки для +2 AC.", value: 1500, weight: 5 },
  { id: "dragon_scale_green", name: "Зелёная драконья чешуя", nameEn: "Green Dragon Scale", type: "material", rarity: "rare", setId: "dragon_scale", description: "Чешуя зелёного дракона, отдающая хлором. Часть комплекта «Драконья чешуя» — соберите 3 штуки для +2 AC.", value: 1500, weight: 5 },

  // --- Potions & scrolls (4) ---
  { id: "potion_superior_healing", name: "Зелье превосходного лечения", nameEn: "Potion of Superior Healing", type: "potion", rarity: "rare", description: "Восстанавливает 8d4+8 HP при выпивании.", value: 750, weight: 0.5 },
  { id: "scroll_lightning_bolt", name: "Свиток молнии", nameEn: "Scroll of Lightning Bolt", type: "scroll", rarity: "rare", description: "Линия молнии длиной 100 футов. 8d6 урона молнией (спасбросок ЛОВ — половина). Расходуемый.", value: 400, weight: 0 },
  { id: "scroll_hold_person", name: "Свиток удержания личности", nameEn: "Scroll of Hold Person", type: "scroll", rarity: "rare", description: "Парализует гуманоида (СПАС МУД). Концентрация до 1 минуты. Расходуемый.", value: 400, weight: 0 },
  { id: "scroll_fly", name: "Свиток полёта", nameEn: "Scroll of Fly", type: "scroll", rarity: "rare", description: "Целевое существо летает 10 минут со скоростью 60 футов. Расходуемый.", value: 400, weight: 0 },
];

// ============================================================
// VERY RARE (8) — powerful magic items, named weapons, dragon-scale armor.
// ============================================================
const VERYRARE_ITEMS: ItemEntry[] = [
  { id: "staff_archmage", name: "Посох архимага", nameEn: "Staff of Archmage", type: "weapon", rarity: "veryrare", equipSlot: "weapon", damageNotation: "1d6+3", charges: 50, description: "Посох совета архимагов. 50 зарядов: Огненный шар (8d6), Молния (8d6),Конус холода (8d8), Стена огня. +1 к атакам заклинаниями. 1d6+3 дробящего урона.", value: 25000, weight: 4 , requiresAttunement: true },
  { id: "dragon_scale_mail", name: "Драконий чешуйчатый доспех", nameEn: "Dragon Scale Mail", type: "armor", rarity: "veryrare", equipSlot: "chest", acBonus: 5, enchantment: "fire", description: "Броня из настоящей драконьей чешуи. +5 к Классу Доспеха. Сопротивление стихии дракона. Преимущество против страха драконов.", value: 5000, weight: 25 , requiresAttunement: true },
  { id: "vorpal_sword", name: "Вороновой меч", nameEn: "Vorpal Sword", type: "weapon", rarity: "veryrare", equipSlot: "weapon", damageNotation: "2d6+3", description: "Идеально заточенный клинок. 2d6+3 рубящего урона. При натуральной 20 на атаке — отрубает голову (мгибель, если нет иммунитета).", value: 10000, weight: 6 , requiresAttunement: true },
  { id: "holy_avenger", name: "Священный мститель", nameEn: "Holy Avenger", type: "weapon", rarity: "veryrare", equipSlot: "weapon", damageNotation: "1d8+3", enchantment: "holy", description: "Длань паладина. 1d8+3 рубящего + 2d6 урона святым против зла. Аура +5 к спасброскам союзникам в 10 футах. Рассеивает тьму.", value: 25000, weight: 3 , requiresAttunement: true },
  { id: "cloak_invisibility", name: "Плащ невидимости", nameEn: "Cloak of Invisibility", type: "cloak", rarity: "veryrare", equipSlot: "accessory", description: "Действие: стать невидимым на 2 часа (можно делить между использованиями). Заканчивается при атаке или заклинании.", value: 8000, weight: 1 , requiresAttunement: true },
  { id: "ring_three_wishes", name: "Кольцо трёх желаний", nameEn: "Ring of Three Wishes", type: "ring", rarity: "veryrare", equipSlot: "accessory", charges: 3, description: "Мифическое кольцо с сапфиром. 3 заряда — каждое тратится на заклинание «Желание» (исполняет почти любое). Не восполняется.", value: 30000, weight: 0 , requiresAttunement: true },
  { id: "sun_blade", name: "Солнечный клинок", nameEn: "Sun Blade", type: "weapon", rarity: "veryrare", equipSlot: "weapon", damageNotation: "2d6+3", enchantment: "holy", description: "Эфес, из которого по желанию появляется лезвие чистого света. 2d6+3 рубящего + 1d8 урона святым. Светит как факел. Преимущество против нежити.", value: 12000, weight: 3 , requiresAttunement: true },
  { id: "armor_invulnerability", name: "Броня неуязвимости", nameEn: "Armor of Invulnerability", type: "armor", rarity: "veryrare", equipSlot: "chest", acBonus: 4, description: "Тяжёлые латы с рунами неуязвимости. +4 к Классу Доспеха. Действие: иммунитет к немагическому урону на 10 минут (1 раз в день).", value: 12000, weight: 65 , requiresAttunement: true },
];

// ============================================================
// LEGENDARY (5) — artifacts with curses.
// ============================================================
const LEGENDARY_ITEMS: ItemEntry[] = [
  {
    id: "sword_of_kas",
    name: "Меч Каса",
    nameEn: "Sword of Kas",
    type: "weapon",
    rarity: "legendary",
    equipSlot: "weapon",
    damageNotation: "2d6+5",
    enchantment: "necrotic",
    description: "Чёрный клинок, выкованный Векной для своего лейтенанта Каса. 2d6+5 рубящего + 1d8 урона некротической энергией. Критический удар — удвоенный некротический урон.",
    value: 60000,
    weight: 6,
    curse: "Проклятие: владелец слышит шёпот Каса, призывающий убить Векну. Каждый день СПАС МУД 15 или одержимость кровавой местью.",
  },
  {
    id: "hand_of_vecna",
    name: "Длань Векны",
    nameEn: "Hand of Vecna",
    type: "misc",
    rarity: "legendary",
    equipSlot: "accessory",
    statBonus: { str: 3 },
    description: "Иссохшая мумифицированная рука бога-лича. Заменяет собственную руку владельца. +3 к Силе. Касание: наносит 1d8 некротического урона и парализует (СПАС КОН 16).",
    value: 80000,
    weight: 1,
    curse: "Проклятие: рука медленно разлагает душу владельца. Каждый уровень — СПАС МУД 17 или сдвиг мировоззрения к Злому. Нельзя снять иначе как отрубив руку.",
  },
  {
    id: "orb_of_dragonkind",
    name: "Сфера драконов",
    nameEn: "Orb of Dragonkind",
    type: "misc",
    rarity: "legendary",
    equipSlot: "accessory",
    description: "Хрустальная сфера с драконьим оком внутри. Действие: подчинить дракона одного типа (СПАС МУД 17 драконом). Действие: 3 раза в день — вызов стихии дракона (12d6 урона).",
    value: 100000,
    weight: 5,
    curse: "Проклятие: каждый день владелец должен СПАС МУД 15 или стать рабом приказа первого увиденного дракона. Сфера шепчет о возвращении драконьих богов.",
  },
  {
    id: "book_of_vile_darkness",
    name: "Книга мерзкой тьмы",
    nameEn: "Book of Vile Darkness",
    type: "misc",
    rarity: "legendary",
    description: "Фолиант из кожи мучеников, написанный кровью. Чтение 80 часов даёт знание запретной некромантии: Animated Dead на нежить до 30 HD, Инструкция Нежити без концентрации, Повелитель Тьмы.",
    value: 80000,
    weight: 5,
    curse: "Проклятие: чтение книги сдвигает мировоззрение к Зло. Каждый день — СПАС МУД 16 или одержимость запретным знанием. Нельзя уничтожить обычными средствами.",
  },
  {
    id: "blackrazor",
    name: "Чёрный Клинок",
    nameEn: "Blackrazor",
    type: "weapon",
    rarity: "legendary",
    equipSlot: "weapon",
    damageNotation: "2d6+3",
    enchantment: "necrotic",
    description: "Душащий чёрный клинок, поглощающий души. 2d6+3 рубящего урона. При убийстве — лечение владельца на HP цели. Критический 20 — цель должна СПАС МУД 15 или душа поглощена (мгновенная гибель).",
    value: 70000,
    weight: 6,
    curse: "Проклятие: клинок ненасытен. Если 24 часа не убивал — владелец СПАС МУД 15 или впадает в ярость, ища жертву. Если нет цели — медленно высасывает душу носителя (1d6 некротического урона в час).",
  },
  // ===== Additional items (D&D 5e SRD) =====
  {
    id: "potion_giant_str",
    name: "Зелье великой силы",
    nameEn: "Potion of Giant Strength",
    type: "potion",
    rarity: "rare",
    description: "СИЛ становится 21 на 1 час. Не суммируется с другими зельями силы.",
    value: 450,
    weight: 0.5,
  },
  {
    id: "potion_speed_greater",
    name: "Зелье великой скорости",
    nameEn: "Potion of Greater Speed",
    type: "potion",
    rarity: "veryrare",
    description: "Скорость ×2, +2 AC, преимущество на спасброски ЛОВ на 1 час.",
    value: 800,
    weight: 0.5,
  },
  {
    id: "potion_heroism",
    name: "Зелье героизма",
    nameEn: "Potion of Heroism",
    type: "potion",
    rarity: "rare",
    description: "Иммунитет к страху, 2d4+2 временных HP на 1 час.",
    value: 350,
    weight: 0.5,
  },
  {
    id: "scroll_hold_person_2",
    name: "Свиток удержания личности",
    nameEn: "Scroll of Hold Person",
    type: "scroll",
    rarity: "uncommon",
    damageNotation: "",
    description: "Цель парализована (СПАС МУД 13). Концентрация, до 1 минуты.",
    value: 150,
    weight: 0.1,
  },
  {
    id: "scroll_fireball_2",
    name: "Свиток огненного шара",
    nameEn: "Scroll of Fireball",
    type: "scroll",
    rarity: "rare",
    damageNotation: "8d6",
    description: "Взрыв огня радиус 6 клеток. 8d6 урона огнём (СПАС ЛОВ 15 половина).",
    value: 300,
    weight: 0.1,
  },
  {
    id: "scroll_revivify",
    name: "Свиток воскрешения",
    nameEn: "Scroll of Revivify",
    type: "scroll",
    rarity: "rare",
    description: "Воскрешает павшего союзника (умер не более 1 минуты назад). Тратит 300 золота алмазов.",
    value: 500,
    weight: 0.1,
  },
  {
    id: "ring_protection_2",
    name: "Кольцо защиты +2",
    nameEn: "Ring of Protection +2",
    type: "ring",
    rarity: "rare",
    equipSlot: "accessory",
    acBonus: 2,
    statBonus: { cha: 1 },
    description: "+2 AC, +1 Харизма. Лёгкое серебряное кольцо с защитными рунами.",
    value: 4000,
    weight: 0.1,
  },
  {
    id: "amulet_health_greater",
    name: "Амулет великого здоровья",
    nameEn: "Amulet of Greater Health",
    type: "amulet",
    rarity: "rare",
    equipSlot: "accessory",
    statBonus: { con: 2 },
    description: "ТЕЛ становится минимум 19 (если ниже). Золотой амулет с рубином.",
    value: 3500,
    weight: 0.3,
  },
  {
    id: "cloak_elvenkind_2",
    name: "Плащ эльфийской крови",
    nameEn: "Cloak of Elvenkind",
    type: "cloak",
    rarity: "uncommon",
    equipSlot: "accessory",
    description: "Преимущество на Скрытность. Пассивное восприятие врагов -5 против вас.",
    value: 1500,
    weight: 1,
  },
  {
    id: "boots_striding_2",
    name: "Сапоги стремительности",
    nameEn: "Boots of Striding and Springing",
    type: "misc",
    rarity: "uncommon",
    equipSlot: "accessory",
    description: "Скорость +3 клетки. Игнорирует сложную местность. Прыжок ×3.",
    value: 1200,
    weight: 1,
  },
  {
    id: "goggles_night",
    name: "Очки ночного видения",
    nameEn: "Goggles of Night",
    type: "misc",
    rarity: "uncommon",
    equipSlot: "accessory",
    description: "Тёмное зрение 18 метров. Если уже есть — дальность +12 метров.",
    value: 800,
    weight: 0.2,
  },
  {
    id: "weapon_flame_tongue",
    name: "Пылающий клинок",
    nameEn: "Flame Tongue",
    type: "weapon",
    rarity: "rare",
    equipSlot: "weapon",
    damageNotation: "2d6+3",
    enchantment: "fire",
    description: "2d6+3 рубящего + 2d6 огня. Командой можно зажечь/потушить пламя (бесплатно).",
    value: 5000,
    weight: 4,
  },
  {
    id: "weapon_frost_brand",
    name: "Ледяной клинок",
    nameEn: "Frost Brand",
    type: "weapon",
    rarity: "veryrare",
    equipSlot: "weapon",
    damageNotation: "1d8+3",
    enchantment: "ice",
    description: "1d8+3 рубящего + 1d6 льда. Владелец устойчив к огню. Излучает холод (тушит огонь).",
    value: 8000,
    weight: 4,
  },
  {
    id: "armor_elven_chain",
    name: "Эльфийская кольчуга",
    nameEn: "Elven Chain",
    type: "armor",
    rarity: "rare",
    equipSlot: "chest",
    acBonus: 3,
    description: "Лёгкая магическая кольчуга. AC 14 + ЛОВ (макс 2). Не требует proficiency.",
    value: 4000,
    weight: 10,
  },
  {
    id: "shield_spellguard",
    name: "Щит заклинателя",
    nameEn: "Spellguard Shield",
    type: "shield",
    rarity: "veryrare",
    equipSlot: "shield",
    acBonus: 2,
    description: "+2 AC. Атаки заклинаний против вас с помехой. Ваши спасброски от заклинаний с преимуществом.",
    value: 6000,
    weight: 6,
  },
];

// ============================================================
// Concatenated database.
// ============================================================
export const ITEM_DATABASE: ItemEntry[] = [
  ...COMMON_ITEMS,
  ...UNCOMMON_ITEMS,
  ...RARE_ITEMS,
  ...VERYRARE_ITEMS,
  ...LEGENDARY_ITEMS,
];

export const RARITIES: ItemRarity[] = ["common", "uncommon", "rare", "veryrare", "legendary"];

// ============================================================
// Helpers
// ============================================================

/** Russian label for an item rarity tier. */
export function rarityLabelRu(rarity: ItemRarity): string {
  switch (rarity) {
    case "common":
      return "Обычный";
    case "uncommon":
      return "Необычный";
    case "rare":
      return "Редкий";
    case "veryrare":
      return "Очень редкий";
    case "legendary":
      return "Легендарный";
  }
}

/** Tailwind classes for color-coding items by rarity. */
export function rarityColor(rarity: ItemRarity): {
  badge: string;
  ring: string;
  dot: string;
  text: string;
  bar: string;
} {
  switch (rarity) {
    case "common":
      return {
        badge: "border-stone-700/60 bg-stone-900/40 text-stone-300",
        ring: "ring-stone-700/30",
        dot: "bg-stone-400",
        text: "text-stone-300",
        bar: "bg-stone-500",
      };
    case "uncommon":
      return {
        badge: "border-emerald-700/60 bg-emerald-950/40 text-emerald-300",
        ring: "ring-emerald-700/30",
        dot: "bg-emerald-400",
        text: "text-emerald-300",
        bar: "bg-emerald-500",
      };
    case "rare":
      return {
        badge: "border-sky-700/60 bg-sky-950/40 text-sky-300",
        ring: "ring-sky-700/30",
        dot: "bg-sky-400",
        text: "text-sky-300",
        bar: "bg-sky-500",
      };
    case "veryrare":
      return {
        badge: "border-purple-700/60 bg-purple-950/40 text-purple-300",
        ring: "ring-purple-700/30",
        dot: "bg-purple-400",
        text: "text-purple-300",
        bar: "bg-purple-500",
      };
    case "legendary":
      return {
        badge: "border-amber-600/60 bg-amber-950/40 text-amber-200",
        ring: "ring-amber-600/40",
        dot: "bg-amber-400",
        text: "text-amber-200",
        bar: "bg-amber-500",
      };
  }
}

/** Russian label for an item type. */
export function itemTypeLabelRu(type: ItemType): string {
  switch (type) {
    case "weapon":
      return "Оружие";
    case "armor":
      return "Броня";
    case "shield":
      return "Щит";
    case "potion":
      return "Зелье";
    case "scroll":
      return "Свиток";
    case "ring":
      return "Кольцо";
    case "amulet":
      return "Амулет";
    case "cloak":
      return "Плащ";
    case "misc":
      return "Прочее";
    case "key":
      return "Ключ";
    case "material":
      return "Материал";
  }
}

/** All items of a given rarity. */
export function getItemsByRarity(rarity: ItemRarity): ItemEntry[] {
  return ITEM_DATABASE.filter((i) => i.rarity === rarity);
}

/** All items of a given type. */
export function getItemsByType(type: ItemType): ItemEntry[] {
  return ITEM_DATABASE.filter((i) => i.type === type);
}

/** Lookup by id. */
export function getItemById(id: string): ItemEntry | null {
  return ITEM_DATABASE.find((i) => i.id === id) ?? null;
}

/** Case-insensitive lookup by Russian OR English name (exact match first,
 *  then partial-substring match). Returns null if nothing matches. */
export function findItemByName(name: string): ItemEntry | null {
  const q = (name || "").trim().toLowerCase();
  if (!q) return null;
  // Exact match first (prefer Russian, then English).
  let match = ITEM_DATABASE.find((i) => i.name.toLowerCase() === q);
  if (match) return match;
  match = ITEM_DATABASE.find((i) => i.nameEn.toLowerCase() === q);
  if (match) return match;
  // Then partial-substring match.
  match = ITEM_DATABASE.find((i) => i.name.toLowerCase().includes(q));
  if (match) return match;
  match = ITEM_DATABASE.find((i) => i.nameEn.toLowerCase().includes(q));
  if (match) return match;
  return null;
}

// ============================================================
// Set bonuses
// ============================================================

export interface SetBonus {
  /** Russian name of the set (shown in UI). */
  name: string;
  /** How many pieces must be owned to activate the bonus. */
  requiredPieceCount: number;
  /** Bonuses granted when the set is active. */
  bonus: {
    acBonus?: number;
    description: string;
  };
}

export const SET_BONUSES: Record<string, SetBonus> = {
  dragon_scale: {
    name: "Драконья чешуя",
    requiredPieceCount: 3,
    bonus: {
      acBonus: 2,
      description: "+2 к Классу Доспеха — благословение драконьей крови.",
    },
  },
};

/** All items in a given set. */
export function getSetItems(setId: string): ItemEntry[] {
  return ITEM_DATABASE.filter((i) => i.setId === setId);
}

/** How many pieces of a set the player owns (matched by Russian item name). */
export function countSetPiecesOwned(setId: string, ownedItemNames: string[]): number {
  const setNames = new Set(
    getSetItems(setId).map((i) => i.name.toLowerCase())
  );
  return ownedItemNames.filter((n) => setNames.has(n.toLowerCase())).length;
}

/** Whether the set bonus is active for the player + the bonus itself. */
export function getSetActiveBonuses(
  setId: string,
  ownedItemNames: string[]
): { active: boolean; owned: number; required: number; bonus: SetBonus["bonus"] | null } {
  const def = SET_BONUSES[setId];
  if (!def) return { active: false, owned: 0, required: 0, bonus: null };
  const owned = countSetPiecesOwned(setId, ownedItemNames);
  const active = owned >= def.requiredPieceCount;
  return {
    active,
    owned,
    required: def.requiredPieceCount,
    bonus: active ? def.bonus : null,
  };
}

// ============================================================
// Loot generation helpers (used by state.ts / dungeon-populate.ts)
// ============================================================

const RARITY_ORDER: ItemRarity[] = ["common", "uncommon", "rare", "veryrare", "legendary"];

/** Pick a uniformly-random item of the given rarity. Falls back to common
 *  if the rarity pool is empty (defensive — should never happen). */
export function randomItemByRarity(rarity: ItemRarity): ItemEntry {
  const pool = getItemsByRarity(rarity);
  if (pool.length === 0) {
    const fallback = getItemsByRarity("common");
    return fallback[Math.floor(Math.random() * fallback.length)] ?? fallback[0];
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Roll a rarity tier based on party level. Higher level = higher rarity chance.
 *  - L1-3: 80% common, 20% uncommon
 *  - L4-6: 35% common, 45% uncommon, 20% rare
 *  - L7-9: 15% common, 35% uncommon, 35% rare, 15% veryrare
 *  - L10+: 20% uncommon, 40% rare, 30% veryrare, 10% legendary
 */
function rollRarityForLevel(level: number): ItemRarity {
  const roll = Math.random();
  if (level >= 10) {
    if (roll < 0.10) return "legendary";
    if (roll < 0.40) return "veryrare";
    if (roll < 0.80) return "rare";
    return "uncommon";
  }
  if (level >= 7) {
    if (roll < 0.15) return "veryrare";
    if (roll < 0.50) return "rare";
    if (roll < 0.85) return "uncommon";
    return "common";
  }
  if (level >= 4) {
    if (roll < 0.20) return "rare";
    if (roll < 0.65) return "uncommon";
    return "common";
  }
  // L1-3
  if (roll < 0.20) return "uncommon";
  return "common";
}

/** Generate 1–3 random items scaled by party level. Higher level = higher
 *  rarity chance. Optional rarityBias forces the FIRST item to be at least
 *  that rarity (e.g. a treasure chest can be biased to drop at least a rare). */
export function generateLoot(partyLevel: number, rarityBias?: ItemRarity): ItemEntry[] {
  const level = Math.max(1, Math.floor(partyLevel) || 1);
  const count = 1 + Math.floor(Math.random() * 3); // 1..3
  const out: ItemEntry[] = [];
  for (let i = 0; i < count; i++) {
    let rarity = rollRarityForLevel(level);
    // Apply rarity bias on the first item: force at least the biased rarity.
    if (i === 0 && rarityBias) {
      const biasIdx = RARITY_ORDER.indexOf(rarityBias);
      const curIdx = RARITY_ORDER.indexOf(rarity);
      if (biasIdx > curIdx) rarity = rarityBias;
    }
    out.push(randomItemByRarity(rarity));
  }
  return out;
}

/** Convert an ItemEntry into the InventoryChange shape that
 *  applyInventoryChanges expects (used by state.ts loot generation). */
export function itemEntryToInventoryChange(entry: ItemEntry): InventoryChange {
  return {
    action: "add",
    item: entry.name,
    type: entry.type,
    description: entry.description,
  };
}

/** Total number of items in the database (sanity-check helper). */
export const ITEM_DATABASE_COUNT: number = ITEM_DATABASE.length;
