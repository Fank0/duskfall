# DUSKFALL — production image.
# Runs BOTH the Next.js app (port 3000) and the game-sync socket.io relay
# (port 3003) in a single container via start.sh.

# ---------- build stage ----------
FROM oven/bun:1.3 AS build
WORKDIR /app

# Install deps (cached layer)
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Copy source and generate Prisma client
COPY prisma ./prisma
COPY . .
RUN bunx prisma generate

# Build Next.js (standalone output)
RUN bun run build

# ---------- runtime stage ----------
FROM oven/bun:1.3 AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV SYNC_PORT=3003

# Copy standalone server + static + public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Prisma: schema + generated client + DB engine + CLI (for first-boot db push)
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client

# game-sync mini-service — install its socket.io dependency
COPY --from=build /app/mini-services ./mini-services
RUN cd /app/mini-services/game-sync && bun install --production

# Start script
COPY start.sh ./start.sh
RUN chmod +x ./start.sh

# Persistent data for SQLite
RUN mkdir -p /data
ENV DATABASE_URL="file:/data/custom.db"

EXPOSE 3000 3003

# Healthcheck on the Next.js app
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["./start.sh"]
