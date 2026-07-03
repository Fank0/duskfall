import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  resolvePlayerMechanics,
  streamNarrativeAction,
} from "@/lib/game/dm-agent";
import { getSnapshot, invalidateSnapshotCache } from "@/lib/game/state";
import { rateLimit, rateLimitedResponse } from "@/lib/game/rate-limit";
import { validateActionText, validatePlayerName, validateRoomCode } from "@/lib/game/validate";
import { sanitizeLLMOutput } from "@/lib/game/sanitize";
import { logger } from "@/lib/game/logger";
import { metrics } from "@/lib/game/metrics";
import { defaultLang, type Lang } from "@/lib/game/i18n";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 10 actions per minute per player (item 25: rate limit on actions).
const actionLimiter = rateLimit({ windowMs: 60_000, max: 10, label: "actions" });

// Accepted language codes for the DM narrative. Anything else falls back to "ru".
const VALID_LANGS: Lang[] = ["ru", "en", "es", "de", "fr", "zh"];

// POST /api/game/action  (Server-Sent Events stream)
// Body: { roomCode, playerName, action, lang? }
// Emits:
//   data: {"type":"mechanics","event":{...},"snapshot":{...}}\n\n   (instantly)
//   data: {"type":"delta","text":"..."}\n\n                    (per narrative token)
//   data: {"type":"done"}\n\n                                  (stream end)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const roomCodeRaw = (body?.roomCode ?? "").toString();
  const playerNameRaw = (body?.playerName ?? "").toString();
  const actionRaw = (body?.action ?? "").toString();
  // Optional `lang` — instructs the DM which language to narrate in.
  const langRaw = (body?.lang ?? "").toString();
  const lang: Lang = VALID_LANGS.includes(langRaw as Lang) ? (langRaw as Lang) : defaultLang();

  // ===== Validation (item 26) =====
  const roomCodeError = validateRoomCode(roomCodeRaw);
  if (roomCodeError) {
    metrics.recordApiRequest(false);
    return new Response(
      JSON.stringify({ ok: false, error: roomCodeError }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  const playerNameError = validatePlayerName(playerNameRaw);
  if (playerNameError) {
    metrics.recordApiRequest(false);
    return new Response(
      JSON.stringify({ ok: false, error: playerNameError }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  const actionError = validateActionText(actionRaw);
  if (actionError) {
    metrics.recordApiRequest(false);
    return new Response(
      JSON.stringify({ ok: false, error: actionError }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const roomCode = roomCodeRaw.toUpperCase().trim();
  const playerName = playerNameRaw.trim().replace(/\s+/g, " ").slice(0, 20);
  const action = actionRaw.trim().slice(0, 500);

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
        const mech = await resolvePlayerMechanics(roomCode, playerName, action, lang);
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
        }, lang)) {
          full += chunk;
          send({ type: "delta", text: chunk });
        }

        // 3. Persist the DM narrative, then signal done.
        // Sanitize LLM output before storing (defense-in-depth, item 26).
        const room = await db.room.findUnique({ where: { code: roomCode } });
        if (room) {
          const persistedContent = sanitizeLLMOutput(full || mech.branchNarrative);
          await db.chatMessage.create({
            data: {
              roomId: room.id,
              role: "dm",
              speaker: "",
              round: mech.round,
              content: persistedContent,
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
