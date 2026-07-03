import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { applyLevelUpTalent, applyLevelUpASI, getSnapshot } from "@/lib/game/state";
import { getTalentsForClass, getASITalents } from "@/lib/game/talents";
import { getClassIdByCharClass } from "@/lib/game/presets";
import type { StatKey } from "@/lib/game/types";

export const dynamic = "force-dynamic";

// POST /api/game/levelup
// Body (talent pick): { roomCode, playerName, talentId }
// Body (ASI pick):    { roomCode, playerName, type: "asi", stat: "str"|"dex"|... }
// Records the chosen talent/ASI on level-up and clears the relevant pending flag.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const roomCode = (body?.roomCode ?? "").toString().toUpperCase().trim();
    const playerName = (body?.playerName ?? "").toString().trim();
    if (!roomCode || !playerName) {
      return NextResponse.json({ ok: false, error: "Укажите комнату и героя." }, { status: 400 });
    }
    const room = await db.room.findUnique({ where: { code: roomCode } });
    if (!room) return NextResponse.json({ ok: false, error: "Комната не найдена." }, { status: 404 });

    const snap = await getSnapshot(roomCode);
    if (!snap) return NextResponse.json({ ok: false, error: "Комната не найдена." }, { status: 404 });
    const me = snap.players.find((p) => p.name === playerName);
    if (!me) return NextResponse.json({ ok: false, error: "Герой не найден." }, { status: 404 });

    // === ASI pick branch ===
    if (body?.type === "asi") {
      const stat = (body?.stat ?? "").toString().trim() as StatKey;
      const valid: StatKey[] = ["str", "dex", "con", "int", "wis", "cha"];
      if (!valid.includes(stat)) {
        return NextResponse.json({ ok: false, error: "Неверная характеристика для ASI." }, { status: 400 });
      }
      if (!me.pendingASI) {
        return NextResponse.json({ ok: false, error: "ASI не доступен." }, { status: 400 });
      }
      const applied = await applyLevelUpASI(room.id, playerName, stat);
      if (!applied) {
        return NextResponse.json({ ok: false, error: "Не удалось применить ASI." }, { status: 400 });
      }
      const asiName = getASITalents().find((t) => (t.effect as any).stat === stat)?.name ?? `ASI ${stat}`;
      await db.chatMessage.create({
        data: {
          roomId: room.id,
          role: "system",
          speaker: "",
          round: snap.round,
          content: `${playerName} улучшает характеристику: ${asiName}!`,
        },
      });
      const snapshot = await getSnapshot(roomCode);
      return NextResponse.json({ ok: true, snapshot, asi: { stat } });
    }

    // === Talent pick branch ===
    const talentId = (body?.talentId ?? "").toString().trim();
    if (!talentId) {
      return NextResponse.json({ ok: false, error: "Укажите талант или ASI." }, { status: 400 });
    }
    const pool = getTalentsForClass(getClassIdByCharClass(me.charClass));
    const talent = pool.find((t) => t.id === talentId);
    if (!talent) return NextResponse.json({ ok: false, error: "Талант недоступен для этого класса." }, { status: 400 });
    if (me.selectedTalents.includes(talentId)) {
      return NextResponse.json({ ok: false, error: "Этот талант уже выбран." }, { status: 400 });
    }
    // Prerequisite check (tier-2 talents require their tier-1 parent).
    if (talent.requires && !me.selectedTalents.includes(talent.requires)) {
      const reqTalent = pool.find((t) => t.id === talent.requires);
      return NextResponse.json(
        { ok: false, error: `Требуется талант: «${reqTalent?.name ?? talent.requires}».` },
        { status: 400 }
      );
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
