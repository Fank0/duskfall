// Scene image generation helper using Pollinations.ai (free, no API key).
// Saves to /tmp/duskfall-scenes/ (writable at runtime on Railway) and
// serves via /api/scene-img?file=...

import fs from "fs";
import path from "path";
import { setActiveScene } from "./state";

const SCENES_DIR = "/tmp/duskfall-scenes";

/**
 * Generate a single image from a prompt and persist it to the local scenes
 * directory. Returns `{ ok, imageUrl }` so callers (e.g. /api/game/portrait)
 * can stream the URL back to the client without needing a room context.
 *
 * This is the room-less counterpart to `generateSceneImage` — used for
 * player portraits and other one-off image requests that don't need to be
 * associated with the active scene of a room.
 */
export async function generateImage(
  prompt: string,
  signal?: AbortSignal
): Promise<{ ok: boolean; imageUrl?: string }> {
  try {
    const fullPrompt = `${prompt}, dark fantasy, moody atmospheric lighting, painterly digital concept art, highly detailed, cinematic, dramatic shadows`;
    const encoded = encodeURIComponent(fullPrompt.slice(0, 500));
    const seed = Math.floor(Math.random() * 1000000);
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&seed=${seed}&nologo=true&model=flux`;

    const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(90000) });
    if (!res.ok) return { ok: false };

    const buf = Buffer.from(new Uint8Array(await res.arrayBuffer()));
    if (buf.length < 1000) return { ok: false };

    if (!fs.existsSync(SCENES_DIR)) fs.mkdirSync(SCENES_DIR, { recursive: true });
    const filename = `img_${Date.now()}.png`;
    fs.writeFileSync(path.join(SCENES_DIR, filename), buf);
    // Serve via /api/scene-img (NOT /scenes/ — public/ is read-only in standalone)
    const imageUrl = `/api/scene-img?file=${filename}`;
    return { ok: true, imageUrl };
  } catch (e: any) {
    if (e?.name === "AbortError") return { ok: false };
    console.error("[scene-image] generateImage failed:", e?.message?.slice(0, 100));
    return { ok: false };
  }
}

export async function generateSceneImage(
  roomId: string,
  prompt: string,
  title: string,
  signal?: AbortSignal
): Promise<string | null> {
  try {
    const fullPrompt = `${prompt}, dark fantasy, moody atmospheric lighting, painterly digital concept art, highly detailed, cinematic, dramatic shadows`;
    const encoded = encodeURIComponent(fullPrompt.slice(0, 500));
    const seed = Math.floor(Math.random() * 1000000);
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&seed=${seed}&nologo=true&model=flux`;

    const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(90000) });
    if (!res.ok) return null;

    const buf = Buffer.from(new Uint8Array(await res.arrayBuffer()));
    if (buf.length < 1000) return null;

    if (!fs.existsSync(SCENES_DIR)) fs.mkdirSync(SCENES_DIR, { recursive: true });
    const filename = `scene_${Date.now()}.png`;
    fs.writeFileSync(path.join(SCENES_DIR, filename), buf);
    // Serve via /api/scene-img (NOT /scenes/ — public/ is read-only in standalone)
    const imageUrl = `/api/scene-img?file=${filename}`;
    await setActiveScene(roomId, imageUrl, fullPrompt, title);
    return imageUrl;
  } catch (e: any) {
    if (e?.name === "AbortError") return null;
    console.error("[scene-image] generation failed:", e?.message?.slice(0, 100));
    return null;
  }
}
