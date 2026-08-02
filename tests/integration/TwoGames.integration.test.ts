import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { beforeEach, vi } from "vitest";

import * as Chips from "~/domain/Chips";
import type { PlayerName } from "~/domain/Ids";
import type { TableSnapshot } from "~/state/snapshot";
import { AppConfig } from "~/services/AppConfig";
import { EventStore } from "~/services/EventStore";
import { Table, type TableService } from "~/services/Table";

const p = (name: string) => name as PlayerName;
const admin = p("admin");

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0);
});

const withTempDb = <A, E>(
  run: (filename: string) => Effect.Effect<A, E>,
): Effect.Effect<A, E> => {
  const dir = mkdtempSync(join(tmpdir(), "lan-poker-int-2games-"));
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

/**
 * One player calls preflop (matching the big blind), then everyone else
 * folds, giving the first player all chips via auto-settlement.
 */
const driveHand = (table: TableService, snap: TableSnapshot) =>
  Effect.gen(function* () {
    let s = snap;
    const players = s.hand!.players.filter((n) => n !== admin);

    // First player calls, everyone else folds
    s = yield* table.act(players[0]!, s.seq, { kind: "call" });
    for (let i = 1; i < players.length; i++) {
      s = yield* table.act(players[i]!, s.seq, { kind: "fold" });
    }
    return s;
  });

describe("two consecutive games", () => {
  it.effect(
    "game 1 (4p), new player joins, game 2 (5p), can start game 3",
    () =>
      withTempDb((filename) =>
        Effect.gen(function* () {
          const table = yield* Table;

          // ---- Setup: 4 players join ----
          yield* table.join(admin);
          yield* table.join(p("alice"));
          yield* table.join(p("bob"));
          yield* table.join(p("carol"));

          // ---- Game 1 ----
          let snap = yield* table.ready(
            p("alice"),
            (yield* table.snapshotFor(admin)).seq,
          );
          snap = yield* table.ready(p("bob"), snap.seq);
          snap = yield* table.ready(p("carol"), snap.seq);
          snap = yield* table.startHand(admin, snap.seq, "alice" as PlayerName);

          expect(snap.hand?.players).toEqual(["alice", "bob", "carol"]);
          expect(snap.hand?.button).toBe("alice");

          snap = yield* driveHand(table, snap);
          expect(snap.lastWinners).toBeDefined();
          expect(snap.lastWinners).toContain("alice");
          expect(snap.hand).toBeUndefined();

          const aliceAfter1 = snap.players.find(
            (pl) => pl.name === "alice",
          )!;
          expect(aliceAfter1.balance).toBeGreaterThan(1000);

          // ---- 5th player joins between games ----
          yield* table.join(p("david"));
          snap = yield* table.snapshotFor(admin);

          // ---- Game 2 ----
          snap = yield* table.ready(p("alice"), snap.seq);
          snap = yield* table.ready(p("bob"), snap.seq);
          snap = yield* table.ready(p("carol"), snap.seq);
          snap = yield* table.ready(p("david"), snap.seq);
          snap = yield* table.startHand(admin, snap.seq);

          expect(snap.hand?.players).toEqual([
            "alice",
            "bob",
            "carol",
            "david",
          ]);
          expect(snap.hand?.button).toBe("bob");

          snap = yield* driveHand(table, snap);
          expect(snap.lastWinners).toBeDefined();
          expect(snap.lastWinners).toContain("alice");
          expect(snap.hand).toBeUndefined();

          // All players auto-unreadied after settlement
          for (const player of snap.players) {
            expect(player.ready).toBe(false);
          }

          // ---- Can start game 3 ----
          snap = yield* table.ready(p("alice"), snap.seq);
          snap = yield* table.ready(p("bob"), snap.seq);
          snap = yield* table.ready(p("carol"), snap.seq);
          snap = yield* table.ready(p("david"), snap.seq);
          snap = yield* table.startHand(admin, snap.seq);

          expect(snap.hand?.players).toEqual([
            "alice",
            "bob",
            "carol",
            "david",
          ]);
          expect(snap.hand?.button).toBe("carol");
          expect(snap.hand?.street).toBe("preflop");
        }).pipe(Effect.provide(layerFor(filename))),
      ),
  );
});
