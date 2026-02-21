# SolverNet DEX — Frontend ↔ Backend Gap Analysis Report

> **Auditor:** Automated code review  
> **Date:** 2025  
> **Scope:** Every frontend page/component/hook/API call vs every backend route/use-case/entity

---

## Table of Contents

- [A. Backend Endpoint Inventory](#a-backend-endpoint-inventory)
- [B. Frontend API Function Inventory](#b-frontend-api-function-inventory)
- [C. Frontend Page Feature Inventory](#c-frontend-page-feature-inventory)
- [D. Gap Analysis (Critical)](#d-gap-analysis-critical)
- [E. Missing DEX Features](#e-missing-dex-features)
- [F. WebSocket Analysis](#f-websocket-analysis)
- [G. Mock Data & Fallback Usage](#g-mock-data--fallback-usage)

---

## A. Backend Endpoint Inventory

| # | Method | Route | Handler | Notes |
|---|--------|-------|---------|-------|
| 1 | GET | `/v1/health` | Inline | Returns `{ status, timestamp, uptime, network }` |
| 2 | GET | `/v1/health/ready` | Inline | DB + chain connectivity check |
| 3 | GET | `/v1/quote` | `GetQuote.execute()` | Params: `inputAsset, outputAsset, inputAmount, slippage` |
| 4 | POST | `/v1/intents` | `CreateIntent.execute()` | Returns `{ unsignedTx, txHash, intentId, estimatedFee }` |
| 5 | GET | `/v1/intents` | `IntentRepo.findMany()` | Params: `address, status, cursor, limit` |
| 6 | GET | `/v1/intents/:intentId` | `IntentRepo.findById()` | Direct Prisma lookup |
| 7 | DELETE | `/v1/intents/:intentId` | `CancelIntent.execute()` | Requires `senderAddress` in body |
| 8 | GET | `/v1/pools` | `GetPoolInfo.list()` | Returns raw `PoolPage` (**⚠️ see D-1**) |
| 9 | GET | `/v1/pools/:poolId` | `GetPoolInfo.getById()` | Properly serialized PoolResponse shape |
| 10 | POST | `/v1/pools/create` | `CreatePool.execute()` | Returns `{ unsignedTx, txHash, poolId, estimatedFee }` |
| 11 | POST | `/v1/pools/:poolId/deposit` | `DepositLiquidity.execute()` | Returns `{ unsignedTx, txHash, estimatedFee, lpTokensExpected }` |
| 12 | POST | `/v1/pools/:poolId/withdraw` | `WithdrawLiquidity.execute()` | Returns `{ unsignedTx, txHash, estimatedFee, expectedA, expectedB }` |
| 13 | GET | `/v1/pools/:poolId/history` | Inline Prisma query | Returns `PoolHistory[]` rows or random placeholder |
| 14 | POST | `/v1/orders` | `CreateOrder.execute()` | Returns `{ unsignedTx, txHash, orderId, estimatedFee }` |
| 15 | GET | `/v1/orders` | `ListOrders.execute()` | Params: `creator, status, type, cursor, limit` |
| 16 | GET | `/v1/orders/:orderId` | `OrderRepo.findById()` | Direct Prisma lookup |
| 17 | DELETE | `/v1/orders/:orderId` | `CancelOrder.execute()` | Requires `senderAddress` in body |
| 18 | POST | `/v1/tx/submit` | `ChainProvider.submitTx()` | Accepts `{ signedTx }` CBOR hex |
| 19 | POST | `/v1/tx/confirm` | Inline | Body: `{ txHash, action, intentId?, orderId? }` |
| 20 | GET | `/v1/tx/:txHash/status` | `ChainProvider.getTxStatus()` | Returns `{ txHash, confirmed, blockHash?, slot? }` |
| 21 | GET | `/v1/analytics/overview` | Inline Prisma | Aggregates from `ProtocolStats` + counts |
| 22 | GET | `/v1/analytics/tokens/:assetId` | Inline Prisma | Pools containing asset; price/volume stubbed to 0 |
| 23 | GET | `/v1/analytics/prices` | Inline | Hardcoded `$0.50` ADA price, pool prices from reserves |
| 24 | GET | `/v1/chart/config` | Inline | TradingView UDF config |
| 25 | GET | `/v1/chart/symbols` | Inline | TradingView symbol resolution |
| 26 | GET | `/v1/chart/history` | CandlestickService | TradingView UDF `/history` endpoint |
| 27 | GET | `/v1/chart/candles` | CandlestickService | Custom candle endpoint (`poolId, interval, from, to, limit`) |
| 28 | GET | `/v1/chart/price/:poolId` | CandlestickService | Latest price + 24h change + volume |
| 29 | GET | `/v1/chart/info/:poolId` | CandlestickService | Pool chart info (pairs, 24h stats) |
| 30 | GET | `/v1/chart/intervals` | Inline | Returns supported intervals |
| 31 | GET | `/v1/portfolio/:address` | `GetPortfolio.execute()` | Summary: counts of intents/orders/pools for address |
| 32 | GET | `/v1/portfolio/:address/transactions` | Inline Prisma | Swaps + Intents for address |
| 33 | GET | `/v1/portfolio/summary` | Inline Prisma | Wallet address's balances & positions |
| 34 | GET | `/v1/portfolio/open-orders` | Inline Prisma | Active intents + orders for address |
| 35 | GET | `/v1/portfolio/history` | Inline Prisma | Filled/Cancelled/Expired intents + orders |
| 36 | GET | `/v1/portfolio/liquidity` | Inline | Returns `[]` (not implemented) |
| 37 | POST | `/v1/portfolio/build-action` | Inline | Actions: `cancel_intent`, `cancel_order`, `reclaim` → delegates to use cases |
| 38 | POST | `/v1/portfolio/build-withdraw` | Inline | Delegates to `WithdrawLiquidity.execute()` |
| 39 | GET | `/v1/admin/auth/check` | Inline | Params: `address` → checks if admin VKH matches |
| 40 | GET | `/v1/admin/dashboard/metrics` | Inline Prisma | TVL, volume, pool counts, fee growth |
| 41 | GET | `/v1/admin/revenue/pending` | Inline Prisma | Protocol fee accumulators per pool |
| 42 | POST | `/v1/admin/revenue/build-collect` | **⛔ 501** | Not Implemented |
| 43 | GET | `/v1/admin/settings/current` | Inline | Reads global settings from chain/config |
| 44 | POST | `/v1/admin/settings/build-update-global` | **⛔ 501** | Not Implemented |
| 45 | POST | `/v1/admin/settings/build-update-factory` | **⛔ 501** | Not Implemented |
| 46 | POST | `/v1/admin/pools/build-burn` | **⛔ 501** | Not Implemented |

**Total: 46 endpoints (4 return 501 Not Implemented)**

---

## B. Frontend API Function Inventory

| # | Function | Backend Route | Used By |
|---|----------|---------------|---------|
| 1 | `checkHealth()` | GET /v1/health | Not used in any page |
| 2 | `checkReady()` | GET /v1/health/ready | Not used in any page |
| 3 | `getQuote()` | GET /v1/quote | Not used — swap-card.tsx uses local AMM calc instead |
| 4 | `createIntent()` | POST /v1/intents | `swap-card.tsx` via `useTransaction` |
| 5 | `getIntent()` | GET /v1/intents/:id | Not used directly (list used instead) |
| 6 | `listIntents()` | GET /v1/intents | `useIntents` hook → orders page, swap page, trading-footer |
| 7 | `cancelIntent()` | DELETE /v1/intents/:id | orders page, trading-footer, portfolio page |
| 8 | `listPools()` | GET /v1/pools | `usePools` hook → pools page, swap page, analytics page |
| 9 | `getPool()` | GET /v1/pools/:id | `usePool` hook → pool detail page |
| 10 | `createPool()` | POST /v1/pools/create | pools/create page via `useTransaction` |
| 11 | `depositLiquidity()` | POST /v1/pools/:id/deposit | `liquidity-form.tsx` via `useTransaction` |
| 12 | `withdrawLiquidity()` | POST /v1/pools/:id/withdraw | `liquidity-form.tsx` via `useTransaction` |
| 13 | `getPoolHistory()` | GET /v1/pools/:id/history | pool detail page (recent trades) |
| 14 | `getAnalyticsOverview()` | GET /v1/analytics/overview | `useAnalytics` hook → analytics page |
| 15 | `getTokenAnalytics()` | GET /v1/analytics/tokens/:id | Not used in any page |
| 16 | `getAnalyticsPrices()` | GET /v1/analytics/prices | Not used in any page |
| 17 | `getChartCandles()` | GET /v1/chart/candles | `useCandles` hook → price-chart.tsx |
| 18 | `getChartPrice()` | GET /v1/chart/price/:id | `usePrice` hook → swap page, pool detail |
| 19 | `createOrder()` | POST /v1/orders | `order-entry-card.tsx` via `useTransaction` |
| 20 | `listOrders()` | GET /v1/orders | `useOrders` hook → orders page, swap page, trading-footer |
| 21 | `cancelOrder()` | DELETE /v1/orders/:id | orders page, trading-footer, portfolio page |
| 22 | `submitTx()` | POST /v1/tx/submit | `wallet-provider.tsx` ("backend relay" path, unused) |
| 23 | `confirmTx()` | POST /v1/tx/confirm | `use-transaction.ts` → after every TX sign+submit |
| 24 | `getTxStatus()` | GET /v1/tx/:hash/status | Not used in any page |
| 25 | `getPortfolio()` | GET /v1/portfolio/:address | Not used (more specific portfolio endpoints used instead) |
| 26 | `getPortfolioTransactions()` | GET /v1/portfolio/:address/transactions | Not used |
| 27 | `getPortfolioSummary()` | GET /v1/portfolio/summary | `usePortfolioSummary` → portfolio page |
| 28 | `getPortfolioOpenOrders()` | GET /v1/portfolio/open-orders | `usePortfolioOpenOrders` → portfolio page |
| 29 | `getPortfolioHistory()` | GET /v1/portfolio/history | `usePortfolioHistory` → portfolio page |
| 30 | `getPortfolioLiquidity()` | GET /v1/portfolio/liquidity | `usePortfolioLiquidity` → portfolio page |
| 31 | `buildPortfolioAction()` | POST /v1/portfolio/build-action | portfolio page (cancel/reclaim) |
| 32 | `buildPortfolioWithdraw()` | POST /v1/portfolio/build-withdraw | portfolio page (LP withdraw) |
| 33 | `checkAdminAuth()` | GET /v1/admin/auth/check | admin layout.tsx |
| 34 | `getAdminDashboardMetrics()` | GET /v1/admin/dashboard/metrics | admin/page.tsx |
| 35 | `getAdminPendingFees()` | GET /v1/admin/revenue/pending | admin/revenue/page.tsx |
| 36 | `buildCollectFees()` | POST /v1/admin/revenue/build-collect | admin/revenue/page.tsx (**⛔ backend 501**) |
| 37 | `getAdminSettings()` | GET /v1/admin/settings/current | admin/settings/page.tsx |
| 38 | `buildUpdateGlobalSettings()` | POST /v1/admin/settings/build-update-global | admin/settings/page.tsx (**⛔ backend 501**) |
| 39 | `buildUpdateFactoryAdmin()` | POST /v1/admin/settings/build-update-factory | admin/settings/page.tsx (**⛔ backend 501**) |
| 40 | `buildBurnPoolNFT()` | POST /v1/admin/pools/build-burn | admin/danger/page.tsx (**⛔ backend 501**) |
| 41 | `connectWebSocket()` | WS /v1/ws | `useWebSocket` hook |

**Total: 41 functions (4 call endpoints that return 501)**

---

## C. Frontend Page Feature Inventory

### C-1. Trade Page (`/`)
- **Layout:** 3-column — PriceChart (left), PseudoOrderbook (center), SwapCard + OrderEntryCard (right), TradingFooter (bottom)
- **PriceChart:** TradingView lightweight-charts, candlestick + volume, 1H/4H/1D/1W timeframes. Uses `useCandles`, `usePrice`.
- **PseudoOrderbook:** Aggregates active intents + limit orders into price levels. Synthetic data when no real orders exist.
- **SwapCard:** Market swap with slippage tolerance (0.1/0.3/0.5/1.0%). Calculates output locally from pool reserves. Calls `createIntent`.
- **OrderEntryCard:** Limit, DCA, Stop-Loss tabs. Calls `createOrder`.
- **TradingFooter:** Open Orders, Order History, Market Trades tabs. Cancel intent/order inline.

### C-2. Pools Page (`/pools`)
- **Pool list** with search & sort (TVL/Volume/APY). Links to create and detail pages.
- Uses `usePools`, `useAnalytics` for page-level stats.

### C-3. Pool Create Page (`/pools/create`)
- Token pair selection from `TOKEN_REGISTRY`, initial liquidity amounts, fee rate radio (0.1/0.3/0.5/1.0%).
- Calls `createPool` via `useTransaction`.

### C-4. Pool Detail Page (`/pools/[id]`)
- Pool chart (candlestick), stats cards, LiquidityForm (deposit/withdraw), pool reserves, RecentTradesTable.
- Uses `usePool`, `useCandles`.

### C-5. Orders Page (`/orders`)
- Two sections: **Intents** and **Advanced Orders**.
- Tabs: All / Active / Filled / Closed.
- Inline cancel for active intents/orders.
- Uses `useIntents`, `useOrders`.

### C-6. Portfolio Page (`/portfolio`)
- **Asset Overview:** Wallet balance parsing (CIP-30 CBOR), allocation bar chart.
- **Open Orders tab:** Active intents + orders with cancel/reclaim actions via `buildPortfolioAction`.
- **History tab:** Filled/Cancelled/Expired with status filter.
- **LP Positions tab:** Lists liquidity positions (currently returns `[]`). Withdraw links.
- Uses `usePortfolioSummary`, `usePortfolioOpenOrders`, `usePortfolioHistory`, `usePortfolioLiquidity`.

### C-7. Analytics Page (`/analytics`)
- TVL, Volume (24h/7d), Fees, Intent Metrics (fill rate).
- Top pools by TVL, recent filled trades.
- Uses `useAnalytics`, `usePools`, `useIntents`.

### C-8. Admin Portal (`/admin`)
- **Layout:** Sidebar nav (Dashboard / Revenue & Fees / Protocol Settings / Danger Zone).
- **Auth:** Checks `checkAdminAuth(address)` → allows if `is_admin`. Falls through to dev-mode access on error.
- **Dashboard** (`/admin`): Metric cards (TVL, Volume, Pools, Pending Fees), Fee Growth 30d bar chart.
- **Revenue** (`/admin/revenue`): Lists pools with pending protocol fees. Batch select + "Execute CollectFees" button → `buildCollectFees`.
- **Settings** (`/admin/settings`): Global settings (max fee bps, min pool liquidity, version). Factory admin VKH transfer.
- **Danger Zone** (`/admin/danger`): Burn Pool NFT with high-friction confirmation modal (type `BURN-<PAIR>` to confirm).

---

## D. Gap Analysis (Critical)

### D-1. SHAPE_MISMATCH — Pool List Response

| Severity | **P0-CRITICAL** |
|----------|-----------------|
| **Frontend expects** | `{ data: PoolResponse[], pagination: { cursor?, hasMore, total } }` |
| **Backend returns** | `{ items: Pool[], cursor, hasMore, total }` |
| **Files** | Backend: `pools.ts` L33–42, `PoolRepository.findMany()` → Frontend: `api.ts` L211-219, `hooks.ts` L165 |

**Details:** The `GET /v1/pools` route calls `res.json(result)` where `result` is a `PoolPage { items, cursor, hasMore, total }`. The `items` are `Pool` class instances (with private `props` containing `bigint` values). Three problems:

1. **Key mismatch:** Backend uses `items`, frontend reads `data`. The hook does `data?.data || []` which will always be `[]`.
2. **Nested pagination mismatch:** Backend returns flat `{ cursor, hasMore, total }`, frontend expects nested `{ pagination: { cursor, hasMore, total } }`.
3. **Serialization crash:** `Pool` entities contain `bigint` fields (`reserveA`, `reserveB`, etc.). `JSON.stringify` cannot serialize `bigint` and will throw `TypeError: Do not know how to serialize a BigInt`. The route does NOT map Pool entities to plain objects like `GET /pools/:poolId` does.

**Fix:** Add the same serialization mapping in the list route that exists in the detail route (`pools.ts` L50–65), and wrap in `{ data: [...], pagination: { cursor, hasMore, total } }`.

---

### D-2. SHAPE_MISMATCH — Intent List Response

| Severity | **P0-CRITICAL** |
|----------|-----------------|
| **Frontend expects** | `IntentListResponse { data: IntentResponse[], pagination: { cursor?, hasMore, total } }` |
| **Backend returns** | Raw `IntentPage { items: Intent[], cursor, hasMore, total }` |
| **Files** | Backend: `intents.ts` → Frontend: `api.ts` L163-168 |

Same issue as D-1: the `GET /v1/intents` route returns raw `IntentPage` with `items` key and `Intent` class instances containing `bigint`. Frontend expects `data` key with nested `pagination`.

---

### D-3. SHAPE_MISMATCH — Order List Response

| Severity | **P0-CRITICAL** |
|----------|-----------------|
| **Frontend expects** | `OrderListResponse { data: OrderResponse[], pagination: { cursor?, hasMore, total } }` |
| **Backend returns** | Raw `OrderPage { items: Order[], cursor, hasMore, total }` |
| **Files** | Backend: `orders.ts` → Frontend: `api.ts` L402-409 |

Same pattern: `items` key vs `data` key, entity classes vs plain objects, bigint serialization issue.

---

### D-4. NOT_IMPLEMENTED — Admin TX Build Endpoints (×4)

| Severity | **P1-HIGH** |
|----------|-------------|
| **Endpoints** | `POST /admin/revenue/build-collect`, `POST /admin/settings/build-update-global`, `POST /admin/settings/build-update-factory`, `POST /admin/pools/build-burn` |
| **Backend** | All return `501 Not Implemented` with `{ error: "Not implemented yet" }` |
| **Frontend** | Admin pages call these via `useTransaction`: revenue/page.tsx, settings/page.tsx, danger/page.tsx |

All 4 admin write operations are stubbed. The frontend UI is fully built (including high-friction confirmation modals) but all TX submissions will fail with 501. The frontend admin pages have hardcoded **dev fallback data** in catch blocks (~D-4A).

---

### D-5. MOCK_DATA_ONLY — Portfolio Liquidity Positions

| Severity | **P1-HIGH** |
|----------|-------------|
| **Frontend** | `usePortfolioLiquidity` → `getPortfolioLiquidity(address)` |
| **Backend** | `GET /v1/portfolio/liquidity` returns hardcoded `[]` |
| **Files** | Backend: `portfolio.ts` — `res.json([])` |

The portfolio page renders an "LP Positions" tab that calls this endpoint. It always receives an empty array. No LP token tracking/indexing is implemented on the backend. Users cannot see their liquidity positions.

**Impact:** Users who deposit liquidity have no visibility into their positions from the portfolio page.

---

### D-6. MOCK_DATA_ONLY — Pool History / Recent Trades

| Severity | **P2-MEDIUM** |
|----------|---------------|
| **Frontend** | Pool detail page, `RecentTradesTable` component |
| **Backend** | `GET /v1/pools/:poolId/history` returns placeholder random data when no `PoolHistory` rows exist |
| **File** | Backend: `pools.ts` L130+ |

The route attempts to query `PoolHistory` records, but if none exist (which is the case initially), it generates random placeholder data with prices, volumes, and timestamps. The frontend renders this as though it's real trade history.

---

### D-7. MOCK_DATA_ONLY — Analytics Prices

| Severity | **P2-MEDIUM** |
|----------|---------------|
| **Backend** | `GET /v1/analytics/prices` returns hardcoded `adaUsd: 0.50` and calculates all token prices based on that constant |
| **File** | Backend: `analytics.ts` L92+ |

There's no real oracle integration. All USD values across the protocol (TVL, volume, fees) are based on a hardcoded ADA price of $0.50. This affects: analytics page, admin dashboard metrics, pool TVL calculations.

---

### D-8. MOCK_DATA_ONLY — Analytics Token Detail

| Severity | **P2-MEDIUM** |
|----------|---------------|
| **Backend** | `GET /v1/analytics/tokens/:assetId` returns `price: 0, priceChange24h: 0, volume24h: 0, marketCap: 0` |
| **Frontend** | `getTokenAnalytics()` defined but never called from any page |

The token analytics endpoint is a stub. The frontend defines the API function but doesn't use it anywhere.

---

### D-9. FRONTEND_UNUSED — Quote Endpoint

| Severity | **P2-MEDIUM** |
|----------|---------------|
| **Backend** | `GET /v1/quote` — fully implemented with direct + multi-hop routing |
| **Frontend** | `getQuote()` is defined in api.ts but **never called** |
| **Actual behavior** | `swap-card.tsx` calculates output locally using pool reserves: `(inputAmount * reserveB) / (reserveA + inputAmount)` |

The backend quote endpoint supports multi-hop routing through intermediate pools, slippage calculation, and price impact metrics. None of this is used. The frontend does a simplified constant-product calculation that ignores fees and cannot do multi-hop.

**Impact:** Users miss better prices through multi-hop routes. Local calculation doesn't account for fee deductions, showing slightly optimistic output amounts.

---

### D-10. FRONTEND_UNUSED — Several API Functions

| Severity | **P3-LOW** |
|----------|------------|
| Functions never called | `checkHealth()`, `checkReady()`, `getIntent()` (single intent), `getTokenAnalytics()`, `getAnalyticsPrices()`, `submitTx()` (backend relay), `getTxStatus()`, `getPortfolio()` (general), `getPortfolioTransactions()` |

These 9 functions are defined in `api.ts` but never invoked from any component, hook, or page. They add dead code and bundle size.

---

### D-11. SHAPE_MISMATCH — Analytics Overview (Missing `uniqueTraders`)

| Severity | **P3-LOW** |
|----------|------------|
| **Frontend expects** | `AnalyticsOverview { tvl, volume24h, volume7d, fees24h, totalPools, totalIntents, intentsFilled, fillRate }` |
| **Backend returns** | Same fields — **matches** |
| **Prisma model** | `ProtocolStats` has `uniqueTraders` field — but it's NOT returned by the route and NOT expected by frontend |

The `ProtocolStats` model stores `uniqueTraders` but the analytics overview endpoint doesn't return it. The analytics page doesn't display it either. The field exists in the database but is unused end-to-end.

---

### D-12. SHAPE_MISMATCH — Admin Dashboard Metrics

| Severity | **P2-MEDIUM** |
|----------|---------------|
| **Frontend expects** | `AdminDashboardMetrics { total_tvl_usd, volume_24h_usd, active_pools, total_pending_fees_usd, charts: { fee_growth_30d: [...] } }` |
| **Backend returns** | `{ totalTvlAda, volume24h, activePools, totalPendingFees, charts: { feeGrowth30d: [...] } }` |

The frontend uses `snake_case` keys (`total_tvl_usd`, `volume_24h_usd`) but the backend returns `camelCase` keys (`totalTvlAda`, `volume24h`). Additionally, the frontend expects USD-denominated values but the backend returns ADA-denominated values.

The frontend has a dev fallback in the catch block that uses the `snake_case` shape, so it "works" by always showing fallback data.

---

### D-13. SHAPE_MISMATCH — Admin Pending Fees

| Severity | **P2-MEDIUM** |
|----------|---------------|
| **Frontend expects** | `PendingFeeEntry { pool_id, pair, pending_fees: { asset_a_amount, asset_b_amount, total_usd_value } }` |
| **Backend returns** | `{ poolId, pair, protocolFeeAccA, protocolFeeAccB }` (camelCase, no USD value) |

Same `snake_case` vs `camelCase` mismatch. Backend doesn't calculate USD values for fees. Frontend falls back to hardcoded dev data.

---

### D-14. SHAPE_MISMATCH — Admin Settings

| Severity | **P2-MEDIUM** |
|----------|---------------|
| **Frontend expects** | `AdminSettings { global_settings: { max_protocol_fee_bps, min_pool_liquidity, current_version }, factory_settings: { admin_vkh } }` |
| **Backend returns** | Settings read from Prisma config / hardcoded defaults with camelCase keys |

Frontend always falls back to dev data due to the shape mismatch. Settings page appears functional but is using fake data.

---

### D-15. SHAPE_MISMATCH — Admin Auth Check

| Severity | **P2-MEDIUM** |
|----------|---------------|
| **Frontend expects** | `AdminAuthResponse { is_admin, roles: { is_factory_admin, is_settings_admin }, system_status: { current_version } }` |
| **Backend returns** | `{ isAdmin, address, currentAdminVkh }` |

The frontend checks `res.is_admin` but the backend returns `isAdmin` (camelCase). The result: `res.is_admin` is `undefined` (falsy), the catch block fires, and dev-mode access is granted. **Any wallet can access admin portal in production if the endpoint works.**

---

### D-16. MISSING — WebSocket Not Used on Pages

| Severity | **P2-MEDIUM** |
|----------|---------------|
| **Backend** | `WsServer` broadcasts on 3 channels: `prices`, `intent`, `pool` |
| **Frontend** | `useWebSocket` hook exists and is exported from hooks.ts |
| **Actual usage** | The hook is **not called** on any page. All data fetching uses HTTP polling (refetchInterval: 15-30s). |

The WebSocket infrastructure is fully implemented on both sides but never connected. Users see 15-30 second delayed data instead of real-time updates.

---

### D-17. MISSING — Chart 1H Timeframe

| Severity | **P3-LOW** |
|----------|------------|
| **Frontend** | PriceChart offers `1H / 4H / 1D / 1W` timeframe buttons |
| **Backend** | CandlestickService only stores `H4, D1, W1` intervals |

When the user selects "1H", the backend will return an "Invalid interval" error or empty data. The 1-hour interval is not persisted (by design — free tier storage optimization) but the frontend still shows it as an option.

---

### D-18. POSSIBLE_CRASH — BigInt Serialization in List Routes

| Severity | **P0-CRITICAL** |
|----------|-----------------|
| **Affected routes** | `GET /v1/pools`, `GET /v1/intents`, `GET /v1/orders` |
| **Root cause** | These routes return domain entity classes (Pool, Intent, Order) that contain `bigint` properties |

`JSON.stringify` throws `TypeError: Do not know how to serialize a BigInt` when encountering bigint values. Unless Express has a custom JSON replacer configured, these list endpoints will crash with a 500 error.

The detail endpoints (`GET /pools/:poolId`, `GET /intents/:intentId`) manually map entity fields to strings, but the list endpoints pass entities directly.

---

## E. Missing DEX Features

| # | Feature | Frontend | Backend | Status |
|---|---------|----------|---------|--------|
| E-1 | **Multi-hop swap routing** | Not used (local calc only) | Fully implemented in `GetQuote.ts` | Frontend should use `getQuote()` |
| E-2 | **Real-time streaming** | `useWebSocket` implemented | `WsServer` implemented | Not connected — all polling |
| E-3 | **LP position tracking** | Portfolio LP tab built | Returns `[]` always | Backend needs LP token indexing |
| E-4 | **Fee collection TX** | Full UI + confirmation flow | 501 stub | Backend `ITxBuilder` needs implementation |
| E-5 | **Settings update TX** | Full UI + form + versioning | 501 stub | Backend `ITxBuilder` needs implementation |
| E-6 | **Factory admin transfer TX** | Full UI + warning flow | 501 stub | Backend `ITxBuilder` needs implementation |
| E-7 | **Pool burn TX** | Full UI + high-friction modal | 501 stub | Backend `ITxBuilder` needs implementation |
| E-8 | **Price oracle** | Assumes backend provides USD prices | Hardcoded `$0.50` ADA | Need Coingecko/CoinMarketCap/DEX oracle |
| E-9 | **Token metadata service** | Uses local `TOKEN_REGISTRY` in mock-data.ts | No token metadata endpoint | Tokens not in registry show as "Unknown" with 🪙 |
| E-10 | **Trade history recording** | Expects `Swap` records from API | `Swap` model exists in Prisma but no writes | Swaps table stays empty — solver doesn't record trades |
| E-11 | **Protocol stats aggregation** | Reads from `analytics/overview` | Queries `ProtocolStats` table | No cron/job to CREATE stats snapshots found in cron files |
| E-12 | **Transaction status tracking** | `getTxStatus()` defined but unused | Endpoint exists | Could show TX confirmation progress |
| E-13 | **Partial fill UI** | `partialFill: true` sent in intent creation | Backend supports partial fills | No UI indication of partial fill progress |
| E-14 | **Slippage on backend quote** | Slippage param sent by frontend | `GetQuote` uses slippage for minOutput calc | Frontend calculates its own minOutput, ignoring backend |

---

## F. WebSocket Analysis

### Backend (`WsServer.ts`)
- **URL:** `wss://tdexms.onrender.com/v1/ws`
- **Channels:** `prices`, `intent`, `pool`
- **Protocol:** Subscribe with `{ type: "subscribe", channel, params }`, unsubscribe with `{ type: "unsubscribe", channel }`
- **Heartbeat:** Every 30s server sends `ping`, expects `pong`
- **Broadcast methods:**
  - `broadcastPrice({ poolId, assetA, assetB, price, priceUSD, timestamp })` — sent after each swap
  - `broadcastIntent({ type, intentId, status, ... })` — sent on intent state changes
  - `broadcastPool({ type, poolId, reserveA, reserveB, ... })` — sent on pool state changes

### Frontend (`useWebSocket` hook)
- Connects to `WS_URL` (derived from `NEXT_PUBLIC_API_URL`)
- Auto-reconnects with exponential backoff
- Subscribes to specified channel with params
- Returns `{ messages, connected, error }`

### Gap
The hook is **never instantiated** on any page. All data refresh happens via HTTP polling:
- `usePools`: 30s polling
- `usePool`: 15s polling  
- `useIntents`: 15s polling
- `useOrders`: 15s polling
- `useCandles`: 60s polling
- `usePrice`: 30s polling
- `useAnalytics`: 60s polling
- `usePortfolio*`: no auto-refresh

**Recommendation:** Wire `useWebSocket` into the trading page for real-time price updates and intent status changes. This would eliminate the 15-30s data lag.

---

## G. Mock Data & Fallback Usage

### G-1. `mock-data.ts` → Token Registry (NOT Fake Trading Data)
The file defines 13 tokens with their policy IDs, asset names, tickers, and decimals. This is used by:
- `resolveToken()` in hooks.ts → maps on-chain policy IDs to human-readable token info
- `getTokenIcon()` → returns token image URL or 🪙 emoji fallback
- `pools/create/page.tsx` → token pair selection dropdown

**Assessment:** This is a legitimate token metadata registry, not mock trading data. However, it will become stale as new tokens are added to the protocol.

### G-2. Admin Pages → Dev Fallback Data
All 4 admin pages catch API errors and fall back to hardcoded data:

| Page | Fallback Data |
|------|---------------|
| `/admin` (Dashboard) | `total_tvl_usd: 45M`, `volume_24h_usd: 12.5M`, `active_pools: 142`, 30d fee chart |
| `/admin/revenue` | 3 fake pools with pending fees (ADA/USDT, ADA/SNEK, ADA/HOSKY) |
| `/admin/settings` | `max_protocol_fee_bps: 50`, `min_pool_liquidity: 1B`, `admin_vkh: "abc123..."` |
| `/admin` layout | `is_admin: true`, `is_factory_admin: true`, `is_settings_admin: true` |

**Risk:** Due to shape mismatches (D-12 through D-15), these catch blocks ALWAYS fire, meaning admin pages ALWAYS show fake data even when the backend is running. The admin auth bypass (D-15) means any wallet gets admin access.

### G-3. PseudoOrderbook → Synthetic Orders
When real intent/order data is sparse, `pseudo-orderbook.tsx` generates synthetic bid/ask levels around the current price. The component clearly labels these as "pseudo" in its name but there's no visual indicator to users.

### G-4. Pool History → Random Placeholder
Backend `GET /v1/pools/:poolId/history` generates random trade data (random prices, volumes, timestamps) when no `PoolHistory` records exist. This is rendered as "Recent Trades" in the pool detail page with no indication it's fake.

### G-5. Analytics Prices → Hardcoded $0.50 ADA
All USD conversions in the protocol use `adaUsd = 0.50`. This cascades to:
- Analytics overview TVL in USD
- Admin dashboard `total_tvl_usd`
- Admin pending fees `total_usd_value`
- Token analytics price

---

## Summary of Critical Issues

| Priority | Count | Items |
|----------|-------|-------|
| **P0-CRITICAL** | 4 | D-1, D-2, D-3, D-18 — List endpoints crash/wrong shape (BigInt + key mismatch) |
| **P1-HIGH** | 2 | D-4 (4 admin 501 stubs), D-5 (LP tracking empty) |
| **P2-MEDIUM** | 7 | D-6, D-7, D-8, D-12, D-13, D-14, D-15, D-16 — Shape mismatches, mock data, unused WebSocket |
| **P3-LOW** | 3 | D-10, D-11, D-17 — Unused functions, missing uniqueTraders, 1H chart interval |

### Recommended Fix Order
1. **Fix list endpoint serialization (D-1, D-2, D-3, D-18)** — All 3 list routes need entity-to-DTO mapping + wrapper shape matching frontend expectations
2. **Fix admin response shapes (D-12–D-15)** — Align snake_case/camelCase convention (pick one, apply everywhere)
3. **Wire `getQuote()` into swap-card (D-9)** — Enable multi-hop routing
4. **Connect WebSocket (D-16)** — Eliminate polling lag on trading page
5. **Implement LP position indexing (D-5)** — Track LP token holders
6. **Implement admin TX builders (D-4)** — Complete the 4 admin operations
7. **Add price oracle (D-7, E-8)** — Replace hardcoded $0.50
8. **Clean up dead code (D-10)** — Remove 9 unused API functions or wire them in
