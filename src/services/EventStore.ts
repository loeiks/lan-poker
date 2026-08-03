import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { Clock, Context, Effect, Layer, Schema } from "effect";

import * as schema from "~/db/schema";
import * as E from "~/domain/Events";
import type { PlayerName, TableId } from "~/domain/Ids";

const TableEventFromJson = Schema.fromJsonString(E.TableEvent);

export interface EventStoreService {
  readonly append: (
    event: E.TableEvent,
  ) => Effect.Effect<E.StoredEvent, Schema.SchemaError>;
  readonly readAll: Effect.Effect<
    ReadonlyArray<E.StoredEvent>,
    Schema.SchemaError
  >;
  readonly tableId: Effect.Effect<TableId>;
  readonly ensurePlayer: (
    name: PlayerName,
  ) => Effect.Effect<{ readonly created: boolean }>;
  readonly wipe: Effect.Effect<void>;
}

export class EventStore extends Context.Service<
  EventStore,
  EventStoreService
>()("@lan-poker/EventStore") {
  static readonly layer = (config: { readonly filename: string }) =>
    Layer.effect(EventStore, make(config.filename));

  static readonly memoryLayer = Layer.sync(EventStore, () => makeMemory());
}

const makeDb = (filename: string) => {
  mkdirSync(dirname(filename), { recursive: true });
  const sqlite = new Database(filename);
  sqlite.exec("PRAGMA journal_mode=WAL");
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
};

const make = (filename: string) =>
  Effect.sync(() => {
    const { db, sqlite } = makeDb(filename);
    migrate(db, { migrationsFolder: "./drizzle" });
    const appendStmt = sqlite.prepare(
      "INSERT INTO events (hand_id, type, payload, created_at) VALUES (?1, ?2, ?3, ?4) RETURNING seq",
    );

    const append = Effect.fn("EventStore.append")(function* (
      event: E.TableEvent,
    ) {
      const payload = yield* Schema.encodeEffect(TableEventFromJson)(event);
      const handId = "handId" in event ? event.handId : null;
      const at = yield* Clock.currentTimeMillis;
      const row = appendStmt.get(handId, event._tag, payload, at) as {
        seq: number;
      } | null;
      if (!row) throw new Error("insert returned no rows");
      return { seq: row.seq, event, at };
    });

    const readAll = Effect.gen(function* () {
      const rows = db
        .select({
          seq: schema.events.seq,
          payload: schema.events.payload,
          createdAt: schema.events.createdAt,
        })
        .from(schema.events)
        .orderBy(schema.events.seq)
        .all();

      return yield* Effect.forEach(rows, (row) =>
        Effect.map(
          Schema.decodeUnknownEffect(TableEventFromJson)(row.payload),
          (event): E.StoredEvent => ({
            seq: row.seq,
            event,
            at: row.createdAt,
          }),
        ),
      );
    }).pipe(Effect.withSpan("EventStore.readAll"));

    const tableId = Effect.sync(() => {
      const existing = db
        .select({ id: schema.tableMeta.id })
        .from(schema.tableMeta)
        .limit(1)
        .get();
      if (existing) return existing.id as TableId;

      const id = crypto.randomUUID() as TableId;
      const at = Date.now();
      db.insert(schema.tableMeta).values({ id, createdAt: at }).run();
      return id;
    }).pipe(Effect.withSpan("EventStore.tableId"));

    const ensurePlayer = Effect.fn("EventStore.ensurePlayer")(function* (
      name: PlayerName,
    ) {
      const existing = db
        .select({ name: schema.players.name })
        .from(schema.players)
        .where(eq(schema.players.name, name))
        .get();
      if (existing) return { created: false };

      const at = yield* Clock.currentTimeMillis;
      db.insert(schema.players).values({ name, createdAt: at }).run();
      return { created: true };
    });

    const wipe = Effect.sync(() => {
      db.delete(schema.events).run();
      db.delete(schema.players).run();
    }).pipe(Effect.withSpan("EventStore.wipe"));

    return { append, readAll, tableId, ensurePlayer, wipe };
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

  const wipe = Effect.sync(() => {
    events.length = 0;
    players.clear();
    seq = 0;
  });

  return { append, readAll, tableId, ensurePlayer, wipe };
};
