import { NextRequest, NextResponse } from "next/server";
import { getAccountFromRequest } from "@/lib/auth/get-account";

export const dynamic = "force-dynamic";

// GET /api/auth/me
// Returns the currently-authenticated account, or 401.
export async function GET(req: NextRequest) {
  const account = await getAccountFromRequest(req.headers.get("cookie"));
  if (!account) {
    return NextResponse.json(
      { ok: false, error: "Не авторизован." },
      { status: 401 }
    );
  }
  return NextResponse.json({
    ok: true,
    accountId: account.id,
    username: account.username,
  });
}
