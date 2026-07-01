// Database helpers: fetch / mutate the D&D game state.

import { db } from "@/lib/db";
import { abilityModifier } from "./dice";
import type {
  GameStateSnapshot,
  PlayerState,
  MonsterState,
  InventoryItemState,
  ChatMessageState,
  DiceRollState,
  SceneState,
  ResolvedRoll,
  InventoryChange,
} from "./types";

export const GRID_SIZE = 10; // 10x10 grid, each cell = 5 ft
export const PLAYER_NAME = "Алдрик"; // default hero name

/** Map a Prisma Player row to the client-safe PlayerState. */
function toPlayerState(p: any): PlayerState {
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
    portraitUrl: p.portraitUrl,
  };
}

function toMonsterState(m: any): MonsterState {
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

function toInventoryState(i: any): InventoryItemState {
  return {
    id: i.id,
    itemName: i.itemName,
    itemType: i.itemType,
    quantity: i.quantity,
    description: i.description,
  };
}

function toChatState(c: any): ChatMessageState {
  return {
    id: c.id,
    role: c.role,
    content: c.content,
    imageUrl: c.imageUrl,
    round: c.round,
    createdAt: c.createdAt.toISOString(),
  };
}

function toDiceState(d: any): DiceRollState {
  return {
    id: d.id,
    round: d.round,
    label: d.label,
    notation: d.notation,
    modifier: d.modifier,
    result: d.result,
    total: d.total,
    target: d.target,
    success: d.success,
    createdAt: d.createdAt.toISOString(),
  };
}

function toSceneState(s: any): SceneState {
  return {
    id: s.id,
    imageUrl: s.imageUrl,
    prompt: s.prompt,
    title: s.title,
  };
}

/** Fetch the complete game-state snapshot for the UI / DM context. */
export async function getSnapshot(): Promise<GameStateSnapshot> {
  const player = await db.player.findFirst({ where: { name: PLAYER_NAME } });
  const monsters = await db.monster.findMany({ orderBy: { createdAt: "asc" } });
  const inventory = await db.inventoryItem.findMany({
    where: { playerName: PLAYER_NAME },
    orderBy: { createdAt: "asc" },
  });
  const chat = await db.chatMessage.findMany({ orderBy: { createdAt: "asc" } });
  const diceLog = await db.diceRoll.findMany({
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  const activeScene = await db.scene.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });
  const gs = await db.gameState.findUnique({ where: { id: "singleton" } });

  return {
    player: player
      ? toPlayerState(player)
      : toPlayerState({
          id: "",
          name: PLAYER_NAME,
          charClass: "Воин",
          level: 1,
          hp: 28,
          maxHp: 28,
          ac: 16,
          str: 16,
          dex: 12,
          con: 15,
          int: 10,
          wis: 11,
          cha: 13,
          proficiencyBonus: 2,
          gold: 15,
          posX: 1,
          posY: 8,
          color: "#dc2626",
          portraitUrl: null,
        }),
    monsters: monsters.map(toMonsterState),
    inventory: inventory.map(toInventoryState),
    chat: chat.map(toChatState),
    diceLog: diceLog.map(toDiceState),
    scene: activeScene ? toSceneState(activeScene) : null,
    combatActive: gs?.combatActive ?? false,
    round: gs?.round ?? 0,
    location: gs?.location ?? "Туманный лес, опушка",
    turn: gs?.turn ?? "player",
  };
}

/** Return a compact, DM-readable summary of the current situation. */
export async function getDMContext(): Promise<string> {
  const snap = await getSnapshot();
  const p = snap.player;
  const lines: string[] = [];
  lines.push(
    `=== Состояние игры ===\nЛокация: ${snap.location}\nРаунд: ${snap.round}\nБой активен: ${snap.combatActive ? "да" : "нет"}`
  );
  lines.push(
    `=== Герой: ${p.name} (${p.charClass}, ур.${p.level}) ===\nHP: ${p.hp}/${p.maxHp} | AC: ${p.ac} | Золото: ${p.gold}\nСил: ${p.str} (мод ${abilityModifier(p.str)}) | Лов: ${p.dex} (мод ${abilityModifier(p.dex)}) | Тел: ${p.con} (мод ${abilityModifier(p.con)}) | Инт: ${p.int} (мод ${abilityModifier(p.int)}) | Муд: ${p.wis} (мод ${abilityModifier(p.wis)}) | Хар: ${p.cha} (мод ${abilityModifier(p.cha)})\nБонус мастерства: +${p.proficiencyBonus}\nПозиция на сетке: (${p.posX},${p.posY})`
  );
  if (snap.inventory.length > 0) {
    lines.push(
      "Инвентарь: " +
        snap.inventory.map((i) => `${i.itemName} x${i.quantity} [${i.itemType}]`).join(", ")
    );
  } else {
    lines.push("Инвентарь: пусто");
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
  } else if (snap.combatActive) {
    lines.push("Противники: все повержены");
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
  // recent chat for memory (last 6 messages)
  const recent = snap.chat.slice(-6);
  if (recent.length > 0) {
    lines.push("=== Недавние события ===");
    for (const c of recent) {
      const who = c.role === "player" ? "Игрок" : c.role === "system" ? "Система" : "Мастер";
      lines.push(`${who}: ${c.content.slice(0, 280)}`);
    }
  }
  return lines.join("\n");
}

/** Persist a dice roll to the log. */
export async function logDiceRoll(
  round: number,
  roll: ResolvedRoll
): Promise<void> {
  await db.diceRoll.create({
    data: {
      round,
      label: roll.label,
      notation: roll.notation,
      modifier: roll.modifier,
      result: roll.result,
      total: roll.total,
      target: roll.target ?? null,
      success: roll.success ?? null,
    },
  });
}

/** Apply damage to a monster (clamped, marks inactive at 0). */
export async function damageMonster(
  monsterId: string,
  amount: number
): Promise<{ hp: number; died: boolean }> {
  const m = await db.monster.findUnique({ where: { id: monsterId } });
  if (!m) return { hp: 0, died: false };
  const newHp = Math.max(0, m.hp - amount);
  await db.monster.update({
    where: { id: monsterId },
    data: { hp: newHp, isActive: newHp > 0 },
  });
  return { hp: newHp, died: newHp <= 0 };
}

/** Apply damage to the player (clamped at 0). */
export async function damagePlayer(amount: number): Promise<number> {
  const p = await db.player.findFirst({ where: { name: PLAYER_NAME } });
  if (!p) return 0;
  const newHp = Math.max(0, p.hp - amount);
  await db.player.update({ where: { id: p.id }, data: { hp: newHp } });
  return newHp;
}

/** Heal the player (clamped at maxHp). */
export async function healPlayer(amount: number): Promise<number> {
  const p = await db.player.findFirst({ where: { name: PLAYER_NAME } });
  if (!p) return 0;
  const newHp = Math.min(p.maxHp, p.hp + amount);
  await db.player.update({ where: { id: p.id }, data: { hp: newHp } });
  return newHp;
}

/** Move a token (player or monster) on the grid. */
export async function moveToken(
  name: string,
  newX: number,
  newY: number,
  isPlayer: boolean
): Promise<void> {
  const x = Math.max(0, Math.min(GRID_SIZE - 1, newX));
  const y = Math.max(0, Math.min(GRID_SIZE - 1, newY));
  if (isPlayer) {
    await db.player.updateMany({
      where: { name },
      data: { posX: x, posY: y },
    });
  } else {
    const m = await db.monster.findFirst({ where: { name } });
    if (m) {
      await db.monster.update({ where: { id: m.id }, data: { posX: x, posY: y } });
    }
  }
}

/** Apply a list of inventory changes. */
export async function applyInventoryChanges(
  changes: InventoryChange[]
): Promise<void> {
  for (const c of changes) {
    if (c.action === "add") {
      const existing = await db.inventoryItem.findFirst({
        where: { playerName: PLAYER_NAME, itemName: c.item },
      });
      if (existing) {
        await db.inventoryItem.update({
          where: { id: existing.id },
          data: { quantity: existing.quantity + 1 },
        });
      } else {
        await db.inventoryItem.create({
          data: {
            playerName: PLAYER_NAME,
            itemName: c.item,
            itemType: c.type || "misc",
            quantity: 1,
            description: c.description || "",
          },
        });
      }
    } else if (c.action === "remove") {
      const existing = await db.inventoryItem.findFirst({
        where: { playerName: PLAYER_NAME, itemName: c.item },
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

/** Adjust the player's gold (can be negative). */
export async function adjustGold(amount: number): Promise<void> {
  const p = await db.player.findFirst({ where: { name: PLAYER_NAME } });
  if (!p) return;
  await db.player.update({
    where: { id: p.id },
    data: { gold: Math.max(0, p.gold + amount) },
  });
}

/** Save a chat message. */
export async function saveChatMessage(
  role: "dm" | "player" | "system",
  content: string,
  round: number,
  imageUrl?: string | null
): Promise<void> {
  await db.chatMessage.create({
    data: { role, content, round, imageUrl: imageUrl ?? null },
  });
}

/** Update the global game state flags. */
export async function setGameState(data: {
  combatActive?: boolean;
  round?: number;
  location?: string;
  turn?: string;
  introShown?: boolean;
}): Promise<void> {
  await db.gameState.upsert({
    where: { id: "singleton" },
    update: data,
    create: { id: "singleton", ...data },
  });
}

/** Find the active monster nearest to the player (Chebyshev distance). */
export async function nearestActiveMonster(): Promise<MonsterState | null> {
  const player = await db.player.findFirst({ where: { name: PLAYER_NAME } });
  const monsters = await db.monster.findMany({ where: { isActive: true } });
  if (!player || monsters.length === 0) return null;
  let best = monsters[0];
  let bestDist = Infinity;
  for (const m of monsters) {
    const dist = Math.max(Math.abs(m.posX - player.posX), Math.abs(m.posY - player.posY));
    if (dist < bestDist) {
      bestDist = dist;
      best = m;
    }
  }
  return toMonsterState(best);
}

/** Move a monster one step toward the player along the dominant axis. */
export async function moveMonsterTowardPlayer(
  monsterId: string
): Promise<{ newX: number; newY: number; distBefore: number; distAfter: number }> {
  const m = await db.monster.findUnique({ where: { id: monsterId } });
  const p = await db.player.findFirst({ where: { name: PLAYER_NAME } });
  if (!m || !p) return { newX: 0, newY: 0, distBefore: 0, distAfter: 0 };
  const distBefore = Math.max(Math.abs(m.posX - p.posX), Math.abs(m.posY - p.posY));
  let nx = m.posX;
  let ny = m.posY;
  // move up to 2 cells (30 ft) toward player, one axis at a time
  const stepsLeft = 2;
  let steps = stepsLeft;
  while (steps > 0 && (nx !== p.posX || ny !== p.posY)) {
    const dx = p.posX - nx;
    const dy = p.posY - ny;
    if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
      nx += Math.sign(dx);
    } else if (dy !== 0) {
      ny += Math.sign(dy);
    } else {
      break;
    }
    steps--;
  }
  nx = Math.max(0, Math.min(GRID_SIZE - 1, nx));
  ny = Math.max(0, Math.min(GRID_SIZE - 1, ny));
  await db.monster.update({ where: { id: monsterId }, data: { posX: nx, posY: ny } });
  const distAfter = Math.max(Math.abs(nx - p.posX), Math.abs(ny - p.posY));
  return { newX: nx, newY: ny, distBefore, distAfter };
}

/** Mark a scene as inactive and store a new active scene. */
export async function setActiveScene(
  imageUrl: string,
  prompt: string,
  title: string
): Promise<void> {
  await db.scene.updateMany({ where: { isActive: true }, data: { isActive: false } });
  await db.scene.create({ data: { imageUrl, prompt, title, isActive: true } });
}

/** Compute the player's melee attack bonus (STR mod + proficiency). */
export function playerAttackBonus(str: number, proficiency: number): number {
  return abilityModifier(str) + proficiency;
}
