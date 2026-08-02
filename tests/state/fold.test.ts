import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import type { Card } from "~/domain/Card";
import * as Chips from "~/domain/Chips";
import * as E from "~/domain/Events";
import type { HandId, PlayerName, TableId } from "~/domain/Ids";
import type { TableState } from "~/domain/State";
import { actingPlayer, contributionOf, scoreOf } from "~/domain/State";
import { TableConfig } from "~/domain/TableConfig";
import { buildPots } from "~/rules/pots";
import { applyEvent, foldEvents, initialState } from "~/state/fold";

const p = (name: string) => name as PlayerName;
const a = p("a");
const b = p("b");
const c = p("c");

const config = new TableConfig({
  id: "t1" as TableId,
  name: "test",
  minimum: Chips.make(10),
  mode: "BURNOUT_CREDIT",
  startingBalance: Chips.make(1000),
  adminName: a,
});

/** Number the events the way the store would, and replay them. */
const store = (
  events: ReadonlyArray<E.TableEvent>,
): ReadonlyArray<E.StoredEvent> =>
  events.map((event, index) => ({ seq: index + 1, event, at: index }));

const fold = (events: ReadonlyArray<E.TableEvent>) =>
  foldEvents(config, store(events));

/** The error a log is rejected with, so failures can be asserted by tag. */
const foldError = (events: ReadonlyArray<E.TableEvent>) =>
  Effect.flip(fold(events));

const balanceOf = (state: TableState, player: PlayerName): number =>
  state.players.get(player)?.balance ?? -1;

const created = new E.TableCreated({ tableId: config.id });

const joined = (player: PlayerName) =>
  new E.PlayerJoined({ player, startingBalance: config.startingBalance });

const table = [created, joined(a), joined(b), joined(c)];

/** Three players, blinds posted, `a` (under the gun) to act. */
const handOpen = [
  ...table,
  new E.HandStarted({ handId: "h1" as HandId, players: [a, b, c], button: 0 }),
  new E.BlindPosted({
    player: b,
    kind: "small",
    amount: config.smallBlind,
    allIn: false,
  }),
  new E.BlindPosted({
    player: c,
    kind: "big",
    amount: config.bigBlind,
    allIn: false,
  }),
];

const acted = (player: PlayerName, action: E.BettingAction) =>
  new E.PlayerActed({ player, action });

/** Everyone limps to a flop with 30 in the middle. */
const preflopLimped = [
  ...handOpen,
  acted(a, new E.Call({ amount: Chips.make(10), allIn: false })),
  acted(b, new E.Call({ amount: Chips.make(5), allIn: false })),
  acted(c, new E.Check()),
];

describe("fold: table-level events", () => {
  it.effect("a join seats a player with their starting balance", () =>
    Effect.gen(function* () {
      const state = yield* fold(table);
      expect(state.seatOrder).toEqual([a, b, c]);
      expect(balanceOf(state, a)).toBe(1000);
      expect(state.players.get(a)?.seated).toBe(true);
      expect(state.players.get(a)?.ready).toBe(false);
      expect(state.seq).toBe(4);
    }),
  );

  it.effect("an empty log is the initial state", () =>
    Effect.gen(function* () {
      expect(yield* fold([])).toEqual(initialState(config));
    }),
  );

  it.effect("a log written for another table is rejected", () =>
    Effect.gen(function* () {
      const error = yield* foldError([
        new E.TableCreated({ tableId: "other" as TableId }),
      ]);
      expect(error._tag).toBe("InconsistentEventLog");
    }),
  );

  it.effect("joining twice would grant a second stack, so it is rejected", () =>
    Effect.gen(function* () {
      const error = yield* foldError([...table, joined(a)]);
      expect(error._tag).toBe("InconsistentEventLog");
    }),
  );

  it.effect("events about an unknown player are rejected", () =>
    Effect.gen(function* () {
      const error = yield* foldError([
        ...table,
        new E.PlayerReadied({ player: p("nobody") }),
      ]);
      expect(error._tag).toBe("PlayerNotFound");
    }),
  );

  it.effect("ready and unready toggle without touching anything else", () =>
    Effect.gen(function* () {
      const state = yield* fold([
        ...table,
        new E.PlayerReadied({ player: a }),
        new E.PlayerReadied({ player: b }),
        new E.PlayerUnreadied({ player: a }),
      ]);
      expect(state.players.get(a)?.ready).toBe(false);
      expect(state.players.get(b)?.ready).toBe(true);
    }),
  );

  it.effect("leaving keeps the seat and the balance", () =>
    Effect.gen(function* () {
      const state = yield* fold([
        ...table,
        new E.PlayerReadied({ player: a }),
        new E.PlayerLeft({ player: a }),
      ]);
      expect(state.players.get(a)?.seated).toBe(false);
      expect(state.players.get(a)?.ready).toBe(false);
      expect(balanceOf(state, a)).toBe(1000);
      expect(state.seatOrder).toContain(a);
    }),
  );

  it.effect("a transfer moves chips between players", () =>
    Effect.gen(function* () {
      const state = yield* fold([
        ...table,
        new E.ChipsTransferred({ from: a, to: b, amount: Chips.make(200) }),
      ]);
      expect(balanceOf(state, a)).toBe(800);
      expect(balanceOf(state, b)).toBe(1200);
    }),
  );

  it.effect("a transfer larger than the balance is rejected", () =>
    Effect.gen(function* () {
      const error = yield* foldError([
        ...table,
        new E.ChipsTransferred({ from: a, to: b, amount: Chips.make(1001) }),
      ]);
      expect(error._tag).toBe("InsufficientBalance");
    }),
  );

  it.effect(
    "an adjustment must agree with the balance it claims to replace",
    () =>
      Effect.gen(function* () {
        const adjust = (previous: number, next: number) =>
          new E.BalanceAdjusted({
            player: a,
            previous: Chips.make(previous),
            next: Chips.make(next),
          });

        const state = yield* fold([...table, adjust(1000, 1200)]);
        expect(balanceOf(state, a)).toBe(1200);

        const error = yield* foldError([...table, adjust(999, 1200)]);
        expect(error._tag).toBe("InconsistentEventLog");
      }),
  );

  it.effect("finishing the session leaves balances intact", () =>
    Effect.gen(function* () {
      const state = yield* fold([...table, new E.SessionFinished()]);
      expect(state.finished).toBe(true);
      expect(balanceOf(state, a)).toBe(1000);
    }),
  );
});

describe("fold: hand lifecycle", () => {
  it.effect("starting a hand seats the button and the participants", () =>
    Effect.gen(function* () {
      const state = yield* fold([
        ...table,
        new E.HandStarted({
          handId: "h1" as HandId,
          players: [a, b, c],
          button: 0,
        }),
      ]);
      expect(state.hand?.id).toBe("h1");
      expect(state.hand?.players).toEqual([a, b, c]);
      expect(state.hand?.button).toBe(0);
      expect(state.hand?.street).toBe("preflop");
      // Nobody is on the clock until the blinds are down.
      expect(state.hand?.actingIndex).toBeUndefined();
    }),
  );

  it.effect("blinds are debited and open the action under the gun", () =>
    Effect.gen(function* () {
      const state = yield* fold(handOpen);
      expect(balanceOf(state, b)).toBe(995);
      expect(balanceOf(state, c)).toBe(990);
      expect(state.hand?.currentBet).toBe(10);
      expect(actingPlayer(state.hand!)).toBe(a);
    }),
  );

  it.effect(
    "a called round advances the street with contributions retained",
    () =>
      Effect.gen(function* () {
        const state = yield* fold(preflopLimped);
        const hand = state.hand!;
        expect(hand.street).toBe("flop");
        expect(contributionOf(hand, a)).toBe(10);
        expect(contributionOf(hand, b)).toBe(10);
        expect(contributionOf(hand, c)).toBe(10);
        expect(hand.roundContributions.size).toBe(0);
        expect(hand.currentBet).toBe(0);
        // Left of the button acts first after the flop.
        expect(actingPlayer(hand)).toBe(b);
        expect(balanceOf(state, a)).toBe(990);
      }),
  );

  it.effect("folding down to one player takes everyone off the clock", () =>
    Effect.gen(function* () {
      const state = yield* fold([
        ...handOpen,
        acted(a, new E.Fold()),
        acted(b, new E.Fold()),
      ]);
      const hand = state.hand!;
      expect(hand.folded).toEqual(new Set([a, b]));
      expect(hand.actingIndex).toBeUndefined();
      expect(hand.complete).toBe(false);
    }),
  );

  it.effect(
    "board and hole cards are recorded, and duplicates are rejected",
    () =>
      Effect.gen(function* () {
        const flop = [
          new E.BoardCardSet({ index: 0, card: "As" as Card }),
          new E.BoardCardSet({ index: 1, card: "Kd" as Card }),
        ];
        const state = yield* fold([
          ...preflopLimped,
          ...flop,
          new E.HoleCardsSet({ player: a, cards: ["2c", "3c"] as const }),
        ]);
        expect(state.hand?.board.slice(0, 2)).toEqual(["As", "Kd"]);
        expect(state.hand?.holeCards.get(a)).toEqual(["2c", "3c"]);

        const error = yield* foldError([
          ...preflopLimped,
          ...flop,
          new E.HoleCardsSet({ player: a, cards: ["As", "3c"] as const }),
        ]);
        expect(error._tag).toBe("DuplicateCard");
      }),
  );

  it.effect("an uncalled bet leaves the contributions and comes back", () =>
    Effect.gen(function* () {
      const state = yield* fold([
        ...preflopLimped,
        acted(b, new E.Check()),
        acted(
          c,
          new E.Raise({
            to: Chips.make(50),
            amount: Chips.make(50),
            allIn: false,
          }),
        ),
        acted(a, new E.Fold()),
        acted(b, new E.Fold()),
        new E.UncalledBetReturned({ player: c, amount: Chips.make(50) }),
      ]);
      const hand = state.hand!;
      expect(contributionOf(hand, c)).toBe(10);
      expect(hand.returned.get(c)).toBe(50);
      expect(balanceOf(state, c)).toBe(990);
      // The pot is exactly what everyone actually put in.
      expect(buildPots(hand.contributions, [c])).toEqual([
        { amount: 30, eligible: [c] },
      ]);
    }),
  );

  it.effect(
    "settling records spend, clears ready, and rotates the button",
    () =>
      Effect.gen(function* () {
        const state = yield* fold([
          ...table,
          new E.PlayerReadied({ player: a }),
          ...handOpen.slice(table.length),
          acted(a, new E.Fold()),
          acted(b, new E.Fold()),
          new E.UncalledBetReturned({ player: c, amount: Chips.make(5) }),
          new E.PotAwarded({
            potIndex: 0,
            amount: Chips.make(10),
            winners: [c],
            shares: [{ player: c, amount: Chips.make(10) }],
            declared: false,
          }),
          new E.HandSettled({
            winners: [],
            handId: "h1" as HandId,
            spends: [
              { player: b, amount: Chips.make(5) },
              { player: c, amount: Chips.make(5) },
            ],
          }),
        ]);

        expect(state.hand?.complete).toBe(true);
        expect(state.handsPlayed).toBe(1);
        expect(state.lastButton).toBe(a);
        expect(state.players.get(a)?.ready).toBe(false);
        // `a` sat the hand out in every sense that matters to the credit
        // formula, so their window ages by a zero.
        expect(state.players.get(a)?.spendHistory).toEqual([0]);
        expect(state.players.get(b)?.spendHistory).toEqual([5]);
        expect(balanceOf(state, a)).toBe(1000);
        expect(balanceOf(state, b)).toBe(995);
        expect(balanceOf(state, c)).toBe(1005);
      }),
  );

  it.effect("chips are conserved across a whole hand", () =>
    Effect.gen(function* () {
      const before = yield* fold(table);
      const after = yield* fold([
        ...handOpen,
        acted(a, new E.Fold()),
        acted(b, new E.Fold()),
        new E.UncalledBetReturned({ player: c, amount: Chips.make(5) }),
        new E.PotAwarded({
          potIndex: 0,
          amount: Chips.make(10),
          winners: [c],
          shares: [{ player: c, amount: Chips.make(10) }],
          declared: false,
        }),
        new E.HandSettled({ winners: [], handId: "h1" as HandId, spends: [] }),
      ]);
      const total = (state: TableState) =>
        [...state.players.values()].reduce((sum, x) => sum + x.balance, 0);
      expect(total(after)).toBe(total(before));
    }),
  );
});

describe("fold: credit", () => {
  const busted = [
    ...table,
    new E.BalanceAdjusted({
      player: a,
      previous: config.startingBalance,
      next: Chips.zero,
    }),
    new E.CreditPending({
      player: a,
      amount: Chips.make(50),
      cooldownHands: 3,
    }),
  ];

  it.effect("a pending credit is frozen with its cooldown", () =>
    Effect.gen(function* () {
      const state = yield* fold(busted);
      expect(state.players.get(a)?.pendingCredit).toEqual({
        amount: 50,
        handsRemaining: 3,
      });
      expect(balanceOf(state, a)).toBe(0);
    }),
  );

  it.effect("each settled hand takes one hand off the cooldown", () =>
    Effect.gen(function* () {
      const state = yield* fold([
        ...busted,
        new E.HandStarted({
          handId: "h1" as HandId,
          players: [b, c],
          button: 0,
        }),
        new E.HandSettled({ winners: [], handId: "h1" as HandId, spends: [] }),
      ]);
      expect(state.players.get(a)?.pendingCredit?.handsRemaining).toBe(2);
    }),
  );

  it.effect(
    "claiming is a loan: the balance rises and the score does not",
    () =>
      Effect.gen(function* () {
        const claimable = [
          ...busted,
          new E.CreditClaimed({ player: a, amount: Chips.make(50) }),
        ];
        const error = yield* foldError(claimable);
        // Still inside the cooldown.
        expect(error._tag).toBe("InconsistentEventLog");

        const hands = [0, 1, 2].flatMap((i) => [
          new E.HandStarted({
            handId: `h${i}` as HandId,
            players: [b, c],
            button: 0,
          }),
          new E.HandSettled({
            winners: [],
            handId: `h${i}` as HandId,
            spends: [],
          }),
        ]);
        const state = yield* fold([
          ...busted,
          ...hands,
          new E.CreditClaimed({ player: a, amount: Chips.make(50) }),
        ]);
        const player = state.players.get(a)!;
        expect(player.balance).toBe(50);
        expect(player.creditTaken).toBe(50);
        expect(player.pendingCredit).toBeUndefined();
        expect(scoreOf(state, player)).toBe(50 - 1000 - 50);
      }),
  );

  it.effect("a second pending credit while one is waiting is rejected", () =>
    Effect.gen(function* () {
      const error = yield* foldError([
        ...busted,
        new E.CreditPending({
          player: a,
          amount: Chips.make(60),
          cooldownHands: 3,
        }),
      ]);
      expect(error._tag).toBe("InconsistentEventLog");
    }),
  );

  it.effect("a loss bonus counts against the score like any other credit", () =>
    Effect.gen(function* () {
      const state = yield* fold([
        ...table,
        new E.LossBonusGranted({ player: a, amount: Chips.make(15) }),
      ]);
      const player = state.players.get(a)!;
      expect(player.balance).toBe(1015);
      expect(player.creditTaken).toBe(15);
      expect(scoreOf(state, player)).toBe(0);
    }),
  );
});

describe("fold: replay equals incremental application", () => {
  const fullHand = [
    ...preflopLimped,
    new E.BoardCardSet({ index: 0, card: "As" as Card }),
    new E.BoardCardSet({ index: 1, card: "Kd" as Card }),
    new E.BoardCardSet({ index: 2, card: "7h" as Card }),
    new E.HoleCardsSet({ player: a, cards: ["2c", "3c"] as const }),
    acted(b, new E.Check()),
    acted(
      c,
      new E.Raise({ to: Chips.make(50), amount: Chips.make(50), allIn: false }),
    ),
    acted(a, new E.Fold()),
    acted(b, new E.Call({ amount: Chips.make(50), allIn: false })),
    new E.BoardCardSet({ index: 3, card: "9s" as Card }),
    acted(b, new E.Check()),
    acted(c, new E.Check()),
    new E.BoardCardSet({ index: 4, card: "2d" as Card }),
    acted(b, new E.Check()),
    acted(c, new E.Check()),
    new E.PotAwarded({
      potIndex: 0,
      amount: Chips.make(130),
      winners: [b],
      shares: [{ player: b, amount: Chips.make(130) }],
      declared: false,
    }),
    new E.HandSettled({
      winners: [],
      handId: "h1" as HandId,
      spends: [
        { player: a, amount: Chips.make(10) },
        { player: b, amount: Chips.make(60) },
        { player: c, amount: Chips.make(60) },
      ],
    }),
  ];

  it.effect("a full hand reaches showdown with the pot intact", () =>
    Effect.gen(function* () {
      const state = yield* fold(fullHand);
      expect(state.hand?.street).toBe("showdown");
      expect(state.hand?.complete).toBe(true);
      expect(balanceOf(state, a)).toBe(990);
      expect(balanceOf(state, b)).toBe(1070);
      expect(balanceOf(state, c)).toBe(940);
    }),
  );

  it.effect(
    "folding the log at once matches applying it one event at a time",
    () =>
      Effect.gen(function* () {
        const events = store(fullHand);
        const atOnce = yield* foldEvents(config, events);

        let incremental = initialState(config);
        for (const event of events) {
          incremental = yield* applyEvent(incremental, event);
        }

        expect(incremental).toEqual(atOnce);
      }),
  );

  it.effect("a prefix of the log is the state that prefix left behind", () =>
    Effect.gen(function* () {
      // Restart mid-hand: replaying only what had been written must give
      // exactly the state that was live at that moment.
      const events = store(fullHand);
      for (let cut = 1; cut <= events.length; cut++) {
        const stepwise = yield* Effect.reduce(
          events.slice(0, cut),
          () => initialState(config),
          applyEvent,
        );
        const replayed = yield* foldEvents(config, events.slice(0, cut));
        expect(replayed).toEqual(stepwise);
        expect(replayed.seq).toBe(cut);
      }
    }),
  );
});

describe("fold: illegal transitions are unrepresentable", () => {
  it.effect("a hand cannot start with fewer than two players", () =>
    Effect.gen(function* () {
      const error = yield* foldError([
        ...table,
        new E.HandStarted({
          handId: "h1" as HandId,
          players: [a],
          button: 0,
        }),
      ]);
      expect(error._tag).toBe("NotEnoughPlayers");
    }),
  );

  it.effect("a hand cannot start on top of one already running", () =>
    Effect.gen(function* () {
      const error = yield* foldError([
        ...handOpen,
        new E.HandStarted({
          handId: "h2" as HandId,
          players: [a, b, c],
          button: 1,
        }),
      ]);
      expect(error._tag).toBe("IllegalAction");
    }),
  );

  it.effect("nobody can act once the hand has been settled", () =>
    Effect.gen(function* () {
      const error = yield* foldError([
        ...handOpen,
        acted(a, new E.Fold()),
        acted(b, new E.Fold()),
        new E.HandSettled({ winners: [], handId: "h1" as HandId, spends: [] }),
        acted(c, new E.Check()),
      ]);
      expect(error._tag).toBe("IllegalAction");
      expect((error as { reason?: string }).reason).toBe("betting-closed");
    }),
  );

  it.effect("nobody can act before a hand exists", () =>
    Effect.gen(function* () {
      const error = yield* foldError([...table, acted(a, new E.Check())]);
      expect((error as { reason?: string }).reason).toBe("no-hand-in-progress");
    }),
  );

  it.effect("acting out of turn is rejected", () =>
    Effect.gen(function* () {
      const error = yield* foldError([...handOpen, acted(b, new E.Check())]);
      expect(error._tag).toBe("NotYourTurn");
    }),
  );

  it.effect("chips cannot be transferred mid-hand", () =>
    Effect.gen(function* () {
      const error = yield* foldError([
        ...handOpen,
        new E.ChipsTransferred({ from: a, to: b, amount: Chips.make(10) }),
      ]);
      expect((error as { reason?: string }).reason).toBe("hand-in-progress");
    }),
  );

  it.effect("a session cannot be finished mid-hand", () =>
    Effect.gen(function* () {
      const error = yield* foldError([...handOpen, new E.SessionFinished()]);
      expect((error as { reason?: string }).reason).toBe("hand-in-progress");
    }),
  );

  it.effect(
    "an event that moves different chips than recorded is rejected",
    () =>
      Effect.gen(function* () {
        const error = yield* foldError([
          ...handOpen,
          // `a` owes 10, not 40.
          acted(a, new E.Call({ amount: Chips.make(40), allIn: false })),
        ]);
        expect(error._tag).toBe("InconsistentEventLog");
      }),
  );
});
