/**
 * D&D 5e tactical pathfinding — A* on the 16x16 grid.
 *
 * 4-directional movement (no diagonals — D&D 5e standard).
 * Difficult terrain (mud, ice, rubble) costs 2 movement points.
 * Blocked cells (full_cover walls/boulders, plus any cell in the occupied set
 * — typically other monsters/players) are impassable.
 *
 * The goal cell is always enterable even if "occupied" (e.g. an enemy the
 * monster wants to attack) — the caller is responsible for not actually
 * moving onto a blocked cell in that case.
 *
 * Costs returned by `findPath` and `reachableCells` are in movement-points
 * (1 cell of normal terrain = 1 point). Divide by speed-in-cells to compare
 * against a creature's movement allowance (30 ft = 6 cells).
 *
 * D3 — Multi-cell bodies: a Large (2×2), Huge (3×3) or Gargantuan (4×4)
 * creature occupies every cell in its bounding box. Its (x, y) is the TOP-LEFT
 * cell. When `findPath`/`reachableCells` are called with `bodyDim > 1`, the
 * algorithm checks that ALL body cells at each candidate top-left position are
 * passable (in-bounds, no blocking terrain, not in the occupied set). The
 * goal-cell exemption still applies — the goal is the *target* cell (e.g. the
 * player the monster wants to reach), not the monster's resting position, so
 * the body may not actually fit there. Callers (monster AI) are expected to
 * stop 1 short of the goal and let the body's edge touch the target.
 */

import { GRID_SIZE } from "./state";
import {
  movementCostOf,
  isBlockingTerrain,
  isDamagingTerrain,
  type TerrainCellState,
} from "./terrain";

export interface PathCell {
  x: number;
  y: number;
}

export interface PathfindResult {
  /** Ordered list of cells from start (exclusive) to goal (inclusive). */
  path: PathCell[];
  /** Total movement-point cost of the path, or Infinity if unreachable. */
  cost: number;
  /** Cells along the path that have damaging terrain (fire, poison, acid, lava, thorns). */
  damagingCells: PathCell[];
}

/** Set of "x,y" keys representing occupied (impassable) cells. */
export type OccupiedSet = Set<string>;

// D3 — D&D 5e creature size category. Stored on Monster.size as a lowercase
// string, but the bestiary uses Title-case strings ("Small", "Large", etc.).
// `normalizeSize` below unifies both spellings.
export type MonsterSize = "tiny" | "small" | "medium" | "large" | "huge" | "gargantuan";

const NEIGHBORS: ReadonlyArray<[number, number]> = [
  [0, -1], // N
  [1, 0],  // E
  [0, 1],  // S
  [-1, 0], // W
];

function key(x: number, y: number): string {
  return `${x},${y}`;
}

/** Manhattan distance — admissible heuristic for 4-directional grids. */
function heuristic(x0: number, y0: number, x1: number, y1: number): number {
  return Math.abs(x1 - x0) + Math.abs(y1 - y0);
}

function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < GRID_SIZE && y < GRID_SIZE;
}

/**
 * D3 — Normalize a size string from any spelling (case-insensitive) into the
 * canonical lowercase union. Unknown / missing values default to "medium".
 */
export function normalizeSize(size: string | undefined | null): MonsterSize {
  const s = (size ?? "medium").toString().trim().toLowerCase();
  if (s === "tiny" || s === "small" || s === "medium" || s === "large" || s === "huge" || s === "gargantuan") {
    return s;
  }
  return "medium";
}

/**
 * D3 — Grid dimension (in cells) occupied by a creature of the given size.
 *   tiny / small / medium → 1 (visually smaller, but body is 1 cell)
 *   large                 → 2 (2×2)
 *   huge                  → 3 (3×3)
 *   gargantuan            → 4 (4×4)
 */
export function getMonsterDimension(size: string | undefined | null): number {
  switch (normalizeSize(size)) {
    case "large": return 2;
    case "huge": return 3;
    case "gargantuan": return 4;
    default: return 1;
  }
}

/**
 * D3 — Visual scale (0..1) for a creature's token relative to one cell.
 * Tiny / small creatures render smaller than 1 cell (centered within it).
 * Medium+ creatures render at 1 cell × their dimension.
 */
export function getMonsterVisualScale(size: string | undefined | null): number {
  switch (normalizeSize(size)) {
    case "tiny": return 0.7;
    case "small": return 0.85;
    default: return 1;
  }
}

/**
 * D3 — All grid cells occupied by a creature of the given size whose
 * TOP-LEFT cell is (x, y). For a 1×1 creature this returns just [{x,y}].
 * For a 2×2 at (5,5) it returns [(5,5),(6,5),(5,6),(6,6)].
 */
export function getMonsterCells(
  size: string | undefined | null,
  x: number,
  y: number,
): PathCell[] {
  const dim = getMonsterDimension(size);
  const out: PathCell[] = [];
  for (let dy = 0; dy < dim; dy++) {
    for (let dx = 0; dx < dim; dx++) {
      out.push({ x: x + dx, y: y + dy });
    }
  }
  return out;
}

/**
 * D3 — Continuous-space center of a creature of the given size whose top-left
 * is (x, y). For a 2×2 at (5,5) → (5.5, 5.5); for a 3×3 at (5,5) → (6, 6).
 * Used for attack-range / AoE-origin / distance calculations where the body's
 * center is more meaningful than its top-left corner.
 */
export function getMonsterCenter(
  size: string | undefined | null,
  x: number,
  y: number,
): { x: number; y: number } {
  const dim = getMonsterDimension(size);
  return { x: x + (dim - 1) / 2, y: y + (dim - 1) / 2 };
}

/**
 * D3 — Chebyshev (8-way) distance from a multi-cell monster's body to a
 * single-cell target at (px, py). This is the minimum Chebyshev distance from
 * any of the monster's body cells to the target. Returns 0 if the target
 * overlaps the body, 1 if the target is edge-adjacent (in melee reach), etc.
 *
 * Use this instead of `Math.max(|mx-px|, |my-py|)` whenever the monster may
 * be Large / Huge / Gargantuan.
 */
export function chebyshevDistanceFromBody(
  size: string | undefined | null,
  mx: number,
  my: number,
  px: number,
  py: number,
): number {
  const dim = getMonsterDimension(size);
  let best = Infinity;
  for (let dy = 0; dy < dim; dy++) {
    for (let dx = 0; dx < dim; dx++) {
      const d = Math.max(Math.abs(mx + dx - px), Math.abs(my + dy - py));
      if (d < best) best = d;
    }
  }
  return best;
}

/**
 * D3 — Set of "x,y" keys covered by a creature of the given size at (x, y).
 * Convenient for `Set.has()` lookups (e.g. when checking if a cell is inside
 * a monster's body for AoE / opportunity-attack / threat-zone purposes).
 */
export function getMonsterCellKeys(
  size: string | undefined | null,
  x: number,
  y: number,
): Set<string> {
  return new Set(getMonsterCells(size, x, y).map((c) => key(c.x, c.y)));
}

/** Is the cell passable, considering terrain + the occupied set? */
function isPassable(
  x: number,
  y: number,
  terrain: TerrainCellState[],
  occupied: OccupiedSet,
  goalX: number,
  goalY: number,
): boolean {
  if (!inBounds(x, y)) return false;
  if (isBlockingTerrain(terrain, x, y)) return false;
  if (!Number.isFinite(movementCostOf(terrain, x, y))) return false;
  // The goal cell may be "occupied" (e.g. an enemy target) — allow it so the
  // caller can still compute a path up to that creature.
  const isGoal = x === goalX && y === goalY;
  if (!isGoal && occupied.has(key(x, y))) return false;
  return true;
}

/**
 * D3 — Is the cell at (x, y) passable for a creature whose body spans
 * `bodyDim` × `bodyDim` cells (top-left at x, y)? Checks every body cell
 * against bounds, blocking terrain, and the occupied set (with the same
 * goal-cell exemption as `isPassable`). For bodyDim=1 this is equivalent to
 * `isPassable`.
 */
function isPassableForBody(
  x: number,
  y: number,
  bodyDim: number,
  terrain: TerrainCellState[],
  occupied: OccupiedSet,
  goalX: number,
  goalY: number,
): boolean {
  if (bodyDim <= 1) return isPassable(x, y, terrain, occupied, goalX, goalY);
  for (let dy = 0; dy < bodyDim; dy++) {
    for (let dx = 0; dx < bodyDim; dx++) {
      const bx = x + dx;
      const by = y + dy;
      if (!inBounds(bx, by)) return false;
      if (isBlockingTerrain(terrain, bx, by)) return false;
      if (!Number.isFinite(movementCostOf(terrain, bx, by))) return false;
      const isGoal = bx === goalX && by === goalY;
      if (!isGoal && occupied.has(key(bx, by))) return false;
    }
  }
  return true;
}

/**
 * A* pathfinding from (startX, startY) to (goalX, goalY).
 *
 * Returns `{ path, cost, damagingCells }`. If no path exists, or the cheapest
 * path costs more than `maxMovement`, returns
 * `{ path: [], cost: Infinity, damagingCells: [] }`.
 *
 * The returned `path` excludes the start cell and includes the goal cell.
 * The `cost` is the sum of `movementCostOf` for every cell entered along the
 * path (i.e. the goal and any intermediate cell, but not the start cell).
 *
 * D3 — `bodyDim` (default 1) is the grid dimension of the moving creature
 * (1 for tiny/small/medium, 2 for large, 3 for huge, 4 for gargantuan). When
 * greater than 1, the algorithm checks every body cell at each candidate
 * top-left position before allowing a step. See `getMonsterDimension`.
 */
export function findPath(
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
  terrain: TerrainCellState[],
  occupied: OccupiedSet,
  maxMovement: number = Infinity,
  bodyDim: number = 1,
): PathfindResult {
  if (!inBounds(startX, startY) || !inBounds(goalX, goalY)) {
    return { path: [], cost: Infinity, damagingCells: [] };
  }
  // Start == goal: empty path, zero cost.
  if (startX === goalX && startY === goalY) {
    return { path: [], cost: 0, damagingCells: [] };
  }

  // gScore: best known cost to reach each cell from start.
  const gScore = new Map<string, number>();
  // fScore: gScore + heuristic — used as the priority in the open set.
  const fScore = new Map<string, number>();
  // cameFrom: parent cell for path reconstruction.
  const cameFrom = new Map<string, string>();
  // closed set: cells already finalized.
  const closed = new Set<string>();

  const startKey = key(startX, startY);
  const goalKey = key(goalX, goalY);
  gScore.set(startKey, 0);
  fScore.set(startKey, heuristic(startX, startY, goalX, goalY));

  // Open set as an array of { key, x, y, f }. Linear scan for the min — fine
  // for a 16x16 = 256-cell grid (max 256 entries).
  const open: Array<{ k: string; x: number; y: number; f: number }> = [
    { k: startKey, x: startX, y: startY, f: fScore.get(startKey)! },
  ];

  const isGoalCell = (x: number, y: number) => x === goalX && y === goalY;

  while (open.length > 0) {
    // Pick the node with the lowest fScore (linear scan).
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestIdx].f) bestIdx = i;
    }
    const current = open.splice(bestIdx, 1)[0];

    // Reached the goal — reconstruct the path.
    if (current.k === goalKey) {
      const path: PathCell[] = [];
      const damagingCells: PathCell[] = [];
      let cur: string | undefined = current.k;
      while (cur && cur !== startKey) {
        const [cx, cy] = cur.split(",").map(Number);
        path.push({ x: cx, y: cy });
        if (isDamagingTerrain(terrain, cx, cy)) {
          damagingCells.push({ x: cx, y: cy });
        }
        cur = cameFrom.get(cur);
      }
      path.reverse();
      damagingCells.reverse();
      const totalCost = gScore.get(goalKey) ?? Infinity;
      if (!Number.isFinite(totalCost) || totalCost > maxMovement) {
        return { path: [], cost: Infinity, damagingCells: [] };
      }
      return { path, cost: totalCost, damagingCells };
    }

    closed.add(current.k);

    // Expand 4-directional neighbors.
    for (const [dx, dy] of NEIGHBORS) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (!isPassableForBody(nx, ny, bodyDim, terrain, occupied, goalX, goalY)) continue;
      const nKey = key(nx, ny);
      if (closed.has(nKey)) continue;

      const stepCost = movementCostOf(terrain, nx, ny);
      if (!Number.isFinite(stepCost)) continue;
      const tentativeG = (gScore.get(current.k) ?? Infinity) + stepCost;
      const knownG = gScore.get(nKey) ?? Infinity;
      if (tentativeG < knownG) {
        cameFrom.set(nKey, current.k);
        gScore.set(nKey, tentativeG);
        const f = tentativeG + heuristic(nx, ny, goalX, goalY);
        fScore.set(nKey, f);

        // Update or insert in the open set.
        const existing = open.find((o) => o.k === nKey);
        if (existing) {
          existing.f = f;
        } else {
          open.push({ k: nKey, x: nx, y: ny, f });
        }
      }
    }
  }

  // No path found.
  return { path: [], cost: Infinity, damagingCells: [] };
}

/**
 * Dijkstra flood-fill from (startX, startY). Returns a Map of "x,y" -> cost
 * for every cell reachable within `maxMovement` movement-points.
 *
 * - Excludes the start cell itself.
 * - Excludes cells present in the `occupied` set.
 * - Excludes cells with `Infinity` movement cost (full_cover / blocked).
 *
 * Used by the UI to highlight reachable cells on click-to-move, and by
 * monster AI to pick its next position from the full set of legal moves.
 *
 * D3 — `bodyDim` (default 1) makes the flood-fill body-aware (see `findPath`).
 */
export function reachableCells(
  startX: number,
  startY: number,
  maxMovement: number,
  terrain: TerrainCellState[],
  occupied: OccupiedSet,
  bodyDim: number = 1,
): Map<string, number> {
  const result = new Map<string, number>();
  if (!inBounds(startX, startY)) return result;
  if (!Number.isFinite(maxMovement) || maxMovement <= 0) return result;

  const startKey = key(startX, startY);
  const dist = new Map<string, number>();
  dist.set(startKey, 0);

  // Open set: array of { k, x, y, d }. Linear-scan for the min.
  const open: Array<{ k: string; x: number; y: number; d: number }> = [
    { k: startKey, x: startX, y: startY, d: 0 },
  ];
  const closed = new Set<string>();

  while (open.length > 0) {
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].d < open[bestIdx].d) bestIdx = i;
    }
    const current = open.splice(bestIdx, 1)[0];
    if (closed.has(current.k)) continue;
    closed.add(current.k);

    // Record into result (excluding the start cell, excluding occupied cells
    // other than the start — the start is always allowed to be its own origin).
    if (current.k !== startKey && !occupied.has(current.k)) {
      result.set(current.k, current.d);
    }

    for (const [dx, dy] of NEIGHBORS) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (!isPassableForBody(nx, ny, bodyDim, terrain, occupied, -1, -1)) continue;
      const stepCost = movementCostOf(terrain, nx, ny);
      if (!Number.isFinite(stepCost)) continue;
      const nKey = key(nx, ny);
      // Skip occupied neighbor cells (can't move through them).
      // (Goal-cell exemption not applicable for flood-fill — pass dummy goal.)
      if (occupied.has(nKey)) continue;
      const tentative = current.d + stepCost;
      if (tentative > maxMovement) continue;
      const known = dist.get(nKey) ?? Infinity;
      if (tentative < known) {
        dist.set(nKey, tentative);
        open.push({ k: nKey, x: nx, y: ny, d: tentative });
      }
    }
  }

  return result;
}
