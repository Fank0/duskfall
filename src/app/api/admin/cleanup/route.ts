import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/game/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/cleanup
 *
 * Deletes rooms older than 24h (based on Room.updatedAt — a stale room that
 * hasn't seen any activity in a day is safe to reap). Protected by the
 * X-Admin-Key header — must match the ADMIN_KEY env var.
 *
 * Optional body:
 *   { "maxAgeHours": 24 }  — override the 24h default (1..720)
 *
 * Returns:
 *   { ok: true, deleted: <count>, cutoff: <iso> }
 */
export async function POST(req: NextRequest) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) {
    logger.warn("admin/cleanup: ADMIN_KEY not configured");
    return NextResponse.json(
      { ok: false, error: "Админ-доступ не настроен (ADMIN_KEY)." },
      { status: 503 }
    );
  }
  const provided = req.headers.get("x-admin-key") ?? "";
  if (provided !== adminKey) {
    logger.warn("admin/cleanup: unauthorized attempt", {
      ip: req.headers.get("x-forwarded-for") ?? "unknown",
    });
    return NextResponse.json(
      { ok: false, error: "Неверный админ-ключ." },
      { status: 401 }
    );
  }

  let maxAgeHours = 24;
  try {
    const body = await req.json().catch(() => ({}));
    const raw = Number(body?.maxAgeHours);
    if (Number.isFinite(raw) && raw >= 1 && raw <= 720) {
      maxAgeHours = raw;
    }
  } catch {
    /* default */
  }

  const cutoff = new Date(Date.now() - maxAgeHours * 3600 * 1000);
  try {
    // Cascade deletes will purge all related records (players, monsters,
    // chatMessages, diceRolls, scenes, initiatives, inventory, conditions,
    // quests, mapRooms, npcs).
    const result = await db.room.deleteMany({
      where: { updatedAt: { lt: cutoff } },
    });
    logger.info("admin/cleanup: reaped stale rooms", {
      deleted: result.count,
      cutoff: cutoff.toISOString(),
    });
    return NextResponse.json({
      ok: true,
      deleted: result.count,
      cutoff: cutoff.toISOString(),
    });
  } catch (e: any) {
    logger.error("admin/cleanup: DB error", { error: e?.message });
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Ошибка очистки комнат." },
      { status: 500 }
    );
  }
}
