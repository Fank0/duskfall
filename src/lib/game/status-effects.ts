// Status effects system for DUSKFALL.
//
// Each effect has:
//   - id (machine key, matches StatusEffectType)
//   - name (Russian, for UI + chat)
//   - icon (lucide-react component name — resolved in the UI)
//   - color (Tailwind text class for badges + token overlays)
//   - bg (Tailwind bg class for badges)
//   - description (Russian, short)
//   - kind: "harmful_dot" | "harmful_debuff" | "beneficial" | "control"
//   - tick?: called at start of target's turn — returns damage/heal + note
//
// All damage rolls use the dice engine (fair RNG). Notes are persisted to chat
// as `system` messages and surfaced to the UI via `statusEffectNotes`.

import { rollDice } from "./dice";
import type { StatusEffectType } from "./types";

export interface StatusEffectDef {
  id: StatusEffectType;
  name: string;
  icon: string;           // lucide icon name (string — UI maps to component)
  color: string;          // text color class
  bg: string;             // bg color class
  ring: string;           // border color class
  description: string;
  kind: "harmful_dot" | "harmful_debuff" | "beneficial" | "control";
  /** Tick at the start of the target's turn. Returns damage/heal + chat note. */
  tick?: (magnitude: number, targetName: string) => {
    damage?: number;
    heal?: number;
    note: string;          // Russian, e.g. "ТестГерой теряет 3 HP от отравления."
    diceLabel?: string;    // optional dice-roll label for the log
    diceNotation?: string;
    diceTotal?: number;
    diceRaw?: number;
  };
}

export const STATUS_EFFECTS: Record<StatusEffectType, StatusEffectDef> = {
  poisoned: {
    id: "poisoned",
    name: "Отравление",
    icon: "FlaskConical",
    color: "text-emerald-300",
    bg: "bg-emerald-950/40",
    ring: "border-emerald-700/50",
    description: "1d4 урона в начале хода. Спадает через несколько раундов.",
    kind: "harmful_dot",
    tick: (_mag, target) => {
      const r = rollDice("1d4");
      return {
        damage: r.total,
        note: `${target} страдает от яда — ${r.total} урона.`,
        diceLabel: `Яд: ${target}`,
        diceNotation: "1d4",
        diceTotal: r.total,
        diceRaw: r.raw,
      };
    },
  },
  bleeding: {
    id: "bleeding",
    name: "Кровотечение",
    icon: "Droplet",
    color: "text-red-300",
    bg: "bg-red-950/40",
    ring: "border-red-700/50",
    description: "2 урона в начале хода. Останавливается лечением или отдыхом.",
    kind: "harmful_dot",
    tick: (_mag, target) => ({
      damage: 2,
      note: `${target} истекает кровью — 2 урона.`,
      diceLabel: `Кровотечение: ${target}`,
      diceNotation: "2",
      diceTotal: 2,
      diceRaw: 2,
    }),
  },
  burning: {
    id: "burning",
    name: "Горение",
    icon: "Flame",
    color: "text-orange-300",
    bg: "bg-orange-950/40",
    ring: "border-orange-700/50",
    description: "1d6 урона огнём в начале хода. Может быть потушено.",
    kind: "harmful_dot",
    tick: (_mag, target) => {
      const r = rollDice("1d6");
      return {
        damage: r.total,
        note: `${target} горит — ${r.total} урона огнём.`,
        diceLabel: `Огонь: ${target}`,
        diceNotation: "1d6",
        diceTotal: r.total,
        diceRaw: r.raw,
      };
    },
  },
  frightened: {
    id: "frightened",
    name: "Испуг",
    icon: "Ghost",
    color: "text-purple-300",
    bg: "bg-purple-950/40",
    ring: "border-purple-700/50",
    description: "Помеха на броски атаки и проверки характеристик, пока источник видим.",
    kind: "harmful_debuff",
  },
  blessed: {
    id: "blessed",
    name: "Благословение",
    icon: "Sparkle",
    color: "text-amber-200",
    bg: "bg-amber-950/40",
    ring: "border-amber-600/50",
    description: "+1d4 к броскам атак и спасбросков.",
    kind: "beneficial",
  },
  shielded: {
    id: "shielded",
    name: "Щит веры",
    icon: "Shield",
    color: "text-sky-300",
    bg: "bg-sky-950/40",
    ring: "border-sky-700/50",
    description: "+magnitude к Классу Доспеха (обычно +2).",
    kind: "beneficial",
  },
  enraged: {
    id: "enraged",
    name: "Ярость",
    icon: "Swords",
    color: "text-rose-300",
    bg: "bg-rose-950/40",
    ring: "border-rose-700/50",
    description: "+2 к урону оружием. Сопротивление физическому урону.",
    kind: "beneficial",
  },
  slowed: {
    id: "slowed",
    name: "Замедление",
    icon: "Snail",
    color: "text-cyan-300",
    bg: "bg-cyan-950/40",
    ring: "border-cyan-700/50",
    description: "Перемещение уменьшено вдвое. Помеха на броски атаки.",
    kind: "harmful_debuff",
  },
  stunned: {
    id: "stunned",
    name: "Оглушение",
    icon: "Zap",
    color: "text-yellow-300",
    bg: "bg-yellow-950/40",
    ring: "border-yellow-700/50",
    description: "Не может действовать. Спасбросок в конце хода.",
    kind: "control",
  },
  marked: {
    id: "marked",
    name: "Метка охотника",
    icon: "Target",
    color: "text-amber-300",
    bg: "bg-amber-950/40",
    ring: "border-amber-700/50",
    description: "Преимущество на атаки по этой цели.",
    kind: "harmful_debuff",
  },
};

export const STATUS_EFFECT_LIST: StatusEffectDef[] = Object.values(STATUS_EFFECTS);

/** Parse an arbitrary string into a valid StatusEffectType (defensive — LLM output). */
export function parseEffectType(raw: string): StatusEffectType | null {
  const k = String(raw || "").toLowerCase().trim();
  if (k in STATUS_EFFECTS) return k as StatusEffectType;
  // Common synonyms / Russian → key.
  const syn: Record<string, StatusEffectType> = {
    poison: "poisoned", отравление: "poisoned", отравлен: "poisoned", яд: "poisoned",
    bleed: "bleeding", bleeding: "bleeding", кровотечение: "bleeding", кровь: "bleeding",
    burn: "burning", burning: "burning", огонь: "burning", горение: "burning", горит: "burning",
    fright: "frightened", frightened: "frightened", fear: "frightened", испуг: "frightened",
    bless: "blessed", blessed: "blessed", благословение: "blessed",
    shield: "shielded", shielded: "shielded", щит: "shielded",
    rage: "enraged", enraged: "enraged", ярость: "enraged",
    slow: "slowed", slowed: "slowed", замедление: "slowed",
    stun: "stunned", stunned: "stunned", оглушение: "stunned", оглушён: "stunned",
    mark: "marked", marked: "marked", метка: "marked",
  };
  return syn[k] ?? null;
}

/** Resolve the AC bonus from active `shielded` effects on a target. */
export function shieldedACBonus(effects: { effect: string; magnitude: number }[]): number {
  return effects
    .filter((e) => e.effect === "shielded")
    .reduce((sum, e) => sum + Math.max(1, e.magnitude || 2), 0);
}

/** Resolve the flat damage bonus from `enraged` effects. */
export function enragedDamageBonus(effects: { effect: string }[]): number {
  return effects.some((e) => e.effect === "enraged") ? 2 : 0;
}

/** Whether the target is stunned (skips their turn). */
export function isStunned(effects: { effect: string }[]): boolean {
  return effects.some((e) => e.effect === "stunned");
}

/** Whether the target is frightened (disadvantage on attacks). */
export function isFrightened(effects: { effect: string }[]): boolean {
  return effects.some((e) => e.effect === "frightened");
}

/** Whether the target is slowed (halved move, disadvantage on attacks). */
export function isSlowed(effects: { effect: string }[]): boolean {
  return effects.some((e) => e.effect === "slowed");
}
