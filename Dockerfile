FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY client client
COPY server server
COPY shared shared
RUN pnpm install --frozen-lockfile

RUN pnpm --filter @spark/shared build \
  && pnpm --filter @spark/client build \
  && pnpm --filter @spark/server build

FROM build AS pruned
RUN pnpm --filter @spark/server --prod deploy --legacy /app/pruned

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=pruned /app/pruned /app/server
COPY --from=build /app/client/dist /app/client/dist
EXPOSE 8080
CMD ["node", "server/dist/index.js"]
