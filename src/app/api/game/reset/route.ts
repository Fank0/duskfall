import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSnapshot } from "@/lib/game/state";
import { seedRoomContent } from "@/lib/game/seed";
import { getPresetByCharClass, getRace, getBackground } from "@/lib/game/presets";

export const dynamic = "force-dynamic";

// POST /api/game/reset
// Body: { roomCode, playerName }
// Wipes the room and re-seeds, preserving the caller's race/class/background.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const roomCode = (body?.roomCode ?? "").toString().toUpperCase().trim();
    const playerName = (body?.playerName ?? "").toString().trim();
    if (!roomCode || !playerName) {
      return NextResponse.json({ ok: false, error: "Укажите комнату и героя." }, { status: 400 });
    }
    const room = await db.room.findUnique({ where: { code: roomCode } });
    if (!room) {
      return NextResponse.json({ ok: false, error: "Комната не найдена." }, { status: 404 });
    }
    // Read the caller's identity BEFORE deleting so we can rebuild them.
    const oldPlayer = await db.player.findFirst({ where: { name: playerName, roomId: room.id } });
    const preset = oldPlayer
      ? getPresetByCharClass(oldPlayer.charClass)
      : getPresetByCharClass("Fighter");
    const race = oldPlayer ? getRace(oldPlayer.race) : getRace("human");
    const background = oldPlayer ? getBackground(oldPlayer.background) : getBackground("soldier");

    // Delete the room (cascade clears everything) and recreate with the same code.
    await db.room.delete({ where: { id: room.id } });
    const newRoom = await db.room.create({
      data: {
        code: roomCode,
        hostName: playerName,
        combatActive: false,
        round: 0,
        location: "Туманный лес, опушка у древних руин",
        turnIndex: 0,
        introShown: false,
      },
    });
    await seedRoomContent(newRoom.id, {
      name: playerName,
      preset,
      race,
      background,
      isHost: true,
      positionIndex: 0,
      portraitUrl: oldPlayer?.portraitUrl ?? null,
    });

    const snapshot = await getSnapshot(roomCode);
    return NextResponse.json({ ok: true, snapshot });
  } catch (e: any) {
    console.error("[api/game/reset] error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
