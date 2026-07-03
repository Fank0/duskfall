import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/game/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/rooms
 *
 * Lists all rooms with a summary of players/monsters/chat-message count.
 * Protected by the X-Admin-Key header — must match the ADMIN_KEY env var.
 *
 * Query params:
 *   ?limit=100 — max rooms to return (default 100, capped at 500)
 *   ?offset=0  — pagination offset
 */
export async function GET(req: NextRequest) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) {
    logger.warn("admin/rooms: ADMIN_KEY not configured");
    return NextResponse.json(
      { ok: false, error: "Админ-доступ не настроен (ADMIN_KEY)." },
      { status: 503 }
    );
  }
  const provided = req.headers.get("x-admin-key") ?? "";
  if (provided !== adminKey) {
    logger.warn("admin/rooms: unauthorized attempt", {
      ip: req.headers.get("x-forwarded-for") ?? "unknown",
    });
    return NextResponse.json(
      { ok: false, error: "Неверный админ-ключ." },
      { status: 401 }
    );
  }

  const limit = Math.max(1, Math.min(500, Number(req.nextUrl.searchParams.get("limit") ?? "100") || 100));
  const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset") ?? "0") || 0);

  try {
    const rooms = await db.room.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        code: true,
        hostName: true,
        combatActive: true,
        round: true,
        location: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            players: true,
            monsters: true,
            chatMessages: true,
          },
        },
      },
    });
    const total = await db.room.count();
    return NextResponse.json({
      ok: true,
      total,
      rooms: rooms.map((r) => ({
        id: r.id,
        code: r.code,
        hostName: r.hostName,
        combatActive: r.combatActive,
        round: r.round,
        location: r.location,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        playerCount: r._count.players,
        monsterCount: r._count.monsters,
        chatMessageCount: r._count.chatMessages,
      })),
    });
  } catch (e: any) {
    logger.error("admin/rooms: DB error", { error: e?.message });
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Ошибка получения комнат." },
      { status: 500 }
    );
  }
}
