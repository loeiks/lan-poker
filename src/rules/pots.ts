import * as Chips from "~/domain/Chips";
import type { PlayerName } from "~/domain/Ids";
import type { Pot } from "~/domain/State";

/** Pots are derived from the contribution map by slicing at each all-in
 * level. Folded players' chips still fill pots; they're just ineligible. */

export type Contributions = ReadonlyMap<PlayerName, Chips.Chips>;

export interface Share {
  readonly player: PlayerName;
  readonly amount: Chips.Chips;
}

export interface PotAward {
  readonly potIndex: number;
  readonly amount: Chips.Chips;
  readonly winners: ReadonlyArray<PlayerName>;
  readonly shares: ReadonlyArray<Share>;
}

/** `active` are those eligible to win; everyone's chips still count toward amounts. */
export const buildPots = (
  contributions: Contributions,
  active: ReadonlyArray<PlayerName>,
): ReadonlyArray<Pot> => {
  const activeSet = new Set(active);
  const levels = [
    ...new Set([...contributions.values()].filter((amount) => amount > 0)),
  ].sort((a, b) => a - b);

  const pots: Array<{ amount: number; eligible: Array<PlayerName> }> = [];
  let previous = 0;
  // Dead money: contributions at a level where everyone folded. Must fold
  // into a pot someone is eligible for, or it vanishes from the table.
  let dead = 0;

  for (const level of levels) {
    const slice = level - previous;
    let amount = 0;
    const eligible: Array<PlayerName> = [];

    for (const [player, contributed] of contributions) {
      if (contributed <= previous) continue;
      amount += Math.min(slice, contributed - previous);
      if (contributed >= level && activeSet.has(player)) eligible.push(player);
    }

    previous = level;
    if (amount <= 0) continue;

    if (eligible.length === 0) {
      // Fold into the pot below, where remaining players were competing.
      const below = pots[pots.length - 1];
      if (below === undefined) dead += amount;
      else below.amount += amount;
      continue;
    }

    pots.push({ amount: amount + dead, eligible });
    dead = 0;
  }

  if (dead > 0) {
    // Nobody was ever eligible; chips go to whoever is left in the hand.
    if (pots.length > 0) pots[pots.length - 1]!.amount += dead;
    else pots.push({ amount: dead, eligible: [...active] });
  }

  return pots.map((pot) => ({
    amount: Chips.make(pot.amount),
    eligible: pot.eligible,
  }));
};

export interface UncalledResult {
  readonly contributions: Contributions;
  /** At most one entry: only the top bettor can have an uncalled portion. */
  readonly returned: ReadonlyMap<PlayerName, Chips.Chips>;
}

/** Return the unmatched portion of the top bet. Returned chips never
 * count as spend (would inflate burnout credit with your own money back). */
export const returnUncalled = (
  contributions: Contributions,
  _active: ReadonlyArray<PlayerName>,
): UncalledResult => {
  const amounts = [...contributions.values()].sort((a, b) => b - a);
  const highest = amounts[0] ?? 0;
  const secondHighest = amounts[1] ?? 0;

  if (highest <= secondHighest) {
    return { contributions, returned: new Map() };
  }

  const topBettor = [...contributions.entries()].find(
    ([, amount]) => amount === highest,
  );
  if (topBettor === undefined) {
    return { contributions, returned: new Map() };
  }

  const [player] = topBettor;
  const excess = Chips.make(highest - secondHighest);
  const adjusted = new Map(contributions);
  adjusted.set(player, Chips.make(secondHighest));
  return { contributions: adjusted, returned: new Map([[player, excess]]) };
};

/** Odd chips from a split go to winners closest clockwise of the button. */
export const splitPot = (
  amount: Chips.Chips,
  winners: ReadonlyArray<PlayerName>,
  seatOrder: ReadonlyArray<PlayerName>,
  button: number,
): ReadonlyArray<Share> => {
  if (winners.length === 0) return [];

  const { share, remainder } = Chips.divide(amount, winners.length);

  // Order winners by seat distance clockwise from the button.
  const distance = (player: PlayerName): number => {
    const seat = seatOrder.indexOf(player);
    if (seat < 0) return Number.MAX_SAFE_INTEGER;
    return (seat - button + seatOrder.length) % seatOrder.length;
  };
  const clockwise = [...winners].sort((a, b) => distance(a) - distance(b));

  const extra = new Map<PlayerName, number>();
  for (let i = 0; i < remainder; i++) {
    const player = clockwise[i % clockwise.length]!;
    extra.set(player, (extra.get(player) ?? 0) + 1);
  }

  // Preserve the caller's winner order in the output; only the odd chips
  // depend on seating.
  return winners.map((player) => ({
    player,
    amount: Chips.make(share + (extra.get(player) ?? 0)),
  }));
};

/**
 * Award every pot to the best hand among that pot's own eligible players.
 *
 * `pickWinners` is given the eligible set for one pot and returns the winners
 * of that pot -- which is where hand evaluation or an admin declaration plugs
 * in, without this function needing to know which it was.
 */
export const awardPots = (
  pots: ReadonlyArray<Pot>,
  seatOrder: ReadonlyArray<PlayerName>,
  button: number,
  pickWinners: (
    eligible: ReadonlyArray<PlayerName>,
    potIndex: number,
  ) => ReadonlyArray<PlayerName>,
): ReadonlyArray<PotAward> =>
  pots.map((pot, potIndex) => {
    const winners = pickWinners(pot.eligible, potIndex);
    for (const winner of winners) {
      if (!pot.eligible.includes(winner)) {
        throw new Error(`${winner} is not eligible for pot ${potIndex}`);
      }
    }
    return {
      potIndex,
      amount: pot.amount,
      winners,
      shares: splitPot(pot.amount, winners, seatOrder, button),
    };
  });

/** Net balance change per player from a set of awards. */
export const payouts = (
  awards: ReadonlyArray<PotAward>,
): ReadonlyMap<PlayerName, Chips.Chips> => {
  const totals = new Map<PlayerName, number>();
  for (const award of awards) {
    for (const share of award.shares) {
      totals.set(share.player, (totals.get(share.player) ?? 0) + share.amount);
    }
  }
  return new Map(
    [...totals.entries()].map(([player, amount]) => [
      player,
      Chips.make(amount),
    ]),
  );
};
