// DUSKFALL spellbook — a curated catalogue of 30+ d20 fantasy RPG SRD spells grouped
// by school and level (cantrips → level 5). Each entry carries the full
// mechanical block (casting time, range, duration, components, damage, save,
// AoE) plus Russian + English names.
//
// The catalogue is the single source of truth for spell data:
//   - the SpellbookPanel viewer browses it,
//   - computeAbilities() turns the caster's known spell IDs into Ability
//     entries on the character sheet,
//   - getDMContext() lists known spells for the DM agent so it can narrate
//     casters' spells correctly,
//   - the DM agent's `learnSpell` plan field adds a spell ID here to a
//     player's known list when they find a scroll of that spell.
//
// All user-facing strings are in Russian (the `name` field); `nameEn` is a
// secondary English label for the spellbook viewer and DM lookups.

// ---------- Schools ----------

export type SpellSchool =
  | "evocation"
  | "transmutation"
  | "enchantment"
  | "illusion"
  | "necromancy"
  | "divination"
  | "abjuration"
  | "conjuration";

export const SPELL_SCHOOLS: SpellSchool[] = [
  "evocation",
  "transmutation",
  "enchantment",
  "illusion",
  "necromancy",
  "divination",
  "abjuration",
  "conjuration",
];

/** Russian label for a spell school. */
export function schoolLabelRu(s: SpellSchool): string {
  switch (s) {
    case "evocation":
      return "Эвокация";
    case "transmutation":
      return "Трансмутация";
    case "enchantment":
      return "Очарование";
    case "illusion":
      return "Иллюзия";
    case "necromancy":
      return "Некромантия";
    case "divination":
      return "Прорицание";
    case "abjuration":
      return "Отговаривание";
    case "conjuration":
      return "Призывание";
  }
}

/** Tailwind colour classes for the school badge / accent (SpellbookPanel UI). */
export function schoolColor(s: SpellSchool): {
  badge: string;
  ring: string;
  dot: string;
  text: string;
  bar: string;
} {
  switch (s) {
    case "evocation":
      return {
        badge: "border-red-700/50 bg-red-950/40 text-red-200",
        ring: "ring-red-700/40",
        dot: "bg-red-500",
        text: "text-red-300",
        bar: "bg-red-600",
      };
    case "transmutation":
      return {
        badge: "border-amber-700/50 bg-amber-950/40 text-amber-200",
        ring: "ring-amber-700/40",
        dot: "bg-amber-500",
        text: "text-amber-300",
        bar: "bg-amber-600",
      };
    case "enchantment":
      return {
        badge: "border-pink-700/50 bg-pink-950/40 text-pink-200",
        ring: "ring-pink-700/40",
        dot: "bg-pink-500",
        text: "text-pink-300",
        bar: "bg-pink-600",
      };
    case "illusion":
      return {
        badge: "border-purple-700/50 bg-purple-950/40 text-purple-200",
        ring: "ring-purple-700/40",
        dot: "bg-purple-500",
        text: "text-purple-300",
        bar: "bg-purple-600",
      };
    case "necromancy":
      return {
        badge: "border-zinc-600/50 bg-zinc-800/40 text-zinc-200",
        ring: "ring-zinc-500/40",
        dot: "bg-zinc-400",
        text: "text-zinc-300",
        bar: "bg-zinc-500",
      };
    case "divination":
      return {
        badge: "border-blue-700/50 bg-blue-950/40 text-blue-200",
        ring: "ring-blue-700/40",
        dot: "bg-blue-500",
        text: "text-blue-300",
        bar: "bg-blue-600",
      };
    case "abjuration":
      return {
        badge: "border-emerald-700/50 bg-emerald-950/40 text-emerald-200",
        ring: "ring-emerald-700/40",
        dot: "bg-emerald-500",
        text: "text-emerald-300",
        bar: "bg-emerald-600",
      };
    case "conjuration":
      return {
        badge: "border-orange-700/50 bg-orange-950/40 text-orange-200",
        ring: "ring-orange-700/40",
        dot: "bg-orange-500",
        text: "text-orange-300",
        bar: "bg-orange-600",
      };
  }
}

// ---------- Spell interface ----------

export interface Spell {
  id: string;
  /** Russian spell name (primary, user-facing). */
  name: string;
  /** English spell name (secondary — used for DM lookups + bestiary-style display). */
  nameEn: string;
  level: 0 | 1 | 2 | 3 | 4 | 5;
  school: SpellSchool;
  castingTime: string;
  range: string;
  duration: string;
  components: string;
  description: string;
  /** Damage/heal notation when applicable (e.g. "8d6", "1d8+MOD"). */
  damage?: string;
  /** Saving-throw ability for spells that allow one. */
  saveAbility?: "str" | "dex" | "con" | "int" | "wis" | "cha";
  /** Default save DC at caster level 3 (8 + proficiency + stat mod). The DM agent recomputes per-caster. */
  saveDC?: number;
  /** AoE shape — drives the on-grid overlay when the spell is cast. */
  aoeShape?: "circle" | "cone" | "line";
  /** AoE size in cells (radius for circle, length for line/cone). */
  aoeSize?: number;
}

// ---------- Spell catalogue (34 entries: 4 cantrips + 8 L1 + 6 L2 + 6 L3 + 5 L4 + 5 L5) ----------
//
// Mechanics sourced from the d20 fantasy RPG SRD. Russian descriptions follow dnd.su
// conventions. Where the task spec lists a spell at a non-SRD level (e.g.
// Fireball at L2 instead of L3, Cone of Cold at L3 instead of L5), we keep
// the spec's level and note it in the description; upcast variants get a
// distinct `_upcast` id and "(усиленное)" suffix.

export const SPELLBOOK: Spell[] = [
  // ===== Cantrips (level 0) =====
  {
    id: "fire_bolt",
    name: "Огненный сгусток",
    nameEn: "Fire Bolt",
    level: 0,
    school: "evocation",
    castingTime: "1 действие",
    range: "120 футов",
    duration: "Мгновенная",
    components: "В, С",
    description:
      "Вы метаете в цель огненный сгусток. Дальнобойная атака заклинанием. При попадании цель получает 1d10 урона огнём. Воспламеняет горючие предметы без экипировки.",
    damage: "1d10",
  },
  {
    id: "ray_of_frost",
    name: "Луч холода",
    nameEn: "Ray of Frost",
    level: 0,
    school: "evocation",
    castingTime: "1 действие",
    range: "60 футов",
    duration: "Мгновенная",
    components: "В, С, М",
    description:
      "Луч голубого холода бьёт по цели. Дальнобойная атака заклинанием: 1d8 урона холодом, и скорость цели снижается на 10 футов до начала вашего следующего хода.",
    damage: "1d8",
  },
  {
    id: "sacred_flame",
    name: "Священное пламя",
    nameEn: "Sacred Flame",
    level: 0,
    school: "evocation",
    castingTime: "1 действие",
    range: "60 футов",
    duration: "Мгновенная",
    components: "В, С, М",
    description:
      "Пламя света низвергается на цель. Спасбросок ЛОВ — цели не даётся преимущества от укрытия. При провале — 1d8 урона излучением.",
    damage: "1d8",
    saveAbility: "dex",
    saveDC: 13,
  },
  {
    id: "acid_splash",
    name: "Всплеск кислоты",
    nameEn: "Acid Splash",
    level: 0,
    school: "conjuration",
    castingTime: "1 действие",
    range: "60 футов",
    duration: "Мгновенная",
    components: "В, С",
    description:
      "Вы швыряете в цель пузырь кислоты. Спасбросок ЛОВ; при провале — 1d6 урона кислотой. Можно поразить двух существ, стоящих не дальше 5 футов друг от друга.",
    damage: "1d6",
    saveAbility: "dex",
    saveDC: 13,
  },

  // ===== Level 1 (8 spells) =====
  {
    id: "magic_missile",
    name: "Магическая стрела",
    nameEn: "Magic Missile",
    level: 1,
    school: "evocation",
    castingTime: "1 действие",
    range: "120 футов",
    duration: "Мгновенная",
    components: "В, С, М",
    description:
      "Три сверкающих снаряда вылетают из ваших пальцев и поражают цели по вашему выбору. Каждый наносит 1d4+1 урона силой. Снаряды всегда попадают — броска атаки нет.",
    damage: "3d4+3",
  },
  {
    id: "shield",
    name: "Щит",
    nameEn: "Shield",
    level: 1,
    school: "abjuration",
    castingTime: "1 реакция",
    range: "Сам",
    duration: "1 раунд",
    components: "В, С, М",
    description:
      "Невидимый барьер магической силы возникает перед вами. +5 к Классу Доспеха до конца хода, включая против моментальной атаки, спровоцировавшей реакцию.",
  },
  {
    id: "cure_wounds",
    name: "Лечение ран",
    nameEn: "Cure Wounds",
    level: 1,
    school: "evocation",
    castingTime: "1 действие",
    range: "Касание",
    duration: "Мгновенная",
    components: "В, С, М",
    description:
      "Касание исцеляет существо на 1d8 + модификатор характеристики заклинания. Не действует на нежить и конструкты.",
    damage: "1d8+MOD",
  },
  {
    id: "bless",
    name: "Благословение",
    nameEn: "Bless",
    level: 1,
    school: "enchantment",
    castingTime: "1 действие",
    range: "30 футов",
    duration: "Концентрация, до 1 минуты",
    components: "В, С, М",
    description:
      "До трёх союзников по вашему выбору получают +1d4 к броскам атак и спасбросков, пока активно заклинание. Концентрация.",
  },
  {
    id: "thunderwave",
    name: "Удар грома",
    nameEn: "Thunderwave",
    level: 1,
    school: "evocation",
    castingTime: "1 действие",
    range: "Сам (15-футовый конус)",
    duration: "Мгновенная",
    components: "В, С, М",
    description:
      "Волна грома растекается от вас. Все существа в конусе делают спасбросок ТЕЛ; при провале — 2d8 урона громом и отбрасывание на 10 футов. При успехе — половина урона.",
    damage: "2d8",
    saveAbility: "con",
    saveDC: 13,
    aoeShape: "cone",
    aoeSize: 3,
  },
  {
    id: "chromatic_orb",
    name: "Хроматическая сфера",
    nameEn: "Chromatic Orb",
    level: 1,
    school: "evocation",
    castingTime: "1 действие",
    range: "90 футов",
    duration: "Мгновенная",
    components: "В, С, М (алмаз 50 зм)",
    description:
      "Сфера энергии выбранной стихии (кислота/холод/огонь/молния/яд/гром) летит в цель. Дальнобойная атака заклинанием: 3d8 урона выбранной стихией.",
    damage: "3d8",
  },
  {
    id: "sleep",
    name: "Усыпление",
    nameEn: "Sleep",
    level: 1,
    school: "enchantment",
    castingTime: "1 действие",
    range: "90 футов",
    duration: "1 минута",
    components: "В, С, М",
    description:
      "Волна усыпляющей магии накрывает конус 20-футовый радиус. Существа с наименьшим текущим HP засыпают первыми, пока сумма HP (5d8) не исчерпается. Спасброска нет.",
    damage: "5d8",
  },
  {
    id: "mage_armor",
    name: "Магическая броня",
    nameEn: "Mage Armor",
    level: 1,
    school: "abjuration",
    castingTime: "1 действие",
    range: "Касание",
    duration: "8 часов",
    components: "В, С, М",
    description:
      "Защитное поле обволакивает цель. Класс Доспеха цели становится 13 + модификатор ЛОВ, если он не носит брони. Действует 8 часов.",
  },

  // ===== Level 2 (6 spells) =====
  {
    id: "fireball",
    name: "Огненный шар",
    nameEn: "Fireball",
    level: 2,
    school: "evocation",
    castingTime: "1 действие",
    range: "150 футов",
    duration: "Мгновенная",
    components: "В, С, М",
    description:
      "Яркая вспышка огня вырывается из точки, выбранной вами в пределах дальности. Все существа в 20-футовом радиусе делают спасбросок ЛОВ; при провале — 8d6 урона огнём, при успехе — половина. (В SRD это заклинание 3 круга.)",
    damage: "8d6",
    saveAbility: "dex",
    saveDC: 14,
    aoeShape: "circle",
    aoeSize: 4,
  },
  {
    id: "web",
    name: "Паутина",
    nameEn: "Web",
    level: 2,
    school: "conjuration",
    castingTime: "1 действие",
    range: "60 футов",
    duration: "Концентрация, до 1 часа",
    components: "В, С, М",
    description:
      "Липкая паутина заполняет 20-футовый куб. Существа внутри должны сделать спасбросок ЛОВ (или СИЛ в начале хода) или становятся опутанными. Концентрация, до 1 часа.",
    saveAbility: "dex",
    saveDC: 13,
    aoeShape: "circle",
    aoeSize: 4,
  },
  {
    id: "invisibility",
    name: "Невидимость",
    nameEn: "Invisibility",
    level: 2,
    school: "illusion",
    castingTime: "1 действие",
    range: "Касание",
    duration: "Концентрация, до 1 часа",
    components: "В, С, М",
    description:
      "Существо, которого вы касаетесь, становится невидимым. Заклинание заканчивается, если цель атакует или кастует заклинание. Концентрация, до 1 часа.",
  },
  {
    id: "hold_person",
    name: "Удержание личности",
    nameEn: "Hold Person",
    level: 2,
    school: "enchantment",
    castingTime: "1 действие",
    range: "60 футов",
    duration: "Концентрация, до 1 минуты",
    components: "В, С, М",
    description:
      "Гуманоид в пределах дальности делает спасбросок МУД; при провале парализован на время действия. В конце каждого хода цель может повторить спасбросок.",
    saveAbility: "wis",
    saveDC: 13,
  },
  {
    id: "lesser_restoration",
    name: "Малое восстановление",
    nameEn: "Lesser Restoration",
    level: 2,
    school: "abjuration",
    castingTime: "1 действие",
    range: "Касание",
    duration: "Мгновенная",
    components: "В, С",
    description:
      "Касание снимает с цели одно состояние: болезнь, ослепление, глухота, паралич или отравление.",
  },
  {
    id: "scorching_ray",
    name: "Палящий луч",
    nameEn: "Scorching Ray",
    level: 2,
    school: "evocation",
    castingTime: "1 действие",
    range: "120 футов",
    duration: "Мгновенная",
    components: "В, С",
    description:
      "Вы создаёте три огненных луча и направляете их в цели (одну или разные). Каждый луч — отдельная дальнобойная атака заклинанием: при попадании 2d6 урона огнём.",
    damage: "6d6",
  },

  // ===== Level 3 (6 spells) =====
  {
    id: "lightning_bolt",
    name: "Молния",
    nameEn: "Lightning Bolt",
    level: 3,
    school: "evocation",
    castingTime: "1 действие",
    range: "Сам (100-футовая линия)",
    duration: "Мгновенная",
    components: "В, С, М",
    description:
      "Молния вырывается из ваших рук в указанном направлении. Все существа в линии 100 футов делают спасбросок ЛОВ; при провале — 8d6 урона молнией, при успехе — половина.",
    damage: "8d6",
    saveAbility: "dex",
    saveDC: 15,
    aoeShape: "line",
    aoeSize: 10,
  },
  {
    id: "cone_of_cold",
    name: "Конус холода",
    nameEn: "Cone of Cold",
    level: 3,
    school: "evocation",
    castingTime: "1 действие",
    range: "Сам (конус)",
    duration: "Мгновенная",
    components: "В, С, М",
    description:
      "Волна леденящего холода вырывается из ваших рук. Все существа в 60-футовом конусе делают спасбросок ТЕЛ; при провале — 8d8 урона холодом, при успехе — половина. (В SRD это заклинание 5 круга.)",
    damage: "8d8",
    saveAbility: "con",
    saveDC: 15,
    aoeShape: "cone",
    aoeSize: 6,
  },
  {
    id: "mass_cure_wounds",
    name: "Массовое лечение ран",
    nameEn: "Mass Cure Wounds",
    level: 3,
    school: "evocation",
    castingTime: "1 действие",
    range: "60 футов",
    duration: "Мгновенная",
    components: "В, С",
    description:
      "Исцеляющая энергия омывает до шести существ по вашему выбору в пределах дальности. Каждое восстанавливает 3d8 + мод. характеристики HP. (В SRD это заклинание 5 круга.)",
    damage: "3d8+MOD",
  },
  {
    id: "dispel_magic",
    name: "Развеяние магии",
    nameEn: "Dispel Magic",
    level: 3,
    school: "abjuration",
    castingTime: "1 действие",
    range: "120 футов",
    duration: "Мгновенная",
    components: "В, С",
    description:
      "Выберите одно существо, предмет или магический эффект. Любое заклинание 3 круга или ниже на цели заканчивается. Для снятия заклинаний более высоких кругов требуется проверка вашей характеристики заклинания.",
  },
  {
    id: "fireball_upcast",
    name: "Огненный шар (усиленный)",
    nameEn: "Fireball (Upcast)",
    level: 3,
    school: "evocation",
    castingTime: "1 действие",
    range: "150 футов",
    duration: "Мгновенная",
    components: "В, С, М",
    description:
      "Усиленная версия Огненного шара, сотворённая ячейкой 4 круга: 9d6 урона огнём (спасбросок ЛОВ — половина) в 20-футовом радиусе.",
    damage: "9d6",
    saveAbility: "dex",
    saveDC: 15,
    aoeShape: "circle",
    aoeSize: 4,
  },
  {
    id: "fly",
    name: "Полёт",
    nameEn: "Fly",
    level: 3,
    school: "transmutation",
    castingTime: "1 действие",
    range: "Касание",
    duration: "Концентрация, до 10 минут",
    components: "В, С, М",
    description:
      "Выбранное существо получает скорость полёта 60 футов. Заклинание заканчивается при потере концентрации. Можно наложить на союзника или на себя.",
  },

  // ===== Level 4 (5 spells) =====
  {
    id: "wall_of_fire",
    name: "Стена огня",
    nameEn: "Wall of Fire",
    level: 4,
    school: "evocation",
    castingTime: "1 действие",
    range: "120 футов",
    duration: "Концентрация, до 1 минуты",
    components: "В, С, М",
    description:
      "Стена пламени длиной до 60 футов возникает в пределах дальности. Существа, проходящие сквозь стену или находящиеся в пределах 10 футов с одной её стороны, получают 5d8 урона огнём (спасбросок ЛОВ — половина).",
    damage: "5d8",
    saveAbility: "dex",
    saveDC: 16,
  },
  {
    id: "stoneskin",
    name: "Каменная кожа",
    nameEn: "Stoneskin",
    level: 4,
    school: "abjuration",
    castingTime: "1 действие",
    range: "Касание",
    duration: "Концентрация, до 1 часа",
    components: "В, С, М (порошок алмаза 100 зм)",
    description:
      "Кожа цели становится твёрдой как камень. Сопротивление немагическому дробящему, колющему и рубящему урону. Концентрация, до 1 часа.",
  },
  {
    id: "polymorph",
    name: "Оборот",
    nameEn: "Polymorph",
    level: 4,
    school: "transmutation",
    castingTime: "1 действие",
    range: "60 футов",
    duration: "Концентрация, до 1 часа",
    components: "В, С, М",
    description:
      "Цель делает спасбросок МУД; при провале превращается в зверя с CR не выше вашего уровня. Статы заменяются, HP — как у зверя. По окончании HP возвращается к предыдущему значению.",
    saveAbility: "wis",
    saveDC: 16,
  },
  {
    id: "ice_storm",
    name: "Ледяной шторм",
    nameEn: "Ice Storm",
    level: 4,
    school: "evocation",
    castingTime: "1 действие",
    range: "300 футов",
    duration: "Мгновенная",
    components: "В, С, М",
    description:
      "Град и осколки льда обрушиваются на 20-футовый цилиндр в пределах дальности. Все существа внутри делают спасбросок ЛОВ; при провале — 2d8 дробящего + 4d6 холодом, при успехе — половина. Земля в области становится труднопроходимой.",
    damage: "2d8+4d6",
    saveAbility: "dex",
    saveDC: 16,
    aoeShape: "circle",
    aoeSize: 4,
  },
  {
    id: "death_ward",
    name: "Оберег от смерти",
    nameEn: "Death Ward",
    level: 4,
    school: "abjuration",
    castingTime: "1 действие",
    range: "Касание",
    duration: "8 часов",
    components: "В, С",
    description:
      "Вы касаетесь существа. Первый раз, когда оно опустилось бы до 0 HP в течение 8 часов, вместо этого остаётся 1 HP. Эффект срабатывает один раз, затем заклинание заканчивается.",
  },

  // ===== Level 5 (5 spells) =====
  {
    id: "cone_of_cold_upcast",
    name: "Конус холода (усиленный)",
    nameEn: "Cone of Cold (Upcast)",
    level: 5,
    school: "evocation",
    castingTime: "1 действие",
    range: "Сам (конус)",
    duration: "Мгновенная",
    components: "В, С, М",
    description:
      "Усиленная версия Конуса холода, сотворённая ячейкой 6 круга: 10d8 урона холодом (спасбросок ТЕЛ — половина) в 60-футовом конусе.",
    damage: "10d8",
    saveAbility: "con",
    saveDC: 17,
    aoeShape: "cone",
    aoeSize: 6,
  },
  {
    id: "cloudkill",
    name: "Смертоносное облако",
    nameEn: "Cloudkill",
    level: 5,
    school: "conjuration",
    castingTime: "1 действие",
    range: "120 футов",
    duration: "Концентрация, до 10 минут",
    components: "В, С",
    description:
      "Ядовитое облако в форме сферы 20-футового радиуса возникает в пределах дальности. Существа внутри делают спасбросок ТЕЛ; при провале — 4d10 урона ядом, при успехе — половина. Облако можно перемещать каждый ход на 10 футов от вас.",
    damage: "4d10",
    saveAbility: "con",
    saveDC: 17,
    aoeShape: "circle",
    aoeSize: 4,
  },
  {
    id: "mass_cure_wounds_upcast",
    name: "Массовое лечение ран (усиленное)",
    nameEn: "Mass Cure Wounds (Upcast)",
    level: 5,
    school: "evocation",
    castingTime: "1 действие",
    range: "60 футов",
    duration: "Мгновенная",
    components: "В, С",
    description:
      "Усиленная версия Массового лечения ран, сотворённая ячейкой 6 круга: до шести существ восстанавливают 4d8 + мод. характеристики HP.",
    damage: "4d8+MOD",
  },
  {
    id: "wall_of_stone",
    name: "Каменная стена",
    nameEn: "Wall of Stone",
    level: 5,
    school: "evocation",
    castingTime: "1 действие",
    range: "120 футов",
    duration: "Концентрация, до 10 минут",
    components: "В, С, М",
    description:
      "Стена из камня возникает в пределах дальности — до десяти панелей 10×10 футов. Стена может иметь любую форму, опираясь на твёрдое основание. Если вы поддерживаете концентрацию всю длительность, стена становится постоянной.",
  },
  {
    id: "flame_strike",
    name: "Огненный столп",
    nameEn: "Flame Strike",
    level: 5,
    school: "evocation",
    castingTime: "1 действие",
    range: "60 футов",
    duration: "Мгновенная",
    components: "В, С, М",
    description:
      "Столп божественного огня обрушивается с небес в 10-футовый радиус-цилиндр высотой 40 футов. Все существа внутри делают спасбросок ЛОВ; при провале — 4d6 урона огнём + 4d6 урона излучением, при успехе — половина.",
    damage: "4d6+4d6",
    saveAbility: "dex",
    saveDC: 17,
    aoeShape: "circle",
    aoeSize: 2,
  },
];

// ---------- Helpers ----------

/** Format a spell level as a Russian label: 0 → "Заговор", 1 → "Круг 1", etc. */
export function formatSpellLevel(level: 0 | 1 | 2 | 3 | 4 | 5): string {
  if (level === 0) return "Заговор";
  return `Круг ${level}`;
}

/** All spells of the given level (0 = cantrips). */
export function getSpellsByLevel(level: 0 | 1 | 2 | 3 | 4 | 5): Spell[] {
  return SPELLBOOK.filter((s) => s.level === level);
}

/** All spells of the given school. */
export function getSpellsBySchool(school: SpellSchool): Spell[] {
  return SPELLBOOK.filter((s) => s.school === school);
}

/** Look up a spell by its id. Returns undefined when not found. */
export function getSpellById(id: string): Spell | undefined {
  return SPELLBOOK.find((s) => s.id === id);
}

/**
 * Look up a spell by case-insensitive name match against either the Russian
 * `name` or English `nameEn` field. Used by the DM agent when it detects a
 * player cast a known spell by name in their action text.
 */
export function findSpellByName(query: string): Spell | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  return SPELLBOOK.find(
    (s) => s.name.toLowerCase() === q || s.nameEn.toLowerCase() === q
  );
}

/** Russian label for a saving-throw ability id. */
export function saveAbilityLabelRu(a: "str" | "dex" | "con" | "int" | "wis" | "cha"): string {
  switch (a) {
    case "str":
      return "СИЛ";
    case "dex":
      return "ЛОВ";
    case "con":
      return "ТЕЛ";
    case "int":
      return "ИНТ";
    case "wis":
      return "МУД";
    case "cha":
      return "ХАР";
  }
}

/** Class-specific default known spells by class id + character level.
 *
 *  Returns the spell IDs a caster of the given class knows at the given level
 *  per the task spec:
 *    - Level 1: 2 cantrips + 4 level-1 spells
 *    - Level 3: +2 level-2 spells
 *    - Level 5: +2 level-3 spells
 *
 *  Each class gets a thematic selection. Additional spells learned from
 *  scrolls are appended on top via the player's `knownSpells` field.
 */
export function classBaseSpells(classId: string, level: number): string[] {
  const id = classId.toLowerCase();
  const lvl = Math.max(1, Math.min(5, Math.floor(level) || 1));
  // Per-class spell loadouts.
  const loadouts: Record<string, {
    l1: string[]; // 2 cantrips + 4 level-1 spells
    l3: string[]; // 2 level-2 spells
    l5: string[]; // 2 level-3 spells
  }> = {
    wizard: {
      l1: ["fire_bolt", "ray_of_frost", "magic_missile", "shield", "mage_armor", "sleep"],
      l3: ["scorching_ray", "invisibility"],
      l5: ["lightning_bolt", "fly"],
    },
    sorcerer: {
      l1: ["fire_bolt", "acid_splash", "magic_missile", "chromatic_orb", "shield", "thunderwave"],
      l3: ["scorching_ray", "hold_person"],
      l5: ["fireball", "lightning_bolt"],
    },
    warlock: {
      l1: ["fire_bolt", "sacred_flame", "magic_missile", "chromatic_orb", "shield", "bless"],
      l3: ["hold_person", "invisibility"],
      l5: ["dispel_magic", "fly"],
    },
    cleric: {
      l1: ["sacred_flame", "acid_splash", "cure_wounds", "bless", "shield", "mage_armor"],
      l3: ["lesser_restoration", "hold_person"],
      l5: ["mass_cure_wounds", "dispel_magic"],
    },
    druid: {
      l1: ["acid_splash", "fire_bolt", "cure_wounds", "thunderwave", "hold_person", "mage_armor"],
      l3: ["lesser_restoration", "web"],
      l5: ["dispel_magic", "fly"],
    },
    bard: {
      l1: ["sacred_flame", "acid_splash", "cure_wounds", "hold_person", "mage_armor", "sleep"],
      l3: ["invisibility", "lesser_restoration"],
      l5: ["dispel_magic", "fly"],
    },
    ranger: {
      l1: ["fire_bolt", "cure_wounds", "hold_person", "bless"],
      l3: ["web", "lesser_restoration"],
      l5: ["lightning_bolt", "fly"],
    },
    paladin: {
      l1: ["sacred_flame", "cure_wounds", "bless", "shield"],
      l3: ["hold_person", "lesser_restoration"],
      l5: ["dispel_magic", "mass_cure_wounds"],
    },
  };
  const loadout = loadouts[id];
  if (!loadout) return [];
  const out = [...loadout.l1];
  if (lvl >= 3) out.push(...loadout.l3);
  if (lvl >= 5) out.push(...loadout.l5);
  // Deduplicate while preserving order.
  return Array.from(new Set(out));
}

/**
 * Resolve the full list of known spell IDs for a caster: the class base
 * spells PLUS any extra spells the player learned from scrolls (passed in
 * as `extraKnown`). Non-casters return an empty list.
 */
export function resolveKnownSpells(
  classId: string,
  level: number,
  extraKnown: string[] = []
): string[] {
  const base = classBaseSpells(classId, level);
  return Array.from(new Set([...base, ...extraKnown]));
}
