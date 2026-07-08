// D&D 5e Feats for DUSKFALL (MASTER-PLAN Phase 4.1).
//
// Feats are chosen instead of an ASI at levels 5/9/13/17. Each feat grants
// mechanical effects applied in the combat engine.
//
// Implemented feats (SRD):
//   Great Weapon Master  — -5 to hit / +10 damage on heavy weapon attacks
//   Sharpshooter         — -5 to hit / +10 damage on ranged attacks
//   Sentinel             — opportunity attacks have advantage; stop enemy movement
//   Polearm Master       — bonus-action attack with reach weapon (1d4)
//   Crossbow Expert      — no disadvantage on ranged in melee; bonus hand crossbow attack
//   Lucky                — reroll 1s on d20 attack rolls (once per turn)
//   Tough                 — +2 HP per level
//   Mage Slayer          — opportunity attack when caster casts nearby; disadvantage on their saves
//   Mobile               — +10 speed; no opportunity attacks from enemies you attacked
//   War Caster           — advantage on concentration saves; cast with hands full

export type FeatId =
  | "great_weapon_master"
  | "sharpshooter"
  | "sentinel"
  | "polearm_master"
  | "crossbow_expert"
  | "lucky"
  | "tough"
  | "mage_slayer"
  | "mobile"
  | "war_caster";

export interface Feat {
  id: FeatId;
  name: string;
  nameEn: string;
  description: string;
  /** Prerequisite: weapon type required (e.g. "heavy", "ranged", "reach"). */
  prerequisite?: string;
}

export const FEATS: Feat[] = [
  {
    id: "great_weapon_master",
    name: "Мастер большого оружия",
    nameEn: "Great Weapon Master",
    description: "При атаке тяжёлым оружием: -5 к попаданию, +10 к урону. Бонус-действие: атаковать после крита или убийства.",
    prerequisite: "heavy",
  },
  {
    id: "sharpshooter",
    name: "Меткий стрелок",
    nameEn: "Sharpshooter",
    description: "При дальнобойной атаке: -5 к попаданию, +10 к урону. Игнорирует укрытие цели и штраф за дальность.",
    prerequisite: "ranged",
  },
  {
    id: "sentinel",
    name: "Страж",
    nameEn: "Sentinel",
    description: "Атаки по возможности с преимуществом. Враг, по которому вы попали атакой по возможности, теряет остаток движения.",
  },
  {
    id: "polearm_master",
    name: "Мастер древкового оружия",
    nameEn: "Polearm Master",
    description: "Бонус-действие: атака древковым оружием (1d4+мод СИЛ). Враги провоцируют атаку по возможности при входе в радиус.",
    prerequisite: "reach",
  },
  {
    id: "crossbow_expert",
    name: "Эксперт арбалета",
    nameEn: "Crossbow Expert",
    description: "Нет помехи на дальнобойные атаки в ближнем бою. Бонус-действие: выстрел из ручного арбалета.",
    prerequisite: "crossbow",
  },
  {
    id: "lucky",
    name: "Удачливый",
    nameEn: "Lucky",
    description: "Переброс натуральной 1 на d20 при атаке (1 раз за ход). 3 очка удачи за длинный отдых.",
  },
  {
    id: "tough",
    name: "Выносливый",
    nameEn: "Tough",
    description: "+2 HP за каждый уровень (включая текущий).",
  },
  {
    id: "mage_slayer",
    name: "Убийца магов",
    nameEn: "Mage Slayer",
    description: "Атака по возможности, когда заклинатель кастует рядом. Заклинатели имеют помеху на спасброски против ваших заклинаний.",
  },
  {
    id: "mobile",
    name: "Подвижный",
    nameEn: "Mobile",
    description: "+10 футов к скорости. Враги, по которым вы атаковали в этом ходу, не провоцируют атаку по возможности при отходе.",
  },
  {
    id: "war_caster",
    name: "Боевой заклинатель",
    nameEn: "War Caster",
    description: "Преимущество на спасброски концентрации. Может кастовать с занятыми руками. Атака по возможности: заклинание вместо оружия.",
  },
];

export function getFeatById(id: string): Feat | undefined {
  return FEATS.find((f) => f.id === id);
}

/** Check if a player has a specific feat (by checking selectedTalents for "feat_" prefix). */
export function hasFeat(selectedTalents: string[], featId: FeatId): boolean {
  return selectedTalents.includes(`feat_${featId}`);
}

/** D&D 5e: Great Weapon Master / Sharpshooter — returns -5 attack penalty if the
 *  player has the feat AND is using the right weapon type. The player can choose
 *  to toggle this on/off each turn (simplified: always on for now). */
export function gwmSharpshooterAttackPenalty(selectedTalents: string[], weaponName: string): number {
  const w = weaponName.toLowerCase();
  if (hasFeat(selectedTalents, "great_weapon_master")) {
    // Heavy weapons: greatsword, greataxe, maul, heavy crossbow (simplified check).
    if (w.includes("двуручн") || w.includes("great") || w.includes("алебарда") || w.includes("молот") || w.includes("топор")) {
      return -5;
    }
  }
  if (hasFeat(selectedTalents, "sharpshooter")) {
    // Ranged weapons.
    if (w.includes("лук") || w.includes("bow") || w.includes("арбалет") || w.includes("crossbow")) {
      return -5;
    }
  }
  return 0;
}

/** D&D 5e: Great Weapon Master / Sharpshooter — returns +10 damage bonus. */
export function gwmSharpshooterDamageBonus(selectedTalents: string[], weaponName: string): number {
  return gwmSharpshooterAttackPenalty(selectedTalents, weaponName) !== 0 ? 10 : 0;
}

/** D&D 5e: Tough feat — +2 HP per level. */
export function toughHPBonus(selectedTalents: string[], level: number): number {
  return hasFeat(selectedTalents, "tough") ? level * 2 : 0;
}

/** D&D 5e: Mobile feat — +10 speed. */
export function mobileSpeedBonus(selectedTalents: string[]): number {
  return hasFeat(selectedTalents, "mobile") ? 10 : 0;
}

/** D&D 5e: Lucky — can reroll a natural 1 (once per turn). */
export function hasLucky(selectedTalents: string[]): boolean {
  return hasFeat(selectedTalents, "lucky");
}

/** D&D 5e: War Caster — advantage on concentration saves. */
export function hasWarCaster(selectedTalents: string[]): boolean {
  return hasFeat(selectedTalents, "war_caster");
}

// ===== Additional feats (V2 C6) =====

export const ADDITIONAL_FEATS: Feat[] = [
  {
    id: "mage_slayer_feat",
    name: "Убийца магов",
    nameEn: "Mage Slayer",
    description: "Атака по возможности когда враг кастует рядом. Спасброски врага с помехой против ваших заклинаний.",
  },
  {
    id: "savage_attacker",
    name: "Свирепый атакующий",
    nameEn: "Savage Attacker",
    description: "Переброс урона оружия 1 раз за ход (берётся лучший результат).",
  },
  {
    id: "tavern_brawler",
    name: "Завсегдатай таверн",
    nameEn: "Tavern Brawler",
    description: "Владеет импровизированным оружием + безоружным боем. 1d4 урона кулаком.",
  },
  {
    id: "athlete",
    name: "Атлет",
    nameEn: "Athlete",
    description: "+1 к СИЛ или ЛОВ. Вставание стоит 5 футов (вместо половины). Прыжок длиннее на 5 футов.",
  },
  {
    id: "alert",
    name: "Бдительный",
    nameEn: "Alert",
    description: "+5 к инициативе. Не может быть застигнут врасплох. Преимущество против скрытых врагов.",
  },
  {
    id: "durable",
    name: "Стойкий",
    nameEn: "Durable",
    description: "+1 к ТЕЛ. При восстановлении HP за короткий отдых лечит минимум 2×мод ТЕЛ.",
  },
  {
    id: "magic_initiate",
    name: "Начинающий маг",
    nameEn: "Magic Initiate",
    description: "2 заговора + 1 заклинание 1 круга из любого класса (1/долгий отдых).",
  },
  {
    id: "ritual_caster",
    name: "Ритуалист",
    nameEn: "Ritual Caster",
    description: "Может кастовать ритуальные заклинания из книги ритуалов (10 мин).",
  },
  {
    id: "weapon_master",
    name: "Мастер оружия",
    nameEn: "Weapon Master",
    description: "+1 к СИЛ или ЛОВ. Владение 4 видами оружия.",
  },
  {
    id: "lightly_armored",
    name: "Легкобронный",
    nameEn: "Lightly Armored",
    description: "+1 к СИЛ или ЛОВ. Владение лёгкой бронёй.",
  },
];

/** All feats including additional ones. */
export const ALL_FEATS: Feat[] = [...FEATS, ...ADDITIONAL_FEATS];

// ===== D&D 5e Source Skills / Ultimates (V2 C2) =====
// Powerful abilities usable 1/long rest. Inspired by DOS2 Source skills.

export interface SourceSkill {
  id: string;
  classId: string;
  name: string;
  nameEn: string;
  description: string;
  effect: string; // "damage:8d6" | "heal:4d8+10" | "buff:shielded:5" | "teleport" | "summon"
  range?: number; // cells
  aoeSize?: number;
}

export const SOURCE_SKILLS: SourceSkill[] = [
  { id: "src_fighter", classId: "fighter", name: "Прилив действий: Полный залп", nameEn: "Action Surge: Full Volley", description: "3 дополнительные аки за ход. 1/долгий отдых.", effect: "extra_attacks:3" },
  { id: "src_wizard", classId: "wizard", name: "Метеоритный дождь", nameEn: "Meteor Swarm", description: "8d6 огня + 8d6 дробящего по площади 8 клеток. 1/долгий отдых.", effect: "damage:8d6+8d6", aoeSize: 4 },
  { id: "src_cleric", classId: "cleric", name: "Божественное вмешательство", nameEn: "Divine Intervention", description: "Полное лечение группы + снятие всех состояний. 1/долгий отдых.", effect: "heal:full" },
  { id: "src_rogue", classId: "rogue", name: "Танец теней", nameEn: "Shadow Dance", description: "5 мгновенных атак по разным целям с преимуществом. 1/долгий отдых.", effect: "extra_attacks:5" },
  { id: "src_barbarian", classId: "barbarian", name: "Первобытая ярость", nameEn: "Primal Fury", description: "Удвоенный урон на 3 хода, иммунитет к контролю. 1/долгий отдых.", effect: "buff:enraged:3" },
  { id: "src_paladin", classId: "paladin", name: "Гнев богов", nameEn: "Wrath of the Gods", description: "10d6 святого урона по одной цели + ослепление. 1/долгий отдых.", effect: "damage:10d6" },
  { id: "src_ranger", classId: "ranger", name: "Рой стрел", nameEn: "Arrow Storm", description: "6 атак по ближайшим врагам. 1/долгий отдых.", effect: "extra_attacks:6" },
  { id: "src_monk", classId: "monk", name: "Кулак пустоты", nameEn: "Fist of Emptiness", description: "Оглушение всех врагов в радиусе 5 (спас ТЕЛ DC 18). 1/долгий отдых.", effect: "stun_aoe:5" },
  { id: "src_sorcerer", classId: "sorcerer", name: "Волна хаоса", nameEn: "Chaos Wave", description: "6d6 случайного урона по всем врагам. 1/долгий отдых.", effect: "damage:6d6", aoeSize: 10 },
  { id: "src_warlock", classId: "warlock", name: "Договор смерти", nameEn: "Pact of Death", description: "Мгновенно убивает врага с HP < 30. 1/долгий отдых.", effect: "instakill:30" },
  { id: "src_druid", classId: "druid", name: "Силы природы", nameEn: "Force of Nature", description: "Призывает 3 древних элементаля. 1/долгий отдых.", effect: "summon:3" },
  { id: "src_bard", classId: "bard", name: "Песнь героев", nameEn: "Song of Heroes", description: "Вся группа: +2d10 временного HP + преимущество на 3 хода. 1/долгий отдых.", effect: "buff_party:3" },
];

export function getSourceSkillForClass(classId: string): SourceSkill | undefined {
  return SOURCE_SKILLS.find((s) => s.classId === classId.toLowerCase());
}
