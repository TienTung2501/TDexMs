# SolverNet DEX — Kiến trúc Free Tier Stack & Chart API

> Tài liệu cập nhật kiến trúc sau khi chuyển đổi sang Blockfrost + Render + Supabase + Vercel.

---

## Mục lục

1. [Tổng quan Stack](#1-tổng-quan-stack)
2. [Thay đổi so với thiết kế ban đầu](#2-thay-đổi-so-với-thiết-kế-ban-đầu)
3. [Cấu hình Environment Variables](#3-cấu-hình-environment-variables)
4. [Blockfrost Integration](#4-blockfrost-integration)
5. [Chart API (TradingView-compatible)](#5-chart-api-tradingview-compatible)
6. [Database Schema (OHLCV)](#6-database-schema-ohlcv)
7. [Tối ưu hóa cho Render Free Tier](#7-tối-ưu-hóa-cho-render-free-tier)
8. [Deploy Guide](#8-deploy-guide)
9. [API Endpoints Reference](#9-api-endpoints-reference)

---

## 1. Tổng quan Stack

```
┌─────────────────┐     ┌──────────────────┐     ┌───────────────────┐
│   Vercel         │     │   Render          │     │  Blockfrost API   │
│   (Next.js)      │────▶│   (Node.js)       │────▶│  (Cardano Preprod)│
│   Frontend       │     │   Backend         │     │  Free: 50k req/d  │
└─────────────────┘     └────────┬───────────┘     └───────────────────┘
                                 │
                        ┌────────▼───────────┐
                        │   Supabase         │
                        │   (PostgreSQL)     │
                        │   Free: 500MB      │
                        └────────────────────┘
```

| Service | Tier | Giới hạn | URL |
|---------|------|----------|-----|
| **Blockfrost** | Free | 50,000 req/day, 10 req/s | cardano-preprod.blockfrost.io |
| **Render** | Free | 512 MB RAM, spin-down after 15m idle | *.onrender.com |
| **Supabase** | Free | 500 MB DB, 1 GB bandwidth | *.supabase.co |
| **Vercel** | Hobby | 100 GB bandwidth, serverless | *.vercel.app |

---

## 2. Thay đổi so với thiết kế ban đầu

### Loại bỏ (Removed)
| Component | Lý do |
|-----------|-------|
| **Ogmios** (WebSocket) | Yêu cầu self-hosted Cardano Node (~32GB RAM) |
| **Kupo** (HTTP indexer) | Yêu cầu self-hosted, cần sync chain data |
| **Docker PostgreSQL** | Thay bằng Supabase managed DB |
| **Docker Compose** setup | Không cần — tất cả là managed services |

### Thay thế bằng (Replaced with)
| Cũ | Mới | Lý do |
|----|-----|-------|
| `OgmiosClient` | `BlockfrostClient` | HTTP API, managed, free tier |
| `KupoClient` | `BlockfrostClient` | Blockfrost cung cấp cả UTxO queries |
| `OGMIOS_URL` env | `BLOCKFROST_PROJECT_ID` | Single API key |
| `KUPO_URL` env | (removed) | Không cần |
| Docker PostgreSQL | Supabase | Managed, free 500MB |

### Thêm mới (Added)
| Component | Mô tả |
|-----------|-------|
| `CandlestickService` | Dịch vụ OHLCV chart data |
| `PriceAggregationCron` | Cron job tổng hợp price ticks → candles |
| Chart API routes | TradingView UDF-compatible endpoints |
| `Candle` model | OHLCV data (Prisma) |
| `PriceTick` model | Raw trade price events |

---

## 3. Cấu hình Environment Variables

```env
# ─── Server ───
NODE_ENV=development
PORT=3001
HOST=0.0.0.0
LOG_LEVEL=info

# ─── Database (Supabase) ───
DATABASE_URL=postgresql://postgres.xxx:password@db.xxx.supabase.co:6543/postgres

# ─── Cardano / Blockfrost ───
CARDANO_NETWORK=preprod
BLOCKFROST_URL=https://cardano-preprod.blockfrost.io/api/v0
BLOCKFROST_PROJECT_ID=preprodXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# ─── Smart Contracts ───
ESCROW_SCRIPT_ADDRESS=addr_test1...
POOL_SCRIPT_ADDRESS=addr_test1...

# ─── Solver ───
SOLVER_SEED_PHRASE=
SOLVER_BATCH_WINDOW_MS=5000
SOLVER_ENABLED=false

# ─── Chart / OHLCV ───
CHART_SNAPSHOT_INTERVAL_MS=60000
CHART_MAX_CANDLES=500

# ─── Security ───
CORS_ORIGIN=http://localhost:3000
JWT_SECRET=change-me-in-production
```

---

## 4. Blockfrost Integration

### BlockfrostClient (`src/infrastructure/cardano/BlockfrostClient.ts`)

Thay thế cả OgmiosClient và KupoClient bằng một client duy nhất:

```typescript
// Implements IChainProvider interface
const blockfrost = new BlockfrostClient(
  'https://cardano-preprod.blockfrost.io/api/v0',
  'preprodXXXXXX',
);

// UTxO queries (thay thế Kupo)
const utxos = await blockfrost.getUtxos(address);
const assetUtxos = await blockfrost.getAssetUtxos(address, policyId, assetName);

// Chain state (thay thế Ogmios)
const tip = await blockfrost.getChainTip();
const params = await blockfrost.getProtocolParameters();

// TX submission (thay thế Ogmios)
const result = await blockfrost.submitTx(signedCborHex);

// Health check
const ok = await blockfrost.isHealthy();
```

### Rate Limiting
- Free tier: 10 requests/second, 50,000/day
- `ChainSync` interval tăng từ 10s → 30s để giảm request count
- Estimated daily usage: ~2,880 req (chain sync) + API calls

---

## 5. Chart API (TradingView-compatible)

### Kiến trúc

```
Browser (TradingView Lightweight Charts)
    │
    ▼
GET /v1/chart/history?symbol=POOL_ID&resolution=60&from=...&to=...
    │
    ▼
Chart Router → CandlestickService → Prisma → Supabase (Candle table)
    │
    ▼
Response: { s: "ok", t: [...], o: [...], h: [...], l: [...], c: [...], v: [...] }
```

### Data Flow

```
Swap Event → recordTick(poolId, price, volume)
                     │
                     ▼
              PriceTick table (raw)
                     │
         ┌───────────┼───────────┐
         ▼           ▼           ▼
   PriceAggCron  PriceAggCron  PriceAggCron
   (every 60s)   (every 60s)   (every 60s)
         │           │           │
         ▼           ▼           ▼
   Candle M1    Candle H1    Candle D1
   (1 phút)    (1 giờ)      (1 ngày)
```

### Supported Intervals

| Interval | Enum | Duration | Retention |
|----------|------|----------|-----------|
| 1m | `M1` | 60s | 1 day |
| 5m | `M5` | 5min | 7 days |
| 15m | `M15` | 15min | 30 days |
| 30m | `M30` | 30min | 30 days |
| 1h | `H1` | 1 hour | Forever |
| 4h | `H4` | 4 hours | Forever |
| 1d | `D1` | 1 day | Forever |
| 1w | `W1` | 1 week | Forever |

---

## 6. Database Schema (OHLCV)

### Candle Model
```prisma
model Candle {
  id        String         @id @default(cuid())
  poolId    String
  interval  CandleInterval
  openTime  DateTime
  closeTime DateTime
  open      Decimal        @db.Decimal(30, 15)
  high      Decimal        @db.Decimal(30, 15)
  low       Decimal        @db.Decimal(30, 15)
  close     Decimal        @db.Decimal(30, 15)
  volume    Decimal        @db.Decimal(38, 0)
  txCount   Int            @default(0)

  @@unique([poolId, interval, openTime])
  @@index([poolId, interval, openTime])
  @@map("candles")
}

enum CandleInterval {
  M1    // 1 minute
  M5    // 5 minutes
  M15   // 15 minutes
  M30   // 30 minutes
  H1    // 1 hour
  H4    // 4 hours
  D1    // 1 day
  W1    // 1 week
}
```

### PriceTick Model
```prisma
model PriceTick {
  id        String   @id @default(cuid())
  poolId    String
  price     Decimal  @db.Decimal(30, 15)
  volume    Decimal  @db.Decimal(38, 0)
  timestamp DateTime @default(now())

  @@index([poolId, timestamp])
  @@map("price_ticks")
}
```

### Ước tính dung lượng (Supabase Free 500MB)
| Data | Kích thước/record | Records/ngày (1 pool) | Dung lượng/tháng |
|------|-------------------|----------------------|------------------|
| PriceTick | ~100 bytes | ~1,440 (1/min) | ~4 MB |
| Candle M1 | ~150 bytes | 1,440 | ~6 MB |
| Candle H1 | ~150 bytes | 24 | ~0.1 MB |
| **Tổng (1 pool)** | | | **~10 MB/tháng** |

→ Với cleanup tự động (M1 giữ 1 ngày, M5 giữ 7 ngày), dung lượng thực tế < 50 MB cho 5 pools.

---

## 7. Tối ưu hóa cho Render Free Tier

### Giới hạn: 512 MB RAM

| Optimization | Chi tiết |
|-------------|----------|
| **Logger** | Production: không có `req`/`res` serializers, không pino-pretty |
| **Request logging** | Tắt trong production (trừ LOG_LEVEL=debug) |
| **ChainSync interval** | 30s thay vì 10s |
| **Candle aggregation** | Xử lý từng pool, từng interval (không load tất cả vào RAM) |
| **Cron cleanup** | Tự động xóa data cũ mỗi giờ |
| **Timer.unref()** | Cron timer không giữ process alive |

### Render Spin-down

Render Free tier spin down sau 15 phút không có request. Giải pháp:

1. **Chấp nhận cold start** (~30s khởi động lại)
2. **Hoặc** sử dụng UptimeRobot (free) ping health endpoint mỗi 5 phút:
   ```
   GET https://your-app.onrender.com/v1/health
   ```

---

## 8. Deploy Guide

### 8.1 Supabase

1. Tạo project tại [supabase.com](https://supabase.com)
2. Copy `DATABASE_URL` từ Settings → Database → Connection String (Transaction mode, port 6543)
3. Chạy migration:
   ```bash
   cd packages/backend
   npx prisma migrate deploy
   ```

### 8.2 Render

1. Kết nối GitHub repo tại [render.com](https://render.com)
2. Tạo **Web Service** (Free tier):
   - **Build Command:** `cd packages/backend && pnpm install && npx prisma generate && pnpm build`
   - **Start Command:** `cd packages/backend && node dist/index.js`
   - **Environment:** Node 20
3. Thêm Environment Variables (từ `.env`)
4. Deploy

### 8.3 Vercel (Frontend)

1. Import repo tại [vercel.com](https://vercel.com)
2. **Root Directory:** `frontend-etf-factory-protocol`
3. **Framework Preset:** Next.js
4. Thêm env var:
   ```
   NEXT_PUBLIC_API_URL=https://your-backend.onrender.com
   ```

### 8.4 Blockfrost

1. Đăng ký tại [blockfrost.io](https://blockfrost.io)
2. Tạo project cho **Cardano Preprod**
3. Copy Project ID → `BLOCKFROST_PROJECT_ID`

---

## 9. API Endpoints Reference

### Health & System
| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/health` | Health check (Blockfrost + DB) |

### Chart (TradingView UDF)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/chart/config` | TradingView UDF config |
| GET | `/v1/chart/symbols?symbol=POOL_ID` | Symbol info |
| GET | `/v1/chart/history?symbol=POOL_ID&resolution=60&from=&to=` | OHLCV data (TradingView format) |
| GET | `/v1/chart/candles?poolId=&interval=1h&from=&to=&limit=` | Raw candle query |
| GET | `/v1/chart/price/:poolId` | Latest price |
| GET | `/v1/chart/info/:poolId` | 24h pool stats |
| GET | `/v1/chart/intervals` | Available intervals |

### Trading
| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/quote` | Get swap quote |
| POST | `/v1/intents` | Create intent |
| DELETE | `/v1/intents/:id` | Cancel intent |
| GET | `/v1/intents/:id` | Get intent status |

### Pools
| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/pools` | List all pools |
| GET | `/v1/pools/:id` | Pool detail |
| POST | `/v1/pools` | Create pool |
| POST | `/v1/pools/:id/deposit` | Add liquidity |
| POST | `/v1/pools/:id/withdraw` | Remove liquidity |

---

## File Structure (Updated)

```
packages/backend/src/
├── config/
│   ├── env.ts              # Zod env validation (Blockfrost + Chart vars)
│   ├── logger.ts           # Pino logger (RAM-optimized for Render)
│   └── network.ts          # Network config (Blockfrost only)
├── application/
│   ├── services/
│   │   └── CandlestickService.ts  # OHLCV chart data service ★ NEW
│   └── use-cases/                 # Business logic
├── domain/
│   ├── entities/
│   └── ports/
│       └── IChainProvider.ts      # Interface (implemented by BlockfrostClient)
├── infrastructure/
│   ├── cardano/
│   │   ├── BlockfrostClient.ts    # Blockfrost HTTP client ★ NEW
│   │   ├── ChainProvider.ts       # Wraps BlockfrostClient
│   │   ├── ChainSync.ts           # Polls Blockfrost every 30s
│   │   └── TxBuilder.ts           # TX construction (Lucid + Blockfrost)
│   ├── cron/
│   │   └── PriceAggregationCron.ts # Tick→Candle aggregation ★ NEW
│   └── database/
│       ├── IntentRepository.ts
│       └── PoolRepository.ts
├── interface/
│   └── http/
│       └── routes/
│           ├── chart.ts           # Chart API endpoints ★ NEW
│           ├── health.ts          # Health (Blockfrost check)
│           ├── intents.ts
│           ├── pools.ts
│           └── quote.ts
├── solver/
│   ├── IntentCollector.ts         # Uses BlockfrostClient
│   ├── SolverEngine.ts            # Uses BlockfrostClient
│   ├── RouteOptimizer.ts
│   └── BatchBuilder.ts
└── index.ts                       # Composition root (Blockfrost wiring)
```
