import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { beforeEach, vi } from "vitest";

import * as Chips from "~/domain/Chips";
import type { PlayerName } from "~/domain/Ids";
import { snapshotMessage } from "~/server/Messages";
import { AppConfig } from "~/services/AppConfig";
import { Broadcast } from "~/services/Broadcast";
import { EventStore } from "~/services/EventStore";
import { Table } from "~/services/Table";

// Disconnection must be a non-event for game state, and hole cards must
// never leak to another recipient's snapshot. Tests `Broadcast` directly
// against `Table` rather than over a real socket.

const p = (name: string) => name as PlayerName;
const admin = p("admin");

const testLayer = (overrides: Parameters<typeof AppConfig.testLayer>[0] = {}) =>
  Broadcast.layer.pipe(
    Layer.provideMerge(
      Table.layer.pipe(
        Layer.provide(
          Layer.merge(EventStore.memoryLayer, AppConfig.testLayer(overrides)),
        ),
      ),
    ),
  );

const defaultLayer = testLayer({
  adminName: admin,
  minimum: Chips.make(10),
  startingBalance: Chips.make(1000),
});

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0);
});

describe("Broadcast: disconnection leaves game state untouched", () => {
  it.effect(
    "a disconnected acting player keeps their seat, chips, and turn",
    () =>
      Effect.gen(function* () {
        const table = yield* Table;
        const broadcast = yield* Broadcast;

        yield* table.join(p("alice"));
        yield* table.join(p("bob"));
        let snap = yield* table.snapshotFor(p("alice"));
        snap = yield* table.ready(p("alice"), snap.seq);
        snap = yield* table.ready(p("bob"), snap.seq);
        snap = yield* table.startHand(admin, snap.seq);

        const acting = snap.hand?.actingPlayer;
        expect(acting).toBeDefined();

        const frames: Array<string> = [];
        const id = yield* broadcast.connect(acting!, (frame) =>
          frames.push(frame),
        );

        // The acting player's device locks: their socket closes.
        yield* broadcast.disconnect(id);

        const before = yield* table.snapshotFor(acting!);
        const actingPlayerView = before.players.find(
          (pl) => pl.name === acting,
        );
        expect(actingPlayerView).toBeDefined();
        expect(actingPlayerView?.seated).toBe(true);
        expect(actingPlayerView?.balance).toBeGreaterThan(0);
        expect(before.hand?.folded).not.toContain(acting);
        // Still waiting on the same player -- no automatic fold, no timer.
        expect(before.hand?.actingPlayer).toBe(acting);
        expect(before.seq).toBe(snap.seq);
      }).pipe(Effect.provide(defaultLayer)),
  );

  it.effect(
    "disconnecting does not deliver further broadcasts to that socket",
    () =>
      Effect.gen(function* () {
        const table = yield* Table;
        const broadcast = yield* Broadcast;

        yield* table.join(p("alice"));
        const frames: Array<string> = [];
        const id = yield* broadcast.connect(p("alice"), (frame) =>
          frames.push(frame),
        );
        const framesAfterConnect = frames.length;
        expect(framesAfterConnect).toBeGreaterThan(0);

        yield* broadcast.disconnect(id);
        yield* table.join(p("bob"));
        yield* broadcast.broadcastAll;

        expect(frames.length).toBe(framesAfterConnect);
      }).pipe(Effect.provide(defaultLayer)),
  );
});

describe("Broadcast: hole card privacy across recipients", () => {
  it.effect(
    "a connected player's frame never contains another player's hole cards",
    () =>
      Effect.gen(function* () {
        const table = yield* Table;
        const broadcast = yield* Broadcast;

        yield* table.join(p("alice"));
        yield* table.join(p("bob"));
        let snap = yield* table.snapshotFor(p("alice"));
        snap = yield* table.ready(p("alice"), snap.seq);
        snap = yield* table.ready(p("bob"), snap.seq);
        snap = yield* table.startHand(admin, snap.seq);

        snap = yield* table.setHoleCards(p("alice"), snap.seq, p("alice"), [
          "As",
          "Ks",
        ]);
        snap = yield* table.setHoleCards(p("bob"), snap.seq, p("bob"), [
          "2c",
          "3c",
        ]);

        const aliceFrames: Array<string> = [];
        yield* broadcast.connect(p("alice"), (frame) =>
          aliceFrames.push(frame),
        );

        yield* broadcast.broadcastAll;

        for (const frame of aliceFrames) {
          expect(frame).not.toContain("2c");
          expect(frame).not.toContain("3c");
        }

        // Sanity: alice's own snapshot does carry her own cards.
        const aliceSnapshot = yield* table.snapshotFor(p("alice"));
        expect(aliceSnapshot.hand?.yourHoleCards).toEqual(["As", "Ks"]);

        const bobSnapshot = yield* table.snapshotFor(p("bob"));
        expect(bobSnapshot.hand?.yourHoleCards).toEqual(["2c", "3c"]);
      }).pipe(Effect.provide(defaultLayer)),
  );

  it.effect(
    "connect sends a snapshot omitting other players' hole cards structurally",
    () =>
      Effect.gen(function* () {
        const table = yield* Table;
        const broadcast = yield* Broadcast;

        yield* table.join(p("alice"));
        yield* table.join(p("bob"));
        let snap = yield* table.snapshotFor(p("alice"));
        snap = yield* table.ready(p("alice"), snap.seq);
        snap = yield* table.ready(p("bob"), snap.seq);
        snap = yield* table.startHand(admin, snap.seq);
        yield* table.setHoleCards(p("bob"), snap.seq, p("bob"), ["9h", "9d"]);

        const frames: Array<string> = [];
        yield* broadcast.connect(p("alice"), (frame) => frames.push(frame));

        expect(frames.length).toBe(1);
        const parsed = JSON.parse(frames[0]!) as ReturnType<
          typeof snapshotMessage
        >;
        expect(parsed.type).toBe("snapshot");
        if (parsed.type === "snapshot") {
          expect(parsed.snapshot.hand?.yourHoleCards).toBeUndefined();
        }
      }).pipe(Effect.provide(defaultLayer)),
  );
});
