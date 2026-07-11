import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { applyLevelUpTalent, applyLevelUpASI, getSnapshot, invalidateSnapshotCache } from "@/lib/game/state";
import { getTalentsForClass, getASITalents } from "@/lib/game/talents";
import { getClassIdByCharClass } from "@/lib/game/presets";
import type { StatKey } from "@/lib/game/types";
import { getAccountFromRequest } from "@/lib/auth/get-account";
import { bumpSaveSlotLevel } from "@/lib/auth/save-slot";
import { logger } from "@/lib/game/logger";
import { pushStateChange } from "@/lib/realtime";

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
      invalidateSnapshotCache(room.id);
      const snapshot = await getSnapshot(roomCode);
      // ===== Save-slot bump (auth-restore) =====
      // If the requester is authenticated, mirror the new level onto any
      // SaveSlots pointing at this (account, room, player).
      await maybeBumpSaveSlot(req, room.id, me.id, snapshot);
      // E1: push state:changed so other clients see the new ASI-modified
      // stats and the cleared pendingASI flag.
      pushStateChange(roomCode);
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
    invalidateSnapshotCache(room.id);

    const snapshot = await getSnapshot(roomCode);
    // ===== Save-slot bump (auth-restore) =====
    await maybeBumpSaveSlot(req, room.id, me.id, snapshot);
    // E1: push state:changed so other clients see the new talent, the
    // levelled-up HP / proficiency, and the cleared pendingLevelUp flag.
    pushStateChange(roomCode);
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

/**
 * If the requester is authenticated, find the refreshed player row in the
 * snapshot and bump charLevel + lastPlayed on every SaveSlot owned by the
 * account that points at this room+player. Swallows errors so a failed
 * slot bump never breaks the level-up flow.
 */
async function maybeBumpSaveSlot(
  req: NextRequest,
  roomId: string,
  playerId: string,
  snapshot: Awaited<ReturnType<typeof getSnapshot>>
) {
  try {
    const account = await getAccountFromRequest(req.headers.get("cookie"));
    if (!account) return;
    if (!snapshot) return;
    const player = snapshot.players.find((p) => p.id === playerId);
    if (!player) return;
    await bumpSaveSlotLevel({
      accountId: account.id,
      roomId,
      playerId,
      newLevel: player.level,
    });
  } catch (e) {
    logger.warn("save-slot level bump failed", {
      roomId,
      playerId,
      err: (e as Error)?.message?.slice(0, 100),
    });
  }
}

// ===== D&D 5e (V2 C1): Multiclassing — pick a new class on level up. =====
// POST /api/game/levelup with { roomCode, playerName, type: "multiclass", newClass: "Wizard" }
// Adds the new class to classLevelsJson and updates charClass for display.
export async function multiclassLevelUp(
  roomId: string,
  playerName: string,
  newClass: string
): Promise<boolean> {
  const p = await db.player.findFirst({ where: { name: playerName, roomId } });
  if (!p) return false;
  // Parse existing multiclass levels.
  let levels: Record<string, number> = {};
  try { levels = JSON.parse(p.classLevelsJson || "{}"); } catch {}
  // Add 1 level to the new class.
  levels[newClass] = (levels[newClass] || 0) + 1;
  // Update charClass to the new class if it's the highest level.
  const sorted = Object.entries(levels).sort((a, b) => b[1] - a[1]);
  const primaryClass = sorted[0]?.[0] || p.charClass;
  await db.player.update({
    where: { id: p.id },
    data: {
      classLevelsJson: JSON.stringify(levels),
      charClass: primaryClass,
      pendingLevelUp: false,
    },
  });
  invalidateSnapshotCache(roomId);
  return true;
}
