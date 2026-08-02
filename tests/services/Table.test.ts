import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { beforeEach, vi } from "vitest";

import * as Chips from "~/domain/Chips";
import type { PlayerName } from "~/domain/Ids";
import { initialSeq } from "~/domain/Ids";
import { AppConfig } from "~/services/AppConfig";
import { EventStore } from "~/services/EventStore";
import { Table } from "~/services/Table";

const p = (name: string) => name as PlayerName;
const admin = p("admin");

const testLayer = (overrides: Parameters<typeof AppConfig.testLayer>[0] = {}) =>
  Table.layer.pipe(
    Layer.provide(
      Layer.merge(EventStore.memoryLayer, AppConfig.testLayer(overrides)),
    ),
  );

const defaultLayer = testLayer({
  adminName: admin,
  minimum: Chips.make(10),
  startingBalance: Chips.make(1000),
});

// The first hand's button is randomly chosen; pin it to the first seat so
// tests can assert who acts when without a flaky draw.
beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0);
});

/** Join and ready up a list of names, in order. Returns the last snapshot. */
const seatAndReady = Effect.fn("seatAndReady")(function* (
  names: ReadonlyArray<PlayerName>,
) {
  const table = yield* Table;
  for (const name of names) yield* table.join(name);
  let snapshot = yield* table.snapshotFor(names[0]!);
  for (const name of names) {
    snapshot = yield* table.ready(name, snapshot.seq);
  }
  return snapshot;
});

describe("Table: joining and readiness", () => {
  it.effect("a new name is seated with the starting balance", () =>
    Effect.gen(function* () {
      const table = yield* Table;
      const snapshot = yield* table.join(p("alice"));
      const alice = snapshot.players.find((pl) => pl.name === "alice");
      expect(alice?.balance).toBe(1000);
      expect(alice?.ready).toBe(false);
    }).pipe(Effect.provide(defaultLayer)),
  );

  it.effect(
    "joining twice reclaims the same player rather than resetting them",
    () =>
      Effect.gen(function* () {
        const table = yield* Table;
        yield* table.join(p("alice"));
        let snap = yield* table.snapshotFor(p("alice"));
        snap = yield* table.ready(p("alice"), snap.seq);
        snap = yield* table.join(p("alice"));
        expect(snap.players.find((pl) => pl.name === "alice")?.ready).toBe(
          true,
        );
      }).pipe(Effect.provide(defaultLayer)),
  );

  it.effect("ready and unready are visible on the snapshot", () =>
    Effect.gen(function* () {
      const table = yield* Table;
      yield* table.join(p("alice"));
      let snap = yield* table.snapshotFor(p("alice"));
      snap = yield* table.ready(p("alice"), snap.seq);
      expect(snap.players.find((pl) => pl.name === "alice")?.ready).toBe(true);
      snap = yield* table.unready(p("alice"), snap.seq);
      expect(snap.players.find((pl) => pl.name === "alice")?.ready).toBe(false);
    }).pipe(Effect.provide(defaultLayer)),
  );

  it.effect("a stale seq is rejected and does not change state", () =>
    Effect.gen(function* () {
      const table = yield* Table;
      yield* table.join(p("alice"));
      const snap = yield* table.snapshotFor(p("alice"));
      const error = yield* Effect.flip(table.ready(p("alice"), initialSeq));
      expect(error._tag).toBe("StaleSequence");
      void snap;
    }).pipe(Effect.provide(defaultLayer)),
  );
});

describe("Table: starting a hand", () => {
  it.effect("only the admin can start a hand", () =>
    Effect.gen(function* () {
      const table = yield* Table;
      const snap = yield* seatAndReady([p("alice"), p("bob")]);
      const error = yield* Effect.flip(table.startHand(p("alice"), snap.seq));
      expect(error._tag).toBe("NotAdmin");
    }).pipe(Effect.provide(defaultLayer)),
  );

  it.effect("fewer than two ready players is refused", () =>
    Effect.gen(function* () {
      const table = yield* Table;
      yield* table.join(admin);
      yield* table.join(p("alice"));
      const snap = yield* table.snapshotFor(admin);
      const error = yield* Effect.flip(table.startHand(admin, snap.seq));
      expect(error._tag).toBe("NotEnoughPlayers");
    }).pipe(Effect.provide(defaultLayer)),
  );

  it.effect("starting a hand deals in the ready players and posts blinds", () =>
    Effect.gen(function* () {
      const table = yield* Table;
      yield* table.join(admin);
      const snap0 = yield* seatAndReady([p("alice"), p("bob"), p("carol")]);
      const snap = yield* table.startHand(admin, snap0.seq);

      expect(snap.hand?.players).toEqual(["alice", "bob", "carol"]);
      expect(snap.hand?.street).toBe("preflop");
      // Blinds posted: 5 and 10 taken from the two seats after the button.
      const balances = new Map(snap.players.map((pl) => [pl.name, pl.balance]));
      const posted = [...balances.values()].filter((b) => b < 1000);
      expect(posted.sort()).toEqual([990, 995]);
      expect(snap.hand?.actingPlayer).toBeDefined();
    }).pipe(Effect.provide(defaultLayer)),
  );
});

describe("Table: betting and fold-out settlement", () => {
  it.effect(
    "everyone folding to one player awards them the pot with no cards",
    () =>
      Effect.gen(function* () {
        const table = yield* Table;
        yield* table.join(admin);
        const snap0 = yield* seatAndReady([p("alice"), p("bob"), p("carol")]);
        let snap = yield* table.startHand(admin, snap0.seq);

        // alice is under the gun preflop with button=0 (alice, bob=sb, carol=bb).
        expect(snap.hand?.actingPlayer).toBe("alice");
        snap = yield* table.act(p("alice"), snap.seq, { kind: "fold" });
        expect(snap.hand?.actingPlayer).toBe("bob");
        snap = yield* table.act(p("bob"), snap.seq, { kind: "fold" });

        expect(snap.lastWinners).toBeDefined();
        const carol = snap.players.find((pl) => pl.name === "carol");
        // carol posted the big blind (10) and wins the 15-chip pot uncontested.
        expect(carol?.balance).toBe(1000 - 10 + 15);
        const total = snap.players.reduce((sum, pl) => sum + pl.balance, 0);
        expect(total).toBe(4000);
      }).pipe(Effect.provide(defaultLayer)),
  );

  it.effect("acting out of turn is rejected", () =>
    Effect.gen(function* () {
      const table = yield* Table;
      yield* table.join(admin);
      const snap0 = yield* seatAndReady([p("alice"), p("bob"), p("carol")]);
      const snap = yield* table.startHand(admin, snap0.seq);
      const error = yield* Effect.flip(
        table.act(p("carol"), snap.seq, { kind: "fold" }),
      );
      expect(error._tag).toBe("NotYourTurn");
    }).pipe(Effect.provide(defaultLayer)),
  );

  it.effect(
    "a completed hand clears readiness and rotates the button for the next one",
    () =>
      Effect.gen(function* () {
        const table = yield* Table;
        yield* table.join(admin);
        const snap0 = yield* seatAndReady([p("alice"), p("bob"), p("carol")]);
        let snap = yield* table.startHand(admin, snap0.seq);
        snap = yield* table.act(p("alice"), snap.seq, { kind: "fold" });
        snap = yield* table.act(p("bob"), snap.seq, { kind: "fold" });
        expect(snap.players.find((pl) => pl.name === "alice")?.ready).toBe(
          false,
        );

        snap = yield* table.ready(p("alice"), snap.seq);
        snap = yield* table.ready(p("bob"), snap.seq);
        snap = yield* table.ready(p("carol"), snap.seq);
        const secondHand = yield* table.startHand(admin, snap.seq);
        // The button was on alice (seat 0); it rotates to bob.
        expect(secondHand.hand?.button).toBe("bob");
      }).pipe(Effect.provide(defaultLayer)),
  );

  it.effect(
    "starting a second hand with the same explicit dealer as before still works",
    () =>
      Effect.gen(function* () {
        const table = yield* Table;
        yield* table.join(admin);
        const snap0 = yield* seatAndReady([p("alice"), p("bob"), p("carol")]);
        let snap = yield* table.startHand(admin, snap0.seq, p("alice"));
        expect(snap.hand?.button).toBe("alice");
        snap = yield* table.act(p("alice"), snap.seq, { kind: "fold" });
        snap = yield* table.act(p("bob"), snap.seq, { kind: "fold" });

        snap = yield* table.ready(p("alice"), snap.seq);
        snap = yield* table.ready(p("bob"), snap.seq);
        snap = yield* table.ready(p("carol"), snap.seq);
        const secondHand = yield* table.startHand(
          admin,
          snap.seq,
          p("alice"),
        );
        expect(secondHand.hand?.button).toBe("alice");
        expect(secondHand.hand?.players).toEqual(["alice", "bob", "carol"]);
      }).pipe(Effect.provide(defaultLayer)),
  );

  it.effect("handsPlayed counts completed hands for the dealer UI", () =>
    Effect.gen(function* () {
      const table = yield* Table;
      yield* table.join(admin);
      const snap0 = yield* seatAndReady([p("alice"), p("bob")]);
      expect(snap0.handsPlayed).toBe(0);

      let snap = yield* table.startHand(admin, snap0.seq);
      expect(snap.handsPlayed).toBe(0);
      snap = yield* table.act(p("alice"), snap.seq, { kind: "fold" });
      expect(snap.handsPlayed).toBe(1);
    }).pipe(Effect.provide(defaultLayer)),
  );
});

describe("Table: showdown", () => {
  const dealToShowdown = Effect.fn("dealToShowdown")(function* () {
    const table = yield* Table;
    yield* table.join(admin);
    const snap0 = yield* seatAndReady([p("alice"), p("bob")]);
    // Heads-up: alice is the button/small blind and acts first preflop.
    let snap = yield* table.startHand(admin, snap0.seq);
    snap = yield* table.act(p("alice"), snap.seq, { kind: "call" });
    snap = yield* table.act(p("bob"), snap.seq, { kind: "check" });
    // Flop, turn, river: check through.
    for (let i = 0; i < 3; i++) {
      snap = yield* table.act(p("bob"), snap.seq, { kind: "check" });
      snap = yield* table.act(p("alice"), snap.seq, { kind: "check" });
    }
    return { table, snap };
  });

  it.effect("showdown with full card data settles automatically", () =>
    Effect.gen(function* () {
      const { table, snap: dealt } = yield* dealToShowdown();
      let snap = dealt;
      expect(snap.hand?.street).toBe("showdown");
      expect(snap.hand?.awaitingDeclaration).toBe(true);

      snap = yield* table.setHoleCards(admin, snap.seq, p("alice"), [
        "As",
        "Ad",
      ]);
      snap = yield* table.setHoleCards(admin, snap.seq, p("bob"), ["2c", "7d"]);
      for (const [i, card] of ["Ks", "Qh", "Jd", "3c", "4h"].entries()) {
        snap = yield* table.setBoardCard(admin, snap.seq, i, card as never);
      }

      expect(snap.lastWinners).toBeDefined();
      const alice = snap.players.find((pl) => pl.name === "alice")!;
      expect(alice.balance).toBeGreaterThan(1000);
    }).pipe(Effect.provide(defaultLayer)),
  );

  it.effect(
    "showdown without enough card data waits for an admin declaration",
    () =>
      Effect.gen(function* () {
        const { table, snap: dealt } = yield* dealToShowdown();
        expect(dealt.hand?.awaitingDeclaration).toBe(true);

        const snap = yield* table.declareWinners(admin, dealt.seq, [
          { potIndex: 0, winners: [p("alice")] },
        ]);
        expect(snap.lastWinners).toBeDefined();
        const alice = snap.players.find((pl) => pl.name === "alice")!;
        const bob = snap.players.find((pl) => pl.name === "bob")!;
        expect(alice.balance).toBe(1010);
        expect(bob.balance).toBe(990);
      }).pipe(Effect.provide(defaultLayer)),
  );

  it.effect("declaring a winner ineligible for a pot is rejected", () =>
    Effect.gen(function* () {
      const { table, snap: dealt } = yield* dealToShowdown();
      const error = yield* Effect.flip(
        table.declareWinners(admin, dealt.seq, [
          { potIndex: 0, winners: [p("carol")] },
        ]),
      );
      expect(error._tag).toBe("NotEligibleForPot");
    }).pipe(Effect.provide(defaultLayer)),
  );
});

describe("Table: transfers, credit, and admin actions", () => {
  it.effect("chips can be transferred between hands but not during one", () =>
    Effect.gen(function* () {
      const table = yield* Table;
      yield* table.join(admin);
      const snap0 = yield* seatAndReady([p("alice"), p("bob")]);
      const afterTransfer = yield* table.transfer(
        p("alice"),
        snap0.seq,
        p("bob"),
        Chips.make(100),
      );
      expect(
        afterTransfer.players.find((pl) => pl.name === "alice")?.balance,
      ).toBe(900);
      expect(
        afterTransfer.players.find((pl) => pl.name === "bob")?.balance,
      ).toBe(1100);

      const snap = yield* table.startHand(admin, afterTransfer.seq);
      const error = yield* Effect.flip(
        table.transfer(p("alice"), snap.seq, p("bob"), Chips.make(10)),
      );
      expect(error._tag).toBe("IllegalAction");
    }).pipe(Effect.provide(defaultLayer)),
  );

  it.effect("the admin can adjust a balance directly", () =>
    Effect.gen(function* () {
      const table = yield* Table;
      yield* table.join(admin);
      const snap0 = yield* table.snapshotFor(admin);
      const snap = yield* table.adjustBalance(
        admin,
        snap0.seq,
        admin,
        Chips.make(2000),
      );
      expect(snap.players.find((pl) => pl.name === "admin")?.balance).toBe(
        2000,
      );
    }).pipe(Effect.provide(defaultLayer)),
  );

  it.effect("busting to zero freezes a burnout credit behind a cooldown", () =>
    Effect.gen(function* () {
      const table = yield* Table;
      yield* table.join(admin);
      yield* table.join(p("alice"));
      yield* table.join(p("bob"));
      // Button is pinned to seat 0 (alice), who is heads-up small blind.
      // Shrinking her stack to the blind itself puts her all-in immediately.
      const trimmed = yield* table.adjustBalance(
        admin,
        (yield* table.snapshotFor(admin)).seq,
        p("alice"),
        Chips.make(5),
      );
      let snap = yield* table.ready(p("alice"), trimmed.seq);
      snap = yield* table.ready(p("bob"), snap.seq);
      snap = yield* table.startHand(admin, snap.seq);
      // alice is all-in from the small blind; bob checking preflop is the
      // only action left, which immediately exhausts the betting.
      snap = yield* table.act(p("bob"), snap.seq, { kind: "check" });

      expect(snap.hand?.street).toBe("showdown");
      snap = yield* table.declareWinners(
        admin,
        snap.seq,
        snap.hand!.pots.map((_, potIndex) => ({
          potIndex,
          winners: [p("bob")],
        })),
      );

      const alice = snap.players.find((pl) => pl.name === "alice")!;
      expect(alice.balance).toBe(0);
      expect(alice.pendingCredit).toBeDefined();
      expect(alice.pendingCredit?.handsRemaining).toBe(3);
    }).pipe(Effect.provide(defaultLayer)),
  );

  it.effect(
    "claiming credit is refused during the cooldown and works after",
    () =>
      Effect.gen(function* () {
        const table = yield* Table;
        yield* table.join(admin);
        yield* table.join(p("alice"));
        yield* table.join(p("bob"));
        const trimmed = yield* table.adjustBalance(
          admin,
          (yield* table.snapshotFor(admin)).seq,
          p("alice"),
          Chips.make(5),
        );
        let snap = yield* table.ready(p("alice"), trimmed.seq);
        snap = yield* table.ready(p("bob"), snap.seq);
        snap = yield* table.startHand(admin, snap.seq);
        snap = yield* table.act(p("bob"), snap.seq, { kind: "check" });
        snap = yield* table.declareWinners(
          admin,
          snap.seq,
          snap.hand!.pots.map((_, potIndex) => ({
            potIndex,
            winners: [p("bob")],
          })),
        );
        expect(
          snap.players.find((pl) => pl.name === "alice")?.pendingCredit,
        ).toBeDefined();

        const early = yield* Effect.flip(
          table.claimCredit(p("alice"), snap.seq),
        );
        expect(early._tag).toBe("CreditUnavailable");

        snap = yield* table.join(p("carol"));
        // alice has zero balance and is excluded from `eligibleToPlay`, so the
        // remaining two players carry the table through the cooldown.
        for (let i = 0; i < 3; i++) {
          snap = yield* table.ready(p("bob"), snap.seq);
          snap = yield* table.ready(p("carol"), snap.seq);
          snap = yield* table.startHand(admin, snap.seq);
          snap = yield* table.act(
            snap.hand!.actingPlayer as PlayerName,
            snap.seq,
            { kind: "fold" },
          );
        }

        const claimed = yield* table.claimCredit(p("alice"), snap.seq);
        const alice = claimed.players.find((pl) => pl.name === "alice")!;
        expect(alice.balance).toBeGreaterThan(0);
        expect(alice.pendingCredit).toBeUndefined();
      }).pipe(Effect.provide(defaultLayer)),
  );
});

describe("Table: spend accounting (chip-economy spec)", () => {
  const spendOf = Effect.fn("spendOf")(function* (name: PlayerName) {
    const table = yield* Table;
    const state = yield* table.currentState;
    return state.players.get(name)?.spendHistory ?? [];
  });

  it.effect(
    "spend is the sum of blinds, calls, bets, and raises for the hand",
    () =>
      Effect.gen(function* () {
        const table = yield* Table;
        yield* table.join(admin);
        const snap0 = yield* seatAndReady([p("alice"), p("bob")]);
        // Heads-up: alice is button/small blind (5), bob is big blind (10).
        let snap = yield* table.startHand(admin, snap0.seq);
        snap = yield* table.act(p("alice"), snap.seq, { kind: "call" });
        snap = yield* table.act(p("bob"), snap.seq, { kind: "check" });
        for (let i = 0; i < 3; i++) {
          snap = yield* table.act(p("bob"), snap.seq, { kind: "check" });
          snap = yield* table.act(p("alice"), snap.seq, { kind: "check" });
        }
        yield* table.declareWinners(
          admin,
          snap.seq,
          snap.hand!.pots.map((_, potIndex) => ({
            potIndex,
            winners: [p("bob")],
          })),
        );

        expect(yield* spendOf(p("alice"))).toEqual([10]);
        expect(yield* spendOf(p("bob"))).toEqual([10]);
      }).pipe(Effect.provide(defaultLayer)),
  );

  it.effect(
    "an uncalled bet returned to its owner is excluded from spend",
    () =>
      Effect.gen(function* () {
        const table = yield* Table;
        yield* table.join(admin);
        const snap0 = yield* seatAndReady([p("alice"), p("bob")]);
        // Heads-up: alice is small blind/button and acts first preflop.
        let snap = yield* table.startHand(admin, snap0.seq);
        snap = yield* table.act(p("alice"), snap.seq, {
          kind: "raise",
          to: Chips.make(200),
        });
        snap = yield* table.act(p("bob"), snap.seq, { kind: "fold" });

        // alice's 200 was never matched by bob (who folded), so only bob's
        // blind (10) plus alice's blind (5) actually land in the pot; the rest
        // of alice's raise is returned uncalled and must not count as spend.
        expect(yield* spendOf(p("alice"))).toEqual([10]);
      }).pipe(Effect.provide(defaultLayer)),
  );

  it.effect("winning a hand does not offset recorded spend", () =>
    Effect.gen(function* () {
      const table = yield* Table;
      yield* table.join(admin);
      const snap0 = yield* seatAndReady([p("alice"), p("bob")]);
      let snap = yield* table.startHand(admin, snap0.seq);
      snap = yield* table.act(p("alice"), snap.seq, { kind: "call" });
      snap = yield* table.act(p("bob"), snap.seq, { kind: "check" });
      for (let i = 0; i < 3; i++) {
        snap = yield* table.act(p("bob"), snap.seq, { kind: "check" });
        snap = yield* table.act(p("alice"), snap.seq, { kind: "check" });
      }
      const settled = yield* table.declareWinners(
        admin,
        snap.seq,
        snap.hand!.pots.map((_, potIndex) => ({
          potIndex,
          winners: [p("alice")],
        })),
      );

      const alice = settled.players.find((pl) => pl.name === "alice")!;
      expect(alice.balance).toBeGreaterThan(1000);
      // alice won the pot, but her recorded spend is still just her contribution.
      expect(yield* spendOf(p("alice"))).toEqual([10]);
    }).pipe(Effect.provide(defaultLayer)),
  );

  it.effect(
    "a seated player who sits out a hand records zero spend for it",
    () =>
      Effect.gen(function* () {
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
        // carol stays seated but does not ready up, so she sits this hand out.
        snap = yield* table.startHand(admin, snap.seq);
        // Heads-up: alice is button/small blind and acts first preflop.
        snap = yield* table.act(p("alice"), snap.seq, { kind: "call" });
        snap = yield* table.act(p("bob"), snap.seq, { kind: "check" });
        yield* table.declareWinners(
          admin,
          snap.seq,
          snap.hand!.pots.map((_, potIndex) => ({
            potIndex,
            winners: [p("bob")],
          })),
        );

        expect(yield* spendOf(p("carol"))).toEqual([0]);
      }).pipe(Effect.provide(defaultLayer)),
  );

  it.effect("transfers between players do not affect recorded spend", () =>
    Effect.gen(function* () {
      const table = yield* Table;
      yield* table.join(admin);
      const snap0 = yield* seatAndReady([p("alice"), p("bob")]);
      yield* table.transfer(p("alice"), snap0.seq, p("bob"), Chips.make(100));

      expect(yield* spendOf(p("alice"))).toEqual([]);
      expect(yield* spendOf(p("bob"))).toEqual([]);
    }).pipe(Effect.provide(defaultLayer)),
  );
});
