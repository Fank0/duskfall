// Procedural dungeon-map generator (BSP-ish) + persistence helpers.
//
// The map is a small grid of rooms (6-12) connected as an undirected graph.
// One room is the "entrance" (discovered = true, where the party starts);
// every other room starts hidden until the party moves into it.

import { db } from "@/lib/db";
import { invalidateSnapshotCache } from "./state";
import type { MapRoomState, MapRoomType } from "./types";

// ---------- RNG helpers ----------
function rnd(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}
function pick<T>(arr: T[]): T {
  return arr[rnd(arr.length)];
}

// ---------- Room-type distribution ----------
// (combat 30%, loot 20%, npc 15%, puzzle 10%, safe 15%, boss 10%)
// Boss is assigned separately (the furthest room from the entrance), so the
// weights below exclude boss.
const TYPE_WEIGHTS: { type: MapRoomType; w: number }[] = [
  { type: "combat", w: 30 },
  { type: "loot", w: 20 },
  { type: "npc", w: 15 },
  { type: "puzzle", w: 10 },
  { type: "safe", w: 15 },
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

const ROOM_LABELS: Record<MapRoomType, string[]> = {
  entrance: ["Вход в подземелье", "Тёмный проход", "Расщелина у скалы"],
  combat: ["Тёмный зал", "Зал эха", "Костяная комната", "Зала теней", "Кровавый коридор"],
  loot: ["Забытая кладовая", "Сундучная", "Камора сокровищ", "Руины склада"],
  npc: ["Убежище отшельника", "Лагерь странника", "Келья жреца", "Тайная комната"],
  puzzle: ["Зал рун", "Комната загадок", "Резная зала", "Зеркальный зал"],
  safe: ["Укрытие", "Тихая часовня", "Поляна отдыха", "Зал костра"],
  boss: ["Тронный зал", "Логово", "Сердце подземелья", "Чёрный алтарь"],
};

const ROOM_DESCS: Record<MapRoomType, string[]> = {
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
};

// ---------- Graph generation ----------
// We scatter rooms on a coarse grid so coordinates stay readable and the
// SVG layout works on any screen size. Grid is 5x4 (max 20 cells, we use 6-12).
const GRID_W = 5;
const GRID_H = 4;

interface RawRoom {
  x: number;
  y: number;
  type: MapRoomType;
  label: string;
  description: string;
  connections: { x: number; y: number }[];
}

/** Generate a procedural dungeon map. Returns the room list (NOT yet persisted).
 *  Caller is responsible for inserting rows (so we keep this pure / testable). */
export function generateDungeonMapData(depth = 1): Omit<RawRoom, "connections">[] & {
  connections?: never;
} {
  // depth is reserved for future scaling of monster difficulty / loot.
  void depth;
  const count = 6 + rnd(7); // 6..12
  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      cells.push({ x, y });
    }
  }
  // Shuffle the cells (Fisher-Yates) and take the first `count`.
  for (let i = cells.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const chosen = cells.slice(0, count);

  // Pick the entrance: the cell with the lowest (x+y) — feels like an "edge".
  chosen.sort((a, b) => a.x + a.y - (b.x + b.y));
  const entrance = chosen[0];
  // Boss: the cell furthest from the entrance (Chebyshev).
  let boss = chosen[1];
  let bestDist = -1;
  for (const c of chosen.slice(1)) {
    const d = Math.max(Math.abs(c.x - entrance.x), Math.abs(c.y - entrance.y));
    if (d > bestDist) {
      bestDist = d;
      boss = c;
    }
  }

  // Assign types: entrance/boss explicitly, others random.
  const rooms: Omit<RawRoom, "connections">[] = chosen.map((c) => {
    let type: MapRoomType;
    if (c.x === entrance.x && c.y === entrance.y) type = "entrance";
    else if (c.x === boss.x && c.y === boss.y) type = "boss";
    else type = rollRoomType();
    return {
      x: c.x,
      y: c.y,
      type,
      label: pick(ROOM_LABELS[type]),
      description: pick(ROOM_DESCS[type]),
    };
  });

  // Fisher-Yates is fine here. Cast to satisfy TS (we attach connections later).
  return rooms as Omit<RawRoom, "connections">[] & { connections?: never };
}

/** Build a connected graph of rooms: every room has 1-3 neighbours, and the
 *  overall graph is connected (every room reachable from the entrance).
 *  Mutates the rooms array by populating `connections`. */
function connectRooms(rooms: RawRoom[]): void {
  // First, build a spanning tree from the entrance using nearest-neighbour
  // greedy insertion (Primm-style on Chebyshev distance).
  const inTree = new Set<string>();
  const key = (r: { x: number; y: number }) => `${r.x},${r.y}`;
  const byKey = new Map<string, RawRoom>();
  for (const r of rooms) byKey.set(key(r), r);

  const entrance = rooms.find((r) => r.type === "entrance") ?? rooms[0];
  inTree.add(key(entrance));

  while (inTree.size < rooms.length) {
    let bestPair: { a: RawRoom; b: RawRoom; d: number } | null = null;
    for (const a of rooms) {
      if (!inTree.has(key(a))) continue;
      for (const b of rooms) {
        if (inTree.has(key(b))) continue;
        const d = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
        if (!bestPair || d < bestPair.d) bestPair = { a, b, d };
      }
    }
    if (!bestPair) break;
    // Connect a <-> b.
    bestPair.a.connections.push({ x: bestPair.b.x, y: bestPair.b.y });
    bestPair.b.connections.push({ x: bestPair.a.x, y: bestPair.a.y });
    inTree.add(key(bestPair.b));
  }

  // Add a few extra random edges (each room gets up to 3 connections total).
  for (const r of rooms) {
    const want = 1 + rnd(3); // 1..3
    let attempts = 0;
    while (r.connections.length < want && attempts++ < 12) {
      // Find a random other room that is a near neighbour (Chebyshev <= 2).
      const candidates = rooms.filter(
        (o) =>
          o !== r &&
          Math.max(Math.abs(o.x - r.x), Math.abs(o.y - r.y)) <= 2 &&
          !r.connections.some((c) => c.x === o.x && c.y === o.y)
      );
      if (candidates.length === 0) break;
      const o = pick(candidates);
      r.connections.push({ x: o.x, y: o.y });
      if (!o.connections.some((c) => c.x === r.x && c.y === r.y)) {
        o.connections.push({ x: r.x, y: r.y });
      }
    }
  }
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
  };
}

/** Generate a dungeon map for a room AND persist it as MapRoom rows.
 *  Returns the persisted rooms. Idempotent: if the room already has map rows,
 *  returns them without regenerating. */
export async function generateDungeonMap(roomId: string, depth = 1): Promise<MapRoomState[]> {
  const existing = await db.mapRoom.findMany({ where: { roomId } });
  if (existing.length > 0) return existing.map(toMapRoomState);

  const base = generateDungeonMapData(depth);
  // Build full RawRoom objects with empty connections.
  const rooms: RawRoom[] = base.map((r) => ({
    x: r.x,
    y: r.y,
    type: r.type,
    label: r.label,
    description: r.description,
    connections: [],
  }));
  connectRooms(rooms);

  // Identify the entrance (discovered = true; the party starts here).
  const entrance = rooms.find((r) => r.type === "entrance");
  const data = rooms.map((r) => ({
    roomId,
    x: r.x,
    y: r.y,
    label: r.label,
    roomType: r.type,
    discovered: r.type === "entrance",
    connections: r.connections.map((c) => `${c.x}:${c.y}`).join(","),
    description: r.description,
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

  return saved.map(toMapRoomState);
}

/** Get every map room for the room (discovered AND undiscovered).
 *  The frontend filters down to discovered-only. */
export async function getMap(roomId: string): Promise<MapRoomState[]> {
  const list = await db.mapRoom.findMany({ where: { roomId }, orderBy: [{ y: "asc" }, { x: "asc" }] });
  return list.map(toMapRoomState);
}

/** Return only discovered rooms (what the player sees). */
export async function getDiscoveredMap(roomId: string): Promise<MapRoomState[]> {
  const list = await db.mapRoom.findMany({ where: { roomId, discovered: true }, orderBy: [{ y: "asc" }, { x: "asc" }] });
  // Only keep connections that lead to other discovered rooms (no spoilers).
  const discovered = new Set(list.map((r) => `${r.x},${r.y}`));
  return list.map((r) => {
    const full = toMapRoomState(r);
    return {
      ...full,
      connections: full.connections.filter((c) => discovered.has(`${c.x},${c.y}`)),
    };
  });
}

/** Mark a specific room as discovered by (x, y). Returns the discovered room or null. */
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

/** True if (x, y) is a discovered neighbour of the party's current position. */
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
