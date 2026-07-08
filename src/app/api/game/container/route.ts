import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSnapshot, invalidateSnapshotCache } from "@/lib/game/state";
import { validatePlayerName, validateRoomCode } from "@/lib/game/validate";

export const dynamic = "force-dynamic";

/** POST /api/game/container
 * Body: { roomCode, playerName, containerId, action: "open" | "loot" }
 *
 * D&D 5e Containers (MASTER-PLAN Phase 3.1):
 *   open — opens a container (if locked, requires Thieves' Tools check or key).
 *   loot — takes all gold + items from an open container into the player's inventory.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const roomCodeRaw = (body?.roomCode ?? "").toString();
    const playerNameRaw = (body?.playerName ?? "").toString();
    const containerId = (body?.containerId ?? "").toString();
    const action = (body?.action ?? "open").toString();

    const roomCodeError = validateRoomCode(roomCodeRaw);
    if (roomCodeError) return NextResponse.json({ ok: false, error: roomCodeError }, { status: 400 });
    const playerNameError = validatePlayerName(playerNameRaw);
    if (playerNameError) return NextResponse.json({ ok: false, error: playerNameError }, { status: 400 });
    if (!containerId) return NextResponse.json({ ok: false, error: "Укажите containerId." }, { status: 400 });

    const roomCode = roomCodeRaw.toUpperCase().trim();
    const playerName = playerNameRaw.trim().replace(/\s+/g, " ").slice(0, 20);

    const room = await db.room.findUnique({ where: { code: roomCode } });
    if (!room) return NextResponse.json({ ok: false, error: "Комната не найдена." }, { status: 404 });

    const container = await db.container.findFirst({ where: { id: containerId, roomId: room.id } });
    if (!container) return NextResponse.json({ ok: false, error: "Контейнер не найден." }, { status: 404 });

    if (action === "open") {
      if (container.isOpen) {
        return NextResponse.json({ ok: false, error: "Контейнер уже открыт." }, { status: 400 });
      }
      if (container.isLocked) {
        // Simplified: locked containers require a d20 + DEX check vs lockDC.
        // In a full implementation, the player would need Thieves' Tools.
        return NextResponse.json({
          ok: false,
          error: `Контейнер заперт (DC ${container.lockDC}). Нужен thieves' tools или ключ.`,
        }, { status: 400 });
      }
      await db.container.update({ where: { id: container.id }, data: { isOpen: true } });
      invalidateSnapshotCache(room.id);
      // Parse items for display.
      let items: any[] = [];
      try { items = JSON.parse(container.itemsJson || "[]"); } catch {}
      await db.chatMessage.create({
        data: { roomId: room.id, role: "system", speaker: "", round: room.round,
          content: `📦 ${playerName} открывает ${container.type === "corpse" ? "труп" : container.type === "chest" ? "сундук" : "тайник"}. Внутри: ${container.gold > 0 ? `${container.gold} золота` : "нет золота"}${items.length > 0 ? `, ${items.map((i: any) => i.name).join(", ")}` : ""}.` },
      });
      const snapshot = await getSnapshot(roomCode);
      return NextResponse.json({ ok: true, snapshot, container: { gold: container.gold, items } });
    }

    if (action === "loot") {
      if (!container.isOpen) {
        return NextResponse.json({ ok: false, error: "Сначала откройте контейнер." }, { status: 400 });
      }
      // Transfer gold + items to the player.
      let items: any[] = [];
      try { items = JSON.parse(container.itemsJson || "[]"); } catch {}
      // Add gold to player.
      if (container.gold > 0) {
        const player = await db.player.findFirst({ where: { name: playerName, roomId: room.id } });
        if (player) {
          await db.player.update({ where: { id: player.id }, data: { gold: player.gold + container.gold } });
        }
      }
      // Add items to player's inventory.
      for (const item of items) {
        const existing = await db.inventoryItem.findFirst({
          where: { roomId: room.id, playerName, itemName: item.name },
        });
        if (existing) {
          await db.inventoryItem.update({
            where: { id: existing.id },
            data: { quantity: existing.quantity + (item.quantity || 1) },
          });
        } else {
          await db.inventoryItem.create({
            data: { roomId: room.id, playerName, itemName: item.name, itemType: item.type || "misc", quantity: item.quantity || 1, description: item.description || "" },
          });
        }
      }
      // Clear the container.
      await db.container.update({
        where: { id: container.id },
        data: { gold: 0, itemsJson: "[]" },
      });
      invalidateSnapshotCache(room.id);
      await db.chatMessage.create({
        data: { roomId: room.id, role: "system", speaker: "", round: room.round,
          content: `📦 ${playerName} забирает ${container.gold > 0 ? `${container.gold} золота` : ""}${items.length > 0 ? `${container.gold > 0 ? " и " : ""}${items.map((i: any) => i.name).join(", ")}` : ""} из ${container.type === "corpse" ? "трупа" : "сундука"}.` },
      });
      const snapshot = await getSnapshot(roomCode);
      return NextResponse.json({ ok: true, snapshot });
    }

    return NextResponse.json({ ok: false, error: "Неизвестное действие." }, { status: 400 });
  } catch (e: any) {
    console.error("[api/game/container] error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
