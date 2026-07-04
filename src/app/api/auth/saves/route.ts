import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccountFromRequest } from "@/lib/auth/get-account";

export const dynamic = "force-dynamic";

// GET /api/auth/saves
// Returns all rooms owned by the authenticated account (saved worlds).
// Legacy endpoint — newer save-slot UI uses /api/game/saves/list instead.
//
// Security: previously this endpoint accepted `accountId` as a query param
// without auth — anyone could enumerate any account's rooms by passing the
// accountId. Now it requires a signed session cookie and only returns rooms
// owned by the caller.
export async function GET(req: NextRequest) {
  try {
    const account = await getAccountFromRequest(req.headers.get("cookie"));
    if (!account) {
      return NextResponse.json({ ok: false, error: "Не авторизован." }, { status: 401 });
    }
    const rooms = await db.room.findMany({
      where: { hostAccountId: account.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        code: true,
        hostName: true,
        location: true,
        round: true,
        combatActive: true,
        updatedAt: true,
        _count: { select: { players: true } },
      },
    });
    return NextResponse.json({ ok: true, saves: rooms });
  } catch (e: any) {
    console.error("[api/auth/saves] error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Ошибка." }, { status: 500 });
  }
}
