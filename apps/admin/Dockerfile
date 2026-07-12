# syntax=docker/dockerfile:1
# Build context: repository root
# docker build -f apps/admin/Dockerfile \
#   --build-arg VITE_API_URL=https://retainapi-production.up.railway.app \
#   --build-arg VITE_SHOPIFY_API_KEY=xxx \
#   --build-arg VITE_SHOPIFY_APP_URL=https://retainadmin-production.up.railway.app \
#   .

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

# Node static server (not nginx): binds 0.0.0.0:$PORT reliably on Railway.
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache wget
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV STATIC_ROOT=/app/public
COPY apps/admin/server.mjs ./server.mjs
COPY --from=builder /app/apps/admin/dist ./public
# Railway may still inject Start Command `pnpm …` from monorepo detection.
RUN printf '%s\n' \
      '#!/bin/sh' \
      'exec node /app/server.mjs' \
      > /usr/local/bin/pnpm \
  && chmod +x /usr/local/bin/pnpm
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-8080}/health" || exit 1
CMD ["node", "server.mjs"]
