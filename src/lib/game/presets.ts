// Playable character class presets for party creation.

import type { CharClassPreset } from "./types";

export const CLASS_PRESETS: CharClassPreset[] = [
  {
    id: "fighter",
    name: "Воин",
    description:
      "Закалённый боец в тяжёлой броне с длинным мечом. Прочный фронтовик.",
    charClass: "Воин",
    hp: 28,
    ac: 16,
    str: 16,
    dex: 12,
    con: 15,
    int: 10,
    wis: 11,
    cha: 13,
    gold: 15,
    color: "#dc2626",
    weaponName: "Длинный меч",
    weaponNotation: "1d8+3",
    startItems: [
      { name: "Деревянный щит", type: "armor", description: "+2 к Классу Доспеха." },
      { name: "Зелье лечения", type: "potion", description: "Восстанавливает 2d4+2 HP." },
      { name: "Факел", type: "misc", description: "Горит 1 час, освещает 20 футов." },
    ],
  },
  {
    id: "ranger",
    name: "Следопыт",
    description:
      "Меткий стрелок с коротким луком. Бьёт издали, ловок и внимателен.",
    charClass: "Следопыт",
    hp: 22,
    ac: 14,
    str: 12,
    dex: 17,
    con: 13,
    int: 10,
    wis: 14,
    cha: 11,
    gold: 12,
    color: "#15803d",
    weaponName: "Короткий лук",
    weaponNotation: "1d6+3",
    startItems: [
      { name: "Колчан стрел", type: "misc", description: "20 стрел для короткого лука." },
      { name: "Кинжал", type: "weapon", description: "Запасной клинок, 1d4+1." },
      { name: "Зелье лечения", type: "potion", description: "Восстанавливает 2d4+2 HP." },
    ],
  },
  {
    id: "wizard",
    name: "Маг",
    description:
      "Хрупкий, но смертоносный чародей. Метает огненный сгусток, знания превыше всего.",
    charClass: "Маг",
    hp: 16,
    ac: 12,
    str: 8,
    dex: 14,
    con: 12,
    int: 17,
    wis: 12,
    cha: 11,
    gold: 10,
    color: "#7c3aed",
    weaponName: "Огненный сгусток",
    weaponNotation: "1d10",
    startItems: [
      { name: "Книга заклинаний", type: "misc", description: "Содержит известные заклинания." },
      { name: "Посох", type: "weapon", description: "Фокус для магии, 1d6." },
      { name: "Зелье лечения", type: "potion", description: "Восстанавливает 2d4+2 HP." },
    ],
  },
  {
    id: "cleric",
    name: "Жрец",
    description:
      "Целитель в средней броне с булавой. Хранит группу от смерти.",
    charClass: "Жрец",
    hp: 24,
    ac: 15,
    str: 14,
    dex: 10,
    con: 14,
    int: 10,
    wis: 16,
    cha: 12,
    gold: 14,
    color: "#ca8a04",
    weaponName: "Булава",
    weaponNotation: "1d6+2",
    startItems: [
      { name: "Святой символ", type: "misc", description: "Фокус для божественной магии." },
      { name: "Зелье лечения", type: "potion", description: "Восстанавливает 2d4+2 HP." },
      { name: "Зелье лечения", type: "potion", description: "Восстанавливает 2d4+2 HP." },
    ],
  },
];

export function getPreset(id: string): CharClassPreset {
  return CLASS_PRESETS.find((p) => p.id === id) ?? CLASS_PRESETS[0];
}

/** Spread party members along the bottom-left of the grid by join order. */
export const PARTY_POSITIONS: { x: number; y: number }[] = [
  { x: 1, y: 8 },
  { x: 0, y: 7 },
  { x: 2, y: 7 },
  { x: 0, y: 8 },
  { x: 2, y: 8 },
  { x: 1, y: 7 },
];
