FROM node:22-bookworm-slim AS builder
ENV PNPM_HOME="/pnpm"
ENV PNPM_STORE_DIR="/pnpm/store"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json tsconfig.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/server/package.json ./apps/server/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/rules/package.json ./packages/rules/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install
COPY apps/server ./apps/server
COPY packages/shared ./packages/shared
COPY packages/rules ./packages/rules
RUN pnpm build:server

FROM node:22-bookworm-slim AS runner
WORKDIR /app
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/tsconfig.base.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/rules/dist ./packages/rules/dist
COPY --from=builder /app/packages/rules/package.json ./packages/rules/package.json
EXPOSE 3000
CMD ["node", "apps/server/dist/index.js"]
