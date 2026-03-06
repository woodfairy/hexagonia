FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY apps/server ./apps/server
COPY packages/shared ./packages/shared
COPY packages/rules ./packages/rules
RUN npm install
RUN npm run build -w @hexagonia/server

FROM node:22-alpine AS runner
WORKDIR /app
COPY --from=builder /app/package.json /app/tsconfig.base.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/rules/dist ./packages/rules/dist
COPY --from=builder /app/packages/rules/package.json ./packages/rules/package.json
EXPOSE 3000
CMD ["node", "apps/server/dist/index.js"]
