import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { joinRoomAsPlayer } from "@/lib/game/seed";
import { getPreset, getRace, getBackground } from "@/lib/game/presets";
import { getSnapshot, getRoomByCode } from "@/lib/game/state";
import { validatePlayerName, validateRoomCode } from "@/lib/game/validate";
import { rateLimit, rateLimitedResponse, getClientIp } from "@/lib/game/rate-limit";
import { logger } from "@/lib/game/logger";

export const dynamic = "force-dynamic";

// 10 room-joins per hour per IP (item 26: rate limit on room/join).
const joinLimiter = rateLimit({ windowMs: 3_600_000, max: 10, label: "room-join" });

// POST /api/game/room/join
// Body: { roomCode, playerName, classId, raceId, backgroundId }
export async function POST(req: NextRequest) {
  try {
    // ===== Rate limit (item 26): 10 / hour / IP. =====
    const ip = getClientIp(req);
    const rl = joinLimiter.check(`room-join:${ip}`);
    if (!rl.ok) {
      logger.warn("room/join rate-limited", { ip, count: rl.count });
      return rateLimitedResponse("room-join", rl.retryAfterMs) as unknown as NextResponse;
    }

    const body = await req.json().catch(() => ({}));
    const roomCodeRaw = (body?.roomCode ?? "").toString();
    const playerNameRaw = (body?.playerName ?? "").toString();

    const roomCodeError = validateRoomCode(roomCodeRaw);
    if (roomCodeError) {
      return NextResponse.json({ ok: false, error: roomCodeError }, { status: 400 });
    }
    const playerNameError = validatePlayerName(playerNameRaw);
    if (playerNameError) {
      return NextResponse.json({ ok: false, error: playerNameError }, { status: 400 });
    }

    const roomCode = roomCodeRaw.toUpperCase().trim();
    const playerName = playerNameRaw.trim().replace(/\s+/g, " ").slice(0, 20);
    const classId = (body?.classId ?? "fighter").toString();
    const raceId = (body?.raceId ?? "human").toString();
    const backgroundId = (body?.backgroundId ?? "soldier").toString();
    const bonusStats = body?.bonusStats ?? { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };

    const room = await getRoomByCode(roomCode);
    if (!room) {
      return NextResponse.json({ ok: false, error: "Комната не найдена. Проверьте код." }, { status: 404 });
    }
    if (room.combatActive) {
      return NextResponse.json({ ok: false, error: "Нельзя присоединиться во время боя." }, { status: 400 });
    }
    const existing = await db.player.findFirst({ where: { name: playerName, roomId: room.id } });
    if (existing) {
      return NextResponse.json({ ok: false, error: "Герой с таким именем уже в комнате." }, { status: 400 });
    }
    const preset = getPreset(classId);
    const race = getRace(raceId);
    const background = getBackground(backgroundId);
    const playerCount = await db.player.count({ where: { roomId: room.id } });
    await joinRoomAsPlayer(room.id, {
      name: playerName,
      preset,
      race,
      background,
      isHost: false,
      positionIndex: playerCount,
      portraitUrl: null,
      bonusStats,
    });

    const snapshot = await getSnapshot(roomCode);
    logger.info("player joined room", { roomCode, playerName, ip });
    return NextResponse.json({ ok: true, roomCode, snapshot, youAre: playerName });
  } catch (e: any) {
    console.error("[api/game/room/join] error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Не удалось войти в комнату." }, { status: 500 });
  }
}
