FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS builder
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
COPY apps/web ./apps/web
COPY assets ./assets
COPY packages/shared ./packages/shared
RUN pnpm build:web

FROM --platform=$TARGETPLATFORM nginx:1.27-alpine AS runner
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/docker-entrypoint.d/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh
EXPOSE 4173
CMD ["nginx", "-g", "daemon off;"]
