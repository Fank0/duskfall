/**
 * D&D 5e tactical terrain generator.
 *
 * Generates terrain features on the combat grid when a room is created:
 *   - difficult terrain (mud, ice, rubble) — movement costs 2x
 *   - half cover (pillars, trees, low walls) — +2 AC to creature behind it
 *   - full cover (solid walls, boulders) — blocks line of sight + projectiles
 *   - high ground (elevations) — advantage on attacks, enemies have disadvantage
 *   - water (shallow) — visible but no mechanical effect
 *
 * The terrain is biome-aware: forests get trees, crypts get pillars, swamps
 * get mud, etc. Terrain is seeded deterministically per room (using roomId
 * hash) so regenerating gives the same layout.
 */

import { db } from "@/lib/db";
import { GRID_SIZE } from "./state";

export type TerrainType = "difficult" | "half_cover" | "full_cover" | "high_ground" | "water";

export interface TerrainCellState {
  x: number;
  y: number;
  type: TerrainType;
}

/** Biome-specific terrain generation profiles.
 *  Each biome has a different mix of terrain types + density. */
const BIOME_PROFILES: Record<string, {
  difficult: number;   // % chance per cell
  half_cover: number;
  full_cover: number;
  high_ground: number;
  water: number;
}> = {
  forest:    { difficult: 0.12, half_cover: 0.18, full_cover: 0.04, high_ground: 0.06, water: 0.02 },
  crypt:     { difficult: 0.06, half_cover: 0.20, full_cover: 0.10, high_ground: 0.02, water: 0.01 },
  village:   { difficult: 0.08, half_cover: 0.12, full_cover: 0.08, high_ground: 0.04, water: 0.00 },
  caverns:   { difficult: 0.10, half_cover: 0.14, full_cover: 0.08, high_ground: 0.08, water: 0.03 },
  marsh:     { difficult: 0.25, half_cover: 0.06, full_cover: 0.02, high_ground: 0.02, water: 0.15 },
  tower:     { difficult: 0.04, half_cover: 0.10, full_cover: 0.06, high_ground: 0.12, water: 0.00 },
  shipwreck: { difficult: 0.08, half_cover: 0.10, full_cover: 0.06, high_ground: 0.04, water: 0.20 },
  monastery: { difficult: 0.06, half_cover: 0.16, full_cover: 0.08, high_ground: 0.06, water: 0.01 },
  dungeon:   { difficult: 0.08, half_cover: 0.12, full_cover: 0.10, high_ground: 0.04, water: 0.02 },
};

/** Simple seeded PRNG (mulberry32) — deterministic per roomId. */
function seededRng(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Spawn-friendly zones — keep clear of starting positions.
 *  Players start at bottom-left area (x: 0-6, y: 18-23).
 *  Monsters start at top-right area (x: 14-23, y: 0-6).
 *  We avoid placing full_cover in these zones so tokens aren't hidden. */
function isSpawnZone(x: number, y: number): boolean {
  const playerZone = x <= 5 && y >= 11;
  const monsterZone = x >= 10 && y <= 5;
  return playerZone || monsterZone;
}

/**
 * Generate and persist terrain cells for a room based on its biome.
 * Called once during room seeding. Uses the roomId as the seed for
 * deterministic generation.
 */
export async function generateTerrainForRoom(roomId: string, biome: string = "dungeon"): Promise<void> {
  const profile = BIOME_PROFILES[biome] ?? BIOME_PROFILES.dungeon;
  const rng = seededRng(hashString(roomId));
  const cells: { x: number; y: number; type: string }[] = [];

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      // Skip spawn zones for cover-type terrain (don't block token placement).
      const inSpawn = isSpawnZone(x, y);
      const roll = rng();
      let type: TerrainType | null = null;
      if (!inSpawn) {
        if (roll < profile.full_cover) type = "full_cover";
        else if (roll < profile.full_cover + profile.half_cover) type = "half_cover";
        else if (roll < profile.full_cover + profile.half_cover + profile.high_ground) type = "high_ground";
      }
      // Difficult terrain + water can appear anywhere (including spawn zones).
      if (!type) {
        const roll2 = rng();
        if (roll2 < profile.difficult) type = "difficult";
        else if (roll2 < profile.difficult + profile.water) type = "water";
      }
      if (type) {
        cells.push({ x, y, type });
      }
    }
  }

  if (cells.length > 0) {
    await db.terrainCell.createMany({
      data: cells.map((c) => ({ roomId, x: c.x, y: c.y, type: c.type })),
    });
  }
}

/** Load all terrain cells for a room (for snapshot). */
export async function getTerrainCells(roomId: string): Promise<TerrainCellState[]> {
  const rows = await db.terrainCell.findMany({ where: { roomId } });
  return rows.map((r) => ({ x: r.x, y: r.y, type: r.type as TerrainType }));
}

/** Get terrain at a specific cell, or null if empty. */
export function terrainAt(cells: TerrainCellState[], x: number, y: number): TerrainCellState | null {
  return cells.find((c) => c.x === x && c.y === y) ?? null;
}

/**
 * D&D 5e cover bonus: returns the AC bonus granted by cover at a position.
 *   - half_cover: +2 AC
 *   - full_cover: +5 AC
 *   - others: +0
 */
export function coverAcBonus(cells: TerrainCellState[], x: number, y: number): number {
  const t = terrainAt(cells, x, y);
  if (!t) return 0;
  if (t.type === "half_cover") return 2;
  if (t.type === "full_cover") return 5;
  return 0;
}

/**
 * D&D 5e: high ground grants advantage on attacks and enemies have
 * disadvantage attacking up. Returns "advantage" | "disadvantage" | null.
 */
export function highGroundAdvantage(cells: TerrainCellState[], x: number, y: number): "advantage" | null {
  const t = terrainAt(cells, x, y);
  if (t?.type === "high_ground") return "advantage";
  return null;
}

/** Check if a cell blocks line of sight (full cover). */
export function blocksLineOfSight(cells: TerrainCellState[], x: number, y: number): boolean {
  const t = terrainAt(cells, x, y);
  return t?.type === "full_cover";
}

/** Check if a cell is difficult terrain (movement costs 2x). */
export function isDifficultTerrain(cells: TerrainCellState[], x: number, y: number): boolean {
  const t = terrainAt(cells, x, y);
  return t?.type === "difficult";
}

/**
 * Bresenham's line algorithm — check if line of sight is blocked between
 * two points by any full_cover cell along the path.
 */
export function hasLineOfSight(
  cells: TerrainCellState[],
  x0: number, y0: number,
  x1: number, y1: number
): boolean {
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0, y = y0;
  while (true) {
    // Don't check the start/end cells (attacker/target positions).
    if ((x !== x0 || y !== y0) && (x !== x1 || y !== y1)) {
      if (blocksLineOfSight(cells, x, y)) return false;
    }
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
  return true;
}
