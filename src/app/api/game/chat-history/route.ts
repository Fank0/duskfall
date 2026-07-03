import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRoomByCode } from "@/lib/game/state";

export const dynamic = "force-dynamic";

// GET /api/game/chat-history?room=ABCDEF&offset=0&limit=50
// Loads older chat messages in ascending chronological order, paginated.
// `offset` skips the most-recent N messages (so the client can paginate
// backwards from the latest 100 the snapshot already exposes).
export async function GET(req: NextRequest) {
  try {
    const roomCode = (req.nextUrl.searchParams.get("room") ?? "").toUpperCase().trim();
    if (!roomCode) {
      return NextResponse.json({ ok: false, error: "Код комнаты не указан." }, { status: 400 });
    }
    const room = await getRoomByCode(roomCode);
    if (!room) {
      return NextResponse.json({ ok: false, error: "Комната не найдена." }, { status: 404 });
    }

    const offset = Math.max(0, Math.min(100000, Number(req.nextUrl.searchParams.get("offset") ?? "0") || 0));
    const limit = Math.max(1, Math.min(200, Number(req.nextUrl.searchParams.get("limit") ?? "50") || 50));

    // We want OLDER messages than the latest `offset`. Approach: fetch the
    // latest (offset+limit) messages in desc order, drop the first `offset`,
    // take the next `limit`, then reverse to ascending.
    const desc = await db.chatMessage.findMany({
      where: { roomId: room.id },
      orderBy: { createdAt: "desc" },
      take: offset + limit,
    });
    const slice = desc.slice(offset, offset + limit).reverse();
    const messages = slice.map((c) => ({
      id: c.id,
      role: c.role,
      speaker: c.speaker,
      content: c.content,
      imageUrl: c.imageUrl,
      round: c.round,
      createdAt: c.createdAt.toISOString(),
    }));

    // Total count lets the client know if there are even older messages.
    const total = await db.chatMessage.count({ where: { roomId: room.id } });
    const hasMore = offset + limit < total;

    return NextResponse.json({ ok: true, messages, total, hasMore });
  } catch (e: any) {
    console.error("[api/game/chat-history] error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
