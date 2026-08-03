## Why

The app currently uses a manual state switch (`App.tsx` flips between `<JoinScreen>` and `<TableView>`) with no URL routing, no browser navigation, and a standalone Bun.serve layered on top. TanStack Start gives us type-safe file-based routing, server functions, and a unified server/frontend process — reducing the custom infrastructure while learning the framework ecosystem for future projects.

## What Changes

- **Replace** the manual `App.tsx` state switch with TanStack Router file-based routes (`/`, `/play`)
- **Replace** standalone `Bun.serve` in `src/server/main.ts` with TanStack Start's Vite dev server + a custom `server.ts` wrapping its production handler
- **Keep** WebSocket in `Bun.serve` alongside the TanStack Start handler — single process, single port, same protocol
- **Replace** raw SQL strings in `EventStore` with Drizzle ORM — typed schemas, query builder, and auto-generated migrations
- **Replace** Prettier with Biome for formatting and linting — faster, fewer config files
- **Keep** Vite as bundler, all existing Effect-TS services, event sourcing, and poker rules unchanged

## Capabilities

### New Capabilities

- `tanstack-routing`: URL-driven navigation with TanStack Router replacing the manual state switch. Routes are file-based, type-safe, with layout support. Browser back/forward works. URL sharing works for `/play` (table view).

### Modified Capabilities

None. All existing poker behavior is unchanged. Drizzle replaces the SQL strings inside EventStore but the event sourcing model and API are identical. WebSocket protocol stays identical.

## Impact

- `src/ui/App.tsx` — removed, replaced by route tree and layout components
- `src/server/main.ts` — replaced by `server.ts` at project root
- `src/ui/screens/` — referenced by route page components
- `src/services/EventStore.ts` — raw SQL replaced with Drizzle queries
- `src/db/schema.ts` — new: Drizzle table definitions
- `src/db/index.ts` — new: Drizzle client initialization
- `drizzle/` — new: migration files
- `.prettierrc.cjs` — removed, replaced by `biome.json`
- `package.json` — updated deps, scripts, formatting config
