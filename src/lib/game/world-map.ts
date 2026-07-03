// Procedural dungeon-map generator (BSP) + persistence helpers.
//
// The map is a connected graph of rooms produced by recursive Binary Space
// Partitioning: a rectangular region is recursively split along its longer
// axis until we hit the target room count or minimum region size; each leaf
// becomes one room; sibling leaves are connected so the overall graph stays
// connected. One room is the "entrance" (discovered = true, where the party
// starts), the boss is placed as far from the entrance as possible, and 1–2
// extra "secret" rooms are sprinkled just off the graph — they only become
// reachable after a Perception check (handled in move-room) reveals them.
//
// All map mutations go through db.mapRoom; the snapshot cache is invalidated
// on every write so the next /api/game/state poll picks up the new map.

import { db } from "@/lib/db";
import { invalidateSnapshotCache } from "./state";
import type { MapRoomState, MapRoomType } from "./types";
import {
  getBiome,
  pickRoomLabel,
  getImagePrompt,
  type DungeonBiomeId,
} from "./dungeon-biomes";

// ---------- RNG helpers ----------
function rnd(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}
function pick<T>(arr: T[]): T {
  return arr[rnd(arr.length)];
}
function chance(p: number): boolean {
  return Math.random() < p;
}

// ---------- Room-type distribution ----------
// (combat 30%, loot 20%, puzzle 10%, npc 10%, safe 10%, trap 10%) — sums to 90,
// rollRoomType normalizes internally. Entrance (1) and boss (1, furthest) are
// assigned separately so the weights below exclude them.
const TYPE_WEIGHTS: { type: MapRoomType; w: number }[] = [
  { type: "combat", w: 30 },
  { type: "loot", w: 20 },
  { type: "puzzle", w: 10 },
  { type: "npc", w: 10 },
  { type: "safe", w: 10 },
  { type: "trap", w: 10 },
];

function rollRoomType(): MapRoomType {
  const total = TYPE_WEIGHTS.reduce((s, t) => s + t.w, 0);
  let r = rnd(total);
  for (const t of TYPE_WEIGHTS) {
    if (r < t.w) return t.type;
    r -= t.w;
  }
  return "combat";
}

// Generic Russian fallbacks for room labels/descriptions when a biome pool is
// somehow exhausted (defensive — biome pools are always ≥3 entries).
const FALLBACK_LABELS: Record<MapRoomType, string[]> = {
  entrance: ["Вход в подземелье", "Тёмный проход", "Расщелина у скалы"],
  combat: ["Тёмный зал", "Зал эха", "Костяная комната", "Зала теней", "Кровавый коридор"],
  loot: ["Забытая кладовая", "Сундучная", "Камора сокровищ", "Руины склада"],
  npc: ["Убежище отшельника", "Лагерь странника", "Келья жреца", "Тайная комната"],
  puzzle: ["Зал рун", "Комната загадок", "Резная зала", "Зеркальный зал"],
  safe: ["Укрытие", "Тихая часовня", "Поляна отдыха", "Зал костра"],
  boss: ["Тронный зал", "Логово", "Сердце подземелья", "Чёрный алтарь"],
  trap: ["Коварный коридор", "Зал лезвий", "Камера ловушек", "Гнилая ниша"],
};

const FALLBACK_DESCS: Record<MapRoomType, string[]> = {
  entrance: [
    "Сырой ветер тянет из проёма. Где-то внутри капает вода.",
    "Каменные ступени уходят вниз, в непроглядную тьму.",
  ],
  combat: [
    "По стенам мелькают тени. Здесь кто-то — или что-то — есть.",
    "На полу бурые пятна. Пахнет свежей кровью.",
  ],
  loot: [
    "В углу высятся покрытые пылью ящики. Что-то блестит в полумраке.",
    "Старый сундук приткнулся у стены — крышка приоткрыта.",
  ],
  npc: [
    "В полумраке горит огонёк свечи. Кто-то здесь живёт.",
    "У стены спит сгорбленная фигура в тряпье.",
  ],
  puzzle: [
    "Стены покрыты древними рунами, а в центре — каменный постамент.",
    "На полу мозаика, а в воздухе — лёгкий запах магии.",
  ],
  safe: [
    "Здесь тихо и спокойно. Можно перевести дух.",
    "Уютная ниша с потухшим кострищем — безопасное место.",
  ],
  boss: [
    "Огромная зала, в дальнем конце которой дремлет нечто огромное.",
    "Алтарь из чёрного камня, и воздух здесь тяжёл от древнего зла.",
  ],
  trap: [
    "Пол выглядит подозрительно — что-то здесь не так.",
    "Воздух здесь застоявшийся, а пол исцарапан следами проволоки.",
  ],
};

// ---------- BSP layout grid ----------
// 7×5 = 35 cells. Enough headroom for 8–15 main rooms + 1–2 secret rooms.
const GRID_W = 7;
const GRID_H = 5;
const MIN_REGION = 2; // smallest region (in cells) we'll keep splitting; below this a leaf is placed.

interface RawRoom {
  x: number;
  y: number;
  type: MapRoomType;
  label: string;
  description: string;
  secret: boolean;
  connections: { x: number; y: number }[];
}

interface BSPNode {
  x0: number;
  y0: number;
  w: number;
  h: number;
  room?: { x: number; y: number };
  left?: BSPNode;
  right?: BSPNode;
}

/** Recursively split a rectangular region. Each leaf gets a single room placed
 *  at its centre. Mutates `node` in place. `counter` tracks total leaves so we
 *  can stop early once we hit the target room count. */
function buildBSP(node: BSPNode, targetLeaves: number, counter: { count: number }): void {
  const canSplitW = node.w >= MIN_REGION * 2;
  const canSplitH = node.h >= MIN_REGION * 2;
  if (counter.count >= targetLeaves || (!canSplitW && !canSplitH)) {
    node.room = {
      x: node.x0 + Math.floor(node.w / 2),
      y: node.y0 + Math.floor(node.h / 2),
    };
    counter.count++;
    return;
  }
  let splitVertical: boolean;
  if (canSplitW && canSplitH) {
    // Bias toward the longer axis so rooms stretch naturally.
    splitVertical = node.w > node.h || (node.w === node.h && chance(0.5));
  } else {
    splitVertical = canSplitW;
  }
  if (splitVertical) {
    // Random offset so the split isn't always exactly at the midpoint.
    const half = Math.floor(node.w / 2);
    const jitter = chance(0.5) ? 0 : (chance(0.5) ? -1 : 1);
    const splitW = Math.max(MIN_REGION, Math.min(node.w - MIN_REGION, half + jitter));
    node.left = { x0: node.x0, y0: node.y0, w: splitW, h: node.h };
    node.right = { x0: node.x0 + splitW, y0: node.y0, w: node.w - splitW, h: node.h };
  } else {
    const half = Math.floor(node.h / 2);
    const jitter = chance(0.5) ? 0 : (chance(0.5) ? -1 : 1);
    const splitH = Math.max(MIN_REGION, Math.min(node.h - MIN_REGION, half + jitter));
    node.left = { x0: node.x0, y0: node.y0, w: node.w, h: splitH };
    node.right = { x0: node.x0, y0: node.y0 + splitH, w: node.w, h: node.h - splitH };
  }
  buildBSP(node.left!, targetLeaves, counter);
  buildBSP(node.right!, targetLeaves, counter);
}

/** Collect all leaf nodes (those with a `room` placed) under `node`. */
function collectLeaves(node: BSPNode, out: BSPNode[] = []): BSPNode[] {
  if (node.room) {
    out.push(node);
    return out;
  }
  if (node.left) collectLeaves(node.left, out);
  if (node.right) collectLeaves(node.right, out);
  return out;
}

/** Walk the BSP tree and connect each internal node's left subtree to its right
 *  subtree (one random edge per internal node). This produces a spanning tree
 *  that respects the BSP partition — every room is reachable from every other.
 *  Edges are pushed into `edges` as a list of (ax,ay,bx,by). */
function connectBSP(
  node: BSPNode,
  edges: { ax: number; ay: number; bx: number; by: number }[]
): void {
  if (!node.left || !node.right) return;
  connectBSP(node.left, edges);
  connectBSP(node.right, edges);
  const lLeaves = collectLeaves(node.left);
  const rLeaves = collectLeaves(node.right);
  const l = pick(lLeaves);
  const r = pick(rLeaves);
  if (l.room && r.room) {
    edges.push({ ax: l.room.x, ay: l.room.y, bx: r.room.x, by: r.room.y });
  }
}

/** BFS over an adjacency map to verify every room is reachable from `start`. */
function isConnected(rooms: RawRoom[]): boolean {
  if (rooms.length === 0) return true;
  const key = (x: number, y: number) => `${x},${y}`;
  const adj = new Map<string, Set<string>>();
  for (const r of rooms) {
    if (!adj.has(key(r.x, r.y))) adj.set(key(r.x, r.y), new Set());
    for (const c of r.connections) {
      adj.get(key(r.x, r.y))!.add(key(c.x, c.y));
      if (!adj.has(key(c.x, c.y))) adj.set(key(c.x, c.y), new Set());
      adj.get(key(c.x, c.y))!.add(key(r.x, r.y));
    }
  }
  const start = key(rooms[0].x, rooms[0].y);
  const seen = new Set<string>([start]);
  const queue: string[] = [start];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const neighbours = adj.get(cur);
    if (!neighbours) continue;
    for (const n of neighbours) {
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen.size === rooms.length;
}

/** Generate a procedural dungeon map. Returns the room list (NOT yet persisted).
 *  Caller is responsible for inserting rows.
 *  `depth` controls room count: depth 1 → 8 rooms, depth 5 → 15 rooms.
 *  `biomeId` is used to pick biome-themed labels + image prompts. */
export function generateDungeonMapData(
  depth = 1,
  biomeId: DungeonBiomeId = "dungeon"
): RawRoom[] {
  // depth 1 → 8, depth 5 → 15. Linear interp, clamped to [8,15].
  const target = Math.max(8, Math.min(15, 8 + (Math.max(1, depth) - 1) * 2));

  // Build the BSP tree.
  const root: BSPNode = { x0: 0, y0: 0, w: GRID_W, h: GRID_H };
  const counter = { count: 0 };
  buildBSP(root, target, counter);

  // Collect leaves → room positions.
  const leaves = collectLeaves(root);
  const positions = leaves
    .map((l) => l.room!)
    .filter((r) => Number.isFinite(r.x) && Number.isFinite(r.y));

  // Connect siblings in the BSP tree → spanning tree edges.
  const edges: { ax: number; ay: number; bx: number; by: number }[] = [];
  connectBSP(root, edges);

  // Build RawRoom objects with empty connections.
  const byPos = new Map<string, RawRoom>();
  const rooms: RawRoom[] = positions.map((p) => {
    const r: RawRoom = {
      x: p.x,
      y: p.y,
      type: "combat", // overwritten below
      label: "",
      description: "",
      secret: false,
      connections: [],
    };
    byPos.set(`${p.x},${p.y}`, r);
    return r;
  });

  // Pick the entrance: lowest (x+y) — feels like an "edge".
  rooms.sort((a, b) => a.x + a.y - (b.x + b.y));
  const entrance = rooms[0];
  // Boss: furthest from the entrance (Chebyshev).
  let boss = rooms[1] ?? rooms[0];
  let bestDist = -1;
  for (const c of rooms) {
    if (c === entrance) continue;
    const d = Math.max(Math.abs(c.x - entrance.x), Math.abs(c.y - entrance.y));
    if (d > bestDist) {
      bestDist = d;
      boss = c;
    }
  }

  // Assign types: entrance / boss explicitly, others random.
  for (const r of rooms) {
    if (r === entrance) r.type = "entrance";
    else if (r === boss) r.type = "boss";
    else r.type = rollRoomType();
    r.label = pickRoomLabel(biomeId, r.type) || pick(FALLBACK_LABELS[r.type]);
    r.description = pick(FALLBACK_DESCS[r.type]);
  }

  // Apply spanning-tree edges → bidirectional connections.
  const addConn = (a: RawRoom, b: RawRoom) => {
    if (!a.connections.some((c) => c.x === b.x && c.y === b.y)) {
      a.connections.push({ x: b.x, y: b.y });
    }
    if (!b.connections.some((c) => c.x === a.x && c.y === a.y)) {
      b.connections.push({ x: a.x, y: a.y });
    }
  };
  for (const e of edges) {
    const a = byPos.get(`${e.ax},${e.ay}`);
    const b = byPos.get(`${e.bx},${e.by}`);
    if (a && b) addConn(a, b);
  }

  // Sprinkle a few extra random edges between Chebyshev-nearby rooms so the
  // graph has loops (less linear). Capped at 3 extra edges.
  let extraAttempts = 0;
  let extraAdded = 0;
  while (extraAdded < 3 && extraAttempts++ < 30) {
    const a = pick(rooms);
    const candidates = rooms.filter(
      (o) =>
        o !== a &&
        Math.max(Math.abs(o.x - a.x), Math.abs(o.y - a.y)) <= 2 &&
        !a.connections.some((c) => c.x === o.x && c.y === o.y)
    );
    if (candidates.length === 0) continue;
    const b = pick(candidates);
    addConn(a, b);
    extraAdded++;
  }

  // ===== 1–2 secret rooms (hidden, discovered=false, secret=true) =====
  // Placed at a cell not already used by a main room, then connected to the
  // nearest main room ONLY if discovered (the Perception check in move-room
  // rewrites the connection on discovery). For now they're orphans — the DB
  // row exists so a future discovery can flip discovered=true and we add the
  // connection in `revealSecretRoom`.
  const usedKeys = new Set(rooms.map((r) => `${r.x},${r.y}`));
  const freeCells: { x: number; y: number }[] = [];
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (!usedKeys.has(`${x},${y}`)) freeCells.push({ x, y });
    }
  }
  // Shuffle freeCells (Fisher-Yates).
  for (let i = freeCells.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [freeCells[i], freeCells[j]] = [freeCells[j], freeCells[i]];
  }
  const secretCount = Math.min(freeCells.length, 1 + rnd(2)); // 1..2
  for (let i = 0; i < secretCount; i++) {
    const cell = freeCells[i];
    // Secret rooms default to "loot" type (typical treasure cache).
    const type: MapRoomType = chance(0.7) ? "loot" : "combat";
    const label = pickRoomLabel(biomeId, type) || pick(FALLBACK_LABELS[type]);
    const secretRoom: RawRoom = {
      x: cell.x,
      y: cell.y,
      type,
      label: `Тайная комната: ${label}`,
      description: "Скрытое помещение, доступное лишь тому, кто знает, где искать.",
      secret: true,
      connections: [],
    };
    rooms.push(secretRoom);
    byPos.set(`${cell.x},${cell.y}`, secretRoom);
  }

  // Verify connectivity of the MAIN graph (secret rooms are intentionally
  // disconnected until discovered). If somehow disconnected, fall back to a
  // Primm-style chain so the dungeon is always traversable.
  const mainRooms = rooms.filter((r) => !r.secret);
  if (!isConnected(mainRooms)) {
    // Greedy nearest-neighbour chain from the entrance.
    const visited = new Set<string>([`${entrance.x},${entrance.y}`]);
    while (visited.size < mainRooms.length) {
      let bestPair: { a: RawRoom; b: RawRoom; d: number } | null = null;
      for (const a of mainRooms) {
        if (!visited.has(`${a.x},${a.y}`)) continue;
        for (const b of mainRooms) {
          if (visited.has(`${b.x},${b.y}`)) continue;
          const d = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
          if (!bestPair || d < bestPair.d) bestPair = { a, b, d };
        }
      }
      if (!bestPair) break;
      addConn(bestPair.a, bestPair.b);
      visited.add(`${bestPair.b.x},${bestPair.b.y}`);
    }
  }

  return rooms;
}

// ---------- Persistence ----------

function toMapRoomState(m: any): MapRoomState {
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
    roomType: m.roomType as MapRoomType,
    discovered: Boolean(m.discovered),
    connections: conns,
    description: m.description ?? "",
    secret: Boolean(m.secret),
    scenePrompt: m.scenePrompt ?? "",
    populated: Boolean(m.populated),
  };
}

/** Generate a dungeon map for a room AND persist it as MapRoom rows.
 *  Returns the persisted rooms. Idempotent: if the room already has map rows,
 *  returns them without regenerating.
 *  `depth` scales the room count (1 → 8, 5 → 15).
 *  `biomeId` controls themed labels + image prompts (defaults to room's
 *  `dungeonBiome` column or "dungeon"). */
export async function generateDungeonMap(
  roomId: string,
  depth = 1,
  biomeId?: DungeonBiomeId
): Promise<MapRoomState[]> {
  const existing = await db.mapRoom.findMany({ where: { roomId } });
  if (existing.length > 0) return existing.map(toMapRoomState);

  // Resolve biome: explicit param > room.dungeonBiome > "dungeon".
  let biome: DungeonBiomeId;
  if (biomeId) {
    biome = biomeId;
  } else {
    const room = await db.room.findUnique({ where: { id: roomId }, select: { dungeonBiome: true } });
    biome = (room?.dungeonBiome as DungeonBiomeId) || "dungeon";
  }
  // Make sure the room row reflects the chosen biome + depth.
  await db.room.update({
    where: { id: roomId },
    data: {
      dungeonBiome: biome,
      dungeonDepth: depth,
      dungeonCleared: false,
    },
  });

  const rooms = generateDungeonMapData(depth, biome);
  const biomeDef = getBiome(biome);

  // Identify the entrance (discovered = true; the party starts here).
  const entrance = rooms.find((r) => r.type === "entrance");
  const data = rooms.map((r) => ({
    roomId,
    x: r.x,
    y: r.y,
    label: r.label,
    roomType: r.type,
    discovered: r.type === "entrance" && !r.secret,
    connections: r.connections.map((c) => `${c.x}:${c.y}`).join(","),
    description: r.description,
    secret: r.secret,
    scenePrompt: getImagePrompt(biome, r.type) || biomeDef.imagePrompts.atmosphere,
    populated: false,
  }));
  await db.mapRoom.createMany({ data });
  const saved = await db.mapRoom.findMany({ where: { roomId }, orderBy: [{ y: "asc" }, { x: "asc" }] });

  // Set the room's currentMapX/Y to the entrance (so the party starts there).
  if (entrance) {
    await db.room.update({
      where: { id: roomId },
      data: { currentMapX: entrance.x, currentMapY: entrance.y },
    });
  }

  invalidateSnapshotCache(roomId);
  return saved.map(toMapRoomState);
}

/** Wipe all MapRoom + Trap + ground-loot rows for a room. Used by the
 *  /api/game/new-dungeon route to regenerate the dungeon from scratch. */
export async function wipeDungeon(roomId: string): Promise<void> {
  await db.trap.deleteMany({ where: { roomId } });
  await db.mapRoom.deleteMany({ where: { roomId } });
  await db.inventoryItem.deleteMany({ where: { roomId, playerName: "__ground__" } });
  invalidateSnapshotCache(roomId);
}

/** Get every map room for the room (discovered AND undiscovered). */
export async function getMap(roomId: string): Promise<MapRoomState[]> {
  const list = await db.mapRoom.findMany({ where: { roomId }, orderBy: [{ y: "asc" }, { x: "asc" }] });
  return list.map(toMapRoomState);
}

/** Return only discovered rooms (what the player sees). Secret rooms are kept
 *  in the snapshot so the frontend can render the star icon on them. */
export async function getDiscoveredMap(roomId: string): Promise<MapRoomState[]> {
  const list = await db.mapRoom.findMany({ where: { roomId, discovered: true }, orderBy: [{ y: "asc" }, { x: "asc" }] });
  const discovered = new Set(list.map((r) => `${r.x},${r.y}`));
  return list.map((r) => {
    const full = toMapRoomState(r);
    return {
      ...full,
      connections: full.connections.filter((c) => discovered.has(`${c.x},${c.y}`)),
    };
  });
}

/** Mark a specific room as discovered by (x, y). Returns the discovered room or null.
 *  Also stamps `populated=false` so the move-room route will trigger content
 *  population on first visit. */
export async function discoverRoom(roomId: string, x: number, y: number): Promise<MapRoomState | null> {
  const r = await db.mapRoom.findFirst({ where: { roomId, x, y } });
  if (!r) return null;
  if (!r.discovered) {
    await db.mapRoom.update({ where: { id: r.id }, data: { discovered: true } });
  }
  // Update the room's current map position.
  await db.room.update({ where: { id: roomId }, data: { currentMapX: x, currentMapY: y } });
  invalidateSnapshotCache(roomId);
  const refreshed = await db.mapRoom.findUnique({ where: { id: r.id } });
  return refreshed ? toMapRoomState(refreshed) : null;
}

/** Reveal a secret room: marks discovered=true AND bidirectionally connects
 *  it to `fromX,fromY` (the room the party was standing in when the Perception
 *  check succeeded). Returns the revealed secret room or null. */
export async function revealSecretRoom(
  roomId: string,
  secretX: number,
  secretY: number,
  fromX: number,
  fromY: number
): Promise<MapRoomState | null> {
  const secret = await db.mapRoom.findFirst({ where: { roomId, x: secretX, y: secretY, secret: true } });
  if (!secret) return null;
  const from = await db.mapRoom.findFirst({ where: { roomId, x: fromX, y: fromY } });
  if (!from) return null;

  // Add bidirectional connection.
  const secretConns = (secret.connections ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!secretConns.includes(`${fromX}:${fromY}`)) {
    secretConns.push(`${fromX}:${fromY}`);
  }
  const fromConns = (from.connections ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!fromConns.includes(`${secretX}:${secretY}`)) {
    fromConns.push(`${secretX}:${secretY}`);
  }
  await db.mapRoom.update({
    where: { id: secret.id },
    data: { discovered: true, connections: secretConns.join(",") },
  });
  await db.mapRoom.update({
    where: { id: from.id },
    data: { connections: fromConns.join(",") },
  });
  invalidateSnapshotCache(roomId);
  const refreshed = await db.mapRoom.findUnique({ where: { id: secret.id } });
  return refreshed ? toMapRoomState(refreshed) : null;
}

/** True if (x, y) is a discovered neighbour of the party's current position
 *  (so the move is legal). Secret rooms are reachable only after their
 *  discovery flips discovered=true and adds them to the connections list. */
export async function isReachableFromCurrent(roomId: string, x: number, y: number): Promise<boolean> {
  const room = await db.room.findUnique({ where: { id: roomId } });
  if (!room) return false;
  const cur = await db.mapRoom.findFirst({ where: { roomId, x: room.currentMapX, y: room.currentMapY } });
  if (!cur) return false;
  const conns = (cur.connections ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return conns.some((c) => {
    const [cx, cy] = c.split(":").map((n) => Number(n));
    return cx === x && cy === y;
  });
}

/** Get the party's current map position. */
export async function getCurrentMapPos(roomId: string): Promise<{ x: number; y: number } | null> {
  const room = await db.room.findUnique({ where: { id: roomId }, select: { currentMapX: true, currentMapY: true } });
  if (!room || room.currentMapX < 0 || room.currentMapY < 0) return null;
  return { x: room.currentMapX, y: room.currentMapY };
}

/** Mark a MapRoom as populated (so we don't re-spawn monsters / loot on revisit). */
export async function markRoomPopulated(roomId: string, x: number, y: number): Promise<void> {
  await db.mapRoom.updateMany({
    where: { roomId, x, y },
    data: { populated: true },
  });
  invalidateSnapshotCache(roomId);
}

/** Find any secret rooms whose (x, y) is Chebyshev-adjacent (≤2) to (x, y)
 *  and still undiscovered. Used by the Perception check in move-room. */
export async function findAdjacentSecretRooms(
  roomId: string,
  x: number,
  y: number
): Promise<MapRoomState[]> {
  const all = await db.mapRoom.findMany({ where: { roomId, secret: true, discovered: false } });
  return all
    .filter((r) => Math.max(Math.abs(r.x - x), Math.abs(r.y - y)) <= 2)
    .map(toMapRoomState);
}
