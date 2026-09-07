# MetraScan Demo Guide (Phase 10)

## One-time setup

1. pnpm install
2. cp .env.example apps/api/.env — then edit DATABASE_URL and JWT_SECRET
3. psql -c "CREATE DATABASE metrascan" and psql -c "CREATE DATABASE metrascan_test"
4. pnpm db:migrate
5. pnpm db:seed — optional: creates clearly-labeled DEMO data
6. cd apps/ai && ./run.sh (AI service on :8000; first run installs models)
7. pnpm dev (API :4000 + web :5173)

## Demo account (from pnpm db:seed)

- Email: demo@metrascan.local
- Password: Demo-12345

Seeded data carries isDemo=true and a visible DEMO badge in the UI (history rows, dashboard, workspace header) so it can never be mistaken for real inspection data.

## Judge demo script (about 5 minutes)

1. LOGIN as the demo inspector; the Dashboard shows real counts (zeros if the DB is empty).
2. NEW INSPECTION: fill date, location, product; Create lands you in the workspace.
3. UPLOAD 2-3 package photographs (front/back/side guidance is shown).
4. RUN ANALYSIS: image quality (photograph feedback, never legal) plus OCR regions with confidence; click a region to see its box on the image.
5. EXTRACT DECLARATIONS: MRP, net quantity, manufacturer, dates, consumer care — each with confidence and bbox evidence.
6. APPLICABLE RULES: which provisions apply and why (Rule 3 boundaries, food deferrals, Rule 24, Rule 26; UNKNOWN yields REVIEW, never silent N/A).
7. RUN COMPLIANCE CHECK: deterministic verdict. Click the FAIL row to see requirement, reason, confidence, AI status, human decision, and the highlighted evidence image.
8. HUMAN REVIEW: Accept/Reject with a comment. The AI status is never overwritten — both display side by side; Review History updates.
9. GENERATE REPORT: download the PDF — branded screening report with declarations, checks, violations, evidence image, limitations, audit info. It states it is NOT a legal certification.
10. HISTORY: the inspection is searchable, filterable, paginated.

## Reliability to demo on purpose

- AI SERVICE DOWN: stop the AI service, click Run analysis — a clear 503 message with a restart hint and a Retry button. Nothing is marked FAIL.
- INVALID IMAGE: upload a renamed text file — per-file rejection with a reason; good files in the same batch still upload.
- LOW-QUALITY IMAGE: a blurry photo yields quality WARNING, and missing declarations become REVIEW ("not detected is not proven absent"), never FAIL.

## Deployment commands

- pnpm build — build all packages
- pnpm --filter api db:deploy — apply migrations
- pnpm --filter api start — production API
- npx serve apps/web/dist — serve the web build
- cd apps/ai && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 — production AI service
- pnpm lint && pnpm typecheck && pnpm test — full verification before going on stage
