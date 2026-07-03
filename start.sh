#!/bin/sh
# Start both processes: game-sync (background) + Next.js (foreground).
# NOTE: no `set -e` — a failing step (e.g. prisma) must NOT abort the whole script.

# --- Write the z-ai-web-dev-sdk config file from env var (optional, last-resort fallback) ---
# The SDK reads /app/.z-ai-config (JSON with baseUrl, apiKey, token, userId).
# This is only needed if no GLM_API_KEY/GEMINI_API_KEY/OPENROUTER_API_KEY is set.
if [ -n "$ZAI_CONFIG" ]; then
  echo "$ZAI_CONFIG" > /app/.z-ai-config
  echo "[start] wrote .z-ai-config from ZAI_CONFIG env var (last-resort fallback)"
else
  echo "[start] ZAI_CONFIG not set (optional — only needed for z-ai-sdk sandbox fallback)"
fi

# --- Log the active LLM provider chain (for debugging) ---
LLM_CHAIN=""
[ -n "$GLM_API_KEY" ] && LLM_CHAIN="${LLM_CHAIN}GLM(glm-4.6) "
[ -n "$GEMINI_API_KEY" ] && LLM_CHAIN="${LLM_CHAIN}Gemini(gemini-2.0-flash) "
[ -n "$OPENROUTER_API_KEY" ] && LLM_CHAIN="${LLM_CHAIN}OpenRouter(qwen3+nvidia+llama) "
[ -n "$OLLAMA_BASE_URL" ] && LLM_CHAIN="${LLM_CHAIN}Ollama(${OLLAMA_MODEL:-llama3.2}) "
[ -n "$LLM_PROVIDER" ] && LLM_CHAIN="${LLM_CHAIN}[legacy:${LLM_PROVIDER}] "
if [ -z "$LLM_CHAIN" ]; then
  echo "[start] WARNING: no LLM provider configured! Set GLM_API_KEY (recommended)."
else
  echo "[start] LLM chain: ${LLM_CHAIN}"
fi
[ -n "$LLM_API_KEY" ] && echo "[start] LLM_API_KEY length: ${#LLM_API_KEY} (legacy mode)"

# --- Ensure the DB directory exists (for the persistent volume) ---
mkdir -p /data 2>/dev/null || true

# --- Create DB tables (Prisma) ---
# bunx prisma pulls v7 (incompatible with our schema); prisma@6 is the working version.
echo "[start] running prisma db push (v6)..."
bunx prisma@6 db push --accept-data-loss 2>&1 && echo "[start] prisma OK" || \
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
