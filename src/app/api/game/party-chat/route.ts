import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invalidateSnapshotCache } from "@/lib/game/state";
import { validatePlayerName, validateRoomCode } from "@/lib/game/validate";
import { pushStateChange } from "@/lib/realtime";

export const dynamic = "force-dynamic";

/** POST /api/game/party-chat
 * Body: { roomCode, playerName, message }
 *
 * D&D 5e Party Chat (MASTER-PLAN 5.6): players can talk to each other
 * (not just to the DM). Messages are stored with role="party" and shown
 * in a distinct color in the chat panel. Does NOT consume the player's turn.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const roomCodeRaw = (body?.roomCode ?? "").toString();
    const playerNameRaw = (body?.playerName ?? "").toString();
    const message = (body?.message ?? "").toString().trim().slice(0, 500);

    const roomCodeError = validateRoomCode(roomCodeRaw);
    if (roomCodeError) return NextResponse.json({ ok: false, error: roomCodeError }, { status: 400 });
    const playerNameError = validatePlayerName(playerNameRaw);
    if (playerNameError) return NextResponse.json({ ok: false, error: playerNameError }, { status: 400 });
    if (!message) return NextResponse.json({ ok: false, error: "Пустое сообщение." }, { status: 400 });

    const roomCode = roomCodeRaw.toUpperCase().trim();
    const playerName = playerNameRaw.trim().replace(/\s+/g, " ").slice(0, 20);

    const room = await db.room.findUnique({ where: { code: roomCode } });
    if (!room) return NextResponse.json({ ok: false, error: "Комната не найдена." }, { status: 404 });

    await db.chatMessage.create({
      data: {
        roomId: room.id,
        role: "party",
        speaker: playerName,
        content: message,
        round: room.round,
      },
    });
    invalidateSnapshotCache(room.id);
    // E1: push state:changed so other clients in the room immediately see
    // the new party chat message in their chat panel.
    pushStateChange(roomCode);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[api/game/party-chat] error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
