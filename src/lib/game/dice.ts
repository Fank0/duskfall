// Dice rolling engine — parses notation like "1d20", "2d6+3", "1d8-1".

export interface DiceResult {
  notation: string;
  rolls: number[]; // individual die results
  raw: number; // sum of dice
  modifier: number;
  total: number; // raw + modifier
}

/** Parse a dice notation string into count, sides and modifier. */
export function parseNotation(notation: string): {
  count: number;
  sides: number;
  modifier: number;
} {
  const cleaned = notation.replace(/\s+/g, "").toLowerCase();
  const match = cleaned.match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (!match) {
    return { count: 1, sides: 20, modifier: 0 };
  }
  return {
    count: parseInt(match[1], 10) || 1,
    sides: parseInt(match[2], 10) || 20,
    modifier: match[3] ? parseInt(match[3], 10) : 0,
  };
}

/** Roll a single die with `sides` faces. */
function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

/** Roll a full dice notation and return a detailed result. */
export function rollDice(notation: string, modifier = 0): DiceResult {
  const parsed = parseNotation(notation);
  const rolls: number[] = [];
  for (let i = 0; i < parsed.count; i++) {
    rolls.push(rollDie(parsed.sides));
  }
  const raw = rolls.reduce((a, b) => a + b, 0);
  const totalMod = parsed.modifier + modifier;
  return {
    notation,
    rolls,
    raw,
    modifier: totalMod,
    total: Math.max(0, raw + totalMod),
  };
}

/** Roll a d20 plus a modifier — the bread and butter of D&D. */
export function rollD20(modifier = 0): DiceResult {
  return rollDice("1d20", modifier);
}

/** Convenience: roll damage from a notation, never negative. */
export function rollDamage(notation: string): number {
  return rollDice(notation).total;
}

/** D&D 5e ability modifier from a stat score. */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}
