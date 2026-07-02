// Class talents for DUSKFALL (D&D 5e / BG3-flavored VTT).
// 12 classes × 10 talents = 120 talents. Names & descriptions in Russian.
// Effects are modest, suitable for a level-2 character.

import type { Talent } from "./types";

export const CLASS_TALENTS: Record<string, Talent[]> = {
  // ---------------------------------------------------------------------------
  // FIGHTER — weapon mastery, second wind, riposte, improved critical.
  // ---------------------------------------------------------------------------
  fighter: [
    {
      id: "fighter_t1",
      classId: "fighter",
      name: "Второе дыхание",
      description: "Закалённое тело воина получает дополнительный запас выносливости.",
      effect: { type: "hp_bonus", value: 10 },
    },
    {
      id: "fighter_t2",
      classId: "fighter",
      name: "Оборонительная стойка",
      description: "Боевая выправка добавляет очки к классу брони.",
      effect: { type: "ac_bonus", value: 1 },
    },
    {
      id: "fighter_t3",
      classId: "fighter",
      name: "Улучшенный критический удар",
      description: "Воин наносит критический удар при выпадении 19 и выше.",
      effect: { type: "crit_range", minRoll: 19 },
    },
    {
      id: "fighter_t4",
      classId: "fighter",
      name: "Рипоста",
      description: "При промахе врага в ближнем бою воин с шансом отвечает ударом.",
      effect: { type: "counterattack", chance: 0.3, damageNotation: "1d8+3" },
    },
    {
      id: "fighter_t5",
      classId: "fighter",
      name: "Владение оружием",
      description: "Отточенная техника добавляет урон каждому удару.",
      effect: { type: "damage_bonus_flat", value: 2 },
    },
    {
      id: "fighter_t6",
      classId: "fighter",
      name: "Дополнительная атака",
      description: "Воин с шансом наносит второй удар за тот же ход.",
      effect: { type: "extra_attack_chance", chance: 0.4 },
    },
    {
      id: "fighter_t7",
      classId: "fighter",
      name: "Стойкость чемпиона",
      description: "Закалённая воля воина гасит часть входящего урона.",
      effect: { type: "damage_resistance_pct", value: 0.15 },
    },
    {
      id: "fighter_t8",
      classId: "fighter",
      name: "Повторный замах",
      description: "Один промах за ход можно перекинуть в надежде на попадание.",
      effect: { type: "reroll_miss_once" },
    },
    {
      id: "fighter_t9",
      classId: "fighter",
      name: "Боевой рефлекс",
      description: "Натренированная реакция улучшает инициативу воина.",
      effect: { type: "initiative_bonus", value: 2 },
    },
    {
      id: "fighter_t10",
      classId: "fighter",
      name: "Критическая мощь",
      description: "При критическом попадании воин добавляет лишний куб урона.",
      effect: { type: "crit_bonus_dice", dice: 1 },
    },
  ],

  // ---------------------------------------------------------------------------
  // BARBARIAN — rage, savage attacks, relentless, brute force.
  // ---------------------------------------------------------------------------
  barbarian: [
    {
      id: "barbarian_t1",
      classId: "barbarian",
      name: "Ярость варвара",
      description: "В пылу боя варвар обрушивает на врага сокрушительные удары.",
      effect: { type: "damage_bonus_flat", value: 3 },
    },
    {
      id: "barbarian_t2",
      classId: "barbarian",
      name: "Дикая стойкость",
      description: "Тело варвара впитывает часть получаемого урона.",
      effect: { type: "damage_resistance_flat", value: 3 },
    },
    {
      id: "barbarian_t3",
      classId: "barbarian",
      name: "Свирепые атаки",
      description: "Критический удар варвара становится ещё разрушительнее.",
      effect: { type: "crit_bonus_dice", dice: 2 },
    },
    {
      id: "barbarian_t4",
      classId: "barbarian",
      name: "Неутомимость",
      description: "При убийстве врага варвар воспрядает силами и лечится.",
      effect: { type: "heal_on_kill", notation: "1d8" },
    },
    {
      id: "barbarian_t5",
      classId: "barbarian",
      name: "Животный инстинкт",
      description: "Первобытное чутьё позволяет варвару действовать раньше.",
      effect: { type: "initiative_bonus", value: 3 },
    },
    {
      id: "barbarian_t6",
      classId: "barbarian",
      name: "Кровавый пир",
      description: "Варвар упивается чужой кровью, исцеляясь от нанесённого урона.",
      effect: { type: "vampiric_pct", value: 0.2 },
    },
    {
      id: "barbarian_t7",
      classId: "barbarian",
      name: "Грубая сила",
      description: "Чистая мощь варвара пробивает любую броню.",
      effect: { type: "damage_bonus_flat", value: 2 },
    },
    {
      id: "barbarian_t8",
      classId: "barbarian",
      name: "Шкура носорога",
      description: "Загрубевшая шкура варвара снижает долю входящего урона.",
      effect: { type: "damage_resistance_pct", value: 0.2 },
    },
    {
      id: "barbarian_t9",
      classId: "barbarian",
      name: "Берсерк",
      description: "В состоянии ярости варвар с шансом наносит второй удар.",
      effect: { type: "extra_attack_chance", chance: 0.3 },
    },
    {
      id: "barbarian_t10",
      classId: "barbarian",
      name: "Крепость жизни",
      description: "Мощное сложение варвара добавляет ему здоровья.",
      effect: { type: "hp_bonus", value: 12 },
    },
  ],

  // ---------------------------------------------------------------------------
  // PALADIN — divine smite, aura of protection, lay on hands.
  // ---------------------------------------------------------------------------
  paladin: [
    {
      id: "paladin_t1",
      classId: "paladin",
      name: "Божественная кара",
      description: "Удар паладина несёт в себе свет, обжигающий врага.",
      effect: { type: "damage_bonus_flat", value: 2 },
    },
    {
      id: "paladin_t2",
      classId: "paladin",
      name: "Аура защиты",
      description: "Божественная аура паладина оберегает его от ран.",
      effect: { type: "damage_resistance_pct", value: 0.2 },
    },
    {
      id: "paladin_t3",
      classId: "paladin",
      name: "Возложение рук",
      description: "Победив врага, паладин лечит свои раны святой силой.",
      effect: { type: "heal_on_kill", notation: "1d8" },
    },
    {
      id: "paladin_t4",
      classId: "paladin",
      name: "Священный доспех",
      description: "Вера паладина укрепляет его броню.",
      effect: { type: "ac_bonus", value: 1 },
    },
    {
      id: "paladin_t5",
      classId: "paladin",
      name: "Божественное здоровье",
      description: "Святая стойкость паладина повышает его спасброски.",
      effect: { type: "save_bonus", value: 2 },
    },
    {
      id: "paladin_t6",
      classId: "paladin",
      name: "Карающий свет",
      description: "Критический удар паладина сияет дополнительными кубами урона.",
      effect: { type: "crit_bonus_dice", dice: 1 },
    },
    {
      id: "paladin_t7",
      classId: "paladin",
      name: "Святая жатва",
      description: "Свет небес обращает нанесённый урон в исцеление паладина.",
      effect: { type: "vampiric_pct", value: 0.15 },
    },
    {
      id: "paladin_t8",
      classId: "paladin",
      name: "Доспех веры",
      description: "Непоколебимая вера гасит часть входящего урона.",
      effect: { type: "damage_resistance_flat", value: 2 },
    },
    {
      id: "paladin_t9",
      classId: "paladin",
      name: "Призыв небес",
      description: "Паладин с шансом обрушивает на врага ответный удар.",
      effect: { type: "counterattack", chance: 0.25, damageNotation: "1d8+3" },
    },
    {
      id: "paladin_t10",
      classId: "paladin",
      name: "Небесное покровительство",
      description: "Божественная сила увеличивает запас здоровья паладина.",
      effect: { type: "hp_bonus", value: 8 },
    },
  ],

  // ---------------------------------------------------------------------------
  // RANGER — hunter's mark, colossus slayer, fleet of foot.
  // ---------------------------------------------------------------------------
  ranger: [
    {
      id: "ranger_t1",
      classId: "ranger",
      name: "Метка охотника",
      description: "Помеченный враг получает дополнительный урон от следопыта.",
      effect: { type: "damage_bonus_flat", value: 2 },
    },
    {
      id: "ranger_t2",
      classId: "ranger",
      name: "Стремительность шага",
      description: "Лёгкая поступь следопыта ускоряет его реакцию в бою.",
      effect: { type: "initiative_bonus", value: 3 },
    },
    {
      id: "ranger_t3",
      classId: "ranger",
      name: "Покровитель-великан",
      description: "Следопыт с шансом наносит второй выстрел по врагу.",
      effect: { type: "extra_attack_chance", chance: 0.4 },
    },
    {
      id: "ranger_t4",
      classId: "ranger",
      name: "Сокрушительный удар",
      description: "Критический выстрел следопыта наносит дополнительные кубы урона.",
      effect: { type: "crit_bonus_dice", dice: 1 },
    },
    {
      id: "ranger_t5",
      classId: "ranger",
      name: "Быстрый рефлекс",
      description: "Следопыт с шансом отвечает на вражескую атаку выстрелом в упор.",
      effect: { type: "counterattack", chance: 0.25, damageNotation: "1d6+3" },
    },
    {
      id: "ranger_t6",
      classId: "ranger",
      name: "Трофей охотника",
      description: "Сразив врага, следопыт восстанавливает часть сил.",
      effect: { type: "heal_on_kill", notation: "1d6" },
    },
    {
      id: "ranger_t7",
      classId: "ranger",
      name: "Острый взгляд",
      description: "Меткость следопыта расширяет диапазон критических попаданий.",
      effect: { type: "crit_range", minRoll: 19 },
    },
    {
      id: "ranger_t8",
      classId: "ranger",
      name: "Лесная поступь",
      description: "Знание тайных троп добавляет следопыту здоровья.",
      effect: { type: "hp_bonus", value: 6 },
    },
    {
      id: "ranger_t9",
      classId: "ranger",
      name: "Зоркий выстрел",
      description: "Один промах за ход следопыт может перекинуть.",
      effect: { type: "reroll_miss_once" },
    },
    {
      id: "ranger_t10",
      classId: "ranger",
      name: "Покровительство природы",
      description: "Духи леса хранят следопыта, гася часть урона.",
      effect: { type: "damage_resistance_pct", value: 0.15 },
    },
  ],

  // ---------------------------------------------------------------------------
  // ROGUE — sneak attack, uncanny dodge, evasion, assassinate.
  // ---------------------------------------------------------------------------
  rogue: [
    {
      id: "rogue_t1",
      classId: "rogue",
      name: "Скрытая атака",
      description: "Точный удар плута в уязвимое место наносит дополнительный урон.",
      effect: { type: "damage_bonus_flat", value: 3 },
    },
    {
      id: "rogue_t2",
      classId: "rogue",
      name: "Ассасин",
      description: "Плут наносит критический удар при выпадении 19 и выше.",
      effect: { type: "crit_range", minRoll: 19 },
    },
    {
      id: "rogue_t3",
      classId: "rogue",
      name: "Смертоносный удар",
      description: "Крит плута обрушивает на врага дополнительные кубы урона.",
      effect: { type: "crit_bonus_dice", dice: 2 },
    },
    {
      id: "rogue_t4",
      classId: "rogue",
      name: "Необычный уворот",
      description: "Ловкость плута снижает долю получаемого урона.",
      effect: { type: "damage_resistance_pct", value: 0.2 },
    },
    {
      id: "rogue_t5",
      classId: "rogue",
      name: "Улучшенная инициатива",
      description: "Острый нюх плута на опасность ускоряет его реакцию.",
      effect: { type: "initiative_bonus", value: 3 },
    },
    {
      id: "rogue_t6",
      classId: "rogue",
      name: "Парный клинок",
      description: "Плут с шансом наносит второй удар кинжалом.",
      effect: { type: "extra_attack_chance", chance: 0.4 },
    },
    {
      id: "rogue_t7",
      classId: "rogue",
      name: "Повторный выпад",
      description: "Плут может перекинуть один промах за ход.",
      effect: { type: "reroll_miss_once" },
    },
    {
      id: "rogue_t8",
      classId: "rogue",
      name: "Уклонение",
      description: "Ловкий кувырок плута гасит часть входящего урона.",
      effect: { type: "damage_resistance_flat", value: 2 },
    },
    {
      id: "rogue_t9",
      classId: "rogue",
      name: "Кровотечение",
      description: "Отравленные клинки плута вытягивают из врага жизнь.",
      effect: { type: "vampiric_pct", value: 0.1 },
    },
    {
      id: "rogue_t10",
      classId: "rogue",
      name: "Двойной удар в спину",
      description: "Критический плута становится ещё сокрушительнее.",
      effect: { type: "crit_bonus_dice", dice: 1 },
    },
  ],

  // ---------------------------------------------------------------------------
  // MONK — martial arts, patient defense, stunning strike.
  // ---------------------------------------------------------------------------
  monk: [
    {
      id: "monk_t1",
      classId: "monk",
      name: "Боевые искусства",
      description: "Натренированные удары монаха обрушиваются на врага стремительно.",
      effect: { type: "extra_attack_chance", chance: 0.4 },
    },
    {
      id: "monk_t2",
      classId: "monk",
      name: "Терпеливая защита",
      description: "Поток ци монаха укрывает его, повышая класс брони.",
      effect: { type: "ac_bonus", value: 2 },
    },
    {
      id: "monk_t3",
      classId: "monk",
      name: "Оглушающий удар",
      description: "Монах с шансом отвечает на вражескую атаку ударом ладони.",
      effect: { type: "counterattack", chance: 0.3, damageNotation: "1d6+2" },
    },
    {
      id: "monk_t4",
      classId: "monk",
      name: "Дзен-рефлекс",
      description: "Безмятежность монаха обостряет его реакцию в бою.",
      effect: { type: "initiative_bonus", value: 2 },
    },
    {
      id: "monk_t5",
      classId: "monk",
      name: "Тело из ци",
      description: "Поток энергии монача гасит часть входящего урона.",
      effect: { type: "damage_resistance_pct", value: 0.2 },
    },
    {
      id: "monk_t6",
      classId: "monk",
      name: "Поток пустоты",
      description: "Один промах за ход монах может превратить в попадание.",
      effect: { type: "reroll_miss_once" },
    },
    {
      id: "monk_t7",
      classId: "monk",
      name: "Удар бабочки",
      description: "Точность монаха расширяет диапазон критических попаданий.",
      effect: { type: "crit_range", minRoll: 19 },
    },
    {
      id: "monk_t8",
      classId: "monk",
      name: "Стальной ветер",
      description: "Уверенные движения монаха добавляют урона каждому удару.",
      effect: { type: "damage_bonus_flat", value: 1 },
    },
    {
      id: "monk_t9",
      classId: "monk",
      name: "Дыхание жизни",
      description: "Гармония тела монаха добавляет ему здоровья.",
      effect: { type: "hp_bonus", value: 6 },
    },
    {
      id: "monk_t10",
      classId: "monk",
      name: "Кольцо пустоты",
      description: "Ци монаха впитывает часть входящего урона.",
      effect: { type: "damage_resistance_flat", value: 1 },
    },
  ],

  // ---------------------------------------------------------------------------
  // WIZARD — arcane recovery, spell mastery, portent, war magic.
  // ---------------------------------------------------------------------------
  wizard: [
    {
      id: "wizard_t1",
      classId: "wizard",
      name: "Военная магия",
      description: "Маг добавляет мощь к каждому боевому заклинанию.",
      effect: { type: "damage_bonus_flat", value: 2 },
    },
    {
      id: "wizard_t2",
      classId: "wizard",
      name: "Предвидение",
      description: "Прозрение мага расширяет диапазон его критических заклинаний.",
      effect: { type: "crit_range", minRoll: 19 },
    },
    {
      id: "wizard_t3",
      classId: "wizard",
      name: "Магический вампиризм",
      description: "Часть урона, нанесённого заклинанием, обращается в исцеление мага.",
      effect: { type: "vampiric_pct", value: 0.15 },
    },
    {
      id: "wizard_t4",
      classId: "wizard",
      name: "Силовая волна",
      description: "Критическое заклинание мага обрушивает дополнительные кубы урона.",
      effect: { type: "crit_bonus_dice", dice: 1 },
    },
    {
      id: "wizard_t5",
      classId: "wizard",
      name: "Магический щит",
      description: "Защитные чары мага гасят долю входящего урона.",
      effect: { type: "damage_resistance_pct", value: 0.15 },
    },
    {
      id: "wizard_t6",
      classId: "wizard",
      name: "Железная воля",
      description: "Дисциплина мага укрепляет его спасброски.",
      effect: { type: "save_bonus", value: 2 },
    },
    {
      id: "wizard_t7",
      classId: "wizard",
      name: "Защитный круг",
      description: "Магический барьер поглощает часть входящего урона.",
      effect: { type: "damage_resistance_flat", value: 2 },
    },
    {
      id: "wizard_t8",
      classId: "wizard",
      name: "Контрзаклинание",
      description: "Маг с шансом отвечает на атаку врага разрядом энергии.",
      effect: { type: "counterattack", chance: 0.25, damageNotation: "1d8" },
    },
    {
      id: "wizard_t9",
      classId: "wizard",
      name: "Кристалл силы",
      description: "Запас магической энергии увеличивает здоровье мага.",
      effect: { type: "hp_bonus", value: 5 },
    },
    {
      id: "wizard_t10",
      classId: "wizard",
      name: "Усиленное заклинание",
      description: "Маг с шансом обрушивает на врага второе заклинание.",
      effect: { type: "extra_attack_chance", chance: 0.3 },
    },
  ],

  // ---------------------------------------------------------------------------
  // SORCERER — metamagic, wild magic, font of magic.
  // ---------------------------------------------------------------------------
  sorcerer: [
    {
      id: "sorcerer_t1",
      classId: "sorcerer",
      name: "Усиленное заклинание",
      description: "Метамагия чародея усиливает каждый его удар.",
      effect: { type: "damage_bonus_flat", value: 2 },
    },
    {
      id: "sorcerer_t2",
      classId: "sorcerer",
      name: "Дикая магия",
      description: "Хаос в крови чародея расширяет диапазон критических попаданий.",
      effect: { type: "crit_range", minRoll: 19 },
    },
    {
      id: "sorcerer_t3",
      classId: "sorcerer",
      name: "Двойное заклинание",
      description: "Чародей с шансом выпускает второе заклинание за тот же ход.",
      effect: { type: "extra_attack_chance", chance: 0.4 },
    },
    {
      id: "sorcerer_t4",
      classId: "sorcerer",
      name: "Источник магии",
      description: "Критическое заклинание чародея обрушивает дополнительные кубы урона.",
      effect: { type: "crit_bonus_dice", dice: 2 },
    },
    {
      id: "sorcerer_t5",
      classId: "sorcerer",
      name: "Магическое исцеление",
      description: "Часть урона, нанесённого чародеем, обращается в его исцеление.",
      effect: { type: "vampiric_pct", value: 0.2 },
    },
    {
      id: "sorcerer_t6",
      classId: "sorcerer",
      name: "Защитная волна",
      description: "Магическая волна чародея гасит часть входящего урона.",
      effect: { type: "damage_resistance_pct", value: 0.15 },
    },
    {
      id: "sorcerer_t7",
      classId: "sorcerer",
      name: "Сила крови",
      description: "Кровь чародея укрепляет его спасброски.",
      effect: { type: "save_bonus", value: 1 },
    },
    {
      id: "sorcerer_t8",
      classId: "sorcerer",
      name: "Хаотический ответ",
      description: "Чародей с шансом отвечает на атаку врага вспышкой энергии.",
      effect: { type: "counterattack", chance: 0.3, damageNotation: "1d8" },
    },
    {
      id: "sorcerer_t9",
      classId: "sorcerer",
      name: "Буря силы",
      description: "Дополнительные кубы урона при критическом попадании чародея.",
      effect: { type: "crit_bonus_dice", dice: 1 },
    },
    {
      id: "sorcerer_t10",
      classId: "sorcerer",
      name: "Магический резерв",
      description: "Запас магии в теле чародея добавляет ему здоровья.",
      effect: { type: "hp_bonus", value: 5 },
    },
  ],

  // ---------------------------------------------------------------------------
  // WARLOCK — eldritch invocations, pact boon, hexblade.
  // ---------------------------------------------------------------------------
  warlock: [
    {
      id: "warlock_t1",
      classId: "warlock",
      name: "Клинок_HEX",
      description: "Пакт с тёмной силой усиливает каждый удар колдуна.",
      effect: { type: "damage_bonus_flat", value: 2 },
    },
    {
      id: "warlock_t2",
      classId: "warlock",
      name: "Адское возмездие",
      description: "Колдун с шансом отвечает на атаку врага клинком тьмы.",
      effect: { type: "counterattack", chance: 0.3, damageNotation: "1d8" },
    },
    {
      id: "warlock_t3",
      classId: "warlock",
      name: "Проклятие клинка",
      description: "Кровь врага, пролитая колдуном, обращается в его исцеление.",
      effect: { type: "vampiric_pct", value: 0.25 },
    },
    {
      id: "warlock_t4",
      classId: "warlock",
      name: "Пакт тени",
      description: "Тёмные силы колдуна расширяют диапазон критических попаданий.",
      effect: { type: "crit_range", minRoll: 19 },
    },
    {
      id: "warlock_t5",
      classId: "warlock",
      name: "Жатва душ",
      description: "При убийстве врага колдун поглощает его жизненную силу.",
      effect: { type: "heal_on_kill", notation: "1d8" },
    },
    {
      id: "warlock_t6",
      classId: "warlock",
      name: "Адская стойкость",
      description: "Покровитель из Бездны укрепляет спасброски колдуна.",
      effect: { type: "save_bonus", value: 2 },
    },
    {
      id: "warlock_t7",
      classId: "warlock",
      name: "Доспех Агатиса",
      description: "Магическая оболочка колдуна поглощает часть входящего урона.",
      effect: { type: "damage_resistance_flat", value: 2 },
    },
    {
      id: "warlock_t8",
      classId: "warlock",
      name: "Клинок тьмы",
      description: "Критический удар колдуна обрушивает дополнительные кубы урона.",
      effect: { type: "crit_bonus_dice", dice: 1 },
    },
    {
      id: "warlock_t9",
      classId: "warlock",
      name: "Покровительство Бездны",
      description: "Сила инопланарного покровителя добавляет колдуну здоровья.",
      effect: { type: "hp_bonus", value: 6 },
    },
    {
      id: "warlock_t10",
      classId: "warlock",
      name: "Двойное проклятие",
      description: "Колдун с шансом обрушивает на врага второе заклятие.",
      effect: { type: "extra_attack_chance", chance: 0.3 },
    },
  ],

  // ---------------------------------------------------------------------------
  // CLERIC — divine domain, channel divinity, blessed healer.
  // ---------------------------------------------------------------------------
  cleric: [
    {
      id: "cleric_t1",
      classId: "cleric",
      name: "Благословенный целитель",
      description: "При убийстве врага жрец исцеляется силой своей веры.",
      effect: { type: "heal_on_kill", notation: "1d8" },
    },
    {
      id: "cleric_t2",
      classId: "cleric",
      name: "Божественная защита",
      description: "Свет божества жреца гасит долю входящего урона.",
      effect: { type: "damage_resistance_pct", value: 0.2 },
    },
    {
      id: "cleric_t3",
      classId: "cleric",
      name: "Священный доспех",
      description: "Вера жреца укрепляет его броню.",
      effect: { type: "ac_bonus", value: 1 },
    },
    {
      id: "cleric_t4",
      classId: "cleric",
      name: "Божественная благодать",
      description: "Свет божества укрепляет спасброски жреца.",
      effect: { type: "save_bonus", value: 2 },
    },
    {
      id: "cleric_t5",
      classId: "cleric",
      name: "Свет жизни",
      description: "Часть урона, нанесённого жрецом, обращается в его исцеление.",
      effect: { type: "vampiric_pct", value: 0.15 },
    },
    {
      id: "cleric_t6",
      classId: "cleric",
      name: "Сила веры",
      description: "Непоколебимая вера добавляет жрецу здоровья.",
      effect: { type: "hp_bonus", value: 8 },
    },
    {
      id: "cleric_t7",
      classId: "cleric",
      name: "Кара неверных",
      description: "Удар жреца несёт в себе свет, обжигающий врага.",
      effect: { type: "damage_bonus_flat", value: 1 },
    },
    {
      id: "cleric_t8",
      classId: "cleric",
      name: "Святой барьер",
      description: "Защитный купол жреца поглощает часть входящего урона.",
      effect: { type: "damage_resistance_flat", value: 2 },
    },
    {
      id: "cleric_t9",
      classId: "cleric",
      name: "Божественный гнев",
      description: "Жрец с шансом обрушивает на врага ответный удар света.",
      effect: { type: "counterattack", chance: 0.25, damageNotation: "1d6+2" },
    },
    {
      id: "cleric_t10",
      classId: "cleric",
      name: "Кара небес",
      description: "Критический удар жреца обрушивает дополнительные кубы урона.",
      effect: { type: "crit_bonus_dice", dice: 1 },
    },
  ],

  // ---------------------------------------------------------------------------
  // DRUID — wild shape, natural recovery, circle features.
  // ---------------------------------------------------------------------------
  druid: [
    {
      id: "druid_t1",
      classId: "druid",
      name: "Дикая стойкость",
      description: "Звериная мощь друида впитывает часть входящего урона.",
      effect: { type: "damage_resistance_flat", value: 3 },
    },
    {
      id: "druid_t2",
      classId: "druid",
      name: "Природное исцеление",
      description: "При убийстве врага друид восстанавливает силы природы.",
      effect: { type: "heal_on_kill", notation: "1d6" },
    },
    {
      id: "druid_t3",
      classId: "druid",
      name: "Силы земли",
      description: "Связь с природой добавляет друиду здоровья.",
      effect: { type: "hp_bonus", value: 10 },
    },
    {
      id: "druid_t4",
      classId: "druid",
      name: "Звериные когти",
      description: "Удар друида в облике зверя наносит дополнительный урон.",
      effect: { type: "damage_bonus_flat", value: 2 },
    },
    {
      id: "druid_t5",
      classId: "druid",
      name: "Кора дуба",
      description: "Друид покрывается магической корой, повышая класс брони.",
      effect: { type: "ac_bonus", value: 1 },
    },
    {
      id: "druid_t6",
      classId: "druid",
      name: "Кровь природы",
      description: "Часть урона, нанесённого друидом, обращается в его исцеление.",
      effect: { type: "vampiric_pct", value: 0.15 },
    },
    {
      id: "druid_t7",
      classId: "druid",
      name: "Гнев леса",
      description: "Критический удар друида обрушивает дополнительные кубы урона.",
      effect: { type: "crit_bonus_dice", dice: 1 },
    },
    {
      id: "druid_t8",
      classId: "druid",
      name: "Шкура медведя",
      description: "Звериная шкура друида гасит долю входящего урона.",
      effect: { type: "damage_resistance_pct", value: 0.2 },
    },
    {
      id: "druid_t9",
      classId: "druid",
      name: "Парализующий шип",
      description: "Друид с шансом отвечает на вражескую атаку шипом растения.",
      effect: { type: "counterattack", chance: 0.25, damageNotation: "1d6+2" },
    },
    {
      id: "druid_t10",
      classId: "druid",
      name: "Природная хватка",
      description: "Друид с шансом наносит второй удар когтями.",
      effect: { type: "extra_attack_chance", chance: 0.3 },
    },
  ],

  // ---------------------------------------------------------------------------
  // BARD — bardic inspiration, cutting words, jack of all trades.
  // ---------------------------------------------------------------------------
  bard: [
    {
      id: "bard_t1",
      classId: "bard",
      name: "Вдохновение барда",
      description: "Слова барда укрепляют его спасброски в трудную минуту.",
      effect: { type: "save_bonus", value: 2 },
    },
    {
      id: "bard_t2",
      classId: "bard",
      name: "Острый язык",
      description: "Колкое слово барда ускоряет его реакцию в бою.",
      effect: { type: "initiative_bonus", value: 3 },
    },
    {
      id: "bard_t3",
      classId: "bard",
      name: "Танец клинков",
      description: "Грация барда в танце повышает его класс брони.",
      effect: { type: "ac_bonus", value: 1 },
    },
    {
      id: "bard_t4",
      classId: "bard",
      name: "Песнь победы",
      description: "Критический удар барда обрушивает дополнительные кубы урона.",
      effect: { type: "crit_bonus_dice", dice: 1 },
    },
    {
      id: "bard_t5",
      classId: "bard",
      name: "Повтор куплета",
      description: "Один промах за ход бард может перекинуть, словно неудачный куплет.",
      effect: { type: "reroll_miss_once" },
    },
    {
      id: "bard_t6",
      classId: "bard",
      name: "Элегантный уворот",
      description: "Ловкий танец барда гасит долю входящего урона.",
      effect: { type: "damage_resistance_pct", value: 0.15 },
    },
    {
      id: "bard_t7",
      classId: "bard",
      name: "Песнь клинков",
      description: "Ритмичный удар барда наносит дополнительный урон.",
      effect: { type: "damage_bonus_flat", value: 1 },
    },
    {
      id: "bard_t8",
      classId: "bard",
      name: "Дерзкий выход",
      description: "Бард с шансом наносит второй удар в ритме песни.",
      effect: { type: "extra_attack_chance", chance: 0.3 },
    },
    {
      id: "bard_t9",
      classId: "bard",
      name: "Песнь отваги",
      description: "Вдохновляющая мелодия добавляет барду здоровья.",
      effect: { type: "hp_bonus", value: 6 },
    },
    {
      id: "bard_t10",
      classId: "bard",
      name: "Гармония клинка",
      description: "Точность барда, вдохновлённая музыкой, расширяет диапазон критических попаданий.",
      effect: { type: "crit_range", minRoll: 19 },
    },
  ],
};

/** Returns the 10 talents available to a given class, or [] if unknown. */
export function getTalentsForClass(classId: string): Talent[] {
  return CLASS_TALENTS[classId] ?? [];
}
