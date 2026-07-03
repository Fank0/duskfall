/**
 * Save-slot binding helpers — kept here so room/create, room/join, and
 * levelup can share the same upsert / bump logic without duplicating it.
 */

import { db } from "@/lib/db";

const TOTAL_SLOTS = 3;
const NAME_MAX = 80;

/** Validate a slot number coming from the client. Returns null if valid. */
export function validateSlotNumber(slot: unknown): number | null {
  const n = Number(slot);
  if (!Number.isInteger(n) || n < 1 || n > TOTAL_SLOTS) return null;
  return n;
}

/**
 * Upsert a SaveSlot for the given account + slotNumber, pointing it at the
 * freshly-created / joined room + player.
 *
 * Returns the SaveSlot row, or null if the account id is missing.
 */
export async function upsertSaveSlotForPlayer(opts: {
  accountId: string;
  slotNumber: number;
  roomId: string;
  playerId: string;
  charName: string;
  charClass: string;
  charRace: string;
  charLevel: number;
  name?: string;
}) {
  const name = (opts.name ?? opts.charName).toString().slice(0, NAME_MAX) || `Слот ${opts.slotNumber}`;
  return db.saveSlot.upsert({
    where: {
      accountId_slotNumber: {
        accountId: opts.accountId,
        slotNumber: opts.slotNumber,
      },
    },
    create: {
      accountId: opts.accountId,
      slotNumber: opts.slotNumber,
      name,
      roomId: opts.roomId,
      playerId: opts.playerId,
      charName: opts.charName,
      charClass: opts.charClass,
      charRace: opts.charRace,
      charLevel: opts.charLevel,
    },
    update: {
      name,
      roomId: opts.roomId,
      playerId: opts.playerId,
      charName: opts.charName,
      charClass: opts.charClass,
      charRace: opts.charRace,
      charLevel: opts.charLevel,
      lastPlayed: new Date(),
    },
  });
}

/**
 * Bump charLevel + lastPlayed on every SaveSlot that points at this
 * (accountId, roomId, playerId). Called from /api/game/levelup when the
 * requester is authenticated.
 */
export async function bumpSaveSlotLevel(opts: {
  accountId: string;
  roomId: string;
  playerId: string;
  newLevel: number;
}) {
  return db.saveSlot.updateMany({
    where: {
      accountId: opts.accountId,
      roomId: opts.roomId,
      playerId: opts.playerId,
    },
    data: {
      charLevel: opts.newLevel,
      lastPlayed: new Date(),
    },
  });
}
