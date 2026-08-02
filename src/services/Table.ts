import { Context, Effect, Layer, Ref, Semaphore } from "effect";

import type { Card } from "~/domain/Card";
import * as Chips from "~/domain/Chips";
import {
  CreditUnavailable,
  IllegalAction,
  InsufficientBalance,
  NotAdmin,
  NotEligibleForPot,
  NotEnoughPlayers,
  PlayerNotFound,
  StaleSequence,
  type IllegalActionReason,
  type IntentError,
} from "~/domain/Errors";
import * as E from "~/domain/Events";
import type { HandId, PlayerName, Seq } from "~/domain/Ids";
import type { HandState, PlayerState, TableState } from "~/domain/State";
import {
  activePlayers,
  contributionOf,
  handInProgress,
  readyToPlay,
  revealedBoard,
} from "~/domain/State";
import {
  applyAction,
  emptyHand,
  postBlind,
  type ActionIntent,
} from "~/rules/betting";
import {
  setBoardCard as checkBoardCard,
  setHoleCards as checkHoleCards,
} from "~/rules/cards";
import { burnoutOnSettle, lossBonusOnSettle } from "~/rules/credit";
import { canEvaluate, winnersFromCards } from "~/rules/evaluate";
import {
  blindSeats,
  nextButtonIndex,
  randomButtonIndex,
} from "~/rules/positions";
import {
  buildPots,
  returnUncalled,
  splitPot,
  type PotAward,
} from "~/rules/pots";
import { AppConfig } from "~/services/AppConfig";
import { EventStore } from "~/services/EventStore";
import {
  applyEvent,
  foldEvents,
  initialState,
  MIN_PLAYERS_PER_HAND,
  type FoldError,
} from "~/state/fold";
import { buildSnapshot, type TableSnapshot } from "~/state/snapshot";

/**
 * Client intents → events (appended durably before notifying anyone) →
 * fold into state → snapshot. `Semaphore` serializes so concurrent
 * intents can't race for `seq`. Settlement is atomic per pot batch.
 */

export type TableIntentError = IntentError | FoldError;

export interface TableService {
  readonly snapshotFor: (recipient: PlayerName) => Effect.Effect<TableSnapshot>;
  readonly currentState: Effect.Effect<TableState>;

  readonly join: (
    name: PlayerName,
  ) => Effect.Effect<TableSnapshot, TableIntentError>;
  readonly ready: (
    player: PlayerName,
    seq: Seq,
  ) => Effect.Effect<TableSnapshot, TableIntentError>;
  readonly unready: (
    player: PlayerName,
    seq: Seq,
  ) => Effect.Effect<TableSnapshot, TableIntentError>;
  readonly leave: (
    player: PlayerName,
    seq: Seq,
  ) => Effect.Effect<TableSnapshot, TableIntentError>;

  readonly startHand: (
    by: PlayerName,
    seq: Seq,
    dealer?: PlayerName,
  ) => Effect.Effect<TableSnapshot, TableIntentError>;

  readonly reorderSeats: (
    by: PlayerName,
    seq: Seq,
    order: ReadonlyArray<PlayerName>,
  ) => Effect.Effect<TableSnapshot, TableIntentError>;

  readonly act: (
    player: PlayerName,
    seq: Seq,
    intent: ActionIntent,
  ) => Effect.Effect<TableSnapshot, TableIntentError>;

  readonly setBoardCard: (
    by: PlayerName,
    seq: Seq,
    index: number,
    card: Card | undefined,
  ) => Effect.Effect<TableSnapshot, TableIntentError>;

  readonly setHoleCards: (
    by: PlayerName,
    seq: Seq,
    target: PlayerName,
    cards: readonly [Card, Card] | undefined,
  ) => Effect.Effect<TableSnapshot, TableIntentError>;

  readonly declareWinners: (
    by: PlayerName,
    seq: Seq,
    awards: ReadonlyArray<{
      readonly potIndex: number;
      readonly winners: ReadonlyArray<PlayerName>;
    }>,
  ) => Effect.Effect<TableSnapshot, TableIntentError>;

  readonly adjustBalance: (
    by: PlayerName,
    seq: Seq,
    player: PlayerName,
    next: Chips.Chips,
  ) => Effect.Effect<TableSnapshot, TableIntentError>;

  readonly transfer: (
    from: PlayerName,
    seq: Seq,
    to: PlayerName,
    amount: Chips.Chips,
  ) => Effect.Effect<TableSnapshot, TableIntentError>;

  readonly claimCredit: (
    player: PlayerName,
    seq: Seq,
  ) => Effect.Effect<TableSnapshot, TableIntentError>;

  readonly finishSession: (
    by: PlayerName,
    seq: Seq,
  ) => Effect.Effect<TableSnapshot, TableIntentError>;

  /** Discards the hand in progress: refunds every contribution and returns to the ready-up screen. Doesn't count as a played hand. */
  readonly abortHand: (
    by: PlayerName,
    seq: Seq,
  ) => Effect.Effect<TableSnapshot, TableIntentError>;

  /** Erases every event and player, leaving a table as blank as a fresh install. */
  readonly wipeAll: (
    by: PlayerName,
    seq: Seq,
  ) => Effect.Effect<TableSnapshot, TableIntentError>;
}

export class Table extends Context.Service<Table, TableService>()(
  "@lan-poker/Table",
) {
  static readonly layer = Layer.effect(
    Table,
    Effect.suspend(() => make),
  );
}

const illegal = (
  reason: IllegalActionReason,
  detail?: string,
): Effect.Effect<never, IllegalAction> =>
  Effect.fail(new IllegalAction({ reason, detail }));

const requireAdmin = (
  state: TableState,
  by: PlayerName,
): Effect.Effect<void, IntentError> =>
  state.config.isAdmin(by)
    ? Effect.void
    : Effect.fail(new NotAdmin({ player: by }));

const requirePlayer = (
  state: TableState,
  player: PlayerName,
): Effect.Effect<PlayerState, IntentError> => {
  const found = state.players.get(player);
  return found === undefined
    ? Effect.fail(new PlayerNotFound({ player }))
    : Effect.succeed(found);
};

const requireHand = (
  state: TableState,
): Effect.Effect<HandState, IntentError> =>
  state.hand === undefined
    ? illegal("no-hand-in-progress")
    : Effect.succeed(state.hand);

const checkSeq = (
  state: TableState,
  submitted: Seq,
): Effect.Effect<void, IntentError> =>
  submitted === state.seq
    ? Effect.void
    : Effect.fail(new StaleSequence({ submitted, current: state.seq }));

/** Winners for every pot, resolved automatically -- no cards required. */
const soleSurvivorPicker = (
  eligible: ReadonlyArray<PlayerName>,
): ReadonlyArray<PlayerName> => eligible;

const make = Effect.gen(function* () {
  const store = yield* EventStore;
  const appConfig = yield* AppConfig;
  const gate = yield* Semaphore.make(1);

  const tableId = yield* store.tableId.pipe(Effect.orDie);
  const config = appConfig.build(tableId);
  const existingLog = yield* store.readAll.pipe(Effect.orDie);

  const log =
    existingLog.length > 0
      ? existingLog
      : [{ seq: 1, event: new E.TableCreated({ tableId }), at: 0 }];
  if (existingLog.length === 0) {
    yield* store.append(log[0]!.event).pipe(Effect.orDie);
  }

  const initial = yield* foldEvents(config, log).pipe(Effect.orDie);
  const stateRef = yield* Ref.make(initial);

  /** Append one event, fold it in, and persist the new state version. */
  const commit = (event: E.TableEvent): Effect.Effect<TableState, FoldError> =>
    Effect.gen(function* () {
      const stored = yield* store.append(event).pipe(Effect.orDie);
      const state = yield* Ref.get(stateRef);
      const next = yield* applyEvent(state, stored);
      yield* Ref.set(stateRef, next);
      return next;
    });

  const commitAll = (
    events: ReadonlyArray<E.TableEvent>,
  ): Effect.Effect<TableState, FoldError> =>
    Effect.gen(function* () {
      let state = yield* Ref.get(stateRef);
      for (const event of events) state = yield* commit(event);
      return state;
    });

  /**
   * Run the settlement pipeline for the hand in progress, given a resolved
   * picker for every pot. Produces uncalled-bet-return, pot awards, the
   * settlement event, and any credit this hand triggers -- in that order,
   * since credit is decided from balances *after* the pots have landed.
   */
  const settle = (
    hand: HandState,
    state: TableState,
    pickWinners: (
      eligible: ReadonlyArray<PlayerName>,
    ) => ReadonlyArray<PlayerName>,
  ): Effect.Effect<TableState, FoldError> =>
    Effect.gen(function* () {
      const active = activePlayers(hand);
      const { contributions, returned } = returnUncalled(
        hand.contributions,
        active,
      );

      const events: Array<E.TableEvent> = [];
      for (const [player, amount] of returned) {
        if (amount > 0)
          events.push(new E.UncalledBetReturned({ player, amount }));
      }

      const pots = buildPots(contributions, active);
      const awards: ReadonlyArray<PotAward> = pots.map((pot, potIndex) => {
        const winners = pickWinners(pot.eligible);
        return {
          potIndex,
          amount: pot.amount,
          winners,
          shares: splitPot(pot.amount, winners, state.seatOrder, hand.button),
        };
      });
      for (const award of awards) {
        events.push(
          new E.PotAwarded({
            potIndex: award.potIndex,
            amount: award.amount,
            winners: award.winners,
            shares: award.shares,
            declared: false,
          }),
        );
      }

      const spends = hand.players.map((player) => ({
        player,
        amount: (contributions.get(player) ?? Chips.zero) as Chips.Chips,
      }));
      events.push(
        new E.HandSettled({
          handId: hand.id as HandId,
          spends,
          winners: [...new Set(awards.flatMap((a) => a.winners))],
        }),
      );

      let next = yield* commitAll(events);

      // Credit is decided from post-settlement balances, one hand
      // participant at a time.
      const creditEvents: Array<E.TableEvent> = [];
      const wonAnything = new Set(
        awards.flatMap((a) =>
          a.shares.filter((s) => s.amount > 0).map((s) => s.player),
        ),
      );
      for (const name of hand.players) {
        const player = next.players.get(name);
        if (player === undefined) continue;

        const grant = burnoutOnSettle(player, state.config);
        if (grant !== undefined) {
          creditEvents.push(
            new E.CreditPending({
              player: grant.player,
              amount: grant.amount,
              cooldownHands: grant.cooldownHands,
            }),
          );
          continue;
        }

        const spend =
          spends.find((s) => s.player === name)?.amount ?? Chips.zero;
        const bonus = lossBonusOnSettle(
          state.config,
          spend,
          wonAnything.has(name),
        );
        if (bonus !== undefined) {
          creditEvents.push(
            new E.LossBonusGranted({ player: name, amount: bonus }),
          );
        }
      }

      if (creditEvents.length > 0) next = yield* commitAll(creditEvents);
      return next;
    });

  /** After any event that could end betting: auto-settle if only one
   * remains or all cards are known at showdown. */
  const autoAdvance = (
    state: TableState,
  ): Effect.Effect<TableState, FoldError> =>
    Effect.gen(function* () {
      const hand = state.hand;
      if (hand === undefined || hand.complete) return state;

      const active = activePlayers(hand);
      const atShowdown = hand.street === "showdown";
      if (!atShowdown && active.length > 1) return state;

      if (active.length === 1)
        return yield* settle(hand, state, soleSurvivorPicker);

      if (!canEvaluate(revealedBoard(hand), hand.holeCards, active))
        return state;
      const picker = winnersFromCards(revealedBoard(hand), hand.holeCards)!;
      return yield* settle(hand, state, picker);
    });

  const dispatch = (
    decide: (
      state: TableState,
    ) => Effect.Effect<ReadonlyArray<E.TableEvent>, IntentError>,
  ): Effect.Effect<TableState, TableIntentError> =>
    gate.withPermits(1)(
      Effect.gen(function* () {
        const state = yield* Ref.get(stateRef);
        const events = yield* decide(state);
        const committed = yield* commitAll(events);
        return yield* autoAdvance(committed);
      }),
    );

  const snapshotFor = (recipient: PlayerName): Effect.Effect<TableSnapshot> =>
    Effect.map(Ref.get(stateRef), (state) => buildSnapshot(state, recipient));

  const join = (
    name: PlayerName,
  ): Effect.Effect<TableSnapshot, TableIntentError> =>
    gate.withPermits(1)(
      Effect.gen(function* () {
        const { created } = yield* store.ensurePlayer(name).pipe(Effect.orDie);
        const state = yield* Ref.get(stateRef);
        const event = created
          ? new E.PlayerJoined({
              player: name,
              startingBalance: state.config.startingBalance,
            })
          : new E.PlayerRejoined({ player: name });
        const committed = yield* commitAll([event]);
        return buildSnapshot(committed, name);
      }),
    );

  const ready = (player: PlayerName, seq: Seq) =>
    Effect.map(
      dispatch((state) =>
        Effect.gen(function* () {
          yield* checkSeq(state, seq);
          yield* requirePlayer(state, player);
          return [new E.PlayerReadied({ player })];
        }),
      ),
      (state) => buildSnapshot(state, player),
    );

  const unready = (player: PlayerName, seq: Seq) =>
    Effect.map(
      dispatch((state) =>
        Effect.gen(function* () {
          yield* checkSeq(state, seq);
          yield* requirePlayer(state, player);
          return [new E.PlayerUnreadied({ player })];
        }),
      ),
      (state) => buildSnapshot(state, player),
    );

  const leave = (player: PlayerName, seq: Seq) =>
    Effect.map(
      dispatch((state) =>
        Effect.gen(function* () {
          yield* checkSeq(state, seq);
          yield* requirePlayer(state, player);
          return [new E.PlayerLeft({ player })];
        }),
      ),
      (state) => buildSnapshot(state, player),
    );

  const startHand = (by: PlayerName, seq: Seq, dealer?: PlayerName) =>
    Effect.map(
      dispatch((state) =>
        Effect.gen(function* () {
          yield* checkSeq(state, seq);
          yield* requireAdmin(state, by);
          if (handInProgress(state)) return yield* illegal("hand-in-progress");

          const ready = readyToPlay(state);
          if (ready.length < MIN_PLAYERS_PER_HAND) {
            return yield* new NotEnoughPlayers({
              ready: ready.length,
              required: MIN_PLAYERS_PER_HAND,
            });
          }

          const players = ready.map((p) => p.name);

          let button: number;
          if (dealer !== undefined) {
            const idx = players.indexOf(dealer);
            if (idx === -1)
              return yield* new PlayerNotFound({ player: dealer });
            button = idx;
          } else {
            if (state.lastButton === undefined) {
              const seatIdx = state.seatOrder.findIndex((s) =>
                players.includes(s),
              );
              button =
                seatIdx === -1
                  ? randomButtonIndex(players.length)
                  : players.indexOf(state.seatOrder[seatIdx]!);
            } else {
              button = nextButtonIndex(
                players,
                state.seatOrder,
                state.lastButton,
              );
            }
          }

          const handId = crypto.randomUUID() as HandId;
          const started = new E.HandStarted({ handId, players, button });

          const seats = blindSeats(players.length, button);
          const balanceOf = (name: PlayerName) =>
            state.players.get(name)!.balance;

          const sbPlayer = players[seats.smallBlind]!;
          const bbPlayer = players[seats.bigBlind]!;
          const scratch = emptyHand(handId, players, button);
          const sb = postBlind(
            scratch,
            sbPlayer,
            "small",
            state.config.smallBlind,
            balanceOf(sbPlayer),
          );
          const bb = postBlind(
            sb.hand,
            bbPlayer,
            "big",
            state.config.bigBlind,
            balanceOf(bbPlayer),
          );

          return [started, sb.event, bb.event];
        }),
      ),
      (state) => buildSnapshot(state, by),
    );

  const act = (player: PlayerName, seq: Seq, intent: ActionIntent) =>
    Effect.map(
      dispatch((state) =>
        Effect.gen(function* () {
          yield* checkSeq(state, seq);
          const hand = yield* requireHand(state);
          const playerState = yield* requirePlayer(state, player);
          const result = applyAction(
            hand,
            state.config,
            player,
            playerState.balance,
            intent,
          );
          if (!result.ok) return yield* result.error;
          return [result.event];
        }),
      ),
      (state) => buildSnapshot(state, player),
    );

  const setBoardCard = (
    by: PlayerName,
    seq: Seq,
    index: number,
    card: Card | undefined,
  ) =>
    Effect.map(
      dispatch((state) =>
        Effect.gen(function* () {
          yield* checkSeq(state, seq);
          yield* requireAdmin(state, by);
          const hand = yield* requireHand(state);
          const result = checkBoardCard(hand, index, card);
          if (!result.ok) return yield* result.error;
          return [new E.BoardCardSet({ index, card })];
        }),
      ),
      (state) => buildSnapshot(state, by),
    );

  const setHoleCards = (
    by: PlayerName,
    seq: Seq,
    target: PlayerName,
    cards: readonly [Card, Card] | undefined,
  ) =>
    Effect.map(
      dispatch((state) =>
        Effect.gen(function* () {
          yield* checkSeq(state, seq);
          const hand = yield* requireHand(state);
          if (by !== target && !state.config.isAdmin(by)) {
            return yield* new NotAdmin({ player: by });
          }
          if (!hand.players.includes(target))
            return yield* illegal("player-not-in-hand");
          const result = checkHoleCards(hand, target, cards);
          if (!result.ok) return yield* result.error;
          return [new E.HoleCardsSet({ player: target, cards })];
        }),
      ),
      (state) => buildSnapshot(state, by),
    );

  const declareWinners = (
    by: PlayerName,
    seq: Seq,
    awards: ReadonlyArray<{
      readonly potIndex: number;
      readonly winners: ReadonlyArray<PlayerName>;
    }>,
  ) =>
    Effect.map(
      gate.withPermits(1)(
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef);
          yield* checkSeq(state, seq);
          yield* requireAdmin(state, by);
          const hand = yield* requireHand(state);
          if (hand.complete)
            return yield* illegal(
              "betting-closed",
              "This hand has already been settled.",
            );

          const active = activePlayers(hand);
          const { contributions } = returnUncalled(hand.contributions, active);
          const pots = buildPots(contributions, active);

          if (awards.length !== pots.length) {
            return yield* illegal(
              "betting-closed",
              `expected declarations for ${pots.length} pot(s), got ${awards.length}`,
            );
          }

          const byIndex = new Map(awards.map((a) => [a.potIndex, a.winners]));
          for (let i = 0; i < pots.length; i++) {
            const winners = byIndex.get(i);
            if (winners === undefined || winners.length === 0) {
              return yield* illegal(
                "betting-closed",
                `pot ${i} has no declared winner`,
              );
            }
            for (const winner of winners) {
              if (!pots[i]!.eligible.includes(winner)) {
                return yield* new NotEligibleForPot({
                  player: winner,
                  potIndex: i,
                });
              }
            }
          }

          const picker = (
            eligible: ReadonlyArray<PlayerName>,
          ): ReadonlyArray<PlayerName> => {
            const index = pots.findIndex(
              (p) =>
                p.eligible.length === eligible.length &&
                p.eligible.every((x) => eligible.includes(x)),
            );
            return index === -1 ? [] : (byIndex.get(index) ?? []);
          };

          return yield* settle(hand, state, picker);
        }),
      ),
      (state) => buildSnapshot(state, by),
    );

  const adjustBalance = (
    by: PlayerName,
    seq: Seq,
    player: PlayerName,
    next: Chips.Chips,
  ) =>
    Effect.map(
      dispatch((state) =>
        Effect.gen(function* () {
          yield* checkSeq(state, seq);
          yield* requireAdmin(state, by);
          const current = yield* requirePlayer(state, player);
          return [
            new E.BalanceAdjusted({ player, previous: current.balance, next }),
          ];
        }),
      ),
      (state) => buildSnapshot(state, by),
    );

  const transfer = (
    from: PlayerName,
    seq: Seq,
    to: PlayerName,
    amount: Chips.Chips,
  ) =>
    Effect.map(
      dispatch((state) =>
        Effect.gen(function* () {
          yield* checkSeq(state, seq);
          const sender = yield* requirePlayer(state, from);
          yield* requirePlayer(state, to);
          if (handInProgress(state)) {
            return yield* illegal(
              "hand-in-progress",
              "chips can only be transferred between hands",
            );
          }
          if (sender.balance < amount) {
            return yield* new InsufficientBalance({
              player: from,
              required: amount,
              available: sender.balance,
            });
          }
          return [new E.ChipsTransferred({ from, to, amount })];
        }),
      ),
      (state) => buildSnapshot(state, from),
    );

  const claimCredit = (player: PlayerName, seq: Seq) =>
    Effect.map(
      dispatch((state) =>
        Effect.gen(function* () {
          yield* checkSeq(state, seq);
          const current = yield* requirePlayer(state, player);
          const pending = current.pendingCredit;

          if (state.config.mode === "DISABLED" || pending === undefined) {
            return yield* new CreditUnavailable({
              player,
              reason:
                state.config.mode === "DISABLED"
                  ? "mode-disabled"
                  : "no-pending-credit",
              handsRemaining: undefined,
            });
          }
          if (pending.handsRemaining > 0) {
            return yield* new CreditUnavailable({
              player,
              reason: "cooldown-active",
              handsRemaining: pending.handsRemaining,
            });
          }
          return [new E.CreditClaimed({ player, amount: pending.amount })];
        }),
      ),
      (state) => buildSnapshot(state, player),
    );

  const finishSession = (by: PlayerName, seq: Seq) =>
    Effect.map(
      dispatch((state) =>
        Effect.gen(function* () {
          yield* checkSeq(state, seq);
          yield* requireAdmin(state, by);
          if (handInProgress(state)) {
            return yield* illegal(
              "hand-in-progress",
              "finish the hand before ending the session",
            );
          }
          return [new E.SessionFinished()];
        }),
      ),
      (state) => buildSnapshot(state, by),
    );

  const abortHand = (by: PlayerName, seq: Seq) =>
    Effect.map(
      dispatch((state) =>
        Effect.gen(function* () {
          yield* checkSeq(state, seq);
          yield* requireAdmin(state, by);
          const hand = yield* requireHand(state);
          const refunds = hand.players.map((player) => ({
            player,
            amount: contributionOf(hand, player),
          }));
          return [new E.HandAborted({ handId: hand.id as HandId, refunds })];
        }),
      ),
      (state) => buildSnapshot(state, by),
    );

  const wipeAll = (by: PlayerName, seq: Seq) =>
    gate.withPermits(1)(
      Effect.gen(function* () {
        const state = yield* Ref.get(stateRef);
        yield* checkSeq(state, seq);
        yield* requireAdmin(state, by);
        yield* store.wipe.pipe(Effect.orDie);
        const stored = yield* store
          .append(new E.TableCreated({ tableId: config.id }))
          .pipe(Effect.orDie);
        const fresh = yield* applyEvent(initialState(config), stored);
        yield* Ref.set(stateRef, fresh);
        return buildSnapshot(fresh, by);
      }),
    );

  const reorderSeats = (
    by: PlayerName,
    seq: Seq,
    order: ReadonlyArray<PlayerName>,
  ) =>
    Effect.map(
      dispatch((state) =>
        Effect.gen(function* () {
          yield* checkSeq(state, seq);
          yield* requireAdmin(state, by);
          const existing = new Set(state.seatOrder);
          for (const name of order) {
            if (!existing.has(name))
              return yield* new PlayerNotFound({ player: name });
          }
          if (order.length !== existing.size) {
            return yield* illegal(
              "no-hand-in-progress",
              "seat order must contain every player exactly once",
            );
          }
          return [new E.SeatsReordered({ order: [...order] })];
        }),
      ),
      (state) => buildSnapshot(state, by),
    );

  return {
    snapshotFor,
    currentState: Ref.get(stateRef),
    join,
    ready,
    unready,
    leave,
    startHand,
    act,
    setBoardCard,
    setHoleCards,
    declareWinners,
    adjustBalance,
    transfer,
    claimCredit,
    finishSession,
    abortHand,
    wipeAll,
    reorderSeats,
  };
});
