import { NextRequest, NextResponse } from "next/server";
import { processPlayerAction } from "@/lib/game/dm-agent";
import { getSnapshot } from "@/lib/game/state";
import { seedWorld } from "@/lib/game/seed";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/game/action
// Body: { action: string }
// Returns the resolved event + the refreshed game-state snapshot.
export async function POST(req: NextRequest) {
  try {
    await seedWorld();
    const body = await req.json().catch(() => ({}));
    const action: string = (body?.action ?? "").toString().trim();
    if (!action) {
      return NextResponse.json(
        { ok: false, error: "Пустое действие." },
        { status: 400 }
      );
    }

    const event = await processPlayerAction(action);
    const snapshot = await getSnapshot();

    return NextResponse.json({ ok: true, event, snapshot });
  } catch (e: any) {
    console.error("[api/game/action] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Ошибка Мастера Подземелий." },
      { status: 500 }
    );
  }
}
