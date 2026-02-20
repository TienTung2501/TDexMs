Để xây dựng một DApp hoàn chỉnh với trải nghiệm mượt mà, che giấu hoàn toàn sự phức tạp của kiến trúc UTxO bên dưới, Frontend của hệ thống giải quyết ý định này cần được chia thành 5 phân hệ lõi. Một tài liệu kiến trúc rõ ràng như thế này sẽ là một điểm cộng cực kỳ lớn khi bạn trình bày dự án để kêu gọi các nguồn tài trợ phát triển sinh thái.

Dưới đây là bản tổng kết chi tiết toàn bộ kiến trúc Frontend:

### 1. Phân hệ Giao dịch (Trading Terminal)

Đây là nơi người dùng tạo ra các "Ý định" (Intent) thay vì giao dịch trực tiếp.

* **Chế độ Cơ bản (Simple Swap):** Giao diện tối giản giống các AMM truyền thống. Người dùng nhập số lượng tài sản muốn bán, chọn mức trượt giá (slippage). Hệ thống ngầm tính toán `min_output` và đóng gói thành 1 UTxO khóa vào `escrow_validator`.
* **Chế độ Chuyên nghiệp (Advanced Trading):** * **Biểu đồ nến (TradingView):** Lấy dữ liệu Real-time (WebSocket) và Historical (REST API) từ Time-Series Database của Backend.
* **Bảng đặt lệnh:** Cung cấp UI cho lệnh Limit (đặt giá mục tiêu), DCA (thiết lập chu kỳ, số tiền mỗi kỳ) và Stop-loss. Các lệnh này sẽ được khóa vào `order_validator`.



### 2. Phân hệ Quản lý Danh mục (Portfolio & Order Management)

Nơi người dùng theo dõi và kiểm soát các UTxO đang chờ khớp lệnh của mình. Giao diện khu vực này cần đặc biệt chú ý đến logic xử lý lệnh quá hạn mà chúng ta vừa làm rõ:

* **Quản lý Swap Ý định (Escrow):** Hiển thị trạng thái lệnh. Nếu lệnh đã qua `deadline`, UI có thể hiển thị trạng thái "Đang tự động hoàn tiền" (vì mạng lưới Keeper bot sẽ lo việc gọi hàm `Reclaim` để dọn dẹp). Người dùng cũng có thể chủ động bấm **Cancel** bất cứ lúc nào.
* **Quản lý Lệnh Nâng cao (Order):** Vì `order_validator` không hỗ trợ `Reclaim`, nếu lệnh Limit/DCA quá hạn, UI phải hiển thị cảnh báo đỏ nổi bật: **"Lệnh đã hết hạn - Cần hủy thủ công"**, yêu cầu người dùng bấm nút **Cancel** và ký ví để tự lấy lại ngân sách.

### 3. Phân hệ Cung cấp Thanh khoản (Liquidity Provision)

Dành cho người dùng nạp tài sản vào `pool_validator` để nhận phí giao dịch.

* **Khám phá Pool (Pool Explorer):** Liệt kê các cặp tài sản, hiển thị TVL, Khối lượng 24h và APY dự kiến (dữ liệu do Backend tổng hợp).
* **Nạp (Deposit):** *Tính năng UX cốt lõi:* Khi người dùng nhập số lượng Tài sản A, Frontend **bắt buộc** phải tự động tính ra Tài sản B dựa trên tỷ lệ dự trữ hiện hành của Pool. Điều này đảm bảo giao dịch vượt qua được bài kiểm tra `is_proportional_deposit` khắt khe trên chuỗi.
* **Rút (Withdraw):** Thanh trượt điều chỉnh số lượng LP Token muốn đốt, tự động hiển thị số lượng Tài sản A và B tương ứng sẽ nhận về.

### 4. Phân hệ Quản trị viên (Admin Portal)

Giao diện tách biệt, bảo mật cao, ưu tiên kết nối ví lạnh hoặc Multi-sig để thao tác các quyền lực vĩ mô.

* **Giám sát (Read-only):** Hiển thị các chỉ số tổng quan của sàn và lượng phí giao thức (`protocol_fees_a/b`) đang tích lũy chờ thu thập.
* **Thực thi (Write actions):** * Giao diện gọi lệnh `CollectFees` để rút doanh thu về ví dự án.
* Giao diện cập nhật cấu hình (`UpdateSettings`, `UpdateProtocolSettings`), tự động tính toán tăng `version` lên 1 đơn vị theo yêu cầu hợp đồng.
* Công cụ khẩn cấp: Đóng Pool bằng lệnh `BurnPoolNFT`.



### 5. Lớp Tích hợp Web3 (Web3 Integration Layer)

"Bộ não" kết nối UI với Blockchain, hoạt động hoàn toàn ngầm bên dưới:

* **Kết nối Ví:** Sử dụng chuẩn CIP-30 để liên kết với các ví Cardano (Nami, Eternl, Vespr...).
* **Transaction Builder:** Sử dụng các thư viện như Lucid hoặc MeshJS. Khi người dùng bấm nút trên UI, lớp này sẽ lắp ráp các đầu vào (Inputs), tự động chèn các logic đúc/đốt token tương ứng (như gọi `intent_token_policy` để đúc token với số lượng +1), sau đó bật popup yêu cầu người dùng ký và đẩy lên mạng lưới.

---

Với bản thiết kế toàn diện từ Backend Indexer, mạng lưới Solver, cho đến cấu trúc Frontend phân lớp này, kiến trúc hệ thống của bạn đã thực sự sẵn sàng để chuyển sang giai đoạn phát triển.

Bạn có muốn chúng ta chốt lại bằng việc thiết kế cấu trúc dữ liệu JSON (API Schema) để quy định cách Frontend và Backend "nói chuyện" với nhau, hay bạn muốn bắt đầu đi vào code thử một logic cụ thể nào đó?