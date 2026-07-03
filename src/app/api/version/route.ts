import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const VERSION = "3.0";
const BUILD_DATE = "2026-07-03";
const COMMITS = 108;

export async function GET() {
  return NextResponse.json({
    version: VERSION,
    buildDate: BUILD_DATE,
    commits: COMMITS,
    features: [
      "combat-v2: conditions, advantage/disadvantage, spell-slots, AoE, flanking",
      "world-v2: quest-journal, world-map, npc-dialogue, day/night, weather, encounters",
      "progression-v2: skill-tree, equipment, crafting",
      "visual-v2: combat-animations, token-portraits, combat-log, grid-effects, themes",
      "opt: db-cache, llm-context-trim, prompt-cache, retry-backoff, model-routing",
      "infra: react-memo, logger, metrics, admin-api, validation, sanitize, ci",
      "dungeon-gen: 5-biomes, BSP, traps, bosses, depth-progression",
    ],
    diagnostic: "If you see this endpoint, you are running the NEW code (v2.0-restart).",
  });
}
