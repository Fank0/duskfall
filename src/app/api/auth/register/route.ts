import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { buildSessionCookie } from "@/lib/auth/session";
import { rateLimit, rateLimitedResponse, getClientIp } from "@/lib/game/rate-limit";
import { logger } from "@/lib/game/logger";

export const dynamic = "force-dynamic";

// 3 registrations per 10 minutes per IP.
const registerLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 3, label: "auth-register" });

const USERNAME_RE = /^[A-Za-z0-9_]+$/;

/** Validate a register payload. Returns a Russian error string or null. */
function validateRegisterPayload(username: string, password: string): string | null {
  if (typeof username !== "string" || username.length < 3 || username.length > 20) {
    return "Имя пользователя должно быть от 3 до 20 символов.";
  }
  if (!USERNAME_RE.test(username)) {
    return "Имя пользователя может содержать только латинские буквы, цифры и знак подчёркивания.";
  }
  if (typeof password !== "string" || password.length < 8) {
    return "Пароль должен быть не короче 8 символов.";
  }
  if (password.length > 128) {
    return "Пароль слишком длинный (макс. 128 символов).";
  }
  if (/[\x00-\x1F\x7F\s]/.test(password)) {
    return "Пароль не должен содержать пробелов или управляющих символов.";
  }
  return null;
}

// POST /api/auth/register
// Body: { username, password }
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = registerLimiter.check(`register:${ip}`);
    if (!rl.ok) {
      logger.warn("auth/register rate-limited", { ip, count: rl.count });
      return rateLimitedResponse("auth-register", rl.retryAfterMs) as unknown as NextResponse;
    }

    const body = await req.json().catch(() => ({}));
    const username = (body?.username ?? "").toString().trim();
    const password = (body?.password ?? "").toString();

    const validationError = validateRegisterPayload(username, password);
    if (validationError) {
      return NextResponse.json({ ok: false, error: validationError }, { status: 400 });
    }

    // Username uniqueness check (case-sensitive — match the unique index).
    const existing = await db.account.findUnique({ where: { username } });
    if (existing) {
      return NextResponse.json(
        { ok: false, error: "Это имя пользователя уже занято." },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const account = await db.account.create({
      data: { username, passwordHash },
      select: { id: true, username: true },
    });

    const setCookie = await buildSessionCookie(account.id);
    logger.info("account registered", { accountId: account.id, username, ip });

    const res = NextResponse.json(
      { ok: true, accountId: account.id, username: account.username },
      { status: 201 }
    );
    res.headers.set("Set-Cookie", setCookie);
    return res;
  } catch (e: any) {
    console.error("[api/auth/register] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Не удалось зарегистрироваться." },
      { status: 500 }
    );
  }
}
