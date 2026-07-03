import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccountFromRequest } from "@/lib/auth/get-account";
import { logger } from "@/lib/game/logger";

export const dynamic = "force-dynamic";

const TOTAL_SLOTS = 3;

// POST /api/game/saves/delete
// Body: { slotNumber }
// Frees a save slot owned by the authenticated account.
export async function POST(req: NextRequest) {
  const account = await getAccountFromRequest(req.headers.get("cookie"));
  if (!account) {
    return NextResponse.json(
      { ok: false, error: "Не авторизован." },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const slotNumber = Number(body?.slotNumber);
  if (!Number.isInteger(slotNumber) || slotNumber < 1 || slotNumber > TOTAL_SLOTS) {
    return NextResponse.json(
      { ok: false, error: "Неверный номер слота." },
      { status: 400 }
    );
  }

  // Ownership is guaranteed by the unique [accountId, slotNumber] index.
  const deleted = await db.saveSlot.deleteMany({
    where: { accountId: account.id, slotNumber },
  });

  logger.info("save slot deleted", {
    accountId: account.id,
    slotNumber,
    found: deleted.count > 0,
  });

  return NextResponse.json({ ok: true, deleted: deleted.count });
}
