# ═══════════════════════════════════════════════════════
# SolverNet Backend — Production Dockerfile
# Multi-stage build for minimal image size
# ═══════════════════════════════════════════════════════

# ── Stage 1: Install dependencies ──
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/package.json ./backend/package.json

RUN pnpm install --frozen-lockfile

# ── Stage 2: Build ──
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY . .

# Generate Prisma client
RUN cd backend && npx prisma generate

# Build backend
RUN pnpm --filter backend build

# ── Stage 3: Production image ──
FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Security: non-root user
RUN addgroup --system --gid 1001 solvernet \
    && adduser --system --uid 1001 solvernet

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/backend/package.json ./backend/package.json
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/prisma ./backend/prisma
COPY --from=builder /app/node_modules ./node_modules

USER solvernet

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

# Run Prisma migrations then start server
CMD ["sh", "-c", "cd backend && npx prisma migrate deploy && node dist/index.js"]
