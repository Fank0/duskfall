import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { metrics } from "@/lib/game/metrics";
import { logger } from "@/lib/game/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Returns a structured health report: process uptime, in-memory metrics
 * (LLM calls + avg latency, API request counts, error counts), memory usage,
 * and the current number of active rooms in the DB. The DB ping doubles as a
 * readiness check — if SQLite is unreachable, status is "degraded".
 *
 * Response shape:
 *   {
 *     ok: true,
 *     status: "ok" | "degraded",
 *     ts: string,
 *     uptimeSec: number,
 *     metrics: { llmCalls, llmErrors, llmAvgMs, llmLastMs, apiRequests, apiErrors, errors, activeRooms, memoryHeapMb },
 *     db: "ok" | "error"
 *   }
 */
export async function GET() {
  const snap = metrics.snapshot();
  let dbStatus: "ok" | "error" = "ok";
  let activeRooms = 0;
  try {
    activeRooms = await db.room.count();
    metrics.setActiveRooms(activeRooms);
  } catch (e) {
    dbStatus = "error";
    logger.warn("health: DB count failed", {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  const status: "ok" | "degraded" = dbStatus === "ok" ? "ok" : "degraded";
  return NextResponse.json(
    {
      ok: true,
      status,
      ts: snap.ts,
      uptimeSec: snap.uptimeSec,
      metrics: {
        llmCalls: snap.llmCalls,
        llmErrors: snap.llmErrors,
        llmAvgMs: snap.llmAvgMs,
        llmLastMs: snap.llmLastMs,
        apiRequests: snap.apiRequests,
        apiErrors: snap.apiErrors,
        errors: snap.errors,
        activeRooms,
        memoryHeapMb: snap.memoryHeapMb,
      },
      db: dbStatus,
    },
    { status: status === "ok" ? 200 : 503 }
  );
}
