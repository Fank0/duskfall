import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccountFromRequest } from "@/lib/auth/get-account";

export const dynamic = "force-dynamic";

/** GET /api/game/bestiary
 * Returns the list of discovered monster names for the authenticated account.
 * The BestiaryPanel uses this to show only monsters the player has encountered.
 */
export async function GET(req: NextRequest) {
  try {
    const account = await getAccountFromRequest(req.headers.get("cookie"));
    if (!account) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }
    const discovered = await db.discoveredMonster.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({
      ok: true,
      monsters: discovered.map((d) => d.monsterName),
    });
  } catch (e: any) {
    console.error("[api/game/bestiary] GET error:", e);
    return NextResponse.json({ ok: false, error: "Failed to load bestiary." }, { status: 500 });
  }
}

/** POST /api/game/bestiary
 * Body: { monsterName }
 * Marks a monster as discovered for the authenticated account.
 * Called when a monster is revealed in combat (isActive = true).
 */
export async function POST(req: NextRequest) {
  try {
    const account = await getAccountFromRequest(req.headers.get("cookie"));
    if (!account) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const monsterName = (body?.monsterName ?? "").toString().trim();
    if (!monsterName) {
      return NextResponse.json({ ok: false, error: "Monster name required." }, { status: 400 });
    }
    // Upsert: only insert if not already discovered.
    const existing = await db.discoveredMonster.findFirst({
      where: { accountId: account.id, monsterName },
    });
    if (!existing) {
      await db.discoveredMonster.create({
        data: { accountId: account.id, monsterName },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[api/game/bestiary] POST error:", e);
    return NextResponse.json({ ok: false, error: "Failed to mark monster." }, { status: 500 });
  }
}
