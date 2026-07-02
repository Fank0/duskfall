import { NextRequest, NextResponse } from "next/server";
import { getSnapshot } from "@/lib/game/state";

export const dynamic = "force-dynamic";

// GET /api/game/state?room=ABCDEF
export async function GET(req: NextRequest) {
  try {
    const roomCode = (req.nextUrl.searchParams.get("room") ?? "").toUpperCase().trim();
    if (!roomCode) {
      return NextResponse.json({ ok: false, error: "Код комнаты не указан." }, { status: 400 });
    }
    const snapshot = await getSnapshot(roomCode);
    if (!snapshot) {
      return NextResponse.json({ ok: false, error: "Комната не найдена." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, snapshot });
  } catch (e: any) {
    console.error("[api/game/state] error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
