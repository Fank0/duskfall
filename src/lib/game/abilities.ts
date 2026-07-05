// Ability catalog: innate (racial), class features, consumable scroll spells,
// and spellbook spells known by caster classes.
// Sources: d20 fantasy RPG SRD / dnd.su. Used both in the character creator preview
// and the in-game character sheet.

import type { PlayerState, InventoryItemState } from "./types";
import { resolveTalents } from "./talents";
import { getClassIdByCharClass, isCasterClass } from "./presets";
import {
  SPELLBOOK,
  getSpellById,
  resolveKnownSpells,
  type Spell,
} from "./spellbook";

export interface Ability {
  id: string;
  name: string;
  description: string;
  source: "race" | "class" | "talent" | "scroll" | "spell" | "subclass";
  sourceLabel: string;
  consumable?: boolean; // true for scrolls (consumed on use)
  castNotation?: string; // damage/heal roll when activated (e.g. "8d6")
  castType?: "damage" | "heal" | "buff" | "utility";
  uses?: number; // remaining uses (scrolls = quantity in inventory)
  /** If set, using this ability consumes a spell slot of this level (1..5). */
  slotLevel?: number;
  /**
   * For `source: "spell"` abilities: the spellbook spell IDs this ability
   * entry provides (a single-element array `[spellId]` for per-spell
   * abilities). Useful for the DM agent to know which spell a caster knows
   * from a glance at the ability list.
   */
  spellbookSpells?: string[];
  /**
   * AoE shape — copied from the spellbook entry when the ability is a spell.
   * Drives the targeting UX (ability-targeting vs AoE-cell-targeting) and
   * the on-grid overlay after resolution.
   */
  aoeShape?: "circle" | "cone" | "line";
  /** AoE size in cells (radius for circle, length for line/cone). */
  aoeSize?: number;
}

// ---------- Racial (innate) abilities ----------
export const RACIAL_ABILITIES: Record<string, Ability[]> = {
  human: [
    { id: "human_versatile", name: "Универсальность", description: "+1 ко всем характеристикам. Люди быстро осваиваются к любому ремеслу.", source: "race", sourceLabel: "Человек" },
  ],
  elf: [
    { id: "elf_darkvision", name: "Тёмное зрение", description: "Видит в темноте на 60 футов как в сумерках.", source: "race", sourceLabel: "Эльф" },
    { id: "elf_fey", name: "Наследие фей", description: "Иммунитет к усыплению, преимущество против очарования.", source: "race", sourceLabel: "Эльф" },
  ],
  dwarf: [
    { id: "dwarf_darkvision", name: "Тёмное зрение", description: "Видит в темноте на 60 футов.", source: "race", sourceLabel: "Дварф" },
    { id: "dwarf_resilience", name: "Дварфская устойчивость", description: "Сопротивление яду (половина урона).", source: "race", sourceLabel: "Дварф" },
  ],
  halfling: [
    { id: "halfling_lucky", name: "Удача", description: "Переброс натуральной 1 на d20.", source: "race", sourceLabel: "Полурослик" },
    { id: "halfling_brave", name: "Храбрость", description: "Преимущество против испуга.", source: "race", sourceLabel: "Полурослик" },
  ],
  tiefling: [
    { id: "tiefling_darkvision", name: "Тёмное зрение", description: "Видит в темноте на 60 футов.", source: "race", sourceLabel: "Тифлинг" },
    { id: "tiefling_fire", name: "Сопротивление огню", description: "Половина урона от огня.", source: "race", sourceLabel: "Тифлинг" },
    { id: "tiefling_rebuke", name: "Адское возмездие", description: "Реакция: 2d6 урона огнём по атаковавшему (1/долгий отдых).", source: "race", sourceLabel: "Тифлинг", castNotation: "2d6", castType: "damage" },
  ],
  gnome: [
    { id: "gnome_darkvision", name: "Тёмное зрение", description: "Видит в темноте на 60 футов.", source: "race", sourceLabel: "Гном" },
    { id: "gnome_cunning", name: "Хитрость гномов", description: "Преимущество на спасброски ИНТ/МУД/ХАР против магии.", source: "race", sourceLabel: "Гном" },
  ],
  halforc: [
    { id: "halforc_darkvision", name: "Тёмное зрение", description: "Видит в темноте на 60 футов.", source: "race", sourceLabel: "Полуорк" },
    { id: "halforc_relentless", name: "Неутомимость", description: "При падении до 0 HP остаётся 1 HP (1/долгий отдых).", source: "race", sourceLabel: "Полуорк" },
    { id: "halforc_savage", name: "Свирепые атаки", description: "Доп. кубик урона при критическом ударе оружием.", source: "race", sourceLabel: "Полуорк" },
  ],
  dragonborn: [
    { id: "dragonborn_ancestry", name: "Драконье происхождение", description: "Сопротивление стихии предка (огонь/молния/кислота/холод/яд).", source: "race", sourceLabel: "Драконорождённый" },
    { id: "dragonborn_breath", name: "Оружие дыхания", description: "Конус урона 2d6 от стихии (спасбросок ТЕЛ), 1/короткий отдых.", source: "race", sourceLabel: "Драконорождённый", castNotation: "2d6", castType: "damage" },
  ],
  githyanki: [
    { id: "githyanki_darkvision", name: "Тёмное зрение", description: "Видит в темноте на 60 футов.", source: "race", sourceLabel: "Гитьянки" },
    { id: "githyanki_psionics", name: "Псионика", description: "Телекинез: левитация предметов (1/долгий отдых).", source: "race", sourceLabel: "Гитьянки", castType: "utility" },
    { id: "githyanki_mind", name: "Дисциплина разума", description: "Преимущество против очарования и испуга.", source: "race", sourceLabel: "Гитьянки" },
  ],
};

// ---------- Class starting features ----------
export const CLASS_ABILITIES: Record<string, Ability[]> = {
  fighter: [
    { id: "fighter_secondwind", name: "Второе дыхание", description: "Бонусное действие: восстановить 1d10+уровень HP (1/короткий отдых).", source: "class", sourceLabel: "Воин", castNotation: "1d10", castType: "heal" },
  ],
  barbarian: [
    { id: "barbarian_rage", name: "Ярость", description: "Сопротивление урону, +2 к урону ближнего боя (2/долгий отдых).", source: "class", sourceLabel: "Варвар", castType: "buff" },
  ],
  paladin: [
    { id: "paladin_smite", name: "Божественная кара", description: "При попадании: 2d8 урона излучением (тратит ячейку заклинания).", source: "class", sourceLabel: "Паладин", castNotation: "2d8", castType: "damage", slotLevel: 1 },
  ],
  ranger: [
    { id: "ranger_mark", name: "Метка охотника", description: "Помечает цель: +1d6 урона по ней (концентрация).", source: "class", sourceLabel: "Следопыт", castNotation: "1d6", castType: "damage", slotLevel: 1 },
  ],
  rogue: [
    { id: "rogue_sneak", name: "Скрытая атака", description: "+1d6 урона при преимуществе или союзнике рядом.", source: "class", sourceLabel: "Плут", castNotation: "1d6", castType: "damage" },
  ],
  monk: [
    { id: "monk_arts", name: "Боевые искусства", description: "Безоружный удар 1d6 + ЛОВ вместо СИЛ.", source: "class", sourceLabel: "Монах", castNotation: "1d6", castType: "damage" },
  ],
  wizard: [
    { id: "wizard_recovery", name: "Магическое восстановление", description: "Короткий отдых: восстанавливает ячейки заклинаний (1/день).", source: "class", sourceLabel: "Маг", castType: "utility" },
  ],
  sorcerer: [
    { id: "sorcerer_font", name: "Источник магии", description: "Очки чародейства для преобразования ячеек.", source: "class", sourceLabel: "Чародей", castType: "utility" },
  ],
  warlock: [
    { id: "warlock_pact", name: "Тайная магия", description: "Ячейки заклинаний восстанавливаются коротким отдыхом.", source: "class", sourceLabel: "Колдун", castType: "utility" },
  ],
  cleric: [
    { id: "cleric_channel", name: "Божественный канал: Изгнание нежити", description: "Нежить спасбросок МУД или обращается в бегство (1/короткий отдых).", source: "class", sourceLabel: "Жрец", castType: "utility" },
  ],
  druid: [
    { id: "druid_wildshape", name: "Дикий облик", description: "Превращение в зверя CR 1/4 (2/короткий отдых).", source: "class", sourceLabel: "Друид", castType: "buff" },
  ],
  bard: [
    { id: "bard_inspiration", name: "Вдохновение барда", description: "Союзник +1d6 к броску (мод ХАР раз / долгий отдых).", source: "class", sourceLabel: "Бард", castNotation: "1d6", castType: "buff" },
  ],
};

// ---------- Scroll spells (consumable, purchasable/findable) ----------
// An inventory item with itemType "scroll" and a name matching a key below
// becomes a castable, consumable ability.
export const SCROLL_SPELLS: Record<string, { castNotation: string; castType: "damage" | "heal" | "buff" | "utility"; description: string }> = {
  "Свиток огненного шара": { castNotation: "8d6", castType: "damage", description: "Взрыв огня 20 футов, 8d6 урона (спасбросок ЛОВ — половина)." },
  "Свиток лечения": { castNotation: "1d8+3", castType: "heal", description: "Касание: восстанавливает 1d8+3 HP союзнику." },
  "Свиток щита": { castNotation: "+5", castType: "buff", description: "Реакция: +5 к AC до конца хода." },
  "Свиток магической стрелы": { castNotation: "3d4+3", castType: "damage", description: "Три силы-снаряда, каждый 1d4+1, всегда попадают." },
  "Свиток тьмы": { castNotation: "—", castType: "utility", description: "Сфера магической тьмы 15 футов на 10 минут." },
  "Свиток молнии": { castNotation: "8d6", castType: "damage", description: "Молния 100 футов, 8d6 урона (спасбросок ЛОВ — половина)." },
  "Свиток массового лечения": { castNotation: "3d8", castType: "heal", description: "Лечит всех союзников в 30 футах на 3d8 HP." },
};

/** Compute the full ability list for a player: race + class + talents + scrolls
 *  + spellbook spells (for casters).
 *
 *  The player's `spellbookSpells` field (extra spells learned from scrolls)
 *  is merged with the class base spell list to produce the final known set.
 *  Each known spell becomes its own Ability entry with `slotLevel` set for
 *  leveled spells (1..5); cantrips omit `slotLevel`. */
export function computeAbilities(
  player: PlayerState,
  inventory: InventoryItemState[]
): Ability[] {
  const classId = getClassIdByCharClass(player.charClass);
  const raceAbilities = RACIAL_ABILITIES[player.race] ?? [];
  const classAbilities = CLASS_ABILITIES[classId] ?? [];
  const talents = resolveTalents(player).map((t) => ({
    id: `talent_${t.id}`,
    name: t.name,
    description: t.description,
    source: "talent" as const,
    sourceLabel: "Талант",
  }));
  const scrolls: Ability[] = inventory
    .filter((i) => i.itemType === "scroll")
    .map((i) => {
      const def = SCROLL_SPELLS[i.itemName];
      return {
        id: `scroll_${i.id}`,
        name: i.itemName,
        description: def?.description ?? i.description,
        source: "scroll" as const,
        sourceLabel: "Свиток",
        consumable: true,
        castNotation: def?.castNotation,
        castType: def?.castType,
        uses: i.quantity,
      };
    });
  // Spellbook spells for casters: derive base spells from class + level, then
  // merge any extra spells the player has learned (from scrolls via the DM
  // agent's `learnSpell` plan field). Each known spell becomes its own Ability
  // entry; cantrips omit `slotLevel`, leveled spells set it.
  const spells: Ability[] = [];
  if (isCasterClass(classId)) {
    const extraKnown = player.spellbookSpells ?? [];
    const knownIds = resolveKnownSpells(classId, player.level, extraKnown);
    for (const spellId of knownIds) {
      const spell = getSpellById(spellId);
      if (!spell) continue;
      spells.push(spellToAbility(spell));
    }
  }
  return [...raceAbilities, ...classAbilities, ...talents, ...scrolls, ...spells];
}

/** Convert a Spell entry into an Ability entry shown on the character sheet. */
function spellToAbility(spell: Spell): Ability {
  return {
    id: `spell_${spell.id}`,
    name: spell.name,
    description: spell.description,
    source: "spell",
    sourceLabel: "Заклинание",
    castNotation: spell.damage,
    castType: inferCastType(spell),
    slotLevel: spell.level > 0 ? spell.level : undefined,
    spellbookSpells: [spell.id],
    aoeShape: spell.aoeShape,
    aoeSize: spell.aoeSize,
  };
}

/** Classify a spell into one of the four Ability.castType buckets. */
function inferCastType(spell: Spell): "damage" | "heal" | "buff" | "utility" {
  const HEAL_IDS = new Set(["cure_wounds", "mass_cure_wounds", "mass_cure_wounds_upcast"]);
  const BUFF_IDS = new Set([
    "shield",
    "bless",
    "mage_armor",
    "invisibility",
    "stoneskin",
    "death_ward",
    "fly",
  ]);
  if (HEAL_IDS.has(spell.id)) return "heal";
  if (BUFF_IDS.has(spell.id)) return "buff";
  if (spell.damage) return "damage";
  return "utility";
}

/** Convenience export: list every spell ID the player currently knows.
 *  Used by the DM context builder to enumerate a caster's options. */
export function knownSpellIdsForPlayer(player: PlayerState): string[] {
  const classId = getClassIdByCharClass(player.charClass);
  if (!isCasterClass(classId)) return [];
  const extraKnown = player.spellbookSpells ?? [];
  return resolveKnownSpells(classId, player.level, extraKnown);
}

/** Convenience export: list Spell objects the player currently knows. */
export function knownSpellsForPlayer(player: PlayerState): Spell[] {
  return knownSpellIdsForPlayer(player)
    .map((id) => getSpellById(id))
    .filter((s): s is Spell => Boolean(s));
}

/** Total spell count in the catalogue (for UI display). */
export const SPELLBOOK_SIZE = SPELLBOOK.length;

/** Abilities shown in the character creator (race + class only, no talents/scrolls yet). */
export function previewAbilities(raceId: string, classId: string): Ability[] {
  return [...(RACIAL_ABILITIES[raceId] ?? []), ...(CLASS_ABILITIES[classId] ?? [])];
}
