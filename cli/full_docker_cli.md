Chào bạn! Để bạn làm chủ hoàn toàn "nghiệp vụ" Docker cho dự án SolverNet (từ lúc code ở máy cá nhân đến khi đẩy lên Render), mình đã tổng hợp bộ lệnh đầy đủ và chia theo từng giai đoạn thực tế nhất.

---

## 1. Giai đoạn 1: Đóng gói (Build)

Đây là lúc bạn "đúc" code của mình thành một cái hộp (Image) cứng cáp.

* **Build cơ bản (Đặt tên Image):**
```powershell
docker build -t solvernet-backend-test .

```


* **Build xem log chi tiết (Dùng khi bị lỗi npm install hoặc tsc):**
```powershell
docker build --progress=plain -t solvernet-backend-test . 2>&1

```


* **Build bỏ qua Cache (Dùng khi bạn muốn cài lại toàn bộ thư viện từ đầu):**
```powershell
docker build --no-cache -t solvernet-backend-test .

```



---

## 2. Giai đoạn 2: Vận hành (Run)

Đưa "hộp" Image vào chạy thực tế (Container).

* **Chạy thử có kết nối cổng (Để vào được link http://localhost:3001):**
```powershell
docker run --rm -p 3001:3001 --env DATABASE_URL="url_cua_ban" solvernet-backend-test

```


* **Chạy ngầm (Dùng khi bạn muốn Bot chạy liên tục mà không hiện log chật màn hình):**
```powershell
docker run -d --name my-solver -p 3001:3001 --env-file .env solvernet-backend-test

```


* **Chạy và nhảy vào bên trong "khám nghiệm" (Debug file dist):**
```powershell
docker run --rm -it solvernet-backend-test sh

```



---

## 3. Giai đoạn 3: Kiểm soát & Giám sát (Monitor)

Xem Bot đang "swap" hay đang "ngủ", và kiểm tra sức khỏe hệ thống.

* **Xem danh sách các Container đang chạy:**
```powershell
docker ps

```


* **Xem Log trực tiếp của Bot (Cực kỳ quan trọng để check nghiệp vụ Swap):**
```powershell
docker logs -f <ID_hoặc_Tên_Container>

```


* **Kiểm tra tài nguyên (CPU/RAM mà Docker đang ngốn):**
```powershell
docker stats

```



---

## 4. Giai đoạn 4: Quản lý Hình ảnh (Images)

Quản lý các "bản thiết kế" trong máy.

* **Liệt kê các Image đã build:**
```powershell
docker images

```


* **Xóa một Image cũ (Để giải phóng ổ cứng):**
```powershell
docker rmi solvernet-backend-test

```


* **Kiểm tra thông tin chi tiết Image (Xem biến môi trường mặc định, tác giả...):**
```powershell
docker image inspect solvernet-backend-test

```



---

## 5. Giai đoạn 5: Dọn dẹp (Cleanup)

Sau một ngày build/test mệt nghỉ, hãy dọn dẹp để máy không bị lag.

* **Xóa toàn bộ Container đã dừng:**
```powershell
docker container prune

```


* **Lệnh "Tổng vệ sinh" (Xóa sạch Container dư thừa, Image rác, Network ảo):**
```powershell
docker system prune -a

```



---

## 6. Tuyệt chiêu: Docker Compose (Khuyên dùng)

Thay vì gõ đống lệnh trên, bạn tạo file `docker-compose.yml` và chỉ cần 1 lệnh duy nhất để chạy cả dàn Backend + Bot:

* **Khởi động toàn bộ hệ thống:**
```powershell
docker compose up --build

```


* **Dừng và xóa toàn bộ hệ thống:**
```powershell
docker compose down

```



---

### Mẹo nhỏ cho dự án Cardano của bạn:

Khi bạn sửa logic **Swap ADA nhỏ** (5-30 ADA) trong code, trình tự chuẩn nhất sẽ là:

1. `docker build -t solvernet-backend-test .` (Để cập nhật code mới vào Image).
2. `docker run --rm -p 3001:3001 --env-file .env solvernet-backend-test` (Để chạy thử và vào link API kiểm tra).

**Bạn có muốn mình soạn sẵn một file `docker-compose.yml` mẫu tích hợp cả Database Postgres và Backend để bạn không phải lo về việc cài đặt Postgres trên máy thật không?**