# SolverNet DEX — Cardano Order-Book DEX with Solver Architecture

> Decentralized Exchange trên Cardano với kiến trúc intent-based và solver engine. Hỗ trợ multi-asset pools, off-chain intent matching, và on-chain settlement.

**Stack:** Blockfrost + Supabase + Upstash + Render + Vercel (Free Tier)

---

## 📁 Cấu trúc Monorepo

```
decentralize/
├── smartcontract/          # Aiken smart contracts (Plutus)
│   ├── validators/         # Escrow, Pool validators
│   ├── build/              # Compiled UPLC
│   └── aiken.toml          # Aiken config
│
├── backend/                # Node.js Express API
│   ├── src/
│   │   ├── application/    # Use cases + services
│   │   ├── domain/         # Entities, value objects
│   │   ├── infrastructure/ # Database, Cardano, cache
│   │   ├── interface/      # HTTP, WebSocket
│   │   ├── solver/         # Solver engine
│   │   ├── config/         # Env, logger
│   │   └── index.ts        # Entry point
│   ├── prisma/             # Database schema + migrations
│   ├── .env.example        # Environment template
│   └── package.json
│
├── frontend/               # Next.js dApp (phát triển sau)
│   └── package.json        # Placeholder
│
├── docs/                   # Architecture & setup guides
│   ├── 01-ARCHITECTURE-OVERVIEW.md
│   ├── 02-SMART-CONTRACT-SPEC.md
│   ├── 03-INTENT-LIFECYCLE.md
│   ├── 04-SOLVER-ALGORITHM.md
│   ├── 05-API-REFERENCE.md
│   ├── 06-DATABASE-SCHEMA.md
│   └── 07-INFRASTRUCTURE-SETUP-GUIDE.md
│
├── frontend-etf-factory-protocol/  # Reference code (không push git)
│
├── package.json            # Root workspace config
├── pnpm-workspace.yaml     # pnpm workspaces
├── turbo.json              # Turborepo config
└── tsconfig.base.json      # Shared TypeScript config
```

---

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/your-org/decentralize.git
cd decentralize
pnpm install
```

### 2. Setup Environment

```bash
cd backend
cp .env.example .env
# Điền credentials: DATABASE_URL, BLOCKFROST_PROJECT_ID, UPSTASH_REDIS_URL
```

### 3. Database Migration

```bash
pnpm db:generate  # Generate Prisma client
pnpm db:migrate   # Run migrations
```

### 4. Start Development

```bash
# Backend API (http://localhost:3001)
cd backend
pnpm dev

# Frontend (TODO: phát triển sau)
```

### 5. Health Check

```bash
curl http://localhost:3001/v1/health
```

---

## 📦 Tech Stack

### Smart Contracts (Aiken)
- **Escrow Validator** — Hold user intents with UTXO-based state
- **Pool Validator** — AMM constant-product formula
- **Language:** Aiken v1.1.3, UPLC target

### Backend (Node.js)
- **Framework:** Express v4.21, TypeScript v5.7
- **ORM:** Prisma v6.2 + PostgreSQL (Supabase)
- **Cache:** Upstash Redis (serverless, HTTP-based)
- **Cardano API:** Blockfrost (replaces Ogmios/Kupo)
- **Clean Architecture:** Domain → Application → Infrastructure → Interface

### Frontend (Next.js — Coming Soon)
- **Framework:** Next.js 14 (App Router)
- **UI:** shadcn/ui + Tailwind CSS
- **Wallet:** Lucid Evolution v0.4
- **Charts:** TradingView Lightweight Charts

### Infrastructure (Free Tier)
- **Database:** Supabase (500 MB PostgreSQL)
- **Cache:** Upstash Redis (10K commands/day, 256 MB)
- **Backend Host:** Render Free (512 MB RAM, spin-down 15min)
- **Frontend Host:** Vercel Free (Serverless)
- **Blockchain:** Blockfrost Preprod (50K requests/day)
- **Keep-Alive:** UptimeRobot (ping /v1/health every 5 min)

---

## 🛠 Development Commands

```bash
# Root (monorepo)
pnpm install          # Install all dependencies
pnpm build            # Build all packages
pnpm dev              # Start all in dev mode (Turborepo)

# Backend
cd backend
pnpm dev              # Start with hot reload
pnpm build            # Compile TypeScript → dist/
pnpm start            # Run production build
pnpm type-check       # TypeScript check (no emit)
pnpm db:generate      # Generate Prisma client
pnpm db:migrate       # Run migrations (dev)
pnpm db:studio        # Open Prisma Studio

# Smart Contracts
cd smartcontract
aiken build           # Compile to UPLC
aiken check           # Run tests
```

---

## 📚 Documentation

| Doc | Mô tả |
|---|---|
| [Architecture Overview](docs/01-ARCHITECTURE-OVERVIEW.md) | Tổng quan kiến trúc hệ thống |
| [Smart Contract Spec](docs/02-SMART-CONTRACT-SPEC.md) | Chi tiết validators (Aiken) |
| [Intent Lifecycle](docs/03-INTENT-LIFECYCLE.md) | User intent → solver → settlement |
| [Solver Algorithm](docs/04-SOLVER-ALGORITHM.md) | Off-chain matching & batching |
| [API Reference](docs/05-API-REFERENCE.md) | REST + WebSocket endpoints |
| [Database Schema](docs/06-DATABASE-SCHEMA.md) | Prisma models + relations |
| [Infrastructure Setup](docs/07-INFRASTRUCTURE-SETUP-GUIDE.md) | Deploy guide (Render + Vercel) |

---

## 🌐 API Endpoints

### Health & Info
```
GET  /v1/health          # Service status (DB, Blockfrost, Redis)
GET  /v1/analytics       # Protocol stats
```

### Trading
```
POST /v1/quote           # Get swap quote (off-chain)
POST /v1/intents         # Create intent (unsigned tx)
GET  /v1/intents/:id     # Intent status
DELETE /v1/intents/:id   # Cancel intent (unsigned tx)
```

### Pools
```
GET  /v1/pools                # All active pools
GET  /v1/pools/:id            # Pool details
POST /v1/pools                # Create pool (unsigned tx)
POST /v1/pools/:id/deposit    # Add liquidity
POST /v1/pools/:id/withdraw   # Remove liquidity
```

### Charts (TradingView-compatible)
```
GET  /v1/chart/config         # UDF config
GET  /v1/chart/history        # OHLCV data
GET  /v1/chart/price/:poolId  # Latest price
GET  /v1/chart/info/:poolId   # 24h stats
```

### WebSocket
```
ws://localhost:3001
→ subscribe: pool_update, intent_matched, tx_confirmed
```

---

## 🧪 Testing

```bash
# Backend unit tests
cd backend
pnpm test

# Smart contract tests
cd smartcontract
aiken check
```

---

## 🚢 Deployment

### Production (Render + Vercel)

1. **Backend on Render:**
   - Build command: `cd ../.. && pnpm install && pnpm build`
   - Start command: `node dist/index.js`
   - Root directory: `backend`

2. **Frontend on Vercel:**
   - Framework: Next.js
   - Root directory: `frontend`

3. **UptimeRobot:**
   - Monitor: `https://your-api.onrender.com/v1/health`
   - Interval: 5 minutes

Chi tiết: [Infrastructure Setup Guide](docs/07-INFRASTRUCTURE-SETUP-GUIDE.md)

---

## 🎯 Roadmap

- [x] Smart contracts (Escrow + Pool validators)
- [x] Backend API (Clean Architecture)
- [x] Database schema (Prisma + PostgreSQL)
- [x] Chart API (OHLCV H4+D1+W1, TradingView-compatible)
- [x] Upstash Redis cache (Supabase 500MB optimization)
- [x] Blockfrost integration (thay Ogmios/Kupo)
- [x] Free tier deployment guide
- [ ] Frontend dApp (Next.js + wallet integration)
- [ ] Solver engine stress test
- [ ] Mainnet deployment
- [ ] Multi-hop routing
- [ ] Governance module

---

## 📄 License

MIT

---

## 🤝 Contributing

Dự án đang trong giai đoạn phát triển. Pull requests welcome!

---

> **Note:** `frontend-etf-factory-protocol/` là reference code (không push lên git). Frontend chính thức sẽ được phát triển trong `frontend/`.
