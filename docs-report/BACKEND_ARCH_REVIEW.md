# Đánh giá Backend & Đề xuất Nâng cấp tiêu chuẩn Sàn Giao Dịch

Dựa trên code base NodeJS/Express kết hợp Typescript và tương tác Blockchain, cơ sở hạ tầng Backend hiện đang đóng vai trò khá tốt nhưng chưa đủ độ mượt cho các tác vụ "Real-time Trading".

## 1. Cấu trúc hiện tại (Đánh giá chung)
- **Kiến trúc:** Clean Architecture khá tốt, Domain-Driven Design (DDD) bóc tách Use Cases và Layer rất rõ ràng.
- **Solver Engine:** Xử lý logic tạo/gom TX Cardano bài bản. Có retry, timeout, và catch edge cases như slippage.

Tuy nhiên ở khía cạnh Realtime (Real-time Feedback Loop), hệ thống còn lỏng lẻo.

## 2. Vấn đề Phát hiện Hệ thống Realtime
- **Vấn đề 1: Broadcast lủng củng.** `WsServer.ts` làm nhiệm vụ đẩy cập nhật, nhưng nó bị cô lập. Component `SolverEngine` phải thủ công gọi `this.wsServer.broadcastIntent(...)` khi xử lý xong (trạng thái FILLED). Điều gì xảy ra khi Intent vừa được tạo (CREATED / ACTIVE) từ HTTP Route `POST /intents`? Hay lúc user huỷ (CANCELLED)? -> Không hề có lệnh gọi `broadcastIntent`. Điều này làm frontend hoàn toàn mù tín hiệu chờ.
- **Vấn đề 2: Bottleneck ở Timeout Chain.** Khi TxSubmitter chờ quá 180s cho một Settlement Transaction, hệ thống ném Warning và giữ nguyên trạng thái `FILLING`. Nó không trả lại `ACTIVE`, khiến người dùng có cảm giác "kẹt" mãi mãi nếu TX lỗi ngầm ở on-chain nhưng không báo lại.
- **Vấn đề 3: Thiếu luồng OHLCV (Nến/Nến Realtime).** Lịch sử nến đang được truy vấn qua API. Sàn DEX tiêu chuẩn (PancakeSwap, Uniswap) hay sàn CEX luôn thiết lập bộ tổng hợp nến (Aggregator Candle) để stream tick vào chart qua WebSockets. Chừng nào Backend chưa stream OHLCV, Frontend sẽ luôn bị rách nát dữ liệu trải nghiệm nến.

## 3. Kiến nghị Refactor (Hướng tới Enterprise Scale)

**Cách 1: Triển khai Event Bus bên trong Layer (Domain Events)**
Thay vì để `SolverEngine` và `CreateIntentUseCase` chủ động gọi WS Server một cách rời rạc, hãy sử dụng mô hình sự kiện (Domain Events).
- Khi Entity `Intent` thay đổi trạng thái qua hàm `updateStatus()`, tự động phát đi signal `IntentStatusChanged`.
- Một dịch vụ nhỏ (Event Handler) bắt sự kiện này và ném thẳng sang `WsServer.ts`
=> Toàn bộ vòng đời Intent: `CREATED -> ACTIVE -> FILLING -> FILLED -> EXPIRED/CANCELLED` đều sẽ lập tức real-time.

**Cách 2: Database Change Data Capture (CDC)**
Dùng Prisma Client Extension (hoặc Middleware) cấu hình: Bất kỳ bản ghi nào trong bảng `Intent` hoặc bảng `Swap` có sự thay đổi, lập tức push thông điệp qua Redis Pub/Sub. Các node Backend WebSockets sẽ Listen Redis -> Đẩy cho User. Đây là mô hình Standard cho hệ thống Microservices.

**Cách 3: Cơ chế Nến Aggregation**
Hệ thống nến của một DEX không đọc thuần tuý từ file Log. Tại Backend, cần có 1 Worker `CandleAggregator` chạy liên tục, tiêu thụ các TX đã `FILLED`. Cứ khoảng 100ms nó tổng hợp giá Close hiện tại để bắn WebSocket packet: `{ "channel": "KLINE_1M", "open": X, "high": Y, "low": Z, "close": W, "vol": V }`. 
Browser Frontend Chart sẽ hút trực tiếp JSON packet này để chèn nến.

---
**Tổng Kết:** Backend cần được refactor lại luồng Event Notifications (WebSockets) để rải đều trên tất cả các Service/Use cases thay vì chỉ được tích hợp muộn nằm cô lập ở `SolverEngine`.