# SolverNet DEX — System Optimization Documentation

> **Last Updated:** 2026-02-28  
> **Stack:** Blockfrost (Cardano Preprod) + Supabase (PostgreSQL) + Upstash (Redis) + Render (Node.js)  
> **Tier:** All Free Tier services

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Blockfrost API Optimization (50k req/day)](#2-blockfrost-api-optimization)
3. [Caching Strategy (Upstash Redis)](#3-caching-strategy)
4. [Database Storage Optimization (Supabase 500MB)](#4-database-storage-optimization)
5. [Candlestick Timeframes & Retention Policy](#5-candlestick-timeframes--retention-policy)
6. [Order System (Disabled)](#6-order-system-disabled)
7. [Background Services & Polling Intervals](#7-background-services--polling-intervals)
8. [Daily API Budget Estimation](#8-daily-api-budget-estimation)
9. [Environment Variables Reference](#9-environment-variables-reference)
10. [Monitoring & Diagnostics](#10-monitoring--diagnostics)

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                       │
│                    Vercel / localhost:3000                        │
└──────────────────────┬───────────────────────────────────────────┘
                       │ REST API + WebSocket
┌──────────────────────▼───────────────────────────────────────────┐
│                     Backend (Node.js / Express)                   │
│                      Render / localhost:3001                      │
│                                                                   │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐                │
│  │ HTTP Routes │  │ WebSocket  │  │ Solver Engine│                │
│  └─────┬──────┘  └─────┬──────┘  └──────┬───────┘                │
│        │               │                │                         │
│  ┌─────▼───────────────▼────────────────▼────────┐               │
│  │            Application Layer                    │               │
│  │  Use Cases + CandlestickService + Services     │               │
│  └─────────────────────┬─────────────────────────┘               │
│                        │                                          │
│  ┌─────────────────────▼─────────────────────────┐               │
│  │          Infrastructure Layer                   │               │
│  │                                                 │               │
│  │  ┌───────────┐  ┌──────────┐  ┌─────────────┐ │               │
│  │  │Blockfrost │  │ Supabase │  │Upstash Redis│ │               │
│  │  │ Client    │  │ (Prisma) │  │ (Cache)     │ │               │
│  │  └─────┬─────┘  └────┬─────┘  └──────┬──────┘ │               │
│  │        │              │               │        │               │
│  │  ┌─────▼──────────────▼───────────────▼──────┐ │               │
│  │  │       Background Cron Services             │ │               │
│  │  │  ChainSync | PriceAgg | PoolSnapshot       │ │               │
│  │  │  ReclaimKeeper | FaucetBot                 │ │               │
│  │  └───────────────────────────────────────────┘ │               │
│  └────────────────────────────────────────────────┘               │
└──────────────────────────────────────────────────────────────────┘
         │                    │                    │
    ┌────▼─────┐      ┌──────▼──────┐     ┌──────▼──────┐
    │Blockfrost│      │  Supabase   │     │Upstash Redis│
    │Free Tier │      │  Free Tier  │     │  Free Tier  │
    │50k/day   │      │  500MB DB   │     │ 10k cmd/day │
    └──────────┘      └─────────────┘     └─────────────┘
```

### Data Flow

1. **Chain → Backend**: `ChainSync` polls Blockfrost every **120s** (was 30s) to sync pool reserves
2. **Swap Events**: Solver Engine detects and executes swaps → records `PriceTick` + upserts `Candle` rows
3. **Aggregation**: `PriceAggregationCron` runs every **60s** to batch-aggregate ticks → candles
4. **Cleanup**: Every **~1 hour**, stale data is purged per retention policy
5. **Read Path**: Frontend queries → Redis cache check → PostgreSQL fallback → cache result

---

## 2. Blockfrost API Optimization

### Problem
Blockfrost Free Tier allows only **50,000 API requests per day**. With the original settings:
- ChainSync polling every 30s = ~2,880 iterations/day × ~3 API calls/pool = extensive usage
- TX confirmation polling every 5s = aggressive during awaits
- No caching for `getUtxosByAsset` (pool sync's primary query)
- Order-related syncs consuming ~40% of each ChainSync iteration

### Solution

#### A. Increased Polling Intervals

| Service | Before | After | Savings |
|---------|--------|-------|---------|
| ChainSync | 30s | **120s** (configurable) | **75% reduction** |
| TX polling (awaitTx) | 5s | **10s** | **50% reduction** |

#### B. Aggressive Caching (Upstash Redis)

| Data Type | Before TTL | After TTL | Impact |
|-----------|------------|-----------|--------|
| UTxOs per address | 30s | **60s** | 50% fewer UTxO queries |
| Asset UTxOs | No cache | **90s** | Eliminates redundant pool queries |
| Chain tip | 15s | **30s** | 50% fewer tip queries |
| Protocol params | 5 min | **10 min** | Minimal impact (rarely change) |
| TX confirmations | No cache | **60s** | Once confirmed, never re-checked |
| Latest price | 15s | **30s** | 50% fewer DB queries |
| Pool data | 30s | **60s** | 50% fewer pool queries |

#### C. Daily Budget Tracker

Built into `BlockfrostClient`:
- **Budget**: 45,000 calls/day (5,000 headroom from 50k limit)
- **Warning at 70%** (35,000 calls): Logs `⚠️ Blockfrost daily API budget: 70% consumed`
- **Hard stop at 100%** (45,000 calls): Logs `🚨 Budget EXHAUSTED` and skips non-critical requests
- **Auto-reset**: Counter resets daily at midnight
- **Monitoring**: `GET /v1/health` includes `blockfrostUsage` stats

#### D. Order Sync Disabled

When `ORDER_ROUTES_ENABLED=false` (default):
- ❌ `promoteConfirmedOrders()` — skipped in ChainSync
- ❌ `checkExpiredOrders()` — skipped in ChainSync
- ❌ `orderRepo.markExpired()` — skipped in ReclaimKeeper
- ❌ `reclaimExpiredOrders()` — skipped in ReclaimKeeper
- ❌ Order HTTP routes — return 503

**Savings**: ~40% fewer Blockfrost calls per ChainSync iteration

---

## 3. Caching Strategy

### Cache Architecture

```
┌────────────────────────────────────────────────┐
│               Upstash Redis (HTTP)              │
│            Serverless / No TCP needed           │
├────────────────────────────────────────────────┤
│                                                 │
│  Namespace        │  TTL    │  Purpose          │
│  ─────────────────┼─────────┼──────────────     │
│  bf:utxos:{addr}  │  60s    │  UTxO data        │
│  bf:asset-utxos:* │  90s    │  Asset UTxOs      │
│  bf:tip           │  30s    │  Chain tip         │
│  bf:params        │  600s   │  Protocol params   │
│  bf:tx:{hash}     │  60s    │  TX confirmed      │
│  chart:candles:*  │  300s   │  OHLCV candles     │
│  chart:price:*    │  30s    │  Latest price      │
│  chart:info:*     │  60s    │  Pool chart info   │
│  pool:*           │  60s    │  Pool data         │
│  pools:active     │  120s   │  Active pool list  │
│  sys:health       │  30s    │  Health check      │
│                                                 │
└────────────────────────────────────────────────┘
```

### Cache Patterns

1. **Cache-Aside** (primary): Check cache → miss → query source → store in cache
2. **Cache Invalidation**: After writes (swaps, pool updates), invalidate related keys
3. **Pattern Invalidation**: `invalidatePattern('chart:candles:{poolId}:*')` for bulk invalidation
4. **Graceful Degradation**: All cache operations are try/catch'd — system works without Redis

### BigInt Safety

Upstash SDK uses `JSON.stringify` internally, which throws on BigInt. 
Custom serialization tags BigInt values as `{ "__bigint__": "12345" }` and revives them on read.

---

## 4. Database Storage Optimization

### Supabase Free Tier Constraints
- **500 MB** database storage
- **2 GB** bandwidth/month
- Shared compute (may have connection limits)

### Storage Estimation Per Pool

| Data Type | Retention | Rows/Pool/Day | Est. Size/Pool/Year |
|-----------|-----------|---------------|---------------------|
| M1 candles | 2 days | 1,440 | Rolling ~3k max |
| M5 candles | 7 days | 288 | Rolling ~2k max |
| M15 candles | 14 days | 96 | Rolling ~1.3k max |
| H1 candles | 30 days | 24 | Rolling ~720 max |
| H4 candles | 90 days | 6 | Rolling ~540 max |
| D1 candles | 365 days | 1 | Rolling ~365 max |
| W1 candles | ∞ | 0.14 | Grows slowly |
| PriceTicks | 2 days | Variable | Rolling ~5k max |
| PoolHistory | 90 days | 24 | Rolling ~2.2k max |
| ProtocolStats | 90 days | 24 | Rolling ~2.2k max |
| Swaps | ∞ | Variable | Grows with usage |

**Estimated storage per active pool**: ~1-3 MB (depending on swap frequency)
**For 10 active pools**: ~10-30 MB — well within 500 MB

### Automatic Cleanup Schedule

Cleanup runs every **~1 hour** (every 60th PriceAggregation tick):

```
cleanupOldData()
  ├── DELETE PriceTicks WHERE timestamp < NOW() - 2 days
  ├── DELETE Candles(M1) WHERE openTime < NOW() - 2 days
  ├── DELETE Candles(M5) WHERE openTime < NOW() - 7 days
  ├── DELETE Candles(M15) WHERE openTime < NOW() - 14 days
  ├── DELETE Candles(H1) WHERE openTime < NOW() - 30 days
  ├── DELETE Candles(H4) WHERE openTime < NOW() - 90 days
  ├── DELETE Candles(D1) WHERE openTime < NOW() - 365 days
  ├── (W1 candles: never deleted)
  ├── DELETE PoolHistory WHERE timestamp < NOW() - 90 days
  └── DELETE ProtocolStats WHERE timestamp < NOW() - 90 days
```

---

## 5. Candlestick Timeframes & Retention Policy

### Supported Intervals

| Interval | Enum | Duration | Retention | Max Candles/Pool | Use Case |
|----------|------|----------|-----------|-----------------|----------|
| 1m | `M1` | 1 minute | 2 days | ~2,880 | Scalping, real-time |
| 5m | `M5` | 5 minutes | 7 days | ~2,016 | Short-term trading |
| 15m | `M15` | 15 minutes | 14 days | ~1,344 | Intraday analysis |
| 1h | `H1` | 1 hour | 30 days | ~720 | Swing trading |
| 4h | `H4` | 4 hours | 90 days | ~540 | Medium-term trends |
| 1d | `D1` | 1 day | 365 days | ~365 | Long-term analysis |
| 1w | `W1` | 1 week | ∞ | Unlimited | Historical overview |

### API Usage

```
GET /v1/chart/candles?poolId={id}&interval=1m&from={unix}&to={unix}&limit=500
GET /v1/chart/candles?poolId={id}&interval=5m
GET /v1/chart/candles?poolId={id}&interval=15m
GET /v1/chart/candles?poolId={id}&interval=1h
GET /v1/chart/candles?poolId={id}&interval=4h
GET /v1/chart/candles?poolId={id}&interval=1d
GET /v1/chart/candles?poolId={id}&interval=1w

GET /v1/chart/intervals  → Returns all available intervals with retention info
```

### Data Flow: Tick → Candle

```
Swap Event
  │
  ├─[Realtime]─► recordTickAndUpdateCandles()
  │               ├── INSERT PriceTick (raw price + volume)
  │               └── UPSERT Candle × 7 intervals (M1..W1)
  │                    ├── CREATE if first tick in period
  │                    └── UPDATE close + GREATEST(high) + LEAST(low) + SUM(volume)
  │
  └─[Batch 60s]─► PriceAggregationCron.aggregateCandles()
                   ├── For each active pool
                   │    └── For each interval (M1..W1)
                   │         └── Group ticks by period → bulk UPSERT candles
                   └── Every ~1h → cleanupOldData()
```

### Why Both Real-time and Batch?

1. **Real-time** (`recordTickAndUpdateCandles`): Ensures the current candle is always up-to-date immediately after a swap. Users see live price updates.
2. **Batch** (`aggregateCandles`): Catches any missed ticks (crashes, race conditions) and ensures completeness. Also handles the case where the service was offline and needs to backfill.

---

## 6. Order System (Disabled)

### Current State

The Order system (Limit, DCA, StopLoss orders) is **fully implemented** but **disabled by default** to conserve resources.

### What's Disabled

| Component | Status | Env Var |
|-----------|--------|---------|
| Order HTTP Routes (`/v1/orders/*`) | 503 response | `ORDER_ROUTES_ENABLED=false` |
| OrderExecutorCron | Not started | `ORDER_EXECUTOR_ENABLED=false` |
| ChainSync: promoteConfirmedOrders | Skipped | `ORDER_ROUTES_ENABLED=false` |
| ChainSync: checkExpiredOrders | Skipped | `ORDER_ROUTES_ENABLED=false` |
| ReclaimKeeper: markExpiredOrders | Skipped | `ORDER_ROUTES_ENABLED=false` |
| ReclaimKeeper: reclaimExpiredOrders | Skipped | `ORDER_ROUTES_ENABLED=false` |

### What's Preserved (Code)

- `Order` domain entity
- `OrderRepository` database layer  
- `CreateOrder`, `CancelOrder`, `ListOrders` use cases
- `ExecuteOrderUseCase` for on-chain execution
- `OrderExecutorCron` cron job
- Order-related ReclaimKeeper logic
- Prisma schema for `orders` table

### How to Re-enable

Set both env vars:
```env
ORDER_ROUTES_ENABLED=true
ORDER_EXECUTOR_ENABLED=true
```

---

## 7. Background Services & Polling Intervals

### Active Services

| Service | Interval | Blockfrost Calls/Tick | DB Queries/Tick | Notes |
|---------|----------|----------------------|-----------------|-------|
| **ChainSync** | 120s | 1-3 per pool | 1 write per pool | Pool reserves sync |
| **PriceAggregationCron** | 60s | 0 | 2-10 per pool × interval | Tick → Candle aggregation |
| **PoolSnapshotCron** | 3600s (1h) | 0 | 1 write per pool + 1 stats | Pool history + protocol stats |
| **ReclaimKeeperCron** | 60s | 0 (DB only) | 2 queries + bulk update | Marks expired intents |
| **FaucetBot** | 24h | 0 | 0 | Requests test ADA (preprod) |
| **SolverEngine** | 5s (configurable) | 1-5 per intent | Several per swap | Intent matching + execution |

### Disabled Services

| Service | Reason | Savings |
|---------|--------|---------|
| **OrderExecutorCron** | Orders disabled | ~1 Blockfrost call per pool × order per tick |
| **Order sync in ChainSync** | Orders disabled | ~2 Blockfrost calls per stuck order per tick |

### Total Estimated Daily API Usage

```
ChainSync (120s interval):
  720 ticks/day × 2 calls/tick (1 pool) = ~1,440 calls

SolverEngine (5s, but mostly idle):
  ~500 calls/day (intent scanning + execution)

ReclaimKeeper (Blockfrost calls only for reclaims):
  ~50 calls/day (rare — only expired intents with escrow)

Miscellaneous (health checks, TX submissions):
  ~200 calls/day

Health Check caching:
  Reduced from ~2,880 to ~480/day

TOTAL ESTIMATED: ~2,700 calls/day (5.4% of 50k budget)
```

**With 2 active pools:**
```
ChainSync: 720 × 4 = ~2,880
Total: ~3,700 calls/day (7.4% of budget)
```

**With 10 active pools:**
```
ChainSync: 720 × 20 = ~14,400
Total: ~15,200 calls/day (30.4% of budget) — still safe
```

---

## 8. Daily API Budget Estimation

### Budget Breakdown Calculator

| Factor | Formula | 1 Pool | 5 Pools | 10 Pools |
|--------|---------|--------|---------|----------|
| ChainSync syncs | (86400/120) × pools × 2 | 1,440 | 7,200 | 14,400 |
| Solver scanning | ~500 fixed | 500 | 500 | 500 |
| TX confirmations | ~50 fixed | 50 | 50 | 50 |
| Health + misc | ~300 fixed | 300 | 300 | 300 |
| **Total** | | **2,290** | **8,050** | **15,250** |
| **% of 50k** | | **4.6%** | **16.1%** | **30.5%** |

### When to Upgrade

If you're consistently hitting >70% budget (35k calls/day), consider:
1. **Blockfrost Hobby tier** ($10/mo → 500k calls/day)
2. Increase ChainSync interval to 180s or 300s
3. Enable conditional sync (only sync when chain tip changes)

---

## 9. Environment Variables Reference

### New/Updated Variables

```env
# ─── Blockfrost Optimization ───
CHAIN_SYNC_INTERVAL_MS=120000      # Default: 120s (was 30s)
                                    # Increase to 180000 or 300000 to save more API calls

# ─── Order System Control ───
ORDER_ROUTES_ENABLED=false          # Default: false
                                    # Set to 'true' to enable /v1/orders/* routes
ORDER_EXECUTOR_ENABLED=false        # Default: false
                                    # Set to 'true' to start OrderExecutorCron

# ─── Chart / OHLCV ───
CHART_SNAPSHOT_INTERVAL_MS=60000    # Default: 60s — PriceAggregation cron interval
CHART_MAX_CANDLES=500               # Default: 500 — max candles returned per query
```

### Full Variable List

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `3001` | HTTP server port |
| `DATABASE_URL` | required | Supabase PostgreSQL connection (pooled) |
| `DIRECT_URL` | required | Supabase PostgreSQL connection (direct) |
| `UPSTASH_REDIS_URL` | optional | Upstash Redis REST URL |
| `UPSTASH_REDIS_TOKEN` | optional | Upstash Redis REST token |
| `BLOCKFROST_URL` | `https://cardano-preprod.blockfrost.io/api/v0` | Blockfrost API base |
| `BLOCKFROST_PROJECT_ID` | required | Blockfrost project ID |
| `CHAIN_SYNC_INTERVAL_MS` | `120000` | Chain sync polling interval |
| `ORDER_ROUTES_ENABLED` | `false` | Enable order HTTP routes |
| `ORDER_EXECUTOR_ENABLED` | `false` | Enable order execution cron |
| `SOLVER_ENABLED` | `false` | Enable solver engine |
| `CHART_SNAPSHOT_INTERVAL_MS` | `60000` | Price aggregation interval |
| `CHART_MAX_CANDLES` | `500` | Max candles per API response |

---

## 10. Monitoring & Diagnostics

### Health Endpoint

```bash
GET /v1/health
```

Response includes Blockfrost usage stats:
```json
{
  "status": "healthy",
  "uptime": 3600,
  "services": {
    "database": "healthy",
    "blockfrost": "healthy",
    "cache": "healthy"
  },
  "blockfrostUsage": {
    "callsToday": 1250,
    "dailyBudget": 45000,
    "remaining": 43750,
    "percentUsed": 3
  }
}
```

### Log Alerts

The system emits structured log alerts (Pino JSON) at critical thresholds:

| Level | Trigger | Message |
|-------|---------|---------|
| `WARN` | 70% budget used | `⚠️ Blockfrost daily API budget: 70% consumed` |
| `ERROR` | 100% budget used | `🚨 Blockfrost daily API budget EXHAUSTED` |
| `INFO` | Candle cleanup | `Total candles cleaned by retention policy` |
| `INFO` | PriceTick cleanup | `Cleaned old price ticks` |

### Database Monitoring Queries

```sql
-- Check candle counts per interval
SELECT interval, COUNT(*) as count, 
       MIN("openTime") as oldest, MAX("openTime") as newest
FROM candles GROUP BY interval ORDER BY interval;

-- Check total database size
SELECT pg_size_pretty(pg_database_size(current_database()));

-- Check table sizes
SELECT tablename, 
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check PriceTick backlog
SELECT COUNT(*), MIN(timestamp) as oldest, MAX(timestamp) as newest 
FROM price_ticks;

-- Check active pools
SELECT id, "assetATicker", "assetBTicker", state, "updatedAt"
FROM pools WHERE state = 'ACTIVE';
```

---

## Schema Changes Summary

### Prisma Schema: CandleInterval Enum

**Before:**
```prisma
enum CandleInterval {
  H4     // 4 hours
  D1     // 1 day
  W1     // 1 week
}
```

**After:**
```prisma
enum CandleInterval {
  M1     // 1 minute  — retention: 2 days
  M5     // 5 minutes — retention: 7 days
  M15    // 15 minutes — retention: 14 days
  H1     // 1 hour    — retention: 30 days
  H4     // 4 hours   — retention: 90 days
  D1     // 1 day     — retention: 365 days
  W1     // 1 week    — retention: forever
}
```

### Migration Required

After deploying, run:
```bash
pnpm exec prisma migrate dev --name add-candle-timeframes
```

This adds `M1`, `M5`, `M15`, `H1` values to the `CandleInterval` PostgreSQL enum.

---

## Performance Summary

### Before Optimization

| Metric | Value |
|--------|-------|
| Blockfrost calls/day (1 pool) | ~12,000 |
| ChainSync interval | 30s |
| Cache TTLs | 15-30s |
| Candle intervals | 3 (H4, D1, W1) |
| Order processing | Active (wasting resources) |
| TX polling | Every 5s |
| Data retention | None (infinite growth) |

### After Optimization

| Metric | Value | Improvement |
|--------|-------|-------------|
| Blockfrost calls/day (1 pool) | ~2,300 | **-81%** |
| ChainSync interval | 120s (configurable) | **4x less frequent** |
| Cache TTLs | 30-600s | **2-4x longer** |
| Candle intervals | 7 (M1-W1) | **+4 intervals** |
| Order processing | Disabled | **Saves ~40% per sync** |
| TX polling | Every 10s + cached | **50% reduction** |
| Data retention | Auto-cleanup hourly | **Bounded storage** |

pnpm exec prisma migrate dev --name add-candle-timeframes