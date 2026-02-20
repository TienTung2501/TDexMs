Đây là bản thiết kế "chốt hạ" cho giao diện Trading Terminal, được tinh chỉnh hoàn hảo để đáp ứng trải nghiệm của một nhà giao dịch chuyên nghiệp, đồng thời phản ánh trung thực toàn bộ logic phức tạp của hệ thống Smart Contract bên dưới.

Bố cục tổng thể sẽ được chia làm 3 cột chính ở nửa trên (Khu vực hành động) và 1 bảng kéo dài ở nửa dưới (Khu vực quản lý).

### 1. Header (Thanh thông tin trên cùng)

* **Thông tin thị trường:** Bộ chọn cặp giao dịch (Ví dụ: ADA / USDT), Giá hiện tại (hiển thị to, rõ ràng), Biến động giá 24h (%), Khối lượng giao dịch 24h, và TVL của Pool thanh khoản hiện tại.

---

### 2. Body - Cột Trái: Biểu đồ (Charting Area - Chiếm ~60% màn hình)

Khu vực phân tích kỹ thuật, lấy dữ liệu nến chuẩn OHLCV từ Backend.

* **Tích hợp TradingView:** Hỗ trợ đầy đủ công cụ vẽ và chỉ báo kỹ thuật.
* **Tương tác Smart Contract trực tiếp:** * Hiển thị đường gióng ngang (Horizontal Line) đại diện cho mức giá mục tiêu (`target_price`) của lệnh Limit hoặc Trigger Price của lệnh Stop-loss.
* Hỗ trợ kéo thả đường line này trên biểu đồ, số liệu ở bảng đặt lệnh (Cột Phải) sẽ tự động nhảy theo thời gian thực.


* **Marker Vị thế:** Các điểm icon nhỏ đánh dấu vị trí các lệnh đang chờ khớp (Pending) của người dùng ngay trên biểu đồ.

---

### 3. Body - Cột Giữa: Sổ Lệnh Ảo (Pseudo-Orderbook - Chiếm ~20% màn hình)

Mô phỏng độ sâu thanh khoản bằng cách tổng hợp các UTxO đang chờ từ `escrow_validator` và `order_validator`.

* **Giao diện:** Nửa trên màu đỏ (lệnh bán), nửa dưới màu xanh (lệnh mua), giá thị trường nằm giữa. Hiển thị khoảng 10-15 mức giá gần nhất.
* **Cột dữ liệu:** Giá (Price), Khối lượng (Amount), Tổng tích lũy (Total).
* **Depth Chart:** Biểu đồ mờ làm nền phía sau các con số để trực quan hóa vùng cản/hỗ trợ.

---

### 4. Body - Cột Phải: Bảng Đặt Lệnh (Order Entry - Chiếm ~20% màn hình)

Khu vực tương tác tạo UTxO, được chia làm 4 tab tương ứng với các loại lệnh trên Smart Contract:

* **Tab 1: Market (Swap Ý định)**
* *Tương tác:* Tạo UTxO tại `escrow_validator`.
* *Trường nhập liệu:* Số lượng Bán (Pay) và Số lượng dự kiến Mua (Receive).
* *Cấu hình ngầm:* Icon bánh răng cài đặt mức Trượt giá (Slippage) để Backend tính toán thông số `min_output`.
* *Nút bấm:* **"Sign Intent"**.


* **Tab 2: Limit Order**
* *Tương tác:* Tạo UTxO tại `order_validator`.
* *Trường nhập liệu:* Giá mục tiêu (tương đương `target_price_num / target_price_den`) và Khối lượng lệnh (`remaining_budget`).
* *Trường hiển thị:* **Tổng nhận (Total)**. Đây là ô tự động tính toán (Chỉ đọc) giúp người dùng ước lượng được số tài sản nhận về dựa trên hàm nhân chéo `meets_limit_price` của hợp đồng.
* *Nút bấm:* **"Place Limit Order"**.


* **Tab 3: DCA (Trung bình giá)**
* *Tương tác:* Tạo UTxO tại `order_validator`.
* *Trường nhập liệu:* Tổng vốn đầu tư (`remaining_budget`), Khối lượng mỗi kỳ (`amount_per_interval`), và Tần suất (`min_interval`). *Không có trường hiển thị Tổng nhận dự kiến.*
* *Nút bấm:* **"Start DCA Strategy"**.


* **Tab 4: Stop-Loss (Cắt lỗ)**
* *Tương tác:* Tạo UTxO tại `order_validator`.
* *Trường nhập liệu:* Giá kích hoạt (Trigger Price) và Tổng vốn cần bảo vệ (`remaining_budget`). *Không có trường hiển thị Tổng nhận dự kiến.*
* *Cảnh báo UI:* Chữ đỏ nhắc nhở "Toàn bộ tài sản sẽ được chuyển đổi trong một lần khớp duy nhất khi chạm giá".
* *Nút bấm:* **"Set Stop-Loss"**.


* **Footer Bảng Đặt Lệnh:** Chọn Hạn chót (Deadline) áp dụng cho mọi loại lệnh (VD: Hết hạn sau 1 giờ, 1 tuần).

---

### 5. Footer: Quản Lý Danh Mục & Lịch Sử (Trải dài toàn đáy màn hình)

Bảng dữ liệu theo dõi trạng thái các UTxO sau khi được phát sóng lên mạng lưới, chia làm 3 tab chính:

* **Tab My Open Orders (Lệnh đang chờ của tôi):**
* Hiển thị danh sách các UTxO Escrow và Order.
* **Cột Tiến trình (Progress):** Cực kỳ quan trọng để hiển thị thanh UI phần trăm đối với lệnh Limit khớp một phần hoặc số kỳ đã chạy của lệnh DCA.
* **Cột Hành động:** Cung cấp nút **"Cancel"** (yêu cầu ký ví để tiêu thụ UTxO và đốt token). Riêng với lệnh Market quá hạn, sẽ hiển thị **"Reclaim"** hoặc tự động hiển thị trạng thái "Hệ thống đang hoàn tiền". Lệnh nâng cao quá hạn sẽ hiện cảnh báo đỏ yêu cầu người dùng tự bấm "Cancel".


* **Tab Order History (Lịch sử lệnh):** Danh sách các lệnh đã được Filled (Khớp thành công), Cancelled (Đã hủy), hoặc Reclaimed (Đã thu hồi).
* **Tab Market Trades (Lịch sử thị trường):** Dòng chảy liên tục các lệnh Swap vừa được các Solvers khớp thành công. Có gắn Icon (Badge) để phân biệt rõ đây là lệnh "Khớp Toàn Phần" (Complete Fill) hay "Khớp Một Phần" (Partial Fill).

API contract design:
Chào bạn, đây là một câu hỏi vô cùng thực tế và "trúng phóc" vào nỗi trăn trở của rất nhiều lập trình viên khi chuyển từ lý thuyết sang bắt tay vào code! Bạn đang đi đúng hướng rồi đấy.

Để trả lời cho thắc mắc **"Thiết kế Backend trước hay Frontend trước?"**, trong quy trình phát triển phần mềm chuẩn hiện đại, chúng ta không làm cái nào trước hoàn toàn, mà áp dụng phương pháp **"API-First Design" (Thiết kế ưu tiên API)** hoặc gọi là **"API Contract" (Hợp đồng API)**.

Quy trình chuẩn diễn ra như sau:

1. **Hiểu lõi hệ thống (Smart Contract / Database):** Chúng ta đã làm xong bước này (phân tích file Aiken).
2. **Thiết kế Giao diện (UI/UX):** Chúng ta vừa chốt xong layout UI ở bước trước.
3. **Thiết kế API Contract (Khớp nối):** Từ UI, FE và BE ngồi lại với nhau để thống nhất: "Để cái nút này hoạt động, FE cần gửi lên những trường gì (Input/Payload), dùng phương thức gì (GET/POST), và BE sẽ trả về cái gì (Response JSON)".
4. **Code song song:** Sau khi chốt bản thiết kế API này, team FE cứ làm UI và dùng dữ liệu giả (Mock data) theo đúng chuẩn API đã chốt. Team BE (dùng Rust/Python) cứ thế viết logic và trả ra đúng cấu trúc JSON đó.

Bây giờ, tôi sẽ "mô phỏng" ngay bước số 3 này cho bạn. Chúng ta sẽ lấy chính giao diện **Trading Terminal** vừa thiết kế để "dịch" nó ra thành các API chi tiết nhé.

---

### 1. Nhóm API Hiển thị Dữ liệu (Dùng phương thức `GET`)

Đây là các API dùng để "đổ" dữ liệu lên màn hình khi người dùng vừa mở trang web.

**A. API lấy dữ liệu Biểu đồ (Cột Trái)**

* **Endpoint:** `GET /api/v1/market/candles`
* **Mục đích:** Đổ dữ liệu vào TradingView chart.
* **Input (Query Parameters) FE gửi lên:**
* `pair`: "ADA_USDT"
* `resolution`: "15m" (Khung thời gian 15 phút)
* `limit`: 500 (Lấy 500 nến gần nhất)


* **Response BE trả về (JSON):**
```json
{
  "success": true,
  "data": [
    {"time": 1708416000, "open": 0.51, "high": 0.52, "low": 0.50, "close": 0.515, "volume": 12000},
    // ... 499 nến khác
  ]
}

```



**B. API lấy Sổ lệnh Ảo (Cột Giữa)**

* **Endpoint:** `GET /api/v1/market/orderbook`
* **Mục đích:** Gom các UTxO Intent từ Smart Contract thành các bậc giá chờ khớp.
* **Input FE gửi lên:** `pair=ADA_USDT`
* **Response BE trả về (JSON):**
```json
{
  "success": true,
  "data": {
    "asks": [ // Lệnh bán (Màu đỏ ở trên)
      {"price": 0.520, "amount": 10000, "total": 25000},
      {"price": 0.518, "amount": 15000, "total": 15000}
    ],
    "bids": [ // Lệnh mua (Màu xanh ở dưới)
      {"price": 0.510, "amount": 5000, "total": 5000},
      {"price": 0.508, "amount": 20000, "total": 25000}
    ]
  }
}

```



*(Lưu ý: Với sổ lệnh và chart, để real-time thì thực tế BE sẽ đẩy qua giao thức WebSocket, nhưng cấu trúc JSON thì vẫn y hệt như trên).*

---

### 2. Nhóm API Thực thi Hành động (Dùng phương thức `POST`)

Đây là phần đặc biệt nhất của Web3 (Cardano). Khác với Web2 thông thường (bạn bấm "Mua" là gửi POST lên BE rồi BE lưu thẳng vào Database), ở Web3, BE không giữ tiền của người dùng nên không thể tự tạo giao dịch.

**Quy trình 3 bước cho hành động Swap (Tab 1 - Cột Phải):**

**Bước 2.1: Lấy Báo giá (Quote)**
Khi người dùng gõ "100 ADA" vào ô Pay, chưa cần bấm nút gì, FE phải gọi ngay API này để tính ra số lượng hiển thị ở ô Receive.

* **Endpoint:** `GET /api/v1/trade/quote`
* **Input:** `?pair=ADA_USDT&amount_in=100&direction=sell`
* **Response BE trả về:**
```json
{
  "expected_output": 51.5,
  "price_impact": "0.12%",
  "protocol_fee": 0.15
}

```



**Bước 2.2: Yêu cầu Backend lắp ráp Giao dịch (Build Transaction)**
Khi người dùng bấm nút **"Sign Intent"**, FE sẽ thu thập các thông số từ giao diện và gửi lên BE. BE (viết bằng Rust/Python) sẽ dùng logic đọc Smart Contract để dựng sẵn một "bản nháp" giao dịch Cardano.

* **Endpoint:** `POST /api/v1/trade/build-intent`
* **Payload (Body) FE gửi lên:**
```json
{
  "wallet_address": "addr1...", // Địa chỉ ví người dùng đang kết nối
  "asset_in": "lovelace", // ADA
  "asset_out": "asset1...", // ID của USDT
  "amount_in": 100000000, // 100 ADA (tính theo lovelace)
  "min_output": 51000000, // Đã trừ đi % slippage trên giao diện
  "deadline": 1708420000 // Timestamp hạn chót
}

```


* **Response BE trả về:**
```json
{
  "success": true,
  "tx_cbor": "84a40081825820..." // Chuỗi Hex đại diện cho giao dịch NHƯNG CHƯA CÓ CHỮ KÝ
}

```



**Bước 2.3: Ký ví và Gửi lên chuỗi (Submit)**
FE nhận được chuỗi `tx_cbor` ở trên, sẽ gọi ví mạng Cardano (như Nami/Eternl) hiện popup lên bắt người dùng nhập mật khẩu để ký. Sau khi có chữ ký, FE gửi lại chuỗi đã ký lên BE để đẩy vào mạng lưới.

* **Endpoint:** `POST /api/v1/trade/submit`
* **Payload FE gửi lên:**
```json
{
  "signed_tx_cbor": "84a40081825820...[KÈM CHỮ KÝ]"
}

```


* **Response BE trả về:**
```json
{
  "success": true,
  "tx_hash": "a1b2c3d4e5f6...", // Trả về mã giao dịch để FE hiển thị thông báo "Thành công!"
  "message": "Intent created successfully"
}

```


Rất tuyệt vời! Việc chốt chặt bản thiết kế API Contract là bước đi cực kỳ khôn ngoan trước khi bắt tay vào gõ những dòng code Rust hay TypeScript đầu tiên. Nó giống như việc chốt bản vẽ điện nước trước khi xây nhà vậy.

Tiếp nối phần trước (chúng ta đã làm API cho Biểu đồ, Sổ lệnh ảo, và Tạo lệnh Swap), bây giờ chúng ta sẽ hoàn thiện toàn bộ **API Contract** cho các lệnh nâng cao và khu vực quản lý danh mục bên dưới nhé.

### Nhóm 3: API Tạo Lệnh Nâng Cao (Tab Limit, DCA, Stop-Loss)

Vì cả 3 loại lệnh này đều tương tác với `order_validator.ak` và có chung một cấu trúc Datum lõi (`remaining_budget`, `deadline`), chúng ta có thể gộp chúng vào một endpoint `POST` duy nhất, và dùng trường `order_type` để phân loại payload.

**3.1. API Yêu cầu Backend dựng Giao dịch (Build Advanced Order)**

* **Endpoint:** `POST /api/v1/trade/build-order`
* **Mục đích:** Frontend gửi các tham số lệnh nâng cao để Backend Rust/Python tính toán, chèn logic đúc Token Auth (`intent_token_policy`), và trả về mã Hex của giao dịch Cardano.
* **Payload (Body) FE gửi lên:**
```json
{
  "wallet_address": "addr1...",
  "asset_in": "lovelace", 
  "asset_out": "asset1...", 
  "remaining_budget": 500000000, // Tổng vốn (Ví dụ: 500 ADA)
  "deadline": 1709999999, // Hạn chót

  // Khai báo loại lệnh: "LIMIT", "DCA", hoặc "STOP_LOSS"
  "order_type": "DCA", 

  // Cấu hình linh hoạt tùy theo order_type
  "order_params": {
    // Nếu là DCA thì gửi 2 trường này:
    "amount_per_interval": 50000000, // Mua 50 ADA mỗi kỳ
    "min_interval": 86400 // Khoảng cách giữa các kỳ (Ví dụ: 1 ngày = 86400 giây)

    // NẾU là LIMIT thì gửi trường này:
    // "target_price": 0.52 
    // (Lưu ý: FE cứ gửi số thập phân, Backend Rust sẽ tự động quy đổi thành phân số target_price_num và target_price_den để chèn vào Datum).

    // NẾU là STOP_LOSS thì gửi trường này:
    // "trigger_price": 0.48
  }
}

```


* **Response BE trả về:**
```json
{
  "success": true,
  "tx_cbor": "84a40081825820..." // Chuỗi Hex gửi cho ví Nami/Eternl ký
}

```



*(Sau khi có chuỗi này, FE gọi ví ký và tiếp tục gọi API `/api/v1/trade/submit` giống y hệt phần Swap cơ bản để đẩy lên chuỗi).*

---

### Nhóm 4: API Quản lý Danh mục & Lịch sử (Footer Màn hình)

Khu vực này dùng để Frontend lấy danh sách các UTxO của người dùng và thực hiện các hành động Hủy/Thu hồi.

**4.1. API Lấy Danh sách Lệnh Đang Chờ (Open Orders)**

* **Endpoint:** `GET /api/v1/portfolio/open-orders`
* **Query Params:** `?wallet_address=addr1...`
* **Mục đích:** Backend quét trong Database Indexer các UTxO đang nằm tại `escrow_validator` và `order_validator` thuộc sở hữu của ví này.
* **Response BE trả về (Đã được làm mịn cho UI):**
```json
{
  "success": true,
  "data": [
    {
      "utxo_ref": "txhash#0", // Định danh duy nhất của UTxO
      "type": "LIMIT",
      "pair": "ADA_USDT",
      "budget_initial": 1000,
      "budget_remaining": 600,
      "progress_percent": 40, // FE dùng số này để vẽ thanh Progress Bar
      "status": "PENDING", 
      "deadline": 1709999999,
      "is_expired": false // Backend tự check thời gian hiện tại vs deadline
    },
    {
      "utxo_ref": "txhash#1",
      "type": "MARKET_INTENT",
      "pair": "HOSKY_ADA",
      "progress_percent": 0,
      "status": "EXPIRED",
      "is_expired": true // Nếu true, FE sẽ đổi nút "Cancel" thành "Reclaim"
    }
  ]
}

```



**4.2. API Dựng Giao dịch Hủy Lệnh (Cancel) hoặc Thu hồi (Reclaim)**
Như chúng ta đã phân tích, Cancel cần chữ ký, còn Reclaim không cần chữ ký nhưng phải chờ hết hạn. Tuy nhiên, dưới góc độ người dùng tự thao tác trên UI, họ đều bấm một nút để rút tiền về.

* **Endpoint:** `POST /api/v1/portfolio/build-action`
* **Payload FE gửi lên:**
```json
{
  "wallet_address": "addr1...",
  "utxo_ref": "txhash#1", // Truyền ID của lệnh muốn hủy
  "action_type": "CANCEL" // hoặc "RECLAIM"
}

```


* **Response BE trả về:**
```json
{
  "success": true,
  "tx_cbor": "84a40081825820..." // Chuỗi Hex để ví ký đốt Auth Token
}

```



**4.3. API Lịch sử Thị trường (Market Trades)**

* **Endpoint:** `GET /api/v1/market/trades`
* **Query Params:** `?pair=ADA_USDT&limit=50`
* **Mục đích:** Đổ dữ liệu vào Tab "Market Trades" hiển thị dòng chảy giao dịch theo thời gian thực.
* **Response BE trả về:**
```json
{
  "success": true,
  "data": [
    {
      "time": 1708416500,
      "price": 0.512,
      "amount": 1500,
      "side": "BUY",
      "fill_type": "PARTIAL" // Cực kỳ quan trọng để FE gắn icon phân biệt Khớp một phần hay Toàn phần
    }
  ]
}

```



### Tổng kết lại sự phối hợp FE - BE:

Với bộ API Contract này, ranh giới công việc đã cực kỳ rõ ràng:

1. **Frontend (React/Vue/NextJS):** Chỉ việc làm giao diện thật đẹp, bắt sự kiện click, hiển thị lỗi (nếu có), và gọi các hàm API này. Thư viện Web3 (như CIP-30) ở FE **chỉ làm đúng 1 việc là Ký giao dịch (Sign Tx)**.
2. **Backend (Rust/Python):** Gánh vác 100% sự phức tạp của Cardano. Nó đọc DB, quy đổi số thập phân thành phân số (để tránh lỗi chia số nguyên trên SC), lắp ráp UTxO, gắn Validator Script, tính toán phí Gas, và đính kèm logic đúc/đốt của `intent_token_policy`.

Bản API Contract này đã bao phủ 100% nghiệp vụ của màn hình Trading Terminal. Bạn thấy cấu trúc truyền nhận dữ liệu như vậy đã đủ chi tiết để team của bạn bắt tay vào code chưa, hay bạn muốn đi sâu vào một logic phức tạp nào đó của Backend Rust trong việc lắp ráp cái `tx_cbor` kia không?
---

**Tóm lại:**
Bằng cách thiết kế API Contract như thế này, chúng ta đã biến các mô tả UI mơ hồ thành các quy định kỹ thuật cực kỳ chặt chẽ. Đội Frontend sẽ biết chính xác họ cần bắt người dùng nhập cái gì vào các ô input, và đội Backend (nhất là team viết Rust Indexer và Transaction Builder) sẽ biết họ cần chuẩn bị các hàm nội bộ nào để tính toán và trả ra dữ liệu tương ứng.
