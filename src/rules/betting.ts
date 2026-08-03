import * as Chips from "~/domain/Chips";
import {
  IllegalAction,
  type IllegalActionReason,
  type IntentError,
  NotYourTurn,
} from "~/domain/Errors";
import * as E from "~/domain/Events";
import type { HandId, PlayerName } from "~/domain/Ids";
import type { HandState, Street } from "~/domain/State";
import {
  actionablePlayers,
  activePlayers,
  contributionOf,
  roundContributionOf,
} from "~/domain/State";
import type { TableConfig } from "~/domain/TableConfig";
import { firstToActPostflop, firstToActPreflop } from "~/rules/positions";

// Every chip movement and legality rule for a hand lives here; clients only
// render what this says is legal.

export type BalanceOf = (player: PlayerName) => Chips.Chips;

export type ActionIntent =
  | { readonly kind: "check" }
  | { readonly kind: "call" }
  | { readonly kind: "fold" }
  | { readonly kind: "raise"; readonly to: Chips.Chips }
  | { readonly kind: "allin" };

export interface LegalActions {
  readonly check: boolean;
  readonly fold: boolean;
  /** Chips that would be added to call, or undefined when calling is not open. */
  readonly call: Chips.Chips | undefined;
  /** Bounds on the new round bet a raise may set, in table-minimum steps. */
  readonly raise:
    | {
        readonly min: Chips.Chips;
        readonly max: Chips.Chips;
        readonly step: Chips.Chips;
      }
    | undefined;
  readonly allIn: Chips.Chips | undefined;
}

export const emptyHand = (
  id: HandId,
  players: ReadonlyArray<PlayerName>,
  button: number,
): HandState => ({
  id,
  players,
  button,
  street: "preflop",
  contributions: new Map(),
  roundContributions: new Map(),
  folded: new Set(),
  allIn: new Set(),
  currentBet: Chips.zero,
  actingIndex: undefined,
  actedThisRound: new Set(),
  board: [undefined, undefined, undefined, undefined, undefined],
  holeCards: new Map(),
  returned: new Map(),
  complete: false,
});

const withContribution = (
  hand: HandState,
  player: PlayerName,
  amount: Chips.Chips,
): HandState => {
  const contributions = new Map(hand.contributions);
  const roundContributions = new Map(hand.roundContributions);
  contributions.set(player, Chips.add(contributionOf(hand, player), amount));
  roundContributions.set(
    player,
    Chips.add(roundContributionOf(hand, player), amount),
  );
  return { ...hand, contributions, roundContributions };
};

/**
 * Record chips as committed. Blinds and replay both use this: an already
 * written event is a fact, so the fold applies its amounts rather
 * than recomputing from a balance it can't trust.
 */
export const commit = (
  hand: HandState,
  player: PlayerName,
  amount: Chips.Chips,
  allIn: boolean,
): HandState => {
  let next = withContribution(hand, player, amount);
  if (allIn) next = { ...next, allIn: new Set(next.allIn).add(player) };
  return {
    ...next,
    currentBet: Chips.max(next.currentBet, roundContributionOf(next, player)),
  };
};

/** Post a blind. Short stacks post what they have and are all-in. */
export const postBlind = (
  hand: HandState,
  player: PlayerName,
  kind: E.BlindKind,
  due: Chips.Chips,
  balance: Chips.Chips,
): { readonly hand: HandState; readonly event: E.BlindPosted } => {
  const amount = Chips.min(due, balance);
  const allIn = amount >= balance;
  return {
    hand: commit(hand, player, amount, allIn),
    event: new E.BlindPosted({ player, kind, amount, allIn }),
  };
};

/** Seat the action for the start of a betting round. */
export const openRound = (hand: HandState): HandState => {
  const first =
    hand.street === "preflop"
      ? firstToActPreflop(hand.players.length, hand.button)
      : firstToActPostflop(hand.players.length, hand.button);
  const actingIndex = seekActionable(hand, first);
  return { ...hand, actingIndex, actedThisRound: new Set() };
};

/** First seat at or after `from` that can still act, or undefined. */
const seekActionable = (hand: HandState, from: number): number | undefined => {
  const count = hand.players.length;
  for (let step = 0; step < count; step++) {
    const index = (from + step) % count;
    const player = hand.players[index]!;
    if (!hand.folded.has(player) && !hand.allIn.has(player)) return index;
  }
  return undefined;
};

const advanceActor = (hand: HandState): HandState => {
  if (hand.actingIndex === undefined) return hand;
  const next = seekActionable(
    hand,
    (hand.actingIndex + 1) % hand.players.length,
  );
  return { ...hand, actingIndex: next };
};

/** What the player to act may legally do right now. */
export const legalActions = (
  hand: HandState,
  config: TableConfig,
  balanceOf: BalanceOf,
): LegalActions => {
  const player =
    hand.actingIndex === undefined ? undefined : hand.players[hand.actingIndex];
  if (player === undefined) {
    return {
      check: false,
      fold: false,
      call: undefined,
      raise: undefined,
      allIn: undefined,
    };
  }

  const balance = balanceOf(player);
  const committed = roundContributionOf(hand, player);
  const owed = Chips.sub(hand.currentBet, committed);

  const canCheck = owed === 0;
  const canCall = owed > 0 && balance > owed;
  // A raise has to reach at least one full step above the current bet, and
  // the player has to be able to cover it without going all-in.
  const step = config.minimum;
  const minRaiseTo = Chips.make(
    (Math.floor(hand.currentBet / step) + 1) * step,
  );
  const maxRaiseTo = Chips.add(committed, balance);
  const canRaise = maxRaiseTo > minRaiseTo || maxRaiseTo === minRaiseTo;

  return {
    check: canCheck,
    fold: true,
    call: canCall ? owed : undefined,
    raise:
      canRaise && maxRaiseTo >= minRaiseTo
        ? { min: minRaiseTo, max: floorToStep(maxRaiseTo, step), step }
        : undefined,
    allIn: balance > 0 ? balance : undefined,
  };
};

const floorToStep = (value: Chips.Chips, step: Chips.Chips): Chips.Chips =>
  Chips.make(Math.floor(value / step) * step);

export type ApplyResult =
  | {
      readonly ok: true;
      readonly hand: HandState;
      readonly event: E.PlayerActed;
      readonly spent: Chips.Chips;
    }
  | { readonly ok: false; readonly error: IntentError };

const illegal = (
  reason: IllegalActionReason,
  detail?: string,
): ApplyResult => ({
  ok: false,
  error: new IllegalAction({ reason, detail }),
});

/** Apply one betting action from the player whose turn it is. */
export const applyAction = (
  hand: HandState,
  config: TableConfig,
  player: PlayerName,
  balance: Chips.Chips,
  intent: ActionIntent,
): ApplyResult => {
  if (hand.complete) return illegal("betting-closed");

  const acting =
    hand.actingIndex === undefined ? undefined : hand.players[hand.actingIndex];
  if (acting !== player) {
    return {
      ok: false,
      error: new NotYourTurn({ player, actingPlayer: acting }),
    };
  }
  if (!hand.players.includes(player)) return illegal("player-not-in-hand");
  if (hand.folded.has(player)) return illegal("player-already-folded");

  const committed = roundContributionOf(hand, player);
  const owed = Chips.sub(hand.currentBet, committed);

  switch (intent.kind) {
    case "fold": {
      const next = markActed(
        { ...hand, folded: new Set(hand.folded).add(player) },
        player,
      );
      return {
        ok: true,
        hand: advanceActor(next),
        event: new E.PlayerActed({ player, action: new E.Fold() }),
        spent: Chips.zero,
      };
    }

    case "check": {
      if (owed > 0) return illegal("check-facing-bet");
      const next = markActed(hand, player);
      return {
        ok: true,
        hand: advanceActor(next),
        event: new E.PlayerActed({ player, action: new E.Check() }),
        spent: Chips.zero,
      };
    }

    case "call": {
      if (owed === 0) return illegal("check-facing-bet", "nothing to call");
      const amount = Chips.min(owed, balance);
      const allIn = amount >= balance;
      let next = withContribution(hand, player, amount);
      if (allIn) next = { ...next, allIn: new Set(next.allIn).add(player) };
      next = markActed(next, player);
      return {
        ok: true,
        hand: advanceActor(next),
        event: new E.PlayerActed({
          player,
          action: new E.Call({ amount, allIn }),
        }),
        spent: amount,
      };
    }

    case "allin": {
      if (balance === 0) return illegal("bet-exceeds-balance", "no chips left");
      const to = Chips.add(committed, balance);
      let next = withContribution(hand, player, balance);
      next = { ...next, allIn: new Set(next.allIn).add(player) };
      // An all-in that raises the bet reopens the action for everyone else.
      const aggressive = to > hand.currentBet;
      next = aggressive
        ? { ...next, currentBet: to, actedThisRound: new Set([player]) }
        : markActed(next, player);
      return {
        ok: true,
        hand: advanceActor(next),
        event: new E.PlayerActed({
          player,
          action: new E.AllIn({ amount: balance, to }),
        }),
        spent: balance,
      };
    }

    case "raise": {
      const to = intent.to;
      if (to <= hand.currentBet) return illegal("raise-below-current-bet");
      if (!Chips.isMultipleOf(to, config.minimum)) {
        return illegal(
          "raise-not-multiple-of-minimum",
          `raise to a multiple of ${config.minimum}`,
        );
      }
      const required = Chips.sub(to, committed);
      if (required > balance) {
        return illegal("bet-exceeds-balance", "go all-in instead");
      }
      const allIn = required >= balance;
      let next = withContribution(hand, player, required);
      if (allIn) next = { ...next, allIn: new Set(next.allIn).add(player) };
      next = { ...next, currentBet: to, actedThisRound: new Set([player]) };
      return {
        ok: true,
        hand: advanceActor(next),
        event: new E.PlayerActed({
          player,
          action: new E.Raise({ to, amount: required, allIn }),
        }),
        spent: required,
      };
    }
  }
};

const markActed = (hand: HandState, player: PlayerName): HandState => ({
  ...hand,
  actedThisRound: new Set(hand.actedThisRound).add(player),
});

/**
 * A round closes once everyone still able to act has acted since the last
 * aggressive action, and has matched the current bet.
 */
export const isRoundClosed = (hand: HandState): boolean => {
  const actionable = actionablePlayers(hand);
  if (actionable.length === 0) return true;
  return actionable.every(
    (player) =>
      hand.actedThisRound.has(player) &&
      roundContributionOf(hand, player) === hand.currentBet,
  );
};

/** Whether any further betting is possible at all this hand. */
export const bettingExhausted = (hand: HandState): boolean =>
  actionablePlayers(hand).length < 2;

const NEXT_STREET: Record<Street, Street> = {
  preflop: "flop",
  flop: "turn",
  turn: "river",
  river: "showdown",
  showdown: "showdown",
};

/**
 * Move to the next street: per-round contributions reset while totals for the
 * hand are retained, and the action re-opens left of the button.
 */
export const advanceStreet = (hand: HandState): HandState => {
  const street = NEXT_STREET[hand.street];
  const next: HandState = {
    ...hand,
    street,
    roundContributions: new Map(),
    currentBet: Chips.zero,
    actedThisRound: new Set(),
    actingIndex: undefined,
  };
  if (street === "showdown") return next;
  return openRound(next);
};

/** Skip remaining streets to showdown -- no one left to act. */
export const skipToShowdown = (hand: HandState): HandState => ({
  ...hand,
  street: "showdown",
  roundContributions: new Map(),
  currentBet: Chips.zero,
  actedThisRound: new Set(),
  actingIndex: undefined,
});

/** The hand is over the moment everyone but one has folded. */
export const onlyOneLeft = (hand: HandState): boolean =>
  activePlayers(hand).length <= 1;
