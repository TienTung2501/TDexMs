# SolverNet DEX — API Specification

> **Document Version**: 1.0.0  
> **Status**: Phase 1 — Design  
> **Date**: 2026-02-17  
> **Base URL**: `https://api.solvernet.io/v1`  
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
10. [WebSocket API](#10-websocket-api)
11. [Error Handling](#11-error-handling)
12. [Health & Status](#12-health--status)

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

Get comprehensive portfolio view for a wallet.

**Response: `200 OK`**

```json
{
  "address": "addr1qx...",
  "summary": {
    "totalValueAda": "150000000000",
    "totalPnlAda": "5000000000",
    "totalPnlPercent": 3.45,
    "openIntents": 2,
    "activeOrders": 1
  },
  "positions": [
    {
      "poolId": "pool_abc123",
      "pair": "ADA/HOSKY",
      "lpTokenAmount": "7000000000",
      "sharePercent": 1.97,
      "valueAda": "14000000000",
      "depositValueAda": "13500000000",
      "pnlAda": "500000000",
      "pnlPercent": 3.7,
      "feesEarnedAda": "200000000"
    }
  ],
  "recentTransactions": [
    {
      "txHash": "abc123...",
      "type": "SWAP",
      "inputAsset": "ADA",
      "inputAmount": "100000000",
      "outputAsset": "HOSKY",
      "outputAmount": "5000000000",
      "timestamp": "2026-02-17T12:00:00Z",
      "status": "CONFIRMED"
    }
  ]
}
```

### GET `/v1/portfolio/{address}/transactions`

Paginated transaction history for a wallet.

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

---

## 10. WebSocket API

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

## 11. Error Handling

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

## 12. Health & Status

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
