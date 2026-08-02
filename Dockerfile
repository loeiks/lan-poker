FROM oven/bun:1 AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

RUN bun run build

RUN bun build \
  --target bun \
  --outdir /app/server-dist \
  src/server/main.ts

FROM oven/bun:1-alpine AS prod

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/dist ./dist
COPY --from=build /app/server-dist ./server-dist

RUN mkdir -p /app/data

ENV DB_FILENAME=/app/data/table.sqlite
EXPOSE 1818

CMD ["bun", "run", "server-dist/main.js"]
