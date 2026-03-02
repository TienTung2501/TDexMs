# Báo cáo: Chiến lược triển khai hạ tầng chuẩn cho Dịch vụ Miễn Phí (Free-Tier Architecture Survival Guide)

Dự án hiện đang sử dụng các dịch vụ Cloud miễn phí nhưng yêu cầu "Trải nghiệm chuẩn" và "Không sửa logic code khi bơm tiền nâng cấp". Đây là bài toán Architecture liên quan đến **Khả năng chịu lỗi (Resilience)** và **Thiết kế phân cắm (Plug-and-Play / Hexagonal Architecture)**.

## 1. Giới hạn hiện tại của các Dịch vụ & Giải pháp Lập trình

### 1.1 Máy chủ Render.com
- **Đặc tính gói Free:** Máy chủ sẽ bị "Sleep" (đưa vào trạng thái ngủ đông) sau 15 phút không có người truy cập (HTTP Requests). Khi có người truy cập lại, nó sẽ mất 30-60 giây để "Cold Start" khởi động lại NodeJS app.
- **Cách Code Thích Ứng (Resilience):**
  - **Trên giao diện (Frontend):** Nếu máy chủ chưa phản hồi, Frontend KHÔNG ĐƯỢC báo lỗi màu đỏ ngay lặp tức. Phải lập trình chế độ *Intelligent Timeout Retry*: tự động gọi lại 3 lần, mỗi lần cách nhau tăng dần (2s, 4s, 10s,..). Khi đó người dùng chỉ thấy UI đang loading (hiểu nhầm mạng chậm một xíu) thay vì sập ngóm.
  - **Chống ngủ đông (Health Check):** Để giữ Render luôn thức lúc đang có chiến dịch Demo, cài đặt 1 trình Cronjob (ví dụ cron-job.org) ping vào endpoint `/health` của Render 5 phút 1 lần.
  - **Stateless 100%:** Backend tuyệt đối không được phép giữ dữ liệu trong RAM (Memory Variables, array tạm thời). Khi máy chủ ngủ và thức dậy, RAM bị xoá sạch. Mọi thứ từ Session, Cờ hiệu, Transaction đang gom đều phải đẩy vào Supabase PostgreSQL hoặc Upstash Redis.

### 1.2. Kênh Blockfrost (Giới hạn 50.000 Request/ngày)
- **Đặc tính gói Free:** Mặc định dễ dàng "nổ" giới hạn nếu bạn không kiểm soát số người dùng hoặc solver quét utxo liên tục vòng lặp 1 giây / lần.
- **Cách Code Thích Ứng (Caching Layer):**
  - Phải sử dụng bộ đệm trước khi đưa Request thực sự ra ngòi.
  - **Aggregated Queries:** Thay vì ứng dụng hỏi "giá của Cardano" 10 lần một phút, tạo 1 module Cache: Khi request số 1 gọi Blockfrost, dữ liệu được ghi vào Redis kèm Time-to-Live (TTL) = 30 giây. Các yêu cầu trong vòng 30s sau từ các user/module khác sẽ hút thẳng từ Redis ra. Tiết kiệm tới 99% request rác.
  - **Tách Interface (Agnostic):** Hiện tại ở thư mục `infrastructure/cardano`, chắc chắn phải có `IChainSync` Interface. Khi bạn đổi sang cụm Ogmios/Kupo tự host (hạ tầng Pro), code ở tầng `SolverEngine` tuyệt đối đứng yên, bạn chỉ cắm (plug) class Ogmios Adapter vào là xong.

### 1.3. Upstash Redis (Serverless Data) & Supabase
- **Đặc tính gói Free:** Rất tốc độ cao nhưng lại giới hạn băng thông gửi/nhận mỗi ngày. Supabase thì xịn (AWS hỗ trợ đằng sau) nhưng nếu giữ nề nếp mở kết nối chắp và bỏ ngỏ (Idle Connections) thì sẽ sập rào Limit.
- **Cách Code Thích Ứng:**
  - **Prisma Connection Pooling:** Luôn luôn cấu hình `pgbouncer` thông qua Prisma để Connection Pooling được xử lý thông minh. 
  - **Message Packing (Redis Pub/Sub):** Khi ném dữ liệu WebSockets qua con đường Redis, đừng ném bản ghi Array nguyên cục (Gây tốn băng thông Redis Upstash). Chỉ ném `ID` của Object và loại sự kiện `{event: "FILLED", id: 123}` thay vì `{event: "FILLED", data: { 100 dòng json ... }}`. Frontend nhận tín hiệu sẽ dùng ID update dữ liệu cache của nó, hoặc tự Query lại rất gọn.

---

## 2. Công thức "Lập trình Lõi" Không Bao Giờ Lỗi Thời (Future-Proof Core)
Quy tắc vàng: **Không bao giờ cho phép Logic Nghiệp Vụ (Use Cases / Domain) biết về Công cụ Môi Giới.**

*Ví dụ xấu (Đang diễn ra/Dễ mắc phải):*
```typescript
import { createClient } from '@supabase/supabase-js'; // Sai quy tắc nghiêm trọng
import blockfrost from 'blockfrost-js'; // Sai quy tắc

class SettleIntentUseCase {
   async execute() {
      const data = await blockfrost.getUtxos(); // Logic phụ thuộc vào tên hãng trung gian
   }
}
```

*Ví dụ chuẩn (Enterprise Standard - Không phải đập đi xây lại):*
```typescript
interface IBlockchainProvider {
   getUtxos(address: string): Promise<Utxo[]>;
}

export class SettleIntentUseCase {
   // Nhận vào một provider bất kỳ. Không quan tâm là Blockfrost hay Tự Build.
   constructor(private blockchain: IBlockchainProvider) {} 

   async execute() {
      const data = await this.blockchain.getUtxos(); // Code mãi mãi không đổi
   }
}
```

**Tóm lại:**
Khi xây dựng bản demo với tài nguyên hẹp, yếu tố sống còn là **mọi con đường ra/vào thế giới bên ngoài (API rào cản, Cache, DB, WebSocket)** phải được ngụy trang hoặc đứng đằng sau một cái phễu chặn (Interface/Adapter). Về sau chuyển nhà (Migration) sang hạ tầng mạnh, team của bạn chỉ mất khoảng "2 giờ cấu hình" thay vì "2 tháng đập đi xây lại".