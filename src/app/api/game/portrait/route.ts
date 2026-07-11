import { NextRequest, NextResponse } from "next/server";
import { generateImage } from "@/lib/game/scene-image";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/game/portrait
 * Body: { race, charClass, background, gender }
 * Generates a character portrait via AI image generation.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const race = (body?.race ?? "human").toString();
    const charClass = (body?.charClass ?? "fighter").toString();
    const background = (body?.background ?? "soldier").toString();
    const gender = (body?.gender ?? "male").toString();

    const prompt = `Dark fantasy character portrait, ${gender} ${race} ${charClass}, ${background} background, painterly concept art, detailed face, atmospheric lighting, D&D 5e style, head and shoulders`;

    const result = await generateImage(prompt);
    if (result?.ok && result?.imageUrl) {
      return NextResponse.json({ ok: true, imageUrl: result.imageUrl });
    }
    return NextResponse.json({ ok: false, error: "Не удалось сгенерировать портрет." }, { status: 500 });
  } catch (e: any) {
    console.error("[api/game/portrait] error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
