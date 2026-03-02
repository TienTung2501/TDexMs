# Đánh giá Frontend & Cấu trúc Dự án

Dựa trên các lỗi bạn mô tả trong quá trình test giao diện, dưới đây là nguyên nhân lõi và giải pháp theo tiêu chuẩn doanh nghiệp (Enterprise Standard).

## 1. Phân tích Nguyên nhân Lỗi

### Lỗi 1: Tạo xong intent, Market Trade không cập nhật
- **Nguyên nhân code:** Tab "Market Trades" trong file `trading-footer.tsx` sử dụng custom hook `usePaginatedIntents`. Hook này hoàn toàn **không** có cơ chế tự động gọi lại dữ liệu (`refetchInterval`), cũng không lắng nghe qua WebSockets. Nó chỉ fetch đúng 1 lần khi component được mount. Do đó, dữ liệu trên tab này là tĩnh.
- **Tiêu chuẩn doanh nghiệp:** Các sàn giao dịch hiển thị Orderbook / Recent Trades thông qua **WebSocket streams**. Frontend phải kết nối tới WebSocket server và nối (append) data realtime vào đầu mảng hiển thị mà không cần gửi HTTP Request.

### Lỗi 2: Trong footer, item My Intent fix cứng hiển thị số 2
- **Nguyên nhân code:** Số 2 không phải do hardcode tay, mà do state quản lý dữ liệu kém. Hook `useApi` tự build trong `frontend/src/lib/hooks.ts` dùng `useState` local thay cho Global Cache. Khi bạn tạo intent ở `TradingForm`, component `TradingForm` không có cách nào báo cho `TradingFooter` biết là có intent mới. `TradingFooter` vẫn sử dụng mảng dữ liệu intent cũ được fetch từ trước với độ trễ (polling) 15 giây.
Ngoài ra, Next.js mặc định cache đối tượng `fetch()`, dẫn tới việc dù có gọi lại API sau 15 giây, có thể nó vẫn ném về kết quả cũ (số lượng = 2) từ bộ nhớ đệm HTTP.

### Lỗi 3: Chuyển đổi trạng thái không đúng (FILLING quay liên tục không sang FILLED)
- **Cấu trúc phía Backend:** Backend hiện tại (trong `WsServer.ts` và `SolverEngine.ts`) chỉ thực hiện hành động "phát" (broadcast) WebSockets khi Intent đã hoàn thành (`FILLED` hoặc `PARTIALLY_FILLED`). Hành vi update state `FILLING` hoặc trạng thái pending không có cơ chế broadcast.
- **Cấu trúc phía Frontend:** Vì Frontend (`trading-footer.tsx`) không kết nối WebSockets để lắng nghe intent update, nó hoàn toàn phụ thuộc vào HTTP Polling. Khi Solver xử lý chậm qua 15s hoặc browser cache lại requests, giao diện kẹt vĩnh viễn ở `FILLING`. Khi bạn reload trang (Bypassing HTTP Cache), nó mới lấy đúng state `FILLED` từ DB.

### Lỗi 4: Hiển thị nến cực lâu chưa cập nhật sau khi tạo intent
- **Nguyên nhân code:** Hook `useCandles` trong `hooks.ts` là tĩnh hoàn toàn (không có `refetchInterval` và không được nuôi bởi WebSockets). Lẽ ra biểu đồ nến (OHLCV) phải là realtime. 
- **Thiếu sót Backend:** Backend hiện tại qua WS channel chỉ truyền giá ticker 24h và thông tin Pool, hoàn toàn không đẩy (stream) các điểm giá thành từng "tick" nến (Candlestick data streaming) cho frontend.

---

## 2. Giải pháp Kiến trúc Doanh nghiệp (Enterprise Standards)

Để dự án đạt độ nét của các sàn Dex lớn (như Uniswap, Binance, Hyperliquid), bạn cần thực hiện cú lột xác cấu trúc sau:

### Phía Frontend
1. **Dẹp bỏ Local hook `useApi`, dùng Global Data Caching (React-Query / SWR)**
   - Hệ thống doanh nghiệp xử lý state thông qua Server State Managers (ví dụ `@tanstack/react-query`). 
   - Nếu bạn thực hiện tạo Intent thành công, chỉ cần gõ 1 dòng `queryClient.invalidateQueries({ queryKey: ['intents'] })`, toàn bộ ứng dụng (từ Form đến Footer) sẽ chớp mắt update lại đồng bộ.
   
2. **Triển khai WebSockets toàn diện (Global Scope)**
   - Gói toàn bộ App qua 1 `WebSocketProvider`.
   - Tạo mapping giữa WS message và Global Cache: Khi một event WS nhận tín hiệu `{ type: "intentUpdate", status: "FILLED" }`, Provider tự vào data store sửa trạng thái intent từ `FILLING` sang `FILLED` ngay lập tức mà khỏi cần đợi reload API.
   - Component Candlesticks (VD: thư viện Lightweight Charts) phải kết dính trực tiếp vào luồng stream `channels: ['trades']` để nối điểm data vào nến hiện tại.

3. **Optimistic UI Updates (Cập nhật lạc quan)**
   - Đừng đợi DB hay Blockchain xử lý xong mới render UI. Khi user ấn Submit, ngay tức khắc chèn một dòng vào `Market Trades` / `My Intents` với cờ hiệu `pending...`, nếu lỗi mới vứt ra. Đây là cách các ứng dụng mượt mà không có "độ trễ".
   - Tắt bộ nhớ đệm ẩn của Next.js `fetch` trên client: trong hàm `apiFetch`, đảm bảo thêm cấu hình `cache: 'no-store'`.

### Phía Backend
1. **Bắt sự kiện bằng Change Data Capture (CDC) thay vì App-level log**
   - Đừng gọi hàm `broadcastIntent` lủ khủ ở các file Logic (`SolverEngine.ts`). Ở hệ thống lón, người ta dùng Prisma Middleware hoặc Postgres Triggers kết hợp `Redis Pub/Sub` hoặc `Kafka`. Bất kỳ khi nào row Intent trong DB đổi trạng thái, WS Server tự động bắt luồng để bắn đi. Điều này giảm sự sót lọt trạng thái như cái `FILLING` hiện tại.
2. **WebSocket OHLCV (Nến)** 
   - Cung cấp 1 WS channel `candle`. Gom nhóm các trade thành nến 1 phút và broadcast cho frontend mỗi giây để cột nến "nhảy múa" theo thời gian thực (Giống sàn CEX).

---

Tôi cũng đã tóm tắt và tạo các bản PDF báo cáo chi tiết đính kèm trong thư mục `docs-report`. Mời bạn xem.
