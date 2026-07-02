#!/bin/sh
# Start both processes: game-sync (background) + Next.js (foreground).
# NOTE: no `set -e` — a failing step (e.g. prisma) must NOT abort the whole script.

# --- Write the z-ai-web-dev-sdk config file from env var ---
# The SDK reads /app/.z-ai-config (JSON with baseUrl, apiKey, token, userId).
if [ -n "$ZAI_CONFIG" ]; then
  echo "$ZAI_CONFIG" > /app/.z-ai-config
  echo "[start] wrote .z-ai-config from ZAI_CONFIG env var"
else
  echo "[start] WARNING: ZAI_CONFIG not set — AI Dungeon Master and image generation will fail"
fi

# --- Ensure the DB directory exists (for the persistent volume) ---
mkdir -p /data 2>/dev/null || true

# --- Create DB tables (Prisma) ---
# Try several ways to run prisma db push, since bunx pulls v7 (incompatible)
# and the local binary path varies by runtime.
echo "[start] running prisma db push..."
(./node_modules/.bin/prisma db push --accept-data-loss 2>&1 && echo "[start] prisma OK via .bin") || \
(node ./node_modules/prisma/build/index.js db push --accept-data-loss 2>&1 && echo "[start] prisma OK via node") || \
(npx prisma@6 db push --accept-data-loss 2>&1 && echo "[start] prisma OK via npx@6") || \
echo "[start] WARNING: prisma db push failed — tables may be missing"

echo "[start] launching game-sync relay on port ${SYNC_PORT:-3003}..."
cd /app/mini-services/game-sync
(bun index.ts 2>&1) &
SYNC_PID=$!
cd /app

echo "[start] launching Next.js on port ${PORT:-3000}..."
HOSTNAME=0.0.0.0 PORT=${PORT:-3000} node ./server.js &
NEXT_PID=$!

# Forward signals to both children.
trap 'kill $SYNC_PID $NEXT_PID 2>/dev/null; exit 0' INT TERM

wait
