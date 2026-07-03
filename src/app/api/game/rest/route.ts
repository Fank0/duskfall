import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSnapshot, invalidateSnapshotCache } from "@/lib/game/state";
import {
  healPlayer,
  restoreAllSpellSlots,
  restoreSpellSlotsForShortRest,
} from "@/lib/game/state";
import { rollDice } from "@/lib/game/dice";

export const dynamic = "force-dynamic";

/** POST /api/game/rest
 * Body: { roomCode, playerName, restType: "short" | "long" }
 * Short rest: roll hit dice, heal half; warlock slots restored.
 * Long rest: full HP, all slots restored, short-duration conditions cleared. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const roomCode = (body?.roomCode ?? "").toString().toUpperCase().trim();
    const playerName = (body?.playerName ?? "").toString().trim();
    const restType = (body?.restType ?? "short").toString().trim() === "long" ? "long" : "short";
    if (!roomCode || !playerName) {
      return NextResponse.json(
        { ok: false, error: "Укажите комнату и героя." },
        { status: 400 }
      );
    }
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
    if (!player.isAlive || player.hp <= 0) {
      return NextResponse.json(
        { ok: false, error: "Павший герой не может отдыхать." },
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
    } else {
      // Long rest: full HP + all slots restored.
      const missing = player.maxHp - player.hp;
      if (missing > 0) {
        await healPlayer(room.id, playerName, missing);
      }
      lines.push(`Долгий отдых: HP восстановлены до ${player.maxHp}.`);
      await restoreAllSpellSlots(room.id, playerName);
      lines.push("Все ячейки заклинаний восстановлены.");
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
