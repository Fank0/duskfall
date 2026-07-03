// Talent effect engine: given a player's selected talents, compute combat
// modifiers and resolve reactive effects (counterattack, healing, etc.).

import type { PlayerState, Talent, TalentEffect } from "./types";
import { CLASS_TALENTS, getTalentsForClass, ASI_TALENTS, getASITalents } from "./talent-data";
import { getClassIdByCharClass } from "./presets";
import { rollDice } from "./dice";

/** All Talent records for a class. */
export { getTalentsForClass, CLASS_TALENTS, ASI_TALENTS, getASITalents };

/** Resolve the list of talent ids a player has into concrete Talent objects. */
export function resolveTalents(player: { charClass: string; selectedTalents: string[] }): Talent[] {
  const classId = getClassIdByCharClass(player.charClass);
  const pool = getTalentsForClass(classId);
  return player.selectedTalents
    .map((id) => pool.find((t) => t.id === id))
    .filter((t): t is Talent => Boolean(t));
}

function effectsOf(player: PlayerState): TalentEffect[] {
  return resolveTalents(player).map((t) => t.effect);
}

/** Effective AC including ac_bonus talents. */
export function effectiveAC(player: PlayerState): number {
  let ac = player.ac;
  for (const e of effectsOf(player)) if (e.type === "ac_bonus") ac += e.value;
  return ac;
}

/** Effective max HP including hp_bonus talents. */
export function effectiveMaxHP(player: PlayerState): number {
  let hp = player.maxHp;
  for (const e of effectsOf(player)) if (e.type === "hp_bonus") hp += e.value;
  return hp;
}

/** Effective proficiency includes save_bonus as a generic check bonus. */
export function effectiveCheckBonus(player: PlayerState): number {
  let b = 0;
  for (const e of effectsOf(player)) if (e.type === "save_bonus") b += e.value;
  return b;
}

/** Initiative modifier from talents. */
export function initiativeBonusFromTalents(player: PlayerState): number {
  let b = 0;
  for (const e of effectsOf(player)) if (e.type === "initiative_bonus") b += e.value;
  return b;
}

/** Bonus flat damage added to every weapon hit. */
export function damageBonusFromTalents(player: PlayerState): number {
  let b = 0;
  for (const e of effectsOf(player)) if (e.type === "damage_bonus_flat") b += e.value;
  return b;
}

/** Crit threshold (natural d20 roll >= this is a crit). Default 20. */
export function critRangeFromTalents(player: PlayerState): number {
  let best = 20;
  for (const e of effectsOf(player)) if (e.type === "crit_range" && e.minRoll < best) best = e.minRoll;
  return best;
}

/** Extra weapon dice rolled on a crit. */
export function critBonusDiceFromTalents(player: PlayerState): number {
  let d = 0;
  for (const e of effectsOf(player)) if (e.type === "crit_bonus_dice") d += e.dice;
  return d;
}

/** Chance (0..1) for a free second attack this turn. */
export function extraAttackChance(player: PlayerState): number {
  let best = 0;
  for (const e of effectsOf(player)) if (e.type === "extra_attack_chance" && e.chance > best) best = e.chance;
  return best;
}

/** Does the player have "reroll one miss per turn"? */
export function hasRerollMissOnce(player: PlayerState): boolean {
  return effectsOf(player).some((e) => e.type === "reroll_miss_once");
}

/** Reduce incoming damage by resistance talents. Returns the reduced amount. */
export function applyDamageReduction(player: PlayerState, amount: number): number {
  let reduced = amount;
  for (const e of effectsOf(player)) {
    if (e.type === "damage_resistance_flat") reduced = Math.max(0, reduced - e.value);
    else if (e.type === "damage_resistance_pct") reduced = Math.round(reduced * (1 - e.value));
  }
  return Math.max(0, reduced);
}

/** Counterattack chance + notation (best one), or null if none. */
export function counterattackSpec(player: PlayerState): { chance: number; damageNotation: string } | null {
  let best: { chance: number; damageNotation: string } | null = null;
  for (const e of effectsOf(player)) {
    if (e.type === "counterattack" && (!best || e.chance > best.chance)) {
      best = { chance: e.chance, damageNotation: e.damageNotation };
    }
  }
  return best;
}

/** Healing received when the player kills an enemy (notation), or null. */
export function healOnKillNotation(player: PlayerState): string | null {
  for (const e of effectsOf(player)) if (e.type === "heal_on_kill") return e.notation;
  return null;
}

/** Vampiric fraction (0..1) of damage dealt that heals the attacker. */
export function vampiricPct(player: PlayerState): number {
  let v = 0;
  for (const e of effectsOf(player)) if (e.type === "vampiric_pct") v = Math.max(v, e.value);
  return v;
}

/** Roll a single reactive effect: does a counterattack trigger? Returns damage (0 = none). */
export function rollCounterattack(player: PlayerState): number {
  const spec = counterattackSpec(player);
  if (!spec) return 0;
  if (Math.random() >= spec.chance) return 0;
  return rollDice(spec.damageNotation).total;
}

/** Maybe trigger a free second attack (returns the attack roll result to test vs AC). */
export function rollExtraAttack(player: PlayerState): boolean {
  const chance = extraAttackChance(player);
  if (chance <= 0) return false;
  return Math.random() < chance;
}

/** Compute healing on a kill. */
export function rollHealOnKill(player: PlayerState): number {
  const notation = healOnKillNotation(player);
  if (!notation) return 0;
  return rollDice(notation).total;
}

/** Vampiric healing from damage dealt. */
export function rollVampiricHeal(player: PlayerState, damageDealt: number): number {
  const pct = vampiricPct(player);
  if (pct <= 0 || damageDealt <= 0) return 0;
  return Math.max(1, Math.round(damageDealt * pct));
}
