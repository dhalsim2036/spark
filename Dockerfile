FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY client client
COPY server server
COPY shared shared
ARG DATABASE_URL="postgresql://spark:spark_build_only@localhost:5432/spark?schema=public"
ENV DATABASE_URL=$DATABASE_URL
RUN pnpm install --frozen-lockfile

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
