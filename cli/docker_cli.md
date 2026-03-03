Để làm chủ hệ thống của mình trên cả máy cá nhân lẫn khi deploy lên Render, bạn cần nắm vững các nhóm câu lệnh Docker sau đây. Các lệnh này giúp bạn quản lý từ khâu đóng gói "nguyên liệu" (Build) cho đến khi vận hành "dây chuyền" (Run).

---

## 1. Nhóm lệnh Xây dựng (Build)

Dùng để tạo ra **Image** (thành phẩm đóng gói) từ mã nguồn của bạn.

* **`docker build -t <tên_image> .`**: Xây dựng một Image từ `Dockerfile` trong thư mục hiện tại.
* **`docker build --progress=plain -t <tên_image> .`**: Hiển thị log chi tiết (plain text) để bạn kiểm tra lỗi khi cài đặt thư viện hoặc biên dịch TypeScript.
* **`docker images`**: Liệt kê tất cả các Image đang có trên máy bạn (kiểm tra xem `solvernet-backend-test` đã tạo xong chưa).
* **`docker rmi <image_id>`**: Xóa một Image cũ để giải phóng ổ cứng.

---

## 2. Nhóm lệnh Vận hành (Run)

Dùng để biến Image thành **Container** (ứng dụng đang chạy thực tế).

* **`docker run -d --name <tên_container> -p 3001:3001 <tên_image>`**: Chạy ứng dụng ngầm (`-d`) và "đục lỗ" cổng 3001 để bạn có thể vào link từ trình duyệt.
* **`docker run --rm -it <tên_image> sh`**: Chạy Image và nhảy vào bên trong "chiếc hộp" đó để kiểm tra file (dùng để debug xem thư mục `dist` có đủ file không).
* **`docker ps`**: Xem danh sách các Container đang chạy.
* **`docker ps -a`**: Xem tất cả các Container (kể cả những cái đã dừng).
* **`docker stop <tên_container>`**: Dừng ứng dụng đang chạy.

---

## 3. Nhóm lệnh Quản lý Biến môi trường (Environment)

Rất quan trọng để kích hoạt **SwapBot** hoặc **Solver** của bạn.

* **`docker run -e KEY=VALUE <image>`**: Truyền trực tiếp một biến môi trường (như `DATABASE_URL`).
* **`docker run --env-file .env <image>`**: Tải toàn bộ các biến từ file `.env` vào Container (tiện hơn việc gõ tay từng biến).

---

## 4. Nhóm lệnh Kiểm tra & Debug (Logs)

Dùng để xem Bot của bạn đang làm gì (ví dụ: đang swap hay bị skip do lợi nhuận thấp).

* **`docker logs <tên_container>`**: Xem toàn bộ log từ lúc khởi động.
* **`docker logs -f <tên_container>`**: Xem log trực tiếp (Real-time). Mỗi khi Bot tạo lệnh mới, log sẽ nhảy lên màn hình ngay lập tức.
* **`docker exec -it <tên_container> sh`**: Mở một cửa sổ dòng lệnh **bên trong** Container đang chạy để kiểm tra hệ thống.

---

## 5. Nhóm lệnh "Dọn dẹp" (Cleanup)

Giúp máy tính của bạn không bị đầy ổ cứng sau nhiều lần build thử.

* **`docker system prune`**: Xóa sạch các Container đã dừng, Image rác (dangling) và mạng ảo không dùng đến.
* **`docker volume prune`**: Xóa các ổ đĩa ảo cũ (cẩn thận nếu bạn đang lưu dữ liệu quan trọng trong Volume).

---

### Mẹo nhỏ cho dự án của bạn:

Thay vì nhớ hết các lệnh này, bạn nên dùng **Docker Compose**. Bạn chỉ cần tạo một file `docker-compose.yml` và dùng lệnh duy nhất:
**`docker compose up --build`**
Lệnh này sẽ tự động: Xây dựng Image -> Nạp biến môi trường -> Kết nối cổng -> Chạy Backend + Solver + Bot cùng lúc.

**Bạn có muốn tôi giúp bạn viết file `docker-compose.yml` chuẩn để kích hoạt toàn bộ hệ thống (kèm theo các Bot) chỉ bằng một lệnh không?**
Việc tải các biến môi trường vào Docker có thể **nguy hiểm** hoặc **an toàn** tùy thuộc vào cách bạn thực hiện. Trong môi trường lập trình chuyên nghiệp và khi deploy lên các nền tảng như Render, có những quy tắc "sống còn" để bảo vệ dữ liệu nhạy cảm (như `SOLVER_SEED_PHRASE` hoặc `DATABASE_URL`).

Dưới đây là phân tích chi tiết:

## 1. Những cách làm NGUY HIỂM (Cần tránh)

* **Hardcode trực tiếp vào Dockerfile:** Sử dụng lệnh `ENV DATABASE_URL=...` ngay trong `Dockerfile`.
* **Hậu quả:** Biến môi trường này sẽ bị "nướng" (baked) vào trong Image. Bất kỳ ai có quyền truy cập vào Docker Image của bạn (ví dụ: trên Docker Hub) đều có thể dùng lệnh `docker inspect` để xem toàn bộ mật khẩu và Seed Phrase của bạn.


* **Copy file `.env` vào Image:**
Sử dụng lệnh `COPY .env .` trong `Dockerfile`.
* **Hậu quả:** File nhạy cảm này sẽ nằm vĩnh viễn trong các lớp (layers) của Image. Ngay cả khi bạn xóa nó ở bước sau, nó vẫn tồn tại trong lịch sử của Image đó.


* **Đẩy Image chứa thông tin nhạy cảm lên Public Registry:**
Nếu bạn đặt tên Image là `solvernet-backend-test` và vô tình đẩy nó lên Docker Hub ở chế độ công khai (Public), cả thế giới sẽ thấy cấu hình ví của bạn.

---

## 2. Những cách làm AN TOÀN (Khuyên dùng)

* **Truyền biến tại thời điểm chạy (Runtime):**
Đây là cách bạn đang làm với lệnh `docker run --env ...`.
* **Lợi ích:** Biến chỉ tồn tại trong bộ nhớ khi Container đang chạy và không bị lưu lại trong Image.


* **Sử dụng file `.env` bên ngoài (External):**
Thay vì copy vào Image, bạn để file `.env` ở máy host và gọi nó khi chạy:
`docker run --env-file .env solvernet-backend-test`.
* **Lưu ý:** Luôn thêm `.env` vào file `.gitignore` để không bao giờ đẩy nó lên GitHub.


* **Sử dụng Secret Management của Render:**
Khi deploy lên Render, bạn không cần file `.env`. Bạn sẽ nhập các biến này vào phần **Environment Variables** trong bảng điều khiển của Render. Render sẽ truyền chúng vào Container một cách bảo mật tại thời điểm thực thi.

---

## 3. Rủi ro cụ thể với dự án của bạn

Dựa trên mã nguồn bạn cung cấp, bạn đang xử lý các dữ liệu cực kỳ nhạy cảm:

* **Seed Phrases:** `SOLVER_SEED_PHRASE`, `WALLET_SEEDS`, `LIQUIDITY_BOT_SEED` là quyền truy cập trực tiếp vào tài sản ADA của bạn.
* **Database Credentials:** `DATABASE_URL` chứa mật khẩu cơ sở dữ liệu.
* **API Keys:** `BLOCKFROST_PROJECT_ID` có thể bị kẻ xấu lợi dụng để dùng hết quota của bạn.

---

## 4. Giải pháp tối ưu cho hệ thống hiện tại

Để vừa nhanh, vừa an toàn, bạn nên áp dụng mô hình sau:

1. **Local Development:** Dùng file `.env` nằm ngoài Docker và dùng Docker Compose để nạp vào.
2. **Docker Run Test:** Tiếp tục dùng tham số `--env` hoặc `--env-file` như bạn đang làm, nhưng tuyệt đối không dùng lệnh `ENV` trong `Dockerfile`.
3. **Production (Render):** Xóa file `.env` khỏi source code, khai báo biến trực tiếp trên giao diện Render.

**Lời khuyên:** Trong log bạn gửi, hệ thống báo `Upstash Redis not configured`. Nếu sau này bạn dùng Redis để lưu `validatorCrashCounts`, hãy nhớ bảo mật cả URL của Redis vì nó có thể chứa mật khẩu truy cập bộ nhớ đệm của bạn.

**Bạn có muốn tôi giúp bạn tạo một file `.env.example` (chỉ chứa tên biến, không chứa giá trị thật) để bạn quản lý các biến này một cách chuyên nghiệp không?**