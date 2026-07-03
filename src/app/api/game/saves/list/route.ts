import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccountFromRequest } from "@/lib/auth/get-account";

export const dynamic = "force-dynamic";

const TOTAL_SLOTS = 3;

// GET /api/game/saves/list
// Returns 3 save slots for the authenticated account. Filled slots include
// their character info + roomCode; empty slots are null.
export async function GET(req: NextRequest) {
  const account = await getAccountFromRequest(req.headers.get("cookie"));
  if (!account) {
    return NextResponse.json(
      { ok: false, error: "Не авторизован." },
      { status: 401 }
    );
  }

  const saves = await db.saveSlot.findMany({
    where: { accountId: account.id },
    include: { room: { select: { code: true } } },
    orderBy: { slotNumber: "asc" },
  });

  const slots = Array.from({ length: TOTAL_SLOTS }, (_, i) => {
    const slotNumber = i + 1;
    const s = saves.find((x) => x.slotNumber === slotNumber);
    if (!s) return { slotNumber, filled: false as const };
    return {
      slotNumber,
      filled: true as const,
      id: s.id,
      name: s.name,
      roomId: s.roomId,
      roomCode: s.room?.code ?? null,
      playerId: s.playerId,
      charName: s.charName,
      charClass: s.charClass,
      charRace: s.charRace,
      charLevel: s.charLevel,
      lastPlayed: s.lastPlayed.toISOString(),
    };
  });

  return NextResponse.json({ ok: true, slots, accountId: account.id, username: account.username });
}
