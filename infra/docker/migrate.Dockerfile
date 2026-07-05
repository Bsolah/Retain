# syntax=docker/dockerfile:1
FROM node:20-alpine
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/database/package.json packages/database/
COPY packages/database/prisma packages/database/prisma/
RUN pnpm install --frozen-lockfile --filter @retain/database...
WORKDIR /app/packages/database
ENTRYPOINT ["npx", "prisma", "migrate", "deploy"]
