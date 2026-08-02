import type { Card } from "./Card.ts";
import type { Chips } from "./Chips.ts";
import type { HandId, PlayerName, Seq } from "./Ids.ts";
import type { TableConfig } from "./TableConfig.ts";

// Derived from the event log and never persisted, so plain readonly structs
// rather than schemas. No `pot` field: it's fully derivable from contributions.

export type Street = "preflop" | "flop" | "turn" | "river" | "showdown";

export const STREETS: ReadonlyArray<Street> = [
  "preflop",
  "flop",
  "turn",
  "river",
  "showdown",
];

/** How many board cards are face up on each street. */
export const boardSizeFor = (street: Street): number => {
  switch (street) {
    case "preflop":
      return 0;
    case "flop":
      return 3;
    case "turn":
      return 4;
    case "river":
    case "showdown":
      return 5;
  }
};

/** A credit that has been frozen at bust time and is waiting out its cooldown. */
export interface PendingCredit {
  /** Frozen when the player busted; never recalculated. */
  readonly amount: Chips;
  /** Hands still to elapse before this can be claimed. Zero means claimable. */
  readonly handsRemaining: number;
}

export interface PlayerState {
  readonly name: PlayerName;
  readonly balance: Chips;
  /** Cumulative credit ever taken. Subtracted from the leaderboard score. */
  readonly creditTaken: Chips;
  readonly ready: boolean;
  /** False once they have gone home; they stay on the leaderboard. */
  readonly seated: boolean;
  /**
   * Chips committed per hand, oldest first. Only the tail is ever read
   * (the burnout window), but the whole history is cheap to keep.
   */
  readonly spendHistory: ReadonlyArray<Chips>;
  readonly pendingCredit: PendingCredit | undefined;
}

/** One layer of the pot, with exactly the players who can win it. */
export interface Pot {
  readonly amount: Chips;
  readonly eligible: ReadonlyArray<PlayerName>;
}

export interface HandState {
  readonly id: HandId;
  /** Participants in clockwise seat order, fixed for the hand. */
  readonly players: ReadonlyArray<PlayerName>;
  readonly button: number;
  readonly street: Street;
  /** The only pot truth there is; pots are derived from this. */
  readonly contributions: ReadonlyMap<PlayerName, Chips>;
  /** Committed during the current betting round only. */
  readonly roundContributions: ReadonlyMap<PlayerName, Chips>;
  readonly folded: ReadonlySet<PlayerName>;
  readonly allIn: ReadonlySet<PlayerName>;
  /** The amount to match in the current round. */
  readonly currentBet: Chips;
  /** Index into `players`, or undefined when no one is being waited on. */
  readonly actingIndex: number | undefined;
  /** Who has acted since the last aggressive action, for round closure. */
  readonly actedThisRound: ReadonlySet<PlayerName>;
  /** Five slots; `undefined` where nothing has been entered yet. */
  readonly board: ReadonlyArray<Card | undefined>;
  readonly holeCards: ReadonlyMap<PlayerName, readonly [Card, Card]>;
  /** Chips handed back because no opponent could match them. */
  readonly returned: ReadonlyMap<PlayerName, Chips>;
  readonly complete: boolean;
}

export interface TableState {
  readonly config: TableConfig;
  /** The sequence number of the last applied event; the state version. */
  readonly seq: Seq;
  readonly players: ReadonlyMap<PlayerName, PlayerState>;
  /** Join order, which fixes the clockwise seating. */
  readonly seatOrder: ReadonlyArray<PlayerName>;
  readonly hand: HandState | undefined;
  readonly handsPlayed: number;
  /** Who held the button last, so rotation survives players coming and going. */
  readonly lastButton: PlayerName | undefined;
  readonly finished: boolean;
  readonly lastWinners: ReadonlyArray<PlayerName> | undefined;
}

export const contributionOf = (hand: HandState, player: PlayerName): Chips =>
  (hand.contributions.get(player) ?? 0) as Chips;

export const roundContributionOf = (
  hand: HandState,
  player: PlayerName,
): Chips => (hand.roundContributions.get(player) ?? 0) as Chips;

export const hasFolded = (hand: HandState, player: PlayerName): boolean =>
  hand.folded.has(player);

export const isAllIn = (hand: HandState, player: PlayerName): boolean =>
  hand.allIn.has(player);

/** Still in the hand: dealt in and not folded. */
export const activePlayers = (hand: HandState): ReadonlyArray<PlayerName> =>
  hand.players.filter((p) => !hand.folded.has(p));

/** Still in the hand and still able to bet. */
export const actionablePlayers = (hand: HandState): ReadonlyArray<PlayerName> =>
  hand.players.filter((p) => !hand.folded.has(p) && !hand.allIn.has(p));

export const actingPlayer = (hand: HandState): PlayerName | undefined =>
  hand.actingIndex === undefined ? undefined : hand.players[hand.actingIndex];

export const buttonPlayer = (hand: HandState): PlayerName | undefined =>
  hand.players[hand.button];

/** Board cards actually entered, in order, stopping at the first gap. */
export const revealedBoard = (hand: HandState): ReadonlyArray<Card> => {
  const out: Array<Card> = [];
  for (const card of hand.board) {
    if (card === undefined) break;
    out.push(card);
  }
  return out;
};

/** Every card recorded anywhere in the hand, for duplicate detection. */
export const recordedCards = (hand: HandState): ReadonlyArray<Card> => [
  ...hand.board.filter((c): c is Card => c !== undefined),
  ...[...hand.holeCards.values()].flat(),
];

export const playerOf = (
  state: TableState,
  name: PlayerName,
): PlayerState | undefined => state.players.get(name);

/** How far up or down a player is tonight; credit is a loan, so it's subtracted. */
export const scoreOf = (state: TableState, player: PlayerState): number =>
  player.balance - state.config.startingBalance - player.creditTaken;

/** Players who could be dealt into the next hand. */
export const eligibleToPlay = (state: TableState): ReadonlyArray<PlayerState> =>
  state.seatOrder
    .map((name) => state.players.get(name))
    .filter(
      (p): p is PlayerState =>
        p !== undefined &&
        p.seated &&
        p.balance > 0 &&
        (p.pendingCredit === undefined || p.pendingCredit.handsRemaining === 0),
    );

export const readyToPlay = (state: TableState): ReadonlyArray<PlayerState> =>
  eligibleToPlay(state).filter((p) => p.ready);

export const handInProgress = (state: TableState): boolean =>
  state.hand !== undefined && !state.hand.complete;
