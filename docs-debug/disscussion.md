Hãy thực hiện fix lại các vấn đề liên quan đến hệ thống hiện nay. đang được mô tả khá chi tiết.
Audit hợp đồng thông minh:
Phân tích sâu vào mã nguồn Aiken hiện tại, có 4 lỗ hổng nghiêm trọng sẽ khiến hệ thống thất bại hoặc bị tấn công trên Mainnet. Dưới đây là phân tích chi tiết và mã nguồn (Aiken) để vá từng lỗ hổng.

### 1. Lỗ hổng "Thỏa mãn kép" (Double Satisfaction) - Mức độ: Cực kỳ nguy hiểm

**Phân tích lỗi:**
Trong `functionlib.md`, hàm `check_payment_output` được viết để kiểm tra xem Solver có trả tiền cho người dùng hay không:

```rust
pub fn check_payment_output(outputs: List<Output>, recipient: Address, asset: AssetClass, min_amount: Int) -> Bool {
  list.any(outputs, fn(out) {
    out.address == recipient && asset_class_quantity(out.value, asset) >= min_amount
  })
}

```

Khi chạy cơ chế Batching (gộp 10 Intent vào 1 giao dịch), hợp đồng thông minh của Cardano sẽ xác thực độc lập từng Input. Nếu Solver chỉ tạo **duy nhất 1 Output** chứa số tiền lớn nhất, hàm `list.any` sẽ trả về `True` cho tất cả các Intent của cùng một người dùng. Kết quả là Solver có thể lấy đi 9 phần tiền của các Intent còn lại.

**Cách Fix (Cơ chế ID Mapping):**
Ép buộc mỗi Output trả tiền phải đính kèm một `InlineDatum` chứa chính `asset_name` của Intent Token (đóng vai trò là ID duy nhất).

*Cập nhật file `functionlib.md` (hoặc `validation.ak`):*

```rust
pub fn check_payment_output_secure(
  outputs: List<Output>,
  recipient: Address,
  asset: AssetClass,
  min_amount: Int,
  intent_id: ByteArray, // ID duy nhất từ token name
) -> Bool {
  list.any(
    outputs,
    fn(out) {
      and {
        out.address == recipient,
        asset_class_quantity(out.value, asset) >= min_amount,
        // Ép buộc Output này phải dành riêng cho Intent này
        out.datum == InlineDatum(intent_id), 
      }
    },
  )
}

```

*Cập nhật file `validator.md` (trong `escrow_validator`)*:
Sửa tất cả các chỗ gọi `check_payment_output` thành:

```rust
check_payment_output_secure(
  tx.outputs,
  datum.owner,
  datum.output_asset,
  output_delivered,
  datum.escrow_token.asset_name, // Truyền ID vào đây
)

```

### 2. Sập AMM do trộn lẫn Phí và Thanh khoản - Mức độ: Cực kỳ nguy hiểm

**Phân tích lỗi:**
Trong `pool_validator`, để tính toán hằng số , hệ thống lấy trực tiếp số dư vật lý của UTxO:

```rust
let reserve_a_in = get_reserve(pool_input.output.value, asset_a)

```

Số dư này vô tình bao gồm cả `protocol_fees` (Phí giao thức chưa thu hoạch). Khi Admin gọi lệnh `CollectFees` để rút tiền phí, số dư vật lý giảm xuống, kéo theo  giảm. Ở giao dịch Swap tiếp theo, hàm `verify_constant_product` sẽ thất bại vĩnh viễn vì nó thấy  mới nhỏ hơn  cũ. Ngoài ra, khi LPs rút tiền (`Withdraw`), họ được chia cả phần phí của Admin vì thuật toán chia theo tổng dự trữ.

**Cách Fix (Tách biệt Active Reserve):**
Tính toán "Thanh khoản khả dụng" bằng cách lấy tổng số dư vật lý trừ đi phí giao thức.

*Cập nhật file `validator.md` (trong `pool_validator` phần xử lý redeemer)*:

```rust
// Thay thế đoạn lấy reserve cũ bằng đoạn này:
let physical_a_in = get_reserve(pool_input.output.value, asset_a)
let physical_b_in = get_reserve(pool_input.output.value, asset_b)

// Tách bạch phần thanh khoản thực tế dùng để Swap
let reserve_a_in = physical_a_in - pool_datum.protocol_fees_a
let reserve_b_in = physical_b_in - pool_datum.protocol_fees_b

let physical_a_out = get_reserve(pool_output.value, asset_a)
let physical_b_out = get_reserve(pool_output.value, asset_b)

let reserve_a_out = physical_a_out - output_datum.protocol_fees_a
let reserve_b_out = physical_b_out - output_datum.protocol_fees_b

// Dùng các biến reserve_a_in, reserve_b_in, reserve_a_out, reserve_b_out
// để ném vào các hàm validate_swap, validate_deposit...

```

### 3. Tắc nghẽn Batching do Policy Minting - Mức độ: Nghiêm trọng (Logic)

**Phân tích lỗi:**
Trong `intent_token_policy`, khi Intent được khớp, Policy này yêu cầu kiểm tra xem có đúng **duy nhất 1 token** bị đốt hay không.

```rust
// Hàm cũ chặn đứng việc Batching
check_exactly_one_burn(minted_tokens)

```

Điều này buộc hệ thống Off-chain chỉ được phép đưa 1 Intent vào mỗi Transaction. Nếu đưa 2 Intent, có 2 token bị đốt, Policy sẽ báo lỗi.

**Cách Fix (Cho phép đốt nhiều token cùng lúc):**
*Cập nhật file  (trong `intent_token_policy`)*:

```rust
BurnIntentToken -> {
  let minted_tokens = assets.tokens(tx.mint, policy_id)
  check_burn_multiple(minted_tokens)
}

// Thêm hàm này vào dưới cùng của policy hoặc vào functionlib.md
fn check_burn_multiple(minted_tokens: dict.Dict<ByteArray, Int>) -> Bool {
  // Chỉ cần đảm bảo tất cả các token thuộc policy này trong TX đều bị âm (bị đốt)
  // Không giới hạn số lượng token.
  list.all(dict.to_pairs(minted_tokens), fn(pair) {
    let Pair(_, qty) = pair
    qty < 0
  })
}

```

### 4. Kẹt UTxO Bụi (Dust) ở Partial Fill - Mức độ: Trung bình

**Phân tích lỗi:**
Trong `validate_partial_fill`, hệ thống chỉ kiểm tra lượng tiêu thụ . Tuy nhiên, nếu user đặt lệnh nhỏ (ví dụ 3 ADA), 10% là 0.3 ADA. Số dư còn lại là 2.7 ADA. Nếu bị partial fill nhiều lần, số dư UTxO sẽ tụt xuống dưới mức `min_utxo_lovelace` (1.5 ADA), dẫn đến UTxO không thể tạo ra trên mạng và kẹt vĩnh viễn.

**Cách Fix (Chặn Dust UTxO):**
Đảm bảo UTxO mới sinh ra luôn đạt mức tối thiểu.

*Cập nhật file `validator.md` (trong hàm `validate_partial_fill` của `escrow_validator`)*:

```rust
let new_remaining = datum.remaining_input - input_consumed

and {
  // ... các điều kiện cũ ...
  
  // Thêm điều kiện chống rác UTxO:
  // Nếu là ADA (policy_id rỗng), số lượng còn lại phải >= min_utxo_lovelace
  if datum.input_asset.policy_id == #"" {
    new_remaining >= 1_500_000 // min_utxo_lovelace
  } else {
    // Nếu là native token, số lượng phải >= 1
    new_remaining >= 1
  },
}

```
Ngoài ra tôi đang muốn bổ sung thêm tính năng reclaim cho order để hệ thống có trải nghiệm tốt hơn cho người dùng.
Sau khi cập nhật lại 4 lỗ hổng này trong Aiken, nền tảng Smart Contract sẽ hoàn toàn sẵn sàng cho kiến trúc **Batcher/Netting** ở phía Off-chain. Phía Bot TypeScript cũng sẽ phải thay đổi logic `buildSettlementTx` để gắn thêm `InlineDatum(intent_id)` vào output trả tiền nhằm vượt qua hệ thống bảo vệ mới.


Xử lý cải tiến hệ thống bot hiện nay của hệ thống:
Chào bạn, để chuyển đổi hệ thống Bot của SolverNet từ một bản "chạy thử nghiệm" (Proof of Concept) thành một hệ thống **DEX Batcher/Solver chuẩn Mainnet** có hiệu suất cao, chúng ta cần mổ xẻ tận gốc các vấn đề hiện tại và vẽ lại toàn bộ sơ đồ kiến trúc.

Dưới đây là phân tích chi tiết các lỗ hổng trong code Off-chain hiện tại và Bản thiết kế (Architecture Design) cho hệ thống mới.

---

### PHẦN 1: PHÂN TÍCH CHI TIẾT LỖ HỔNG HỆ THỐNG BOT HIỆN TẠI

Dựa vào các file TypeScript bạn cung cấp, hệ thống đang mắc 4 sai lầm chí mạng về mặt kiến trúc:

#### 1. Xung đột UTxO (UTxO Contention) - Lỗi "Tự bắn vào chân mình"

* **Hiện trạng:** Bạn có 3 tiến trình chạy độc lập: `SolverEngine`, `OrderExecutorCron`, và `ReclaimKeeperCron`. Cả 3 đều tự khởi tạo `Lucid` và dùng chung một ví thông qua `SOLVER_SEED_PHRASE`.
* **Vấn đề:** Trên Cardano, để trả phí mạng (Tx Fee), ví cần chọn một UTxO có chứa ADA. Nếu lúc 12:00:00, cả `SolverEngine` và `OrderExecutorCron` cùng thức dậy và build TX, thuật toán của Lucid sẽ nhặt **cùng một UTxO** trong ví để làm phí cho cả 2 TX. Khi TX đầu tiên được gửi lên mạng, UTxO đó bị tiêu hủy. TX thứ hai sẽ bị node Cardano từ chối với lỗi `BadInputsUTxO`.
* **Hậu quả:** Hệ thống liên tục văng lỗi, các lệnh bị kẹt không thể thực thi khi có tải cao.

#### 2. Tắc nghẽn do chờ đợi On-chain (Synchronous Blocking)

* **Hiện trạng:** Trong `SolverEngine.ts`, sau khi submit một TX, bot gọi `await sleep(2000)` hoặc `await lucid.awaitTx(submittedHash)`.
* **Vấn đề:** Cardano mất khoảng 20 giây để đóng block. Việc bắt Bot phải đứng "ngủ" chờ TX confirm rồi mới chạy vòng lặp tiếp theo làm giảm TPS (Transactions Per Second) của DEX xuống mức thảm hại (chỉ khoảng 2-3 TX/phút).
* **Hậu quả:** Bạn sẽ thua hoàn toàn trong các cuộc chiến chênh lệch giá (Arbitrage) hoặc MEV so với các bot của DEX khác.

#### 3. Batching "Giả cầy" và Không có Bù trừ (No Netting)

* **Hiện trạng:** `BatchBuilder` gom các Intent có chung `poolId` rất tốt. Nhưng sang `SolverEngine`, vòng lặp lại xé nhỏ chúng ra để chạy: `for (const singleIntent of batch.intents) { ... await this.settleBatch(singleBatch); }`. Đồng thời `TxBuilder` cũng chỉ tính giá cho từng lệnh một.
* **Vấn đề:** Không có sự bù trừ. Nếu A muốn bán 100 ADA lấy B, và C muốn bán 100 B lấy ADA. Thay vì khớp 2 người này với nhau Off-chain và không tốn phí Pool, hệ thống của bạn lại đẩy cả 2 lệnh này đập vào Pool tạo ra 2 TX riêng biệt, bắt user chịu trượt giá và phí giao thức vô ích.

#### 4. Hard-code ép buộc khớp lệnh (Limit Order Flaw)

* **Hiện trạng:** Trong `TxBuilder.ts` phần `buildExecuteOrderTx`, code viết: `amountConsumed = remainingBudget;` đối với Limit Order.
* **Vấn đề:** Nó bắt buộc lệnh Limit phải được **Fill 100%**. Nếu user đặt mua 10,000 ADA ở giá X, nhưng Pool hiện tại chỉ có độ sâu (thanh khoản) đủ để mua 2,000 ADA ở mức giá X đó (phần còn lại sẽ bị trượt giá quá X), thì TX sẽ thất bại. Lệnh của user sẽ bị bỏ qua vĩnh viễn thay vì được khớp một phần (Partial Fill).

---

### PHẦN 2: THIẾT KẾ KIẾN TRÚC BOT CHUẨN (STANDARD SOLVER ARCHITECTURE)

Để giải quyết các vấn đề trên, hệ thống không thể chạy theo dạng các Cron Job rời rạc nữa. Nó phải trở thành một **Kiến trúc hướng sự kiện (Event-Driven Architecture)**.

Dưới đây là 4 Module cốt lõi bạn cần xây dựng lại:

#### MODULE 1: Virtual Mempool (Mempool Ảo / Quản lý Trạng thái)

Thay vì chờ Blockfrost trả về dữ liệu on-chain sau mỗi 20 giây, Bot phải tự suy luận trạng thái của Pool.

* **Hoạt động:** Khi bot khởi động, nó lấy `Reserve A` và `Reserve B` của Pool từ on-chain lưu vào RAM (Bộ nhớ tạm).
* **Cập nhật tức thời:** Ngay khoảnh khắc Bot gửi thành công một lệnh Swap lên mạng (dù chưa được confirm), nó lập tức cộng/trừ số dư trong RAM.
* **Lợi ích:** Bot có thể tính toán giá cho Batch tiếp theo ngay lập tức với tốc độ mili-giây dựa trên dữ liệu ở RAM.

#### MODULE 2: Động cơ Bù trừ (Netting Engine)

Đây là "bộ não" thực sự của một Batcher.

* **Quy trình:**
1. Gom tất cả Intent trong Batch có chung Pool.
2. Tính `Total_Buy_A` và `Total_Sell_A`.
3. Lấy chênh lệch: `Net_Amount = abs(Total_Buy_A - Total_Sell_A)`. Xác định chiều Swap thực tế (AToB hoặc BToA).
4. Chỉ lấy cái `Net_Amount` này đem tính toán với công thức `x * y = k` của Pool để ra `Net_Output`.
5. Phân bổ `Net_Output` và phần tiền bù trừ nội bộ trả về cho các user trong Batch theo tỷ lệ đóng góp (Pro-rata).


* **Lợi ích:** Giảm trượt giá cho user gần như bằng 0 nếu khối lượng Mua/Bán cân bằng. User sẽ yêu thích DEX của bạn vì tỷ giá khớp lệnh quá tốt.

#### MODULE 3: Transaction Chaining (Chuỗi giao dịch)

Cardano hỗ trợ việc chi tiêu một UTxO dù nó còn chưa được đóng vào block.

* **Hoạt động:** TX_1 tạo ra một Pool UTxO mới (Bot tự tính trước được `txHash` của TX_1). Thay vì chờ, Bot dùng chính cái `txHash` dự kiến đó làm Input để build TX_2.
* **Lợi ích:** Bạn có thể gửi liên thanh 10 TX lên mạng cùng lúc. Khi đóng block, Node Cardano sẽ tự động sắp xếp chúng theo đúng thứ tự chuỗi.

#### MODULE 4: Hàng đợi TX & Quản lý Fee UTxO (Global TxQueue)

Đập bỏ việc tự ý ký giao dịch ở các hàm Cron.

* **Hoạt động:** `SolverEngine`, `OrderExecutor`, `ReclaimKeeper` giờ đây chỉ làm nhiệm vụ tính toán và sinh ra **Unsigned TX** (Giao dịch chưa ký). Sau đó ném chúng vào một mảng `TxQueue`.
* **Worker duy nhất:** Sẽ có một Class tên là `TxSubmitter` chạy vòng lặp liên tục bốc TX từ Queue ra. Nó sẽ duy trì một danh sách các "UTxO Rác" (Fee UTxOs) trong ví. Nó sẽ nhặt UTxO rác số 1 gắn vào TX_1, UTxO rác số 2 gắn vào TX_2... sau đó mới ký và submit.
* **Lợi ích:** Vĩnh viễn chấm dứt lỗi `BadInputsUTxO` (UTxO Contention).

---

### PHẦN 3: LỘ TRÌNH TRIỂN KHAI CHO TEAM DEV CỦA BẠN

Để code lại, hãy yêu cầu Dev (hoặc AI Copilot) đi theo thứ tự sau để không bị vỡ logic:

1. **Bước 1 (Dọn dẹp):** Viết class `TxSubmitter` và sửa các Cron Job để chúng chỉ ném lệnh vào Queue. Điều này giúp hệ thống hiện tại chạy ổn định ngay lập tức, hết lỗi đụng độ ví.
2. **Bước 2 (Nâng cấp Toán học):** Viết thuật toán Netting bằng TypeScript (tính toán chênh lệch Mua/Bán) thay vì lặp qua từng lệnh. *Lưu ý: Bước này cần Smart Contract Aiken đã được sửa thành `check_burn_multiple` như tôi đã tư vấn ở phiên trước.*
3. **Bước 3 (Order Logic):** Sửa lại logic trong `TxBuilder.ts` đối với Limit Order. Trước khi build TX, bot phải mô phỏng trước xem thanh khoản Pool hiện tại khớp được tối đa bao nhiêu % lệnh Limit này để tạo ra `amountConsumed` linh động (Partial Fill) thay vì ép buộc 100%.
4. **Bước 4 (Tối ưu Tốc độ):** Triển khai Virtual Mempool và Transaction Chaining. Đây là kỹ thuật khó nhất, dành cho giai đoạn cuối khi các logic trên đã chạy mượt.

Bạn thấy bản thiết kế này thế nào? Bạn muốn chúng ta bắt tay vào viết code TypeScript cho **Hàng đợi TxQueue (Chống xung đột ví)** ngay bây giờ, hay muốn đi sâu vào **Toán học Netting (Bù trừ)** trước?

Chào bạn, với tư cách là một Architect, tôi đánh giá việc bạn chọn stack **Render (Free) + Supabase + Upstash Redis** cùng kiến trúc **Monolith** cho giai đoạn Demo là một lựa chọn **RẤT THÔNG MINH và TIẾT KIỆM**.

Tuy nhiên, với đặc thù của một hệ thống **Cardano DEX Bot** (liên tục quét blockchain và ký giao dịch), cấu hình Free này sẽ gặp một số giới hạn vật lý.

Câu trả lời ngắn gọn là: **CÓ, hệ thống này CÓ THỂ ĐÁP ỨNG được cho việc Demo (chạy thử nghiệm, quay video báo cáo, gửi link cho investor xem)**, nhưng bạn phải lường trước các "tác dụng phụ" và biết cách "lách luật" của các dịch vụ Free.

Dưới đây là phân tích chi tiết từng thành phần và rủi ro bạn sẽ gặp phải trong lúc chạy Demo:

---

### 1. Đánh giá các dịch vụ Data (Supabase & Upstash)

**Đánh giá: RẤT TỐT (Dư sức cho Demo)**

* **Supabase (PostgreSQL):** Bản Free cho phép 500MB lưu trữ, đủ để bạn lưu hàng trăm ngàn lệnh Swap/Intent. Tốc độ query rất nhanh và connection pooling tích hợp sẵn giúp chống quá tải kết nối từ Prisma. *Lưu ý nhỏ: Nếu 1 tuần không có ai truy cập, database sẽ bị pause (tạm dừng), bạn phải vào dashboard bật lại.*
* **Upstash (Redis):** Bản Free cho phép 10.000 request/ngày. Vì bạn chỉ dùng nó làm Cache (Virtual Mempool hoặc Rate Limiting), mức này là hoàn toàn thoải mái cho một môi trường có vài chục user test nghiệm.

### 2. Đánh giá Kiến trúc Monolith (Gộp API + WebSocket + Bot vào 1 cục)

**Đánh giá: PHÙ HỢP CHO DEMO, NHƯNG LÀ "QUẢ BOM NỔ CHẬM"**
Trong giai đoạn đầu, kiến trúc Monolith giúp bạn deploy cực nhanh (chỉ cần push code lên Github là Render tự build). Tuy nhiên, code của bạn hiện có:

1. **API & WebSocket Server** (Chờ request từ UI).
2. **SolverEngine** (Chạy vòng lặp `while(this.running)` liên tục gọi Blockfrost).
3. **OrderExecutorCron & ReclaimKeeperCron** (Chạy `setInterval` mỗi 60s).

👉 **Vấn đề:** Các hàm ký giao dịch của Cardano (dùng thư viện WASM bên dưới lớp Lucid) ngốn rất nhiều CPU. Khi Solver bắt đầu tính toán và ký TX, nó có thể chiếm dụng toàn bộ CPU/Thread của Node.js, dẫn đến việc **API bị đơ** hoặc **WebSocket bị đứt kết nối** với người dùng trong vài giây.

### 3. Đánh giá Máy chủ Render (Free Tier) - Nút thắt cổ chai lớn nhất

**Đánh giá: CẦN TINH CHỈNH ĐỂ SỐNG SÓT**
Gói Web Service Free của Render có 3 giới hạn "chết người" đối với Bot DEX của bạn:

* **Giới hạn RAM (512MB):** Ứng dụng Node.js/TypeScript + Prisma Client + thư viện mã hóa Cardano (Lucid/WASM) khi khởi động lên đã ăn khoảng 200MB - 300MB RAM. Khi chạy vòng lặp xử lý mảng dữ liệu lớn, nó có thể phình to. Nếu vượt quá 512MB, Render sẽ tự động **Kill (OOM - Out of Memory)** tiến trình của bạn và khởi động lại.
* **Chế độ Ngủ đông (Cold Start):** Nếu không có request HTTP nào gọi đến API trong 15 phút, Render sẽ cho máy chủ "ngủ". Lúc này, các Cron job và vòng lặp `while` của `SolverEngine` sẽ **chết theo**. Khi có người vào web gửi request, máy chủ mất 30s - 60s để thức dậy.
* **Giới hạn giờ chạy (750 giờ/tháng):** Gói Free cho bạn tổng cộng ~31 ngày chạy liên tục. Nếu tài khoản Render của bạn có deploy 2 dịch vụ Free, bạn sẽ hết giờ chạy vào giữa tháng và hệ thống bị tắt hoàn toàn.

---

### 💡 LỜI KHUYÊN & CÁCH "LÁCH LUẬT" ĐỂ CHẠY DEMO MƯỢT MÀ

Để hệ thống Demo chạy ổn định trên cấu hình hiện tại mà không tốn tiền, bạn hãy áp dụng các mẹo sau:

1. **Chống ngủ đông (Keep-alive):** * Vì `SolverEngine` cần chạy 24/7 để quét lệnh, bạn không thể để Render ngủ.
* *Cách lách:* Dùng dịch vụ bên thứ 3 (như cron-job.org hoặc UptimeRobot - hoàn toàn miễn phí), cứ mỗi 5 phút ping vào endpoint API (ví dụ `/api/health`) của bạn một lần. Máy chủ sẽ thức 24/7.(Đã thực hiện).


2. **Hạ tần suất quét của Bot (Giảm tải CPU/RAM):**
* Đừng để `batchWindowMs` của `SolverEngine` chạy quá nhanh. Hãy set `batchWindowMs = 15000` (15 giây quét 1 lần) thay vì 1-2 giây.
* `intervalMs` của `OrderExecutorCron` và `ReclaimKeeperCron` nên để 60_000 (1 phút) hoặc cao hơn. Demo không cần quá real-time ở các lệnh này.


3. **Bật cờ `--max-old-space-size` cho Node.js:**
* Trong file `package.json` hoặc phần setting Environment của Render, đổi lệnh start thành: `node --max-old-space-size=400 dist/index.js`. Việc này ép Node.js dọn rác (Garbage Collection) sớm hơn, tránh bị Render kill vì quá 512MB RAM.





**Tóm lại:** Cứ tự tin chạy mô hình hiện tại để Demo. Chỉ cần thiết lập thêm UptimeRobot để chống ngủ đông và giám sát RAM một chút là bạn có thể yên tâm đi trình bày sản phẩm!


Bản thiết kế 4 Module này là **xương sống chuẩn mực** của các DEX hàng đầu trên Cardano (như Minswap, Spectrum). Tuy nhiên, vì chúng ta đang nhắm đến tiêu chuẩn **Production (Chạy thực tế có tiền thật)**, bản thiết kế này cần bổ sung thêm các "Cơ chế an toàn" (Safety Nets).

Trong thực tế lập trình trên hệ sinh thái eUTxO của Cardano, lý thuyết thì rất hay nhưng khi code sẽ vấp phải những đặc thù rất khó chịu. Dưới đây là **4 điểm bắt buộc phải tinh chỉnh/bổ sung** vào bản thiết kế của bạn để nó không bị sập khi chạy thật:

### Bổ sung cho MODULE 1: Virtual Mempool phải có "Cơ chế Tự phục hồi" (Reconciliation)

* **Lỗ hổng thiết kế cũ:** Bạn cộng/trừ số dư Pool trên RAM ngay khi gửi lệnh. Nhưng giả sử giao dịch đó bị mạng Cardano từ chối (vì lý do nào đó như lỗi chữ ký, mạng nghẽn, hoặc bị một Bot của sàn khác nẫng tay trên chạy trước), thì **dữ liệu trên RAM của bạn sẽ bị sai lệch hoàn toàn** so với On-chain. Mọi tính toán của các Batch tiếp theo sẽ thất bại dây chuyền.
* **Cách sửa (Update):** 1. Cần một cơ chế **Rollback (Hoàn tác)**. Nếu sau 2 phút TX không được confirm, Bot phải tự động xóa các state dự phóng trên RAM và fetch lại state thật từ Blockfrost.
2. Vì bạn đang dùng **Upstash Redis**, hãy lưu Virtual Mempool vào Redis thay vì RAM thuần của Node.js. Nếu máy chủ Render bị sập/khởi động lại, Bot khi sống dậy sẽ đọc từ Redis và đối soát với Blockfrost để tiếp tục chạy ngay mà không bị gián đoạn.

### Bổ sung cho MODULE 2: Netting Engine cần "Thuật toán tỷ giá nội bộ" (Clearing Price)

* **Lỗ hổng thiết kế cũ:** Bạn lấy phần chênh lệch (`Net_Amount`) ném vào Pool để ra `Net_Output`. Sau đó chia `Net_Output` cho user theo tỷ lệ. Tuy nhiên, những user bị "khớp nội bộ" (bù trừ cho nhau off-chain) lấy tỷ giá nào để chia tiền? Nếu chia không khéo, sẽ có user nhận được ít hơn `min_output` mà họ yêu cầu, dẫn đến Smart Contract Escrow đá văng TX của bạn.
* **Cách sửa (Update):** Bot phải có một thuật toán tính **Giá Thanh Toán (Clearing Price)**.
* Giá này thường lấy bằng **Giá hiện tại của Pool** (trước khi swap).
* Bot sẽ lấy tiền của người Bán trả thẳng cho người Mua theo tỷ giá này. Phần `Net_Amount` đem lên Pool swap ra được bao nhiêu sẽ được dùng để bù đắp, nếu dư ra (Surplus) thì Bot (Admin) sẽ bỏ túi phần này như một dạng lợi nhuận chênh lệch giá (MEV/Arbitrage).



### Cảnh báo cực mạnh cho MODULE 3: Transaction Chaining & Bất biến Hash

* **Lỗ hổng khi code thực tế:** Ở Ethereum, bạn dự đoán TX Hash rất dễ dựa vào Nonce. Nhưng ở Cardano, **TX Hash được tạo ra từ việc băm (hash) TOÀN BỘ cấu trúc giao dịch**. Nếu phí giao dịch (Fee) thay đổi 1 lovelace, hoặc kích thước chữ ký bị lệch 1 byte, TX Hash sẽ thay đổi.
Nếu TX_1 bị thay đổi Hash ở phút chót, thì Input của TX_2 (đang trỏ vào Hash cũ của TX_1) sẽ trở thành **Input rác (BadInputs)** và TX_2 sẽ thất bại.
* **Cách sửa (Update):** Khi code TxBuilder cho Chaining, Dev của bạn phải **tính toán chính xác tuyệt đối** Phí giao dịch (Exact Fee) và mô phỏng chữ ký (Dummy Signatures) của TX_1 trước khi lấy Hash đó đi build TX_2. Thư viện `Lucid` có hỗ trợ việc này, nhưng đòi hỏi dev phải rất chắc tay.

### Bổ sung cho MODULE 4: UTxO Locking (Khóa Fee UTxO)

* **Lỗ hổng thiết kế cũ:** TxSubmitter chạy vòng lặp lấy UTxO rác để làm phí cho TX_1, TX_2. Nhưng nếu thư viện Lucid không biết UTxO đó "đang chờ xử lý", nó có thể vô tình lấy lại chính cái UTxO rác đó để làm phí cho một TX khác.
* **Cách sửa (Update):** `TxSubmitter` phải duy trì một danh sách **Locked UTxOs** (lưu trên Redis).
* Khi UTxO `#A` được dùng làm phí cho TX_1  Đưa `#A` vào danh sách Locked.
* Khi TX_2 được build, Bot bỏ qua `#A` và lấy UTxO `#B`.
* Chỉ mở khóa `#A` khi TX_1 đã confirm on-chain hoặc quá hạn (Timeout).



---

### TỔNG KẾT BẢN THIẾT KẾ CUỐI CÙNG (FINAL ARCHITECTURE)

Hệ thống của bạn sau khi tinh chỉnh sẽ hoạt động như một cỗ máy in tiền thực thụ:

1. **Nhận lệnh (Collectors):** Các Cron/Subscribers thu thập Intent/Order và ném vào DB/Queue.
2. **Động cơ Bù trừ & Tính toán (Netting & Virtual Mempool):** Bot lấy lệnh ra, tự tính toán bù trừ nội bộ  Sinh ra giá trị tịnh (Net Amount)  Mô phỏng Swap trên Mempool Ảo (Redis).
3. **Hàng đợi sinh Hash (Deterministic Chaining):** `TxBuilder` tạo Unsigned TX_1  Tính chính xác Fee  Chốt TX_1 Hash  Truyền Hash này làm Input cho TX_2.
4. **Hàng đợi Submit (TxSubmitter & UTxO Manager):** Ký hàng loạt TX bằng các Fee UTxO độc lập (đã bị khóa trên RAM/Redis)  Bắn liên thanh lên mạng Cardano.
5. **Đồng bộ & Tự chữa lành (State Reconciler):** Lắng nghe Blockfrost. Nếu TX_1 thành công  Cập nhật DB. Nếu TX_1 thất bại  Rollback Virtual Mempool, mở khóa Fee UTxO và chạy lại quy trình.

Sửa lại logic liên quan đến các thành phần build giao dịch và sửa lại các API backend tương ứng.