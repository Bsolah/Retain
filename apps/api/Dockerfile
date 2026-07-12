# Build context MUST be the repository root:
#   docker build -f apps/api/Dockerfile .
#
# Railway: Root directory = / (repo root), Dockerfile path = apps/api/Dockerfile
# If Railway fails with "lease does not exist", clear the service build cache and redeploy.

FROM node:20-alpine AS base
# Bust stale Railway BuildKit leases after removing cache mounts.
ENV RETAIN_DOCKERFILE_REV=2
RUN apk add --no-cache openssl libc6-compat
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV HUSKY=0
ENV CI=true
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

FROM base AS prune
COPY . .
RUN pnpm dlx turbo prune @retain/api --docker \
  && cp tsconfig.base.json out/full/tsconfig.base.json

FROM base AS builder
COPY --from=prune /app/out/json/ .
COPY --from=prune /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY --from=prune /app/out/full/ .
RUN pnpm db:generate && pnpm --filter @retain/api... build
RUN pnpm --filter @retain/api deploy --prod /deploy

FROM node:20-alpine AS runner
RUN apk add --no-cache openssl libc6-compat wget
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
RUN addgroup -g 1001 -S retain && adduser -S retain -u 1001 -G retain
COPY --from=builder --chown=retain:retain /deploy/ ./
USER retain
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3001}/health" || exit 1
CMD ["node", "dist/index.js"]
