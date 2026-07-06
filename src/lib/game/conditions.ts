// d20 fantasy RPG Conditions system — 18 conditions (10 base + 8 SRD) with gameplay effects.
//
// Each condition has a stable `id` (string), a Russian display name, an
// English name, an emoji icon, a color (for UI hints), a Russian description
// for the DM, and optional gameplay effect flags consumed by the combat
// engine (advantage/disadvantage, AC bonus, speed, etc.).
//
// Conditions are persisted in the `Condition` Prisma model per room+target
// and applied/removed via `state.ts`.

export interface ConditionDef {
  id: string;
  name: string; // Russian
  nameEn: string;
  icon: string; // emoji
  color: string;
  description: string; // Russian, short
  // Gameplay effects (all optional, default to false/undefined):
  attackDisadvantage?: boolean; // attacker with this rolls attacks with disadvantage
  attackAdvantage?: boolean; // attacker with this rolls attacks with advantage
  checkDisadvantage?: boolean; // ability checks at disadvantage
  saveAdvantage?: boolean; // saving throws at advantage
  acBonus?: number; // added to AC (shielded = +2)
  speedMultiplier?: number; // 0.5 = half speed
  skipTurn?: boolean; // stunned — loses the turn
  damagePerRound?: number; // burning — fire damage at start of turn
  // Blessed gives a flat +1d4 bonus to attacks & saves (NOT advantage):
  attackBonusDice?: number; // e.g. 4 = +1d4
  saveBonusDice?: number; // e.g. 4 = +1d4
}

export const CONDITIONS: Record<string, ConditionDef> = {
  poisoned: {
    id: "poisoned",
    name: "Отравлен",
    nameEn: "Poisoned",
    icon: "🤢",
    color: "#16a34a",
    description: "Отравление: помеха на атаки и проверки характеристик.",
    attackDisadvantage: true,
    checkDisadvantage: true,
  },
  stunned: {
    id: "stunned",
    name: "Оглушён",
    nameEn: "Stunned",
    icon: "💫",
    color: "#a855f7",
    description: "Оглушение: пропускает ход, атаки по нему с преимуществом.",
    skipTurn: true,
  },
  frightened: {
    id: "frightened",
    name: "Напуган",
    nameEn: "Frightened",
    icon: "😨",
    color: "#dc2626",
    description: "Испуг: помеха на проверки, пока источник виден.",
    checkDisadvantage: true,
  },
  burning: {
    id: "burning",
    name: "Горит",
    nameEn: "Burning",
    icon: "🔥",
    color: "#ea580c",
    description: "Пламя: в начале хода получает урон огнём (1d4).",
    damagePerRound: 4, // 1d4 rolled in the engine
  },
  slowed: {
    id: "slowed",
    name: "Замедлен",
    nameEn: "Slowed",
    icon: "🐌",
    color: "#0ea5e9",
    description: "Замедление: скорость вдвое.",
    speedMultiplier: 0.5,
  },
  blinded: {
    id: "blinded",
    name: "Ослеплён",
    nameEn: "Blinded",
    icon: "🙈",
    color: "#6b7280",
    description: "Слепота: помеха на атаки; атаки по нему с преимуществом.",
    attackDisadvantage: true,
  },
  prone: {
    id: "prone",
    name: "Сбит с ног",
    nameEn: "Prone",
    icon: "⬇️",
    color: "#92400e",
    description: "На земле: ползёт со скоростью вдвое; дальние атаки по нему с помехой.",
    speedMultiplier: 0.5,
  },
  blessed: {
    id: "blessed",
    name: "Благословен",
    nameEn: "Blessed",
    icon: "✨",
    color: "#eab308",
    description: "Благословение: +1d4 к атакам и спасброскам.",
    attackBonusDice: 4,
    saveBonusDice: 4,
  },
  shielded: {
    id: "shielded",
    name: "Под щитом",
    nameEn: "Shielded",
    icon: "🛡️",
    color: "#06b6d4",
    description: "Магический щит: +2 к Классу Доспеха.",
    acBonus: 2,
  },
  weakened: {
    id: "weakened",
    name: "Ослаблен",
    nameEn: "Weakened",
    icon: "💀",
    color: "#7c3aed",
    description: "Слабость: помеха на атаки и спасброски Силы.",
    attackDisadvantage: true,
  },
  restrained: {
    id: "restrained",
    name: "Связан",
    nameEn: "Restrained",
    icon: "🔗",
    color: "#78716c",
    description: "Связан: скорость 0, помеха на атаки и спасброски ЛОВ; атаки по нему с преимуществом.",
    attackDisadvantage: true,
    speedMultiplier: 0,
  },
  grappled: {
    id: "grappled",
    name: "Схвачен",
    nameEn: "Grappled",
    icon: "✊",
    color: "#a16207",
    description: "Схвачен: скорость 0. Может вырваться действием (спас СИЛ/АТЛ против DC схватившего).",
    speedMultiplier: 0,
  },
  paralyzed: {
    id: "paralyzed",
    name: "Парализован",
    nameEn: "Paralyzed",
    icon: "⚡",
    color: "#d946ef",
    description: "Паралич: не может двигаться или говорить; пропускает ход. Атаки по нему с преимуществом и критуют на ≤1.5м.",
    skipTurn: true,
  },
  charmed: {
    id: "charmed",
    name: "Очарован",
    nameEn: "Charmed",
    icon: "💝",
    color: "#ec4899",
    description: "Очарование: не может атаковать источника; источник получает преимущество на социальные проверки.",
    attackDisadvantage: false,
  },
  exhaustion: {
    id: "exhaustion",
    name: "Истощение",
    nameEn: "Exhaustion",
    icon: "😴",
    color: "#525252",
    description: "Истощение (1-6 уровней): 1 — помеха на проверки; 2 — скорость /2; 3 — помеха на атаки + спасброски; 4 — HP max /2; 5 — скорость 0; 6 — смерть.",
    checkDisadvantage: true,
    attackDisadvantage: true,
    speedMultiplier: 0.5,
  },
  deafened: {
    id: "deafened",
    name: "Оглох",
    nameEn: "Deafened",
    icon: "🔇",
    color: "#737373",
    description: "Глухота: не слышит ничего; помеха на проверки, требующие слуха. Не может кастовать с вербальным компонентом (правило Мастера).",
  },
  invisible: {
    id: "invisible",
    name: "Невидим",
    nameEn: "Invisible",
    icon: "👻",
    color: "#e5e5e5",
    description: "Невидимость: атаки с преимуществом; атаки по нему с помехой. Не обнаруживается зрением.",
    attackAdvantage: true,
  },
};

export function getCondition(type: string): ConditionDef | null {
  return CONDITIONS[type] ?? null;
}

export function isConditionType(type: string): boolean {
  return Boolean(CONDITIONS[type]);
}

/** List of valid condition ids (used for prompt documentation). */
export const CONDITION_IDS = Object.keys(CONDITIONS);

/** Returns true if the attacker with these condition ids has disadvantage on attacks. */
export function hasAttackDisadvantage(conditionIds: string[]): boolean {
  return conditionIds.some((id) => CONDITIONS[id]?.attackDisadvantage);
}

/** Returns true if the attacker has advantage on attacks (e.g. blessed-like). */
export function hasAttackAdvantage(conditionIds: string[]): boolean {
  return conditionIds.some((id) => CONDITIONS[id]?.attackAdvantage);
}

/** Bonus dice (e.g. 4 for +1d4) added to attack rolls from conditions like bless. */
export function attackBonusDice(conditionIds: string[]): number {
  let best = 0;
  for (const id of conditionIds) {
    const v = CONDITIONS[id]?.attackBonusDice ?? 0;
    if (v > best) best = v;
  }
  return best;
}

/** AC bonus from shielded-like conditions. */
export function acBonusFromConditions(conditionIds: string[]): number {
  let total = 0;
  for (const id of conditionIds) total += CONDITIONS[id]?.acBonus ?? 0;
  return total;
}

/** Speed multiplier (1 = normal, 0.5 = half). Most restrictive wins. */
export function speedMultiplierFromConditions(conditionIds: string[]): number {
  let worst = 1;
  for (const id of conditionIds) {
    const m = CONDITIONS[id]?.speedMultiplier;
    if (typeof m === "number" && m < worst) worst = m;
  }
  return worst;
}

/** Conditions that cause skip-turn behavior. */
export function shouldSkipTurn(conditionIds: string[]): boolean {
  return conditionIds.some((id) => CONDITIONS[id]?.skipTurn);
}

/** Damage taken at start of turn from conditions like burning. Returns total static damage (dice rolled elsewhere). */
export function damagePerRoundTotal(conditionIds: string[]): { dice: number; count: number }[] {
  const out: { dice: number; count: number }[] = [];
  for (const id of conditionIds) {
    const d = CONDITIONS[id]?.damagePerRound;
    if (d) out.push({ dice: d, count: 1 });
  }
  return out;
}
