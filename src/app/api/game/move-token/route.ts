import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSnapshot, invalidateSnapshotCache, moveToken } from "@/lib/game/state";
import { validatePlayerName, validateRoomCode } from "@/lib/game/validate";

export const dynamic = "force-dynamic";

/** POST /api/game/move-token
 * Body: { roomCode, playerName, x, y }
 * Moves the player's token to (x, y) on the tactical grid.
 * Returns the updated snapshot.
 *
 * D&D 5e movement: each cell = 5 feet. Movement speed is derived from
 * the player's race/class (default 30 ft = 6 cells). Difficult terrain
 * costs 2x movement. The server validates the destination is within
 * the grid and the path is clear (no full_cover blocking).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const roomCodeRaw = (body?.roomCode ?? "").toString();
    const playerNameRaw = (body?.playerName ?? "").toString();
    const x = Number(body?.x);
    const y = Number(body?.y);

    const roomCodeError = validateRoomCode(roomCodeRaw);
    if (roomCodeError) return NextResponse.json({ ok: false, error: roomCodeError }, { status: 400 });
    const playerNameError = validatePlayerName(playerNameRaw);
    if (playerNameError) return NextResponse.json({ ok: false, error: playerNameError }, { status: 400 });

    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= 16 || y >= 16) {
      return NextResponse.json({ ok: false, error: "Неверные координаты." }, { status: 400 });
    }

    const roomCode = roomCodeRaw.toUpperCase().trim();
    const playerName = playerNameRaw.trim().replace(/\s+/g, " ").slice(0, 20);

    const room = await db.room.findUnique({ where: { code: roomCode } });
    if (!room) return NextResponse.json({ ok: false, error: "Комната не найдена." }, { status: 404 });

    const player = await db.player.findFirst({ where: { name: playerName, roomId: room.id } });
    if (!player) return NextResponse.json({ ok: false, error: "Герой не найден." }, { status: 404 });
    if (!player.isAlive || player.hp <= 0) {
      return NextResponse.json({ ok: false, error: "Павший герой не может двигаться." }, { status: 400 });
    }

    // Move the token (clamped to grid bounds by moveToken).
    await moveToken(room.id, playerName, x, y, true);
    invalidateSnapshotCache(room.id);

    const snapshot = await getSnapshot(roomCode);
    return NextResponse.json({ ok: true, snapshot });
  } catch (e: any) {
    console.error("[api/game/move-token] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Ошибка перемещения." },
      { status: 500 }
    );
  }
}
