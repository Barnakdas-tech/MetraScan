# Development Guide

## Prerequisites

- Node.js ≥ 20 (v24 used during Phase 1)
- pnpm ≥ 10
- PostgreSQL 14+ (18 used during Phase 1 via Postgres.app)

## Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example apps/api/.env
# edit apps/api/.env — set DATABASE_URL user and a strong JWT_SECRET

# 3. Create databases
psql -c "CREATE DATABASE metrascan"
psql -c "CREATE DATABASE metrascan_test"

# 4. Migrate
pnpm db:migrate
```

Note: the first `pnpm install` may prompt to approve build scripts for prisma/esbuild. Approve them (or run `pnpm approve-builds`) — they are required for Prisma engines and esbuild.

## Commands

| Command | Purpose |
|---|---|
| `pnpm dev` | API (ts) + web (vite) in parallel |
| `cd apps/ai && ./run.sh` | AI service on http://localhost:8000 |
| `pnpm dev:api` / `pnpm dev:web` | Individual dev servers |
| `pnpm build` | Production builds (both apps) |
| `pnpm typecheck` | TypeScript strict check, both apps |
| `pnpm test` | Vitest suite (uses metrascan_test) |
| `pnpm db:migrate` | Create/apply migrations (dev DB) |
| `pnpm db:deploy` | Apply pending migrations (prod-style) |
| `pnpm db:generate` | Regenerate Prisma client |
| `pnpm db:seed` | Seed (admin via SEED_ADMIN_EMAIL/PASSWORD) |
| `pnpm db:studio` | Prisma Studio |

## Testing

Tests run via Vitest with Supertest against the **real** `metrascan_test` database (no mocks of auth/db). The suite:

1. registration
2. duplicate email rejection
3. login
4. invalid password rejection
5. protected route without token
6. unauthorized inspection creation
7. VIEWER/REVIEWER role authorization (403)
8. inspection creation (INSPECTOR, full payload incl. product)

Each test resets the test DB schema via `prisma db push --force-reset` (env override), keeping tests isolated.

## Adding an API Endpoint

1. Define the zod schema in `src/validators/`.
2. Add business logic to a service in `src/services/`.
3. Add a thin controller in `src/controllers/`.
4. Wire the route in `src/routes/` with `requireAuth`/`requireRole`/`validateBody` middleware.
5. Throw `ApiError` for error cases — the central handler formats them.
6. Add a test to `src/test/`.

## Adding a Frontend Page

1. Create the page in `src/pages/app/` using PageHeader + EmptyState (placeholders for now).
2. Import and register the route in `src/App.tsx` under the `/app` layout.
3. Add a Sidebar entry in `src/components/layout/Sidebar.tsx` if it needs navigation.

## Conventions

- TypeScript strict mode everywhere; no `any` unless unavoidable.
- Backend: ESM with NodeNext resolution — relative imports need `.js` extensions.
- API envelope is mandatory: never return raw objects/errors.
- Frontend: Tailwind utilities with the defined design tokens (brand/surface palette); professional government-tech tone, minimal animation.
- Never commit `.env`; `.env.example` documents every variable.
