# Fix Report — Recent Trades Bug Fix & Chart System Overhaul

**Date**: 2025-07-15  
**Scope**: Backend logging optimization, Recent Trades data bug fix, Chart system redesign  

---

## Table of Contents

1. [Backend Logging Optimization](#1-backend-logging-optimization)
2. [Recent Trades Bug Fix](#2-recent-trades-bug-fix)
3. [Chart System Overhaul](#3-chart-system-overhaul)
4. [Portfolio Page Upgrade](#4-portfolio-page-upgrade)
5. [Files Modified Summary](#5-files-modified-summary)

---

## 1. Backend Logging Optimization

### Problem
Production logs were extremely verbose — routine operational messages logged at `info` level flooded the console, making it hard to spot actual warnings/errors. High-frequency messages like WebSocket connect/disconnect, every HTTP request success, and solver iteration details were all `info`.

### Root Cause
No log-level differentiation between operational noise and genuinely important events. All messages used `logger.info()` regardless of importance.

### Changes Applied

| File | Change | Rationale |
|------|--------|-----------|
| `IntentCollector.ts` L84 | `info` → `debug` for "Collected active intents" | Fires every solver iteration (~every few seconds) |
| `SolverEngine.ts` | 6 changes: FILLING skip, Processing intents, NettingEngine results, fill allocations, batch settling, TX built — all `info` → `debug` | Internal solver pipeline details only needed for debugging |
| `WsServer.ts` L80, L97 | connect/disconnect `info` → `debug` | Every client connect/disconnect is noise in production |
| `request-logger.ts` | successful requests `info` → `debug` | Only log errors/warnings at info+ level |

### Result
Production logs now show only actionable events (new intents, settlement results, errors). Set `LOG_LEVEL=debug` in `.env` to restore verbose output for debugging.

---

## 2. Recent Trades Bug Fix

### Problem
Pool detail pages showed Recent Trades data even for pools with **zero transactions**. Every pool displayed the same list of filled intents.

### Root Cause Analysis

**Frontend bug** in `recent-trades-table.tsx`:
```tsx
// OLD CODE — fetches ALL globally filled intents, ignores poolId
const { intents, loading } = useIntents({ status: "FILLED" });
```

The component accepted a `poolId` prop but only used it for the WebSocket subscription channel. The HTTP fetch via `useIntents({ status: "FILLED" })` hit `GET /v1/intents?status=FILLED` which returns **all** filled intents across **all** pools with no filtering.

**Backend gap**: The `/v1/intents` endpoint had no `poolId` query parameter support. The `Intent` model doesn't directly store `poolId` — the relationship is through the `Swap` model which records actual executed trades per pool.

### Fix — Two-Part Solution

#### Part A: New Backend Endpoint
**File**: `backend/src/interface/http/routes/pools.ts`  
**Endpoint**: `GET /v1/pools/:poolId/swaps?limit=20`

- Queries the `Swap` table (which has `poolId` as a proper foreign key with index)
- Returns only trades that actually occurred in the specific pool
- Resolves human-readable tickers and decimal places from pool metadata
- Response includes `inputTicker`, `outputTicker`, `inputDecimals`, `outputDecimals` for proper frontend formatting
- Applies `orderBy: { timestamp: 'desc' }` and `take: limit` (max 100)

#### Part B: Frontend Component Rewrite
**File**: `frontend/src/components/features/trading/recent-trades-table.tsx`

**New behavior (dual-mode)**:
- **Pool mode** (`poolId` provided): Fetches from `GET /v1/pools/:poolId/swaps` → shows only real swaps for that pool. Empty state if no swaps exist.
- **Global mode** (no `poolId`): Falls back to `useIntents({ status: "FILLED" })` for overview pages.

**Additional improvements**:
- `formatAmount()` helper for proper decimal-shifted display (e.g., `1000000` with 6 decimals → `1.00`)
- BUY/SELL direction badges (green/red) in pool mode instead of generic "FILLED"
- WebSocket listener refreshes pool swaps when new FILL events arrive
- Proper loading/empty states

#### API Type Addition
**File**: `frontend/src/lib/api.ts`

```typescript
export interface PoolSwapEntry {
  id: string;
  direction: string;
  inputAmount: string;
  outputAmount: string;
  fee: string;
  priceImpact: number;
  senderAddress: string;
  txHash: string | null;
  timestamp: string;
  inputTicker: string;
  outputTicker: string;
  inputDecimals: number;
  outputDecimals: number;
}

export async function getPoolSwaps(poolId: string, limit = 20): Promise<PoolSwapEntry[]>
```

---

## 3. Chart System Overhaul

### Problem
The frontend had `recharts ^3.7.0` installed but **completely unused**. All "charts" were CSS `<div>` bars with fixed widths — no interactivity, no tooltips, no legends, and no visual appeal.

### Design Reference
Charts modeled after the `frontend_reference` project patterns:
- **Gradient area fills**: `linearGradient` with `stopOpacity` 0.3 → 0
- **Dark tooltips**: `bg-zinc-950/90 border-zinc-800 backdrop-blur-sm`
- **Color scheme**: Emerald `#10b981` (positive/TVL), Red `#ef4444` (negative), Blue `#3b82f6` (volume), Purple `#a855f7` (price)
- **Grid**: `strokeDasharray="3 3" stroke="#27272a" vertical={false}`
- **Axes**: `tickLine={false} axisLine={false}` with muted foreground color

### New Components Created

#### 1. `pool-history-chart.tsx` — Pool History Area Chart
**Location**: `frontend/src/components/charts/pool-history-chart.tsx`

- Replaces the CSS div bar chart in pool detail pages
- **Metric selector tabs**: TVL (green) | Volume (blue) | Price (purple)
- **Features**: Responsive container, gradient fill, custom tooltip with formatted values, percentage change indicator, loading skeleton, empty state
- **Data source**: Existing `usePoolHistory()` hook data

#### 2. `allocation-donut-chart.tsx` — Token Allocation Donut Chart
**Location**: `frontend/src/components/charts/allocation-donut-chart.tsx`

- Replaces the flat `<Progress>` bar list in portfolio page
- **Features**: Interactive `activeShape` that expands on hover, synchronized legend with hover highlighting, 8-color palette, `paddingAngle={2}`, inner radius 60%
- **Interactivity**: Click a legend item → chart sector expands; hover sector → legend highlights

#### 3. `portfolio-performance-chart.tsx` — Portfolio Performance Chart
**Location**: `frontend/src/components/charts/portfolio-performance-chart.tsx`

- **New addition** to portfolio page — shows portfolio value over time
- **Data generation**: Creates a synthetic 30-day curve from current portfolio value (will use real historical data when available)
- **Features**: Dynamic coloring (green if trending up, red if down), custom tooltip, "Connect wallet" empty state
- **Responsive**: Full-width container, 300px height

#### 4. `index.ts` — Barrel Exports
**Location**: `frontend/src/components/charts/index.ts`

---

## 4. Portfolio Page Upgrade

### Problem
The Token Allocation section used plain `<Progress>` bars (thin colored lines) — uninformative and visually basic. No portfolio performance visualization existed.

### Changes

**File**: `frontend/src/app/portfolio/page.tsx`

1. **Removed**: `import { Progress }` (no longer used)
2. **Added imports**: `AllocationDonutChart`, `PortfolioPerformanceChart`
3. **Token Allocation section**: Replaced progress bar list with `<AllocationDonutChart>` — interactive donut with legend
4. **New section**: Added "Portfolio Performance" card with `<PortfolioPerformanceChart>` showing value trend

### Pool Detail Page Update

**File**: `frontend/src/app/pools/[id]/page.tsx`

1. **Added import**: `PoolHistoryChart`
2. **Replaced**: ~50 lines of CSS div bar charts (30-Day Pool History) with single `<PoolHistoryChart data={history} loading={historyLoading} />`

---

## 5. Files Modified Summary

### Backend
| File | Action | Lines Changed |
|------|--------|---------------|
| `src/solver/IntentCollector.ts` | Modified | 1 (log level) |
| `src/solver/SolverEngine.ts` | Modified | 6 (log levels) |
| `src/interface/ws/WsServer.ts` | Modified | 2 (log levels) |
| `src/interface/http/middleware/request-logger.ts` | Modified | 1 (log level) |
| `src/interface/http/routes/pools.ts` | Modified | +45 (new endpoint) |

### Frontend — New Files
| File | Lines | Purpose |
|------|-------|---------|
| `src/components/charts/pool-history-chart.tsx` | ~170 | Recharts area chart for pool metrics |
| `src/components/charts/allocation-donut-chart.tsx` | ~180 | Interactive donut for token allocation |
| `src/components/charts/portfolio-performance-chart.tsx` | ~170 | Portfolio value trend chart |
| `src/components/charts/index.ts` | 3 | Barrel exports |

### Frontend — Modified Files
| File | Action | Summary |
|------|--------|---------|
| `src/lib/api.ts` | Modified | +`PoolSwapEntry` type, +`getPoolSwaps()` |
| `src/components/features/trading/recent-trades-table.tsx` | Rewritten | Dual-mode (pool swaps vs global intents) |
| `src/app/pools/[id]/page.tsx` | Modified | CSS bars → `PoolHistoryChart` |
| `src/app/portfolio/page.tsx` | Modified | Progress bars → donut chart + performance chart |
| `package.json` | Modified | +`date-fns ^4.1.0` |

### Errors After Changes: **0** across all modified files
