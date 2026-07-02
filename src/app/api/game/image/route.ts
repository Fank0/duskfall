import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import fs from "fs";
import path from "path";
import { setActiveScene, getRoomByCode } from "@/lib/game/state";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SCENES_DIR = path.join(process.cwd(), "public", "scenes");

let zaiPromise: Promise<any> | null = null;
async function getZAI() {
  if (!zaiPromise) zaiPromise = ZAI.create();
  return zaiPromise;
}

// POST /api/game/image
// Body: { roomCode: string, prompt: string, title?: string }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const roomCode = (body?.roomCode ?? "").toString().toUpperCase().trim();
    const prompt = (body?.prompt ?? "").toString().trim();
    const title = (body?.title ?? "Сцена").toString();
    if (!roomCode || !prompt) {
      return NextResponse.json({ ok: false, error: "Укажите комнату и запрос." }, { status: 400 });
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
      const response = await zai.images.generations.create({ prompt: fullPrompt, size: "1024x1024" });
      const base64 = response.data?.[0]?.base64;
      if (base64) {
        const filename = `scene_${Date.now()}.png`;
        fs.writeFileSync(path.join(SCENES_DIR, filename), Buffer.from(base64, "base64"));
        imageUrl = `/scenes/${filename}`;
      }
    } catch (e) {
      console.error("[api/game/image] generation failed:", e);
    }
    if (!imageUrl) {
      return NextResponse.json({ ok: false, error: "Не удалось сгенерировать изображение." }, { status: 500 });
    }
    await setActiveScene(room.id, imageUrl, fullPrompt, title);
    return NextResponse.json({ ok: true, imageUrl, prompt: fullPrompt, title });
  } catch (e: any) {
    console.error("[api/game/image] error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Ошибка генерации изображения." }, { status: 500 });
  }
}
