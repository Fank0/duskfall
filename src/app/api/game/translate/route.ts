import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chatComplete, type ChatMessage as LLMChatMessage } from "@/lib/game/llm";
import { sanitizeLLMOutput } from "@/lib/game/sanitize";
import { logger } from "@/lib/game/logger";
import { rateLimit, rateLimitedResponse, getClientIp } from "@/lib/game/rate-limit";
import { validateRoomCode } from "@/lib/game/validate";

export const dynamic = "force-dynamic";

// Translate up to 500 messages per call. The previous cap of 50 meant that
// longer chat histories only had their first 50 messages translated — older
// messages stayed in the original language and the chat read inconsistently.
// 500 covers any realistic session length while keeping a sane upper bound
// to prevent runaway LLM spend.
const MAX_MESSAGES_PER_BATCH = 500;

// 5 translations per hour per IP (audit-v2: each translation spawns up to 50 LLM calls).
const translateLimiter = rateLimit({ windowMs: 60 * 60_000, max: 5, label: "translate" });

// POST /api/game/translate
// Body: { roomCode, lang }
// Batch-translates all existing chat messages in the room to the target
// language using the LLM. Each message is overwritten in place.
//
// This is intentionally simple — one LLM call per message, sequential, no
// retries beyond what chatComplete already does.
export async function POST(req: NextRequest) {
  try {
    // ===== Rate limit (audit-v2): 5 / hour / IP. =====
    const ip = getClientIp(req);
    const rl = translateLimiter.check(`translate:${ip}`);
    if (!rl.ok) {
      return rateLimitedResponse("translate", rl.retryAfterMs) as unknown as NextResponse;
    }

    const body = await req.json().catch(() => ({}));
    const roomCodeRaw = (body?.roomCode ?? "").toString();
    const lang = (body?.lang ?? "").toString().trim();

    const roomCodeError = validateRoomCode(roomCodeRaw);
    if (roomCodeError) {
      return NextResponse.json({ ok: false, error: roomCodeError }, { status: 400 });
    }
    if (!lang) {
      return NextResponse.json(
        { ok: false, error: "Укажите целевой язык." },
        { status: 400 }
      );
    }

    const roomCode = roomCodeRaw.toUpperCase().trim();
    const room = await db.room.findUnique({ where: { code: roomCode } });
    if (!room) {
      return NextResponse.json(
        { ok: false, error: "Комната не найдена." },
        { status: 404 }
      );
    }

    const messages = await db.chatMessage.findMany({
      where: { roomId: room.id },
      orderBy: { createdAt: "asc" },
      take: MAX_MESSAGES_PER_BATCH,
    });

    let translated = 0;
    let skipped = 0;
    for (const msg of messages) {
      // Skip empty / system-only / non-DM messages? We translate everything
      // that has non-empty content so the whole log reads in the target lang.
      if (!msg.content || !msg.content.trim()) {
        skipped++;
        continue;
      }
      const llmMessages: LLMChatMessage[] = [
        {
          role: "system",
          content:
            "You are a professional literary translator for a dark-fantasy tabletop RPG. " +
            "Translate the user's text into the target language. Preserve tone, names, " +
            "dice notations (like 1d20+3), and any HTML/markdown structure. " +
            "Output ONLY the translated text — no commentary, no quotes.",
        },
        {
          role: "user",
          content: `Target language: ${lang}\n\nText to translate:\n${msg.content}`,
        },
      ];
      try {
        const translatedText = await chatComplete(llmMessages, req.signal, true);
        const clean = sanitizeLLMOutput(translatedText ?? "").trim();
        if (clean && clean !== msg.content) {
          await db.chatMessage.update({
            where: { id: msg.id },
            data: { content: clean },
          });
          translated++;
        } else {
          skipped++;
        }
      } catch (e: any) {
        // AbortError is expected on client disconnect — break out of the loop.
        if (e?.name === "AbortError") break;
        logger.warn("translate: message LLM call failed", {
          messageId: msg.id,
          err: (e as Error)?.message?.slice(0, 80),
        });
        skipped++;
      }
    }

    logger.info("translate batch done", {
      roomCode,
      lang,
      total: messages.length,
      translated,
      skipped,
    });

    return NextResponse.json({
      ok: true,
      roomCode,
      lang,
      total: messages.length,
      translated,
      skipped,
    });
  } catch (e: any) {
    console.error("[api/game/translate] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Не удалось перевести сообщения." },
      { status: 500 }
    );
  }
}
