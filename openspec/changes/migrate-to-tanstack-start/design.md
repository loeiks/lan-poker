## Context

The app currently uses a plain React SPA with a manual state switch in `App.tsx` — a `name` state variable flips between `<JoinScreen>` and `<TableView>`. The server is a standalone `Bun.serve` that handles both HTTP (static SPA serving) and WebSocket (game protocol) on port 1818. TanStack Router and TanStack Start are listed in `package.json` but never used.

Vite is the bundler and will remain so. The user wants to learn the TanStack ecosystem for future projects by migrating this small app to it.

## Goals / Non-Goals

**Goals:**
- File-based routing with TanStack Router (type-safe, URL-driven, back/forward works)
- TanStack Start as the project framework (Vite-based, server functions available)
- WebSocket server integrated into the TanStack Start process (single port, no separate server)
- All existing poker behavior unchanged — same Effect services, same event sourcing, same WS protocol
- Remove dead `@tanstack/react-router` and `@tanstack/react-start` deps, install correct versions

**Non-Goals:**
- SSR or SSG — the app is entirely client-rendered (no server-side rendering for game state)
- TanStack Query — not needed; state already comes through WebSocket
- Server functions for game logic — the WS protocol stays as-is
- Rsbuild or any bundler switch — Vite stays
- TanStack Start server in a separate process from WS — single process, single port

## Decisions

### D1: TanStack Start v1 with Vite bundler

**Decision:** Use `@tanstack/react-start` v1 (stable) with the Vite adapter. The project already uses Vite; TanStack Start's Vite support is first-class in v1.

TanStack pieces installed:
- `@tanstack/react-start` — framework (Vite plugin via `@tanstack/react-start/plugin/vite`)
- `@tanstack/react-router` — file-based routing, `createFileRoute`, `createRootRoute`
- `@tanstack/router-plugin` — auto-generates `routeTree.gen.ts` (also configures route paths automatically)
- `@tanstack/react-router-devtools` — route tree visualization, nav history debugging (dev only, tree-shaken in prod)

TanStack pieces explicitly NOT needed, with rationale:

| Library | Reason not needed |
|---------|-------------------|
| Query | Game state arrives via WebSocket (`useTable` hook). Zero HTTP data fetching. No caching layer to manage. |
| DB | Client-side IndexedDB wrapper. SQLite runs on server only via Effect `EventStore`. No client-side storage beyond localStorage for player name. |
| Store | Reactive state management. Current single `useState<TableSnapshot>` in the `useTable` hook is sufficient — one state object, no derived stores, no cross-component subscriptions that React context doesn't already solve. |
| Pacer | Request rate limiting / throttling / debouncing. The app has no outgoing HTTP requests to rate-limit. Poker actions are intentional and must be immediate — debouncing a "fold" or "raise" would be incorrect. |

The Start scaffold includes `@tanstack/react-start` and `@tanstack/react-router` as its core pair. `@tanstack/router-plugin` generates the route tree and `@tanstack/react-router-devtools` provides dev ergonomics.

### D2: Two-server architecture — Vite dev, custom Bun production

**Decision:** In development, Vite's dev server handles everything (HMR, static, routing) and proxies `/ws` to a WebSocket server. In production, a custom `server.ts` wraps Bun's `Bun.serve` with WebSocket handling and delegates HTTP to the built TanStack Start handler.

**Development:** `vite dev` runs the TanStack Start Vite plugin, which handles:
- Route tree generation (`routeTree.gen.ts`)
- HMR for React components
- Static asset serving
- Dev server on the configured port

The existing Vite proxy config forwards `/ws` to the WebSocket-aware Bun server (same as current setup).

**Production:** After `vite build`, the output is:
- `dist/client/` — static client assets
- `dist/server/server.js` — server bundle exporting `{ default: { fetch: (req: Request) => Response } }`

A custom `server.ts` file (at project root) imports the built handler and wraps it:

```typescript
// server.ts — production entry
import { handler } from "./dist/server/server.js";

// Initialize Effect runtime and layer stack (same as current src/server/main.ts)
const runtime = ManagedRuntime.make(AppLayer);

Bun.serve({
  port: 1818,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      // WebSocket upgrade — unchanged from current
      const player = playerNameFromRequest(req);
      if (!player) return new Response("missing ?name=", { status: 400 });
      return server.upgrade(req, { data: { player, connectionId: undefined } })
        ? undefined
        : new Response(null, { status: 400 });
    }
    // Delegate to TanStack Start handler (serves static assets + SSR routes)
    return handler.fetch(req);
  },
  websocket: { open, message, close } // unchanged
});
```

This is the exact pattern from TanStack's official [start-bun example](https://github.com/TanStack/router/tree/main/examples/react/start-bun), with WebSocket added alongside the handler.

_Alternative considered:_ Running WS on a separate port. Rejected — single port for the admin to expose on Docker.

_Alternative considered:_ Using TanStack Start server functions for game logic. Rejected — the Effect service layer and WS protocol are already proven; moving game logic into server functions would be a rewrite, not a migration.

### D3: File-based route structure

**Decision:** Replace `App.tsx` state switch with TanStack Router file-based routes under `src/routes/`.

```
src/routes/
  __root.tsx      Root layout: player name state + WS context provider
  index.tsx       Join screen (/)
  play.tsx        Table view (/play)
```

Route tree:
```
__root (layout: manages playerName state, provides WS context)
├── /      → JoinScreen
└── /play  → TableView (protected: redirects to / if no name)
```

`__root.tsx` holds the `playerName` state (from localStorage, like the current `App.tsx`) and provides it via context. The root layout stays mounted across route changes, so the WebSocket connection (`useTable` hook) persists.

### D4: WebSocket context in root layout

**Decision:** Move the `useTable` hook call from `App.tsx` into `__root.tsx` alongside the player name state. The WS connection lifecycle is tied to the root layout mount/unmount, which persists across route changes.

```typescript
// __root.tsx — conceptual outline
function RootLayout() {
  const [name, setName] = useState<string | undefined>(storedName);
  const table = useTable(name);
  
  // Provide via context for child routes
  return <Outlet />;
}
```

The `TableView` component no longer receives `onLeave` as a prop. Instead, `leave` is called via route navigation: navigating back to `/` calls `table.leave()` in the root layout's leave-handling effect.

### D5: Dependencies

**Decision:** The existing `@tanstack/react-start` (`^1.168.34`) and `@tanstack/react-router` (`^1.170.18`) in `package.json` are already at the correct versions for v1. They just aren't configured. Add the two missing packages:

```
@tanstack/router-plugin@^1         (route tree generation)
@tanstack/react-router-devtools@^1  (dev tools, devDependency)
```

The existing `@tanstack/react-start` and `@tanstack/react-router` stay — they're already at the versions used in the official start-bun example.

### D6: vite.config.ts

**Decision:** Update the existing `vite.config.ts` to use the `tanstackStart()` plugin from `@tanstack/react-start/plugin/vite`. The plugin goes after Tailwind but before `viteReact()`. Use `tsconfigPaths: true` for path resolution instead of a manual alias.

TanStack Start does NOT have an `app.config.ts` — everything goes through `vite.config.ts`.

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
  server: {
    proxy: {
      "/ws": {
        target: "ws://localhost:1818",
        ws: true,
      },
    },
  },
});
```

The proxy config stays for development — same as today. `tsconfigPaths: true` replaces the manual `~` → `./src` alias since tsconfig.json already defines it.

### D7: Production server entry (`server.ts`)

**Decision:** Create `server.ts` at project root as the production entry point. It:
1. Initializes the Effect runtime and layer stack (ported from `src/server/main.ts`)
2. Imports the built handler from `./dist/server/server.js`
3. Creates `Bun.serve` with WebSocket handling + TanStack Start handler

TanStack Start's build outputs `dist/server/server.js` which exports `{ default: { fetch: (req: Request) => Response | Promise<Response> } }`. The `fetch` method handles static assets (from `dist/client/`) and SSR routing.

```typescript
// server.ts
import { handler } from "./dist/server/server.js";

// ... Effect runtime init (same as current src/server/main.ts) ...

Bun.serve({
  port: 1818,
  fetch(req, server) {
    if (new URL(req.url).pathname === "/ws") { /* WS upgrade */ }
    return handler.fetch(req);
  },
  websocket: { open, message, close } /* unchanged */
});
```

The `server.ts` is only used in production (`bun run server.ts`). In development, `vite dev` handles everything.

### D8: Build scripts

**Decision:** Use standard Vite commands for dev and build. A custom `server.ts` for production.

```
"scripts": {
  "dev": "vite dev --port 1818",
  "build": "vite build",
  "start": "bun run server.ts"
}
```

- `bun run dev` — Vite dev server with HMR, WS proxy to Bun.serve on port 1818
- `bun run build` — TanStack Start build producing `dist/client/` + `dist/server/server.js`
- `bun run start` — Production server via `server.ts` (same as current but handler is now TanStack Start)

_Alternative considered:_ `tsx ./app/server.ts` pattern from my earlier draft. Rejected — TanStack Start builds with standard Vite CLI. No special CLI needed.

### D9: Drizzle ORM for typed database layer

**Decision:** Replace raw SQL strings in `EventStore` with Drizzle ORM. Drizzle defines the 3 tables as typed schemas, generates migrations via Drizzle Kit, and provides a type-safe query builder. Effect services wrap Drizzle's synchronous Bun SQLite calls in `Effect.sync` or `Effect.tryPromise`.

**Schema** (`src/db/schema.ts`):

```typescript
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const events = sqliteTable("events", {
  seq: integer("seq").primaryKey({ autoIncrement: true }),
  handId: text("hand_id"),
  type: text("type").notNull(),
  payload: text("payload").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const players = sqliteTable("players", {
  name: text("name").primaryKey(),
  createdAt: integer("created_at").notNull(),
});

export const tableMeta = sqliteTable("table_meta", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at").notNull(),
});
```

**EventStore** refactored to use Drizzle's query builder instead of raw SQL:

```typescript
// Old:  sql`INSERT INTO events (...) VALUES (${handId}, ${event._tag}, ${payload}, ${at}) RETURNING seq`
// New:  db.insert(events).values({ handId, type: event._tag, payload, createdAt: at }).returning({ seq: events.seq })
```

The `Schema.encode` / `Schema.decode` for event payloads stays unchanged — Drizzle only replaces the query layer, not the data format.

**Migrations:** Drizzle Kit (`drizzle-kit`) generates SQL migration files from schema changes. Migrations are applied on startup:

```typescript
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
migrate(db, { migrationsFolder: "./drizzle" });
```

This replaces the current `CREATE TABLE IF NOT EXISTS` pattern, which is fragile for schema changes (no versioning, no rollback).

_Alternative considered:_ Keep Effect SqlClient for queries, use Drizzle only for schema definition. Rejected — mixing two query layers on the same database is confusing. Full Drizzle adoption is cleaner.

**Effect integration:** Drizzle's Bun SQLite driver is synchronous. Wrapping in Effect:

```typescript
const dbEffect = Effect.sync(() => db.select().from(events).all());
```

This is minimal overhead — no async bridge needed since Bun SQLite is synchronous.

### D10: Biome replacing Prettier

**Decision:** Replace Prettier with Biome. Biome handles formatting, linting, and import organization in a single tool. It's significantly faster than Prettier (Rust vs JS) and reduces config files.

**Install:** `bun add -D @biomejs/biome`

**Config** (`biome.json` at project root):

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "formatter": {
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 80
  },
  "linter": {
    "rules": {
      "recommended": true
    }
  },
  "organizeImports": {
    "enabled": true
  }
}
```

**Scripts:**

```
"format": "biome format --write .",
"lint": "biome lint .",
"check": "biome check --write ."
```

**VSCode:** Install the `biomejs.biome` extension. It replaces both Prettier and ESLint extensions — format on save, lint on type, organize imports on save. Set as default formatter:

```json
// .vscode/settings.json (recommend to team)
{
  "editor.defaultFormatter": "biomejs.biome",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "quickfix.biome": "explicit",
    "source.organizeImports.biome": "explicit"
  }
}
```

_Alternative considered:_ ESLint + Prettier (current). Rejected — two tools, slow, two config files. Biome gives the same features in one Rust binary.

**Migration:** After installing Biome, run `biome check --write .` once to auto-fix the entire codebase. Delete `.prettierrc.cjs`. Remove `prettier` and `prettier-plugin-sort-imports` from devDependencies.

## Risks / Trade-offs

**[Risk] TanStack Start v1 with Bun compatibility.** → The official start-bun example at `TanStack/router/examples/react/start-bun` confirms Bun is fully supported. `react@19` is required for Bun deployment (project already uses React 19).

**[Risk] `verbatimModuleSyntax: true` in tsconfig.json.** → TanStack Start docs warn this can cause server bundles to leak into client bundles. When the route tree generates, this may surface as build errors. Mitigation: if issues arise, disable `verbatimModuleSyntax`; the `tsconfig.json` will be updated per the Start scaffolding template.

**[Risk] Missing `src/router.tsx` with `getRouter()` function.** → TanStack Start requires this file alongside `src/routes/`. It creates the router instance used by the framework. Must be created as part of the migration.

**[Risk] WebSocket + TanStack Start handler in same fetch() may have subtle ordering issues.** → The current code already does this (`Bun.serve` with path-based dispatch). The only change is that the fallback handler becomes `handler.fetch()` from the built bundle instead of `serveStatic`.

**[Risk] Drizzle's Bun SQLite driver is synchronous — Effect prefers async.** → Mitigation: wrap in `Effect.sync` since `bun:sqlite` operations are synchronous and don't block the event loop (Bun uses a thread pool for I/O). The existing Effect SqlClient also wraps synchronous `bun:sqlite` under the hood.

**[Risk] Biome may flag existing code patterns.** → Run `biome check --write` once after install. Most rules are auto-fixable. Any unfixable warnings can be suppressed via `// biome-ignore` comments or disabled in `biome.json`.

**[Trade-off] No SSR or server functions used.** → TanStack Start is adopted for its routing and project structure, not for SSR. This is intentional — the app has no content to pre-render and game state is real-time WS. The framework is used as a Vite-based React app shell with typed routing, which is a valid subset of TanStack Start.

## Migration Plan

1. Install deps: TanStack Start plugins, Drizzle + Drizzle Kit, Biome
2. Set up Biome: create `biome.json`, run `biome check --write .`, delete `.prettierrc.cjs`, update `package.json` scripts
3. Set up Drizzle: create `src/db/schema.ts`, `drizzle.config.ts`, generate initial migration
4. Update `vite.config.ts` with `tanstackStart()` plugin from `@tanstack/react-start/plugin/vite`
5. Create `src/router.tsx` with `getRouter()` function
6. Create `src/routes/__root.tsx`, `index.tsx`, `play.tsx`
7. Move `src/ui/App.tsx` logic into routes; delete `src/ui/App.tsx`
8. Refactor `src/services/EventStore.ts` — raw SQL → Drizzle queries
9. Create `server.ts` at project root with Effect runtime + Bun.serve + WS + handler
10. Update `package.json` scripts (`vite dev`, `vite build`, `bun run server.ts`, format/lint scripts)
11. Update `Dockerfile` for new build output structure (`dist/`)
12. Remove `src/server/main.ts` (replaced by `server.ts`)
13. Verify: `bun run dev`, connect from phone, play a hand end-to-end, all tests pass
