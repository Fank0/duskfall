import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getSnapshot,
  saveChatMessage,
  setActiveScene,
  invalidateSnapshotCache,
} from "@/lib/game/state";
import { generateDungeonMap, wipeDungeon } from "@/lib/game/world-map";
import { getBiome, randomBiomeId, type DungeonBiomeId } from "@/lib/game/dungeon-biomes";
import { validatePlayerName, validateRoomCode, sanitizeString } from "@/lib/game/validate";

export const dynamic = "force-dynamic";

/** POST /api/game/new-dungeon
 * Body: { roomCode, playerName, biome? }
 *
 * Regenerates the dungeon map for the room:
 *   1. Wipes all MapRoom + Trap + ground-loot rows.
 *   2. Either picks the requested biome (validated) or increments the room's
 *      depth and rolls a fresh random biome.
 *   3. Calls generateDungeonMap to lay down a new BSP dungeon.
 *   4. Posts a DM chat message announcing the new dungeon.
 *   5. Resets dungeonCleared=false on the room.
 *
 * Returns { ok, snapshot, biome, depth }.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const roomCodeRaw = (body?.roomCode ?? "").toString();
    const playerNameRaw = (body?.playerName ?? "").toString();
    const biomeRaw = (body?.biome ?? "").toString();

    const roomCodeError = validateRoomCode(roomCodeRaw);
    if (roomCodeError) {
      return NextResponse.json({ ok: false, error: roomCodeError }, { status: 400 });
    }
    const playerNameError = validatePlayerName(playerNameRaw);
    if (playerNameError) {
      return NextResponse.json({ ok: false, error: playerNameError }, { status: 400 });
    }

    const roomCode = roomCodeRaw.toUpperCase().trim();
    const playerName = playerNameRaw.trim().replace(/\s+/g, " ").slice(0, 20);

    const room = await db.room.findUnique({ where: { code: roomCode } });
    if (!room) {
      return NextResponse.json({ ok: false, error: "Комната не найдена." }, { status: 404 });
    }
    if (room.combatActive) {
      return NextResponse.json(
        { ok: false, error: "Сначала завершите бой." },
        { status: 400 }
      );
    }

    // Verify the player exists + is the host (only the host can regenerate the
    // dungeon).
    const player = await db.player.findFirst({ where: { name: playerName, roomId: room.id } });
    if (!player) {
      return NextResponse.json({ ok: false, error: "Герой не найден." }, { status: 404 });
    }
    if (!player.isHost) {
      return NextResponse.json(
        { ok: false, error: "Только хозяин комнаты может начать новое подземелье." },
        { status: 403 }
      );
    }

    // Determine the new biome + depth.
    let biomeId: DungeonBiomeId;
    if (biomeRaw) {
      const cleaned = sanitizeString(biomeRaw).toLowerCase();
      const valid: DungeonBiomeId[] = ["catacombs", "caves", "tower", "forest", "dungeon"];
      if (!valid.includes(cleaned as DungeonBiomeId)) {
        return NextResponse.json(
          { ok: false, error: "Неизвестный биом. Доступны: catacombs, caves, tower, forest, dungeon." },
          { status: 400 }
        );
      }
      biomeId = cleaned as DungeonBiomeId;
    } else {
      // No explicit biome: pick a fresh random one + increment depth.
      biomeId = randomBiomeId();
    }
    const newDepth = Math.min(5, (room.dungeonDepth ?? 1) + 1);

    // Wipe the old dungeon + ground loot + traps.
    await wipeDungeon(room.id);
    // Also clear leftover inactive monsters from the previous dungeon
    // (active ones belong to in-progress combat which we've blocked above).
    await db.monster.deleteMany({ where: { roomId: room.id, isActive: false } });

    // Reset dungeonCleared=false on the room BEFORE generateDungeonMap so the
    // snapshot reflects the fresh state.
    await db.room.update({
      where: { id: room.id },
      data: { dungeonCleared: false, dungeonDepth: newDepth, dungeonBiome: biomeId },
    });

    // Generate the new BSP dungeon.
    const mapRooms = await generateDungeonMap(room.id, newDepth, biomeId);

    // Set the active scene to the new biome's atmosphere prompt.
    const biomeDef = getBiome(biomeId);
    await setActiveScene(room.id, "/scenes/forest-ruins.png", biomeDef.imagePrompts.atmosphere, biomeDef.name);

    // DM chat announcement.
    await saveChatMessage(
      room.id,
      "dm",
      "",
      `Открывается новый уровень подземелья: «${biomeDef.name}» (глубина ${newDepth}). ${biomeDef.description} Вход открыт — исследуйте!`,
      room.round
    );
    invalidateSnapshotCache(room.id);

    const snapshot = await getSnapshot(roomCode);
    return NextResponse.json({
      ok: true,
      snapshot,
      biome: biomeId,
      depth: newDepth,
      mapRooms,
    });
  } catch (e: any) {
    console.error("[api/game/new-dungeon] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Ошибка генерации нового подземелья." },
      { status: 500 }
    );
  }
}
