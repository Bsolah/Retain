# Deploy Retain on Railway

Retain is a **shared monorepo**: every Docker build uses the **repository root** as context (`turbo prune`). Create one Railway service per app, all connected to the same GitHub repo.

## 1. Create services

| Railway service            | Config file path                    | Dockerfile                        |
| -------------------------- | ----------------------------------- | --------------------------------- |
| `retain-api`               | `/apps/api/railway.toml`            | `apps/api/Dockerfile`             |
| `retain-webhook-worker`    | `/apps/webhook-worker/railway.toml` | `apps/webhook-worker/Dockerfile`  |
| `retain-admin`             | `/apps/admin/railway.toml`          | `apps/admin/Dockerfile`           |
| `retain-ai`                | `/apps/ai/railway.toml`             | `Dockerfile` (context: `apps/ai`) |
| `retain-portal` (optional) | `/apps/portal/railway.toml`         | `apps/portal/Dockerfile`          |
| `retain-migrate` (manual)  | `/infra/docker/railway.toml`        | `infra/docker/migrate.Dockerfile` |

For **each** service in Railway → **Settings**:

1. **Root directory:** `/` (leave empty / repo root — **do not** set `apps/api`; Docker builds need the full monorepo for `turbo prune` and workspace packages)
2. **Config file:** path from the table above (absolute from repo root, e.g. `/apps/api/railway.toml`)
3. **Builder:** Dockerfile (set in `railway.toml` — do not use Railpack/Nixpacks for these services)
4. **Generate domain** for public services (api, admin, portal, ai)

Add **Postgres** and **Redis** plugins to the project.

### Why builds fail if root directory is wrong

`@retain/api` and `@retain/webhook-worker` depend on workspace packages:

- `@retain/database`
- `@retain/shared`
- `@retain/shopify-admin`

The Dockerfiles use `turbo prune` + `pnpm deploy` from the **repo root**. If Railway root is `apps/api`, the build context excludes `packages/*` and deployment fails.

`@retain/ai` is standalone Python. Set **root directory** to `apps/ai` (not `/`) so Docker `COPY` paths resolve correctly.

## 2. Deploy order

1. Postgres + Redis provisioned
2. **retain-migrate** — set `DATABASE_URL`, deploy once (or run before each release)
3. **retain-ai**
4. **retain-api**
5. **retain-webhook-worker**
6. **retain-admin** (and portal if used)
7. Update Shopify URLs + `pnpm shopify:deploy`
8. Reinstall app on dev store

## 3. Environment variables

Use Railway reference variables where possible.

### API (`retain-api`)

```env
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
JWT_SECRET=<random>
ENCRYPTION_KEY=<64-char-hex>
SHOPIFY_API_KEY=<client-id>
SHOPIFY_API_SECRET=<client-secret>
SHOPIFY_APP_URL=https://retainapi-production.up.railway.app
ADMIN_APP_URL=https://retainadmin-production.up.railway.app
PORTAL_URL=https://retainportal-production.up.railway.app
AI_SERVICE_URL=https://${{retain-ai.RAILWAY_PUBLIC_DOMAIN}}
PROCESS_WEBHOOKS_IN_API=false
SKIP_BACKGROUND_WORKERS=false
```

Or with Railway references (if service names match):

```env
SHOPIFY_APP_URL=https://${{retain-api.RAILWAY_PUBLIC_DOMAIN}}
ADMIN_APP_URL=https://${{retain-admin.RAILWAY_PUBLIC_DOMAIN}}
PORTAL_URL=https://${{retain-portal.RAILWAY_PUBLIC_DOMAIN}}
```

### Admin (build-time — rebuild admin after changing)

```env
VITE_API_URL=https://retainapi-production.up.railway.app
VITE_API_PUBLIC_URL=https://retainapi-production.up.railway.app
VITE_SHOPIFY_API_KEY=<client-id>
VITE_SHOPIFY_APP_URL=https://retainadmin-production.up.railway.app
```

Admin **must** use Dockerfile builder with root `/` and config `/apps/admin/railway.toml`. If the HTML contains `/@vite/client`, Railway is running Vite dev — fix builder settings and redeploy.

Sync Partner Dashboard URLs with:

```bash
pnpm shopify:deploy:production-urls
```

### Webhook worker

```env
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
ENCRYPTION_KEY=<same-as-api>
SHOPIFY_API_SECRET=<same-as-api>
AI_SERVICE_URL=https://${{retain-ai.RAILWAY_PUBLIC_DOMAIN}}
```

### Migrate

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

### AI (`retain-ai`)

`/health` is a liveness probe and does **not** require Postgres/Redis. The Docker image defaults to `ENABLE_SCHEDULER=false` so the service becomes healthy before background jobs connect.

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
MODELS_URI_PREFIX=/app/models/churn
ENABLE_SCHEDULER=true
```

Set `ENABLE_SCHEDULER=true` only after Postgres and Redis are linked. Until then, leave it unset (or `false`) so Railway healthchecks pass.

## 4. Shopify

After domains are live:

1. Set `SHOPIFY_APP_URL` to the **api** public URL
2. Set `ADMIN_APP_URL` to the **admin** public URL
3. Update `shopify.app.toml` webhooks + redirect to the api URL
4. Run `pnpm shopify:deploy`
5. Reinstall on your dev store

Use **custom domains** on Railway for stable OAuth callback URLs (avoid changing trycloudflare-style URLs).

## 5. Notes

- **Admin / portal nginx** bind to Railway `$PORT` (default 8080 in the image).
- **API / worker** bind to Railway's injected `$PORT` automatically.
- **Watch paths** in each `railway.toml` limit redeploys to relevant packages only.
- **Migrations** are not run by the API container — use the migrate service or `railway run` with `pnpm db:migrate:deploy` before releasing api/worker changes.
- **Docker builds** bundle workspace deps via `pnpm deploy`; push Dockerfile changes before redeploying on Railway.

## 7. Troubleshooting deploy failures

| Symptom                                                                 | Fix                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Admin **502** / wrong Target Port / `pnpm` start                        | See rows above.                                                                                                                                                                                                                                                                                                    |
| OAuth error: `URL must start with postgresql://` / `/health/db` **503** | `DATABASE_URL` on **retain-api** is missing or not a Postgres URL (often an `https://…up.railway.app` domain or unresolved `${{…}}`). In Railway: add Postgres → Variables on API → `DATABASE_URL=${{Postgres.DATABASE_URL}}` (service name must match). Confirm `/health/db` returns 200, then reinstall the app. |
| `Cannot find module '@retain/database'` during `tsc`                    | Use Dockerfile builder (not Railpack). Ensure repo-root build context.                                                                                                                                                                                                                                             |
| `prisma: not found` / postinstall failed                                | Redeploy with latest Dockerfiles (use `pnpm deploy`, not raw prod install)                                                                                                                                                                                                                                         |
| `Cannot read file tsconfig.base.json`                                   | Ensure latest `turbo.json` + Dockerfiles are deployed                                                                                                                                                                                                                                                              |
| `COPY apps/ai/models not found`                                         | Model artifacts are gitignored; pull latest `apps/ai/Dockerfile` (creates empty `/app/models/churn` at build)                                                                                                                                                                                                      |
| `COPY apps/ai/...` not found                                            | Set Railway **root directory** to `apps/ai` (not `/`); redeploy with latest `apps/ai/Dockerfile`                                                                                                                                                                                                                   |
| OAuth callback uses old tunnel URL                                      | Set `SHOPIFY_APP_URL` to Railway api domain and redeploy Shopify app config                                                                                                                                                                                                                                        |
| `connect ECONNREFUSED /` or Redis startup failure                       | `REDIS_URL` is missing or malformed. Link Redis to the service and set `REDIS_URL=${{Redis.REDIS_URL}}` (service name must match). Code adds `family=0` for Railway IPv6 automatically.                                                                                                                            |
| `ENOTFOUND redis.railway.internal`                                      | Same fix — ensure Redis plugin is linked; latest code uses dual-stack DNS (`family: 0`) on all Redis clients                                                                                                                                                                                                       |
| Healthcheck fails on api/worker                                         | Ensure Postgres + Redis env vars are set; Railway injects `$PORT` automatically                                                                                                                                                                                                                                    |
| `retain-ai` healthcheck fails on `/health`                              | Pull latest AI image (lazy ML imports + `/app/start.sh`). Root directory must be `apps/ai`. Leave `ENABLE_SCHEDULER=false` until DB/Redis linked. Avoid `package.json` start (needs `.venv`).                                                                                                                      |

## 6. Local parity

Docker Compose stack for local full-stack testing:

```bash
docker compose -f docker-compose.yml -f docker-compose.apps.yml up -d --build
```

See [RUNBOOK.md](../RUNBOOK.md) for AWS/K8s production paths.
