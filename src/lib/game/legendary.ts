/**
 * D&D 5e Legendary Actions — boss-only out-of-turn actions.
 *
 * Legendary monsters (bosses) get 3 legendary-action "points" at the start
 * of each of their turns. They can spend these as reactions, at the end of
 * another creature's turn, to perform one of the legendary actions listed
 * here. Unused points are lost when the boss's next turn begins (they
 * refresh to 3).
 *
 * Action costs (D&D 5e SRD convention):
 *   - 1 point: a single attack, a teleport, a perception check, etc.
 *   - 2 points: an AoE breath weapon, a multi-target spell, a powerful
 *               rider (paralysis, massive push).
 *   - 3 points: rarely used (only Ancient red dragon's "Detect" in SRD).
 *
 * This module exports:
 *   - `legendaryActionsForBoss(name)`   — registry lookup (case-insensitive,
 *     accepts Russian or English boss names).
 *   - `serializeLegendaryActions(...)`  — JSON.stringify for DB persistence.
 *   - `parseLegendaryActions(json)`     — defensive JSON.parse for DB read.
 *
 * Used by:
 *   - dm-agent.ts monster-AI loop (to fire a legendary action at the end of
 *     a player's turn).
 *   - The Monster editor / DB layer to persist custom legendary actions on
 *     boss instances (stored as a JSON column).
 */

export type LegendaryActionType = "attack" | "aoe" | "move" | "special";
export type AoeShape = "circle" | "cone" | "line";

export interface LegendaryAction {
  /** Russian display name (shown to players in the combat log). */
  name: string;
  /** English secondary name (bestiary / DM reference). */
  nameEn: string;
  /** Legendary-action cost: 1, 2, or (rarely) 3. */
  cost: number;
  /** Mechanical category — drives how the DM agent executes the action. */
  type: LegendaryActionType;
  /** Damage notation for attacks/AoEs that deal damage (e.g. "2d8+10"). */
  notation?: string;
  /** Range in cells (1 cell = 5 ft). Melee = 1; ranged attacks/spells use more. */
  range?: number;
  /** AoE shape — only set for type="aoe". */
  aoeShape?: AoeShape;
  /** AoE size in cells (radius for circle, length for cone/line). */
  aoeSize?: number;
  /** Elemental damage type for AoEs (fire, lightning, necrotic, ...). */
  aoeElement?: string;
  /** Saving-throw ability for effects that allow a save (dex, con, wis, ...). */
  saveAbility?: string;
  /** DC for the saving throw. */
  saveDC?: number;
  /** Russian description / flavour text shown in the combat log. */
  description: string;
}

/**
 * Registry of legendary actions per boss. Keys are Russian display names
 * (matching the bestiary); the lookup function also accepts English names
 * and is case-insensitive.
 *
 * Each boss gets exactly 3 actions. Total cost at full spend is always
 * 4 points (1 + 2 + 1) so a boss can fire its cost-2 action and one of its
 * cost-1 actions in a single round, or all three cost-1 actions across
 * three creature turns.
 */
const LEGENDARY_REGISTRY: Record<string, LegendaryAction[]> = {
  // ── Древний красный дракон / Ancient Red Dragon ──────────────────────────
  "Древний красный дракон": [
    {
      name: "Коготь", nameEn: "Claw",
      cost: 1, type: "attack",
      notation: "2d8+10", range: 1,
      description: "Один коготь разрубает цель.",
    },
    {
      name: "Огненное дыхание", nameEn: "Fire Breath",
      cost: 2, type: "aoe",
      aoeShape: "cone", aoeSize: 9, aoeElement: "огонь",
      notation: "12d6",
      saveAbility: "dex", saveDC: 24,
      description: "Конус огня 45 футов: 12d6 урона огнём, Ловкость DC 24 — половина.",
    },
    {
      name: "Удар крыла", nameEn: "Wing Buffet",
      cost: 1, type: "special",
      description: "Взмах крыльев отбрасывает существ в радиусе 3 клеток и сбивает их с ног.",
    },
  ],

  // ── Лич / Lich ───────────────────────────────────────────────────────────
  "Лич": [
    {
      name: "Парализующее касание", nameEn: "Paralyzing Touch",
      cost: 1, type: "attack",
      notation: "3d6+5", range: 1,
      saveAbility: "con", saveDC: 18,
      description: "Касание: 3d6+5 некротического урона, Телосложение DC 18 или паралич на 1 минуту.",
    },
    {
      name: "Увядание", nameEn: "Blight",
      cost: 2, type: "aoe",
      aoeShape: "circle", aoeSize: 4, aoeElement: "некротическая энергия",
      notation: "8d8",
      saveAbility: "con", saveDC: 20,
      description: "Круг 20 футов: 8d8 некротического урона, Телосложение DC 20 — половина.",
    },
    {
      name: "Телепорт", nameEn: "Teleport",
      cost: 1, type: "move",
      description: "Лич мгновенно телепортируется на любую видимую клетку в пределах 18 клеток.",
    },
  ],

  // ── Балор / Balor ────────────────────────────────────────────────────────
  "Балор": [
    {
      name: "Длинный меч", nameEn: "Longsword",
      cost: 1, type: "attack",
      notation: "3d8+8", range: 1,
      description: "Огненный длинный меч: 3d8+8 рубящего урона + 3d6 урона огнём.",
    },
    {
      name: "Огненная аура", nameEn: "Fire Aura",
      cost: 2, type: "aoe",
      aoeShape: "circle", aoeSize: 1, aoeElement: "огонь",
      notation: "3d6",
      description: "Каждое существо в радиусе 1 клетки получает 3d6 урона огнём (без спасброска).",
    },
    {
      name: "Телепорт", nameEn: "Teleport",
      cost: 1, type: "move",
      description: "Балор телепортируется на любую видимую клетку в пределах 18 клеток.",
    },
  ],

  // ── Вальтраксис Красный (campaign boss) ──────────────────────────────────
  "Вальтраксис Красный": [
    {
      name: "Коготь", nameEn: "Claw",
      cost: 1, type: "attack",
      notation: "3d10+8", range: 1,
      description: "Один сокрушительный удар когтём.",
    },
    {
      name: "Огненное дыхание", nameEn: "Fire Breath",
      cost: 2, type: "aoe",
      aoeShape: "cone", aoeSize: 9, aoeElement: "огонь",
      notation: "12d6",
      saveAbility: "dex", saveDC: 24,
      description: "Конус огня 45 футов: 12d6 урона огнём, Ловкость DC 24 — половина.",
    },
    {
      name: "Удар крыла", nameEn: "Wing Buffet",
      cost: 1, type: "special",
      description: "Взмах крыльев отбрасывает существ в радиусе 3 клеток и сбивает их с ног.",
    },
  ],

  // ── Древний синий дракон / Ancient Blue Dragon ───────────────────────────
  "Древний синий дракон": [
    {
      name: "Укус", nameEn: "Bite",
      cost: 1, type: "attack",
      notation: "2d10+8", range: 1,
      description: "Укус: 2d10+8 колющего урона + 2d8 урона электричеством.",
    },
    {
      name: "Дыхание молнии", nameEn: "Lightning Breath",
      cost: 2, type: "aoe",
      aoeShape: "line", aoeSize: 18, aoeElement: "молния",
      notation: "12d6",
      saveAbility: "dex", saveDC: 23,
      description: "Линия молнии 90 футов: 12d6 урона электричеством, Ловкость DC 23 — половина.",
    },
    {
      name: "Удар хвостом", nameEn: "Tail",
      cost: 1, type: "attack",
      notation: "2d8+8", range: 2,
      saveAbility: "str", saveDC: 22,
      description: "Удар хвостом: 2d8+8 дробящего урона, Сила DC 22 — сбит с ног.",
    },
  ],

  // ── Король личей / Lich King ─────────────────────────────────────────────
  "Король личей": [
    {
      name: "Парализующее касание", nameEn: "Paralyzing Touch",
      cost: 1, type: "attack",
      notation: "3d6+7", range: 1,
      saveAbility: "con", saveDC: 20,
      description: "Касание: 3d6+7 некротического урона, Телосложение DC 20 или паралич на 1 минуту.",
    },
    {
      name: "Разрушение жизни", nameEn: "Disrupt Life",
      cost: 2, type: "aoe",
      aoeShape: "circle", aoeSize: 6, aoeElement: "некротическая энергия",
      notation: "5d6",
      saveAbility: "con", saveDC: 21,
      description: "Круг 30 футов: 5d6 некротического урона всем живым, Телосложение DC 21 — половина.",
    },
    {
      name: "Телепорт", nameEn: "Teleport",
      cost: 1, type: "move",
      description: "Король личей телепортируется на любую видимую клетку в пределах 18 клеток.",
    },
  ],
};

/** Aliases — English/case-variant names → registry key. */
const NAME_ALIASES: Record<string, string> = {
  "ancient red dragon": "Древний красный дракон",
  "древний красный дракон": "Древний красный дракон",
  "lich": "Лич",
  "лич": "Лич",
  "balor": "Балор",
  "балор": "Балор",
  "valtraxis red": "Вальтраксис Красный",
  "valtraxis": "Вальтраксис Красный",
  "вальтраксис": "Вальтраксис Красный",
  "вальтраксис красный": "Вальтраксис Красный",
  "ancient blue dragon": "Древний синий дракон",
  "древний синий дракон": "Древний синий дракон",
  "lich king": "Король личей",
  "король личей": "Король личей",
};

/**
 * Look up the legendary-action list for a boss by name. Case-insensitive,
 * accepts either Russian (registry key) or English (alias). Returns
 * `undefined` if the boss has no legendary actions (most non-boss monsters).
 *
 * The returned array is the live registry entry — callers MUST NOT mutate it.
 */
export function legendaryActionsForBoss(name: string): LegendaryAction[] | undefined {
  if (!name) return undefined;
  const k = name.trim().toLowerCase();
  // 1. Direct alias hit.
  const aliased = NAME_ALIASES[k];
  if (aliased) return LEGENDARY_REGISTRY[aliased];
  // 2. Direct registry-key hit (case-insensitive).
  const directKey = Object.keys(LEGENDARY_REGISTRY).find(
    (rk) => rk.toLowerCase() === k,
  );
  if (directKey) return LEGENDARY_REGISTRY[directKey];
  // 3. Substring fallback — useful when the boss name in the DB includes a
  //    suffix like "Вальтраксис Красный (Акт III)".
  const substringKey = Object.keys(LEGENDARY_REGISTRY).find(
    (rk) => rk.toLowerCase().includes(k) || k.includes(rk.toLowerCase()),
  );
  if (substringKey) return LEGENDARY_REGISTRY[substringKey];
  return undefined;
}

/**
 * Serialize a legendary-actions array for DB persistence. Returns `null` if
 * the array is undefined or empty (so the column can be set to NULL rather
 * than storing "[]").
 */
export function serializeLegendaryActions(
  actions: LegendaryAction[] | undefined,
): string | null {
  if (!actions || actions.length === 0) return null;
  try {
    return JSON.stringify(actions);
  } catch {
    return null;
  }
}

/**
 * Parse a legendary-actions JSON blob from the DB. Defensive — returns
 * `null` on any parse or validation failure rather than throwing.
 *
 * Only arrays of objects with at least `name`, `nameEn`, `cost`, `type`,
 * and `description` are accepted; malformed entries are filtered out.
 */
export function parseLegendaryActions(json: string | null): LegendaryAction[] | null {
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return null;
    const out: LegendaryAction[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      if (
        typeof e.name === "string" &&
        typeof e.nameEn === "string" &&
        typeof e.cost === "number" &&
        typeof e.type === "string" &&
        typeof e.description === "string"
      ) {
        out.push(e as unknown as LegendaryAction);
      }
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}
