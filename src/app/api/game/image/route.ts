import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import fs from "fs";
import path from "path";
import { setActiveScene, getRoomByCode } from "@/lib/game/state";
import { rateLimit, rateLimitedResponse, getClientIp } from "@/lib/game/rate-limit";
import { validateShortString } from "@/lib/game/validate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SCENES_DIR = path.join(process.cwd(), "public", "scenes");
// Temp staging directory used by scene-image generation. Old files here are
// pruned after each new generation so the disk doesn't fill up.
const TMP_SCENES_DIR = "/tmp/duskfall-scenes";
const SCENE_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

// 5 image generations per 10 minutes per IP (audit-v2: image gen is expensive).
const imageLimiter = rateLimit({ windowMs: 10 * 60_000, max: 5, label: "image-gen" });

let zaiPromise: Promise<any> | null = null;
async function getZAI() {
  if (!zaiPromise) zaiPromise = ZAI.create();
  return zaiPromise;
}

/** Fire-and-forget: delete scene files older than 1 hour from the tmp scenes dir.
 *  Safe to call even if the directory doesn't exist (no-op). */
function cleanupOldTmpScenes(): void {
  // Defer to the next tick so we don't block the response.
  setImmediate(async () => {
    try {
      let files: string[] = [];
      try {
        files = fs.readdirSync(TMP_SCENES_DIR);
      } catch {
        return; // dir doesn't exist — nothing to clean.
      }
      const now = Date.now();
      for (const file of files) {
        const full = path.join(TMP_SCENES_DIR, file);
        try {
          const stat = fs.statSync(full);
          if (stat.isFile() && now - stat.mtimeMs > SCENE_MAX_AGE_MS) {
            fs.unlinkSync(full);
          }
        } catch {
          /* skip individual file errors */
        }
      }
    } catch {
      /* swallow — fire-and-forget cleanup must never break the request */
    }
  });
}

// POST /api/game/image
// Body: { roomCode: string, prompt: string, title?: string }
export async function POST(req: NextRequest) {
  try {
    // ===== Rate limit (audit-v2): 5 / 10 min / IP. =====
    const ip = getClientIp(req);
    const rl = imageLimiter.check(`image-gen:${ip}`);
    if (!rl.ok) {
      return rateLimitedResponse("image-gen", rl.retryAfterMs) as unknown as NextResponse;
    }

    const body = await req.json().catch(() => ({}));
    const roomCode = (body?.roomCode ?? "").toString().toUpperCase().trim();
    const prompt = (body?.prompt ?? "").toString().trim();
    const title = (body?.title ?? "Сцена").toString();
    if (!roomCode) {
      return NextResponse.json({ ok: false, error: "Укажите комнату." }, { status: 400 });
    }
    const promptError = validateShortString(prompt, "Запрос сцены");
    if (promptError) {
      return NextResponse.json({ ok: false, error: promptError }, { status: 400 });
    }
    const room = await getRoomByCode(roomCode);
    if (!room) {
      return NextResponse.json({ ok: false, error: "Комната не найдена." }, { status: 404 });
    }

    if (!fs.existsSync(SCENES_DIR)) fs.mkdirSync(SCENES_DIR, { recursive: true });
    const zai = await getZAI();
    const fullPrompt = `${prompt}, dark fantasy, moody atmospheric lighting, painterly digital concept art, highly detailed, cinematic, dramatic shadows`;

    let imageUrl = "";
    try {
      // Pass the request AbortSignal so a client disconnect cancels the SDK call.
      const response = await zai.images.generations.create(
        { prompt: fullPrompt, size: "1024x1024" },
        { signal: req.signal }
      );
      const base64 = response.data?.[0]?.base64;
      if (base64) {
        const filename = `scene_${Date.now()}.png`;
        fs.writeFileSync(path.join(SCENES_DIR, filename), Buffer.from(base64, "base64"));
        imageUrl = `/scenes/${filename}`;
      }
    } catch (e: any) {
      // AbortError is expected when the client disconnects — don't log it as an error.
      if (e?.name !== "AbortError") {
        console.error("[api/game/image] generation failed:", e);
      }
    }
    if (!imageUrl) {
      return NextResponse.json({ ok: false, error: "Не удалось сгенерировать изображение." }, { status: 500 });
    }
    await setActiveScene(room.id, imageUrl, fullPrompt, title);
    // Fire-and-forget cleanup of stale scene files from the tmp staging dir.
    cleanupOldTmpScenes();
    return NextResponse.json({ ok: true, imageUrl, prompt: fullPrompt, title });
  } catch (e: any) {
    console.error("[api/game/image] error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Ошибка генерации изображения." }, { status: 500 });
  }
}
