# ═══════════════════════════════════════════════════════
# SolverNet Backend — Production Dockerfile
# Multi-stage build using "pnpm deploy" for clean output
# ═══════════════════════════════════════════════════════

# ── Stage 1: Install & Build ──
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Install dependencies
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN pnpm install --frozen-lockfile

# Copy source
COPY backend/ ./backend/
COPY tsconfig.base.json ./

# Generate Prisma client & build TypeScript
RUN cd backend && npx prisma generate && pnpm build

# Use "pnpm deploy" to create a self-contained production directory
# This resolves all symlinks and bundles only production dependencies
RUN pnpm deploy --filter backend --prod /app/pruned

# Copy prisma schema, dist, and re-generate Prisma client in pruned dir
RUN cp -r /app/backend/prisma /app/pruned/prisma \
    && cp -r /app/backend/dist /app/pruned/dist \
    && cd /app/pruned && npx prisma generate

# ── Stage 2: Production image ──
FROM node:20-alpine AS runner

# Security: non-root user
RUN addgroup --system --gid 1001 solvernet \
    && adduser --system --uid 1001 solvernet

WORKDIR /app

# Copy the self-contained pruned directory (no symlinks)
COPY --from=builder /app/pruned/package.json ./
COPY --from=builder /app/pruned/node_modules ./node_modules
COPY --from=builder /app/pruned/dist ./dist
COPY --from=builder /app/pruned/prisma ./prisma

USER solvernet

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

# Run Prisma migrations then start server
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/index.js"]
