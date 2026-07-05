# syntax=docker/dockerfile:1
# Build context: repository root (docker build -f apps/api/Dockerfile .)

FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

FROM base AS prune
COPY . .
RUN pnpm dlx turbo prune @retain/api --docker

FROM base AS builder
COPY --from=prune /app/out/json/ .
COPY --from=prune /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile
COPY --from=prune /app/out/full/ .
RUN pnpm db:generate && pnpm --filter @retain/api build

FROM base AS prod-deps
COPY --from=prune /app/out/json/ .
COPY --from=prune /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --prod --filter @retain/api...

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
RUN addgroup -g 1001 -S retain && adduser -S retain -u 1001 -G retain
COPY --from=builder --chown=retain:retain /app/apps/api/dist ./dist
COPY --from=builder --chown=retain:retain /app/apps/api/package.json ./package.json
COPY --from=prod-deps --chown=retain:retain /app/node_modules ./node_modules
COPY --from=prod-deps --chown=retain:retain /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod-deps --chown=retain:retain /app/packages ./packages
USER retain
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1
CMD ["node", "dist/index.js"]
