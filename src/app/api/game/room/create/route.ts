import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createRoomWithHost } from "@/lib/game/seed";
import { getPreset } from "@/lib/game/presets";
import { getSnapshot } from "@/lib/game/state";

export const dynamic = "force-dynamic";

// POST /api/game/room/create
// Body: { playerName: string, classId: string }
// Creates a new room with the caller as host, returns room code + snapshot.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const playerName = (body?.playerName ?? "").toString().trim().slice(0, 24);
    const classId = (body?.classId ?? "fighter").toString();
    if (!playerName) {
      return NextResponse.json({ ok: false, error: "Введите имя героя." }, { status: 400 });
    }
    const preset = getPreset(classId);

    const { roomCode } = await createRoomWithHost({
      name: playerName,
      preset,
      isHost: true,
      positionIndex: 0,
      portraitUrl: null,
    });

    const snapshot = await getSnapshot(roomCode);
    return NextResponse.json({ ok: true, roomCode, snapshot, youAre: playerName });
  } catch (e: any) {
    console.error("[api/game/room/create] error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Не удалось создать комнату." }, { status: 500 });
  }
}
