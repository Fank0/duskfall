/**
 * In-memory metrics collector for DUSKFALL.
 *
 * Tracks the high-level signals we care about for /api/health:
 *   - llmCalls: total count of LLM completions attempted
 *   - llmErrors: count of LLM call failures (after all retries exhausted)
 *   - llmAvgMs: rolling average latency of LLM calls
 *   - llmLastMs: latency of the most recent LLM call
 *   - apiRequests: total count of API requests served
 *   - apiErrors: count of API requests that returned >=500
 *   - errors: count of uncaught errors / thrown exceptions
 *   - activeRooms: current number of rooms in the DB (set externally)
 *
 * All counters are in-process (per-instance). For a multi-instance deployment
 * you'd swap this for a real metrics backend (Prometheus, StatsD). For a
 * single-instance Caddy-fronted deployment this is plenty.
 */

import { logger } from "./logger";

export interface MetricsSnapshot {
  /** ISO timestamp of this snapshot. */
  ts: string;
  /** Process uptime in seconds. */
  uptimeSec: number;
  llmCalls: number;
  llmErrors: number;
  llmAvgMs: number;
  llmLastMs: number;
  apiRequests: number;
  apiErrors: number;
  errors: number;
  activeRooms: number;
  /** Memory usage in bytes (heap). */
  memoryHeapMb: number;
}

class MetricsCollector {
  private llmCalls = 0;
  private llmErrors = 0;
  private llmTotalMs = 0;
  private llmLastMs = 0;
  private apiRequests = 0;
  private apiErrors = 0;
  private errors = 0;
  private activeRooms = 0;
  private readonly startedAt = Date.now();

  /** Record an LLM call attempt. `ok=false` increments llmErrors. */
  recordLlmCall(ms: number, ok: boolean): void {
    this.llmCalls += 1;
    this.llmTotalMs += ms;
    this.llmLastMs = ms;
    if (!ok) this.llmErrors += 1;
  }

  /** Record an API request. `ok=false` (status >= 500) increments apiErrors. */
  recordApiRequest(ok: boolean): void {
    this.apiRequests += 1;
    if (!ok) this.apiErrors += 1;
  }

  /** Record a generic uncaught error. */
  recordError(): void {
    this.errors += 1;
  }

  /** Set the current number of active rooms (refreshed periodically). */
  setActiveRooms(n: number): void {
    this.activeRooms = n;
  }

  /** Snapshot the current metrics. */
  snapshot(): MetricsSnapshot {
    const heapMb =
      typeof process !== "undefined" && process.memoryUsage
        ? Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100
        : 0;
    return {
      ts: new Date().toISOString(),
      uptimeSec: Math.round((Date.now() - this.startedAt) / 1000),
      llmCalls: this.llmCalls,
      llmErrors: this.llmErrors,
      llmAvgMs: this.llmCalls > 0 ? Math.round(this.llmTotalMs / this.llmCalls) : 0,
      llmLastMs: this.llmLastMs,
      apiRequests: this.apiRequests,
      apiErrors: this.apiErrors,
      errors: this.errors,
      activeRooms: this.activeRooms,
      memoryHeapMb: heapMb,
    };
  }

  /** Convenience: wrap an LLM call with timing + error recording. */
  async trackLlmCall<T>(fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      this.recordLlmCall(Date.now() - start, true);
      return result;
    } catch (e) {
      this.recordLlmCall(Date.now() - start, false);
      logger.warn("LLM call failed (tracked by metrics)", {
        ms: Date.now() - start,
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }
}

/** Singleton metrics collector. */
export const metrics = new MetricsCollector();
