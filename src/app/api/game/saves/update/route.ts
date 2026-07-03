import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccountFromRequest } from "@/lib/auth/get-account";
import { logger } from "@/lib/game/logger";

export const dynamic = "force-dynamic";

const TOTAL_SLOTS = 3;
const NAME_MAX = 80;

// POST /api/game/saves/update
// Body: { slotNumber, name }
// Renames a save slot owned by the authenticated account.
export async function POST(req: NextRequest) {
  try {
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

    const nameRaw = (body?.name ?? "").toString();
    const name = nameRaw.trim().slice(0, NAME_MAX);
    if (!name) {
      return NextResponse.json(
        { ok: false, error: "Имя сохранения не должно быть пустым." },
        { status: 400 }
      );
    }

    // Update only if the slot belongs to this account.
    const updated = await db.saveSlot.updateMany({
      where: { accountId: account.id, slotNumber },
      data: { name },
    });

    if (updated.count === 0) {
      return NextResponse.json(
        { ok: false, error: "Слот не найден." },
        { status: 404 }
      );
    }

    logger.info("save slot renamed", { accountId: account.id, slotNumber, name });
    return NextResponse.json({ ok: true, slotNumber, name });
  } catch (e: any) {
    console.error("[api/game/saves/update] error:", e);
    return NextResponse.json(
      { ok: false, error: "Не удалось переименовать слот." },
      { status: 500 }
    );
  }
}
