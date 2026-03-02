# Enterprise Standardization — Implementation Report

> **Project:** SolverNet DEX (Cardano-based Intent DEX)  
> **Scope:** Full-stack real-time reactivity overhaul + enterprise architecture standardization  
> **Status:** ✅ COMPLETE — Both frontend and backend builds verified passing  
> **Date:** 2025-07

---

## 1. Executive Summary

This report documents the complete implementation of enterprise-grade real-time reactivity across the SolverNet DEX platform. The work addressed a critical architectural gap: **the UI was not reactive to backend state changes**, causing stuck FILLING badges, stale candle charts, and delayed portfolio updates.

### Root Causes Identified
1. **Frontend:** Custom `useApi` hook used local React state — no global cache, no cross-component synchronization
2. **Backend:** Only the `SolverEngine.settleIntent()` FILLED path broadcasted via WebSocket — 90% of status transitions were silent
3. **Infrastructure:** Next.js HTTP caching (`cache: 'force-cache'` default) served stale API responses

### Solution Implemented
- **Frontend:** Migrated to TanStack React Query v5 with global cache + WebSocket-driven invalidation
- **Backend:** Domain Event Bus architecture — every status change emits a typed event; a single bridge (WsEventHandlers) translates events to WebSocket broadcasts
- **Infrastructure:** Disabled Next.js fetch caching (`cache: 'no-store'`), added safety-net polling intervals

---

## 2. Architecture — Domain Event Bus Pattern

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PRODUCERS (10 files)                         │
│                                                                     │
│  CreateIntent ──┐   CancelIntent ──┐   CancelOrder ──┐             │
│  ExecuteOrder ──┤   tx.ts routes ──┤   SolverEngine──┤             │
│  ChainSync ─────┤   ReclaimKeeper─┤   GhostCleanup──┤             │
│  OrderExecutor──┘                  │                  │             │
│                                    ▼                  ▼             │
│              ┌─────────────────────────────────────────┐            │
│              │         DomainEventBus (Singleton)       │            │
│              │                                         │            │
│              │  Events:                                │            │
│              │    • intent.statusChanged (30+ calls)   │            │
│              │    • order.statusChanged  (10+ calls)   │            │
│              │    • pool.updated         (5+ calls)    │            │
│              │    • price.tick           (reserved)     │            │
│              └──────────────┬──────────────────────────┘            │
│                             │                                       │
│                    ┌────────▼────────┐                              │
│                    │ WsEventHandlers │ (single bridge)              │
│                    │                 │                              │
│                    │ intent → broadcastIntent()                     │
│                    │ order  → broadcastOrder()                      │
│                    │ pool   → broadcastPool()                       │
│                    │ price  → broadcastPrice()                      │
│                    └────────┬────────┘                              │
│                             │                                       │
│                    ┌────────▼────────┐                              │
│                    │    WsServer     │                              │
│                    │  4 channels:    │                              │
│                    │  intent, order, │                              │
│                    │  pool, prices   │                              │
│                    └────────┬────────┘                              │
└─────────────────────────────┼───────────────────────────────────────┘
                              │ WebSocket
                    ┌─────────▼─────────────┐
                    │  GlobalWebSocketProvider │
                    │                         │
                    │  intentUpdate → invalidate:                     │
                    │    [intents, intents-paginated,                 │
                    │     portfolio, portfolio-summary]               │
                    │                                                │
                    │  orderUpdate → invalidate:                     │
                    │    [orders, orders-paginated,                   │
                    │     portfolio, portfolio-summary]               │
                    │                                                │
                    │  poolUpdate → invalidate:                      │
                    │    [pool/{id}, getChartCandles/{id}]            │
                    └─────────┬─────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   React Query     │
                    │   Global Cache    │
                    │                   │
                    │   staleTime: 5s   │
                    │   refetchOnFocus  │
                    │   refetchInterval │
                    │   (per-hook)      │
                    └───────────────────┘
```

---

## 3. Files Modified / Created

### 3.1 Backend — New Files (3)

| File | Purpose | Lines |
|------|---------|-------|
| `backend/src/domain/events/DomainEventBus.ts` | Typed event bus with `DomainEventMap`, async handlers, singleton `getEventBus()` | 155 |
| `backend/src/domain/events/index.ts` | Barrel export for event types & bus | 8 |
| `backend/src/infrastructure/events/WsEventHandlers.ts` | Single bridge: Domain Events → WsServer broadcasts | 80 |

### 3.2 Backend — Modified Files (11)

| File | Changes | `.emit()` Calls |
|------|---------|:---------------:|
| `backend/src/index.ts` | Import & wire `getEventBus` + `registerWsEventHandlers` in composition root | 0 (wiring only) |
| `backend/src/application/use-cases/CreateIntent.ts` | Emit `intent.statusChanged` after `intentRepo.save()` | 1 |
| `backend/src/application/use-cases/CancelIntent.ts` | Emit `intent.statusChanged` after `markCancelling()` | 1 |
| `backend/src/application/use-cases/CancelOrder.ts` | Emit `order.statusChanged` for both DB-only cancel and TX-based cancel | 2 |
| `backend/src/application/use-cases/ExecuteOrderUseCase.ts` | Emit `order.statusChanged` when marking PENDING | 1 |
| `backend/src/interface/http/routes/tx.ts` | Emit events for ACTIVE, CANCELLED, pool created/deposit/withdraw | 6 |
| `backend/src/solver/SolverEngine.ts` | Emit for FILLING, FILLING→ACTIVE reverts (3 locations), pool.updated, auto-heal CREATED→ACTIVE | 6 |
| `backend/src/infrastructure/cardano/ChainSync.ts` | Emit for intent/order promotion, pool reserves sync, bulk expiry | 5 |
| `backend/src/infrastructure/cron/ReclaimKeeperCron.ts` | Emit for RECLAIMED, CANCELLED after on-chain confirmation | 4 |
| `backend/src/infrastructure/cron/GhostCleanupCron.ts` | Emit for CREATED→ACTIVE promotions, CANCELLING→ACTIVE rescue | 3 |
| `backend/src/infrastructure/cron/OrderExecutorCron.ts` | Emit for order execution (PARTIALLY_FILLED/FILLED) | 1 |
| `backend/src/interface/ws/WsServer.ts` | Added `OrderUpdate` interface, `broadcastOrder()` method, `order` channel subscription | — |

**Total backend `.emit()` calls: 30+**

### 3.3 Frontend — New Files (2)

| File | Purpose |
|------|---------|
| `frontend/src/providers/query-provider.tsx` | React Query client configuration (5s staleTime, retry, refetchOnWindowFocus) |
| `frontend/src/providers/global-ws-provider.tsx` | Singleton WS connection, subscribes to all 4 channels, invalidates React Query on messages |

### 3.4 Frontend — Modified Files (4)

| File | Changes |
|------|---------|
| `frontend/src/app/providers.tsx` | Added `QueryProvider` + `GlobalWebSocketProvider` wrappers |
| `frontend/src/lib/api.ts` | Added `cache: 'no-store'` to bypass Next.js HTTP caching |
| `frontend/src/lib/hooks.ts` | Migrated all 16 hooks from `useApi` to `useQuery`; removed dead `useApi` function; added `refetchInterval` to 10 hooks |
| `frontend/src/components/features/trading/swap-card.tsx` | Added `useQueryClient()` + `invalidateQueries` on intent creation success |
| `frontend/src/components/features/trading/trading-footer.tsx` | Added `invalidateQueries` on intent cancel success |

---

## 4. Event Coverage Matrix

Every intent/order status transition in the system now emits a domain event:

### 4.1 Intent Lifecycle Events

| Status Transition | Source File | Event |
|-------------------|-------------|-------|
| `null → CREATED` | CreateIntent.ts | `intent.statusChanged` |
| `CREATED → ACTIVE` (user /tx/confirm) | tx.ts | `intent.statusChanged` |
| `CREATED → ACTIVE` (ChainSync auto-promote) | ChainSync.ts | `intent.statusChanged` |
| `CREATED → ACTIVE` (GhostCleanup safety-net) | GhostCleanupCron.ts | `intent.statusChanged` |
| `CREATED → ACTIVE` (SolverEngine auto-heal) | SolverEngine.ts | `intent.statusChanged` |
| `ACTIVE → FILLING` | SolverEngine.ts | `intent.statusChanged` |
| `FILLING → ACTIVE` (sign failure revert) | SolverEngine.ts | `intent.statusChanged` |
| `FILLING → ACTIVE` (submit failure revert) | SolverEngine.ts | `intent.statusChanged` |
| `FILLING → ACTIVE` (validator crash revert) | SolverEngine.ts | `intent.statusChanged` |
| `ACTIVE → CANCELLING` | CancelIntent.ts | `intent.statusChanged` |
| `CANCELLING → CANCELLED` (user /tx/confirm) | tx.ts | `intent.statusChanged` |
| `CANCELLING → ACTIVE` (stuck rescue) | GhostCleanupCron.ts | `intent.statusChanged` |
| `* → EXPIRED` (deadline passed) | ChainSync.ts | `intent.statusChanged` (per-intent) |
| `EXPIRED → RECLAIMED` (on-chain reclaim) | ReclaimKeeperCron.ts | `intent.statusChanged` |
| `EXPIRED → RECLAIMED` (UTxO already spent) | ReclaimKeeperCron.ts | `intent.statusChanged` |
| `FILLING → FILLED` | SolverEngine.ts | `intent.statusChanged` (existing) |

### 4.2 Order Lifecycle Events

| Status Transition | Source File | Event |
|-------------------|-------------|-------|
| `CREATED → ACTIVE` (ChainSync auto-promote) | ChainSync.ts | `order.statusChanged` |
| `CREATED → ACTIVE` (GhostCleanup safety-net) | GhostCleanupCron.ts | `order.statusChanged` |
| `ACTIVE → PENDING` (execution started) | ExecuteOrderUseCase.ts | `order.statusChanged` |
| `ACTIVE → PARTIALLY_FILLED/FILLED` (after confirm) | OrderExecutorCron.ts | `order.statusChanged` |
| `* → CANCELLED` (user cancel, DB-only) | CancelOrder.ts | `order.statusChanged` |
| `* → CANCELLED` (user cancel, TX-based) | CancelOrder.ts | `order.statusChanged` |
| `ACTIVE → CANCELLED` (user /tx/confirm) | tx.ts | `order.statusChanged` |
| `CREATED → ACTIVE` (user /tx/confirm) | tx.ts | `order.statusChanged` |
| `* → EXPIRED` (deadline passed) | ChainSync.ts | `order.statusChanged` (per-order) |
| `EXPIRED → CANCELLED` (on-chain reclaim) | ReclaimKeeperCron.ts | `order.statusChanged` |
| `EXPIRED → CANCELLED` (UTxO already spent) | ReclaimKeeperCron.ts | `order.statusChanged` |

### 4.3 Pool Events

| Action | Source File | Event |
|--------|-------------|-------|
| Pool created (CREATING→ACTIVE) | tx.ts | `pool.updated` |
| Deposit reserves | tx.ts | `pool.updated` |
| Withdraw reserves | tx.ts | `pool.updated` |
| On-chain reserves synced | ChainSync.ts | `pool.updated` (only when `changed=true`) |
| Post-settlement reserves | SolverEngine.ts | `pool.updated` |

---

## 5. Frontend Data Flow

### 5.1 React Query Configuration

```typescript
// query-provider.tsx
QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,        // 5s — prevents redundant refetches
      retry: (count, err) => {  // Custom retry: 404 = no retry, others max 2
        if (err?.message?.includes('404')) return false;
        return count < 2;
      },
      refetchOnWindowFocus: true,  // Refresh when user returns to tab
    },
  },
});
```

### 5.2 Per-Hook Polling Intervals

| Hook | refetchInterval | Rationale |
|------|:--------------:|-----------|
| `usePool` | 10s | Critical trading data |
| `useTokenPairs` | 30s | Semi-static |
| `useVolume24h` | 60s | Aggregation, slow-changing |
| `usePoolTVL` | 30s | Important but not critical |
| `useProtocolStats` | 60s | Admin dashboard |
| `useAllPools` | 15s | Pool listing page |
| `usePaginatedIntents` | 30s | Active intent monitoring |
| `usePaginatedOrders` | 30s | Active order monitoring |
| `useCandles` | 60s | Chart data, updated by pool events |
| `usePortfolioSummary` | 30s | Wallet overview |

### 5.3 WebSocket → Cache Invalidation Map

| WS Message | Query Keys Invalidated |
|------------|----------------------|
| `intentUpdate` | `intents`, `intents-paginated`, `portfolio`, `portfolio-summary` |
| `orderUpdate` | `orders`, `orders-paginated`, `portfolio`, `portfolio-summary` |
| `poolUpdate` | `pool/{poolId}`, `getChartCandles/{poolId}` |

---

## 6. Build Verification

### Backend
```
$ pnpm exec tsc --noEmit
(exit code 0 — no errors)
```

### Frontend
```
$ npx next build
✓ Compiled successfully in 18.3s
✓ Generating static pages (21/21) in 1487.4ms

Routes: / | /about | /admin/* (7 routes) | /analytics | /cv | 
        /orders | /pools | /pools/[id] | /pools/create | /portfolio
```

---

## 7. Before / After Comparison

| Aspect | Before | After |
|--------|--------|-------|
| **State management** | Custom `useApi` with local `useState` | TanStack React Query v5 global cache |
| **Cross-component sync** | ❌ None — each component fetched independently | ✅ Shared cache keys — all components see same data |
| **WS event coverage** | Only `FILLED` status (1 event) | All 27+ status transitions emit events |
| **WS channels** | 3 (prices, intent, pool) | 4 (prices, intent, pool, **order**) |
| **Event architecture** | Direct WsServer calls scattered in SolverEngine | Domain Event Bus → single WsEventHandlers bridge |
| **Order WS support** | ❌ None | ✅ Full lifecycle broadcasting |
| **Fetch caching** | Next.js default (`force-cache`) | `cache: 'no-store'` — always fresh |
| **Polling fallback** | ❌ None | ✅ 10-60s intervals on 10+ hooks |
| **Dead code** | ~60 lines of unused `useApi` function | ✅ Removed |
| **Intent status stuck** | FILLING badge stuck indefinitely | ✅ Immediate revert events on failure |
| **Candle chart lag** | No real-time updates | ✅ Pool events invalidate candle cache |
| **Portfolio stale** | Updated only on page refresh | ✅ Instant via WS + polling |

---

## 8. Remaining Recommendations

### 8.1 Price Broadcasting (Low Priority)
`broadcastPrice()` is wired in `WsEventHandlers` but `PriceAggregationCron` does not emit `price.tick` events yet. This is non-critical because prices are derived from pool reserves (which are now broadcast). Add `price.tick` emissions in `PriceAggregationCron.tick()` if dedicated price streaming is desired.

### 8.2 Candle Streaming (Medium Priority)
Real-time candlestick updates currently work via cache invalidation (pool events → invalidate `getChartCandles` → refetch). For sub-second chart updates, consider a dedicated `candle.updated` event emitted after each `PriceTick` is aggregated into a `Candle` row.

### 8.3 Multi-Instance Scaling (Future)
The current `DomainEventBus` is in-process only. When deploying multiple backend instances (e.g., Kubernetes), replace with Redis Pub/Sub or similar cross-process event broker. The `DomainEventMap` types and `registerWsEventHandlers` bridge remain unchanged — only the transport layer changes.

### 8.4 Health Check Keep-Alive (Render Specific)
Render.com free tier spins down after 15 minutes of inactivity. Consider adding a `/health` endpoint pinged by an external uptime monitor (e.g., UptimeRobot) to prevent cold starts.

---

## 9. Files Index

### New Files Created
```
backend/src/domain/events/DomainEventBus.ts
backend/src/domain/events/index.ts
backend/src/infrastructure/events/WsEventHandlers.ts
frontend/src/providers/query-provider.tsx
frontend/src/providers/global-ws-provider.tsx
```

### Modified Files
```
backend/src/index.ts
backend/src/application/use-cases/CreateIntent.ts
backend/src/application/use-cases/CancelIntent.ts
backend/src/application/use-cases/CancelOrder.ts
backend/src/application/use-cases/ExecuteOrderUseCase.ts
backend/src/interface/http/routes/tx.ts
backend/src/interface/ws/WsServer.ts
backend/src/solver/SolverEngine.ts
backend/src/infrastructure/cardano/ChainSync.ts
backend/src/infrastructure/cron/ReclaimKeeperCron.ts
backend/src/infrastructure/cron/GhostCleanupCron.ts
backend/src/infrastructure/cron/OrderExecutorCron.ts
frontend/src/app/providers.tsx
frontend/src/lib/api.ts
frontend/src/lib/hooks.ts
frontend/src/components/features/trading/swap-card.tsx
frontend/src/components/features/trading/trading-footer.tsx
```

**Total: 5 new files + 17 modified files = 22 files touched**
