// DUSKFALL bestiary — a curated catalogue of 50+ d20 fantasy RPG monsters grouped
// into 7 categories. Each entry carries balanced stats (CR 1/8 → 20) plus
// optional special abilities and loot tables.
//
// The catalogue is the single source of truth for monster data: the biome
// monster pools in dungeon-biomes.ts pull from it, the BestiaryPanel viewer
// browses it, and getDMContext annotates on-grid monsters with the matching
// entry's CR + special ability so the DM agent can narrate unique threats.
//
// All user-facing strings are in Russian (the `name` field); `nameEn` is a
// secondary English label for the bestiary viewer.

import { parseNotation } from "./dice";

// ---------- Categories ----------

export type MonsterCategory =
  | "humanoid"
  | "undead"
  | "beast"
  | "dragon"
  | "demon"
  | "elemental"
  | "boss"
  | "fiend"
  | "giant"
  | "aberration";

export const MONSTER_CATEGORIES: MonsterCategory[] = [
  "humanoid",
  "undead",
  "beast",
  "dragon",
  "demon",
  "elemental",
  "boss",
  "fiend",
  "giant",
  "aberration",
];

/** Russian label for a monster category (used in the BestiaryPanel UI). */
export function categoryLabelRu(c: MonsterCategory): string {
  switch (c) {
    case "humanoid":
      return "Гуманоиды";
    case "undead":
      return "Нежить";
    case "beast":
      return "Твари";
    case "dragon":
      return "Драконы";
    case "demon":
      return "Демоны";
    case "elemental":
      return "Элементали";
    case "boss":
      return "Боссы";
    case "fiend":
      return "Исчадия";
    case "giant":
      return "Гиганты";
    case "aberration":
      return "Аберрации";
  }
}

/** Tailwind colour classes for the category badge / accent. */
export function categoryColor(c: MonsterCategory): {
  badge: string;
  ring: string;
  dot: string;
  text: string;
} {
  switch (c) {
    case "humanoid":
      return {
        badge: "border-amber-700/50 bg-amber-950/40 text-amber-200",
        ring: "ring-amber-700/40",
        dot: "bg-amber-500",
        text: "text-amber-300",
      };
    case "undead":
      return {
        badge: "border-zinc-600/50 bg-zinc-800/40 text-zinc-200",
        ring: "ring-zinc-500/40",
        dot: "bg-zinc-400",
        text: "text-zinc-300",
      };
    case "beast":
      return {
        badge: "border-emerald-700/50 bg-emerald-950/40 text-emerald-200",
        ring: "ring-emerald-700/40",
        dot: "bg-emerald-500",
        text: "text-emerald-300",
      };
    case "dragon":
      return {
        badge: "border-red-700/50 bg-red-950/40 text-red-200",
        ring: "ring-red-700/40",
        dot: "bg-red-500",
        text: "text-red-300",
      };
    case "demon":
      return {
        badge: "border-purple-700/50 bg-purple-950/40 text-purple-200",
        ring: "ring-purple-700/40",
        dot: "bg-purple-500",
        text: "text-purple-300",
      };
    case "elemental":
      return {
        badge: "border-sky-700/50 bg-sky-950/40 text-sky-200",
        ring: "ring-sky-700/40",
        dot: "bg-sky-500",
        text: "text-sky-300",
      };
    case "boss":
      return {
        badge: "border-red-900/70 bg-red-950/60 text-red-100",
        ring: "ring-red-800/60",
        dot: "bg-red-700",
        text: "text-red-200",
      };
    case "fiend":
      return {
        badge: "border-orange-800/50 bg-orange-950/40 text-orange-200",
        ring: "ring-orange-700/40",
        dot: "bg-orange-600",
        text: "text-orange-300",
      };
    case "giant":
      return {
        badge: "border-stone-600/50 bg-stone-800/40 text-stone-200",
        ring: "ring-stone-500/40",
        dot: "bg-stone-500",
        text: "text-stone-300",
      };
    case "aberration":
      return {
        badge: "border-purple-800/50 bg-purple-950/40 text-purple-200",
        ring: "ring-purple-700/40",
        dot: "bg-purple-600",
        text: "text-purple-300",
      };
  }
}

// ---------- Entry shape ----------

export interface BestiaryLoot {
  gold: number;
  items: string[];
}

export interface BestiaryEntry {
  /** Stable kebab-case id (used as a key + by the biome pools). */
  id: string;
  /** Russian display name (shown to players). */
  name: string;
  /** English secondary name (shown in the bestiary viewer). */
  nameEn: string;
  category: MonsterCategory;
  /** Challenge Rating 1/8..20. Stored as a number — 0.125 represents 1/8,
   *  0.25 represents 1/4, 0.5 represents 1/2. */
  cr: number;
  hp: number;
  ac: number;
  /** Dice notation for the primary attack damage, e.g. "1d6+2". */
  damageNotation: string;
  attackBonus: number;
  /** Speed in grid cells per round. */
  speed: number;
  /** d20 fantasy RPG size: Tiny / Small / Medium / Large / Huge / Gargantuan. */
  size: string;
  /** Russian description / flavour text. */
  description: string;
  /** Optional unique ability blurb (already in Russian). */
  specialAbility?: string;
  /** Optional loot table — gold + named items. */
  loot?: BestiaryLoot;
}

// ---------- Helpers ----------

/** Find a bestiary entry by id. Returns undefined if not found. */
export function getBestiaryEntryById(id: string): BestiaryEntry | undefined {
  return BESTIARY.find((e) => e.id === id);
}

/** Case-insensitive lookup by Russian OR English name. Useful when matching
 *  on-grid monster names back to their bestiary entry (DM context). */
export function findBestiaryEntryByName(name: string): BestiaryEntry | undefined {
  const n = name.trim().toLowerCase();
  return BESTIARY.find(
    (e) => e.name.toLowerCase() === n || e.nameEn.toLowerCase() === n
  );
}

/** All entries in a given category. */
export function bestiaryByCategory(c: MonsterCategory): BestiaryEntry[] {
  return BESTIARY.filter((e) => e.category === c);
}

/** Format a CR for display: 0.125 → "1/8", 0.25 → "1/4", 0.5 → "1/2", else "N". */
export function formatCR(cr: number): string {
  if (cr === 0.125) return "1/8";
  if (cr === 0.25) return "1/4";
  if (cr === 0.5) return "1/2";
  return String(cr);
}

// ---------- The catalogue (51 entries) ----------

export const BESTIARY: BestiaryEntry[] = [
  // ============== HUMANOIDS (11) ==============
  {
    id: "goblin",
    name: "Гоблин",
    nameEn: "Goblin",
    category: "humanoid",
    cr: 0.25,
    hp: 7,
    ac: 13,
    damageNotation: "1d6+2",
    attackBonus: 4,
    speed: 6,
    size: "Small",
    description: "Кривоногий зеленошкурый мерзавец с ржавым ножом и вечно голодным взглядом.",
    loot: { gold: 5, items: ["Ржавый кинжал", "Потёртый кошель"] },
  },
  {
    id: "goblin-warrior",
    name: "Гоблин-воин",
    nameEn: "Goblin Warrior",
    category: "humanoid",
    cr: 0.5,
    hp: 14,
    ac: 14,
    damageNotation: "1d8+2",
    attackBonus: 4,
    speed: 6,
    size: "Small",
    description: "Гоблин в кожаном доспехе, обученный держать строй и бить коротким копьём.",
    loot: { gold: 12, items: ["Короткое копьё", "Кожаный доспех"] },
  },
  {
    id: "goblin-shaman",
    name: "Гоблин-шаман",
    nameEn: "Goblin Shaman",
    category: "humanoid",
    cr: 1,
    hp: 18,
    ac: 12,
    damageNotation: "1d8+2",
    attackBonus: 4,
    speed: 6,
    size: "Small",
    description: "Сгорбленный гоблин в маске из черепа крысы; сыплет проклятия и искры из костяного посоха.",
    specialAbility: "Боевой клич: раз в 3 раунда союзники-гоблины получают +1d4 к атакам на 1 раунд.",
    loot: { gold: 18, items: ["Костяной посох", "Свиток «Магическая стрела»"] },
  },
  {
    id: "hobgoblin",
    name: "Хобгоблин",
    nameEn: "Hobgoblin",
    category: "humanoid",
    cr: 1,
    hp: 22,
    ac: 16,
    damageNotation: "1d8+2",
    attackBonus: 5,
    speed: 6,
    size: "Medium",
    description: "Дисциплинированный солдат-гоблиноид в чешуйчатом доспехе; в бою держит строй.",
    specialAbility: "Воинский строй: пока рядом союзник-хобгоблин, имеет преимущество на атаки.",
    loot: { gold: 25, items: ["Длинный меч", "Чешуйчатый доспех"] },
  },
  {
    id: "orc",
    name: "Орк",
    nameEn: "Orc",
    category: "humanoid",
    cr: 0.5,
    hp: 15,
    ac: 13,
    damageNotation: "1d12+2",
    attackBonus: 5,
    speed: 6,
    size: "Medium",
    description: "Мышцеподобный зелёный дикарь с огромным топором; не знает страха и пощады.",
    loot: { gold: 15, items: ["Боевой топор", "Амулет из клыков"] },
  },
  {
    id: "orc-brute",
    name: "Орк-громила",
    nameEn: "Orc Brute",
    category: "humanoid",
    cr: 2,
    hp: 42,
    ac: 14,
    damageNotation: "2d6+3",
    attackBonus: 6,
    speed: 6,
    size: "Medium",
    description: "Огромный орк-ветеран в рогатом шлеме; одним ударом ломает щиты пополам.",
    specialAbility: "Свирепость: при попадании 20 на атаке кидает дополнительный кубик урона.",
    loot: { gold: 40, items: ["Двуручный топор", "Рогатый шлем"] },
  },
  {
    id: "bandit",
    name: "Разбойник",
    nameEn: "Bandit",
    category: "humanoid",
    cr: 0.125,
    hp: 9,
    ac: 12,
    damageNotation: "1d6+1",
    attackBonus: 3,
    speed: 6,
    size: "Medium",
    description: "Заросший головорез с дороги; бьёт булавой, грабит кошельки.",
    loot: { gold: 10, items: ["Булава", "Потрёпанный плащ"] },
  },
  {
    id: "bandit-captain",
    name: "Атаман разбойников",
    nameEn: "Bandit Captain",
    category: "humanoid",
    cr: 2,
    hp: 39,
    ac: 15,
    damageNotation: "1d8+3",
    attackBonus: 6,
    speed: 6,
    size: "Medium",
    description: "Бывший наёмник с шрамом через всё лицо; ведёт банду умело и безжалостно.",
    specialAbility: "Финт: раз в 2 раунда цель имеет помеху на следующую атаку.",
    loot: { gold: 60, items: ["Рапира", "Кожаная броня +1", "Ключ от сундука"] },
  },
  {
    id: "cultist",
    name: "Культист",
    nameEn: "Cultist",
    category: "humanoid",
    cr: 0.125,
    hp: 9,
    ac: 12,
    damageNotation: "1d6+1",
    attackBonus: 3,
    speed: 6,
    size: "Medium",
    description: "Робкий фанатик в капюшоне; жертвенный кинжал всегда при нём.",
    loot: { gold: 8, items: ["Жертвенный кинжал", "Тёмный свиток"] },
  },
  {
    id: "cult-fanatic",
    name: "Культ-фанатик",
    nameEn: "Cult Fanatic",
    category: "humanoid",
    cr: 2,
    hp: 33,
    ac: 13,
    damageNotation: "2d6+2",
    attackBonus: 5,
    speed: 6,
    size: "Medium",
    description: "Багрово-одетый проповедник; глаза горят тёмным огнём чужого бога.",
    specialAbility: "Тёмный огонь: раз в 3 раунда — 3d6 урона огнём в радиусе 3 (СПАС DEX 13 половина).",
    loot: { gold: 55, items: ["Багровый жезл", "Свиток «Тьма»"] },
  },
  {
    id: "necromancer",
    name: "Некромант",
    nameEn: "Necromancer",
    category: "humanoid",
    cr: 5,
    hp: 60,
    ac: 14,
    damageNotation: "2d6+3",
    attackBonus: 7,
    speed: 6,
    size: "Medium",
    description: "Сгорбленный маг в чёрном балахоне; глаза горят могильным огнём. Поднимает мертвецов.",
    specialAbility: "Призыв костяных слуг: раз в 3 раунда поднимает 1d2 скелета.",
    loot: { gold: 120, items: ["Посох из костей", "Книга некромантии", "Кольцо защиты +1"] },
  },

  // ============== UNDEAD (8) ==============
  {
    id: "skeleton",
    name: "Скелет-воин",
    nameEn: "Skeleton",
    category: "undead",
    cr: 0.25,
    hp: 13,
    ac: 13,
    damageNotation: "1d6+2",
    attackBonus: 4,
    speed: 6,
    size: "Medium",
    description: "Бессмертный костяной страж с ржавым мечом и тлеющими провалами глаз.",
    loot: { gold: 0, items: ["Ржавый меч"] },
  },
  {
    id: "zombie",
    name: "Восставший труп",
    nameEn: "Zombie",
    category: "undead",
    cr: 0.25,
    hp: 22,
    ac: 12,
    damageNotation: "1d6+2",
    attackBonus: 4,
    speed: 4,
    size: "Medium",
    description: "Разбухший от тлена покойник с мёртвой хваткой; не чувствует боли.",
    specialAbility: "Нежить-стойкость: при уроне, доводящей до 0 HP, СПАС CON 5+ чтобы остаться с 1 HP.",
    loot: { gold: 0, items: ["Гнилые лохмотья"] },
  },
  {
    id: "ghoul",
    name: "Гуль",
    nameEn: "Ghoul",
    category: "undead",
    cr: 1,
    hp: 22,
    ac: 14,
    damageNotation: "2d4+2",
    attackBonus: 5,
    speed: 6,
    size: "Medium",
    description: "Худое бессмысленное существо с длинными когтями; питается мертвечиной и живыми.",
    specialAbility: "Паралич: при попадании цель СПАС CON 10 или парализована на 1 раунд.",
    loot: { gold: 5, items: ["Когти гуля"] },
  },
  {
    id: "shadow",
    name: "Тень",
    nameEn: "Shadow",
    category: "undead",
    cr: 0.5,
    hp: 16,
    ac: 14,
    damageNotation: "1d6+2",
    attackBonus: 5,
    speed: 6,
    size: "Medium",
    description: "Полупрозрачный дух, чьё прикосновение вытягивает силу из живых.",
    specialAbility: "Истощение силы: при попадании цель получает −1 к атакам до конца боя (стойка до 3).",
    loot: { gold: 0, items: [] },
  },
  {
    id: "wight",
    name: "Баррог",
    nameEn: "Wight",
    category: "undead",
    cr: 3,
    hp: 45,
    ac: 15,
    damageNotation: "1d8+3",
    attackBonus: 6,
    speed: 6,
    size: "Medium",
    description: "Восставший воин-вождь в почерневших доспехах; его клинок пьёт жизнь.",
    specialAbility: "Похищение жизни: при попадании лечит себя на половину нанесённого урона.",
    loot: { gold: 50, items: ["Длинный меч баррога", "Почерневший доспех"] },
  },
  {
    id: "wraith",
    name: "Призрак",
    nameEn: "Wraith",
    category: "undead",
    cr: 5,
    hp: 67,
    ac: 15,
    damageNotation: "2d6+3",
    attackBonus: 7,
    speed: 8,
    size: "Medium",
    description: "Бестелесный дух-властелин, парящий над полом; его холод разъедает самые души.",
    specialAbility: "Смертельный холод: раз в 2 раунда — цель СПАС CON 14 или теряет 1d6 макс. HP.",
    loot: { gold: 80, items: ["Эфирный плащ", "Кольцо сопротивления некротике"] },
  },
  {
    id: "banshee",
    name: "Банши",
    nameEn: "Banshee",
    category: "undead",
    cr: 4,
    hp: 58,
    ac: 13,
    damageNotation: "2d6+2",
    attackBonus: 6,
    speed: 8,
    size: "Medium",
    description: "Призрачная дева в разорванном саване; её вопрь пронзает сердце ужасом.",
    specialAbility: "Ужасающий вопль: раз в 3 раунда — все в радиусе 9 СПАС CON 13 или 3d6 некротического урона.",
    loot: { gold: 60, items: ["Гребень банши", "Серебряное зеркальце"] },
  },
  {
    id: "lich",
    name: "Лич",
    nameEn: "Lich",
    category: "undead",
    cr: 18,
    hp: 315,
    ac: 19,
    damageNotation: "3d10+5",
    attackBonus: 12,
    speed: 6,
    size: "Medium",
    description: "Древний маг-нежить, чья душа спрятана в филактерии; владыка костяных армий.",
    specialAbility: "Дыхание тлена: раз в 3 раунда, 6d6 урона по линии 12 клеток (СПАС CON 18 половина).",
    loot: { gold: 1500, items: ["Посох архимага", "Книга заклинаний лича", "Филактерия", "Корона тлена"] },
  },

  // ============== BEASTS (8) ==============
  {
    id: "wolf",
    name: "Волк",
    nameEn: "Wolf",
    category: "beast",
    cr: 0.25,
    hp: 11,
    ac: 13,
    damageNotation: "1d6+2",
    attackBonus: 5,
    speed: 8,
    size: "Medium",
    description: "Серый лесной охотник; бьёт стаей и загоняет добычу.",
    specialAbility: "Атака стаей: преимущество на атаку, если союзник-волк рядом с целью.",
    loot: { gold: 0, items: ["Шкура волка"] },
  },
  {
    id: "dire-wolf",
    name: "Лютоволк",
    nameEn: "Dire Wolf",
    category: "beast",
    cr: 1,
    hp: 37,
    ac: 14,
    damageNotation: "1d10+3",
    attackBonus: 5,
    speed: 10,
    size: "Large",
    description: "Огромный волк размером с телёнка; клыки легко пробивают кольчугу.",
    specialAbility: "Сбивание с ног: при попадании цель СПАС STR 13 или сбита с ног.",
    loot: { gold: 0, items: ["Шкура лютоволка"] },
  },
  {
    id: "giant-spider",
    name: "Гигантский паук",
    nameEn: "Giant Spider",
    category: "beast",
    cr: 1,
    hp: 26,
    ac: 14,
    damageNotation: "1d8+2",
    attackBonus: 5,
    speed: 8,
    size: "Large",
    description: "Сколопендровый паук с размахом лап в три метра; прыгает с потолка на жертву.",
    specialAbility: "Паутина: цель СПАС DEX 12 или опутана (помеха на атаки, нет движения) на 1d3 раунда.",
    loot: { gold: 0, items: ["Ядовитые железы", "Паутинный шёлк"] },
  },
  {
    id: "giant-rat",
    name: "Гигантская крыса",
    nameEn: "Giant Rat",
    category: "beast",
    cr: 0.125,
    hp: 9,
    ac: 12,
    damageNotation: "1d4+1",
    attackBonus: 4,
    speed: 7,
    size: "Small",
    description: "Сковрадная зубастая крыса размером с кошку; нападает стаей.",
    loot: { gold: 0, items: [] },
  },
  {
    id: "boar",
    name: "Кабан-вепрь",
    nameEn: "Boar",
    category: "beast",
    cr: 0.5,
    hp: 17,
    ac: 11,
    damageNotation: "1d8+3",
    attackBonus: 5,
    speed: 8,
    size: "Medium",
    description: "Огромный клыкастый вепрь с налитыми кровью глазами; несётся напролом.",
    specialAbility: "Натиск: при движении 4+ клеток перед атакой +1d6 урона клыками.",
    loot: { gold: 0, items: ["Клыки вепря"] },
  },
  {
    id: "brown-bear",
    name: "Бурый медведь",
    nameEn: "Brown Bear",
    category: "beast",
    cr: 1,
    hp: 34,
    ac: 11,
    damageNotation: "1d8+4",
    attackBonus: 6,
    speed: 8,
    size: "Large",
    description: "Разъярённая медведица-мать; две атаки когтями и укусом за раунд.",
    specialAbility: "Двойная атака: атакует дважды за ход (когти + укус).",
    loot: { gold: 0, items: ["Шкура медведя"] },
  },
  {
    id: "cave-bat-swarm",
    name: "Рой пещерных мышей",
    nameEn: "Cave Bat Swarm",
    category: "beast",
    cr: 0.5,
    hp: 22,
    ac: 14,
    damageNotation: "2d4",
    attackBonus: 4,
    speed: 8,
    size: "Medium",
    description: "Туча визжащих кожаных крыльев; застилает глаза и кусает сотней мелких ртов.",
    specialAbility: "Рой: занимает чужую клетку; имеет помеху от дробящего урона.",
    loot: { gold: 0, items: [] },
  },
  {
    id: "owl",
    name: "Сова",
    nameEn: "Owl",
    category: "beast",
    cr: 0.125,
    hp: 5,
    ac: 13,
    damageNotation: "1d4",
    attackBonus: 3,
    speed: 10,
    size: "Tiny",
    description: "Ночная охотница с бесшумным полётом; часто шпион для друидов.",
    specialAbility: "Бесшумный налёт: не провоцирует ответную атаку при вылете из рукопашной.",
    loot: { gold: 0, items: [] },
  },

  // ============== DRAGONS (6) ==============
  {
    id: "kobold",
    name: "Кобольд",
    nameEn: "Kobold",
    category: "dragon",
    cr: 0.125,
    hp: 11,
    ac: 12,
    damageNotation: "1d4+2",
    attackBonus: 4,
    speed: 6,
    size: "Small",
    description: "Мелкий чешуйчатый гуманоид с киркой и злобными глазами-бусинами; служит драконам.",
    specialAbility: "Атака стаей: преимущество на атаку, если союзник-кобольд рядом с целью.",
    loot: { gold: 3, items: ["Кирка", "Кобольдский тотем"] },
  },
  {
    id: "wyvern",
    name: "Виверна",
    nameEn: "Wyvern",
    category: "dragon",
    cr: 6,
    hp: 130,
    ac: 16,
    damageNotation: "2d8+5",
    attackBonus: 8,
    speed: 6,
    size: "Huge",
    description: "Двуногий драконид с жалом на хвосте; хищник небес и горных круч.",
    specialAbility: "Ядовитое жало: при попадании цель СПАС CON 14 или 3d6 урона ядом + отравление.",
    loot: { gold: 200, items: ["Чешуя виверны", "Жало виверны"] },
  },
  {
    id: "young-white-dragon",
    name: "Молодой белый дракон",
    nameEn: "Young White Dragon",
    category: "dragon",
    cr: 6,
    hp: 133,
    ac: 17,
    damageNotation: "2d10+5",
    attackBonus: 9,
    speed: 8,
    size: "Large",
    description: "Холодный охотник севера; чешуя как ледяной панцирь, дыхание замораживает плоть.",
    specialAbility: "Ледяное дыхание: раз в 3 раунда — конус 6 клеток, 6d6 урона холодом (СПАС CON 14 половина).",
    loot: { gold: 300, items: ["Чешуя белого дракона", "Мешочек драконьих монет"] },
  },
  {
    id: "young-red-dragon",
    name: "Молодой красный дракон",
    nameEn: "Young Red Dragon",
    category: "dragon",
    cr: 10,
    hp: 178,
    ac: 18,
    damageNotation: "2d10+6",
    attackBonus: 10,
    speed: 8,
    size: "Large",
    description: "Гордый хищник с пламенным нутром; одно дыхание — и деревня пепел.",
    specialAbility: "Огненное дыхание: раз в 3 раунда — конус 6 клеток, 8d6 урона огнём (СПАС DEX 15 половина).",
    loot: { gold: 600, items: ["Чешуя красного дракона", "Рубин", "Слиток адамантита"] },
  },
  {
    id: "adult-black-dragon",
    name: "Взрослый чёрный дракон",
    nameEn: "Adult Black Dragon",
    category: "dragon",
    cr: 14,
    hp: 195,
    ac: 19,
    damageNotation: "2d10+7",
    attackBonus: 11,
    speed: 8,
    size: "Huge",
    description: "Болотный владыка-тиран; его кислота разъедает камень, плоть и сталь.",
    specialAbility: "Кислотное дыхание: раз в 3 раунда — линия 12 клеток, 10d6 урона кислотой (СПАС DEX 16 половина).",
    loot: { gold: 1200, items: ["Чешуя чёрного дракона", "Чёрный алмаз", "Кислотный фиал"] },
  },
  {
    id: "ancient-green-dragon",
    name: "Древний зелёный дракон",
    nameEn: "Ancient Green Dragon",
    category: "dragon",
    cr: 20,
    hp: 385,
    ac: 21,
    damageNotation: "3d10+8",
    attackBonus: 14,
    speed: 10,
    size: "Gargantuan",
    description: "Древний лукавый владыка джунглей; его шёпот развращает разум целых королевств.",
    specialAbility: "Ядовитое дыхание: раз в 3 раунда — конус 9 клеток, 12d6 урона ядом (СПАС CON 18 половина).",
    loot: { gold: 5000, items: ["Чешуя древнего дракона", "Изумруд гигантский", "Корона листвы", "Свиток «Дыхание дракона»"] },
  },

  // ============== DEMONS (6) ==============
  {
    id: "imp",
    name: "Бес",
    nameEn: "Imp",
    category: "demon",
    cr: 1,
    hp: 21,
    ac: 15,
    damageNotation: "1d4+3",
    attackBonus: 5,
    speed: 6,
    size: "Tiny",
    description: "Рогатый шпионишка из Бездны; ядовитое жало и коварный ум.",
    specialAbility: "Невидимость: раз в 5 раунда становится невидимым до следующей атаки.",
    loot: { gold: 0, items: ["Жало беса"] },
  },
  {
    id: "quasit",
    name: "Квазит",
    nameEn: "Quasit",
    category: "demon",
    cr: 1,
    hp: 19,
    ac: 15,
    damageNotation: "1d4+3",
    attackBonus: 5,
    speed: 7,
    size: "Tiny",
    description: "Мелкий демон-фамильяр; меняет форму между кошкой, жабой и летучей мышью.",
    specialAbility: "Страх-когти: при попадании цель СПАС WIS 11 или испугана 1 раунд.",
    loot: { gold: 0, items: ["Коготь квазита"] },
  },
  {
    id: "succubus",
    name: "Суккуб",
    nameEn: "Succubus",
    category: "demon",
    cr: 4,
    hp: 60,
    ac: 15,
    damageNotation: "2d6+3",
    attackBonus: 7,
    speed: 6,
    size: "Medium",
    description: "Прекрасная искусительница из Бездны; её поцелуй выпивает волю.",
    specialAbility: "Очарование: раз в 3 раунда — цель СПАС WIS 14 или очарована (атакуёт союзников) 1d4 раунда.",
    loot: { gold: 100, items: ["Амулет соблазна"] },
  },
  {
    id: "shadow-demon",
    name: "Теневой демон",
    nameEn: "Shadow Demon",
    category: "demon",
    cr: 4,
    hp: 66,
    ac: 16,
    damageNotation: "2d6+3",
    attackBonus: 7,
    speed: 8,
    size: "Medium",
    description: "Бестелесная тень-демон; перемещается сквозь стены и гасит свет.",
    specialAbility: "Слияние с тьмой: в темноте имеет преимущество на атаки и уклонение.",
    loot: { gold: 50, items: ["Эссенция тьмы"] },
  },
  {
    id: "vrock",
    name: "Врок",
    nameEn: "Vrock",
    category: "demon",
    cr: 6,
    hp: 104,
    ac: 17,
    damageNotation: "2d6+4",
    attackBonus: 8,
    speed: 8,
    size: "Large",
    description: "Птицеподобный демон-стервятник; его вопль разрывает барабанные перепонки.",
    specialAbility: "Смрадное споровое облако: раз в 3 раунда — радиус 4, 3d6 урона ядом + оглушение (СПАС CON 14).",
    loot: { gold: 180, items: ["Перо врока", "Демонический коготь"] },
  },
  {
    id: "balor",
    name: "Балор",
    nameEn: "Balor",
    category: "demon",
    cr: 19,
    hp: 285,
    ac: 19,
    damageNotation: "3d10+8",
    attackBonus: 13,
    speed: 10,
    size: "Huge",
    description: "Генерал армий Бездны; пылающий кнут-клинок и крылья из серного пламени.",
    specialAbility: "Взрыв смерти: при гибели взрывается — 8d6 урона огнём в радиусе 9 (СПАС DEX 18 половина).",
    loot: { gold: 3000, items: ["Пылающий кнут", "Демонический клинок", "Сердце балора"] },
  },

  // ============== ELEMENTALS (6) ==============
  {
    id: "fire-elemental",
    name: "Огненный элементаль",
    nameEn: "Fire Elemental",
    category: "elemental",
    cr: 5,
    hp: 60,
    ac: 17,
    damageNotation: "2d6+3",
    attackBonus: 7,
    speed: 10,
    size: "Large",
    description: "Столб живого пламени; касается — и тело вспыхивает.",
    specialAbility: "Поджог: при попадании цель загорается (1d6 огня в начале её хода, СПАС DEX 13 чтобы погасить).",
    loot: { gold: 0, items: ["Эссенция огня"] },
  },
  {
    id: "water-elemental",
    name: "Водный элементаль",
    nameEn: "Water Elemental",
    category: "elemental",
    cr: 5,
    hp: 60,
    ac: 16,
    damageNotation: "2d8+3",
    attackBonus: 7,
    speed: 8,
    size: "Large",
    description: "Поток тёмной воды в гуманоидной форме; затягивает жертв в свою воронку.",
    specialAbility: "Захват волной: при попадании цель СПАС STR 14 или затянута (помеха на действия) 1 раунд.",
    loot: { gold: 0, items: ["Эссенция воды"] },
  },
  {
    id: "earth-elemental",
    name: "Земляной элементаль",
    nameEn: "Earth Elemental",
    category: "elemental",
    cr: 5,
    hp: 70,
    ac: 18,
    damageNotation: "2d8+4",
    attackBonus: 7,
    speed: 6,
    size: "Large",
    description: "Гранитный колосс, поднимающийся из скалы; удары кулаком-валуном.",
    specialAbility: "Земляной шаг: раз в 3 раунда проходит сквозь камень 5 клеток, не провоцируя атак.",
    loot: { gold: 0, items: ["Эссенция земли"] },
  },
  {
    id: "air-elemental",
    name: "Воздушный элементаль",
    nameEn: "Air Elemental",
    category: "elemental",
    cr: 5,
    hp: 50,
    ac: 18,
    damageNotation: "2d6+3",
    attackBonus: 7,
    speed: 12,
    size: "Large",
    description: "Вихрь воздуха; мечется с быстротой урагана, сбивая с ног.",
    specialAbility: "Вихрь: раз в 2 раунда все в радиусе 2 получают 2d6 дробящего + СПАС STR 13 или сбиты с ног.",
    loot: { gold: 0, items: ["Эссенция воздуха"] },
  },
  {
    id: "ice-mephit",
    name: "Ледяной мефит",
    nameEn: "Ice Mephit",
    category: "elemental",
    cr: 0.5,
    hp: 21,
    ac: 14,
    damageNotation: "1d6+2",
    attackBonus: 4,
    speed: 6,
    size: "Small",
    description: "Маленький дух льда с острыми сосульками-когтями; хихикает, замораживая жертв.",
    specialAbility: "Ледяное дыхание: раз в 2 раунда — конус 3 клетки, 2d6 урона холодом (СПАС CON 11 половина).",
    loot: { gold: 5, items: ["Осколок льда"] },
  },
  {
    id: "lightning-mephit",
    name: "Молнийный мефит",
    nameEn: "Lightning Mephit",
    category: "elemental",
    cr: 0.5,
    hp: 21,
    ac: 14,
    damageNotation: "1d6+2",
    attackBonus: 4,
    speed: 6,
    size: "Small",
    description: "Покрытый статическим электричеством дух бури; искрит и трещит.",
    specialAbility: "Статический разряд: раз в 2 раунда — 2 цели в радиусе 3, по 1d8 урона молнией (СПАС DEX 11).",
    loot: { gold: 5, items: ["Статический кристалл"] },
  },

  // ============== BOSSES (6) ==============
  {
    id: "the-bone-lord",
    name: "Костяной Лорд",
    nameEn: "The Bone Lord",
    category: "boss",
    cr: 12,
    hp: 180,
    ac: 18,
    damageNotation: "2d8+5",
    attackBonus: 10,
    speed: 6,
    size: "Huge",
    description: "Огромный рыцарь-скелет в ржавых латах; на его черепе — корона из пальцев павших врагов.",
    specialAbility: "Ужасающий клич: первый ход боя накладывает «испуг» на всех в радиусе 6 (СПАС WIS 14).",
    loot: { gold: 800, items: ["Корона из пальцев", "Ржавый двуручный меч", "Костяной доспех"] },
  },
  {
    id: "valthraxis-the-red",
    name: "Вальтраксис Красный",
    nameEn: "Valthraxis the Red",
    category: "boss",
    cr: 17,
    hp: 297,
    ac: 20,
    damageNotation: "3d10+8",
    attackBonus: 13,
    speed: 10,
    size: "Huge",
    description: "Древний красный дракон-тиран; его дыхание сжигает города дотла, а рёв сотрясает небо.",
    specialAbility: "Огненное дыхание: раз в 3 раунда, 6d6 урона по линии 12 клеток (СПАС DEX 18 половина).",
    loot: { gold: 4000, items: ["Чешуя Вальтраксиса", "Сердце дракона", "Огненный посох", "Кубок королей"] },
  },
  {
    id: "malaphax-demon-prince",
    name: "Малафакс Князь Демонов",
    nameEn: "Malaphax the Demon Prince",
    category: "boss",
    cr: 19,
    hp: 333,
    ac: 20,
    damageNotation: "3d10+9",
    attackBonus: 14,
    speed: 10,
    size: "Huge",
    description: "Воплощение Бездны; шесть рук сжимают ритуальные клинки, под его ногами тлеет сама земля.",
    specialAbility: "Адское пламя: раз в 2 раунда — конус 8 клеток, 8d6 урона огнём (СПАС DEX 18 половина) + поджог.",
    loot: { gold: 5000, items: ["Шестиклинок Малафакса", "Сердце Бездны", "КоронаКнязя", "Свиток «Метеор»"] },
  },
  {
    id: "krell-bandit-king",
    name: "Крелл Король Разбойников",
    nameEn: "Krell the Bandit King",
    category: "boss",
    cr: 8,
    hp: 130,
    ac: 17,
    damageNotation: "2d8+4",
    attackBonus: 8,
    speed: 6,
    size: "Medium",
    description: "Бывший лорд-маршал, ставший главарём дорожного братства; его топор запомнила каждая таверна королевства.",
    specialAbility: "Громовой удар: раз в 3 раунда — все в радиусе 2 получают 3d8 дробящего (СПАС STR 15 половина).",
    loot: { gold: 700, items: ["Топор Крелла", "Корона из монет", "Кольцо власти +2"] },
  },
  {
    id: "archmage-zorander",
    name: "Архимаг Зорандер",
    nameEn: "Archmage Zorander",
    category: "boss",
    cr: 12,
    hp: 165,
    ac: 18,
    damageNotation: "2d10+4",
    attackBonus: 10,
    speed: 6,
    size: "Medium",
    description: "Седой чародей в фиолетовом халате; кольцо летающих рун окружает его голову ореолом.",
    specialAbility: "Цепная молния: раз в 2 раунда — 3 цели в радиусе 8, каждая 4d6 урона (СПАС DEX 15 половина).",
    loot: { gold: 1200, items: ["Посох архимага", "Книга заклинаний Зорандера", "Кольцо защиты +2"] },
  },
  {
    id: "the-forgotten-one",
    name: "Забытый",
    nameEn: "The Forgotten One",
    category: "boss",
    cr: 20,
    hp: 425,
    ac: 22,
    damageNotation: "4d10+9",
    attackBonus: 14,
    speed: 8,
    size: "Gargantuan",
    description: "Бестелесная тварь из-за грани бытия; её имя стёрто из самой ткани мира. Лишь безумцы помнят её форму.",
    specialAbility: "Столп забвения: раз в 3 раунда — все в радиусе 10 СПАС WIS 18 или теряют память (помеха на всё) 1d4 раунда.",
    loot: { gold: 6666, items: ["Чехол забвения", "Слеза Забытого", "Артефакт Граней"] },
  },
  // ===== Additional monsters (D&D 5e SRD) =====
  {
    id: "giant-spider",
    name: "Гигантский паук",
    nameEn: "Giant Spider",
    category: "beast",
    cr: 1,
    hp: 26,
    ac: 14,
    damageNotation: "1d8+2",
    attackBonus: 5,
    speed: 6,
    size: "Large",
    description: "Крупный паук с восемью глазами, плетущий паутину между деревьями.",
    specialAbility: "Паутина: раз в 3 раунда — СПАС ТЕЛ 12 или связан паутиной (скорость 0).",
    loot: { gold: 0, items: ["Яд паука"] },
  },
  {
    id: "dire-wolf",
    name: "Лютоволк",
    nameEn: "Dire Wolf",
    category: "beast",
    cr: 1,
    hp: 37,
    ac: 14,
    damageNotation: "2d6+3",
    attackBonus: 5,
    speed: 8,
    size: "Large",
    description: "Огромный серый волк размером с лошадь, с клыками длиной в ладонь.",
    specialAbility: "Сбивание с ног: при попадании СПАС СИЛ 13 или сбит с ног.",
    loot: { gold: 0, items: ["Шкура лютоволка"] },
  },
  {
    id: "ogre",
    name: "Огр",
    nameEn: "Ogre",
    category: "humanoid",
    cr: 2,
    hp: 60,
    ac: 11,
    damageNotation: "2d8+4",
    attackBonus: 6,
    speed: 6,
    size: "Large",
    description: "Громадный тупоголовый гигант с дубиной размером с бревно.",
    specialAbility: "Двойная атака: бьёт дважды дубиной за ход.",
    loot: { gold: 50, items: ["Дубина огра"] },
  },
  {
    id: "ghoul",
    name: "Гуль",
    nameEn: "Ghoul",
    category: "undead",
    cr: 1,
    hp: 22,
    ac: 12,
    damageNotation: "2d4+2",
    attackBonus: 2,
    speed: 6,
    size: "Medium",
    description: "Искажённый голодом труп с острыми когтями и зубами.",
    specialAbility: "Паралич: при попадании когтями СПАС ТЕЛ 10 или парализован 1 раунд.",
    loot: { gold: 0, items: [] },
  },
  {
    id: "wraith",
    name: "Призрак",
    nameEn: "Wraith",
    category: "undead",
    cr: 5,
    hp: 67,
    ac: 13,
    damageNotation: "4d8+3",
    attackBonus: 6,
    speed: 8,
    size: "Medium",
    description: "Полупрозрачная фигура в чёрном плаще, сотканная из тьмы и ненависти.",
    specialAbility: "Похищение жизни: при попадании лечит себя на половину нанесённого урона.",
    loot: { gold: 100, items: ["Эссенция тьмы"] },
  },
  {
    id: "troll",
    name: "Тролль",
    nameEn: "Troll",
    category: "giant",
    cr: 5,
    hp: 84,
    ac: 15,
    damageNotation: "2d6+4",
    attackBonus: 7,
    speed: 6,
    size: "Large",
    description: "Тощий зелёный гигант с длинными когтями. Регенерирует раны, если не сожжён.",
    specialAbility: "Регенерация: +10 HP в начале хода. Не работает от огня/кислоты.",
    loot: { gold: 30, items: [] },
  },
  {
    id: "young-dragon",
    name: "Молодой дракон",
    nameEn: "Young Dragon",
    category: "dragon",
    cr: 7,
    hp: 110,
    ac: 17,
    damageNotation: "2d10+6",
    attackBonus: 9,
    speed: 10,
    size: "Large",
    description: "Молодой дракон с блестящей чешуёй и обжигающим дыханием.",
    specialAbility: "Дыхание: раз в 3 раунда — конус 6 клеток, 7d6 урона (СПАС ЛОВ 15 половина).",
    loot: { gold: 500, items: ["Чешуя дракона", "Зуб дракона"] },
  },
  {
    id: "hell-hound",
    name: "Адский гончий",
    nameEn: "Hell Hound",
    category: "fiend",
    cr: 3,
    hp: 45,
    ac: 15,
    damageNotation: "2d6+3",
    attackBonus: 5,
    speed: 8,
    size: "Medium",
    description: "Чёрный пёс с горящей шерстью и огненными глазами. Дышит огнём.",
    specialAbility: "Огненное дыхание: раз в 3 раунда — 6d6 урона огнём в линии 5 клеток (СПАС ЛОВ 13 половина).",
    loot: { gold: 0, items: ["Огненный клык"] },
  },
  {
    id: "minotaur",
    name: "Минотавр",
    nameEn: "Minotaur",
    category: "giant",
    cr: 3,
    hp: 76,
    ac: 14,
    damageNotation: "2d12+4",
    attackBonus: 6,
    speed: 8,
    size: "Large",
    description: "Огромный гуманоид с бычьей головой и огромным топором.",
    specialAbility: "Натиск: при перемещении 10+ футов до атаки — +1d6 урона и СПАС СИЛ 14 или сбит с ног.",
    loot: { gold: 80, items: ["Топор минотавра"] },
  },
  {
    id: "mimic",
    name: "Мимик",
    nameEn: "Mimic",
    category: "aberration",
    cr: 2,
    hp: 45,
    ac: 12,
    damageNotation: "1d8+3",
    attackBonus: 5,
    speed: 2,
    size: "Medium",
    description: "Притворяется сундуком. Когда кто-то касается — кусает клейкой псевдоподией.",
    specialAbility: "Клейкий захват: при попадании цель прилипает (СПАС СИЛ 11 чтобы освободиться).",
    loot: { gold: 200, items: ["Сундук мимика"] },
  },
];

// ---------- Party-level scaling ----------

/** Add a flat bonus to a dice-notation string. Returns a clean single-modifier
 *  notation (e.g. "1d6+2" + 3 → "1d6+5", "1d8-1" + 2 → "1d8+1"). */
function addBonusToNotation(notation: string, bonus: number): string {
  if (bonus === 0) return notation;
  const { count, sides, modifier } = parseNotation(notation);
  const newMod = modifier + bonus;
  if (newMod === 0) return `${count}d${sides}`;
  const sign = newMod > 0 ? "+" : "-";
  return `${count}d${sides}${sign}${Math.abs(newMod)}`;
}

/** Scale a bestiary entry to the party level (1..20). Returns a NEW entry —
 *  the original BESTIARY entry is not mutated. Scaling rules:
 *  - HP: baseHP × (1 + partyLevel × 0.15), rounded.
 *  - AC: baseAC + floor(partyLevel / 4).
 *  - Attack bonus: baseAttackBonus + floor(partyLevel / 4).
 *  - Damage: add floor(partyLevel / 2) flat bonus to the notation. */
export function scaleMonsterForParty(
  entry: BestiaryEntry,
  partyLevel: number
): BestiaryEntry {
  const lvl = Math.max(0, Math.floor(partyLevel));
  const hp = Math.round(entry.hp * (1 + lvl * 0.15));
  const ac = entry.ac + Math.floor(lvl / 4);
  const attackBonus = entry.attackBonus + Math.floor(lvl / 4);
  const damageBonus = Math.floor(lvl / 2);
  const damageNotation = addBonusToNotation(entry.damageNotation, damageBonus);
  return {
    ...entry,
    hp,
    ac,
    attackBonus,
    damageNotation,
  };
}
