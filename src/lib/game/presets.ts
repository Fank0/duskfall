// Playable content for the character creator — D&D 5e / Baldur's Gate 3 style.
//
// 12 classes, 9 races, 10 backgrounds. Stats shown are the class BASE array;
// the chosen race's bonuses are applied on top at creation time.

import type { CharClassPreset, RacePreset, BackgroundPreset, Stats } from "./types";

export type { Stats };

// ---------- Classes (12) ----------
export const CLASS_PRESETS: CharClassPreset[] = [
  {
    id: "fighter",
    name: "Воин",
    enName: "Fighter",
    description: "Закалённый боец в тяжёлой броне. Прочный мастер оружия ближнего боя.",
    charClass: "Fighter",
    hp: 28, ac: 16,
    str: 16, dex: 12, con: 15, int: 10, wis: 11, cha: 13,
    gold: 15, color: "#dc2626",
    weaponName: "Длинный меч", weaponNotation: "1d8+3",
    startItems: [
      { name: "Деревянный щит", type: "armor", description: "+2 к Классу Доспеха." },
      { name: "Зелье лечения", type: "potion", description: "Восстанавливает 2d4+2 HP." },
      { name: "Факел", type: "misc", description: "Горит 1 час, освещает 20 футов." },
    ],
  },
  {
    id: "barbarian",
    name: "Варвар",
    enName: "Barbarian",
    description: "Дикарь из северных земель. Ярость удваивает урон и стойкость.",
    charClass: "Barbarian",
    hp: 32, ac: 15,
    str: 17, dex: 13, con: 16, int: 8, wis: 11, cha: 11,
    gold: 10, color: "#b91c1c",
    weaponName: "Боевой топор", weaponNotation: "1d8+3",
    startItems: [
      { name: "Кожаная броня", type: "armor", description: "Лёгкая защита, не стесняет движений." },
      { name: "Зелье лечения", type: "potion", description: "Восстанавливает 2d4+2 HP." },
    ],
  },
  {
    id: "paladin",
    name: "Паладин",
    enName: "Paladin",
    description: "Святой воин, давший обет. Лечит и карает божественной силой.",
    charClass: "Paladin",
    hp: 26, ac: 16,
    str: 16, dex: 10, con: 14, int: 10, wis: 12, cha: 15,
    gold: 14, color: "#eab308",
    weaponName: "Длинный меч", weaponNotation: "1d8+3",
    startItems: [
      { name: "Деревянный щит", type: "armor", description: "+2 к Классу Доспеха." },
      { name: "Святой символ", type: "misc", description: "Фокус для божественной магии." },
      { name: "Зелье лечения", type: "potion", description: "Восстанавливает 2d4+2 HP." },
    ],
  },
  {
    id: "ranger",
    name: "Следопыт",
    enName: "Ranger",
    description: "Меткий стрелок с луком. Бьёт издали, ловок и внимателен.",
    charClass: "Ranger",
    hp: 22, ac: 14,
    str: 12, dex: 17, con: 13, int: 10, wis: 14, cha: 11,
    gold: 12, color: "#15803d",
    weaponName: "Короткий лук", weaponNotation: "1d6+3",
    startItems: [
      { name: "Колчан стрел", type: "misc", description: "20 стрел для лука." },
      { name: "Кинжал", type: "weapon", description: "Запасной клинок, 1d4+1." },
      { name: "Зелье лечения", type: "potion", description: "Восстанавливает 2d4+2 HP." },
    ],
  },
  {
    id: "rogue",
    name: "Плут",
    enName: "Rogue",
    description: "Тень с кинжалом. Скрытные атаки наносят смертельный урон.",
    charClass: "Rogue",
    hp: 20, ac: 14,
    str: 10, dex: 17, con: 13, int: 13, wis: 12, cha: 12,
    gold: 16, color: "#475569",
    weaponName: "Кинжалы-близнецы", weaponNotation: "1d6+3",
    startItems: [
      { name: "Воровские инструменты", type: "misc", description: "Для взлома замков." },
      { name: "Кожаная броня", type: "armor", description: "Лёгкая защита." },
      { name: "Зелье лечения", type: "potion", description: "Восстанавливает 2d4+2 HP." },
    ],
  },
  {
    id: "monk",
    name: "Монах",
    enName: "Monk",
    description: "Боец без оружия. Поток ци превращает кулаки в сталь.",
    charClass: "Monk",
    hp: 21, ac: 15,
    str: 13, dex: 16, con: 13, int: 10, wis: 16, cha: 10,
    gold: 8, color: "#ca8a04",
    weaponName: "Кулаки ци", weaponNotation: "1d6+3",
    startItems: [
      { name: "Деревянные четки", type: "misc", description: "Фокус для медитации." },
      { name: "Зелье лечения", type: "potion", description: "Восстанавливает 2d4+2 HP." },
    ],
  },
  {
    id: "wizard",
    name: "Маг",
    enName: "Wizard",
    description: "Хрупкий, но смертоносный чародей. Метает огненный сгусток.",
    charClass: "Wizard",
    hp: 16, ac: 12,
    str: 8, dex: 14, con: 12, int: 17, wis: 12, cha: 11,
    gold: 10, color: "#7c3aed",
    weaponName: "Огненный сгусток", weaponNotation: "1d10",
    startItems: [
      { name: "Книга заклинаний", type: "misc", description: "Содержит известные заклинания." },
      { name: "Посох", type: "weapon", description: "Фокус для магии, 1d6." },
      { name: "Зелье лечения", type: "potion", description: "Восстанавливает 2d4+2 HP." },
    ],
  },
  {
    id: "sorcerer",
    name: "Чародей",
    enName: "Sorcerer",
    description: "Прирождённый маг. Колдовство течёт в крови, без книг.",
    charClass: "Sorcerer",
    hp: 17, ac: 13,
    str: 8, dex: 14, con: 13, int: 10, wis: 12, cha: 17,
    gold: 10, color: "#9333ea",
    weaponName: "Луч холода", weaponNotation: "1d8",
    startItems: [
      { name: "Кристалл-фокус", type: "misc", description: "Проводник врождённой магии." },
      { name: "Кинжал", type: "weapon", description: "Запасной клинок, 1d4." },
      { name: "Зелье лечения", type: "potion", description: "Восстанавливает 2d4+2 HP." },
    ],
  },
  {
    id: "warlock",
    name: "Колдун",
    enName: "Warlock",
    description: "Заключил pact с потусторонним покровителем. Тёмная магия вечна.",
    charClass: "Warlock",
    hp: 18, ac: 13,
    str: 9, dex: 14, con: 13, int: 12, wis: 10, cha: 17,
    gold: 12, color: "#6d28d9",
    weaponName: "Жгучая вспышка", weaponNotation: "1d10",
    startItems: [
      { name: "Книга пactов", type: "misc", description: "Запись договора с покровителем." },
      { name: "Кожаная броня", type: "armor", description: "Лёгкая защита." },
      { name: "Зелье лечения", type: "potion", description: "Восстанавливает 2d4+2 HP." },
    ],
  },
  {
    id: "cleric",
    name: "Жрец",
    enName: "Cleric",
    description: "Целитель в средней броне. Хранит группу от смерти.",
    charClass: "Cleric",
    hp: 24, ac: 15,
    str: 14, dex: 10, con: 14, int: 10, wis: 16, cha: 12,
    gold: 14, color: "#ca8a04",
    weaponName: "Булава", weaponNotation: "1d6+2",
    startItems: [
      { name: "Святой символ", type: "misc", description: "Фокус для божественной магии." },
      { name: "Зелье лечения", type: "potion", description: "Восстанавливает 2d4+2 HP." },
      { name: "Зелье лечения", type: "potion", description: "Восстанавливает 2d4+2 HP." },
    ],
  },
  {
    id: "druid",
    name: "Друид",
    enName: "Druid",
    description: "Хранитель природы. Призывает корни и шипы, лечит травами.",
    charClass: "Druid",
    hp: 22, ac: 14,
    str: 11, dex: 12, con: 14, int: 11, wis: 16, cha: 12,
    gold: 10, color: "#166534",
    weaponName: "Гром-жезл", weaponNotation: "1d8",
    startItems: [
      { name: "Друидическая фокус-веточка", type: "misc", description: "Фокус для магии природы." },
      { name: "Кожаная броня", type: "armor", description: "Лёгкая защита." },
      { name: "Зелье лечения", type: "potion", description: "Восстанавливает 2d4+2 HP." },
    ],
  },
  {
    id: "bard",
    name: "Бард",
    enName: "Bard",
    description: "Менестрель и шпион. Вдохновляет союзников, режет словами.",
    charClass: "Bard",
    hp: 21, ac: 14,
    str: 9, dex: 14, con: 13, int: 12, wis: 11, cha: 17,
    gold: 16, color: "#db2777",
    weaponName: "Рапира", weaponNotation: "1d8+3",
    startItems: [
      { name: "Лютня", type: "misc", description: "Инструмент и фокус бардовской магии." },
      { name: "Кожаная броня", type: "armor", description: "Лёгкая защита." },
      { name: "Зелье лечения", type: "potion", description: "Восстанавливает 2d4+2 HP." },
    ],
  },
];

// ---------- Races (9, BG3-flavored) ----------
export const RACE_PRESETS: RacePreset[] = [
  {
    id: "human",
    name: "Человек", enName: "Human",
    description: "Универсалы. Все характеристики +1. Живут везде, к чему-то не приспособлены особо.",
    bonuses: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
    trait: "Универсальность: +1 ко всем характеристикам.",
    color: "#a8a29e",
  },
  {
    id: "elf",
    name: "Эльф", enName: "Elf",
    description: "Изящные долгожители. +2 Ловкость, тёмное зрение, иммунитет к магическому сну.",
    bonuses: { dex: 2 },
    trait: "Тёмное зрение, иммунитет к усыплению.",
    color: "#86efac",
  },
  {
    id: "dwarf",
    name: "Дварф", enName: "Dwarf",
    description: "Коренастые горные кузнецы. +2 Телосложение, сопротивление ядам.",
    bonuses: { con: 2 },
    trait: "Сопротивление яду, +2 HP.",
    color: "#d97706",
  },
  {
    id: "halfling",
    name: "Полурослик", enName: "Halfling",
    description: "Малорослый и удачливый народ. +2 Ловкость, удача (переброс единицы).",
    bonuses: { dex: 2 },
    trait: "Удача: переброс натуральной 1.",
    color: "#fbbf24",
  },
  {
    id: "tiefling",
    name: "Тифлинг", enName: "Tiefling",
    description: "Потомки демонической крови. +2 Харизма, сопротивление огню, рога и хвост.",
    bonuses: { cha: 2, int: 1 },
    trait: "Сопротивление огню, адское возмездие.",
    color: "#be123c",
  },
  {
    id: "gnome",
    name: "Гном", enName: "Gnome",
    description: "Маленькие изобретатели. +2 Интеллект, хитрость разума против магии.",
    bonuses: { int: 2 },
    trait: "Хитрость гномов: преимущество против магии.",
    color: "#60a5fa",
  },
  {
    id: "halforc",
    name: "Полуорк", enName: "Half-Orc",
    description: "Мощь дикой крови. +2 Сила, неутомимость (встать с 1 HP при 0).",
    bonuses: { str: 2, con: 1 },
    trait: "Неутомимость: раз в день встать с 1 HP.",
    color: "#3f6212",
  },
  {
    id: "dragonborn",
    name: "Драконорождённый", enName: "Dragonborn",
    description: "Потомки драконов. +2 Сила, дыхание стихии раз в отдых.",
    bonuses: { str: 2, cha: 1 },
    trait: "Драконье дыхание (огонь/молния/кислота).",
    color: "#0d9488",
  },
  {
    id: "githyanki",
    name: "Гитьянки", enName: "Githyanki",
    description: "Раса воинственных планарных странников с Астрала. +1 ко всем, псионика.",
    bonuses: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
    trait: "Псионика: телекинез раз в день.",
    color: "#c084fc",
  },
];

// ---------- Backgrounds (10) ----------
export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    id: "soldier", name: "Солдат", enName: "Soldier",
    description: "Вы служили в армии. Знакомы с оружием и дисциплиной.",
    goldBonus: 5, skill: "Атлетика",
    item: { name: "Знак отличия роты", type: "misc", description: "Воинский жетон вашей роты." },
  },
  {
    id: "acolyte", name: "Служитель", enName: "Acolyte",
    description: "Вы росли в храме, служа божеству.",
    goldBonus: 4, skill: "Религия",
    item: { name: "Святой амулет", type: "misc", description: "Символ вашей веры." },
  },
  {
    id: "criminal", name: "Преступник", enName: "Criminal",
    description: "Вы жили вне закона, промышляя кражами и аферами.",
    goldBonus: 6, skill: "Скрытность",
    item: { name: "Отмычка", type: "misc", description: "Тонкий инструмент для замков." },
  },
  {
    id: "folkhero", name: "Народный герой", enName: "Folk Hero",
    description: "Вы встали на защиту простого народа против тирана.",
    goldBonus: 4, skill: "Выживание",
    item: { name: "Железный значок", type: "misc", description: "Знак вашего происхождения." },
  },
  {
    id: "noble", name: "Дворянин", enName: "Noble",
    description: "Вы родились в знатной семье с правами и связями.",
    goldBonus: 12, skill: "История",
    item: { name: "Печать рода", type: "misc", description: "Гербовая печать вашего дома." },
  },
  {
    id: "sage", name: "Мудрец", enName: "Sage",
    description: "Вы годы провели за книгами в поисках знаний.",
    goldBonus: 3, skill: "Анализ",
    item: { name: "Дневник исследований", type: "misc", description: "Записи и заметки мудреца." },
  },
  {
    id: "urchin", name: "Беспризорник", enName: "Urchin",
    description: "Вы выросли на улицах, выживая хитростью.",
    goldBonus: 2, skill: "Ловкость рук",
    item: { name: "Кукла-талисман", type: "misc", description: "Единственная память о детстве." },
  },
  {
    id: "outlander", name: "Чужеземец", enName: "Outlander",
    description: "Вы пришли из далёких земель, чужак среди местных.",
    goldBonus: 4, skill: "Природа",
    item: { name: "Посох странника", type: "weapon", description: "Опора в долгих странствиях, 1d6." },
  },
  {
    id: "entertainer", name: "Артист", enName: "Entertainer",
    description: "Вы развлекали толпы песнями и трюками.",
    goldBonus: 8, skill: "Выступление",
    item: { name: "Костюм для сцены", type: "misc", description: "Яркий наряд артиста." },
  },
  {
    id: "charlatan", name: "Шарлатан", enName: "Charlatan",
    description: "Вы жили обманом, продавая людям то, чего нет.",
    goldBonus: 7, skill: "Обман",
    item: { name: "Поддельные документы", type: "misc", description: "Фальшивые бумаги на все случаи." },
  },
];

export function getPreset(id: string): CharClassPreset {
  return CLASS_PRESETS.find((p) => p.id === id) ?? CLASS_PRESETS[0];
}
export function getPresetByCharClass(charClass: string): CharClassPreset {
  return CLASS_PRESETS.find((p) => p.charClass === charClass) ?? CLASS_PRESETS[0];
}
export function getRace(id: string): RacePreset {
  return RACE_PRESETS.find((r) => r.id === id) ?? RACE_PRESETS[0];
}
export function getBackground(id: string): BackgroundPreset {
  return BACKGROUND_PRESETS.find((b) => b.id === id) ?? BACKGROUND_PRESETS[0];
}

/** Spread party members along the bottom-left of the grid by join order. */
export const PARTY_POSITIONS: { x: number; y: number }[] = [
  { x: 1, y: 8 }, { x: 0, y: 7 }, { x: 2, y: 7 },
  { x: 0, y: 8 }, { x: 2, y: 8 }, { x: 1, y: 7 },
];

/** Apply race bonuses to a class base stat block, capping at 18. */
export function applyRaceBonuses(base: Stats, race: RacePreset): Stats {
  const out: Stats = { ...base };
  (Object.keys(race.bonuses) as (keyof Stats)[]).forEach((k) => {
    out[k] = Math.min(18, (out[k] ?? 0) + (race.bonuses[k] ?? 0));
  });
  return out;
}
