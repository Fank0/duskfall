#!/bin/sh
# Start both processes: game-sync (background) + Next.js (foreground).
set -e

# Push the Prisma schema to the SQLite DB on first boot (creates tables if missing).
bunx prisma db push --skip-generate --accept-data-loss >/dev/null 2>&1 || true

echo "[start] launching game-sync relay on port ${SYNC_PORT:-3003}..."
cd /app/mini-services/game-sync
(bun index.ts) &
SYNC_PID=$!
cd /app

echo "[start] launching Next.js on port ${PORT:-3000}..."
HOSTNAME=0.0.0.0 PORT=${PORT:-3000} node ./server.js &
NEXT_PID=$!

# Forward signals to both children.
trap 'kill $SYNC_PID $NEXT_PID 2>/dev/null; exit 0' INT TERM

wait
