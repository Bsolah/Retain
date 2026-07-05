# Run Retain fully linked to Shopify (local)

You need **two public HTTPS URLs** (Shopify cannot call `localhost`):

| Service                          | Local port | Tunnel target                                              |
| -------------------------------- | ---------- | ---------------------------------------------------------- |
| API (OAuth + webhooks + GraphQL) | `3001`     | `SHOPIFY_APP_URL`                                          |
| Admin (embedded UI)              | `5173`     | Partner Dashboard **App URL** (optional for first install) |

## 1. Infra + app

```bash
cd /Users/admin/Documents/Retain
docker compose up -d
pnpm db:migrate:deploy   # if not already applied
pnpm dev                 # API :3001, admin :5173
```

## 2. Tunnel the API (required)

```bash
ngrok http 3001
```

Copy the `https://….ngrok-free.app` URL (no trailing slash).

Set in `apps/api/.env`:

```bash
SHOPIFY_APP_URL=https://YOUR_API_NGROK_URL
```

Restart `pnpm dev` (or at least the API) so envalid reloads.

Optional: tunnel admin too if the embedded iframe must be public:

```bash
ngrok http 5173
# set ADMIN_APP_URL and Partner Dashboard App URL to that https URL
```

For many local installs, admin can stay on `http://localhost:5173` after OAuth redirects there with a session token.

## 3. Partner Dashboard app settings

**App setup → URLs**

| Field                      | Value                                        |
| -------------------------- | -------------------------------------------- |
| App URL                    | `http://localhost:5173` (or admin ngrok URL) |
| Allowed redirection URL(s) | `https://YOUR_API_NGROK_URL/auth/callback`   |

**API access**

1. Request **Access Subscriptions APIs** (unlocks `read/write_own_subscription_contracts` + `read_customer_payment_methods`).
2. After approval, ensure scopes match `SCOPES` in `apps/api/.env`.

**Credentials** (already in env)

| Partner field | Env                                                                   |
| ------------- | --------------------------------------------------------------------- |
| Client ID     | `apps/api` → `SHOPIFY_API_KEY`, `apps/admin` → `VITE_SHOPIFY_API_KEY` |
| Client secret | `apps/api` → `SHOPIFY_API_SECRET` only (never in admin)               |

## 4. Install on a dev store

Open (replace shop + ngrok):

```text
https://YOUR_API_NGROK_URL/auth/shopify?shop=YOUR_STORE.myshopify.com
```

Flow:

1. Shopify authorize screen
2. Callback → token encrypted in DB, webhooks registered
3. Redirect to `ADMIN_APP_URL?shop=…&session=…`
4. Admin loads plans UI with that session

## 5. Verify

```bash
curl -s https://YOUR_API_NGROK_URL/health
# {"status":"ok",...}

# After install, session token:
curl -s -X POST http://localhost:3001/auth/session-token \
  -H 'content-type: application/json' \
  -d '{"shop":"YOUR_STORE.myshopify.com"}'
```

In admin: [http://localhost:5173/plans](http://localhost:5173/plans) (with session from OAuth, or pass `?shop=…&session=…`).

## Troubleshooting

| Symptom                              | Fix                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| OAuth “redirect_uri not whitelisted” | Exact match: `https://…ngrok…/auth/callback` in Partner Dashboard              |
| Webhooks never arrive                | `SHOPIFY_APP_URL` must be the **API** ngrok URL; reinstall app to re-subscribe |
| `Access denied` on contracts/billing | Subscriptions API access not approved yet                                      |
| Admin “Session required”             | Complete OAuth install, or open with `?shop=&session=` from callback           |
| ngrok URL changed                    | Update `SHOPIFY_APP_URL` + Partner redirect URL, restart API, reinstall        |

## Env checklist

`apps/api/.env`

- `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET`
- `SHOPIFY_APP_URL` = API ngrok https
- `ADMIN_APP_URL` = `http://localhost:5173` (or admin ngrok)
- `ENCRYPTION_KEY`, `JWT_SECRET`, `DATABASE_URL`, `REDIS_URL`

`apps/admin/.env`

- `VITE_SHOPIFY_API_KEY` = same Client ID
- `VITE_API_URL` = `http://localhost:3001` (browser → API; use ngrok API URL if admin is also tunneled from another machine)
