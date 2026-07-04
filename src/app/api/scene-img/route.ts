import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

// GET /api/scene-img?file=scene_1234567890.png
// Serves a generated scene image from /tmp/duskfall-scenes/ (writable at runtime,
// unlike public/ which is baked into the standalone build).
export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get("file");
  if (!file || !/^scene_\d+\.png$/.test(file)) {
    return new Response("Not found", { status: 404 });
  }
  const dir = "/tmp/duskfall-scenes";
  const filePath = path.join(dir, file);
  try {
    if (!fs.existsSync(filePath)) {
      return new Response("Not found", { status: 404 });
    }
    const buf = fs.readFileSync(filePath);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
