# ═══════════════════════════════════════════════════════
# SolverNet Backend — Production Dockerfile
# tsc build + pnpm deploy --prod for clean node_modules
# ═══════════════════════════════════════════════════════

# ── Stage 1: Install & Build ──
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Copy manifests + patches (pnpm apply patches during install)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
COPY patches ./patches
# THÊM DÒNG NÀY:
COPY --from=builder /app/smartcontract ./smartcontract

RUN pnpm install --frozen-lockfile

# Copy source
COPY backend/ ./backend/
COPY tsconfig.base.json ./

# Generate Prisma + compile TypeScript
RUN cd backend && npx prisma generate && pnpm build

# Create self-contained production directory (resolves pnpm symlinks)
RUN pnpm deploy --filter backend --prod /app/pruned

# Copy compiled JS + Prisma schema into pruned dir, re-generate client
RUN cp -r /app/backend/dist   /app/pruned/dist   \
 && cp -r /app/backend/prisma /app/pruned/prisma \
 && cd /app/pruned && npx prisma generate

# ── Stage 2: Production image ──
FROM node:20-alpine AS runner

RUN addgroup --system --gid 1001 solvernet \
    && adduser --system --uid 1001 solvernet

WORKDIR /app

# Copy everything from pruned (flat node_modules, no symlinks)
COPY --from=builder /app/pruned/package.json ./
COPY --from=builder /app/pruned/node_modules ./node_modules
COPY --from=builder /app/pruned/dist ./dist
COPY --from=builder /app/pruned/prisma ./prisma

USER solvernet

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
