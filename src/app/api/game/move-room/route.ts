import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getSnapshot,
  saveChatMessage,
  setActiveScene,
  setRoomState,
} from "@/lib/game/state";
import {
  discoverRoom,
  isReachableFromCurrent,
  getCurrentMapPos,
} from "@/lib/game/world-map";
import { rollEncounter, logEncounter } from "@/lib/game/encounters";
import { validatePlayerName, validateRoomCode } from "@/lib/game/validate";

export const dynamic = "force-dynamic";

const TYPE_PROMPT: Record<string, string> = {
  entrance:
    "Dark fantasy dungeon entrance, stone archway, flickering torch, mist, ominous painterly concept art",
  combat:
    "Dark fantasy battle chamber, scattered bones, broken weapons, bloodstains, ominous shadows, painterly concept art",
  loot:
    "Dark fantasy treasure chamber, dusty chests, glimmering gold, cobwebs, candlelight, painterly concept art",
  npc:
    "Dark fantasy hermit camp inside a dungeon, small fire, ragged bedroll, hooded figure, painterly concept art",
  puzzle:
    "Dark fantasy puzzle room, glowing runes on walls, stone pedestal, mysterious mechanism, painterly concept art",
  safe:
    "Dark fantasy safe refuge inside a dungeon, warm campfire, straw bedrolls, calm atmosphere, painterly concept art",
  boss:
    "Dark fantasy boss lair, enormous throne of bone, dark altar, heavy shadows, looming threat, painterly concept art",
};

/** POST /api/game/move-room
 * Body: { roomCode, x, y, playerName }
 * Discovers the target room (must be a connected neighbour of the current
 * position), updates Room.location, writes a DM narrative line, and kicks off
 * a background scene-image generation. Random encounters (Пункт 11) are
 * applied separately by encounters.ts and integrated in that item. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const roomCodeRaw = (body?.roomCode ?? "").toString();
    const x = Number(body?.x);
    const y = Number(body?.y);
    const playerNameRaw = (body?.playerName ?? "").toString();

    // ===== Validation (item 26) =====
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

    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      return NextResponse.json(
        { ok: false, error: "Укажите координаты." },
        { status: 400 }
      );
    }
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
    // Verify the player exists in the room (light check).
    if (playerName) {
      const player = await db.player.findFirst({ where: { name: playerName, roomId: room.id } });
      if (!player) {
        return NextResponse.json({ ok: false, error: "Герой не найден." }, { status: 404 });
      }
      if (!player.isAlive || player.hp <= 0) {
        return NextResponse.json(
          { ok: false, error: "Павший герой не может идти." },
          { status: 400 }
        );
      }
    }

    const currentPos = await getCurrentMapPos(room.id);
    const sameSpot = currentPos && currentPos.x === x && currentPos.y === y;
    if (sameSpot) {
      return NextResponse.json(
        { ok: false, error: "Вы уже здесь." },
        { status: 400 }
      );
    }

    // Must be reachable from current position (connected neighbour).
    const reachable = await isReachableFromCurrent(room.id, x, y);
    if (!reachable) {
      return NextResponse.json(
        { ok: false, error: "Эта комната не соединена с вашей текущей позицией." },
        { status: 400 }
      );
    }

    // Discover the target room (idempotent).
    const target = await discoverRoom(room.id, x, y);
    if (!target) {
      return NextResponse.json(
        { ok: false, error: "Комната не найдена на карте." },
        { status: 404 }
      );
    }

    // Update room.location to the new room's label.
    await setRoomState(room.id, { location: target.label });

    // Persist a DM narrative line about the move.
    const desc = target.description ? ` ${target.description}` : "";
    await saveChatMessage(
      room.id,
      "dm",
      "",
      `Вы входите в «${target.label}».${desc}`,
      room.round
    );

    // Build a scene prompt for the new room type. The actual image is
    // generated asynchronously by the client (which calls /api/game/image)
    // OR the next DM action — we set the new scene immediately with a
    // placeholder prompt so the caption updates.
    const prompt = TYPE_PROMPT[target.roomType] ?? TYPE_PROMPT.combat;
    await setActiveScene(room.id, "/scenes/forest-ruins.png", prompt, target.label);

    // ===== Random encounter (Пункт 11) =====
    // Compute the party's average level (alive players) for encounter scaling.
    const players = await db.player.findMany({ where: { roomId: room.id, isAlive: true } });
    const alivePlayers = players.filter((p) => p.hp > 0);
    const avgLevel =
      alivePlayers.length > 0
        ? Math.round(alivePlayers.reduce((s, p) => s + p.level, 0) / alivePlayers.length)
        : 1;
    // Force a combat encounter for combat/boss rooms; otherwise roll 40%.
    const forceType =
      target.roomType === "boss" || target.roomType === "combat"
        ? ("combat" as const)
        : undefined;
    const encounter = await rollEncounter(room.id, avgLevel, room.round, { forceType });
    await logEncounter(room.id, room.round, encounter);

    const snapshot = await getSnapshot(roomCode);
    return NextResponse.json({
      ok: true,
      snapshot,
      room: { x: target.x, y: target.y, label: target.label, roomType: target.roomType },
      // Return the discovered-only map view as well (for client convenience).
      discovered: snapshot?.mapRooms ?? [],
      encounter: encounter.type,
    });
  } catch (e: any) {
    console.error("[api/game/move-room] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Ошибка перемещения." },
      { status: 500 }
    );
  }
}
