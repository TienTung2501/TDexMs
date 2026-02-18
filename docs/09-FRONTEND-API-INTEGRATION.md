# SolverNet DEX — Frontend–Backend Integration Guide

> **Document Version**: 1.0.0  
> **Status**: Phase 2 — Implemented  
> **Date**: 2026-02-17  
> **Classification**: Internal — Technical Specification

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [API Client Layer](#3-api-client-layer)
4. [React Hooks Layer](#4-react-hooks-layer)
5. [Page Integration Map](#5-page-integration-map)
6. [Data Flow](#6-data-flow)
7. [Token Registry](#7-token-registry)
8. [WebSocket Integration](#8-websocket-integration)
9. [Wallet Integration](#9-wallet-integration)
10. [Error Handling & Loading States](#10-error-handling--loading-states)
11. [Environment Configuration](#11-environment-configuration)
12. [Deployment](#12-deployment)

---

## 1. Overview

The SolverNet DEX frontend is a Next.js 16 application that communicates with the Express.js backend deployed on Render. All mock data has been replaced with real API calls through a structured layered architecture:

```
┌──────────────────────────────────────────────────┐
│                 Page Components                   │
│   (page.tsx files — UI rendering)                │
├──────────────────────────────────────────────────┤
│              React Hooks Layer                    │
│   hooks.ts — usePools(), useAnalytics(), etc.    │
│   Auto-refetch, normalization, loading states    │
├──────────────────────────────────────────────────┤
│               API Client Layer                    │
│   api.ts — typed fetch wrappers for all routes   │
│   Error handling, base URL, JSON parsing         │
├──────────────────────────────────────────────────┤
│           Backend REST API + WebSocket            │
│   https://tdexms.onrender.com/v1/*               │
└──────────────────────────────────────────────────┘
```

---

## 2. Architecture

### 2.1 Separation of Concerns

| Layer | File | Responsibility |
|-------|------|----------------|
| **API Client** | `frontend/src/lib/api.ts` | Raw HTTP calls, typed request/response interfaces, error class |
| **React Hooks** | `frontend/src/lib/hooks.ts` | Data fetching with auto-refetch, normalization from API shapes to UI shapes |
| **Pages** | `frontend/src/app/*/page.tsx` | UI rendering using hooks, loading/error states |
| **Components** | `frontend/src/components/dex/*` | Reusable UI components accepting props or calling hooks |
| **Providers** | `frontend/src/providers/*` | Wallet context (demo mode with inline data) |

### 2.2 Key Design Decisions

1. **No SWR/React Query**: Custom `useApi<T>()` hook to avoid extra dependencies while maintaining auto-refetch
2. **Normalization layer**: API returns string amounts and raw shapes → hooks convert to `NormalizedPool`, `NormalizedIntent`, `NormalizedAnalytics` with numeric fields and resolved token objects
3. **Token resolution**: `resolveToken()` maps `{policyId, assetName}` from API to the local `TOKENS` registry in `mock-data.ts` (kept for token metadata)
4. **Demo wallet**: CIP-30 integration deferred; wallet-provider uses inline mock balances

---

## 3. API Client Layer

**File**: `frontend/src/lib/api.ts` (360 lines)

### 3.1 Configuration

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://tdexms.onrender.com";
const API_V1 = `${API_BASE}/v1`;
```

### 3.2 Core Fetch Helper

```typescript
async function apiFetch<T>(
  path: string,
  options?: RequestInit & { params?: Record<string, string> }
): Promise<T>
```

- Prepends `API_V1` to all paths
- Serializes `params` as URL query string
- Sets `Content-Type: application/json`
- Throws `ApiError` on non-2xx responses

### 3.3 Endpoint Functions

| Function | Method | Endpoint | Returns |
|----------|--------|----------|---------|
| `getHealth()` | GET | `/health` | `HealthResponse` |
| `getQuote(params)` | GET | `/quote` | `QuoteResponse` |
| `createIntent(body)` | POST | `/intents` | `CreateIntentResponse` |
| `getIntent(id)` | GET | `/intents/:id` | `IntentResponse` |
| `cancelIntent(id)` | DELETE | `/intents/:id` | `{intentId, unsignedTx, status}` |
| `listIntents(params)` | GET | `/intents` | `IntentListResponse` |
| `listPools(params)` | GET | `/pools` | `PoolListResponse` |
| `getPool(id)` | GET | `/pools/:id` | `PoolResponse` |
| `createPool(body)` | POST | `/pools/create` | pool result |
| `depositLiquidity(id, body)` | POST | `/pools/:id/deposit` | deposit result |
| `withdrawLiquidity(id, body)` | POST | `/pools/:id/withdraw` | withdraw result |
| `getAnalyticsOverview()` | GET | `/analytics/overview` | `AnalyticsOverview` |
| `getChartCandles(params)` | GET | `/chart/candles` | `ChartCandlesResponse` |
| `getChartPrice(id)` | GET | `/chart/price/:id` | `ChartPriceResponse` |
| `createWsConnection()` | WS | `/ws` | `WebSocket` |

---

## 4. React Hooks Layer

**File**: `frontend/src/lib/hooks.ts` (339 lines)

### 4.1 Generic Hook

```typescript
function useApi<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  options?: { enabled?: boolean; fallback?: T; refetchInterval?: number }
): { data: T | undefined; loading: boolean; error: Error | null; refetch: () => void }
```

### 4.2 Domain Hooks

| Hook | Returns | Refetch Interval | Notes |
|------|---------|------------------|-------|
| `usePools(params?)` | `{ pools: NormalizedPool[], total, loading, error, refetch }` | 30s | Accepts sort/filter params |
| `usePool(poolId)` | `{ pool: NormalizedPool \| undefined, loading, error }` | 15s | Skipped if poolId is undefined |
| `useAnalytics()` | `{ analytics: NormalizedAnalytics \| undefined, loading, error }` | 30s | Protocol-wide stats |
| `useIntents(params?)` | `{ intents: NormalizedIntent[], total, loading, error }` | 15s | Filter by address/status |
| `useCandles(poolId, interval)` | `{ candles: CandleData[], loading, error }` | — | OHLCV for charts |
| `usePrice(poolId)` | `{ price: string, loading, error }` | 10s | Latest price |
| `useWebSocket(channels, onMessage)` | `{ connected: boolean }` | — | Real-time updates |

### 4.3 Normalized Types

```typescript
interface NormalizedPool {
  id: string;
  assetA: Token;              // Resolved from TOKENS registry
  assetB: Token;
  reserveA: number;           // Parsed from string
  reserveB: number;
  totalLpTokens: number;
  feePercent: number;         // Calculated from feeNumerator/feeDenominator
  tvlAda: number;
  volume24h: number;
  fees24h: number;
  apy: number;
  priceChange24h: number;
  state: "ACTIVE" | "INACTIVE";
}

interface NormalizedAnalytics {
  tvl: number;
  volume24h: number;
  volume7d: number;
  fees24h: number;
  totalPools: number;
  totalIntents: number;
  intentsFilled: number;
  fillRate: number;
  uniqueTraders: number;
}

interface NormalizedIntent {
  id: string;
  status: string;
  creator: string;
  inputTicker: string;        // Resolved from asset identifier
  outputTicker: string;
  inputAmount: number;
  minOutput: number;
  actualOutput?: number;
  deadline: string;
  createdAt: string;
  escrowTxHash?: string;
  settlementTxHash?: string;
}
```

---

## 5. Page Integration Map

| Page | Route | Hooks Used | Previous Mock Data |
|------|-------|------------|-------------------|
| **Swap** | `/` | `useAnalytics()`, `usePools()`, `useCandles()` | `MOCK_ANALYTICS`, `MOCK_POOLS`, `generateMockCandles()` |
| **Pools** | `/pools` | `usePools()`, `useAnalytics()` | `MOCK_POOLS`, `MOCK_ANALYTICS` |
| **Pool Detail** | `/pools/[id]` | `usePool(id)`, `useCandles(id)` | `MOCK_POOLS`, `MOCK_RECENT_TRADES`, `generateMockCandles()` |
| **Orders** | `/orders` | `useIntents({ address })` | `MOCK_INTENTS` |
| **Analytics** | `/analytics` | `useAnalytics()`, `usePools()`, `useIntents({ status: "FILLED" })` | `MOCK_ANALYTICS`, `MOCK_POOLS`, `MOCK_RECENT_TRADES` |
| **Portfolio** | `/portfolio` | `useIntents({ address })`, `usePools()` | `MOCK_PORTFOLIO`, `MOCK_INTENTS`, `MOCK_POOLS` |

### Component Integration

| Component | API Functions Used | Props Changed |
|-----------|-------------------|---------------|
| `SwapCard` | `createIntent()` | Added `pools: NormalizedPool[]` prop |
| `RecentTradesTable` | `useIntents({ status: "FILLED" })` | Removed mock import; uses hook internally |
| `LiquidityForm` | `depositLiquidity()`, `withdrawLiquidity()` | Pool type changed to `NormalizedPool` |
| `PriceChart` | — (receives data via props) | No change needed |
| `TokenSelect` | — | Uses `TOKEN_LIST` from token registry |
| `WalletProvider` | — | Removed `MOCK_WALLET` import; uses inline demo data |

---

## 6. Data Flow

### 6.1 Swap Flow

```
User enters amount → SwapCard calculates quote (client-side AMM math)
                   → User clicks "Swap"
                   → SwapCard calls createIntent() via api.ts
                   → Backend creates intent record + returns intentId
                   → Intent appears in Orders page via useIntents()
                   → Solver engine picks up intent → fills on-chain
                   → useIntents() auto-refetch shows status change
```

### 6.2 Pool Data Flow

```
usePools() hook → listPools() API call → Backend queries Prisma DB
               → PoolResponse[] returned
               → normalizePool() converts to NormalizedPool[]
               → 30s auto-refetch keeps data fresh
```

### 6.3 Chart Data Flow

```
useCandles(poolId) → getChartCandles() API call
                   → Backend queries Candle table (OHLCV)
                   → CandleData[] returned → fed to lightweight-charts
```

---

## 7. Token Registry

**File**: `frontend/src/lib/mock-data.ts` (kept for token metadata)

The `TOKENS` record and `TOKEN_LIST` array remain in mock-data.ts as the **local token registry**. These are constants (not mock data) that map token identifiers to display metadata:

```typescript
const TOKENS: Record<string, Token> = {
  ADA:   { policyId: "",    assetName: "",       ticker: "ADA",   name: "Cardano",         decimals: 6, logo: "₳" },
  HOSKY: { policyId: "a00..", assetName: "484f534b59", ticker: "HOSKY", name: "Hosky Token",     decimals: 0, logo: "🐕" },
  DJED:  { policyId: "f66..", assetName: "444a4544",   ticker: "DJED",  name: "Djed Stablecoin", decimals: 6, logo: "💵" },
  // ... MELD, MIN, INDY, SNEK, WMT
};
```

The `resolveToken()` function in hooks.ts attempts to match API responses to this registry by ticker then by policyId. Unknown tokens get a fallback `🪙` icon.

---

## 8. WebSocket Integration

The `useWebSocket()` hook connects to `wss://tdexms.onrender.com/v1/ws` and supports subscribing to channels:

```typescript
const { connected } = useWebSocket(
  [
    { channel: "prices", params: { poolId: "pool-123" } },
    { channel: "intents" },
  ],
  (type, data) => {
    // Handle real-time updates
  }
);
```

**Channels**: `prices` (pool price ticks), `pools` (reserve changes), `intents` (status updates)

---

## 9. Wallet Integration

**Current State**: Demo mode with inline mock balances.

The `WalletProvider` (`frontend/src/providers/wallet-provider.tsx`) provides:

```typescript
interface WalletContextType {
  isConnected: boolean;
  address: string | null;
  balances: Record<string, number>;
  connect: () => void;
  disconnect: () => void;
}
```

On `connect()`, it sets a testnet address and preset balances. This allows full UI testing without a real wallet extension.

**Future**: Replace with CIP-30 integration (Nami, Eternl, Lace) for real wallet signing.

---

## 10. Error Handling & Loading States

### 10.1 Loading States

Every page uses `Loader2` spinner from lucide-react during data fetching:

```tsx
{loading ? (
  <div className="flex items-center justify-center py-8">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
) : (
  <ActualContent />
)}
```

### 10.2 Error Handling

The `ApiError` class carries HTTP status and optional error code:

```typescript
class ApiError extends Error {
  status: number;
  code?: string;
}
```

Hooks expose `error` state for components to display error messages. Current implementation logs errors to console; toast notifications can be added.

### 10.3 Empty States

All list pages (pools, orders, analytics) show contextual empty states with icons when no data is available.

---

## 11. Environment Configuration

### 11.1 Frontend Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `https://tdexms.onrender.com` | Backend API base URL |

Set in **Vercel Dashboard → Environment Variables** for production.

### 11.2 Build Configuration

**vercel.json**:
```json
{
  "installCommand": "npm install -g pnpm@9.15.0 && pnpm install --filter frontend",
  "buildCommand": "pnpm --filter frontend build"
}
```

**next.config.ts**:
```typescript
const nextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "https://tdexms.onrender.com",
  },
};
```

---

## 12. Deployment

### 12.1 Current Production URLs

| Service | URL | Platform |
|---------|-----|----------|
| Backend API | https://tdexms.onrender.com | Render (Docker) |
| Frontend | Vercel (auto-deploy from Git) | Vercel |
| Database | Supabase PostgreSQL | Supabase |
| Keep-alive | UptimeRobot (5-min ping) | UptimeRobot |

### 12.2 Deployment Flow

```
Git push → Vercel auto-builds frontend
        → Render auto-builds backend Docker image
        → Prisma migrations run on startup (CMD in Dockerfile)
        → UptimeRobot pings /v1/health every 5 mins
```

### 12.3 Local Development

```bash
# Install dependencies
pnpm install

# Start backend (requires .env)
pnpm --filter backend dev

# Start frontend (separate terminal)
pnpm --filter frontend dev

# Frontend connects to NEXT_PUBLIC_API_URL (defaults to Render backend)
```

---

## Files Changed During Integration

| File | Action | Description |
|------|--------|-------------|
| `frontend/src/lib/api.ts` | **Created** | Complete API client with all 15 endpoint functions |
| `frontend/src/lib/hooks.ts` | **Created** | 7 React hooks with auto-refetch + normalization |
| `frontend/next.config.ts` | **Modified** | Added `NEXT_PUBLIC_API_URL` env |
| `frontend/src/app/page.tsx` | **Rewritten** | Uses `useAnalytics()`, `usePools()`, `useCandles()` |
| `frontend/src/app/pools/page.tsx` | **Rewritten** | Uses `usePools()`, `useAnalytics()` |
| `frontend/src/app/pools/[id]/page.tsx` | **Rewritten** | Uses `usePool()`, `useCandles()` |
| `frontend/src/app/orders/page.tsx` | **Rewritten** | Uses `useIntents({ address })` |
| `frontend/src/app/analytics/page.tsx` | **Rewritten** | Uses `useAnalytics()`, `usePools()`, `useIntents()` |
| `frontend/src/app/portfolio/page.tsx` | **Rewritten** | Uses `useIntents()`, `usePools()` |
| `frontend/src/components/dex/swap-card.tsx` | **Modified** | Added `pools` prop, connected to `createIntent()` API |
| `frontend/src/components/dex/recent-trades-table.tsx` | **Rewritten** | Uses `useIntents({ status: "FILLED" })` internally |
| `frontend/src/components/dex/liquidity-form.tsx` | **Modified** | Connected to `depositLiquidity()`/`withdrawLiquidity()` APIs |
| `frontend/src/providers/wallet-provider.tsx` | **Modified** | Removed `MOCK_WALLET` import; inlined demo data |
| `frontend/src/lib/mock-data.ts` | **Kept** | Token registry (`TOKENS`, `TOKEN_LIST`) still used; mock data exports deprecated |
