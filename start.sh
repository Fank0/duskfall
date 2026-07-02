#!/bin/sh
# Start both processes: game-sync (background) + Next.js (foreground).
set -e

# --- Write the z-ai-web-dev-sdk config file from env var ---
# The SDK reads ~/.z-ai-config or /etc/.z-ai-config (JSON with baseUrl, apiKey, token, userId).
# On Railway we pass the full JSON via ZAI_CONFIG so the file is created at boot.
if [ -n "$ZAI_CONFIG" ]; then
  echo "$ZAI_CONFIG" > /app/.z-ai-config
  echo "[start] wrote .z-ai-config from ZAI_CONFIG env var"
else
  echo "[start] WARNING: ZAI_CONFIG not set — AI Dungeon Master and image generation will fail"
fi

# --- Create DB tables (Prisma) ---
# Use the local prisma binary (v6) to avoid downloading v7 which is incompatible.
./node_modules/.bin/prisma db push --accept-data-loss >/dev/null 2>&1 || \
  node ./node_modules/prisma/build/index.js db push --accept-data-loss >/dev/null 2>&1 || \
  echo "[start] WARNING: prisma db push failed — tables may be missing"

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
