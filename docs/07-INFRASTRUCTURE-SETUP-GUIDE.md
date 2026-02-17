# SolverNet DEX — Hướng dẫn Thiết lập Hạ tầng

> Hướng dẫn chi tiết từng bước: đăng ký dịch vụ cloud (free tier), cấu hình environment, chạy local development, và deploy lên production.

**Stack hiện tại:**

| Dịch vụ | Vai trò | Free Tier |
|---|---|---|
| **Blockfrost** | Cardano API (thay Ogmios + Kupo) | 50.000 requests/ngày |
| **Supabase** | PostgreSQL database | 500 MB storage, 2 projects |
| **Upstash** | Redis cache (serverless) | 10.000 cmds/ngày, 256 MB |
| **Render** | Node.js backend hosting | 512 MB RAM, spin-down sau 15 phút |
| **Vercel** | Next.js frontend hosting | 100 GB bandwidth |
| **UptimeRobot** | Keep-alive ping cho Render | 50 monitors miễn phí |

---

## Mục lục

1. [Yêu cầu hệ thống](#1-yêu-cầu-hệ-thống)
2. [Đăng ký dịch vụ Cloud](#2-đăng-ký-dịch-vụ-cloud)
3. [Cài đặt công cụ Local](#3-cài-đặt-công-cụ-local)
4. [Cấu hình Environment](#4-cấu-hình-environment)
5. [Chạy Local Development](#5-chạy-local-development)
6. [Deploy Backend lên Render](#6-deploy-backend-lên-render)
7. [Deploy Frontend lên Vercel](#7-deploy-frontend-lên-vercel)
8. [Thiết lập UptimeRobot Keep-Alive](#8-thiết-lập-uptimerobot-keep-alive)
9. [Database Migration (Production)](#9-database-migration-production)
10. [Monitoring & Health Check](#10-monitoring--health-check)
11. [Tối ưu Free Tier](#11-tối-ưu-free-tier)
12. [Troubleshooting](#12-troubleshooting)
13. [Quick Start Checklist](#13-quick-start-checklist)

---

## 1. Yêu cầu hệ thống

### Local Development
| Thành phần | Yêu cầu |
|---|---|
| OS | Windows 10/11, macOS, Ubuntu 22.04+ |
| CPU | 2+ cores |
| RAM | 4 GB (không cần Cardano Node) |
| Disk | 5 GB SSD |
| Node.js | ≥ 20.x LTS |
| pnpm | ≥ 9.x |
| Docker | Tùy chọn (cho local PostgreSQL) |

### Production (Cloud — Free Tier)
| Thành phần | Dịch vụ |
|---|---|
| Backend | Render Free (512 MB RAM, 0.1 CPU) |
| Database | Supabase Free (500 MB PostgreSQL) |
| Cache | Upstash Free (256 MB Redis, 10K cmds/ngày) |
| Blockchain | Blockfrost Free (50K requests/ngày) |
| Frontend | Vercel Free (Serverless) |

> **Lưu ý:** Không cần chạy Cardano Node. Blockfrost API thay thế hoàn toàn Ogmios + Kupo, tiết kiệm ~32 GB RAM và ~120 GB disk.

---

## 2. Đăng ký dịch vụ Cloud

### 2.1 Blockfrost (Cardano API)

1. Truy cập [blockfrost.io](https://blockfrost.io) → **Sign up**
2. Tạo project → Chọn network **Preprod** (testnet)
3. Copy **Project ID** — dạng `preprodXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`
4. Base URL cho Preprod: `https://cardano-preprod.blockfrost.io/api/v0`

> **Giới hạn Free:** 50.000 requests/ngày, 10 requests/giây.  
> Cache giúp giảm ~60-70% requests (xem mục Tối ưu Free Tier).

### 2.2 Supabase (PostgreSQL Database)

1. Truy cập [supabase.com](https://supabase.com) → **Start your project**
2. Tạo organization → Tạo project
3. Chọn **Region** gần Render (ví dụ: Southeast Asia hoặc US East)
4. Đặt **Database password** (lưu cẩn thận!)
5. Vào **Settings → Database** → Copy connection strings:

```
# Connection Pooler (Transaction mode) — dùng cho app
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true

# Direct Connection — dùng cho Prisma migrate
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
```

> **Lưu ý quan trọng:**
> - `DATABASE_URL` dùng **port 6543** (pooler, cho app runtime)
> - `DIRECT_URL` dùng **port 5432** (direct, cho Prisma migrate)
> - Free tier: **500 MB** storage, **2 GB** transfer/tháng

### 2.3 Upstash Redis (Cache)

1. Truy cập [console.upstash.com](https://console.upstash.com) → **Create Database**
2. Chọn **Region** gần Render backend (cùng region tối ưu latency)
3. Chọn plan **Free** → Create
4. Copy credentials từ tab **REST API**:
   - **UPSTASH_REDIS_REST_URL** — dạng `https://xxx.upstash.io`
   - **UPSTASH_REDIS_REST_TOKEN** — dạng `AXxxYY...`

> **Giới hạn Free:** 10.000 commands/ngày, 256 MB storage, 1 database.  
> App sử dụng `@upstash/redis` (HTTP-based) — không cần TCP connection.

### 2.4 Render (Backend Hosting)

1. Truy cập [render.com](https://render.com) → **Sign up** (nên dùng GitHub account)
2. Chưa cần tạo service ngay — sẽ tạo ở bước Deploy

> **Render Free tier:**
> - 512 MB RAM, 0.1 CPU
> - **Spin-down sau 15 phút idle** → dùng UptimeRobot để keep-alive
> - 750 giờ/tháng (đủ chạy 24/7 cho 1 service)
> - Outbound bandwidth: 100 GB/tháng

### 2.5 Vercel (Frontend Hosting)

1. Truy cập [vercel.com](https://vercel.com) → **Sign up** (GitHub account)
2. Chưa cần import project — sẽ làm ở bước Deploy Frontend

### 2.6 UptimeRobot (Keep-Alive)

1. Truy cập [uptimerobot.com](https://uptimerobot.com) → **Register** (free)
2. Chưa cần tạo monitor — sẽ cấu hình sau khi deploy Render

---

## 3. Cài đặt công cụ Local

### 3.1 Node.js (v20 LTS)

**Windows (winget):**
```powershell
winget install OpenJS.NodeJS.LTS
# Hoặc sử dụng nvm-windows:
winget install CoreyButler.NVMforWindows
nvm install 20
nvm use 20
```

**macOS:**
```bash
brew install node@20
```

**Ubuntu:**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Kiểm tra:
```bash
node --version   # v20.x.x
npm --version    # 10.x.x
```

### 3.2 pnpm

```bash
npm install -g pnpm@9
pnpm --version   # 9.x.x
```

### 3.3 Docker (Tùy chọn — cho local PostgreSQL)

Chỉ cần nếu muốn chạy PostgreSQL local thay vì kết nối trực tiếp Supabase.

**Windows:** Tải [Docker Desktop](https://www.docker.com/products/docker-desktop/) → Bật WSL 2 backend.

**Ubuntu:**
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

### 3.4 Git

```bash
git --version  # 2.x.x
```

---

## 4. Cấu hình Environment

### 4.1 Cấu trúc file .env

```bash
cd packages/backend
cp .env.example .env
```

### 4.2 Nội dung .env đầy đủ

```dotenv
# ═══════════════════════════════════════════
# SolverNet DEX Backend — Environment Config
# ═══════════════════════════════════════════
# Stack: Render (Node.js) + Supabase (PostgreSQL) + Blockfrost (Cardano) + Upstash (Redis)

# ─── Server ───────────────────────────────
NODE_ENV=development
PORT=3001
HOST=0.0.0.0
LOG_LEVEL=info          # Dùng "warn" trên Render Free (tiết kiệm RAM)

# ─── Database (Supabase PostgreSQL) ──────
# Transaction mode (port 6543) — cho app runtime
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"
# Direct connection (port 5432) — cho Prisma migrate
DIRECT_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"

# ─── Upstash Redis (Cache) ───────────────
# Lấy từ Upstash Console → REST API tab
# Để trống nếu chạy không cache (graceful degradation)
UPSTASH_REDIS_URL=https://xxx.upstash.io
UPSTASH_REDIS_TOKEN=AXxxYY...

# ─── Cardano Network ─────────────────────
CARDANO_NETWORK=preprod

# ─── Blockfrost ──────────────────────────
BLOCKFROST_URL=https://cardano-preprod.blockfrost.io/api/v0
BLOCKFROST_PROJECT_ID=preprodXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# ─── Smart Contract ──────────────────────
ESCROW_SCRIPT_ADDRESS=
POOL_SCRIPT_ADDRESS=

# ─── Solver ───────────────────────────────
SOLVER_SEED_PHRASE=
SOLVER_BATCH_WINDOW_MS=5000
SOLVER_MAX_RETRIES=3
SOLVER_MIN_PROFIT_LOVELACE=100000
SOLVER_ENABLED=false     # Bật sau khi deploy smart contract

# ─── CORS ─────────────────────────────────
CORS_ORIGIN=http://localhost:3000,https://your-app.vercel.app

# ─── Rate Limiting ────────────────────────
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100

# ─── JWT ──────────────────────────────────
JWT_SECRET=change-this-in-production-to-a-random-64-char-hex-string
JWT_EXPIRES_IN=24h

# ─── Chart / OHLCV ───────────────────────
CHART_SNAPSHOT_INTERVAL_MS=60000   # 1 phút — cron aggregation
CHART_MAX_CANDLES=500              # Max candles per request
```

### 4.3 Giải thích các biến quan trọng

| Biến | Mô tả | Lưu ý |
|---|---|---|
| `DATABASE_URL` | Supabase connection qua PgBouncer (port 6543) | Bắt buộc |
| `DIRECT_URL` | Direct connection (port 5432) cho Prisma migrate | Chỉ cần khi migrate |
| `UPSTASH_REDIS_URL` | REST endpoint của Upstash Redis | Tùy chọn — app chạy được không cache |
| `UPSTASH_REDIS_TOKEN` | Auth token cho Upstash REST API | Tùy chọn |
| `BLOCKFROST_PROJECT_ID` | API key từ Blockfrost | Bắt buộc |
| `SOLVER_ENABLED` | Bật/tắt solver engine | Tắt cho đến khi deploy contract |
| `LOG_LEVEL` | `info` (dev), `warn` (production) | `warn` tiết kiệm RAM |
| `CHART_SNAPSHOT_INTERVAL_MS` | Bao lâu cron chạy 1 lần | 60000 = 1 phút |

---

## 5. Chạy Local Development

### 5.1 Clone và cài đặt

```bash
git clone https://github.com/your-repo/decentralize.git
cd decentralize

# Cài dependencies cho toàn bộ monorepo
pnpm install

# Build shared packages
pnpm build
```

### 5.2 Thiết lập Database

**Option A: Kết nối trực tiếp Supabase (Khuyên dùng)**
- Điền `DATABASE_URL` và `DIRECT_URL` trong `.env` bằng credentials từ Supabase
- Không cần Docker

**Option B: Local PostgreSQL với Docker**
```bash
docker run -d \
  --name solvernet-db \
  -e POSTGRES_USER=solvernet \
  -e POSTGRES_PASSWORD=solvernet \
  -e POSTGRES_DB=solvernet_dev \
  -p 5432:5432 \
  postgres:16-alpine

# .env
DATABASE_URL="postgresql://solvernet:solvernet@localhost:5432/solvernet_dev"
DIRECT_URL="postgresql://solvernet:solvernet@localhost:5432/solvernet_dev"
```

### 5.3 Chạy Prisma Migration

```bash
cd packages/backend

# Generate Prisma client
npx prisma generate

# Chạy migrations
npx prisma migrate dev --name init

# (Tùy chọn) Mở Prisma Studio để xem data
npx prisma studio
```

### 5.4 Start Backend

```bash
# Development mode (hot reload)
pnpm dev

# Hoặc build & run
pnpm build
node dist/index.js
```

### 5.5 Kiểm tra Health

```bash
curl http://localhost:3001/v1/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2025-...",
  "services": {
    "database": "healthy",
    "blockfrost": "healthy",
    "cache": "healthy"
  }
}
```

### 5.6 Start Frontend (Tùy chọn)

```bash
cd frontend-etf-factory-protocol
pnpm dev
# → http://localhost:3000
```

---

## 6. Deploy Backend lên Render

### 6.1 Chuẩn bị Repository

Đảm bảo code đã push lên GitHub. Render sẽ kết nối trực tiếp với repo.

### 6.2 Tạo Web Service trên Render

1. Truy cập [dashboard.render.com](https://dashboard.render.com) → **New +** → **Web Service**
2. Kết nối GitHub repo
3. Cấu hình:

| Setting | Value |
|---|---|
| **Name** | `solvernet-api` |
| **Region** | Singapore (hoặc gần Supabase nhất) |
| **Branch** | `main` |
| **Root Directory** | `packages/backend` |
| **Runtime** | Node |
| **Build Command** | `cd ../.. && pnpm install && pnpm build` |
| **Start Command** | `node dist/index.js` |
| **Instance Type** | Free |

> **Lưu ý Build Command:** Do monorepo structure, cần `cd ../..` để install từ root.

### 6.3 Cấu hình Environment Variables

Vào **Environment** tab, thêm các biến sau:

```
NODE_ENV=production
PORT=3001
HOST=0.0.0.0
LOG_LEVEL=warn

DATABASE_URL=postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:5432/postgres

UPSTASH_REDIS_URL=https://xxx.upstash.io
UPSTASH_REDIS_TOKEN=AXxxYY...

CARDANO_NETWORK=preprod
BLOCKFROST_URL=https://cardano-preprod.blockfrost.io/api/v0
BLOCKFROST_PROJECT_ID=preprodXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

ESCROW_SCRIPT_ADDRESS=
POOL_SCRIPT_ADDRESS=
SOLVER_ENABLED=false
SOLVER_SEED_PHRASE=

CORS_ORIGIN=https://your-app.vercel.app
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
JWT_SECRET=<random-64-char-hex>
JWT_EXPIRES_IN=24h

CHART_SNAPSHOT_INTERVAL_MS=60000
CHART_MAX_CANDLES=500
```

### 6.4 Deploy

1. Click **Create Web Service** → Render tự build và deploy
2. Đợi build complete (thường 2-5 phút)
3. Render gán URL dạng: `https://solvernet-api.onrender.com`

### 6.5 Chạy Migration trên Production

Sau khi deploy lần đầu, cần chạy Prisma migrate:

**Cách 1: Từ local machine (kết nối Supabase trực tiếp)**
```bash
cd packages/backend

# Đặt DIRECT_URL trong .env trỏ đến Supabase production
npx prisma migrate deploy
```

**Cách 2: Thêm vào Render build command**
```
cd ../.. && pnpm install && pnpm build && cd packages/backend && npx prisma migrate deploy
```

> **Lưu ý:** `prisma migrate deploy` chỉ apply migrations đã tạo, không tạo migration mới. An toàn cho production.

### 6.6 Kiểm tra Deploy

```bash
curl https://solvernet-api.onrender.com/v1/health
```

---

## 7. Deploy Frontend lên Vercel

### 7.1 Import Project

1. Truy cập [vercel.com/new](https://vercel.com/new)
2. Import GitHub repo
3. Cấu hình:

| Setting | Value |
|---|---|
| **Framework** | Next.js |
| **Root Directory** | `frontend-etf-factory-protocol` |
| **Build Command** | (auto-detect) |
| **Output Directory** | (auto-detect) |

### 7.2 Environment Variables

```
NEXT_PUBLIC_API_URL=https://solvernet-api.onrender.com
NEXT_PUBLIC_NETWORK=preprod
```

### 7.3 Deploy

Click **Deploy** → Vercel tự build và gán URL dạng `https://your-app.vercel.app`.

### 7.4 Cập nhật CORS

Quay lại Render → Environment → Cập nhật `CORS_ORIGIN`:
```
CORS_ORIGIN=https://your-app.vercel.app
```

---

## 8. Thiết lập UptimeRobot Keep-Alive

### 8.1 Vấn đề

Render Free tier **tự động spin-down** service sau **15 phút không có request**. Khi có request mới, service phải cold-start (~30-60 giây). Điều này gây:

- Trải nghiệm user xấu (chờ lâu sau idle)
- Solver engine bị tắt → mất intent processing
- Chain sync bị gián đoạn → data không cập nhật
- Cron jobs (price aggregation) bị dừng

### 8.2 Giải pháp: UptimeRobot Ping

UptimeRobot sẽ gửi HTTP request đến endpoint `/v1/health` mỗi **5 phút**, đảm bảo Render không bao giờ idle quá 15 phút.

### 8.3 Cấu hình

1. Đăng nhập [uptimerobot.com](https://uptimerobot.com)
2. Click **+ Add New Monitor**
3. Cấu hình:

| Field | Value |
|---|---|
| **Monitor Type** | HTTP(s) |
| **Friendly Name** | `SolverNet API` |
| **URL** | `https://solvernet-api.onrender.com/v1/health` |
| **Monitoring Interval** | **5 minutes** |

4. (Tùy chọn) Cấu hình **Alert Contacts** để nhận email khi service down
5. Click **Create Monitor**

### 8.4 Kiểm tra hoạt động

- Vào UptimeRobot dashboard → Monitor hiển thị **UP** (màu xanh)
- Response time trung bình: ~100-300ms (khi service đã warm)
- Nếu thấy response time > 30s → đó là cold-start, bình thường cho lần đầu

### 8.5 Tối ưu Keep-Alive

```
Interval 5 phút × 24 giờ × 30 ngày = 8.640 pings/tháng
```

- **UptimeRobot Free:** 50 monitors, interval tối thiểu 5 phút → đủ dùng
- **Render Free:** 750 giờ/tháng = ~31 ngày liên tục → đủ chạy 24/7 cho 1 service
- Health endpoint nhẹ (~1-5ms xử lý) → không tốn tài nguyên đáng kể

### 8.6 Lịch trình hoạt động

```
┌─────────────────────────────────────────────────────────────────┐
│ Timeline: Render Free + UptimeRobot                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  t=0        t=5m       t=10m      t=15m      t=20m             │
│  │──────────│──────────│──────────│──────────│─────            │
│  ▲ ping     ▲ ping     ▲ ping     ▲ ping     ▲ ping           │
│  │          │          │          │          │                  │
│  └── Service luôn warm, không bao giờ spin-down ──┘            │
│                                                                 │
│  Nếu KHÔNG có UptimeRobot:                                     │
│  t=0    t=15m (spin-down) ─── t=? (cold start 30-60s) ───     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. Database Migration (Production)

### 9.1 Tạo Migration mới

```bash
# Trên local machine
cd packages/backend

# Tạo migration (dev only)
npx prisma migrate dev --name add_new_feature

# Commit migration files
git add prisma/migrations
git commit -m "feat: add new migration"
git push
```

### 9.2 Apply Migration lên Production

```bash
# Dùng DIRECT_URL (port 5432) — không qua PgBouncer
DIRECT_URL="postgresql://..." npx prisma migrate deploy
```

### 9.3 Reset Database (nếu cần)

```bash
# ⚠️ XÓA TOÀN BỘ DATA — chỉ dùng trên dev/preprod
npx prisma migrate reset
```

### 9.4 Prisma Studio (xem data)

```bash
npx prisma studio
# → http://localhost:5555
```

---

## 10. Monitoring & Health Check

### 10.1 Health Endpoint

```bash
GET /v1/health
```

Response chi tiết:
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "services": {
    "database": "healthy",
    "blockfrost": "healthy",
    "cache": "healthy"
  }
}
```

| Service | Healthy khi | Unhealthy khi |
|---|---|---|
| `database` | Prisma `$queryRaw` thành công | Connection timeout / error |
| `blockfrost` | `/health` trả `{ is_healthy: true }` | API unreachable |
| `cache` | Redis PING thành công | Upstash unreachable |

> Nếu Upstash chưa cấu hình, `cache` trả `"not_configured"` (không phải error).

### 10.2 Render Dashboard

- **Logs:** Render Dashboard → Service → **Logs** tab → Real-time log stream
- **Metrics:** CPU, Memory, Request count (cơ bản)
- **Events:** Deploy history, restart events

### 10.3 Supabase Dashboard

- **Table Editor:** Xem data trực tiếp
- **SQL Editor:** Chạy query ad-hoc
- **Database → Reports:** Connection count, query performance

### 10.4 Upstash Dashboard

- **Data Browser:** Xem Redis keys
- **Usage:** Commands/ngày, memory usage
- **Slowlog:** Các command chậm

### 10.5 Kiểm tra nhanh từ Terminal

```bash
# Health check
curl -s https://solvernet-api.onrender.com/v1/health | jq .

# Chart intervals
curl -s https://solvernet-api.onrender.com/v1/chart/intervals | jq .

# Latest price
curl -s https://solvernet-api.onrender.com/v1/chart/price/POOL_ID | jq .

# Pool thông tin
curl -s https://solvernet-api.onrender.com/v1/pools | jq .
```

---

## 11. Tối ưu Free Tier

### 11.1 Blockfrost: Giảm API Calls bằng Cache

**Vấn đề:** Free tier giới hạn 50.000 requests/ngày (~35/phút).

**Giải pháp:** Upstash Redis cache với TTL phù hợp:

| Endpoint | Không cache | Với cache (TTL) | Tiết kiệm |
|---|---|---|---|
| Chain Tip | ~2/phút | ~4/phút (15s TTL) | ~50% |
| UTxO query | ~1/request | Cache 30s | ~80% |
| Protocol Params | ~1/phút | Cache 5 phút | ~80% |

**Ước tính:**
- Không cache: ~20.000-30.000 requests/ngày
- Có cache: ~5.000-10.000 requests/ngày → **an toàn trong free tier**

### 11.2 Supabase: Giảm Storage bằng H4+ Candles

**Vấn đề:** Free tier giới hạn 500 MB storage.

**Giải pháp:** Chỉ lưu candles khung lớn (H4, D1, W1):

| Strategy | Candles/ngày/pool | Storage/tháng (5 pools) |
|---|---|---|
| M1 → W1 (8 intervals) | ~1.446 rows | ~200 MB |
| **H4 + D1 + W1** (3 intervals) | ~7 rows | **~5 MB** |

- PriceTick tự động cleanup sau 2 ngày
- Candle data giữ vĩnh viễn (chỉ 3 intervals → rất nhẹ)
- **Ước tính 6 tháng:** < 50 MB cho 5 pools → an toàn 500 MB

### 11.3 Upstash: Quản lý 10K Commands/ngày

**Phân bổ ước tính commands/ngày:**

| Loại | Commands | Ghi chú |
|---|---|---|
| Blockfrost cache | ~3.000 | GET + SET chain data |
| Chart cache | ~2.000 | Candle queries |
| Health check | ~300 | UptimeRobot ping mỗi 5 phút |
| User requests | ~2.000 | Frontend chart/price queries |
| **Tổng** | **~7.300** | Còn dư ~2.700/ngày |

### 11.4 Render: Tối ưu Memory 512 MB

```dotenv
# Giảm log level → ít object allocation
LOG_LEVEL=warn

# Giới hạn candles per request
CHART_MAX_CANDLES=500

# Node.js memory limit (Render tự set, nhưng có thể override)
NODE_OPTIONS=--max-old-space-size=450
```

**Tips:**
- Dùng `warn` log level trên production (tiết kiệm ~50 MB RAM)
- Prisma connection pool mặc định: 2 connections (Supabase free cho tối đa 60)
- Graceful degradation: nếu cache down, app vẫn chạy

---

## 12. Troubleshooting

### 12.1 Lỗi thường gặp

| Lỗi | Nguyên nhân | Giải pháp |
|---|---|---|
| `ECONNREFUSED` PostgreSQL | Sai DATABASE_URL hoặc firewall | Kiểm tra URL + port (6543 cho pooler) |
| `P1001: Can't reach database` | Supabase paused (free tier) | Vào Supabase dashboard → Resume project |
| Blockfrost `402 Payment Required` | Hết quota 50K/ngày | Chờ reset (UTC midnight) hoặc upgrade |
| Blockfrost `418 IP banned` | Rate limit exceeded | Giảm request rate, kiểm tra cache |
| `UPSTASH_REDIS_URL not set` | Chưa cấu hình Redis | Thêm env vars hoặc bỏ qua (graceful) |
| Render cold start chậm | Service đã spin-down | Cấu hình UptimeRobot (mục 8) |
| `prisma migrate` fail | Dùng pooler URL thay vì direct | Dùng `DIRECT_URL` (port 5432) |
| Build fail trên Render | Monorepo path sai | Build command: `cd ../.. && pnpm install && pnpm build` |
| `BigInt serialization` | JSON.stringify BigInt | App đã handle — kiểm tra serializer |
| CORS error | Frontend URL không match | Cập nhật `CORS_ORIGIN` trên Render env |

### 12.2 Debug Commands

```bash
# Kiểm tra kết nối Supabase từ local
npx prisma db pull

# Kiểm tra Blockfrost
curl -H "project_id: YOUR_KEY" \
  https://cardano-preprod.blockfrost.io/api/v0/health

# Kiểm tra Upstash Redis
curl https://xxx.upstash.io/ping \
  -H "Authorization: Bearer YOUR_TOKEN"

# Xem Render logs (real-time)
# → Render Dashboard → Service → Logs

# Test health endpoint
curl -s https://solvernet-api.onrender.com/v1/health | jq .
```

### 12.3 Reset hoàn toàn (Development)

```bash
cd packages/backend

# Reset database
npx prisma migrate reset

# Regenerate Prisma client
npx prisma generate

# Rebuild
pnpm build

# Restart
pnpm dev
```

### 12.4 Supabase Pause/Resume

Supabase **tự động pause** project free tier sau **7 ngày không hoạt động**:

1. Vào [supabase.com/dashboard](https://supabase.com/dashboard)
2. Chọn project → Click **Resume project**
3. Đợi ~1-2 phút để database ready
4. Backend tự reconnect (Prisma retry)

> **Phòng tránh:** Backend chạy 24/7 với UptimeRobot → liên tục query DB → Supabase không pause.

---

## 13. Quick Start Checklist

### Lần đầu Setup (từ 0)

- [ ] Đăng ký **Blockfrost** → lấy Project ID (Preprod)
- [ ] Đăng ký **Supabase** → lấy DATABASE_URL + DIRECT_URL
- [ ] Đăng ký **Upstash** → lấy REDIS_URL + TOKEN
- [ ] Đăng ký **Render** (GitHub login)
- [ ] Đăng ký **Vercel** (GitHub login)
- [ ] Đăng ký **UptimeRobot** (free)
- [ ] Clone repo + `pnpm install` + `pnpm build`
- [ ] Tạo `.env` từ `.env.example` → điền credentials
- [ ] `npx prisma generate` + `npx prisma migrate dev`
- [ ] `pnpm dev` → test `curl localhost:3001/v1/health`
- [ ] Push code lên GitHub
- [ ] Tạo Render Web Service → cấu hình env vars → deploy
- [ ] `npx prisma migrate deploy` (trỏ DIRECT_URL tới Supabase)
- [ ] Tạo Vercel project → import frontend → deploy
- [ ] Cập nhật `CORS_ORIGIN` trên Render
- [ ] Tạo UptimeRobot monitor → ping `/v1/health` mỗi 5 phút
- [ ] Kiểm tra: `curl https://your-api.onrender.com/v1/health`

### Chi phí hàng tháng

| Dịch vụ | Chi phí |
|---|---|
| Blockfrost Free | $0 |
| Supabase Free | $0 |
| Upstash Free | $0 |
| Render Free | $0 |
| Vercel Free | $0 |
| UptimeRobot Free | $0 |
| **Tổng** | **$0/tháng** |

---

## Kiến trúc Tổng quan

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SolverNet DEX Architecture                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐        ┌──────────────────────────┐                  │
│  │   Browser     │───────▶│  Vercel (Next.js)         │                  │
│  │   User        │◀───────│  frontend-etf-factory     │                  │
│  └──────────────┘        └──────────┬───────────────┘                  │
│                                      │ HTTPS                            │
│                                      ▼                                  │
│  ┌──────────────┐        ┌──────────────────────────┐                  │
│  │  UptimeRobot  │──────▶│  Render (Node.js)         │                  │
│  │  ping /5min   │       │  packages/backend         │                  │
│  └──────────────┘        │                            │                  │
│                           │  ┌─────────┐ ┌─────────┐ │                  │
│                           │  │ Express │ │ Solver  │ │                  │
│                           │  │ API     │ │ Engine  │ │                  │
│                           │  └────┬────┘ └────┬────┘ │                  │
│                           │       │           │       │                  │
│                           │  ┌────▼───────────▼────┐ │                  │
│                           │  │  CacheService       │ │                  │
│                           │  │  (cache-aside)      │ │                  │
│                           │  └────┬────────────────┘ │                  │
│                           └───────┼──────────────────┘                  │
│                                   │                                     │
│                    ┌──────────────┼──────────────┐                      │
│                    │              │              │                       │
│                    ▼              ▼              ▼                       │
│  ┌──────────────────┐ ┌────────────────┐ ┌──────────────┐              │
│  │  Supabase         │ │  Upstash Redis │ │  Blockfrost  │              │
│  │  PostgreSQL       │ │  (Cache)       │ │  (Cardano    │              │
│  │  500 MB free      │ │  256 MB free   │ │   Preprod)   │              │
│  └──────────────────┘ └────────────────┘ └──────────────┘              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

> **Phiên bản:** 2.0 — Cập nhật cho stack Blockfrost + Supabase + Upstash + Render + Vercel  
> **Cập nhật lần cuối:** 2025
