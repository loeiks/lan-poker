FROM oven/bun:1 AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build
RUN bun build server.ts --outfile server-bundle.js --target bun

FROM oven/bun:1-alpine AS prod

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/server-bundle.js ./
COPY --from=build /app/dist/client ./dist/client
COPY --from=build /app/drizzle ./drizzle

RUN mkdir -p /app/db

ENV DB_FILENAME=/app/db/table.sqlite
ENV PORT=1818
EXPOSE 1818

CMD ["bun", "run", "server-bundle.js"]
