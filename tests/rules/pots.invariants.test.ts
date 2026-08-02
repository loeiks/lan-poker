import { describe, expect, it } from "@effect/vitest";

import * as Chips from "~/domain/Chips";
import type { PlayerName } from "~/domain/Ids";
import { awardPots, buildPots, payouts, returnUncalled } from "~/rules/pots";

/**
 * Side pots are the highest-risk logic in the system: getting them subtly
 * wrong moves chips to the wrong player and nobody at the table would notice.
 *
 * These properties are checked over randomly generated all-in configurations
 * rather than chosen examples, because the failure modes live in the awkward
 * combinations nobody thinks to write a case for (design.md D4, risks).
 */

/** Deterministic PRNG, so a failure is always reproducible. */
const rng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
};

interface Scenario {
  readonly seatOrder: ReadonlyArray<PlayerName>;
  readonly contributions: ReadonlyMap<PlayerName, Chips.Chips>;
  readonly active: ReadonlyArray<PlayerName>;
  readonly button: number;
}

const generate = (next: () => number): Scenario => {
  const count = 2 + Math.floor(next() * 8); // 2..9 players
  const seatOrder = Array.from(
    { length: count },
    (_, i) => `p${i}` as PlayerName,
  );

  const contributions = new Map<PlayerName, Chips.Chips>();
  for (const player of seatOrder) {
    // Plenty of zeros and plenty of collisions at the same level, so that
    // shared all-in levels and non-contributors are both well covered.
    const roll = next();
    const amount =
      roll < 0.15 ? 0 : Math.floor(next() * 6) * 10 + Math.floor(next() * 3);
    contributions.set(player, Chips.make(amount));
  }

  // At least one active player, biased toward several folds.
  const active = seatOrder.filter(() => next() > 0.35);
  if (active.length === 0) active.push(seatOrder[0]!);

  return {
    seatOrder,
    contributions,
    active,
    button: Math.floor(next() * count),
  };
};

const total = (amounts: Iterable<number>) => {
  let sum = 0;
  for (const amount of amounts) sum += amount;
  return sum;
};

describe("side pot invariants", () => {
  const scenarios = (() => {
    const next = rng(0xc0ffee);
    return Array.from({ length: 2000 }, () => generate(next));
  })();

  it("pots always conserve the chips contributed", () => {
    for (const { contributions, active } of scenarios) {
      const pots = buildPots(contributions, active);
      expect(total(pots.map((pot) => pot.amount))).toBe(
        total(contributions.values()),
      );
    }
  });

  it("uncalled returns plus pots still conserve chips", () => {
    for (const { contributions, active } of scenarios) {
      const { contributions: adjusted, returned } = returnUncalled(
        contributions,
        active,
      );
      const pots = buildPots(adjusted, active);
      expect(
        total(pots.map((pot) => pot.amount)) + total(returned.values()),
      ).toBe(total(contributions.values()));
    }
  });

  it("a full settlement never creates or destroys a chip", () => {
    for (const { contributions, active, seatOrder, button } of scenarios) {
      const { contributions: adjusted, returned } = returnUncalled(
        contributions,
        active,
      );
      const pots = buildPots(adjusted, active);
      const awards = awardPots(
        pots,
        seatOrder,
        button,
        (eligible) =>
          // Award to every eligible player, which exercises splitting and odd
          // chips on every single pot.
          eligible,
      );
      const paidOut = total(payouts(awards).values());
      expect(paidOut + total(returned.values())).toBe(
        total(contributions.values()),
      );
    }
  });

  it("eligibility only ever shrinks as pots layer upward", () => {
    for (const { contributions, active } of scenarios) {
      const pots = buildPots(contributions, active);
      for (let i = 1; i < pots.length; i++) {
        const outer = new Set(pots[i - 1]!.eligible);
        for (const player of pots[i]!.eligible) {
          expect(outer.has(player)).toBe(true);
        }
      }
    }
  });

  it("only players still in the hand are ever eligible", () => {
    for (const { contributions, active } of scenarios) {
      const activeSet = new Set(active);
      for (const pot of buildPots(contributions, active)) {
        for (const player of pot.eligible) {
          expect(activeSet.has(player)).toBe(true);
        }
      }
    }
  });

  it("a player can never win more than they could have been owed", () => {
    for (const { contributions, active, seatOrder, button } of scenarios) {
      const activeSet = new Set(active);
      const { contributions: adjusted } = returnUncalled(contributions, active);
      const pots = buildPots(adjusted, active);
      for (const winner of active) {
        const eligibleEverywhere = pots.every((pot) =>
          pot.eligible.includes(winner),
        );
        if (!eligibleEverywhere) continue;
        const awards = awardPots(pots, seatOrder, button, () => [winner]);
        const won = payouts(awards).get(winner) ?? 0;
        const mine = adjusted.get(winner) ?? 0;
        // You get your own chips back, and from each opponent still in the
        // hand at most what you yourself put up. Chips left behind by folded
        // players are dead money and are winnable in full.
        const ceiling = total(
          [...adjusted.entries()].map(([player, amount]) => {
            if (player === winner) return amount;
            return activeSet.has(player) ? Math.min(amount, mine) : amount;
          }),
        );
        expect(won).toBeLessThanOrEqual(ceiling);
      }
    }
  });

  it("every share is a whole number of chips", () => {
    for (const { contributions, active, seatOrder, button } of scenarios) {
      const pots = buildPots(contributions, active);
      const awards = awardPots(pots, seatOrder, button, (eligible) => eligible);
      for (const award of awards) {
        expect(total(award.shares.map((s) => s.amount))).toBe(award.amount);
        for (const share of award.shares) {
          expect(Number.isInteger(share.amount)).toBe(true);
          expect(share.amount).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});
