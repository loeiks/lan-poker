# Development

## Prerequisites

- [Bun](https://bun.sh) >= 1.0

## Quick Start

```bash
bun run dev
```

Starts both the backend (Bun.serve on `:1818`) and frontend (Vite with HMR). Open the Vite URL (usually `http://localhost:5173`) in your browser. The dev DB goes to `$TMPDIR` so SQLite writes don't trigger backend reloads.

Run individually if needed:

```bash
bun run dev:server   # Backend only
bun run dev:client   # Frontend only
```

## Production (no Docker)

```bash
bun run build
bun run start
```

Static build served on port `1818` by Bun — single process for both WebSocket and static files, matching the Docker deployment.

## Scripts

| Script               | Description                                   |
| -------------------- | --------------------------------------------- |
| `bun run dev`        | Backend + frontend together (single terminal) |
| `bun run dev:server` | Backend only with hot reload                  |
| `bun run dev:client` | Vite dev server with HMR                      |
| `bun run build`      | Build client to `dist/`                       |
| `bun run start`      | Production server (static + WS)               |
| `bun run test`       | Run all tests                                 |
| `bun run test:watch` | Watch mode                                    |
| `bun run typecheck`  | TypeScript check                              |
| `bun run format`     | Format with Prettier                          |

## Architecture

- **Backend** — Effect (v4 beta), Bun.serve, WebSocket, SQLite (event-sourced)
- **Frontend** — React (Vite SPA), shadcn/ui, Tailwind CSS
- **Transport** — single WebSocket per client; full snapshot on every reconnect, no delta protocol
- **Persistence** — every action is an immutable event row; current state is a fold over the event log
