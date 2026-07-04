// Seed a game room with a randomly-chosen starting location + hidden enemies
// + opening scene + narrative. Each new game begins somewhere different.

import { db } from "@/lib/db";
import type { CharClassPreset, RacePreset, BackgroundPreset } from "./types";
import {
  PARTY_POSITIONS, applyRaceBonuses,
  maxSpellSlotsForLevel, isCasterClass, hitDiceForClass,
} from "./presets";
import { randomStartLocation } from "./locations";
import { generateDungeonMap } from "./world-map";
import { inferEquipProps } from "./item-props";
import { randomBiomeId } from "./dungeon-biomes";
import { ITEM_DATABASE, type ItemEntry } from "./item-database";
import { addDatabaseItemToInventory } from "./state";
import { generateTerrainForRoom } from "./terrain";

/** Serialize a Partial<Stats> into a JSON string for storage. */
function serializeEquipStats(stats: Partial<Record<"str" | "dex" | "con" | "int" | "wis" | "cha", number>>): string {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(stats)) {
    if (v && v !== 0) out[k] = v;
  }
  return JSON.stringify(out);
}

export interface CreatePlayerInput {
  name: string;
  preset: CharClassPreset;
  race: RacePreset;
  background: BackgroundPreset;
  isHost: boolean;
  positionIndex: number;
  portraitUrl?: string | null;
  // Point-buy: how many additional points to add to each stat (beyond class base + race bonus).
  bonusStats?: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  // Player-authored backstory (up to 500 chars). Stored verbatim on the Player row.
  backstory?: string;
}

/** Seed a freshly-created room with host + hidden enemies (from a random location) + scene + intro. */
export async function seedRoomContent(roomId: string, input: CreatePlayerInput) {
  await createPlayer(roomId, input);

  const loc = randomStartLocation();

  // Hidden enemies from the chosen location.
  await db.monster.createMany({
    data: loc.monsters.map((m) => ({ ...m, roomId, isActive: false })),
  });

  // NO placeholder scene — the room/create route generates a real image
  // from the DM's intro description via Pollinations.ai immediately.
  // Leaving this out prevents the placeholder from showing up.

  // Update the room's location label.
  await db.room.update({ where: { id: roomId }, data: { location: loc.name } });

  // Pick a random biome for the procedural dungeon (Пункт 36).
  const biomeId = randomBiomeId();

  // Generate D&D 5e tactical terrain features on the combat grid.
  // Biome-aware: forests get trees, crypts get pillars, swamps get mud, etc.
  try {
    await generateTerrainForRoom(roomId, biomeId);
  } catch (e) {
    console.error("[seed] generateTerrainForRoom failed:", e);
  }

  // Generate a procedural dungeon map for the room (entrance auto-discovered).
  // The biome drives themed room labels + per-room-type image prompts; depth
  // scales the room count (1 → 8 rooms).
  try {
    await generateDungeonMap(roomId, 1, biomeId);
  } catch (e) {
    console.error("[seed] generateDungeonMap failed:", e);
  }

  // dm-context-fix Fix 3: NO hardcoded intro narrative. The DM generates a
  // unique opening on the first player action (see Room.introNeeded +
  // dm-agent.resolvePlayerMechanics). We just flag the room so the DM knows
  // to generate the intro on the next action.
  await db.room.update({ where: { id: roomId }, data: { introNeeded: true } });
}

/** Create a room and seed its world. */
export async function createRoomWithHost(input: CreatePlayerInput): Promise<{ roomCode: string; roomId: string }> {
  const code = await generateUniqueCode();
  const room = await db.room.create({
    data: {
      code,
      hostName: input.name,
      combatActive: false,
      round: 0,
      location: "—",
      turnIndex: 0,
      introShown: false,
    },
  });
  await seedRoomContent(room.id, input);
  return { roomCode: code, roomId: room.id };
}

/** Add a party member to an existing room. */
export async function joinRoomAsPlayer(roomId: string, input: CreatePlayerInput) {
  await createPlayer(roomId, input);
  await db.chatMessage.create({
    data: {
      roomId,
      role: "system", speaker: "", round: 0,
      content: `${input.name} (${input.race.name} ${input.preset.name}) присоединяется к отряду.`,
    },
  });
}

async function createPlayer(roomId: string, input: CreatePlayerInput) {
  const pos = PARTY_POSITIONS[input.positionIndex % PARTY_POSITIONS.length];
  const p = input.preset;
  const stats = applyRaceBonuses(
    { str: p.str, dex: p.dex, con: p.con, int: p.int, wis: p.wis, cha: p.cha },
    input.race
  );
  const b = input.bonusStats ?? { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
  const finalStr = Math.min(18, stats.str + b.str);
  const finalDex = Math.min(18, stats.dex + b.dex);
  const finalCon = Math.min(18, stats.con + b.con);
  const finalInt = Math.min(18, stats.int + b.int);
  const finalWis = Math.min(18, stats.wis + b.wis);
  const finalCha = Math.min(18, stats.cha + b.cha);
  // Spell slots: only casters get them; slots start full.
  const maxSlots = isCasterClass(p.id)
    ? maxSpellSlotsForLevel(p.charClass, 1)
    : {};
  const spellSlots = { ...maxSlots };
  const hitDice = hitDiceForClass(p.charClass);
  const player = await db.player.create({
    data: {
      roomId,
      name: input.name,
      charClass: p.charClass,
      level: 1,
      hp: p.hp,
      maxHp: p.hp,
      ac: p.ac,
      str: finalStr,
      dex: finalDex,
      con: finalCon,
      int: finalInt,
      wis: finalWis,
      cha: finalCha,
      proficiencyBonus: 2,
      gold: p.gold + input.background.goldBonus,
      posX: pos.x,
      posY: pos.y,
      color: p.color,
      weaponName: p.weaponName,
      weaponNotation: p.weaponNotation,
      portraitUrl: input.portraitUrl ?? null,
      isHost: input.isHost,
      isAlive: true,
      race: input.race.id,
      raceName: input.race.name,
      background: input.background.id,
      backgroundName: input.background.name,
      backstory: (input.backstory ?? "").trim().slice(0, 500),
      xp: 0,
      selectedTalents: "",
      bonusStr: b.str,
      bonusDex: b.dex,
      bonusCon: b.con,
      bonusInt: b.int,
      bonusWis: b.wis,
      bonusCha: b.cha,
      pendingLevelUp: false,
      spellSlots: JSON.stringify(spellSlots),
      maxSpellSlots: JSON.stringify(maxSlots),
      hitDice,
    },
  });
  // Starting inventory: class items + background item.
  // For each startItem, look up the item database (exact RU/EN name match).
  // If found, use the database entry via addDatabaseItemToInventory — this
  // ensures starting items have the proper AC bonuses, stat bonuses, and
  // damage notation from the catalog (rather than the looser inferEquipProps
  // heuristic). If not found, fall back to inferEquipProps + db create.
  for (const item of p.startItems) {
    const entry = findDatabaseItemByExactName(item.name);
    if (entry) {
      await addDatabaseItemToInventory(roomId, input.name, entry);
    } else {
      const props = inferEquipProps(item.name, item.type, item.description);
      await db.inventoryItem.create({
        data: {
          roomId, playerName: input.name, itemName: item.name, itemType: item.type, quantity: 1, description: item.description,
          equipSlot: props.equipSlot, acBonus: props.acBonus, statBonus: serializeEquipStats(props.statBonus), damageNotation: props.damageNotation,
        },
      });
    }
  }
  // Background item: same lookup-with-fallback pattern.
  const bgEntry = findDatabaseItemByExactName(input.background.item.name);
  if (bgEntry) {
    await addDatabaseItemToInventory(roomId, input.name, bgEntry);
  } else {
    const bgProps = inferEquipProps(input.background.item.name, input.background.item.type, input.background.item.description);
    await db.inventoryItem.create({
      data: {
        roomId, playerName: input.name, itemName: input.background.item.name, itemType: input.background.item.type, quantity: 1, description: input.background.item.description,
        equipSlot: bgProps.equipSlot, acBonus: bgProps.acBonus, statBonus: serializeEquipStats(bgProps.statBonus), damageNotation: bgProps.damageNotation,
      },
    });
  }

  // Auto-equip starting weapon + armor (so the player starts battle-ready).
  const allItems = await db.inventoryItem.findMany({ where: { roomId, playerName: input.name } });
  const weapon = allItems.find((it) => it.itemType === "weapon" || it.equipSlot === "weapon");
  const armor = allItems.find((it) => it.equipSlot === "chest" || it.itemType === "armor" || it.acBonus > 0);
  const shield = allItems.find((it) => it.equipSlot === "shield");
  const eqData: Record<string, string> = {};
  if (weapon) eqData.eqWeapon = weapon.id;
  if (armor) eqData.eqChest = armor.id;
  if (shield) eqData.eqShield = shield.id;
  if (Object.keys(eqData).length > 0) {
    await db.player.update({ where: { id: player.id }, data: eqData });
  }

  return player;
}

/** Exact case-insensitive match against ITEM_DATABASE (Russian OR English name).
 *  Returns undefined if no match. Stricter than findItemByName (no substring)
 *  so a startItem named «Посох странника» does NOT collide with the catalog's
 *  «Посох» — only exact-name items opt into the database path. */
function findDatabaseItemByExactName(name: string): ItemEntry | undefined {
  const q = (name || "").trim().toLowerCase();
  if (!q) return undefined;
  return ITEM_DATABASE.find(
    (i) => i.name.toLowerCase() === q || i.nameEn.toLowerCase() === q
  );
}

async function generateUniqueCode(): Promise<string> {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 30; attempt++) {
    let code = "";
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    const exists = await db.room.findUnique({ where: { code } });
    if (!exists) return code;
  }
  return "DND" + Math.floor(1000 + Math.random() * 9000);
}
