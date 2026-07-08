// D&D 5e Surface Effects for DUSKFALL (MASTER-PLAN Phase 6.1).
//
// Surface effects are ground-based hazards that affect tokens standing on
// or entering the affected cells. Inspired by DOS2's surface system.
//
// Types:
//   fire   — burning area, 1d6 fire damage at start of turn, ignites tokens
//   ice    — slippery, DEX save or fall prone, half movement speed
//   poison — poison cloud, 1d4 poison damage at start of turn, disadvantage on attacks
//   acid   — acid pool, 1d6 acid damage, -1 AC while standing in it
//   web    — restrained, DEX save to escape
//
// Surface effects are created by spells (Fire Bolt → fire, Ray of Frost → ice),
// monster abilities, or environmental interactions. They persist for N rounds.

import { db } from "@/lib/db";
import { rollDice, rollD20, abilityModifier } from "./dice";
import type { TerrainCellState } from "./terrain";

export type SurfaceEffectType = "fire" | "ice" | "poison" | "acid" | "web";

export interface SurfaceEffect {
  id: string;
  roomId: string;
  type: SurfaceEffectType;
  x: number;
  y: number;
  radius: number; // 0 = single cell, 1 = 3x3, 2 = 5x5
  duration: number; // rounds remaining
  source: string; // who/what created it
  createdAt: Date;
}

/** Visual + mechanical properties for each surface type. */
export const SURFACE_PROPS: Record<SurfaceEffectType, {
  label: string;
  icon: string;
  color: string;
  damageNotation?: string;
  damageType?: string;
  description: string;
}> = {
  fire: {
    label: "Горящая поверхность",
    icon: "🔥",
    color: "rgba(249,115,22,0.35)",
    damageNotation: "1d6",
    damageType: "fire",
    description: "1d6 урона огнём в начале хона. Воспламеняет стоящих на ней.",
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
};

/** Create a surface effect in the DB (using TerrainCell as storage with extended type). */
export async function createSurfaceEffect(
  roomId: string,
  type: SurfaceEffectType,
  x: number,
  y: number,
  radius: number,
  duration: number,
  source: string
): Promise<void> {
  // Store surface effects as terrain cells with a special type prefix.
  // We use "difficult" as the base type (for movement cost) and track the
  // surface effect separately via a chat message + condition on tokens.
  // For now, create terrain cells in the radius.
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) > radius) continue;
      const cx = x + dx;
      const cy = y + dy;
      if (cx < 0 || cy < 0 || cx >= 16 || cy >= 16) continue;
      // Check if a terrain cell already exists at this position.
      const existing = await db.terrainCell.findFirst({ where: { roomId, x: cx, y: cy } });
      if (!existing) {
        await db.terrainCell.create({
          data: { roomId, x: cx, y: cy, type: "difficult" },
        });
      }
    }
  }
  // Log the surface effect creation.
  await db.chatMessage.create({
    data: {
      roomId, role: "system", speaker: "", round: 0,
      content: `${SURFACE_PROPS[type].icon} ${SURFACE_PROPS[type].label} появилась на (${x},${y}) радиус ${radius}! ${SURFACE_PROPS[type].description}`,
    },
  });
}

/** Apply surface effects to a token at the start of its turn.
 *  Returns damage dealt + conditions applied + chat notes. */
export async function applySurfaceEffects(
  roomId: string,
  targetName: string,
  posX: number,
  posY: number,
  round: number
): Promise<{ damage: number; notes: string[] }> {
  // For now, surface effects are tracked via terrain cells + a simplified
  // check. A full implementation would use a dedicated SurfaceEffect model.
  // This is a placeholder that demonstrates the DOS2-style surface system.
  return { damage: 0, notes: [] };
}

/** Get the CSS color for a surface effect overlay on the grid. */
export function surfaceOverlayColor(type: SurfaceEffectType): string {
  return SURFACE_PROPS[type].color;
}

/** Get the icon for a surface effect. */
export function surfaceIcon(type: SurfaceEffectType): string {
  return SURFACE_PROPS[type].icon;
}
