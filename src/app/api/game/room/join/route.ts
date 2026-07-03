import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { joinRoomAsPlayer } from "@/lib/game/seed";
import { getPreset, getRace, getBackground } from "@/lib/game/presets";
import { getSnapshot, getRoomByCode } from "@/lib/game/state";
import { validatePlayerName, validateRoomCode } from "@/lib/game/validate";
import { rateLimit, rateLimitedResponse, getClientIp } from "@/lib/game/rate-limit";
import { logger } from "@/lib/game/logger";
import { getAccountFromRequest } from "@/lib/auth/get-account";
import { upsertSaveSlotForPlayer, validateSlotNumber } from "@/lib/auth/save-slot";

export const dynamic = "force-dynamic";

// 10 room-joins per hour per IP (item 26: rate limit on room/join).
const joinLimiter = rateLimit({ windowMs: 3_600_000, max: 10, label: "room-join" });

// POST /api/game/room/join
// Body: { roomCode, playerName, classId, raceId, backgroundId, slotNumber? }
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

    // ===== Save-slot binding (auth-restore) =====
    let slotBound = false;
    const account = await getAccountFromRequest(req.headers.get("cookie"));
    if (account) {
      const slotNumber = validateSlotNumber(body?.slotNumber);
      if (slotNumber !== null) {
        const player = await db.player.findFirst({ where: { roomId: room.id, name: playerName } });
        if (player) {
          try {
            await upsertSaveSlotForPlayer({
              accountId: account.id,
              slotNumber,
              roomId: room.id,
              playerId: player.id,
              charName: playerName,
              charClass: preset.charClass,
              charRace: race.name,
              charLevel: 1,
            });
            slotBound = true;
          } catch (e) {
            logger.warn("save-slot bind failed on room/join", {
              err: (e as Error)?.message?.slice(0, 100),
              accountId: account.id,
              roomCode,
            });
          }
        }
      }
    }

    const snapshot = await getSnapshot(roomCode);
    logger.info("player joined room", { roomCode, playerName, ip, slotBound });
    return NextResponse.json({ ok: true, roomCode, snapshot, youAre: playerName, slotBound });
  } catch (e: any) {
    console.error("[api/game/room/join] error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Не удалось войти в комнату." }, { status: 500 });
  }
}
