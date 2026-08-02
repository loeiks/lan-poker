import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { beforeEach, vi } from "vitest";

import * as Chips from "~/domain/Chips";
import type { PlayerName } from "~/domain/Ids";
import { AppConfig } from "~/services/AppConfig";
import { EventStore } from "~/services/EventStore";
import { Table } from "~/services/Table";

// Drives `Table` against a real SQLite file, the way the server does. The
// only place that exercises an actual restart: build one instance, act
// through it, discard it, and rebuild against the same file to prove replay
// reproduces the state exactly.

const p = (name: string) => name as PlayerName;
const admin = p("admin");

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0);
});

const withTempDb = <A, E>(
  run: (filename: string) => Effect.Effect<A, E>,
): Effect.Effect<A, E> => {
  const dir = mkdtempSync(join(tmpdir(), "lan-poker-integration-"));
  const filename = join(dir, "table.sqlite");
  return run(filename).pipe(
    Effect.ensuring(
      Effect.sync(() => rmSync(dir, { recursive: true, force: true })),
    ),
  );
};

const layerFor = (filename: string) =>
  Table.layer.pipe(
    Layer.provide(
      Layer.merge(
        EventStore.layer({ filename }),
        AppConfig.testLayer({
          adminName: admin,
          minimum: Chips.make(10),
          startingBalance: Chips.make(1000),
        }),
      ),
    ),
  );

describe("Table integration: a real SQLite file", () => {
  it.effect("drives a full hand from blinds to showdown", () =>
    withTempDb((filename) =>
      Effect.gen(function* () {
        const table = yield* Table;
        yield* table.join(admin);
        yield* table.join(p("alice"));
        yield* table.join(p("bob"));
        let snap = yield* table.ready(
          p("alice"),
          (yield* table.snapshotFor(admin)).seq,
        );
        snap = yield* table.ready(p("bob"), snap.seq);
        snap = yield* table.startHand(admin, snap.seq);

        expect(snap.hand?.street).toBe("preflop");
        // Heads-up: alice is button/small blind and acts first.
        snap = yield* table.act(p("alice"), snap.seq, { kind: "call" });
        snap = yield* table.act(p("bob"), snap.seq, { kind: "check" });
        for (let i = 0; i < 3; i++) {
          snap = yield* table.act(p("bob"), snap.seq, { kind: "check" });
          snap = yield* table.act(p("alice"), snap.seq, { kind: "check" });
        }
        expect(snap.hand?.street).toBe("showdown");

        snap = yield* table.declareWinners(admin, snap.seq, [
          { potIndex: 0, winners: [p("alice")] },
        ]);
        expect(snap.hand?.complete).toBe(true);
        const alice = snap.players.find((pl) => pl.name === "alice")!;
        const bob = snap.players.find((pl) => pl.name === "bob")!;
        expect(alice.balance).toBe(1010);
        expect(bob.balance).toBe(990);
      }).pipe(Effect.provide(layerFor(filename))),
    ),
  );

  it.effect(
    "resuming after a restart reproduces exactly the state a hand was left in",
    () =>
      withTempDb((filename) =>
        Effect.gen(function* () {
          const midHand = yield* Effect.gen(function* () {
            const table = yield* Table;
            yield* table.join(admin);
            yield* table.join(p("alice"));
            yield* table.join(p("bob"));
            yield* table.join(p("carol"));
            let snap = yield* table.ready(
              p("alice"),
              (yield* table.snapshotFor(admin)).seq,
            );
            snap = yield* table.ready(p("bob"), snap.seq);
            snap = yield* table.ready(p("carol"), snap.seq);
            snap = yield* table.startHand(admin, snap.seq);
            // Button pinned to seat 0 (alice): 3-handed, alice is under the
            // gun preflop and acts first.
            snap = yield* table.act(p("alice"), snap.seq, { kind: "call" });
            snap = yield* table.act(p("bob"), snap.seq, {
              kind: "raise",
              to: Chips.make(30),
            });
            // carol (big blind) has not acted on the raise yet -- restart here.
            return yield* table.currentState;
          }).pipe(Effect.provide(layerFor(filename)));

          expect(midHand.hand?.complete).toBe(false);
          expect(midHand.hand?.street).toBe("preflop");

          const resumed = yield* Effect.gen(function* () {
            const table = yield* Table;
            return yield* table.currentState;
          }).pipe(Effect.provide(layerFor(filename)));

          expect(resumed.seq).toBe(midHand.seq);
          expect(resumed.hand?.street).toBe(midHand.hand?.street);
          expect(resumed.hand?.complete).toBe(midHand.hand?.complete);
          expect(resumed.hand?.actingIndex).toBe(midHand.hand?.actingIndex);
          expect([...resumed.hand!.contributions]).toEqual([
            ...midHand.hand!.contributions,
          ]);
          expect([...resumed.hand!.folded]).toEqual([...midHand.hand!.folded]);
          expect([...resumed.hand!.allIn]).toEqual([...midHand.hand!.allIn]);
          expect(resumed.hand?.currentBet).toBe(midHand.hand?.currentBet);
          expect([...resumed.players]).toEqual([...midHand.players]);

          // And the resumed table is genuinely live: the waited-on player can
          // still act and the hand can finish normally.
          const table = yield* Table;
          let snap = yield* table.snapshotFor(admin);
          expect(snap.hand?.actingPlayer).toBe("carol");
          snap = yield* table.act(p("carol"), snap.seq, { kind: "fold" });
          snap = yield* table.act(p("alice"), snap.seq, { kind: "fold" });
          expect(snap.hand?.complete).toBe(true);
          const bob = snap.players.find((pl) => pl.name === "bob")!;
          expect(bob.balance).toBeGreaterThan(1000);
        }).pipe(Effect.provide(layerFor(filename))),
      ),
  );
});
