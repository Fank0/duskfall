import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// NEW-FEATURES-1 (Feature 2): defensive cache invalidation. The dev server
// caches the PrismaClient instance on `globalThis` to avoid exhausting DB
// connections during hot reloads. When the Prisma schema is updated (e.g. new
// columns added to LootDrop) and `bun run db:push` regenerates the client, the
// cached instance may still use the OLD model delegates — so `db.lootDrop`
// could be undefined even after `prisma generate`. We guard against this by
// verifying the cached instance has the `lootDrop` delegate (a stable,
// always-present model since the TS-FIX task) before reusing it. If the check
// fails, we discard the stale instance and create a fresh one.
const cachedPrisma = globalForPrisma.prisma;
const cachedHasLootDrop =
  cachedPrisma &&
  typeof (cachedPrisma as any).lootDrop === "object" &&
  typeof (cachedPrisma as any).lootDrop?.findMany === "function";
if (cachedPrisma && !cachedHasLootDrop) {
  // Stale cache (pre-LootDrop client, or schema changed since the client was
  // instantiated) — force a fresh instance.
  try { cachedPrisma.$disconnect?.(); } catch { /* ignore */ }
}
export const db =
  cachedHasLootDrop
    ? cachedPrisma!
    : new PrismaClient({
        log: ['query'],
      })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db