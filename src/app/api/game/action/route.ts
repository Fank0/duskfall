import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  resolvePlayerMechanics,
  streamNarrativeAction,
} from "@/lib/game/dm-agent";
import { getSnapshot, invalidateSnapshotCache } from "@/lib/game/state";
import { rateLimit, rateLimitedResponse } from "@/lib/game/rate-limit";
import { logger } from "@/lib/game/logger";
import { metrics } from "@/lib/game/metrics";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 10 actions per minute per player (item 25: rate limit on actions).
const actionLimiter = rateLimit({ windowMs: 60_000, max: 10, label: "actions" });

// POST /api/game/action  (Server-Sent Events stream)
// Body: { roomCode, playerName, action }
// Emits:
//   data: {"type":"mechanics","event":{...},"snapshot":{...}}\n\n   (instantly)
//   data: {"type":"delta","text":"..."}\n\n                    (per narrative token)
//   data: {"type":"done"}\n\n                                  (stream end)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const roomCode = (body?.roomCode ?? "").toString().toUpperCase().trim();
  const playerName = (body?.playerName ?? "").toString().trim();
  const action = (body?.action ?? "").toString().trim();
  if (!roomCode || !playerName || !action) {
    metrics.recordApiRequest(false);
    return new Response(
      JSON.stringify({ ok: false, error: "Укажите комнату, героя и действие." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // ===== Rate limit (item 25): 10 actions / minute / player. =====
  const rlKey = `action:${roomCode}:${playerName}`;
  const rl = actionLimiter.check(rlKey);
  if (!rl.ok) {
    metrics.recordApiRequest(false);
    logger.warn("action rate-limited", { roomCode, playerName, count: rl.count });
    return rateLimitedResponse("actions", rl.retryAfterMs);
  }

  metrics.recordApiRequest(true);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      try {
        // 1. Resolve mechanics (plan, dice, effects, monster turns) — ~1-3s.
        const mech = await resolvePlayerMechanics(roomCode, playerName, action);
        const snapshot = await getSnapshot(roomCode);
        send({ type: "mechanics", event: mech, snapshot });

        // 2. Stream the narrative token-by-token.
        let full = "";
        for await (const chunk of streamNarrativeAction(roomCode, playerName, action, {
          playerRolls: mech.playerRolls,
          outcome: mech.outcome,
          branchNarrative: mech.branchNarrative,
          damageToMonster: mech.damageDealtToMonster,
          monsterThatDied: mech.monsterThatDied,
          inventoryChanges: mech.inventoryChanges,
          goldChange: mech.goldChange,
          location: mech.location,
        })) {
          full += chunk;
          send({ type: "delta", text: chunk });
        }

        // 3. Persist the DM narrative, then signal done.
        const room = await db.room.findUnique({ where: { code: roomCode } });
        if (room) {
          await db.chatMessage.create({
            data: {
              roomId: room.id,
              role: "dm",
              speaker: "",
              round: mech.round,
              content: full || mech.branchNarrative,
            },
          });
          invalidateSnapshotCache(room.id);
        }
        send({ type: "done" });
      } catch (e: any) {
        const status = e?.message?.includes("не ваш ход") || e?.message?.includes("Павший") ? 403 : 500;
        send({ type: "error", error: e?.message ?? "Ошибка Мастера.", status });
        metrics.recordApiRequest(false);
        metrics.recordError();
        logger.error("action stream failed", {
          roomCode,
          playerName,
          error: e?.message ?? String(e),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
