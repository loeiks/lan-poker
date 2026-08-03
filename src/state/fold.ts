import { Effect } from "effect";

import * as Chips from "~/domain/Chips";
import {
  type BoardFull,
  type DuplicateCard,
  IllegalAction,
  type IllegalActionReason,
  InconsistentEventLog,
  InsufficientBalance,
  NotEnoughPlayers,
  type NotYourTurn,
  PlayerNotFound,
} from "~/domain/Errors";
import type * as E from "~/domain/Events";
import type { PlayerName, Seq } from "~/domain/Ids";
import { initialSeq } from "~/domain/Ids";
import type { HandState, PlayerState, TableState } from "~/domain/State";
import { buttonPlayer, handInProgress } from "~/domain/State";
import type { TableConfig } from "~/domain/TableConfig";
import {
  type ActionIntent,
  advanceStreet,
  applyAction,
  bettingExhausted,
  commit,
  emptyHand,
  isRoundClosed,
  onlyOneLeft,
  openRound,
  skipToShowdown,
} from "~/rules/betting";
import { setBoardCard, setHoleCards } from "~/rules/cards";
import { tickCooldown } from "~/rules/credit";

/**
 * The only way `TableState` is ever produced -- restart, reconnect, and the
 * live table all replay the same log. Street and all chip figures besides
 * balances are re-derived here rather than stored, so they can't drift.
 */

export type FoldError =
  | IllegalAction
  | NotYourTurn
  | NotEnoughPlayers
  | PlayerNotFound
  | InsufficientBalance
  | DuplicateCard
  | BoardFull
  | InconsistentEventLog;

export const MIN_PLAYERS_PER_HAND = 2;

export const initialState = (config: TableConfig): TableState => ({
  config,
  seq: initialSeq,
  players: new Map(),
  seatOrder: [],
  hand: undefined,
  handsPlayed: 0,
  lastButton: undefined,
  finished: false,
  lastWinners: undefined,
});

const illegal = (
  reason: IllegalActionReason,
  detail?: string,
): Effect.Effect<never, IllegalAction> =>
  Effect.fail(new IllegalAction({ reason, detail }));

const corrupt = (
  seq: Seq,
  event: E.TableEvent,
  detail: string,
): Effect.Effect<never, InconsistentEventLog> =>
  Effect.fail(new InconsistentEventLog({ seq, event: event._tag, detail }));

const requirePlayer = (
  state: TableState,
  player: PlayerName,
): Effect.Effect<PlayerState, PlayerNotFound> => {
  const found = state.players.get(player);
  return found === undefined
    ? Effect.fail(new PlayerNotFound({ player }))
    : Effect.succeed(found);
};

const requireHand = (
  state: TableState,
): Effect.Effect<HandState, IllegalAction> =>
  state.hand === undefined
    ? illegal("no-hand-in-progress")
    : Effect.succeed(state.hand);

const withPlayer = (
  state: TableState,
  player: PlayerName,
  update: (current: PlayerState) => PlayerState,
): TableState => {
  const current = state.players.get(player);
  if (current === undefined) return state;
  const players = new Map(state.players);
  players.set(player, update(current));
  return { ...state, players };
};

const withEveryPlayer = (
  state: TableState,
  update: (current: PlayerState) => PlayerState,
): TableState => ({
  ...state,
  players: new Map(
    [...state.players].map(([name, player]) => [name, update(player)]),
  ),
});

const credit = (
  state: TableState,
  player: PlayerName,
  amount: Chips.Chips,
): TableState =>
  withPlayer(state, player, (p) => ({
    ...p,
    balance: Chips.add(p.balance, amount),
  }));

const withHand = (state: TableState, hand: HandState): TableState => ({
  ...state,
  hand,
});

// Called after every chip-moving event; street transitions are consequences,
// not events. Recursive since one action can close multiple streets at once
// (e.g. everyone all-in preflop).
const settleStreets = (hand: HandState): HandState => {
  if (hand.complete) return hand;
  if (onlyOneLeft(hand)) return { ...hand, actingIndex: undefined };
  if (!isRoundClosed(hand)) return hand;
  if (bettingExhausted(hand)) return skipToShowdown(hand);
  if (hand.street === "showdown") return hand;
  return settleStreets(advanceStreet(hand));
};

/** The intent that produced a recorded action, so replay can re-derive it. */
const intentOf = (action: E.BettingAction): ActionIntent => {
  switch (action._tag) {
    case "Check":
      return { kind: "check" };
    case "Fold":
      return { kind: "fold" };
    case "Call":
      return { kind: "call" };
    case "AllIn":
      return { kind: "allin" };
    case "Raise":
      return { kind: "raise", to: action.to };
  }
};

/** Whether replay produced the same chip movement the log recorded. */
const actionMatches = (
  recorded: E.BettingAction,
  replayed: E.BettingAction,
): boolean => {
  if (recorded._tag !== replayed._tag) return false;
  switch (recorded._tag) {
    case "Check":
    case "Fold":
      return true;
    case "Call":
      return (
        recorded.amount === (replayed as E.Call).amount &&
        recorded.allIn === (replayed as E.Call).allIn
      );
    case "AllIn":
      return (
        recorded.amount === (replayed as E.AllIn).amount &&
        recorded.to === (replayed as E.AllIn).to
      );
    case "Raise":
      return (
        recorded.to === (replayed as E.Raise).to &&
        recorded.amount === (replayed as E.Raise).amount &&
        recorded.allIn === (replayed as E.Raise).allIn
      );
  }
};

const apply = (
  state: TableState,
  event: E.TableEvent,
  seq: Seq,
): Effect.Effect<TableState, FoldError> =>
  Effect.gen(function* () {
    switch (event._tag) {
      case "TableCreated": {
        if (event.tableId !== state.config.id) {
          return yield* corrupt(
            seq,
            event,
            `log belongs to table ${event.tableId}, not ${state.config.id}`,
          );
        }
        return state;
      }

      case "PlayerJoined": {
        if (state.players.has(event.player)) {
          return yield* corrupt(
            seq,
            event,
            `${event.player} has already joined; expected PlayerRejoined`,
          );
        }
        const players = new Map(state.players);
        players.set(event.player, {
          name: event.player,
          balance: event.startingBalance,
          creditTaken: Chips.zero,
          ready: false,
          seated: true,
          spendHistory: [],
          pendingCredit: undefined,
        });
        return {
          ...state,
          players,
          seatOrder: [...state.seatOrder, event.player],
        };
      }

      case "PlayerRejoined": {
        yield* requirePlayer(state, event.player);
        return withPlayer(state, event.player, (p) => ({ ...p, seated: true }));
      }

      case "PlayerReadied": {
        yield* requirePlayer(state, event.player);
        return withPlayer(state, event.player, (p) => ({ ...p, ready: true }));
      }

      case "PlayerUnreadied": {
        yield* requirePlayer(state, event.player);
        return withPlayer(state, event.player, (p) => ({ ...p, ready: false }));
      }

      case "PlayerLeft": {
        yield* requirePlayer(state, event.player);
        // Their seat stays in `seatOrder` so button rotation and the
        // leaderboard both keep working after they have gone home.
        return withPlayer(state, event.player, (p) => ({
          ...p,
          seated: false,
          ready: false,
        }));
      }

      case "ChipsTransferred": {
        if (handInProgress(state)) {
          return yield* illegal(
            "hand-in-progress",
            "chips can only be transferred between hands",
          );
        }
        const from = yield* requirePlayer(state, event.from);
        yield* requirePlayer(state, event.to);
        if (from.balance < event.amount) {
          return yield* new InsufficientBalance({
            player: event.from,
            required: event.amount,
            available: from.balance,
          });
        }
        const debited = withPlayer(state, event.from, (p) => ({
          ...p,
          balance: Chips.sub(p.balance, event.amount),
        }));
        return credit(debited, event.to, event.amount);
      }

      case "BalanceAdjusted": {
        const player = yield* requirePlayer(state, event.player);
        if (player.balance !== event.previous) {
          return yield* corrupt(
            seq,
            event,
            `${event.player} held ${player.balance}, not the recorded ${event.previous}`,
          );
        }
        return withPlayer(state, event.player, (p) => ({
          ...p,
          balance: event.next,
        }));
      }

      case "SessionFinished": {
        if (handInProgress(state)) {
          return yield* illegal(
            "hand-in-progress",
            "finish the hand before ending the session",
          );
        }
        return { ...state, finished: true };
      }

      case "SeatsReordered": {
        const existing = new Set(state.seatOrder);
        for (const name of event.order) {
          if (!existing.has(name)) {
            return yield* new PlayerNotFound({ player: name });
          }
        }
        if (event.order.length !== existing.size) {
          return yield* corrupt(
            seq,
            event,
            "seat order must contain every player exactly once",
          );
        }
        return { ...state, seatOrder: event.order };
      }

      case "HandStarted": {
        if (handInProgress(state)) {
          return yield* illegal("hand-in-progress");
        }
        if (event.players.length < MIN_PLAYERS_PER_HAND) {
          return yield* new NotEnoughPlayers({
            ready: event.players.length,
            required: MIN_PLAYERS_PER_HAND,
          });
        }
        for (const player of event.players) {
          yield* requirePlayer(state, player);
        }
        if (event.button < 0 || event.button >= event.players.length) {
          return yield* corrupt(
            seq,
            event,
            `button ${event.button} is not a seat in a ${event.players.length}-player hand`,
          );
        }
        return {
          ...state,
          finished: false,
          hand: emptyHand(event.handId, event.players, event.button),
          lastWinners: undefined,
        };
      }

      case "BlindPosted": {
        const hand = yield* requireHand(state);
        const player = yield* requirePlayer(state, event.player);
        if (!hand.players.includes(event.player)) {
          return yield* illegal("player-not-in-hand");
        }
        if (player.balance < event.amount) {
          return yield* new InsufficientBalance({
            player: event.player,
            required: event.amount,
            available: player.balance,
          });
        }
        const posted = commit(hand, event.player, event.amount, event.allIn);
        // Both blinds are always posted, so the big blind is the reliable
        // signal that the preflop round can open.
        const opened = event.kind === "big" ? openRound(posted) : posted;
        const debited = withPlayer(state, event.player, (p) => ({
          ...p,
          balance: Chips.sub(p.balance, event.amount),
        }));
        return withHand(debited, settleStreets(opened));
      }

      case "PlayerActed": {
        const hand = yield* requireHand(state);
        const player = yield* requirePlayer(state, event.player);
        const result = applyAction(
          hand,
          state.config,
          event.player,
          player.balance,
          intentOf(event.action),
        );
        if (!result.ok) return yield* result.error as FoldError;
        if (!actionMatches(event.action, result.event.action)) {
          return yield* corrupt(
            seq,
            event,
            `replaying ${event.action._tag} for ${event.player} moved different chips than the log recorded`,
          );
        }
        const debited = withPlayer(state, event.player, (p) => ({
          ...p,
          balance: Chips.sub(p.balance, result.spent),
        }));
        return withHand(debited, settleStreets(result.hand));
      }

      case "BoardCardSet": {
        const hand = yield* requireHand(state);
        const result = setBoardCard(hand, event.index, event.card);
        if (!result.ok) return state;
        return withHand(state, result.hand);
      }

      case "HoleCardsSet": {
        const hand = yield* requireHand(state);
        const result = setHoleCards(hand, event.player, event.cards);
        if (!result.ok) return state;
        return withHand(state, result.hand);
      }

      case "UncalledBetReturned": {
        const hand = yield* requireHand(state);
        const contributed = hand.contributions.get(event.player) ?? Chips.zero;
        if (contributed < event.amount) {
          return yield* corrupt(
            seq,
            event,
            `${event.player} contributed ${contributed}, so ${event.amount} cannot be uncalled`,
          );
        }
        // Leaves the contribution map, keeping it out of pots and recorded spend.
        const contributions = new Map(hand.contributions);
        contributions.set(event.player, Chips.sub(contributed, event.amount));
        const returned = new Map(hand.returned);
        returned.set(
          event.player,
          Chips.add(returned.get(event.player) ?? Chips.zero, event.amount),
        );
        return withHand(credit(state, event.player, event.amount), {
          ...hand,
          contributions,
          returned,
        });
      }

      case "PotAwarded": {
        yield* requireHand(state);
        let next = state;
        for (const share of event.shares) {
          yield* requirePlayer(next, share.player);
          next = credit(next, share.player, share.amount);
        }
        return next;
      }

      case "HandSettled": {
        const hand = yield* requireHand(state);
        if (hand.id !== event.handId) {
          return yield* corrupt(
            seq,
            event,
            `settling ${event.handId} while ${hand.id} is in progress`,
          );
        }
        const spends = new Map(
          event.spends.map((entry) => [entry.player, entry.amount] as const),
        );
        // Everyone still seated records a figure (zero if sitting out), so
        // their burnout window still ages.
        const recorded = withEveryPlayer(state, (p) =>
          p.seated
            ? {
                ...p,
                spendHistory: [
                  ...p.spendHistory,
                  spends.get(p.name) ?? Chips.zero,
                ],
              }
            : p,
        );
        return {
          ...withEveryPlayer(recorded, (p) =>
            tickCooldown({ ...p, ready: false }),
          ),
          hand: { ...hand, complete: true, actingIndex: undefined },
          handsPlayed: state.handsPlayed + 1,
          lastButton: buttonPlayer(hand) ?? state.lastButton,
          lastWinners: event.winners,
        };
      }

      case "CreditPending": {
        const player = yield* requirePlayer(state, event.player);
        if (player.pendingCredit !== undefined) {
          return yield* corrupt(
            seq,
            event,
            `${event.player} already has a credit pending`,
          );
        }
        return withPlayer(state, event.player, (p) => ({
          ...p,
          pendingCredit: {
            amount: event.amount,
            handsRemaining: event.cooldownHands,
          },
        }));
      }

      case "CreditClaimed": {
        const player = yield* requirePlayer(state, event.player);
        const pending = player.pendingCredit;
        if (pending === undefined || pending.amount !== event.amount) {
          return yield* corrupt(
            seq,
            event,
            `${event.player} has no pending credit of ${event.amount}`,
          );
        }
        if (pending.handsRemaining > 0) {
          return yield* corrupt(
            seq,
            event,
            `${event.player} still has ${pending.handsRemaining} hands of cooldown`,
          );
        }
        return withPlayer(state, event.player, (p) => ({
          ...p,
          balance: Chips.add(p.balance, event.amount),
          creditTaken: Chips.add(p.creditTaken, event.amount),
          pendingCredit: undefined,
        }));
      }

      case "HandAborted": {
        const hand = yield* requireHand(state);
        if (hand.id !== event.handId) {
          return yield* corrupt(
            seq,
            event,
            `aborting ${event.handId} while ${hand.id} is in progress`,
          );
        }
        let next = state;
        for (const { player, amount } of event.refunds) {
          if (amount > 0) next = credit(next, player, amount);
        }
        // Unlike settlement, this hand never really happened: no spend
        // history, no credit/burnout ticking, no button or winner carried
        // forward. Everyone just goes back to the ready-up screen.
        return {
          ...withEveryPlayer(next, (p) => ({ ...p, ready: false })),
          hand: undefined,
          lastWinners: undefined,
        };
      }

      case "LossBonusGranted": {
        yield* requirePlayer(state, event.player);
        // A bonus is credit too, so it lands on the score the same way.
        return withPlayer(state, event.player, (p) => ({
          ...p,
          balance: Chips.add(p.balance, event.amount),
          creditTaken: Chips.add(p.creditTaken, event.amount),
        }));
      }
    }
  });

/** Apply one stored event, moving the state version to its `seq`. */
export const applyEvent = Effect.fn("fold.applyEvent")(function* (
  state: TableState,
  stored: E.StoredEvent,
) {
  const next = yield* apply(state, stored.event, stored.seq as Seq);
  return { ...next, seq: stored.seq as Seq };
});

/** Replay a whole log. The only way a `TableState` is ever built. */
export const foldEvents = Effect.fn("fold.foldEvents")(function* (
  config: TableConfig,
  events: Iterable<E.StoredEvent>,
) {
  return yield* Effect.reduce(events, () => initialState(config), applyEvent);
});
