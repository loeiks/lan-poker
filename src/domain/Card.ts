import { Schema } from "effect";

/**
 * A card is a two-character code -- rank then suit, e.g. `As`, `Th`, `2c` --
 * encoded as a single string so duplicate detection is a plain equality check.
 */

export const RANKS = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "T",
  "J",
  "Q",
  "K",
  "A",
] as const;

export const SUITS = ["c", "d", "h", "s"] as const;

export const Rank = Schema.Literals(RANKS);
export type Rank = typeof Rank.Type;

export const Suit = Schema.Literals(SUITS);
export type Suit = typeof Suit.Type;

export type CardCode = `${Rank}${Suit}`;

/** All 52 cards, in a stable canonical order. */
export const DECK: ReadonlyArray<CardCode> = RANKS.flatMap((rank) =>
  SUITS.map((suit): CardCode => `${rank}${suit}`),
);

export const Card = Schema.Literals(DECK as ReadonlyArray<CardCode>);
export type Card = typeof Card.Type;

export const isCard = (value: string): value is Card =>
  (DECK as ReadonlyArray<string>).includes(value);

/** Parse a loosely-typed string (any case) into a card, or `undefined`. */
export const parseCard = (raw: string): Card | undefined => {
  const trimmed = raw.trim();
  if (trimmed.length !== 2) return undefined;
  const normalized = `${trimmed[0]!.toUpperCase()}${trimmed[1]!.toLowerCase()}`;
  return isCard(normalized) ? normalized : undefined;
};

export const rankOf = (card: Card): Rank => card[0] as Rank;

export const suitOf = (card: Card): Suit => card[1] as Suit;

const RANK_VALUES: Record<Rank, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

/** Numeric strength of a rank, aces high (14). */
export const rankValue = (rank: Rank): number => RANK_VALUES[rank];

export const cardValue = (card: Card): number => rankValue(rankOf(card));

const SUIT_SYMBOLS: Record<Suit, string> = {
  c: "♣",
  d: "♦",
  h: "♥",
  s: "♠",
};

export const suitSymbol = (suit: Suit): string => SUIT_SYMBOLS[suit];

export const isRedSuit = (suit: Suit): boolean => suit === "d" || suit === "h";

/** Display form, e.g. `A♠`. */
export const showCard = (card: Card): string =>
  `${rankOf(card)}${suitSymbol(suitOf(card))}`;

const RANK_NAMES: Record<Rank, string> = {
  "2": "Two",
  "3": "Three",
  "4": "Four",
  "5": "Five",
  "6": "Six",
  "7": "Seven",
  "8": "Eight",
  "9": "Nine",
  T: "Ten",
  J: "Jack",
  Q: "Queen",
  K: "King",
  A: "Ace",
};

export const rankName = (rank: Rank): string => RANK_NAMES[rank];

/** UI display form, e.g. "10" for T, "A" for A. */
export const displayRank = (rank: Rank): string => (rank === "T" ? "10" : rank);

export const rankNamePlural = (rank: Rank): string =>
  rank === "6" ? "Sixes" : `${RANK_NAMES[rank]}s`;
