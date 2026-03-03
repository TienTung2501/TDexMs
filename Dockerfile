# syntax=docker/dockerfile:1
# ═══════════════════════════════════════════════════════
# SolverNet Backend — Production Dockerfile
#
# Optimisations vs. original:
#  1. BuildKit pnpm-store cache mount → packages are never re-downloaded
#  2. esbuild replaces tsc (10-20× faster, no type-emit overhead)
#  3. prisma generate runs once; generated client is copied to pruned dir
#  4. All layers ordered for maximum Docker cache reuse
# ═══════════════════════════════════════════════════════

# ── Stage 1: Install & Build ──────────────────────────
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Layer A – workspace manifests only  (invalidates on lockfile/package.json changes)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY backend/package.json  ./backend/package.json
COPY frontend/package.json ./frontend/package.json
COPY patches ./patches

# Install ALL deps with pnpm store cached by BuildKit.
# The cache mount persists the content-addressable store across builds on the
# same machine, so packages are fetched once and reused on every subsequent run.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Layer B – source code + assets (invalidate only when code changes)
COPY backend/    ./backend/
COPY tsconfig.base.json ./
COPY smartcontract/plutus.json ./smartcontract/plutus.json

# Generate Prisma client, then compile with esbuild (replaces slow tsc)
RUN cd backend && pnpm build:bundle

# Create self-contained production directory (resolves pnpm symlinks)
RUN pnpm deploy --filter backend --prod /app/pruned

# Copy compiled JS + Prisma schema into pruned dir, then generate Prisma client
# once in the pruned context (prisma generate is fast, ~3s)
RUN cp -r /app/backend/dist   /app/pruned/dist   \
 && cp -r /app/backend/prisma /app/pruned/prisma \
 && cd /app/pruned && npx prisma generate

# ── Stage 2: Production image ─────────────────────────
FROM node:20-alpine AS runner

RUN addgroup --system --gid 1001 solvernet \
    && adduser --system --uid 1001 solvernet

WORKDIR /app

# Copy everything from pruned (flat node_modules, no symlinks, no dev deps)
COPY --from=builder /app/pruned/package.json    ./
COPY --from=builder /app/pruned/node_modules    ./node_modules
COPY --from=builder /app/pruned/dist            ./dist
COPY --from=builder /app/pruned/prisma          ./prisma
COPY --from=builder /app/smartcontract/plutus.json ./smartcontract/plutus.json

USER solvernet

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

# db push uses --skip-generate because the client was already generated at build time
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
