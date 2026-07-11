# Deploy Retain on Railway

Retain is a **shared monorepo**: every Docker build uses the **repository root** as context (`turbo prune`). Create one Railway service per app, all connected to the same GitHub repo.

## 1. Create services

| Railway service            | Config file path                    | Dockerfile                        |
| -------------------------- | ----------------------------------- | --------------------------------- |
| `retain-api`               | `/apps/api/railway.toml`            | `apps/api/Dockerfile`             |
| `retain-webhook-worker`    | `/apps/webhook-worker/railway.toml` | `apps/webhook-worker/Dockerfile`  |
| `retain-admin`             | `/apps/admin/railway.toml`          | `apps/admin/Dockerfile`           |
| `retain-ai`                | `/apps/ai/railway.toml`             | `apps/ai/Dockerfile`              |
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

`@retain/ai` is standalone Python but its Dockerfile still copies `apps/ai/*` paths — keep root directory at `/` for AI too.

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
SHOPIFY_APP_URL=https://${{retain-api.RAILWAY_PUBLIC_DOMAIN}}
ADMIN_APP_URL=https://${{retain-admin.RAILWAY_PUBLIC_DOMAIN}}
PORTAL_URL=https://${{retain-portal.RAILWAY_PUBLIC_DOMAIN}}
AI_SERVICE_URL=https://${{retain-ai.RAILWAY_PUBLIC_DOMAIN}}
PROCESS_WEBHOOKS_IN_API=false
SKIP_BACKGROUND_WORKERS=false
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

### Admin (build-time — rebuild admin after changing)

```env
VITE_API_URL=https://${{retain-api.RAILWAY_PUBLIC_DOMAIN}}
VITE_API_PUBLIC_URL=https://${{retain-api.RAILWAY_PUBLIC_DOMAIN}}
VITE_SHOPIFY_API_KEY=<client-id>
VITE_SHOPIFY_APP_URL=https://${{retain-admin.RAILWAY_PUBLIC_DOMAIN}}
```

### Migrate

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

## 4. Shopify

After domains are live:

1. Set `SHOPIFY_APP_URL` to the **api** public URL
2. Set `ADMIN_APP_URL` to the **admin** public URL
3. Update `shopify.app.toml` webhooks + redirect to the api URL
4. Run `pnpm shopify:deploy`
5. Reinstall on your dev store

Use **custom domains** on Railway for stable OAuth callback URLs (avoid changing trycloudflare-style URLs).

## 5. Notes

- **Admin nginx** listens on port **8080** (fixed in Dockerfile). Railway should detect this from `EXPOSE 8080`; if healthchecks fail, set the service port to 8080 in Settings.
- **API / worker** bind to Railway's injected `$PORT` automatically.
- **Watch paths** in each `railway.toml` limit redeploys to relevant packages only.
- **Migrations** are not run by the API container — use the migrate service or `railway run` with `pnpm db:migrate:deploy` before releasing api/worker changes.
- **Docker builds** bundle workspace deps via `pnpm deploy`; push Dockerfile changes before redeploying on Railway.

## 7. Troubleshooting deploy failures

| Symptom                                              | Fix                                                                                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `Cannot find module '@retain/database'` during `tsc` | Pull latest code (`prebuild` builds workspace deps). Or set build command to `pnpm run build:railway:api` / `build:railway:webhook-worker` |
| `prisma: not found` / postinstall failed             | Redeploy with latest Dockerfiles (use `pnpm deploy`, not raw prod install)                                                                 |
| `Cannot read file tsconfig.base.json`                | Ensure latest `turbo.json` + Dockerfiles are deployed                                                                                      |
| `COPY apps/ai/models not found`                      | Model artifacts are gitignored; pull latest `apps/ai/Dockerfile` (creates empty `/app/models/churn` at build)                              |
| `COPY apps/ai/...` not found                         | Set Railway **root directory** to `/`, not `apps/ai`                                                                                       |
| OAuth callback uses old tunnel URL                   | Set `SHOPIFY_APP_URL` to Railway api domain and redeploy Shopify app config                                                                |
| Healthcheck fails on api/worker                      | Ensure Postgres + Redis env vars are set; Railway injects `$PORT` automatically                                                            |

## 6. Local parity

Docker Compose stack for local full-stack testing:

```bash
docker compose -f docker-compose.yml -f docker-compose.apps.yml up -d --build
```

See [RUNBOOK.md](../RUNBOOK.md) for AWS/K8s production paths.
