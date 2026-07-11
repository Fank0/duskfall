// B6: NPC daily schedule system.
//
// An NPC's schedule is an array of NpcScheduleEntry stored as JSON on the Npc
// row. Each entry says where the NPC is and what they're doing during a given
// time-of-day slot (dawn | day | dusk | night), and may unlock time-specific
// quests or supply a Russian hint that the DM LLM uses when generating
// in-character dialogue.
//
// This module is the SINGLE SOURCE OF TRUTH for schedule queries and the
// time-of-day tick that moves NPCs + offers their scheduled quests. It is
// imported by:
//   - state.ts (advanceExplorationTurn — calls applyScheduleForTimeOfDay when
//     the cycle advances)
//   - state.ts (getDMContext — uses getNpcActiveSchedule to annotate each NPC)
//   - dialogue/route.ts (uses getNpcActiveSchedule + isNpcUnavailableForDialogue
//     to block dialogue with sleeping/busy NPCs and to pass dialogueHint to LLM)
//
// The PURE read-only helpers (getNpcActiveSchedule, isNpcUnavailableForDialogue,
// isActivitySleeping, isActivityBusy, getScheduledQuests) live in
// `npc-schedule-client.ts` so client components can use them too (this file
// imports from `./state` which imports `@/lib/db` — server-only). This module
// re-exports them for server-side callers.
//
// All chat messages emitted here are written via db.chatMessage.create and all
// quests via createQuest (state.ts). The caller is responsible for invalidating
// the snapshot cache (we do it here too, defensively).

import { db } from "@/lib/db";
import type { NpcScheduleEntry, TimeOfDay } from "./types";
import {
  invalidateSnapshotCache,
  setNpcLocation,
  setNpcSchedule,
  createQuest,
  getLivingNpcs,
} from "./state";
// Pull in the pure client-safe helpers for internal use (and re-export below).
import {
  getNpcActiveSchedule as _getNpcActiveSchedule,
  isNpcUnavailableForDialogue as _isNpcUnavailableForDialogue,
  isActivitySleeping as _isActivitySleeping,
  isActivityBusy as _isActivityBusy,
  getScheduledQuests as _getScheduledQuests,
} from "./npc-schedule-client";

// Re-export the pure client-safe helpers so server callers can import them
// from this single module. (See file header for the client/server split.)
export {
  _getNpcActiveSchedule as getNpcActiveSchedule,
  _isNpcUnavailableForDialogue as isNpcUnavailableForDialogue,
  _isActivitySleeping as isActivitySleeping,
  _isActivityBusy as isActivityBusy,
  _getScheduledQuests as getScheduledQuests,
};

/** Russian labels for the four time-of-day slots — used in chat messages. */
const TOD_LABEL_RU: Record<TimeOfDay, string> = {
  dawn: "рассвет",
  day: "день",
  dusk: "сумерки",
  night: "ночь",
};

/**
 * Tick the schedule system when time-of-day changes:
 *   1. Move each NPC whose new active schedule entry has a different
 *      `location` (e.g. merchant goes from shop → tavern at dusk).
 *   2. Auto-offer any newly-available scheduled quests (i.e. quests in the
 *      NEW entry that weren't in the OLD entry) by adding them to the quest
 *      journal with a system chat message:
 *        "✨ Новый доступный квест от {npcName}: '{questTitle}'"
 *      Quests that already exist in the journal (by title) are NOT re-added.
 *
 * This function is idempotent: calling it twice in a row with the same
 * time-of-day is safe (no duplicate quests, no redundant chat messages).
 *
 * Returns the list of chat-message lines it wrote (mostly for tests/debug).
 */
export async function applyScheduleForTimeOfDay(
  roomId: string,
  newTimeOfDay: TimeOfDay | string,
  previousTimeOfDay?: TimeOfDay | string | null
): Promise<string[]> {
  const written: string[] = [];
  const npcs = await getLivingNpcs(roomId);
  if (npcs.length === 0) return written;

  // Look up the room round so chat messages get the right round tag.
  const room = await db.room.findUnique({ where: { id: roomId }, select: { round: true } });
  const round = room?.round ?? 0;

  // Existing quest titles — to avoid re-offering a quest already in the journal.
  const existingQuests = await db.quest.findMany({
    where: { roomId },
    select: { title: true },
  });
  const existingTitles = new Set(existingQuests.map((q) => q.title.trim().toLowerCase()));

  for (const npc of npcs) {
    if (!npc.schedule || npc.schedule.length === 0) continue;
    const newEntry = _getNpcActiveSchedule(npc, newTimeOfDay);
    if (!newEntry) continue;

    // 1. Move the NPC if the new entry's location differs from current.
    if (newEntry.location && newEntry.location !== npc.location) {
      const moved = await setNpcLocation(roomId, npc.name, newEntry.location);
      if (moved) {
        const line = `📍 ${npc.name} перемещается: ${npc.location || "—"} → ${newEntry.location} (${newEntry.activity}).`;
        written.push(line);
        await db.chatMessage.create({
          data: { roomId, role: "system", speaker: "", round, content: line },
        });
      }
    }

    // 2. Auto-offer any newly-available scheduled quests.
    if (newEntry.availableQuests && newEntry.availableQuests.length > 0) {
      // Don't offer quests from sleeping/busy NPCs.
      if (_isActivitySleeping(newEntry.activity) || _isActivityBusy(newEntry.activity)) {
        continue;
      }

      // Figure out which of these quests were ALREADY offered by the previous
      // time slot — we only want to announce quests that are NEWLY available.
      const prevEntry = previousTimeOfDay
        ? _getNpcActiveSchedule(npc, previousTimeOfDay)
        : null;
      const prevQuests = new Set(
        (prevEntry?.availableQuests ?? []).map((t) => t.trim().toLowerCase())
      );

      for (const titleRaw of newEntry.availableQuests) {
        const title = (titleRaw || "").trim();
        if (!title) continue;
        const key = title.toLowerCase();
        // Skip if the quest is already in the journal.
        if (existingTitles.has(key)) continue;
        // Skip if the quest was already offered by the previous slot —
        // no need to re-announce when the player has already seen it.
        if (prevQuests.has(key)) continue;

        // Create the quest in the journal.
        const created = await createQuest(
          roomId,
          title,
          `Квест от ${npc.name} (доступен в это время суток: ${TOD_LABEL_RU[newTimeOfDay as TimeOfDay] ?? newTimeOfDay}).`,
          "",
          ""
        );
        if (created) {
          existingTitles.add(key); // prevent dupes within this same tick
          const line = `✨ Новый доступный квест от ${npc.name}: «${title}»`;
          written.push(line);
          await db.chatMessage.create({
            data: { roomId, role: "system", speaker: "", round, content: line },
          });
        }
      }
    }
  }

  if (written.length > 0) {
    invalidateSnapshotCache(roomId);
  }
  return written;
}

/**
 * B6 helper: serialize a list of NpcScheduleEntry into the JSON string the
 * Prisma column expects. Re-exported here so callers don't have to remember
 * the format. (Mirrors how toNpc parses it.)
 */
export function serializeSchedule(entries: NpcScheduleEntry[]): string {
  return JSON.stringify(entries ?? []);
}

/**
 * B6 helper: write a schedule onto an NPC by name. Thin wrapper around
 * state.setNpcSchedule so all callers can use the same module.
 */
export async function applyNpcSchedule(
  roomId: string,
  npcName: string,
  entries: NpcScheduleEntry[]
): Promise<boolean> {
  return setNpcSchedule(roomId, npcName, entries);
}
