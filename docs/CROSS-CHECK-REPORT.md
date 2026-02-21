# SolverNet DEX — Cross-Check Report
## Đối chiếu chéo: Smart Contract ↔ Backend TxBuilder ↔ API ↔ Frontend Scripts

> **Ngày tạo:** 21/02/2026  
> **Phạm vi:** 8 validators/policies × 13 TxBuilder methods × 38 API endpoints × 37 frontend scripts

---

## Mục lục

1. [Lớp 1: Giao dịch "Chiều Nạp" (Locking / State Creation)](#lớp-1-giao-dịch-chiều-nạp)
2. [Lớp 2: Giao dịch "Chiều Rút/Thực thi" (Spending / State Transition)](#lớp-2-giao-dịch-chiều-rútthực-thi)
3. [Ma trận phủ hành động (Coverage Matrix)](#ma-trận-phủ-hành-động)
4. [Phân tích lỗi nghiêm trọng (Critical Bugs)](#phân-tích-lỗi-nghiêm-trọng)
5. [Danh sách thiếu sót cần bổ sung](#danh-sách-thiếu-sót-cần-bổ-sung)

---

## Lớp 1: Giao dịch "Chiều Nạp" (Locking / State Creation)

### 1.1 Khởi tạo trạng thái (Bootstrap)

| Hợp đồng | Trạng thái cần khởi tạo | Backend Service | API Endpoint | Frontend Script | Trạng thái |
|-----------|-------------------------|-----------------|--------------|-----------------|------------|
| **factory_validator** | Deploy Factory UTxO với `FactoryDatum` (NFT, pool_count=0, admin, settings_utxo) | ❌ Không có builder | ❌ Không có endpoint | ✅ `deploy-factory.ts` (direct on-chain) | ⚠️ Chỉ có script client, không có service |
| **settings_validator** | Deploy Settings UTxO với `SettingsDatum` (fee_bps, min_liquidity, version=1) | ❌ Không có builder | ❌ Không có endpoint | ❌ Không có script | ❌ **THIẾU HOÀN TOÀN** |

**Đánh giá:** 
- Factory bootstrap chỉ có frontend script (deploy-factory.ts) trực tiếp build TX trên client, không thông qua backend. Điều này chấp nhận được vì bootstrap là one-time operation.
- Settings bootstrap **hoàn toàn thiếu** — không có cách nào để deploy Settings UTxO ban đầu.

### 1.2 Khóa tài sản (Deposit / Lock)

| Thao tác | Hợp đồng đích | Datum tạo ra | Backend Builder | API | Script | Trạng thái |
|----------|---------------|--------------|-----------------|-----|--------|------------|
| **Tạo pool** → Lock A+B vào pool_validator | `pool_validator` | `PoolDatum` (8 fields) | ✅ `buildCreatePoolTx` | ✅ `POST /pools/create` | ✅ `create-pool.ts` | ✅ ĐẦY ĐỦ |
| **Nạp thanh khoản** → Lock thêm A+B | `pool_validator` | Updated `PoolDatum` | ✅ `buildDepositTx` | ✅ `POST /pools/:id/deposit` | ✅ `deposit-liquidity.ts` | ✅ ĐẦY ĐỦ |
| **Tạo intent (swap)** → Lock input vào escrow | `escrow_validator` | `EscrowDatum` (10 fields) | ✅ `buildCreateIntentTx` | ✅ `POST /intents` | ✅ `create-intent.ts` | ✅ ĐẦY ĐỦ |
| **Tạo lệnh nâng cao** → Lock budget vào order | `order_validator` | `OrderDatum` (6 fields) | ✅ `buildOrderTx` | ✅ `POST /orders` | ✅ `create-order.ts` | ✅ ĐẦY ĐỦ |

### 1.3 Độ chính xác Datum / State

| Datum | Trường theo hợp đồng | So khớp TxBuilder | Đánh giá |
|-------|----------------------|-------------------|----------|
| **PoolDatum** (8 fields) | `pool_nft`, `asset_a`, `asset_b`, `total_lp_tokens`, `fee_numerator`, `protocol_fees_a` (=0), `protocol_fees_b` (=0), `last_root_k` | ✅ `Constr(0, [pool_nft, asset_a, asset_b, initialLp, feeNum, 0n, 0n, sqrtAB])` — 8 fields đúng thứ tự | ✅ CHÍNH XÁC |
| **EscrowDatum** (10 fields) | `escrow_token`, `owner`, `input_asset`, `input_amount`, `output_asset`, `min_output`, `deadline`, `max_partial_fills`, `fill_count` (=0), `remaining_input` | ✅ `Constr(0, [escrowToken, owner, inputAsset, inputAmount, outputAsset, minOutput, deadline, maxPartialFills, 0n, inputAmount])` — 10 fields đúng | ✅ CHÍNH XÁC |
| **OrderDatum** (6 fields) | `order_type`, `owner`, `asset_in`, `asset_out`, `params`, `order_token` | ✅ `Constr(0, [orderType, owner, assetIn, assetOut, params, orderToken])` — 6 fields | ✅ CHÍNH XÁC |
| **OrderParams** (7 fields) | `target_price_num`, `target_price_den`, `amount_per_interval`, `min_interval`, `last_fill_slot`, `remaining_budget`, `deadline` | ✅ `Constr(0, [priceNum, priceDen, amountPerInterval, minInterval, 0n, remainingBudget, deadline])` — 7 fields phẳng | ✅ CHÍNH XÁC |
| **FactoryDatum** (4 fields) | `factory_nft`, `pool_count`, `admin`, `settings_utxo` | ✅ `Constr(0, [factoryNft, poolCount+1, admin, settingsUtxo])` tại `buildCreatePoolTx` | ✅ CHÍNH XÁC (khi tạo pool) |
| **SettingsDatum** (7 fields) | `admin`, `protocol_fee_bps`, `min_pool_liquidity`, `min_intent_size`, `solver_bond`, `fee_collector`, `version` | ✅ `Constr(0, [adminVkh, feeBps, minLiquidity, 1_000_000, 5_000_000, feeCollector, version])` | ⚠️ Hardcode min_intent_size + solver_bond |

---

## Lớp 2: Giao dịch "Chiều Rút/Thực thi" (Spending / State Transition)

### 2.1 pool_validator — 5 Redeemers

| Redeemer | Constr | Backend Builder | Datum cập nhật? | Tài sản cập nhật? | API | Script | Trạng thái |
|----------|--------|-----------------|-----------------|-------------------|-----|--------|------------|
| `Swap {direction, min_output}` | `Constr(0, [dir, min])` | ⚠️ `buildSettlementTx` (gián tiếp, qua escrow fill) | ❌ **datum không cập nhật** (re-output nguyên datum cũ) | ❌ **assets không cập nhật** (re-output nguyên assets) | ❌ Không có endpoint swap trực tiếp | ❌ Không có script swap trực tiếp | 🔴 **THIẾU NGHIÊM TRỌNG** |
| `Deposit {min_lp_tokens}` | `Constr(1, [min])` | ✅ `buildDepositTx` | ✅ Cập nhật total_lp, root_k | ✅ Cộng amountA/B vào pool | ✅ `POST /pools/:id/deposit` | ✅ `deposit-liquidity.ts` | ✅ ĐẦY ĐỦ |
| `Withdraw {lp_tokens_burned}` | `Constr(2, [lp])` | ✅ `buildWithdrawTx` | ✅ Cập nhật total_lp, root_k | ✅ Trừ proportional A/B | ✅ `POST /pools/:id/withdraw` | ✅ `withdraw-liquidity.ts` | ✅ ĐẦY ĐỦ |
| `CollectFees` | `Constr(3, [])` | ⚠️ `buildCollectFeesTx` | ❌ **datum không cập nhật** (giữ nguyên, không zero fees) | ❌ **assets không trừ fees** | ✅ `POST /admin/revenue/build-collect` | ✅ `admin-collect-fees.ts` | 🔴 **BUG: datum+assets sai** |
| `ClosePool` | `Constr(4, [])` | ✅ `buildBurnPoolNFTTx` | N/A (pool bị tiêu hủy) | N/A (tất cả trả admin) | ✅ `POST /admin/pools/build-burn` | ✅ `admin-burn-pool.ts` | ✅ ĐẦY ĐỦ |

### 2.2 escrow_validator — 3 Redeemers

| Redeemer | Constr | Backend Builder | API | Script | Trạng thái |
|----------|--------|-----------------|-----|--------|------------|
| `Cancel` | `Constr(0, [])` | ✅ `buildCancelIntentTx` — burn token, trả lại owner | ✅ `DELETE /intents/:id` | ✅ `cancel-intent.ts` | ✅ ĐẦY ĐỦ |
| `Fill {input_consumed, output_delivered}` | `Constr(1, [in, out])` | ⚠️ `buildSettlementTx` — hardcode `Fill(0n, 0n)` | ❌ Không có endpoint riêng | ❌ Không có script | 🔴 **PLACEHOLDER — amounts sai** |
| `Reclaim` | `Constr(2, [])` | ✅ `buildReclaimTx` — burn token, trả owner (keeper gọi) | ✅ `POST /portfolio/build-action` (action=RECLAIM) | ✅ `portfolio-action.ts` | ✅ ĐẦY ĐỦ |

### 2.3 order_validator — 2 Redeemers (3 loại lệnh)

| Redeemer | Constr | Backend Builder | API | Script | Trạng thái |
|----------|--------|-----------------|-----|--------|------------|
| `CancelOrder` | `Constr(0, [])` | ✅ `buildCancelOrderTx` — burn token, trả budget | ✅ `DELETE /orders/:id` | ✅ `cancel-order.ts` | ✅ ĐẦY ĐỦ |
| `ExecuteOrder {amount_consumed, output_delivered}` | `Constr(1, [in, out])` | ❌ **KHÔNG CÓ builder** | ❌ Không có endpoint | ❌ Không có script | 🔴 **THIẾU HOÀN TOÀN** |
| → LimitOrder execution | Needs price check, partial fill | ❌ | ❌ | ❌ | 🔴 THIẾU |
| → DCA execution | Needs interval check, budget tracking | ❌ | ❌ | ❌ | 🔴 THIẾU |
| → StopLoss execution | Needs full budget consume | ❌ | ❌ | ❌ | 🔴 THIẾU |

### 2.4 factory_validator — 2 Redeemers

| Redeemer | Constr | Backend Builder | API | Script | Trạng thái |
|----------|--------|-----------------|-----|--------|------------|
| `CreatePool {asset_a, asset_b, initial_a, initial_b, fee_numerator}` | `Constr(0, [...])` | ✅ `buildCreatePoolTx` | ✅ `POST /pools/create` | ✅ `create-pool.ts` | ✅ ĐẦY ĐỦ |
| `UpdateSettings` | `Constr(1, [])` | ✅ `buildUpdateFactoryAdminTx` | ✅ `POST /admin/settings/build-update-factory` | ✅ `admin-transfer-factory.ts` | ⚠️ **xem bug bên dưới** |

### 2.5 settings_validator — 1 Redeemer

| Redeemer | Constr | Backend Builder | API | Script | Trạng thái |
|----------|--------|-----------------|-----|--------|------------|
| `UpdateProtocolSettings` | `Constr(0, [])` | ✅ `buildUpdateSettingsTx` | ✅ `POST /admin/settings/build-update-global` | ✅ `admin-update-settings.ts` | ⚠️ Chưa deploy Settings UTxO |

### 2.6 Minting Policies — Redeemer Coverage

| Policy | Redeemer | Constr | Sử dụng bởi Builder | Trạng thái |
|--------|----------|--------|---------------------|------------|
| `pool_nft_policy` | `MintPoolNFT {consumed_utxo}` | `Constr(0, [OutputRef])` | ✅ `buildCreatePoolTx` | ✅ |
| `pool_nft_policy` | `BurnPoolNFT` | `Constr(1, [])` | ✅ `buildBurnPoolNFTTx` | ✅ |
| `lp_token_policy` | `MintOrBurnLP {pool_nft, amount}` (mint) | `Constr(0, [AssetClass, +amount])` | ✅ `buildCreatePoolTx`, `buildDepositTx` | ✅ |
| `lp_token_policy` | `MintOrBurnLP {pool_nft, amount}` (burn) | `Constr(0, [AssetClass, -amount])` | ✅ `buildWithdrawTx`, `buildBurnPoolNFTTx` | ✅ |
| `intent_token_policy` | `MintIntentToken {consumed_utxo}` | `Constr(0, [OutputRef])` | ✅ `buildCreateIntentTx`, `buildOrderTx` | ✅ |
| `intent_token_policy` | `BurnIntentToken` | `Constr(1, [])` | ✅ `buildCancelIntentTx`, `buildCancelOrderTx`, `buildReclaimTx`, `buildSettlementTx` | ✅ |

---

## Ma trận phủ hành động (Coverage Matrix)

```
                          Backend    API      Frontend   On-Chain
Validator/Action          TxBuilder  Endpoint Script     Tested?
─────────────────────────────────────────────────────────────────
POOL_VALIDATOR
  Swap                    ⚠️ broken  ❌       ❌         ❌
  Deposit                 ✅         ✅       ✅         ✅
  Withdraw                ✅         ✅       ✅         ✅
  CollectFees             ⚠️ broken  ✅       ✅         ⚠️(*)
  ClosePool               ✅         ✅       ✅         ✅

FACTORY_VALIDATOR
  CreatePool              ✅         ✅       ✅         ✅
  UpdateSettings          ⚠️ bug     ✅       ✅         ❌

ESCROW_VALIDATOR
  Cancel                  ✅         ✅       ✅         ✅
  Fill (complete)         ⚠️ broken  ❌       ❌         ❌
  Fill (partial)          ❌         ❌       ❌         ❌
  Reclaim                 ✅         ✅       ✅         ❌

ORDER_VALIDATOR
  CancelOrder             ✅         ✅       ✅         ✅
  ExecuteOrder/Limit      ❌         ❌       ❌         ❌
  ExecuteOrder/DCA        ❌         ❌       ❌         ❌
  ExecuteOrder/StopLoss   ❌         ❌       ❌         ❌

SETTINGS_VALIDATOR
  UpdateProtocolSettings  ✅         ✅       ✅         ❌
  (Deploy bootstrap)      ❌         ❌       ❌         ❌

POOL_NFT_POLICY
  MintPoolNFT             ✅         (via create-pool)   ✅
  BurnPoolNFT             ✅         (via burn-pool)     ✅

LP_TOKEN_POLICY
  MintOrBurnLP (mint)     ✅         (via create/deposit) ✅
  MintOrBurnLP (burn)     ✅         (via withdraw/burn)  ✅

INTENT_TOKEN_POLICY
  MintIntentToken         ✅         (via create-intent/order)  ✅
  BurnIntentToken         ✅         (via cancel/reclaim/settle) ✅
─────────────────────────────────────────────────────────────────
(*) CollectFees TX passed on-chain nhưng logic sai — datum/assets
    không được cập nhật đúng. TX passed vì validator cho phép
    fees_a == old.protocol_fees_a == 0 (after previous collect).
```

---

## Phân tích lỗi nghiêm trọng (Critical Bugs)

### 🔴 BUG-1: `buildCollectFeesTx` — Datum + Assets không cập nhật

**File:** `TxBuilder.ts` L1516-1585

**Vấn đề:**
```typescript
// HIỆN TẠI (SAI):
tx = tx.pay.ToContract(
  r.poolAddr,
  { kind: 'inline', value: poolUtxo.datum! },  // ← datum nguyên bản, fees_a/b KHÔNG zeroed
  poolUtxo.assets,                                // ← assets nguyên bản, fees KHÔNG bị trừ
);
```

**Hợp đồng yêu cầu:**
- `new_datum.protocol_fees_a == 0`
- `new_datum.protocol_fees_b == 0`
- `fees_a == old_datum.protocol_fees_a` (trừ đúng fees khỏi assets)
- `new_datum.last_root_k == old_datum.last_root_k` (giữ nguyên root_k)

**Cần sửa:** Parse datum on-chain → zero fees → trừ fees khỏi assets → re-output.

---

### 🔴 BUG-2: `buildSettlementTx` — Placeholder, không hoạt động đúng

**File:** `TxBuilder.ts` L1148-1241

**Vấn đề:**
1. `EscrowRedeemer.Fill(0n, 0n)` — hardcoded, escrow validator sẽ reject vì `input_consumed > 0` check fails
2. Pool datum + assets không cập nhật sau swap
3. Không tính toán swap output (constant product formula)
4. Không delivery output tokens cho owner
5. Hardcoded `Swap('AToB', 0n)` — không xác định direction từ escrow data

---

### 🔴 BUG-3: `buildUpdateFactoryAdminTx` — Datum mới hardcode sai

**File:** `TxBuilder.ts` L1703-1710

**Vấn đề:**
```typescript
const newFactoryDatum = Data.to(
  new Constr(0, [
    new Constr(0, ['', '']),  // ← factory_nft bị XÓA, phải giữ nguyên
    0n,                       // ← pool_count RESET về 0, phải giữ nguyên
    params.newAdminVkh,
    new Constr(0, ['', '']),  // ← settings_utxo bị XÓA
  ]),
);
```

**Hợp đồng yêu cầu:** `UpdateSettings` redeemer kiểm tra factory NFT continuity và pool_count preserved.

**Cần sửa:** Parse existing datum → chỉ thay admin → giữ nguyên factory_nft, pool_count, settings_utxo.

---

### 🟡 BUG-4: `buildCollectFeesTx` — Tìm pool UTxO sai khi nhiều pool

**File:** `TxBuilder.ts` L1540-1546

**Vấn đề:** Vòng lặp `for (const _poolId of params.poolIds)` luôn tìm **cùng một pool UTxO đầu tiên** thay vì khớp với từng `poolId`. Cần map `poolId` → `poolNftAssetName` → tìm UTxO có đúng NFT đó.

---

## Danh sách thiếu sót cần bổ sung

### Ưu tiên P0 (Critical — Core Functionality)

| # | Mô tả | Component | file liên quan |
|---|-------|-----------|----------------|
| 1 | **Sửa `buildCollectFeesTx`** — parse datum, zero fees, trừ assets | Backend TxBuilder | `TxBuilder.ts` |
| 2 | **Sửa `buildSettlementTx`** → thành `buildFillEscrowTx` đầy đủ** — tính swap, cập nhật datum+assets, delivery output | Backend TxBuilder | `TxBuilder.ts` |
| 3 | **Thêm `buildExecuteOrderTx`** — cho solver thực thi Limit/DCA/StopLoss orders | Backend TxBuilder + ITxBuilder | `TxBuilder.ts`, `ITxBuilder.ts` |
| 4 | **Sửa `buildUpdateFactoryAdminTx`** — giữ nguyên factory_nft, pool_count, settings_utxo | Backend TxBuilder | `TxBuilder.ts` |
| 5 | **Thêm `buildDirectSwapTx`** — cho phép swap pool trực tiếp không qua escrow | Backend TxBuilder + ITxBuilder | `TxBuilder.ts`, `ITxBuilder.ts` |

### Ưu tiên P1 (Important — Missing Features)

| # | Mô tả | Component |
|---|-------|-----------|
| 6 | **Thêm `buildDeploySettingsTx`** — bootstrap Settings UTxO | Backend TxBuilder |
| 7 | **Thêm API endpoint `/v1/swap`** — direct pool swap | API Routes |
| 8 | **Thêm API endpoint `/v1/solver/execute-order`** — thực thi orders | API Routes |
| 9 | **Thêm API endpoint `/v1/solver/fill-intent`** — fill escrow intents | API Routes |
| 10 | **Thêm frontend script `direct-swap.ts`** | Frontend Scripts |
| 11 | **Thêm frontend script `execute-order.ts`** | Frontend Scripts |
| 12 | **Thêm frontend script `fill-intent.ts`** | Frontend Scripts |
| 13 | **Thêm frontend script `deploy-settings.ts`** | Frontend Scripts |

### Ưu tiên P2 (Enhancement)

| # | Mô tả | Component |
|---|-------|-----------|
| 14 | Cải thiện `buildCollectFeesTx` — tìm pool UTxO đúng theo poolId/NFT name | Backend TxBuilder |
| 15 | Thêm Partial Fill logic cho `buildSettlementTx` (continuing escrow UTxO) | Backend TxBuilder |
| 16 | `buildUpdateSettingsTx` — parse existing datum thay vì hardcode min_intent_size/solver_bond | Backend TxBuilder |

---

## Tổng kết

| Loại | Đầy đủ | Có nhưng lỗi | Thiếu hoàn toàn | Tổng |
|------|--------|--------------|-----------------|------|
| **Redeemers/Actions** | 11 | 3 | 4 | **18** |
| **TxBuilder methods** | 9 | 3 | 3 | **15** |
| **API endpoints** | 35 | 0 | 3 | **38** |
| **Frontend scripts** | 33 | 0 | 4 | **37** |

**Kết luận:** Hệ thống đã hoàn thiện ~70% các tính năng cốt lõi. Phần **khóa tài sản (locking)** hoạt động tốt. Phần **thực thi/rút (spending)** có 3 builder bị lỗi nghiêm trọng và thiếu 3 builder quan trọng cho solver (direct swap, fill escrow, execute order).
