# Retain: Revenue Multiplier

Shopify subscription app with AI-powered retention.

This monorepo is scaffolding only — health checks and shared tooling, no business logic yet.

## Stack

| Path                  | Role                                                   |
| --------------------- | ------------------------------------------------------ |
| `apps/admin`          | Merchant admin (React 18, Vite, Polaris, App Bridge)   |
| `apps/portal`         | Customer portal (React 18, Vite, Customer Account API) |
| `apps/api`            | Core API (Node 20, Fastify, Mercurius GraphQL)         |
| `apps/ai`             | AI service (Python 3.11, FastAPI, uvicorn)             |
| `apps/webhook-worker` | Async webhooks (Node 20, BullMQ, Redis)                |
| `packages/shared`     | Shared types, utilities, constants                     |
| `packages/database`   | Prisma schema and client                               |

Tooling: **pnpm workspaces**, **Turborepo**, **ESLint**, **Prettier**, **Husky**, **GitHub Actions**.

## Prerequisites

- Node.js 20+
- pnpm 9 (`corepack enable && corepack prepare pnpm@9.0.0 --activate`)
- Python 3.11+
- Docker Desktop (PostgreSQL 15, Redis 7, ClickHouse)

## Quick start

```bash
# 1. Install Node dependencies
pnpm install

# 2. Install Python dependencies for the AI service
python3.11 -m venv apps/ai/.venv
source apps/ai/.venv/bin/activate
pip install -r apps/ai/requirements.txt

# 3. Copy environment files
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/ai/.env.example apps/ai/.env
cp apps/admin/.env.example apps/admin/.env
cp apps/portal/.env.example apps/portal/.env
cp apps/webhook-worker/.env.example apps/webhook-worker/.env
cp packages/database/.env.example packages/database/.env

# 4. Start infrastructure
# Host ports: Postgres 5433, Redis 6380, ClickHouse 8123
# (avoids clashes with other local stacks on 5432/6379)
docker compose up -d

# 5. Generate Prisma client, migrate, and seed demo data
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed

# 6. Run all apps in development mode
pnpm dev
```

With the AI virtualenv activated in a separate terminal (or ensure `uvicorn` is on your `PATH`):

```bash
pnpm --filter @retain/ai dev
```

## Service URLs

| Service         | URL                            | Health                        |
| --------------- | ------------------------------ | ----------------------------- |
| Admin           | http://localhost:5173          | UI scaffold                   |
| Portal          | http://localhost:5174          | UI scaffold                   |
| API             | http://localhost:3001          | `GET /health`                 |
| API GraphQL     | http://localhost:3001/graphiql | `query { health { status } }` |
| AI              | http://localhost:8000          | `GET /health`                 |
| Webhook worker  | http://localhost:3002          | `GET /health`                 |
| PostgreSQL      | localhost:5433                 | user/pass/db: `retain`        |
| Redis           | localhost:6380                 | —                             |
| ClickHouse HTTP | http://localhost:8123          | user/pass/db: `retain`        |

## Common commands

```bash
pnpm lint          # ESLint across packages
pnpm typecheck     # TypeScript project checks
pnpm test          # Unit tests
pnpm build         # Build all packages and apps
pnpm format        # Prettier write
pnpm format:check  # Prettier check
pnpm db:generate        # prisma generate
pnpm db:migrate         # prisma migrate dev
pnpm db:migrate:deploy  # prisma migrate deploy
pnpm db:seed            # seed demo shop / customers / contracts
pnpm db:push            # prisma db push (prototyping only)
```

Run a single package:

```bash
pnpm --filter @retain/api dev
pnpm --filter @retain/admin dev
pnpm --filter @retain/portal dev
pnpm --filter @retain/webhook-worker dev
pnpm --filter @retain/ai dev
```

## Git hooks

Husky runs on `pnpm install` via the `prepare` script. Pre-commit runs:

1. `lint-staged` (ESLint + Prettier on staged files)
2. `pnpm typecheck`

## CI

Pull requests and pushes to `main` / `master` run `.github/workflows/ci.yml`:

- install Node + Python deps
- generate Prisma client
- lint, typecheck, test, build

## Project layout

```
apps/
  admin/            # Shopify admin embedded app
  portal/           # Customer-facing portal
  api/              # Fastify + Mercurius
  ai/               # FastAPI
  webhook-worker/   # BullMQ worker
packages/
  shared/           # Shared TS library
  database/         # Prisma
```

## Subscription contracts & billing

- Webhook processor (BullMQ `shopify-webhooks`) upserts `subscription_contracts/create|update`
- Auto-creates `Customer` when missing; links plan via selling plan group
- Daily billing cron at **06:00 UTC** (`billing-scheduler.ts`) creates Shopify billing attempts
- Idempotent via `lastBillingAttemptId` + daily idempotency key
- Payment failures set `payment_failed` and enqueue dunning interventions
- Merchant mutations: `updateContract`, `cancelContract`, `pauseContract`, `resumeContract`, `runNow`
- Customer portal mutations: pause, skip (max 2 consecutive), swap, box update, cancel with survey
- All mutations write to `events`

## AI feature engineering & churn model

The AI service (`apps/ai`, port **8000**) builds churn-prediction feature vectors and trains an XGBoost model. The Node API proxies merchant actions through `/admin/ai/*`.

- `src/features/engineer.py` — `FeatureEngineer.generate_features` / `generate_batch_features`
- `src/jobs/daily_features.py` — per-shop feature upsert into `subscriber_signals`
- `src/jobs/daily_pipeline.py` — **features → score → auto-intervene** (APScheduler **02:00 UTC** when `ENABLE_SCHEDULER=true`)
- `src/models/churn.py` — `ChurnPredictor` (XGBoost, baseline fallback when under 1000 samples; stores `featureImportance` in metrics)
- `src/jobs/train_model.py` — extract labels, engineer features, validate, register, deploy
- Endpoints:
  - Features: `POST /features/generate`, `GET /features/{contract_id}`, `GET /features/health`
  - Models: `POST /models/train`, `GET /models/{version}/metrics`, `POST /models/{version}/deploy`
  - Predictions: `GET /predictions/{contract_id}`, `POST /predictions/batch`
  - Interventions: `POST /interventions/evaluate`, `POST /interventions/evaluate-batch`,
    `GET /interventions/{id}/status`, `POST /interventions/{id}/accept|decline`
  - Pipeline: `POST /pipeline/run`, `GET /pipeline/last`

**Admin AI Performance** (`/ai`) can refresh features, train, score, run interventions, toggle `auto_interventions_enabled`, and run the full pipeline.

Auto-interventions respect `shop.settings.auto_interventions_enabled` (default true),
skip when a pending intervention exists, and rate-limit to 3 per contract per 30 days.
Email/SMS use SendGrid/Twilio when configured; otherwise delivery is dry-run.
Accepted interventions set `revenue_impact` from contract/customer totals for “revenue saved”.

Artifacts default to `models/churn/{version}.joblib` (`MODELS_URI_PREFIX`). Set `MODELS_URI_PREFIX=s3://models/churn` for S3. Apply Prisma migrations for `feature_vector` and `model_registry`.

**Env (API):** `AI_SERVICE_URL` must point at the AI service.  
**Env (AI):** `DATABASE_URL`, `REDIS_URL`, `ENABLE_SCHEDULER=true` only after DB/Redis are linked.

## Customer portal

The portal (`apps/portal`, port **5174**) authenticates via **Customer Account API OAuth 2.0 + PKCE**. The API BFF owns tokens in httpOnly cookies and proxies Customer Account GraphQL plus local contract mutations.

**Multi-tenant:** each customer arrives with their store in the URL — no per-merchant env vars.

```bash
PORTAL_URL=http://localhost:5174
CUSTOMER_ACCOUNT_CLIENT_ID=   # One app-wide Client ID from Partner Dashboard
```

Optional for local dev only (when not using `?shop=`):

```bash
CUSTOMER_ACCOUNT_SHOP_DOMAIN=your-store.myshopify.com
```

In Partner Dashboard (Customer Account API / Headless channel), set the redirect URI to:

`{SHOPIFY_APP_URL}/portal/auth/callback`

Portal `VITE_API_URL` must be the **same public API origin** that handles OAuth (so cookies are sent). With tunnels, use the API tunnel URL, not `localhost`.

Customer login URL (link from storefront / emails):

`{PORTAL_URL}/login?shop=your-store.myshopify.com`

On `/portal/auth/start`, the API validates that the shop has installed Retain before redirecting to Shopify customer login.

Routes:

| Path                         | Purpose                                                |
| ---------------------------- | ------------------------------------------------------ |
| `/portal`                    | Dashboard — subscriptions, health, pause / skip / swap |
| `/portal/:contractId`        | Detail — orders, payment, box builder, add-ons         |
| `/portal/manage`             | Frequency, address, notifications, pause defaults      |
| `/portal/:contractId/cancel` | 3-step cancel with retention offers                    |

## Subscription plans

- GraphQL: `plans`, `plan`, `createPlan`, `updatePlan`, `archivePlan`, plus `searchProducts` / `collections`
- Admin UI: `/plans` list and `/plans/new` 3-step wizard (Polaris + App Bridge, React Query + Zustand)
- Create syncs to Shopify `sellingPlanGroupCreate` and stores `shopifySellingPlanGroupId`
- Archive removes the selling plan group from Shopify (hides subscribe option on products); unarchive recreates it
- Delete permanently removes the plan and its Shopify selling plan group (only when no subscribers)

## Storefront subscribe widget (theme app extension)

Retain ships a **theme app extension** so merchants can show purchase options on product pages without editing theme code.

| Piece             | Location                                                            |
| ----------------- | ------------------------------------------------------------------- |
| Theme block       | `extensions/retain-purchase-options/blocks/purchase-options.liquid` |
| Partner config    | `shopify.app.toml`                                                  |
| Widget status API | GraphQL `storefrontWidget`                                          |
| Admin onboarding  | Banner on Dashboard/Plans + modal after creating a plan             |

### Deploy the extension (once per app version)

```bash
shopify auth login
pnpm shopify:deploy
```

After deploy, merchants enable the block from Retain admin (**Open theme editor**), place **Retain: Subscribe** above Buy buttons, and click **Save**.

`read_themes` scope is required for Retain to detect whether the widget is active. Existing installs must **re-authorize** after you add the scope.

## Shopify OAuth (local + ngrok)

```bash
# Terminal 1 — API
pnpm --filter @retain/api dev

# Terminal 2 — public tunnel
ngrok http 3001
```

1. Set `SHOPIFY_APP_URL` in `apps/api/.env` to the ngrok HTTPS URL.
2. In Partner Dashboard, set the app URL and allowed redirection URL to:
   - `https://<ngrok>/auth/callback`
3. Install:
   - `https://<ngrok>/auth/shopify?shop=your-store.myshopify.com`
4. Simulate without Shopify (DB + session + webhooks):
   - `pnpm --filter @retain/api oauth:simulate`

## Notes

- Do not commit `.env` files. Use the `.env.example` files as templates.
- Access tokens are stored encrypted (`ENCRYPTION_KEY`, AES-256-GCM).
- Webhooks are acknowledged with `200` immediately and processed via BullMQ.
