// Database helpers: fetch / mutate the room-scoped d20 fantasy game state.

import { db } from "@/lib/db";
import { abilityModifier, rollD20 } from "./dice";
import { CONDITIONS, getCondition } from "./conditions";
import { inferEquipProps } from "./item-props";
import { findBestiaryEntryByName, formatCR } from "./bestiary";
import { getClassIdByCharClass, isCasterClass } from "./presets";
import { getSpellById, resolveKnownSpells } from "./spellbook";
import { generateLoot, findItemByName, rarityLabelRu, type ItemEntry, type ItemRarity } from "./item-database";
import type {
  GameStateSnapshot,
  PlayerState,
  MonsterState,
  InventoryItemState,
  ChatMessageState,
  DiceRollState,
  SceneState,
  InitiativeEntryState,
  ConditionState,
  QuestState,
  MapRoomState,
  NpcState,
  ResolvedRoll,
  InventoryChange,
  EquipmentSlot,
  StatKey,
} from "./types";

export const GRID_SIZE = 16;

// ---------- mappers ----------
/** Parse a JSON spell-slot string into a Record<string, number>. Defensive. */
export function parseSpellSlots(raw: string | null | undefined): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        out[k] = Math.max(0, Math.floor(Number(v) || 0));
      }
      return out;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function toPlayer(p: any): PlayerState {
  return {
    id: p.id,
    name: p.name,
    charClass: p.charClass,
    level: p.level,
    hp: p.hp,
    maxHp: p.maxHp,
    ac: p.ac,
    str: p.str,
    dex: p.dex,
    con: p.con,
    int: p.int,
    wis: p.wis,
    cha: p.cha,
    proficiencyBonus: p.proficiencyBonus,
    gold: p.gold,
    posX: p.posX,
    posY: p.posY,
    color: p.color,
    weaponName: p.weaponName,
    weaponNotation: p.weaponNotation,
    portraitUrl: p.portraitUrl,
    isHost: p.isHost,
    isAlive: p.isAlive,
    race: p.race,
    raceName: p.raceName,
    background: p.background,
    backgroundName: p.backgroundName,
    backstory: p.backstory ?? "",
    xp: p.xp,
    selectedTalents: p.selectedTalents ? p.selectedTalents.split(",").filter(Boolean) : [],
    bonusStr: p.bonusStr,
    bonusDex: p.bonusDex,
    bonusCon: p.bonusCon,
    bonusInt: p.bonusInt,
    bonusWis: p.bonusWis,
    bonusCha: p.bonusCha,
    pendingLevelUp: p.pendingLevelUp,
    pendingLevelUps: p.pendingLevelUps ?? 0,
    pendingASI: Boolean(p.pendingASI),
    spellSlots: parseSpellSlots(p.spellSlots),
    maxSpellSlots: parseSpellSlots(p.maxSpellSlots),
    hitDice: p.hitDice ?? 8,
    shortRestsUsed: p.shortRestsUsed ?? 0,
    spellbookSpells: p.spellbookSpells
      ? String(p.spellbookSpells).split(",").map((s: string) => s.trim()).filter(Boolean)
      : [],
    equipment: {
      weapon: p.eqWeapon ?? null,
      shield: p.eqShield ?? null,
      head: p.eqHead ?? null,
      chest: p.eqChest ?? null,
      legs: p.eqLegs ?? null,
      hands: p.eqHands ?? null,
      accessory1: p.eqAccessory1 ?? null,
      accessory2: p.eqAccessory2 ?? null,
    },
    // BG3/D&D 5e fields
    tempHp: p.tempHp ?? 0,
    isDying: Boolean(p.isDying),
    deathSaveSuccess: p.deathSaveSuccess ?? 0,
    deathSaveFailure: p.deathSaveFailure ?? 0,
    actionUsed: Boolean(p.actionUsed),
    bonusActionUsed: Boolean(p.bonusActionUsed),
    reactionUsed: Boolean(p.reactionUsed),
    concentratingOn: p.concentratingOn ?? "",
    skillProficiencies: p.skillProficiencies ? JSON.parse(p.skillProficiencies) : [],
    saveProficiencies: p.saveProficiencies ? JSON.parse(p.saveProficiencies) : [],
    passivePerception: p.passivePerception ?? 10,
    spellSaveDC: p.spellSaveDC ?? 12,
    classResources: p.classResources ? JSON.parse(p.classResources) : {},
  };
}

function toMonster(m: any): MonsterState {
  return {
    id: m.id,
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
    isActive: m.isActive,
    isBoss: Boolean(m.isBoss),
    specialAbility: m.specialAbility ?? "",
    resistances: m.resistances ? (typeof m.resistances === "string" ? JSON.parse(m.resistances) : m.resistances) : [],
    immunities: m.immunities ? (typeof m.immunities === "string" ? JSON.parse(m.immunities) : m.immunities) : [],
    conditionImmunities: m.conditionImmunities ? (typeof m.conditionImmunities === "string" ? JSON.parse(m.conditionImmunities) : m.conditionImmunities) : [],
  };
}

function toInventory(i: any): InventoryItemState {
  let statBonus: Partial<Record<"str" | "dex" | "con" | "int" | "wis" | "cha", number>> = {};
  if (i.statBonus) {
    try {
      const parsed = JSON.parse(i.statBonus);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          const num = Number(v) || 0;
          if (num && (k === "str" || k === "dex" || k === "con" || k === "int" || k === "wis" || k === "cha")) {
            statBonus[k as "str" | "dex" | "con" | "int" | "wis" | "cha"] = num;
          }
        }
      }
    } catch {
      /* ignore */
    }
  }
  return {
    id: i.id,
    playerName: i.playerName,
    itemName: i.itemName,
    itemType: i.itemType,
    quantity: i.quantity,
    description: i.description,
    equipSlot: i.equipSlot ?? null,
    acBonus: i.acBonus ?? 0,
    statBonus,
    damageNotation: i.damageNotation ?? "",
  };
}

function toChat(c: any): ChatMessageState {
  return {
    id: c.id,
    role: c.role,
    speaker: c.speaker,
    content: c.content,
    imageUrl: c.imageUrl,
    round: c.round,
    createdAt: c.createdAt.toISOString(),
  };
}

function toDice(d: any): DiceRollState {
  let allRolls: number[] | null = null;
  if (d.allRolls) {
    try {
      const parsed = JSON.parse(d.allRolls);
      if (Array.isArray(parsed)) allRolls = parsed.map((n: any) => Number(n));
    } catch {
      allRolls = null;
    }
  }
  return {
    id: d.id,
    round: d.round,
    roller: d.roller,
    label: d.label,
    notation: d.notation,
    modifier: d.modifier,
    result: d.result,
    total: d.total,
    target: d.target,
    success: d.success,
    advantageMode: d.advantageMode ?? null,
    allRolls,
    createdAt: d.createdAt.toISOString(),
  };
}

function toScene(s: any): SceneState {
  return {
    id: s.id,
    imageUrl: s.imageUrl,
    prompt: s.prompt,
    title: s.title,
  };
}

function toInitiative(i: any): InitiativeEntryState {
  return {
    id: i.id,
    combatantName: i.combatantName,
    combatantType: i.combatantType,
    initiative: i.initiative,
    order: i.order,
    monsterId: i.monsterId,
    isAlive: i.isAlive,
  };
}

function toCondition(c: any): ConditionState {
  return {
    id: c.id,
    targetName: c.targetName,
    targetType: c.targetType,
    condition: c.condition,
    duration: c.duration,
    source: c.source,
    createdAt: c.createdAt.toISOString(),
  };
}

function toQuest(q: any): QuestState {
  return {
    id: q.id,
    title: q.title,
    description: q.description ?? "",
    status: (q.status ?? "active") as "active" | "completed" | "failed",
    objectives: (q.objectives ?? "")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean),
    reward: q.reward ?? "",
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
  };
}

function toMapRoom(m: any): MapRoomState {
  const conns = (m.connections ?? "")
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean)
    .map((s: string) => {
      const [x, y] = s.split(":").map((n) => Number(n));
      return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
    });
  return {
    id: m.id,
    x: m.x,
    y: m.y,
    label: m.label,
    roomType: m.roomType as MapRoomState["roomType"],
    discovered: Boolean(m.discovered),
    connections: conns,
    description: m.description ?? "",
    secret: Boolean(m.secret),
    scenePrompt: m.scenePrompt ?? "",
    populated: Boolean(m.populated),
  };
}

function toNpc(n: any): NpcState {
  return {
    id: n.id,
    name: n.name,
    role: (n.role ?? "ally") as NpcState["role"],
    disposition: (n.disposition ?? "neutral") as NpcState["disposition"],
    isAlive: Boolean(n.isAlive),
    location: n.location ?? "",
    notes: n.notes ?? "",
  };
}

// ---------- room helpers ----------
export async function getRoomByCode(code: string) {
  const c = String(code || "").toUpperCase().trim();
  if (!c) return null;
  return db.room.findUnique({ where: { code: c } });
}

/** Generate a unique 6-char room code. */
export async function generateRoomCode(): Promise<string> {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing chars
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = "";
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    const exists = await db.room.findUnique({ where: { code } });
    if (!exists) return code;
  }
  // Fallback (extremely unlikely collision)
  return "DND" + Math.floor(1000 + Math.random() * 9000);
}

// ---------- snapshot ----------
// In-memory snapshot cache (2s TTL) to avoid hammering the DB on every poll.
// Keyed by roomId (mutations take roomId, so invalidation is cheap).
const SNAPSHOT_CACHE_TTL_MS = 2000;
// Hard cap on cache size to bound memory (audit-v2). When exceeded, the oldest
// expired entries are pruned lazily on the next getSnapshot call.
const SNAPSHOT_CACHE_MAX_ENTRIES = 200;
const snapshotCache = new Map<string, { snapshot: GameStateSnapshot; expiry: number }>();

/** Invalidate the cached snapshot for a room. Call after every mutation that
 *  changes the snapshot (HP, inventory, position, chat, etc.). Safe to call
 *  even if no cached entry exists. */
export function invalidateSnapshotCache(roomId: string): void {
  if (roomId) snapshotCache.delete(roomId);
}

/** Prune expired entries from the snapshot cache. Called lazily on cache misses
 *  and periodically (every ~30s) to bound memory usage. (audit-v2) */
function pruneSnapshotCache(): void {
  const now = Date.now();
  // Always drop expired entries.
  for (const [k, v] of snapshotCache) {
    if (v.expiry <= now) snapshotCache.delete(k);
  }
  // If still over the cap, drop the oldest (LRU-ish — Map preserves insertion order).
  if (snapshotCache.size > SNAPSHOT_CACHE_MAX_ENTRIES) {
    const excess = snapshotCache.size - SNAPSHOT_CACHE_MAX_ENTRIES;
    let i = 0;
    for (const k of snapshotCache.keys()) {
      if (i++ >= excess) break;
      snapshotCache.delete(k);
    }
  }
}

// Background prune every 30s — guarantees abandoned-room entries don't linger.
let pruneTimerStarted = false;
function ensurePruneTimer(): void {
  if (pruneTimerStarted) return;
  pruneTimerStarted = true;
  try {
    setInterval(() => {
      try { pruneSnapshotCache(); } catch { /* never let cleanup crash the process */ }
    }, 30_000).unref?.();
  } catch {
    /* setInterval may be unavailable in some runtimes — lazy prune still works */
  }
}

export async function getSnapshot(roomCode: string): Promise<GameStateSnapshot | null> {
  const room = await getRoomByCode(roomCode);
  if (!room) return null;

  ensurePruneTimer();

  // Cache hit (still valid)?
  const now = Date.now();
  const cached = snapshotCache.get(room.id);
  if (cached && cached.expiry > now) {
    return cached.snapshot;
  }
  // Cache miss — opportunistic prune if the cache is getting large.
  if (snapshotCache.size > SNAPSHOT_CACHE_MAX_ENTRIES) {
    pruneSnapshotCache();
  }

  // Take only the last 100 chat messages (descending then reverse to keep asc order).
  // Older messages are loadable on demand via /api/game/chat-history.
  const [players, monsters, inventory, chatDesc, diceLog, activeScene, initiatives, conditions, quests, mapRoomsAll, npcs, trapRows, terrainRows] = await Promise.all([
    db.player.findMany({ where: { roomId: room.id }, orderBy: { createdAt: "asc" } }),
    db.monster.findMany({ where: { roomId: room.id }, orderBy: { createdAt: "asc" } }),
    db.inventoryItem.findMany({ where: { roomId: room.id }, orderBy: { createdAt: "asc" } }),
    db.chatMessage.findMany({ where: { roomId: room.id }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.diceRoll.findMany({ where: { roomId: room.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.scene.findFirst({ where: { roomId: room.id, isActive: true }, orderBy: { createdAt: "desc" } }),
    db.initiativeEntry.findMany({ where: { roomId: room.id }, orderBy: { order: "asc" } }),
    db.condition.findMany({ where: { roomId: room.id }, orderBy: { createdAt: "asc" } }),
    db.quest.findMany({ where: { roomId: room.id }, orderBy: { createdAt: "asc" } }),
    db.mapRoom.findMany({ where: { roomId: room.id }, orderBy: [{ y: "asc" }, { x: "asc" }] }),
    db.npc.findMany({ where: { roomId: room.id }, orderBy: { createdAt: "asc" } }),
    // Traps (Пункт 36): only discovered traps reach the client. Disarmed traps
    // are still shown (so the player can see they were neutralized).
    db.trap.findMany({ where: { roomId: room.id, discovered: true } }),
    // D&D 5e terrain cells.
    db.terrainCell.findMany({ where: { roomId: room.id } }),
  ]);
  // Reverse the chat so the snapshot exposes ascending chronological order.
  const chat = chatDesc.slice().reverse();

  const order = initiatives;
  const currentEntry = order[room.turnIndex] ?? null;

  // Only reveal discovered rooms to the client; their connections are filtered
  // to discovered-only so hidden rooms aren't leaked.
  const discoveredKeys = new Set(mapRoomsAll.filter((r) => r.discovered).map((r) => `${r.x},${r.y}`));
  const discoveredRooms = mapRoomsAll
    .filter((r) => r.discovered)
    .map((r) => {
      const mapped = toMapRoom(r);
      return {
        ...mapped,
        connections: mapped.connections.filter((c) => discoveredKeys.has(`${c.x},${c.y}`)),
      };
    });

  // Time-of-day / weather come from the Room columns (added in items 9 & 10).
  const timeOfDay = (room.timeOfDay ?? "day") as "dawn" | "day" | "dusk" | "night";
  const weather = (room.weather ?? "clear") as "clear" | "rain" | "fog" | "storm" | "snow";
  const currentMapPos =
    room.currentMapX >= 0 && room.currentMapY >= 0
      ? { x: room.currentMapX, y: room.currentMapY }
      : null;

  // ===== Ground loot cells (item 20) =====
  // Items with playerName === "__ground__" are spread across grid cells via a
  // deterministic hash so each item stays in a stable cell across renders.
  const lootCells = inventory
    .filter((it) => it.playerName === "__ground__")
    .map((it) => {
      let h = 0;
      for (let i = 0; i < it.id.length; i++) h = (h * 31 + it.id.charCodeAt(i)) | 0;
      const x = Math.abs(h) % GRID_SIZE;
      const y = Math.abs(h >> 8) % GRID_SIZE;
      return { x, y, itemName: it.itemName };
    });

  // ===== Traps (Пункт 36) =====
  // Only discovered traps reach the client (so hidden traps aren't spoiled).
  // Disarmed traps are still listed so the player can see they were neutralized.
  const traps: { x: number; y: number; discovered: boolean }[] = trapRows.map((t) => ({
    x: t.x,
    y: t.y,
    discovered: Boolean(t.discovered),
  }));

  // Exploration turn: filter alive players once (was previously computed twice).
  const alivePlayers = players.filter((p) => p.isAlive && p.hp > 0);
  const currentExplorerName = room.combatActive
    ? null
    : (alivePlayers[room.explorationActorIndex % Math.max(1, alivePlayers.length)]?.name
      ?? players[0]?.name
      ?? null);

  // Bug 12: currentTurnName must reflect the current actor in BOTH combat
  // and exploration. Previously it was set only from the initiative entry
  // (which is null during exploration), so during exploration the
  // PartyPanel / CombatGrid showed NO player highlighted as 'current turn'
  // — which made it look like the wrong (or no) player was active. Now we
  // fall back to currentExplorerName when combat is inactive so the
  // highlighted player always matches the actual turn owner.
  const currentTurnName = currentEntry?.combatantName ?? currentExplorerName;

  const snapshot: GameStateSnapshot = {
    roomCode: room.code,
    hostName: room.hostName,
    players: players.map(toPlayer),
    monsters: monsters.map(toMonster),
    inventory: inventory.map(toInventory),
    chat: chat.map(toChat),
    diceLog: diceLog.map(toDice),
    scene: activeScene ? toScene(activeScene) : null,
    initiatives: order.map(toInitiative),
    combatActive: room.combatActive,
    round: room.round,
    location: room.location,
    turnIndex: room.turnIndex,
    currentTurnName,
    currentTurnType: (currentEntry?.combatantType as "player" | "monster") ?? null,
    currentExplorerName,
    conditions: conditions.map(toCondition),
    quests: quests.map(toQuest),
    mapRooms: discoveredRooms,
    npcs: npcs.filter((n) => n.isAlive).map(toNpc),
    timeOfDay,
    weather,
    currentMapPos,
    hasAlchemy: Boolean(room.hasAlchemy),
    hasForge: Boolean(room.hasForge),
    hasEnchant: Boolean(room.hasEnchant),
    lootCells,
    traps,
    terrainCells: terrainRows.map((t) => ({ x: t.x, y: t.y, type: t.type })),
    dungeonBiome: room.dungeonBiome ?? "dungeon",
    dungeonDepth: room.dungeonDepth ?? 1,
    dungeonCleared: Boolean(room.dungeonCleared),
  };

  // Populate the cache.
  snapshotCache.set(room.id, { snapshot, expiry: now + SNAPSHOT_CACHE_TTL_MS });
  return snapshot;
}

// ---------- DM context ----------
/** Return a compact, DM-readable summary of the room's current situation. */
export async function getDMContext(roomCode: string, actorName: string): Promise<string> {
  const snap = await getSnapshot(roomCode);
  if (!snap) return "Комната не найдена.";
  const lines: string[] = [];
  lines.push(
    `=== Состояние игры ===\nЛокация: ${snap.location}\nРаунд: ${snap.round}\nБой активен: ${snap.combatActive ? "да" : "нет"}`
  );
  lines.push(`Действует сейчас: ${actorName}`);

  const alivePlayers = snap.players.filter((p) => p.isAlive && p.hp > 0);
  lines.push(`=== Группа (${alivePlayers.length} в строю) ===`);
  for (const p of snap.players) {
    const mod = (k: number) => abilityModifier(k);
    let status: string;
    if (!p.isAlive) {
      status = "ПАЛ";
    } else if (p.isDying) {
      status = `ПРИ СМЕРТИ (HP 0, спасброски: ✓${p.deathSaveSuccess}/3 ✗${p.deathSaveFailure}/3)`;
    } else {
      status = `HP ${p.hp}/${p.maxHp}`;
      if (p.tempHp > 0) status += ` (+${p.tempHp} врем.)`;
    }
    const slotEntries = Object.entries(p.maxSpellSlots).filter(([, v]) => v > 0);
    const slotInfo =
      slotEntries.length > 0
        ? ` | Ячейки заклинаний: ${slotEntries
            .map(([lv, max]) => `ур.${lv}:${p.spellSlots[lv] ?? 0}/${max}`)
            .join(", ")}`
        : "";
    const concInfo = p.concentratingOn ? ` | Концентрация: ${p.concentratingOn}` : "";
    const actionInfo = snap.combatActive
      ? ` | Действия: ${p.actionUsed ? "✗" : "✓"}${p.bonusActionUsed ? "/✗" : "/✓"}${p.reactionUsed ? "/✗" : "/✓"}`
      : "";
    let skillInfo = "нет";
    let saveInfo = "нет";
    // p is PlayerState — skillProficiencies/saveProficiencies are already string[] (parsed in toPlayer)
    const skills = p.skillProficiencies;
    if (Array.isArray(skills) && skills.length > 0) skillInfo = skills.join(", ");
    const saves = p.saveProficiencies;
    if (Array.isArray(saves) && saves.length > 0) saveInfo = saves.join(", ");
    // D&D 5e: Extra Attack — Fighters level 5+ get 2 attacks, level 11+ get 3, level 20+ get 4.
    let extraAttackInfo = "";
    const numAttacks = getExtraAttacks(p.charClass, p.level);
    if (numAttacks > 1) extraAttackInfo = ` | Атак за ход: ${numAttacks}`;
    // D&D 5e: class resources (Rage, Lay on Hands, Ki, etc.)
    let resourceInfo = "";
    const resources = p.classResources ?? {};
    const resKeys = Object.keys(resources);
    if (resKeys.length > 0) {
      const parts: string[] = [];
      for (const key of resKeys) {
        const r = resources[key];
        if (r && r.max > 0) {
          const labelMap: Record<string, string> = {
            rage: "Ярость", layOnHands: "Возложение рук", ki: "Ци",
            bardicInspiration: "Вдохновение", channelDivinity: "Божественность",
            wildShape: "Дикий облик", sorceryPoints: "Очки колдовства",
            actionSurge: "Прилив действий", secondWind: "Второе дыхание",
            arcaneRecovery: "Магическое восстановление",
          };
          const label = labelMap[key] ?? key;
          parts.push(`${label}: ${r.current}/${r.max}`);
        }
      }
      if (parts.length > 0) resourceInfo = ` | Ресурсы: ${parts.join(", ")}`;
    }
    lines.push(
      `${p.name} (${p.raceName} ${p.charClass}, происхождение ${p.backgroundName}, ур.${p.level})${p.isHost ? " [хост]" : ""}: ${status} | AC ${p.ac} | Золото ${p.gold} | СИЛ ${p.str}(${mod(p.str)}) ЛОВ ${p.dex}(${mod(p.dex)}) ТЕЛ ${p.con}(${mod(p.con)}) ИНТ ${p.int}(${mod(p.int)}) МУД ${p.wis}(${mod(p.wis)}) ХАР ${p.cha}(${mod(p.cha)}) | Бонус мастерства +${p.proficiencyBonus} | Пассивное восприятие ${p.passivePerception ?? 10 + mod(p.wis)} | DC заклинаний ${p.spellSaveDC ?? 12} | Навыки: ${skillInfo} | Спасброски: ${saveInfo} | Оружие: ${p.weaponName} (${p.weaponNotation})${extraAttackInfo}${resourceInfo}${slotInfo}${concInfo}${actionInfo} | Позиция (${p.posX},${p.posY})`
    );
    // Backstory (player-authored): let the DM weave the hero's history into
    // the narrative — call back to NPCs, places, oaths, regrets.
    if (p.backstory && p.backstory.trim().length > 0) {
      lines.push(`  Предыстория ${p.name}: ${p.backstory.trim()}`);
    }
    // ===== Selected talents + subclass (so DM knows player's capabilities) =====
    if (p.selectedTalents && p.selectedTalents.length > 0) {
      const { getTalentsForClass } = await import("./talents");
      const { getSubclassById, isSubclassTalent } = await import("./subclasses");
      const cid = getClassIdByCharClass(p.charClass);
      const allClassTalents = getTalentsForClass(cid);
      const talentParts: string[] = [];
      let subclassInfo = "";
      for (const id of p.selectedTalents) {
        if (isSubclassTalent(id)) {
          const sub = getSubclassById(id.replace("sub_", ""));
          if (sub) subclassInfo = ` | Подкласс: ${sub.name} (${sub.description.slice(0, 80)})`;
          continue;
        }
        const t = allClassTalents.find((t: any) => t.id === id);
        if (t) talentParts.push(`${t.name} (${t.description?.slice(0, 60) ?? ""})`);
      }
      if (talentParts.length > 0) {
        lines.push(`  Таланты ${p.name}: ${talentParts.join(", ")}${subclassInfo}`);
      } else if (subclassInfo) {
        lines.push(`  Таланты ${p.name}: (нет)${subclassInfo}`);
      }
    }
    // ===== Computed abilities (race/class/talent/scroll — so DM knows what player CAN do) =====
    const { computeAbilities } = await import("./abilities");
    const playerItems = snap.inventory.filter((it) => it.playerName === p.name);
    const abilities = computeAbilities(p, playerItems);
    if (abilities.length > 0) {
      const abilSummary = abilities.map((a) => {
        const parts = [a.name];
        if (a.castNotation) parts.push(a.castNotation);
        if (a.consumable) parts.push("расходуемый");
        if (a.slotLevel) parts.push(`я${a.slotLevel}`);
        return parts.join(" ");
      });
      lines.push(`  Способности ${p.name}: ${abilSummary.join(", ")}`);
    }
    // Spellbook: list known spells for caster classes (so the DM agent can
    // reference them when the player casts a known spell or finds a scroll).
    const classId = getClassIdByCharClass(p.charClass);
    if (isCasterClass(classId)) {
      const knownIds = resolveKnownSpells(classId, p.level, p.spellbookSpells ?? []);
      const knownSpells = knownIds
        .map((id) => getSpellById(id))
        .filter((s): s is NonNullable<typeof s> => Boolean(s));
      if (knownSpells.length > 0) {
        const cantrips = knownSpells.filter((s) => s.level === 0).map((s) => s.name);
        const leveled = knownSpells
          .filter((s) => s.level > 0)
          .map((s) => `${s.name} (Круг ${s.level})`);
        const parts: string[] = [];
        if (cantrips.length > 0) parts.push(`Заговоры: ${cantrips.join(", ")}`);
        if (leveled.length > 0) parts.push(`Заклинания: ${leveled.join(", ")}`);
        if (parts.length > 0) {
          lines.push(`  Книга заклинаний ${p.name}: ${parts.join(" | ")}`);
        }
      }
    }
  }

  const items = snap.inventory;
  if (items.length > 0) {
    // ===== Item database rarity + bonus badges (item-db task, item 4) =====
    // For each inventory item, look up the catalog entry by name so the DM
    // agent sees rarity + AC/stat bonuses + damage notation + enchantment.
    // This lets the DM narrate «эта редкая сталь +1», reference curses, etc.
    const byPlayer = new Map<string, string[]>();
    for (const it of items) {
      if (!byPlayer.has(it.playerName)) byPlayer.set(it.playerName, []);
      const entry = findItemByName(it.itemName);
      const rarityTag = entry ? ` [${rarityLabelRu(entry.rarity)}]` : "";
      const scrollTag = it.itemType === "scroll" ? " [свиток]" : "";
      const enchantTag = entry?.enchantment ? ` <${entry.enchantment}>` : "";
      const acTag = it.acBonus > 0 ? ` (+${it.acBonus} AC)` : "";
      const statTag = Object.keys(it.statBonus).length > 0
        ? ` (${Object.entries(it.statBonus).map(([k, v]) => `+${v} ${k.toUpperCase()}`).join(", ")})`
        : "";
      const dmgTag = it.damageNotation ? ` ${it.damageNotation}` : "";
      const curseTag = entry?.curse ? " [ПРОКЛЯТ]" : "";
      byPlayer.get(it.playerName)!.push(
        `${it.itemName} x${it.quantity}${rarityTag}${enchantTag}${scrollTag}${acTag}${statTag}${dmgTag}${curseTag}`
      );
    }
    for (const [name, list] of byPlayer) {
      lines.push(`Инвентарь ${name}: ${list.join(", ")}`);
    }
  }

  // Equipped items per player (so the DM can narrate the hero's loadout and
  // verify they actually have a weapon equipped before narrating an attack).
  const equippedLines: string[] = [];
  for (const p of snap.players) {
    const equippedIds = Object.values(p.equipment).filter(Boolean) as string[];
    if (equippedIds.length === 0) continue;
    const equippedItems = items.filter((it) => equippedIds.includes(it.id));
    if (equippedItems.length === 0) continue;
    const summary = equippedItems
      .map((it) => {
        const acTag = it.acBonus > 0 ? ` (+${it.acBonus} AC)` : "";
        const statTag = Object.entries(it.statBonus).length > 0
          ? ` (${Object.entries(it.statBonus).map(([k, v]) => `+${v} ${k.toUpperCase()}`).join(", ")})`
          : "";
        return `${it.itemName}${acTag}${statTag}`;
      })
      .join(", ");
    equippedLines.push(`Экипировка ${p.name}: ${summary}`);
  }
  if (equippedLines.length > 0) {
    lines.push("=== Экипировка героев ===");
    lines.push(...equippedLines);
  }

  // Single-pass partition into active/hidden monsters (was 2 filter calls).
  const activeMonsters: typeof snap.monsters = [];
  const hiddenMonsters: typeof snap.monsters = [];
  for (const m of snap.monsters) (m.isActive ? activeMonsters : hiddenMonsters).push(m);
  // ===== Bug 4: disambiguate duplicate monster names =====
  // When multiple active monsters share the same name (e.g. 3 "Гоблин"), the
  // DM agent cannot tell them apart from the context alone. We append a
  // numeric suffix ("Гоблин 1", "Гоблин 2", ...) so the DM can refer to a
  // specific monster by its indexed name in success.monsterDamage.target.
  // The same disambiguated name is what the backend looks up when applying
  // damage (see findMonsterByTargetName in dm-agent.ts).
  const activeNameCount = new Map<string, number>();
  for (const m of activeMonsters) {
    activeNameCount.set(m.name, (activeNameCount.get(m.name) ?? 0) + 1);
  }
  const activeNameSeen = new Map<string, number>();
  /** Returns the display name for an active monster (with #N suffix when the
   *  name has duplicates). Hidden monsters always use the bare name — the DM
   *  never targets them directly. */
  const activeDisplayName = (m: typeof snap.monsters[number]): string => {
    const total = activeNameCount.get(m.name) ?? 1;
    if (total <= 1) return m.name;
    const seen = (activeNameSeen.get(m.name) ?? 0) + 1;
    activeNameSeen.set(m.name, seen);
    return `${m.name} ${seen}`;
  };
  if (activeMonsters.length > 0) {
    lines.push("=== Противники (на сетке) ===");
    // ===== dm-context-fix (Fix 1): clearer monster listing =====
    // Format each monster as:
    //   "Монстр: <Имя> [#N если дубликаты] (HP x/y, AC n, позиция X,Y) — <описание>"
    // The leading "Монстр: " tag + the explicit "позиция X,Y" + description
    // make it unambiguous which monster the player is referring to when they
    // say "атакую гоблина" — the DM can match by name AND by position.
    for (const m of activeMonsters) {
      // Look up the bestiary entry by name so the DM agent can narrate the
      // monster's CR + any unique special ability (item 5 of the bestiary
      // task). The biome monster pool sets the on-grid name to the bestiary
      // entry's Russian name, so a direct match works; if not found, we
      // silently skip the bestiary blurb.
      const entry = findBestiaryEntryByName(m.name);
      const crTag = entry ? ` | CR ${formatCR(entry.cr)}` : "";
      const abilityTag = entry?.specialAbility
        ? ` | ⚡ Способность: ${entry.specialAbility}`
        : "";
      const display = activeDisplayName(m);
      const atkTag = ` | Атака +${m.attackBonus} | Урон ${m.damageNotation}`;
      // D&D 5e: show resistances/immunities in DM context.
      let resTag = "";
      const res = m.resistances ?? [];
      const imm = m.immunities ?? [];
      if (Array.isArray(res) && res.length > 0) resTag += ` | Сопротивление: ${res.join(", ")}`;
      if (Array.isArray(imm) && imm.length > 0) resTag += ` | Иммунитет: ${imm.join(", ")}`;
      lines.push(
        `Монстр: ${display} (HP ${m.hp}/${m.maxHp}, AC ${m.ac}, позиция ${m.posX},${m.posY})${atkTag}${crTag}${abilityTag}${resTag} — ${m.description}`
      );
    }
  }
  if (hiddenMonsters.length > 0) {
    lines.push("=== Скрытые угрозы (появятся, если начнётся бой) ===");
    for (const m of hiddenMonsters) {
      const entry = findBestiaryEntryByName(m.name);
      const crTag = entry ? ` | CR ${formatCR(entry.cr)}` : "";
      const abilityTag = entry?.specialAbility
        ? ` | ⚡ Способность: ${entry.specialAbility}`
        : "";
      const atkTag = ` | Атака +${m.attackBonus} | Урон ${m.damageNotation}`;
      lines.push(
        `Монстр: ${m.name} (HP ${m.maxHp}, AC ${m.ac}, позиция ${m.posX},${m.posY})${atkTag}${crTag}${abilityTag} — ${m.description}`
      );
    }
  }
  if (activeMonsters.length === 0 && hiddenMonsters.length === 0) {
    lines.push("Противники: нет");
  }

  // D&D 5e terrain features on the tactical grid (so the DM knows about
  // cover, difficult terrain, high ground, etc. when resolving actions).
  if (snap.terrainCells && snap.terrainCells.length > 0) {
    lines.push("=== Рельеф местности (D&D 5e) ===");
    const terrainDesc: Record<string, string> = {
      difficult: "сложная местность (движение ×2)",
      half_cover: "укрытие (+2 AC)",
      full_cover: "полное укрытие (+5 AC, блокирует линию огня)",
      high_ground: "возвышенность (преимущество на атаку, враги с помехой)",
      water: "мелкая вода",
    };
    // Group by type for compact display.
    const byType: Record<string, string[]> = {};
    for (const c of snap.terrainCells) {
      const key = c.type;
      if (!byType[key]) byType[key] = [];
      byType[key].push(`(${c.x},${c.y})`);
    }
    for (const [type, cells] of Object.entries(byType)) {
      const desc = terrainDesc[type] ?? type;
      // Limit to first 12 cells per type to avoid context bloat.
      const shown = cells.slice(0, 12).join(", ");
      const more = cells.length > 12 ? ` …и ещё ${cells.length - 12}` : "";
      lines.push(`${desc}: ${shown}${more}`);
    }
  }

  if (snap.combatActive && snap.initiatives.length > 0) {
    lines.push("=== Порядок инициативы ===");
    snap.initiatives.forEach((e, i) => {
      const cur = i === snap.turnIndex ? " <- СЕЙЧАС" : "";
      lines.push(`${i + 1}. ${e.combatantName} (${e.combatantType}, инициатива ${e.initiative})${cur}`);
    });
  }

  // Active conditions per target (trimmed: type + duration only, no source/icon).
  if (snap.conditions.length > 0) {
    lines.push("=== Активные состояния ===");
    for (const c of snap.conditions) {
      const def = getCondition(c.condition);
      const nameRu = def?.name ?? c.condition;
      lines.push(`${c.targetName} (${c.targetType}): ${nameRu} — ${c.duration} раундов.`);
    }
  }

  // Active quests (for the DM to know what's pending).
  const activeQuests = snap.quests.filter((q) => q.status === "active");
  if (activeQuests.length > 0) {
    lines.push("=== Журнал квестов (активные) ===");
    for (const q of activeQuests) {
      const objs = q.objectives.length > 0 ? ` | Цели: ${q.objectives.join(", ")}` : "";
      const rew = q.reward ? ` | Награда: ${q.reward}` : "";
      lines.push(`«${q.title}» — ${q.description || "(без описания)"}${objs}${rew}`);
    }
  }

  // World map: party position + discovered rooms.
  if (snap.currentMapPos) {
    const here = snap.mapRooms.find((r) => r.x === snap.currentMapPos!.x && r.y === snap.currentMapPos!.y);
    lines.push(
      `=== Карта мира ===\nТекущая позиция: (${snap.currentMapPos.x},${snap.currentMapPos.y})${
        here ? ` — ${here.label} [${here.roomType}]` : ""
      }`
    );
    if (snap.mapRooms.length > 0) {
      lines.push(
        "Открытые комнаты: " +
          snap.mapRooms.map((r) => `(${r.x},${r.y}) ${r.label}[${r.roomType}]`).join("; ")
      );
    }
  }

  // NPCs in the room.
  if (snap.npcs.length > 0) {
    lines.push("=== NPC в локации ===");
    for (const n of snap.npcs) {
      const loc = n.location ? ` @ ${n.location}` : "";
      const notes = n.notes ? ` | ${n.notes}` : "";
      lines.push(`${n.name} [${n.role}, ${n.disposition}]${loc}${notes}`);
    }
  }

  // Crafting stations available in the room.
  const stations: string[] = [];
  if (snap.hasAlchemy) stations.push("Алхимия");
  if (snap.hasForge) stations.push("Кузница");
  if (snap.hasEnchant) stations.push("Зачарование");
  if (stations.length > 0) {
    lines.push(`=== Верстаки крафта ===\nДоступны: ${stations.join(", ")}`);
  }

  // Time of day.
  lines.push(
    `=== Время суток и погода ===\nСейчас: ${timeOfDayLabelRu(snap.timeOfDay)} · ${weatherLabelRu(snap.weather)}`
  );

  // Recent chat: trim to the last 30 messages. If there are older messages,
  // include a one-line condensed summary so the DM still has some continuity.
  const RECENT_CHAT_LIMIT = 30;
  const allChat = snap.chat;
  const recent = allChat.slice(-RECENT_CHAT_LIMIT);
  if (recent.length > 0) {
    lines.push("=== Недавние события ===");
    // If there are older messages we skipped, condense the first 5 of them into
    // a multi-line summary so the DM has more context continuity.
    if (allChat.length > RECENT_CHAT_LIMIT) {
      const older = allChat.slice(0, Math.min(5, allChat.length - RECENT_CHAT_LIMIT));
      const condensed = older
        .map((c) => {
          const who = c.role === "player" ? `${c.speaker}` : c.role === "system" ? "Система" : "Мастер";
          const snippet = c.content.replace(/\s+/g, " ").trim().slice(0, 120);
          return `${who}: ${snippet}`;
        })
        .join(" / ");
      lines.push(`Ранее: ${condensed}`);
    }
    for (const c of recent) {
      const who = c.role === "player" ? `Игрок ${c.speaker}` : c.role === "system" ? "Система" : "Мастер";
      lines.push(`${who}: ${c.content.slice(0, 400)}`);
    }
  }

  // ===== Story memory: persistent key events the DM should remember =====
  try {
    const memories = await db.storyMemory.findMany({
      where: { roomId: snap.roomCode },
      orderBy: { createdAt: "desc" },
      take: 15,
    });
    if (memories.length > 0) {
      lines.push("=== Память сюжета (ключевые события) ===");
      // Reverse so oldest is first (chronological order)
      for (const m of memories.reverse()) {
        lines.push(`[${m.type}] ${m.content}`);
      }
    }
  } catch { /* table might not exist yet */ }

  // ===== Ground items (lootable) =====
  const groundItems = snap.inventory.filter((i) => i.playerName === "__ground__");
  if (groundItems.length > 0) {
    lines.push("=== Предметы на земле ===");
    lines.push(groundItems.map((i) => `${i.itemName} x${i.quantity}`).join(", "));
  }

  // ===== Dungeon state =====
  if (snap.dungeonBiome) {
    const biomeLabel: Record<string, string> = { catacombs: "Катакомбы", caves: "Пещеры", tower: "Башня", forest: "Лес", dungeon: "Подземелье" };
    const bl = biomeLabel[snap.dungeonBiome] ?? snap.dungeonBiome;
    lines.push(`=== Подземелье ===\nБиом: ${bl} | Этаж: ${snap.dungeonDepth} | Зачищено: ${snap.dungeonCleared ? "да" : "нет"}`);
  }

  // ===== Current room description (from world map) =====
  if (snap.currentMapPos && snap.mapRooms.length > 0) {
    const here = snap.mapRooms.find((r) => r.x === snap.currentMapPos!.x && r.y === snap.currentMapPos!.y);
    if (here && here.description) {
      lines.push(`=== Описание текущей комнаты ===\n${here.description}`);
    }
  }

  // ===== Average party level (for encounter scaling) =====
  const avgLevel = alivePlayers.length > 0
    ? Math.round(alivePlayers.reduce((sum, p) => sum + p.level, 0) / alivePlayers.length)
    : 1;
  lines.push(`=== Средний уровень группы: ${avgLevel} ===`);

  return lines.join("\n");
}

// ---------- mutations ----------
/** Save a story memory entry for persistent DM recall. */
export async function addStoryMemory(roomId: string, type: string, content: string): Promise<void> {
  try {
    await db.storyMemory.create({ data: { roomId, type, content: content.slice(0, 500) } });
    invalidateSnapshotCache(roomId);
  } catch { /* table might not exist yet */ }
}

export async function logDiceRoll(
  roomId: string,
  round: number,
  roller: string,
  roll: ResolvedRoll
): Promise<void> {
  await db.diceRoll.create({
    data: {
      roomId,
      round,
      roller,
      label: roll.label,
      notation: roll.notation,
      modifier: roll.modifier,
      result: roll.result,
      total: roll.total,
      target: roll.target ?? null,
      success: roll.success ?? null,
      advantageMode: roll.advantageMode ?? null,
      allRolls: roll.allRolls && roll.allRolls.length > 0 ? JSON.stringify(roll.allRolls) : null,
    },
  });
  invalidateSnapshotCache(roomId);
}

/** Average level of alive players in a room (rounded; 1 if no alive players).
 *  Used to scale loot rarity and biome-monster stats. */
export async function averagePartyLevel(roomId: string): Promise<number> {
  const players = await db.player.findMany({ where: { roomId, isAlive: true } });
  const alive = players.filter((p) => p.hp > 0);
  if (alive.length === 0) return 1;
  return Math.round(alive.reduce((s, p) => s + p.level, 0) / alive.length);
}

/** Add an ItemEntry (from the item database) to a player's inventory (or to
 *  the ground if playerName === "__ground__"). Uses the entry's explicit
 *  equipSlot / acBonus / statBonus / damageNotation values rather than
 *  re-inferring them from name/description — so catalog items keep their
 *  authored stats. Stacks with existing items of the same name. */
export async function addDatabaseItemToInventory(
  roomId: string,
  playerName: string,
  entry: ItemEntry
): Promise<void> {
  const existing = await db.inventoryItem.findFirst({
    where: { roomId, playerName, itemName: entry.name },
  });
  if (existing) {
    await db.inventoryItem.update({
      where: { id: existing.id },
      data: { quantity: existing.quantity + 1 },
    });
  } else {
    await db.inventoryItem.create({
      data: {
        roomId,
        playerName,
        itemName: entry.name,
        itemType: entry.type,
        quantity: 1,
        description: entry.description,
        equipSlot: entry.equipSlot ?? null,
        acBonus: entry.acBonus ?? 0,
        statBonus: serializeEquipStats(entry.statBonus ?? {}),
        damageNotation: entry.damageNotation ?? "",
      },
    });
  }
  invalidateSnapshotCache(roomId);
}

export async function damageMonster(roomId: string, monsterId: string, amount: number, damageType?: string) {
  const m = await db.monster.findFirst({ where: { id: monsterId, roomId } });
  if (!m) return { hp: 0, died: false };

  // D&D 5e: apply resistances (half damage) and immunities (no damage).
  let finalAmount = amount;
  let resistances: string[] = [];
  let immunities: string[] = [];
  try {
    resistances = m.resistances ? JSON.parse(m.resistances) : [];
    immunities = m.immunities ? JSON.parse(m.immunities) : [];
  } catch {}
  if (damageType && immunities.includes(damageType)) {
    finalAmount = 0;
  } else if (damageType && resistances.includes(damageType)) {
    finalAmount = Math.floor(finalAmount / 2);
  }

  const newHp = Math.max(0, m.hp - finalAmount);
  await db.monster.update({
    where: { id: m.id },
    data: { hp: newHp, isActive: newHp > 0 },
  });
  // Keep initiative entry alive-state in sync.
  if (newHp <= 0) {
    await db.initiativeEntry.updateMany({
      where: { roomId, combatantName: m.name },
      data: { isAlive: false },
    });
    // ===== Monster loot drop (item-db task, item 3) =====
    // When a monster dies AND its bestiary entry has loot (gold > 0 OR
    // items.length > 0), use generateLoot(partyLevel) to spawn 1–3 random
    // items on the ground (playerName="__ground__"). Bosses bias toward
    // higher rarity. This replaces the previous boss-loot-from-biome-pool
    // logic — generateLoot is now the single source of truth for monster
    // loot drops, and the bestiary's loot field is just a yes/no flag.
    const bestiaryEntry = findBestiaryEntryByName(m.name);
    const hasLoot =
      bestiaryEntry?.loot &&
      (bestiaryEntry.loot.gold > 0 || bestiaryEntry.loot.items.length > 0);
    if (hasLoot) {
      const partyLevel = await averagePartyLevel(roomId);
      // Bosses bias toward "veryrare" so their loot feels rewarding; regular
      // monsters use the level-scaled roll (no bias).
      const rarityBias: ItemRarity | undefined = m.isBoss ? "veryrare" : undefined;
      const lootEntries = generateLoot(partyLevel, rarityBias);
      const spawnedNames: string[] = [];
      for (const entry of lootEntries) {
        await addDatabaseItemToInventory(roomId, "__ground__", entry);
        spawnedNames.push(entry.name);
      }
      if (spawnedNames.length > 0) {
        await db.chatMessage.create({
          data: {
            roomId,
            role: "system",
            speaker: "",
            content: `С поверженного «${m.name}» выпадает добыча: ${spawnedNames.join(", ")}.`,
            round: 0,
          },
        });
      }
    }

    // ===== Boss death reward (Пункт 36) =====
    // When a boss dies: award 3× XP to ALL alive players and mark the dungeon
    // cleared. The DM agent already awards 1× XP to the actor; this bonus is
    // party-wide so the killer gets an effective 4× (1 from DM + 3 from boss
    // reward) and every other party member gets 3× — matching the spec's
    // "award 3× XP". Loot is now spawned by the bestiary-loot block above
    // (via generateLoot, biased toward veryrare for bosses).
    if (m.isBoss) {
      const alivePlayers = await db.player.findMany({ where: { roomId, isAlive: true } });
      const baseXp = xpForMonster(m.maxHp);
      const bossXp = baseXp * 3;
      for (const p of alivePlayers) {
        if (p.hp > 0) await awardXP(roomId, p.name, bossXp);
      }
      await db.room.update({
        where: { id: roomId },
        data: { dungeonCleared: true },
      });
      await db.chatMessage.create({
        data: {
          roomId,
          role: "system",
          speaker: "",
          content: `Босс «${m.name}» повержен! Подземелье зачищено! Партия получает ${bossXp} XP каждому.`,
          round: 0,
        },
      });
    }
  }
  invalidateSnapshotCache(roomId);
  return { hp: newHp, died: newHp <= 0 };
}

export async function damagePlayer(roomId: string, name: string, amount: number) {
  const p = await db.player.findFirst({ where: { name, roomId } });
  if (!p) return { hp: 0, died: false, tempHpAbsorbed: 0, isDying: false };
  // BG3/D&D 5e: temp HP absorbs damage first.
  let remaining = amount;
  let tempHpAbsorbed = 0;
  let newTempHp = p.tempHp ?? 0;
  if (newTempHp > 0) {
    tempHpAbsorbed = Math.min(newTempHp, remaining);
    newTempHp -= tempHpAbsorbed;
    remaining -= tempHpAbsorbed;
  }
  const newHp = Math.max(0, p.hp - remaining);
  // D&D 5e: HP=0 = dying (not dead). Only death-save failures or massive
  // damage (>= maxHp in one hit) kills instantly.
  const massiveDamage = remaining >= p.maxHp;
  let isDying = false;
  let died = false;
  if (newHp <= 0) {
    if (massiveDamage) {
      died = true;
    } else {
      isDying = true;
    }
  }
  await db.player.update({
    where: { id: p.id },
    data: {
      hp: newHp,
      tempHp: newTempHp,
      isDying,
      isAlive: !died,
      // On death, clear concentration.
      concentratingOn: died ? "" : p.concentratingOn,
      // Reset death saves when taking damage while already stable/dying
      // (a "critical fail" on death saves from taking damage at 0 HP).
      deathSaveFailure: isDying && !p.isDying ? (p.deathSaveFailure ?? 0) + 1 : (p.deathSaveFailure ?? 0),
    },
  });
  if (died) {
    await db.initiativeEntry.updateMany({
      where: { roomId, combatantName: name },
      data: { isAlive: false },
    });
  }
  invalidateSnapshotCache(roomId);
  return { hp: newHp, died, tempHpAbsorbed, isDying };
}

export async function healPlayer(roomId: string, name: string, amount: number) {
  const p = await db.player.findFirst({ where: { name, roomId } });
  if (!p) return 0;
  const newHp = Math.min(p.maxHp, p.hp + amount);
  // D&D 5e: any healing while dying stabilizes (HP > 0 = no longer dying).
  const wasDying = Boolean(p.isDying);
  await db.player.update({
    where: { id: p.id },
    data: {
      hp: newHp,
      isAlive: true,
      // Healing wakes a dying character (BG3: any healing > 0 HP).
      isDying: newHp > 0 ? false : p.isDying,
      // Reset death saves when stabilized/healed above 0.
      deathSaveSuccess: wasDying && newHp > 0 ? 0 : (p.deathSaveSuccess ?? 0),
      deathSaveFailure: wasDying && newHp > 0 ? 0 : (p.deathSaveFailure ?? 0),
    },
  });
  invalidateSnapshotCache(roomId);
  return newHp;
}

/**
 * BG3/D&D 5e: grant temporary HP to a player. Temp HP doesn't stack — the
 * higher value wins (player chooses, but we auto-pick the larger).
 */
export async function grantTempHp(roomId: string, name: string, amount: number): Promise<number> {
  const p = await db.player.findFirst({ where: { name, roomId } });
  if (!p || amount <= 0) return p?.tempHp ?? 0;
  const newTemp = Math.max(p.tempHp ?? 0, amount);
  await db.player.update({ where: { id: p.id }, data: { tempHp: newTemp } });
  invalidateSnapshotCache(roomId);
  return newTemp;
}

/**
 * D&D 5e concentration: set the spell a player is concentrating on.
 * Breaks any previous concentration spell first (clears its conditions).
 */
export async function setConcentration(roomId: string, name: string, spellName: string): Promise<void> {
  const p = await db.player.findFirst({ where: { name, roomId } });
  if (!p) return;
  await db.player.update({ where: { id: p.id }, data: { concentratingOn: spellName } });
  invalidateSnapshotCache(roomId);
}

/**
 * Break concentration (e.g. on damage CON save failure, or casting another
 * concentration spell). Clears the concentratingOn field.
 */
export async function breakConcentration(roomId: string, name: string): Promise<void> {
  const p = await db.player.findFirst({ where: { name, roomId } });
  if (!p || !p.concentratingOn) return;
  await db.player.update({ where: { id: p.id }, data: { concentratingOn: "" } });
  invalidateSnapshotCache(roomId);
}

/**
 * BG3 action economy: mark a player's Action / Bonus Action / Reaction as used.
 * The advanceTurn logic resets these at the start of each player's turn.
 */
export async function markActionUsed(
  roomId: string,
  name: string,
  kind: "action" | "bonus" | "reaction"
): Promise<void> {
  const p = await db.player.findFirst({ where: { name, roomId } });
  if (!p) return;
  const data: Record<string, boolean> = {};
  if (kind === "action") data.actionUsed = true;
  else if (kind === "bonus") data.bonusActionUsed = true;
  else data.reactionUsed = true;
  await db.player.update({ where: { id: p.id }, data });
  invalidateSnapshotCache(roomId);
}

export async function moveToken(
  roomId: string,
  name: string,
  newX: number,
  newY: number,
  isPlayer: boolean
) {
  const x = Math.max(0, Math.min(GRID_SIZE - 1, newX));
  const y = Math.max(0, Math.min(GRID_SIZE - 1, newY));
  if (isPlayer) {
    await db.player.updateMany({ where: { name, roomId }, data: { posX: x, posY: y } });
  } else {
    const m = await db.monster.findFirst({ where: { name, roomId } });
    if (m) await db.monster.update({ where: { id: m.id }, data: { posX: x, posY: y } });
  }
  invalidateSnapshotCache(roomId);
}

export async function applyInventoryChanges(
  roomId: string,
  playerName: string,
  changes: InventoryChange[]
) {
  for (const c of changes) {
    if (c.action === "add") {
      const existing = await db.inventoryItem.findFirst({
        where: { roomId, playerName, itemName: c.item },
      });
      if (existing) {
        await db.inventoryItem.update({
          where: { id: existing.id },
          data: { quantity: existing.quantity + 1 },
        });
      } else {
        // Infer equipment slot + bonuses from name + type + description.
        const props = inferEquipProps(c.item, c.type || "misc", c.description || "");
        await db.inventoryItem.create({
          data: {
            roomId,
            playerName,
            itemName: c.item,
            itemType: c.type || "misc",
            quantity: 1,
            description: c.description || "",
            equipSlot: props.equipSlot,
            acBonus: props.acBonus,
            statBonus: serializeEquipStats(props.statBonus),
            damageNotation: props.damageNotation,
          },
        });
      }
    } else if (c.action === "remove") {
      const existing = await db.inventoryItem.findFirst({
        where: { roomId, playerName, itemName: c.item },
      });
      if (existing) {
        // If the item is currently equipped, unequip it first.
        const player = await db.player.findFirst({ where: { name: playerName, roomId } });
        if (player) {
          for (const col of ALL_EQUIP_COLUMNS) {
            if ((player as any)[col] === existing.id) {
              await db.player.update({ where: { id: player.id }, data: { [col]: null } as any });
            }
          }
          if (player) {
            await recomputePlayerAC(roomId, playerName);
          }
        }
        if (existing.quantity > 1) {
          await db.inventoryItem.update({
            where: { id: existing.id },
            data: { quantity: existing.quantity - 1 },
          });
        } else {
          await db.inventoryItem.delete({ where: { id: existing.id } });
        }
      }
    }
  }
  invalidateSnapshotCache(roomId);
}

export async function adjustGold(roomId: string, name: string, amount: number) {
  const p = await db.player.findFirst({ where: { name, roomId } });
  if (!p) return;
  await db.player.update({
    where: { id: p.id },
    data: { gold: Math.max(0, p.gold + amount) },
  });
  invalidateSnapshotCache(roomId);
}

export async function saveChatMessage(
  roomId: string,
  role: "dm" | "player" | "system",
  speaker: string,
  content: string,
  round: number,
  imageUrl?: string | null
) {
  await db.chatMessage.create({
    data: { roomId, role, speaker, content, round, imageUrl: imageUrl ?? null },
  });
  invalidateSnapshotCache(roomId);
}

export async function setRoomState(roomId: string, data: Partial<{
  combatActive: boolean;
  round: number;
  location: string;
  turnIndex: number;
  introShown: boolean;
}>) {
  await db.room.update({ where: { id: roomId }, data });
  invalidateSnapshotCache(roomId);
}

/** Find the nearest alive player to a monster (Chebyshev distance). */
export async function nearestAlivePlayer(roomId: string, fromX: number, fromY: number) {
  const players = await db.player.findMany({ where: { roomId, isAlive: true } });
  const alive = players.filter((p) => p.hp > 0);
  if (alive.length === 0) return null;
  let best = alive[0];
  let bestDist = Infinity;
  for (const p of alive) {
    const d = Math.max(Math.abs(p.posX - fromX), Math.abs(p.posY - fromY));
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return { player: toPlayer(best), distance: bestDist };
}

/** Find the nearest active monster to a player. */
export async function nearestActiveMonster(roomId: string, fromX: number, fromY: number) {
  const monsters = await db.monster.findMany({ where: { roomId, isActive: true } });
  if (monsters.length === 0) return null;
  let best = monsters[0];
  let bestDist = Infinity;
  for (const m of monsters) {
    const d = Math.max(Math.abs(m.posX - fromX), Math.abs(m.posY - fromY));
    if (d < bestDist) {
      bestDist = d;
      best = m;
    }
  }
  return { monster: toMonster(best), distance: bestDist };
}

/** Move a monster toward the nearest alive player (up to 2 cells). */
export async function moveMonsterTowardNearestPlayer(roomId: string, monsterId: string) {
  const m = await db.monster.findFirst({ where: { id: monsterId, roomId } });
  if (!m) return { newX: 0, newY: 0, distBefore: 0, distAfter: 0, targetName: null };
  const nearest = await nearestAlivePlayer(roomId, m.posX, m.posY);
  if (!nearest) return { newX: m.posX, newY: m.posY, distBefore: 0, distAfter: 0, targetName: null };
  const p = nearest.player;
  const distBefore = nearest.distance;
  let nx = m.posX;
  let ny = m.posY;
  let steps = 2;
  // Move toward player but STOP at distance 1 (adjacent), not on player's cell
  while (steps > 0) {
    const dist = Math.max(Math.abs(nx - p.posX), Math.abs(ny - p.posY));
    if (dist <= 1) break; // already adjacent — don't step onto player
    const dx = p.posX - nx;
    const dy = p.posY - ny;
    if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) nx += Math.sign(dx);
    else if (dy !== 0) ny += Math.sign(dy);
    else break;
    steps--;
  }
  nx = Math.max(0, Math.min(GRID_SIZE - 1, nx));
  ny = Math.max(0, Math.min(GRID_SIZE - 1, ny));
  await db.monster.update({ where: { id: m.id }, data: { posX: nx, posY: ny } });
  const distAfter = Math.max(Math.abs(nx - p.posX), Math.abs(ny - p.posY));
  invalidateSnapshotCache(roomId);
  return { newX: nx, newY: ny, distBefore, distAfter, targetName: p.name };
}

export async function setActiveScene(roomId: string, imageUrl: string, prompt: string, title: string) {
  await db.scene.updateMany({ where: { roomId, isActive: true }, data: { isActive: false } });
  await db.scene.create({ data: { roomId, imageUrl, prompt, title, isActive: true } });
  invalidateSnapshotCache(roomId);
}

// ---------- initiative ----------
/** Roll initiative for all players + active monsters and persist the order. */
export async function rollInitiative(roomId: string): Promise<InitiativeEntryState[]> {
  const [players, monsters] = await Promise.all([
    db.player.findMany({ where: { roomId, isAlive: true } }),
    db.monster.findMany({ where: { roomId, isActive: true } }),
  ]);

  type Entry = { name: string; type: "player" | "monster"; init: number; monsterId: string | null };
  const entries: Entry[] = [];
  for (const p of players) {
    if (p.hp <= 0) continue;
    const init = rollD20(abilityModifier(p.dex)).total;
    entries.push({ name: p.name, type: "player", init, monsterId: null });
  }
  for (const m of monsters) {
    const init = rollD20(2).total; // monsters use a flat +2 (typical DEX)
    entries.push({ name: m.name, type: "monster", init, monsterId: m.id });
  }
  // Sort descending by initiative; tie-break by type (players first) then name.
  entries.sort((a, b) => {
    if (b.init !== a.init) return b.init - a.init;
    if (a.type !== b.type) return a.type === "player" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  // Clear old entries and write new ones.
  await db.initiativeEntry.deleteMany({ where: { roomId } });
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    await db.initiativeEntry.create({
      data: {
        roomId,
        combatantName: e.name,
        combatantType: e.type,
        initiative: e.init,
        order: i,
        monsterId: e.monsterId,
        isAlive: true,
      },
    });
    // Log the initiative roll.
    await db.diceRoll.create({
      data: {
        roomId,
        round: 0,
        roller: e.name,
        label: "Инициатива",
        notation: "1d20",
        modifier: e.type === "player" ? abilityModifier((players.find((p) => p.name === e.name))!.dex) : 2,
        result: e.init - (e.type === "player" ? abilityModifier(players.find((p) => p.name === e.name)!.dex) : 2),
        total: e.init,
        target: null,
        success: null,
      },
    });
  }
  const saved = await db.initiativeEntry.findMany({ where: { roomId }, orderBy: { order: "asc" } });
  invalidateSnapshotCache(roomId);
  return saved.map(toInitiative);
}

/** Get the combatant whose turn it is. */
export async function getCurrentCombatant(roomId: string) {
  const room = await db.room.findUnique({ where: { id: roomId } });
  if (!room || !room.combatActive) return null;
  const order = await db.initiativeEntry.findMany({ where: { roomId }, orderBy: { order: "asc" } });
  return order[room.turnIndex] ?? null;
}

/** Count alive players / monsters. */
export async function countAlive(roomId: string) {
  const [players, monsters] = await Promise.all([
    db.player.findMany({ where: { roomId, isAlive: true } }),
    db.monster.findMany({ where: { roomId, isActive: true } }),
  ]);
  const alivePlayers = players.filter((p) => p.hp > 0);
  const aliveMonsters = monsters.filter((m) => m.hp > 0);
  return {
    players: alivePlayers.length,
    monsters: aliveMonsters.length,
    anyPlayerAlive: alivePlayers.length > 0,
    anyMonsterAlive: aliveMonsters.length > 0,
  };
}

/** Advance the exploration turn to the next alive player (by createdAt order). */
export async function advanceExplorationTurn(roomId: string, justActedName: string) {
  const players = await db.player.findMany({ where: { roomId }, orderBy: { createdAt: "asc" } });
  const alive = players.filter((p) => p.isAlive && p.hp > 0);
  if (alive.length === 0) return;
  const currentIdx = alive.findIndex((p) => p.name === justActedName);
  const nextIdx = (currentIdx + 1) % alive.length;

  // Increment turnCount and advance time-of-day every 5 turns.
  const room = await db.room.findUnique({ where: { id: roomId } });
  if (room) {
    const newTurnCount = (room.turnCount ?? 0) + 1;
    const advanceCycle = newTurnCount % 5 === 0;
    let newTimeOfDay = room.timeOfDay || "day";
    if (advanceCycle) {
      const order: Array<"dawn" | "day" | "dusk" | "night"> = ["dawn", "day", "dusk", "night"];
      const idx = order.indexOf((newTimeOfDay as any) || "day");
      const next = order[(idx + 1) % order.length];
      newTimeOfDay = next;
    }
    // Weather: 20% chance to change to a weighted-random new kind.
    let newWeather = room.weather || "clear";
    let weatherChanged = false;
    if (Math.random() < 0.2) {
      newWeather = rollWeather();
      weatherChanged = newWeather !== (room.weather || "clear");
    }
    await db.room.update({
      where: { id: roomId },
      data: {
        explorationActorIndex: nextIdx,
        turnCount: newTurnCount,
        timeOfDay: newTimeOfDay,
        weather: newWeather,
      },
    });
    if (advanceCycle) {
      await db.chatMessage.create({
        data: {
          roomId,
          role: "system",
          speaker: "",
          round: room.round,
          content: `Время суток меняется: ${timeOfDayLabelRu(newTimeOfDay)}.`,
        },
      });
    }
    if (weatherChanged) {
      await db.chatMessage.create({
        data: {
          roomId,
          role: "system",
          speaker: "",
          round: room.round,
          content: `Погода меняется: ${weatherLabelRu(newWeather)}.`,
        },
      });
    }
  } else {
    await db.room.update({ where: { id: roomId }, data: { explorationActorIndex: nextIdx } });
  }
  invalidateSnapshotCache(roomId);
}

/** Roll a new weather kind using the weighted distribution:
 *  clear 40%, rain 25%, fog 15%, storm 10%, snow 10%. */
export function rollWeather(): "clear" | "rain" | "fog" | "storm" | "snow" {
  const r = Math.random() * 100;
  if (r < 40) return "clear";
  if (r < 65) return "rain";
  if (r < 80) return "fog";
  if (r < 90) return "storm";
  return "snow";
}

/** Human-readable Russian label for a weather value. */
export function weatherLabelRu(w: string): string {
  switch (w) {
    case "clear":
      return "Ясно";
    case "rain":
      return "Дождь";
    case "fog":
      return "Туман";
    case "storm":
      return "Гроза";
    case "snow":
      return "Снег";
    default:
      return "Ясно";
  }
}

/** Human-readable Russian label for a time-of-day value. */
export function timeOfDayLabelRu(t: string): string {
  switch (t) {
    case "dawn":
      return "Рассвет";
    case "day":
      return "День";
    case "dusk":
      return "Сумерки";
    case "night":
      return "Ночь";
    default:
      return "День";
  }
}

// ---------- XP / leveling ----------
/** XP needed to REACH a given level. Extended to level 17 so ASI at 5/9/13/17 is reachable. */
export const XP_THRESHOLDS: Record<number, number> = {
  1: 0,
  2: 300,
  3: 900,
  4: 2700,
  5: 6500,
  6: 14000,
  7: 23000,
  8: 34000,
  9: 48000,
  10: 64000,
  11: 85000,
  12: 100000,
  13: 120000,
  14: 140000,
  15: 165000,
  16: 195000,
  17: 225000,
};

/** Levels at which the player gains an ASI (+2 to one stat) on top of a talent pick. */
export const ASI_LEVELS: ReadonlySet<number> = new Set([5, 9, 13, 17]);

/** Maximum reachable level (matches XP_THRESHOLDS). */
export const MAX_LEVEL = 17;

/** Proficiency bonus by level (5e standard). */
export function proficiencyForLevel(level: number): number {
  return 2 + Math.floor((level - 1) / 4);
}

/** D&D 5e: Extra Attack — number of attacks per Action by class & level.
 *  Fighter: 2 at L5, 3 at L11, 4 at L20.
 *  Barbarian, Paladin, Ranger, Monk: 2 at L5.
 *  Other classes: 1. */
export function getExtraAttacks(charClass: string, level: number): number {
  const lc = charClass.toLowerCase();
  if (lc === "fighter") {
    if (level >= 20) return 4;
    if (level >= 11) return 3;
    if (level >= 5) return 2;
    return 1;
  }
  if (["barbarian", "paladin", "ranger", "monk"].includes(lc)) {
    if (level >= 5) return 2;
    return 1;
  }
  return 1;
}

/** Award XP to a player; sets pendingLevelUp if a threshold is crossed.
 *  At levels 5/9/13/17 also sets pendingASI (additional +2 stat pick). */
export async function awardXP(roomId: string, playerName: string, xp: number): Promise<{ leveledUp: boolean; newLevel: number }> {
  const p = await db.player.findFirst({ where: { name: playerName, roomId } });
  if (!p) return { leveledUp: false, newLevel: 1 };
  const newXp = p.xp + xp;
  let newLevel = p.level;
  let leveledUp = false;
  while (newLevel < MAX_LEVEL && (XP_THRESHOLDS[newLevel + 1] ?? Infinity) <= newXp) {
    newLevel++;
    leveledUp = true;
  }
  const prof = proficiencyForLevel(newLevel);
  // On level-up: +max HP (use CON modifier * level delta + class hit die avg), restore a bit.
  let newMaxHp = p.maxHp;
  let newHp = p.hp;
  if (leveledUp) {
    const conMod = abilityModifier(p.con);
    const hpPerLevel = Math.max(1, 5 + conMod); // ~d8 average
    const gain = hpPerLevel * (newLevel - p.level);
    newMaxHp += gain;
    newHp = Math.min(newMaxHp, newHp + gain); // heal the gain
  }
  // If the new level grants an ASI, set pendingASI in addition to pendingLevelUp.
  const grantASI = leveledUp && ASI_LEVELS.has(newLevel);
  const levelsGained = newLevel - p.level;
  await db.player.update({
    where: { id: p.id },
    data: {
      xp: newXp,
      level: newLevel,
      proficiencyBonus: prof,
      maxHp: newMaxHp,
      hp: newHp,
      pendingLevelUp: leveledUp ? true : p.pendingLevelUp,
      pendingLevelUps: leveledUp ? (p.pendingLevelUps ?? 0) + levelsGained : p.pendingLevelUps,
      pendingASI: grantASI ? true : p.pendingASI,
    },
  });
  invalidateSnapshotCache(roomId);
  return { leveledUp, newLevel };
}

/** Apply a chosen talent on level-up and clear the pending flag.
 *  Rejects if the talent is already taken, or if it has an unsatisfied prerequisite. */
export async function applyLevelUpTalent(roomId: string, playerName: string, talentId: string): Promise<boolean> {
  const p = await db.player.findFirst({ where: { name: playerName, roomId } });
  if (!p || !p.pendingLevelUp) return false;
  const existing = p.selectedTalents ? p.selectedTalents.split(",").filter(Boolean) : [];
  if (existing.includes(talentId)) return false; // already taken
  // Resolve the talent definition to check prerequisites.
  const classId = (await import("./presets")).getClassIdByCharClass(p.charClass);
  const { getTalentsForClass } = await import("./talents");
  const talent = getTalentsForClass(classId).find((t) => t.id === talentId);
  if (!talent) return false;
  if (talent.requires && !existing.includes(talent.requires)) return false; // prerequisite not met
  existing.push(talentId);
  const newCount = Math.max(0, (p.pendingLevelUps ?? 1) - 1);
  await db.player.update({
    where: { id: p.id },
    data: {
      selectedTalents: existing.join(","),
      pendingLevelUp: newCount > 0,
      pendingLevelUps: newCount,
    },
  });
  invalidateSnapshotCache(roomId);
  return true;
}

/** Apply an ASI pick: +2 to a chosen stat (capped at 20). Clears pendingASI.
 *  Returns true if applied, false otherwise. */
export async function applyLevelUpASI(
  roomId: string,
  playerName: string,
  stat: "str" | "dex" | "con" | "int" | "wis" | "cha"
): Promise<boolean> {
  const p = await db.player.findFirst({ where: { name: playerName, roomId } });
  if (!p || !p.pendingASI) return false;
  const cap = 20;
  const cur = (p as any)[stat] as number;
  const newVal = Math.min(cap, cur + 2);
  // Bonus-stats record keeps a parallel +2 (so the character sheet can show
  // how the player spent their ASI picks).
  const bonusKey = `bonus${stat.charAt(0).toUpperCase()}${stat.slice(1)}` as
    | "bonusStr" | "bonusDex" | "bonusCon" | "bonusInt" | "bonusWis" | "bonusCha";
  const newBonus = Math.min(cap, (p as any)[bonusKey] as number + 2);
  // CON increase raises max HP (and current HP) by 1 per +1 (so +2 → +2 HP per level
  // retroactively: gain = (newCon - oldCon) * level / 2... we apply the simple version: +1 maxHP per +1 con).
  let newMaxHp = p.maxHp;
  let newHp = p.hp;
  if (stat === "con") {
    const conDelta = newVal - cur;
    const hpGain = conDelta * p.level; // +1 maxHP per +1 CON retroactively per level
    newMaxHp += hpGain;
    newHp = Math.min(newMaxHp, newHp + hpGain);
  }
  await db.player.update({
    where: { id: p.id },
    data: {
      [stat]: newVal,
      [bonusKey]: newBonus,
      maxHp: newMaxHp,
      hp: newHp,
      pendingASI: false,
    } as any,
  });
  invalidateSnapshotCache(roomId);
  return true;
}

// ---------- Spell slots ----------
function safeParseSlots(raw: string): Record<string, number> {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        out[k] = Math.max(0, Math.floor(Number(v) || 0));
      }
      return out;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function serializeSlots(slots: Record<string, number>): string {
  return JSON.stringify(slots);
}

/** Try to spend a spell slot of `level` (or higher if needed). Returns the
 *  spent level on success, or null if no slot was available. */
export async function spendSpellSlot(
  roomId: string,
  playerName: string,
  level: number
): Promise<{ ok: boolean; level: number }> {
  const p = await db.player.findFirst({ where: { name: playerName, roomId } });
  if (!p) return { ok: false, level: 0 };
  const slots = safeParseSlots(p.spellSlots);
  // Try the requested level first, then ascend.
  const tryLevels = [level, level + 1, level + 2, level + 3, level + 4, level + 5];
  for (const lv of tryLevels) {
    const key = String(lv);
    if ((slots[key] ?? 0) > 0) {
      slots[key] -= 1;
      await db.player.update({ where: { id: p.id }, data: { spellSlots: serializeSlots(slots) } });
      invalidateSnapshotCache(roomId);
      return { ok: true, level: lv };
    }
  }
  return { ok: false, level: 0 };
}

/** Restore ALL spell slots to max (used on long rest). */
export async function restoreAllSpellSlots(roomId: string, playerName: string): Promise<void> {
  const p = await db.player.findFirst({ where: { name: playerName, roomId } });
  if (!p) return;
  const max = safeParseSlots(p.maxSpellSlots);
  await db.player.update({ where: { id: p.id }, data: { spellSlots: serializeSlots({ ...max }) } });
  invalidateSnapshotCache(roomId);
}

/** Restore spell slots for a specific class (e.g. warlock on short rest). */
export async function restoreSpellSlotsForShortRest(roomId: string, playerName: string, charClass: string): Promise<void> {
  // Warlock: restore all slots on short rest. Other casters keep their slots.
  const isWarlock = charClass.toLowerCase() === "warlock";
  if (!isWarlock) return;
  await restoreAllSpellSlots(roomId, playerName);
}

// ---------- Spellbook (spellbook task) ----------

/**
 * Add a spell ID to the player's known-spell list (extra spells beyond their
 * class base set). Used by the DM agent when a player reads a "scroll of
 * <spell name>" — the LLM's plan carries `success.learnSpell: <spellId>` and
 * this helper persists it on the Player row.
 *
 * Returns true if the spell was newly added, false if the player already
 * knew it (or the player wasn't found).
 */
export async function learnSpell(
  roomId: string,
  playerName: string,
  spellId: string
): Promise<boolean> {
  const p = await db.player.findFirst({ where: { name: playerName, roomId } });
  if (!p) return false;
  const current = (p.spellbookSpells ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (current.includes(spellId)) return false;
  current.push(spellId);
  await db.player.update({
    where: { id: p.id },
    data: { spellbookSpells: current.join(",") },
  });
  invalidateSnapshotCache(roomId);
  return true;
}

/** Standard XP reward per monster CR (compressed). */
export function xpForMonster(maxHp: number): number {
  if (maxHp <= 8) return 25;
  if (maxHp <= 13) return 50;
  if (maxHp <= 20) return 100;
  return 150;
}

// ---------- Conditions ----------
/** Apply a condition to a target. Refreshes duration if already active for the same condition. */
export async function applyCondition(
  roomId: string,
  targetName: string,
  targetType: "player" | "monster",
  type: string,
  duration: number,
  source: string
): Promise<ConditionState | null> {
  // Only accept known condition ids — silently skip unknown ones.
  if (!CONDITIONS[type]) return null;
  const safeDuration = Math.max(1, Math.min(50, Math.floor(duration) || 3));
  // If an active condition of the same type already exists on the target, refresh it.
  const existing = await db.condition.findFirst({
    where: { roomId, targetName, condition: type },
  });
  if (existing) {
    await db.condition.update({
      where: { id: existing.id },
      data: { duration: Math.max(existing.duration, safeDuration), source: source || existing.source },
    });
    const refreshed = await db.condition.findUnique({ where: { id: existing.id } });
    invalidateSnapshotCache(roomId);
    return refreshed ? toCondition(refreshed) : null;
  }
  const created = await db.condition.create({
    data: { roomId, targetName, targetType, condition: type, duration: safeDuration, source },
  });
  invalidateSnapshotCache(roomId);
  return toCondition(created);
}

/** Get all conditions in a room (optionally filtered by target name). */
export async function getConditions(
  roomId: string,
  targetName?: string
): Promise<ConditionState[]> {
  const where = targetName ? { roomId, targetName } : { roomId };
  const list = await db.condition.findMany({ where, orderBy: { createdAt: "asc" } });
  return list.map(toCondition);
}

/** Decrement all conditions in the room by 1 round and remove expired ones.
 *  Also applies damagePerRound effects (e.g. burning) to the affected targets.
 *  Returns a brief human-readable summary of damage applied. */
export async function tickConditions(roomId: string): Promise<string[]> {
  const list = await db.condition.findMany({ where: { roomId } });
  const messages: string[] = [];
  for (const c of list) {
    const def = CONDITIONS[c.condition];
    // Apply end-of-round damage (burning) BEFORE decrementing/expiring.
    if (def?.damagePerRound) {
      // Roll 1d{N} damage.
      const dmg = Math.floor(Math.random() * def.damagePerRound) + 1;
      if (dmg > 0) {
        if (c.targetType === "player") {
          await damagePlayer(roomId, c.targetName, dmg);
        } else {
          // Find the monster by name.
          const m = await db.monster.findFirst({ where: { name: c.targetName, roomId } });
          if (m) await damageMonster(roomId, m.id, dmg);
        }
        messages.push(`${c.targetName} получает ${dmg} урона от ${def.name.toLowerCase()} (${def.icon}).`);
      }
    }
    const newDuration = c.duration - 1;
    if (newDuration <= 0) {
      await db.condition.delete({ where: { id: c.id } });
      const nameRu = def?.name ?? c.condition;
      messages.push(`Состояние «${nameRu}» спадает с ${c.targetName}.`);
    } else {
      await db.condition.update({ where: { id: c.id }, data: { duration: newDuration } });
    }
  }
  invalidateSnapshotCache(roomId);
  return messages;
}

/** Remove all conditions from a target (e.g. on death, rest). */
export async function clearConditionsForTarget(roomId: string, targetName: string): Promise<void> {
  await db.condition.deleteMany({ where: { roomId, targetName } });
  invalidateSnapshotCache(roomId);
}

// ---------- AoE (area of effect) ----------
/** Compute the grid cells affected by an area-of-effect spell.
 *  - circle: all cells within Chebyshev distance `size` of `origin` (includes origin).
 *  - line: cells from origin outward along `direction` for `size` cells (includes origin).
 *  - cone: a 90° wedge from `origin` along `direction`, `size` cells deep.
 *  Cells are clamped to the grid (0..GRID_SIZE-1). */
export function computeAoECells(
  shape: "circle" | "cone" | "line",
  size: number,
  origin: { x: number; y: number },
  direction?: { x: number; y: number }
): { x: number; y: number }[] {
  const r = Math.max(1, Math.min(8, Math.floor(size) || 1));
  const ox = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(origin.x)));
  const oy = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(origin.y)));
  const cells: { x: number; y: number }[] = [];
  const seen = new Set<string>();
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) return;
    const key = `${x},${y}`;
    if (seen.has(key)) return;
    seen.add(key);
    cells.push({ x, y });
  };

  if (shape === "circle") {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) <= r) push(ox + dx, oy + dy);
      }
    }
    return cells;
  }

  // Normalize direction (default to +x if missing/zero).
  let dx = direction?.x ?? 1;
  let dy = direction?.y ?? 0;
  if (dx === 0 && dy === 0) { dx = 1; dy = 0; }
  dx = Math.sign(dx);
  dy = Math.sign(dy);

  if (shape === "line") {
    push(ox, oy);
    for (let s = 1; s <= r; s++) push(ox + dx * s, oy + dy * s);
    return cells;
  }

  // cone: 90° wedge. parallel = (cell-orig)·dir, perp = |(cell-orig)×dir|.
  // Include cells where parallel in [0, r] and |perp| <= parallel.
  for (let cx = 0; cx < GRID_SIZE; cx++) {
    for (let cy = 0; cy < GRID_SIZE; cy++) {
      const rx = cx - ox;
      const ry = cy - oy;
      const parallel = rx * dx + ry * dy;
      const perp = Math.abs(ry * dx - rx * dy);
      if (parallel >= 0 && parallel <= r && perp <= parallel) push(cx, cy);
    }
  }
  return cells;
}

// ---------- Quest Journal ----------
/** Create a new quest in the room's journal. Returns the created quest. */
export async function createQuest(
  roomId: string,
  title: string,
  description = "",
  objectives = "",
  reward = ""
): Promise<QuestState | null> {
  const cleanTitle = (title || "").trim().slice(0, 120);
  if (!cleanTitle) return null;
  const q = await db.quest.create({
    data: {
      roomId,
      title: cleanTitle,
      description: (description || "").trim().slice(0, 600),
      objectives: (objectives || "").trim().slice(0, 400),
      reward: (reward || "").trim().slice(0, 200),
      status: "active",
    },
  });
  invalidateSnapshotCache(roomId);
  return toQuest(q);
}

/** Update the status of an existing quest (active → completed/failed). */
export async function updateQuestStatus(
  roomId: string,
  questId: string,
  status: "active" | "completed" | "failed"
): Promise<boolean> {
  const res = await db.quest.updateMany({
    where: { id: questId, roomId },
    data: { status },
  });
  if (res.count > 0) invalidateSnapshotCache(roomId);
  return res.count > 0;
}

/** Fetch all quests for a room (any status). */
export async function getQuests(roomId: string): Promise<QuestState[]> {
  const list = await db.quest.findMany({ where: { roomId }, orderBy: { createdAt: "asc" } });
  return list.map(toQuest);
}

// ---------- World Map snapshot helper ----------
/** Get the discovered map rooms (filtered for client display). */
export async function getDiscoveredMapSnapshot(roomId: string): Promise<MapRoomState[]> {
  const all = await db.mapRoom.findMany({ where: { roomId }, orderBy: [{ y: "asc" }, { x: "asc" }] });
  const discoveredKeys = new Set(all.filter((r) => r.discovered).map((r) => `${r.x},${r.y}`));
  return all
    .filter((r) => r.discovered)
    .map(toMapRoom)
    .map((r) => ({
      ...r,
      connections: r.connections.filter((c) => discoveredKeys.has(`${c.x},${c.y}`)),
    }));
}

// ---------- NPCs ----------
/** Create or update an NPC in the room (matched by name). Returns the upserted NPC. */
export async function upsertNpc(
  roomId: string,
  name: string,
  role: "merchant" | "questgiver" | "ally" | "enemy",
  disposition: "friendly" | "neutral" | "hostile" = "neutral",
  location = "",
  notes = ""
): Promise<NpcState | null> {
  const cleanName = (name || "").trim().slice(0, 80);
  if (!cleanName) return null;
  const existing = await db.npc.findFirst({ where: { roomId, name: cleanName } });
  if (existing) {
    const updated = await db.npc.update({
      where: { id: existing.id },
      data: {
        role,
        disposition,
        location: location || existing.location,
        notes: notes || existing.notes,
        isAlive: true,
      },
    });
    invalidateSnapshotCache(roomId);
    return toNpc(updated);
  }
  const created = await db.npc.create({
    data: {
      roomId,
      name: cleanName,
      role,
      disposition,
      location,
      notes,
      isAlive: true,
    },
  });
  invalidateSnapshotCache(roomId);
  return toNpc(created);
}

/** Mark an NPC as dead (e.g. killed in combat). */
export async function killNpc(roomId: string, name: string): Promise<boolean> {
  const res = await db.npc.updateMany({
    where: { roomId, name, isAlive: true },
    data: { isAlive: false },
  });
  if (res.count > 0) invalidateSnapshotCache(roomId);
  return res.count > 0;
}

/** Get all living NPCs in a room. */
export async function getLivingNpcs(roomId: string): Promise<NpcState[]> {
  const list = await db.npc.findMany({ where: { roomId, isAlive: true }, orderBy: { createdAt: "asc" } });
  return list.map(toNpc);
}

// ---------- Equipment slots ----------
const SLOT_TO_COLUMN: Record<EquipmentSlot, "eqWeapon" | "eqShield" | "eqHead" | "eqChest" | "eqLegs" | "eqHands" | "eqAccessory1" | "eqAccessory2"> = {
  weapon: "eqWeapon",
  shield: "eqShield",
  head: "eqHead",
  chest: "eqChest",
  legs: "eqLegs",
  hands: "eqHands",
  accessory: "eqAccessory1", // default first slot
};

const ALL_EQUIP_COLUMNS = [
  "eqWeapon", "eqShield", "eqHead", "eqChest", "eqLegs", "eqHands", "eqAccessory1", "eqAccessory2",
] as const;

/** Parse a JSON stat-bonus string into a Partial<Stats>. */
function parseEquipStats(raw: string | null | undefined): Partial<Record<StatKey, number>> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Partial<Record<StatKey, number>> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        const num = Number(v) || 0;
        if (num && (k === "str" || k === "dex" || k === "con" || k === "int" || k === "wis" || k === "cha")) {
          out[k as StatKey] = num;
        }
      }
      return out;
    }
  } catch {
    /* ignore */
  }
  return {};
}

/** Serialize a Partial<Stats> into a JSON string for storage. */
function serializeEquipStats(stats: Partial<Record<StatKey, number>>): string {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(stats)) {
    if (v && v !== 0) out[k] = v;
  }
  return JSON.stringify(out);
}

/** Find the equipped-item-id stored in a given slot column. */
function slotColumnToSlot(col: string): EquipmentSlot | null {
  switch (col) {
    case "eqWeapon": return "weapon";
    case "eqShield": return "shield";
    case "eqHead": return "head";
    case "eqChest": return "chest";
    case "eqLegs": return "legs";
    case "eqHands": return "hands";
    case "eqAccessory1":
    case "eqAccessory2": return "accessory";
    default: return null;
  }
}

/** Recompute a player's AC and stats based on their currently-equipped items.
 *  The player.ac column stores effective AC (preset base + cumulative equipment bonus).
 *  The player.str/dex/etc. columns store effective stats (base + cumulative equipment bonus).
 *  We track the cumulative applied bonus in `acBonusApplied` / `equipStatsApplied`
 *  so we can cleanly reverse it when items are unequipped. */
export async function recomputePlayerAC(roomId: string, playerName: string): Promise<{ ac: number }> {
  const p = await db.player.findFirst({ where: { name: playerName, roomId } });
  if (!p) return { ac: 0 };
  // Collect equipped item ids.
  const equippedIds: string[] = [];
  for (const col of ALL_EQUIP_COLUMNS) {
    const id = (p as any)[col] as string | null;
    if (id) equippedIds.push(id);
  }
  // Load the items.
  const equippedItems = equippedIds.length > 0
    ? await db.inventoryItem.findMany({ where: { id: { in: equippedIds }, roomId } })
    : [];
  // Sum AC + stat bonuses from equipped items (re-inferred from name+type+description).
  let newAcBonus = 0;
  const newStatBonus: Partial<Record<StatKey, number>> = {};
  for (const it of equippedItems) {
    const props = inferEquipProps(it.itemName, it.itemType, it.description);
    newAcBonus += props.acBonus;
    for (const [k, v] of Object.entries(props.statBonus) as [StatKey, number][]) {
      newStatBonus[k] = (newStatBonus[k] ?? 0) + v;
    }
  }
  // Reverse previously-applied bonus, then apply new.
  const oldAcBonus = p.acBonusApplied ?? 0;
  const oldStatBonus = parseEquipStats(p.equipStatsApplied);
  const data: any = {
    acBonusApplied: newAcBonus,
    equipStatsApplied: serializeEquipStats(newStatBonus),
  };
  // Update AC: subtract old, add new.
  data.ac = Math.max(0, p.ac - oldAcBonus + newAcBonus);
  // Update each stat: subtract old, add new.
  for (const stat of ["str", "dex", "con", "int", "wis", "cha"] as StatKey[]) {
    const oldV = oldStatBonus[stat] ?? 0;
    const newV = newStatBonus[stat] ?? 0;
    const delta = newV - oldV;
    if (delta !== 0) {
      const cur = (p as any)[stat] as number;
      data[stat] = Math.max(1, cur + delta);
      // If CON changes, max HP changes too (1 HP per +1 CON per level retroactively).
      if (stat === "con") {
        const conDelta = delta;
        const hpDelta = conDelta * p.level;
        data.maxHp = Math.max(1, p.maxHp + hpDelta);
        data.hp = Math.max(0, Math.min(data.maxHp, p.hp + hpDelta));
      }
    }
  }
  await db.player.update({ where: { id: p.id }, data });
  invalidateSnapshotCache(roomId);
  return { ac: data.ac as number };
}

/** Equip an item to a slot on the player. Validates ownership + class restrictions.
 *  If the item is already equipped in another slot, it's moved. */
export async function equipItem(
  roomId: string,
  playerName: string,
  itemId: string,
  slot?: EquipmentSlot
): Promise<{ ok: boolean; error?: string }> {
  const p = await db.player.findFirst({ where: { name: playerName, roomId } });
  if (!p) return { ok: false, error: "Герой не найден." };
  const item = await db.inventoryItem.findFirst({ where: { id: itemId, roomId, playerName } });
  if (!item) return { ok: false, error: "Предмет не найден в инвентаре." };
  const inferred = inferEquipProps(item.itemName, item.itemType, item.description);
  const targetSlot = slot ?? inferred.equipSlot;
  if (!targetSlot) return { ok: false, error: "Этот предмет нельзя экипировать." };
  // Class restriction: wizard/sorcerer/warlock can't equip heavy armor.
  if (targetSlot === "chest" && inferred.isHeavyArmor) {
    const { NO_HEAVY_ARMOR_CLASSES } = await import("./item-props");
    if (NO_HEAVY_ARMOR_CLASSES.has(p.charClass)) {
      return { ok: false, error: `${p.charClass} не может носить тяжёлую броню.` };
    }
  }
  // Determine the slot column to write to.
  let slotCol: "eqWeapon" | "eqShield" | "eqHead" | "eqChest" | "eqLegs" | "eqHands" | "eqAccessory1" | "eqAccessory2";
  if (targetSlot === "accessory") {
    // Pick the first empty accessory slot; if both full, replace accessory1.
    slotCol = p.eqAccessory1 ? (p.eqAccessory2 ? "eqAccessory1" : "eqAccessory2") : "eqAccessory1";
  } else {
    slotCol = SLOT_TO_COLUMN[targetSlot];
  }
  // If the item is already equipped somewhere else, clear that slot.
  for (const col of ALL_EQUIP_COLUMNS) {
    if (col === slotCol) continue;
    if ((p as any)[col] === itemId) {
      await db.player.update({ where: { id: p.id }, data: { [col]: null } as any });
    }
  }
  // Set the new slot.
  await db.player.update({ where: { id: p.id }, data: { [slotCol]: itemId } as any });
  // Recompute AC + stats.
  await recomputePlayerAC(roomId, playerName);
  invalidateSnapshotCache(roomId);
  return { ok: true };
}

/** Unequip whatever is in a given slot. */
export async function unequipItem(
  roomId: string,
  playerName: string,
  slot: EquipmentSlot | "accessory1" | "accessory2"
): Promise<{ ok: boolean; error?: string }> {
  const p = await db.player.findFirst({ where: { name: playerName, roomId } });
  if (!p) return { ok: false, error: "Герой не найден." };
  let col: "eqWeapon" | "eqShield" | "eqHead" | "eqChest" | "eqLegs" | "eqHands" | "eqAccessory1" | "eqAccessory2";
  if (slot === "accessory1") {
    col = "eqAccessory1";
  } else if (slot === "accessory2") {
    col = "eqAccessory2";
  } else {
    col = SLOT_TO_COLUMN[slot as EquipmentSlot];
    // For accessory slot, fall back to accessory1.
    if (slot === "accessory" && !p.eqAccessory1 && p.eqAccessory2) col = "eqAccessory2";
  }
  if (!(p as any)[col]) return { ok: false, error: "Слот уже пуст." };
  await db.player.update({ where: { id: p.id }, data: { [col]: null } as any });
  await recomputePlayerAC(roomId, playerName);
  invalidateSnapshotCache(roomId);
  return { ok: true };
}

/** Get the list of equipped items (with their slot info) for a player. */
export async function getEquippedItems(roomId: string, playerName: string): Promise<{ slot: EquipmentSlot | "accessory1" | "accessory2"; item: InventoryItemState | null }[]> {
  const p = await db.player.findFirst({ where: { name: playerName, roomId } });
  if (!p) return [];
  const slots: { col: typeof ALL_EQUIP_COLUMNS[number]; slot: EquipmentSlot | "accessory1" | "accessory2" }[] = [
    { col: "eqWeapon", slot: "weapon" },
    { col: "eqShield", slot: "shield" },
    { col: "eqHead", slot: "head" },
    { col: "eqChest", slot: "chest" },
    { col: "eqLegs", slot: "legs" },
    { col: "eqHands", slot: "hands" },
    { col: "eqAccessory1", slot: "accessory1" },
    { col: "eqAccessory2", slot: "accessory2" },
  ];
  const ids = slots.map((s) => (p as any)[s.col] as string | null).filter(Boolean) as string[];
  const items = ids.length > 0 ? await db.inventoryItem.findMany({ where: { id: { in: ids }, roomId } }) : [];
  return slots.map((s) => {
    const id = (p as any)[s.col] as string | null;
    const item = id ? items.find((i) => i.id === id) : null;
    return { slot: s.slot, item: item ? toInventory(item) : null };
  });
}

// Allow slotColumnToSlot to be used externally (currently unused but exported for completeness).
export { slotColumnToSlot };
