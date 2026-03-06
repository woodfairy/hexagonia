FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared
RUN npm install
RUN npm run build -w @hexagonia/shared
RUN npm run build -w @hexagonia/web

FROM node:22-alpine AS runner
WORKDIR /app
COPY --from=builder /app/package.json /app/tsconfig.base.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/apps/web/vite.config.ts ./apps/web/vite.config.ts
EXPOSE 4173
CMD ["node", "./node_modules/vite/bin/vite.js", "preview", "--host", "0.0.0.0", "--port", "4173", "--strictPort"]
