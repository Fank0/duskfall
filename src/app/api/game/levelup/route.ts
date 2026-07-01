import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { applyLevelUpTalent, getSnapshot } from "@/lib/game/state";
import { getTalentsForClass } from "@/lib/game/talents";
import { getClassIdByCharClass } from "@/lib/game/presets";

export const dynamic = "force-dynamic";

// POST /api/game/levelup
// Body: { roomCode, playerName, talentId }
// Records the chosen talent on level-up and clears the pending flag.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const roomCode = (body?.roomCode ?? "").toString().toUpperCase().trim();
    const playerName = (body?.playerName ?? "").toString().trim();
    const talentId = (body?.talentId ?? "").toString().trim();
    if (!roomCode || !playerName || !talentId) {
      return NextResponse.json({ ok: false, error: "Укажите комнату, героя и талант." }, { status: 400 });
    }
    const room = await db.room.findUnique({ where: { code: roomCode } });
    if (!room) return NextResponse.json({ ok: false, error: "Комната не найдена." }, { status: 404 });

    const snap = await getSnapshot(roomCode);
    if (!snap) return NextResponse.json({ ok: false, error: "Комната не найдена." }, { status: 404 });
    const me = snap.players.find((p) => p.name === playerName);
    if (!me) return NextResponse.json({ ok: false, error: "Герой не найден." }, { status: 404 });

    const pool = getTalentsForClass(getClassIdByCharClass(me.charClass));
    const talent = pool.find((t) => t.id === talentId);
    if (!talent) return NextResponse.json({ ok: false, error: "Талант недоступен для этого класса." }, { status: 400 });
    if (me.selectedTalents.includes(talentId)) {
      return NextResponse.json({ ok: false, error: "Этот талант уже выбран." }, { status: 400 });
    }

    const applied = await applyLevelUpTalent(room.id, playerName, talentId);
    if (!applied) {
      return NextResponse.json({ ok: false, error: "Повышение уровня не доступно." }, { status: 400 });
    }
    await db.chatMessage.create({
      data: {
        roomId: room.id,
        role: "system",
        speaker: "",
        round: snap.round,
        content: `${playerName} получает новый талант: «${talent.name}»!`,
      },
    });

    const snapshot = await getSnapshot(roomCode);
    return NextResponse.json({
      ok: true,
      snapshot,
      talent: { id: talent.id, name: talent.name, description: talent.description },
    });
  } catch (e: any) {
    console.error("[api/game/levelup] error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Ошибка повышения уровня." }, { status: 500 });
  }
}
