# SolverNet DEX — API Specification

> **Document Version**: 1.2.0  
> **Status**: Phase 3 — Extended Portfolio, Admin & Chart APIs  
> **Date**: 2026-02-17  
> **Base URL**: `https://tdexms.onrender.com/v1`  
> **Classification**: Internal — Technical Specification

---

## Table of Contents

1. [API Design Principles](#1-api-design-principles)
2. [Authentication & Rate Limiting](#2-authentication--rate-limiting)
3. [Common Types](#3-common-types)
4. [Quote API](#4-quote-api)
5. [Intent API](#5-intent-api)
6. [Pool API](#6-pool-api)
7. [Order API](#7-order-api)
8. [Portfolio API](#8-portfolio-api)
9. [Analytics API](#9-analytics-api)
10. [Chart API](#10-chart-api)
11. [Transaction API](#11-transaction-api)
12. [Admin API](#12-admin-api)
13. [WebSocket API](#13-websocket-api)
14. [Error Handling](#14-error-handling)
15. [Health & Status](#15-health--status)

---

## 1. API Design Principles

| Principle | Implementation |
|---|---|
| **RESTful** | Resource-oriented URLs, standard HTTP methods |
| **JSON** | All request/response bodies in JSON |
| **Versioned** | URL prefix `/v1/` |
| **Paginated** | Cursor-based pagination for list endpoints |
| **Validated** | Zod schemas on all inputs |
| **Documented** | OpenAPI 3.1 specification |
| **Idempotent** | POST operations with client-generated IDs |

---

## 2. Authentication & Rate Limiting

### 2.1 Authentication

Most endpoints are **public** (read-only blockchain data). Wallet-specific endpoints use **message signing** for authentication:

```
POST /v1/auth/challenge
→ { challenge: "Sign this message to authenticate: <nonce>" }

POST /v1/auth/verify
← { address: "addr1...", signature: "...", key: "..." }
→ { token: "jwt-token", expiresAt: 1740000000 }
```

### 2.2 Rate Limiting

| Tier | Limit | Scope |
|---|---|---|
| **Public** | 100 req/min | Per IP |
| **Authenticated** | 500 req/min | Per wallet address |
| **Quote** | 30 req/min | Per IP (compute-intensive) |
| **WebSocket** | 5 connections | Per IP |

### 2.3 Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1740000060
X-Request-Id: uuid-v4
```

---

## 3. Common Types

```typescript
// Pagination
interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    cursor: string | null;
    hasMore: boolean;
    total: number;
  };
}

// Asset identifier
interface Asset {
  policyId: string;     // "" for ADA
  assetName: string;    // "" for ADA (hex-encoded otherwise)
  ticker?: string;      // Human-readable: "ADA", "HOSKY"
  decimals: number;     // e.g., 6 for ADA
  logo?: string;        // URL to token logo
}

// Transaction reference
interface TxRef {
  txHash: string;
  outputIndex: number;
}

// Amount with asset
interface TokenAmount {
  asset: Asset;
  amount: string;       // BigInt as string (avoids JSON precision loss)
}

// Standard timestamps
interface Timestamps {
  createdAt: string;    // ISO 8601
  updatedAt: string;    // ISO 8601
}
```

---

## 4. Quote API

### GET `/v1/quote`

Get a swap quote with optimal routing.

**Query Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `inputAsset` | string | Yes | Policy ID + asset name (e.g., `lovelace` or `policyId.assetName`) |
| `outputAsset` | string | Yes | Target asset identifier |
| `inputAmount` | string | No* | Amount to swap (in smallest unit) |
| `outputAmount` | string | No* | Desired output amount (reverse quote) |
| `slippage` | number | No | Slippage tolerance in BPS (default: 50 = 0.5%) |

*Either `inputAmount` or `outputAmount` must be provided.

**Response: `200 OK`**

```json
{
  "inputAsset": {
    "policyId": "",
    "assetName": "",
    "ticker": "ADA",
    "decimals": 6
  },
  "outputAsset": {
    "policyId": "a0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235",
    "assetName": "484f534b59",
    "ticker": "HOSKY",
    "decimals": 0
  },
  "inputAmount": "100000000",
  "outputAmount": "5000000000",
  "minOutput": "4975000000",
  "priceImpact": 0.12,
  "route": [
    {
      "poolId": "pool-nft-hash-1",
      "type": "direct",
      "inputAsset": "lovelace",
      "outputAsset": "a0028f350...484f534b59",
      "inputAmount": "100000000",
      "outputAmount": "5000000000",
      "fee": "300000"
    }
  ],
  "estimatedFees": {
    "protocolFee": "50000",
    "networkFee": "250000",
    "solverFee": "100000"
  },
  "expiresAt": "2026-02-17T12:05:00Z",
  "quoteId": "qt_abc123"
}
```

**Error Responses:**

| Status | Code | Description |
|---|---|---|
| 400 | `INVALID_ASSET` | Unknown asset identifier |
| 400 | `INSUFFICIENT_LIQUIDITY` | Not enough liquidity for requested amount |
| 400 | `AMOUNT_TOO_SMALL` | Below minimum trade size |
| 429 | `RATE_LIMITED` | Too many quote requests |

---

## 5. Intent API

### POST `/v1/intents`

Create a new swap intent. Returns an unsigned transaction for the user to sign.

**Request Body:**

```json
{
  "quoteId": "qt_abc123",
  "senderAddress": "addr1qx...",
  "inputAsset": "lovelace",
  "inputAmount": "100000000",
  "outputAsset": "a0028f350...484f534b59",
  "minOutput": "4975000000",
  "deadline": 1740000000000,
  "partialFill": false,
  "changeAddress": "addr1qx..."
}
```

**Response: `201 Created`**

```json
{
  "intentId": "int_def456",
  "unsignedTx": "84a400...",
  "txHash": "abc123...",
  "estimatedFee": "250000",
  "expiresAt": "2026-02-17T13:00:00Z",
  "status": "CREATED"
}
```

### POST `/v1/intents/{intentId}/submit`

Submit a signed transaction for an intent.

**Request Body:**

```json
{
  "signedTx": "84a500...",
  "witness": "a100..."
}
```

**Response: `200 OK`**

```json
{
  "intentId": "int_def456",
  "txHash": "abc123...",
  "status": "PENDING",
  "submittedAt": "2026-02-17T12:01:00Z"
}
```

### GET `/v1/intents/{intentId}`

Get intent status and details.

**Response: `200 OK`**

```json
{
  "intentId": "int_def456",
  "status": "FILLED",
  "creator": "addr1qx...",
  "inputAsset": { "policyId": "", "assetName": "", "ticker": "ADA" },
  "inputAmount": "100000000",
  "outputAsset": { "policyId": "a002...", "assetName": "484f534b59", "ticker": "HOSKY" },
  "minOutput": "4975000000",
  "actualOutput": "5010000000",
  "deadline": 1740000000000,
  "escrowTxHash": "abc123...",
  "settlementTxHash": "def789...",
  "solverAddress": "addr1solver...",
  "createdAt": "2026-02-17T12:00:00Z",
  "settledAt": "2026-02-17T12:01:30Z"
}
```

### DELETE `/v1/intents/{intentId}`

Cancel an active intent. Returns an unsigned cancel transaction.

**Response: `200 OK`**

```json
{
  "intentId": "int_def456",
  "unsignedTx": "84a400...",
  "status": "CANCELLING"
}
```

### GET `/v1/intents`

List intents for a given address.

**Query Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `address` | string | Yes | Wallet address |
| `status` | string | No | Filter: `ACTIVE`, `FILLED`, `CANCELLED`, `EXPIRED` |
| `cursor` | string | No | Pagination cursor |
| `limit` | number | No | Page size (default: 20, max: 100) |

---

## 6. Pool API

### GET `/v1/pools`

List all liquidity pools.

**Query Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `sortBy` | string | `tvl` | Sort: `tvl`, `volume24h`, `apy`, `createdAt` |
| `order` | string | `desc` | Sort order: `asc`, `desc` |
| `search` | string | | Search by token ticker or pool name |
| `cursor` | string | | Pagination cursor |
| `limit` | number | 20 | Page size (max 100) |

**Response: `200 OK`**

```json
{
  "data": [
    {
      "poolId": "pool_abc123",
      "poolNft": { "policyId": "nft...", "assetName": "..." },
      "assetA": { "policyId": "", "assetName": "", "ticker": "ADA", "decimals": 6 },
      "assetB": { "policyId": "a002...", "assetName": "484f...", "ticker": "HOSKY", "decimals": 0 },
      "reserveA": "50000000000",
      "reserveB": "2500000000000000",
      "totalLpTokens": "354000000000",
      "feeNumerator": 30,
      "feeDenominator": 10000,
      "tvlAda": "100000000000",
      "volume24h": "5000000000",
      "fees24h": "15000000",
      "apy": 12.5,
      "priceAinB": "50000000",
      "priceBinA": "0.00000002",
      "poolUtxoRef": { "txHash": "abc...", "outputIndex": 0 },
      "createdAt": "2026-01-15T10:00:00Z"
    }
  ],
  "pagination": {
    "cursor": "next_cursor_xyz",
    "hasMore": true,
    "total": 45
  }
}
```

### GET `/v1/pools/{poolId}`

Get detailed pool information.

### GET `/v1/pools/{poolId}/history`

Get pool historical data (TVL, volume, fees over time).

**Query Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `period` | string | `7d` | Time period: `24h`, `7d`, `30d`, `90d`, `1y`, `all` |
| `interval` | string | `1h` | Data points: `5m`, `15m`, `1h`, `4h`, `1d` |

### POST `/v1/pools/create`

Create a new liquidity pool. Returns unsigned transaction.

**Request Body:**

```json
{
  "assetA": "lovelace",
  "assetB": "a0028f350...484f534b59",
  "initialAmountA": "10000000000",
  "initialAmountB": "500000000000000",
  "feeNumerator": 30,
  "creatorAddress": "addr1qx...",
  "changeAddress": "addr1qx..."
}
```

### POST `/v1/pools/{poolId}/deposit`

Add liquidity to a pool. Returns unsigned transaction.

**Request Body:**

```json
{
  "amountA": "1000000000",
  "amountB": "50000000000000",
  "minLpTokens": "7000000000",
  "senderAddress": "addr1qx...",
  "changeAddress": "addr1qx..."
}
```

### POST `/v1/pools/{poolId}/withdraw`

Remove liquidity from a pool. Returns unsigned transaction.

**Request Body:**

```json
{
  "lpTokenAmount": "5000000000",
  "minAmountA": "700000000",
  "minAmountB": "35000000000000",
  "senderAddress": "addr1qx...",
  "changeAddress": "addr1qx..."
}
```

### GET `/v1/pools/{poolId}/history?interval=1d&limit=30`

Historical TVL, volume, and price data for a specific pool.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `interval` | string | `1d` | Time bucket (`1h`, `4h`, `1d`, `1w`) |
| `limit` | number | `30` | Number of data points |

**Response: `200 OK`**

```json
{
  "status": "ok",
  "poolId": "pool_abc",
  "interval": "1d",
  "history": [
    { "timestamp": 1740000000, "tvl_ada": 50000, "volume_ada": 2500, "price": 0.005 }
  ]
}
```

---

## 7. Order API

### POST `/v1/orders`

Create a limit order, DCA, or stop-loss order.

**Request Body (Limit Order):**

```json
{
  "type": "LIMIT",
  "inputAsset": "lovelace",
  "outputAsset": "a0028f350...484f534b59",
  "inputAmount": "100000000",
  "targetPrice": { "numerator": "60000000", "denominator": "1" },
  "deadline": 1740100000000,
  "senderAddress": "addr1qx...",
  "changeAddress": "addr1qx..."
}
```

**Request Body (DCA Order):**

```json
{
  "type": "DCA",
  "inputAsset": "lovelace",
  "outputAsset": "a0028f350...484f534b59",
  "totalBudget": "1000000000",
  "amountPerInterval": "100000000",
  "intervalSlots": 43200,
  "deadline": 1741000000000,
  "senderAddress": "addr1qx...",
  "changeAddress": "addr1qx..."
}
```

### GET `/v1/orders`

List orders for a given address.

### DELETE `/v1/orders/{orderId}`

Cancel an active order.

---

## 8. Portfolio API

### GET `/v1/portfolio/{address}`

Get comprehensive portfolio view for a wallet (legacy).

**Response: `200 OK`**

```json
{
  "address": "addr1qx...",
  "intents": { "active": 2, "filled": 10, "total": 12 },
  "orders": { "active": 1, "filled": 5, "total": 6 },
  "pools": { "totalPools": 3 }
}
```

### GET `/v1/portfolio/{address}/transactions`

Paginated transaction history for a wallet.

### GET `/v1/portfolio/summary?wallet_address=...`

Aggregated portfolio summary with allocation & status breakdown.

**Response: `200 OK`**

```json
{
  "total_balance_usd": 500.25,
  "total_balance_ada": 1000.5,
  "status_breakdown": {
    "available_in_wallet": 800,
    "locked_in_orders": 150,
    "locked_in_lp": 50.5
  },
  "allocation_chart": [
    { "asset": "ADA", "percentage": 80.0, "value_usd": 400 },
    { "asset": "SNEK", "percentage": 15.0, "value_usd": 75 }
  ]
}
```

### GET `/v1/portfolio/open-orders?wallet_address=...&limit=20`

Active orders/intents with progress bars, deadlines, and available actions.

**Response: `200 OK`**

```json
[
  {
    "utxo_ref": "abc123#0",
    "created_at": 1740000000,
    "pair": "ADA_SNEK",
    "type": "LIMIT",
    "conditions": { "target_price": 0.005, "trigger_price": null, "slippage_percent": null },
    "budget": { "initial_amount": 1000, "remaining_amount": 600, "progress_percent": 40, "progress_text": "40% filled" },
    "deadline": 1740086400,
    "is_expired": false,
    "available_action": "CANCEL"
  }
]
```

### GET `/v1/portfolio/history?wallet_address=...&status=FILLED&page=1`

Completed order history with execution data and explorer links.

**Response: `200 OK`**

```json
[
  {
    "order_id": "ord_abc",
    "completed_at": 1740000000,
    "pair": "ADA_SNEK",
    "type": "SWAP",
    "status": "FILLED",
    "execution": { "average_price": 0.005, "total_value_usd": 25.0, "total_asset_received": 5000 },
    "explorer_links": ["abc123def..."]
  }
]
```

### GET `/v1/portfolio/liquidity?wallet_address=...`

LP positions with current value and pool share.

**Response: `200 OK`**

```json
[
  {
    "pool_id": "pool_abc",
    "pair": "ADA_SNEK",
    "lp_balance": 7000,
    "share_percent": 1.97,
    "current_value": { "asset_a_amount": 700, "asset_b_amount": 140000, "total_value_usd": 350 }
  }
]
```

### POST `/v1/portfolio/build-action`

Build a cancel or reclaim transaction for an active/expired order.

**Request:**

```json
{
  "wallet_address": "addr1qx...",
  "utxo_ref": "abc123#0",
  "action_type": "CANCEL"
}
```

**Response: `200 OK`**

```json
{
  "unsignedTx": "84a400...",
  "txHash": "def456...",
  "estimatedFee": "200000"
}
```

### POST `/v1/portfolio/build-withdraw`

Build an LP withdrawal transaction from the portfolio.

**Request:**

```json
{
  "wallet_address": "addr1qx...",
  "pool_id": "pool_abc",
  "lp_tokens_to_burn": 5000
}
```

**Response: `200 OK`**

```json
{
  "unsignedTx": "84a400...",
  "txHash": "ghi789...",
  "estimatedFee": "250000"
}
```

---

## 9. Analytics API

### GET `/v1/analytics/overview`

Protocol-wide analytics.

**Response: `200 OK`**

```json
{
  "tvl": "500000000000000",
  "volume24h": "25000000000000",
  "volume7d": "150000000000000",
  "fees24h": "75000000000",
  "totalPools": 45,
  "totalIntents": 12500,
  "intentsFilled": 12300,
  "fillRate": 98.4,
  "uniqueTraders": 3200,
  "topPools": [
    { "poolId": "pool_abc", "pair": "ADA/HOSKY", "volume24h": "5000000000000" }
  ]
}
```

### GET `/v1/analytics/tokens/{assetId}`

Token-specific analytics (price, volume, liquidity across all pools).

### GET `/v1/analytics/prices`

Current prices for all traded assets (used by frontend for display).

**Response: `200 OK`**

```json
{
  "status": "ok",
  "prices": [
    {
      "asset": "SNEK",
      "policyId": "abc...",
      "assetName": "534e454b",
      "priceInAda": 0.005,
      "pool_id": "pool_abc"
    }
  ]
}
```

---

## 10. Chart API

TradingView-compatible OHLCV chart endpoints powered by `CandlestickService`.

### GET `/v1/chart/config`

TradingView UDF configuration.

**Response: `200 OK`**

```json
{
  "supported_resolutions": ["240", "1D", "1W"],
  "supports_group_request": false,
  "supports_marks": false,
  "supports_search": true,
  "supports_timescale_marks": false
}
```

### GET `/v1/chart/symbols?symbol={poolId}`

Resolve a symbol (pool ID) to TradingView-compatible symbol info.

**Response: `200 OK`**

```json
{
  "name": "pool_abc",
  "ticker": "pool_abc",
  "description": "Pool pool_abc",
  "type": "crypto",
  "session": "24x7",
  "timezone": "Etc/UTC",
  "exchange": "SolverNet",
  "minmov": 1,
  "pricescale": 1000000000000000,
  "has_intraday": true,
  "has_daily": true,
  "supported_resolutions": ["240", "1D", "1W"]
}
```

### GET `/v1/chart/history?symbol={poolId}&resolution={res}&from={ts}&to={ts}&countback={n}`

TradingView UDF candle history. Returns arrays of OHLCV data.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | string | ✅ | Pool ID |
| `resolution` | string | ✅ | TradingView resolution (`240`, `1D`, `1W`) |
| `from` | number | ❌ | Start timestamp (seconds) |
| `to` | number | ❌ | End timestamp (seconds) |
| `countback` | number | ❌ | Number of bars to fetch |

**Response: `200 OK`**

```json
{
  "s": "ok",
  "t": [1740000000, 1740014400],
  "o": [0.005, 0.0051],
  "h": [0.0055, 0.0052],
  "l": [0.0049, 0.0050],
  "c": [0.0051, 0.0051],
  "v": [500000, 320000]
}
```

No-data response: `{ "s": "no_data" }`

### GET `/v1/chart/candles?poolId={id}&interval={iv}&from={ts}&to={ts}&limit={n}`

Direct candle query (non-TradingView format).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `poolId` | string | ✅ | — | Pool ID |
| `interval` | string | ❌ | `4h` | Candle interval (`4h`, `1d`, `1w`) |
| `from` | number | ❌ | — | Start timestamp (seconds) |
| `to` | number | ❌ | — | End timestamp (seconds) |
| `limit` | number | ❌ | — | Max candles to return |

**Response: `200 OK`**

```json
{
  "status": "ok",
  "poolId": "pool_abc",
  "interval": "4h",
  "count": 100,
  "candles": [
    { "time": 1740000000, "open": 0.005, "high": 0.0055, "low": 0.0049, "close": 0.0051, "volume": "500000" }
  ]
}
```

### GET `/v1/chart/price/{poolId}`

Latest price for a pool.

**Response: `200 OK`**

```json
{ "status": "ok", "poolId": "pool_abc", "price": 0.0051 }
```

**`404`** if no price data available.

### GET `/v1/chart/info/{poolId}`

24-hour pool chart info (high, low, open, close, change).

**Response: `200 OK`**

```json
{
  "status": "ok",
  "poolId": "pool_abc",
  "open": 0.005,
  "high": 0.0055,
  "low": 0.0048,
  "close": 0.0051,
  "change24h": 2.0,
  "volume24h": "1200000"
}
```

### GET `/v1/chart/intervals`

Supported candlestick intervals.

**Response: `200 OK`**

```json
{ "status": "ok", "intervals": ["4h", "1d", "1w"] }
```

---

## 11. Transaction API

Submit signed transactions and track confirmation status.

### POST `/v1/tx/submit`

Submit a signed transaction to the Cardano network via Blockfrost.

**Rate-limited** (write limiter).

**Request:**

```json
{ "signedTx": "84a400..." }
```

**Response: `200 OK`**

```json
{ "txHash": "abc123...", "accepted": true }
```

**Error: `400`**

```json
{ "txHash": "", "accepted": false, "error": "Transaction validation failed" }
```

### POST `/v1/tx/confirm`

Client callback after on-chain confirmation — updates intent status in DB.

**Request:**

```json
{
  "txHash": "abc123...",
  "intentId": "int_def456",
  "action": "create"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `txHash` | string | ✅ | Confirmed transaction hash |
| `intentId` | string | ❌ | Intent to update (if applicable) |
| `action` | string | ❌ | `create` → set ACTIVE, `cancel` → set CANCELLED |

**Response: `200 OK`**

```json
{ "status": "ok", "txHash": "abc123..." }
```

### GET `/v1/tx/{txHash}/status`

Check whether a transaction is confirmed on-chain (polls Blockfrost with 5 s timeout).

**Response: `200 OK`**

```json
{ "txHash": "abc123...", "confirmed": true }
```

---

## 12. Admin API

Admin endpoints require wallet address verification against `ADMIN_ADDRESS` environment variable.

### GET `/v1/admin/auth/check?wallet_address=...`

Verify if a wallet is the configured admin.

**Response: `200 OK`**

```json
{ "is_admin": true }
```

### GET `/v1/admin/dashboard/metrics`

Aggregated protocol metrics for the admin dashboard.

**Response: `200 OK`**

```json
{
  "tvl_ada": 500000,
  "volume_24h_ada": 25000,
  "total_pools": 12,
  "total_fees_ada": 150,
  "chart_data": [
    { "date": "2026-02-01", "tvl": 480000, "volume": 22000, "fees": 5.5 }
  ]
}
```

### GET `/v1/admin/revenue/pending`

Estimated pending fees across all pools (per-pool breakdown).

**Response: `200 OK`**

```json
{
  "total_pending_ada": 75.5,
  "pools": [
    { "pool_id": "pool_abc", "pair": "ADA_SNEK", "pending_ada": 25.0 }
  ]
}
```

### POST `/v1/admin/revenue/build-collect`

Build a fee-collection transaction. **Status: 501 — requires dedicated TxBuilder method.**

### GET `/v1/admin/settings/current`

Current global and factory settings.

**Response: `200 OK`**

```json
{
  "global": {
    "solver_address": "addr1qx...",
    "min_fee_percent": 0.3,
    "max_pools": 100
  },
  "factory": {
    "min_liquidity_ada": 100,
    "default_fee_percent": 0.3
  }
}
```

### POST `/v1/admin/settings/build-update-global`

Build a transaction to update global settings. **Status: 501.**

### POST `/v1/admin/settings/build-update-factory`

Build a transaction to update factory settings. **Status: 501.**

### POST `/v1/admin/pools/build-burn`

Build a transaction to burn/close a pool. **Status: 501.**

---

## 13. WebSocket API

### Connection

```
ws://api.solvernet.io/v1/ws
```

### Subscribe to Price Updates

```json
// Client → Server
{
  "type": "subscribe",
  "channel": "prices",
  "params": {
    "pairs": ["ADA/HOSKY", "ADA/DJED"]
  }
}

// Server → Client (every ~5s)
{
  "type": "price",
  "data": {
    "pair": "ADA/HOSKY",
    "price": "0.00000002",
    "change24h": 5.2,
    "volume24h": "5000000000000",
    "timestamp": 1740000000
  }
}
```

### Subscribe to Intent Updates

```json
// Client → Server
{
  "type": "subscribe",
  "channel": "intent",
  "params": {
    "intentId": "int_def456"
  }
}

// Server → Client
{
  "type": "intentUpdate",
  "data": {
    "intentId": "int_def456",
    "status": "FILLED",
    "settlementTxHash": "def789...",
    "actualOutput": "5010000000",
    "timestamp": 1740000090
  }
}
```

### Subscribe to Pool Updates

```json
// Client → Server
{
  "type": "subscribe",
  "channel": "pool",
  "params": {
    "poolId": "pool_abc123"
  }
}

// Server → Client
{
  "type": "poolUpdate",
  "data": {
    "poolId": "pool_abc123",
    "reserveA": "50100000000",
    "reserveB": "2498000000000000",
    "price": "0.0000000201",
    "tvlAda": "100200000000",
    "lastTxHash": "ghi901...",
    "timestamp": 1740000120
  }
}
```

---

## 14. Error Handling

### Standard Error Response

```json
{
  "error": {
    "code": "INSUFFICIENT_LIQUIDITY",
    "message": "Not enough liquidity in ADA/HOSKY pool for 1000 ADA swap",
    "details": {
      "availableLiquidity": "500000000",
      "requestedAmount": "1000000000"
    },
    "requestId": "req_xyz789"
  }
}
```

### Error Codes

| HTTP Status | Code | Description |
|---|---|---|
| 400 | `INVALID_REQUEST` | Malformed request body |
| 400 | `INVALID_ASSET` | Unknown asset identifier |
| 400 | `INSUFFICIENT_LIQUIDITY` | Not enough pool liquidity |
| 400 | `AMOUNT_TOO_SMALL` | Below minimum trade size |
| 400 | `AMOUNT_TOO_LARGE` | Exceeds maximum trade size |
| 400 | `INVALID_DEADLINE` | Deadline in the past or too far future |
| 400 | `POOL_EXISTS` | Trading pair already has a pool |
| 401 | `UNAUTHORIZED` | Missing or invalid auth token |
| 404 | `INTENT_NOT_FOUND` | Intent ID does not exist |
| 404 | `POOL_NOT_FOUND` | Pool ID does not exist |
| 404 | `ORDER_NOT_FOUND` | Order ID does not exist |
| 409 | `INTENT_ALREADY_FILLED` | Intent was already settled |
| 409 | `INTENT_EXPIRED` | Intent deadline has passed |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Unexpected server error |
| 502 | `CHAIN_ERROR` | Cardano node/Ogmios unavailable |
| 503 | `SERVICE_UNAVAILABLE` | Server under maintenance |

---

## 15. Health & Status

### GET `/v1/health`

```json
{
  "status": "healthy",
  "version": "0.1.0",
  "uptime": 86400,
  "services": {
    "database": "healthy",
    "ogmios": "healthy",
    "kupo": "healthy",
    "cardanoNode": "healthy",
    "solver": "healthy"
  },
  "chain": {
    "network": "preview",
    "tipSlot": 12345678,
    "tipBlock": 654321,
    "syncProgress": 100.0
  }
}
```

### GET `/v1/health/ready`

Returns `200` when fully ready, `503` during startup/sync.

### GET `/v1/metrics`

Prometheus-format metrics endpoint (not JSON).
