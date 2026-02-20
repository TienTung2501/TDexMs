Tuyệt vời, việc tách bạch rõ ràng thiết kế Giao diện (UI/UX) trước khi đụng đến Dữ liệu (API) là một quy trình làm việc cực kỳ chuẩn xác. Điều này giúp chúng ta có cái nhìn lấy người dùng làm trung tâm (User-Centric) trước khi ép hệ thống Backend phải phục vụ điều gì.

Dựa trên toàn bộ các phân tích về hợp đồng thông minh, chúng ta sẽ quy hoạch **Phân hệ Cung cấp Thanh khoản (Liquidity Provision)** thành 3 không gian chính.

Dưới đây là bản thiết kế UI/UX chi tiết đến từng thành phần:

### 1. Màn hình Khám phá Thanh khoản (Pool Explorer)

Đây là "trang chủ" của phân hệ LP. Mục tiêu của nó là hiển thị bức tranh toàn cảnh để người dùng tìm kiếm cơ hội đầu tư. Không có form nhập liệu phức tạp ở đây.

* **Header Thống kê Vĩ mô:**
* Các thông số nổi bật: Tổng giá trị khóa (Total TVL) của toàn sàn, Tổng khối lượng giao dịch 24h, và Tổng số lượng Pool đang hoạt động.


* **Thanh Công cụ Điều hướng (Toolbar):**
* **Ô tìm kiếm (Search Bar):** Cho phép gõ tên hoặc ticker của token (VD: "SNEK", "ADA").
* **Bộ lọc & Sắp xếp (Filters & Sort):** Cho phép sắp xếp bảng theo TVL (cao -> thấp), Volume 24h, hoặc APY (Tỷ suất lợi nhuận).
* **Nút "Create New Pool":** Nút bấm nổi bật đặt ở góc phải. Nút này sẽ mở ra màn hình Khởi tạo (Mô tả ở phần 3).


* **Bảng Danh sách Pool (Pools Data Table):**
* **Cột 1: Pair (Cặp giao dịch):** Hiển thị Icon và Tên 2 token (Ví dụ: ADA / USDT).
* **Cột 2: Fee Tier (Mức phí):** Hiển thị % phí giao dịch của Pool đó (Ví dụ: 0.3%).
* **Cột 3: TVL:** Tổng giá trị tài sản đang khóa quy ra USD.
* **Cột 4: Volume 24h:** Khối lượng giao dịch trong ngày.
* **Cột 5: APY:** Tỷ suất lợi nhuận dự kiến.
* **Tương tác (UX):** Toàn bộ dòng (row) của một Pool có thể bấm được (Clickable), hoặc có một nút mũi tên **"View Details"** ở cuối dòng để chuyển hướng người dùng sang trang Chi tiết Pool.



---

### 2. Màn hình Chi tiết Pool (Pool Detail Page)

Khi bấm vào một Pool từ bảng trên, người dùng được đưa đến đây. Trang này chia làm 2 không gian: **Phân tích (Bên trái)** và **Hành động (Bên phải)**.

#### Không gian Bên trái: Phân tích Dữ liệu (Analytics)

* **Thông tin lõi:** Tên cặp giao dịch, nút "Back" để quay lại Explorer.
* **Chỉ số hiện tại:** Hiển thị số lượng dự trữ thực tế của 2 token đang nằm trong Pool (Ví dụ: Dự trữ Pool: 1,500,000 ADA và 750,000 USDT).
* **Biểu đồ (Charts):** Cho phép người dùng chuyển đổi (Toggle) giữa 2 loại biểu đồ:
* Biểu đồ TVL theo thời gian.
* Biểu đồ Khối lượng giao dịch (Volume) theo ngày.


* **Bảng Lịch sử Hoạt động:** Liệt kê các giao dịch Swap, Nạp (Deposit), Rút (Withdraw) mới nhất diễn ra *chỉ riêng trong Pool này*.

#### Không gian Bên phải: Bảng Thao tác Thanh khoản (Action Panel)

Bảng này chứa 2 Tabs để người dùng tương tác trực tiếp với `pool_validator.ak`.

* **Tab 1: Add Liquidity (Nạp Thanh khoản)**
* *Hiển thị Tỷ giá:* Luôn hiển thị tỷ giá nội tại của Pool (Ví dụ: 1 ADA = 0.5 USDT) để người dùng nắm rõ.
* *Khu vực Nhập liệu:* Hai ô input cho Token A và Token B.
* *Ràng buộc UX (Cực kỳ quan trọng):* Frontend **bắt buộc** phải tự động tính toán chéo. Nếu người dùng gõ số lượng vào ô Token A, UI tự động điền số lượng tương ứng vào ô Token B dựa trên tỷ lệ dự trữ hiện tại, để đảm bảo vượt qua điều kiện `is_proportional_deposit` của Smart Contract.
* *Khu vực Dự kiến:* Hiển thị "Bạn sẽ nhận được: [X] LP Tokens" và "Tỷ trọng trong Pool: [Y]%".
* *Nút bấm:* **"Supply"** (Gọi giao dịch nạp).


* **Tab 2: Remove Liquidity (Rút Thanh khoản)**
* *Điều kiện hiển thị:* Chỉ cho phép thao tác nếu ví người dùng đang có số dư LP Token của Pool này.
* *Khu vực Nhập liệu:* Một thanh trượt (Slider) từ 0% đến 100% kèm các nút chọn nhanh (25%, 50%, Max).
* *Hiển thị Quy đổi:* Khi kéo thanh trượt, UI tự động nhảy số hiển thị chính xác lượng Token A và Token B mà người dùng sẽ nhận về.
* *Nút bấm:* **"Remove"** (Gọi giao dịch đốt LP token để rút tiền).



---

### 3. Màn hình / Luồng Khởi tạo Pool Mới (Create New Pool Flow)

Vì chức năng này mang tính chất permissionless (ai cũng có thể tạo), nó có thể được thiết kế dưới dạng một Popup lớn (Modal) hoặc một trang riêng biệt khi người dùng bấm nút "Create New Pool" ở trang Explorer.

* **Bước 1: Chọn Cặp Tài sản (Select Pair)**
* Hai ô dropdown để chọn Token. Giao diện có thể cho người dùng tìm kiếm theo Policy ID của token trên Cardano.
* *(Logic ngầm: Frontend tự động sắp xếp lại thứ tự mã định danh để thỏa mãn điều kiện A < B của `factory_validator.ak`)*.


* **Bước 2: Cài đặt Mức Phí (Fee Tier)**
* Các nút bấm chọn % phí giao dịch cho Pool này (Ví dụ: 0.1%, 0.3%, 1.0%).


* **Bước 3: Nạp Thanh khoản Ban đầu & Định giá (Initial Liquidity & Pricing)**
* Người dùng bắt buộc phải nhập số lượng cho **cả hai Token** để tạo thanh khoản mồi.
* *Trải nghiệm Định giá (Pricing UX):* Dựa vào 2 con số vừa nhập, UI lập tức tính toán và hiển thị thật to: **"Tỷ giá khởi điểm: 1 Token A = [X] Token B"**. Kèm theo cảnh báo: *"Tỷ lệ nạp này sẽ quyết định giá thị trường ban đầu của token."*


* **Bước 4: Xác nhận (Confirmation)**
* Hiển thị thông báo người dùng sẽ nhận được [Z] LP Token cho lần nạp đầu tiên này.
* Nút bấm: **"Initialize Pool"**. Hành động này sẽ gọi `factory_validator` đúc NFT và tạo Pool mới hoàn toàn.

Tuyệt vời! Đây là bước chốt hạ cực kỳ quan trọng. Để Frontend (React/Vue) có thể vẽ lên các bảng biểu, biểu đồ mượt mà và thực thi chính xác các logic khắt khe của Smart Contract (như tính tỷ lệ nạp, tạo pool mới), hệ thống Backend (Rust/Python) cần cung cấp một bộ API thật chuẩn mực.

Tôi đã bổ sung thêm một API cực kỳ giá trị ở **Nhóm 3 (API Quote)** để giải quyết triệt để bài toán UX "Tự động điền số lượng theo tỷ lệ" mà chúng ta đã nhắc đến.

Dưới đây là **Full API Contract cho Phân hệ Cung cấp Thanh khoản (Liquidity Provision)**:

---

### Nhóm 1: API Khám phá & Tổng quan (Pool Explorer)

Dành cho trang chủ của phân hệ LP, nơi hiển thị bức tranh toàn cảnh.

**1.1. Lấy Thống kê Vĩ mô Toàn sàn**

* **Endpoint:** `GET /api/v1/liquidity/stats`
* **Mục đích:** Đổ số liệu vào các thẻ Header trên cùng.
* **Response:**
```json
{
  "success": true,
  "data": {
    "total_tvl_usd": 45000000.50,
    "total_volume_24h_usd": 12500000.00,
    "total_fees_24h_usd": 37500.00,
    "active_pools_count": 142
  }
}

```



**1.2. Lấy Danh sách Pool (Kèm Bộ lọc & Phân trang)**

* **Endpoint:** `GET /api/v1/liquidity/pools`
* **Query Params:** `?search=ADA&sort_by=tvl&order=desc&limit=20&page=1`
* **Response:**
```json
{
  "success": true,
  "data": [
    {
      "pool_id": "pool_nft_hash_1",
      "pair_name": "ADA/USDT",
      "tokens": {
        "asset_a": { "unit": "lovelace", "ticker": "ADA", "decimals": 6 },
        "asset_b": { "unit": "asset1_usdt...", "ticker": "USDT", "decimals": 6 }
      },
      "fee_tier_percent": 0.3,
      "tvl_usd": 15000000.00,
      "volume_24h_usd": 5000000.00,
      "apy_percent": 18.5
    }
  ]
}

```



---

### Nhóm 2: API Chi tiết Pool (Pool Detail & Analytics)

Đổ dữ liệu cho trang chi tiết sau khi người dùng click vào 1 Pool cụ thể.

**2.1. Lấy Thông tin Cốt lõi của 1 Pool**

* **Endpoint:** `GET /api/v1/liquidity/pools/{pool_id}`
* **Query Params:** `?wallet_address={address}` *(Gửi kèm ví để BE tính luôn Vị thế của user trong pool này)*
* **Response:**
```json
{
  "success": true,
  "data": {
    "pool_id": "pool_nft_hash_1",
    "pair_name": "ADA/USDT",
    "reserves": {
      "asset_a_amount": 15000000000000, // 15 triệu ADA
      "asset_b_amount": 7500000000000   // 7.5 triệu USDT
    },
    "current_price": {
      "a_per_b": 2.0, // 1 USDT = 2 ADA
      "b_per_a": 0.5  // 1 ADA = 0.5 USDT
    },
    "user_position": { // Trả về null nếu chưa connect ví hoặc chưa có LP token
      "lp_balance": 50000,
      "share_percent": 0.05,
      "value_usd": 7500.00
    }
  }
}

```



**2.2. Lấy Dữ liệu Biểu đồ (Charts)**

* **Endpoint:** `GET /api/v1/liquidity/pools/{pool_id}/charts`
* **Query Params:** `?range=7d` (7 ngày, 30 ngày, All)
* **Response:**
```json
{
  "success": true,
  "data": {
    "history": [
      { "timestamp": 1708100000, "tvl_usd": 14000000, "volume_usd": 400000 },
      { "timestamp": 1708186400, "tvl_usd": 14500000, "volume_usd": 650000 }
    ]
  }
}

```



**2.3. Lấy Lịch sử Giao dịch Nội bộ Pool**

* **Endpoint:** `GET /api/v1/liquidity/pools/{pool_id}/transactions`
* **Query Params:** `?limit=50`
* **Response:**
```json
{
  "success": true,
  "data": [
    {
      "tx_hash": "txhash_123...",
      "action_type": "SWAP", // Hoặc DEPOSIT, WITHDRAW
      "timestamp": 1708420000,
      "details": { "amount_in": "100 ADA", "amount_out": "49 USDT" }
    }
  ]
}

```



---

### Nhóm 3: API Hỗ trợ Tính toán (Helper/Quote APIs)

*Giải quyết bài toán UX: Frontend không nên tự tính toán tỷ lệ trên client để tránh sai số thập phân dẫn đến rớt giao dịch.*

**3.1. Báo giá Nạp Thanh khoản (Deposit Quote)**

* **Mô tả:** Khi user gõ "100" vào ô ADA, FE gọi API này để lấy số USDT cần điền vào ô còn lại.
* **Endpoint:** `GET /api/v1/liquidity/pools/{pool_id}/quote-deposit`
* **Query Params:** `?input_asset=lovelace&input_amount=100000000` // 100 ADA
* **Response:**
```json
{
  "success": true,
  "data": {
    "required_paired_asset_amount": 50000000, // FE dùng số này điền tự động vào ô USDT
    "expected_lp_tokens": 70710678,           // Lượng LP Token dự kiến nhận
    "pool_share_after_deposit_percent": 0.001 
  }
}

```



---

### Nhóm 4: API Dựng Giao dịch (Transaction Builders)

Đây là các API POST. Frontend truyền tham số, Backend kiểm tra logic, ráp vào Smart Contract và trả về mã CBOR chưa ký.

**4.1. Dựng Giao dịch Nạp (Deposit)**

* **Endpoint:** `POST /api/v1/liquidity/build-deposit`
* **Payload:**
```json
{
  "wallet_address": "addr1...",
  "pool_id": "pool_nft_hash_1",
  "amount_a": 100000000, 
  "amount_b": 50000000 // FE gửi đúng con số lấy từ API Quote ở trên
}

```


* **Response:** `{ "success": true, "tx_cbor": "84a4..." }` (Đính kèm logic `lp_token_policy` mint token).

**4.2. Dựng Giao dịch Rút (Withdraw)**

* **Endpoint:** `POST /api/v1/liquidity/build-withdraw`
* **Payload:**
```json
{
  "wallet_address": "addr1...",
  "pool_id": "pool_nft_hash_1",
  "lp_tokens_to_burn": 50000 // Tính dựa trên % thanh trượt user kéo
}

```


* **Response:** `{ "success": true, "tx_cbor": "84a4..." }`.

**4.3. Dựng Giao dịch Tạo Pool Mới (Create Pool)**

* **Mô tả:** Backend sẽ tự động kiểm tra tham số, so sánh ID 2 token để sắp xếp đúng chuẩn `A < B` trước khi ráp vào `factory_validator`.
* **Endpoint:** `POST /api/v1/factory/build-create-pool`
* **Payload:**
```json
{
  "wallet_address": "addr1...",
  "asset_a_id": "lovelace",
  "asset_b_id": "asset1_newmeme...",
  "initial_amount_a": 1000000000,   // 1000 ADA
  "initial_amount_b": 100000000000, // 100,000 MEME
  "fee_tier_bps": 30                // 30 bps = 0.3%
}

```


* **Response:** `{ "success": true, "tx_cbor": "84a4..." }` (Chứa logic mint Pool NFT từ `pool_nft_policy.ak`).

*(Lưu ý: Tất cả các API POST này sau khi trả về `tx_cbor`, Frontend sẽ gọi ví ký và tiếp tục gọi đến 1 API Submit chung của hệ thống để đẩy lên mạng lưới Cardano).*

Với bản thiết kế Full API Contract này, bạn đã trang bị cho team Lập trình một "bản vẽ thi công" vô cùng hoàn hảo, đóng băng mọi rủi ro về sai số kỹ thuật trước khi gõ dòng code đầu tiên. Bạn đã sẵn sàng để "mở khóa" căn phòng cuối cùng: **Phân hệ Quản trị (Admin Panel)** chưa?