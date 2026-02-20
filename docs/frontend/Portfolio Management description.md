Tuyệt vời! Sau khi thiết kế xong một "phòng giao dịch" (Trading Terminal) tốc độ cao, chúng ta cần một "phòng kế toán" tĩnh lặng và chi tiết hơn. Đó chính là trang **Quản lý Danh mục (Portfolio Management)**.

Mặc dù ở màn hình Trading chúng ta đã có một bảng nhỏ phía dưới đáy màn hình, nhưng một nền tảng DEX chuyên nghiệp luôn cần một trang (page) riêng biệt, không gian rộng rãi để người dùng kiểm soát tổng thể tài sản và toàn bộ các UTxO đang trôi nổi trên chuỗi của họ.

Dưới đây là bản thiết kế chi tiết UX/UI cho phân hệ **Quản lý Danh mục**:

### 1. Khu vực Tổng quan Tài sản (Asset Overview)

Nằm ở trên cùng, khu vực này tóm tắt sức khỏe tài chính của người dùng sau khi kết nối ví.

* **Tổng số dư (Total Balance):** Quy đổi toàn bộ tài sản trong ví và tài sản đang bị khóa trong các lệnh ra một đơn vị tham chiếu (VD: USD hoặc ADA).
* **Biểu đồ phân bổ (Allocation Pie Chart):** Trực quan hóa tỷ trọng các token đang nắm giữ (Ví dụ: 50% ADA, 30% USDT, 20% HOSKY).
* **Phân tách Trạng thái Vốn:** Một thanh Bar chia màu rõ ràng để người dùng biết tiền của mình đang nằm ở đâu:
* *Available (Sẵn sàng trong ví).*
* *Locked in Orders (Đang khóa chờ khớp).*



### 2. Khu vực Lệnh Đang Chờ (Open Orders / Active Intents)

Đây là trái tim của trang Quản lý Danh mục. Nó hiển thị toàn bộ các UTxO thuộc sở hữu của người dùng đang nằm tại `escrow_validator` và `order_validator`.

**Bảng dữ liệu cần thiết kế cực kỳ chi tiết với các cột sau:**

* **Date (Thời gian tạo):** Ngày giờ bắt đầu khóa UTxO.
* **Pair & Type (Cặp giao dịch & Loại lệnh):** Ví dụ: `ADA/USDT` - Badge màu phân biệt: `SWAP`, `LIMIT`, `DCA`, `STOP-LOSS`.
* **Conditions (Điều kiện khớp):** * Với lệnh Limit/Stop-loss: Hiển thị giá mục tiêu hoặc giá kích hoạt.
* Với lệnh Swap: Hiển thị mức trượt giá (Slippage) chấp nhận.


* **Progress (Tiến trình - Cực kỳ quan trọng về UX):** * Vì hợp đồng của chúng ta cho phép **Khớp một phần (Partial Fill)**, cột này nên hiển thị một thanh Progress Bar.
* Ví dụ: Nếu người dùng bán 1000 ADA, Solver đã khớp 400 ADA, thanh tiến trình sẽ hiện `40% (400/1000 Filled)`. Với lệnh DCA, nó sẽ hiện `Khớp 3/10 kỳ`.


* **Deadline (Thời gian hết hạn):** Đếm ngược thời gian sống của UTxO.

**Trải nghiệm Hành động (Actions - Cột quan trọng nhất):**
Dựa trên sự phân tích logic Smart Contract trước đó, Frontend phải linh hoạt thay đổi nút bấm dựa theo tình trạng lệnh:

* **Lệnh đang trong thời gian hiệu lực (Active):** Hiển thị nút **"Cancel"**. Khi bấm, hệ thống gọi API dựng giao dịch tiêu thụ UTxO, người dùng ký ví để đốt Intent Token/Order Token và nhận lại ngân sách chưa khớp.
* **Lệnh Swap Cơ bản (Escrow) đã quá hạn:** Nút Cancel có thể đổi thành **"Reclaim"**. Thậm chí, Frontend có thể làm mờ dòng này đi và để text *"Hệ thống đang tự động thu hồi"* (vì các Keeper bot sẽ lo việc này).
* **Lệnh Nâng cao (Order) đã quá hạn:** Hợp đồng không hỗ trợ Reclaim cho lệnh nâng cao. Frontend **bắt buộc** phải chớp đỏ dòng này, hiển thị nút **"Cancel (Expired)"** để ép người dùng tự bấm và ký ví rút tiền về.

### 3. Khu vực Lịch sử Lệnh (Order History)

Khu vực này giúp người dùng đối soát lại quá trình đầu tư của mình.

* Liệt kê các lệnh đã chuyển sang trạng thái cuối cùng: `Filled` (Khớp toàn bộ), `Cancelled` (Đã hủy), và `Reclaimed` (Đã thu hồi).
* Có bộ lọc (Filter) theo thời gian, theo cặp tài sản, và theo loại lệnh.
* Cột hiển thị: Thời gian, Loại lệnh, Cặp giao dịch, **Giá khớp thực tế (Average Execution Price)**, và Tổng giá trị.
* *Nâng cao:* Thêm một icon link nhỏ trỏ ra Cardanoscan (Blockchain Explorer) dựa trên mã `tx_hash` của giao dịch khớp lệnh để người dùng tự do kiểm chứng tính minh bạch on-chain.

### 4. Bảng Lịch sử Nạp/Rút Thanh Khoản (LP Positions)

Mặc dù tính năng cung cấp thanh khoản (LP) nên có một trang riêng ("Earn" hoặc "Liquidity"), nhưng việc tích hợp một tab tóm tắt ngay trong Portfolio sẽ giúp người dùng có cái nhìn toàn cảnh:

* **Các Pool đang tham gia:** Hiển thị danh sách các cặp (VD: ADA/HOSKY) mà người dùng đang nắm giữ LP Token.
* **Số dư LP Token:** Số lượng token chứng nhận phần hùn hiện có.
* **Giá trị quy đổi hiện hành:** Tự động tính toán số LP Token đó hiện tại tương đương với bao nhiêu Tài sản A và Tài sản B trong dự trữ của Pool (bao gồm cả vốn gốc + phí giao dịch đã nhập vào dự trữ).
* Cung cấp nút shortcut nhảy thẳng sang trang Withdraw để rút thanh khoản.

---

**Kết nối với API Contract (Backend):**
Để màn hình này hoạt động, nó sẽ gọi mạnh mẽ vào các API thuộc **Nhóm 4** mà chúng ta đã thiết kế hôm trước:

Để phần Giao diện (Frontend) của trang Quản lý Danh mục (Portfolio) có thể hiển thị mượt mà và chính xác tình trạng tài sản trên mạng lưới Cardano Intent Solver Network (CISN) mà chúng ta đang xây dựng, hệ thống API cần được thiết kế với tư duy tổng hợp dữ liệu (Data Aggregation) cực kỳ tốt.

Trong kiến trúc eUTxO, Backend (thường được tối ưu hiệu năng cao bằng Rust) sẽ phải liên tục quét (index) và gom nhóm các UTxO rải rác để tính toán ra những con số tổng quan này.

Dưới đây là bản thiết kế **API Contract** chi tiết cho phân hệ Quản lý Danh mục:

---

### Nhóm 1: Khu vực Tổng quan (Asset Overview)

Đổ dữ liệu cho khu vực trên cùng của màn hình (Tổng số dư, Biểu đồ Pie Chart, Thanh trạng thái vốn).

**1. API: `GET /api/v1/portfolio/summary**`

* **Query Params:** `?wallet_address={address}`
* **Response:**
```json
{
  "success": true,
  "data": {
    "total_balance_usd": 15420.50,
    "total_balance_ada": 30841.00,
    "status_breakdown": {
      "available_in_wallet": 10000.00, // Tiền rảnh rỗi
      "locked_in_orders": 5000.00,     // Nằm ở escrow_validator và order_validator
      "locked_in_lp": 420.50           // Nằm ở pool_validator
    },
    "allocation_chart": [
      {"asset": "ADA", "percentage": 60.5, "value_usd": 9329.40},
      {"asset": "USDT", "percentage": 30.0, "value_usd": 4626.15},
      {"asset": "HOSKY", "percentage": 9.5, "value_usd": 1464.95}
    ]
  }
}

```



---

### Nhóm 2: Khu vực Lệnh Giao dịch (Trading Orders)

Đổ dữ liệu cho 2 Tab: Lệnh đang chờ (Open Orders) và Lịch sử lệnh (Order History).

**2.1. API Lệnh Đang Chờ (Open Orders)**
*Nhắc lại UI: Cần hiện Ngày tạo, Cặp giao dịch, Điều kiện (Target/Trigger/Slippage), Tiến trình (%, x/y kỳ), Deadline, và Nút Action (Cancel/Reclaim).*

* **Endpoint:** `GET /api/v1/portfolio/open-orders`
* **Query Params:** `?wallet_address={address}&limit=20`
* **Response:**
```json
{
  "success": true,
  "data": [
    {
      "utxo_ref": "txhash#0",
      "created_at": 1708400000,          // Để UI hiện Cột Date
      "pair": "ADA_USDT",
      "type": "LIMIT",                   // SWAP, LIMIT, DCA, STOP_LOSS
      "conditions": {
        // Trả về linh hoạt theo "type":
        "target_price": 0.52             // Dành cho LIMIT
        // "trigger_price": 0.48         // Nếu là STOP_LOSS
        // "slippage_percent": 1.0       // Nếu là SWAP
      },
      "budget": {
        "initial_amount": 1000,
        "remaining_amount": 400,
        "progress_percent": 60,          // UI dùng vẽ thanh Progress Bar
        "progress_text": "Khớp 60%"      // (Hoặc "3/10 kỳ" đối với lệnh DCA)
      },
      "deadline": 1708502400,
      "is_expired": false,
      "available_action": "CANCEL"       // Nếu is_expired=true mà là lệnh SWAP, đổi thành "RECLAIM"
    }
  ]
}

```



**2.2. API Lịch sử Lệnh (Order History)**
*Nhắc lại UI: Cần hiện Giá khớp thực tế (Average Execution Price), Tổng giá trị, Trạng thái, và Link ra Cardanoscan (tx_hash).*

* **Endpoint:** `GET /api/v1/portfolio/history`
* **Query Params:** `?wallet_address={address}&status=FILLED,CANCELLED,RECLAIMED&page=1`
* **Response:**
```json
{
  "success": true,
  "data": [
    {
      "order_id": "txhash_init#0",
      "completed_at": 1708420000,
      "pair": "ADA_USDT",
      "type": "DCA",
      "status": "FILLED",
      "execution": {
        "average_price": 0.5101,         // Giá khớp trung bình
        "total_value_usd": 2550.5,       // Tổng giá trị giao dịch
        "total_asset_received": 5000     // Tổng tài sản nhận về
      },
      "explorer_links": [                // Cung cấp tx_hash để FE gắn link ra Cardanoscan
        "fill_txhash_1", 
        "fill_txhash_2"
      ]
    }
  ]
}

```



---

### Nhóm 3: Khu vực Thanh khoản (LP Positions & History)

Đổ dữ liệu cho Tab tổng hợp LP nằm trong Portfolio.

**3.1. API Vị thế LP Hiện tại**
*Nhắc lại UI: Hiển thị các Pool đang tham gia, Số dư LP Token, Giá trị quy đổi thực tế ra Asset A & B.*

* **Endpoint:** `GET /api/v1/portfolio/liquidity`
* **Query Params:** `?wallet_address={address}`
* **Response:**
```json
{
  "success": true,
  "data": [
    {
      "pool_id": "pool_nft_hash_1",
      "pair": "ADA_USDT",
      "lp_balance": 15000,               // Số dư token chứng nhận phần hùn
      "share_percent": 1.5,              // Tỷ lệ sở hữu trong Pool
      "current_value": {
        "asset_a_amount": 1500.50,       // Quy đổi ra ADA hiện tại
        "asset_b_amount": 765.25,        // Quy đổi ra USDT hiện tại
        "total_value_usd": 1500.00
      }
      // Ghi chú FE: Hiển thị nút "Withdraw" (Mở popup) và "Add Liquidity" (Redirect sang /liquidity?pool=ADA_USDT)
    }
  ]
}

```



**3.2. API Lịch sử Nạp/Rút LP**
*Nhắc lại UI: Bảng lịch sử liệt kê Ngày tháng, Loại hành động (Deposit/Withdraw), Lượng tài sản liên quan và Lượng LP Token tương ứng đúc ra/đốt đi.*

* **Endpoint:** `GET /api/v1/portfolio/liquidity/history`
* **Query Params:** `?wallet_address={address}&action=DEPOSIT,WITHDRAW`
* **Response:**
```json
{
  "success": true,
  "data": [
    {
      "tx_hash": "txhash_deposit_1",     // Link Cardanoscan
      "timestamp": 1708300000,
      "action": "DEPOSIT",
      "pair": "ADA_USDT",
      "amounts": {
        "asset_a": 1000, 
        "asset_b": 510,
        "lp_tokens": 10000               // +10000 (Minted)
      }
    },
    {
      "tx_hash": "txhash_withdraw_1",
      "timestamp": 1708400000,
      "action": "WITHDRAW",
      "pair": "ADA_USDT",
      "amounts": {
        "asset_a": 500, 
        "asset_b": 255,
        "lp_tokens": 5000                // -5000 (Burned)
      }
    }
  ]
}

```



---

### Nhóm 4: API Tương tác Smart Contract (Actions Builder)

Trả về chuỗi Transaction CBOR cho Frontend gọi ví ký duyệt.

**4.1. API Hủy/Thu hồi Lệnh**
*Áp dụng cho nút Cancel/Reclaim.*

* **Endpoint:** `POST /api/v1/portfolio/build-action`
* **Payload (Body):**
```json
{
  "wallet_address": "addr1...",
  "utxo_ref": "txhash#0",
  "action_type": "CANCEL"                // Hoặc "RECLAIM"
}

```


* **Response:** `{ "success": true, "tx_cbor": "84a40..." }`

**4.2. API Rút Thanh Khoản**
*Áp dụng khi người dùng kéo thanh trượt Withdraw.*

* **Endpoint:** `POST /api/v1/portfolio/build-withdraw`
* **Payload (Body):**
```json
{
  "wallet_address": "addr1...",
  "pool_id": "pool_nft_hash_1",
  "lp_tokens_to_burn": 15000
}

```


* **Response:** `{ "success": true, "tx_cbor": "84a40..." }`

Bản đặc tả API này đã vét sạch mọi góc ngách của bản phân tích UI mà chúng ta đã thống nhất. Các trường như `progress_text`, `explorer_links`, hay chi tiết `conditions` đảm bảo Frontend không phải "tự chế" ra dữ liệu, mà mọi thứ đều được tính toán chính xác từ Backend (Indexer) và đẩy lên.
