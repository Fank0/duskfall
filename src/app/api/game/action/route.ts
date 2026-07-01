import { NextRequest, NextResponse } from "next/server";
import { processPlayerAction } from "@/lib/game/dm-agent";
import { getSnapshot } from "@/lib/game/state";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/game/action
// Body: { roomCode: string, playerName: string, action: string }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const roomCode = (body?.roomCode ?? "").toString().toUpperCase().trim();
    const playerName = (body?.playerName ?? "").toString().trim();
    const action = (body?.action ?? "").toString().trim();
    if (!roomCode || !playerName || !action) {
      return NextResponse.json(
        { ok: false, error: "Укажите комнату, героя и действие." },
        { status: 400 }
      );
    }

    const event = await processPlayerAction(roomCode, playerName, action);
    const snapshot = await getSnapshot(roomCode);
    return NextResponse.json({ ok: true, event, snapshot });
  } catch (e: any) {
    console.error("[api/game/action] error:", e);
    // Turn-enforcement errors are client errors.
    const status = e?.message?.includes("не ваш ход") || e?.message?.includes("Павший") ? 403 : 500;
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Ошибка Мастера Подземелий." },
      { status }
    );
  }
}
