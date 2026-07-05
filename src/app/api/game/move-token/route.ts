import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSnapshot, invalidateSnapshotCache, moveToken, damagePlayer } from "@/lib/game/state";
import { validatePlayerName, validateRoomCode } from "@/lib/game/validate";
import { rollD20, rollDice } from "@/lib/game/dice";

export const dynamic = "force-dynamic";

/** POST /api/game/move-token
 * Body: { roomCode, playerName, x, y }
 * Moves the player's token to (x, y) on the tactical grid.
 * Returns the updated snapshot.
 *
 * D&D 5e movement: each cell = 5 feet. Movement speed is derived from
 * the player's race/class (default 30 ft = 6 cells). Difficult terrain
 * costs 2x movement.
 *
 * D&D 5e Opportunity Attacks: when a player moves out of a monster's
 * reach (adjacent cell), the monster gets a free attack. This only
 * applies in combat.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const roomCodeRaw = (body?.roomCode ?? "").toString();
    const playerNameRaw = (body?.playerName ?? "").toString();
    const x = Number(body?.x);
    const y = Number(body?.y);

    const roomCodeError = validateRoomCode(roomCodeRaw);
    if (roomCodeError) return NextResponse.json({ ok: false, error: roomCodeError }, { status: 400 });
    const playerNameError = validatePlayerName(playerNameRaw);
    if (playerNameError) return NextResponse.json({ ok: false, error: playerNameError }, { status: 400 });

    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= 16 || y >= 16) {
      return NextResponse.json({ ok: false, error: "Invalid coordinates." }, { status: 400 });
    }

    const roomCode = roomCodeRaw.toUpperCase().trim();
    const playerName = playerNameRaw.trim().replace(/\s+/g, " ").slice(0, 20);

    const room = await db.room.findUnique({ where: { code: roomCode } });
    if (!room) return NextResponse.json({ ok: false, error: "Room not found." }, { status: 404 });

    const player = await db.player.findFirst({ where: { name: playerName, roomId: room.id } });
    if (!player) return NextResponse.json({ ok: false, error: "Hero not found." }, { status: 404 });
    if (!player.isAlive || player.hp <= 0) {
      return NextResponse.json({ ok: false, error: "Fallen hero cannot move." }, { status: 400 });
    }

    // D&D 5e Opportunity Attacks: if in combat and the player was adjacent to
    // a monster, moving away triggers a free attack from that monster.
    const wasFromX = player.posX;
    const wasFromY = player.posY;
    let opportunityAttacks: { monsterName: string; hit: boolean; damage: number }[] = [];
    if (room.combatActive) {
      const monsters = await db.monster.findMany({ where: { roomId: room.id, isActive: true } });
      for (const m of monsters) {
        if (m.hp <= 0) continue;
        const distBefore = Math.max(Math.abs(m.posX - wasFromX), Math.abs(m.posY - wasFromY));
        const distAfter = Math.max(Math.abs(m.posX - x), Math.abs(m.posY - y));
        // If the player was adjacent (dist=1) and is now moving away (dist>1),
        // the monster gets an opportunity attack.
        if (distBefore === 1 && distAfter > 1) {
          const atk = rollD20(m.attackBonus);
          const hit = atk.total >= player.ac;
          let damage = 0;
          if (hit) {
            const dmg = rollDice(m.damageNotation);
            damage = Math.max(1, dmg.total);
            await damagePlayer(room.id, playerName, damage);
          }
          opportunityAttacks.push({ monsterName: m.name, hit, damage });
        }
      }
    }

    // Move the token (clamped to grid bounds by moveToken).
    await moveToken(room.id, playerName, x, y, true);
    invalidateSnapshotCache(room.id);

    // Log opportunity attacks as system messages.
    for (const oa of opportunityAttacks) {
      const msg = oa.hit
        ? `⚔️ Атака по возможности: ${oa.monsterName} бьёт ${playerName} (${oa.damage} урона)!`
        : `⚔️ Атака по возможности: ${oa.monsterName} промахивается по ${playerName}.`;
      await db.chatMessage.create({
        data: { roomId: room.id, role: "system", speaker: "", round: room.round, content: msg },
      });
    }

    const snapshot = await getSnapshot(roomCode);
    return NextResponse.json({ ok: true, snapshot, opportunityAttacks });
  } catch (e: any) {
    console.error("[api/game/move-token] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Movement error." },
      { status: 500 }
    );
  }
}
