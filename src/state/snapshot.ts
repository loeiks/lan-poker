import type { Card } from "~/domain/Card";
import * as Chips from "~/domain/Chips";
import type { PlayerName, Seq } from "~/domain/Ids";
import type {
  HandState,
  PlayerState,
  Pot,
  Street,
  TableState,
} from "~/domain/State";
import {
  actingPlayer,
  buttonPlayer,
  contributionOf,
  revealedBoard,
} from "~/domain/State";
import { legalActions, type LegalActions } from "~/rules/betting";
import { standings, type Standing } from "~/rules/credit";
import { canEvaluate, evaluate } from "~/rules/evaluate";
import { blindSeats } from "~/rules/positions";
import { buildPots, returnUncalled } from "~/rules/pots";

// The complete, per-recipient view of the table -- no delta protocol. Other
// players' hole cards are omitted entirely, not sent-and-hidden, so a
// tampered client still can't see them.

export interface PlayerView {
  readonly name: PlayerName;
  readonly balance: Chips.Chips;
  readonly ready: boolean;
  readonly seated: boolean;
  readonly pendingCredit:
    | { readonly amount: Chips.Chips; readonly handsRemaining: number }
    | undefined;
}

export interface PotView {
  readonly amount: Chips.Chips;
  readonly eligible: ReadonlyArray<PlayerName>;
}

export interface HandView {
  readonly id: string;
  readonly street: Street;
  readonly players: ReadonlyArray<PlayerName>;
  readonly button: PlayerName | undefined;
  readonly smallBlind: PlayerName | undefined;
  readonly bigBlind: PlayerName | undefined;
  readonly actingPlayer: PlayerName | undefined;
  readonly folded: ReadonlyArray<PlayerName>;
  readonly allIn: ReadonlyArray<PlayerName>;
  readonly board: ReadonlyArray<Card | undefined>;
  /** Only the recipient's own cards, when they are dealt in. */
  readonly yourHoleCards: readonly [Card, Card] | undefined;
  /** The recipient's own running hand strength, once enough cards are known. */
  readonly yourRanking: string | undefined;
  readonly contributions: ReadonlyArray<{
    readonly player: PlayerName;
    readonly amount: Chips.Chips;
  }>;
  readonly pots: ReadonlyArray<PotView>;
  /** True once the hand needs an admin declaration to settle. */
  readonly awaitingDeclaration: boolean;
  /** All recorded hole cards, only for admin once the hand is settled. */
  readonly allHoleCards:
    | ReadonlyArray<{
        readonly player: PlayerName;
        readonly cards: readonly [Card, Card];
      }>
    | undefined;
  readonly complete: boolean;
}

export interface TableSnapshot {
  readonly seq: Seq;
  readonly tableName: string;
  readonly tableMinimum: Chips.Chips;
  readonly isAdmin: boolean;
  readonly finished: boolean;
  readonly seatOrder: ReadonlyArray<PlayerName>;
  readonly players: ReadonlyArray<PlayerView>;
  readonly hand: HandView | undefined;
  readonly legalActions: LegalActions | undefined;
  readonly standings: ReadonlyArray<Standing>;
  /** Winners of the last completed hand, for UI celebration. Cleared on next hand. */
  readonly lastWinners: ReadonlyArray<PlayerName> | undefined;
}

const playerView = (player: PlayerState): PlayerView => ({
  name: player.name,
  balance: player.balance,
  ready: player.ready,
  seated: player.seated,
  pendingCredit: player.pendingCredit,
});

/** Whether a showdown hand has enough recorded cards to resolve itself. */
export const needsDeclaration = (
  hand: HandState,
  active: ReadonlyArray<PlayerName>,
): boolean =>
  !hand.complete &&
  hand.street === "showdown" &&
  active.length > 1 &&
  !canEvaluate(revealedBoard(hand), hand.holeCards, active);

const handView = (
  hand: HandState,
  recipient: PlayerName,
  isAdmin: boolean,
): HandView => {
  const active = hand.players.filter((p) => !hand.folded.has(p));
  // Mirrors what settlement will actually ask an admin to declare winners
  // for: the uncalled portion of an overbet never forms a pot at all.
  const { contributions } = returnUncalled(hand.contributions, active);
  const pots = buildPots(contributions, active);
  const seats =
    hand.players.length >= 2
      ? blindSeats(hand.players.length, hand.button)
      : undefined;
  const yourHoleCards = hand.holeCards.get(recipient);
  const board = revealedBoard(hand);

  return {
    id: hand.id,
    street: hand.street,
    players: hand.players,
    button: buttonPlayer(hand),
    smallBlind:
      seats === undefined ? undefined : hand.players[seats.smallBlind],
    bigBlind: seats === undefined ? undefined : hand.players[seats.bigBlind],
    actingPlayer: actingPlayer(hand),
    folded: [...hand.folded],
    allIn: [...hand.allIn],
    board: hand.board,
    yourHoleCards,
    yourRanking:
      yourHoleCards !== undefined && board.length >= 3
        ? evaluate([...yourHoleCards, ...board]).description
        : undefined,
    contributions: hand.players.map((player) => ({
      player,
      amount: contributionOf(hand, player),
    })),
    pots: pots.map((pot: Pot) => ({
      amount: pot.amount,
      eligible: pot.eligible,
    })),
    awaitingDeclaration: needsDeclaration(hand, active),
    allHoleCards:
      isAdmin && hand.complete
        ? [...hand.holeCards].map(([player, cards]) => ({ player, cards }))
        : undefined,
    complete: hand.complete,
  };
};

export const buildSnapshot = (
  state: TableState,
  recipient: PlayerName,
): TableSnapshot => {
  const balanceOf = (player: PlayerName): Chips.Chips =>
    state.players.get(player)?.balance ?? Chips.zero;

  return {
    seq: state.seq,
    tableName: state.config.name,
    tableMinimum: state.config.minimum,
    isAdmin: state.config.isAdmin(recipient),
    finished: state.finished,
    seatOrder: state.seatOrder,
    players: state.seatOrder.map((name) =>
      playerView(state.players.get(name)!),
    ),
    hand:
      state.hand === undefined
        ? undefined
        : handView(state.hand, recipient, state.config.isAdmin(recipient)),
    legalActions:
      state.hand !== undefined && actingPlayer(state.hand) === recipient
        ? legalActions(state.hand, state.config, balanceOf)
        : undefined,
    standings: standings(state),
    lastWinners: state.lastWinners,
  };
};
