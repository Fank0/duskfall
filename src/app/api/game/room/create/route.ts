import { NextRequest, NextResponse } from "next/server";
import { createRoomWithHost } from "@/lib/game/seed";
import { getPreset, getRace, getBackground } from "@/lib/game/presets";
import { getSnapshot } from "@/lib/game/state";

export const dynamic = "force-dynamic";

// POST /api/game/room/create
// Body: { playerName, classId, raceId, backgroundId }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const playerName = (body?.playerName ?? "").toString().trim().slice(0, 24);
    const classId = (body?.classId ?? "fighter").toString();
    const raceId = (body?.raceId ?? "human").toString();
    const backgroundId = (body?.backgroundId ?? "soldier").toString();
    const bonusStats = body?.bonusStats ?? { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
    if (!playerName) {
      return NextResponse.json({ ok: false, error: "Введите имя героя." }, { status: 400 });
    }
    const preset = getPreset(classId);
    const race = getRace(raceId);
    const background = getBackground(backgroundId);

    const { roomCode } = await createRoomWithHost({
      name: playerName,
      preset,
      race,
      background,
      isHost: true,
      positionIndex: 0,
      portraitUrl: null,
      bonusStats,
    });

    const snapshot = await getSnapshot(roomCode);
    return NextResponse.json({ ok: true, roomCode, snapshot, youAre: playerName });
  } catch (e: any) {
    console.error("[api/game/room/create] error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Не удалось создать комнату." }, { status: 500 });
  }
}
