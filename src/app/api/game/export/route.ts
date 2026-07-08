import { NextRequest, NextResponse } from "next/server";
import { exportRoom } from "@/lib/game/save-load";

export const dynamic = "force-dynamic";

// GET /api/game/export?room=CODE
// Returns the full room state as a downloadable JSON file (SaveFile format).
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const roomCode = (url.searchParams.get("room") ?? "").toString().toUpperCase().trim();
  if (!roomCode) {
    return NextResponse.json({ ok: false, error: "Укажите код комнаты." }, { status: 400 });
  }
  const save = await exportRoom(roomCode);
  if (!save) {
    return NextResponse.json({ ok: false, error: "Комната не найдена." }, { status: 404 });
  }
  // Return as a downloadable .json attachment.
  const filename = `duskfall-${roomCode}-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(save, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
