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
import { abilityModifier } from "./dice";

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
  // D&D 5e: assign resistances/immunities based on monster type.
  await db.monster.createMany({
    data: loc.monsters.map((m) => {
      const { resistances, immunities, conditionImmunities } = getMonsterDefenses(m.name);
      return {
        ...m, roomId, isActive: false,
        resistances: JSON.stringify(resistances),
        immunities: JSON.stringify(immunities),
        conditionImmunities: JSON.stringify(conditionImmunities),
      };
    }),
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
      // D&D 5e: saving throw proficiencies by class.
      saveProficiencies: JSON.stringify(getSaveProficiencies(p.charClass)),
      // D&D 5e: skill proficiencies by background (simplified — 2 skills per background).
      skillProficiencies: JSON.stringify(getSkillProficiencies(input.background.id)),
      // Passive perception = 10 + WIS modifier (+ proficiency if perception is a skill proficiency).
      passivePerception: 10 + abilityModifier(finalWis) + (getSkillProficiencies(input.background.id).includes("perception") ? 2 : 0),
      // Spell save DC = 8 + proficiency + casting stat modifier (INT for wizard, WIS for cleric/druid, CHA for sorcerer/warlock/bard/paladin).
      spellSaveDC: 8 + 2 + abilityModifier(getCastingStat(p.charClass, finalInt, finalWis, finalCha)),
      // D&D 5e class resources.
      classResources: JSON.stringify(getClassResources(p.charClass, 1, finalCha)),
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
  // First, ensure the preset weapon exists in inventory (some presets like Druid
  // have weaponName but don't include it in startItems — only a focus item).
  const existingWeapon = await db.inventoryItem.findFirst({
    where: { roomId, playerName: input.name, itemName: p.weaponName },
  });
  if (!existingWeapon) {
    await db.inventoryItem.create({
      data: {
        roomId, playerName: input.name,
        itemName: p.weaponName, itemType: "weapon", quantity: 1,
        description: p.weaponNotation ? `Урон: ${p.weaponNotation}` : "",
        equipSlot: "weapon",
        damageNotation: p.weaponNotation || "1d6+2",
      },
    });
  }
  const allItems = await db.inventoryItem.findMany({ where: { roomId, playerName: input.name } });
  const weapon = allItems.find((it) => it.itemType === "weapon" || it.equipSlot === "weapon");
  const armor = allItems.find((it) => (it.equipSlot === "chest" || it.itemType === "armor" || (it.acBonus > 0 && it.equipSlot !== "shield")) && it.equipSlot !== "shield");
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

/** D&D 5e: saving throw proficiencies by class (SRD). */
function getSaveProficiencies(charClass: string): string[] {
  const map: Record<string, string[]> = {
    "Barbarian": ["str_save", "con_save"],
    "Bard": ["dex_save", "cha_save"],
    "Cleric": ["wis_save", "cha_save"],
    "Druid": ["int_save", "wis_save"],
    "Fighter": ["str_save", "con_save"],
    "Monk": ["str_save", "dex_save"],
    "Paladin": ["wis_save", "cha_save"],
    "Ranger": ["str_save", "dex_save"],
    "Rogue": ["dex_save", "int_save"],
    "Sorcerer": ["con_save", "cha_save"],
    "Warlock": ["wis_save", "cha_save"],
    "Wizard": ["int_save", "wis_save"],
  };
  return map[charClass] ?? ["dex_save", "con_save"];
}

/** D&D 5e: skill proficiencies by background (simplified — 2 skills per background). */
function getSkillProficiencies(backgroundId: string): string[] {
  const map: Record<string, string[]> = {
    "soldier": ["athletics", "intimidation"],
    "sage": ["arcana", "history"],
    "criminal": ["deception", "stealth"],
    "folk-hero": ["animal-handling", "survival"],
    "noble": ["history", "persuasion"],
    "acolyte": ["insight", "religion"],
    "entertainer": ["acrobatics", "performance"],
    "hermit": ["medicine", "religion"],
  };
  return map[backgroundId] ?? ["perception", "survival"];
}

/** D&D 5e: casting stat by class. Returns the stat value for spell save DC. */
function getCastingStat(charClass: string, int: number, wis: number, cha: number): number {
  const wisClasses = ["Cleric", "Druid", "Ranger"];
  const chaClasses = ["Bard", "Paladin", "Sorcerer", "Warlock"];
  const intClasses = ["Wizard", "Fighter", "Rogue", "Monk"];
  if (wisClasses.includes(charClass)) return wis;
  if (chaClasses.includes(charClass)) return cha;
  if (intClasses.includes(charClass)) return int;
  return wis;
}

/** D&D 5e: assign resistances/immunities based on monster name keywords. */
function getMonsterDefenses(name: string): { resistances: string[]; immunities: string[]; conditionImmunities: string[] } {
  const lower = name.toLowerCase();
  const resistances: string[] = [];
  const immunities: string[] = [];
  const conditionImmunities: string[] = [];

  // Undead (skeletons, zombies, ghouls) — immune to poison, resistant to piercing.
  if (lower.includes("скелет") || lower.includes("зомби") || lower.includes("нежить") || lower.includes("мертв")) {
    immunities.push("poison");
    conditionImmunities.push("poisoned");
    resistances.push("piercing");
  }
  // Fire elementals / dragons — immune/resistant to fire.
  if (lower.includes("элементал") || lower.includes("огн") || lower.includes("дракон") || lower.includes("саламандр")) {
    immunities.push("fire");
  }
  // Cold creatures — immune to cold.
  if (lower.includes("лёд") || lower.includes("лед") || lower.includes("холод") || lower.includes("мороз")) {
    immunities.push("cold");
  }
  // Shadows / shadow creatures — resistant to non-magical weapons.
  if (lower.includes("тен") || lower.includes("тёмн") || lower.includes("темн")) {
    resistances.push("slashing", "piercing", "bludgeoning");
    conditionImmunities.push("frightened");
  }
  // Demons/devils — resistant to fire, cold, lightning (non-magical weapons).
  if (lower.includes("демон") || lower.includes("бес") || lower.includes("дьявол")) {
    resistances.push("fire", "cold", "lightning");
  }
  // Constructs (golems) — immune to psychic, poison.
  if (lower.includes("голем") || lower.includes("конструкт")) {
    immunities.push("poison", "psychic");
    conditionImmunities.push("charmed", "frightened", "poisoned");
  }
  // Swamp/bog creatures — resistant to acid.
  if (lower.includes("болот") || lower.includes("тряв") || lower.includes("слизь")) {
    resistances.push("acid");
  }

  return { resistances, immunities, conditionImmunities };
}

/** D&D 5e: compute class resources based on class, level, and CHA modifier.
 *  Returns a map of resource name → { current, max }. */
function getClassResources(charClass: string, level: number, chaScore: number): Record<string, { current: number; max: number }> {
  const lc = charClass.toLowerCase();
  const chaMod = Math.floor((chaScore - 10) / 2);
  const res: Record<string, { current: number; max: number }> = {};

  // Barbarian: Rage — 2/day at L1, 3 at L6, 4 at L12, 5 at L16, 6 at L20.
  if (lc === "barbarian") {
    const rageMax = level >= 20 ? 6 : level >= 17 ? 6 : level >= 16 ? 5 : level >= 12 ? 4 : level >= 6 ? 3 : 2;
    res.rage = { current: rageMax, max: rageMax };
  }
  // Paladin: Lay on Hands = 5×level HP pool. Channel Divinity 1/rest.
  if (lc === "paladin") {
    res.layOnHands = { current: 5 * level, max: 5 * level };
    const cdMax = level >= 18 ? 3 : level >= 6 ? 2 : 1;
    res.channelDivinity = { current: cdMax, max: cdMax };
  }
  // Monk: Ki points = level (starts at L2, but we grant 1 at L1 for playability).
  if (lc === "monk") {
    const kiMax = Math.max(1, level);
    res.ki = { current: kiMax, max: kiMax };
  }
  // Bard: Bardic Inspiration = CHA mod per long rest ( regained on short rest at L5+).
  if (lc === "bard") {
    const biMax = Math.max(1, chaMod);
    res.bardicInspiration = { current: biMax, max: biMax };
  }
  // Cleric: Channel Divinity 1/rest at L1, 2 at L6, 3 at L18.
  if (lc === "cleric") {
    const cdMax = level >= 18 ? 3 : level >= 6 ? 2 : 1;
    res.channelDivinity = { current: cdMax, max: cdMax };
  }
  // Druid: Wild Shape 2/short rest (starts at L2, grant at L1 for playability).
  if (lc === "druid") {
    res.wildShape = { current: 2, max: 2 };
  }
  // Sorcerer: Sorcery Points = level (starts at L2, grant 1 at L1).
  if (lc === "sorcerer") {
    const spMax = Math.max(1, level);
    res.sorceryPoints = { current: spMax, max: spMax };
  }
  // Fighter: Action Surge 1/short rest (L2+), Second Wind 1/short rest.
  if (lc === "fighter") {
    res.secondWind = { current: 1, max: 1 };
    if (level >= 2) {
      res.actionSurge = { current: level >= 17 ? 2 : 1, max: level >= 17 ? 2 : 1 };
    }
  }
  // Wizard: Arcane Recovery 1/day.
  if (lc === "wizard") {
    res.arcaneRecovery = { current: 1, max: 1 };
  }
  // Warlock: already handled by pact magic slots, but add Eldritch Invocations flavor.
  // Ranger: no special resources at low levels.

  return res;
}
