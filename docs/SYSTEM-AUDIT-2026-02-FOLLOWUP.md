# SolverNet DEX — Follow-up System Audit Report

**Date:** February 22, 2026  
**Scope:** Full re-scan of codebase post-remediation (backend · frontend · smart contracts · DB schema · test scripts)  
**Based on:** Cross-referencing `COMPREHENSIVE-SYSTEM-AUDIT-2026-02.md` + `FULL-SYSTEM-AUDIT-REPORT.md` against actual source code  
**Method:** Direct code inspection — not inferred from documentation

---

## Executive Summary

| Layer | Previous Score | Current Score | Delta |
|-------|---------------|---------------|-------|
| Smart Contracts | 10/10 | 10/10 | — |
| Backend TxBuilder | 9/10 | 9/10 | — |
| Backend Solver / Services | 8/10 | **8.5/10** | ↑ |
| Database Coverage | 9/10 | **8.5/10** | ↓ (new issues found) |
| Frontend | 9/10 | 9/10 | — |
| Test Scripts | 9/10 | 9/10 | — |
| **Overall** | **9/10** | **9/10** | — |

**Issues confirmed fixed: 18**  
**Issues still outstanding: 18** (1 high, 6 medium, 11 low)  
**New issues discovered in this scan: 7** (not listed in previous audits)

---

## Part 1 — Confirmed Fixed Issues

The following items from both previous audit reports were verified as correctly resolved in code:

| ID | Severity | Description | Verified Fix |
|----|----------|-------------|--------------|
| B1 (COMPREHENSIVE) | CRITICAL | Settlement TX pays solver instead of owner | `plutusAddressToAddress()` added; `ownerPayments` uses reconstructed bech32 address at **TxBuilder.ts:1352** |
| B1 (FULL AUDIT) | CRITICAL | SolverEngine uses UTxO ref instead of UUID for `updateStatus` | `findByUtxoRef()` called at **SolverEngine.ts:146** to resolve DB id before any status update |
| B3 (COMPREHENSIVE) | HIGH | Settings validator not parameterized | `resolveSettingsScript()` private method at **TxBuilder.ts:536** applies `SETTINGS_NFT_POLICY_ID` via `applyParamsToScript` |
| B17 (COMPREHENSIVE) | MEDIUM | ExecuteOrder pays solver not owner | Owner reconstructed from order datum at **TxBuilder.ts:2299**, paid at line 2312 |
| B4 (COMPREHENSIVE) | MEDIUM | PoolHistory never populated | `PoolSnapshotCron.ts` created; started in `index.ts:222` at 1-hour interval; writes via `prisma.poolHistory.createMany` |
| B6 (COMPREHENSIVE) | MEDIUM | ProtocolStats never populated | Same `PoolSnapshotCron.updateProtocolStats()` writes a stats snapshot every hour |
| B8 (COMPREHENSIVE) | HIGH | SwapCard bypasses `/quote` | `getQuote()` called with 400ms debounce at **swap-card.tsx:132**; falls back to local calc on failure |
| B9 (COMPREHENSIVE) | HIGH | Admin auth bypass on error | `catch` block at **admin/layout.tsx:56** now sets `setAuthState("unauthorized")` |
| B10 (COMPREHENSIVE) | MEDIUM | Wallet only tracks ADA balance | `nativeBalances` state added at **wallet-provider.tsx:229**; `parseCborBalance` parses multi-asset CBOR |
| B11 (COMPREHENSIVE) | MEDIUM | Dev fallback data in admin pages | Admin `page.tsx` catch sets `setMetrics(null)` — no hardcoded fallback data |
| B12 (COMPREHENSIVE) | MEDIUM | No error boundaries | 6 `error.tsx` files confirmed: root, admin, analytics, orders, pools, portfolio |
| B2 (FULL) | CRITICAL | ChainSync passes policyId as Bech32 address to Blockfrost | `getUtxosByAsset()` method added to `BlockfrostClient`; `ChainSync.ts:62` uses it |
| B3 (FULL) | HIGH | Deposit/Withdraw don't update pool reserves in DB | Both use-cases call `poolRepo.updateReserves()` after TX build (optimistic update) |
| B4 (FULL) | MEDIUM | CancelOrder saves CANCELLED but returns CANCELLING | Both DB and API response now consistently return `CANCELLED` |
| B5 (FULL) | HIGH | `CandlestickService.recordTickAndUpdateCandles` never called | SolverEngine calls it post-settlement at **SolverEngine.ts:247** |
| B7 (FULL) | MEDIUM | Expired orders not reclaimed on-chain | `reclaimExpiredOrders()` method added to `ReclaimKeeperCron.ts:213` |
| B8 (FULL) | MEDIUM | SolverEngine marks FILLING before TX build succeeds | TX built first; FILLING set only after successful build at **SolverEngine.ts:184** |
| B9 (FULL) | MEDIUM | routes/index.ts barrel only exports 6 of 11 routers | All 11 routers now exported (B9 fix comment at line 7 of `routes/index.ts`) |

---

## Part 2 — Outstanding Issues (Not Yet Fixed)

### 2.1 HIGH Priority

---

#### **R-01 [HIGH] — Partial fill support still not implemented**
*Carried from B2 (COMPREHENSIVE)*

**Files:** `backend/src/infrastructure/cardano/TxBuilder.ts` — `buildSettlementTx()`  
**Status:** Settlement still always performs complete fill (`inputConsumed = remainingInput`).  
**Impact:** The Aiken `escrow_validator.Fill` supports partial fills with a continuation UTxO carrying updated `fill_count` and `remaining_input` in the datum — the closest to a 10% minimum fill threshold. No backend branch creates this continuation UTxO. Intents can never be partially filled regardless of available pool liquidity.  
**What is needed:** A partial fill branch that creates a new escrow UTxO with updated datum when the pool cannot cover the full input amount.

---

### 2.2 MEDIUM Priority

---

#### **R-02 [MEDIUM] — `GET /pools/:id/history` returns random simulated data, NOT PoolHistory table**

**File:** `backend/src/interface/http/routes/pools.ts` lines 164–187  
**Status:** Despite `PoolSnapshotCron` now correctly writing hourly snapshots to the `PoolHistory` table (B4 fix), the route handler still generates random placeholder data:
```typescript
// Generate placeholder history based on current state
// In production, this would query a pool_snapshots table
const factor = 0.8 + Math.random() * 0.4;  // <- still running in "production"
```
The write side was fixed; the read side was not updated.  
**Impact:** The `GET /pools/:id/history` endpoint — consumed by pool charts and the analytics page — always returns fabricated data with random ±20% noise. Real PoolHistory data written by `PoolSnapshotCron` is permanently silently discarded by this route.  
**Fix:** Replace the placeholder generation loop with:
```typescript
const history = await prisma.poolHistory.findMany({
  where: { poolId, timestamp: { gte: new Date(Date.now() - days * 86_400_000) } },
  orderBy: { timestamp: 'asc' },
});
```

---

#### **R-03 [MEDIUM] — `Swap` table is NEVER written anywhere in the codebase**

**Files:** All of `backend/src/**` — no `prisma.swap.create()` call exists  
**Status:** The `Swap` model is fully defined in `schema.prisma` (lines 118–135) with `poolId`, `txHash`, `direction`, `inputAmount`, `outputAmount`, `fee`, `priceImpact`, `senderAddress`, `intentId`. Not a single service, route handler, or cron job writes to it.  
**Cascading impact:**
- `ProtocolStats.volume7d` — set by `PoolSnapshotCron` via `prisma.swap.aggregate(...)` — will always be `0`
- `ProtocolStats.uniqueTraders` — set via `prisma.swap.findMany({ distinct: ['senderAddress'] })` — will always be `0` (analytics route partially mitigates this by counting distinct intent creators instead)
- `Pool.protocolFeeAccA/B` — never incremented (tracked separately)
- Any future per-user swap history feature has no data source

**Note:** Price ticks ARE written via `CandlestickService` (B5 fix), so charts work. But the `Swap` table specifically remains permanently empty.  
**Fix:** In `SolverEngine.settleBatch()`, after successful TX submission, insert one Swap record per intent:
```typescript
await prisma.swap.create({
  data: {
    poolId: batch.poolId,
    txHash: submitResult.txHash,
    direction: 'AToB', // or resolve from batch
    inputAmount: batch.totalInputAmount,
    outputAmount: batch.totalOutputAmount,
    fee: 0n,
    priceImpact: 0,
    senderAddress: intent.owner, // from datum
    intentId: intentId,
  },
});
```

---

#### **R-04 [MEDIUM] — `POST /solver/execute-order` does not update Order state in DB**

**File:** `backend/src/interface/http/routes/swap.ts` lines 60–105  
**Status:** The route calls `txBuilder.buildExecuteOrderTx()` and returns the unsigned TX but does NOT update the `Order` record in DB. Specifically:
- `Order.remainingBudget` is never decremented after a DCA interval executes
- `Order.executedIntervals` is never incremented
- `Order.status` stays `ACTIVE` indefinitely  

**Impact:** DCA orders appear to never execute from the DB/frontend perspective regardless of how many on-chain executions happen. Portfolio "DCA progress" always shows 0/N intervals.  
**Fix:** After building the TX, call `orderRepo.updateStatus()` or a new `orderRepo.recordExecution()` method that decrements `remainingBudget` and increments `executedIntervals`.

---

#### **R-05 [MEDIUM] — Factory deployment has no API endpoint**

*Carried from B16 (COMPREHENSIVE) / G8 (FULL)*

**Status:** No `POST /admin/factory/build-deploy` route exists. Factory bootstrap is only possible via the local `deploy-factory.ts` CLI script which uses Lucid directly, requiring direct access to the server's Node environment.  
**Impact:** Cannot bootstrap a new factory on a fresh deployment via the admin UI or REST API. This is a blocker for repeatable testnet/mainnet deployments.  
**Fix:** Add a protected `POST /v1/admin/factory/build-deploy` endpoint that calls `txBuilder.buildDeployFactoryTx()` (or creates one if it doesn't exist). Gate behind admin auth.

---

#### **R-06 [MEDIUM] — Portfolio LP positions always empty**

*Carried from G9 (FULL) / G15 (FULL)*

**File:** `backend/src/interface/http/routes/portfolio.ts` lines 320–410  
**Status:** `GET /portfolio/liquidity` has a comment: *"Placeholder: In production, scan wallet UTxOs for LP token policy IDs"* / *"Future: check if wallet holds LP tokens for this pool"*. The handler never queries LP balances; it returns an array of all active pools with 0 LP amounts for every entry.  
**Additionally:** Portfolio summary route hardcodes `locked_in_lp: 0` at line 132.  
**Impact:** Users cannot see their LP positions. The liquidity tab on the portfolio page is permanently blank data.  
**Fix:** Query Blockfrost for wallet UTxOs, parse native assets, and match against each pool's LP policy ID. Requires `lpPolicyId` to be resolved — see R-07.

---

### 2.3 LOW Priority

---

#### **R-07 [LOW] — `lpPolicyId` column missing from Pool schema**

*Carried from B7 (COMPREHENSIVE)*

**File:** `backend/prisma/schema.prisma`  
**Status:** The `Pool` model does not have an `lpPolicyId` field. The LP token policy ID is derivable at runtime by parameterizing `lp_token_policy` with `[poolHash, factoryHash]`, but this requires TxBuilder instantiation on every lookup.  
**Impact:** Blocks a clean implementation of R-06 (LP portfolio query). Makes it harder for frontends to verify LP ownership.  
**Fix:** Add `lpPolicyId String? @db.VarChar(64)` to the `Pool` model and populate it during `CreatePool`.

---

#### **R-08 [LOW] — `CancelIntent` DB/API status mismatch**

**File:** `backend/src/application/use-cases/CancelIntent.ts` lines 40–46  
**Status:** 
```typescript
intent.markCancelled();          // writes CANCELLED to DB
await this.intentRepo.save(intent);
return { status: 'CANCELLING' }; // but tells API consumer "CANCELLING"
```
The intent is already CANCELLED in the DB when the unsigned TX is returned. If the user never signs or submits the TX, the intent stays CANCELLED in DB but remains spendable on-chain. Compare with `CancelOrder` which was fixed (B4 FULL) to be consistent — CancelIntent was not corrected in that fix cycle.  
**Impact:** Inconsistency between DB state and on-chain state. An intent can be "CANCELLED" in DB but still active on-chain if the user abandons signing.  
**Fix:** Save `CANCELLING` (not `CANCELLED`) to DB on TX build. Update to `CANCELLED` only after the TX is confirmed via `POST /tx/confirm`.

---

#### **R-09 [LOW] — WebSocket not connected to any React component**

*Carried from B13 (COMPREHENSIVE)*

**File:** `frontend/src/lib/api.ts` lines 371–374  
**Status:** `createWsConnection()` is defined but no component in `frontend/src/components/**` or `frontend/src/app/**` calls it. All real-time data is polled via `setInterval` at 10–30 second intervals.  
**Impact:** Reduced UX responsiveness. Settlement events are not pushed to the UI; users must wait for the next polling cycle to see filled intents.

---

#### **R-10 [LOW] — Token registry hardcoded with test policy IDs**

*Carried from B14 (COMPREHENSIVE)*

**File:** `frontend/src/lib/mock-data.ts`  
**Status:** 13 tokens defined with policyIds like `test000...0001`. New pools with tokens not in this static list display as unknown in the token selector.  
**Impact:** Users cannot trade tokens from newly created pools until the registry is updated in source code.  
**Fix:** Add a `GET /v1/tokens` endpoint that returns known tokens from pool `assetA`/`assetB` fields; replace `TOKEN_LIST` with a dynamic fetch.

---

#### **R-11 [LOW] — Frontend test scripts default to production URL**

*Carried from B15 (COMPREHENSIVE)*

**File:** `frontend/scripts/src/shared.ts` line 7  
**Status:**
```typescript
const API_BASE = process.env.API_BASE || 'https://tdexms.onrender.com';
```
Local testing without `API_BASE` env var silently hits production.  
**Fix:** Change default to `'http://localhost:3001'`.

---

#### **R-12 [LOW] — Token analytics endpoint always returns zeros**

**File:** `backend/src/interface/http/routes/analytics.ts` lines 57–85  
**Status:** `GET /analytics/tokens/:assetId` returns `price: 0`, `priceChange24h: 0`, `volume24h: 0` unconditionally for every token, even when active pools exist for that token.  
**Impact:** Analytics page cannot show meaningful per-token stats.  
**Fix:** Query the pool containing the asset, read `reserveA`/`reserveB` for current price, and query `Candle` table for 24h price change and `Pool.volume24h` for volume.

---

#### **R-13 [LOW] — `CreatePool` and `CreateOrder` hardcode `outputIndex: 0`**

*Carried from B6 (FULL) — partially mitigated by ChainSync fix*

**Files:** `backend/src/application/use-cases/CreatePool.ts:101`, `CreateOrder.ts`  
**Status:** Both use-cases save `outputIndex: 0` to DB at creation time. ChainSync now corrects this within 30 seconds (ChainSync B2 fix confirmed working), but there is a ~30s window where UTxO references are incorrect. If ChainSync encounters a Blockfrost rate limit during that window, the stale index persists longer.

---

#### **R-14 [LOW] — No domain use-cases for direct swap, execute-order, and settings management**

*Carried from G2/G3/G4 (FULL)*

**Files:** `swap.ts` — `POST /swap/build`, `POST /solver/execute-order`; `admin.ts` — settings routes  
**Status:** These routes call `txBuilder.*` directly without going through a domain use-case. Input validation, domain error types, and event bus hooks are all absent.  
**Impact:** Architectural inconsistency; harder to add cross-cutting concerns (audit logging, validation) to these flows.

---

#### **R-15 [LOW] — `SolverEngine` direction assumption when updating pool volume**

**File:** `backend/src/solver/SolverEngine.ts` line 281  
**Status:**
```typescript
await this.poolRepo.updateStats(
  pool.id,
  pool.volume24h + batch.totalInputAmount,  // assumes A→B always
  pool.fees24h,
  pool.tvlAda,
);
```
`batch.totalInputAmount` is always in units of `assetA` regardless of actual swap direction. For B→A batches, volume is tracked in the wrong asset denomination.  
**Impact:** Minor volume accounting inaccuracy for non-ADA base pair pools.

---

#### **R-16 [LOW] — `ProtocolStats.volume7d` always 0**

*Caused by R-03 (Swap table never written)*

**File:** `backend/src/infrastructure/cron/PoolSnapshotCron.ts` line 142–146  
**Status:**
```typescript
const volume7dResult = await this.prisma.swap.aggregate({ ... _sum: { inputAmount: true } });
```
Since no Swap records are ever inserted (R-03), this aggregate always returns `null` → `0`.  
**Impact:** 7-day volume is always 0 on the analytics overview.

---

#### **R-17 [LOW] — No admin UI for solver status monitoring**

*Carried from G17 (FULL)*

**Status:** There is no page in the admin section showing solver queue depth, last settlement TX hash, batch success/failure rate, or solver engine on/off status. The admin can only trigger the solver via `admin-trigger-solver.ts` CLI script (which is also read-only — see B10 note in test scripts).

---

#### **R-18 [LOW] — No DCA order execution progress widget**

*Carried from G18 (FULL)*

**Status:** The orders page and portfolio page have no component showing `executedIntervals / totalIntervals` for DCA orders. Even if R-04 is fixed, the UI still won't surface this data.

---

## Part 3 — New Issues Found (Not in Previous Audits)

The following issues were discovered in this scan that were not listed in either previous report:

| ID | Severity | Layer | Description |
|----|----------|-------|-------------|
| **N-01** | MEDIUM | Backend | `GET /pools/:id/history` generates random placeholder data instead of querying the `PoolHistory` table that `PoolSnapshotCron` now populates → tracked as R-02 above |
| **N-02** | MEDIUM | Backend | `Swap` table has zero rows in all environments — no writer exists → tracked as R-03 above |
| **N-03** | MEDIUM | Backend | `POST /solver/execute-order` doesn't update `Order.remainingBudget` or `Order.executedIntervals` → tracked as R-04 above |
| **N-04** | LOW | Backend | `CancelIntent` marks CANCELLED in DB but returns `status: 'CANCELLING'` in API response → tracked as R-08 above |
| **N-05** | LOW | Backend | `/analytics/tokens/:assetId` hardcodes `price: 0`, `priceChange24h: 0`, `volume24h: 0` for every token → tracked as R-12 above |
| **N-06** | LOW | Backend | `locked_in_lp: 0` hardcoded in `/portfolio/summary` route → tracked as R-06 above |
| **N-07** | LOW | Backend | Volume tracking in `SolverEngine` assumes AToB direction for all batches → tracked as R-15 above |

---

## Part 4 — Prioritized Fix Plan

### Sprint 1 — Blockers (before testnet demo)

| Priority | ID | Description | Estimate |
|----------|----|-------------|----------|
| 1 | R-02 | Fix `GET /pools/:id/history` to query PoolHistory table | 30 min |
| 2 | R-03 | Add `prisma.swap.create()` in SolverEngine after settlement | 2h |
| 3 | R-04 | Update Order DB state in `execute-order` route | 1h |
| 4 | R-08 | Fix CancelIntent to save CANCELLING (not CANCELLED) until TX confirmed | 30 min |

### Sprint 2 — Pre-production

| Priority | ID | Description | Estimate |
|----------|----|-------------|----------|
| 5 | R-05 | Add `POST /admin/factory/build-deploy` API endpoint | 3h |
| 6 | R-07 | Add `lpPolicyId` to Pool schema + populate on CreatePool | 1h |
| 7 | R-06 | Implement real LP balance lookup in portfolio/liquidity | 4h |
| 8 | R-12 | Fix token analytics endpoint to return real price/volume data | 2h |
| 9 | R-01 | Implement partial fill support in TxBuilder | 1 sprint |

### Sprint 3 — Polish

| Priority | ID | Description | Estimate |
|----------|----|-------------|----------|
| 10 | R-09 | Wire WebSocket to React components | 3h |
| 11 | R-10 | Replace hardcoded token registry with dynamic API | 2h |
| 12 | R-11 | Fix test script default URL to localhost | 5 min |
| 13 | R-13 | Resolve outputIndex hardcode (or accept ChainSync mitigation) | 1h |
| 14 | R-14 | Add domain use-cases for direct swap and execute-order | 4h |
| 15 | R-15 | Fix volume direction assumption in SolverEngine | 30 min |
| 16 | R-17 | Add solver status panel in admin UI | 4h |
| 17 | R-18 | Add DCA progress widget on orders/portfolio page | 2h |

---

## Part 5 — Issue Summary Table

| ID | Severity | Layer | Description | In Previous Audit? |
|----|----------|-------|-------------|-------------------|
| R-01 | HIGH | Backend TxBuilder | Partial fill support not implemented | B2 COMPREHENSIVE |
| R-02 | MEDIUM | Backend Routes | `/pools/:id/history` returns random placeholder, ignores PoolHistory table | **NEW** |
| R-03 | MEDIUM | Backend Solver | `Swap` table never written — no `prisma.swap.create()` anywhere | B5 COMPREHENSIVE (partial) |
| R-04 | MEDIUM | Backend Routes | execute-order doesn't update `Order.remainingBudget`/`executedIntervals` | G3 FULL (partial) |
| R-05 | MEDIUM | Backend Routes | Factory deploy has no API endpoint | B16 COMPREHENSIVE |
| R-06 | MEDIUM | Backend Routes | Portfolio LP positions always empty (`locked_in_lp: 0` hardcoded) | G9 FULL |
| R-07 | LOW | Database | `lpPolicyId` missing from Pool schema | B7 COMPREHENSIVE |
| R-08 | LOW | Backend Use-case | CancelIntent saves CANCELLED in DB but returns CANCELLING in API | **NEW** |
| R-09 | LOW | Frontend | WebSocket not wired to any component (all data is polled) | B13 COMPREHENSIVE |
| R-10 | LOW | Frontend | Token registry hardcoded with test policyIds | B14 COMPREHENSIVE |
| R-11 | LOW | Scripts | `shared.ts` defaults to production URL instead of localhost | B15 COMPREHENSIVE |
| R-12 | LOW | Backend Routes | Token analytics always returns zeros | **NEW** |
| R-13 | LOW | Backend Use-case | `outputIndex: 0` hardcoded in CreatePool / CreateOrder | B6 FULL |
| R-14 | LOW | Architecture | No domain use-cases for swap, execute-order, settings | G2/G3/G4 FULL |
| R-15 | LOW | Backend Solver | Volume tracking assumes AToB direction | **NEW** |
| R-16 | LOW | Backend Analytics | `volume7d` always 0 (depends on R-03) | **NEW** |
| R-17 | LOW | Frontend Admin | No solver status/monitoring page in admin UI | G17 FULL |
| R-18 | LOW | Frontend | No DCA execution progress widget | G18 FULL |

**Total remaining: 18 issues** — 1 HIGH · 5 MEDIUM · 12 LOW

---

## Part 6 — Updated Readiness Assessment

| Category | Score | Notes |
|----------|-------|-------|
| Contract completeness | 10/10 | All validators compiled, no changes needed |
| Backend TX coverage | 9/10 | 15/16 TX types (missing factory deploy API) |
| Backend correctness | 9/10 | Critical B1/B3/B17 fixed; partial fills still missing |
| Database pipeline | **7/10** | Swap table never written (R-03) undermines analytics and ProtocolStats volume7d |
| Frontend coverage | 9/10 | All major flows implemented |
| Frontend security | 9/10 | Auth bypass fixed; error boundaries in place |
| Test script coverage | 9/10 | 40 scripts, excellent E2E coverage |
| **Overall readiness** | **8.5/10** | LP portfolio, Swap records, and pool history route still need work before production |

---

*Report generated by direct source code inspection — February 22, 2026*
