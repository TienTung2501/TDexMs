# ═══════════════════════════════════════════════════════
# SolverNet Backend — Production Dockerfile
# esbuild bundles all JS deps (incl. libsodium) into a
# single file; only @prisma/client stays external.
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

# Generate Prisma client (needed so esbuild can resolve @prisma/client types),
# then bundle the entire backend into dist/index.js with esbuild.
# libsodium-wrappers-sumo and all other JS deps are inlined at this step.
RUN cd backend && npx prisma generate && pnpm build

# ── Stage 2: Production image ──
FROM node:20-alpine AS runner

RUN addgroup --system --gid 1001 solvernet \
    && adduser --system --uid 1001 solvernet

WORKDIR /app

# Copy the single-file esbuild bundle (all JS deps inlined — no pnpm virtual store)
COPY --from=builder /app/backend/dist/index.js ./dist/index.js

# Copy Prisma schema (needed by migrate deploy and generate)
COPY --from=builder /app/backend/prisma ./prisma

# Install ONLY prisma + @prisma/client via npm (flat node_modules, no .pnpm quirks).
# This installs the native Query Engine binary for the correct platform.
RUN npm install --save-exact prisma@6.2.0 @prisma/client@6.2.0 \
    && npx prisma generate \
    && npm cache clean --force

USER solvernet

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
