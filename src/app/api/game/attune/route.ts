import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSnapshot, invalidateSnapshotCache } from "@/lib/game/state";
import { findItemByName } from "@/lib/game/item-database";
import { validatePlayerName, validateRoomCode } from "@/lib/game/validate";

export const dynamic = "force-dynamic";

/** POST /api/game/attune
 * Body: { roomCode, playerName, itemId, action: "attune" | "unattune" }
 *
 * D&D 5e Attunement:
 *   - Attuning requires a short rest (we skip the time requirement for simplicity).
 *   - A character can attune to a maximum of 3 magic items.
 *   - Only items with requiresAttunement: true in the item-database can be attuned.
 *   - Unattuning also requires a short rest (again skipped).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const roomCodeRaw = (body?.roomCode ?? "").toString();
    const playerNameRaw = (body?.playerName ?? "").toString();
    const itemId = (body?.itemId ?? "").toString();
    const action = (body?.action ?? "attune").toString();

    const roomCodeError = validateRoomCode(roomCodeRaw);
    if (roomCodeError) return NextResponse.json({ ok: false, error: roomCodeError }, { status: 400 });
    const playerNameError = validatePlayerName(playerNameRaw);
    if (playerNameError) return NextResponse.json({ ok: false, error: playerNameError }, { status: 400 });
    if (!itemId) return NextResponse.json({ ok: false, error: "Укажите itemId." }, { status: 400 });
    if (action !== "attune" && action !== "unattune") {
      return NextResponse.json({ ok: false, error: "Действие должно быть 'attune' или 'unattune'." }, { status: 400 });
    }

    const roomCode = roomCodeRaw.toUpperCase().trim();
    const playerName = playerNameRaw.trim().replace(/\s+/g, " ").slice(0, 20);

    const room = await db.room.findUnique({ where: { code: roomCode } });
    if (!room) return NextResponse.json({ ok: false, error: "Комната не найдена." }, { status: 404 });

    const item = await db.inventoryItem.findFirst({ where: { id: itemId, roomId: room.id, playerName } });
    if (!item) return NextResponse.json({ ok: false, error: "Предмет не найден." }, { status: 404 });

    // Check if the item requires attunement (look up in item-database by name).
    const entry = findItemByName(item.itemName);
    const requiresAttunement = entry?.requiresAttunement ?? false;

    if (action === "attune") {
      if (item.attuned) {
        return NextResponse.json({ ok: false, error: "Уже настроено." }, { status: 400 });
      }
      if (!requiresAttunement) {
        return NextResponse.json({ ok: false, error: "Этот предмет не требует настройки." }, { status: 400 });
      }
      // D&D 5e: max 3 attuned items per character.
      const attunedCount = await db.inventoryItem.count({
        where: { roomId: room.id, playerName, attuned: true },
      });
      if (attunedCount >= 3) {
        return NextResponse.json({
          ok: false,
          error: `Достигнут максимум настроенных предметов (3). Отвяжите один из предметов.`,
        }, { status: 400 });
      }
      await db.inventoryItem.update({ where: { id: item.id }, data: { attuned: true } });
      invalidateSnapshotCache(room.id);
      await db.chatMessage.create({
        data: {
          roomId: room.id, role: "system", speaker: "", round: room.round,
          content: `🔮 ${playerName} настраивается на «${item.itemName}». Магическая связь установлена.`,
        },
      });
    } else {
      // unattune
      if (!item.attuned) {
        return NextResponse.json({ ok: false, error: "Предмет не настроен." }, { status: 400 });
      }
      await db.inventoryItem.update({ where: { id: item.id }, data: { attuned: false } });
      invalidateSnapshotCache(room.id);
      await db.chatMessage.create({
        data: {
          roomId: room.id, role: "system", speaker: "", round: room.round,
          content: `🔮 ${playerName} разрывает связь с «${item.itemName}».`,
        },
      });
    }

    const snapshot = await getSnapshot(roomCode);
    return NextResponse.json({ ok: true, snapshot });
  } catch (e: any) {
    console.error("[api/game/attune] error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
