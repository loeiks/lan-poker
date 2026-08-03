# Development Notes

## Potential Improvements

- **Effect v4**: Pinned to beta `4.0.0-beta.102`. When v4 releases, upgrade to stable.
- **Server hot reload**: Dev server uses `bun --hot`. For production, consider a process manager.
- **Canvas Confetti**: Consider replacing with a lighter alternative or CSS-only confetti.
- **Pokersolver**: Hand evaluation is delegated to `pokersolver`. Exhaustive test validates against 2.6M combos.

## TanStack Ecosystem

- **No tRPC needed**: TanStack Start's `createServerFn` provides type-safe client-server contract natively.
- **No TanStack Query**: All state arrives via WebSocket. No HTTP data fetching.
- **No TanStack DB**: SQLite on server only via Drizzle + Effect EventStore.
- **No TanStack Store**: Single `useState<TableSnapshot>` in `useTable` hook suffices.
- **No TanStack Pacer**: No HTTP requests to rate-limit. Poker actions must be immediate.

## Docker

- **Migrations**: Drizzle migrations run at startup via `migrate()` in EventStore. `drizzle-kit migrate` requires better-sqlite3 (Node-native) — incompatible with Bun.
- **`--ignore-scripts`**: Required in prod stage to skip `effect-language-service patch` (dev-only).
