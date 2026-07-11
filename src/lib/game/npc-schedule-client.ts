// B6: Client-safe pure helpers for NPC schedules.
//
// This module is the client-side subset of `npc-schedule.ts`. It contains ONLY
// pure functions that take an `NpcState` (already in the client snapshot) and
// return derived info — no DB access, no server imports. The server-side
// `npc-schedule.ts` re-uses these same functions (re-exports them) so the
// behavior is identical between client and server.
//
// Why split? `npc-schedule.ts` imports from `./state` which imports
// `@/lib/db` (server-only). The browser cannot import `@/lib/db`, so any
// client component that wants to compute schedule status must use THIS file
// instead.

import type { NpcState, NpcScheduleEntry, TimeOfDay } from "./types";

/** Returns the schedule entry active for the given NPC at `timeOfDay`, or null. */
export function getNpcActiveSchedule(
  npc: Pick<NpcState, "schedule">,
  timeOfDay: TimeOfDay | string
): NpcScheduleEntry | null {
  if (!npc.schedule || npc.schedule.length === 0) return null;
  return npc.schedule.find((e) => e.timeOfDay === timeOfDay) ?? null;
}

/** True when the activity text indicates the NPC is sleeping. */
export function isActivitySleeping(activity: string): boolean {
  const lc = (activity || "").toLowerCase();
  return (
    lc.includes("сон") ||
    lc.includes("спит") ||
    lc.includes("sleep") ||
    lc.includes("отдыхает в постел")
  );
}

/** True when the activity text indicates the NPC is busy (but not sleeping). */
export function isActivityBusy(activity: string): boolean {
  const lc = (activity || "").toLowerCase();
  return lc.includes("занят") || lc.includes("busy");
}

/** Returns a small status object describing whether the NPC is available for
 *  dialogue right now. Pure — safe to call from any client component. */
export function isNpcUnavailableForDialogue(
  npc: Pick<NpcState, "name" | "schedule">,
  timeOfDay: TimeOfDay | string
): { unavailable: boolean; reason?: string; activity?: string; location?: string } {
  const entry = getNpcActiveSchedule(npc, timeOfDay);
  if (!entry) return { unavailable: false };
  if (isActivitySleeping(entry.activity)) {
    return {
      unavailable: true,
      reason: `💤 ${npc.name} сейчас спит. Вернитесь утром.`,
      activity: entry.activity,
      location: entry.location,
    };
  }
  if (isActivityBusy(entry.activity)) {
    return {
      unavailable: true,
      reason: `🛑 ${npc.name} сейчас занят: ${entry.activity}. Вернитесь попозже.`,
      activity: entry.activity,
      location: entry.location,
    };
  }
  return {
    unavailable: false,
    activity: entry.activity,
    location: entry.location,
  };
}

/**
 * Returns all quests available right now from any NPC, based on each NPC's
 * active schedule entry for `timeOfDay`. Pure — safe for the client.
 */
export function getScheduledQuests(
  npcs: NpcState[],
  timeOfDay: TimeOfDay | string
): Array<{ npcName: string; questTitle: string }> {
  const out: Array<{ npcName: string; questTitle: string }> = [];
  for (const n of npcs) {
    const entry = getNpcActiveSchedule(n, timeOfDay);
    if (!entry || !entry.availableQuests) continue;
    if (isActivitySleeping(entry.activity)) continue;
    if (isActivityBusy(entry.activity)) continue;
    for (const title of entry.availableQuests) {
      if (title && title.trim()) {
        out.push({ npcName: n.name, questTitle: title.trim() });
      }
    }
  }
  return out;
}
