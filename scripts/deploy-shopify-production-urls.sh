#!/usr/bin/env bash
# Sync production Shopify + Railway URL checklist helpers.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

API_URL="${API_URL:-https://retainapi-production.up.railway.app}"
ADMIN_URL="${ADMIN_URL:-https://retainadmin-production.up.railway.app}"
PORTAL_URL="${PORTAL_URL:-https://retainportal-production.up.railway.app}"

echo "==> Deploying Shopify app URLs (Partner Dashboard whitelist)"
echo "    application_url: $ADMIN_URL"
echo "    redirect:        $API_URL/auth/callback"
pnpm shopify:deploy -- --allow-deletes

echo
echo "==> Done. Now set these on Railway and redeploy:"
echo
echo "retain-api variables:"
echo "  SHOPIFY_APP_URL=$API_URL"
echo "  ADMIN_APP_URL=$ADMIN_URL"
echo "  PORTAL_URL=$PORTAL_URL"
echo
echo "retain-admin variables (build-time — trigger a rebuild after setting):"
echo "  VITE_API_URL=$API_URL"
echo "  VITE_API_PUBLIC_URL=$API_URL"
echo "  VITE_SHOPIFY_API_KEY=<same as SHOPIFY_API_KEY>"
echo "  VITE_SHOPIFY_APP_URL=$ADMIN_URL"
echo
echo "retain-admin / retain-portal settings:"
echo "  Root directory: /"
echo "  Config file:    /apps/admin/railway.toml  (or /apps/portal/railway.toml)"
echo "  Builder:        Dockerfile"
echo
echo "Then reinstall the app on your Shopify store."
