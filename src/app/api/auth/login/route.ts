import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { buildSessionCookie } from "@/lib/auth/session";
import { rateLimit, rateLimitedResponse, getClientIp } from "@/lib/game/rate-limit";
import { logger } from "@/lib/game/logger";

export const dynamic = "force-dynamic";

// 5 login attempts per 10 minutes per IP.
const loginLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 5, label: "auth-login" });

// POST /api/auth/login
// Body: { username, password }
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = loginLimiter.check(`login:${ip}`);
    if (!rl.ok) {
      logger.warn("auth/login rate-limited", { ip, count: rl.count });
      return rateLimitedResponse("auth-login", rl.retryAfterMs) as unknown as NextResponse;
    }

    const body = await req.json().catch(() => ({}));
    const username = (body?.username ?? "").toString().trim();
    const password = (body?.password ?? "").toString();

    if (!username || !password) {
      return NextResponse.json(
        { ok: false, error: "Введите имя пользователя и пароль." },
        { status: 400 }
      );
    }

    const account = await db.account.findUnique({ where: { username } });
    // Always run bcrypt against a dummy hash if the account is missing, so
    // response timing doesn't leak which usernames exist.
    const dummyHash = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8eVjP3wW6PvWQXjQpQJ8bK1IcSuDq2";
    const hashToCompare = account?.passwordHash ?? dummyHash;
    const passwordOk = await bcrypt.compare(password, hashToCompare);

    if (!account || !passwordOk) {
      return NextResponse.json(
        { ok: false, error: "Неверное имя пользователя или пароль." },
        { status: 401 }
      );
    }

    const setCookie = await buildSessionCookie(account.id);
    logger.info("account logged in", { accountId: account.id, username, ip });

    const res = NextResponse.json(
      { ok: true, accountId: account.id, username: account.username }
    );
    res.headers.set("Set-Cookie", setCookie);
    return res;
  } catch (e: any) {
    console.error("[api/auth/login] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Не удалось войти." },
      { status: 500 }
    );
  }
}
