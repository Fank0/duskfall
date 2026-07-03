import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createRoomWithHost } from "@/lib/game/seed";
import { getPreset, getRace, getBackground } from "@/lib/game/presets";
import { getSnapshot } from "@/lib/game/state";
import { validatePlayerName } from "@/lib/game/validate";
import { rateLimit, rateLimitedResponse, getClientIp } from "@/lib/game/rate-limit";
import { logger } from "@/lib/game/logger";
import { getAccountFromRequest } from "@/lib/auth/get-account";
import { upsertSaveSlotForPlayer, validateSlotNumber } from "@/lib/auth/save-slot";

export const dynamic = "force-dynamic";

// 3 room-creates per hour per IP (item 26: rate limit on room/create).
const createLimiter = rateLimit({ windowMs: 3_600_000, max: 3, label: "room-create" });

// POST /api/game/room/create
// Body: { playerName, classId, raceId, backgroundId, slotNumber? }
export async function POST(req: NextRequest) {
  try {
    // ===== Rate limit (item 26): 3 / hour / IP. =====
    const ip = getClientIp(req);
    const rl = createLimiter.check(`room-create:${ip}`);
    if (!rl.ok) {
      logger.warn("room/create rate-limited", { ip, count: rl.count });
      return rateLimitedResponse("room-create", rl.retryAfterMs) as unknown as NextResponse;
    }

    const body = await req.json().catch(() => ({}));
    const playerNameRaw = (body?.playerName ?? "").toString();
    const playerNameError = validatePlayerName(playerNameRaw);
    if (playerNameError) {
      return NextResponse.json({ ok: false, error: playerNameError }, { status: 400 });
    }
    const playerName = sanitizePlayerName(playerNameRaw);
    const classId = (body?.classId ?? "fighter").toString();
    const raceId = (body?.raceId ?? "human").toString();
    const backgroundId = (body?.backgroundId ?? "soldier").toString();
    const bonusStats = body?.bonusStats ?? { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
    const preset = getPreset(classId);
    const race = getRace(raceId);
    const background = getBackground(backgroundId);

    const { roomCode, roomId } = await createRoomWithHost({
      name: playerName,
      preset,
      race,
      background,
      isHost: true,
      positionIndex: 0,
      portraitUrl: null,
      bonusStats,
    });

    // ===== Save-slot binding (auth-restore) =====
    // If the requester is authenticated AND supplied a slotNumber, persist this
    // room + character into their save slot so they can resume later.
    let slotBound = false;
    const account = await getAccountFromRequest(req.headers.get("cookie"));
    if (account) {
      const slotNumber = validateSlotNumber(body?.slotNumber);
      if (slotNumber !== null) {
        // Set hostAccountId on the room + bind the slot.
        const player = await db.player.findFirst({ where: { roomId, name: playerName } });
        if (player) {
          try {
            await db.room.update({
              where: { id: roomId },
              data: { hostAccountId: account.id },
            });
            await upsertSaveSlotForPlayer({
              accountId: account.id,
              slotNumber,
              roomId,
              playerId: player.id,
              charName: playerName,
              charClass: preset.charClass,
              charRace: race.name,
              charLevel: 1,
            });
            slotBound = true;
          } catch (e) {
            logger.warn("save-slot bind failed on room/create", {
              err: (e as Error)?.message?.slice(0, 100),
              accountId: account.id,
              roomCode,
            });
          }
        }
      }
    }

    const snapshot = await getSnapshot(roomCode);
    logger.info("room created", { roomCode, hostName: playerName, ip, slotBound });
    return NextResponse.json({ ok: true, roomCode, snapshot, youAre: playerName, slotBound });
  } catch (e: any) {
    console.error("[api/game/room/create] error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Не удалось создать комнату." }, { status: 500 });
  }
}

/** Trim + collapse internal whitespace from a validated player name. */
function sanitizePlayerName(s: string): string {
  return s.trim().replace(/\s+/g, " ").slice(0, 20);
}
