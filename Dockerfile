FROM oven/bun:1 AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

RUN bun run build

FROM oven/bun:1-alpine AS prod

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json /app/bun.lock ./
COPY --from=build /app/server.ts ./
COPY --from=build /app/src ./src
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/tsconfig.json ./tsconfig.json

RUN bun install --frozen-lockfile --production --ignore-scripts

RUN mkdir -p /app/db

ENV DB_FILENAME=/app/db/table.sqlite
ENV PORT=1818
EXPOSE 1818

CMD ["bun", "run", "server.ts"]
