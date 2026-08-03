## 1. Dependencies

- [x] 1.1 Add `@tanstack/router-plugin@^1` and `@tanstack/react-router-devtools@^1` (devDependency) with `bun install`
- [x] 1.2 Existing `@tanstack/react-start` (`^1.168.34`) and `@tanstack/react-router` (`^1.170.18`) stay — already correct versions
- [x] 1.3 Add `drizzle-orm@^0`, `drizzle-kit@^0` (devDependency), `@biomejs/biome@^1` (devDependency) with `bun install`
- [x] 1.4 Remove `prettier` and `prettier-plugin-sort-imports` from devDependencies
- [x] 1.5 Run `bun run test` to confirm nothing breaks from the dep changes

## 2. Biome

- [x] 2.1 Create `biome.json` at project root with format + lint + organizeImports config
- [x] 2.2 Run `biome check --write .` to auto-fix the entire codebase
- [x] 2.3 Delete `.prettierrc.cjs`
- [x] 2.4 Update `package.json` scripts: `"format": "biome format --write ."`, `"lint": "biome lint ."`, `"check": "biome check --write ."`
- [x] 2.5 Recommend `.vscode/settings.json` with `biomejs.biome` as default formatter

## 3. Drizzle ORM

- [x] 3.1 Create `src/db/schema.ts` — typed schema definitions for `events`, `players`, `table_meta` tables
- [x] 3.2 Create `src/db/index.ts` — Drizzle client using `drizzle-orm/bun-sqlite`
- [x] 3.3 Create `drizzle.config.ts` with SQLite driver config pointing to `./data/table.sqlite`
- [x] 3.4 Generate initial migration: `bun drizzle-kit generate`
- [x] 3.5 Refactor `src/services/EventStore.ts` — replace raw SQL queries with Drizzle query builder, add `migrate()` on startup
- [x] 3.6 Run `bun run test` to confirm EventStore tests pass with Drizzle

## 4. TanStack Start configuration

- [x] 4.1 Update `vite.config.ts` — add `tanstackStart()` plugin from `@tanstack/react-start/plugin/vite` (after tailwind, before viteReact), replace alias with `tsconfigPaths: true`
- [x] 4.2 Create `src/router.tsx` with `getRouter()` function using `createRouter` + `routeTree`

## 5. Route files

- [x] 5.1 Create `src/routes/__root.tsx` — uses `createRootRoute`, holds player name state (localStorage), WS context via `useTable`, renders `<Outlet />`, `<HeadContent>`, `<Scripts>`
- [x] 5.2 Create `src/routes/index.tsx` — join screen route (`/`), uses `createFileRoute`, renders `<JoinScreen>`, navigates to `/play` on successful join
- [x] 5.3 Create `src/routes/play.tsx` — table view route (`/play`), uses `createFileRoute`, renders `<TableView>`, redirects to `/` if no player name

## 6. Production server

- [x] 6.1 Create `server.ts` at project root — imports `{ handler }` from `./dist/server/server.js`, initializes Effect runtime, runs `Bun.serve` on port 1818 with WS at `/ws` + `handler.fetch()` for everything else
- [x] 6.2 Port all WS open/message/close handlers from `src/server/main.ts` into `server.ts`
- [x] 6.3 Verify the WS protocol code in `src/server/Messages.ts` is unchanged and reusable as-is

## 7. Cleanup old files

- [x] 7.1 Delete `src/server/main.ts` (replaced by `server.ts`)
- [x] 7.2 Delete `src/ui/App.tsx` (replaced by route files)
- [x] 7.3 Remove or simplify `index.html` — TanStack Start's `__root.tsx` generates the HTML shell via `HeadContent`/`Scripts`

## 8. Scripts & build

- [x] 8.1 Update `package.json` scripts: `"dev": "vite dev --port 1818"`, `"build": "vite build"`, `"start": "bun run server.ts"`
- [x] 8.2 Update `Dockerfile` for new build output structure (`dist/client/` + `dist/server/server.js`)
- [x] 8.3 Verify `tsconfig.json` — Start recommends disabling `verbatimModuleSyntax`; if build errors surface, adjust

## 9. Verify

- [x] 9.1 Run `bun run build` and confirm clean output
- [ ] 9.2 Run `bun run dev` and confirm the app loads at localhost:1818 (requires port 1818 free — currently occupied by Docker)
- [ ] 9.3 Join as admin, start a hand, enter cards, play through to settlement — full end-to-end
- [ ] 9.4 Test browser back/forward between `/` and `/play`
- [ ] 9.5 Test direct URL access to `/play` with and without stored name
- [x] 9.6 Run `bun run test` and confirm all existing tests pass
