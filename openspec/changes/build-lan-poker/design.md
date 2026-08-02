## Context

Greenfield. The repository currently holds only documentation (`README.md`,
`POKER.md`, `DECISIONS.md`), a `tsconfig.json`, and a `package.json` with
`effect`, `shadcn`, and the Effect language service.

The constraints that actually shape this design come from the deployment
reality rather than from scale:

- **One table, one process, one container.** No multi-tenancy, no horizontal
  scaling, no more than ~10 concurrent clients ever.
- **LAN-local.** Latency is effectively zero and there is no internet. Any
  design effort spent on latency compensation, optimistic UI, or conflict
  resolution is wasted effort here.
- **Phones that lock constantly.** Disconnection is the normal state of a
  client, not an error path.
- **Setup by one non-expert in five minutes.** `docker run` with a few
  optional environment variables, and nothing else.
- **The rules will be tweaked.** Credit formulas, the raise stepper, and the
  cooldown are house rules that this group will want to adjust. The code must
  make those changes cheap and safe, which is why TDD is a requirement rather
  than a preference.

See `proposal.md` for motivation and `DECISIONS.md` for the product rationale
behind the rules themselves.

## Goals / Non-Goals

**Goals:**

- A single deterministic, server-authoritative state machine that is the only
  thing allowed to decide what is true.
- Game rules — pot construction, hand evaluation, credit math, betting legality
  — testable without a database, a socket, or a browser.
- Correct-by-construction chip conservation: chips can only move, never appear
  or vanish, outside of explicitly modelled credit and admin adjustment events.
- Recovery from any interruption (process restart, reconnect, reload) through
  one code path.
- A phone that wakes up is playable immediately.

**Non-Goals:**

- Multiple tables, lobbies, or tenancy.
- Authentication, authorization beyond the admin name check, or defence against
  a hostile client. The threat model is typos, not attackers.
- Optimistic UI, client-side prediction, or CRDTs.
- Dealing, shuffling, or randomness of any kind in gameplay — the physical deck
  is the source of cards. The only randomness is the initial dealer button.
- Real undo. Admin balance adjustment is the recovery mechanism for v1.

## Decisions

### D1: Effect v4 beta, not v3 stable

**Decision:** target `effect@4.0.0-beta`, with `@effect/sql-sqlite-bun`,
`@effect/vitest`, and `@effect/platform-bun` on matching beta tags.

`CLAUDE.md` mandates consulting `effect-solutions` before writing Effect code,
and every guide there teaches v4-only APIs — `Context.Service`,
`Schema.TaggedErrorClass`, `effect/unstable/*` import paths. Staying on the
installed v3.22.1 would mean the project's own mandated guidance actively
contradicts its code on every service and every error type.

_Alternative considered:_ v3 stable. Rejected because the guidance conflict is
permanent and touches every file, whereas beta churn is a bounded, mechanical
upgrade cost on a project with no external consumers.

**Consequence:** `effect` in `package.json` moves from `^3.22.1` to the beta
tag, pinned exactly (not a caret range) so a `bun install` cannot silently move
us between betas mid-build.

### D2: Plain functions in the rules core, Effect at the boundaries

**Revised during implementation.** This decision originally read "Effect
throughout, including the rules core". It was reversed after writing groups 3-6,
and the code follows the revision.

**Decision:** game logic is plain pure TypeScript returning discriminated
results (`{ ok: true, ... } | { ok: false, error }`), with the tagged error
classes carried as data. Effect owns the boundaries — config, SQLite,
WebSocket, and the `Table` service — and lifts those results into its error
channel at exactly one place.

Why the reversal:

- Nothing in `rules/` performs I/O, so wrapping it in `Effect` bought only
  ceremony. Every rules test would have needed a runtime to assert
  `buildPots(x) === y`.
- The typed-error benefit is preserved anyway: the errors are the same
  `Schema.TaggedErrorClass` values, just returned rather than failed. The
  service layer converts once, so the socket boundary still has a single way to
  turn a rejection into a player-facing message.
- The property tests in `tests/rules/pots.invariants.test.ts` run 2,000
  generated scenarios through several functions each; keeping that loop free of
  runtime overhead matters for the TDD cadence the house rules demand (D8).

**Project ruling (user, after review):** Effect is the default everywhere.
Avoid it only where there is a real, stated reason. `rules/` is that narrow
exception — pure computation, no I/O, and a hot property-test loop — and it is
**not** a precedent. Everything from group 7 onward (`State fold`,
`EventStore`, `Config`, `Table`, `Broadcast`, the server) is written in Effect:
`Context.Service` + `Layer`, tagged errors in the error channel, `Effect.fn`
for traced methods.

Nothing above `rules/` depends on how it computes, so it could be moved back
under Effect in isolation if the boundary conversion ever becomes awkward.

```
src/
  domain/          Schema types, branded ids, tagged errors
  rules/           pure game logic, plain TS, zero services
    pots.ts        buildPots, returnUncalled, awardPots, splitPot
    evaluate.ts    adapter over pokersolver
    betting.ts     legalActions, applyAction, isRoundClosed
    cards.ts       board/hole entry, duplicate detection
    credit.ts      burnoutAmount, lossBonus, standings
    positions.ts   blinds, actionOrder, headsUp, rotation
  state/           the event fold, in Effect
    fold.ts        applyEvent, foldEvents -- the only way a TableState is built
    snapshot.ts    buildSnapshot -- pure, per-recipient (design.md D6)
  services/        Effect services + layers
    AppConfig.ts   env → TableConfig (id supplied separately by EventStore)
    EventStore.ts  append + read, SQLite
    Table.ts       orchestration, holds current state
    Broadcast.ts   connected clients, snapshot fan-out
  server/          Bun.serve, WS upgrade, TanStack Start handler
  routes/          TanStack Router file routes
  ui/              React components, shadcn
tests/
  rules/           the bulk of the suite
  services/        it.effect with test layers
```

`rules/` imports no services at all, so its tests need no layer wiring.

### D3: Event-sourced state, rebuilt by fold

**Decision:** the SQLite database stores an append-only event log. Current table
state is a left fold over that log, held in memory and recomputed from disk on
startup.

This is not a scale decision — it is a correctness and recoverability one:

- Restart mid-hand is a replay, which makes the spec requirement "resume in
  exactly the state it was in" fall out for free rather than needing careful
  serialization of a mutable object graph.
- Credit formulas need per-hand spend history regardless, so the history has to
  exist anyway. Deriving state from it means there is one representation, not
  two that can disagree.
- "How much did I actually bet?" becomes answerable, which is the argument the
  app exists to end.
- Admin balance adjustment becomes an ordinary event rather than a destructive
  edit.

At this scale a full replay is microseconds; there is no snapshotting.

_Alternative considered:_ storing mutable current state in rows and updating in
place. Simpler to query, but it makes mid-hand restart genuinely hard and forces
a separate spend-history table that can drift from the balances.

**Ordering:** every event carries a monotonic `seq`, assigned by the database.
`seq` doubles as the state version used for stale-action rejection.

```sql
events (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  hand_id    TEXT,          -- null for table-level events
  type       TEXT NOT NULL,
  payload    TEXT NOT NULL, -- JSON, Schema-encoded
  created_at INTEGER NOT NULL
)
players (
  name       TEXT PRIMARY KEY,   -- normalized, the identity
  created_at INTEGER NOT NULL
)
table_meta (
  id         TEXT PRIMARY KEY,   -- table uuid, survives restarts
  created_at INTEGER NOT NULL
)
```

Balances, credit totals, and spend history are **not** columns. They are folds.
`players` exists only to make identity reclaim a lookup, and `table_meta` only
to keep the table UUID stable across restarts.

### D4: Contribution map as the single source of pot truth

**Decision:** no `pot` field exists anywhere. The hand tracks
`Map<PlayerName, Contribution>` and every pot figure — the displayed total, the
main pot, each side pot — is derived from it.

A stored pot total is a second representation of the same fact and will
eventually disagree with the contributions. Deriving it makes the chip
conservation invariant checkable at every step, and it makes side pots a pure
function rather than a special case bolted onto a running total:

```
buildPots(contributions, activePlayers) -> Pot[]

  1. collect distinct contribution levels, ascending
  2. for each level, take (level - previousLevel) from every player
     who contributed at least that much
  3. eligible = active players who reached that level
  4. drop layers with zero amount
```

Folded players contribute to the amounts, never to `eligible`. That single
distinction is what makes the whole thing correct.

The invariant `Σ pots + returned == Σ contributions` is asserted in tests for
every generated scenario, and the invariant `Σ balances` is unchanged by any
hand is asserted at settlement.

### D5: One Bun process serving both HTTP and WebSocket

**Decision:** `Bun.serve` on port 1818 handles the WebSocket upgrade at `/ws`
and delegates every other request to the TanStack Start handler.

TanStack Start has no first-class WebSocket support, so this needs an explicit
host. A single process on a single port means one exposed port in Docker, no
proxy configuration, no CORS, and no second address for the admin to share.

```
Bun.serve({
  port: 1818,
  fetch(req, server) {
    if (new URL(req.url).pathname === "/ws") {
      return server.upgrade(req, { data: { playerName } })
        ? undefined
        : new Response(null, { status: 400 })
    }
    return startHandler(req)
  },
  websocket: { open, message, close }
})
```

_Alternatives considered:_ a separate WebSocket port (rejected — two ports for
the admin to expose and the client to discover); SSE plus POST (rejected — the
requirement specifies WebSocket, and SSE gives up bidirectionality).

**Effect integration:** the Bun handlers are thin. They decode the frame with
`Schema`, then run a single `Effect` against the application runtime built once
at startup, and encode the result back. No Effect code is written inline in a
socket callback.

### D6: Full snapshot on every connect, never a diff

**Decision:** connect, reconnect, and reload all deliver a complete
`TableSnapshot`. There is no delta protocol and no missed-message replay.

The snapshot is a few kilobytes for ten players on a LAN. A delta protocol would
buy nothing measurable and would introduce the one bug class that is genuinely
hard to debug here: a client that has silently diverged. Making the three paths
identical also means the wake-from-lock path is exercised constantly during
development rather than only in the field.

Broadcast after a mutation sends the same snapshot shape to every client. The
only per-client variation is hole cards: the snapshot is built per recipient,
with other players' hole cards omitted rather than sent-and-hidden. Hidden-in-
the-client secrets are not secrets, and the tap-to-reveal feature would
otherwise be trivially defeated by anyone opening devtools — a bar worth
clearing even under a trusting threat model.

### D7: Optimistic concurrency via `seq`

**Decision:** every client action carries the `seq` the client last rendered.
The server rejects any action whose `seq` is behind current, and responds with a
fresh snapshot.

This is the concrete mechanism behind the spec's stale-action rejection. It
directly addresses the realistic failure: a phone wakes showing state from two
actions ago and the owner taps the button under their thumb. Turn ownership
alone does not catch this, because it may still legitimately be their turn while
the bet they are responding to has changed.

Duplicate suppression rides on the same mechanism — a retried action carries a
`seq` that is no longer current, so the second application is rejected.

### D8: Rules changes must be cheap — TDD, inside-out

**Decision:** tests are written before implementation, and the suite is
weighted heavily toward `rules/`.

The house rules in `DECISIONS.md` are explicitly provisional: the credit
multiplier, the floor and ceiling, the 3-hand cooldown, and the raise stepper
are all numbers this group will want to tune after playing a few nights.

Every one of those lives in `rules/` behind a `TableConfig` parameter, is
covered by tests that state the rule as a scenario, and touches no I/O. Tuning a
rule should mean changing a number and a test, never tracing through a socket
handler.

Test layering:

- `tests/rules/` — `it.effect` with no layers. Covers every scenario in the
  `hand-lifecycle`, `pot-settlement`, `card-entry`, and `chip-economy` specs.
  Includes property tests for the two invariants in D4, run over randomly
  generated all-in configurations.
- `tests/services/` — `it.effect` with an in-memory `EventStore` layer
  substituted for SQLite. Covers persistence, replay, and orchestration.
- `tests/integration/` — a real SQLite file in a scoped temp directory, driven
  through `Table`. Covers restart-and-replay end to end.

Hand evaluation is validated against exhaustively enumerated known rankings
rather than hand-picked examples, since it is the one component where a subtle
comparison bug would be invisible until it silently awarded the wrong pot.

### D9: Configuration validated once, at startup

**Decision:** `Effect.Config` parses and validates the environment into a
`TableConfig` at startup. Invalid configuration fails the process with a message
naming the variable and the accepted values.

The admin is non-technical and is setting this up while friends wait. A
container that starts and then behaves strangely because `TABLE_MODE` was
misspelled is a worse outcome than one that refuses to start and says so.
`TableConfig` is then a plain value threaded into the rules layer, which is what
keeps `rules/` free of services.

### D10: Money as branded integers

**Decision:** all chip amounts are `Chips`, a branded non-negative integer.
There are no floating point chip values anywhere.

The odd-chip rule in `pot-settlement` exists precisely to keep every division
exact. Branding makes it impossible to accidentally pass a raw `number` — a
seat index, a player count, a `seq` — where an amount is expected, which is the
error that would otherwise silently corrupt balances.

**`bun run <script>` runs package.json scripts through the system shell, which
honors the `vitest` bin's `#!/usr/bin/env node` shebang** — so a plain `vitest
run` script silently executes under real Node, and `bun:sqlite` imports fail
with `Cannot find package 'bun:sqlite'` (or, under `pool: "threads"`, a Node
ESM-loader error) even though the whole project is meant to run on Bun. →
`package.json`'s `test` / `test:watch` scripts invoke `bun --bun x vitest`
instead of bare `vitest`, which forces Bun to execute the resolved binary
itself rather than deferring to the shebang; combined with `pool: "forks"` in
`vitest.config.ts` (workers are forked processes, inheriting the real Bun
runtime) this is what makes `@effect/sql-sqlite-bun` testable at all. Also add
`optimizeDeps.exclude: ["bun:sqlite"]` so Vite's dependency pre-bundler doesn't
try to touch the `bun:` import.

## Risks / Trade-offs

**Effect v4 is in beta.** → Pin the exact version rather than a range. The
cloned v4 repository at `~/.local/share/effect-solutions/effect` is the
reference when documentation is thin. The blast radius is confined to
`services/` and the error types; `rules/` uses only `Effect`, `Schema`, and
`Data`, which are the most settled parts of the API.

**Hand evaluation is delegated to `pokersolver`** rather than hand-rolled, per
the project preference for stable third-party solutions over in-house
equivalents. → The exhaustive frequency test points at our adapter, so the
library is verified against the known distribution of poker hands rather than
trusted. `src/rules/evaluate.ts` is a thin adapter, so swapping libraries later
touches one file.

**Side pots are the highest-risk logic in the system** — subtly wrong pot
splitting silently moves chips to the wrong player, and nobody will notice at
the table. → Property tests asserting chip conservation over randomly generated
all-in configurations, plus explicit cases for every scenario in the
`pot-settlement` spec. This is the component that justifies TDD most.

**Hand evaluation is easy to get almost right.** → Test against exhaustive
enumeration rather than examples; treat the seven-card best-five selection and
the kicker comparison as separately tested units.

**Bun + TanStack Start + Vite is a less-travelled combination**, and a Start
plugin may misbehave under Bun. → The custom `Bun.serve` entry point already
isolates us from Start's own server assumptions; Start is reduced to a request
handler. If it proves unworkable, the fallback is to serve the built client as
static assets from the same Bun process, which changes the routing story but
nothing in `rules/` or `services/`.

**Name-based identity allows accidental takeover** — two friends both typing
`ali` share a balance. → The spec requires a warning explaining the consequence
before takeover. This is deliberately a social problem with a social fix,
consistent with the trust model.

**No undo.** A misclick is unrecoverable without intervention. → Admin balance
adjustment is in v1 specifically as the universal escape hatch, and every
adjustment is broadcast so it cannot be done quietly.

**A full replay on every startup is O(all events ever).** Balances persist
indefinitely across nights, so the log grows without bound. → At this scale
(tens of hands per night, a handful of players) this stays imperceptible for
years. If it ever mattered, a periodic snapshot row is a contained addition that
changes nothing above `EventStore`.

### D11: Settlement is atomic, not per-pot

**Decision (added during group 10):** a hand settles in exactly one step.
When card data is sufficient, `Table` resolves every pot automatically. When
it is not, the admin's `declareWinners` call must name a winner for _every_
pot in the hand in one request; there is no API for declaring one side pot
now and the rest later.

The alternative -- letting the admin declare pots one at a time -- would mean
tracking, per hand, which pot indices have already been resolved. That
tracking would itself be state that has to survive a restart (D3's whole
argument), and nothing in the event log records it directly (`PotAwarded`
carries a `potIndex` but not a `handId`, so recovering "which pots are done"
after a crash mid-declaration would mean re-deriving it from a side channel).
Making settlement atomic removes the state instead of persisting it: a
declaration request is validated against the full set of pots before anything
is appended, so there is nothing partial to ever resume.

The UI can still _present_ pots one at a time and collect all the winners
before submitting a single combined request.

## Migration Plan

There is nothing to migrate — no existing users, data, or deployed instance.

Deployment is a single container:

```
docker run -p 1818:1818 -v ./data:/data \
  -e ADMIN_NAME=enes -e TABLE_MIN=10 lan-poker
```

The SQLite file lives on a mounted volume so balances survive container
replacement. Rollback is running the previous image against the same volume;
because the event log is append-only and events are versioned by `type`, an
older image reading a newer log fails loudly on unknown event types rather than
misinterpreting them.

`bun install` will move `effect` from `^3.22.1` to a pinned v4 beta as part of
the first task.
