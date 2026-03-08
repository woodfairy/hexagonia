FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY apps/web ./apps/web
COPY assets ./assets
COPY packages/shared ./packages/shared
RUN npm install
RUN npm run build -w @hexagonia/shared
RUN npm run build -w @hexagonia/web

FROM --platform=$TARGETPLATFORM nginx:1.27-alpine AS runner
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/docker-entrypoint.d/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh
EXPOSE 4173
CMD ["nginx", "-g", "daemon off;"]
