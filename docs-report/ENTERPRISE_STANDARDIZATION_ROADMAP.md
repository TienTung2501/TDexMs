# Lộ trình Chuẩn hóa Enterprise (Enterprise Standardization Roadmap)

Mục tiêu của tài liệu này là định hướng dự án nâng cấp từ một phiên bản "chạy được" (Functional) sang "chạy chuẩn" (Enterprise-grade) với các triết lý thiết kế giúp **phân tách hoàn toàn Code Logic và Cơ sở hạ tầng (Infrastructure)**. Khi dự án phát triển và được bơm vốn để nâng cấp server, bạn sẽ không cần phải đập đi viết lại code.

---

## Giai đoạn 1: Lột xác Frontend - "Phản hồi Không Độ Trễ"
Mục tiêu là mang lại trải nghiệm 100% thời gian thực và quản lý băng thông mạng một cách thông minh (rất quan trọng khi dùng hàng Free).

### 1.1. Triển khai Server-State Manager
- **Công việc:** Loại bỏ hoàn toàn custom hook `useApi` đang dùng `useState/useEffect`. Chuyển sang sử dụng thư viện chuyên nghiệp như **TanStack React Query** hoặc **SWR**.
- **Lợi ích:**
  - Tự động gộp các API calls giống nhau (Deduplication) -> Tiết kiệm request bắn lên Render.
  - Quản lý Cache toàn cục (Global Cache): Khi thực hiện tạo Intent ở Form, gửi 1 lệnh Invalidate -> Footer tự động cập nhật ngay lập tức.
  - Tự động Retry khi call lỗi do máy chủ Render đang "ngủ" (Spin down).

### 1.2. Optimistic UI Updates (Cập nhật Lạc Quan)
- **Công việc:** Áp dụng mô hình chuẩn của mọi sàn ảo. Khi người dùng bấm "Swap / Create Intent":
  - Giả lập dữ liệu trả về và hiển thị ngay bản ghi có trạng thái `PENDING` vào bảng "My Intents" trong 1 miligiây.
  - Gầm ngầm gọi API lên backend. Đảm bảo người dùng không bao giờ phải nhìn thấy spinner quay mòng mòng mà tưởng hệ thống bị đơ.

### 1.3. Global WebSocket Context
- **Công việc:** Cấu hình 1 `WebSocketProvider` duy nhất ở ngoài cùng của App (`layout.tsx`).
- **Lợi ích:** 
  - Khởi tạo kết nối duy nhất thay vì mount/unmount ở từng component.
  - Tự động bắt sự kiện Server Ping/Pong. Khi Render mất kết nối, tự động Reconnect với chiến thuật Exponential Backoff (chờ 1s, rồi 2s, rồi 4s...).
  - Dữ liệu WebSockets đổ thẳng vào bộ nhớ Cache của React Query.

---

## Giai đoạn 2: Tự động hóa Backend & Event-Driven Architecture
Backend phải hành xử như 1 dây chuyền nhà máy (Pipeline), khi một trạm làm xong việc, nó báo cho các trạm khác thay vì "tự chạy đi kiếm" chỗ để báo.

### 2.1. Domain Event Bus (Hệ thống điều phối sự kiện cốt lõi)
- **Công việc:** Thay vì các file Use Cases (`CreateIntentUseCase.ts`, `SolverEngine.ts`) gọi trực tiếp `this.wsServer.broadcastIntent()`, hãy áp dụng **Event-Driven Broker**.
  - Định nghĩa các Domain Events: `IntentCreated`, `IntentFilling`, `IntentFilled`, `IntentFailed`.
  - Bắn sự kiện lên **Redis Pub/Sub** (Hiện tại cấu hình nối vào Upstash Redis).
  - Node process của file kết nối WebSockets sẽ chỉ "Lắng nghe" Redis. Bất kể tương lai bạn có chạy 1 Server (Render) hay 100 Servers (AWS/K8s), WebSockets thả xuống Frontend không bao giờ bị trượt nhịp.

### 2.2. Background Workers (Tách bạch Logic nặng)
- Việc tạo Nến (Candlestick Aggregation) hay quét lại các TX lỗi nên tách hẳn vào hệ thống xếp hàng công việc (Job Queue như BullMQ dựa trên Redis).
- Điều này giúp API của người dùng (khi HTTP gọi lên) trả về ngay lập tức, trong khi con Bot Solver cứ túc tắc chạy ngầm mà không gây tốn RAM/CPU đột biến khiến con bot Render bị Out-of-Memory (đứt gánh).

---

## Giai đoạn 3: Tối ưu hoá cho Free-Tier (Không đổi Code khi Scale)

Với Blockfrost (50k calls/day) và Upstash Redis rớt gói liên tục, phải có cấu trúc Code phòng ngự.

### 3.1. Phân tầng Bộ nhớ (Multi-layer Caching API)
- **Cấu trúc Repository Pattern:** Toàn bộ API gọi ra Blockfrost phải được wrap (bọc) trong một Interface `IBlockchainProvider`. Mọi request lên Blockfrost để lấy Pool Info / UTXO phải qua 1 hàm duy nhất.
- Tại hàm bọc này, ta xây dựng lớp Caching:
  - Nếu dữ liệu đã có trong Redis (Sống 5 giây) -> Trả về luôn (Không tốn lượt gọi Blockfrost. 100 ngàn người kéo vào trang Web cũng chỉ tốn 1 vài lượt gọi / phút).
  - Khéo léo phân biệt dữ liệu "Nóng" (Cần real-time như UTXO của solver) và "Lạnh" (thông tin token logic -> cache vĩnh viễn).
- Tương lai (khi có tiền chạy Node Oura / Ogmios): Bạn chỉ cần viết class `OgmiosBlockchainProvider` implements `IBlockchainProvider` và thay đúng 1 dòng Injector. Không đổi bất cứ chỗ code logic nào.

### 3.2. Cấu trúc Database Agnostic (Phi Tiêu Chuẩn Hóa Cứng DB)
- Dự án tiếp tục duy trì sử dụng Prisma làm ORM là rất chuẩn xác. Không dùng thư viện chuyên biệt `@supabase/supabase-js` cho các logic backend để tránh "Vendor Lock-in". Tương lai chuyển từ Supabase sang Amazon RDS hay một máy chủ Postgres tự cài cũng chỉ việc thay đúng 1 dòng `DATABASE_URL` là chạy mượt.