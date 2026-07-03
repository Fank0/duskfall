import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  damagePlayer,
  getSnapshot,
  logDiceRoll,
  invalidateSnapshotCache,
} from "@/lib/game/state";
import { rollDice, rollD20, abilityModifier } from "@/lib/game/dice";
import { validatePlayerName, validateRoomCode } from "@/lib/game/validate";

export const dynamic = "force-dynamic";

/** POST /api/game/check-trap
 * Body: { roomCode, playerName, x, y }
 *
 * Checks for an undiscovered + undisarmed trap at the given combat-grid cell.
 * If a trap exists and hasn't been disarmed, triggers it on `playerName`:
 *   - DEX save vs trap DC → success = half damage, failure = full damage.
 *   - The trap is marked discovered (so the player can see it afterwards).
 *   - Damage = Nd6 where N = trap.damage.
 *
 * Returns { ok, snapshot, triggered, damage, saved, trapType, message }.
 * If no trap is present (or already disarmed), returns { ok, triggered: false }.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const roomCodeRaw = (body?.roomCode ?? "").toString();
    const playerNameRaw = (body?.playerName ?? "").toString();
    const x = Number(body?.x);
    const y = Number(body?.y);

    const roomCodeError = validateRoomCode(roomCodeRaw);
    if (roomCodeError) {
      return NextResponse.json({ ok: false, error: roomCodeError }, { status: 400 });
    }
    const playerNameError = validatePlayerName(playerNameRaw);
    if (playerNameError) {
      return NextResponse.json({ ok: false, error: playerNameError }, { status: 400 });
    }
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      return NextResponse.json(
        { ok: false, error: "Укажите координаты клетки." },
        { status: 400 }
      );
    }

    const roomCode = roomCodeRaw.toUpperCase().trim();
    const playerName = playerNameRaw.trim().replace(/\s+/g, " ").slice(0, 20);

    const room = await db.room.findUnique({ where: { code: roomCode } });
    if (!room) {
      return NextResponse.json({ ok: false, error: "Комната не найдена." }, { status: 404 });
    }

    const player = await db.player.findFirst({ where: { name: playerName, roomId: room.id } });
    if (!player) {
      return NextResponse.json({ ok: false, error: "Герой не найден." }, { status: 404 });
    }
    if (!player.isAlive || player.hp <= 0) {
      return NextResponse.json(
        { ok: false, error: "Павший герой не может активировать ловушку." },
        { status: 400 }
      );
    }

    // Find an undisarmed trap at this cell. Discovered traps are still
    // triggerable (the player stepped on it despite knowing) unless disarmed.
    const trap = await db.trap.findFirst({
      where: { roomId: room.id, x, y, disarmed: false },
    });
    if (!trap) {
      return NextResponse.json({ ok: true, triggered: false, message: "Ловушки нет." });
    }

    // DEX save vs trap DC.
    const dexMod = abilityModifier(player.dex);
    const saveRoll = rollD20(dexMod);
    const saved = saveRoll.total >= trap.dc;
    const baseDmg = rollDice(`${trap.damage}d6`).total;
    const dmg = saved ? Math.floor(baseDmg / 2) : baseDmg;

    if (dmg > 0) {
      await damagePlayer(room.id, player.name, dmg);
    }
    // Mark the trap discovered so it becomes visible in the snapshot.
    await db.trap.update({
      where: { id: trap.id },
      data: { discovered: true },
    });
    invalidateSnapshotCache(room.id);

    // Log the DEX save roll + damage roll.
    await logDiceRoll(room.id, room.round, player.name, {
      label: `Спасбросок ЛОВ (ловушка: ${trap.type})`,
      notation: "1d20",
      modifier: dexMod,
      result: saveRoll.rolls[0],
      total: saveRoll.total,
      target: trap.dc,
      success: saved,
      purpose: "trap_save",
    });
    await logDiceRoll(room.id, room.round, player.name, {
      label: `Урон ловушки${saved ? " (половина, спас)" : ""}`,
      notation: `${trap.damage}d6`,
      modifier: 0,
      result: baseDmg,
      total: dmg,
      purpose: "trap_damage",
    });

    const message = saved
      ? `Ловушка «${trap.type}» срабатывает под ногами ${player.name}: спасбросок успешен, половина урона (${dmg}).`
      : `Ловушка «${trap.type}» срабатывает под ногами ${player.name}: спасбросок провален, урон ${dmg}.`;

    await db.chatMessage.create({
      data: {
        roomId: room.id,
        role: "system",
        speaker: "",
        content: message,
        round: room.round,
      },
    });
    invalidateSnapshotCache(room.id);

    const snapshot = await getSnapshot(roomCode);
    return NextResponse.json({
      ok: true,
      triggered: true,
      snapshot,
      damage: dmg,
      saved,
      trapType: trap.type,
      message,
    });
  } catch (e: any) {
    console.error("[api/game/check-trap] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Ошибка проверки ловушки." },
      { status: 500 }
    );
  }
}
