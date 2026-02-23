# BÁO CÁO KIỂM TOÁN TOÀN DIỆN & KẾ HOẠCH CẢI TIẾN
## SolverNet DEX — Cardano Intent-based DEX

**Ngày:** 2025-02-23  
**Tác giả:** AI Audit System  
**Phạm vi:** Smart Contracts (Aiken) + Off-chain Bots (TypeScript) + Kiến trúc hệ thống  
**Nguồn tham chiếu:** discussion_v2.md, mã nguồn thực tế trong repository  

---

# PHẦN A: BÁO CÁO KIỂM TOÁN HỆ THỐNG

## I. TÓM TẮT KẾT QUẢ

| Mức độ | Số lượng | Mô tả |
|--------|----------|-------|
| 🔴 CRITICAL | 4 | Có thể gây mất tiền hoặc khóa vĩnh viễn Pool |
| 🟠 HIGH | 5 | Tính năng bị hỏng hoặc có lỗ hổng nghiêm trọng |
| 🟡 MEDIUM | 6 | Kiến trúc không tối ưu, gây bottleneck |
| 🔵 LOW | 4 | Cải tiến UX/DX, không ảnh hưởng bảo mật |

**Kết luận tổng quát:** Hệ thống hiện tại **ĐỦ để chạy Demo/Testnet** với các giao dịch đơn lẻ, nhưng **KHÔNG AN TOÀN cho Mainnet** do 4 lỗ hổng Critical chưa được vá.

---

## II. LỖ HỔNG CHI TIẾT

### 🔴 CRITICAL-01: Double Satisfaction (Thỏa mãn kép) trong Escrow Validator

**File:** `smartcontract/lib/solvernet/validation.ak` → hàm `check_payment_output` (dòng 168-178)  
**File liên quan:** `smartcontract/validators/escrow_validator.ak` → `validate_complete_fill`, `validate_partial_fill`, `validate_reclaim`

**Mô tả lỗi:**  
Hàm `check_payment_output` sử dụng `list.any()` để kiểm tra xem có Output nào trả tiền cho owner:

```aiken
pub fn check_payment_output(
  outputs: List<Output>,
  recipient: Address,
  asset: AssetClass,
  min_amount: Int,
) -> Bool {
  list.any(
    outputs,
    fn(out) {
      and {
        out.address == recipient,
        asset_class_quantity(out.value, asset) >= min_amount,
      }
    },
  )
}
```

**Kịch bản tấn công:**  
Khi Solver gom 3 Intent của cùng 1 User (ví dụ Alice) vào 1 TX:
- Intent A: min_output = 100 TOKEN_X  
- Intent B: min_output = 80 TOKEN_X  
- Intent C: min_output = 50 TOKEN_X  

Solver chỉ cần tạo **DUY NHẤT 1 Output** chứa 100 TOKEN_X gửi cho Alice. `list.any()` sẽ trả về `True` cho cả 3 Intent vì Output đó thỏa mãn `>= 100` (Intent A), `>= 80` (Intent B), và `>= 50` (Intent C). Solver chiếm đoạt 130 TOKEN_X.

**Mức độ nghiêm trọng:** **100% có thể khai thác** trên Mainnet trong cơ chế Batch. Hiện tại đang "may mắn" vì SolverEngine chỉ xử lý 1 Intent/TX (do bug `check_exactly_one_burn`).

**Ghi chú:** File `validation.ak` có hàm `count_outputs_to_address` (dòng 191-206) nhưng **CHƯA BAO GIỜ được gọi** bởi bất kỳ validator nào. Đây là dead code.

---

### 🔴 CRITICAL-02: AMM Math - Trộn lẫn Protocol Fees và Active Reserve

**File:** `smartcontract/validators/pool_validator.ak` → `validate_swap` (dòng ~165-240), `validate_withdraw` (dòng ~295-360), `validate_deposit` (dòng ~250-290)

**Mô tả lỗi:**  
Pool validator lấy reserve trực tiếp từ giá trị vật lý của UTxO:

```aiken
let reserve_a_in = get_reserve(pool_input.output.value, asset_a)
let reserve_b_in = get_reserve(pool_input.output.value, asset_b)
```

Giá trị này **bao gồm cả** `protocol_fees_a` và `protocol_fees_b` mà chưa được Admin thu hoạch.

**Hậu quả dây chuyền:**

1. **Swap sai giá:** K = `(reserve_a + fees_a) * (reserve_b + fees_b)` thay vì `active_reserve_a * active_reserve_b`. User nhận ít hơn thực tế vì Pool "trông" có vẻ lớn hơn.

2. **CollectFees PHẢI VỠ Pool:** Khi Admin gọi `CollectFees` rút protocol_fees:
   - `reserve_a_out = reserve_a_in - fees_a` (giảm)
   - `reserve_b_out = reserve_b_in - fees_b` (giảm)
   - `new_root_k = sqrt(reserve_a_out * reserve_b_out)` < `old_root_k`
   - Validator YÊU CẦU `new_datum.last_root_k == old_datum.last_root_k` (dòng ~420)
   - ⚡ **NHƯNG** `validate_collect_fees` **KHÔNG tính root_k mới** — nó giữ nguyên `old_datum.last_root_k`. Điều này thực tế là đúng cho validator, nhưng...
   
3. **Swap SAU CollectFees THÌ VỠ:** Giao dịch Swap tiếp theo sẽ tính `new_root_k = sqrt(new_a * new_b)` nhưng giá trị physical reserve đã giảm (do rút fees), nên `new_root_k < last_root_k`. Điều kiện `new_root_k >= old_datum.last_root_k` **THẤT BẠI**.

4. **Withdraw tràn tiền:** `withdrawA = (reserveAIn * lpBurned) / totalLpOld` — LP nhận cả phần protocol_fees. Admin bị thiệt.

**Xác minh trong code:** `validate_collect_fees` tại dòng ~395 kiểm tra `new_datum.last_root_k == old_datum.last_root_k` (giữ nguyên root_k). Điều này đúng về mặt datum, nhưng Swap tiếp theo sẽ tính physical root_k mới (nhỏ hơn) và FAIL.

---

### 🔴 CRITICAL-03: `check_exactly_one_burn` Chặn Batching

**File:** `smartcontract/validators/intent_token_policy.ak` → `check_exactly_one_burn` (dòng 58-62)

```aiken
fn check_exactly_one_burn(minted_tokens: dict.Dict<ByteArray, Int>) -> Bool {
  when dict.to_pairs(minted_tokens) is {
    [Pair(_, qty)] -> qty == -1
    _ -> False
  }
}
```

**Mô tả lỗi:**  
Khi `BurnIntentToken` được kích hoạt, hàm yêu cầu **CHÍNH XÁC 1 token** bị đốt trong TX. Nếu Solver gom 5 Intent vào 1 TX (cần đốt 5 token), hàm trả về `False` → TX bị reject.

**Hậu quả:**  
- SolverEngine **BẮT BUỘC** chỉ xử lý 1 Intent/TX (hiện bị workaround trong code)
- Không thể implement Netting Engine (gom lệnh bù trừ)
- TPS của hệ thống bị giới hạn bởi block time (~20s/intent)
- Tăng phí gas cho Users vì mỗi Intent tốn 1 TX riêng

**Xác minh:** `SolverEngine.ts` dòng ~180-200 có workaround: `for (const singleIntent of batch.intents)` — xử lý từng intent riêng lẻ.

---

### 🔴 CRITICAL-04: Order Validator Thiếu Reclaim Redeemer

**File:** `smartcontract/validators/order_validator.ak` → `OrderRedeemer` chỉ có `CancelOrder` và `ExecuteOrder`

**Mô tả lỗi:**  
`OrderRedeemer` (type_id=2 trong types.ak) chỉ có 2 variant:
```aiken
pub type OrderRedeemer {
  CancelOrder      // index 0 — yêu cầu chữ ký Owner
  ExecuteOrder { .. } // index 1
}
```

**Không có `Reclaim` redeemer** (permissionless — ai cũng có thể gọi sau deadline).

**Hậu quả:**  
- Nếu User mất quyền truy cập ví (mất seed phrase), Order bị kẹt **VĨNH VIỄN** trên chain
- ReclaimKeeperCron hiện đang gọi `buildCancelOrderTx` → cần chữ ký Owner → **SẼ FAIL** vì Keeper không có Owner's VKH
- Tiền bị khóa vĩnh viễn trong Order UTxO

**Xác minh:** `ReclaimKeeperCron.ts` dòng ~180 gọi `this.txBuilder.buildCancelOrderTx()` cho expired orders — Transaction này cần `addSigner(owner)` nhưng Keeper ký bằng solver wallet → **On-chain sẽ reject**.

---

### 🟠 HIGH-01: OrderExecutorCron Chỉ Xử Lý DCA — Bỏ Qua Limit/StopLoss

**File:** `backend/src/infrastructure/cron/OrderExecutorCron.ts` → `tick()` (dòng ~135-150)

```typescript
const [activePage, partialPage] = await Promise.all([
  this.orderRepo.findMany({ status: 'ACTIVE', type: 'DCA', limit: this.batchLimit }),
  this.orderRepo.findMany({ status: 'PARTIALLY_FILLED', type: 'DCA', limit: this.batchLimit }),
]);
```

**Mô tả:** Query **CHỈ lọc `type: 'DCA'`**. Limit Orders và StopLoss Orders **KHÔNG BAO GIỜ** được quét hoặc thực thi.

**Hậu quả:**  
- User tạo Limit Order → Đợi mãi → Không bao giờ được khớp
- StopLoss không bảo vệ User khi giá giảm → User bị thua lỗ

---

### 🟠 HIGH-02: Limit/StopLoss Hard-code `amountConsumed = remainingBudget`

**File:** `backend/src/infrastructure/cardano/TxBuilder.ts` → `buildExecuteOrderTx` (dòng ~2580-2590)

```typescript
if (orderTypeIdx === 1) {
  // DCA: consume exactly amountPerInterval (or remaining if less)
  amountConsumed = remainingBudget < amountPerInterval
    ? remainingBudget
    : amountPerInterval;
} else {
  // Limit / StopLoss: consume all remaining budget
  amountConsumed = remainingBudget;
}
```

**Mô tả:** Limit Order luôn bị ép fill 100% (`amountConsumed = remainingBudget`). Nếu user đặt mua 10,000 ADA nhưng Pool chỉ đủ thanh khoản cho 2,000 ADA, TX sẽ fail do price impact quá cao.

**Hậu quả:** Limit Orders lớn **kẹt vĩnh viễn** nếu thanh khoản Pool không đủ cho 100% lệnh.

---

### 🟠 HIGH-03: UTxO Contention — 3 Bots Dùng Chung 1 Ví

**File:** `SolverEngine.ts`, `OrderExecutorCron.ts`, `ReclaimKeeperCron.ts` — tất cả dùng `SOLVER_SEED_PHRASE`

**Mô tả:** SolverEngine, OrderExecutorCron, ReclaimKeeperCron đều:
1. Tạo Lucid instance từ cùng 1 seed phrase
2. Tự động chọn UTxO để trả phí (coin selection tự do)
3. Submit TX độc lập, không có cơ chế lock

**Hậu quả:** Khi 2+ bot submit TX cùng lúc → cùng chọn 1 UTxO cho phí → TX thứ 2 bị `BadInputsUTxO` → fail. Xác suất cao khi hệ thống bận.

---

### 🟠 HIGH-04: Settlement Dùng Physical Reserve — Không Tách Active Reserve

**File:** `backend/src/infrastructure/cardano/TxBuilder.ts` → `buildSettlementTx` (dòng ~2180-2200)

```typescript
let reserveA = unitA === 'lovelace'
  ? (poolUtxo.assets.lovelace || 0n)
  : (poolUtxo.assets[unitA] || 0n);
```

**Mô tả:** TxBuilder tính toán AMM swap dùng physical reserves (bao gồm protocol_fees), giống CRITICAL-02 nhưng ở phía off-chain. Đây là mirror logic — khi smart contract được fix, TxBuilder cũng phải fix.

---

### 🟠 HIGH-05: Withdraw Tính Sai — LP Nhận Cả Protocol Fees

**File:** `backend/src/infrastructure/cardano/TxBuilder.ts` → `buildWithdrawTx` (dòng ~2280)

```typescript
const withdrawA = (reserveAIn * lpBurned) / totalLpOld;
const withdrawB = (reserveBIn * lpBurned) / totalLpOld;
```

**Mirror của CRITICAL-02:** `reserveAIn` bao gồm protocol_fees → LP lấy cả tiền phí → Admin thiệt.

---

### 🟡 MEDIUM-01: Không Có Netting Engine — Sequential Processing

**File:** `backend/src/solver/SolverEngine.ts` (dòng ~180-210), `backend/src/solver/BatchBuilder.ts`

**Mô tả:** BatchBuilder nhóm intents theo Pool nhưng SolverEngine lặp qua từng intent:
```typescript
for (const singleIntent of batch.intents) { ... }
```

Không có logic bù trừ (netting) giữa lệnh Mua và Bán. Mỗi intent đều swap riêng với Pool.

**Hậu quả:**  
- User chịu slippage cao hơn cần thiết
- Pool bị impact nhiều hơn cần thiết
- Throughput thấp (1 TX/20s thay vì batch N intents)

---

### 🟡 MEDIUM-02: Không Có Virtual Mempool / Transaction Chaining

**File:** `backend/src/solver/SolverEngine.ts` (dòng ~195)

```typescript
await sleep(2000); // Wait for pool UTxO to propagate
```

**Mô tả:** Sau mỗi settlement TX, bot ngủ 2 giây chờ UTxO mới xuất hiện trên Blockfrost. Không dự đoán trạng thái mới.

**Hậu quả:**  
- Throughput bị giới hạn bởi: (block_time + propagation_delay + 2s sleep) / intent
- Không thể chain TX liên tiếp

---

### 🟡 MEDIUM-03: RouteOptimizer Chỉ Hỗ Trợ 2 Chiến Lược

**File:** `backend/src/solver/RouteOptimizer.ts`

**Mô tả:** Chỉ có `direct` và `multi-hop via ADA` (2-hop cứng). Không có:
- Graph-based routing (Dijkstra/Bellman-Ford)
- Split routing (chia lệnh qua nhiều pool)
- Adaptive routing dựa trên pool depth

---

### 🟡 MEDIUM-04: Partial Fill Không Có Dust Prevention

**File:** `smartcontract/validators/escrow_validator.ak` → `validate_partial_fill` (dòng ~168-210)

**Mô tả:** Không kiểm tra `new_remaining >= min_utxo_lovelace`. Nếu remaining < 1.5 ADA, UTxO mới không tạo được trên mạng Cardano.

**Ghi chú:** Có `min_fill_percent` (10%) nhưng không chặn trường hợp new_remaining quá nhỏ.

---

### 🟡 MEDIUM-05: Factory Validator Hard-code `pool_validator_hash`

**File:** `smartcontract/validators/factory_validator.ak` — tham số `pool_validator_hash: ScriptHash`

**Mô tả:** Nếu cần nâng cấp Pool Validator, phải redeploy Factory → mất thread token → phải bootstrap lại hệ thống.

---

### 🟡 MEDIUM-06: Admin VKH Hard-coded trong Pool Validator

**File:** `smartcontract/validators/pool_validator.ak` — tham số `admin_vkh: VerificationKeyHash`

**Mô tả:** `pool_validator(admin_vkh)` bake VKH vào bytecode. Không thể thay admin mà không redeploy. Trên Mainnet, nên dùng Reference Input đọc admin từ Settings UTxO.

---

### 🔵 LOW-01: Settings Validator Admin Là `ScriptHash` — Cần Withdrawal Pattern

**File:** `smartcontract/validators/settings_validator.ak` → `check_admin_authorized` (dòng ~85-92)

**Mô tả:** Kiểm tra admin bằng `withdrawal` pattern. Đây là pattern đúng cho multi-sig, nhưng cần đảm bảo admin script tồn tại on-chain để tránh lock-out.

---

### 🔵 LOW-02: Seed Phrase Lưu Trong Biến Môi Trường

**File:** Tất cả bot files — `SOLVER_SEED_PHRASE` từ `.env`

**Mô tả:** Production nên dùng KMS (Key Management Service) hoặc Hardware Wallet thay vì plain-text seed phrase.

---

### 🔵 LOW-03: `buildSettlementTx` Dùng `Date.now()` Thay Vì Chain Time

**File:** `TxBuilder.ts` → `buildReclaimTx` (dòng ~2755)

```typescript
.validFrom(Date.now()); // Reclaim is only valid AFTER deadline
```

**Mô tả:** `buildReclaimTx` dùng `Date.now()` cho `validFrom`. Nếu local clock lệch so với chain time, TX có thể fail. `buildSettlementTx` đã fix bằng `getChainTimeMs()` nhưng reclaim chưa.

---

### 🔵 LOW-04: BuildSettlementTx Gán `overallDirection` Theo Intent Đầu Tiên

**File:** `TxBuilder.ts` → `buildSettlementTx` (dòng ~2380-2385)

```typescript
const overallDirection: 'AToB' | 'BToA' = 
  (firstInputPolicy === assetAPolicyId && firstInputName === assetAAssetName)
    ? 'AToB' : 'BToA';
```

**Mô tả:** Nếu batch có cả lệnh AToB và BToA (khi unlock batching), Pool Redeemer chỉ nhận 1 direction → TX fail. Cần Netting Engine để aggregate thành 1 net direction.

---

## III. MA TRẬN RỦI RO

| ID | Lỗ hổng | Exploit on Testnet? | Exploit on Mainnet? | Fix Urgency |
|----|---------|--------------------|--------------------|-------------|
| C-01 | Double Satisfaction | ❌ (1 intent/TX hiện tại) | ✅ Mất tiền | **Phase 1** |
| C-02 | AMM Active Reserve | ✅ Pool vỡ sau CollectFees | ✅ Pool ngừng hoạt động | **Phase 1** |
| C-03 | check_exactly_one_burn | ✅ Chặn batch | ✅ Throughput cực thấp | **Phase 1** |
| C-04 | Order Missing Reclaim | ✅ Tiền kẹt | ✅ Tiền kẹt vĩnh viễn | **Phase 1** |
| H-01 | OrderExecutor DCA-only | ✅ Limit/SL không chạy | ✅ Feature broken | **Phase 2** |
| H-02 | Limit hard-code 100% | ✅ Lệnh lớn kẹt | ✅ Feature broken | **Phase 2** |
| H-03 | UTxO Contention | ✅ BadInputsUTxO | ✅ Bot crash | **Phase 2** |
| H-04 | Settlement Physical Reserve | ⚠️ Sai giá nhẹ | ✅ Sai giá nghiêm trọng | **Phase 2** |
| H-05 | Withdraw LP Fee Leak | ⚠️ Fees nhỏ trên testnet | ✅ Admin mất phí | **Phase 2** |

---

# PHẦN B: KẾ HOẠCH CẢI TIẾN CHI TIẾT

## NGUYÊN TẮC THỰC HIỆN

1. **Fix trong (trong → ngoài):** Smart Contract trước → TxBuilder → Bot logic
2. **Không vỡ hệ thống hiện tại:** Mỗi Phase hoàn thành phải chạy được E2E test
3. **Git branch:** Mỗi Phase = 1 branch riêng, merge sau khi test
4. **Test trước khi code:** Viết test case → Code → Run test → Fix → Merge

---

## PHASE 1: VÁ LỖ HỔNG BẢO MẬT CRITICAL (Tuần 1-2)

### Task 1.1: Fix Active Reserve trong Pool Validator ⭐ ƯU TIÊN CAO NHẤT

**Phải fix đầu tiên vì tất cả toán học AMM phụ thuộc vào đây.**

**File sửa:** `smartcontract/validators/pool_validator.ak`

**Thay đổi:**
```aiken
// TRƯỚC (SAI):
let reserve_a_in = get_reserve(pool_input.output.value, asset_a)
let reserve_b_in = get_reserve(pool_input.output.value, asset_b)

// SAU (ĐÚNG):
let physical_a_in = get_reserve(pool_input.output.value, asset_a)
let physical_b_in = get_reserve(pool_input.output.value, asset_b)
let reserve_a_in = physical_a_in - pool_datum.protocol_fees_a
let reserve_b_in = physical_b_in - pool_datum.protocol_fees_b

let physical_a_out = get_reserve(pool_output.value, asset_a)
let physical_b_out = get_reserve(pool_output.value, asset_b)
let reserve_a_out = physical_a_out - output_datum.protocol_fees_a
let reserve_b_out = physical_b_out - output_datum.protocol_fees_b
```

**Áp dụng cho:** `validate_swap`, `validate_deposit`, `validate_withdraw`  
**KHÔNG áp dụng cho:** `validate_collect_fees` (dùng physical reserve vì đang rút fees)

**Cập nhật `validate_collect_fees`:** Thay đổi kiểm tra `last_root_k`:
```aiken
// SAU CollectFees, root_k phải được tính lại dựa trên active reserve mới
// Active reserve KHÔNG THAY ĐỔI sau CollectFees vì:
//   new_active_a = (physical_a - fees_a) - 0 = physical_a - fees_a = old_active_a
// Vậy root_k giữ nguyên là ĐÚNG.
new_datum.last_root_k == old_datum.last_root_k, // Giữ nguyên ✓
```

**Test:** Chạy kịch bản: Swap 10 lần → CollectFees → Swap tiếp → Phải THÀNH CÔNG.

---

### Task 1.2: Fix Double Satisfaction bằng ID Mapping

**File sửa:** `smartcontract/lib/solvernet/validation.ak`

**Thêm hàm mới:**
```aiken
/// Anti-double-satisfaction: mỗi Output phải đính kèm InlineDatum chứa intent_id
pub fn check_payment_output_secure(
  outputs: List<Output>,
  recipient: Address,
  asset: AssetClass,
  min_amount: Int,
  intent_id: ByteArray,
) -> Bool {
  list.any(
    outputs,
    fn(out) {
      and {
        out.address == recipient,
        asset_class_quantity(out.value, asset) >= min_amount,
        out.datum == InlineDatum(intent_id),
      }
    },
  )
}
```

**File sửa:** `smartcontract/validators/escrow_validator.ak`

**Thay đổi tất cả lời gọi `check_payment_output` → `check_payment_output_secure`:**

```aiken
// TRƯỚC:
check_payment_output(tx.outputs, datum.owner, datum.output_asset, output_delivered)

// SAU:
check_payment_output_secure(
  tx.outputs,
  datum.owner,
  datum.output_asset,
  output_delivered,
  datum.escrow_token.asset_name,  // ID duy nhất
)
```

**Áp dụng cho:** `validate_complete_fill`, `validate_reclaim`, `validate_cancel`

**File sửa:** `backend/src/infrastructure/cardano/TxBuilder.ts` → `buildSettlementTx`

**Thay đổi:** Owner payment phải gửi kèm InlineDatum:
```typescript
// TRƯỚC:
tx = tx.pay.ToAddress(payment.address, payment.assets);

// SAU:
const intentId = escrowDatum.fields[0]; // escrow_token
const intentAssetName = (intentId as Constr<Data>).fields[1] as string;
tx = tx.pay.ToAddressWithData(
  payment.address,
  { kind: 'inline', value: Data.to(intentAssetName) },
  payment.assets,
);
```

**Test:** Tạo script Bot ác ý gom 3 Intent cùng user → Tạo 1 output → TX PHẢI FAIL.

---

### Task 1.3: Unlock Batching — `check_burn_multiple`

**File sửa:** `smartcontract/validators/intent_token_policy.ak`

```aiken
// TRƯỚC:
BurnIntentToken -> {
  let minted_tokens = assets.tokens(tx.mint, policy_id)
  check_exactly_one_burn(minted_tokens)
}

// SAU:
BurnIntentToken -> {
  let minted_tokens = assets.tokens(tx.mint, policy_id)
  check_burn_multiple(minted_tokens)
}

/// Cho phép đốt nhiều token cùng lúc — tất cả phải có quantity < 0
fn check_burn_multiple(minted_tokens: dict.Dict<ByteArray, Int>) -> Bool {
  let pairs = dict.to_pairs(minted_tokens)
  // Phải có ít nhất 1 token bị đốt
  when pairs is {
    [] -> False
    _ -> list.all(pairs, fn(pair) {
      let Pair(_, qty) = pair
      qty < 0
    })
  }
}
```

**Giữ nguyên `check_exactly_one_mint`** cho Mint — mỗi TX vẫn chỉ mint 1 Intent Token.

**Test:** Tạo 3 Intent → Solver gom 3 Intent vào 1 TX → Burn 3 tokens → TX PHẢI THÀNH CÔNG.

---

### Task 1.4: Thêm Reclaim cho Order Validator

**File sửa:** `smartcontract/lib/solvernet/types.ak`

```aiken
// TRƯỚC:
pub type OrderRedeemer {
  CancelOrder
  ExecuteOrder { amount_consumed: Int, output_delivered: Int }
}

// SAU:
pub type OrderRedeemer {
  CancelOrder          // index 0
  ExecuteOrder { amount_consumed: Int, output_delivered: Int }  // index 1
  ReclaimOrder         // index 2 — mới
}
```

**File sửa:** `smartcontract/validators/order_validator.ak`

```aiken
when redeemer is {
  CancelOrder -> validate_cancel_order(tx, order_datum, intent_token_policy_id)
  ExecuteOrder { amount_consumed, output_delivered } -> ...
  // THÊM:
  ReclaimOrder -> validate_reclaim_order(tx, order_datum, intent_token_policy_id)
}

/// Permissionless reclaim sau deadline — không cần chữ ký Owner
fn validate_reclaim_order(
  tx: Transaction,
  datum: OrderDatum,
  token_policy_id: PolicyId,
) -> Bool {
  and {
    // 1. Sau deadline
    check_after_deadline(tx.validity_range, datum.params.deadline),
    // 2. Trả remaining_budget cho owner
    check_payment_output_secure(
      tx.outputs,
      datum.owner,
      datum.asset_in,
      datum.params.remaining_budget,
      datum.order_token.asset_name,
    ),
    // 3. Đốt order token
    check_burn_one(tx.mint, token_policy_id, datum.order_token.asset_name),
  }
}
```

**File sửa:** `backend/src/infrastructure/cardano/TxBuilder.ts`

**Thêm hàm `buildReclaimOrderTx`** (dùng Redeemer index 2):
```typescript
const OrderRedeemer = {
  CancelOrder: () => Data.to(new Constr(0, [])),
  ExecuteOrder: (a: bigint, b: bigint) => Data.to(new Constr(1, [a, b])),
  ReclaimOrder: () => Data.to(new Constr(2, [])),  // MỚI
};
```

**File sửa:** `backend/src/infrastructure/cron/ReclaimKeeperCron.ts` → `reclaimExpiredOrders`

Thay `buildCancelOrderTx` → `buildReclaimOrderTx` (dùng Redeemer `ReclaimOrder` thay vì `CancelOrder`).

**Test:** Tạo Order → Chờ quá deadline → Keeper gọi Reclaim → User nhận tiền → TX THÀNH CÔNG.

---

### Task 1.5: Rebuild & Test Smart Contracts

```bash
cd smartcontract
aiken build
aiken check  # Chạy tất cả unit tests
```

Sau đó chạy E2E test trên Preprod Testnet với kịch bản:
1. Tạo Pool → Swap 10 lần → CollectFees → Swap tiếp (CRITICAL-02)
2. Tạo 3 Intent → Batch settlement 3 intent/1 TX (CRITICAL-01 + CRITICAL-03)
3. Tạo Order → Chờ deadline → Keeper Reclaim (CRITICAL-04)

---

## PHASE 2: FIX OFF-CHAIN BOT LOGIC (Tuần 3-4)

### Task 2.1: Tách `AmmMath.ts` — Active Reserve

**Tạo file mới:** `backend/src/solver/AmmMath.ts`

```typescript
export const FEE_DENOMINATOR = 10000n;
export const PROTOCOL_FEE_SHARE = 6n;

export function getActiveReserves(
  physicalA: bigint, physicalB: bigint,
  protocolFeesA: bigint, protocolFeesB: bigint,
): { activeA: bigint; activeB: bigint } {
  return {
    activeA: physicalA - protocolFeesA,
    activeB: physicalB - protocolFeesB,
  };
}

export function calculateSwapOutput(
  reserveIn: bigint, reserveOut: bigint,
  inputAmount: bigint, feeNumerator: bigint,
): bigint {
  const inputWithFee = inputAmount * (FEE_DENOMINATOR - feeNumerator);
  const numerator = reserveOut * inputWithFee;
  const denominator = reserveIn * FEE_DENOMINATOR + inputWithFee;
  return numerator / denominator;
}

export function calculateProtocolFee(
  inputAmount: bigint, feeNumerator: bigint,
): bigint {
  return (inputAmount * feeNumerator / FEE_DENOMINATOR) / PROTOCOL_FEE_SHARE;
}
```

**Cập nhật:** `TxBuilder.ts` → `buildSettlementTx`, `buildWithdrawTx`, `buildDepositTx`, `buildExecuteOrderTx` — tất cả dùng `getActiveReserves()`.

---

### Task 2.2: Fix OrderExecutorCron — Hỗ Trợ Limit + StopLoss

**File sửa:** `backend/src/infrastructure/cron/OrderExecutorCron.ts`

```typescript
// TRƯỚC: Chỉ query DCA
const [activePage, partialPage] = await Promise.all([
  this.orderRepo.findMany({ status: 'ACTIVE', type: 'DCA', ... }),
  this.orderRepo.findMany({ status: 'PARTIALLY_FILLED', type: 'DCA', ... }),
]);

// SAU: Query tất cả order types
const [activeAll, partialAll] = await Promise.all([
  this.orderRepo.findMany({ status: 'ACTIVE', limit: this.batchLimit * 3 }),
  this.orderRepo.findMany({ status: 'PARTIALLY_FILLED', limit: this.batchLimit * 3 }),
]);

// Phân loại và xử lý riêng
const dcaOrders = allOrders.filter(o => o.type === 'DCA' && o.isDcaIntervalRipe(now));
const limitOrders = allOrders.filter(o => o.type === 'LIMIT');
const stopLossOrders = allOrders.filter(o => o.type === 'STOP_LOSS');

// Limit: Kiểm tra giá Pool hiện tại vs target_price
for (const order of limitOrders) {
  const poolPrice = await this.getPoolPrice(order);
  if (meetsLimitPrice(poolPrice, order.targetPriceNum, order.targetPriceDen)) {
    await this.executeOrder(order);
  }
}

// StopLoss: Kiểm tra giá dưới ngưỡng
for (const order of stopLossOrders) {
  const poolPrice = await this.getPoolPrice(order);
  if (poolPrice <= order.targetPriceNum / order.targetPriceDen) {
    await this.executeOrder(order);
  }
}
```

---

### Task 2.3: Fix Limit Order Partial Fill (Simulation)

**File sửa:** `backend/src/infrastructure/cardano/TxBuilder.ts` → `buildExecuteOrderTx`

```typescript
// THAY THẾ hard-code logic:
if (orderTypeIdx === 0) { // Limit Order
  // Tính toán max absorbable amount dựa trên pool depth
  amountConsumed = calculateMaxAbsorbableAmount(
    reserveA, reserveB, direction,
    remainingBudget, feeNumerator,
    targetPriceNum, targetPriceDen,
  );
  // Nếu amountConsumed < remainingBudget → Partial Fill
} else if (orderTypeIdx === 2) { // StopLoss — always complete fill
  amountConsumed = remainingBudget;
}
```

---

### Task 2.4: Payment Output Gửi Kèm InlineDatum (Mirror Task 1.2)

Cập nhật tất cả hàm build TX payment outputs:
- `buildSettlementTx` → `pay.ToAddressWithData(...)` kèm `intent_id`
- `buildReclaimTx` → `pay.ToAddressWithData(...)` kèm `intent_id`
- `buildCancelIntentTx` → `pay.ToAddressWithData(...)` (không cần datum nếu Cancel không đi qua batching — giữ nguyên cho đơn giản)

---

## PHASE 3: KIẾN TRÚC BOT MỚI (Tuần 5-7)

### Task 3.1: Xây Dựng `TxSubmitter` (Global TxQueue)

**Mục đích:** Chấm dứt UTxO Contention vĩnh viễn.

**Tạo file mới:** `backend/src/solver/TxSubmitter.ts`

```typescript
export class TxSubmitter {
  private queue: UnsignedTx[] = [];
  private lockedUtxos: Set<string> = new Set();
  private running = false;
  
  async enqueue(unsignedTx: UnsignedTx): Promise<string> {
    return new Promise((resolve, reject) => {
      this.queue.push({ ...unsignedTx, resolve, reject });
    });
  }
  
  private async processQueue(): Promise<void> {
    while (this.running) {
      const tx = this.queue.shift();
      if (!tx) { await sleep(100); continue; }
      
      // Lấy fee UTxO chưa bị lock
      const feeUtxo = await this.getAvailableFeeUtxo();
      this.lockedUtxos.add(utxoRef(feeUtxo));
      
      try {
        // Attach fee UTxO → Sign → Submit
        const signed = await this.signWithFeeUtxo(tx, feeUtxo);
        const hash = await signed.submit();
        tx.resolve(hash);
      } catch (err) {
        tx.reject(err);
      } finally {
        // Unlock sau khi confirmed hoặc timeout
        setTimeout(() => this.lockedUtxos.delete(utxoRef(feeUtxo)), 120_000);
      }
    }
  }
}
```

**Cập nhật:** SolverEngine, OrderExecutorCron, ReclaimKeeperCron → Thay vì tự sign/submit, ném vào `TxSubmitter.enqueue()`.

---

### Task 3.2: Xây Dựng Netting Engine

**Tạo file mới:** `backend/src/solver/NettingEngine.ts`

```typescript
export interface NettingResult {
  netAmount: bigint;
  netDirection: 'AToB' | 'BToA';
  internalMatches: InternalMatch[];
  remainderSwap: SwapParams | null;
}

export class NettingEngine {
  calculateNet(intents: EscrowIntent[], poolAssetA: string): NettingResult {
    let totalBuyA = 0n;  // Muốn mua asset A (bán B)
    let totalSellA = 0n; // Muốn bán asset A (mua B)
    
    for (const intent of intents) {
      if (intent.inputAsset === poolAssetA) {
        totalSellA += intent.inputAmount;
      } else {
        totalBuyA += intent.inputAmount; // đây là lượng B muốn bán
      }
    }
    
    // Bù trừ nội bộ
    const netAmount = totalSellA > totalBuyA
      ? totalSellA - totalBuyA
      : totalBuyA - totalSellA;
    const netDirection = totalSellA > totalBuyA ? 'AToB' : 'BToA';
    
    // Chỉ đem netAmount đi swap với Pool
    return { netAmount, netDirection, internalMatches: [...], remainderSwap: {...} };
  }
}
```

**Yêu cầu tiên quyết:** CRITICAL-03 (unlock batching) phải hoàn thành trước.

---

### Task 3.3: Virtual Mempool (Redis-backed)

**Tạo file mới:** `backend/src/solver/VirtualMempool.ts`

```typescript
export class VirtualMempool {
  constructor(private readonly redis: Redis) {}
  
  async updatePoolState(poolId: string, reserveA: bigint, reserveB: bigint): Promise<void> {
    await this.redis.hset(`pool:${poolId}`, { reserveA: reserveA.toString(), reserveB: reserveB.toString() });
  }
  
  async getPoolState(poolId: string): Promise<{ reserveA: bigint; reserveB: bigint } | null> {
    const data = await this.redis.hgetall(`pool:${poolId}`);
    if (!data.reserveA) return null;
    return { reserveA: BigInt(data.reserveA), reserveB: BigInt(data.reserveB) };
  }
  
  async rollback(poolId: string): Promise<void> {
    // Xóa state dự phóng, fetch lại từ Blockfrost
    await this.redis.del(`pool:${poolId}`);
  }
}
```

**Cơ chế Reconciliation:**
- Khi TX submit thành công → cập nhật Virtual Mempool
- Nếu sau 2 phút TX không confirm → `rollback()` + fetch on-chain state
- Khi mempool bị stale > 30s → tự động refresh từ Blockfrost

---

### Task 3.4: Transaction Chaining (Nâng cao)

**Chỉ implement SAU KHI Task 3.1-3.3 ổn định.**

**Nguyên lý:**
1. Build TX_1 với exact fee calculation
2. Hash TX_1 → Lấy txHash_1
3. Build TX_2 dùng Output(txHash_1, 0) làm Input
4. Submit TX_1, TX_2 liều → Node Cardano tự sắp xếp

**Rủi ro:** Nếu TX_1 fail → TX_2 invalid. Cần fallback mechanism.

---

## PHASE 4: HOÀN THIỆN VÀ TỐI ƯU (Tuần 8+)

### Task 4.1: Dust Prevention cho Partial Fill

**File:** `escrow_validator.ak` → `validate_partial_fill`

```aiken
let new_remaining = datum.remaining_input - input_consumed

and {
  // ... existing checks ...
  
  // Chống Dust UTxO — đảm bảo remaining đủ để tạo UTxO hợp lệ
  if datum.input_asset.policy_id == #"" {
    // ADA: phải >= min_utxo_lovelace
    new_remaining >= 1_500_000
  } else {
    // Native token: phải >= 1
    new_remaining >= 1
  },
}
```

### Task 4.2: Graph-based Route Optimization

Nâng cấp `RouteOptimizer.ts`:
- Xây dựng graph từ tất cả pools
- Dijkstra cho best price path
- Bellman-Ford để detect negative cycles (arbitrage)
- Split routing cho large orders

### Task 4.3: Admin Decoupling (Reference Input Pattern)

Thay `pool_validator(admin_vkh)` bằng đọc admin từ Settings UTxO qua Reference Input:

```aiken
// pool_validator KHÔNG nhận admin_vkh parameter nữa
// Thay vào đó, đọc từ Reference Input:
let settings_ref = expect_reference_input(tx, settings_nft)
let admin = settings_ref.datum.admin
```

### Task 4.4: Microservice Architecture (Khi lên Production)

Tách monolith thành:
1. **API Server** — Express.js + WebSocket (Render Web Service)
2. **Bot Worker** — SolverEngine + Crons (Render Background Worker hoặc VPS)
3. **Shared DB** — Supabase PostgreSQL
4. **Shared Cache** — Upstash Redis

---

## LỘ TRÌNH TỔNG QUÁT

```
Tuần 1-2: PHASE 1 (Smart Contract Critical Fixes)
  ├── Task 1.1: Active Reserve        [2 ngày]
  ├── Task 1.2: Double Satisfaction    [2 ngày]
  ├── Task 1.3: Unlock Batching       [1 ngày]
  ├── Task 1.4: Order Reclaim         [2 ngày]
  └── Task 1.5: Rebuild + E2E Test    [3 ngày]

Tuần 3-4: PHASE 2 (Off-chain Bot Fixes)
  ├── Task 2.1: AmmMath.ts            [1 ngày]
  ├── Task 2.2: OrderExecutor All     [2 ngày]
  ├── Task 2.3: Limit Partial Fill    [2 ngày]
  └── Task 2.4: Payment InlineDatum   [1 ngày]

Tuần 5-7: PHASE 3 (Architecture Upgrade)
  ├── Task 3.1: TxSubmitter           [3 ngày]
  ├── Task 3.2: Netting Engine        [4 ngày]
  ├── Task 3.3: Virtual Mempool       [3 ngày]
  └── Task 3.4: TX Chaining           [4 ngày]

Tuần 8+: PHASE 4 (Polish & Optimize)
  ├── Task 4.1: Dust Prevention       [1 ngày]
  ├── Task 4.2: Graph Routing         [3 ngày]
  ├── Task 4.3: Admin Decoupling      [2 ngày]
  └── Task 4.4: Microservices         [5 ngày]
```

---

## CHECKLIST KIỂM TRA SAU MỖI PHASE

### Sau Phase 1:
- [ ] `aiken build` thành công, không error
- [ ] `aiken check` — tất cả unit test PASS
- [ ] E2E: Swap → CollectFees → Swap (không crash pool)
- [ ] E2E: 3 intents batch settlement trong 1 TX
- [ ] E2E: Bot malicious Double Satisfaction → TX FAIL
- [ ] E2E: Order Reclaim sau deadline → THÀNH CÔNG
- [ ] E2E: Order Reclaim trước deadline → THẤT BẠI

### Sau Phase 2:
- [ ] Limit Order được khớp tự động khi giá đạt target
- [ ] StopLoss trigger khi giá giảm
- [ ] Limit Order lớn được Partial Fill qua nhiều block
- [ ] Withdraw LP không nhận protocol fees
- [ ] Settlement TX dùng active reserve

### Sau Phase 3:
- [ ] 3 bot submit 10 TX cùng lúc → Không có BadInputsUTxO
- [ ] Netting: 3 Buy + 2 Sell → Pool chỉ swap net amount
- [ ] Virtual Mempool: Bot tính toán batch tiếp theo < 50ms
- [ ] TX Chain: 5 TX liên tiếp confirm trong 1 block

---

## KẾT LUẬN

SolverNet có kiến trúc nền tảng tốt (intent-based, eUTxO-native) nhưng cần vá **4 lỗ hổng Critical** trước khi có thể lên Mainnet. Flow thực hiện:

1. **Ngay bây giờ:** Fix Phase 1 (Smart Contract) — đây là blocking cho mọi thứ khác
2. **Song song:** Có thể bắt đầu viết code cho `AmmMath.ts`, `TxSubmitter.ts` (không phụ thuộc SC)
3. **Sau Phase 1:** Fix Phase 2 → E2E test → Phase 3 → Stress test → Phase 4 → Production

**Ước tính tổng:** 8-10 tuần cho 1 developer full-time, hoặc 4-5 tuần cho team 2 người.
