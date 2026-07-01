import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/game/state";
import { seedWorld } from "@/lib/game/seed";

export const dynamic = "force-dynamic";

// GET /api/game/state — return the full game-state snapshot.
export async function GET() {
  try {
    await seedWorld();
    const snapshot = await getSnapshot();
    return NextResponse.json({ ok: true, snapshot });
  } catch (e: any) {
    console.error("[api/game/state] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
