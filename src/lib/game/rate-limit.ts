/**
 * In-memory sliding-window rate limiter.
 *
 * Designed for single-instance deployments (Caddy → Next.js). The window is a
 * simple counter that resets every `windowMs` ms — no Redis, no DB. Each
 * bucket key is opaque (typically an IP or `roomCode:playerName`).
 *
 * Usage:
 *   const rl = rateLimit({ windowMs: 60_000, max: 10 });
 *   const res = rl.check("player:ABCDEF:Алдрик");
 *   if (!res.ok) return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
 *
 * Bucket state is pruned lazily on every check — no background timer.
 */

export interface RateLimitOptions {
  /** Window size in milliseconds. */
  windowMs: number;
  /** Maximum number of requests allowed per window. */
  max: number;
  /** Optional: bucket id prefix used in error messages (e.g. "actions"). */
  label?: string;
}

export interface RateLimitResult {
  ok: boolean;
  /** Remaining requests in the current window. */
  remaining: number;
  /** ms until the window resets and the counter clears. */
  retryAfterMs: number;
  /** Total requests in the current window so far. */
  count: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private readonly windowMs: number;
  private readonly max: number;
  private readonly label: string;

  constructor(opts: RateLimitOptions) {
    this.windowMs = opts.windowMs;
    this.max = opts.max;
    this.label = opts.label ?? "requests";
  }

  /** Check + consume one unit from the bucket. Returns whether it's allowed. */
  check(key: string): RateLimitResult {
    const now = Date.now();
    // Lazy global prune: drop expired buckets occasionally to bound memory.
    if (this.buckets.size > 5000) {
      for (const [k, b] of this.buckets) {
        if (b.resetAt <= now) this.buckets.delete(k);
      }
    }
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      const resetAt = now + this.windowMs;
      this.buckets.set(key, { count: 1, resetAt });
      return { ok: true, remaining: this.max - 1, retryAfterMs: this.windowMs, count: 1 };
    }
    existing.count += 1;
    const remaining = Math.max(0, this.max - existing.count);
    const ok = existing.count <= this.max;
    return {
      ok,
      remaining,
      retryAfterMs: Math.max(0, existing.resetAt - now),
      count: existing.count,
    };
  }

  /** Inspect a bucket without consuming. */
  peek(key: string): RateLimitResult {
    const now = Date.now();
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      return { ok: true, remaining: this.max, retryAfterMs: this.windowMs, count: 0 };
    }
    return {
      ok: existing.count <= this.max,
      remaining: Math.max(0, this.max - existing.count),
      retryAfterMs: Math.max(0, existing.resetAt - now),
      count: existing.count,
    };
  }

  /** Human-readable label for error messages. */
  getLabel(): string {
    return this.label;
  }
}

/**
 * Factory: returns a singleton RateLimiter per `label`. Subsequent calls with
 * the same label return the same instance — so module-level callers can do:
 *
 *   const limiter = rateLimit({ windowMs: 60_000, max: 10, label: "actions" });
 *
 * and the limiter state survives across requests.
 */
const registry = new Map<string, RateLimiter>();

export function rateLimit(opts: RateLimitOptions): RateLimiter {
  const label = opts.label ?? "default";
  const existing = registry.get(label);
  if (existing) return existing;
  const rl = new RateLimiter(opts);
  registry.set(label, rl);
  return rl;
}

/** Extract a client IP from a Next.js request (handles Caddy proxying). */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",");
    return parts[0].trim();
  }
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}

/** Build a 429 response with a Russian message and Retry-After header. */
export function rateLimitedResponse(label: string, retryAfterMs: number): Response {
  const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return new Response(
    JSON.stringify({
      ok: false,
      error: `Слишком много запросов («${label}»). Повторите через ${retryAfterSec} с.`,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec),
      },
    }
  );
}
