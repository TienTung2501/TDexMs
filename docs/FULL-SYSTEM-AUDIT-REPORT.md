# Full System Audit Report — SolverNet DEX

**Date:** 2025-07-25 (revised 2026-02-21)  
**Scope:** Complete deep-read audit of all backend source files, frontend pages/components, and test scripts.  
**Coverage:** 40 backend files · 12 route handlers · 5 background services · 8 frontend pages · 14 frontend components · 37 test scripts

> **Note:** The previous `BACKEND-AUDIT-REPORT.md` contained several inaccuracies due to incomplete scanning.
> This report supersedes it. Key corrections: Solver Engine IS implemented; ChainSync IS implemented.

---

## Table of Contents

1. [Backend Architecture — Complete Map](#1-backend-architecture--complete-map)
2. [TxBuilder Coverage vs Smart Contracts](#2-txbuilder-coverage-vs-smart-contracts)
3. [Background Services & Bots — Full Audit](#3-background-services--bots--full-audit)
4. [API Routes — Complete Inventory](#4-api-routes--complete-inventory)
5. [Database Update Audit per Action](#5-database-update-audit-per-action)
6. [Frontend Feature Coverage Audit](#6-frontend-feature-coverage-audit)
7. [Frontend Scripts & Test Coverage](#7-frontend-scripts--test-coverage)
8. [Bugs Found](#8-bugs-found)
9. [Gaps Found](#9-gaps-found)
10. [Prioritized Fix Plan](#10-prioritized-fix-plan)
11. [Summary Score](#11-summary-score)

---

## 1. Backend Architecture — Complete Map

```
backend/src/
├── index.ts                        # Composition root + startup (278 lines)
├── config/
│   ├── env.ts                      # Env var validation (Zod)
│   ├── logger.ts                   # Pino logger
│   └── network.ts                  # Cardano network config
├── domain/
│   ├── entities/
│   │   ├── Intent.ts               # Status lifecycle: CREATED→PENDING→ACTIVE→FILLING→FILLED/CANCELLED/EXPIRED/RECLAIMED
│   │   ├── Order.ts                # Types: LIMIT | DCA | STOP_LOSS
│   │   └── Pool.ts                 # AMM math: constantProduct, sqrt LP, priceImpact, APY
│   ├── errors/
│   │   └── index.ts                # 9 domain error classes
│   ├── ports/
│   │   ├── IChainProvider.ts       # UTxO/tip/submit/await/params interface
│   │   ├── IIntentRepository.ts    # findMany/findById/save/markExpired/updateStatus
│   │   ├── IOrderRepository.ts     # findMany/findExecutableOrders/markExpired
│   │   ├── IPoolRepository.ts      # findMany/findByPair/updateReserves/updateStats/findAllActive
│   │   └── ITxBuilder.ts           # 16 build methods interface
│   └── value-objects/
│       └── Asset.ts                # AssetId VO with policyId.assetName parsing
├── application/
│   ├── services/
│   │   └── CandlestickService.ts   # PriceTick recording, OHLCV aggregation, Redis cache (531 lines)
│   └── use-cases/
│       ├── CreatePool.ts
│       ├── DepositLiquidity.ts      ⚠️ No DB update after TX build
│       ├── WithdrawLiquidity.ts     ⚠️ No DB update after TX build
│       ├── CreateIntent.ts
│       ├── CancelIntent.ts
│       ├── GetPortfolio.ts          ⚠️ Returns counts only, no LP balances
│       ├── CreateOrder.ts
│       ├── CancelOrder.ts
│       ├── GetPoolInfo.ts
│       ├── ListOrders.ts
│       └── GetQuote.ts
├── infrastructure/
│   ├── cache/
│   │   └── CacheService.ts         # Upstash Redis wrapper with graceful degradation (212 lines)
│   ├── cardano/
│   │   ├── BlockfrostClient.ts     # IChainProvider: UTxOs, tip, submit, awaitTx, protocol params
│   │   ├── ChainProvider.ts        # Delegation wrapper over BlockfrostClient
│   │   ├── ChainSync.ts            # ✅ 30s pool UTxO sync + expired intent marking
│   │   ├── TxBuilder.ts            # ✅ 16 TX builder methods (2624 lines)
│   │   ├── KupoClient.ts           # Legacy — NOT used in production
│   │   └── OgmiosClient.ts         # Legacy — NOT used in production
│   ├── cron/
│   │   ├── PriceAggregationCron.ts # ✅ 60s PriceTick→Candle aggregation
│   │   └── ReclaimKeeperCron.ts    # ✅ 60s expired intent/order reclaim
│   └── database/
│       ├── IntentRepository.ts
│       ├── PoolRepository.ts
│       └── OrderRepository.ts
├── interface/
│   └── http/
│       ├── app.ts                  # Express app factory, mounts all routers
│       ├── routes/
│       │   ├── index.ts            # ⚠️ INCOMPLETE BARREL (only 6 of 12 routers exported)
│       │   ├── admin.ts            # 8 endpoints
│       │   ├── analytics.ts         # 3 endpoints
│       │   ├── chart.ts            # 7 endpoints (TradingView UDF)
│       │   ├── health.ts
│       │   ├── intents.ts
│       │   ├── orders.ts
│       │   ├── pools.ts
│       │   ├── portfolio.ts        # 7 endpoints
│       │   ├── quote.ts
│       │   ├── swap.ts             # 4 endpoints including solver + admin deploy
│       │   └── tx.ts               # 3 endpoints (submit/confirm/status)
│       └── ws/
│           └── WsServer.ts         # WebSocket for live intent/pool broadcasts
└── solver/
    ├── index.ts
    ├── BatchBuilder.ts             # ✅ Groups intents by pool, respects Cardano exec budget
    ├── IntentCollector.ts          # ✅ Queries chain for active escrow UTxOs, parses datums
    ├── RouteOptimizer.ts           # ✅ Direct + multi-hop routes, 5s pool cache
    └── SolverEngine.ts             # ✅ Main loop: collect→route→batch→settle
```

**Background services started in `index.ts`:**
1. `solverEngine.start()` — intent settlement loop
2. `chainSync.start()` — 30s pool UTxO + expired intent sync
3. `priceCron.start()` — 60s PriceTick→Candle aggregation
4. `reclaimKeeper.start()` — 60s expired intent/order reclaim
5. `httpServer.listen` + `WsServer` — WebSocket + HTTP

---

## 2. TxBuilder Coverage vs Smart Contracts

| Smart Contract Validator | On-Chain Actions | TxBuilder Method | Use-Case | API Route |
|---|---|---|---|---|
| `escrow_validator.ak` | Lock intent | `buildCreateIntentTx` | `CreateIntent` | `POST /intents` |
| `escrow_validator.ak` | Cancel intent | `buildCancelIntentTx` | `CancelIntent` | `DELETE /intents/:id` |
| `escrow_validator.ak` | Settle intent (solver) | `buildSettlementTx` | ❌ No use-case | `POST /solver/fill-intent` |
| `escrow_validator.ak` | Reclaim expired | `buildReclaimTx` | ❌ No use-case | (called by ReclaimKeeperCron) |
| `pool_validator.ak` | Create pool | `buildCreatePoolTx` | `CreatePool` | `POST /pools/create` |
| `pool_validator.ak` | Deposit | `buildDepositTx` | `DepositLiquidity` | `POST /pools/:id/deposit` |
| `pool_validator.ak` | Withdraw | `buildWithdrawTx` | `WithdrawLiquidity` | `POST /pools/:id/withdraw` |
| `pool_validator.ak` | Direct swap | `buildDirectSwapTx` | ❌ No use-case | `POST /swap/build` |
| `pool_validator.ak` | Collect fees | `buildCollectFeesTx` | ❌ No use-case | `POST /admin/revenue/build-collect` |
| `pool_validator.ak` | Burn pool NFT | `buildBurnPoolNFTTx` | ❌ No use-case | `POST /admin/pools/build-burn` |
| `factory_validator.ak` | Register pool | _(inside buildCreatePoolTx)_ | embedded | (same as create pool) |
| `factory_validator.ak` | Update factory admin | `buildUpdateFactoryAdminTx` | ❌ No use-case | `POST /admin/settings/build-update-factory` |
| `intent_token_policy.ak` | Mint/burn intent token | _(inside buildCreate/CancelIntentTx)_ | embedded | (same as intent) |
| `lp_token_policy.ak` | Mint/burn LP tokens | _(inside buildDeposit/WithdrawTx)_ | embedded | (same as liquidity) |
| `pool_nft_policy.ak` | Mint pool NFT | _(inside buildCreatePoolTx)_ | embedded | (same as create pool) |
| `order_validator.ak` | Create order | `buildOrderTx` | `CreateOrder` | `POST /orders` |
| `order_validator.ak` | Cancel order | `buildCancelOrderTx` | `CancelOrder` | `DELETE /orders/:id` |
| `order_validator.ak` | Execute order interval | `buildExecuteOrderTx` | ❌ No use-case | `POST /solver/execute-order` |
| `settings_validator.ak` | Deploy settings | `buildDeploySettingsTx` | ❌ No use-case | `POST /admin/settings/build-deploy` |
| `settings_validator.ak` | Update settings | `buildUpdateSettingsTx` | ❌ No use-case | `POST /admin/settings/build-update-global` |

**Summary:** 16/16 TxBuilder methods implemented ✅. 7/16 have domain use-cases. 9 actions route directly from routes → TxBuilder (bypassing domain layer).

---

## 3. Background Services & Bots — Full Audit

### 3.1 SolverEngine ✅ (fully implemented, previously missed in audit)

**File:** `backend/src/solver/SolverEngine.ts`  
**Config:** `SOLVER_ENABLED`, `SOLVER_ADDRESS`, `batchWindowMs`, `maxRetries`, `minProfitLovelace`  
**Loop:** continuous while running

| Step | Component | Status | Notes |
|---|---|---|---|
| Collect active escrow UTxOs from chain | `IntentCollector.getActiveIntents()` | ✅ Implemented | Queries Blockfrost, parses EscrowDatum |
| Filter out already-processing UTxOs | `IntentCollector.processingSet` | ✅ Implemented | Prevents double-processing |
| Filter out expired intents | `IntentCollector` | ✅ Implemented | deadline check |
| Find optimal swap routes | `RouteOptimizer.findRoutes()` | ✅ Implemented | Direct + multi-hop, min profit gating |
| Group intents into batches | `BatchBuilder.groupByPool()` | ✅ Implemented | Respects Cardano exec budget limits |
| Build settlement TX | `txBuilder.buildSettlementTx()` | ✅ Implemented | Pluggable — skips if txBuilder missing |
| Submit TX to chain | `chainProvider.submitTx()` | ✅ Implemented | With retry |
| Update intent DB status | `intentRepo.updateStatus(id, 'FILLED')` | ⚠️ BUG | Uses UTxO ref as ID, not UUID |
| Broadcast via WebSocket | `wsServer.broadcastIntent()` | ✅ Implemented | Sends FILLED event |
| Write Swap record to DB | — | ❌ MISSING | No `Swap` table insert |
| Call `candlestickService.recordTickAndUpdateCandles` | — | ❌ MISSING | Charts stay empty after settlement |
| Update pool reserves in DB | — | ❌ MISSING | Pool DB stale after settlement |

**🔴 Critical Bug — Intent ID mismatch in `settleBatch()`:**  
```typescript
// SolverEngine.ts line ~94
await this.intentRepo.updateStatus(
  `${intent.utxoRef.txHash}#${intent.utxoRef.outputIndex}`, // ← UTxO reference format
  'FILLING',
);
```
But `IIntentRepository.updateStatus(id: string)` expects a UUID like `int_abc123def`. The UTxO reference `txHash#outputIndex` will never match any DB row. **Intent statuses are never updated after solver settlement.**

---

### 3.2 IntentCollector ✅

| Feature | Status | Notes |
|---|---|---|
| Query chain for escrow UTxOs | ✅ | `blockfrost.getUtxos(escrowAddress)` |
| Parse `EscrowDatum` CBOR | ✅ | Constr index 0, fields[0–9] |
| Skip expired deadlines | ✅ | `deadline <= now` |
| Mark/clear processing set | ✅ | Prevents double-processing |
| Handle malformed datums | ✅ | Per-UTxO try/catch |

---

### 3.3 RouteOptimizer ✅

| Feature | Status | Notes |
|---|---|---|
| Direct route through single pool | ✅ | Uses `Pool.calculateSwapOutput()` |
| Multi-hop route via ADA | ✅ | Two-hop token→ADA→token |
| Pool cache (5s TTL) | ✅ | Prevents excessive DB queries |
| Best route selection (max output) | ✅ | Sorted by `totalOutput` |
| Minimum output validation | ✅ | Skips batch if below `minOutput` |

---

### 3.4 BatchBuilder ✅

| Feature | Status | Notes |
|---|---|---|
| Group by primary pool | ✅ | |
| Cardano execution budget enforcement | ✅ | CPU: 14B / MEM: 10M limits |
| Split oversized batches | ✅ | Chunks to `maxBatchSize()` |
| Surplus (solver profit) calculation | ✅ | `actualOutput - minRequired` |

---

### 3.5 ChainSync ✅ (previously missed in audit)

**File:** `backend/src/infrastructure/cardano/ChainSync.ts`  
**Schedule:** 30-second polling loop  
**Purpose:** Syncs pool UTxO references (txHash, outputIndex) when pool UTxO moves on-chain

| Feature | Status | Notes |
|---|---|---|
| Query Blockfrost for pool UTxO | ⚠️ BUG | Queries `blockfrost.getUtxos(pool.poolNftPolicyId)` — passes a **policy ID string** as Bech32 address to Blockfrost. Blockfrost `/addresses/{addr}/utxos` requires a valid Bech32 address. |
| Update `pool.txHash` + `pool.outputIndex` when changed | ✅ Logic correct | Will work if query is fixed |
| Mark expired intents via raw Prisma | ✅ | Duplicates `ReclaimKeeperCron` expired marking |

**🔴 Bug:** `syncPools()` passes `pool.poolNftPolicyId` (a hex policy ID) to `blockfrost.getUtxos()` which calls Blockfrost `/addresses/{address}/utxos`. A policy ID is not a Bech32 address — Blockfrost will reject this with a 400/404, silently caught by catch block. Pool UTxO sync never actually runs.

**Correct approach:** Query the pool validator address and filter by `poolNftPolicyId + poolNftAssetName` asset.

---

### 3.6 PriceAggregationCron ✅

| Feature | Status | Notes |
|---|---|---|
| 60s aggregation tick | ✅ | |
| Delegate to `CandlestickService.aggregateCandles()` | ✅ | |
| Periodic cleanup (every 60 cycles ≈ 1h) | ✅ | Deletes PriceTicks older than 2 days |
| Graceful start/stop | ✅ | `unref()` for clean Node exit |

**Gap:** `CandlestickService.recordTickAndUpdateCandles()` is never called from anywhere. `PriceTick` table stays empty. Aggregation runs but always processes 0 rows.

---

### 3.7 ReclaimKeeperCron ✅ (partial)

| Feature | Status | Notes |
|---|---|---|
| Mark expired intents in DB | ✅ | `intentRepo.markExpired(now)` |
| Mark expired orders in DB | ✅ | `orderRepo.markExpired(now)` |
| Build reclaim TX for expired intents | ✅ | `txBuilder.buildReclaimTx()` |
| Sign with keeper wallet (Lucid) | ✅ | `SOLVER_SEED_PHRASE` |
| Submit reclaim TX | ✅ | `signed.submit()` |
| Update DB to `RECLAIMED` after submit | ✅ | `intentRepo.updateStatus(id, 'RECLAIMED')` |
| Batch limit (10 per tick) | ✅ | Prevents overload |
| Build reclaim TX for expired **orders** | ❌ MISSING | Only intents are reclaimed on-chain; order funds stay locked |
| Retry limit for failed UTxOs | ❌ MISSING | Infinite retry on already-spent UTxOs |

---

## 4. API Routes — Complete Inventory

### Total routes by file:

| File | Mounted at | Endpoint Count | In routes/index.ts |
|---|---|---|---|
| `health.ts` | `/health` | 1 | ✅ |
| `quote.ts` | `/quote` | 1 | ✅ |
| `intents.ts` | `/intents` | 4 | ✅ |
| `pools.ts` | `/pools` | 5 | ✅ |
| `analytics.ts` | `/analytics` | 3 | ✅ |
| `swap.ts` | `/swap`, `/solver`, `/admin/settings` | 4 | ✅ |
| `orders.ts` | `/orders` | 4 | ⚠️ NOT in barrel |
| `admin.ts` | `/admin` | 8 | ⚠️ NOT in barrel |
| `chart.ts` | `/chart` | 7 | ⚠️ NOT in barrel |
| `tx.ts` | `/tx` | 3 | ⚠️ NOT in barrel |
| `portfolio.ts` | `/portfolio` | 7 | ⚠️ NOT in barrel |

**Note:** `routes/index.ts` only exports 6 routers. Whether all 11 files are mounted depends on `app.ts`. Likely `app.ts` imports them individually — this is a barrel completeness issue, not a runtime issue. Needs verification.

---

### Full endpoint list (47 total):

**Health**
- `GET /health`

**Quote**
- `GET /quote?inputAsset&outputAsset&inputAmount&slippage`

**Intents**
- `POST /intents` — create intent (unsigned TX)
- `GET /intents` — list intents (address, status, limit, cursor)
- `GET /intents/:id` — get intent by ID
- `DELETE /intents/:id` — cancel intent (unsigned TX)

**Orders**
- `POST /orders` — create order
- `GET /orders` — list orders
- `GET /orders/:id` — get order
- `DELETE /orders/:id` — cancel order

**Pools**
- `POST /pools/create` — create pool (unsigned TX)
- `GET /pools` — list pools (state, search, sortBy, limit, cursor)
- `GET /pools/:id` — get pool
- `POST /pools/:id/deposit` — deposit liquidity
- `POST /pools/:id/withdraw` — withdraw liquidity

**Analytics**
- `GET /analytics/overview` — TVL, volume, fees, stats
- `GET /analytics/prices` — all pool prices
- `GET /analytics/tokens/:assetId` — per-token stats

**Chart (TradingView UDF)**
- `GET /chart/config`
- `GET /chart/symbols?symbol=`
- `GET /chart/history` — OHLCV UDF format
- `GET /chart/candles` — raw candles
- `GET /chart/price/:poolId`
- `GET /chart/info/:poolId`
- `GET /chart/intervals`

**Swap / Solver**
- `POST /swap/build` — build direct pool swap TX
- `POST /solver/fill-intent` — solver builds settlement TX for escrow intents
- `POST /solver/execute-order` — solver builds execute-order TX
- `POST /admin/settings/build-deploy` — deploy initial settings UTxO

**Transaction**
- `POST /tx/submit` — submit signed CBOR to Blockfrost
- `POST /tx/confirm` — frontend confirms TX (updates intent status to ACTIVE)
- `GET /tx/:txHash/status` — poll TX confirmation

**Portfolio**
- `GET /portfolio/summary?wallet_address=`
- `GET /portfolio/open-orders?wallet_address=`
- `GET /portfolio/history?wallet_address=`
- `GET /portfolio/liquidity?wallet_address=`
- `POST /portfolio/build-action` — build cancel/reclaim TX
- `POST /portfolio/build-withdraw` — build LP withdraw TX
- `GET /portfolio/:address` — legacy summary
- `GET /portfolio/:address/transactions`

**Admin**
- `GET /admin/auth/check`
- `GET /admin/dashboard/metrics`
- `GET /admin/revenue/pending`
- `POST /admin/revenue/build-collect`
- `GET /admin/settings/current`
- `POST /admin/settings/build-update-global`
- `POST /admin/settings/build-update-factory`
- `POST /admin/pools/build-burn`

---

## 5. Database Update Audit per Action

### Summary table (with ChainSync correction):

| Action | Models Written | Critical Missing Updates |
|---|---|---|
| `CreatePool` | `Pool` (create) | ❌ No PoolHistory snapshot; `outputIndex` hardcoded to 0 (but ChainSync will correct it within 30s) |
| `CreateIntent` | `Intent` (create) | ⚠️ escrowTxHash/Idx null; updated to ACTIVE by `POST /tx/confirm` ✅ |
| `CancelIntent` | `Intent` (update status) | ⚠️ CANCELLED set before TX confirmed; no settlementTxHash stored |
| `DepositLiquidity` | ❌ NONE | ❌ No pool reserve update; stale pool state |
| `WithdrawLiquidity` | ❌ NONE | ❌ No pool reserve update; stale pool state |
| `CreateOrder` | `Order` (create) | ⚠️ escrowOutputIndex hardcoded to 0 |
| `CancelOrder` | `Order` (update) | ⚠️ DB saves CANCELLED but response says CANCELLING |
| `SolverEngine settle` | `Intent` (updateStatus) | 🔴 BUG: Uses UTxO ref as ID, will always fail; no Swap record; no pool update |
| `ReclaimKeeperCron` | `Intent` (updateStatus to RECLAIMED) | ✅ Correct |
| `ChainSync` | `Pool` (txHash + outputIndex) | ⚠️ BUG in Blockfrost query — see §3.5 |
| Direct swap (`/swap/build`) | ❌ NONE | ❌ No Swap record, no pool update |
| Execute order (`/solver/execute-order`) | ❌ NONE | ❌ No Order update (remainingBudget, executedIntervals) |

### Fields that are NEVER populated across all actions:

| DB Table | Always-Empty Fields | Reason |
|---|---|---|
| `Swap` | ALL rows | No writer in any flow |
| `PriceTick` | ALL rows | `recordTickAndUpdateCandles` never called |
| `Candle` | ALL rows | No source data (PriceTick empty) |
| `ProtocolStats` | ALL rows | No writer anywhere |
| `PoolHistory` | ALL rows | Snapshot never triggered |
| `Pool.protocolFeeAccA/B` | Stays at 0 | Not incremented after swaps |

---

## 6. Frontend Feature Coverage Audit

### Pages vs Smart Contract Features

| Feature / Smart Contract Action | Frontend Page | Component | Status |
|---|---|---|---|
| **Swap via intent (escrow)** | `/` | `SwapCard` | ✅ Implemented - calls `createIntent` |
| **Direct pool swap** | `/` | `SwapCard` | ⚠️ SwapCard calls `createIntent`, NOT `buildDirectSwapTx`. No UI toggle for direct swap mode. |
| **Limit order** | `/` | `OrderEntryCard` (Limit tab) | ✅ Implemented |
| **DCA order** | `/` | `OrderEntryCard` (DCA tab) | ✅ Implemented |
| **Stop-loss order** | `/` | `OrderEntryCard` (Stop-Loss tab) | ✅ Implemented |
| **Cancel intent** | `/orders`, `/` footer | `TradingFooter`, orders page | ✅ Implemented |
| **Cancel order** | `/orders`, `/` footer | `TradingFooter`, orders page | ✅ Implemented |
| **Create pool** | `/pools/create` | Create pool form | ✅ Implemented |
| **Deposit liquidity** | `/pools/[id]` | `LiquidityForm` (Deposit tab) | ✅ Implemented |
| **Withdraw liquidity** | `/pools/[id]` | `LiquidityForm` (Withdraw tab) | ✅ Implemented |
| **View pool list** | `/pools` | Pool list cards | ✅ Implemented |
| **Pool detail + chart** | `/pools/[id]` | `PriceChart`, pool stats | ✅ Implemented |
| **Portfolio overview** | `/portfolio` | Summary, open orders, history | ✅ Implemented |
| **LP positions** | `/portfolio` | Liquidity tab | ⚠️ Placeholder — uses `getPortfolioLiquidity` but backend returns estimate only |
| **Analytics** | `/analytics` | 4 metric cards, top pools, fills | ✅ Implemented |
| **Admin dashboard** | `/admin` | Read-only metrics | ✅ Implemented |
| **Collect fees** | `/admin/revenue` | Multi-select fee collection | ✅ Implemented |
| **Update protocol settings** | `/admin/settings` | Two forms (settings + factory admin) | ✅ Implemented |
| **Deploy initial settings** | ❌ Missing page | — | ❌ No UI — only available via `deploy-settings.ts` script |
| **Burn pool NFT** | `/admin/danger` | Burn form with confirmation | ✅ Implemented |
| **Price chart** | `/` and `/pools/[id]` | `PriceChart` (lightweight-charts) | ✅ UI ready — ⚠️ data empty because PriceTick not populated |
| **Order book** | `/` | `PseudoOrderbook` | ✅ Implemented — aggregates live intents/orders |
| **Recent trades** | `/` footer | `RecentTradesTable` | ✅ UI ready — ⚠️ shows FILLED intents; empty if solver never runs |
| **TX progress tracking** | All forms | `useTransaction` hook + `TxToastContainer` | ✅ Implemented |
| **Wallet connect (CIP-30)** | All pages | `WalletConnectDialog`, `WalletProvider` | ✅ Implemented |

### Frontend API Client Coverage (`lib/api.ts` — 832 lines)

The API client covers all major endpoints. **Gaps**:

| Missing in api.ts | Endpoint | Notes |
|---|---|---|
| `GET /tx/:txHash/status` | Transaction status poll | Scripts have it, frontend lacks polling widget |
| `GET /chart/symbols`, `/chart/config` | TradingView UDF | Chart uses direct candle endpoint instead |
| `GET /portfolio/:address/transactions` | Legacy TX history | Covered by `getPortfolioHistory` |

### Lib / Hooks Analysis

**`hooks.ts` (469 lines):** All data hooks implemented with normalized types. Hooks: `usePools`, `usePool`, `useAnalytics`, `useIntents`, `useOrders`, `useCandles`, `usePrice`, `usePortfolio*` (4 hooks).

**`use-transaction.ts` (150 lines):** Centralized CIP-30 TX lifecycle. Stages: building → signing → submitting → confirmed. Calls `confirmTx` on backend after submit. **All mutation components use this hook.**

**`mock-data.ts` (153 lines):** Token registry with display metadata. Shows 10 tokens: ADA, tBTC, tUSDT, tPOL, tNEAR, tSOL, HOSKY, SNEK, MIN + others. Acts as the source of truth for token display.

---

## 7. Frontend Scripts & Test Coverage

Full inventory of `frontend/scripts/src/` — **37 files total**:

### Read-Only Query Scripts (13 files)

| Script | Endpoints Tested |
|---|---|
| `health.ts` | `GET /health` |
| `quote.ts` | `GET /quote` |
| `list-pools.ts` | `GET /pools` |
| `pool-detail.ts` | `GET /pools/:id` + history |
| `list-intents.ts` | `GET /intents` |
| `intent-detail.ts` | `GET /intents/:id` |
| `list-orders.ts` | `GET /orders` |
| `order-detail.ts` | `GET /orders/:id` |
| `analytics.ts` | `GET /analytics/*` (3 endpoints) |
| `chart.ts` | `GET /chart/*` (7 UDF endpoints) |
| `tx-status.ts` | `GET /tx/:hash/status` |
| `submit-tx.ts` | `POST /tx/submit` |
| `portfolio.ts` | All 6 portfolio endpoints |

### Write Scripts (11 files — with wallet signing)

| Script | Endpoint | Notes |
|---|---|---|
| `create-pool.ts` | `POST /pools/create` + `/tx/confirm` | Full sign+submit+poll flow |
| `deposit-liquidity.ts` | `POST /pools/:id/deposit` | |
| `withdraw-liquidity.ts` | `POST /pools/:id/withdraw` | Calculates % from totalLpTokens |
| `create-intent.ts` | `POST /intents` | 30-min deadline |
| `cancel-intent.ts` | `DELETE /intents/:id` | |
| `fill-intent.ts` | `POST /solver/fill-intent` | Solver fills escrow |
| `create-order.ts` | `POST /orders` | LIMIT / DCA / STOP_LOSS |
| `cancel-order.ts` | `DELETE /orders/:id` | |
| `execute-order.ts` | `POST /solver/execute-order` | Solver executes DCA interval |
| `direct-swap.ts` | `POST /swap/build` | Atomic pool swap |
| `portfolio-action.ts` | `POST /portfolio/build-action` + `/build-withdraw` | Cancel/reclaim UTxO |

### Token Utility Scripts (4 files)

| Script | Description |
|---|---|
| `mint-test-tokens.ts` | Mints 5 test tokens (tBTC, tUSDT, tPOL, tNEAR, tSOL) with CIP-25 metadata |
| `burn-tokens.ts` | Burns tokens by reconstructing Native Script policy |
| `wallet-balance.ts` | Shows ADA + all native assets for test wallets |
| `list-escrow-utxos.ts` | Queries escrow validator address, decodes inline datums |

### Admin Scripts (7 files)

| Script | Description |
|---|---|
| `admin-status.ts` | Full dashboard: health + analytics + pools + intents + orders + 3 admin endpoints |
| `admin-collect-fees.ts` | `POST /admin/revenue/build-collect` → sign → submit |
| `admin-update-settings.ts` | `POST /admin/settings/build-update-global` with merge |
| `admin-transfer-factory.ts` | `POST /admin/settings/build-update-factory` |
| `admin-burn-pool.ts` | `POST /admin/pools/build-burn` |
| `admin-emergency-shutdown.ts` | Sets fee=0, minLiquidity=max → emergency shutdown |
| `admin-trigger-solver.ts` | Read-only: inspect solver queue (doesn't trigger solver) |

### Deploy / Debug Scripts (3 files)

| Script | Description |
|---|---|
| `deploy-factory.ts` | Full factory bootstrap: load `plutus.json`, resolve validators, mint factory NFT, build FactoryDatum, submit |
| `deploy-settings.ts` | `POST /admin/settings/build-deploy` — initial settings UTxO |
| `debug-create-pool.ts` | Step-by-step local simulation of `buildCreatePoolTx` with detailed logging |

### Test Runners (2 files)

| Script | Description |
|---|---|
| `run-all-tests.ts` | Regression suite (9 sections): health, analytics, pools, quotes, intents, orders, chart, portfolio, admin. Prints pass/fail/skip summary |
| `e2e-full-test.ts` | 684-line full lifecycle E2E: 7 phases from system health → cleanup. Supports `--skip-write` and `--phase=` flags |

**Script coverage score: 45/47 endpoints covered** (missing: `DELETE /intents/:id` direct Blockfrost datum read, `GET /admin/auth/check` not in e2e suite).

---

## 8. Bugs Found

### 🔴 Critical Bugs

| # | Bug | Location | Impact |
|---|---|---|---|
| B1 | `SolverEngine.settleBatch()` uses UTxO reference format (`txHash#outputIndex`) as intent ID when calling `intentRepo.updateStatus()` | `SolverEngine.ts` lines ~94, ~112, ~118 | Solver runs, TXs submit, but **no intent status is ever updated in DB**. All intents stay FILLING. Next solver tick re-processes same intents. Potential double-settlement. |
| B2 | `ChainSync.syncPools()` passes `pool.poolNftPolicyId` (hex string) as Bech32 address to `blockfrost.getUtxos()` | `ChainSync.ts` `syncPools()` | Blockfrost call silently fails. Pool UTxO sync (txHash/outputIndex) never runs. |

### 🟠 High Bugs

| # | Bug | Location | Impact |
|---|---|---|---|
| B3 | `DepositLiquidity` and `WithdrawLiquidity` build TX but do not update pool reserves in DB | `DepositLiquidity.ts`, `WithdrawLiquidity.ts` | Pool TVL, reserves, LP supply permanently stale after deposits/withdrawals until ChainSync fixes (but ChainSync is also broken — B2) |
| B4 | `CancelOrder` saves status `CANCELLED` to DB but returns `status: 'CANCELLING'` | `CancelOrder.ts` | DB-API inconsistency |
| B5 | `CandlestickService.recordTickAndUpdateCandles()` exists but is never called from any use-case or route | No caller found | All chart/price data empty. PriceAggregationCron aggregates 0 rows. |

### 🟡 Medium Bugs

| # | Bug | Location | Impact |
|---|---|---|---|
| B6 | `CreatePool` and `CreateOrder` hardcode `outputIndex: 0` | Both use-cases | Until ChainSync corrects it (currently broken), all UTXO references are potentially wrong |
| B7 | `ReclaimKeeperCron` does not build/submit reclaim TXs for expired **orders** | `ReclaimKeeperCron.ts` `tick()` | Order funds remain locked on-chain after expiry |
| B8 | `SolverEngine.settleBatch()` updates intent to `FILLING` before TX is built/submitted | `SolverEngine.ts` | If TX build fails, intent stays FILLING forever (blocks next solver iteration for that intent) |
| B9 | `routes/index.ts` barrel only exports 6 of 11 routers | `routes/index.ts` | If `app.ts` uses the barrel, orders/admin/chart/tx/portfolio routes are silently missing |

---

## 9. Gaps Found

### Backend Gaps

| # | Gap | Impact |
|---|---|---|
| G1 | No domain use-case for settlement (solver fills intent directly in route handler) | No input validation, no domain events, no error type enforcement |
| G2 | No domain use-case for direct swap (route calls TxBuilder directly) | Same as G1 |
| G3 | No domain use-case for execute-order (route calls TxBuilder directly) | DCA execution bypasses domain layer |
| G4 | No domain use-case for settings management | Admin routes call TxBuilder directly |
| G5 | `ProtocolStats` table never written | `/analytics/overview` returns live DB aggregation, not snapshot stats |
| G6 | `PoolHistory` table never written | Pool APY/historical TVL charts cannot be rendered |
| G7 | `Swap` table never written | Swap history, pool volume24h updates all missing |
| G8 | No webhook/event system for confirmed TXs | Frontend must poll `/tx/:hash/status`; server-push updates only for solver-filled intents (WS) |
| G9 | `GetPortfolio` returns intent/order counts only; no LP token quantities | Portfolio LP position value cannot be displayed |
| G10 | `admin-trigger-solver.ts` is read-only; no HTTP endpoint to manually trigger solver cycle | Admin cannot force solver run |
| G11 | `WsServer` broadcasts intent events but no topic for pool state changes | Pool chart price not pushed via WS after settlement |
| G12 | `KupoClient` and `OgmiosClient` exist but unused; creates maintenance confusion | |

### Frontend Gaps

| # | Gap | Impact |
|---|---|---|
| G13 | `SwapCard` always uses `createIntent` regardless of swap type; no toggle for direct swap mode | Direct swap feature (`POST /swap/build`) inaccessible from UI |
| G14 | No "Deploy Initial Settings" admin page | First-time protocol deployment cannot be done from admin UI; requires `deploy-settings.ts` script |
| G15 | LP positions page (`/portfolio` → Liquidity tab) returns only estimated data from backend | True LP token balances require on-chain Blockfrost query not yet implemented |
| G16 | Price chart on `/` and `/pools/[id]` renders empty because `PriceTick` never populated (B5) | Core chart feature non-functional |
| G17 | No solver status monitoring page | Operations team cannot observe solver queue/health from admin UI |
| G18 | No DCA order progress widget (current interval / total intervals) | Users cannot track DCA execution progress |
| G19 | `TokenSelectDialog` uses static `TOKEN_LIST` from `mock-data.ts`; no dynamic token discovery from pools | New pools with unlisted tokens cannot be traded from UI |
| G20 | Admin auth check (`GET /admin/auth/check`) falls back to `authorized=true` in dev | Security risk if deployed in non-detected "dev" environment |

---

## 10. Prioritized Fix Plan

### Phase 1 — Critical Bugs (fix before any testing)

**P1.1 — Fix SolverEngine intent ID mismatch (B1)**

The solver must look up intents by escrow UTxO reference, not use the UTxO ref as the id.

```typescript
// In SolverEngine.ts, replace direct updateStatus calls with:
const dbIntent = await this.intentRepo.findByEscrowRef(
  intent.utxoRef.txHash, intent.utxoRef.outputIndex
);
if (dbIntent) {
  await this.intentRepo.updateStatus(dbIntent.id, 'FILLING');
}
```

Add `findByEscrowRef(txHash: string, outputIndex: number): Promise<Intent | null>` to `IIntentRepository`.

**P1.2 — Fix ChainSync pool query (B2)**

```typescript
// ChainSync.ts syncPools() — replace:
const utxos = await this.blockfrost.getUtxos(pool.poolNftPolicyId);
// with:
const utxos = await this.blockfrost.getUtxosByAsset(
  POOL_VALIDATOR_ADDRESS, // from config/env
  pool.poolNftPolicyId,
  pool.poolNftAssetName,
);
```

**P1.3 — Wire `recordTickAndUpdateCandles` after every swap (B5)**

In `SolverEngine.settleBatch()`, after successful TX submission, for each batch hop:
```typescript
const price = Number(batch.totalOutputAmount) / Number(batch.totalInputAmount);
await candlestickService.recordTickAndUpdateCandles(batch.poolId, price, batch.totalInputAmount);
```

In `POST /swap/build` route handler, after return (or in `POST /tx/confirm` when type=swap):
```typescript
await candlestickService.recordTickAndUpdateCandles(poolId, swapPrice, inputAmount);
```

**P1.4 — Post-settlement DB updates (B1 + G7)**

After solver settles a batch, write:
1. `Swap` record per intent
2. `poolRepo.updateReserves()` with new reserves
3. `poolRepo.updateStats()` with volume/fees deltas

---

### Phase 2 — High Priority

**P2.1 — Pool reserves after deposit/withdraw (B3)**

After `DepositLiquidity` and `WithdrawLiquidity` build TX, call `poolRepo.updateReserves()` optimistically with computed reserve changes. Also write `PoolHistory` snapshot.

**P2.2 — Fix CancelOrder DB/response inconsistency (B4)**

Save `CANCELLING` to DB, update to `CANCELLED` via `POST /tx/confirm` webhook.

**P2.3 — Order reclaim on-chain (B7)**

Add to `ReclaimKeeperCron.tick()`:
```typescript
await this.reclaimExpiredOrders();
```
Use `txBuilder.buildCancelOrderTx()` for expired orders with escrow UTxOs.

**P2.4 — Fix SolverEngine FILLING status on failure (B8)**

```typescript
// Before building TX, don't mark FILLING yet
// After successful submit:
await this.intentRepo.updateStatus(dbIntent.id, 'FILLED');
// On failure, revert:
await this.intentRepo.updateStatus(dbIntent.id, 'ACTIVE');
```

---

### Phase 3 — Medium Priority

**P3.1 — Domain use-cases for settlement and execute-order**

Create:
- `SettleIntent.ts` — validation + TxBuilder call + DB writes (Swap record, pool update)
- `ExecuteOrderInterval.ts` — validation + TxBuilder call + Order DB update (remainingBudget, executedIntervals)

**P3.2 — Frontend: add direct swap toggle to SwapCard**

Add a "Mode" toggle (Intent / Direct) to `SwapCard`. Direct mode calls `POST /swap/build`; intent mode keeps existing flow.

**P3.3 — Deploy Settings admin page**

Add `/admin/settings/deploy` page with a form calling `POST /admin/settings/build-deploy`. One-time action; disable after first run.

**P3.4 — Fix routes/index.ts barrel**

Add missing router exports:
```typescript
export { createOrderRouter } from './orders.js';
export { createAdminRouter } from './admin.js';
export { createChartRouter } from './chart.js';
export { createTxRouter } from './tx.js';
export { createPortfolioRouter } from './portfolio.js';
```

---

### Phase 4 — Enhancements

- **P4.1** Add `PoolHistory` snapshot writes on every pool state change
- **P4.2** Add `ProtocolStats` cron (hourly snapshot)
- **P4.3** Implement LP token quantity lookup in `GetPortfolio` via Blockfrost
- **P4.4** Add solver status admin page to frontend
- **P4.5** Add DCA progress widget to orders page
- **P4.6** Replace static `TOKEN_LIST` with dynamic pool-based token discovery
- **P4.7** Add `findByEscrowRef` index to IntentRepository (needed for P1.1)
- **P4.8** Add retry limit to ReclaimKeeperCron (move to `RECLAIM_FAILED` after 3 attempts)

---

## 11. Summary Score

### Backend

| Layer | Implemented | Total | Score |
|---|---|---|---|
| TxBuilder methods | 16 | 16 | 100% ✅ |
| Domain use-cases | 11 | ~20 needed | 55% ⚠️ |
| API endpoints | 47 | ~50 needed | 94% ✅ |
| Background services | 5 | 5 | 100% ✅ |
| DB field update correctness | ~6 | 12 actions | 50% ❌ |
| Critical bugs | — | 2 | Blocks core flow |

### Frontend

| Area | Implemented | Total | Score |
|---|---|---|---|
| Pages | 11 | 12 needed | 92% ✅ |
| Smart contract features visible | 12 | 14 | 86% ✅ |
| API endpoints covered in api.ts | ~44 | 47 | 94% ✅ |
| Script test coverage | 45 | 47 endpoints | 96% ✅ |

### Overall System Health

| Category | Status | Notes |
|---|---|---|
| TxBuilder complete | ✅ | All 16 methods |
| Solver exists & runs | ✅ BUT 🔴 | Runs but ID bug breaks DB updates |
| ChainSync exists & runs | ✅ BUT 🔴 | Runs but Blockfrost query bug — pool sync never works |
| Price chart data pipeline | ❌ | `recordTick` never called → PriceTick empty → charts empty |
| Intent fill DB correctness | ❌ | Solver ID mismatch means intents stay FILLING |
| Pool state freshness | ❌ | Deposit/withdraw don't update DB; ChainSync broken |
| Frontend feature coverage | ✅ | All major pages exist; minor gaps |
| Test script coverage | ✅ | 37 scripts including E2E |

**Overall system: ~68% functional.** Core infrastructure (solver, chain sync, cron) EXISTS but has critical runtime bugs (B1, B2) that prevent the system from working correctly end-to-end. The frontend is well-implemented. Fixing B1+B2+B5 would unblock the majority of functionality.

---

*Report generated from full source read of 40 backend files + 8 frontend pages + 14 components + 37 scripts.*
