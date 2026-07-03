import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { equipItem, unequipItem, getSnapshot } from "@/lib/game/state";
import type { EquipmentSlot } from "@/lib/game/types";

export const dynamic = "force-dynamic";

// POST /api/game/equip
// Equip body:   { roomCode, playerName, itemId, slot? }
// Unequip body: { roomCode, playerName, unequipSlot }
// Equips or unequips an item; recomputes AC and stats.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const roomCode = (body?.roomCode ?? "").toString().toUpperCase().trim();
    const playerName = (body?.playerName ?? "").toString().trim();
    if (!roomCode || !playerName) {
      return NextResponse.json({ ok: false, error: "Укажите комнату и героя." }, { status: 400 });
    }
    const room = await db.room.findUnique({ where: { code: roomCode } });
    if (!room) return NextResponse.json({ ok: false, error: "Комната не найдена." }, { status: 404 });

    const snap = await getSnapshot(roomCode);
    if (!snap) return NextResponse.json({ ok: false, error: "Комната не найдена." }, { status: 404 });
    const me = snap.players.find((p) => p.name === playerName);
    if (!me) return NextResponse.json({ ok: false, error: "Герой не найден." }, { status: 404 });

    // === Unequip branch ===
    if (body?.unequipSlot) {
      const slot = (body.unequipSlot as string).toString().trim() as
        | EquipmentSlot | "accessory1" | "accessory2";
      const valid = ["weapon", "shield", "head", "chest", "legs", "hands", "accessory", "accessory1", "accessory2"];
      if (!valid.includes(slot)) {
        return NextResponse.json({ ok: false, error: "Неверный слот." }, { status: 400 });
      }
      const res = await unequipItem(room.id, playerName, slot);
      if (!res.ok) {
        return NextResponse.json({ ok: false, error: res.error ?? "Не удалось снять предмет." }, { status: 400 });
      }
      const snapshot = await getSnapshot(roomCode);
      return NextResponse.json({ ok: true, snapshot });
    }

    // === Equip branch ===
    const itemId = (body?.itemId ?? "").toString().trim();
    const slot = body?.slot ? (body.slot as string).toString().trim() as EquipmentSlot : undefined;
    if (!itemId) {
      return NextResponse.json({ ok: false, error: "Укажите itemId." }, { status: 400 });
    }
    if (slot) {
      const valid: EquipmentSlot[] = ["weapon", "shield", "head", "chest", "legs", "hands", "accessory"];
      if (!valid.includes(slot)) {
        return NextResponse.json({ ok: false, error: "Неверный слот." }, { status: 400 });
      }
    }
    const res = await equipItem(room.id, playerName, itemId, slot);
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error ?? "Не удалось экипировать предмет." }, { status: 400 });
    }
    const snapshot = await getSnapshot(roomCode);
    return NextResponse.json({ ok: true, snapshot });
  } catch (e: any) {
    console.error("[api/game/equip] error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Ошибка экипировки." }, { status: 500 });
  }
}
