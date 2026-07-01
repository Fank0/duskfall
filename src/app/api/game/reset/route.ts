import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSnapshot } from "@/lib/game/state";
import { createRoomWithHost } from "@/lib/game/seed";

export const dynamic = "force-dynamic";

// POST /api/game/reset
// Body: { roomCode: string, playerName: string, classId: string }
// Wipes the room and re-seeds with the caller as the new host.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const roomCode = (body?.roomCode ?? "").toString().toUpperCase().trim();
    const playerName = (body?.playerName ?? "").toString().trim();
    const classId = (body?.classId ?? "fighter").toString();
    if (!roomCode || !playerName) {
      return NextResponse.json({ ok: false, error: "Укажите комнату и героя." }, { status: 400 });
    }
    const room = await db.room.findUnique({ where: { code: roomCode } });
    if (!room) {
      return NextResponse.json({ ok: false, error: "Комната не найдена." }, { status: 404 });
    }
    // Delete the room (cascade clears everything) and recreate with same code.
    await db.room.delete({ where: { id: room.id } });

    // Re-create with the same code, caller as host.
    const { getPreset } = await import("@/lib/game/presets");
    const preset = getPreset(classId);
    // Force the same room code.
    const newRoom = await db.room.create({
      data: {
        code: roomCode,
        hostName: playerName,
        combatActive: false,
        round: 0,
        location: "Туманный лес, опушка у древних руин",
        turnIndex: 0,
        introShown: false,
      },
    });
    await db.player.create({
      data: {
        roomId: newRoom.id,
        name: playerName,
        charClass: preset.charClass,
        level: 1,
        hp: preset.hp,
        maxHp: preset.hp,
        ac: preset.ac,
        str: preset.str,
        dex: preset.dex,
        con: preset.con,
        int: preset.int,
        wis: preset.wis,
        cha: preset.cha,
        proficiencyBonus: 2,
        gold: preset.gold,
        posX: 1,
        posY: 8,
        color: preset.color,
        weaponName: preset.weaponName,
        weaponNotation: preset.weaponNotation,
        isHost: true,
        isAlive: true,
      },
    });
    for (const item of preset.startItems) {
      await db.inventoryItem.create({
        data: { roomId: newRoom.id, playerName, itemName: item.name, itemType: item.type, quantity: 1, description: item.description },
      });
    }
    await db.monster.createMany({
      data: [
        { roomId: newRoom.id, name: "Гоблин-разведчик", label: "Г1", hp: 12, maxHp: 12, ac: 13, damageNotation: "1d6+2", attackBonus: 4, posX: 8, posY: 1, color: "#16a34a", description: "Кривоногий зеленошкурый гоблин с ржавым кривым ножом.", isActive: false },
        { roomId: newRoom.id, name: "Гоблин-стрелок", label: "Г2", hp: 10, maxHp: 10, ac: 12, damageNotation: "1d6+1", attackBonus: 3, posX: 9, posY: 2, color: "#15803d", description: "Тощий гоблин с коротким луком и колчаном зазубренных стрел.", isActive: false },
      ],
    });
    await db.scene.create({
      data: { roomId: newRoom.id, imageUrl: "/scenes/forest-ruins.png", prompt: "Dark fantasy misty forest clearing at dusk with ancient moss-covered stone ruins, ominous fog, grim atmosphere, painterly concept art", title: "Туманный лес, опушка у древних руин", isActive: true },
    });
    await db.chatMessage.create({
      data: { roomId: newRoom.id, role: "dm", speaker: "", round: 0, content: `Новая игра. Туманный лес ждёт, ${playerName}. Что ты будешь делать?` },
    });

    const snapshot = await getSnapshot(roomCode);
    return NextResponse.json({ ok: true, snapshot });
  } catch (e: any) {
    console.error("[api/game/reset] error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
