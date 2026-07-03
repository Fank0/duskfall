import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * TTS voice narration for the AI Dungeon Master (task tts-voice-dm).
 *
 * POST /api/game/tts
 * Body: { text: string, lang?: "ru"|"en"|"es"|"de"|"fr"|"zh", voice?: "male"|"female"|"narrator" }
 *
 * Returns: audio/mpeg stream synthesized from `text` via the z-ai-web-dev-sdk TTS.
 *
 * Notes:
 * - z-ai-web-dev-sdk MUST live in a server route only (never client-side).
 * - Input text is hard-capped at 500 characters (TTS is expensive — task spec).
 * - The SDK TTS engine auto-detects language from the input text, so `lang`
 *   is mainly used for logging/forward-compat. The internal SDK voice name is
 *   derived from the user-facing `voice` setting (male/female/narrator).
 */

/** Supported UI languages (kept in sync with src/lib/game/i18n.ts). */
const SUPPORTED_LANGS = new Set(["ru", "en", "es", "de", "fr", "zh"]);

/** Hard cap on input length — TTS is expensive (task spec). */
const MAX_TEXT_LENGTH = 500;

/**
 * Map the user-facing voice setting (male/female/narrator) to one of the
 * underlying z-ai TTS voices:
 *   tongtong  — warm, intimate     → Мужской
 *   chuichui  — lively, bright     → Женский
 *   luodo     — rich, infectious   → Рассказчик
 */
const VOICE_MAP: Record<string, string> = {
  male: "tongtong",
  female: "chuichui",
  narrator: "luodo",
};

let zaiPromise: Promise<any> | null = null;
async function getZAI() {
  if (!zaiPromise) zaiPromise = ZAI.create();
  return zaiPromise;
}

/**
 * Light text normalization before sending to TTS:
 * - collapse whitespace runs to a single space
 * - strip markdown bold/italic markers (`**`, `*`, `_`, `__`)
 * - strip leading/trailing quote chars that LLMs sometimes wrap around speech
 */
function prepareText(raw: string): string {
  let s = raw
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length > MAX_TEXT_LENGTH) s = s.slice(0, MAX_TEXT_LENGTH).trim();
  return s;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const text = (body?.text ?? "").toString();
    const langRaw = (body?.lang ?? "ru").toString().toLowerCase().trim();
    const voiceKey = (body?.voice ?? "male").toString().toLowerCase().trim();
    const lang = SUPPORTED_LANGS.has(langRaw) ? langRaw : "ru";
    const voice = VOICE_MAP[voiceKey] ?? VOICE_MAP.male;

    if (!text.trim()) {
      return NextResponse.json(
        { ok: false, error: "Нет текста для озвучки." },
        { status: 400 }
      );
    }

    const prepared = prepareText(text);
    if (!prepared) {
      return NextResponse.json(
        { ok: false, error: "Нет текста для озвучки." },
        { status: 400 }
      );
    }

    const zai = await getZAI();

    let audioBuffer: Buffer | null = null;
    try {
      const response = await zai.audio.tts.create({
        input: prepared,
        voice,
        speed: 1.0,
        response_format: "mp3",
        stream: false,
      });
      const arrayBuffer = await response.arrayBuffer();
      audioBuffer = Buffer.from(new Uint8Array(arrayBuffer));
    } catch (e) {
      console.error("[api/game/tts] synthesis failed:", e);
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Не удалось сгенерировать голос." },
        { status: 500 }
      );
    }

    // NextResponse expects a BodyInit (Uint8Array / ArrayBuffer / string),
    // not a Node Buffer — convert explicitly.
    const audioBytes = new Uint8Array(audioBuffer);
    return new NextResponse(audioBytes, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.length.toString(),
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-TTS-Lang": lang,
        "X-TTS-Voice": voiceKey,
      },
    });
  } catch (e: any) {
    console.error("[api/game/tts] error:", e);
    return NextResponse.json(
      { ok: false, error: "Ошибка синтеза голоса Мастера." },
      { status: 500 }
    );
  }
}
