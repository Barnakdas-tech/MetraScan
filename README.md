# MetraScan

AI-assisted Legal Metrology inspection platform for packaged commodities in India.

**Problem statement:** SIH26034 — Software System to check compliance of Packaged Commodities under the Legal Metrology (Packaged Commodities) Rules, 2011 by scanning products, images, and labels.

**Team:** Quantum Forge · Newton School of Technology, Rishihood University

MetraScan helps enforcement/inspection users capture package photographs, run image quality checks, extract declarations via OCR, classify the product, determine which legal rules apply, validate against deterministic rule-engine logic, and produce evidence-backed PASS / FAIL / REVIEW / MANUAL_REQUIRED results — always under final human review. The system assists a Legal Metrology Officer; it never replaces one.

## Status

Phase 1 (foundation), Phase 2 (inspection intake + image upload), and Phase 3 (AI service, quality, OCR) are complete:

- React (Vite + TypeScript + Tailwind) frontend with the full route map, authentication protection, and the application shell
- Express (TypeScript) backend with modular routes / controllers / services / middleware architecture
- PostgreSQL + Prisma with the full foundation schema (13 models, UUID keys, timestamps)
- JWT authentication, bcrypt password hashing, role-based access control (ADMIN / INSPECTOR / REVIEWER / VIEWER)
- Inspection creation and listing APIs (foundation for the later analysis workflow)
- Human-readable inspection numbers (INS-YYYY-NNNNNN) via a per-year Postgres counter — never a primary key
- Multi-image upload (JPEG/PNG/WEBP) with per-file validation: type, size, emptiness, decodability, MIME-vs-content sniffing, true pixel dimensions
- Server-generated UUID storage keys — user filenames are metadata only, never paths
- Image list/delete/reorder with gap-free resequencing; authenticated storage serving
- New Inspection form + full inspection workspace UI (drag-and-drop upload, preview grid, delete, reorder, upload-failure reporting, capture guidance)
- Inspection access control: INSPECTORs restricted to their own inspections (cross-access returns 404), REVIEWER/VIEWER read-all, ADMIN full
- 16 integration tests against a real test database (9 from Phase 1 + 7 Phase 2 cases)
- Python FastAPI AI service (apps/ai): measurable quality signals with honest PASS/WARNING/FAIL (photography feedback, never legal compliance)
- OCR via PaddleOCR behind an OCRProvider abstraction (Tesseract fallback); needs-based preprocessing; bboxes in original-image coordinates
- POST /inspections/:id/analyze pipeline: quality, OCR, persistence (OcrResult/OcrRegion), per-image failure handling
- OCR viewer: quality + OCR status, region list with confidence, bbox highlighting
- 21 integration tests; the suite passes even with the AI service down
- Phase 4: deterministic declaration extraction (MRP, net quantity, manufacturer/packer/importer, dates, consumer care, phone, email, dimensions, country of origin) with evidence (bbox + OCR region ids) on every candidate; product classification (food/beverage/cosmetic/garment/household/electronic/chemical/industrial/other/unknown) with honest low confidence when uncertain; inspector corrections stored beside — never over — the AI extraction
- Phase 5: legal applicability engine as a standalone pure-TS package (packages/legal-engine) — versioned, source-cited rules from the 2011 Rules PDF (Rule 3 boundaries, Rule 6 declaration provisos with food/cosmetics/seeds/bidi/LPG/excise deferrals, Rule 24 wholesale, Rule 26 exemptions) with an explanation for every applicability decision; UNKNOWN inputs yield REVIEW, never silent NOT_APPLICABLE; Applicable Rules section in the inspection workspace
- Phase 6: deterministic compliance engine — validators for quantity/units (Rule 13), manufacturer details (Rule 10), generic name, date, MRP, consumer care, numeral size (Rule 7 — MANUAL_REQUIRED without calibration, never fabricated mm), spacing/contrast (Rules 8-9 — visual checks flagged for manual inspection), quantity wording (Rule 12(6) incl. the 2012 amendment), archaic counting (Rule 13(4)), dimensions (Rule 14); "not detected is not proven absent" enforced throughout; verdict aggregation COMPLIANT / NON_COMPLIANT / REVIEW_REQUIRED; Compliance Results section in the workspace with persisted ValidationResults and Violations
- Phase 7: evidence viewer and human review — every compliance result opens a detail view (requirement, reason, confidence, source, image with highlighted evidence boxes using icon+label+border cues, not color alone); review actions (accept/reject/edit/change/comment/mark-manual) fully audited with old→new values; AI status never overwritten (human decisions stored beside it); Review History card in the workspace
- Phase 8: professional compliance report — server-side PDF generation with MetraScan branding, inspection summary, declarations, checks with AI + human statuses, violations, evidence image, limitations ("NOT a legal certification"), audit info; Generate report + Download PDF in the workspace
- Phase 9: dashboard (summary/recent/violations/trends — real DB numbers only, honest zero/empty states), inspection history with search/filter/sort/pagination, product repository with search + detail (inspection + compliance history), violations dashboard, analytics (outcomes by month, violations by rule/category, review rate, common missing declarations)
- Phase 10: demo polish — server-generated thumbnails (fast grids, originals only for zoom), a clearly-labeled DEMO seed (pnpm db:seed, isDemo=true plus visible DEMO badges so demo data never mixes with real data), retry buttons on every analysis/compliance/extract error, and a documented judge demo script in docs/demo.md
- Vitest integration test suite (9 tests) covering registration, login, protected routes, role authorization, and inspection creation

Not yet implemented (later phases): OCR, AI/CV pipeline, QR scanning, legal rule engine, validation results, violations, PDF reports, dashboards/analytics.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TypeScript, React Router, Tailwind CSS, Axios |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL, Prisma ORM |
| Auth | JWT (stateless), bcryptjs password hashing |
| Tests | Vitest + Supertest (against a real test database) |

## Monorepo Layout

```
metrascan/
├── apps/
│   ├── api/            # Express API (TypeScript)
│   │   ├── prisma/     # Schema + migrations + seed
│   │   └── src/
│   │       ├── config/       # env validation (zod)
│   │       ├── controllers/  # request handlers
│   │       ├── db/           # Prisma client instance
│   │       ├── middleware/   # auth, rbac, validation, errors
│   │       ├── routes/       # /api/v1 route groups
│   │       ├── services/     # business logic
│   │       ├── test/         # vitest setup + suites
│   │       ├── validators/   # zod request schemas
│   │       └── utils/        # ApiError, asyncHandler, response helpers
│   └── web/            # React frontend
│       └── src/
│           ├── auth/         # AuthContext (login/register/logout/me)
│           ├── components/   # reusable UI + layout (Sidebar, Topbar)
│           ├── layouts/      # AppLayout (shell)
│           ├── lib/          # axios client with token interceptor
│           └── pages/        # route pages (auth + app)
├── docs/               # architecture, api, database, development docs
└── legal/              # source law + rule matrix (populated in Phase 4)
```

## Quick Start

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 10 (`npm i -g pnpm` if needed)
- PostgreSQL 14+ running on localhost:5432

### 1. Install

```bash
pnpm install
```

### 2. Configure environment

```bash
cp .env.example apps/api/.env
```

Then edit `apps/api/.env`:

| Variable | Purpose | Example |
|---|---|---|
| DATABASE_URL | PostgreSQL connection string | postgresql://YOUR_USER@localhost:5432/metrascan |
| JWT_SECRET | Token signing secret (≥ 32 random chars) | output of `openssl rand -hex 32` |
| API_PORT | Backend port | 4000 |
| CLIENT_URL | Frontend origin (CORS) | http://localhost:5173 |
| AI_SERVICE_URL | FastAPI service URL (Phase 2+) | http://localhost:8000 |
| AI_SERVICE_TOKEN | Shared secret for the API ↔ AI service boundary (required in production; same value in apps/ai/.env) | output of `openssl rand -hex 24` |
| STORAGE_PATH | Local uploads root (Phase 2+) | ./storage |

### 3. Create the databases

```bash
# Using psql (Postgres.app: /Applications/Postgres.app/Contents/Versions/18/bin/psql)
psql -c "CREATE DATABASE metrascan"
psql -c "CREATE DATABASE metrascan_test"
```

### 4. Run migrations

```bash
pnpm db:migrate        # dev DB, creates/updates schema
```

### 5. Start development servers

```bash
pnpm dev               # both API + web, in parallel
```

- Frontend: http://localhost:5173
- API health: http://localhost:4000/api/v1/health

### 6. Run tests

```bash
pnpm test              # vitest against the metrascan_test database
```

## Default Roles

Self-registration is available in **development only**; new self-registered users get the **INSPECTOR** role. In production, registration is disabled and accounts are provisioned by an operator via the seed script (required env) or an admin flow:

```bash
SEED_ADMIN_EMAIL=<real-email> SEED_ADMIN_PASSWORD=<strong-password> pnpm db:seed
```

Role permissions (Phase 1):

| Action | ADMIN | INSPECTOR | REVIEWER | VIEWER |
|---|:-:|:-:|:-:|:-:|
| Create inspections | ✓ | ✓ | ✗ | ✗ |
| View inspections | ✓ | ✓ | ✓ | ✓ |

## API Overview

All endpoints are under `/api/v1` and return the envelope:

```json
{ "success": true, "data": ... }
```

Errors:

```json
{ "success": false, "error": { "code": "NOT_FOUND", "message": "...", "details": ... } }
```

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | /api/v1/health | — | Service health |
| POST | /api/v1/auth/register | — | Register (INSPECTOR role; development only) |
| POST | /api/v1/auth/login | — | Login, returns JWT |
| POST | /api/v1/auth/logout | JWT | Logout (client discards token) |
| GET | /api/v1/auth/me | JWT | Current user |
| POST | /api/v1/inspections | JWT (INSPECTOR/ADMIN) | Create inspection |
| GET | /api/v1/inspections | JWT | List inspections |
| GET | /api/v1/inspections/:id | JWT | Inspection detail |

Full contract: [docs/api.md](docs/api.md)

## Project Principles

1. **AI-assisted, never AI-decisive.** Models observe and extract; the deterministic rule engine decides; a human officer confirms.
2. **No invented law.** Rules are encoded from the supplied Legal Metrology (Packaged Commodities) Rules, 2011 source document (and its amendment notifications) only, with source citations and effective dates.
3. **Applicability before validation.** The system first determines *which* rules apply (retail vs wholesale, category, quantity, exemption, date), then validates.
4. **Evidence-first.** Every finding links back to image evidence with bounding boxes; findings without evidence never become confident results.
5. **Calibration honesty.** Physical measurements (e.g., mm font heights) from uncalibrated photos return MANUAL_REQUIRED, never fabricated numbers.

## Legal Source Documents

The primary legal source is `9 The Legal Metrology (Package Commodities) Rules, 2011.pdf` (43 pp.). The Legal Metrology Act, 2009 is the parent statute. Both are machine-readable text PDFs. The rule engine (Phase 4) will encode rules with exact source citations; the `legal/` directory will hold the extracted sources and the LEGAL_RULE_MATRIX.
