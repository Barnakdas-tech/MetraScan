# MetraScan Production Deployment Guide

This document provides complete instructions for deploying the **MetraScan** Legal Metrology Inspection Platform (SIH26034) to production environments.

---

## 1. System Architecture & Topology

MetraScan consists of four interconnected services:

```
                          [ Internet / Browser ]
                                     │
                                     ▼
                    ┌────────────────────────────────┐
                    │     Frontend Web / Nginx       │
                    │  (Port 80 or Vercel Edge SPA)  │
                    └───────┬────────────────┬───────┘
                            │                │
            Static Assets   │                │ Reverse Proxy (/api/*)
                            ▼                ▼
                    ┌──────────────┐  ┌───────────────────────────────┐
                    │ SPA Client   │  │       Express API Server      │
                    │ (React/Vite) │  │ (Port 4000, Node 20, Prisma)  │
                    └──────────────┘  └──────┬───────────────┬────────┘
                                             │               │
                              Prisma / SQL   │               │ HTTP (X-Internal-Token)
                                             ▼               ▼
                    ┌──────────────────────────────┐  ┌───────────────────────────────┐
                    │      PostgreSQL 16 DB        │  │       FastAPI AI Service      │
                    │   (Port 5432 or Managed DB)  │  │ (Port 8000, Python 3.11/Paddle)
                    └──────────────────────────────┘  └───────────────────────────────┘
                                     │
                             Volume Mounts:
                     - Postgres Data: `/var/lib/postgresql/data`
                     - Storage Data:  `/data/storage` (uploads, crops, PDF reports)
```

| Service | Technology | Port | Minimum Specs | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend** (`web`) | React 18, Vite, TailwindCSS, Nginx | `80` (HTTP) | 256 MB RAM | Role-aware inspector & reviewer portal |
| **Backend** (`api`) | Node.js 20, Express, Prisma ORM, Legal Engine | `4000` | 1 GB RAM, 1 vCPU | Auth, RBAC, Legal Metrology compliance rules, audit logs |
| **AI / OCR** (`ai`) | Python 3.11, FastAPI, PaddleOCR, OpenCV | `8000` | 2–4 GB RAM, 2 vCPUs | Image quality scoring, EXIF correction, text extraction |
| **Database** (`db`) | PostgreSQL 16 | `5432` | 1 GB RAM, 10 GB SSD | Relational data, audit trails, inspection records |
| **Storage** | Local Disk / Docker Volume | N/A | 20+ GB SSD | Persistent storage for raw uploads, crops, signed PDFs |

---

## 2. Deployment Option A: Single VM / VPS with Docker Compose (Recommended)

This is the recommended turnkey deployment for SIH evaluation, on-premise government servers, or cloud virtual machines (AWS EC2, DigitalOcean Droplet, GCP Compute Engine, Hetzner, etc.).

### Step 1: Provision the Server

- **OS:** Ubuntu 22.04 LTS or Debian 12
- **Hardware:** Minimum 4 vCPUs, 8 GB RAM, 40 GB SSD (PaddleOCR requires ~2–3 GB RAM during inference)
- **Docker Engine:** Version 24+ with Compose v2 plugin (`docker compose version`)

### Step 2: Clone Repository & Prepare Environment

```bash
git clone https://github.com/Barnakdas-tech/MetraScan.git
cd MetraScan

# Create production environment file
cp .env.example .env
```

Generate cryptographically secure secrets:

```bash
# Generate JWT secret (at least 32 characters)
JWT_SECRET=$(openssl rand -hex 32)

# Generate AI inter-service shared token
AI_SERVICE_TOKEN=$(openssl rand -hex 24)

# Generate Database password
POSTGRES_PASSWORD=$(openssl rand -hex 24)
```

Edit `.env` and set the generated values:

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<generated_postgres_password>
POSTGRES_DB=metrascan

JWT_SECRET=<generated_jwt_secret>
JWT_EXPIRES_IN=8h

AI_SERVICE_TOKEN=<generated_ai_service_token>
OCR_PROVIDER=paddle
OCR_LANG=en

CLIENT_URL=http://YOUR_SERVER_IP_OR_DOMAIN
API_EXTERNAL_PORT=4000
WEB_EXTERNAL_PORT=80
```

### Step 3: Build and Launch Services

```bash
# Build all container images and start services in background
docker compose -f docker-compose.prod.yml up -d --build
```

Monitor startup progress:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f
```

### Step 4: Run Database Migrations

Apply Prisma schema migrations to the production database:

```bash
docker compose -f docker-compose.prod.yml run --rm api pnpm db:deploy
```

> [!IMPORTANT]
> **NEVER run `prisma migrate dev` in production.** Always use `prisma migrate deploy` (`pnpm db:deploy`), which executes committed SQL migrations idempotently without attempting to reset or shadow-test the database.

### Step 5: Provision the Initial Administrator Account

In production mode (`NODE_ENV=production`), public self-registration is automatically disabled. Provision the initial `ADMIN` user explicitly using the CLI seed utility:

```bash
docker compose -f docker-compose.prod.yml run --rm \
  -e SEED_ADMIN_EMAIL=admin@metrascan.gov.in \
  -e SEED_ADMIN_PASSWORD="YourSecureAdminPassword123!" \
  api pnpm db:seed
```

### Step 6: Verify Health Status

```bash
# 1. Check container health status
docker compose -f docker-compose.prod.yml ps

# 2. Check AI service health endpoint (requires X-Internal-Token)
docker compose -f docker-compose.prod.yml exec ai \
  curl -s -H "X-Internal-Token: $AI_SERVICE_TOKEN" http://localhost:8000/health

# 3. Check Backend API health
curl -s http://localhost:4000/api/v1/health

# 4. Access Web Interface
curl -I http://localhost
```

---

## 3. Deployment Option B: Split PaaS / Cloud Services

For architectures leveraging managed cloud providers:

- **Frontend:** Vercel / Netlify / Cloudflare Pages
- **Backend API:** Render / Railway / Fly.io / AWS ECS
- **AI Service:** Render / Fly.io / AWS ECS (GPU or high-CPU instance)
- **Database:** Managed PostgreSQL (Neon, Supabase, AWS RDS, GCP Cloud SQL)

### 1. Database Provisioning (Managed PostgreSQL)

1. Provision a PostgreSQL 16+ instance.
2. Retrieve the pooled connection string (`DATABASE_URL`) and direct connection string.
3. Run migrations from your deployment pipeline or admin machine:
   ```bash
   DATABASE_URL="postgresql://user:password@host:port/database?sslmode=require" \
   pnpm db:deploy
   ```
4. Seed the initial admin account:
   ```bash
   DATABASE_URL="postgresql://user:password@host:port/database?sslmode=require" \
   SEED_ADMIN_EMAIL="admin@metrascan.gov.in" \
   SEED_ADMIN_PASSWORD="YourSecureAdminPassword123!" \
   pnpm db:seed
   ```

### 2. AI Service Deployment (FastAPI / PaddleOCR)

- **Dockerfile Path:** `apps/ai/Dockerfile`
- **Build Context:** `apps/ai`
- **Port:** `8000` (or injected `PORT`)
- **Memory Recommendation:** 4 GB RAM
- **Required Environment Variables:**
  - `AI_SERVICE_TOKEN`: Shared token (min 16 chars).
  - `OCR_PROVIDER`: `paddle`
  - `OCR_LANG`: `en`

### 3. Backend API Deployment (Node.js Express)

- **Dockerfile Path:** `apps/api/Dockerfile`
- **Build Context:** `.` (Monorepo root — required to build `@metrascan/legal-engine`)
- **Port:** `4000` (or PaaS injected `PORT`)
- **Persistent Volume:** Mount a persistent disk to `/data/storage`
- **Required Environment Variables:**
  - `NODE_ENV`: `production`
  - `DATABASE_URL`: Connection string from Step 1.
  - `JWT_SECRET`: Random 32+ character string.
  - `JWT_EXPIRES_IN`: `8h`
  - `AI_SERVICE_URL`: URL of the deployed AI service (e.g. `https://metrascan-ai.onrender.com`).
  - `AI_SERVICE_TOKEN`: Exact same token set on the AI service.
  - `STORAGE_PATH`: `/data/storage`
  - `CLIENT_URL`: URL of the frontend (e.g. `https://metrascan.vercel.app` or custom domain) for CORS.

### 4. Frontend Deployment (Vercel)

The repository includes [`apps/web/vercel.json`](file:///Users/barnakdas/Documents/METRASCAN/apps/web/vercel.json) configured for single-page routing and reverse proxy rewrites:

1. Import repository on [Vercel](https://vercel.com).
2. Set **Root Directory** to `apps/web`.
3. Set **Framework Preset** to `Vite`.
4. Set **Build Command** to `pnpm build`.
5. Set **Output Directory** to `dist`.
6. Update `apps/web/vercel.json` rewrites or configure environment variables if proxying API requests through Vercel Edge.

---

## 4. Environment Variables Reference

### Backend API (`apps/api`)

| Variable | Type | Required in Prod? | Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `NODE_ENV` | `string` | **Yes** | `development` | Setting `production` disables registration and enforces strict auth |
| `PORT` / `API_PORT` | `number` | No | `4000` | Port Express server listens on. Supports cloud provider `PORT` |
| `DATABASE_URL` | `string` | **Yes** | — | PostgreSQL connection string |
| `JWT_SECRET` | `string` | **Yes** | — | Cryptographic secret for signing JWTs (min 32 characters) |
| `JWT_EXPIRES_IN` | `string` | No | `8h` | Lifetime of user session tokens |
| `AI_SERVICE_URL` | `string` | **Yes** | `http://localhost:8000` | HTTP endpoint where Node API calls AI service |
| `AI_SERVICE_TOKEN` | `string` | **Yes** | — | Shared authentication token (min 16 characters). Service fails closed if absent |
| `AI_TIMEOUT_MS` | `number` | No | `120000` | OCR inference request timeout in milliseconds |
| `STORAGE_PATH` | `string` | No | `./storage` | Directory where uploaded files and PDF reports are stored (`/data/storage` in container) |
| `CLIENT_URL` | `string` | No | `http://localhost:5173` | Allowed origin for CORS headers |

### AI / OCR Service (`apps/ai`)

| Variable | Type | Required in Prod? | Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `AI_SERVICE_TOKEN` | `string` | **Yes** | — | Shared authentication secret verified via `X-Internal-Token` |
| `OCR_PROVIDER` | `string` | No | `paddle` | OCR backend engine (`paddle` or `tesseract`) |
| `OCR_LANG` | `string` | No | `en` | Recognition language |
| `PORT` | `number` | No | `8000` | Uvicorn server listening port |
| `MAX_IMAGE_BYTES` | `number` | No | `10485760` | Maximum upload size per image (default 10 MB) |
| `OCR_TIMEOUT_SECONDS` | `number` | No | `120` | Timeout for processing single image |

---

## 5. Storage & Persistence Management

MetraScan writes user uploads and generated reports using `LocalDiskStorage`:

```
/data/storage/
├── inspections/
│   └── <inspectionId>/
│       ├── raw/          # Original package images (immutable)
│       └── crops/        # Bounding box crops for evidence review
└── reports/              # Final signed PDF compliance reports
```

### Volume Mounting Best Practices
- When deploying with Docker, mount a host directory or named volume to `/data/storage`.
- In cloud container services (AWS ECS, Render, Railway), attach a persistent volume to `/data/storage`.
- If migrating to cloud object storage (AWS S3, Cloudflare R2, MinIO), implement the `StorageProvider` interface in `apps/api/src/services/storageService.ts`.

---

## 6. Security Hardening Checklist

- [ ] **No Default Credentials:** `POSTGRES_PASSWORD`, `JWT_SECRET`, and `AI_SERVICE_TOKEN` must be generated randomly.
- [ ] **Boundary Authentication:** The AI service middleware will reject any request without a valid `X-Internal-Token`.
- [ ] **Public Registration Closed:** When `NODE_ENV=production`, `POST /api/v1/auth/register` returns HTTP 403. New inspectors and reviewers must be created by an `ADMIN` via `POST /api/v1/users`.
- [ ] **Role Separation of Duties:** An Inspector cannot approve their own inspection review. Reviewers cannot modify raw evidence.
- [ ] **Rate Limiting:** Global rate limiters are active on `/api/v1/auth/*` endpoints.
- [ ] **Audit Trail Immutability:** Audit log entries are append-only.

---

## 7. Backup & Disaster Recovery

### Database Backup
```bash
docker compose -f docker-compose.prod.yml exec -t db \
  pg_dump -U postgres -d metrascan -Fc > metrascan_backup_$(date +%Y%m%d).dump
```

### Database Restore
```bash
docker compose -f docker-compose.prod.yml exec -T db \
  pg_restore -U postgres -d metrascan -c < metrascan_backup_YYYYMMDD.dump
```

### Evidence Storage Backup
```bash
tar -czvf metrascan_storage_backup_$(date +%Y%m%d).tar.gz /var/lib/docker/volumes/metrascan_storage_data/_data
```
