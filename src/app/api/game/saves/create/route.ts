import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccountFromRequest } from "@/lib/auth/get-account";

export const dynamic = "force-dynamic";

const TOTAL_SLOTS = 3;

/** POST /api/game/saves/create
 * Body: { slotNumber, roomCode, playerName }
 * Creates or overwrites a save slot for the authenticated account.
 * Links the current room + character to the slot so the player can resume later.
 */
export async function POST(req: NextRequest) {
  try {
    const account = await getAccountFromRequest(req.headers.get("cookie"));
    if (!account) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const slotNumber = Number(body?.slotNumber);
    const roomCode = (body?.roomCode ?? "").toString().toUpperCase().trim();
    const playerName = (body?.playerName ?? "").toString().trim();

    if (!Number.isInteger(slotNumber) || slotNumber < 1 || slotNumber > TOTAL_SLOTS) {
      return NextResponse.json({ ok: false, error: "Invalid slot number." }, { status: 400 });
    }
    if (!roomCode || !playerName) {
      return NextResponse.json({ ok: false, error: "Room code and player name required." }, { status: 400 });
    }

    // Find the room + player.
    const room = await db.room.findUnique({ where: { code: roomCode } });
    if (!room) {
      return NextResponse.json({ ok: false, error: "Room not found." }, { status: 404 });
    }

    const player = await db.player.findFirst({ where: { name: playerName, roomId: room.id } });
    if (!player) {
      return NextResponse.json({ ok: false, error: "Player not found." }, { status: 404 });
    }

    // Build the save name from character info.
    const saveName = `${playerName} (${player.raceName} ${player.charClass}, ур.${player.level})`;

    // Upsert: if a slot already exists for this account+slotNumber, overwrite it.
    const existing = await db.saveSlot.findFirst({
      where: { accountId: account.id, slotNumber },
    });

    let save;
    if (existing) {
      save = await db.saveSlot.update({
        where: { id: existing.id },
        data: {
          name: saveName,
          roomId: room.id,
          playerId: player.id,
          charName: playerName,
          charClass: player.charClass,
          charRace: player.raceName,
          charLevel: player.level,
          lastPlayed: new Date(),
        },
      });
    } else {
      save = await db.saveSlot.create({
        data: {
          accountId: account.id,
          slotNumber,
          name: saveName,
          roomId: room.id,
          playerId: player.id,
          charName: playerName,
          charClass: player.charClass,
          charRace: player.raceName,
          charLevel: player.level,
        },
      });
    }

    return NextResponse.json({ ok: true, save });
  } catch (e: any) {
    console.error("[api/game/saves/create] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to save." },
      { status: 500 }
    );
  }
}
