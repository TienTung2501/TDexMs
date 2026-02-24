# SolverNet — System Verification Report

**Date:** 2026-02-24  
**Scope:** Backend bots, TxBuilder service, Smart-Contract alignment  
**Reviewer:** Automated analysis via code inspection

---

## 1. Bot Verification

### 1.1 SolverEngine (`src/solver/SolverEngine.ts`)

| Check | Result | Detail |
|---|---|---|
| Stale UTxO filtering | ✅ | Compares chain UTxOs against DB before processing |
| One-intent-per-TX | ✅ | Splits batches into single-intent sub-batches — matches `check_exactly_one_burn` in intent_token_policy |
| FILLING guard (B8) | ✅ | Marks FILLING only AFTER TX build succeeds, reverts on sign/submit failure |
| awaitTx before DB update | ✅ | Uses `chainProvider.awaitTx(120s)`, reverts FILLING→ACTIVE on timeout |
| Settlement TX timing | ✅ | `validTo = chainTimeMs + 15min`, capped at `deadline – 60s` per escrow |
| Price tick recording | ✅ | Called after confirmed settlement (R-03, B5) |
| Root K calculation | ✅ | `bigIntSqrt(activeA * activeB)` matches `calculate_root_k` in math.ak |

**⚠️ Issue #1 — BToA pool reserve DB update always passes `isAtoB=true`:**

```typescript
// SolverEngine.ts ~line 412
pool.applySwap(batch.totalInputAmount, batch.totalOutputAmount, true); // BUG: hardcoded true
```

For BToA swaps, the DB `reserveA`/`reserveB` are swapped after each settlement. This is a cosmetic bug (on-chain state is correct), but causes incorrect TVL display in the UI until the next chain-sync corrects it.

**Fix:** Derive direction from `overallDirection` variable already computed in `buildSettlementTx`, pass it to `pool.applySwap`.

---

### 1.2 ReclaimKeeperCron (`src/infrastructure/cron/ReclaimKeeperCron.ts`)

| Check | Result | Detail |
|---|---|---|
| Marks expired intents in DB | ✅ | `intentRepo.markExpired(now)` before attempting reclaim |
| Uses `buildReclaimTx` correctly | ✅ | Keeper wallet pays fees, owner receives funds |
| awaitTx before DB update | ✅ | DB status → RECLAIMED only after confirmed |
| Handles expired orders | ✅ | Also runs `reclaimExpiredOrders()` in same tick |
| Retry on timeout | ✅ | Logs WARN, leaves DB in EXPIRED state for next tick |
| Processes up to 10 per tick | ✅ | `limit: 10` avoids overload |

**⚠️ Issue #2 — Serialised processing is slow:**  
Each reclaim waits up to 120 s on-chain, processing up to 10 × 120 s = 20 min per tick.  
**Fix:** Fan-out reclaims in parallel with `Promise.allSettled`. Because reclaim UTxOs are independent (different escrow UTxOs), there's no contention risk.

---

### 1.3 OrderExecutorCron (`src/infrastructure/cron/OrderExecutorCron.ts`)

| Check | Result | Detail |
|---|---|---|
| DCA interval check | ✅ | `order.isDcaIntervalRipe(now)` from domain entity |
| Limit price check | ✅ | `order.meetsLimitPrice(reserveOut, reserveIn)` |
| StopLoss check | ✅ | `order.triggersStopLoss(reserveOut, reserveIn)` |
| awaitTx before DB update | ✅ | `order.recordExecution()` + `orderRepo.save()` after confirmation |
| Expired orders skipped | ✅ | Filtered out before processing (ReclaimKeeper handles those) |

**⚠️ Issue #3 — Price check uses stale DB reserves:**  
Limit/StopLoss orders compute price from `pool.reserveA / pool.reserveB` queried from DB, which may lag 1–2 blocks behind chain. In volatile markets, an order may not fire on time.  
**Fix:** Query fresh reserves from Blockfrost at check time, falling back to DB on API error.

---

## 2. TxBuilder Verification

### 2.1 `buildCreateIntentTx` vs `escrow_validator.ak`

| Validation Rule | On-chain Check | TxBuilder Implementation | Match |
|---|---|---|---|
| Token name derivation | `derive_token_name(utxo_ref)` = `blake2b_256(cbor(OutputReference))` | `datumToHash(Data.to(Constr(0, [txHash, outputIndex])))` | ✅ |
| Mint redeemer | `IntentTokenRedeemer.Mint(txHash, outputIndex)` = `Constr(2, [txHash, outIdx])` | `IntentTokenRedeemer.Mint(seedUtxo.txHash, BigInt(seedUtxo.outputIndex))` | ✅ |
| validTo ≤ deadline | `check_before_deadline` = `interval.is_entirely_before(validity, deadline)` | `.validTo(params.deadline)` | ✅ |
| Owner signs | `check_signer(tx, owner_vkh)` | `.addSigner(params.senderAddress)` | ✅ |
| Escrow datum fields | `EscrowDatum { escrow_token, owner, input_asset, input_amount, output_asset, min_output, deadline, max_partial_fills=1, fill_count=0, remaining_input }` | All 10 fields correctly set | ✅ |

### 2.2 `buildCancelIntentTx` vs `validate_cancel`

| Validation Rule | On-chain Check | TxBuilder Implementation | Match |
|---|---|---|---|
| Owner signs | `check_signer(tx, owner_vkh)` | `.addSigner(senderAddress)` | ✅ |
| Burn exactly 1 intent token | `check_burn_one(mint, policy_id, asset_name)` | `.mintAssets({intentTokenUnit: -1n}, Burn())` | ✅ |
| Payment to owner with InlineDatum(intent_id) | `check_payment_output_secure(outputs, owner, input_asset, remaining_input, intent_id)` | `.pay.ToAddressWithData(owner, {kind:'inline', value:Data.to(intentId)}, payment)` | ✅ |

**⚠️ Issue #4 — Fallback escrow scan uses first matching token (any intent):**  
If the owner has multiple active intents at the escrow address, the fallback scan may pick the wrong UTxO. Low severity (only triggered when `escrowTxHash` is missing from DB).

### 2.3 `buildSettlementTx` vs `validate_fill` + `validate_swap`

| Validation Rule | On-chain Check | TxBuilder Implementation | Match |
|---|---|---|---|
| Deadline check | `check_before_deadline(validity_range, deadline)` | `validTo = min(chainTime+15min, deadline-60s)` | ✅ |
| Constant product invariant | `verify_constant_product(resA_in, resB_in, resA_out, resB_out)` | Active reserves calculated identically | ✅ |
| AMM formula (AToB) | `output = resB * (input*(D-fee)) / (resA*D + input*(D-fee))` | Exact same formula with `D=10000` | ✅ |
| Protocol fee (AToB) | `fee = input * fee_num / fee_den / protocol_fee_share` | `(input * feeNumerator / 10000n) / 6n` | ✅ |
| Root K update | `new_root_k = calculate_root_k(resA_out, resB_out)` | `bigIntSqrt(activeA * activeB)` | ✅ |
| Root K non-decreasing | `new_root_k >= old_datum.last_root_k` | Not explicitly checked (validator enforces) | ✅ |
| Owner payment with intentId datum | `check_payment_output_secure` | `.pay.ToAddressWithData(owner, {kind:'inline', value:Data.to(intentId)}, output)` | ✅ |
| Partial fill re-escrow | `fill_count < max_partial_fills` check + continuing UTxO | Uses `isPartialFill` guard + re-output escrow | ✅ |
| Min output slippage | `output_delivered >= min_required` (computed by escrow) | Pre-checked: `if (outputAmount < minRequired) throw` | ✅ |

### 2.4 `buildReclaimTx` vs `validate_reclaim`

| Validation Rule | On-chain Check | TxBuilder Implementation | Match |
|---|---|---|---|
| After deadline | `check_after_deadline(validity_range, deadline)` = `is_entirely_after(validity, deadline)` | `.validFrom(chainTimeMs)` — works because chainTimeMs > deadline for expired intents | ✅ |
| Burn exactly 1 intent token | `check_burn_one` | `.mintAssets({intentTokenUnit: -1n}, Burn())` | ✅ |
| Payment to owner | `check_payment_output_secure(outputs, owner, input_asset, remaining_input, intent_id)` | Payment includes all lovelace (≥ `remaining_input`), InlineDatum(intentId) | ✅ |

### 2.5 `buildCreatePoolTx` vs `factory_validator.ak` + `pool_nft_policy.ak`

| Validation Rule | On-chain Check | TxBuilder Implementation | Match |
|---|---|---|---|
| Pool NFT name | `check_nft_continuity` — NFT asset name = `derive_token_name(seed_utxo)` | `datumToHash(Data.to(Constr(0,[txHash, outIdx])))` | ✅ |
| LP tokens on first deposit | `calculate_initial_lp(a, b) = sqrt(a*b) - MINIMUM_LIQUIDITY` | `bigIntSqrt(a*b) - 1000n` | ✅ |
| Pool datum structure | `PoolDatum { pool_nft, asset_a, asset_b, total_lp, fee_num, fees_a=0, fees_b=0, root_k }` | All fields set correctly | ✅ |
| rootK = sqrt(a*b) | `calculate_root_k(a, b)` = `sqrt(a*b)` | `sqrtAB = bigIntSqrt(a*b)` | ✅ |
| Factory pool_count increment | `output_datum.pool_count == input_datum.pool_count + 1` | `(fields[1] as bigint) + 1n` | ✅ (when factory UTxO exists) |

### 2.6 `buildOrderTx` vs `order_validator.ak`

| Validation Rule | On-chain Check | TxBuilder Implementation | Match |
|---|---|---|---|
| Order token name | Same derivation as intent token | Same `datumToHash(seed_utxo_ref)` | ✅ |
| Redeemer structure | `CancelOrder = Constr(0,[])`, `ExecuteOrder(amount, output) = Constr(1,[a,b])`, `ReclaimOrder = Constr(2,[])` | Mapped correctly | ✅ |
| Budget check | `amount_consumed <= params.remaining_budget` | Pre-computed `actualInput <= remainingBudget` | ✅ |
| DCA interval | `last_fill_slot + min_interval <= current_slot` | `order.isDcaIntervalRipe(now)` in cron | ✅ |

---

## 3. Critical Bugs Found

### 🔴 Bug #1 — `buildDeployFactoryTx` creates invalid factory datum

**File:** `src/infrastructure/cardano/TxBuilder.ts` line ~2843  
**Impact:** HIGH — factory deployment is broken; pool creation with factory will always fail

```typescript
// CURRENT (WRONG):
const factoryDatum = Data.to(new Constr(0, [[]]));
// = Constr(0, [List[]]) — 1 field, no NFT

// REQUIRED (FactoryDatum has 4 fields):
// factory_validator.ak requires: factory_nft, pool_count, admin, settings_utxo
// AND factory_nft must be a real minted NFT (thread token pattern)
```

The factory also requires a minted "factory NFT" thread token — `buildDeployFactoryTx` doesn't mint one. As a result:
- The factory UTxO cannot be spent by the validator (NFT continuity check fails)
- Pool creation with factory UTxO will fail at `check_nft_continuity`

**Current behaviour:** System works in "no-factory mode" — `buildCreatePoolTx` skips factory if no UTxO found. Acceptable for testing, NOT acceptable for production where factory governs pair uniqueness.

**Fix:** Implement proper factory deployment with factory NFT minting (requires a `factory_nft_policy` or use admin signature as one-shot minter).

---

### 🟡 Bug #2 — `pool.applySwap` direction hardcoded to `true` (AtoB) in SolverEngine

**File:** `src/solver/SolverEngine.ts` ~line 412  
**Impact:** MEDIUM — DB reserves show wrong values for BToA swaps; corrected by ChainSync

**Fix:**
```typescript
// Determine actual direction
const batchDirectionAToB = batch.intents.length > 0 && poolAssetA
  ? batch.intents[0]!.inputAsset === poolAssetA
  : true;
pool.applySwap(batch.totalInputAmount, batch.totalOutputAmount, batchDirectionAToB);
```

---

### 🟡 Bug #3 — `buildCreatePoolTx` outputs pool at wrong index when factory is absent

**File:** `src/infrastructure/cardano/TxBuilder.ts` ~line 970  
```typescript
const poolOutputIdx = factoryUtxos.length > 0 ? 1 : 0;
```
This is correct. However, Lucid's `tx.complete()` reorders outputs internally (change goes last). The computed `poolOutputIdx` cannot reliably predict the final output index. This can cause `txHash#outputIndex` stored in DB to be wrong, preventing the solver from finding the pool UTxO by ref.

**Current mitigation:** `buildSettlementTx` falls back to scanning pool address for NFT if ref lookup fails. This works but is slower.

---

## 4. Recommendations

| Priority | Action |
|---|---|
| P0 | Fix `buildDeployFactoryTx` to mint factory NFT + correct 4-field datum |
| P1 | Fix `pool.applySwap` direction in SolverEngine (BToA DB accuracy) |
| P1 | Parallelise `reclaimExpiredIntents` / `reclaimExpiredOrders` with `Promise.allSettled` |
| P2 | OrderExecutorCron: use live chain reserves for Limit/StopLoss price checks |
| P2 | `buildCancelIntentTx`: use `escrowTxHash` from DB, add error if not present |
| P3 | After `tx.complete()`, parse actual output index from CBOR instead of guessing |

---

## 5. Summary

The core swap pipeline (**intent creation → batch collection → settlement**) is **correctly implemented** and matches the on-chain validators. All critical safety rules (deadline enforcement, anti-double-satisfaction, constant product invariant, owner payment verification) are properly enforced both on-chain and in the TxBuilder.

The three running bots operate correctly within their design constraints. The main production concerns are:
1. Factory deployment is incomplete (no-factory mode is fine for testnet)
2. BToA DB reserve tracking is incorrect (cosmetic, self-correcting)
3. Reclaim processing could be significantly faster with parallelisation
