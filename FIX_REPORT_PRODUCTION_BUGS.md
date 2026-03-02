# Production Bug Fix Report

**Date:** 2025-01-XX  
**Scope:** Backend SolverEngine, ReclaimKeeper, Frontend Chart/TokenSelect/LP/Caching  
**Build Status:** ✅ Backend passes | ✅ Frontend passes

---

## Summary

Fixed **7 critical production issues** across backend (4 fixes) and frontend (6 fixes) that were causing:
- Intents stuck as FILLING forever (never recovered)
- Expired intents not cleaned up promptly (3-hour delay)
- Validator crash blacklist permanent with no TTL
- Chart loading very slow (excessive refetching)
- Token select showing "no pool" for valid pairs (tBTC/tUSD policyId collision)
- LP Position page showing phantom positions for users without deposits
- Overall slow UX due to aggressive cache invalidation

---

## Backend Fixes

### B1 — FILLING Intent Timeout Recovery (Critical)
**File:** `backend/src/solver/SolverEngine.ts`  
**Root Cause:** When a settlement TX was submitted but `awaitTx` timed out (180s), the intent was marked `FILLING` with `settlementTxHash` saved. Every subsequent 15-second iteration skipped it with "awaiting on-chain confirmation" — **forever**. No timeout, no re-check.

**Fix:** Added a 10-minute timeout (`FILLING_TIMEOUT_MS`). After 10 minutes, the solver queries the escrow address on-chain:
- If the escrow UTxO is **still present** → TX failed → revert intent to `ACTIVE` for retry
- If the escrow UTxO is **consumed** → TX likely confirmed → let ChainSync finalize

```typescript
private static readonly FILLING_TIMEOUT_MS = 10 * 60_000;
```

Also added `getEscrowAddress()` getter to `IntentCollector` for the on-chain check.

### B2 — Validator Crash Blacklist TTL (High)
**File:** `backend/src/solver/SolverEngine.ts`  
**Root Cause:** After 3 validator crashes for a specific escrow UTxO, it was **permanently blacklisted** in-memory for the entire process lifetime. If crashes were caused by transient state (stale pool reserves, race condition), the intent was stuck ACTIVE with no recovery short of restarting the backend.

**Fix:** Added a 30-minute TTL to the crash blacklist. After 30 minutes, the crash count is cleared and the intent can be retried.

```typescript
private readonly validatorCrashTimestamps = new Map<string, number>();
private static readonly VALIDATOR_CRASH_TTL_MS = 30 * 60_000;
```

### B3 — ReclaimKeeper Interval & Batch Size (High)
**Files:** `backend/src/index.ts`, `backend/src/infrastructure/cron/ReclaimKeeperCron.ts`  
**Root Cause:** 
- ReclaimKeeper ran every **3 hours** — expired intents waited hours for on-chain reclaim
- Only **10 intents per tick** were processed — if 50 expire, it takes 15 hours

**Fix:**
- Reduced ReclaimKeeper interval from **3h → 5min**
- Increased batch size from **10 → 50**
- Reduced GhostCleanup interval from **3h → 30min**

### B4 — Profitability Skip Log Visibility (Medium)
**File:** `backend/src/solver/SolverEngine.ts`  
**Root Cause:** When intents were skipped due to insufficient solver profit (< 0.1 ADA), the log was at `debug` level — invisible in production. Operators couldn't see why intents sat ACTIVE.

**Fix:** Upgraded profitability skip logs from `debug` to `info` level with `minRequired` field for clarity.

---

## Frontend Fixes

### F1 — Chart Loading Performance (Critical)
**Files:** `frontend/src/lib/hooks.ts`, `frontend/src/providers/global-ws-provider.tsx`

**Root Causes (6 bottlenecks):**
1. `cache: "no-store"` on every fetch — forced full round-trip, no HTTP 304
2. Global `staleTime: 5000ms` — chart data re-fetched every 5 seconds
3. WebSocket `poolUpdate` invalidated candle cache — every pool reserve change triggered chart refetch
4. `initialData: []` — prevented loading skeleton, staleTime counted from mount time

**Fixes:**
1. Changed `cache: "no-store"` → `cache: "no-cache"` in `api.ts` (allows 304 conditional requests)
2. Added `staleTime: 5 * 60_000` (5 min) to `useCandles` hook
3. Removed `getChartCandles` invalidation from WS `poolUpdate` handler
4. Changed `initialData: []` → `placeholderData: []` (proper loading state)
5. Added `staleTime: 30_000` (30s) to `usePrice` hook

### F2 — Global Stale Time Too Aggressive (High)
**File:** `frontend/src/providers/query-provider.tsx`

**Root Cause:** Global `staleTime: 5000ms` meant ALL queries were considered stale after 5 seconds, making `refetchInterval` values (15s, 30s, 60s) ineffective — React Query always refetched on focus/mount.

**Fix:** Increased global staleTime from **5s → 30s**. Hooks requiring tighter freshness (usePrice: 30s, useCandles: 5min) override with their own staleTime.

### F3 — Token Select "No Pool" Bug (High)
**File:** `frontend/src/components/features/wallet/token-select.tsx`

**Root Cause:** `matchesPaired()` matched tokens by `policyId` only. tBTC and tUSD share the same policyId (`a257a1387d2908c0823a776bc4638ab42217e4682bcd416df0d139de`) — so selecting tBTC showed ALL tokens as "has pool" when only some have actual tBTC pools.

**Fix:** Changed matching to use **composite key** (policyId + assetName) with ticker fallback:
```typescript
if (asset.policyId === pairedWith.policyId && asset.assetName === pairedWith.assetName) return true;
```

Also:
- Added `assetName` to `availablePools` prop type
- Increased `usePools` limit from 50 → 100 (matches dialog's internal fetch)

### F4 — LP Position Phantom Entries (High)
**File:** `frontend/src/app/portfolio/page.tsx`

**Root Cause:** Backend `/portfolio/liquidity` returns metadata for ALL active pools regardless of user. When `hasRealLpData` was false (no on-chain LP positions found), the UI fell through to the "legacy" rendering path that displayed ALL pools as LP positions — showing phantom entries with `lp_balance: undefined`, `share_percent: undefined`.

**Fix:** 
- Filter legacy positions to only show entries with `lp_balance > 0`
- Tab count now uses filtered count, not total pool count
```typescript
const realLegacyPositions = positions.filter((p) => p.lp_balance > 0);
const lpTabCount = hasRealLpData ? lpPositions.length : realLegacyPositions.length;
```

### F5 — Portfolio History Flash-Load (Medium)
**File:** `frontend/src/lib/hooks.ts`

**Root Cause:** `usePortfolioHistory` used `initialData: []` which prevented loading skeleton display.

**Fix:** Changed to `placeholderData: []`.

---

## Timing Configuration Summary (Post-Fix)

| Component | Before | After | Impact |
|---|---|---|---|
| ReclaimKeeper interval | 3 hours | 5 minutes | Expired intents reclaimed 36× faster |
| ReclaimKeeper batch | 10 per tick | 50 per tick | 5× throughput per tick |
| GhostCleanup interval | 3 hours | 30 minutes | Ghost records cleaned 6× faster |
| FILLING timeout | ∞ (never) | 10 minutes | Stuck intents self-recover |
| Validator crash blacklist | Permanent | 30 min TTL | Transient crash recovery |
| Global staleTime | 5 seconds | 30 seconds | 6× fewer refetches |
| Chart staleTime | 5 seconds | 5 minutes | 60× fewer chart refetches |
| Price staleTime | 5 seconds | 30 seconds | 6× fewer price refetches |
| Chart WS invalidation | Every pool update | None (uses refetchInterval) | Eliminates redundant refetches |
| HTTP cache | `no-store` | `no-cache` | Allows 304 conditional responses |

---

## Files Modified

### Backend (4 files)
1. `backend/src/solver/SolverEngine.ts` — FILLING timeout, crash TTL, profitability logs
2. `backend/src/solver/IntentCollector.ts` — Added `getEscrowAddress()` getter
3. `backend/src/index.ts` — ReclaimKeeper 5min, GhostCleanup 30min
4. `backend/src/infrastructure/cron/ReclaimKeeperCron.ts` — Batch size 50

### Frontend (5 files)
1. `frontend/src/lib/api.ts` — `cache: "no-cache"`
2. `frontend/src/lib/hooks.ts` — staleTime, placeholderData, pool limit
3. `frontend/src/providers/query-provider.tsx` — Global staleTime 30s
4. `frontend/src/providers/global-ws-provider.tsx` — Remove candle invalidation
5. `frontend/src/components/features/wallet/token-select.tsx` — Composite key matching
6. `frontend/src/app/portfolio/page.tsx` — Filter phantom LP positions

---

## Remaining Recommendations

1. **TX Queue Priority:** Consider adding priority lanes to `TxSubmitter` so solver settlement TXs are processed before demo bot TXs
2. **`SOLVER_MIN_PROFIT_LOVELACE`:** Current value 100,000 (0.1 ADA) may be too high for small swaps — consider reducing to 10,000 (0.01 ADA)
3. **Bot impact:** `BOT_SWAP_ENABLED` and `BOT_LIQUIDITY_ENABLED` are both true — demo bots compete for the same TX queue, potentially delaying real settlements
4. **PoolSnapshot cron:** Currently set to `12 * 3_600_000` (12 hours) in `index.ts` comment says "every hour" — verify intended interval
