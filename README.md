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
