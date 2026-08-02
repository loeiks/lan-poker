import * as SqliteClient from "@effect/sql-sqlite-bun/SqliteClient";
import { Clock, Context, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import type { SqlError } from "effect/unstable/sql/SqlError";

import * as E from "~/domain/Events";
import type { PlayerName, TableId } from "~/domain/Ids";

// The only thing in the system that touches SQLite; everything else is
// folded from what this hands back. `players` and `table_meta` share the
// database because identity/table-id must be known before the first event
// referencing them is written.

const TableEventFromJson = Schema.fromJsonString(E.TableEvent);

export interface EventStoreService {
  /** Append one event, returning the `seq` and timestamp the store assigned. */
  readonly append: (
    event: E.TableEvent,
  ) => Effect.Effect<E.StoredEvent, SqlError | Schema.SchemaError>;
  /** The whole log, in `seq` order. Decoding an unknown event type fails rather than skipping it. */
  readonly readAll: Effect.Effect<
    ReadonlyArray<E.StoredEvent>,
    SqlError | Schema.SchemaError
  >;
  /** The table's stable id, generated and persisted on first use. */
  readonly tableId: Effect.Effect<TableId, SqlError>;
  /** Register a name as a known identity. `created` is false on reclaim. */
  readonly ensurePlayer: (
    name: PlayerName,
  ) => Effect.Effect<{ readonly created: boolean }, SqlError>;
}

export class EventStore extends Context.Service<
  EventStore,
  EventStoreService
>()("@lan-poker/EventStore") {
  static readonly layer = (config: SqliteClient.SqliteClientConfig) =>
    Layer.effect(EventStore, make).pipe(
      Layer.provide(SqliteClient.layer(config)),
    );

  static readonly memoryLayer = Layer.sync(EventStore, () => makeMemory());
}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS events (
      seq        INTEGER PRIMARY KEY AUTOINCREMENT,
      hand_id    TEXT,
      type       TEXT NOT NULL,
      payload    TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS players (
      name       TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS table_meta (
      id         TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL
    )
  `;

  const append = Effect.fn("EventStore.append")(function* (
    event: E.TableEvent,
  ) {
    const payload = yield* Schema.encodeEffect(TableEventFromJson)(event);
    const handId = "handId" in event ? event.handId : null;
    const at = yield* Clock.currentTimeMillis;
    const rows = yield* sql<{ seq: number }>`
      INSERT INTO events (hand_id, type, payload, created_at)
      VALUES (${handId}, ${event._tag}, ${payload}, ${at})
      RETURNING seq
    `;
    return { seq: rows[0]!.seq, event, at };
  });

  const readAll = Effect.gen(function* () {
    const rows = yield* sql<{
      seq: number;
      payload: string;
      created_at: number;
    }>`SELECT seq, payload, created_at FROM events ORDER BY seq ASC`;
    return yield* Effect.forEach(rows, (row) =>
      Effect.map(
        Schema.decodeUnknownEffect(TableEventFromJson)(row.payload),
        (event): E.StoredEvent => ({
          seq: row.seq,
          event,
          at: row.created_at,
        }),
      ),
    );
  }).pipe(Effect.withSpan("EventStore.readAll"));

  const tableId = Effect.gen(function* () {
    const existing = yield* sql<{
      id: string;
    }>`SELECT id FROM table_meta LIMIT 1`;
    const found = existing[0];
    if (found !== undefined) return found.id as TableId;

    const id = crypto.randomUUID() as TableId;
    const at = yield* Clock.currentTimeMillis;
    yield* sql`INSERT INTO table_meta (id, created_at) VALUES (${id}, ${at})`;
    return id;
  }).pipe(Effect.withSpan("EventStore.tableId"));

  const ensurePlayer = Effect.fn("EventStore.ensurePlayer")(function* (
    name: PlayerName,
  ) {
    const existing = yield* sql<{ name: string }>`
      SELECT name FROM players WHERE name = ${name}
    `;
    if (existing.length > 0) return { created: false };

    const at = yield* Clock.currentTimeMillis;
    yield* sql`INSERT INTO players (name, created_at) VALUES (${name}, ${at})`;
    return { created: true };
  });

  return { append, readAll, tableId, ensurePlayer };
});

const makeMemory = (): EventStoreService => {
  const events: Array<E.StoredEvent> = [];
  const players = new Set<PlayerName>();
  let seq = 0;
  let id: TableId | undefined;

  const append = (event: E.TableEvent) =>
    Effect.sync(() => {
      seq += 1;
      const stored: E.StoredEvent = { seq, event, at: seq };
      events.push(stored);
      return stored;
    });

  const readAll = Effect.sync(() => [...events]);

  const tableId = Effect.sync(() => {
    if (id === undefined) id = crypto.randomUUID() as TableId;
    return id;
  });

  const ensurePlayer = (name: PlayerName) =>
    Effect.sync(() => {
      if (players.has(name)) return { created: false };
      players.add(name);
      return { created: true };
    });

  return { append, readAll, tableId, ensurePlayer };
};
