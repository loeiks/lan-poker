# Development Notes

## Potential Improvements

- **`verbatimModuleSyntax`**: TanStack Start docs recommend disabling this. Currently `true` in tsconfig.json. If build errors surface, set to `false`.
- **Effect v4**: Pinned to beta. When v4 releases, upgrade from `4.0.0-beta.102` to stable.
- **Server hot reload**: The dev server uses `bun --hot` for server.ts. For production, consider `bun --watch` or a process manager.
- **Drizzle migrations in Docker**: Drizzle migrations run on startup in EventStore. For production, consider running migrations as a build step instead.

## Potential Tech Swaps

- **Remixicon → Lucide**: Both are installed. Consolidate to one icon library to reduce bundle size.
- **Canvas Confetti**: Consider replacing with a lighter alternative or CSS-only confetti.
- **Pokersolver**: The hand evaluation is delegated to `pokersolver`. An exhaustive test validates it against 2.6M combos. 

## TanStack Ecosystem Notes

- **No tRPC needed**: TanStack Start's `createServerFn` provides the same type-safe client-server contract natively. Server functions are the Start-idiomatic approach.
- **No TanStack Query**: All state arrives via WebSocket. No HTTP data fetching to cache.
- **No TanStack DB**: SQLite runs on the server only via Drizzle + Effect EventStore. No client-side DB.
- **No TanStack Store**: Single `useState<TableSnapshot>` in `useTable` hook is sufficient.
- **No TanStack Pacer**: No HTTP requests to rate-limit. Poker actions must be immediate.
