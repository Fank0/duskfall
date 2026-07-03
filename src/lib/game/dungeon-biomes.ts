// Biome definitions for the procedural dungeon generator (Пункт 36).
//
// Each biome carries every piece of themed content the BSP generator +
// room-population engine need to fill a dungeon: room-label pools, monster
// pools (scaled to party level at spawn-time), boss pools (with a special
// ability blurb), loot pools, trap definitions, friendly-NPC pools, an
// atmosphere image prompt, and per-room-type image prompts that the move-room
// route hands to /api/game/image.
//
// All user-facing strings are in Russian. Image prompts stay English (the
// image-gen model performs best on English dark-fantasy keywords).

import type { MapRoomType } from "./types";
import {
  BESTIARY,
  type BestiaryEntry,
  type MonsterCategory,
  getBestiaryEntryById,
} from "./bestiary";

export type DungeonBiomeId = "catacombs" | "caves" | "tower" | "forest" | "dungeon";

// ---------- Bestiary integration ----------
//
// Each biome's `monsters` pool is now pulled from the central BESTIARY
// catalogue in bestiary.ts. The mapping below pins which bestiary entry ids
// belong to each biome — the spec calls for:
//   catacombs → undead + cultists
//   caves     → beasts + earth/water elementals
//   tower     → elementals + demons + necromancers
//   forest    → bandits + beasts
//   dungeon   → goblins/orcs + undead

/** Hex colour per monster category — drives the on-grid token tint. */
export const CATEGORY_HEX: Record<MonsterCategory, string> = {
  humanoid: "#d97706",
  undead: "#a1a1aa",
  beast: "#16a34a",
  dragon: "#b91c1c",
  demon: "#9333ea",
  elemental: "#0284c7",
  boss: "#7f1d1d",
};

/** Bestiary entry ids per biome — the monster pool the room-population
 *  engine draws from (scaled to party level at spawn-time). */
export const BIOME_MONSTER_IDS: Record<DungeonBiomeId, string[]> = {
  catacombs: ["skeleton", "zombie", "ghoul", "shadow", "wight", "cultist", "cult-fanatic"],
  caves: ["giant-spider", "giant-rat", "cave-bat-swarm", "wolf", "earth-elemental", "water-elemental"],
  tower: ["fire-elemental", "air-elemental", "ice-mephit", "lightning-mephit", "imp", "quasit", "shadow-demon", "necromancer"],
  forest: ["bandit", "bandit-captain", "wolf", "dire-wolf", "boar", "brown-bear", "owl"],
  dungeon: ["goblin", "goblin-warrior", "goblin-shaman", "hobgoblin", "orc", "orc-brute", "skeleton", "zombie", "wraith"],
};

/** Convert a bestiary entry into the BiomeMonster shape the room-population
 *  engine expects (lossy: discards CR/loot/specialAbility — those are read
 *  back from the bestiary on the DM-context side via findBestiaryEntryByName). */
function bestiaryToBiomeMonster(e: BestiaryEntry): BiomeMonster {
  return {
    name: e.name,
    hp: e.hp,
    ac: e.ac,
    damage: e.damageNotation,
    attackBonus: e.attackBonus,
    color: CATEGORY_HEX[e.category],
    description: e.description,
  };
}

/** Resolve a biome's bestiary entry ids into the BiomeMonster[] pool. Missing
 *  ids are skipped (logged via console.warn) so a typo doesn't crash dungeon
 *  generation. */
function resolveBiomeMonsters(biomeId: DungeonBiomeId): BiomeMonster[] {
  const ids = BIOME_MONSTER_IDS[biomeId];
  const out: BiomeMonster[] = [];
  for (const id of ids) {
    const entry = getBestiaryEntryById(id);
    if (!entry) {
      console.warn(`[dungeon-biomes] bestiary entry "${id}" not found for biome "${biomeId}"`);
      continue;
    }
    out.push(bestiaryToBiomeMonster(entry));
  }
  return out;
}

/** Resolve a biome's bestiary entries into the full BestiaryEntry[] (used by
 *  the BestiaryPanel "in this biome" filter). */
export function getBiomeBestiaryEntries(biomeId: DungeonBiomeId): BestiaryEntry[] {
  const ids = BIOME_MONSTER_IDS[biomeId] ?? [];
  const out: BestiaryEntry[] = [];
  for (const id of ids) {
    const e = getBestiaryEntryById(id);
    if (e) out.push(e);
  }
  return out;
}

/** All bestiary entries used by at least one biome (handy for the viewer). */
export function getUsedBestiaryEntries(): BestiaryEntry[] {
  const seen = new Set<string>();
  const out: BestiaryEntry[] = [];
  for (const biomeId of DUNGEON_BIOME_IDS) {
    for (const e of getBiomeBestiaryEntries(biomeId)) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      out.push(e);
    }
  }
  return out;
}

// Re-export so callers can import the catalogue + helpers from this module.
export { BESTIARY, getBestiaryEntryById };
export type { BestiaryEntry, MonsterCategory };

/** A monster template spawned into combat / boss rooms. */
export interface BiomeMonster {
  name: string;
  hp: number;
  ac: number;
  damage: string; // e.g. "1d6+2"
  attackBonus: number;
  color: string;
  description: string;
}

/** A boss template — twice the HP, has a special ability blurb. */
export interface BiomeBoss {
  name: string;
  hp: number;
  ac: number;
  damage: string;
  attackBonus: number;
  color: string;
  description: string;
  specialAbility: string;
}

export interface BiomeLootItem {
  name: string;
  type: string; // potion | weapon | armor | scroll | misc
  description: string;
}

export interface BiomeTrap {
  type: string; // arrow | pit | poison | rune | spike | fire
  label: string;
  damage: number; // number of d6 dice rolled for damage
  dc: number; // perception DC to detect, DEX save DC for half damage
  description: string;
}

export interface BiomeNpc {
  name: string;
  role: "merchant" | "questgiver" | "ally" | "enemy";
  disposition: "friendly" | "neutral" | "hostile";
  location: string;
  notes: string;
}

export interface BiomeImagePrompts {
  /** Atmospheric prompt for the overall dungeon vibe. */
  atmosphere: string;
  perRoomType: Record<MapRoomType, string>;
}

export interface DungeonBiome {
  id: DungeonBiomeId;
  /** Russian display name. */
  name: string;
  /** Short Russian description shown in the WorldMap header tooltip. */
  description: string;
  /** Accent colour (used for the biome badge in WorldMap.tsx). */
  accent: string;
  roomLabels: Record<MapRoomType, string[]>;
  monsters: BiomeMonster[];
  bosses: BiomeBoss[];
  loot: BiomeLootItem[];
  traps: BiomeTrap[];
  npcs: BiomeNpc[];
  imagePrompts: BiomeImagePrompts;
}

export const DUNGEON_BIOMES: Record<DungeonBiomeId, DungeonBiome> = {
  // ============== CATACOMBS ==============
  catacombs: {
    id: "catacombs",
    name: "Катакомбы",
    description: "Бесконечные подземные галереи с костями и прахом забытых мертвецов.",
    accent: "#a8a29e",
    roomLabels: {
      entrance: ["Склеп у входа", "Треснувший саркофаг", "Каменная лестница вниз"],
      combat: ["Зал костей", "Галерея черепов", "Капелла мёртвых", "Склеп теней", "Коридор плачей"],
      loot: ["Гробница жреца", "Сосуды с прахом", "Забытая усыпальница", "Камора с дарами"],
      npc: ["Келья отшельника", "Алтарь покаяния", "Приют паломника", "Тайный молельня"],
      puzzle: ["Зал рунных саркофагов", "Комната печати", "Зеркальный склеп", "Круг духов"],
      safe: ["Зал костра", "Тихая ниша", "Часовня отдыха", "Укрытие гробокопателей"],
      boss: ["Чёрный алтарь", "Логово некроманта", "Трон из костей", "Сердце катакомб"],
      trap: ["Гнилой коридор", "Яма с шипами", "Камера пыток", "Зал ядовитых струй"],
    },
    monsters: resolveBiomeMonsters("catacombs"),
    bosses: [
      { name: "Некромант Морнгрим", hp: 60, ac: 15, damage: "2d6+3", attackBonus: 6, color: "#1e293b", description: "Сгорбленный маг в чёрном балахоне, глаза горят могильным огнём.", specialAbility: "Призыв костяных слуг: раз в 3 раунда поднимает 1d2 скелета-воина." },
      { name: "Костяной лорд Везер", hp: 80, ac: 17, damage: "2d8+4", attackBonus: 7, color: "#e5e7eb", description: "Огромный рыцарь-скелет в ржавых латах, на его черепе — корона из пальцев.", specialAbility: "Ужасающий клич: первый ход боя накладывает «испуг» на всех в радиусе 6 (СПАС WIS 14)." },
    ],
    loot: [
      { name: "Зелье лечения", type: "potion", description: "Восстанавливает 2d4+2 HP." },
      { name: "Серебряный кинжал", type: "weapon", description: "Серебряное оружие 1d4, особенно против оборотней." },
      { name: "Свиток «Изгнание нежити»", type: "scroll", description: "Расходуемый свиток: изгоняет нежить с СПАС CHA 13." },
      { name: "Кольцо защиты +1", type: "armor", description: "+1 к Классу Доспеха, пока надето." },
      { name: "Амулет здравомыслия", type: "misc", description: "Преимущество на спасброски от страха." },
    ],
    traps: [
      { type: "spike", label: "Яма с шипами", damage: 2, dc: 13, description: "Скрытые шипы в полу пробивают ногу." },
      { type: "poison", label: "Ядовитые струи", damage: 2, dc: 14, description: "Из стен бьют струи зеленоватого газа." },
      { type: "arrow", label: "Стреломёт", damage: 2, dc: 13, description: "Из щели в стене вылетают ржавые болты." },
      { type: "rune", label: "Руница тлена", damage: 3, dc: 15, description: "Древняя руна на полу, сжимающаяся тленом." },
    ],
    npcs: [
      { name: "Жрец Андерик", role: "ally", disposition: "friendly", location: "У алтаря", notes: "Странствующий клирик, охотящийся на нежить." },
      { name: "Гробокопатель Брольд", role: "merchant", disposition: "neutral", location: "У тележки", notes: "Продаёт зелья и кости." },
      { name: "Тень Сэма", role: "questgiver", disposition: "neutral", location: "В углу", notes: "Призрак, ищущий покоя." },
    ],
    imagePrompts: {
      atmosphere: "Dark fantasy catacombs, endless bone-lined galleries, dusty sarcophagi, flickering torches, cobwebs, ominous shadows, painterly concept art",
      perRoomType: {
        entrance: "Dark fantasy catacomb entrance, broken stone stairway down, cracked sarcophagus, torchlight, mist, painterly concept art",
        combat: "Dark fantasy catacomb hall of bones, scattered skulls, broken weapons, bloodstains, ominous shadows, painterly concept art",
        loot: "Dark fantasy catacomb treasure alcove, golden chalices among bones, dusty reliquary, candlelight, painterly concept art",
        npc: "Dark fantasy catacomb hermit cell, small fire, hooded priest, ragged bedroll, painterly concept art",
        puzzle: "Dark fantasy catacomb rune circle, glowing glyphs on floor, sealed sarcophagus, painterly concept art",
        safe: "Dark fantasy catacomb safe refuge, warm campfire, straw bedrolls, calm atmosphere, painterly concept art",
        boss: "Dark fantasy catacomb boss lair, throne of bones, dark altar, looming necromancer, painterly concept art",
        trap: "Dark fantasy catacomb trap corridor, hidden spikes in floor, rusted arrow slits, greenish gas, painterly concept art",
      },
    },
  },

  // ============== CAVES ==============
  caves: {
    id: "caves",
    name: "Пещеры",
    description: "Сырые пещерные лабиринты с мерцающими кристаллами и подземными реками.",
    accent: "#0ea5e9",
    roomLabels: {
      entrance: ["Вход в пещеру", "Трещина в скале", "Провал у ручья"],
      combat: ["Кристальный зал", "Грибная пещера", "Логово тварей", "Галерея сталактитов", "Слизкий грот"],
      loot: ["Залёжка руды", "Гнездо мародёра", "Сундук на островке", "Костёр контрабандистов"],
      npc: ["Лагерь спелеологов", "Убежище отшельника", "Пещерный посёлок", "Тайник проводника"],
      puzzle: ["Зал кристаллов", "Подземное озеро рун", "Сталактитовый мост", "Комната эха"],
      safe: ["Тёплый грот", "Поляна светящихся грибов", "Сухой навес", "Хижина в пещере"],
      boss: ["Логово пещерного дракона", "Сердце пещер", "Чёрный провал", "Трон из кристаллов"],
      trap: ["Скользкий карниз", "Глубокий провал", "Гнездо скорпионов", "Болото пузырей"],
    },
    monsters: resolveBiomeMonsters("caves"),
    bosses: [
      { name: "Пещерный дракон Витракс", hp: 95, ac: 16, damage: "2d10+5", attackBonus: 7, color: "#7f1d1d", description: "Слепой подземный вайверн с бледной чешуёй и пастью, полной сталактитовых зубов.", specialAbility: "Кислотное дыхание: раз в 3 раунда — конус 6 клеток, 6d6 урона кислотой (СПАС DEX 15 половина)." },
      { name: "Кристальная мать Шорак", hp: 75, ac: 17, damage: "2d8+4", attackBonus: 6, color: "#06b6d4", description: "Огромный паук-матка из живых кристаллов, чьё гнездо сплетено из сталактитов.", specialAbility: "Паутинный захват: цель в радиусе 3 должна СПАС DEX 14 или опутана (помеха на атаки, нет движения) на 1d3 раунда." },
    ],
    loot: [
      { name: "Зелье лечения", type: "potion", description: "Восстанавливает 2d4+2 HP." },
      { name: "Кристальный фокус", type: "misc", description: "+1 к атакам заклинаниями для магов." },
      { name: "Кирка рудокопа", type: "weapon", description: "Тяжёлая кирка, 1d6+1 дробящего." },
      { name: "Серебряная жила", type: "misc", description: "Слиток чистого серебра — дорого стоит." },
      { name: "Свиток «Свет»", type: "scroll", description: "Расходуемый свиток: освещает тьму на 1 час." },
    ],
    traps: [
      { type: "pit", label: "Глубокий провал", damage: 3, dc: 13, description: "Скрытая трещина в полу ведёт в бездну." },
      { type: "spike", label: "Каменные шипы", damage: 2, dc: 12, description: "Из пола выстреливают сталактиты." },
      { type: "poison", label: "Гнездо скорпионов", damage: 2, dc: 14, description: "Под камнем — рой ядовитых скорпионов." },
      { type: "arrow", label: "Дротикомёт гоблинов", damage: 2, dc: 12, description: "Гоблинская ловушка с отравленными дротиками." },
    ],
    npcs: [
      { name: "Рудокоп Гримбольд", role: "merchant", disposition: "neutral", location: "У штольни", notes: "Гном-рудокоп, продаёт оружие и припасы." },
      { name: "Друидка Сильвия", role: "ally", disposition: "friendly", location: "У ручья", notes: "Друидка, изучающая пещерную флору." },
      { name: "Спелеолог Торган", role: "questgiver", disposition: "neutral", location: "У лагеря", notes: "Ищет потерянную экспедицию." },
    ],
    imagePrompts: {
      atmosphere: "Dark fantasy underground caverns, glowing crystals, dripping stalactites, underground river, bioluminescent fungi, painterly concept art",
      perRoomType: {
        entrance: "Dark fantasy cave entrance, narrow crack in rock, dripping water, faint glow inside, painterly concept art",
        combat: "Dark fantasy cavern battle arena, scattered bones, broken mining tools, ominous shadows, painterly concept art",
        loot: "Dark fantasy cave treasure hoard, glittering crystals over gold pile, dead adventurer, painterly concept art",
        npc: "Dark fantasy cave camp, small fire, ragged tent, hooded figure, painterly concept art",
        puzzle: "Dark fantasy crystal puzzle cave, glowing formations in patterns, stone pedestal, painterly concept art",
        safe: "Dark fantasy cave safe grotto, warm fire, bedrolls, calm atmosphere, painterly concept art",
        boss: "Dark fantasy cave boss lair, enormous dragon on crystal hoard, dark pool, painterly concept art",
        trap: "Dark fantasy cave trap, hidden pit in floor, sharp stalagmites below, ominous darkness, painterly concept art",
      },
    },
  },

  // ============== TOWER ==============
  tower: {
    id: "tower",
    name: "Башня",
    description: "Чёрная башня мага, этаж за этажом — ловушки, големы и тайны.",
    accent: "#7c3aed",
    roomLabels: {
      entrance: ["Подножие башни", "Двустворчатые врата", "Винтовая лестница"],
      combat: ["Зал големов", "Библиотека теней", "Зал зеркал", "Кабинет опытов", "Часовня башни"],
      loot: ["Камора артефактов", "Кабинет алхимика", "Сейф мага", "Витрина реликвий"],
      npc: ["Келья ученика", "Лаборатория гостя", "Тайная библиотека", "Убежище предателя"],
      puzzle: ["Зал рунных кругов", "Комната рычагов", "Зеркальный коридор", "Кабинет загадок"],
      safe: ["Астрологический зал", "Башня отдыха", "Тихая обсерватория", "Зал камина"],
      boss: ["Вершина башни", "Трон чародея", "Зал призывов", "Сердце башни"],
      trap: ["Рунная ловушка", "Пол-телепорт", "Ловушка голема", "Зал молний"],
    },
    monsters: resolveBiomeMonsters("tower"),
    bosses: [
      { name: "Архимаг Велдрин", hp: 70, ac: 16, damage: "2d6+4", attackBonus: 7, color: "#6d28d9", description: "Седой чародей в фиолетовом халате, окружённый кольцами летающих рун.", specialAbility: "Цепная молния: раз в 2 раунда — 3 цели в радиусе 8, каждая 4d6 урона (СПАС DEX 15 половина)." },
      { name: "Голем-Хозяин башни", hp: 110, ac: 18, damage: "2d10+5", attackBonus: 7, color: "#a16207", description: "Огромный бронзовый колосс, чьё тело — сплав механизмов и магии.", specialAbility: "Земной удар: оглушает всех в радиусе 4 (СПАС CON 16) на 1 раунд." },
    ],
    loot: [
      { name: "Зелье маны", type: "potion", description: "Восстанавливает 1d3 ячейки заклинаний 1-го круга." },
      { name: "Посох молний", type: "weapon", description: "Фокус: 1d8 молнии, раз в день — 4d6 цепная молния." },
      { name: "Кольцо защиты +1", type: "armor", description: "+1 к Классу Доспеха, пока надето." },
      { name: "Свиток «Огненный шар»", type: "scroll", description: "Расходуемый свиток: 6d6 урона в радиусе 6." },
      { name: "Амулет мага", type: "misc", description: "+1 к атакам заклинаниями и СПАС." },
    ],
    traps: [
      { type: "rune", label: "Руна молнии", damage: 3, dc: 14, description: "Скрытая руна на полу бьёт молнией." },
      { type: "arrow", label: "Болтомёт голема", damage: 2, dc: 13, description: "Из стены вылетает бронзовый болт." },
      { type: "fire", label: "Огненная решётка", damage: 3, dc: 15, description: "Из пола вырывается струя пламени." },
      { type: "poison", label: "Газовая камера", damage: 2, dc: 14, description: "Вентиляция запечатывается, идёт зелёный газ." },
    ],
    npcs: [
      { name: "Библиотекарь Оррин", role: "merchant", disposition: "neutral", location: "У стеллажей", notes: "Призрак-библиотекарь, продаёт свитки." },
      { name: "Ученица Лиара", role: "ally", disposition: "friendly", location: "У камина", notes: "Беглая ученица архимага." },
      { name: "Дух Хозяина башни", role: "questgiver", disposition: "neutral", location: "В зеркале", notes: "Говорит загадками о прошлом башни." },
    ],
    imagePrompts: {
      atmosphere: "Dark fantasy wizard tower interior, spiral staircases, floating runes, magical sigils, arcane instruments, painterly concept art",
      perRoomType: {
        entrance: "Dark fantasy tower entrance, double stone doors, glowing runes, marble floor, painterly concept art",
        combat: "Dark fantasy tower combat hall, broken golem parts, scorch marks, ominous sigils, painterly concept art",
        loot: "Dark fantasy tower treasury, glass cases of artifacts, floating crystals, candlelight, painterly concept art",
        npc: "Dark fantasy tower apprentice cell, small fire, books, hooded student, painterly concept art",
        puzzle: "Dark fantasy tower rune room, glowing circles on floor, floating orbs, painterly concept art",
        safe: "Dark fantasy tower safe observatory, starry ceiling, comfortable chair, calm atmosphere, painterly concept art",
        boss: "Dark fantasy tower top floor, archmage throne, swirling magical energy, painterly concept art",
        trap: "Dark fantasy tower trap corridor, lightning runes on floor, hidden arrow slits, painterly concept art",
      },
    },
  },

  // ============== FOREST ==============
  forest: {
    id: "forest",
    name: "Лес",
    description: "Тёмный первобытный лес, где деревья шепчут и корни держат древнее зло.",
    accent: "#16a34a",
    roomLabels: {
      entrance: ["Опушка леса", "Тропа в чаще", "Каменный круг у входа"],
      combat: ["Заросли волков", "Поляна медведя", "Гнездо гоблинов", "Корни-убийцы", "Трясина тварей"],
      loot: ["Лагерь браконьеров", "Древнее капище", "Сундук у ручья", "Гнездо птенцов"],
      npc: ["Хижина отшельника", "Лагерь следопытов", "Святилище друида", "Тайный ночлег"],
      puzzle: ["Каменный круг", "Древо рун", "Зеркальный пруд", "Поляна светлячков"],
      safe: ["Поляна костра", "Тихая роща", "Сухой навес у скалы", "Священная дубрава"],
      boss: ["Сердце леса", "Древний луг", "Логово лешего", "Чёрный пень"],
      trap: ["Волчья яма", "Корни-путы", "Скрытая трясина", "Ядовитый терновник"],
    },
    monsters: resolveBiomeMonsters("forest"),
    bosses: [
      { name: "Леший Чернобор", hp: 75, ac: 15, damage: "2d8+4", attackBonus: 6, color: "#365314", description: "Древний дух леса в облике огромного человека с корой вместо кожи и рогами-ветвями.", specialAbility: "Корни-путы: раз в 2 раунда цель в радиусе 5 должна СПАС STR 15 или опутана корнями на 1d3 раунда." },
      { name: "Ведьма Моргана", hp: 65, ac: 14, damage: "2d6+3", attackBonus: 6, color: "#166534", description: "Сгорбленная старуха с длинными когтями и глазами, светящимися зелёным.", specialAbility: "Дыхание тлена: раз в 3 раунда — конус 5 клеток, 4d6 урона ядом (СПАС CON 14 половина) + отравление." },
    ],
    loot: [
      { name: "Зелье лечения", type: "potion", description: "Восстанавливает 2d4+2 HP." },
      { name: "Лук следопыта", type: "weapon", description: "Длинный лук, 1d8+2 колющего." },
      { name: "Кожаная броня", type: "armor", description: "+1 к AC, лёгкая." },
      { name: "Корень мандрагоры", type: "misc", description: "Алхимический реагент, дорогой." },
      { name: "Свиток «Гром-жезл»", type: "scroll", description: "Расходуемый свиток: 4d8 урона молнией." },
    ],
    traps: [
      { type: "pit", label: "Волчья яма", damage: 2, dc: 12, description: "Замаскированная ветками яма с кольями." },
      { type: "spike", label: "Корни-путы", damage: 2, dc: 13, description: "Ожившие корни опутывают ноги." },
      { type: "poison", label: "Ядовитый терновник", damage: 2, dc: 13, description: "Колючки пропитаны паралитическим ядом." },
      { type: "arrow", label: "Лук браконьера", damage: 2, dc: 12, description: "Натянутая тетива спускает стрелу." },
    ],
    npcs: [
      { name: "Следопыт Алдон", role: "ally", disposition: "friendly", location: "У тропы", notes: "Следопыт, охотящийся на тварей леса." },
      { name: "Друид Сильвия", role: "merchant", disposition: "neutral", location: "У дуба", notes: "Травница, продаёт зелья и притравки." },
      { name: "Отшельник Бран", role: "questgiver", disposition: "neutral", location: "В хижине", notes: "Знает тайны леса." },
    ],
    imagePrompts: {
      atmosphere: "Dark fantasy ancient forest, twisted gnarled trees, dense fog, shafts of moonlight, glowing eyes in shadow, painterly concept art",
      perRoomType: {
        entrance: "Dark fantasy forest path entrance, misty trail into dark woods, broken signpost, painterly concept art",
        combat: "Dark fantasy forest clearing, blood on grass, scattered bones, ominous shadows between trees, painterly concept art",
        loot: "Dark fantasy forest abandoned camp, weathered chest, scattered supplies, painterly concept art",
        npc: "Dark fantasy forest hermit hut, small fire, hooded figure, painterly concept art",
        puzzle: "Dark fantasy forest stone circle, glowing runes on menhirs, mist, painterly concept art",
        safe: "Dark fantasy forest safe glade, warm campfire, dry logs to sit on, calm atmosphere, painterly concept art",
        boss: "Dark fantasy forest boss glade, massive twisted tree with face, dark altar roots, painterly concept art",
        trap: "Dark fantasy forest trap, hidden pit under leaves, sharp stakes below, painterly concept art",
      },
    },
  },

  // ============== DUNGEON (default) ==============
  dungeon: {
    id: "dungeon",
    name: "Подземелье",
    description: "Классические каменные казематы — где-то здесь скрывается древнее зло.",
    accent: "#b91c1c",
    roomLabels: {
      entrance: ["Вход в подземелье", "Тёмный проход", "Расщелина у скалы"],
      combat: ["Тёмный зал", "Зал эха", "Костяная комната", "Зала теней", "Кровавый коридор"],
      loot: ["Забытая кладовая", "Сундучная", "Камора сокровищ", "Руины склада"],
      npc: ["Убежище отшельника", "Лагерь странника", "Келья жреца", "Тайная комната"],
      puzzle: ["Зал рун", "Комната загадок", "Резная зала", "Зеркальный зал"],
      safe: ["Укрытие", "Тихая часовня", "Поляна отдыха", "Зал костра"],
      boss: ["Тронный зал", "Логово", "Сердце подземелья", "Чёрный алтарь"],
      trap: ["Коварный коридор", "Зал лезвий", "Камера ловушек", "Гнилая ниша"],
    },
    monsters: resolveBiomeMonsters("dungeon"),
    bosses: [
      { name: "Тёмный рыцарь Вейн", hp: 85, ac: 17, damage: "2d8+5", attackBonus: 7, color: "#1c1917", description: "Павший паладин в чёрных латах с почерневшим двуручным клинком и горящими красными глазами.", specialAbility: "Тёмная волна: раз в 3 раунда — все в радиусе 5 получают 4d6 некротического урона (СПАС WIS 15 половина)." },
      { name: "Демон Азмодей", hp: 100, ac: 16, damage: "2d10+4", attackBonus: 7, color: "#7f1d1d", description: "Огромный рогатый демон с пылающей кнутом-клинком и кожей, источающей серный дым.", specialAbility: "Адское пламя: раз в 2 раунда — конус 6 клеток, 5d6 урона огнём (СПАС DEX 15 половина)." },
    ],
    loot: [
      { name: "Зелье лечения", type: "potion", description: "Восстанавливает 2d4+2 HP." },
      { name: "Длинный меч", type: "weapon", description: "Стальной клинок, 1d8+1." },
      { name: "Кольчуга", type: "armor", description: "Тяжёлая, +3 к AC." },
      { name: "Кольцо силы +1", type: "misc", description: "+1 к СИЛ, пока надето." },
      { name: "Свиток «Щит»", type: "scroll", description: "Расходуемый свиток: +2 к AC до конца боя." },
    ],
    traps: [
      { type: "spike", label: "Яма с шипами", damage: 2, dc: 13, description: "Скрытые шипы в полу." },
      { type: "arrow", label: "Болтомёт", damage: 2, dc: 13, description: "Из стены вылетает болт." },
      { type: "fire", label: "Огненная струя", damage: 3, dc: 15, description: "Из пола бьёт струя огня." },
      { type: "poison", label: "Ядовитый газ", damage: 2, dc: 14, description: "Из вентиляции идёт зелёный газ." },
    ],
    npcs: [
      { name: "Странник Алдон", role: "ally", disposition: "friendly", location: "У костра", notes: "Странствующий воин." },
      { name: "Торговка Нэн", role: "merchant", disposition: "neutral", location: "У повозки", notes: "Продаёт припасы." },
      { name: "Жрец Мортис", role: "questgiver", disposition: "neutral", location: "У алтаря", notes: "Просит очистить подземелье." },
    ],
    imagePrompts: {
      atmosphere: "Dark fantasy stone dungeon, torchlit corridors, mossy flagstones, ominous shadows, iron grates, painterly concept art",
      perRoomType: {
        entrance: "Dark fantasy dungeon entrance, stone archway, flickering torch, mist, ominous painterly concept art",
        combat: "Dark fantasy dungeon battle chamber, scattered bones, broken weapons, bloodstains, ominous shadows, painterly concept art",
        loot: "Dark fantasy dungeon treasure room, dusty chests, glimmering gold, cobwebs, candlelight, painterly concept art",
        npc: "Dark fantasy dungeon hermit camp, small fire, ragged bedroll, hooded figure, painterly concept art",
        puzzle: "Dark fantasy dungeon puzzle room, glowing runes on walls, stone pedestal, mysterious mechanism, painterly concept art",
        safe: "Dark fantasy dungeon safe refuge, warm campfire, straw bedrolls, calm atmosphere, painterly concept art",
        boss: "Dark fantasy dungeon boss lair, enormous throne of bone, dark altar, heavy shadows, looming threat, painterly concept art",
        trap: "Dark fantasy dungeon trap corridor, hidden spikes in floor, rusted arrow slits, ominous darkness, painterly concept art",
      },
    },
  },
};

/** List of all biome ids (for random selection). */
export const DUNGEON_BIOME_IDS: DungeonBiomeId[] = ["catacombs", "caves", "tower", "forest", "dungeon"];

/** Get a biome definition by id (falls back to "dungeon"). */
export function getBiome(id: string): DungeonBiome {
  return DUNGEON_BIOMES[id as DungeonBiomeId] ?? DUNGEON_BIOMES.dungeon;
}

/** Pick a random biome id. */
export function randomBiomeId(): DungeonBiomeId {
  return DUNGEON_BIOME_IDS[Math.floor(Math.random() * DUNGEON_BIOME_IDS.length)];
}

/** Pick a random element from an array. */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Get a random room label for a biome + room type. */
export function pickRoomLabel(biomeId: string, roomType: MapRoomType): string {
  const biome = getBiome(biomeId);
  const pool = biome.roomLabels[roomType];
  if (!pool || pool.length === 0) return roomType;
  return pick(pool);
}

/** Get the image prompt for a biome + room type. */
export function getImagePrompt(biomeId: string, roomType: MapRoomType): string {
  const biome = getBiome(biomeId);
  return biome.imagePrompts.perRoomType[roomType] ?? biome.imagePrompts.atmosphere;
}

/** Scale a biome monster to the party level (1..5). */
export function scaleBiomeMonster(
  m: BiomeMonster,
  partyLevel: number,
  label: string
) {
  const lvl = Math.max(1, Math.min(5, partyLevel));
  const hp = m.hp + (lvl - 1) * 4;
  const ac = m.ac + Math.floor((lvl - 1) / 2);
  const attackBonus = m.attackBonus + Math.floor((lvl - 1) / 2);
  return {
    name: m.name,
    label,
    hp,
    maxHp: hp,
    ac,
    damageNotation: m.damage,
    attackBonus,
    posX: 7 + Math.floor(Math.random() * 3),
    posY: 1 + Math.floor(Math.random() * 2),
    color: m.color,
    description: m.description,
  };
}

/** Scale a biome boss to party level — boss always gets 2× HP. */
export function scaleBiomeBoss(
  b: BiomeBoss,
  partyLevel: number,
  label: string
) {
  const lvl = Math.max(1, Math.min(5, partyLevel));
  const hp = b.hp * 2 + (lvl - 1) * 10;
  const ac = b.ac + Math.floor((lvl - 1) / 2);
  const attackBonus = b.attackBonus + Math.floor((lvl - 1) / 2);
  return {
    name: b.name,
    label,
    hp,
    maxHp: hp,
    ac,
    damageNotation: b.damage,
    attackBonus,
    posX: 8,
    posY: 1,
    color: b.color,
    description: `${b.description} Особая способность: ${b.specialAbility}`,
    isBoss: true,
    specialAbility: b.specialAbility,
  };
}
