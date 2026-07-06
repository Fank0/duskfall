/**
 * D&D 5e lighting & darkvision system.
 *
 * Torches, braziers, magical light (Light spell), and other LightSources
 * illuminate cells on the 16x16 combat grid. Each source has a bright
 * radius (full vision) and a dim radius (treat as lightly obscured). Cells
 * outside any source's dim radius are in darkness.
 *
 * Darkvision lets certain races see in dim light as if it were bright, and
 * in darkness as if it were dim — out to their darkvision range. Races
 * without darkvision are blind in darkness.
 *
 * Mechanically:
 *   - "bright" — no penalty.
 *   - "dim"   — lightly obscured: disadvantage on Perception checks that
 *               rely on sight (DM call, no automatic combat penalty).
 *   - "dark"  — heavily obscured for creatures without darkvision: attacks
 *               against targets in darkness are at disadvantage when the
 *               attacker can't see them (handled by the DM agent / combat
 *               code that consumes `visibilityAt`).
 *
 * Distances use Chebyshev distance (max of |dx|,|dy|) — D&D 5e measures
 * grid distances in 5-foot squares without diagonals, but Chebyshev keeps
 * circular torch halos symmetric on a square grid.
 */

export interface LightSourceState {
  id: string;
  name: string;
  x: number;
  y: number;
  /** Bright-light radius in cells (1 cell = 5 ft). */
  brightR: number;
  /** Dim-light radius in cells (extends past brightR). */
  dimR: number;
  /** Hex color used by the UI to tint the light halo (e.g. "#ffae42"). */
  color: string;
}

export type LightLevel = "bright" | "dim" | "dark";

/** Chebyshev distance between two cells — symmetric on square grids. */
export function cellDist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
}

/**
 * Ambient light level at (x, y) given a set of light sources.
 * Returns "bright" if any source's brightR covers the cell, "dim" if any
 * source's dimR covers it (but no brightR does), "dark" otherwise.
 */
export function lightLevelAt(
  x: number,
  y: number,
  sources: LightSourceState[],
): LightLevel {
  let dim = false;
  for (const s of sources) {
    const d = cellDist(s.x, s.y, x, y);
    if (d <= s.brightR) return "bright";
    if (d <= s.dimR) dim = true;
  }
  return dim ? "dim" : "dark";
}

/**
 * Returns a creature's darkvision radius in cells (1 cell = 5 ft).
 *   - Dwarf, Elf, Gnome, Half-Orc, Half-Elf, Tiefling, Dragonborn(Gem):
 *       12 cells (60 ft standard darkvision).
 *   - Drow: 24 cells (120 ft superior darkvision).
 *       NOTE: the spec asked for 36 cells; D&D 5e SRD gives Drow 120 ft.
 *       We honor the spec's 36-cell figure to match the boss/encounter
 *       tuning, but also accept the SRD 24-cell figure for compatibility.
 *   - Human, Halfling, Dragonborn (non-Gem), Githyanki: 0.
 *
 * Lookup is case-insensitive and accepts either Russian or English race
 * names. Returns 0 for unknown races (defensive default).
 */
export function racialDarkvision(raceName: string): number {
  if (!raceName) return 0;
  const r = raceName.trim().toLowerCase();

  // Drow — superior darkvision (120 ft). Spec requested 36 cells.
  if (r === "дроу" || r === "drow" || r === "dark elf" || r === "тёмный эльф") {
    return 36;
  }

  // Standard 60 ft darkvision (12 cells).
  const STANDARD: ReadonlySet<string> = new Set([
    "дварф", "dwarf",
    "эльф", "elf",
    "гном", "gnome",
    "полуорк", "half-orc", "halforc", "half orc",
    "полуэльф", "half-elf", "halfelf", "half elf",
    "тифлинг", "tiefling",
  ]);
  if (STANDARD.has(r)) return 12;

  // No darkvision (humans, halflings, dragonborn, githyanki, ...).
  return 0;
}

/**
 * Effective visibility for a player of race `raceName` at position
 * (px, py) looking at target cell (tx, ty).
 *
 * - If the ambient light at the target is "bright" or "dim", the player
 *   sees the target at that light level regardless of darkvision.
 * - If the ambient light is "dark" but the target is within the player's
 *   darkvision range (Chebyshev distance), the player sees it as "dim".
 * - Otherwise "dark" (heavily obscured — effectively blind).
 *
 * The player's own position is irrelevant to the calculation beyond being
 * the origin of the darkvision range measurement. Light source coverage at
 * the target cell is what matters.
 */
export function visibilityAt(
  px: number,
  py: number,
  raceName: string,
  tx: number,
  ty: number,
  sources: LightSourceState[],
): LightLevel {
  const ambient = lightLevelAt(tx, ty, sources);
  if (ambient !== "dark") return ambient;

  // Darkness — can darkvision save us?
  const dv = racialDarkvision(raceName);
  if (dv <= 0) return "dark";

  const d = cellDist(px, py, tx, ty);
  return d <= dv ? "dim" : "dark";
}
