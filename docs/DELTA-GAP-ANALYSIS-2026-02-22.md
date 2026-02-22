# SolverNet DEX — Comprehensive Audit Cross-Check & Delta/Gap Analysis

**Date:** February 22, 2026  
**Method:** Direct source code inspection — all findings verified against actual files  
**Source Audit:** `COMPREHENSIVE-SYSTEM-AUDIT-2026-02.md` cross-referenced with `SYSTEM-AUDIT-2026-02-FOLLOWUP.md`  
**Codebase state:** Post-sprint remediation (both previous audit cycles applied)

---

## Executive Summary

| Section | Count | Notes |
|---------|-------|-------|
| 🟢 Already Resolved (Collateral Fixes) | **22 issues** | 1 critical, 8 high, 10 medium, 3 low |
| 🔴 Net New / Remaining Issues | **16 issues** | 1 high, 4 medium, 11 low |

**Overall system readiness: 8.5 / 10**  
The system is solid for testnet demo. The single blocking gap before production is the `Swap` table never being written (R-03), which cascades into all analytics volume metrics being permanently zero.

---

## Section 1 — 🟢 Already Resolved (Collateral Fixes)

The following vulnerabilities and gaps from `COMPREHENSIVE-SYSTEM-AUDIT-2026-02.md` have been **verified as fixed** by direct code inspection.

---

### 1.1 Verified from COMPREHENSIVE Audit

| ID | Severity | Issue | Verification Evidence |
|----|----------|-------|-----------------------|
| **B1** | CRITICAL | Settlement TX paid solver instead of owner | `plutusAddressToAddress()` implemented at `TxBuilder.ts:224`; `ownerBech32` used at `TxBuilder.ts:1352`. `ownerPayments` array correctly reconstructs bech32 from Plutus datum. |
| **B17** | MEDIUM | ExecuteOrder TX paid solver instead of owner | Same pattern. `plutusAddressToAddress` called at `TxBuilder.ts:2299` for `buildExecuteOrderTx`. |
| **B3** | HIGH | Settings validator not parameterized | `resolveSettingsScript()` private method at `TxBuilder.ts:536` calls `applyParamsToScript` with `SETTINGS_NFT_POLICY_ID` + `SETTINGS_NFT_ASSET_NAME`. Used at `:1894` (deploy) and `:2407` (update). |
| **B4** | MEDIUM | PoolHistory never populated | `PoolSnapshotCron` writes hourly via `prisma.poolHistory.createMany` at `PoolSnapshotCron.ts:110`; additionally `insertHistory()` called from `SolverEngine.ts:320`, `DepositLiquidity.ts:79`, `WithdrawLiquidity.ts:74` — write side is comprehensive. |
| **B6** | MEDIUM | ProtocolStats never populated | Same `PoolSnapshotCron.updateProtocolStats()` confirmed running; cron started at `index.ts:248`. |
| **B8** | HIGH | SwapCard bypassed `/quote` endpoint | `getQuote()` imported and called at `swap-card.tsx:29,132` with 400ms debounce. Multi-hop routing now surfaced in UI. |
| **B9** | HIGH | Admin auth bypass on error | `catch` block at `admin/layout.tsx:60` now sets `setAuthState("unauthorized")`. Explicit rejection branch at `:54`. No fallthrough to authorized state. |
| **B10** | MEDIUM | Wallet only tracked ADA balance | `parseCborBalance` added to `wallet-provider.tsx:229`; parses full CIP-30 CBOR for multi-asset balances. |
| **B11** | MEDIUM | Dev fallback data in admin pages | Admin `page.tsx` catch sets `setMetrics(null)` — hardcoded mock data removed from all three admin pages. |
| **B12** | MEDIUM | No error boundaries | 6 `error.tsx` files confirmed across: root, admin, analytics, orders, pools, portfolio. |

---

### 1.2 Verified from FULL-AUDIT Report

| ID | Severity | Issue | Verification Evidence |
|----|----------|-------|-----------------------|
| **B1-FULL** | CRITICAL | SolverEngine used UTxO ref instead of UUID for `updateStatus` | `findByUtxoRef()` called at `SolverEngine.ts:147` to resolve DB intent id before any status write. |
| **B2-FULL** | CRITICAL | ChainSync passed policyId as bech32 address to Blockfrost | `getUtxosByAsset()` method added to `BlockfrostClient`; `ChainSync.ts:62` uses it. |
| **B3-FULL** | HIGH | Deposit/Withdraw didn't update pool reserves in DB | Both use-cases call `poolRepo.updateReserves()` post-TX build (optimistic update). Confirmed in `DepositLiquidity.ts` and `WithdrawLiquidity.ts`. |
| **B4-FULL** | MEDIUM | CancelOrder returned CANCELLING but saved CANCELLED | `CancelOrder` now consistently returns and writes `CANCELLED`. Confirmed via grep — no mismatch. |
| **B5-FULL** | HIGH | `CandlestickService.recordTickAndUpdateCandles` never called | Called at `SolverEngine.ts:275` after successful settlement confirmation. Guarded by `candlestickService &&` check. |
| **B7-FULL** | MEDIUM | Expired orders not reclaimed on-chain | `reclaimExpiredOrders()` method at `ReclaimKeeperCron.ts:229`; cron started at `index.ts:225`. |
| **B8-FULL** | MEDIUM | SolverEngine marked FILLING before TX build | TX built first; FILLING set only after successful build at `SolverEngine.ts:185`. Comment at `:170` documents B8 fix explicitly. |
| **B9-FULL** | MEDIUM | `routes/index.ts` only exported 6 of 11 routers | Comment `// B9 fix: Add missing router exports` at `routes/index.ts:7`; all 11 routers confirmed exported. |

---

### 1.3 Collateral Fixes Found in This Scan (Not in Either Previous Audit)

These were discovered as fixed in the current codebase without being listed in the original audit reports as resolved:

| ID | Severity | Issue | Verification Evidence |
|----|----------|-------|-----------------------|
| **R-07** | LOW | `lpPolicyId` missing from Pool schema | `lpPolicyId String? @db.VarChar(64)` found at `schema.prisma:81`. Populated in `CreatePool.ts:103` via `txResult.poolMeta?.lpPolicyId`. **Fully resolved.** |
| **R-04** | MEDIUM | `execute-order` didn't update `remainingBudget`/`executedIntervals` | `OrderExecutorCron` (at `index.ts:237`) calls `order.recordExecution()` at `OrderExecutorCron.ts:261` after on-chain confirmation. Decrements `remainingBudget`, increments `executedIntervals` at `:269-270`. The use-case sets optimistic `PENDING` while the cron provides confirmation-gated DB truth. **Fully resolved.** |
| **Partial fill (orders)** | HIGH | `buildExecuteOrderTx` had no partial fill branch | Partial fill branch implemented at `TxBuilder.ts:2314-2354`. When `!isCompleteFill`, reconstructs updated order datum with new `remaining_budget` and `last_fill_slot`, re-outputs order UTxO to contract. **Fixed for `order_validator`. Still missing for `escrow_validator` — see R-01.** |
| **useWebSocket hook** | LOW | WebSocket hook entirely absent | `useWebSocket` hook defined at `hooks.ts:313`, imports and uses `createWsConnection`. Backend WebSocket broadcasts confirmed in `SolverEngine.ts` for intents and pool state. Hook exists but **not yet consumed by any component** (R-09). |

---

## Section 2 — 🔴 Net New / Remaining Issues (Action Required)

All issues below were verified as **not fixed** through direct file inspection. Organized by priority.

---

### CRITICAL — None

No critical issues remain.

---

### HIGH Priority

---

#### **R-01 [HIGH] — Partial fill support for escrow intents still not implemented**

**File:** `backend/src/infrastructure/cardano/TxBuilder.ts:1300`  
**Direct evidence:**
```typescript
const inputConsumed = remainingInput; // Complete fill
```
The `buildSettlementTx()` always performs a complete fill. The Aiken `escrow_validator.Fill` redeemer supports partial fills with a continuation escrow UTxO (updated `fill_count` + `remaining_input` datum, 10% minimum threshold). No backend branch creates this continuation UTxO.

**Note:** Partial fill for *orders* (`buildExecuteOrderTx`) IS now implemented (see Section 1.3). The gap is specifically in *intent settlement* (escrow UTxOs processed by the solver engine batch loop).

**Next step:** Add a partial fill branch in `buildSettlementTx()` analogous to the one at `TxBuilder.ts:2314-2354`. When pool liquidity cannot cover the full `remainingInput`, calculate `inputConsumed` as partial, create a continuation escrow UTxO with updated datum, and send only the partial output to the owner.

**Estimate:** 1 sprint

---

### MEDIUM Priority

---

#### **R-02 [MEDIUM] — `GET /pools/:id/history` still generates random placeholder data**

**File:** `backend/src/interface/http/routes/pools.ts:164-187`  
**Direct evidence:**
```typescript
// Generate placeholder history based on current state
// In production, this would query a pool_snapshots table
const factor = 0.8 + Math.random() * 0.4;  // ← still running in production
```
The write side is now comprehensive: `PoolSnapshotCron`, `insertHistory()` called from `SolverEngine`, `DepositLiquidity`, and `WithdrawLiquidity` all write real rows to `PoolHistory`. However, the **read path** was never updated. Every API call to this endpoint discards all real data and returns noise.

**Fix:**
```typescript
const history = await prisma.poolHistory.findMany({
  where: { poolId, timestamp: { gte: new Date(Date.now() - days * 86_400_000) } },
  orderBy: { timestamp: 'asc' },
});
return res.json({ poolId, history: history.map(h => ({ ... })) });
```
**Estimate:** 30 minutes

---

#### **R-03 [MEDIUM] — `Swap` table is never written — zero rows in all environments**

**Files:** All of `backend/src/**` — grep for `prisma.swap.create` returns **0 matches**  
**Only match:** `prisma.swap.aggregate` in `PoolSnapshotCron.ts:146` — reads from a permanently empty table.

**Cascading failures caused by R-03:**
- `ProtocolStats.volume7d` — aggregated from `Swap` table → always `0` (R-16)
- `ProtocolStats.uniqueTraders` — counted from `Swap.senderAddress` → always `0`
- `Pool.protocolFeeAccA/B` columns — never incremented per-swap
- Per-user swap history — no data source

**Fix:** In `SolverEngine.settleBatch()` post-confirmation block (around `:280`), insert one record per settled intent:
```typescript
await this.prisma.swap.create({
  data: {
    poolId: batch.poolId,
    txHash: submitResult.txHash,
    direction: batch.direction ?? 'AToB',
    inputAmount: intent.inputAmount,
    outputAmount: computedOutput,
    fee: protocolFee,
    priceImpact: 0,
    senderAddress: intent.owner,
    intentId: intentId,
  },
});
```
**Estimate:** 2 hours

---

#### **R-05 [MEDIUM] — No API endpoint for factory deployment**

**Files:** All route files — grep for `buildDeployFactoryTx` or `admin/factory/build-deploy` → **0 matches**  
Factory bootstrap is only possible via `deploy-factory.ts` CLI script using Lucid directly, requiring Node server access. This is a blocker for repeatable testnet/mainnet deployments and admin UI-driven bootstrap.

**Fix:** Add `POST /v1/admin/factory/build-deploy` in `routes/admin.ts`, call `txBuilder.buildDeployFactoryTx()` (or create it if absent), gate behind `checkAdminAuth` middleware.

**Estimate:** 3 hours

---

#### **R-06 [MEDIUM] — Portfolio LP positions always empty**

**File:** `backend/src/interface/http/routes/portfolio.ts:331-340`  
**Direct evidence:**
```typescript
// Placeholder: In production, scan wallet UTxOs for LP token policy IDs
// Future: check if wallet holds LP tokens for this pool
```
Also: `locked_in_lp: 0` hardcoded at `:132` in portfolio summary.

**Note:** R-07 (lpPolicyId schema field) is now **fixed** — `lpPolicyId` exists in the `Pool` model and is populated on CreatePool. The blocker for reading LP balances is now purely implementation (Blockfrost wallet UTxO scan for LP token assets). The schema gap is gone.

**Fix:** Query Blockfrost for `walletAddress` UTxOs; parse native assets; match `policyId` of each `AssetClass` against `pool.lpPolicyId` across all active pools.

**Estimate:** 4 hours

---

### LOW Priority

---

#### **R-08 [LOW] — `CancelIntent` saves CANCELLED to DB but returns `CANCELLING` in API response**

**File:** `backend/src/application/use-cases/CancelIntent.ts:40-44`  
**Direct evidence:**
```typescript
intent.markCancelled();         // writes CANCELLED to DB
await this.intentRepo.save(intent);
return { ..., status: 'CANCELLING' };  // but tells consumer "CANCELLING"
```
Intent is marked CANCELLED in DB when unsigned TX is returned. If user never signs/submits, the intent stays CANCELLED in DB but remains spendable on-chain. Compare with `CancelOrder` (B4-FULL) which was fixed in the previous cycle — `CancelIntent` was NOT corrected.

**Fix:** Save `CANCELLING` (not `CANCELLED`) in `markCancelled()` at TX-build time. Update to `CANCELLED` only after TX confirmation via `POST /tx/confirm` hook.

---

#### **R-09 [LOW] — WebSocket hook exists but is consumed by zero React components**

**File:** `frontend/src/lib/hooks.ts:313` — `useWebSocket()` hook defined and functional  
**Evidence:** Grep across all `frontend/src/**/*.tsx` for `useWebSocket` → **0 matches**

The backend already broadcasts events via WebSocket: `wsServer.broadcastIntent()` and `wsServer.broadcastPool()` are called in `SolverEngine.ts`. The hook infrastructure is wired on the frontend side, but no component subscribes to it.

All real-time data (order fills, pool price updates) is delivered through 10–30 second polling intervals.

**Fix:** Wire `useWebSocket()` into the trading page or orders list component to receive push events and trigger React Query invalidations.

---

#### **R-10 [LOW] — Token registry hardcoded with test policy IDs**

**File:** `frontend/src/lib/mock-data.ts`  
13 tokens defined with `policyId` values like `test000...0001`. Pools created with tokens not in this static list will display as "Unknown Token" in the selector.

**Fix:** Add `GET /v1/tokens` endpoint returning distinct `assetA`/`assetB` pairs from active pools; replace `TOKEN_LIST` with a dynamic fetch.

---

#### **R-11 [LOW] — Test scripts default to production URL**

**File:** `frontend/scripts/src/shared.ts:7`  
```typescript
const API_BASE = process.env.API_BASE || 'https://tdexms.onrender.com';
```
Local development without `API_BASE` env var silently hits production. A one-line fix.

**Fix:** Change default to `'http://localhost:3001'`.

---

#### **R-12 [LOW] — Token analytics endpoint hardcodes zeros**

**File:** `backend/src/interface/http/routes/analytics.ts:71-73`  
```typescript
price: 0,
priceChange24h: 0,
volume24h: 0,
```
`GET /analytics/tokens/:assetId` returns zeros unconditionally for every token even when active pools exist. The analytics page token cards are permanently empty.

**Fix:** Query pool by `assetId` (match against `assetAPolicy`/`assetBPolicy`); compute current price from `reserveA`/`reserveB`; query `Candle` table for 24h price change; read `Pool.volume24h` for volume.

---

#### **R-13 [LOW] — `outputIndex: 0` hardcoded in `CreatePool`**

**File:** `backend/src/application/use-cases/CreatePool.ts:101`  
`outputIndex: 0` saved at creation time. ChainSync corrects this within ~30 seconds (B2-FULL fix), but there is a window where UTxO references are wrong. Acceptable given ChainSync mitigation.

---

#### **R-14 [LOW] — Domain use-cases missing for settings management routes**

**Files:** `routes/admin.ts` settings endpoints call `deps.txBuilder.*` directly  
`ExecuteOrderUseCase` was added (closing one of the G2/G3/G4 FULL gaps), but settings routes (`build-update-factory`, `build-update-settings`) still bypass the domain layer entirely. Input validation and domain error types are absent.

---

#### **R-15 [LOW] — Volume tracking assumes AToB direction in SolverEngine**

**File:** `backend/src/solver/SolverEngine.ts:311`  
```typescript
pool.volume24h + batch.totalInputAmount,  // assumes input is always assetA
```
For B→A batches, volume is denominated in `assetB` units but added to `volume24h` which tracks in `assetA` units. Minor inaccuracy for non-ADA base pair pools.

---

#### **R-16 [LOW] — `ProtocolStats.volume7d` always 0 (depends on R-03)**

**File:** `backend/src/infrastructure/cron/PoolSnapshotCron.ts:142-146`  
```typescript
const volume7dResult = await this.prisma.swap.aggregate({ _sum: { inputAmount: true } });
```
Since `Swap` table has zero rows (R-03), this aggregate always returns `null` → `0`. Automatically resolved when R-03 is fixed.

---

#### **R-17 [LOW] — No solver status monitoring page in admin UI**

No admin page shows solver queue depth, last settlement TX hash, batch success/failure rate, or solver on/off status. Solver can only be triggered via `admin-trigger-solver.ts` CLI.

---

#### **R-18 [LOW] — No DCA execution progress widget**

No component on orders page or portfolio page shows `executedIntervals / totalIntervals` for DCA orders. Even though `OrderExecutorCron` now correctly updates these fields (R-04 fixed), the UI has no widget to surface this data.

---

## Section 3 — Priority Fix Plan

### Sprint 1 — Testnet blockers

| Priority | ID | Description | Estimate |
|----------|----|-------------|----------|
| 1 | R-02 | Replace `Math.random()` in pool history route with real `PoolHistory` query | 30 min |
| 2 | R-03 | Add `prisma.swap.create()` in `SolverEngine.settleBatch()` per settled intent | 2h |
| 3 | R-08 | Fix `CancelIntent` to write `CANCELLING` (not `CANCELLED`) until TX confirmed | 30 min |
| 4 | R-11 | Change test script default URL to `localhost:3001` | 5 min |

### Sprint 2 — Pre-production

| Priority | ID | Description | Estimate |
|----------|----|-------------|----------|
| 5 | R-06 | Implement real LP balance lookup via Blockfrost (lpPolicyId now available) | 4h |
| 6 | R-12 | Fix token analytics endpoint to return real price/volume from pool + candle data | 2h |
| 7 | R-05 | Add `POST /admin/factory/build-deploy` endpoint | 3h |
| 8 | R-01 | Implement partial fill branch in `buildSettlementTx()` | 1 sprint |

### Sprint 3 — Polish

| Priority | ID | Description | Estimate |
|----------|----|-------------|----------|
| 9 | R-09 | Wire `useWebSocket()` hook into trading/orders components | 3h |
| 10 | R-10 | Replace hardcoded token registry with `GET /v1/tokens` API | 2h |
| 11 | R-15 | Fix volume direction assumption in SolverEngine | 30 min |
| 12 | R-14 | Add domain use-cases for settings management routes | 4h |
| 13 | R-17 | Add solver status monitoring panel to admin UI | 4h |
| 14 | R-18 | Add DCA progress widget to orders/portfolio pages | 2h |
| 15 | R-13 | Resolve `outputIndex: 0` hardcode (ChainSync mitigation acceptable) | 1h |

---

## Section 4 — Updated Readiness Matrix

| Category | Previous Score | Current Score | Delta | Notes |
|----------|---------------|---------------|-------|-------|
| Smart Contracts | 10/10 | 10/10 | — | All validators complete, no changes needed |
| Backend TX Coverage | 9/10 | 9/10 | — | 15/16 TX types; factory deploy API still missing |
| Backend Correctness | 9/10 | 9/10 | — | B1/B3/B17 critical bugs fixed; partial fill (intents) still absent |
| Database Pipeline | 7/10 | **7.5/10** | ↑ | `lpPolicyId` now persisted; `insertHistory` multi-source write; Swap table still empty |
| Frontend Coverage | 9/10 | 9/10 | — | All major flows implemented |
| Frontend Security | 9/10 | 9/10 | — | Auth bypass fixed; error boundaries in all routes |
| Real-time UX | 4/10 | 5/10 | ↑ | Backend WS broadcasts confirmed; frontend hook defined but not wired |
| Test Script Coverage | 9/10 | 9/10 | — | 40 scripts; production URL default still unfixed |
| **Overall Readiness** | **8.5/10** | **8.5/10** | — | **Ready for testnet. R-02 and R-03 must be fixed before production data quality is acceptable.** |

---

## Section 5 — Full Issue Tracker

| ID | Severity | Status | Layer | Description |
|----|----------|--------|-------|-------------|
| B1 | CRITICAL | ✅ FIXED | TxBuilder | Settlement TX pays solver instead of owner |
| B1-FULL | CRITICAL | ✅ FIXED | SolverEngine | UTxO ref used for DB `updateStatus` |
| B2-FULL | CRITICAL | ✅ FIXED | ChainSync | policyId passed as bech32 to Blockfrost |
| B3 | HIGH | ✅ FIXED | TxBuilder | Settings validator not parameterized |
| B5-FULL | HIGH | ✅ FIXED | SolverEngine | CandlestickService never called |
| B8 | HIGH | ✅ FIXED | Frontend | SwapCard bypassed /quote |
| B9 | HIGH | ✅ FIXED | Frontend | Admin auth bypass on error |
| B3-FULL | HIGH | ✅ FIXED | Use-Cases | Deposit/Withdraw didn't update pool reserves |
| B-partial-order | HIGH | ✅ FIXED | TxBuilder | No partial fill branch in `buildExecuteOrderTx` |
| B4 | MEDIUM | ✅ FIXED | Cron | PoolHistory never written |
| B6 | MEDIUM | ✅ FIXED | Cron | ProtocolStats never written |
| B10 | MEDIUM | ✅ FIXED | Frontend | Wallet only tracked ADA balance |
| B11 | MEDIUM | ✅ FIXED | Frontend | Dev fallback data in admin pages |
| B12 | MEDIUM | ✅ FIXED | Frontend | No error boundaries |
| B17 | MEDIUM | ✅ FIXED | TxBuilder | ExecuteOrder paid solver instead of owner |
| B4-FULL | MEDIUM | ✅ FIXED | Use-Cases | CancelOrder CANCELLED/CANCELLING mismatch |
| B7-FULL | MEDIUM | ✅ FIXED | Cron | Expired orders not reclaimed on-chain |
| B8-FULL | MEDIUM | ✅ FIXED | SolverEngine | FILLING set before TX build succeeded |
| B9-FULL | MEDIUM | ✅ FIXED | Routes | `routes/index.ts` missing router exports |
| R-04 | MEDIUM | ✅ FIXED | Cron | Order `remainingBudget`/`executedIntervals` not updated |
| R-07 | LOW | ✅ FIXED | Database | `lpPolicyId` missing from Pool schema |
| R-01 | HIGH | 🔴 OPEN | TxBuilder | Partial fill support for escrow intents (buildSettlementTx) |
| R-02 | MEDIUM | 🔴 OPEN | Routes | `/pools/:id/history` reads random data, ignores PoolHistory table |
| R-03 | MEDIUM | 🔴 OPEN | SolverEngine | `Swap` table never written (`prisma.swap.create` = 0 matches) |
| R-05 | MEDIUM | 🔴 OPEN | Routes | No API endpoint for factory deployment |
| R-06 | MEDIUM | 🔴 OPEN | Routes | Portfolio LP positions always empty |
| R-08 | LOW | 🔴 OPEN | Use-Cases | CancelIntent writes CANCELLED but returns CANCELLING |
| R-09 | LOW | 🔴 OPEN | Frontend | `useWebSocket` hook defined but not consumed by any component |
| R-10 | LOW | 🔴 OPEN | Frontend | Token registry hardcoded with test policyIds |
| R-11 | LOW | 🔴 OPEN | Scripts | `shared.ts` defaults to production URL |
| R-12 | LOW | 🔴 OPEN | Routes | Token analytics endpoint hardcodes zeros |
| R-13 | LOW | 🔴 OPEN | Use-Cases | `outputIndex: 0` hardcoded in CreatePool/CreateOrder |
| R-14 | LOW | 🔴 OPEN | Architecture | No domain use-cases for settings management |
| R-15 | LOW | 🔴 OPEN | SolverEngine | Volume tracking assumes AToB direction |
| R-16 | LOW | 🔴 OPEN | Analytics | `ProtocolStats.volume7d` always 0 (depends on R-03) |
| R-17 | LOW | 🔴 OPEN | Frontend | No solver status monitoring page in admin UI |
| R-18 | LOW | 🔴 OPEN | Frontend | No DCA execution progress widget |

**Resolved: 21 issues** | **Open: 16 issues** — 1 HIGH · 4 MEDIUM · 11 LOW

---

*Report generated by direct source code inspection — February 22, 2026*
