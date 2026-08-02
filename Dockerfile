FROM oven/bun:1 AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM oven/bun:1 AS prod

WORKDIR /app

COPY --from=build /app/package.json /app/bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts

COPY --from=build /app/src ./src
COPY --from=build /app/dist ./dist
COPY --from=build /app/tsconfig.json ./

RUN mkdir -p /app/data

ENV DB_FILENAME=/app/data/table.sqlite
EXPOSE 1818

CMD ["bun", "run", "src/server/main.ts"]
