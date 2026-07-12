# syntax=docker/dockerfile:1
# Build context: repository root
# Railway: RAILWAY_DOCKERFILE_PATH=apps/admin/Dockerfile (repo root as context)
# Clear any Custom Start Command in the Railway UI (or set: node /app/server.mjs)

FROM node:20-alpine AS builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

ARG VITE_API_URL=https://retainapi-production.up.railway.app
ARG VITE_API_PUBLIC_URL=https://retainapi-production.up.railway.app
ARG VITE_SHOPIFY_API_KEY=c2b06159f0e16307984e9fd00001740e
ARG VITE_SHOPIFY_APP_URL=https://retainadmin-production.up.railway.app
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_API_PUBLIC_URL=$VITE_API_PUBLIC_URL
ENV VITE_SHOPIFY_API_KEY=$VITE_SHOPIFY_API_KEY
ENV VITE_SHOPIFY_APP_URL=$VITE_SHOPIFY_APP_URL

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/admin/package.json apps/admin/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @retain/admin...
COPY apps/admin apps/admin
COPY packages/shared packages/shared
RUN pnpm --filter @retain/shared build && pnpm --filter @retain/admin build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache wget
ENV NODE_ENV=production
ENV HOST=::
ENV STATIC_ROOT=/app/public
COPY apps/admin/server.mjs ./server.mjs
COPY apps/admin/start.sh ./start.sh
COPY --from=builder /app/apps/admin/dist ./public
RUN chmod +x /app/start.sh \
  # Sticky Railway Start Commands often replace ENTRYPOINT with pnpm or the
  # old nginx entrypoint. Point those binaries at our Node server instead.
  && cp /app/start.sh /usr/local/bin/pnpm \
  && cp /app/start.sh /docker-entrypoint.sh \
  && cp /app/start.sh /usr/local/bin/nginx \
  && chmod +x /usr/local/bin/pnpm /docker-entrypoint.sh /usr/local/bin/nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=5 --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-8080}/health" || exit 1
ENTRYPOINT ["/app/start.sh"]
CMD []
