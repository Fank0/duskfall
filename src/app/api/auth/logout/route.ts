import { NextResponse } from "next/server";
import { buildClearSessionCookie } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// POST /api/auth/logout
// Clears the session cookie. Always returns ok (idempotent).
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", buildClearSessionCookie());
  return res;
}
