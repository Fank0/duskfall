import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSnapshot, invalidateSnapshotCache } from "@/lib/game/state";
import {
  healPlayer,
  restoreAllSpellSlots,
  restoreSpellSlotsForShortRest,
} from "@/lib/game/state";
import { rollDice } from "@/lib/game/dice";
import { validatePlayerName, validateRoomCode } from "@/lib/game/validate";

export const dynamic = "force-dynamic";

/** BG3 mechanic: max 3 short rests between long rests. */
const MAX_SHORT_RESTS = 3;

/** POST /api/game/rest
 * Body: { roomCode, playerName, restType: "short" | "long" }
 * Short rest: roll hit dice, heal half; warlock slots restored. Max 3 between long rests (BG3).
 * Long rest: full HP, all slots restored, short-duration conditions cleared, reset short rest counter. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const roomCodeRaw = (body?.roomCode ?? "").toString();
    const playerNameRaw = (body?.playerName ?? "").toString();
    const restTypeRaw = (body?.restType ?? "short").toString().trim();

    // ===== Validation (item 26) =====
    const roomCodeError = validateRoomCode(roomCodeRaw);
    if (roomCodeError) return NextResponse.json({ ok: false, error: roomCodeError }, { status: 400 });
    const playerNameError = validatePlayerName(playerNameRaw);
    if (playerNameError) return NextResponse.json({ ok: false, error: playerNameError }, { status: 400 });

    const roomCode = roomCodeRaw.toUpperCase().trim();
    const playerName = playerNameRaw.trim().replace(/\s+/g, " ").slice(0, 20);
    const restType = restTypeRaw.toLowerCase() === "long" ? "long" : "short";

    const room = await db.room.findUnique({ where: { code: roomCode } });
    if (!room) {
      return NextResponse.json({ ok: false, error: "Комната не найдена." }, { status: 404 });
    }
    if (room.combatActive) {
      return NextResponse.json(
        { ok: false, error: "Нельзя отдыхать в бою." },
        { status: 400 }
      );
    }
    const player = await db.player.findFirst({ where: { name: playerName, roomId: room.id } });
    if (!player) {
      return NextResponse.json({ ok: false, error: "Герой не найден." }, { status: 404 });
    }
    if (!player.isAlive) {
      return NextResponse.json(
        { ok: false, error: "Павший герой не может отдыхать." },
        { status: 400 }
      );
    }

    // BG3: check short rest limit
    if (restType === "short" && player.shortRestsUsed >= MAX_SHORT_RESTS) {
      return NextResponse.json(
        { ok: false, error: `Исчерпаны короткие отдыхи (${MAX_SHORT_RESTS}/${MAX_SHORT_RESTS}). Нужен долгий отдых для восстановления.` },
        { status: 400 }
      );
    }

    const round = room.round;
    const lines: string[] = [];
    lines.push(`${playerName} отдыхает...`);

    if (restType === "short") {
      // Roll the player's hit die and heal half the result.
      const hitDie = player.hitDice || 8;
      const roll = rollDice(`1d${hitDie}`);
      const healAmount = Math.max(1, Math.floor(roll.total / 2));
      const newHp = Math.min(player.maxHp, player.hp + healAmount);
      const actualHeal = newHp - player.hp;
      if (actualHeal > 0) {
        await healPlayer(room.id, playerName, actualHeal);
      }
      lines.push(
        `Короткий отдых: бросок кости здоровья 1d${hitDie} = ${roll.total}, восстановлено ${actualHeal} HP.`
      );
      // Warlock slots restored on short rest.
      await restoreSpellSlotsForShortRest(room.id, playerName, player.charClass);
      if (player.charClass.toLowerCase() === "warlock") {
        lines.push("Ячейки заклинаний колдуна восстановлены.");
      }
      // Increment short rest counter (BG3)
      const newCount = player.shortRestsUsed + 1;
      await db.player.update({ where: { id: player.id }, data: { shortRestsUsed: newCount } });
      lines.push(`Короткие отдыхи: ${newCount}/${MAX_SHORT_RESTS}.`);
    } else {
      // Long rest: full HP + all slots restored + reset short rest counter.
      const missing = player.maxHp - player.hp;
      if (missing > 0) {
        await healPlayer(room.id, playerName, missing);
      }
      lines.push(`Долгий отдых: HP восстановлены до ${player.maxHp}.`);
      await restoreAllSpellSlots(room.id, playerName);
      lines.push("Все ячейки заклинаний восстановлены.");
      // Reset short rest counter + BG3/D&D 5e fields
      await db.player.update({
        where: { id: player.id },
        data: {
          shortRestsUsed: 0,
          tempHp: 0,
          isDying: false,
          deathSaveSuccess: 0,
          deathSaveFailure: 0,
          concentratingOn: "",
        },
      });
      lines.push(`Короткие отдыхи восстановлены: 0/${MAX_SHORT_RESTS}.`);
      // Clear short-duration conditions (duration <= 3); keep long curses.
      const conds = await db.condition.findMany({ where: { roomId: room.id, targetName: playerName } });
      for (const c of conds) {
        if (c.duration <= 3) {
          await db.condition.delete({ where: { id: c.id } });
        }
      }
      lines.push("Кратковременные состояния сняты.");
    }

    for (const l of lines) {
      await db.chatMessage.create({
        data: { roomId: room.id, role: "system", speaker: "", round, content: l },
      });
    }
    invalidateSnapshotCache(room.id);
    const snapshot = await getSnapshot(roomCode);
    return NextResponse.json({ ok: true, snapshot });
  } catch (e: any) {
    console.error("[api/game/rest] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Ошибка отдыха." },
      { status: 500 }
    );
  }
}
