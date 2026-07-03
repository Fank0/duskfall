/**
 * Resolve the authenticated Account from a request's Cookie header.
 *
 * Returns the full Account row (id, username, createdAt) or null if the
 * cookie is absent / forged / refers to a non-existent account.
 */

import { db } from "@/lib/db";
import { readSessionAccountId } from "./session";
import type { Account } from "@prisma/client";

export async function getAccountFromRequest(
  cookieHeader: string | null
): Promise<Account | null> {
  const accountId = await readSessionAccountId(cookieHeader);
  if (!accountId) return null;
  try {
    const account = await db.account.findUnique({ where: { id: accountId } });
    return account;
  } catch {
    return null;
  }
}
