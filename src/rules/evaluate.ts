import { Hand } from "pokersolver";

import type { Card } from "~/domain/Card";
import type { PlayerName } from "~/domain/Ids";

// Adapter over `pokersolver`: keeps the rest of the app on our branded
// `Card` type and hides pokersolver's inverted comparison.

/** Hand categories, matching pokersolver's own rank numbering. */
export const Category = {
  HighCard: 1,
  Pair: 2,
  TwoPair: 3,
  Trips: 4,
  Straight: 5,
  Flush: 6,
  FullHouse: 7,
  Quads: 8,
  StraightFlush: 9,
} as const;

export type Category = (typeof Category)[keyof typeof Category];

export interface Evaluated {
  readonly category: number;
  /** Human-readable, e.g. "Full House, 9's over 5's". */
  readonly description: string;
  /** The five cards that make the hand. */
  readonly cards: ReadonlyArray<Card>;
  /** The underlying solver hand, used for comparison. */
  readonly solved: Hand;
}

/**
 * Rank the best five-card hand available from the given cards.
 * Accepts five to seven; anything fewer is a programming error.
 */
export const evaluate = (cards: ReadonlyArray<Card>): Evaluated => {
  if (cards.length < 5) {
    throw new Error(`evaluate needs at least five cards, got ${cards.length}`);
  }
  const solved = Hand.solve([...cards]);
  return {
    category: solved.rank,
    description: solved.descr,
    cards: solved.cards.map((card) => card.value + card.suit) as Array<Card>,
    solved,
  };
};

/**
 * Negative when `a` is worse, positive when better, zero when tied.
 *
 * pokersolver's own `compare` is the other way round -- it returns -1 when
 * the receiver wins -- so this flips it to the conventional ordering.
 */
export const compare = (a: Evaluated, b: Evaluated): number => {
  const result = a.solved.compare(b.solved);
  // Normalise away -0, which would otherwise leak into equality assertions.
  return result === 0 ? 0 : -result;
};

/** Best hand among several, returning every player tied for it. */
export const winnersAmong = (
  hands: ReadonlyArray<{ player: PlayerName; cards: ReadonlyArray<Card> }>,
): ReadonlyArray<PlayerName> => {
  if (hands.length === 0) return [];

  const evaluated = hands.map(({ player, cards }) => ({
    player,
    hand: evaluate(cards),
  }));

  let best = evaluated[0]!;
  for (const candidate of evaluated) {
    if (compare(candidate.hand, best.hand) > 0) best = candidate;
  }
  return evaluated
    .filter(({ hand }) => compare(hand, best.hand) === 0)
    .map(({ player }) => player);
};

/**
 * Build the `pickWinners` callback that `awardPots` expects, from whatever
 * cards are known. Returns `undefined` when the cards are insufficient, which
 * is the signal to fall back to an admin declaration.
 */
export const winnersFromCards = (
  board: ReadonlyArray<Card>,
  holeCards: ReadonlyMap<PlayerName, readonly [Card, Card]>,
):
  | ((eligible: ReadonlyArray<PlayerName>) => ReadonlyArray<PlayerName>)
  | undefined => {
  if (board.length !== 5) return undefined;
  return (eligible) => {
    const known = eligible.flatMap((player) => {
      const hole = holeCards.get(player);
      return hole === undefined ? [] : [{ player, cards: [...hole, ...board] }];
    });
    if (known.length !== eligible.length) return [];
    return winnersAmong(known);
  };
};

/** Whether every eligible player's cards are known well enough to evaluate. */
export const canEvaluate = (
  board: ReadonlyArray<Card>,
  holeCards: ReadonlyMap<PlayerName, readonly [Card, Card]>,
  eligible: ReadonlyArray<PlayerName>,
): boolean =>
  board.length === 5 && eligible.every((player) => holeCards.has(player));
