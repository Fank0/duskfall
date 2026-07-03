/**
 * Session helpers — HMAC-SHA256 signed cookies for account authentication.
 *
 * Design:
 *   - The session cookie value is `<accountId>.<hexSignature>`.
 *   - The signature is HMAC-SHA256(accountId, SESSION_SECRET).
 *   - Verification = recompute the signature and constant-time-compare.
 *
 * `SESSION_SECRET` is read from env. If unset, we generate an ephemeral
 * random secret per process and log a warning — this means sessions don't
 * survive a restart in dev, but the app still runs (and the build never
 * fails for a missing env var).
 *
 * Cookie attributes: httpOnly, SameSite=Lax, Secure in production, 30-day
 * max-age. Path=/.
 */

const COOKIE_NAME = "duskfall_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

let ephemeralSecret: string | null = null;

/**
 * Resolve the session secret. If `SESSION_SECRET` is set in env, use it.
 * Otherwise generate an ephemeral 64-byte hex string (insecure across
 * restarts — we log a warning).
 */
function getSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
  }
  if (!ephemeralSecret) {
    // 64 bytes of randomness, hex-encoded = 128 chars.
    const bytes = new Uint8Array(64);
    crypto.getRandomValues(bytes);
    ephemeralSecret = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    console.warn(
      "[auth] SESSION_SECRET not set — generated an ephemeral secret. " +
        "Sessions will NOT survive a process restart. Set SESSION_SECRET in production."
    );
  }
  return ephemeralSecret;
}

/** Hex-encode a byte array. */
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Compute HMAC-SHA256(message, secret) as a hex string. */
async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return toHex(new Uint8Array(sig));
}

/** Sign an accountId → `<accountId>.<hexSig>`. */
export async function signAccountId(accountId: string): Promise<string> {
  const sig = await hmacSha256Hex(accountId, getSecret());
  return `${accountId}.${sig}`;
}

/**
 * Verify a signed session value → returns the accountId on success, or null
 * if the signature is missing/malformed/doesn't match.
 */
export async function verifySigned(signed: string): Promise<string | null> {
  const dot = signed.indexOf(".");
  if (dot <= 0 || dot >= signed.length - 1) return null;
  const accountId = signed.slice(0, dot);
  const sig = signed.slice(dot + 1);
  if (!accountId || !sig) return null;
  const expected = await hmacSha256Hex(accountId, getSecret());
  if (!timingSafeEqual(sig, expected)) return null;
  return accountId;
}

/** Build a Set-Cookie header value for a freshly authenticated account. */
export async function buildSessionCookie(accountId: string): Promise<string> {
  const value = await signAccountId(accountId);
  const parts = [
    `${COOKIE_NAME}=${value}`,
    "Path=/",
    `Max-Age=${MAX_AGE_SECONDS}`,
    "SameSite=Lax",
    "HttpOnly",
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

/** Build a Set-Cookie header value that clears the session cookie. */
export function buildClearSessionCookie(): string {
  const parts = [
    `${COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "SameSite=Lax",
    "HttpOnly",
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

/** Cookie name (re-exported so routes can read/delete it). */
export const SESSION_COOKIE_NAME = COOKIE_NAME;

/**
 * Read the signed session value from a Cookie header string and return the
 * verified accountId (or null).
 *
 * Works in route handlers where we only have a raw `cookie` header — we
 * don't depend on Next's async `cookies()` helper.
 */
export async function readSessionAccountId(cookieHeader: string | null): Promise<string | null> {
  if (!cookieHeader) return null;
  // Cookie header looks like: "a=1; b=2; duskfall_session=<value>"
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k === COOKIE_NAME && v) {
      try {
        return await verifySigned(v);
      } catch {
        return null;
      }
    }
  }
  return null;
}
