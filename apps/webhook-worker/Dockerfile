# syntax=docker/dockerfile:1
# Build context MUST be the repository root:
#   docker build -f apps/webhook-worker/Dockerfile .
#
# Railway: Root directory = / (repo root), config = /apps/webhook-worker/railway.toml

FROM node:20-alpine AS base
RUN apk add --no-cache openssl libc6-compat
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV HUSKY=0
ENV CI=true
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

FROM base AS prune
COPY . .
RUN pnpm dlx turbo prune @retain/webhook-worker --docker \
  && cp tsconfig.base.json out/full/tsconfig.base.json

FROM base AS builder
COPY --from=prune /app/out/json/ .
COPY --from=prune /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --ignore-scripts
COPY --from=prune /app/out/full/ .
RUN pnpm db:generate && pnpm --filter @retain/webhook-worker... build
RUN pnpm --filter @retain/webhook-worker deploy --prod /deploy

FROM node:20-alpine AS runner
RUN apk add --no-cache openssl libc6-compat wget
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
RUN addgroup -g 1001 -S retain && adduser -S retain -u 1001 -G retain
COPY --from=builder --chown=retain:retain /deploy/ ./
USER retain
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3002}/health" || exit 1
CMD ["node", "dist/index.js"]
