# SolverNet DEX — Phân tích luồng Intent vs Order & Xử lý khi không thể Fill

**Ngày báo cáo:** 24/02/2026

---

## I. KIẾN TRÚC XỬ LÝ SONG SONG

Hệ thống vận hành **2 engine độc lập** xử lý 2 loại giao dịch:

```
┌──────────────────────────────────┐    ┌──────────────────────────────────┐
│       SolverEngine (15s)         │    │    OrderExecutorCron (60s)       │
│  ─────────────────────────────── │    │  ─────────────────────────────── │
│  Xử lý: Intent (swap ngay lập   │    │  Xử lý: Order (DCA, Limit,      │
│  tức qua escrow UTxO)            │    │  StopLoss với điều kiện trigger) │
│                                  │    │                                  │
│  Flow:                           │    │  Flow:                           │
│  1. Collect escrow UTxO on-chain │    │  1. Query DB: ACTIVE +           │
│  2. Filter: stale, expired, DB   │    │     PARTIALLY_FILLED orders      │
│  3. Route: RouteOptimizer        │    │  2. Filter: DCA interval ripe,   │
│  4. Batch: GroupByPool           │    │     Limit price met, StopLoss    │
│  5. Settle 1 intent/TX           │    │     triggered                    │
│  6. Sign → Submit → AwaitConfirm │    │  3. Build TX: TxBuilder          │
│  7. Post-confirm: DB + WS       │    │  4. Sign → Submit → AwaitConfirm │
│                                  │    │  5. Post-confirm: DB update      │
└──────────────────────────────────┘    └──────────────────────────────────┘
         ↑                                        ↑
         │                                        │
    Dùng chung:                              Dùng chung:
    - Solver wallet (cùng seed phrase)
    - Pool UTxO (cùng pool on-chain)
    - Blockfrost API
```

### Ưu tiên (Priority)

| Đặc điểm | SolverEngine (Intent) | OrderExecutorCron (Order) |
|---|---|---|
| **Interval** | 15 giây | 60 giây |
| **Tần suất chạy** | Cao hơn 4x | Thấp hơn |
| **Nguồn dữ liệu** | On-chain UTxO trực tiếp | Database query |
| **Xử lý đồng thời** | Tuần tự 1 intent/TX | Tuần tự tối đa 5 order/tick |
| **Retry** | 3 lần/intent | Retry ở tick tiếp theo |
| **Chia sẻ wallet** | ✅ Cùng solver seed | ✅ Cùng solver seed |
| **Chia sẻ pool UTxO** | ✅ | ✅ |

**KẾT LUẬN:** Intents có ưu tiên cao hơn vì interval ngắn hơn (15s vs 60s). Tuy nhiên, **KHÔNG CÓ CƠ CHẾ ĐỘC QUYỀN**: cả hai engine có thể cùng tranh chấp pool UTxO, gây lỗi "UTxO already spent" → retry.

---

## II. XỬ LÝ KHI KHÔNG THỂ FILL / PARTIAL FILL

### A. Intent không thể fill

| Tình huống | Hành vi hiện tại | Intent bị stuck? |
|---|---|---|
| Pool không đủ liquidity cho full amount | RouteOptimizer return null → skip | ❌ Không stuck, nhưng **không bao giờ được fill** (bug) |
| minOutput cao hơn output thực tế | RouteOptimizer return null → skip | ❌ Không stuck, skip mỗi iteration |
| Không có pool match | RouteOptimizer return null → skip | ❌ Không stuck, skip mỗi iteration |
| TX build fail | Throw error → retry 3 lần → skip | ❌ Không stuck, revert FILLING→ACTIVE |
| TX submit fail | Throw error → revert FILLING→ACTIVE | ❌ Không stuck |
| TX không confirm trong 120s | Revert FILLING→ACTIVE | ❌ Không stuck |
| Deadline hết hạn | SolverEngine skip + ReclaimKeeper xử lý | ❌ Funds được reclaim |

**QUAN TRỌNG:** Intent KHÔNG BAO GIỜ chặn intent khác. Mỗi intent được xử lý độc lập trong vòng lặp `for (const singleIntent of batch.intents)`. Fail 1 intent → continue intent tiếp theo.

### B. Order không thể execute

| Tình huống | Hành vi hiện tại | Order bị stuck? |
|---|---|---|
| Không tìm thấy pool | Log warn → skip → retry tick sau | ❌ Không stuck |
| Limit price chưa đạt | Không qualify → skip | ❌ Bình thường, chờ price |
| DCA interval chưa ripe | Không qualify → skip | ❌ Bình thường, chờ thời gian |
| TX build fail | Throw error → catch → retry tick sau | ❌ Không stuck |
| TX submit fail | Throw error → catch → retry tick sau | ❌ Không stuck |
| TX không confirm 120s | Log warn → retry tick sau | ❌ Không stuck |
| Order hết hạn | `isExpired()` filter → ReclaimKeeper | ❌ Funds được reclaim |

**QUAN TRỌNG:** Order cũng KHÔNG BAO GIỜ chặn order khác. Mỗi order xử lý trong `for (const order of candidates)` với try/catch riêng.

---

## III. VẤN ĐỀ TIỀM ẨN (Contention)

### 1. Pool UTxO Contention
Khi SolverEngine và OrderExecutorCron cùng truy cập pool UTxO đồng thời:
- Engine A dùng pool UTxO (txHash#0) build TX
- Engine B cũng dùng cùng pool UTxO build TX
- Engine A submit thành công → pool UTxO thay đổi thành (txHash2#0)
- Engine B submit → **FAIL** vì UTxO (txHash#0) đã bị spent

**Giải pháp hiện tại:** Retry mechanism — SolverEngine retry 3 lần, OrderExecutor retry ở tick sau.

### 2. Solver Wallet UTxO Contention
Tương tự pool UTxO, solver wallet UTxO cũng bị tranh chấp khi 2 TX cùng dùng.

**Giải pháp hiện tại:** Retry + natural serialization (mỗi engine xử lý tuần tự).

---

## IV. BUG NGHIÊM TRỌNG — PARTIAL FILL KHÔNG HOẠT ĐỘNG CHO INTENT

### Luồng lỗi hiện tại:
```
Intent: 250M tUSDT → tBTC, minOutput=247.5M
Pool: reserveA(tBTC)=176M, reserveB(tUSDT)=4163M

1. IntentCollector: parse → inputAmount=250M, remainingInput=250M
2. RouteOptimizer.findBestRoute():
   - Dùng intent.inputAmount (250M) → Pool.calculateSwapOutput(250M) → output = 9.94M
   - Check: 9.94M < 247.5M (minOutput)
   - Return NULL ← ĐÂY LÀ BUG
3. SolverEngine: skip intent (no route found)

NHƯNG: Smart contract cho phép partial fill:
- Fill 10% = 25M tUSDT → nhận ~1M tBTC (min required = 24.75M * 25M/250M = 2.475M)
- Fill amount mà pool absorbable ≤ 50% output reserve
```

### Cách fix (sẽ thực hiện):
```
RouteOptimizer.findBestRoute():
1. Thử full fill trước (như cũ)
2. Nếu fail → check intent có hỗ trợ partial fill không (maxPartialFills > 0)
3. Tính max absorbable amount = capped at 50% output reserve
4. Check ≥ 10% remaining input (on-chain minimum)
5. Tính pro-rata minOutput = originalMinOutput * partialInput / originalInput
6. Nếu AMM output ≥ pro-rata minOutput → return partial route
```

---

## V. GIẢI PHÁP TỐI ƯU

### Ưu tiên 1: Fix Partial Fill cho Intent (CRITICAL)
- Sửa `RouteOptimizer` thêm partial fill fallback
- Sửa `SolverEngine` để cập nhật DB status thành `PARTIALLY_FILLED` thay vì `FILLED`
- Cần thêm `maxPartialFills` và `fillCount` vào `EscrowIntent` interface

### Ưu tiên 2: Dùng `remainingInput` thay vì `inputAmount`
- `RouteOptimizer` phải dùng `intent.remainingInput` (amount còn lại) thay vì `intent.inputAmount` (amount gốc)
- Điều này cũng fix vấn đề khi intent đã được partial fill 1 lần → lần sau phải dùng remaining

### Ưu tiên 3: Giảm diagnostic logging
- Remove info-level pool reserve logging ở mỗi 5s refresh
- Chuyển về debug level

### Ưu tiên 4 (Tương lai): Wire NettingEngine
- NettingEngine đã code đầy đủ nhưng chưa gọi từ SolverEngine
- Sẽ giảm price impact khi có intent hai chiều (buy + sell)

---

## VI. KẾT LUẬN

1. **Intent và Order KHÔNG chặn nhau** — 2 engine hoàn toàn độc lập
2. **Intent fail KHÔNG chặn intent khác** — xử lý tuần tự với try/catch
3. **Order fail KHÔNG chặn order khác** — tương tự
4. **Contention pool UTxO** là vấn đề duy nhất → đã có retry mechanism
5. **Partial fill cho Intent là bug nghiêm trọng nhất** — smart contract hỗ trợ, TxBuilder đã code, nhưng RouteOptimizer chặn ở tầng routing
