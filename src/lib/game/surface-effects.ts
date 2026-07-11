// D&D 5e Surface Effects for DUSKFALL (MASTER-PLAN Phase 6.1 + Task A6).
//
// Surface effects are ground-based hazards that affect tokens standing on
// or entering the affected cells. Inspired by Divinity: Original Sin 2's
// reactive surface system (Task A6).
//
// Surface types (stored in TerrainCell.type):
//   fire        — burning area, 1d6 fire damage at start of turn, ignites tokens
//   water       — shallow water (no mechanical effect alone, but conducts lightning)
//   ice         — slippery, DEX save or fall prone, half movement speed
//   poison      — poison cloud, 1d4 poison damage at start of turn, disadvantage on attacks
//   acid        — acid pool, 1d6 acid damage, -1 AC while standing in it
//   web         — restrained, DEX save to escape
//   smoke       — vision-blocking cloud (created when fire burns out)
//   steam       — vision-blocking fog cloud (created when fire meets water)
//   electrified — electrified water (stuns anyone entering for 1 round)
//   holy_water  — radiant surface (1d6 radiant to Undead on contact)
//
// Reactive surface transformations (DOS2-inspired chain reactions):
//   fire + water    → steam    (3 rounds fog, blocks vision)
//   fire persists 3 rounds     → smoke (2 rounds, blocks vision)
//   smoke after 2 rounds        → dissipates (cell cleared)
//   ice  + fire    → water     (melts, 3 rounds)
//   poison + fire  → explosion (2d6 fire damage to all in cell, consumes poison)
//   water + lightning → electrified (stuns anyone entering for 1 round)
//   holy_water on Undead → 1d6 radiant damage
//
// Surface effects are created by spells (Fire Bolt → fire, Ray of Frost → ice),
// monster abilities, or environmental interactions. They persist for N rounds.

import { db } from "@/lib/db";
import { rollDice } from "./dice";
import type { TerrainCellState, TerrainType } from "./terrain";

// ============================================================================
// Types
// ============================================================================

/** All surface effect types. Stored as TerrainCell.type. */
export type SurfaceEffectType =
  | "fire"
  | "water"
  | "ice"
  | "poison"
  | "acid"
  | "web"
  | "smoke"
  | "steam"
  | "electrified"
  | "holy_water";

/** A surface effect that exists in the world (mirrors TerrainCell row). */
export interface SurfaceEffect {
  id: string;
  roomId: string;
  type: SurfaceEffectType;
  x: number;
  y: number;
  duration: number; // rounds remaining (0 = permanent)
  createdAt: Date;
}

/** Result of a reactive transformation — damage/effects to apply + chat message. */
export interface SurfaceReactionEffect {
  type: "damage" | "stun" | "fog" | "radiant";
  x: number;
  y: number;
  amount?: number; // flat damage amount (already rolled)
  damageType?: string; // fire | cold | lightning | radiant | etc.
  duration?: number; // for fog/stun effects
  message: string; // Russian description for the chat log
}

// ============================================================================
// Surface properties
// ============================================================================

/** Visual + mechanical properties for each surface type. */
export const SURFACE_PROPS: Record<SurfaceEffectType, {
  label: string;
  icon: string;
  color: string;
  damageNotation?: string;
  damageType?: string;
  description: string;
  blocksVision?: boolean;
}> = {
  fire: {
    label: "Горящая поверхность",
    icon: "🔥",
    color: "rgba(249,115,22,0.35)",
    damageNotation: "1d6",
    damageType: "fire",
    description: "1d6 урона огнём в начале хода. Воспламеняет стоящих на ней.",
  },
  water: {
    label: "Вода",
    icon: "💧",
    color: "rgba(59,130,246,0.25)",
    description: "Мелкая вода. Проводит электричество — молния оглушает стоящих.",
  },
  ice: {
    label: "Ледяная поверхность",
    icon: "❄️",
    color: "rgba(125,211,252,0.3)",
    description: "Сложная местность. СПАС ЛОВ или сбит с ног. Половина скорости.",
  },
  poison: {
    label: "Ядовитое облако",
    icon: "☠️",
    color: "rgba(132,204,22,0.3)",
    damageNotation: "1d4",
    damageType: "poison",
    description: "1d4 урона ядом в начале хода. Помеха на атаки.",
  },
  acid: {
    label: "Кислотная лужа",
    icon: "🧪",
    color: "rgba(163,230,53,0.3)",
    damageNotation: "1d6",
    damageType: "acid",
    description: "1d6 урона кислотой. -1 AC стоящим на ней.",
  },
  web: {
    label: "Паутина",
    icon: "🕸️",
    color: "rgba(168,162,158,0.25)",
    description: "СПАС ЛОВ или связан. Нет движения до побега.",
  },
  smoke: {
    label: "Дым",
    icon: "💨",
    color: "rgba(120,113,108,0.4)",
    description: "Клубы дыма блокируют линию зрения сквозь клетку.",
    blocksVision: true,
  },
  steam: {
    label: "Пар",
    icon: "♨️",
    color: "rgba(229,231,235,0.45)",
    description: "Густой пар блокирует линию зрения сквозь клетку.",
    blocksVision: true,
  },
  electrified: {
    label: "Электризованная вода",
    icon: "⚡",
    color: "rgba(250,204,21,0.4)",
    description: "Любой входящий оглушается на 1 раунд (СПАС ТЕЛ DC 12).",
  },
  holy_water: {
    label: "Святая вода",
    icon: "✨",
    color: "rgba(253,224,71,0.35)",
    damageNotation: "1d6",
    damageType: "radiant",
    description: "1d6 урона излучением нежити в начале хода.",
  },
};

// ============================================================================
// Surface reaction rules (DOS2-inspired)
// ============================================================================

/**
 * Reactive surface transformation rules. When surface `a` (already on the cell)
 * meets surface `b` (newly applied, OR detected on the same/adjacent cell), the
 * cell transforms into `result`, and any `effect` is applied to entities in the
 * cell. Rules are symmetric — if a/b don't match, b/a is also tried.
 *
 * Reactions marked `consumesB` replace BOTH surfaces with the result. Otherwise
 * only the surface at the cell becomes `result`.
 */
export interface SurfaceReactionRule {
  a: SurfaceEffectType;
  b: SurfaceEffectType;
  result: SurfaceEffectType;
  resultDuration: number; // rounds the resulting surface lasts
  effect?: {
    type: "damage" | "stun" | "fog" | "radiant";
    amount?: string; // dice notation (e.g. "2d6")
    damageType?: string;
    duration?: number;
  };
  /** Russian message template — {x},{y} placeholders are filled in. */
  message: string;
}

export const SURFACE_REACTIONS: SurfaceReactionRule[] = [
  {
    a: "fire",
    b: "water",
    result: "steam",
    resultDuration: 3,
    effect: { type: "fog", duration: 3 },
    message:
      "💧🔥 Огонь встречает воду — поднимается клуб пара! (Туман на 3 хода) Клетка ({x},{y}).",
  },
  {
    a: "water",
    b: "fire",
    result: "steam",
    resultDuration: 3,
    effect: { type: "fog", duration: 3 },
    message:
      "💧🔥 Огонь встречает воду — поднимается клуб пара! (Туман на 3 хода) Клетка ({x},{y}).",
  },
  {
    a: "ice",
    b: "fire",
    result: "water",
    resultDuration: 3,
    message: "❄️🔥 Лёд тает от огня — клетка залита водой. Клетка ({x},{y}).",
  },
  {
    a: "fire",
    b: "ice",
    result: "water",
    resultDuration: 3,
    message: "❄️🔥 Лёд тает от огня — клетка залита водой. Клетка ({x},{y}).",
  },
  {
    a: "poison",
    b: "fire",
    result: "fire",
    resultDuration: 2,
    effect: { type: "damage", amount: "2d6", damageType: "fire" },
    message:
      "☠️🔥 Ядовитое облако вспыхивает! Взрыв наносит 2d6 урона огнём всем в клетке ({x},{y}).",
  },
  {
    a: "fire",
    b: "poison",
    result: "fire",
    resultDuration: 2,
    effect: { type: "damage", amount: "2d6", damageType: "fire" },
    message:
      "☠️🔥 Ядовитое облако вспыхивает! Взрыв наносит 2d6 урона огнём всем в клетке ({x},{y}).",
  },
  {
    a: "water",
    b: "electrified",
    result: "electrified",
    resultDuration: 2,
    effect: { type: "stun", duration: 1 },
    message:
      "⚡💧 Вода наэлектризована! Стоящие на клетке ({x},{y}) оглушены на 1 раунд (СПАС ТЕЛ DC 12).",
  },
  {
    // Lightning hitting water → electrified water
    a: "water",
    b: "fire", // placeholder — real "lightning" trigger handled via applySurfaceAt("electrified")
    result: "electrified",
    resultDuration: 2,
    effect: { type: "stun", duration: 1 },
    message:
      "⚡💧 Молния бьёт в воду — поверхность наэлектризована! Клетка ({x},{y}).",
  },
];

/**
 * Find a matching reaction rule for surfaces `a` + `b`. Returns the first
 * matching rule (rules are ordered by priority). Symmetric: tries both a/b and
 * b/a — but the table already includes both directions explicitly for clarity.
 */
export function findReaction(
  a: SurfaceEffectType,
  b: SurfaceEffectType
): SurfaceReactionRule | null {
  // Direct match first.
  let rule = SURFACE_REACTIONS.find((r) => r.a === a && r.b === b);
  if (rule) return rule;
  // Try swapped (in case the table only has one direction).
  rule = SURFACE_REACTIONS.find((r) => r.a === b && r.b === a);
  return rule ?? null;
}

// ============================================================================
// Process surface reactions (called after a surface is applied)
// ============================================================================

/**
 * Detect adjacent (or same-cell) conflicting surfaces in the given terrain
 * cells and return the transformed cell set + any damage/effects to apply.
 *
 * This is the heart of the DOS2-style chain reaction system: it scans the
 * current terrain, finds pairs of conflicting surfaces (e.g. fire next to
 * water), and replaces them with the resulting surface + emits effects
 * (damage, stun, fog).
 *
 * Effects are NOT applied here — the caller is responsible for applying damage
 * to entities in the affected cells, since surface-effects.ts must remain
 * side-effect-free from the DB (it operates on plain TerrainCellState arrays).
 *
 * Algorithm:
 *  1. Build a position→cell map.
 *  2. For each surface cell, look at the same cell + 4 neighbours.
 *  3. If a neighbour (or the same cell) has a conflicting surface type, find
 *     a reaction rule and replace BOTH cells with the result surface. Mark the
 *     cells as "consumed" so they don't trigger a second reaction this pass.
 *  4. Repeat until no more reactions fire (max 4 passes for chain reactions).
 */
export function processSurfaceReactions(cells: TerrainCellState[]): {
  newCells: TerrainCellState[];
  effects: SurfaceReactionEffect[];
} {
  if (cells.length === 0) return { newCells: cells, effects: [] };

  // Work on a mutable copy keyed by position so we can replace cells in-place.
  const byPos = new Map<string, TerrainCellState>();
  for (const c of cells) byPos.set(`${c.x},${c.y}`, { ...c });

  const effects: SurfaceReactionEffect[] = [];
  const NEIGHBOURS = [
    [0, 0],   // same cell
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  let pass = 0;
  let changed = true;
  while (changed && pass < 4) {
    changed = false;
    pass++;

    const consumed = new Set<string>();

    // Iterate over a snapshot of positions to avoid mutation-during-iteration.
    const positions = Array.from(byPos.values());
    for (const cell of positions) {
      const key = `${cell.x},${cell.y}`;
      if (consumed.has(key)) continue;

      // Only surface effect types participate in reactions.
      if (!isSurfaceType(cell.type)) continue;

      for (const [dx, dy] of NEIGHBOURS) {
        const nx = cell.x + dx;
        const ny = cell.y + dy;
        const nKey = `${nx},${ny}`;
        const neighbour = byPos.get(nKey);
        if (!neighbour) continue;
        if (consumed.has(nKey) && (dx !== 0 || dy !== 0)) continue;
        if (!isSurfaceType(neighbour.type)) continue;
        if (neighbour.type === cell.type) continue;

        const rule = findReaction(
          cell.type as SurfaceEffectType,
          neighbour.type as SurfaceEffectType
        );
        if (!rule) continue;

        // Apply the reaction: replace this cell with the result surface.
        // If the reaction is on the same cell (dx==0 && dy==0), only one cell
        // becomes the result. If it's a neighbour reaction, the neighbour
        // becomes the result surface too (chain spread).
        const resultCell: TerrainCellState = {
          x: cell.x,
          y: cell.y,
          type: rule.result,
          duration: rule.resultDuration,
        };
        byPos.set(key, resultCell);
        consumed.add(key);

        // Spread to the neighbour as well (the reaction consumes both).
        if (dx !== 0 || dy !== 0) {
          const spreadCell: TerrainCellState = {
            x: nx,
            y: ny,
            type: rule.result,
            duration: rule.resultDuration,
          };
          byPos.set(nKey, spreadCell);
          consumed.add(nKey);
        }

        // Roll damage if the reaction has a damage effect.
        let dmgAmount: number | undefined;
        if (rule.effect?.amount) {
          const roll = rollDice(rule.effect.amount);
          dmgAmount = roll.total;
        }

        effects.push({
          type: rule.effect?.type ?? "fog",
          x: cell.x,
          y: cell.y,
          amount: dmgAmount,
          damageType: rule.effect?.damageType,
          duration: rule.effect?.duration,
          message: rule.message
            .replace("{x}", String(cell.x))
            .replace("{y}", String(cell.y)),
        });

        changed = true;
        break; // restart the outer loop for chain reactions
      }
    }
  }

  return {
    newCells: Array.from(byPos.values()),
    effects,
  };
}

// ============================================================================
// Tick surfaces (called at the start of each combat round)
// ============================================================================

/**
 * Decrement durations of all temporary surfaces, then transform expired ones:
 *   - Fire at duration 0 → Smoke (duration 2)
 *   - Smoke at duration 0 → removed (dissipates)
 *   - Steam at duration 0 → removed (dissipates)
 *   - Electrified at duration 0 → reverts to Water (duration 0 = permanent)
 *   - Ice + adjacent Fire → melt to Water (duration 3) — handled as a special pass
 *   - All other surfaces (water, poison, acid, web, holy_water) → removed when duration hits 0
 *
 * Returns the new cell set + a list of Russian log messages describing what
 * happened. Does NOT mutate the DB — the caller is responsible for persisting
 * the changes (see dm-agent.ts → tickAndPersistSurfaces).
 */
export function tickSurfaces(cells: TerrainCellState[]): {
  newCells: TerrainCellState[];
  messages: string[];
} {
  if (cells.length === 0) return { newCells: cells, messages: [] };

  const messages: string[] = [];
  const byPos = new Map<string, TerrainCellState>();
  for (const c of cells) byPos.set(`${c.x},${c.y}`, { ...c });

  // ===== Pass 1: melt ice adjacent to fire (priority — happens BEFORE
  // the fire possibly converts to smoke). =====
  const iceCells = Array.from(byPos.values()).filter((c) => c.type === "ice");
  for (const ice of iceCells) {
    const NEIGHBOURS = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
    ];
    let melted = false;
    for (const [dx, dy] of NEIGHBOURS) {
      const neighbour = byPos.get(`${ice.x + dx},${ice.y + dy}`);
      if (neighbour?.type === "fire") {
        byPos.set(`${ice.x},${ice.y}`, {
          x: ice.x,
          y: ice.y,
          type: "water",
          duration: 3,
        });
        messages.push(
          `❄️🔥 Лёд на (${ice.x},${ice.y}) тает от соседнего огня — клетка залита водой.`
        );
        melted = true;
        break;
      }
    }
    if (melted) continue;
  }

  // ===== Pass 2: decrement durations + apply transformation rules. =====
  const toDelete = new Set<string>();
  for (const cell of Array.from(byPos.values())) {
    if (!isSurfaceType(cell.type)) continue;
    const cellDuration = cell.duration ?? 0;
    // Permanent surfaces (duration 0 = e.g. permanent water) — skip ticking
    // UNLESS it's a surface that always ticks (fire/ice/smoke/steam/electrified
    // — these always have a finite duration even if 0 slipped through).
    if (cellDuration <= 0 && cell.type !== "fire" && cell.type !== "smoke" && cell.type !== "steam" && cell.type !== "electrified") {
      continue;
    }
    const newDuration = Math.max(0, cellDuration - 1);
    const key = `${cell.x},${cell.y}`;

    if (cell.type === "fire" && newDuration === 0) {
      // Fire burns out → Smoke (2 rounds).
      byPos.set(key, { x: cell.x, y: cell.y, type: "smoke", duration: 2 });
      messages.push(
        `💨 Огонь на (${cell.x},${cell.y}) гаснет, оставляя клубы дыма (2 хода).`
      );
    } else if (cell.type === "smoke" && newDuration === 0) {
      // Smoke dissipates.
      toDelete.add(key);
      messages.push(`💨 Дым на (${cell.x},${cell.y}) рассеивается.`);
    } else if (cell.type === "steam" && newDuration === 0) {
      // Steam dissipates.
      toDelete.add(key);
      messages.push(`♨️ Пар на (${cell.x},${cell.y}) рассеивается.`);
    } else if (cell.type === "electrified" && newDuration === 0) {
      // Electrified water reverts to plain water.
      byPos.set(key, { x: cell.x, y: cell.y, type: "water", duration: 0 });
      messages.push(
        `⚡ Электризованная вода на (${cell.x},${cell.y}) разряжается — осталась лужа воды.`
      );
    } else if (newDuration === 0) {
      // Generic surface expired — remove.
      toDelete.add(key);
      const label = SURFACE_PROPS[cell.type as SurfaceEffectType]?.label ?? cell.type;
      messages.push(`${SURFACE_PROPS[cell.type as SurfaceEffectType]?.icon ?? "🌫️"} ${label} на (${cell.x},${cell.y}) рассеивается.`);
    } else {
      byPos.set(key, { x: cell.x, y: cell.y, type: cell.type, duration: newDuration });
    }
  }

  for (const key of toDelete) byPos.delete(key);

  return {
    newCells: Array.from(byPos.values()),
    messages,
  };
}

// ============================================================================
// Apply surface at a position (persists to DB + triggers reactions)
// ============================================================================

/**
 * Apply a surface effect at the given position with the given radius and
 * duration. Creates/updates TerrainCell rows of the appropriate type, then
 * runs `processSurfaceReactions` on the affected cells to trigger chain
 * reactions (fire+water→steam, poison+fire→explosion, etc.).
 *
 * Returns the chat messages to log (Russian) + any damage effects to apply to
 * entities standing in the affected cells. The caller is responsible for
 * applying damage to entities (since surface-effects.ts doesn't know about
 * monsters/players — it only knows about cells).
 */
export async function applySurfaceAt(
  roomId: string,
  type: SurfaceEffectType,
  x: number,
  y: number,
  radius: number = 0,
  duration: number = 3,
  source: string = ""
): Promise<{
  effects: SurfaceReactionEffect[];
  reactionMessages: string[];
  affectedCells: { x: number; y: number }[];
}> {
  // Determine the cells in the radius (Chebyshev = square radius).
  const targetCells: { x: number; y: number }[] = [];
  const r = Math.max(0, Math.min(3, Math.floor(radius)));
  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) > r) continue;
      const cx = x + dx;
      const cy = y + dy;
      if (cx < 0 || cy < 0 || cx >= 16 || cy >= 16) continue;
      targetCells.push({ x: cx, y: cy });
    }
  }

  // Upsert each target cell with the new surface type + duration.
  // IMPORTANT: full_cover is blocking terrain — don't overwrite walls/boulders.
  for (const cell of targetCells) {
    const existing = await db.terrainCell.findFirst({
      where: { roomId, x: cell.x, y: cell.y },
    });
    if (existing?.type === "full_cover") continue;

    // If the existing cell is a surface effect that reacts with the new type,
    // we let processSurfaceReactions handle the transformation below — so just
    // overwrite with the new type. If it's permanent terrain (difficult /
    // half_cover / high_ground / water), the surface is layered on top (we
    // lose the terrain type, which is fine for surface effects — they're
    // temporary).
    if (existing) {
      await db.terrainCell.update({
        where: { id: existing.id },
        data: { type, duration },
      });
    } else {
      await db.terrainCell.create({
        data: { roomId, x: cell.x, y: cell.y, type, duration },
      });
    }
  }

  // Load the FULL room terrain (so reactions can fire on neighbours outside
  // the just-applied radius — e.g. fire cast next to existing water).
  const allRows = await db.terrainCell.findMany({ where: { roomId } });
  const allCells: TerrainCellState[] = allRows.map((r) => ({
    x: r.x,
    y: r.y,
    type: r.type as TerrainType,
    duration: r.duration,
  }));

  // Run reactions on the full terrain. processSurfaceReactions is pure — it
  // returns the new cell set + effects, but does NOT mutate the DB.
  const { newCells, effects } = processSurfaceReactions(allCells);

  // Persist the transformed cells back to the DB. We do this with a
  // straightforward delete-all + recreate-many (the terrain table is small:
  // at most ~256 cells per room).
  await db.terrainCell.deleteMany({ where: { roomId } });
  if (newCells.length > 0) {
    await db.terrainCell.createMany({
      data: newCells.map((c) => ({
        roomId,
        x: c.x,
        y: c.y,
        type: c.type,
        duration: c.duration ?? 0,
      })),
    });
  }

  // Build the list of reaction messages + the affected cells (where damage
  // should be applied to entities).
  const reactionMessages: string[] = [];
  const cellsWithDamage = new Set<string>();
  for (const eff of effects) {
    reactionMessages.push(eff.message);
    if (eff.type === "damage" || eff.type === "radiant" || eff.type === "stun") {
      cellsWithDamage.add(`${eff.x},${eff.y}`);
    }
  }

  // Also emit a chat message for the surface itself if no reactions fired.
  if (effects.length === 0) {
    reactionMessages.push(
      `${SURFACE_PROPS[type].icon} ${SURFACE_PROPS[type].label} появилась на (${x},${y})${r > 0 ? ` радиус ${r}` : ""}! ${SURFACE_PROPS[type].description}` +
        (source ? ` (Источник: ${source})` : "")
    );
  }

  return {
    effects,
    reactionMessages,
    affectedCells: Array.from(cellsWithDamage).map((k) => {
      const [xs, ys] = k.split(",");
      return { x: parseInt(xs, 10), y: parseInt(ys, 10) };
    }),
  };
}

/**
 * Persist a fully-transformed terrain cell set (from `tickSurfaces`) back to
 * the DB. Called by the DM agent at the start of each round. Returns the new
 * cell list so the caller can broadcast it.
 */
export async function persistTerrainCells(
  roomId: string,
  cells: TerrainCellState[]
): Promise<void> {
  await db.terrainCell.deleteMany({ where: { roomId } });
  if (cells.length > 0) {
    await db.terrainCell.createMany({
      data: cells.map((c) => ({
        roomId,
        x: c.x,
        y: c.y,
        type: c.type,
        duration: c.duration ?? 0,
      })),
    });
  }
}

// ============================================================================
// Helpers
// ============================================================================

/** Returns true if the cell type is a reactive surface effect (not base terrain). */
export function isSurfaceType(type: string): boolean {
  return (
    type === "fire" ||
    type === "water" ||
    type === "ice" ||
    type === "poison" ||
    type === "acid" ||
    type === "web" ||
    type === "smoke" ||
    type === "steam" ||
    type === "electrified" ||
    type === "holy_water"
  );
}

/** Get the CSS color for a surface effect overlay on the grid. */
export function surfaceOverlayColor(type: SurfaceEffectType): string {
  return SURFACE_PROPS[type].color;
}

/** Get the icon for a surface effect. */
export function surfaceIcon(type: SurfaceEffectType): string {
  return SURFACE_PROPS[type].icon;
}

// ============================================================================
// Legacy API (kept for backward compat — createSurfaceEffect + applySurfaceEffects)
// ============================================================================

/**
 * @deprecated Use `applySurfaceAt` instead — it persists the surface AND
 * triggers DOS2-style chain reactions. This wrapper exists only for any
 * callers that haven't been migrated yet.
 */
export async function createSurfaceEffect(
  roomId: string,
  type: SurfaceEffectType,
  x: number,
  y: number,
  radius: number,
  duration: number,
  source: string
): Promise<void> {
  await applySurfaceAt(roomId, type, x, y, radius, duration, source);
}

/** Apply surface effects to a token at the start of its turn.
 *  Returns damage dealt + conditions applied + chat notes.
 *
 *  Note: this is a simplified per-turn surface damage application. Full
 *  per-turn surface effects (burning damage, electrified stun, etc.) are
 *  applied here based on the TerrainCell rows currently at the token's
 *  position. */
export async function applySurfaceEffects(
  roomId: string,
  targetName: string,
  posX: number,
  posY: number,
  round: number
): Promise<{ damage: number; notes: string[] }> {
  const cell = await db.terrainCell.findFirst({
    where: { roomId, x: posX, y: posY },
  });
  if (!cell || !isSurfaceType(cell.type)) {
    return { damage: 0, notes: [] };
  }
  const props = SURFACE_PROPS[cell.type as SurfaceEffectType];
  if (!props?.damageNotation) {
    return { damage: 0, notes: [] };
  }
  const roll = rollDice(props.damageNotation);
  return {
    damage: roll.total,
    notes: [
      `${props.icon} ${targetName} получает ${roll.total} урона ${props.damageType ?? ""} от поверхности «${props.label}» (клетка ${posX},${posY}).`,
    ],
  };
}
