# syntax=docker/dockerfile:1
# Build context: repository root

FROM node:20-alpine AS builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

ARG VITE_API_URL=https://retainapi-production.up.railway.app
ARG VITE_PORTAL_URL=https://retainportal-production.up.railway.app
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_PORTAL_URL=$VITE_PORTAL_URL

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/portal/package.json apps/portal/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @retain/portal...
COPY apps/portal apps/portal
COPY packages/shared packages/shared
RUN pnpm --filter @retain/shared build && pnpm --filter @retain/portal build

FROM nginx:1.27-alpine AS runner
ENV PORT=8080
COPY apps/portal/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /app/apps/portal/dist /usr/share/nginx/html
RUN chown -R nginx:nginx /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-8080}/health" || exit 1
CMD ["nginx", "-g", "daemon off;"]
