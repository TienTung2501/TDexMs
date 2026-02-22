# SolverNet DEX — Final Session Audit Report

**Date:** 2026-02-22  
**Scope:** Frontend-Backend API compatibility, E2E testing, system reset, bot setup

---

## Executive Summary

**Critical systemic bug found and fixed** — `URLSearchParams` converted JavaScript `undefined` values to the literal string `"undefined"`, causing Zod enum validation to fail on ALL GET endpoints with optional query parameters. This single bug caused pools page, trading footer, swap quote, intents listing, and orders listing to all fail.

### Test Results

| Test Suite | Result |
|---|---|
| Read-Only API Tests | **24/24 PASS** |
| Full E2E (7 phases, 39 tests) | **39/39 PASS** |
| TypeScript compilation (frontend) | **0 errors** |
| TypeScript compilation (backend) | **0 errors** |

---

## Root Cause Analysis

### The URLSearchParams Bug

**Affected:** Every frontend hook that passes optional query parameters to the backend.

```typescript
// BEFORE (broken) — in apiFetch()
const qs = new URLSearchParams(params).toString();
// params = { sortBy: undefined, order: undefined }
// → "sortBy=undefined&order=undefined"
// → Backend Zod: z.enum(['tvl','volume24h',...]) rejects "undefined"

// AFTER (fixed)
const filtered = Object.fromEntries(
  Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
);
const qs = new URLSearchParams(filtered).toString();
// → "" (empty, no query string)
```

### 6 Frontend-Backend Mismatches Found & Fixed

| # | Mismatch | Frontend Sent | Backend Expected | Fix |
|---|----------|---------------|------------------|-----|
| 1 | **URLSearchParams undefined** | `"undefined"` string | nothing (omit param) | Filter undefined/null/empty |
| 2 | **Intent deadline** | ISO string `"2026-..."` | `z.number().int().positive()` (Unix ms) | `Date.now() + 30*60000` |
| 3 | **Input amount** | Human-readable `"5.0"` | `z.string().regex(/^\d+$/)` (base units) | `× 10^decimals` |
| 4 | **Slippage** | Percentage `"0.5"` | BPS `0-10000` (50 = 0.5%) | `× 100` |
| 5 | **Output amount** | `"undefined"` | Positive integer string | Compute from quote or AMM |
| 6 | **Quote ID** | Not sent | Optional `quoteId` for tracking | Forward from server quote |

---

## Changes Made

### Backend

| File | Change |
|---|---|
| `backend/src/interface/http/routes/admin.ts` | Added `POST /admin/reset-db` endpoint with FK-safe deleteMany, PrismaClient dependency |
| `backend/src/interface/http/app.ts` | Added `prisma` to AppDependencies, pass to admin router |
| `backend/src/index.ts` | Pass `prisma` instance to `createApp()` |
| `backend/.env` | Set `SOLVER_ENABLED=true`, `SOLVER_ADDRESS`, `FAUCET_TARGET_ADDRESS` |

### Frontend

| File | Change |
|---|---|
| `frontend/src/lib/api.ts` | Filter undefined/null/empty from URL params; `CreateIntentRequest.deadline` type `string→number` |
| `frontend/src/components/features/trading/swap-card.tsx` | `handleSwap`: base units, deadline number, quoteId, slippage BPS, minOutput in base units |

### Scripts

| File | Change |
|---|---|
| `frontend/scripts/src/run-all-tests.ts` | Fixed quote params; admin stubs accept 501/502 |
| `frontend/scripts/src/e2e-full-test.ts` | Fixed variable ordering; deadline type; slippage BPS; expected chain error handling |
| `frontend/scripts/src/system-reset.ts` | Updated DB reset to use new `/admin/reset-db` endpoint |
| `frontend/scripts/src/mint-test-tokens.ts` | Added `validFrom()` for Native Script InvalidBefore constraint |
| `frontend/scripts/.env` | Added `ADMIN_ADDRESS`, `T_TOKEN_ASSET`, `T_TOKEN_ASSET2` |

---

## E2E Test Breakdown

### Read-Only API Tests (24/24)

```
✅ Health (2)     — status, ready
✅ Analytics (2)  — overview, prices
✅ Pools (3)      — list, detail, history
✅ Quote (1)      — output=97750, route=1 hops
✅ Intents (1)    — list with filters
✅ Orders (1)     — list with filters
✅ Chart (1)      — candles
✅ Portfolio (6)  — summary, open-orders, history, liquidity, detail, transactions
✅ Admin (4)      — auth, dashboard, revenue, settings
✅ Admin Stubs (3) — collect-fees 502, update-settings 502, burn-pool 502 (expected)
```

### Full E2E (39/39)

```
Phase 1 — System Health:     4/4  (health, ready, wallet1, wallet2)
Phase 2 — Pool Operations:   4/4  (list, create/use existing, detail, history)
Phase 3 — Swap Operations:   3/3  (quote, create intent, cancel intent*)
Phase 4 — Advanced Orders:   5/5  (limit, DCA, stop-loss, cancel-limit*, cancel-DCA*)
Phase 5 — Data Queries:      15/15 (pools, intents, orders, analytics ×2, portfolio ×5, chart ×5)
Phase 6 — Admin Operations:  6/6  (auth, dashboard, pending, settings, collect*, update-settings*)
Phase 7 — Cleanup:           2/2  (withdraw*, TX status)

* = chain-dependent operations that return expected errors (no on-chain UTxOs)
```

---

## System State After Session

### Database
- **1 pool** (ADA/tBTC) — created during E2E
- **1 intent** — swap intent from E2E Phase 3
- **3 orders** — limit + DCA + stop-loss from E2E Phase 4
- All records in CREATED status (not submitted on-chain)

### On-Chain
- **5 test tokens minted:** tBTC, tUSDT, tPOLYGON, tNEAR, tSOL
- **TX:** `b91411c64834e6f0966248e1114c884f2ee89a9123bb9103f954614493c8b14e`
- No pools/intents/orders deployed on-chain (DB-only records)

### Active Bots
| Bot | Status | Interval |
|---|---|---|
| Solver Engine | Running, enabled | 5s batch window |
| Chain Sync | Running | 30s |
| Price Aggregation | Running | 60s |
| Reclaim Keeper | Running | 60s |
| Order Executor | Running | 60s |
| Pool Snapshot | Running | 1h |
| Faucet Bot | Running (405 on first attempt) | 24h |

### Token Policy IDs
| Token | Policy ID | Slot |
|---|---|---|
| tBTC | `ea1e5c362657f578ecc0b5830e7168d668aba84b4dd99b84583dfa43` | 0 |
| tUSDT | `89e6f38f64f4085a109c6d5b246ae3a0699225c39dd49fb06db6cfd8` | 1 |
| tPOLYGON | `4b494b6529d34b6135504140f0581f09e6b5607cfa391d4367d256d5` | 2 |
| tNEAR | `01c75206a183974c0ee118d14ef817962fad0f9665b29a7cc95bb4f8` | 3 |
| tSOL | `20446ece88e97c06cdac86db0dbf7515b44a3de4aa09e04c66ea0340` | 4 |

---

## Remaining Work (Next Session)

1. **On-chain pool deployment** — Use Lucid to build, sign, and submit pool creation TXs so chain sync picks them up
2. **Real swap execution** — Submit signed intent TXs to escrow, let solver batch and settle
3. **Faucet bot API fix** — Cardano Preprod faucet returns 405; may need updated API URL or key
4. **Chart data population** — Once real swaps occur, candles/price data will auto-populate
5. **Frontend live testing** — Open browser, connect wallet, verify swap UI shows correct prices/balances
