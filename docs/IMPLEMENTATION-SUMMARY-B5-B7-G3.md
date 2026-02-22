# Implementation Summary — Tasks B5, B7, G3

> Date: 2026-02  
> Scope: `backend/src/`  
> Status: ✅ COMPLETE

---

## Overview

Three critical fixes were applied to enforce the **DB-after-confirmation rule**:

> **CRITICAL RULE**: Database state MUST only be updated AFTER an on-chain transaction is successfully confirmed. A transaction appearing in the mempool (accepted) is NOT the same as being confirmed in a block. Updating the DB on mempool acceptance risks DB/chain divergence when the TX is dropped, rolled back, or replaced.

---

## Task B7 — ReclaimKeeperCron: Await Confirmation Before DB Update

**File**: `backend/src/infrastructure/cron/ReclaimKeeperCron.ts`

### Problem

`reclaimSingle()` and `reclaimExpiredOrders()` both called `intentRepo.updateStatus()` / `orderRepo.updateStatus()` immediately after `signed.submit()` returned a txHash. This is a mempool-acceptance point, not on-chain confirmation. If the TX was later dropped or rolled back, the DB would show the intent/order as RECLAIMED/CANCELLED while the funds were never actually reclaimed.

### Fix

Both methods now call `lucid.awaitTx(submittedHash, 120_000)` (120-second timeout) after submission and **before** any DB write:

```typescript
const submittedHash = await signed.submit();

// CRITICAL RULE: await on-chain confirmation before updating DB
const confirmed = await lucid.awaitTx(submittedHash, 120_000);
if (!confirmed) {
  // Log warning — TX did not appear on-chain in time
  // DB is NOT updated — will retry on next tick
  return; // or `continue` in the loop
}

// Only here do we mark the intent/order as RECLAIMED/CANCELLED
await intentRepo.updateStatus(intent.id, 'RECLAIMED');
```

In `reclaimExpiredOrders()`, the loop uses `continue` (not `return`) so remaining orders are still processed when one TX times out.

---

## Task B5 — SolverEngine: Await Confirmation Before All Post-Settlement DB Writes

**File**: `backend/src/solver/SolverEngine.ts`

### Problem

In `settleBatch()`, after `chainProvider.submitTx()` returned `accepted: true`, the code immediately proceeded to:
- Mark all batch intents as FILLED
- Broadcast via WebSocket
- Record price tick (CandlestickService)
- Update pool reserves in DB

All of this happened on mempool acceptance, before the TX was confirmed in a block.

### Fix

After `submitTx()` returns `accepted: true`, an `awaitTx` call is now inserted:

```typescript
const confirmed = await this.chainProvider.awaitTx(submitResult.txHash, 120_000);
if (!confirmed) {
  // Revert all intents from FILLING → ACTIVE
  for (const intent of batch.intents) {
    await this.intentRepo.updateStatus(intent.id, 'ACTIVE');
  }
  return; // no DB writes
}

// "TX confirmed on-chain — updating DB"
// THEN: all post-settlement DB writes (FILLED, broadcast, price tick, pool reserves)
```

On timeout, the intents are reset to ACTIVE so the solver can pick them up again on the next batch window. No partial DB writes occur.

---

## Task G3 — OrderExecutorCron: New DCA Interval Executor Bot

**Files changed/created**:
- `backend/src/domain/entities/Order.ts` — two new domain methods
- `backend/src/infrastructure/cron/OrderExecutorCron.ts` — new file
- `backend/src/index.ts` — wired in

### Motivation

DCA (Dollar-Cost Averaging) orders were stored in the DB but never actually executed on-chain. No cron existed to check whether a DCA order's next interval had elapsed and fire the execution TX.

### Domain Methods Added to `Order.ts`

#### `isDcaIntervalRipe(nowMs?: number): boolean`

Returns `true` when enough wallclock time has elapsed for the order's next DCA interval.

```
ripeCriteria: Date.now() >= createdAt + (executedIntervals + 1) * intervalSlots * 1000
```

`1 Cardano slot ≈ 1 second`, so `intervalSlots` directly maps to seconds.

#### `recordExecution(): void`

Called ONLY after on-chain TX confirmation. Updates the entity's state:
- Deducts `amountPerInterval` from `remainingBudget`
- Increments `executedIntervals` 
- Sets `status = 'FILLED'` when `remainingBudget` reaches 0
- Sets `status = 'PARTIALLY_FILLED'` otherwise

### `OrderExecutorCron` Architecture

```
tick() every 60s:
  1. findMany({ status: 'ACTIVE',           type: 'DCA', limit: 5 })
  2. findMany({ status: 'PARTIALLY_FILLED', type: 'DCA', limit: 5 })
  3. Merge + deduplicate
  4. filter: order.isDcaIntervalRipe()
  5. For each ripe order:
     a. Resolve pool via poolRepo.findByPair(inputAssetId, outputAssetId)
     b. buildExecuteOrderTx({ solverAddress, orderUtxoRef, poolUtxoRef })
     c. Sign via keeper wallet (same SOLVER_SEED_PHRASE as reclaim keeper)
     d. submit → lucid.awaitTx(txHash, 120_000)
     e. ON CONFIRMATION ONLY:
        - order.recordExecution()
        - orderRepo.save(order)         ← upserts all DCA fields
```

Asset IDs follow the internal format: `'lovelace'` for ADA, `'policyId.assetName'` for native tokens.

### index.ts Changes

```typescript
import { OrderExecutorCron } from './infrastructure/cron/OrderExecutorCron.js';

const orderExecutorCron = new OrderExecutorCron(
  orderRepo, poolRepo, txBuilder,
  env.SOLVER_SEED_PHRASE,
  env.BLOCKFROST_URL, env.BLOCKFROST_PROJECT_ID,
  env.CARDANO_NETWORK === 'mainnet' ? 'Mainnet' : 'Preprod',
  60_000,
);

// In start section:
orderExecutorCron.start();

// In shutdown handler:
orderExecutorCron.stop();
```

---

## Files Changed Summary

| File | Change |
|------|--------|
| `backend/src/infrastructure/cron/ReclaimKeeperCron.ts` | `reclaimSingle()` + `reclaimExpiredOrders()` — inserted `lucid.awaitTx` before DB writes (B7) |
| `backend/src/solver/SolverEngine.ts` | `settleBatch()` — inserted `chainProvider.awaitTx` + revert-on-timeout logic (B5) |
| `backend/src/domain/entities/Order.ts` | Added `recordExecution()` and `isDcaIntervalRipe()` methods (G3 prep) |
| `backend/src/infrastructure/cron/OrderExecutorCron.ts` | **NEW FILE** — DCA interval executor bot (G3) |
| `backend/src/index.ts` | Import, instantiate, start, and stop `OrderExecutorCron` |

---

## Key Design Decisions

### Why `orderRepo.save()` instead of a new `updateDcaProgress()` method?

`IOrderRepository` already exposes `save(order: Order)` which upserts the full entity. Adding a narrow `updateDcaProgress()` method would require interface changes and a new Prisma query. Using `save()` with the domain entity updated via `recordExecution()` is both simpler and more consistent with the existing pattern.

### Why keep both ACTIVE and PARTIALLY_FILLED in the query?

An order whose first interval fires transitions from ACTIVE → PARTIALLY_FILLED. Subsequent intervals start from PARTIALLY_FILLED. Both statuses must be queried; otherwise, only the first interval of each order would ever execute.

### Why `lucid.awaitTx` with 120_000ms?

Cardano Preprod and Mainnet target ~20s block times. 120 seconds (6 blocks) provides sufficient margin for propagation and confirmation without blocking the cron tick indefinitely. Orders that miss the confirmation window automatically retry on the next cron tick.

---

## Sequence Diagram — DCA Execution

```
OrderExecutorCron          TxBuilder           Cardano Chain          DB
      |                        |                     |                  |
      |-- findMany(DCA) ------>|                     |                  |
      |<-- [ripe orders] ------|                     |                  |
      |                        |                     |                  |
      |-- buildExecuteOrderTx->|                     |                  |
      |<-- unsignedTx ---------|                     |                  |
      |                        |                     |                  |
      |-- sign + submit -------------------------------->               |
      |<-- txHash ----------------------------------------             |
      |                        |                     |                  |
      |-- awaitTx(txHash, 120s)------------------>  | (wait for block) |
      |<-- confirmed = true ----------------------- |                  |
      |                        |                     |                  |
      |-- order.recordExecution()                   |                  |
      |-- orderRepo.save(order) ---------------------------------------->
      |                        |                     |                  |
      |    [DB updated: remainingBudget--, executedIntervals++, status] |
```

---

*End of implementation summary.*
