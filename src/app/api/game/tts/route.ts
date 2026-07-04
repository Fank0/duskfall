import { NextRequest, NextResponse } from "next/server";
import { rateLimit, rateLimitedResponse, getClientIp } from "@/lib/game/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 20 TTS requests per 10 minutes per IP.
const ttsLimiter = rateLimit({ windowMs: 10 * 60_000, max: 20, label: "tts" });

const SUPPORTED_LANGS = new Set(["ru", "en", "es", "de", "fr", "zh"]);
const MAX_TEXT_LENGTH = 500;

const VOICE_MAP: Record<string, string> = {
  male: "tongtong",
  female: "chuichui",
  narrator: "luodo",
};

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
    const ip = getClientIp(req);
    const rl = ttsLimiter.check(`tts:${ip}`);
    if (!rl.ok) {
      return rateLimitedResponse("tts", rl.retryAfterMs) as unknown as NextResponse;
    }

    const body = await req.json().catch(() => ({}));
    const text = (body?.text ?? "").toString();
    const langRaw = (body?.lang ?? "ru").toString().toLowerCase().trim();
    const voiceKey = (body?.voice ?? "male").toString().toLowerCase().trim();
    const lang = SUPPORTED_LANGS.has(langRaw) ? langRaw : "ru";
    const voice = VOICE_MAP[voiceKey] ?? VOICE_MAP.male;

    if (!text.trim()) {
      return NextResponse.json({ ok: false, error: "Нет текста для озвучки." }, { status: 400 });
    }

    const prepared = prepareText(text);
    if (!prepared) {
      return NextResponse.json({ ok: false, error: "Нет текста для озвучки." }, { status: 400 });
    }

    // Use z.ai GLM TTS API directly via HTTP (no SDK dependency)
    const glmKey = process.env.GLM_API_KEY || process.env.LLM_API_KEY || "";
    if (!glmKey) {
      return NextResponse.json(
        { ok: false, error: "TTS недоступен — не задан GLM_API_KEY." },
        { status: 503 }
      );
    }

    const baseUrl = process.env.GLM_BASE_URL || "https://api.z.ai/api/paas/v4";

    let audioBuffer: Buffer | null = null;
    let contentType = "audio/wav";
    try {
      const response = await fetch(`${baseUrl}/audio/tts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${glmKey}`,
        },
        body: JSON.stringify({
          input: prepared,
          voice,
          speed: 1.0,
          response_format: "wav",
          stream: false,
        }),
        signal: req.signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        console.error("[api/game/tts] GLM TTS error:", response.status, errText.slice(0, 200));
        return NextResponse.json(
          { ok: false, error: `TTS ошибка: ${response.status}` },
          { status: 502 }
        );
      }

      const ct = response.headers?.get?.("content-type");
      if (ct && ct.trim()) contentType = ct.trim();
      const arrayBuffer = await response.arrayBuffer();
      audioBuffer = Buffer.from(new Uint8Array(arrayBuffer));
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        console.error("[api/game/tts] synthesis failed:", e?.message?.slice(0, 120));
      }
      return NextResponse.json(
        { ok: false, error: "Не удалось сгенерировать голос." },
        { status: 500 }
      );
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Не удалось сгенерировать голос." },
        { status: 500 }
      );
    }

    const audioBytes = new Uint8Array(audioBuffer);
    return new NextResponse(audioBytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": audioBuffer.length.toString(),
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-TTS-Lang": lang,
        "X-TTS-Voice": voiceKey,
      },
    });
  } catch (e: any) {
    console.error("[api/game/tts] error:", e);
    return NextResponse.json(
      { ok: false, error: "Ошибка синтеза голоса." },
      { status: 500 }
    );
  }
}
