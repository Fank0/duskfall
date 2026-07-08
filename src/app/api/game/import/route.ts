import { NextRequest, NextResponse } from "next/server";
import { importRoom } from "@/lib/game/save-load";
import type { SaveFile } from "@/lib/game/save-load";

export const dynamic = "force-dynamic";

// POST /api/game/import
// Body: SaveFile JSON (the full exported object)
// Creates a NEW room with a fresh code and restores the entire state.
// Returns { ok: true, newRoomCode }.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Тело запроса должно быть JSON (SaveFile)." }, { status: 400 });
    }
    const save = body as SaveFile;
    const result = await importRoom(save);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, newRoomCode: result.newRoomCode });
  } catch (e: any) {
    console.error("[api/game/import] error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
