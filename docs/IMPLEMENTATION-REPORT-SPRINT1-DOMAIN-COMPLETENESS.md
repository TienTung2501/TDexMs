# Implementation Report — Sprint 1: Domain Completeness & API Enrichment

> **Date:** February 22, 2026  
> **Sprint scope:** Tasks 1–4 based on `SYSTEM-AUDIT-2026-02-FOLLOWUP.md`  
> **TypeScript:** `npx tsc --noEmit` exits 0 — zero compile errors  
> **DB migration:** `prisma db push` — `lpPolicyId` column added to `pools` table

---

## Summary of Changes

| Task | Audit Ref | Status | Files Changed |
|------|-----------|--------|---------------|
| 1 — PoolHistory per liquidity event | R-02 (write), B3 follow-up | ✅ Done | `DepositLiquidity.ts`, `WithdrawLiquidity.ts`, `IPoolRepository.ts`, `PoolRepository.ts` |
| 2 — Domain use-cases for solver routes | R-14, G1–G4 | ✅ Done | NEW: `SettleIntentUseCase.ts`, `ExecuteOrderUseCase.ts`, `UpdateSettingsUseCase.ts`; refactored: `swap.ts`, `app.ts`, `index.ts` |
| 3 — Real LP balance in portfolio | R-06, R-07 | ✅ Done | `schema.prisma`, `Pool.ts`, `PoolRepository.ts`, `CreatePool.ts`, `GetPortfolio.ts` |
| 4 — Pool state WebSocket events | G8, G11 | ✅ Done | `DepositLiquidity.ts`, `WithdrawLiquidity.ts`, `SolverEngine.ts`, `index.ts` |

---

## Task 1 — PoolHistory Snapshot per Liquidity Event

### Problem (R-02 partial)

`PoolSnapshotCron` writes hourly PoolHistory snapshots correctly, but liquidity events (deposit/withdraw) produce no snapshot. This means the chart data between hourly marks is blind to large liquidity moves.

### Fix

**`IPoolRepository`** — added new method:

```typescript
insertHistory(params: {
  poolId: string;
  reserveA: bigint;
  reserveB: bigint;
  tvlAda: bigint;
  volume: bigint;
  fees: bigint;
  price: number;
}): Promise<void>;
```

**`PoolRepository`** — implementation using `prisma.poolHistory.create()`.

**`DepositLiquidity.execute()`** — after `poolRepo.updateReserves()`:

```typescript
await this.poolRepo.insertHistory({
  poolId: pool.id,
  reserveA: newReserveA,
  reserveB: newReserveB,
  tvlAda: pool.tvlAda,
  volume: pool.volume24h,
  fees: pool.fees24h,
  price: newReserveA / newReserveB,   // spot price at event time
});
```

Same pattern applied to **`WithdrawLiquidity.execute()`**.

**`SolverEngine.settleBatch()`** — also calls `insertHistory()` after each confirmed settlement, creating a snapshot at every swap as well (combines with Task 4 to give the densest history coverage possible).

### Result

Every deposit, withdrawal, and settlement now produces a `PoolHistory` row. The `GET /pools/:id/history` route (R-02 read-side, still outstanding) can now return real data instead of random placeholder values.

---

## Task 2 — Proper Domain Use-Cases for Solver Routes

### Problem (R-14, G1–G4)

`POST /solver/fill-intent`, `POST /solver/execute-order`, and `POST /admin/settings/build-deploy` all called `iTxBuilder.*` directly in route handlers — no input validation, no domain error types, no clear contracts.

### New Use-Cases Created

#### `SettleIntentUseCase` (`application/use-cases/SettleIntentUseCase.ts`)

- Accepts `{ intentIds, poolUtxoRef, solverAddress }`
- Resolves each DB UUID `→` validates existence + settleable status (`ACTIVE | FILLING`)
- Confirms each intent has an on-chain escrow UTxO recorded
- Calls `txBuilder.buildSettlementTx()` with the resolved UTxO refs
- Returns `{ unsignedTx, txHash, estimatedFee, intentCount }`

#### `ExecuteOrderUseCase` (`application/use-cases/ExecuteOrderUseCase.ts`)

- Accepts `{ orderId, poolUtxoRef, solverAddress }`
- Validates order exists + is `ACTIVE | PARTIALLY_FILLED` + has on-chain escrow UTxO
- For DCA orders: checks `order.isDcaIntervalRipe()` (reuses domain method from last sprint)
- Calls `txBuilder.buildExecuteOrderTx()` 
- Optimistically sets status to `PENDING` so the UI shows progress
- Returns `{ unsignedTx, txHash, estimatedFee, orderId, orderType, remainingBudget, executedIntervals }`

#### `UpdateSettingsUseCase` (`application/use-cases/UpdateSettingsUseCase.ts`)

- Accepts `{ adminAddress, protocolFeeBps, minPoolLiquidity, nextVersion, mode }`
- `mode: 'deploy'` → `txBuilder.buildDeploySettingsTx()` (initial bootstrap)
- `mode: 'update'` → `txBuilder.buildUpdateSettingsTx()` (subsequent changes)
- Validates admin address is non-empty, fee BPS in 0–10000
- Returns `{ unsignedTx, txHash, estimatedFee, mode }`

### Route Refactoring (`swap.ts`)

`createSwapRouter(txBuilder)` → `createSwapRouter({ settleIntent, executeOrder, updateSettings })`

New routes:
| Route | Before | After |
|-------|--------|-------|
| `POST /solver/fill-intent` | `txBuilder.buildSettlementTx` (direct) | `settleIntentUseCase.execute()` |
| `POST /solver/execute-order` | `txBuilder.buildExecuteOrderTx` (direct) | `executeOrderUseCase.execute()` |
| `POST /admin/settings/build-deploy` | `txBuilder.buildDeploySettingsTx` (direct) | `updateSettingsUseCase.execute({ mode:'deploy' })` |
| `POST /admin/settings/build-update` | **did not exist** | `updateSettingsUseCase.execute({ mode:'update' })` |

### Wiring

`app.ts` → new `AppDependencies` fields: `settleIntent`, `executeOrder`, `updateSettings`.  
`index.ts` → instantiates all three use-cases and passes them to `createApp()`.

---

## Task 3 — Real LP Token Balances in Portfolio

### Problem (R-06, R-07)

`GetPortfolio` returned `lpPositions: []` permanently (hard-coded). The Pool schema had no `lpPolicyId` column so LP token policy IDs were not discoverable from DB.

### Fix

#### Schema (`schema.prisma`)

```prisma
model Pool {
  ...
  lpPolicyId   String?  @db.VarChar(64)
  ...
}
```

DB migration applied via `prisma db push` — column is nullable so no data loss on existing rows.

#### Domain Entity (`Pool.ts`)

Added `lpPolicyId?: string` to `PoolProps` and a `get lpPolicyId()` getter.

#### `CreatePool.ts`

```typescript
lpPolicyId: txResult.poolMeta?.lpPolicyId ?? undefined,
```

`BuildTxResult.poolMeta.lpPolicyId` is already populated by `TxBuilder.buildCreatePoolTx()`. From the moment this change is deployed, every newly created pool will have its LP policy ID stored.

#### `GetPortfolio`

Constructor now accepts optional `IChainProvider`:

```typescript
constructor(
  private readonly intentRepo,
  private readonly orderRepo,
  private readonly poolRepo,
  private readonly chainProvider?: IChainProvider,  // NEW
)
```

New private method `resolveLpPositions(address, activePools)`:

```
1. Filter active pools that have lpPolicyId set
2. Fetch user's UTxOs via chainProvider.getUtxos(address)
3. Build flat map: tokenUnit → balance across all UTxOs
4. For each pool: look up lpPolicyId key in map → emit LpPosition if > 0
5. Return only non-zero positions
6. Gracefully returns [] if chainProvider unavailable or throws
```

New response field:

```typescript
lpPositions: LpPosition[]
// LpPosition = { poolId, assetATicker, assetBTicker, assetAPolicyId, assetBPolicyId, lpPolicyId, lpBalance }
```

#### `index.ts`

```typescript
const getPortfolio = new GetPortfolio(intentRepo, orderRepo, poolRepo, blockfrost);
```

`blockfrost` is the live `BlockfrostClient` which implements `IChainProvider.getUtxos()`.

### Graceful degradation

If Blockfrost is unreachable or the address has no UTxOs, `lpPositions` degrades silently to `[]` — the rest of the portfolio response is unaffected.

---

## Task 4 — Real-time Pool State WebSocket Events

### Problem (G8, G11)

`WsServer.broadcastPool()` existed but was never called anywhere. All pool state updates were only discoverable via polling.

### Fix — Three call sites added

#### 1. `DepositLiquidity.execute()` (new WsServer injection)

Constructor changed: `constructor(poolRepo, txBuilder, wsServer?: WsServer)`

After reserve update:
```typescript
this.wsServer?.broadcastPool({
  poolId: pool.id,
  reserveA: newReserveA.toString(),
  reserveB: newReserveB.toString(),
  price: newPrice.toString(),
  tvlAda: pool.tvlAda.toString(),
  lastTxHash: txResult.txHash,
  timestamp: Date.now(),
});
```

#### 2. `WithdrawLiquidity.execute()` — same pattern

#### 3. `SolverEngine.settleBatch()` (already had WsServer injected)

After pool reserve update DB write (post on-chain confirmation):

```typescript
this.wsServer.broadcastPool({
  poolId: pool.id,
  reserveA: pool.reserveA.toString(),
  reserveB: pool.reserveB.toString(),
  price: newPrice.toString(),
  tvlAda: pool.tvlAda.toString(),
  lastTxHash: submitResult.txHash,
  timestamp: Date.now(),
});
```

#### `index.ts` — WsServer injection

```typescript
const wsServer = new WsServer();
// Task 4: inject WsServer into liquidity use-cases
const depositLiquidity  = new DepositLiquidity(poolRepo, txBuilder, wsServer);
const withdrawLiquidity = new WithdrawLiquidity(poolRepo, txBuilder, wsServer);
```

### Event coverage

| Event | WebSocket broadcast triggered? |
|-------|-------------------------------|
| Deposit liquidity (optimistic, on TX build) | ✅ |
| Withdraw liquidity (optimistic, on TX build) | ✅ |
| Batch settlement (confirmed on-chain) | ✅ |
| Pool created | ➖ (add in future — no reserve change at creation) |
| ChainSync update (every 30s) | ➖ (add in future) |

Frontend clients can now subscribe to the `pool` channel on `/v1/ws` and receive live reserve/price updates without polling.

---

## Files Changed Summary

| File | Type | Change |
|------|------|--------|
| `backend/prisma/schema.prisma` | Modified | `lpPolicyId String?` added to Pool model |
| `backend/src/domain/entities/Pool.ts` | Modified | `lpPolicyId` in `PoolProps` + getter |
| `backend/src/domain/ports/IPoolRepository.ts` | Modified | `insertHistory()` method added |
| `backend/src/infrastructure/database/PoolRepository.ts` | Modified | `insertHistory()` impl + `lpPolicyId` in upsert/toDomain |
| `backend/src/application/use-cases/CreatePool.ts` | Modified | `lpPolicyId` stored from `txResult.poolMeta` |
| `backend/src/application/use-cases/DepositLiquidity.ts` | Modified | WsServer injection + `insertHistory()` + `broadcastPool()` |
| `backend/src/application/use-cases/WithdrawLiquidity.ts` | Modified | WsServer injection + `insertHistory()` + `broadcastPool()` |
| `backend/src/application/use-cases/GetPortfolio.ts` | Modified | IChainProvider injection + `resolveLpPositions()` |
| `backend/src/application/use-cases/SettleIntentUseCase.ts` | **New** | Domain use-case for settlement TX |
| `backend/src/application/use-cases/ExecuteOrderUseCase.ts` | **New** | Domain use-case for DCA/limit order execution TX |
| `backend/src/application/use-cases/UpdateSettingsUseCase.ts` | **New** | Domain use-case for settings deploy/update TX |
| `backend/src/interface/http/routes/swap.ts` | Modified | Refactored to use new use-cases; added `build-update` route |
| `backend/src/interface/http/app.ts` | Modified | New `AppDependencies` fields for 3 use-cases |
| `backend/src/solver/SolverEngine.ts` | Modified | `broadcastPool()` + `insertHistory()` after confirmed settlement |
| `backend/src/index.ts` | Modified | Instantiates all new use-cases; wires WsServer to liquidity UC |

---

## Remaining Outstanding Issues (Unchanged)

The following issues from `SYSTEM-AUDIT-2026-02-FOLLOWUP.md` are **not** addressed in this sprint:

| ID | Severity | Description |
|----|----------|-------------|
| R-01 | HIGH | Partial fill support in TxBuilder (complex, separate sprint) |
| R-02 | MEDIUM | `GET /pools/:id/history` **read** side still returns random placeholder |
| R-03 | MEDIUM | `Swap` table never written (no `prisma.swap.create()` in SolverEngine) |
| R-05 | MEDIUM | Factory deploy has no API endpoint |
| R-08 | LOW | CancelIntent saves CANCELLED but should save CANCELLING until confirmed |
| R-09 | LOW | WebSocket not connected to any React component (frontend work) |
| R-10 | LOW | Token registry hardcoded with test policyIds |
| R-11 | LOW | Frontend test scripts default to production URL |
| R-12 | LOW | Token analytics endpoint always returns zeros |
| R-13 | LOW | `outputIndex: 0` hardcoded in CreatePool/CreateOrder |
| R-15 | LOW | Volume tracking assumes AToB direction in SolverEngine |
| R-16 | LOW | `volume7d` always 0 (depends on R-03) |
| R-17 | LOW | No solver status panel in admin UI |
| R-18 | LOW | No DCA progress widget on orders/portfolio page |

**High priority for next sprint:** R-02 (pool history read), R-03 (Swap table writer), R-08 (CancelIntent state machine).

---

*Report generated February 22, 2026 — all changes TypeScript-clean (`tsc --noEmit` exit 0)*
