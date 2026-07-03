/**
 * Structured JSON logger with level filtering.
 *
 * Filter by the LOG_LEVEL env var (default "info"):
 *   debug < info < warn < error
 *
 * Every log line is a single JSON object on stderr/stdout so it can be picked
 * up by any log aggregator (Loki, Datadog, journald, etc.).
 *
 *   { ts, level, msg, ...meta }
 *
 * Usage:
 *   import { logger } from "@/lib/game/logger";
 *   logger.info("room created", { roomCode, hostName });
 *   logger.warn("slow LLM call", { ms, model });
 *   logger.error("action failed", { error: e.message, roomCode });
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function readEnvLevel(): LogLevel {
  const raw = (typeof process !== "undefined" && process.env?.LOG_LEVEL) || "info";
  const lower = String(raw).toLowerCase();
  if (lower === "debug" || lower === "info" || lower === "warn" || lower === "error") {
    return lower;
  }
  return "info";
}

const CURRENT_LEVEL: LogLevel = readEnvLevel();

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[CURRENT_LEVEL];
}

function serializeError(e: unknown): Record<string, unknown> {
  if (e instanceof Error) {
    return { name: e.name, message: e.message, stack: e.stack };
  }
  if (typeof e === "string") return { message: e };
  if (e && typeof e === "object") return e as Record<string, unknown>;
  return { value: String(e) };
}

/** Low-level structured log function. */
export function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg: message,
  };
  if (meta) {
    for (const [k, v] of Object.entries(meta)) {
      if (v === undefined) continue;
      if (v instanceof Error) {
        entry[k] = serializeError(v);
      } else {
        entry[k] = v;
      }
    }
  }
  // errors + warns go to stderr; info + debug to stdout.
  if (level === "error" || level === "warn") {
    process.stderr.write(JSON.stringify(entry) + "\n");
  } else {
    process.stdout.write(JSON.stringify(entry) + "\n");
  }
}

/** Public logger facade — drop-in replacement for ad-hoc console.* calls. */
export const logger = {
  debug(message: string, meta?: Record<string, unknown>) {
    log("debug", message, meta);
  },
  info(message: string, meta?: Record<string, unknown>) {
    log("info", message, meta);
  },
  warn(message: string, meta?: Record<string, unknown>) {
    log("warn", message, meta);
  },
  error(message: string, meta?: Record<string, unknown>) {
    log("error", message, meta);
  },
};

/** Wrap an async function: logs + rethrows on error, logs duration on success. */
export async function withLogging<T>(
  label: string,
  fn: () => Promise<T>,
  meta?: Record<string, unknown>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    logger.debug(label, { ...meta, ms: Date.now() - start });
    return result;
  } catch (e) {
    logger.error(label + " failed", { ...meta, ms: Date.now() - start, error: serializeError(e) });
    throw e;
  }
}
