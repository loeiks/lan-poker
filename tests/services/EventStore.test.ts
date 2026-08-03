import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Database } from "bun:sqlite";
import { describe, expect, it } from "@effect/vitest";
import { Effect, type Layer } from "effect";

import * as Chips from "~/domain/Chips";
import * as E from "~/domain/Events";
import type { PlayerName } from "~/domain/Ids";
import { EventStore } from "~/services/EventStore";

// Same contract run against both layers: in-memory exists so the rest of
// the suite never needs a real file, so it must behave identically.
const contractTests = (
  label: string,
  makeLayer: () => Layer.Layer<EventStore, unknown>,
) => {
  describe(`EventStore contract: ${label}`, () => {
    it.effect("appended events come back in seq order, starting at 1", () =>
      Effect.gen(function* () {
        const store = yield* EventStore;
        const first = yield* store.append(
          new E.PlayerJoined({
            player: "a" as PlayerName,
            startingBalance: Chips.make(700),
          }),
        );
        const second = yield* store.append(
          new E.PlayerReadied({ player: "a" as PlayerName }),
        );
        expect(first.seq).toBe(1);
        expect(second.seq).toBe(2);

        const all = yield* store.readAll;
        expect(all.map((s) => s.seq)).toEqual([1, 2]);
        expect(all[0]!.event).toEqual(first.event);
        expect(all[1]!.event).toEqual(second.event);
      }).pipe(Effect.provide(makeLayer())),
    );

    it.effect("events round-trip through Schema encoding without loss", () =>
      Effect.gen(function* () {
        const store = yield* EventStore;
        const event = new E.HandSettled({
          winners: [],
          handId: "h1" as E.HandSettled["handId"],
          spends: [
            { player: "a" as PlayerName, amount: Chips.make(30) },
            { player: "b" as PlayerName, amount: Chips.make(0) },
          ],
        });
        yield* store.append(event);
        const [stored] = yield* store.readAll;
        expect(stored!.event).toEqual(event);
        expect(stored!.event).toBeInstanceOf(E.HandSettled);
      }).pipe(Effect.provide(makeLayer())),
    );

    it.effect("the table id is generated once and stays stable", () =>
      Effect.gen(function* () {
        const store = yield* EventStore;
        const first = yield* store.tableId;
        const second = yield* store.tableId;
        expect(first).toBe(second);
        expect(first.length).toBeGreaterThan(0);
      }).pipe(Effect.provide(makeLayer())),
    );

    it.effect("a name is only ever created once", () =>
      Effect.gen(function* () {
        const store = yield* EventStore;
        const first = yield* store.ensurePlayer("enes" as PlayerName);
        const second = yield* store.ensurePlayer("enes" as PlayerName);
        expect(first).toEqual({ created: true });
        expect(second).toEqual({ created: false });
      }).pipe(Effect.provide(makeLayer())),
    );
  });
};

contractTests("in-memory", () => EventStore.memoryLayer);

describe("EventStore: sqlite file", () => {
  const withTempFile = <A, E2>(
    run: (filename: string) => Effect.Effect<A, E2>,
  ): Effect.Effect<A, E2> => {
    const dir = mkdtempSync(join(tmpdir(), "lan-poker-eventstore-"));
    const filename = join(dir, "table.sqlite");
    return run(filename).pipe(
      Effect.ensuring(
        Effect.sync(() => rmSync(dir, { recursive: true, force: true })),
      ),
    );
  };

  contractTests("sqlite", () =>
    EventStore.layer({
      filename: join(
        mkdtempSync(join(tmpdir(), "lan-poker-eventstore-contract-")),
        "table.sqlite",
      ),
    }),
  );

  it.effect("the table id survives closing and reopening the file", () =>
    withTempFile((filename) =>
      Effect.gen(function* () {
        const first = yield* Effect.provide(
          Effect.flatMap(EventStore, (store) => store.tableId),
          EventStore.layer({ filename }),
        );
        const second = yield* Effect.provide(
          Effect.flatMap(EventStore, (store) => store.tableId),
          EventStore.layer({ filename }),
        );
        expect(second).toBe(first);
      }),
    ),
  );

  it.effect(
    "a decoded event of an unknown type fails loudly rather than being skipped",
    () =>
      withTempFile((filename) =>
        Effect.gen(function* () {
          const layer = EventStore.layer({ filename });
          yield* Effect.provide(
            Effect.flatMap(EventStore, (store) =>
              store.append(new E.PlayerReadied({ player: "a" as PlayerName })),
            ),
            layer,
          );

          // Corrupt the log the way an old build reading a newer schema would:
          // a payload whose `_tag` no schema in the union recognizes.
          yield* Effect.sync(() => {
            const db = new Database(filename);
            db.run(
              `INSERT INTO events (hand_id, type, payload, created_at)
             VALUES (NULL, 'SomeFutureEvent', '{"_tag":"SomeFutureEvent"}', 0)`,
            );
            db.close();
          });

          const result = yield* Effect.provide(
            Effect.flip(Effect.flatMap(EventStore, (store) => store.readAll)),
            layer,
          );
          expect(result._tag).toBe("SchemaError");
        }),
      ),
  );
});
