// D&D 5e Subclasses for DUSKFALL.
//
// Each class gets 2-3 subclass options chosen at level 3 (simplified to level 1
// for playability). Subclasses grant passive bonuses and modify abilities.
// The subclass is stored as a talent id (prefixed with "sub_") so it
// integrates with the existing talent system.

import type { Talent } from "./types";

export interface Subclass {
  id: string;
  classId: string;
  name: string;
  nameEn: string;
  description: string;
  /** Talent effect applied when this subclass is chosen. */
  talentId: string;
}

export const SUBCLASSES: Subclass[] = [
  // Fighter
  {
    id: "champion",
    classId: "fighter",
    name: "Чемпион",
    nameEn: "Champion",
    description: "Улучшенный крит: 19-20 на атаке (вместо 20). +1 к двум характеристикам на ур.7.",
    talentId: "sub_champion",
  },
  {
    id: "battle_master",
    classId: "fighter",
    name: "Мастер боя",
    nameEn: "Battle Master",
    description: "4 костяшки превосходства (d8) для особых приёмов: обезоруживание, сбивание с ног, отпарирование.",
    talentId: "sub_battle_master",
  },
  // Barbarian
  {
    id: "berserker",
    classId: "barbarian",
    name: "Берсерк",
    nameEn: "Berserker",
    description: "Бонусное действие: Ярость безумия (+1 атака в ярости, но помеха на CHA после).",
    talentId: "sub_berserker",
  },
  {
    id: "totem_warrior",
    classId: "barbarian",
    name: "Тотемный воин",
    nameEn: "Totem Warrior",
    description: "Тотем медведя: сопротивление ко ВСЕМ уронам в ярости (кроме психического).",
    talentId: "sub_totem",
  },
  // Wizard
  {
    id: "evocation",
    classId: "wizard",
    name: "Эвокатор",
    nameEn: "School of Evocation",
    description: "Скульптурные заклинания: союзники в области AoE автоматически спасаются (0 урона).",
    talentId: "sub_evocation",
  },
  {
    id: "abjuration",
    classId: "wizard",
    name: "Отринатель",
    nameEn: "School of Abjuration",
    description: "Магический барьер: поглощает урон = 2×уровень. Восстанавливается заклинаниями абъюрации.",
    talentId: "sub_abjuration",
  },
  // Cleric
  {
    id: "life_domain",
    classId: "cleric",
    name: "Домен Жизни",
    nameEn: "Life Domain",
    description: "Лечение +2+мод заклинаний. Заклинание лечения лечит максимум (вместо броска).",
    talentId: "sub_life",
  },
  {
    id: "war_domain",
    classId: "cleric",
    name: "Воинский домен",
    nameEn: "War Domain",
    description: "+10 к скорости. Бонусное действие: атака оружием. Божественность: +10 к атаке.",
    talentId: "sub_war",
  },
  // Rogue
  {
    id: "thief",
    classId: "rogue",
    name: "Вор",
    nameEn: "Thief",
    description: "Быстрые руки: бонусное действие для Использования предмета. +2 к инициативе. Ловкий лаз.",
    talentId: "sub_thief",
  },
  {
    id: "assassin",
    classId: "rogue",
    name: "Убийца",
    nameEn: "Assassin",
    description: "Превосходство: крит при сюрпризе. Преимущество на атаки по неосознавшим угрозу.",
    talentId: "sub_assassin",
  },
  // Paladin
  {
    id: "devotion",
    classId: "paladin",
    name: "Клятва Преданности",
    nameEn: "Oath of Devotion",
    description: "Священное оружие: +мод ХАР к атакам. Изгнание зла: поворот нежити с преимуществом.",
    talentId: "sub_devotion",
  },
  {
    id: "vengeance",
    classId: "paladin",
    name: "Клятва Мести",
    nameEn: "Oath of Vengeance",
    description: "Проклятие врага: преимущество на атаки по одной цели. Гонка: +10 скорости к цели.",
    talentId: "sub_vengeance",
  },
  // Ranger
  {
    id: "hunter",
    classId: "ranger",
    name: "Охотник",
    nameEn: "Hunter",
    description: "Рой убийцы: +1d8 урона по одной цели раз за ход. Колоссоубийца: +1d8 при попадании.",
    talentId: "sub_hunter",
  },
  {
    id: "beast_master",
    classId: "ranger",
    name: "Зверолов",
    nameEn: "Beast Master",
    description: "Спутник-зверь (CR 1/4): атакует бонусным действием. HP = 4×уровень следопыта.",
    talentId: "sub_beast",
  },
  // Monk
  {
    id: "open_hand",
    classId: "monk",
    name: "Десница открытой ладони",
    nameEn: "Way of the Open Hand",
    description: "После атаки: сбить с ног (СПАС ТЕЛ) или оттолкнуть 15 футов или лишить реакции.",
    talentId: "sub_open_hand",
  },
  {
    id: "shadow",
    classId: "monk",
    name: "Путь Тени",
    nameEn: "Way of Shadow",
    description: "Теневой шаг: телепортация в тень (бонусное действие). Тишина: 1 очко ци.",
    talentId: "sub_shadow",
  },
  // Druid
  {
    id: "land",
    classId: "druid",
    name: "Круг Земли",
    nameEn: "Circle of the Land",
    description: "+1 заклинание по биому. Природное восстановление: 1/короткий отдых восстановить ячейки.",
    talentId: "sub_land",
  },
  {
    id: "moon",
    classId: "druid",
    name: "Круг Луны",
    nameEn: "Circle of the Moon",
    description: "Дикий облик CR = уровень/3 (вместо 1/4). Лечение диким обликом 1d8×уровень.",
    talentId: "sub_moon",
  },
  // Sorcerer
  {
    id: "draconic",
    classId: "sorcerer",
    name: "Драконья кровь",
    nameEn: "Draconic Bloodline",
    description: "+1 max HP за уровень. AC = 13 + ЛОВ. Сопротивление стихии дракона.",
    talentId: "sub_draconic",
  },
  {
    id: "wild_magic",
    classId: "sorcerer",
    name: "Дикая магия",
    nameEn: "Wild Magic",
    description: "При заклинании 20%: хаотический эффект (d100 таблица). Восстановление 1 очко коварства/день.",
    talentId: "sub_wild",
  },
  // Bard
  {
    id: "lore",
    classId: "bard",
    name: "Коллегия Знаний",
    nameEn: "College of Lore",
    description: "+2 навыка. Резкая насмешка: 1d6 урона (СПАС МУД половина) бонусным действением.",
    talentId: "sub_lore",
  },
  {
    id: "valor",
    classId: "bard",
    name: "Коллегия Доблести",
    nameEn: "College of Valor",
    description: "Средняя броня + щиты. Боевой вдохновение: +1d6 к урону союзника (вместо броска).",
    talentId: "sub_valor",
  },
  // Warlock
  {
    id: "fiend",
    classId: "warlock",
    name: "Договор с Исчадием",
    nameEn: "The Fiend",
    description: "При убийстве: +temp HP = мод ХАР + уровень. Огненный шар как колдовство.",
    talentId: "sub_fiend",
  },
  {
    id: "archfey",
    classId: "warlock",
    name: "Договор с Феей",
    nameEn: "The Archfey",
    description: "Шаг сквозь туман: телепортация + невидимость (короткий отдых). Ужас/Очарование.",
    talentId: "sub_archfey",
  },
];

/** Get available subclasses for a class. */
export function getSubclassesForClass(classId: string): Subclass[] {
  return SUBCLASSES.filter((s) => s.classId === classId.toLowerCase());
}

/** Get a subclass by its id. */
export function getSubclassById(id: string): Subclass | undefined {
  return SUBCLASSES.find((s) => s.id === id);
}

/** Convert subclass talents for the talent system. */
export function subclassTalents(): Talent[] {
  return SUBCLASSES.map((s) => ({
    id: s.talentId,
    classId: s.classId,
    name: s.name,
    description: s.description,
    effect: { type: "passive" as const },
    source: "subclass" as const,
  }));
}

/** Check if a talent id is a subclass talent. */
export function isSubclassTalent(talentId: string): boolean {
  return talentId.startsWith("sub_");
}
