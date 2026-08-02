declare module "pokersolver" {
  export interface SolvedCard {
    readonly value: string;
    readonly suit: string;
    readonly rank: number;
  }

  export class Hand {
    /** Category rank: 1 high card .. 9 straight flush. */
    readonly rank: number;
    /** Category name, e.g. "Full House". */
    readonly name: string;
    /** Full description, e.g. "Full House, 9's over 5's". */
    readonly descr: string;
    /** The five cards making the hand. */
    readonly cards: ReadonlyArray<SolvedCard>;

    static solve(
      cards: ReadonlyArray<string>,
      game?: string,
      canDisqualify?: boolean,
    ): Hand;

    static winners(hands: ReadonlyArray<Hand>): ReadonlyArray<Hand>;

    /** Returns -1 when THIS hand wins, 1 when it loses, 0 when tied. */
    compare(other: Hand): number;
  }
}
