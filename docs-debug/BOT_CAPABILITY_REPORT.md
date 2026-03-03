# SolverNet DEX — Bot Capability Report

**Ngày báo cáo:** 24/02/2026  
**Phiên bản:** Backend hiện tại trên branch `testing`

---

## I. TỔNG QUAN HỆ THỐNG BOT

Hệ thống SolverNet DEX backend vận hành **5 service bot** chạy song song:

| # | Bot / Service | Vai trò | Interval |
|---|---|---|---|
| 1 | **SolverEngine** | Thu thập intent → tìm route → build TX settlement → submit & confirm | 15s |
| 2 | **OrderExecutorCron** | Thực thi order (Limit/DCA/StopLoss) khi điều kiện đáp ứng | 60s |
| 3 | **ChainSync** | Đồng bộ trạng thái pool từ on-chain (reserves, fees) vào DB | 30s |
| 4 | **ReclaimKeeperCron** | Đánh dấu intent/order hết hạn → reclaim funds trả về owner | 60s |
| 5 | **FaucetBot** | Yêu cầu test ADA từ faucet (chỉ dùng cho testnet) | 24h |

Ngoài ra còn có: **PriceAggregationCron** (tạo candlestick chart), **PoolSnapshotCron** (lưu snapshot lịch sử pool).

---

## II. PHÂN TÍCH TỪNG BOT: TÍNH NĂNG ĐÃ TRIỂN KHAI vs THIẾU SÓT

### 1. SolverEngine (Intent Settlement)

#### ✅ Đã triển khai:
- Thu thập escrow UTxO từ chain qua Blockfrost
- Parse datum on-chain (EscrowDatum 10 fields)
- Lọc intent hết hạn (deadline check)
- Lọc intent không có DB record (stale UTxO)
- Chỉ xử lý intent có status ACTIVE/FILLING
- Tìm route qua RouteOptimizer (direct swap + multi-hop qua ADA)
- Nhóm batch theo pool (BatchBuilder)
- Build settlement TX (TxBuilder.buildSettlementTx) với:
  - Constant product AMM (match on-chain formula chính xác)
  - Protocol fee closed-form (fixed bug trước đó)
  - Active reserves = physical - protocolFees
  - Anti-double-satisfaction (InlineDatum = intent_id)
  - Owner payment output chính xác
- Sign với solver wallet → submit → await on-chain confirm
- Post-confirm: update DB (FILLED), broadcast WebSocket, write Swap record, update pool reserves, record price tick
- Retry mechanism (3 attempts) với backoff

#### ✅ Đã triển khai trong TxBuilder (partial fill scaffold):
- `buildSettlementTx` có code xử lý partial fill:
  - Check `isPartialFill = maxPartialFills > 0n && fillCount < maxPartialFills`
  - Nếu output drain >100% reserve VÀ `isPartialFill=true` → cap ở 50% reserve, tính ngược `actualInput`
  - Re-output escrow UTxO với updated datum (`fill_count + 1`, `remaining_input - actualInput`)
  - Không burn intent token (token continues vào escrow mới)
  - Tính minimum output pro-rata: `minRequired = minOutput * inputConsumed / inputAmount`

#### ❌ THIẾU SÓT NGHIÊM TRỌNG — Partial Fill cho Intent:

**BUG: RouteOptimizer chặn partial fill ở tầng routing**

Dù TxBuilder đã code xử lý partial fill, nhưng **RouteOptimizer** luôn:
1. Dùng `intent.inputAmount` (original amount) thay vì `intent.remainingInput` để tính output
2. So sánh `best.totalOutput < intent.minOutput` (full minOutput) mà **KHÔNG bao giờ thử partial fill**
3. Nếu pool không đủ liquidity cho full amount → return `null` → solver skip intent

**Hệ quả:** Một intent có `inputAmount=250M tUSDT, minOutput=247.5M tBTC` trên pool chỉ có 176M tBTC → route optimizer tính output = 9.94M (đúng theo AMM) → reject vì < 247.5M → intent KHÔNG BAO GIỜ được fill, dù:
- On-chain validator **HỖ TRỢ** partial fill
- TxBuilder **ĐÃ CODE** partial fill
- Pool có đủ liquidity cho 1 phần (ví dụ fill 50% ≈ nhận 5M tBTC vẫn hợp lệ)

**Nguyên nhân gốc:** RouteOptimizer thiếu tầng logic "nếu full fill không khả thi, thử partial fill với amount tối đa mà pool cho phép".

---

### 2. OrderExecutorCron (Order Execution)

#### ✅ Đã triển khai:
- Query DB cho order ACTIVE / PARTIALLY_FILLED
- **DCA orders:**
  - Check interval ripe (`isDcaIntervalRipe`)
  - Consume đúng `amountPerInterval` (hoặc remaining nếu ít hơn)
  - Partial fill: re-output order UTxO với updated datum (`remaining_budget`, `last_fill_slot`)
- **Limit orders:**
  - Check price condition (`meetsLimitPrice` — cross-multiplication)
  - Tính `maxAbsorbableAmount` — amount tối đa mà vẫn đáp ứng target price
  - Partial fill: nếu `amountConsumed < remainingBudget` → continue order
- **StopLoss orders:**
  - Check trigger price (`triggersStopLoss`)
  - Always full fill (consume all remaining budget)
- Build ExecuteOrderTx → sign → submit → await confirm → update DB
- Protocol fee calculation (closed-form, đã fix)
- Pool datum update (rootK, protocolFees)

#### ✅ Partial fill cho Order — ĐÃ HOÀN CHỈNH:
- TxBuilder.buildExecuteOrderTx xử lý đầy đủ:
  - `isCompleteFill` check → burn hoặc continue token
  - Updated order datum với `newRemainingBudget`
  - Re-output order UTxO nếu partial
  - Limit order: `calculateMaxAbsorbableAmount` tự động giới hạn fill size

#### ⚠️ Hạn chế nhỏ:
- `order.recordExecution()` chỉ tăng `executedIntervals` và check completion — không track exact `amountConsumed` per execution (chỉ dùng `amountPerInterval` cố định)

---

### 3. ChainSync (Pool Reserve Sync)

#### ✅ Đã triển khai (mới fix):
- Parse pool UTxO inline datum (CBOR → Constr fields)
- Đọc physical reserves từ UTxO value
- Extract `protocolFeesA`, `protocolFeesB`, `totalLpTokens` từ datum
- Write tất cả vào DB mỗi 30s
- Auto-promote CREATED/PENDING intents → ACTIVE khi TX confirmed on-chain
- Auto-promote CREATED/PENDING orders → ACTIVE
- Mark expired intents/orders

#### ✅ Hoạt động đúng:
- Log confirm: `physicalA: "176000000"`, `physicalB: "4163826259"`, `protocolFeesA: "27481"`, `hasDatum: true`

---

### 4. ReclaimKeeperCron

#### ✅ Đã triển khai:
- Đánh dấu intent/order hết hạn → EXPIRED
- Build Reclaim TX (permissionless — bất kỳ ai cũng submit được sau deadline)
- Burn intent/order token + trả funds về owner
- Xử lý song song (parallelized reclaims)
- UTxO-already-spent detection (skip nếu escrow đã bị spent)

---

### 5. NettingEngine

#### ✅ Đã triển khai:
- Gom intent buy/sell cùng pool → offset lẫn nhau
- Tính net amount thực sự cần swap qua AMM
- Allocate output pro-rata cho từng escrow
- Partial fill: `singleDirectionPlan` cap output tại 50% reserve nếu drain quá nhiều, giảm `inputConsumed` tương ứng

#### ⚠️ Chưa được tích hợp vào SolverEngine:
- SolverEngine hiện xử lý 1 intent/TX (do `check_exactly_one_burn` constraint)
- NettingEngine được code nhưng **không được gọi** trong `runIteration()`

---

## III. BẢNG TỔNG HỢP TÍNH NĂNG

| Tính năng | Smart Contract | TxBuilder | Solver/Router | Trạng thái |
|---|---|---|---|---|
| **Full fill intent** | ✅ | ✅ | ✅ | 🟢 Hoạt động |
| **Partial fill intent** | ✅ (max 5 fills, min 10%) | ✅ (code xử lý đầy đủ) | ❌ (Router chặn) | 🔴 **KHÔNG HOẠT ĐỘNG** |
| **Limit order (full)** | ✅ | ✅ | ✅ | 🟢 Hoạt động |
| **Limit order (partial)** | ✅ (continue UTxO) | ✅ (maxAbsorbable) | ✅ | 🟢 Hoạt động |
| **DCA order** | ✅ (interval check) | ✅ (amountPerInterval) | ✅ | 🟢 Hoạt động |
| **StopLoss order** | ✅ (full budget) | ✅ | ✅ | 🟢 Hoạt động |
| **Cancel intent** | ✅ (owner sig) | ✅ | N/A (user-initiated) | 🟢 Hoạt động |
| **Cancel order** | ✅ (owner sig) | ✅ | N/A (user-initiated) | 🟢 Hoạt động |
| **Reclaim expired intent** | ✅ (permissionless) | ✅ | ✅ (ReclaimKeeper) | 🟢 Hoạt động |
| **Reclaim expired order** | ✅ (permissionless) | ✅ | ✅ (ReclaimKeeper) | 🟢 Hoạt động |
| **Pool reserve sync** | N/A | N/A | ✅ (ChainSync) | 🟢 Hoạt động |
| **Netting (buy/sell offset)** | N/A | N/A | ✅ (code) / ❌ (not wired) | 🟡 Code sẵn, chưa tích hợp |
| **Multi-hop routing** | N/A | ❌ (chưa code) | ✅ (Router tìm route) | 🟡 Route tìm được, TX chưa build |
| **Deposit liquidity** | ✅ | ✅ | N/A (user-initiated) | 🟢 Hoạt động |
| **Withdraw liquidity** | ✅ | ✅ | N/A (user-initiated) | 🟢 Hoạt động |
| **Collect protocol fees** | ✅ (admin only) | ✅ | N/A (admin-initiated) | 🟢 Hoạt động |

---

## IV. VẤN ĐỀ CẦN SỬA NGAY — PARTIAL FILL CHO INTENT

### Mô tả vấn đề chi tiết

**Smart contract hỗ trợ partial fill hoàn chỉnh:**

```aiken
// escrow_validator.ak — validate_partial_fill()
// ✅ Check fill_count < max_partial_fills
// ✅ Min fill threshold: >= 10% of remaining
// ✅ Continuing escrow UTxO với updated datum
// ✅ Pro-rata min output: min_output * input_consumed / input_amount
// ✅ Intent token continues (NOT burned)
// ✅ Verify datum fields preserved correctly
```

**TxBuilder đã code partial fill:**

```typescript
// TxBuilder.ts — buildSettlementTx()
// ✅ isPartialFill = maxPartialFills > 0n && fillCount < maxPartialFills
// ✅ Cap ở 50% reserve nếu drain quá nhiều
// ✅ Re-output escrow UTxO với updated datum
// ✅ Pro-rata minimum: minRequired = minOutput * actualInput / inputAmount
```

**RouteOptimizer CHẶN partial fill:**

```typescript
// RouteOptimizer.ts — findBestRoute()
// ❌ Luôn dùng intent.inputAmount (ORIGINAL, không phải remainingInput)
// ❌ So sánh best.totalOutput < intent.minOutput (FULL minOutput)  
// ❌ Return null nếu không đủ → solver skip intent hoàn toàn
// ❌ KHÔNG BAO GIỜ thử tính output cho partial amount
```

### Giải pháp đề xuất

Cần sửa `RouteOptimizer.findBestRoute()` để:

1. **Nếu full fill khả thi** → return bình thường (như hiện tại)
2. **Nếu full fill không khả thi** → thử partial fill:
   - Tìm max `inputAmount` mà pool có thể xử lý (≤ 50% active reserve đầu ra)
   - Check min fill threshold: `partialInput >= remainingInput * 10 / 100`
   - Tính pro-rata minOutput: `proRataMin = intent.minOutput * partialInput / intent.inputAmount`
   - Tính AMM output cho `partialInput`
   - Nếu `output >= proRataMin` → return partial route
3. SolverEngine cần truyền `remainingInput` vào route request, không chỉ `inputAmount`

---

## V. CÁC LỖI ĐÃ SỬA TRONG SESSION TRƯỚC

| Bug | Mô tả | File | Trạng thái |
|---|---|---|---|
| Protocol fee mismatch | Off-chain tính `input*fee/10000/6=2500`, on-chain tính `2498` → validator crash | TxBuilder.ts (4 chỗ) | ✅ Fixed |
| ChainSync không sync reserves | `syncPools()` chỉ update txHash — KHÔNG BAO GIỜ đọc reserves từ chain | ChainSync.ts | ✅ Fixed |
| Pool entity dùng physical reserves | `calculateSwapOutput` dùng reserveA/B trực tiếp, không trừ protocolFees | Pool.ts | ✅ Fixed |
| Deadline check bị bỏ | User undo edits → mất deadline check trong SolverEngine | SolverEngine.ts | ✅ Re-added |

---

## VI. KẾT LUẬN

### Tình trạng hiện tại:
- **Order system (Limit/DCA/StopLoss):** Hoạt động tốt, bao gồm partial fill
- **Intent settlement (full fill):** Hoạt động đúng khi pool có đủ liquidity
- **Intent settlement (partial fill):** ❌ **KHÔNG HOẠT ĐỘNG** dù smart contract và TxBuilder đều hỗ trợ — RouteOptimizer chặn ở tầng routing

### Ưu tiên sửa:
1. 🔴 **[CRITICAL]** Implement partial fill routing trong RouteOptimizer
2. 🟡 **[MEDIUM]** Tích hợp NettingEngine vào SolverEngine flow
3. 🟡 **[MEDIUM]** Build multi-hop settlement TX (hiện chỉ route tìm, TX chưa build)
4. 🟢 **[LOW]** Track exact amountConsumed per order execution (thay vì dùng amountPerInterval)
