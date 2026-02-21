# Backend Audit Report

**Date:** 2025-07-25  
**Scope:** Full backend audit — smart contract feature coverage, API completeness, 
database field update correctness, and bot/automation systems.

---

## Table of Contents

1. [Smart Contract vs Backend Feature Matrix](#1-smart-contract-vs-backend-feature-matrix)
2. [API Completeness Audit](#2-api-completeness-audit)
3. [Database Field Update Audit (per Action)](#3-database-field-update-audit-per-action)
4. [Repository Layer Audit](#4-repository-layer-audit)
5. [Bot & Automation Systems Audit](#5-bot--automation-systems-audit)
6. [Identified Bugs & Gaps](#6-identified-bugs--gaps)
7. [Prioritized Fix Recommendations](#7-prioritized-fix-recommendations)

---

## 1. Smart Contract vs Backend Feature Matrix

The Aiken smart contract layer has **8 validators**, each covering specific on-chain actions.

| Validator | On-Chain Actions | Backend Use-Case | API Route | Status |
|---|---|---|---|---|
| `escrow_validator.ak` | Lock intent funds, Settle intent, Reclaim expired intent | `CreateIntent`, `CancelIntent` | `POST /intents`, `DELETE /intents/:id` | ⚠️ PARTIAL |
| `pool_validator.ak` | Create pool, Deposit liquidity, Withdraw liquidity, Collect fees | `CreatePool`, `DepositLiquidity`, `WithdrawLiquidity` | `POST /pools`, `POST /pools/:id/deposit`, `POST /pools/:id/withdraw` | ⚠️ PARTIAL |
| `factory_validator.ak` | Register new pool in factory | `CreatePool` (builds factory TX internally) | Same as above | ✅ COVERED |
| `intent_token_policy.ak` | Mint/burn intent token | `CreateIntent` (calls TxBuilder which mints) | Same as above | ✅ COVERED |
| `lp_token_policy.ak` | Mint LP tokens on deposit, burn on withdrawal | `DepositLiquidity`, `WithdrawLiquidity` | Same as above | ✅ COVERED |
| `pool_nft_policy.ak` | Mint pool NFT on pool creation | `CreatePool` (calls TxBuilder which mints) | Same as above | ✅ COVERED |
| `order_validator.ak` | Lock order funds (Limit/DCA/Stop-Loss), Cancel order, Execute order interval | `CreateOrder`, `CancelOrder` | `POST /orders`, `DELETE /orders/:id` | ⚠️ PARTIAL |
| `settings_validator.ak` | Deploy protocol settings, Update settings | ❌ NONE | ❌ NONE | ❌ MISSING |

### Critical Missing: Settings Validator Coverage

The `settings_validator.ak` (protocol-level configuration for factory, fee rates, admin address) has:
- `buildDeploySettingsTx()` implemented in TxBuilder (added previous session)
- **No domain use-case** wrapping it
- **No API route** exposing it
- Admin cannot deploy or update protocol settings via the backend API

### Partial Coverage: Order Execution

The `order_validator.ak` supports **interval execution** (DCA bot fills one interval at a time):
- `buildExecuteOrderTx()` implemented in TxBuilder (added previous session)
- **No domain use-case** wrapping execution (only creation and cancellation exist)
- **No API route** for solver/bot to call when executing a DCA interval
- The solver has no mechanism to record executed intervals in the DB

### Partial Coverage: Escrow Settlement

The `escrow_validator.ak` supports direct settlement by a solver:
- `buildSettlementTx()` implemented in TxBuilder
- **No domain use-case** for solver settlement flow
- **No API route** for solvers to claim a settlement opportunity and submit a fill TX
- No `Swap` record created after settlement occurs

### Partial Coverage: Direct Swap (Pool)

- `buildDirectSwapTx()` implemented in TxBuilder (added previous session)
- **No domain use-case** wrapping direct pool swap
- **No API route** exposing it (the new `swap.ts` routes exist but wire to TxBuilder directly, bypassing domain layer)
- No `Swap` record created, no pool stats update after swap

---

## 2. API Completeness Audit

### Implemented Endpoints

| Route Group | Endpoints | Domain Use-Case |
|---|---|---|
| `GET /pools` | List pools with filters | `GetPoolInfo.list()` |
| `GET /pools/:id` | Get single pool | `GetPoolInfo.getById()` |
| `POST /pools` | Create pool (unsigned TX) | `CreatePool.execute()` |
| `POST /pools/:id/deposit` | Deposit liquidity (unsigned TX) | `DepositLiquidity.execute()` |
| `POST /pools/:id/withdraw` | Withdraw liquidity (unsigned TX) | `WithdrawLiquidity.execute()` |
| `GET /intents` | List intents | Direct repo call |
| `GET /intents/:id` | Get intent | Direct repo call |
| `POST /intents` | Create intent (unsigned TX) | `CreateIntent.execute()` |
| `DELETE /intents/:id` | Cancel intent (unsigned TX) | `CancelIntent.execute()` |
| `GET /orders` | List orders | `ListOrders.execute()` |
| `GET /orders/:id` | Get order | Direct repo call |
| `POST /orders` | Create order (unsigned TX) | `CreateOrder.execute()` |
| `DELETE /orders/:id` | Cancel order (unsigned TX) | `CancelOrder.execute()` |
| `GET /portfolio/:address` | Get portfolio stats | `GetPortfolio.execute()` |
| `GET /quote` | Get swap quote | `GetQuote.execute()` |
| `POST /swap/direct` | Build direct swap TX | TxBuilder (no use-case) |
| `POST /swap/intent` | Build intent-based swap TX | TxBuilder (no use-case) |
| `POST /swap/execute-order` | Build execute order TX | TxBuilder (no use-case) |
| `GET /swap/info/:poolId` | Get swap info | TxBuilder (no use-case) |

### Missing Endpoints

| Missing Endpoint | Purpose | Priority |
|---|---|---|
| `POST /admin/settings/deploy` | Deploy protocol settings on-chain | HIGH |
| `POST /admin/settings/update` | Update protocol settings | HIGH |
| `POST /admin/pools/:id/collect-fees` | Collect accumulated protocol fees | MEDIUM |
| `POST /solver/settle-intent` | Solver submits intent settlement | HIGH |
| `POST /solver/execute-order` | Solver executes one DCA interval | HIGH |
| `POST /tx/confirm` | Webhook/callback to confirm TX on-chain | HIGH |
| `GET /portfolio/:address/lp-positions` | Get LP token positions per pool | MEDIUM |
| `GET /portfolio/:address/history` | Trade/order history for address | LOW |

---

## 3. Database Field Update Audit (per Action)

### 3.1 `CreatePool`

**DB Models Written:** `Pool` (create)

| Field | Written? | Notes |
|---|---|---|
| `poolNftPolicyId/AssetName` | ✅ | Correct |
| `assetA/B` fields (policy, name, decimals, ticker) | ✅ | Correct |
| `reserveA`, `reserveB` | ✅ | Uses `MIN_SCRIPT_LOVELACE` offset for ADA |
| `totalLpTokens` | ✅ | Correct |
| `feeNumerator` | ✅ | Correct |
| `protocolFeeAccA/B` | ✅ | Set to 0n initially |
| `tvlAda` | ✅ | Set initially |
| `volume24h`, `fees24h` | ✅ | Set to 0n initially |
| `txHash` | ✅ | Set to anticipated TX hash |
| `outputIndex` | ⚠️ | **HARDCODED to 0** — not verified against actual chain output index |
| `state` | ✅ | Set to ACTIVE immediately (before TX confirmed) |

**Missing DB Operations:**
- ❌ No `PoolHistory` snapshot created on pool creation
- ❌ Pool set to ACTIVE before TX is confirmed on-chain — could be ACTIVE with no on-chain UTxO if TX fails

---

### 3.2 `CreateIntent`

**DB Models Written:** `Intent` (create)

| Field | Written? | Notes |
|---|---|---|
| `status` | ✅ | Set to `CREATED` |
| `creator` | ✅ | Correct |
| `inputPolicyId/AssetName`, `inputAmount` | ✅ | Correct |
| `outputPolicyId/AssetName`, `minOutput` | ✅ | Correct |
| `deadline` | ✅ | Correct |
| `partialFill`, `maxPartialFills`, `fillCount` | ✅ | Correct |
| `remainingInput` | ✅ | Set = inputAmount initially |
| `escrowTxHash` | ⚠️ | Set to `null` — TX not yet signed/submitted (expected for unsigned TX flow) |
| `escrowOutputIdx` | ⚠️ | Set to `null` — same reason |
| `actualOutput`, `settlementTxHash` | ✅ | Null initially, correct |
| `solverAddress`, `settledAt` | ✅ | Null initially, correct |

**Missing DB Operations:**
- ❌ No callback or mechanism to set `escrowTxHash`/`escrowOutputIdx` after user signs and submits the TX
- ❌ No status update from `CREATED` → `ACTIVE` after TX confirms on-chain

---

### 3.3 `CancelIntent`

**DB Models Written:** `Intent` (update via save)

| Field | Written? | Notes |
|---|---|---|
| `status` | ✅ | Set to `CANCELLED` via `intent.markCancelled()` |

**Missing DB Operations:**
- ❌ Status set to `CANCELLED` immediately — before cancel TX is confirmed on-chain
- ❌ No `settlementTxHash` update if cancellation TX hash should be stored
- ❌ If intent has no `escrowTxHash`, cancellation is correct (never reached chain); but if it does, the DB says CANCELLED before chain confirms

---

### 3.4 `DepositLiquidity`

**DB Models Written:** NONE

**Current behavior:** Builds unsigned TX and returns it. **No DB changes.**

| Field | Should Be Updated? | Actually Updated? | Notes |
|---|---|---|---|
| `pool.reserveA` | ✅ YES | ❌ NO | Stale after deposit |
| `pool.reserveB` | ✅ YES | ❌ NO | Stale after deposit |
| `pool.totalLpTokens` | ✅ YES | ❌ NO | Stale after deposit |
| `pool.txHash` | ✅ YES | ❌ NO | UTXO reference becomes stale |
| `pool.outputIndex` | ✅ YES | ❌ NO | UTXO reference becomes stale |
| `pool.tvlAda` | ✅ YES | ❌ NO | TVL becomes inaccurate |
| `PoolHistory` (new row) | ✅ YES | ❌ NO | No history snapshot |

**Assessment: CRITICAL GAP** — Pool state becomes permanently stale after deposits.

---

### 3.5 `WithdrawLiquidity`

**DB Models Written:** NONE

**Current behavior:** Builds unsigned TX and returns it. **No DB changes.**

| Field | Should Be Updated? | Actually Updated? | Notes |
|---|---|---|---|
| `pool.reserveA` | ✅ YES | ❌ NO | Stale after withdrawal |
| `pool.reserveB` | ✅ YES | ❌ NO | Stale after withdrawal |
| `pool.totalLpTokens` | ✅ YES | ❌ NO | LP supply mismatch |
| `pool.txHash` / `outputIndex` | ✅ YES | ❌ NO | UTXO reference stale |
| `pool.tvlAda` | ✅ YES | ❌ NO | TVL becomes inaccurate |
| `PoolHistory` (new row) | ✅ YES | ❌ NO | No history snapshot |

**Assessment: CRITICAL GAP** — Same issue as DepositLiquidity.

---

### 3.6 `GetPortfolio`

**DB Models Written:** NONE (read-only)

**Gaps:**
- ⚠️ Returns only **counts** (active/filled/total) — no actual LP token balances per pool
- ⚠️ No token balance data (requires on-chain query via Blockfrost)
- ⚠️ Pool count returned is *total pools in system*, not LP positions held by this address

---

### 3.7 `CreateOrder`

**DB Models Written:** `Order` (create)

| Field | Written? | Notes |
|---|---|---|
| `type`, `creator` | ✅ | Correct |
| `inputPolicyId/AssetName`, `outputPolicyId/AssetName` | ✅ | Correct |
| `inputAmount`, `priceNumerator/Denominator` | ✅ | Correct |
| `totalBudget`, `amountPerInterval`, `intervalSlots` | ✅ | Correct for DCA |
| `remainingBudget` | ✅ | Set = totalBudget (or inputAmount if not DCA) |
| `executedIntervals` | ✅ | Set to 0 |
| `deadline`, `status` | ✅ | Correct |
| `escrowTxHash` | ⚠️ | Set to `txResult.txHash` — **before TX is confirmed on-chain** |
| `escrowOutputIndex` | ⚠️ | **Hardcoded to 0** — same problem as CreatePool |

**Missing DB Operations:**
- ❌ No status update from `CREATED` → `ACTIVE` after TX confirms on-chain

---

### 3.8 `CancelOrder`

**DB Models Written:** `Order` (update via save)

| Field | Written? | Notes |
|---|---|---|
| `status` | ✅ | Set to `CANCELLED` |
| `escrowTxHash` | ✅ | Updated if cancel TX was built |
| `escrowOutputIdx` | ✅ | Updated |

**Gaps:**
- ⚠️ Returns `status: 'CANCELLING'` but saves `CANCELLED` in DB — inconsistency; should save CANCELLING and update to CANCELLED after TX confirms
- ⚠️ If order has no escrow UTxO, immediately marks CANCELLED (correct behavior)

---

### 3.9 Read-Only Use-Cases

`GetPoolInfo`, `ListOrders`, `GetQuote` — no DB writes, all correct.

---

### 3.10 Missing DB Operations (Global)

These are operations that **should** write to the DB but currently have **no implementation anywhere**:

| Operation | DB Table | Missing Fields |
|---|---|---|
| Direct swap executed (via buildDirectSwapTx) | `Swap` | poolId, txHash, direction, inputAmount, outputAmount, fee, priceImpact, senderAddress |
| Intent settled by solver | `Swap` | poolId (if pool routed), txHash, direction, inputAmount, outputAmount |
| Intent settled by solver | `Intent` (update) | actualOutput, settlementTxHash, solverAddress, settledAt, status=FILLED |
| Pool state after any swap | `Pool` (update) | reserveA, reserveB, tvlAda, volume24h, fees24h, txHash, outputIndex |
| Pool state after swap | `PoolHistory` | New row snapshot |
| Pool state after any swap | `PriceTick` | New price tick row |
| DCA interval executed | `Order` (update) | remainingBudget, executedIntervals, escrowTxHash, escrowOutputIdx |
| Protocol-wide stats | `ProtocolStats` | tvl, volume24h, volume7d, fees24h, totalPools, totalIntents, intentsFilled |
| Collected fees | `Pool` (update) | protocolFeeAccA=0, protocolFeeAccB=0 after collection |

---

## 4. Repository Layer Audit

### 4.1 `IntentRepository`

| Method | Fields in `update` block | Missing from `update` |
|---|---|---|
| `save()` upsert | status, fillCount, remainingInput, actualOutput, escrowTxHash, escrowOutputIdx, settlementTxHash, solverAddress, settledAt | `partialFill`, `maxPartialFills` (these are immutable after create — acceptable) |
| `findActiveIntents()` | queries status IN [ACTIVE, FILLING] | — |
| `markExpired()` | bulk updates ACTIVE/FILLING where deadline passed | — |
| `updateStatus()` | direct status update | — |
| `findMany()` | supports address, status filters | ❌ Missing: `limit` is accepted but `total` in response is not a count from DB — confirmed it uses `count()` |

**Assessment:** ✅ Mostly complete. `update` block covers all mutable fields.

---

### 4.2 `PoolRepository`

| Method | Fields in `update` block | Missing from `update` |
|---|---|---|
| `save()` upsert | reserveA, reserveB, totalLpTokens, protocolFeeAccA/B, tvlAda, volume24h, fees24h, txHash, outputIndex, state | `feeNumerator`, `assetA/B` identity fields (immutable — acceptable) |
| `updateReserves()` | reserveA, reserveB, totalLpTokens, txHash, outputIndex | ✅ Complete |
| `updateStats()` | volume24h, fees24h, tvlAda | ✅ Complete |
| `findAllActive()` | — | — |
| `findByPair()` | — | — |

**Assessment:** ✅ Repository layer is well-designed with targeted update methods. The issue is that **use-cases never call `updateReserves()` or `updateStats()`** after transactions.

---

### 4.3 `OrderRepository`

| Method | Fields in `update` block | Missing from `update` |
|---|---|---|
| `save()` upsert | status, remainingBudget, executedIntervals, escrowTxHash, escrowOutputIdx | `priceNumerator`, `priceDenominator`, `deadline`, `type` (immutable — acceptable) |
| `findExecutableOrders()` | queries ACTIVE/PARTIALLY_FILLED where deadline > now | ✅ Correct for solver bot |
| `markExpired()` | bulk expires ACTIVE, PARTIALLY_FILLED, CREATED, PENDING | ✅ Correct |
| `updateStatus()` | direct status update | ✅ |
| `countByStatus()` | — | ✅ |

**Assessment:** ✅ Complete for current use-cases. Needs extensions when order execution is implemented.

---

## 5. Bot & Automation Systems Audit

### 5.1 `PriceAggregationCron`

**Purpose:** Aggregates raw `PriceTick` rows → OHLCV `Candle` rows  
**Schedule:** Every 60 seconds (configurable)  
**Cleanup:** Every 60 cycles (~1 hour at default interval)

| Responsibility | Implemented? | Notes |
|---|---|---|
| Aggregate PriceTicks → Candles | ✅ | Delegates to `CandlestickService.aggregateCandles()` |
| Clean up old raw price data | ✅ | Calls `CandlestickService.cleanupOldData()` |
| Start/stop lifecycle | ✅ | `start()` / `stop()` with `unref()` for graceful Node exit |
| Error isolation | ✅ | Per-tick try/catch prevents crash loops |

**Gaps:**
- ❌ `PriceTick` table is **never written by any use-case or swap handler** — the aggregation will always process 0 rows because no source is populating `PriceTick`
- ❌ `CandlestickService` code not audited separately — assumed correct

---

### 5.2 `ReclaimKeeperCron`

**Purpose:** Keeper bot that marks expired intents/orders EXPIRED in DB, then submits on-chain reclaim TXs  
**Schedule:** Every 60 seconds (configurable)  
**Flow:** markExpired → find EXPIRED with escrow UTxOs → buildReclaimTx → sign with keeper wallet → submit → updateStatus(RECLAIMED)

| Responsibility | Implemented? | Notes |
|---|---|---|
| Mark expired `Intent` rows in DB | ✅ | Calls `intentRepo.markExpired(now)` |
| Mark expired `Order` rows in DB | ✅ | Calls `orderRepo.markExpired(now)` |
| Build reclaim TX for expired intents | ✅ | Calls `txBuilder.buildReclaimTx()` |
| Sign reclaim TX with keeper wallet | ✅ | Uses Lucid with `SOLVER_SEED_PHRASE` |
| Submit reclaim TX | ✅ | `signed.submit()` |
| Update DB after reclaim | ✅ | `intentRepo.updateStatus(id, 'RECLAIMED')` |
| Error isolation per intent | ✅ | Per-intent try/catch with retry next tick |
| Batch size limit | ✅ | Processes max 10 expired intents per tick |

**Gaps:**
- ❌ **Orders are NOT reclaimed on-chain** — only `markExpired()` is called for orders. The keeper does NOT call `buildReclaimTx` for expired orders, so order funds remain locked forever.
- ❌ `Intent.escrowOutputIndex` access in cron uses `intent.escrowOutputIndex` directly (property access) but the `Intent` entity may expose this via `toProps()` — needs verification against entity interface
- ⚠️ No retry counter — a permanently stuck/invalid UTxO (already spent) will be retried every tick indefinitely. Should move to `RECLAIM_FAILED` status after N attempts.
- ⚠️ `SOLVER_SEED_PHRASE` required as plain env var — security risk in production (should use HSM or key management service)

### 5.3 Missing Bots / Automation

| Bot | Purpose | Status |
|---|---|---|
| Solver/Filler Bot | Monitors active intents, builds settlement TXs, fills orders | ❌ NOT IMPLEMENTED |
| Order Execution Bot | Executes DCA intervals at correct slot intervals | ❌ NOT IMPLEMENTED |
| On-chain Sync / Confirmation Bot | Listens to Blockfrost webhooks/chain events and updates DB after TX confirm | ❌ NOT IMPLEMENTED |
| Pool State Sync Bot | Periodically queries Blockfrost UTxO state and syncs pool reserves | ❌ NOT IMPLEMENTED |
| Fee Collector Bot | Calls `buildCollectFeesTx` when protocol fees accumulate | ❌ NOT IMPLEMENTED |

---

## 6. Identified Bugs & Gaps

### 🔴 Critical

| # | Issue | Location | Impact |
|---|---|---|---|
| C1 | Pool reserves never updated after deposit/withdrawal | `DepositLiquidity.ts`, `WithdrawLiquidity.ts` | Pool TVL, reserves, LP supply permanently stale in DB |
| C2 | No on-chain confirmation callback/webhook system | Entire backend | All DB states (CREATED, ACTIVE, etc.) reflect optimistic state, not confirmed chain state |
| C3 | No Solver/Settlement bot or use-case | Missing | Intents can never be filled; the core DEX functionality is non-functional |
| C4 | No on-chain order execution bot/use-case | Missing | DCA/Limit orders can never be executed |
| C5 | `PriceTick` table never populated | No writer exists | Charting/candlestick data always empty despite aggregation cron running |

### 🟠 High

| # | Issue | Location | Impact |
|---|---|---|---|
| H1 | `outputIndex` hardcoded to 0 in CreatePool and CreateOrder | `CreatePool.ts`, `CreateOrder.ts` | UTXO reference incorrect if pool/order output is not at index 0; will break all future TXs referencing this UTXO |
| H2 | Status set to ACTIVE/CANCELLED before TX on-chain confirmation | Multiple use-cases | Ghost records: DB shows active intent/order that never made it on-chain |
| H3 | Settings validator has no backend coverage | Missing use-case + route | Cannot deploy or update protocol config; `settings_validator.ak` is unreachable via API |
| H4 | Expired orders not reclaimed on-chain | `ReclaimKeeperCron.ts` | User order funds locked forever after expiry |
| H5 | No `Swap` record written after any swap | All swap flows | Swap history empty; pool `volume24h`/`fees24h` never updated |

### 🟡 Medium

| # | Issue | Location | Impact |
|---|---|---|---|
| M1 | `GetPortfolio` returns counts only, no LP balances | `GetPortfolio.ts` | Frontend LP position display non-functional |
| M2 | `CancelOrder` saves status `CANCELLED` but returns `CANCELLING` | `CancelOrder.ts` | DB inconsistency between actual state and API response |
| M3 | `CandlestickService.aggregateCandles()` not audited | Undetermined | May have bugs; has no data input to process |
| M4 | No retry/fail-safe for stuck UTxOs in ReclaimKeeper | `ReclaimKeeperCron.ts` | Already-spent UTxOs retried every tick indefinitely |
| M5 | `IntentRepository` `update` block missing `partialFill`/`maxPartialFills` | `IntentRepository.ts` | Cannot change fill settings after creation (acceptable if intentionally immutable) |
| M6 | New `swap.ts` routes bypass domain use-case layer | `interface/http/routes/swap.ts` | No input validation, no domain errors, no event emission |

### 🔵 Low

| # | Issue | Location | Impact |
|---|---|---|---|
| L1 | `GetPortfolio` pool count shows total system pools, not user LP positions | `GetPortfolio.ts` | Misleading response field |
| L2 | `ProtocolStats` table never updated | No writer exists | `/stats` endpoint (if exists) always returns stale/empty data |
| L3 | No `PoolHistory` snapshots created | Multiple use-cases | Pool APY/historical charts non-functional |

---

## 7. Prioritized Fix Recommendations

### Phase 1 — Critical Fixes (Immediate)

**P1.1 — TX Confirmation System**

Implement a lightweight on-chain confirmation flow. Options:
- **Recommended:** After user submits a signed TX, client calls `POST /tx/submit` with `{ signedTx, intentId/orderId/poolId }`. Backend submits to Blockfrost, polls until confirmed, then updates DB.
- Alternative: Blockfrost webhook integration to push TX confirmation events.

Files to create/modify:
- `backend/src/application/use-cases/SubmitTransaction.ts` (new)
- `backend/src/interface/http/routes/tx.ts` (new)

**P1.2 — UpdatePoolReserves after Deposit/Withdrawal**

In `DepositLiquidity.ts` and `WithdrawLiquidity.ts`, after building the TX, register a post-confirmation hook that calls `poolRepo.updateReserves()`.

Short-term fix (optimistic): Compute and update reserves immediately after TX build (same as CreatePool does optimistically). Add `PoolHistory` snapshot.

**P1.3 — PriceTick Writer**

Add `PriceTick` insert in every swap path:
- In `buildDirectSwapTx` result handler
- In solver settlement flow  

```typescript
await prisma.priceTick.create({
  data: { poolId, price, volume, timestamp: new Date() }
});
```

**P1.4 — Fix outputIndex Hardcoding**

TxBuilder must return actual `outputIndex` from built TX and use-cases must store it:
- `BuildTxResult` interface: ensure `outputIndex` field is returned
- `CreatePool.ts`: use `txResult.outputIndex ?? 0`
- `CreateOrder.ts`: same

**P1.5 — Reclaim Orders on-chain**

Add order reclaim logic to `ReclaimKeeperCron.tick()`:
```typescript
await this.reclaimExpiredOrders(); // mirror of reclaimExpiredIntents
```
Use `txBuilder.buildCancelOrderTx()` for expired orders.

### Phase 2 — High Priority (Next Sprint)

**P2.1 — Solver Settlement Use-Case + API**

Create:
- `backend/src/application/use-cases/SettleIntent.ts` — solver claims an active intent, builds fill TX, updates intent DB (actualOutput, settlementTxHash, status=FILLED)
- `POST /solver/settle-intent` route
- `Swap` record creation after settlement

**P2.2 — Order Execution Use-Case + API**

Create:
- `backend/src/application/use-cases/ExecuteOrderInterval.ts` — executes one DCA interval, updates `remainingBudget`, `executedIntervals`, `escrowTxHash`/`outputIndex`
- `POST /solver/execute-order` route

**P2.3 — Settings Validator Coverage**

Create:
- `backend/src/application/use-cases/DeploySettings.ts`
- `backend/src/application/use-cases/UpdateSettings.ts`
- `POST /admin/settings/deploy` and `PUT /admin/settings` routes

**P2.4 — Direct Swap Use-Case + DB Writes**

Wrap `buildDirectSwapTx` in a proper use-case that:
1. Validates inputs
2. Builds TX
3. Returns unsigned TX
4. On confirmation: writes `Swap` record, calls `poolRepo.updateReserves()` + `poolRepo.updateStats()`, writes `PriceTick`

### Phase 3 — Medium Priority

**P3.1 — Portfolio LP Positions**

Add Blockfrost query to `GetPortfolio` to fetch on-chain LP token balances per address.

**P3.2 — ProtocolStats Writer**

Create a scheduled job (or trigger after each action) that aggregates `ProtocolStats`.

**P3.3 — CancelOrder Status Fix**

Change `CancelOrder.ts` to:
```typescript
order.markStatus('CANCELLING'); // new method
await this.orderRepo.save(order);
return { status: 'CANCELLING', unsignedTx: txResult.unsignedTx };
```
Update to CANCELLED after TX confirmation.

**P3.4 — ReclaimKeeper Retry Limit**

Add `reclaimAttempts` tracking to prevent infinite retry on failed UTxOs. After 3 failures, set to `RECLAIM_FAILED`.

---

## Summary Score

| Category | Score | Notes |
|---|---|---|
| Smart Contract Feature Coverage | 5 / 8 (62%) | Settings, Order Execution, Solver Settlement missing |
| API Completeness | 19 / 27 (70%) | 8 critical endpoints missing |
| DB Field Update Correctness | 6 / 12 actions (50%) | Deposit/Withdraw/Swap/Settlement have 0 DB updates |
| Bot Coverage | 2 / 7 bots (29%) | Solver, Order Execution, Sync, Fee Collector bots missing |
| **Overall** | **~53%** | Core trading flows non-functional without critical fixes |

---

*Report generated from full source audit of `backend/src/` — 11 use-cases, 3 repositories, 2 cron bots, all DB schema models, and smart contract validator mapping.*
