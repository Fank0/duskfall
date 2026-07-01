import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seedWorld } from "@/lib/game/seed";
import { getSnapshot } from "@/lib/game/state";

export const dynamic = "force-dynamic";

// POST /api/game/reset — wipe the world and re-seed the opening scenario.
export async function POST() {
  try {
    // Clear all tables.
    await db.diceRoll.deleteMany();
    await db.chatMessage.deleteMany();
    await db.inventoryItem.deleteMany();
    await db.monster.deleteMany();
    await db.scene.deleteMany();
    await db.player.deleteMany();
    await db.gameState.deleteMany();

    await seedWorld();
    const snapshot = await getSnapshot();
    return NextResponse.json({ ok: true, snapshot });
  } catch (e: any) {
    console.error("[api/game/reset] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
