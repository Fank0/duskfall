// Save / load game state for DUSKFALL.
//
// Exports a room + all its dependencies (players, monsters, inventory, chat,
// dice log, scenes, initiatives, status effects, loot drops) as a single JSON
// blob. Re-importing creates a NEW room with a fresh code and restores the
// entire state — useful for play-by-post over multiple sessions, backups, or
// sharing adventures.
//
// The export format is versioned (`schemaVersion`) so future schema changes
// can be migrated. Scene images are exported as relative URLs (they live in
// /public/scenes/ and are preserved across imports as long as the files exist).

import { db } from "@/lib/db";
import { generateRoomCode } from "./state";

export const SAVE_SCHEMA_VERSION = 1;

export interface SaveFile {
  schemaVersion: number;
  exportedAt: string;
  originalRoomCode: string;
  room: RoomData;
  players: PlayerData[];
  monsters: MonsterData[];
  inventory: InventoryData[];
  chat: ChatData[];
  diceLog: DiceData[];
  scenes: SceneData[];
  initiatives: InitiativeData[];
  statusEffects: StatusEffectData[];
  lootDrops: LootDropData[];
}

interface RoomData {
  code: string;
  hostName: string;
  combatActive: boolean;
  round: number;
  location: string;
  turnIndex: number;
  introShown: boolean;
  explorationActorIndex: number;
}
interface PlayerData {
  name: string; charClass: string; level: number; hp: number; maxHp: number; ac: number;
  str: number; dex: number; con: number; int: number; wis: number; cha: number;
  proficiencyBonus: number; gold: number; posX: number; posY: number; color: string;
  weaponName: string; weaponNotation: string; portraitUrl: string | null;
  isHost: boolean; isAlive: boolean;
  race: string; raceName: string; background: string; backgroundName: string;
  xp: number; selectedTalents: string; bonusStr: number; bonusDex: number; bonusCon: number;
  bonusInt: number; bonusWis: number; bonusCha: number; pendingLevelUp: boolean;
  createdAt: string;
}
interface MonsterData {
  name: string; label: string; hp: number; maxHp: number; ac: number;
  damageNotation: string; attackBonus: number; posX: number; posY: number;
  color: string; description: string; isActive: boolean; createdAt: string;
}
interface InventoryData {
  playerName: string; itemName: string; itemType: string; quantity: number; description: string; createdAt: string;
}
interface ChatData {
  role: string; speaker: string; content: string; imageUrl: string | null; round: number; createdAt: string;
}
interface DiceData {
  round: number; roller: string; label: string; notation: string; modifier: number;
  result: number; total: number; target: number | null; success: boolean | null; createdAt: string;
}
interface SceneData {
  imageUrl: string; prompt: string; title: string; isActive: boolean; createdAt: string;
}
interface InitiativeData {
  combatantName: string; combatantType: string; initiative: number; order: number;
  monsterId: string | null; isAlive: boolean;
}
interface StatusEffectData {
  targetName: string; targetType: string; effect: string; duration: number; magnitude: number; source: string; createdAt: string;
}
interface LootDropData {
  monsterName: string; killerName: string; gold: number; itemsJson: string; round: number; createdAt: string;
}

/**
 * Export a room's full state as a SaveFile JSON object.
 * Returns null if the room doesn't exist.
 */
export async function exportRoom(roomCode: string): Promise<SaveFile | null> {
  const room = await db.room.findUnique({ where: { code: roomCode.toUpperCase().trim() } });
  if (!room) return null;
  const roomId = room.id;

  const [players, monsters, inventory, chat, diceLog, scenes, initiatives, statusEffects, lootDrops] = await Promise.all([
    db.player.findMany({ where: { roomId }, orderBy: { createdAt: "asc" } }),
    db.monster.findMany({ where: { roomId }, orderBy: { createdAt: "asc" } }),
    db.inventoryItem.findMany({ where: { roomId }, orderBy: { createdAt: "asc" } }),
    db.chatMessage.findMany({ where: { roomId }, orderBy: { createdAt: "asc" } }),
    db.diceRoll.findMany({ where: { roomId }, orderBy: { createdAt: "asc" } }),
    db.scene.findMany({ where: { roomId }, orderBy: { createdAt: "asc" } }),
    db.initiativeEntry.findMany({ where: { roomId }, orderBy: { order: "asc" } }),
    db.statusEffect.findMany({ where: { roomId }, orderBy: { createdAt: "asc" } }),
    db.lootDrop.findMany({ where: { roomId }, orderBy: { createdAt: "asc" } }),
  ]);

  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    originalRoomCode: room.code,
    room: {
      code: room.code,
      hostName: room.hostName,
      combatActive: room.combatActive,
      round: room.round,
      location: room.location,
      turnIndex: room.turnIndex,
      introShown: room.introShown,
      explorationActorIndex: room.explorationActorIndex,
    },
    players: players.map((p) => ({
      name: p.name, charClass: p.charClass, level: p.level, hp: p.hp, maxHp: p.maxHp, ac: p.ac,
      str: p.str, dex: p.dex, con: p.con, int: p.int, wis: p.wis, cha: p.cha,
      proficiencyBonus: p.proficiencyBonus, gold: p.gold, posX: p.posX, posY: p.posY, color: p.color,
      weaponName: p.weaponName, weaponNotation: p.weaponNotation, portraitUrl: p.portraitUrl,
      isHost: p.isHost, isAlive: p.isAlive,
      race: p.race, raceName: p.raceName, background: p.background, backgroundName: p.backgroundName,
      xp: p.xp, selectedTalents: p.selectedTalents, bonusStr: p.bonusStr, bonusDex: p.bonusDex, bonusCon: p.bonusCon,
      bonusInt: p.bonusInt, bonusWis: p.bonusWis, bonusCha: p.bonusCha, pendingLevelUp: p.pendingLevelUp,
      createdAt: p.createdAt.toISOString(),
    })),
    monsters: monsters.map((m) => ({
      name: m.name, label: m.label, hp: m.hp, maxHp: m.maxHp, ac: m.ac,
      damageNotation: m.damageNotation, attackBonus: m.attackBonus, posX: m.posX, posY: m.posY,
      color: m.color, description: m.description, isActive: m.isActive, createdAt: m.createdAt.toISOString(),
    })),
    inventory: inventory.map((i) => ({
      playerName: i.playerName, itemName: i.itemName, itemType: i.itemType, quantity: i.quantity,
      description: i.description, createdAt: i.createdAt.toISOString(),
    })),
    chat: chat.map((c) => ({
      role: c.role, speaker: c.speaker, content: c.content, imageUrl: c.imageUrl, round: c.round,
      createdAt: c.createdAt.toISOString(),
    })),
    diceLog: diceLog.map((d) => ({
      round: d.round, roller: d.roller, label: d.label, notation: d.notation, modifier: d.modifier,
      result: d.result, total: d.total, target: d.target, success: d.success, createdAt: d.createdAt.toISOString(),
    })),
    scenes: scenes.map((s) => ({
      imageUrl: s.imageUrl, prompt: s.prompt, title: s.title, isActive: s.isActive, createdAt: s.createdAt.toISOString(),
    })),
    initiatives: initiatives.map((i) => ({
      combatantName: i.combatantName, combatantType: i.combatantType, initiative: i.initiative, order: i.order,
      monsterId: i.monsterId, isAlive: i.isAlive,
    })),
    statusEffects: statusEffects.map((s) => ({
      targetName: s.targetName, targetType: s.targetType, effect: s.effect, duration: s.duration,
      magnitude: s.magnitude, source: s.source, createdAt: s.createdAt.toISOString(),
    })),
    lootDrops: lootDrops.map((l) => ({
      monsterName: l.monsterName, killerName: l.killerName, gold: l.gold, itemsJson: l.itemsJson,
      round: l.round, createdAt: l.createdAt.toISOString(),
    })),
  };
}

export interface ImportResult {
  ok: boolean;
  newRoomCode?: string;
  error?: string;
}

/**
 * Import a SaveFile into a NEW room. Generates a fresh room code, creates the
 * room + all dependencies, and returns the new code. The original room (if any)
 * is left untouched.
 */
export async function importRoom(save: SaveFile): Promise<ImportResult> {
  if (!save || save.schemaVersion !== SAVE_SCHEMA_VERSION) {
    return { ok: false, error: `Несовместимая версия файла (ожидается ${SAVE_SCHEMA_VERSION}).` };
  }
  if (!save.room || !Array.isArray(save.players) || save.players.length === 0) {
    return { ok: false, error: "Файл повреждён: нет комнаты или героев." };
  }

  // Generate a fresh room code.
  const newCode = await generateRoomCode();

  // Create the room.
  const room = await db.room.create({
    data: {
      code: newCode,
      hostName: save.room.hostName,
      combatActive: save.room.combatActive,
      round: save.room.round,
      location: save.room.location,
      turnIndex: save.room.turnIndex,
      introShown: save.room.introShown,
      explorationActorIndex: save.room.explorationActorIndex,
    },
  });
  const roomId = room.id;

  // Build a monster-name → new-id map so initiatives can reference the new monster ids.
  const monsterIdMap = new Map<string, string>();

  // Players.
  for (const p of save.players) {
    await db.player.create({
      data: {
        roomId, name: p.name, charClass: p.charClass, level: p.level, hp: p.hp, maxHp: p.maxHp, ac: p.ac,
        str: p.str, dex: p.dex, con: p.con, int: p.int, wis: p.wis, cha: p.cha,
        proficiencyBonus: p.proficiencyBonus, gold: p.gold, posX: p.posX, posY: p.posY, color: p.color,
        weaponName: p.weaponName, weaponNotation: p.weaponNotation, portraitUrl: p.portraitUrl,
        isHost: p.isHost, isAlive: p.isAlive,
        race: p.race, raceName: p.raceName, background: p.background, backgroundName: p.backgroundName,
        xp: p.xp, selectedTalents: p.selectedTalents, bonusStr: p.bonusStr, bonusDex: p.bonusDex,
        bonusCon: p.bonusCon, bonusInt: p.bonusInt, bonusWis: p.bonusWis, bonusCha: p.bonusCha,
        pendingLevelUp: p.pendingLevelUp,
      },
    });
  }

  // Monsters (preserve order so monsterIdMap works).
  for (const m of save.monsters) {
    const created = await db.monster.create({
      data: {
        roomId, name: m.name, label: m.label, hp: m.hp, maxHp: m.maxHp, ac: m.ac,
        damageNotation: m.damageNotation, attackBonus: m.attackBonus, posX: m.posX, posY: m.posY,
        color: m.color, description: m.description, isActive: m.isActive,
      },
    });
    monsterIdMap.set(m.name, created.id);
  }

  // Inventory.
  for (const i of save.inventory) {
    await db.inventoryItem.create({
      data: {
        roomId, playerName: i.playerName, itemName: i.itemName, itemType: i.itemType,
        quantity: i.quantity, description: i.description,
      },
    });
  }

  // Chat.
  for (const c of save.chat) {
    await db.chatMessage.create({
      data: {
        roomId, role: c.role, speaker: c.speaker, content: c.content, imageUrl: c.imageUrl, round: c.round,
      },
    });
  }

  // Dice log.
  for (const d of save.diceLog) {
    await db.diceRoll.create({
      data: {
        roomId, round: d.round, roller: d.roller, label: d.label, notation: d.notation, modifier: d.modifier,
        result: d.result, total: d.total, target: d.target, success: d.success,
      },
    });
  }

  // Scenes.
  for (const s of save.scenes) {
    await db.scene.create({
      data: {
        roomId, imageUrl: s.imageUrl, prompt: s.prompt, title: s.title, isActive: s.isActive,
      },
    });
  }

  // Initiatives (remap monsterId to the new monster id).
  for (const i of save.initiatives) {
    const newMonsterId = i.monsterId ? (monsterIdMap.get(i.combatantName) ?? null) : null;
    await db.initiativeEntry.create({
      data: {
        roomId, combatantName: i.combatantName, combatantType: i.combatantType, initiative: i.initiative,
        order: i.order, monsterId: newMonsterId, isAlive: i.isAlive,
      },
    });
  }

  // Status effects.
  for (const s of save.statusEffects) {
    await db.statusEffect.create({
      data: {
        roomId, targetName: s.targetName, targetType: s.targetType, effect: s.effect, duration: s.duration,
        magnitude: s.magnitude, source: s.source,
      },
    });
  }

  // Loot drops.
  for (const l of save.lootDrops) {
    await db.lootDrop.create({
      data: {
        roomId, monsterName: l.monsterName, killerName: l.killerName, gold: l.gold, itemsJson: l.itemsJson,
        round: l.round,
      },
    });
  }

  return { ok: true, newRoomCode: newCode };
}
