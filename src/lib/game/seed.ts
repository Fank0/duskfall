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
}

/** Seed a freshly-created room with host + hidden enemies (from a random location) + scene + intro. */
export async function seedRoomContent(roomId: string, input: CreatePlayerInput) {
  await createPlayer(roomId, input);

  const loc = randomStartLocation();

  // Hidden enemies from the chosen location.
  await db.monster.createMany({
    data: loc.monsters.map((m) => ({ ...m, roomId, isActive: false })),
  });

  // Opening scene (use a forest placeholder until the AI regenerates art; the
  // title/prompt carry the real location so the UI shows the right name).
  await db.scene.create({
    data: {
      roomId,
      imageUrl: "/scenes/forest-ruins.png",
      prompt: loc.prompt,
      title: loc.name,
      isActive: true,
    },
  });

  // Update the room's location label.
  await db.room.update({ where: { id: roomId }, data: { location: loc.name } });

  // Pick a random biome for the procedural dungeon (Пункт 36).
  const biomeId = randomBiomeId();

  // Generate a procedural dungeon map for the room (entrance auto-discovered).
  // The biome drives themed room labels + per-room-type image prompts; depth
  // scales the room count (1 → 8 rooms).
  try {
    await generateDungeonMap(roomId, 1, biomeId);
  } catch (e) {
    console.error("[seed] generateDungeonMap failed:", e);
  }

  // Opening narrative.
  await db.chatMessage.create({
    data: {
      roomId,
      role: "dm", speaker: "", round: 0,
      content: loc.intro.replace("{name}", input.name),
    },
  });
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
  for (const item of p.startItems) {
    const props = inferEquipProps(item.name, item.type, item.description);
    await db.inventoryItem.create({
      data: {
        roomId, playerName: input.name, itemName: item.name, itemType: item.type, quantity: 1, description: item.description,
        equipSlot: props.equipSlot, acBonus: props.acBonus, statBonus: serializeEquipStats(props.statBonus), damageNotation: props.damageNotation,
      },
    });
  }
  const bgProps = inferEquipProps(input.background.item.name, input.background.item.type, input.background.item.description);
  await db.inventoryItem.create({
    data: {
      roomId, playerName: input.name, itemName: input.background.item.name, itemType: input.background.item.type, quantity: 1, description: input.background.item.description,
      equipSlot: bgProps.equipSlot, acBonus: bgProps.acBonus, statBonus: serializeEquipStats(bgProps.statBonus), damageNotation: bgProps.damageNotation,
    },
  });
  return player;
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
