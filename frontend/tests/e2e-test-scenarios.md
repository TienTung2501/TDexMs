# SolverNet DEX — Comprehensive E2E Test Scenarios

> **Phạm vi:** Bao phủ toàn bộ tính năng hệ thống từ frontend, kiểm thử luồng người dùng → backend API → smart contract on-chain.
>
> **Yêu cầu test:** Cardano Preprod testnet, wallet CIP-30 (Nami/Eternl), backend đang chạy, solver engine active.

---

## 1. WALLET CONNECTION

### TC-W01: Kết nối ví thành công
- **Bước:** Mở app → click "Connect Wallet" → chọn Nami/Eternl → Approve
- **Kỳ vọng:** Header hiển thị address (truncated), balance ADA, native tokens. Tất cả pages hiển thị data theo wallet.

### TC-W02: Ngắt kết nối ví
- **Bước:** Click wallet button → Disconnect
- **Kỳ vọng:** App trở về trạng thái chưa kết nối, tất cả pages hiển thị "Connect Wallet" prompt.

### TC-W03: Chuyển ví (switch account)
- **Bước:** Kết nối ví A → Switch sang ví B trong extension → Quay lại app
- **Kỳ vọng:** App cập nhật address mới, balance mới, dữ liệu portfolio thay đổi.

### TC-W04: Ví không có ADA
- **Bước:** Kết nối ví trống (0 ADA)
- **Kỳ vọng:** Hiển thị "Insufficient ADA balance" khi cố gắng swap/deposit. Không crash.

---

## 2. MARKET SWAP (Intent-Based)

### TC-S01: Swap quote — direct pool
- **Bước:** Chọn token A → token B (có pool trực tiếp), nhập amount
- **Kỳ vọng:** Quote hiển thị output amount, price impact, fee, min received sau 400ms debounce.

### TC-S02: Swap quote — multi-hop via ADA
- **Bước:** Chọn 2 token không có pool trực tiếp nhưng cả 2 đều có pool với ADA
- **Kỳ vọng:** Quote hiển thị "Multi-hop" indicator, 2-hop route, tổng fee cao hơn direct.

### TC-S03: Swap quote — no pool available
- **Bước:** Chọn 2 token không có pool nào
- **Kỳ vọng:** Button hiển thị "No pool available", không cho swap.

### TC-S04: Swap thành công (full flow)
- **Bước:** Nhập swap amount → Click "Swap" → Ký TX trong ví → Đợi confirm
- **Kỳ vọng:**
  1. Toast "Building swap transaction..."
  2. Wallet popup → ký
  3. Toast "Confirming on-chain..."
  4. Toast "Swap submitted!" + TX hash link
  5. Intent xuất hiện trong "My Open Orders" tab với status ACTIVE
  6. Sau khi solver fill: status chuyển FILLED, output token xuất hiện trong balance

### TC-S05: Swap với slippage khác nhau
- **Bước:** Mở settings gear → chọn 0.1% / 0.5% / 1.0% / 3.0% → Thực hiện swap
- **Kỳ vọng:** `minOutput` thay đổi tương ứng. Swap vẫn thành công.

### TC-S06: Swap — flip tokens
- **Bước:** Chọn ADA→SNEK, nhập amount → Click flip button
- **Kỳ vọng:** Input/output tokens swap, amount reset, quote reload.

### TC-S07: Swap — insufficient balance
- **Bước:** Nhập amount lớn hơn balance
- **Kỳ vọng:** Button đỏ "Insufficient {TOKEN} balance", không cho submit.

### TC-S08: Swap — user rejects wallet signature
- **Bước:** Click Swap → Khi wallet popup xuất hiện → Reject
- **Kỳ vọng:** Toast "Transaction was not signed", trở lại trạng thái bình thường.

### TC-S09: Swap — very small amount (min_intent_size check)
- **Bước:** Nhập 0.1 ADA (dưới min_intent_size)
- **Kỳ vọng:** Backend báo lỗi, toast hiển thị error message.

### TC-S10: Swap — high price impact warning
- **Bước:** Nhập amount rất lớn so với pool reserves
- **Kỳ vọng:** Price impact hiển thị đỏ (>5%), cảnh báo người dùng.

---

## 3. ADVANCED ORDERS (Limit / DCA / Stop-Loss)

### TC-O01: Create Limit Order
- **Bước:** Tab "Limit" → Chọn token pair → Nhập amount → Set target price → Chọn deadline 3d → "Place Order"
- **Kỳ vọng:** TX build + sign + submit thành công. Order xuất hiện trong Orders page ACTIVE.

### TC-O02: Limit Order — auto execution by solver
- **Bước:** Tạo Limit Order với target price >= current price (to be filled immediately)
- **Kỳ vọng:** OrderExecutorCron (~60s) detect và execute. Order chuyển FILLED. Output token xuất hiện.

### TC-O03: Limit Order — partial fill
- **Bước:** Tạo Limit Order lớn hơn pool liquidity có thể handle trong 1 TX
- **Kỳ vọng:** Order chuyển PARTIALLY_FILLED, remaining budget giảm. Tiếp tục fill trong các cycle sau.

### TC-O04: Create DCA Order
- **Bước:** Tab "DCA" → Nhập total budget → Set amount per interval → Chọn interval (6h/12h/24h/48h) → Set target price → "Place Order"
- **Kỳ vọng:** TX thành công. Order ACTIVE. Solver execute từng interval một.

### TC-O05: DCA Order — interval timing
- **Bước:** Tạo DCA order với interval 6h
- **Kỳ vọng:** OrderExecutorCron chỉ execute khi đủ interval (>180 slots từ last fill).

### TC-O06: Create Stop-Loss Order
- **Bước:** Tab "Stop-Loss" → Nhập amount → Set stop price → "Place Order"
- **Kỳ vọng:** TX thành công. Order ACTIVE. Chỉ execute khi price chạm stop threshold.

### TC-O07: Cancel Order — from Orders page (ON-CHAIN TX)
- **Bước:** Orders page → Click Cancel trên active order → Ký TX
- **Kỳ vọng:** Toast "Building cancel order transaction..." → Wallet popup → Ký → Confirm → Order CANCELLED. Funds trả về ví.

### TC-O08: Cancel Order — from Trading Footer (ON-CHAIN TX)
- **Bước:** Trading page → "My Open Orders" tab → Click Cancel → Ký TX
- **Kỳ vọng:** Luồng tương tự TC-O07. Funds trả về on-chain.

### TC-O09: Cancel Intent — from Trading Footer (ON-CHAIN TX)
- **Bước:** Tạo swap intent → Trước khi solver fill → Click Cancel → Ký TX
- **Kỳ vọng:** Intent CANCELLED. Input tokens trả về ví. Intent token burned.

### TC-O10: Order expires → auto-reclaim
- **Bước:** Tạo order với deadline ngắn (vd: 10 phút) → Đợi hết hạn
- **Kỳ vọng:** ReclaimKeeperCron detect expired order → Build reclaim TX → Funds trả về owner.

### TC-O11: Reclaim from Portfolio page
- **Bước:** Portfolio → Open Orders tab → Click "Reclaim" trên expired order → Ký TX
- **Kỳ vọng:** TX build + sign + confirm. Order RECLAIMED. Funds trả về ví.

---

## 4. LIQUIDITY POOLS

### TC-P01: List pools
- **Bước:** Navigate to /pools
- **Kỳ vọng:** Hiển thị danh sách pools với TVL, 24h Volume, APY. Sort hoạt động (tvl/volume/apy).

### TC-P02: Create pool — new pair
- **Bước:** /pools/create → Chọn token A (ADA) + token B (SNEK) → Nhập initial amounts → Fee 0.3% → "Create Pool"
- **Kỳ vọng:**
  1. Initial price hiển thị đúng (amountB / amountA)
  2. TX build + sign: mint Pool NFT + mint LP tokens + tạo pool UTxO
  3. Pool xuất hiện trong list với state ACTIVE
  4. LP tokens xuất hiện trong wallet balance

### TC-P03: Create pool — duplicate pair rejected
- **Bước:** Cố tạo pool với cặp token đã tồn tại
- **Kỳ vọng:** Backend báo lỗi "Pool already exists for this pair".

### TC-P04: Create pool — same token both sides
- **Bước:** Chọn ADA cho cả 2 sides
- **Kỳ vọng:** Error "Tokens must be different".

### TC-P05: Pool detail page
- **Bước:** Click vào 1 pool
- **Kỳ vọng:** Hiển thị stats (TVL, Volume, Fees, APY), price chart, reserves, recent trades.

### TC-P06: Deposit liquidity
- **Bước:** Pool detail → Deposit tab → Nhập token A amount → Token B auto-calculated → "Add Liquidity"
- **Kỳ vọng:**
  1. Amount B auto-fill theo tỷ lệ reserves
  2. Estimated LP tokens hiển thị đúng
  3. TX build + sign: spend pool UTxO + mint LP tokens
  4. Pool reserves tăng, LP tokens trong ví tăng

### TC-P07: Deposit liquidity — first deposit (initial LP)
- **Bước:** Deposit vào pool mới (totalLpTokens = 0)
- **Kỳ vọng:** LP tokens = sqrt(amountA * amountB) - 1000 (minimum liquidity locked forever).

### TC-P08: Withdraw liquidity
- **Bước:** Pool detail → Withdraw tab → Chọn 50% → "Remove Liquidity"
- **Kỳ vọng:**
  1. Estimated receive amounts hiển thị (proportional share)
  2. TX build + sign: spend pool UTxO + burn LP tokens
  3. Receive tokens A + B proportional. LP tokens giảm.

### TC-P09: Withdraw 100% liquidity
- **Bước:** Withdraw 100% LP tokens
- **Kỳ vọng:** Nhận lại toàn bộ phần proportional. LP balance = 0.

### TC-P10: Pool price chart loads
- **Bước:** Pool detail → Xem price chart
- **Kỳ vọng:** Candlestick chart hiển thị (nếu có data từ PriceAggregationCron).

---

## 5. PORTFOLIO

### TC-PF01: Portfolio summary
- **Bước:** Navigate to /portfolio (wallet connected)
- **Kỳ vọng:** Total balance (ADA + USD), capital allocation bar, token distribution chart.

### TC-PF02: Open Orders tab
- **Bước:** Portfolio → Open Orders tab
- **Kỳ vọng:** Hiển thị active intents + orders với progress bars, countdown timers, cancel/reclaim buttons.

### TC-PF03: Cancel from Portfolio (on-chain TX)
- **Bước:** Open Orders → Click Cancel trên active order → Ký TX
- **Kỳ vọng:** TX signed, submitted, confirmed. Order CANCELLED. Funds returned.

### TC-PF04: Reclaim expired from Portfolio
- **Bước:** Open Orders → Click Reclaim trên expired order → Ký TX
- **Kỳ vọng:** TX signed, submitted, confirmed. Order RECLAIMED.

### TC-PF05: Order History tab
- **Bước:** Portfolio → History tab → Filter by Filled / Cancelled / Reclaimed
- **Kỳ vọng:** Danh sách orders lịch sử, status badges, explorer links, avg price.

### TC-PF06: LP Positions tab
- **Bước:** Portfolio → LP Positions tab
- **Kỳ vọng:** Hiển thị LP token balances, pool pair names, share %, estimated values.

### TC-PF07: Navigate to pool from LP position
- **Bước:** LP Positions → Click "Withdraw" trên 1 position
- **Kỳ vọng:** Navigate đến pool detail page tương ứng.

---

## 6. ANALYTICS

### TC-A01: Analytics overview
- **Bước:** Navigate to /analytics
- **Kỳ vọng:** TVL, 24h Volume, 7d Volume, 24h Fees hiển thị đúng. Auto-refresh 30s.

### TC-A02: Intent metrics
- **Bước:** Xem Intent Metrics section
- **Kỳ vọng:** Total intents, filled count, fill rate progress bar.

### TC-A03: Top pools by TVL
- **Bước:** Xem Top Pools section
- **Kỳ vọng:** Top 5 pools sorted by TVL với percentage bars.

### TC-A04: Recent activity
- **Bước:** Xem Recent Activity
- **Kỳ vọng:** Last 10 filled trades với timestamps, amounts, FILLED badge.

---

## 7. TRADING VIEW (Main Page)

### TC-TV01: Price chart display
- **Bước:** Navigate to / → Select pool
- **Kỳ vọng:** Candlestick chart với timeframe selector. Volume histogram.

### TC-TV02: Pseudo orderbook
- **Bước:** Xem orderbook panel
- **Kỳ vọng:** Bid/ask levels aggregated từ active intents/orders. Depth bars.

### TC-TV03: Recent Trades (WebSocket)
- **Bước:** Xem Market Trades tab
- **Kỳ vọng:** Real-time filled trades via WebSocket. New trades appear at top.

### TC-TV04: My Open Orders tab
- **Bước:** My Open Orders tab (wallet connected)
- **Kỳ vọng:** Active intents + orders. Cancel buttons functional (on-chain TX).

### TC-TV05: Order History tab
- **Bước:** Order History tab
- **Kỳ vọng:** Filled + cancelled + expired orders.

---

## 8. ADMIN PANEL

### TC-AD01: Admin authentication
- **Bước:** Navigate to /admin → Kết nối admin wallet
- **Kỳ vọng:** Admin dashboard loads. Non-admin wallet → redirect hoặc error.

### TC-AD02: Admin dashboard metrics
- **Bước:** /admin
- **Kỳ vọng:** TVL, Volume, Active Pools, Pending Fees. 30-day fee growth chart.

### TC-AD03: Deploy Settings (first time)
- **Bước:** /admin/deploy → Set protocol fee (5 bps) + min liquidity (2 ADA) → "Deploy Settings On-Chain"
- **Kỳ vọng:** TX mints Settings NFT, tạo Settings UTxO. Status chuyển "LIVE".

### TC-AD04: Update Global Settings
- **Bước:** /admin/settings → Thay đổi max protocol fee → "Push Protocol Update"
- **Kỳ vọng:** TX spend + re-output Settings UTxO. Version tăng 1.

### TC-AD05: Transfer Factory Admin
- **Bước:** /admin/settings → Nhập new admin VKH → "Update Factory Admin"
- **Kỳ vọng:** Warning hiển thị. TX cập nhật factory datum admin field.

### TC-AD06: Collect Protocol Fees
- **Bước:** /admin/revenue → Select pools → "Execute CollectFees"
- **Kỳ vọng:** TX collect accumulated protocol fees. Pool datum reset fee counters.

### TC-AD07: Burn Pool NFT (Danger Zone)
- **Bước:** /admin/danger → Search pool → Select → Type confirmation → "Execute BurnPoolNFT"
- **Kỳ vọng:** Pool permanently destroyed. NFT burned. Pool disappears from list.

### TC-AD08: Solver Dashboard
- **Bước:** /admin/solver → View status
- **Kỳ vọng:** Engine status (ACTIVE/IDLE), active intents count, queue depth, success rate.

### TC-AD09: Trigger Solver manually
- **Bước:** /admin/solver → "Trigger Solver Now"
- **Kỳ vọng:** Immediate solver cycle. Result message shown.

---

## 9. SOLVER ENGINE (Automated — Backend Verification)

### TC-SE01: Solver auto-fills intent
- **Bước:** Tạo swap intent → Đợi solver cycle (15s)
- **Kỳ vọng:** Intent chuyển FILLED. Swap record created. Pool reserves updated. PriceTick recorded.

### TC-SE02: Solver batches multiple intents
- **Bước:** Tạo 3+ intents cùng pool trong thời gian ngắn
- **Kỳ vọng:** Solver batch fill trong 1 TX (nếu budget cho phép).

### TC-SE03: Solver handles partial fill
- **Bước:** Tạo intent lớn hơn 50% pool reserves
- **Kỳ vọng:** Solver partial fill (cap at 50%), intent remains ACTIVE với reduced remaining.

### TC-SE04: OrderExecutor executes ripe DCA
- **Bước:** Tạo DCA order → Đợi interval elapse
- **Kỳ vọng:** OrderExecutorCron execute đúng amountPerInterval.

### TC-SE05: ReclaimKeeper reclaims expired
- **Bước:** Tạo intent/order với deadline ngắn → Đợi hết hạn
- **Kỳ vọng:** ReclaimKeeperCron auto-reclaim. Status → RECLAIMED.

### TC-SE06: ChainSync updates pool state
- **Bước:** Thực hiện swap → Kiểm tra pool txHash/outputIndex
- **Kỳ vọng:** ChainSync (30s) cập nhật pool UTxO reference từ Blockfrost.

---

## 10. WEBSOCKET REAL-TIME UPDATES

### TC-WS01: Subscribe to intent updates
- **Bước:** Mở Market Trades → Tạo swap từ tab khác
- **Kỳ vọng:** Real-time update xuất hiện khi intent được fill.

### TC-WS02: Connection resilience
- **Bước:** Disconnect internet → Reconnect
- **Kỳ vọng:** WebSocket reconnect tự động, data resume.

---

## 11. TOKEN MANAGEMENT

### TC-TK01: Token list loads from backend
- **Bước:** Open token select dialog
- **Kỳ vọng:** Tokens from active pools loaded via `/v1/tokens`. Merged with static metadata.

### TC-TK02: Token search
- **Bước:** Type "SNEK" trong token search
- **Kỳ vọng:** Filter tokens matching ticker/name.

### TC-TK03: Token balances displayed
- **Bước:** Open token select dialog (wallet connected)
- **Kỳ vọng:** Each token shows wallet balance.

---

## 12. ERROR HANDLING & EDGE CASES

### TC-E01: Backend unavailable
- **Bước:** Stop backend → Try actions
- **Kỳ vọng:** Error toasts, graceful degradation, no app crash.

### TC-E02: Blockfrost rate limit
- **Bước:** Trigger many rapid API calls
- **Kỳ vọng:** Backend retries or shows appropriate error.

### TC-E03: Concurrent TX attempts
- **Bước:** Try to submit 2 TXs simultaneously
- **Kỳ vọng:** TxSubmitter FIFO queue prevents double-spend. Second TX queued.

### TC-E04: Stale UTxO (someone else spent it)
- **Bước:** Build TX → Wait for solver to spend the same UTxO → Try to submit
- **Kỳ vọng:** TX fails gracefully. Error message shown. User can retry.

### TC-E05: Network switch (wrong network)
- **Bước:** Connect wallet on mainnet while app targets preprod
- **Kỳ vọng:** Warning or error shown. Transactions not built.

---

## 13. DATA CONSISTENCY CHECKS

### TC-DC01: Pool reserves match on-chain
- **Bước:** Sau swap → So sánh pool reserves trong DB vs Blockfrost UTxO
- **Kỳ vọng:** Reserves match (after ChainSync cycle).

### TC-DC02: LP token total matches on-chain
- **Bước:** Deposit → So sánh totalLpTokens DB vs actual minted tokens
- **Kỳ vọng:** Exact match.

### TC-DC03: Intent fill amounts match
- **Bước:** Sau solver fill → Kiểm tra output amount vs AMM formula
- **Kỳ vọng:** outputAmount = reserveOut * inputWithFee / (reserveIn * FEE_DENOMINATOR + inputWithFee).

### TC-DC04: Protocol fees accumulate correctly
- **Bước:** Multiple swaps → Check protocolFeeAccA/B vs theoretical
- **Kỳ vọng:** protocolFee = (input * feeNumerator / 10000) / 6 per swap.

### TC-DC05: Candlestick data aggregation
- **Bước:** Sau nhiều swaps → Check candle data
- **Kỳ vọng:** OHLCV aggregated correctly by PriceAggregationCron.

---

## 14. PERFORMANCE & UX

### TC-UX01: Loading states
- **Bước:** Navigate between pages
- **Kỳ vọng:** Skeleton loaders present, no blank screens, no CLS.

### TC-UX02: Auto-refresh intervals
- **Bước:** Để app mở → observe data refreshes
- **Kỳ vọng:** Pools 30s, intents 15s, orders 15s, price 10s, analytics 30s.

### TC-UX03: TX toast lifecycle
- **Bước:** Thực hiện bất kỳ TX nào
- **Kỳ vọng:** Toast stages: Building → Signing → Submitting → Confirmed (with TX hash link).

### TC-UX04: Mobile responsiveness
- **Bước:** Resize browser hoặc dùng mobile device
- **Kỳ vọng:** Layout responsive, no overflow, usable on mobile.

---

## Test Environment Setup

```bash
# 1. Start backend
cd backend && pnpm dev

# 2. Start frontend
cd frontend && pnpm dev

# 3. Verify health
curl http://localhost:3001/v1/health

# 4. Verify solver running
curl http://localhost:3001/v1/admin/solver/status

# 5. Get test ADA from faucet
# (FaucetBot auto-requests every 24h on preprod)
```

## Test Data Requirements

| Item | Details |
|------|---------|
| Admin wallet | Wallet whose VKH matches `ADMIN_VKH` env var |
| Test wallet A | Regular user wallet with ~100 tADA |
| Test wallet B | Second user wallet with ~50 tADA |
| Test tokens | At least 2 native tokens on preprod (or use ADA + any token) |
| Active pool | At least 1 pool with sufficient liquidity for swap testing |
| Settings UTxO | Must be deployed via admin before other operations |
| Factory UTxO | Must be deployed via admin for pool creation |
