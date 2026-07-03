// Database helpers: fetch / mutate the room-scoped D&D game state.

import { db } from "@/lib/db";
import { abilityModifier } from "./dice";
import { rollD20 } from "./dice";
import { CONDITIONS, getCondition } from "./conditions";
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
} from "./types";

export const GRID_SIZE = 10;

// ---------- mappers ----------
function parseSpellSlots(raw: string | null | undefined): Record<string, number> {
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
    xp: p.xp,
    selectedTalents: p.selectedTalents ? p.selectedTalents.split(",").filter(Boolean) : [],
    bonusStr: p.bonusStr,
    bonusDex: p.bonusDex,
    bonusCon: p.bonusCon,
    bonusInt: p.bonusInt,
    bonusWis: p.bonusWis,
    bonusCha: p.bonusCha,
    pendingLevelUp: p.pendingLevelUp,
    spellSlots: parseSpellSlots(p.spellSlots),
    maxSpellSlots: parseSpellSlots(p.maxSpellSlots),
    hitDice: p.hitDice ?? 8,
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
  };
}

function toInventory(i: any): InventoryItemState {
  return {
    id: i.id,
    playerName: i.playerName,
    itemName: i.itemName,
    itemType: i.itemType,
    quantity: i.quantity,
    description: i.description,
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
export async function getSnapshot(roomCode: string): Promise<GameStateSnapshot | null> {
  const room = await getRoomByCode(roomCode);
  if (!room) return null;

  const [players, monsters, inventory, chat, diceLog, activeScene, initiatives, conditions, quests, mapRoomsAll, npcs] = await Promise.all([
    db.player.findMany({ where: { roomId: room.id }, orderBy: { createdAt: "asc" } }),
    db.monster.findMany({ where: { roomId: room.id }, orderBy: { createdAt: "asc" } }),
    db.inventoryItem.findMany({ where: { roomId: room.id }, orderBy: { createdAt: "asc" } }),
    db.chatMessage.findMany({ where: { roomId: room.id }, orderBy: { createdAt: "asc" } }),
    db.diceRoll.findMany({ where: { roomId: room.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.scene.findFirst({ where: { roomId: room.id, isActive: true }, orderBy: { createdAt: "desc" } }),
    db.initiativeEntry.findMany({ where: { roomId: room.id }, orderBy: { order: "asc" } }),
    db.condition.findMany({ where: { roomId: room.id }, orderBy: { createdAt: "asc" } }),
    db.quest.findMany({ where: { roomId: room.id }, orderBy: { createdAt: "asc" } }),
    db.mapRoom.findMany({ where: { roomId: room.id }, orderBy: [{ y: "asc" }, { x: "asc" }] }),
    db.npc.findMany({ where: { roomId: room.id }, orderBy: { createdAt: "asc" } }),
  ]);

  const order = initiatives;
  const currentEntry = order[room.turnIndex] ?? null;

  // Only reveal discovered rooms to the client; their connections are filtered
  // to discovered-only so hidden rooms aren't leaked.
  const discoveredKeys = new Set(mapRoomsAll.filter((r) => r.discovered).map((r) => `${r.x},${r.y}`));
  const discoveredRooms = mapRoomsAll
    .filter((r) => r.discovered)
    .map(toMapRoom)
    .map((r) => ({
      ...r,
      connections: r.connections.filter((c) => discoveredKeys.has(`${c.x},${c.y}`)),
    }));

  // Time-of-day / weather come from the Room columns (added in items 9 & 10).
  // weather is still optional until item 10 lands, so we read it via cast.
  const roomAny = room as any;
  const timeOfDay = (room.timeOfDay ?? "day") as "dawn" | "day" | "dusk" | "night";
  const weather = (roomAny.weather ?? "clear") as "clear" | "rain" | "fog" | "storm" | "snow";
  const currentMapPos =
    room.currentMapX >= 0 && room.currentMapY >= 0
      ? { x: room.currentMapX, y: room.currentMapY }
      : null;

  return {
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
    currentTurnName: currentEntry?.combatantName ?? null,
    currentTurnType: (currentEntry?.combatantType as "player" | "monster") ?? null,
    currentExplorerName: room.combatActive ? null : (players.filter((p) => p.isAlive && p.hp > 0)[room.explorationActorIndex % Math.max(1, players.filter((p) => p.isAlive && p.hp > 0).length)]?.name ?? players[0]?.name ?? null),
    conditions: conditions.map(toCondition),
    quests: quests.map(toQuest),
    mapRooms: discoveredRooms,
    npcs: npcs.filter((n) => n.isAlive).map(toNpc),
    timeOfDay,
    weather,
    currentMapPos,
  };
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
    const status = p.isAlive && p.hp > 0 ? `HP ${p.hp}/${p.maxHp}` : "ПАЛ";
    const slotEntries = Object.entries(p.maxSpellSlots).filter(([, v]) => v > 0);
    const slotInfo =
      slotEntries.length > 0
        ? ` | Ячейки заклинаний: ${slotEntries
            .map(([lv, max]) => `ур.${lv}:${p.spellSlots[lv] ?? 0}/${max}`)
            .join(", ")}`
        : "";
    lines.push(
      `${p.name} (${p.raceName} ${p.charClass}, происхождение ${p.backgroundName}, ур.${p.level})${p.isHost ? " [хост]" : ""}: ${status} | AC ${p.ac} | Золото ${p.gold} | СИЛ ${p.str}(${mod(p.str)}) ЛОВ ${p.dex}(${mod(p.dex)}) ТЕЛ ${p.con}(${mod(p.con)}) ИНТ ${p.int}(${mod(p.int)}) МУД ${p.wis}(${mod(p.wis)}) ХАР ${p.cha}(${mod(p.cha)}) | Бонус мастерства +${p.proficiencyBonus} | Оружие: ${p.weaponName} (${p.weaponNotation})${slotInfo} | Позиция (${p.posX},${p.posY})`
    );
  }

  const items = snap.inventory;
  if (items.length > 0) {
    const byPlayer = new Map<string, string[]>();
    for (const it of items) {
      if (!byPlayer.has(it.playerName)) byPlayer.set(it.playerName, []);
      const scrollTag = it.itemType === "scroll" ? " [расходуемое заклинание-свиток]" : "";
      byPlayer.get(it.playerName)!.push(`${it.itemName} x${it.quantity}${scrollTag}`);
    }
    for (const [name, list] of byPlayer) {
      lines.push(`Инвентарь ${name}: ${list.join(", ")}`);
    }
  }

  const activeMonsters = snap.monsters.filter((m) => m.isActive);
  const hiddenMonsters = snap.monsters.filter((m) => !m.isActive);
  if (activeMonsters.length > 0) {
    lines.push("=== Противники (на сетке) ===");
    for (const m of activeMonsters) {
      lines.push(
        `${m.name} (${m.label}): HP ${m.hp}/${m.maxHp} | AC ${m.ac} | Атака +${m.attackBonus} | Урон ${m.damageNotation} | Позиция (${m.posX},${m.posY})`
      );
    }
  }
  if (hiddenMonsters.length > 0) {
    lines.push("=== Скрытые угрозы (появятся, если начнётся бой) ===");
    for (const m of hiddenMonsters) {
      lines.push(
        `${m.name} (${m.label}): HP ${m.maxHp} | AC ${m.ac} | Атака +${m.attackBonus} | Урон ${m.damageNotation} | Позиция (${m.posX},${m.posY}) | ${m.description}`
      );
    }
  }
  if (activeMonsters.length === 0 && hiddenMonsters.length === 0) {
    lines.push("Противники: нет");
  }

  if (snap.combatActive && snap.initiatives.length > 0) {
    lines.push("=== Порядок инициативы ===");
    snap.initiatives.forEach((e, i) => {
      const cur = i === snap.turnIndex ? " <- СЕЙЧАС" : "";
      lines.push(`${i + 1}. ${e.combatantName} (${e.combatantType}, инициатива ${e.initiative})${cur}`);
    });
  }

  // Active conditions per target.
  if (snap.conditions.length > 0) {
    lines.push("=== Активные состояния ===");
    for (const c of snap.conditions) {
      const def = getCondition(c.condition);
      const nameRu = def?.name ?? c.condition;
      const icon = def?.icon ?? "❓";
      lines.push(
        `${c.targetName} (${c.targetType}): ${icon} ${nameRu} — ${c.duration} раундов. Источник: ${c.source || "—"}.`
      );
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

  // Time of day.
  lines.push(`=== Время суток ===\nСейчас: ${timeOfDayLabelRu(snap.timeOfDay)}`);

  const recent = snap.chat.slice(-6);
  if (recent.length > 0) {
    lines.push("=== Недавние события ===");
    for (const c of recent) {
      const who = c.role === "player" ? `Игрок ${c.speaker}` : c.role === "system" ? "Система" : "Мастер";
      lines.push(`${who}: ${c.content.slice(0, 300)}`);
    }
  }
  return lines.join("\n");
}

// ---------- mutations ----------
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
}

export async function damageMonster(roomId: string, monsterId: string, amount: number) {
  const m = await db.monster.findFirst({ where: { id: monsterId, roomId } });
  if (!m) return { hp: 0, died: false };
  const newHp = Math.max(0, m.hp - amount);
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
  }
  return { hp: newHp, died: newHp <= 0 };
}

export async function damagePlayer(roomId: string, name: string, amount: number) {
  const p = await db.player.findFirst({ where: { name, roomId } });
  if (!p) return { hp: 0, died: false };
  const newHp = Math.max(0, p.hp - amount);
  const died = newHp <= 0;
  await db.player.update({
    where: { id: p.id },
    data: { hp: newHp, isAlive: !died },
  });
  if (died) {
    await db.initiativeEntry.updateMany({
      where: { roomId, combatantName: name },
      data: { isAlive: false },
    });
  }
  return { hp: newHp, died };
}

export async function healPlayer(roomId: string, name: string, amount: number) {
  const p = await db.player.findFirst({ where: { name, roomId } });
  if (!p) return 0;
  const newHp = Math.min(p.maxHp, p.hp + amount);
  await db.player.update({
    where: { id: p.id },
    data: { hp: newHp, isAlive: true },
  });
  return newHp;
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
        await db.inventoryItem.create({
          data: {
            roomId,
            playerName,
            itemName: c.item,
            itemType: c.type || "misc",
            quantity: 1,
            description: c.description || "",
          },
        });
      }
    } else if (c.action === "remove") {
      const existing = await db.inventoryItem.findFirst({
        where: { roomId, playerName, itemName: c.item },
      });
      if (existing) {
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
}

export async function adjustGold(roomId: string, name: string, amount: number) {
  const p = await db.player.findFirst({ where: { name, roomId } });
  if (!p) return;
  await db.player.update({
    where: { id: p.id },
    data: { gold: Math.max(0, p.gold + amount) },
  });
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
}

export async function setRoomState(roomId: string, data: Partial<{
  combatActive: boolean;
  round: number;
  location: string;
  turnIndex: number;
  introShown: boolean;
}>) {
  await db.room.update({ where: { id: roomId }, data });
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
  while (steps > 0 && (nx !== p.posX || ny !== p.posY)) {
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
  return { newX: nx, newY: ny, distBefore, distAfter, targetName: p.name };
}

export async function setActiveScene(roomId: string, imageUrl: string, prompt: string, title: string) {
  await db.scene.updateMany({ where: { roomId, isActive: true }, data: { isActive: false } });
  await db.scene.create({ data: { roomId, imageUrl, prompt, title, isActive: true } });
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
    await db.room.update({
      where: { id: roomId },
      data: {
        explorationActorIndex: nextIdx,
        turnCount: newTurnCount,
        timeOfDay: newTimeOfDay,
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
  } else {
    await db.room.update({ where: { id: roomId }, data: { explorationActorIndex: nextIdx } });
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
/** XP needed to REACH a given level (D&D 5e compressed for short games). */
export const XP_THRESHOLDS: Record<number, number> = {
  1: 0,
  2: 200,
  3: 600,
  4: 1200,
  5: 2000,
};

/** Proficiency bonus by level (5e standard). */
export function proficiencyForLevel(level: number): number {
  return 2 + Math.floor((level - 1) / 4);
}

/** Award XP to a player; sets pendingLevelUp if a threshold is crossed. Returns the new level. */
export async function awardXP(roomId: string, playerName: string, xp: number): Promise<{ leveledUp: boolean; newLevel: number }> {
  const p = await db.player.findFirst({ where: { name: playerName, roomId } });
  if (!p) return { leveledUp: false, newLevel: 1 };
  const newXp = p.xp + xp;
  let newLevel = p.level;
  let leveledUp = false;
  while (newLevel < 5 && XP_THRESHOLDS[newLevel + 1] <= newXp) {
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
  await db.player.update({
    where: { id: p.id },
    data: {
      xp: newXp,
      level: newLevel,
      proficiencyBonus: prof,
      maxHp: newMaxHp,
      hp: newHp,
      pendingLevelUp: leveledUp ? true : p.pendingLevelUp,
    },
  });
  return { leveledUp, newLevel };
}

/** Apply a chosen talent on level-up and clear the pending flag. */
export async function applyLevelUpTalent(roomId: string, playerName: string, talentId: string): Promise<boolean> {
  const p = await db.player.findFirst({ where: { name: playerName, roomId } });
  if (!p || !p.pendingLevelUp) return false;
  const existing = p.selectedTalents ? p.selectedTalents.split(",").filter(Boolean) : [];
  if (existing.includes(talentId)) return false; // already taken
  existing.push(talentId);
  await db.player.update({
    where: { id: p.id },
    data: { selectedTalents: existing.join(","), pendingLevelUp: false },
  });
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
}

/** Restore spell slots for a specific class (e.g. warlock on short rest). */
export async function restoreSpellSlotsForShortRest(roomId: string, playerName: string, charClass: string): Promise<void> {
  // Warlock: restore all slots on short rest. Other casters keep their slots.
  const isWarlock = charClass.toLowerCase() === "warlock";
  if (!isWarlock) return;
  await restoreAllSpellSlots(roomId, playerName);
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
    return refreshed ? toCondition(refreshed) : null;
  }
  const created = await db.condition.create({
    data: { roomId, targetName, targetType, condition: type, duration: safeDuration, source },
  });
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
  return messages;
}

/** Remove all conditions from a target (e.g. on death, rest). */
export async function clearConditionsForTarget(roomId: string, targetName: string): Promise<void> {
  await db.condition.deleteMany({ where: { roomId, targetName } });
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
  return toNpc(created);
}

/** Mark an NPC as dead (e.g. killed in combat). */
export async function killNpc(roomId: string, name: string): Promise<boolean> {
  const res = await db.npc.updateMany({
    where: { roomId, name, isAlive: true },
    data: { isAlive: false },
  });
  return res.count > 0;
}

/** Get all living NPCs in a room. */
export async function getLivingNpcs(roomId: string): Promise<NpcState[]> {
  const list = await db.npc.findMany({ where: { roomId, isAlive: true }, orderBy: { createdAt: "asc" } });
  return list.map(toNpc);
}
