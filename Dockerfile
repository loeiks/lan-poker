FROM oven/bun:1-alpine AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build
RUN bun build server.ts --compile --minify --outfile lan-poker

FROM alpine:3 AS prod

WORKDIR /app

RUN apk add --no-cache libstdc++ libgcc

ENV NODE_ENV=production
ENV DB_FILENAME=/app/db/table.sqlite
ENV PORT=1818

COPY --from=build /app/lan-poker ./lan-poker
COPY --from=build /app/dist/client ./dist/client
COPY --from=build /app/drizzle ./drizzle

RUN mkdir -p /app/db

EXPOSE 1818

CMD ["./lan-poker"]
