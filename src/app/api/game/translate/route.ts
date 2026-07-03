import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chatComplete, type ChatMessage as LLMChatMessage } from "@/lib/game/llm";
import { sanitizeLLMOutput } from "@/lib/game/sanitize";
import { logger } from "@/lib/game/logger";

export const dynamic = "force-dynamic";

const MAX_MESSAGES_PER_BATCH = 50;

// POST /api/game/translate
// Body: { roomCode, lang }
// Batch-translates all existing chat messages in the room to the target
// language using the LLM. Each message is overwritten in place.
//
// This is intentionally simple — one LLM call per message, sequential, no
// retries beyond what chatComplete already does.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const roomCode = (body?.roomCode ?? "").toString().toUpperCase().trim();
    const lang = (body?.lang ?? "").toString().trim();

    if (!roomCode) {
      return NextResponse.json(
        { ok: false, error: "Укажите код комнаты." },
        { status: 400 }
      );
    }
    if (!lang) {
      return NextResponse.json(
        { ok: false, error: "Укажите целевой язык." },
        { status: 400 }
      );
    }

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
        const translatedText = await chatComplete(llmMessages, undefined, true);
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
