# Architecture

## System Context

```
┌──────────────┐
│  React (web) │
└──────┬───────┘
       │ HTTP (JSON, JWT)
┌──────▼───────────────┐        ┌──────────────────┐
│  Express API (api)   │───────▶│ PostgreSQL        │
│                      │        │ (Prisma ORM)      │
│  routes → controllers│        └──────────────────┘
│  → services → repos  │        ┌──────────────────┐
│  + middleware        │───────▶│ File/object store │
│                      │        │ (Phase 2+)        │
│  ┌────────────────┐  │        └──────────────────┘
│  │ Legal Rule     │  │        ┌──────────────────┐
│  │ Engine (Phase 4)│ │───────▶│ FastAPI AI svc    │
│  └────────────────┘  │        │ (Phase 2+, obs   │
└──────────────────────┘        │  only — no law)  │
                                └──────────────────┘
```

## Core Architectural Rules

1. **AI never decides compliance.** The AI/CV service (Phase 2+) produces observations (OCR text, bboxes, classification, confidence). The Express API persists them as evidence. The legal rule engine (Phase 4, a separate deterministic TypeScript package) applies applicability rules and validators to structured evidence. Nothing in that chain lets a model emit PASS/FAIL.

2. **Applicability before validation.** Rule 3 of the 2011 Rules excludes Chapter II for packages over 25 kg/25 L (with stated exceptions) and industrial/institutional consumers; wholesale packages have their own provisions (Rule 24); exemptions exist (Rule 26). The pipeline therefore determines *which* rules apply before running any validator.

3. **Evidence-first persistence.** Every declaration stores its source image, raw OCR text, bounding box, and confidence at the moment of extraction. A result without evidence cannot be a high-confidence automated finding.

4. **Versioned law.** Rules carry effectiveFrom/effectiveTo (and amendment source). The base 2011 text contains provisions withdrawn wef 01.07.2012 (GSR 748(E)); version resolution is by date, never by "latest row wins".

5. **Provider abstraction.** OCR and document-understanding providers sit behind interfaces so PaddleOCR (initial) can be swapped without touching application logic.

## Phase 1 Structure (implemented)

### Backend (apps/api)

```
src/
├── server.ts            # bootstrap + graceful shutdown
├── app.ts                # express app factory (helmet, cors, routes, errors)
├── config/env.ts         # zod-validated environment
├── db/prisma.ts          # shared Prisma client
├── middleware/
│   ├── auth.ts           # requireAuth (JWT → req.user)
│   ├── rbac.ts           # requireRole(...)
│   ├── validate.ts       # zod body validation
│   └── errorHandler.ts   # 404 + central error → envelope
├── routes/               # /api/v1 route groups
├── controllers/          # thin HTTP handlers
├── services/             # business logic (auth, inspection, audit)
├── validators/           # zod request schemas
└── utils/                # ApiError, asyncHandler, response helpers
```

Request flow: `route (validation middleware) → controller → service → Prisma → envelope response`. Controllers stay thin; all logic and DB access live in services; errors are thrown as `ApiError` and converted by the central handler into the standard error envelope.

### Frontend (apps/web)

```
src/
├── main.tsx              # AuthProvider + BrowserRouter + App
├── App.tsx               # full route map (see below)
├── auth/AuthContext.tsx  # login/register/logout/me state
├── lib/api.ts            # axios instance + token interceptor + 401 redirect
├── layouts/AppLayout.tsx # Sidebar + Topbar + main outlet
├── components/
│   ├── RequireAuth.tsx   # auth guard (loading → redirect → render)
│   ├── layout/           # Sidebar (7 sections), Topbar (user menu)
│   └── ui/               # Button Input Select Card Badge Modal LoadingState EmptyState ErrorState PageHeader
└── pages/                # /login, /register, and 17 app routes
```

### Route map

| Path | Page |
|---|---|
| / | Redirect (token → /app/dashboard, else /login) |
| /login, /register | Auth pages |
| /app | Redirect to dashboard |
| /app/dashboard | Dashboard (placeholder) |
| /app/inspection/new | New inspection form (metadata → create → jump to workspace) |
| /app/inspection/:inspectionId | Inspection workspace (metadata, upload zone, image grid, delete/reorder, processing status) |
| /app/scan | Scan (placeholder until capture UX) |
| /app/inspections | Inspection history (real table, click-through) |
| /app/inspections/:inspectionId | Inspection record (renders the same workspace) |
| /app/products, /app/products/:productId | Products (placeholder) |
| /app/violations, /app/violations/:violationId | Violations (placeholder) |
| /app/reports, /app/reports/:reportId | Reports (placeholder) |
| /app/rules, /app/rules/:ruleId | Rules (placeholder) |
| /app/analytics | Analytics (placeholder) |
| /app/repository | Product repository (placeholder) |
| /app/settings | Settings (placeholder) |

All `/app/*` routes sit under `RequireAuth → AppLayout`, so they are authentication-protected, share the sidebar/topbar shell, and render consistent page headers and empty states.

## Phase 3 Components (implemented)

- **AI service (apps/ai):** FastAPI exposing /health, /api/quality, /api/ocr. PaddleOCR is the initial provider behind an OCRProvider abstraction (Tesseract fallback implemented; new providers drop in without touching the Node API). The quality engine returns measurable signals (blur via Laplacian variance, brightness, contrast, resolution, orientation) with PASS/WARNING/FAIL that describe the photograph, never legal compliance. Preprocessing is needs-based (upscale, denoise, CLAHE, sharpen — applied only when signals justify) and bboxes are normalized back to original-image coordinates.
- **Node integration:** the Express API is the only consumer of FastAPI; React never calls it directly. aiServiceClient maps failures to typed API errors: AI down 503 AI_SERVICE_UNAVAILABLE, timeout 504, invalid image 400, provider failure 502 OCR_FAILED.
- **Analysis pipeline (POST /inspections/:id/analyze):** per image: read from storage, quality, OCR, persist OcrResult + OcrRegion (text, confidence, bbox, provider, metadata), update statuses. Partial failure is honest: one failed image never blocks the rest, and nothing is framed as a legal verdict.
- **OCR viewer:** per-image panel with quality badge, OCR status, region list with confidence chips, and bbox overlays; selecting a region highlights it on the photograph.

## Future Components (design commitments, not yet built)

- **Legal engine (Phase 4):** A separate TypeScript package with a versioned rule registry, applicability predicates, and deterministic validators returning the five allowed statuses (PASS/FAIL/REVIEW/NOT_APPLICABLE/MANUAL_REQUIRED). Not inside React, prompts, controllers, or DB queries.
- **Storage abstraction (Phase 2):** Local disk provider behind an interface; S3-compatible provider later.
- **Reports (Phase 6):** Server-side PDF generation with evidence images and highlighted bboxes.

## Key Decisions

| Decision | Rationale |
|---|---|
| pnpm workspace monorepo | One repo, independent apps, shared foundation |
| Stateless JWT auth | Simple, scales horizontally, logout = client discards token |
| bcryptjs (12 rounds) | Pure-JS, no native build issues on any demo machine |
| Zod for request validation | Single source of truth for input shapes, typed outputs |
| Supertest + real test DB | Tests exercise actual middleware/db behavior, not mocks |
| Placeholder pages now | Routing/layout/auth proven in Phase 1; features phase in later |
