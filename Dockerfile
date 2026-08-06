FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY shared/package.json shared/package.json
RUN pnpm install --frozen-lockfile

COPY client client
COPY server server
COPY shared shared
RUN pnpm --filter @spark/shared build \
  && pnpm --filter @spark/client build \
  && pnpm --filter @spark/server build \
  && pnpm --filter @spark/server prisma:generate

FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=build /app /app
EXPOSE 8080
CMD ["pnpm", "--filter", "@spark/server", "start"]
