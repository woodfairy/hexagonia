FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PNPM_STORE_DIR="/pnpm/store"
ENV PATH="$PNPM_HOME:$PATH"
ENV TURBO_TELEMETRY_DISABLED="1"
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY json/ ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm fetch --frozen-lockfile
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --offline --frozen-lockfile

FROM deps AS builder
COPY full/ ./
RUN pnpm build:server

FROM node:22-bookworm-slim AS runner
ENV NODE_ENV="production"
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/rules/dist ./packages/rules/dist
COPY --from=builder /app/packages/rules/package.json ./packages/rules/package.json
EXPOSE 3000
CMD ["node", "apps/server/dist/index.js"]
