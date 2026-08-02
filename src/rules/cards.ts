import type { Card } from "~/domain/Card";
import { BoardFull, DuplicateCard, type IntentError } from "~/domain/Errors";
import type { PlayerName } from "~/domain/Ids";
import type { HandState } from "~/domain/State";

// Cards are optional everywhere -- a table that never enters a card must
// still play all night. Duplicate detection catches typos, not cheating
// (the physical showdown handles that).

export const BOARD_SIZE = 5;

export type CardResult =
  | { readonly ok: true; readonly hand: HandState }
  | { readonly ok: false; readonly error: IntentError };

/** Where a card is already recorded, if anywhere. */
const findCard = (
  hand: HandState,
  card: Card,
  ignore: { board?: number; player?: PlayerName },
): DuplicateCard["heldBy"] | undefined => {
  for (let i = 0; i < hand.board.length; i++) {
    if (i === ignore.board) continue;
    if (hand.board[i] === card) return { _tag: "board" as const };
  }
  for (const [player, cards] of hand.holeCards) {
    if (player === ignore.player) continue;
    if (cards.includes(card)) return { _tag: "player" as const, player };
  }
  return undefined;
};

export const setBoardCard = (
  hand: HandState,
  index: number,
  card: Card | undefined,
): CardResult => {
  if (index < 0 || index >= BOARD_SIZE) {
    return { ok: false, error: new BoardFull() };
  }

  if (card !== undefined) {
    const heldBy = findCard(hand, card, { board: index });
    if (heldBy !== undefined) {
      return { ok: false, error: new DuplicateCard({ card, heldBy }) };
    }
  }

  const board = [...hand.board];
  board[index] = card;
  return { ok: true, hand: { ...hand, board } };
};

export const setHoleCards = (
  hand: HandState,
  player: PlayerName,
  cards: readonly [Card, Card] | undefined,
): CardResult => {
  if (cards !== undefined) {
    if (cards[0] === cards[1]) {
      return {
        ok: false,
        error: new DuplicateCard({
          card: cards[0],
          heldBy: { _tag: "player", player },
        }),
      };
    }
    for (const card of cards) {
      const heldBy = findCard(hand, card, { player });
      if (heldBy !== undefined) {
        return { ok: false, error: new DuplicateCard({ card, heldBy }) };
      }
    }
  }

  const holeCards = new Map(hand.holeCards);
  if (cards === undefined) holeCards.delete(player);
  else holeCards.set(player, cards);
  return { ok: true, hand: { ...hand, holeCards } };
};

/** Cards still available to record in this hand. */
export const availableCards = (
  hand: HandState,
  deck: ReadonlyArray<Card>,
): ReadonlyArray<Card> => {
  const used = new Set<Card>();
  for (const card of hand.board) if (card !== undefined) used.add(card);
  for (const cards of hand.holeCards.values())
    for (const c of cards) used.add(c);
  return deck.filter((card) => !used.has(card));
};
