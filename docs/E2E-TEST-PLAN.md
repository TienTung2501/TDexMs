# E2E Test Plan — SolverNet DEX

**Version:** 1.0  
**Date:** 2026-02  
**Scope:** Full system — Smart Contracts + Backend API + Frontend + WebSocket + Solver

---

## 1. Mục tiêu (Test Goals)

| Mục tiêu | Mô tả |
|---|---|
| Chức năng | Mọi user flow chính hoạt động end-to-end trên Cardano Preprod |
| Tích hợp | Frontend ↔ Backend API ↔ Blockchain ↔ Smart Contract |
| Hiệu suất | API response < 500ms, Quote < 200ms |
| Bảo mật | Rate limit, JWT auth, input validation |
| Độ bền | Background services (Solver, ChainSync, FaucetBot) không crash |

---

## 2. Môi trường kiểm thử (Test Environment)

| Layer | URL / Endpoint |
|---|---|
| Frontend | http://localhost:3000 (Next.js dev) |
| Backend API | http://localhost:3001 (Express) |
| Database | PostgreSQL (Supabase free tier / local Docker) |
| Blockchain | Cardano Preprod (`CARDANO_NETWORK=preprod`) |
| Blockfrost | `https://cardano-preprod.blockfrost.io/api/v0` |
| Faucet | `https://faucet.preprod.world.dev.cardano.org` |

---

## 3. Điều kiện tiên quyết (Preconditions)

- [ ] Backend chạy: `pnpm dev` trong `backend/`
- [ ] Frontend chạy: `pnpm dev` trong `frontend/`
- [ ] Database migrations đã chạy: `pnpm db:migrate`
- [ ] `.env` có đủ: `DATABASE_URL`, `BLOCKFROST_PROJECT_ID`, `SOLVER_SEED_PHRASE`, `SOLVER_ADDRESS`
- [ ] Ít nhất 1 pool đã được tạo trong DB với `state = ACTIVE`
- [ ] FaucetBot đã nạp ADA vào `SOLVER_ADDRESS` (hoặc nạp thủ công qua faucet)

---

## 4. Kịch bản kiểm thử (Test Scenarios)

---

### TC-01: Health Check

**Mục tiêu:** Backend API đang chạy và tất cả services kết nối được.

**Bước thực hiện:**
1. `GET /v1/health`

**Kết quả mong đợi:**
```json
{
  "status": "ok",
  "services": {
    "database": "ok",
    "blockfrost": "ok",
    "cache": "ok | degraded"
  }
}
```

**Pass/Fail:** status = "ok"

---

### TC-02: Danh sách Pools

**Mục tiêu:** Pools page hiển thị đúng danh sách pool từ database.

**Bước thực hiện:**
1. Truy cập `http://localhost:3000/pools`
2. Kiểm tra danh sách pools hiển thị
3. Kiểm tra: tên token KHÔNG phải dạng hex (e.g. "484f534b59")
4. Kiểm tra: icon token hiển thị (không phải 🪙 generic)
5. Click vào 1 pool → xem chi tiết

**Bước API tương ứng:**
- `GET /v1/pools?state=ACTIVE` → trả về `data[].assetA.ticker` phải có giá trị

**Kết quả mong đợi:**
- Hiển thị đúng số pool có trong DB
- Ticker hiển thị dạng human-readable (ví dụ "HOSKY", "ADA", "tBTC")
- TVL, Volume, APY hiển thị

---

### TC-03: Token Select Dialog

**Mục tiêu:** Dialog chọn token chỉ hiển thị token có trong pool thực tế.

**Bước thực hiện:**
1. Truy cập trang giao dịch (`/`)
2. Click nút chọn token (input hoặc output)
3. Dialog mở ra
4. Kiểm tra token list

**Kết quả mong đợi:**
- Chỉ thấy ADA + các token có trong pool thực tế
- Không thấy 13 mock tokens (tUSDT, tPOLYGON, etc.) nếu chúng không có trong pool
- Tên token không phải hex bytes
- Nút chọn token không bị đẩy ra ngoài layout

---

### TC-04: Swap Quote Calculation

**Mục tiêu:** Nhập số lượng swap → hiển thị đúng số lượng nhận được (≠ 0).

**Bước thực hiện:**
1. Chọn cặp token có pool (ví dụ ADA/HOSKY)
2. Nhập `inputAmount = 100`
3. Chờ 400ms (debounce)
4. Kiểm tra output field

**Kết quả mong đợi:**
- Output ≠ 0
- Price impact hiển thị (ví dụ "0.12%")
- Nếu server quote available → ưu tiên dùng server quote
- Nếu server quote thất bại → fallback sang local AMM calculation

**API kiểm tra:**
```
GET /v1/quote?inputAsset={policyId.assetName}&outputAsset={policyId.assetName}&inputAmount=100000000
```
Phải trả về `outputAmount > "0"`.

---

### TC-05: Tạo Swap Intent (Market Swap)

**Mục tiêu:** User swap thành công trên blockchain.

**Bước thực hiện:**
1. Kết nối ví Cardano (Eternl/Nami/Lace) có ADA trên Preprod
2. Chọn cặp ADA → HOSKY
3. Nhập 5 ADA
4. Click "Swap" → ký transaction trong ví
5. Chờ transaction confirm (2-3 phút trên Preprod)
6. Kiểm tra `GET /v1/intents?address={walletAddress}` → intent xuất hiện với status PENDING/ACTIVE

**Kết quả mong đợi:**
- Transaction submitted thành công (txHash hiển thị)
- Intent được lưu vào DB với status PENDING
- TradingFooter tab "Open Orders" hiển thị intent mới
- Sau khi solver xử lý: status chuyển sang FILLED

---

### TC-06: Solver Engine Tự động Xử lý Intent

**Mục tiêu:** Solver tự động giải quyết intent đang chờ.

**Bước thực hiện:**
1. Tạo intent (TC-05)
2. Chờ solver cycle (mặc định mỗi 5s)
3. Kiểm tra logs backend: "Solver batch submitted"
4. `GET /v1/intents/{intentId}` → status

**Kết quả mong đợi:**
- Intent status → `FILLED`
- `settlementTxHash` được điền
- WebSocket push event: `{ type: "intent_settled", data: {...} }`

---

### TC-07: Limit Order

**Mục tiêu:** Tạo và điền limit order thành công.

**Bước thực hiện:**
1. Truy cập tab "Advanced" trên trading page
2. Chọn "Limit" order type
3. Cặp ADA → HOSKY, giá = current_price * 1.001 (1% trên market)
4. Nhập amount = 10 ADA
5. Submit order
6. `GET /v1/orders?creator={address}` → order xuất hiện

**Kết quả mong đợi:**
- Order tạo thành công với status ACTIVE
- Hiển thị trong TradingFooter → "My Open Orders"
- Order không bị filled ngay (vì giá chưa đạt)

---

### TC-08: DCA Order

**Mục tiêu:** DCA order chia nhỏ mua theo thời gian.

**Bước thực hiện:**
1. Tạo DCA order: tổng budget 50 ADA, 5 phần, mỗi phần cách 10 phút
2. Submit order
3. Kiểm tra sau 10 phút → `executedIntervals = 1`
4. Kiểm tra sau 20 phút → `executedIntervals = 2`

**Kết quả mong đợi:**
- `totalBudget = 50 ADA`, `amountPerInterval = 10 ADA`
- `intervalSlots = 5`
- Mỗi interval: swap thực tế trên chain, `remainingBudget` giảm dần
- Khi hoàn thành: `executedIntervals = 5`, status = FILLED

---

### TC-09: Tạo Pool Mới

**Mục tiêu:** Admin tạo pool mới thành công.

**Bước thực hiện:**
1. Truy cập `/pools/create`
2. Chọn cặp token (ví dụ ADA/tBTC)
3. Nhập initial amounts
4. Submit (ký transaction)
5. `GET /v1/pools` → pool mới xuất hiện

**Kết quả mong đợi:**
- Pool với id mới có trong danh sách
- state = ACTIVE
- reserveA, reserveB = initialAmounts đã set
- TotalLpTokens > 0

---

### TC-10: Deposit Thanh khoản

**Mục tiêu:** LP deposit thêm thanh khoản vào pool.

**Bước thực hiện:**
1. Truy cập `/pools/{poolId}`
2. Click "Add Liquidity"
3. Nhập amounts (giữ nguyên tỷ lệ)
4. Submit và ký
5. Kiểm tra `GET /v1/pools/{poolId}` → reserves tăng

**Kết quả mong đợi:**
- `reserveA` và `reserveB` tăng đúng với amount deposit
- `totalLpTokens` tăng
- Portfolio của user có LP tokens mới: `GET /v1/portfolio/{address}`

---

### TC-11: Withdraw Thanh khoản

**Mục tiêu:** LP rút thanh khoản thành công.

**Bước thực hiện:**
1. Truy cập `/portfolio` → tab LP Positions
2. Chọn pool còn LP tokens từ TC-10
3. Click "Remove Liquidity" → nhập % muốn rút
4. Submit và ký

**Kết quả mong đợi:**
- `reserveA`, `reserveB` giảm tương ứng
- LP tokens của user giảm
- User nhận lại 2 token tương ứng trong ví

---

### TC-12: Hủy Intent

**Mục tiêu:** User hủy intent chưa được filled.

**Bước thực hiện:**
1. Tạo intent với giá thấp hơn market nhiều (sẽ không bị filled)
2. Trong TradingFooter → "My Open Orders" → click Cancel
3. `GET /v1/intents/{intentId}` → status

**Kết quả mong đợi:**
- Intent status = CANCELLED
- Transaction cancel được submit
- Intent không còn trong Open Orders tab

---

### TC-13: Biểu đồ Giá (Price Chart)

**Mục tiêu:** Chart hiển thị dữ liệu OHLCV thực.

**Bước thực hiện:**
1. Truy cập trang chính
2. Chọn pool có trades
3. Kiểm tra chart không trống

**Kết quả mong đợi:**
- Chart hiển thị candles
- Có thể chuyển timeframe: 4H, 1D, 1W
- Price đúng với `GET /v1/chart/{poolId}/price`

**API kiểm tra:**
```
GET /v1/chart/{poolId}/candles?interval=4h&limit=100
```
Trả về `candles[]` không rỗng.

---

### TC-14: WebSocket Real-time Updates

**Mục tiêu:** WebSocket push cập nhật real-time khi có trades mới.

**Bước thực hiện:**
1. Mở WebSocket connection: `ws://localhost:3001/ws`
2. Subscribe: `{ "type": "subscribe", "channel": "pool_updates", "params": { "poolId": "{id}" } }`
3. Thực hiện 1 swap
4. Lắng nghe message

**Kết quả mong đợi:**
- Nhận message `{ "type": "pool_update", "data": { "reserves": {...} } }`
- Message xuất hiện trong vòng 10 giây sau swap

---

### TC-15: Admin Portal

**Mục tiêu:** Admin operations hoạt động.

**Bước thực hiện:**
1. Truy cập `/admin` (cần JWT token admin)
2. Kiểm tra: Pool list, Intent list, Order list
3. Trigger solver manual: click "Run Solver Now"
4. Kiểm tra analytics dashboard

**Kết quả mong đợi:**
- Admin dashboard load bình thường
- Stats hiển thị: Total TVL, Volume 24h, Fill Rate
- Manual solver trigger: nhận callback "Solver run started"

---

### TC-16: Portfolio Page

**Mục tiêu:** Portfolio hiển thị đúng positions và history.

**Bước thực hiện:**
1. Kết nối ví đã có hoạt động
2. Truy cập `/portfolio`
3. Kiểm tra: Open Orders, History, LP Positions

**Kết quả mong đợi:**
- Tất cả open orders/intents hiển thị
- History có các orders đã filled/cancelled
- LP positions hiển thị đúng shares

---

### TC-17: FaucetBot Tự động nạp ADA Test

**Mục tiêu:** FaucetBot tự động xin ADA từ faucet testnet.

**Bước thực hiện:**
1. Set `FAUCET_TARGET_ADDRESS=addr_test1...` trong `.env`
2. Khởi động backend
3. Kiểm tra log: "Requesting test ADA from faucet..."
4. Sau khi nhận: "✅ Faucet request successful"
5. Kiểm tra balance của `FAUCET_TARGET_ADDRESS` trên Preprod Explorer

**Kết quả mong đợi:**
- Log "FaucetBot started" khi khởi động
- Log request thành công (status 200)
- Balance tăng ~10,000 ADA test
- Nếu request trong vòng 24h: log "⏳ Faucet rate-limited" (không crash)

---

### TC-18: Rate Limiting

**Mục tiêu:** API enforce rate limit đúng.

**Bước thực hiện:**
1. Gửi 101 requests liên tiếp đến `GET /v1/pools` trong 1 phút

**Kết quả mong đợi:**
- 100 requests đầu: status 200
- Request 101: status 429 `{ "error": "Too Many Requests" }`

---

### TC-19: Input Validation

**Mục tiêu:** API từ chối input không hợp lệ.

**Bước thực hiện:**
1. `POST /v1/intents` với `inputAmount = -100` → expect 400
2. `POST /v1/intents` với `senderAddress = "invalid"` → expect 400
3. `GET /v1/pools?state=INVALID_STATE` → expect 400
4. `POST /v1/intents` với body = `{}` → expect 400

**Kết quả mong đợi:**
- Tất cả các request trên đều trả về 400 với message lỗi rõ ràng

---

### TC-20: Graceful Shutdown & Restart

**Mục tiêu:** Backend shutdown sạch, không mất data.

**Bước thực hiện:**
1. Tạo 1 intent
2. Send `SIGTERM` đến process backend (`Kill-Process`)
3. Khởi động lại backend
4. `GET /v1/intents/{intentId}` → intent vẫn còn

**Kết quả mong đợi:**
- Log "Shutting down gracefully..."
- Database connection đóng sạch
- Intent trong DB không bị corrupt
- Restart thành công trong < 10s

---

## 5. Regression Test Matrix

| Component | Tests liên quan | Priority |
|---|---|---|
| Token hex decode | TC-02, TC-03, TC-04 | P0 |
| Swap quote | TC-04 | P0 |
| Pool matching | TC-04, TC-05 | P0 |
| Intent lifecycle | TC-05, TC-06, TC-12 | P0 |
| Pool CRUD | TC-02, TC-09, TC-10, TC-11 | P1 |
| Order types | TC-07, TC-08 | P1 |
| Chart | TC-13 | P1 |
| WebSocket | TC-14 | P1 |
| Admin | TC-15 | P2 |
| Portfolio | TC-16 | P2 |
| FaucetBot | TC-17 | P2 |
| Security | TC-18, TC-19 | P0 |

---

## 6. Thứ tự thực hiện tối ưu (Optimal Execution Order)

```
TC-01 → TC-17 (FaucetBot nạp ADA trước) → TC-02 → TC-03 → TC-04 →
TC-09 → TC-10 → TC-05 → TC-06 → TC-07 → TC-08 → TC-11 → TC-12 →
TC-13 → TC-14 → TC-15 → TC-16 → TC-18 → TC-19 → TC-20
```

---

## 7. Known Limitations (Phạm vi ngoài test plan này)

- **Mainnet:** Tất cả test chạy trên Preprod — không test trên mainnet
- **Concurrency:** Không test multi-user concurrent stress
- **Smart contract formal verification:** Nằm ngoài scope E2E
- **Cross-browser testing:** Chỉ test Chrome/Brave
