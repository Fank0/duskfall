import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { joinRoomAsPlayer } from "@/lib/game/seed";
import { getPreset, getRace, getBackground } from "@/lib/game/presets";
import { getSnapshot, getRoomByCode } from "@/lib/game/state";

export const dynamic = "force-dynamic";

// POST /api/game/room/join
// Body: { roomCode, playerName, classId, raceId, backgroundId }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const roomCode = (body?.roomCode ?? "").toString().toUpperCase().trim();
    const playerName = (body?.playerName ?? "").toString().trim().slice(0, 24);
    const classId = (body?.classId ?? "fighter").toString();
    const raceId = (body?.raceId ?? "human").toString();
    const backgroundId = (body?.backgroundId ?? "soldier").toString();
    if (!roomCode || !playerName) {
      return NextResponse.json({ ok: false, error: "Укажите код комнаты и имя героя." }, { status: 400 });
    }
    const room = await getRoomByCode(roomCode);
    if (!room) {
      return NextResponse.json({ ok: false, error: "Комната не найдена. Проверьте код." }, { status: 404 });
    }
    if (room.combatActive) {
      return NextResponse.json({ ok: false, error: "Нельзя присоединиться во время боя." }, { status: 400 });
    }
    const existing = await db.player.findFirst({ where: { name: playerName, roomId: room.id } });
    if (existing) {
      return NextResponse.json({ ok: false, error: "Герой с таким именем уже в комнате." }, { status: 400 });
    }
    const preset = getPreset(classId);
    const race = getRace(raceId);
    const background = getBackground(backgroundId);
    const playerCount = await db.player.count({ where: { roomId: room.id } });
    await joinRoomAsPlayer(room.id, {
      name: playerName,
      preset,
      race,
      background,
      isHost: false,
      positionIndex: playerCount,
      portraitUrl: null,
    });

    const snapshot = await getSnapshot(roomCode);
    return NextResponse.json({ ok: true, roomCode, snapshot, youAre: playerName });
  } catch (e: any) {
    console.error("[api/game/room/join] error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Не удалось войти в комнату." }, { status: 500 });
  }
}
