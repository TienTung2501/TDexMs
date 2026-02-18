# SolverNet DEX â€” HÆ°á»›ng dáº«n Thiáº¿t láº­p Háº¡ táº§ng

> HÆ°á»›ng dáº«n chi tiáº¿t tá»«ng bÆ°á»›c: Ä‘Äƒng kÃ½ dá»‹ch vá»¥ cloud (free tier), cáº¥u hÃ¬nh environment, cháº¡y local development, vÃ  deploy lÃªn production.

**Stack hiá»‡n táº¡i:**

| Dá»‹ch vá»¥ | Vai trÃ² | Free Tier |
|---|---|---|
| **Blockfrost** | Cardano API (thay Ogmios + Kupo) | 50.000 requests/ngÃ y |
| **Supabase** | PostgreSQL database | 500 MB storage, 2 projects |
| **Upstash** | Redis cache (serverless) | 10.000 cmds/ngÃ y, 256 MB |
| **Render** | Node.js backend hosting | 512 MB RAM, spin-down sau 15 phÃºt |
| **Vercel** | Next.js frontend hosting | 100 GB bandwidth |
| **UptimeRobot** | Keep-alive ping cho Render | 50 monitors miá»…n phÃ­ |

---

## Má»¥c lá»¥c

1. [YÃªu cáº§u há»‡ thá»‘ng](#1-yÃªu-cáº§u-há»‡-thá»‘ng)
2. [ÄÄƒng kÃ½ dá»‹ch vá»¥ Cloud](#2-Ä‘Äƒng-kÃ½-dá»‹ch-vá»¥-cloud)
3. [CÃ i Ä‘áº·t cÃ´ng cá»¥ Local](#3-cÃ i-Ä‘áº·t-cÃ´ng-cá»¥-local)
4. [Cáº¥u hÃ¬nh Environment](#4-cáº¥u-hÃ¬nh-environment)
5. [Cháº¡y Local Development](#5-cháº¡y-local-development)
6. [Deploy Backend lÃªn Render](#6-deploy-backend-lÃªn-render)
7. [Deploy Frontend lÃªn Vercel](#7-deploy-frontend-lÃªn-vercel)
8. [Thiáº¿t láº­p UptimeRobot Keep-Alive](#8-thiáº¿t-láº­p-uptimerobot-keep-alive)
9. [Database Migration (Production)](#9-database-migration-production)
10. [Monitoring & Health Check](#10-monitoring--health-check)
11. [Tá»‘i Æ°u Free Tier](#11-tá»‘i-Æ°u-free-tier)
12. [Troubleshooting](#12-troubleshooting)
13. [Quick Start Checklist](#13-quick-start-checklist)

---

## 1. YÃªu cáº§u há»‡ thá»‘ng

### Local Development
| ThÃ nh pháº§n | YÃªu cáº§u |
|---|---|
| OS | Windows 10/11, macOS, Ubuntu 22.04+ |
| CPU | 2+ cores |
| RAM | 4 GB (khÃ´ng cáº§n Cardano Node) |
| Disk | 5 GB SSD |
| Node.js | â‰¥ 20.x LTS |
| pnpm | â‰¥ 9.x |
| Docker | TÃ¹y chá»n (cho local PostgreSQL) |

### Production (Cloud â€” Free Tier)
| ThÃ nh pháº§n | Dá»‹ch vá»¥ |
|---|---|
| Backend | Render Free (512 MB RAM, 0.1 CPU) |
| Database | Supabase Free (500 MB PostgreSQL) |
| Cache | Upstash Free (256 MB Redis, 10K cmds/ngÃ y) |
| Blockchain | Blockfrost Free (50K requests/ngÃ y) |
| Frontend | Vercel Free (Serverless) |

> **LÆ°u Ã½:** KhÃ´ng cáº§n cháº¡y Cardano Node. Blockfrost API thay tháº¿ hoÃ n toÃ n Ogmios + Kupo, tiáº¿t kiá»‡m ~32 GB RAM vÃ  ~120 GB disk.

---

## 2. ÄÄƒng kÃ½ dá»‹ch vá»¥ Cloud

### 2.1 Blockfrost (Cardano API)

1. Truy cáº­p [blockfrost.io](https://blockfrost.io) â†’ **Sign up**
2. Táº¡o project â†’ Chá»n network **Preprod** (testnet)
3. Copy **Project ID** â€” dáº¡ng `preprodXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`
4. Base URL cho Preprod: `https://cardano-preprod.blockfrost.io/api/v0`

> **Giá»›i háº¡n Free:** 50.000 requests/ngÃ y, 10 requests/giÃ¢y.  
> Cache giÃºp giáº£m ~60-70% requests (xem má»¥c Tá»‘i Æ°u Free Tier).

### 2.2 Supabase (PostgreSQL Database)

1. Truy cáº­p [supabase.com](https://supabase.com) â†’ **Start your project**
2. Táº¡o organization â†’ Táº¡o project
3. Chá»n **Region** gáº§n Render (vÃ­ dá»¥: Southeast Asia hoáº·c US East)
4. Äáº·t **Database password** (lÆ°u cáº©n tháº­n!)
5. VÃ o **Settings â†’ Database** â†’ Copy connection strings:

```
# Connection Pooler (Transaction mode) â€” dÃ¹ng cho app
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true

# Direct Connection â€” dÃ¹ng cho Prisma migrate
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
```

> **LÆ°u Ã½ quan trá»ng:**
> - `DATABASE_URL` dÃ¹ng **port 6543** (pooler, cho app runtime)
> - `DIRECT_URL` dÃ¹ng **port 5432** (direct, cho Prisma migrate)
> - Free tier: **500 MB** storage, **2 GB** transfer/thÃ¡ng

### 2.3 Upstash Redis (Cache)

1. Truy cáº­p [console.upstash.com](https://console.upstash.com) â†’ **Create Database**
2. Chá»n **Region** gáº§n Render backend (cÃ¹ng region tá»‘i Æ°u latency)
3. Chá»n plan **Free** â†’ Create
4. Copy credentials tá»« tab **REST API**:
   - **UPSTASH_REDIS_REST_URL** â€” dáº¡ng `https://xxx.upstash.io`
   - **UPSTASH_REDIS_REST_TOKEN** â€” dáº¡ng `AXxxYY...`

> **Giá»›i háº¡n Free:** 10.000 commands/ngÃ y, 256 MB storage, 1 database.  
> App sá»­ dá»¥ng `@upstash/redis` (HTTP-based) â€” khÃ´ng cáº§n TCP connection.

### 2.4 Render (Backend Hosting)

1. Truy cáº­p [render.com](https://render.com) â†’ **Sign up** (nÃªn dÃ¹ng GitHub account)
2. ChÆ°a cáº§n táº¡o service ngay â€” sáº½ táº¡o á»Ÿ bÆ°á»›c Deploy

> **Render Free tier:**
> - 512 MB RAM, 0.1 CPU
> - **Spin-down sau 15 phÃºt idle** â†’ dÃ¹ng UptimeRobot Ä‘á»ƒ keep-alive
> - 750 giá»/thÃ¡ng (Ä‘á»§ cháº¡y 24/7 cho 1 service)
> - Outbound bandwidth: 100 GB/thÃ¡ng

### 2.5 Vercel (Frontend Hosting)

1. Truy cáº­p [vercel.com](https://vercel.com) â†’ **Sign up** (GitHub account)
2. ChÆ°a cáº§n import project â€” sáº½ lÃ m á»Ÿ bÆ°á»›c Deploy Frontend

### 2.6 UptimeRobot (Keep-Alive)

1. Truy cáº­p [uptimerobot.com](https://uptimerobot.com) â†’ **Register** (free)
2. ChÆ°a cáº§n táº¡o monitor â€” sáº½ cáº¥u hÃ¬nh sau khi deploy Render

---

## 3. CÃ i Ä‘áº·t cÃ´ng cá»¥ Local

### 3.1 Node.js (v20 LTS)

**Windows (winget):**
```powershell
winget install OpenJS.NodeJS.LTS
# Hoáº·c sá»­ dá»¥ng nvm-windows:
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

Kiá»ƒm tra:
```bash
node --version   # v20.x.x
npm --version    # 10.x.x
```

### 3.2 pnpm

```bash
npm install -g pnpm@9
pnpm --version   # 9.x.x
```

### 3.3 Docker (TÃ¹y chá»n â€” cho local PostgreSQL)

Chá»‰ cáº§n náº¿u muá»‘n cháº¡y PostgreSQL local thay vÃ¬ káº¿t ná»‘i trá»±c tiáº¿p Supabase.

**Windows:** Táº£i [Docker Desktop](https://www.docker.com/products/docker-desktop/) â†’ Báº­t WSL 2 backend.

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

## 4. Cáº¥u hÃ¬nh Environment

### 4.1 Cáº¥u trÃºc file .env

```bash
cd backend
cp .env.example .env
```

### 4.2 Ná»™i dung .env Ä‘áº§y Ä‘á»§

```dotenv
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# SolverNet DEX Backend â€” Environment Config
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# Stack: Render (Node.js) + Supabase (PostgreSQL) + Blockfrost (Cardano) + Upstash (Redis)

# â”€â”€â”€ Server â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
NODE_ENV=development
PORT=3001
HOST=0.0.0.0
LOG_LEVEL=info          # DÃ¹ng "warn" trÃªn Render Free (tiáº¿t kiá»‡m RAM)

# â”€â”€â”€ Database (Supabase PostgreSQL) â”€â”€â”€â”€â”€â”€
# Transaction mode (port 6543) â€” cho app runtime
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"
# Direct connection (port 5432) â€” cho Prisma migrate
DIRECT_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"

# â”€â”€â”€ Upstash Redis (Cache) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Láº¥y tá»« Upstash Console â†’ REST API tab
# Äá»ƒ trá»‘ng náº¿u cháº¡y khÃ´ng cache (graceful degradation)
UPSTASH_REDIS_URL=https://xxx.upstash.io
UPSTASH_REDIS_TOKEN=AXxxYY...

# â”€â”€â”€ Cardano Network â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CARDANO_NETWORK=preprod

# â”€â”€â”€ Blockfrost â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
BLOCKFROST_URL=https://cardano-preprod.blockfrost.io/api/v0
BLOCKFROST_PROJECT_ID=preprodXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# â”€â”€â”€ Smart Contract â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ESCROW_SCRIPT_ADDRESS=
POOL_SCRIPT_ADDRESS=

# â”€â”€â”€ Solver â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
SOLVER_SEED_PHRASE=
SOLVER_BATCH_WINDOW_MS=5000
SOLVER_MAX_RETRIES=3
SOLVER_MIN_PROFIT_LOVELACE=100000
SOLVER_ENABLED=false     # Báº­t sau khi deploy smart contract

# â”€â”€â”€ CORS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CORS_ORIGIN=http://localhost:3000,https://your-app.vercel.app

# â”€â”€â”€ Rate Limiting â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100

# â”€â”€â”€ JWT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
JWT_SECRET=change-this-in-production-to-a-random-64-char-hex-string
JWT_EXPIRES_IN=24h

# â”€â”€â”€ Chart / OHLCV â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CHART_SNAPSHOT_INTERVAL_MS=60000   # 1 phÃºt â€” cron aggregation
CHART_MAX_CANDLES=500              # Max candles per request
```

### 4.3 Giáº£i thÃ­ch cÃ¡c biáº¿n quan trá»ng

| Biáº¿n | MÃ´ táº£ | LÆ°u Ã½ |
|---|---|---|
| `DATABASE_URL` | Supabase connection qua PgBouncer (port 6543) | Báº¯t buá»™c |
| `DIRECT_URL` | Direct connection (port 5432) cho Prisma migrate | Chá»‰ cáº§n khi migrate |
| `UPSTASH_REDIS_URL` | REST endpoint cá»§a Upstash Redis | TÃ¹y chá»n â€” app cháº¡y Ä‘Æ°á»£c khÃ´ng cache |
| `UPSTASH_REDIS_TOKEN` | Auth token cho Upstash REST API | TÃ¹y chá»n |
| `BLOCKFROST_PROJECT_ID` | API key tá»« Blockfrost | Báº¯t buá»™c |
| `SOLVER_ENABLED` | Báº­t/táº¯t solver engine | Táº¯t cho Ä‘áº¿n khi deploy contract |
| `LOG_LEVEL` | `info` (dev), `warn` (production) | `warn` tiáº¿t kiá»‡m RAM |
| `CHART_SNAPSHOT_INTERVAL_MS` | Bao lÃ¢u cron cháº¡y 1 láº§n | 60000 = 1 phÃºt |

---

## 5. Cháº¡y Local Development

### 5.1 Clone vÃ  cÃ i Ä‘áº·t

```bash
git clone https://github.com/your-repo/decentralize.git
cd decentralize

# CÃ i dependencies cho toÃ n bá»™ monorepo
pnpm install

# Build shared packages
pnpm build
```

### 5.2 Thiáº¿t láº­p Database

**Option A: Káº¿t ná»‘i trá»±c tiáº¿p Supabase (KhuyÃªn dÃ¹ng)**
- Äiá»n `DATABASE_URL` vÃ  `DIRECT_URL` trong `.env` báº±ng credentials tá»« Supabase
- KhÃ´ng cáº§n Docker

**Option B: Local PostgreSQL vá»›i Docker**
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

### 5.3 Cháº¡y Prisma Migration

```bash
cd backend

# Generate Prisma client
npx prisma generate

# Cháº¡y migrations
npx prisma migrate dev --name init

# (TÃ¹y chá»n) Má»Ÿ Prisma Studio Ä‘á»ƒ xem data
npx prisma studio
```

### 5.4 Start Backend

```bash
# Development mode (hot reload)
pnpm dev

# Hoáº·c build & run
pnpm build
node dist/index.js
```

### 5.5 Kiá»ƒm tra Health

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

### 5.6 Start Frontend (TÃ¹y chá»n)

```bash
cd frontend-etf-factory-protocol
pnpm dev
# â†’ http://localhost:3000
```

---

## 6. Deploy Backend lÃªn Render

### 6.1 Chuáº©n bá»‹ Repository

Äáº£m báº£o code Ä‘Ã£ push lÃªn GitHub. Render sáº½ káº¿t ná»‘i trá»±c tiáº¿p vá»›i repo.

### 6.2 Táº¡o Web Service trÃªn Render

1. Truy cáº­p [dashboard.render.com](https://dashboard.render.com) â†’ **New +** â†’ **Web Service**
2. Káº¿t ná»‘i GitHub repo
3. Cáº¥u hÃ¬nh:

| Setting | Value |
|---|---|
| **Name** | `tdexms` (hoáº·c tÃªn báº¡n chá»n) |
| **Region** | Singapore (hoáº·c gáº§n Supabase nháº¥t) |
| **Branch** | `main` |
| **Root Directory** | (Ä‘á»ƒ trá»‘ng â€” repo root) |
| **Environment** | **Docker** |
| **Dockerfile Path** | `Dockerfile` |
| **Instance Type** | Free |

> **LÆ°u Ã½:** Sá»­ dá»¥ng Docker runtime (khÃ´ng pháº£i Node runtime). Dockerfile á»Ÿ root repo
> dÃ¹ng multi-stage build vá»›i `pnpm deploy --filter backend --prod` Ä‘á»ƒ tá»‘i Æ°u image size.

### 6.3 Cáº¥u hÃ¬nh Environment Variables

VÃ o **Environment** tab, thÃªm cÃ¡c biáº¿n sau:

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

CORS_ORIGIN=https://your-app.vercel.app,http://localhost:3000
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
JWT_SECRET=<random-64-char-hex>
JWT_EXPIRES_IN=24h

CHART_SNAPSHOT_INTERVAL_MS=60000
CHART_MAX_CANDLES=500
```

### 6.4 Deploy

1. Click **Create Web Service** â†’ Render tá»± build vÃ  deploy
2. Äá»£i build complete (thÆ°á»ng 2-5 phÃºt)
3. Render gÃ¡n URL dáº¡ng: `https://tdexms.onrender.com` (hoáº·c tÃªn báº¡n Ä‘áº·t)

### 6.5 Cháº¡y Migration trÃªn Production

Sau khi deploy láº§n Ä‘áº§u, cáº§n cháº¡y Prisma migrate:

**CÃ¡ch 1: Tá»« local machine (káº¿t ná»‘i Supabase trá»±c tiáº¿p)**
```bash
cd backend

# Äáº·t DIRECT_URL trong .env trá» Ä‘áº¿n Supabase production
npx prisma migrate deploy
```

**CÃ¡ch 2: ThÃªm vÃ o Render build command**
```
cd ../.. && pnpm install && pnpm build && cd backend && npx prisma migrate deploy
```

> **LÆ°u Ã½:** `prisma migrate deploy` chá»‰ apply migrations Ä‘Ã£ táº¡o, khÃ´ng táº¡o migration má»›i. An toÃ n cho production.

### 6.6 Kiá»ƒm tra Deploy

```bash
curl https://tdexms.onrender.com/v1/health
```

---

## 7. Deploy Frontend lÃªn Vercel

### 7.1 Import Project

1. Truy cáº­p [vercel.com/new](https://vercel.com/new)
2. Import GitHub repo
3. Cáº¥u hÃ¬nh:

| Setting | Value |
|---|---|
| **Framework** | Next.js |
| **Root Directory** | `frontend` |
| **Install Command** | `npm install -g pnpm@9.15.0 && pnpm install --filter frontend` |
| **Build Command** | `pnpm --filter frontend build` |
| **Output Directory** | (auto-detect) |

> **LÆ°u Ã½:** CÃ³ thá»ƒ cáº¥u hÃ¬nh qua `vercel.json` á»Ÿ root directory thay vÃ¬ UI.

### 7.2 Environment Variables

```
NEXT_PUBLIC_API_URL=https://tdexms.onrender.com
NEXT_PUBLIC_NETWORK=preprod
```

### 7.3 Deploy

Click **Deploy** â†’ Vercel tá»± build vÃ  gÃ¡n URL dáº¡ng `https://your-app.vercel.app`.

### 7.4 Cáº­p nháº­t CORS

Quay láº¡i Render â†’ Environment â†’ Cáº­p nháº­t `CORS_ORIGIN`:
```
CORS_ORIGIN=https://your-app.vercel.app,http://localhost:3000
```

---

## 8. Thiáº¿t láº­p UptimeRobot Keep-Alive

### 8.1 Váº¥n Ä‘á»

Render Free tier **tá»± Ä‘á»™ng spin-down** service sau **15 phÃºt khÃ´ng cÃ³ request**. Khi cÃ³ request má»›i, service pháº£i cold-start (~30-60 giÃ¢y). Äiá»u nÃ y gÃ¢y:

- Tráº£i nghiá»‡m user xáº¥u (chá» lÃ¢u sau idle)
- Solver engine bá»‹ táº¯t â†’ máº¥t intent processing
- Chain sync bá»‹ giÃ¡n Ä‘oáº¡n â†’ data khÃ´ng cáº­p nháº­t
- Cron jobs (price aggregation) bá»‹ dá»«ng

### 8.2 Giáº£i phÃ¡p: UptimeRobot Ping

UptimeRobot sáº½ gá»­i HTTP request Ä‘áº¿n endpoint `/v1/health` má»—i **5 phÃºt**, Ä‘áº£m báº£o Render khÃ´ng bao giá» idle quÃ¡ 15 phÃºt.

### 8.3 Cáº¥u hÃ¬nh

1. ÄÄƒng nháº­p [uptimerobot.com](https://uptimerobot.com)
2. Click **+ Add New Monitor**
3. Cáº¥u hÃ¬nh:

| Field | Value |
|---|---|
| **Monitor Type** | HTTP(s) |
| **Friendly Name** | `SolverNet API` |
| **URL** | `https://tdexms.onrender.com/v1/health` |
| **Monitoring Interval** | **5 minutes** |

4. (TÃ¹y chá»n) Cáº¥u hÃ¬nh **Alert Contacts** Ä‘á»ƒ nháº­n email khi service down
5. Click **Create Monitor**

### 8.4 Kiá»ƒm tra hoáº¡t Ä‘á»™ng

- VÃ o UptimeRobot dashboard â†’ Monitor hiá»ƒn thá»‹ **UP** (mÃ u xanh)
- Response time trung bÃ¬nh: ~100-300ms (khi service Ä‘Ã£ warm)
- Náº¿u tháº¥y response time > 30s â†’ Ä‘Ã³ lÃ  cold-start, bÃ¬nh thÆ°á»ng cho láº§n Ä‘áº§u

### 8.5 Tá»‘i Æ°u Keep-Alive

```
Interval 5 phÃºt Ã— 24 giá» Ã— 30 ngÃ y = 8.640 pings/thÃ¡ng
```

- **UptimeRobot Free:** 50 monitors, interval tá»‘i thiá»ƒu 5 phÃºt â†’ Ä‘á»§ dÃ¹ng
- **Render Free:** 750 giá»/thÃ¡ng = ~31 ngÃ y liÃªn tá»¥c â†’ Ä‘á»§ cháº¡y 24/7 cho 1 service
- Health endpoint nháº¹ (~1-5ms xá»­ lÃ½) â†’ khÃ´ng tá»‘n tÃ i nguyÃªn Ä‘Ã¡ng ká»ƒ

### 8.6 Lá»‹ch trÃ¬nh hoáº¡t Ä‘á»™ng

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Timeline: Render Free + UptimeRobot                             â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                                 â”‚
â”‚  t=0        t=5m       t=10m      t=15m      t=20m             â”‚
â”‚  â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚â”€â”€â”€â”€â”€            â”‚
â”‚  â–² ping     â–² ping     â–² ping     â–² ping     â–² ping           â”‚
â”‚  â”‚          â”‚          â”‚          â”‚          â”‚                  â”‚
â”‚  â””â”€â”€ Service luÃ´n warm, khÃ´ng bao giá» spin-down â”€â”€â”˜            â”‚
â”‚                                                                 â”‚
â”‚  Náº¿u KHÃ”NG cÃ³ UptimeRobot:                                     â”‚
â”‚  t=0    t=15m (spin-down) â”€â”€â”€ t=? (cold start 30-60s) â”€â”€â”€     â”‚
â”‚                                                                 â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

## 9. Database Migration (Production)

### 9.1 Táº¡o Migration má»›i

```bash
# TrÃªn local machine
cd backend

# Táº¡o migration (dev only)
npx prisma migrate dev --name add_new_feature

# Commit migration files
git add prisma/migrations
git commit -m "feat: add new migration"
git push
```

### 9.2 Apply Migration lÃªn Production

```bash
# DÃ¹ng DIRECT_URL (port 5432) â€” khÃ´ng qua PgBouncer
DIRECT_URL="postgresql://..." npx prisma migrate deploy
```

### 9.3 Reset Database (náº¿u cáº§n)

```bash
# âš ï¸ XÃ“A TOÃ€N Bá»˜ DATA â€” chá»‰ dÃ¹ng trÃªn dev/preprod
npx prisma migrate reset
```

### 9.4 Prisma Studio (xem data)

```bash
npx prisma studio
# â†’ http://localhost:5555
```

---

## 10. Monitoring & Health Check

### 10.1 Health Endpoint

```bash
GET /v1/health
```

Response chi tiáº¿t:
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
| `database` | Prisma `$queryRaw` thÃ nh cÃ´ng | Connection timeout / error |
| `blockfrost` | `/health` tráº£ `{ is_healthy: true }` | API unreachable |
| `cache` | Redis PING thÃ nh cÃ´ng | Upstash unreachable |

> Náº¿u Upstash chÆ°a cáº¥u hÃ¬nh, `cache` tráº£ `"not_configured"` (khÃ´ng pháº£i error).

### 10.2 Render Dashboard

- **Logs:** Render Dashboard â†’ Service â†’ **Logs** tab â†’ Real-time log stream
- **Metrics:** CPU, Memory, Request count (cÆ¡ báº£n)
- **Events:** Deploy history, restart events

### 10.3 Supabase Dashboard

- **Table Editor:** Xem data trá»±c tiáº¿p
- **SQL Editor:** Cháº¡y query ad-hoc
- **Database â†’ Reports:** Connection count, query performance

### 10.4 Upstash Dashboard

- **Data Browser:** Xem Redis keys
- **Usage:** Commands/ngÃ y, memory usage
- **Slowlog:** CÃ¡c command cháº­m

### 10.5 Kiá»ƒm tra nhanh tá»« Terminal

```bash
# Health check
curl -s https://solvernet-api.onrender.com/v1/health | jq .

# Chart intervals
curl -s https://solvernet-api.onrender.com/v1/chart/intervals | jq .

# Latest price
curl -s https://solvernet-api.onrender.com/v1/chart/price/POOL_ID | jq .

# Pool thÃ´ng tin
curl -s https://solvernet-api.onrender.com/v1/pools | jq .
```

---

## 11. Tá»‘i Æ°u Free Tier

### 11.1 Blockfrost: Giáº£m API Calls báº±ng Cache

**Váº¥n Ä‘á»:** Free tier giá»›i háº¡n 50.000 requests/ngÃ y (~35/phÃºt).

**Giáº£i phÃ¡p:** Upstash Redis cache vá»›i TTL phÃ¹ há»£p:

| Endpoint | KhÃ´ng cache | Vá»›i cache (TTL) | Tiáº¿t kiá»‡m |
|---|---|---|---|
| Chain Tip | ~2/phÃºt | ~4/phÃºt (15s TTL) | ~50% |
| UTxO query | ~1/request | Cache 30s | ~80% |
| Protocol Params | ~1/phÃºt | Cache 5 phÃºt | ~80% |

**Æ¯á»›c tÃ­nh:**
- KhÃ´ng cache: ~20.000-30.000 requests/ngÃ y
- CÃ³ cache: ~5.000-10.000 requests/ngÃ y â†’ **an toÃ n trong free tier**

### 11.2 Supabase: Giáº£m Storage báº±ng H4+ Candles

**Váº¥n Ä‘á»:** Free tier giá»›i háº¡n 500 MB storage.

**Giáº£i phÃ¡p:** Chá»‰ lÆ°u candles khung lá»›n (H4, D1, W1):

| Strategy | Candles/ngÃ y/pool | Storage/thÃ¡ng (5 pools) |
|---|---|---|
| M1 â†’ W1 (8 intervals) | ~1.446 rows | ~200 MB |
| **H4 + D1 + W1** (3 intervals) | ~7 rows | **~5 MB** |

- PriceTick tá»± Ä‘á»™ng cleanup sau 2 ngÃ y
- Candle data giá»¯ vÄ©nh viá»…n (chá»‰ 3 intervals â†’ ráº¥t nháº¹)
- **Æ¯á»›c tÃ­nh 6 thÃ¡ng:** < 50 MB cho 5 pools â†’ an toÃ n 500 MB

### 11.3 Upstash: Quáº£n lÃ½ 10K Commands/ngÃ y

**PhÃ¢n bá»• Æ°á»›c tÃ­nh commands/ngÃ y:**

| Loáº¡i | Commands | Ghi chÃº |
|---|---|---|
| Blockfrost cache | ~3.000 | GET + SET chain data |
| Chart cache | ~2.000 | Candle queries |
| Health check | ~300 | UptimeRobot ping má»—i 5 phÃºt |
| User requests | ~2.000 | Frontend chart/price queries |
| **Tá»•ng** | **~7.300** | CÃ²n dÆ° ~2.700/ngÃ y |

### 11.4 Render: Tá»‘i Æ°u Memory 512 MB

```dotenv
# Giáº£m log level â†’ Ã­t object allocation
LOG_LEVEL=warn

# Giá»›i háº¡n candles per request
CHART_MAX_CANDLES=500

# Node.js memory limit (Render tá»± set, nhÆ°ng cÃ³ thá»ƒ override)
NODE_OPTIONS=--max-old-space-size=450
```

**Tips:**
- DÃ¹ng `warn` log level trÃªn production (tiáº¿t kiá»‡m ~50 MB RAM)
- Prisma connection pool máº·c Ä‘á»‹nh: 2 connections (Supabase free cho tá»‘i Ä‘a 60)
- Graceful degradation: náº¿u cache down, app váº«n cháº¡y

---

## 12. Troubleshooting

### 12.1 Lá»—i thÆ°á»ng gáº·p

| Lá»—i | NguyÃªn nhÃ¢n | Giáº£i phÃ¡p |
|---|---|---|
| `ECONNREFUSED` PostgreSQL | Sai DATABASE_URL hoáº·c firewall | Kiá»ƒm tra URL + port (6543 cho pooler) |
| `P1001: Can't reach database` | Supabase paused (free tier) | VÃ o Supabase dashboard â†’ Resume project |
| Blockfrost `402 Payment Required` | Háº¿t quota 50K/ngÃ y | Chá» reset (UTC midnight) hoáº·c upgrade |
| Blockfrost `418 IP banned` | Rate limit exceeded | Giáº£m request rate, kiá»ƒm tra cache |
| `UPSTASH_REDIS_URL not set` | ChÆ°a cáº¥u hÃ¬nh Redis | ThÃªm env vars hoáº·c bá» qua (graceful) |
| Render cold start cháº­m | Service Ä‘Ã£ spin-down | Cáº¥u hÃ¬nh UptimeRobot (má»¥c 8) |
| `prisma migrate` fail | DÃ¹ng pooler URL thay vÃ¬ direct | DÃ¹ng `DIRECT_URL` (port 5432) |
| Build fail trÃªn Render | Monorepo path sai | Build command: `cd ../.. && pnpm install && pnpm build` |
| `BigInt serialization` | JSON.stringify BigInt | App Ä‘Ã£ handle â€” kiá»ƒm tra serializer |
| CORS error | Frontend URL khÃ´ng match | Cáº­p nháº­t `CORS_ORIGIN` trÃªn Render env |

### 12.2 Debug Commands

```bash
# Kiá»ƒm tra káº¿t ná»‘i Supabase tá»« local
npx prisma db pull

# Kiá»ƒm tra Blockfrost
curl -H "project_id: YOUR_KEY" \
  https://cardano-preprod.blockfrost.io/api/v0/health

# Kiá»ƒm tra Upstash Redis
curl https://xxx.upstash.io/ping \
  -H "Authorization: Bearer YOUR_TOKEN"

# Xem Render logs (real-time)
# â†’ Render Dashboard â†’ Service â†’ Logs

# Test health endpoint
curl -s https://solvernet-api.onrender.com/v1/health | jq .
```

### 12.3 Reset hoÃ n toÃ n (Development)

```bash
cd backend

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

Supabase **tá»± Ä‘á»™ng pause** project free tier sau **7 ngÃ y khÃ´ng hoáº¡t Ä‘á»™ng**:

1. VÃ o [supabase.com/dashboard](https://supabase.com/dashboard)
2. Chá»n project â†’ Click **Resume project**
3. Äá»£i ~1-2 phÃºt Ä‘á»ƒ database ready
4. Backend tá»± reconnect (Prisma retry)

> **PhÃ²ng trÃ¡nh:** Backend cháº¡y 24/7 vá»›i UptimeRobot â†’ liÃªn tá»¥c query DB â†’ Supabase khÃ´ng pause.

---

## 13. Quick Start Checklist

### Láº§n Ä‘áº§u Setup (tá»« 0)

- [ ] ÄÄƒng kÃ½ **Blockfrost** â†’ láº¥y Project ID (Preprod)
- [ ] ÄÄƒng kÃ½ **Supabase** â†’ láº¥y DATABASE_URL + DIRECT_URL
- [ ] ÄÄƒng kÃ½ **Upstash** â†’ láº¥y REDIS_URL + TOKEN
- [ ] ÄÄƒng kÃ½ **Render** (GitHub login)
- [ ] ÄÄƒng kÃ½ **Vercel** (GitHub login)
- [ ] ÄÄƒng kÃ½ **UptimeRobot** (free)
- [ ] Clone repo + `pnpm install` + `pnpm build`
- [ ] Táº¡o `.env` tá»« `.env.example` â†’ Ä‘iá»n credentials
- [ ] `npx prisma generate` + `npx prisma migrate dev`
- [ ] `pnpm dev` â†’ test `curl localhost:3001/v1/health`
- [ ] Push code lÃªn GitHub
- [ ] Táº¡o Render Web Service â†’ cáº¥u hÃ¬nh env vars â†’ deploy
- [ ] `npx prisma migrate deploy` (trá» DIRECT_URL tá»›i Supabase)
- [ ] Táº¡o Vercel project â†’ import frontend â†’ deploy
- [ ] Cáº­p nháº­t `CORS_ORIGIN` trÃªn Render
- [ ] Táº¡o UptimeRobot monitor â†’ ping `/v1/health` má»—i 5 phÃºt
- [ ] Kiá»ƒm tra: `curl https://your-api.onrender.com/v1/health`

### Chi phÃ­ hÃ ng thÃ¡ng

| Dá»‹ch vá»¥ | Chi phÃ­ |
|---|---|
| Blockfrost Free | $0 |
| Supabase Free | $0 |
| Upstash Free | $0 |
| Render Free | $0 |
| Vercel Free | $0 |
| UptimeRobot Free | $0 |
| **Tá»•ng** | **$0/thÃ¡ng** |

---

## Kiáº¿n trÃºc Tá»•ng quan

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                        SolverNet DEX Architecture                       â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                                         â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”        â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                  â”‚
â”‚  â”‚   Browser     â”‚â”€â”€â”€â”€â”€â”€â”€â–¶â”‚  Vercel (Next.js)         â”‚                  â”‚
â”‚  â”‚   User        â”‚â—€â”€â”€â”€â”€â”€â”€â”€â”‚  frontend-etf-factory     â”‚                  â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜        â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                  â”‚
â”‚                                      â”‚ HTTPS                            â”‚
â”‚                                      â–¼                                  â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”        â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                  â”‚
â”‚  â”‚  UptimeRobot  â”‚â”€â”€â”€â”€â”€â”€â–¶â”‚  Render (Node.js)         â”‚                  â”‚
â”‚  â”‚  ping /5min   â”‚       â”‚  backend         â”‚                  â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜        â”‚                            â”‚                  â”‚
â”‚                           â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚                  â”‚
â”‚                           â”‚  â”‚ Express â”‚ â”‚ Solver  â”‚ â”‚                  â”‚
â”‚                           â”‚  â”‚ API     â”‚ â”‚ Engine  â”‚ â”‚                  â”‚
â”‚                           â”‚  â””â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”˜ â””â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”˜ â”‚                  â”‚
â”‚                           â”‚       â”‚           â”‚       â”‚                  â”‚
â”‚                           â”‚  â”Œâ”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â” â”‚                  â”‚
â”‚                           â”‚  â”‚  CacheService       â”‚ â”‚                  â”‚
â”‚                           â”‚  â”‚  (cache-aside)      â”‚ â”‚                  â”‚
â”‚                           â”‚  â””â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚                  â”‚
â”‚                           â””â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                  â”‚
â”‚                                   â”‚                                     â”‚
â”‚                    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                      â”‚
â”‚                    â”‚              â”‚              â”‚                       â”‚
â”‚                    â–¼              â–¼              â–¼                       â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”              â”‚
â”‚  â”‚  Supabase         â”‚ â”‚  Upstash Redis â”‚ â”‚  Blockfrost  â”‚              â”‚
â”‚  â”‚  PostgreSQL       â”‚ â”‚  (Cache)       â”‚ â”‚  (Cardano    â”‚              â”‚
â”‚  â”‚  500 MB free      â”‚ â”‚  256 MB free   â”‚ â”‚   Preprod)   â”‚              â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜              â”‚
â”‚                                                                         â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

> **PhiÃªn báº£n:** 2.0 â€” Cáº­p nháº­t cho stack Blockfrost + Supabase + Upstash + Render + Vercel  
> **Cáº­p nháº­t láº§n cuá»‘i:** 2025
