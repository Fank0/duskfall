// Room-content populator for the procedural dungeon generator (Пункт 36).
//
// Called from move-room/route.ts the first time the party enters a given map
// room (when MapRoom.populated is still false). Spawns biome-themed content
// based on the room's type:
//   combat  → 1–3 monsters from the biome pool (hidden until combat triggers)
//   loot    → 1–3 items dropped on the ground (playerName="__ground__")
//   npc     → 1 friendly NPC from the biome pool
//   safe    → no threats (the DM can narrate a short-rest opportunity)
//   trap    → 1–2 Trap rows placed on random grid cells
//   puzzle  → no spawn (the DM fleshes out the puzzle via narrative)
//   boss    → 1 boss monster (2× HP, isBoss=true, specialAbility in description)
//   entrance→ nothing (the party just walked in)
//
// All spawned content is scoped to the room + the map-room's "x,y" key so the
// new-dungeon flow can wipe and regenerate cleanly.

import { db } from "@/lib/db";
import { GRID_SIZE, invalidateSnapshotCache, upsertNpc, addDatabaseItemToInventory } from "./state";
import { getBiome, scaleBiomeMonster, scaleBiomeBoss, type DungeonBiomeId } from "./dungeon-biomes";
import { markRoomPopulated } from "./world-map";
import { generateLoot, type ItemEntry } from "./item-database";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function rnd(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

/** Persist a list of biome-scaled monsters as HIDDEN rows (isActive=false).
 *  They become visible once combat is triggered by a player action. */
async function spawnMonsters(
  roomId: string,
  biomeId: DungeonBiomeId,
  partyLevel: number,
  count: number
): Promise<void> {
  const biome = getBiome(biomeId);
  if (biome.monsters.length === 0) return;
  const data: any[] = [];
  for (let i = 0; i < count; i++) {
    const tpl = pick(biome.monsters);
    const label = `${tpl.name.slice(0, 2)}${i + 1}`;
    const m = scaleBiomeMonster(tpl, partyLevel, label);
    data.push({
      roomId,
      name: m.name,
      label: m.label,
      hp: m.hp,
      maxHp: m.maxHp,
      ac: m.ac,
      damageNotation: m.damageNotation,
      attackBonus: m.attackBonus,
      posX: m.posX,
      posY: m.posY,
      color: m.color,
      description: m.description,
      isActive: false,
      isBoss: false,
      specialAbility: "",
    });
  }
  await db.monster.createMany({ data });
}

/** Spawn a single boss monster (2× HP, isBoss=true, specialAbility in description). */
async function spawnBoss(
  roomId: string,
  biomeId: DungeonBiomeId,
  partyLevel: number
): Promise<void> {
  const biome = getBiome(biomeId);
  if (biome.bosses.length === 0) return;
  const tpl = pick(biome.bosses);
  const b = scaleBiomeBoss(tpl, partyLevel, "Б1");
  await db.monster.create({
    data: {
      roomId,
      name: b.name,
      label: b.label,
      hp: b.hp,
      maxHp: b.maxHp,
      ac: b.ac,
      damageNotation: b.damageNotation,
      attackBonus: b.attackBonus,
      posX: b.posX,
      posY: b.posY,
      color: b.color,
      description: b.description,
      // Bosses start HIDDEN (isActive=false); the DM agent reveals all
      // inactive monsters when the player's first combat action triggers
      // combat. This matches the existing monster-spawn pattern.
      isActive: false,
      isBoss: true,
      specialAbility: b.specialAbility,
    },
  });
}

/** Drop 1–3 loot items onto the ground (playerName="__ground__") so they show
 *  up as loot cells on the combat grid (item 20 loot shimmer overlay).
 *
 *  Uses generateLoot(partyLevel) so the loot scales with the party's level
 *  (higher level = higher rarity chance). Returns the spawned ItemEntry list
 *  so the caller can include the count in the room-discovery summary. */
async function spawnGroundLoot(
  roomId: string,
  partyLevel: number
): Promise<ItemEntry[]> {
  const entries = generateLoot(partyLevel);
  for (const entry of entries) {
    // addDatabaseItemToInventory uses the entry's explicit equipSlot / AC /
    // stat bonuses / damage notation — so catalog items keep their authored
    // stats rather than being re-inferred from name/description.
    await addDatabaseItemToInventory(roomId, "__ground__", entry);
  }
  return entries;
}

/** Place 1–2 traps at random combat-grid cells inside this map room. Traps
 *  start undiscovered & not disarmed; move-room rolls Perception on entry and
 *  /api/game/check-trap triggers them when a player steps on the cell. */
async function spawnTraps(
  roomId: string,
  mapRoomKey: string,
  biomeId: DungeonBiomeId,
  count: number
): Promise<void> {
  const biome = getBiome(biomeId);
  if (biome.traps.length === 0) return;
  const usedCells = new Set<string>();
  const data: any[] = [];
  for (let i = 0; i < count; i++) {
    let x = 0;
    let y = 0;
    let attempts = 0;
    do {
      x = rnd(GRID_SIZE);
      y = rnd(GRID_SIZE);
      attempts++;
    } while (usedCells.has(`${x},${y}`) && attempts < 20);
    usedCells.add(`${x},${y}`);
    const tpl = pick(biome.traps);
    data.push({
      roomId,
      mapRoomKey,
      x,
      y,
      type: tpl.type,
      damage: tpl.damage,
      dc: tpl.dc,
      discovered: false,
      disarmed: false,
    });
  }
  await db.trap.createMany({ data });
  invalidateSnapshotCache(roomId);
}

/** Spawn a friendly/neutral NPC from the biome pool. */
async function spawnNpc(roomId: string, biomeId: DungeonBiomeId): Promise<void> {
  const biome = getBiome(biomeId);
  if (biome.npcs.length === 0) return;
  const n = pick(biome.npcs);
  await upsertNpc(roomId, n.name, n.role, n.disposition, n.location, n.notes);
}

/** Population result returned to the caller for logging into the DM chat. */
export interface PopulateResult {
  populated: boolean;
  summary: string;
}

/** Populate a single map room with biome-themed content based on its type.
 *  Idempotent: if the room is already populated, returns early.
 *
 *  Side effect: also sweeps dead monsters (hp<=0) from previous rooms so they
 *  don't get re-activated by the DM agent's "reveal all inactive monsters"
 *  step on the next combat trigger (which would clutter the grid + initiative
 *  list with hp=0 tokens). Live monsters are left alone. */
export async function populateRoomContent(
  roomId: string,
  mapRoomKey: string,
  biomeId: DungeonBiomeId,
  partyLevel: number
): Promise<PopulateResult> {
  const [x, y] = mapRoomKey.split(",").map((n) => Number(n));
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { populated: false, summary: "" };
  }
  const room = await db.mapRoom.findFirst({ where: { roomId, x, y } });
  if (!room) return { populated: false, summary: "" };
  if (room.populated) {
    return { populated: false, summary: "" };
  }

  // Sweep dead monsters from previous rooms so they don't get re-activated
  // when the DM agent flips `isActive` on the next combat trigger.
  await db.monster.deleteMany({ where: { roomId, hp: { lte: 0 } } });

  let summary = "";
  switch (room.roomType as any) {
    case "combat": {
      const count = 1 + rnd(3); // 1..3
      await spawnMonsters(roomId, biomeId, partyLevel, count);
      summary = `В комнате притаились враги (${count}).`;
      break;
    }
    case "loot": {
      const entries = await spawnGroundLoot(roomId, partyLevel);
      const count = entries.length;
      summary = `На полу что-то блестит — сокровища (${count}).`;
      break;
    }
    case "npc": {
      await spawnNpc(roomId, biomeId);
      summary = "Здесь живёт кто-то — возможно, союзник.";
      break;
    }
    case "trap": {
      const count = 1 + rnd(2); // 1..2
      await spawnTraps(roomId, mapRoomKey, biomeId, count);
      summary = `Пол усеян ловушками (${count}). Будьте осторожны.`;
      break;
    }
    case "boss": {
      await spawnBoss(roomId, biomeId, partyLevel);
      summary = "Босс подземелья пробуждается!";
      break;
    }
    case "safe": {
      summary = "Здесь безопасно. Можно перевести дух.";
      break;
    }
    case "puzzle": {
      summary = "Здесь кроется загадка.";
      break;
    }
    case "entrance":
    default: {
      summary = "";
      break;
    }
  }

  await markRoomPopulated(roomId, x, y);
  return { populated: true, summary };
}
