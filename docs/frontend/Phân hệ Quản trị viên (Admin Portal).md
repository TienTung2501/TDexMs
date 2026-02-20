Đây là bản thiết kế "chốt hạ" toàn diện và chi tiết nhất cho Frontend của **Phân hệ Quản trị viên (Admin Portal)**. Bản mô tả này đóng vai trò như một tài liệu đặc tả giao diện (UI/UX Specification) chuẩn mực, sẵn sàng để giao cho đội ngũ thiết kế (Figma) và lập trình viên (Frontend Developers) thi công ngay lập tức.

### 1. Kiến trúc Tổng thể & Trải nghiệm Đăng nhập (Architecture & Auth Flow)

* **Tên miền độc lập (Subdomain):** Triển khai tại `admin.mysolverdex.com` để cô lập hoàn toàn bộ nhớ đệm (cache/local storage) khỏi trang giao dịch của người dùng phổ thông, ngăn chặn tối đa rủi ro bảo mật (XSS).
* **Ngôn ngữ Thiết kế (Theme):** Sử dụng **Light Theme** (Nền trắng/xám nhạt, chữ xám đậm). Sự tương phản này tạo ra "ranh giới bối cảnh", giúp Admin luôn tỉnh táo và nhận thức được họ đang ở khu vực vận hành hệ thống lõi.
* **Cổng Bảo vệ (Authentication Guard):**
* Màn hình đầu tiên chỉ có một nút duy nhất: **"Connect Admin Wallet"**.
* Sau khi ví kết nối, Frontend lập tức kiểm tra địa chỉ ví (VerificationKeyHash) với cấu hình On-chain. Nếu sai, hiển thị lỗi đỏ: *"Access Denied"*.
* *Bảo mật Backend:* Mọi nút bấm thực thi (Write actions) trên giao diện đều yêu cầu Frontend gọi ví để Admin ký một tin nhắn (CIP-8 Sign Message) nhằm chứng minh quyền sở hữu Private Key trước khi Backend nhả mã CBOR giao dịch.



---

### 2. Bố cục Màn hình (Global Layout)

* **Thanh Điều hướng (Left Sidebar):** Ghim cố định bên trái, nền xám nhạt (Light Gray). Bao gồm 4 menu:
* 📊 Dashboard (Giám sát)
* 💰 Revenue (Doanh thu)
* ⚙️ Protocol Settings (Cấu hình)
* 🚨 Danger Zone (Nguy hiểm)


* **Thanh Trạng thái (Top Header):** Nằm ở trên cùng bên phải. Hiển thị địa chỉ Ví Admin đã thu gọn (VD: `addr1...x9tz`) kèm theo một chấm xanh lá nhấp nháy báo hiệu kết nối an toàn.

---

### 3. Chi tiết 4 Màn hình Cốt lõi

#### Màn hình 1: 📊 Dashboard (Giám sát Vĩ mô - Read Only)

* **Hàng 1 - Thẻ Chỉ số (Metric Cards):** 4 khối hình chữ nhật nền trắng, đổ bóng nhẹ.
* **Thẻ 1:** Total TVL (Tổng giá trị khóa toàn sàn) - Chữ số to màu Xanh Dương Đậm (Navy Blue).
* **Thẻ 2:** 24h Volume (Tổng khối lượng giao dịch).
* **Thẻ 3:** Active Pools (Số lượng Pool đang hoạt động).
* **Thẻ 4:** **Total Pending Fees** (Tổng phí đang chờ thu hoạch) - Chữ số to màu Vàng Cam để thu hút sự chú ý.


* **Hàng 2 - Phân tích (Analytics):** Biểu đồ đường (Line chart) thể hiện tốc độ tăng trưởng của Phí Giao thức (Protocol Fees) trong 30 ngày gần nhất.
* **Hàng 3 - Trạng thái On-chain:** Dòng text xám ở góc dưới: *Current Admin Hash: [Mã Hash]* và *Smart Contract Version: [X]*.

#### Màn hình 2: 💰 Revenue & Fees (Thu hoạch Phí)

* **Bảng Dữ liệu (Data Table):** Liệt kê các Pool có phí lớn hơn 0.
* Cột: Ô Checkbox | Tên Cặp (ADA/USDT) | Phí Asset A chờ rút | Phí Asset B chờ rút.


* **Trải nghiệm Tương tác (Batch Selection UX):**
* Khi Admin tích vào ô "Chọn tất cả" hoặc chọn lẻ từng Pool, một **Thanh công cụ nổi (Floating Action Bar)** màu đen sẽ trượt lên từ cạnh đáy màn hình.
* Trên thanh hiển thị: *"Đã chọn [X] Pools | Tổng thu hoạch: [$Y]"*.
* Bên cạnh là nút chính (Primary Button) màu Navy Blue: **`[ Execute CollectFees ]`**. Nút này sẽ kích hoạt logic thu phí trên `pool_validator`.



#### Màn hình 3: ⚙️ Protocol Settings (Cấu hình Giao thức)

Chia làm 2 khối Form nhập liệu rõ rệt, khoảng cách rộng rãi để tránh click nhầm.

* **Khối 1: Global Settings (Cấu hình Toàn cục của `settings_validator`)**
* *Ô nhập 1:* Mức phí giao thức tối đa (Max Protocol Fee - tính bằng bps).
* *Ô nhập 2:* Yêu cầu thanh khoản tối thiểu (Min Pool Liquidity).
* *Cơ chế Versioning (Bảo vệ lỗi On-chain):* Hiển thị một ô text bị làm mờ: *"Current Version: 5"*. Ngay bên cạnh là một ô chữ xanh lá nổi bật: **"Next Version: 6 (Auto-incremented)"**. Lập trình viên Frontend phải tự cộng 1 vào payload để đảm bảo Smart Contract không từ chối giao dịch.
* Nút bấm: **`[ Push Protocol Update ]`**.


* **Khối 2: Factory Settings (Cấu hình Sổ cái của `factory_validator`)**
* *Ô nhập:* Địa chỉ Ví Admin mới (Transfer Admin Rights).
* *Cảnh báo UX:* Bên dưới ô nhập là dòng chữ màu cam: *"Chú ý: Thao tác này sẽ tước quyền quản trị của ví hiện tại."*
* Nút bấm: **`[ Update Factory Admin ]`**.



#### Màn hình 4: 🚨 Danger Zone (Khu vực Khẩn cấp)

* **Thiết kế Báo động:** Toàn bộ khu vực này đặt trên một Background màu Đỏ Nhạt (Light Red Tint) với đường viền Đỏ Thẫm (Crimson).
* **Tính năng:** Tiêu hủy Pool NFT (`BurnPoolNFT`).
* **Trải nghiệm Ma sát cao (High-Friction UX):**
1. Admin gõ tên cặp token (VD: "ADA/SNEK") vào thanh tìm kiếm.
2. Bấm nút **`[ Delete Pool ]`** (Màu đỏ).
3. Lập tức màn hình tối lại, một Modal Popup xuất hiện giữa màn hình.
4. *Nội dung Modal:* "Hành động này sẽ đóng Pool vĩnh viễn và đốt Pool NFT. Để tiếp tục, hãy gõ chính xác dòng chữ: **BURN-ADA-SNEK**".
5. Nút **`[ Execute BurnPoolNFT ]`** bên trong Modal bị làm mờ (Disabled) và CHỈ SÁNG LÊN khi chuỗi ký tự được gõ khớp 100%.



Bản thiết kế này đáp ứng hoàn hảo tiêu chí của một ứng dụng tài chính phi tập trung cấp doanh nghiệp (Enterprise DeFi App): Tinh gọn, rõ ràng, an toàn tuyệt đối và ngăn chặn triệt để các rủi ro do lỗi con người (Human errors).

Đây chính là "bản hợp đồng" cuối cùng để đội ngũ kỹ thuật Frontend và Backend ráp nối với nhau. Đối với Phân hệ Quản trị (Admin Portal), API Contract không chỉ cần cung cấp đúng dữ liệu, mà còn phải đảm bảo tính toàn vẹn (integrity) để chống lại các cuộc tấn công thay đổi tham số.

Dưới đây là thiết kế **Full API Contract cho Phân hệ Quản trị viên**, bám sát 100% các Màn hình và Logic Smart Contract mà chúng ta đã thống nhất:

---

### Nhóm 1: API Xác thực & Cổng Bảo vệ (Auth & Guard)

API này được gọi ngầm ngay khi Admin kết nối ví ở màn hình ngoài cùng, dùng để kiểm tra quyền truy cập trước khi tải bất kỳ dữ liệu nào khác.

**1. Kiểm tra Quyền Quản trị (Check Admin Status)**

* **Endpoint:** `GET /api/v1/admin/auth/check`
* **Query Params:** `?wallet_address=addr1...`
* **Response (JSON):**
```json
{
  "success": true,
  "data": {
    "is_admin": true,
    "roles": {
      "is_factory_admin": true,  // Quyền chuyển giao Admin
      "is_settings_admin": true  // Quyền đổi tham số vĩ mô
    },
    "system_status": {
      "current_version": 5       // Lấy từ settings_validator
    }
  }
}

```


*(Lưu ý cho Frontend: Nếu `is_admin: false`, lập tức đá người dùng văng ra màn hình đăng nhập).*

---

### Nhóm 2: API Giám sát Vĩ mô (Dashboard Analytics)

Đổ dữ liệu cho Màn hình 1 (Dashboard).

**2. Tổng hợp Chỉ số (Global Metrics)**

* **Endpoint:** `GET /api/v1/admin/dashboard/metrics`
* **Response (JSON):**
```json
{
  "success": true,
  "data": {
    "total_tvl_usd": 45000000.50,
    "volume_24h_usd": 12500000.00,
    "active_pools": 142,
    "total_pending_fees_usd": 12500.00,
    "charts": {
      "fee_growth_30d": [
        {"date": "2026-02-01", "accumulated_usd": 5000},
        {"date": "2026-02-02", "accumulated_usd": 5300}
      ]
    }
  }
}

```



---

### Nhóm 3: API Thu hoạch Doanh thu (Revenue & Fees)

Đổ dữ liệu cho Màn hình 2 và cung cấp bộ dựng giao dịch để rút phí.

**3.1. Lấy Danh sách Phí Đang Chờ (Pending Fees List)**

* **Endpoint:** `GET /api/v1/admin/revenue/pending`
* **Response (JSON):**
```json
{
  "success": true,
  "data": [
    {
      "pool_id": "pool_nft_hash_1",
      "pair": "ADA/USDT",
      "pending_fees": {
        "asset_a_amount": 1500000000, // 1500 ADA
        "asset_b_amount": 750000000,  // 750 USDT
        "total_usd_value": 2100.00
      }
    },
    {
      "pool_id": "pool_nft_hash_2",
      "pair": "ADA/SNEK",
      "pending_fees": {
        "asset_a_amount": 500000000,
        "asset_b_amount": 25000000000,
        "total_usd_value": 850.00
      }
    }
  ]
}

```



**3.2. Dựng Giao dịch Thu Phí Hàng Loạt (Build Batch CollectFees)**
*Hỗ trợ UI chọn nhiều Pool cùng lúc để tiết kiệm phí giao dịch mạng lưới Cardano.*

* **Endpoint:** `POST /api/v1/admin/revenue/build-collect`
* **Payload (Body):**
```json
{
  "admin_address": "addr1...",
  "pool_ids": [
    "pool_nft_hash_1",
    "pool_nft_hash_2"
  ]
}

```


* **Response:** `{ "success": true, "tx_cbor": "84a4..." }` (Chứa logic gọi `CollectFees` trên các pool được chọn).

---

### Nhóm 4: API Quản trị Cấu hình (Protocol Settings)

Phục vụ Màn hình 3. API đọc cấu hình cũ và API ghi cấu hình mới.

**4.1. Lấy Cấu hình Hiện hành (Get Current Settings)**
*Dùng để Frontend điền sẵn (pre-fill) vào các ô input và lấy tham số `current_version`.*

* **Endpoint:** `GET /api/v1/admin/settings/current`
* **Response (JSON):**
```json
{
  "success": true,
  "data": {
    "global_settings": {
      "max_protocol_fee_bps": 50,
      "min_pool_liquidity": 1000000000, // 1000 ADA
      "current_version": 5
    },
    "factory_settings": {
      "admin_vkh": "hash_of_current_admin..."
    }
  }
}

```



**4.2. Dựng Giao dịch Cập nhật Cấu hình Toàn cục (Update Global Settings)**
*Tương tác với `settings_validator.ak`. Frontend phải tự động lấy `current_version + 1` truyền vào trường `next_version`.*

* **Endpoint:** `POST /api/v1/admin/settings/build-update-global`
* **Payload (Body):**
```json
{
  "admin_address": "addr1...",
  "new_settings": {
    "max_protocol_fee_bps": 50,
    "min_pool_liquidity": 1500000000,
    "next_version": 6  // Ràng buộc tử huyệt: Bắt buộc = current_version + 1
  }
}

```


* **Response:** `{ "success": true, "tx_cbor": "84a4..." }`

**4.3. Dựng Giao dịch Chuyển giao Quyền lực (Update Factory Admin)**
*Tương tác với `factory_validator.ak`.*

* **Endpoint:** `POST /api/v1/admin/settings/build-update-factory`
* **Payload (Body):**
```json
{
  "current_admin_address": "addr1...",
  "new_admin_vkh": "hash_of_new_admin_wallet..." 
}

```


* **Response:** `{ "success": true, "tx_cbor": "84a4..." }`

---

### Nhóm 5: API Khu vực Khẩn cấp (Danger Zone)

Phục vụ Màn hình 4.

**5.1. Dựng Giao dịch Đóng Pool (Build Burn Pool NFT)**

* **Endpoint:** `POST /api/v1/admin/pools/build-burn`
* **Payload (Body):**
```json
{
  "admin_address": "addr1...",
  "pool_id": "pool_nft_hash_to_destroy"
}

```


* **Response:** `{ "success": true, "tx_cbor": "84a4..." }` (Chứa logic gọi `BurnPoolNFT` của `pool_nft_policy`).

---

### Quy trình Ký và Đẩy Giao dịch (Sign & Submit Flow)

Đồng nhất với các phân hệ trước, đối với tất cả các API `POST` trả về `tx_cbor` ở trên, Frontend sẽ thực hiện quy trình 2 bước chuẩn Web3:

1. Gọi ví CIP-30 (Nami/Eternl) hiện Popup để Admin ký xác nhận chuỗi `tx_cbor` này bằng Private Key.
2. Lấy chuỗi đã ký (`signed_tx_cbor`) đẩy lên Endpoint dùng chung của toàn hệ thống là `POST /api/v1/network/submit` để phát sóng lên blockchain Cardano.

Với bộ API Contract này, bạn đã thiết lập xong một đường ống giao tiếp an toàn, khép kín và phân định rạch ròi trách nhiệm giữa Giao diện người dùng và Động cơ xử lý lõi (Core Engine). Bạn đã nắm trong tay toàn bộ bản thiết kế từ Frontend đến Backend API cho một sàn DEX Intent-based cực kỳ hiện đại!