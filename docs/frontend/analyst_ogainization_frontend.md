Việc lựa chọn Vercel làm nền tảng triển khai (deployment) là một quyết định cực kỳ sáng suốt cho các dự án Web3 hiện đại. Vercel sinh ra là để tối ưu hóa cho hệ sinh thái **Next.js**, mang lại tốc độ tải trang cực nhanh, hỗ trợ xử lý linh hoạt cả Server-side (SSR) lẫn Client-side (CSR).

Kiến trúc frontend dưới đây được thiết kế với tư duy phân tách trách nhiệm (Separation of Concerns) rất khắt khe, áp dụng các nguyên lý tương đồng với lập trình hướng đối tượng (OOP) để đảm bảo mã nguồn (source code) luôn gọn gàng, dễ bảo trì và dễ mở rộng khi dự án phình to.

Dưới đây là sơ đồ tổ chức source code chi tiết và các stack công nghệ khuyên dùng:

### 1. Stack Công nghệ Đề xuất (Tech Stack)

* **Framework Core:** Next.js (Sử dụng App Router mới nhất).
* **Ngôn ngữ:** TypeScript. Việc định nghĩa chặt chẽ các `interface` (kiểu dữ liệu) sẽ khớp hoàn hảo với các API Contract JSON mà chúng ta đã thiết kế, giúp bắt lỗi ngay lúc gõ code (compile time) thay vì lúc chạy (runtime).
* **Quản lý State:** Zustand (Nhẹ nhàng, dễ dùng hơn Redux, hoàn hảo để lưu trạng thái kết nối ví của người dùng).
* **Giao tiếp API:** TanStack Query (React Query). Cực kỳ mạnh mẽ trong việc tự động gọi lại API (polling) để làm mới Sổ lệnh ảo và Portfolio mà không cần viết quá nhiều logic.
* **Tương tác Blockchain (Cardano):** Lucid hoặc MeshJS (Hai thư viện TypeScript phổ biến nhất để dựng giao dịch và kết nối ví CIP-30).
* **UI / Styling:** Tailwind CSS kết hợp với Shadcn UI (Giúp xây dựng các component nhanh và đồng bộ).

---

### 2. Cấu trúc Thư mục Nguồn (Directory Structure)

Toàn bộ code sẽ nằm trong thư mục `src/`. Chúng ta sẽ tổ chức theo kiến trúc hướng tính năng (Feature-based Architecture) kết hợp với các lớp dịch vụ (Services Layer).

```text
src/
├── app/                    # Routing (Next.js App Router)
│   ├── (main)/             # Nhóm route cho người dùng phổ thông
│   │   ├── (trading)/      # -> app.mysolverdex.com/
│   │   │   └── page.tsx    # Màn hình Trading Terminal
│   │   ├── portfolio/      # -> app.mysolverdex.com/portfolio
│   │   │   └── page.tsx    # Màn hình Quản lý danh mục
│   │   └── liquidity/      # -> app.mysolverdex.com/liquidity
│   │       ├── page.tsx    # Màn hình Pool Explorer
│   │       └── [pool_id]/  # -> app.mysolverdex.com/liquidity/ADA_USDT
│   │           └── page.tsx# Màn hình Pool Detail
│   ├── (admin)/            # Nhóm route cho Admin
│   │   └── admin/          # -> admin.mysolverdex.com/
│   │       ├── dashboard/  
│   │       ├── revenue/
│   │       └── settings/
│   ├── layout.tsx          # Layout tổng chứa Header, Footer, Web3 Provider
│   └── middleware.ts       # Nơi xử lý logic tách Subdomain (app. vs admin.)
│
├── components/             # Chứa các UI Components
│   ├── ui/                 # Component cơ bản (Button, Modal, Input, Slider)
│   ├── layouts/            # Component bộ khung (Sidebar Admin, Navbar Header)
│   └── features/           # Component nghiệp vụ lớn (Cô lập logic)
│       ├── trading/        # (e.g., OrderEntryPanel.tsx, PseudoOrderbook.tsx)
│       ├── portfolio/      # (e.g., OpenOrdersTable.tsx, AssetPieChart.tsx)
│       ├── liquidity/      # (e.g., DepositForm.tsx, ProportionalInput.tsx)
│       └── admin/          # (e.g., DangerZoneBurn.tsx, VersioningInput.tsx)
│
├── lib/                    # Lớp Dịch vụ cốt lõi (Services & Logic) - RẤT QUAN TRỌNG
│   ├── api/                # Nơi định nghĩa các hàm gọi HTTP (Axios)
│   │   ├── apiClient.ts    # Cấu hình Axios instance cơ bản
│   │   ├── trading.api.ts  # Chứa các endpoint tạo lệnh, lấy quote
│   │   └── portfolio.api.ts
│   ├── web3/               # Cô lập TẤT CẢ sự phức tạp của Cardano vào đây
│   │   ├── wallet.ts       # Xử lý kết nối ví CIP-30 (Nami, Eternl)
│   │   └── txBuilder.ts    # Hàm nhận CBOR từ backend -> gọi ví ký -> submit
│   └── utils/              # Các hàm phụ trợ (format ngày tháng, số thập phân)
│
├── hooks/                  # React Custom Hooks
│   ├── useWallet.ts        # Hook lắng nghe thay đổi của ví
│   ├── useMarketData.ts    # Hook chứa React Query gọi Sổ lệnh liên tục
│   └── useDepositMath.ts   # Hook xử lý logic tự động tính số lượng token B
│
├── store/                  # Global State (Zustand)
│   └── useGlobalStore.ts   # Lưu trữ currentWallet, theme (dark/light), slippage tolerance
│
└── types/                  # TypeScript Interfaces (Đồng bộ 100% với API Contract)
    ├── api.types.ts        # Chứa định nghĩa API Response
    ├── models.types.ts     # Định nghĩa cấu trúc Datum, UTxO, Asset
    └── web3.types.ts       

```

---

### 3. Phân tích Các Lớp Kiến trúc Điển hình

Để giữ cho source code sạch sẽ, chúng ta áp dụng luồng dữ liệu 1 chiều và cô lập logic (Decoupling).

**A. Lớp Hiển thị (View Layer - `components/features/`)**
Nhiệm vụ của các file trong này *chỉ là vẽ UI và bắt sự kiện click*. Chúng tuyệt đối không chứa logic tính toán tiền bạc hay tự gọi Axios.
*Ví dụ:* Component `DepositForm.tsx` chỉ hiển thị 2 ô nhập liệu. Khi gõ số, nó gọi một hàm từ `useDepositMath.ts` để lấy kết quả hiển thị. Khi bấm "Supply", nó gọi một hàm truyền xuống từ component cha.

**B. Lớp Trạng thái & Logic (Hooks Layer - `hooks/`)**
Là cầu nối giữa UI và Data. `React Query` sẽ nằm ở đây.
*Ví dụ:* `useMarketData.ts` sẽ thiết lập một chu kỳ 5 giây/lần tự động gọi hàm trong `lib/api/trading.api.ts` để lấy Sổ lệnh mới nhất và báo cho View Layer vẽ lại.

**C. Lớp Giao tiếp & Tương tác (Services Layer - `lib/`)**
Đây là nơi chứa các "Đối tượng" (Objects) chuyên làm các nhiệm vụ nặng nhọc.

* **`api/`**: Nơi biến các bản thiết kế API Contract thành mã code.
* **`web3/txBuilder.ts`**: Nơi tương tác trực tiếp với ví Cardano. Frontend Component chỉ cần gọi `signAndSubmit(tx_cbor)`, phần còn lại (hiện popup, bắt lỗi từ chối ký, tạo mã hash) file này sẽ lo hết.

---

### 4. Giải quyết bài toán Subdomain Admin trên Vercel

Vì bạn muốn triển khai chung 1 project lên Vercel nhưng lại muốn phân tách `app.mysolverdex.com` và `admin.mysolverdex.com`, Next.js 14+ cung cấp một tính năng cực mạnh là **Middleware**.

Trong file `src/middleware.ts`, bạn thiết lập một logic như sau (Mô phỏng):

1. Lắng nghe mọi request (yêu cầu) truy cập vào Vercel.
2. Kiểm tra phần `hostname` (tên miền) của request đó.
3. Nếu hostname là `admin.mysolverdex...`, âm thầm định tuyến (rewrite) người dùng vào thư mục `app/(admin)/admin`.
4. Nếu hostname là `app.mysolverdex...` (hoặc tên miền gốc), định tuyến vào thư mục `app/(main)`.

Cách này giúp bạn có 2 không gian hoàn toàn tách biệt, Admin sẽ tự động có Theme Sáng (do layout riêng) và Trader có Theme Tối, nhưng bạn chỉ cần gõ lệnh `git push` một lần duy nhất lên Vercel.

Kiến trúc thư mục và cách tiếp cận chia tách logic này sẽ giúp source code của dự án đáp ứng được tiêu chuẩn bảo trì chuyên nghiệp. 