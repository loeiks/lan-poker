import { describe, expect, it } from "@effect/vitest";
import type { Card } from "~/domain/Card";
import { DECK } from "~/domain/Card";
import { Category, evaluate } from "~/rules/evaluate";

/**
 * Classifies all 2,598,960 distinct five-card hands and checks the totals
 * against known poker frequencies -- any miscategorisation shifts at least two counts.
 */
describe("exhaustive: all C(52,5) hands", () => {
  it("reproduces the known frequency of every category", () => {
    const counts = new Map<number, number>();
    const deck = DECK as ReadonlyArray<Card>;
    let total = 0;

    for (let a = 0; a < 48; a++)
      for (let b = a + 1; b < 49; b++)
        for (let c = b + 1; c < 50; c++)
          for (let d = c + 1; d < 51; d++)
            for (let e = d + 1; e < 52; e++) {
              const { category } = evaluate([
                deck[a]!,
                deck[b]!,
                deck[c]!,
                deck[d]!,
                deck[e]!,
              ]);
              counts.set(category, (counts.get(category) ?? 0) + 1);
              total++;
            }

    expect(total).toBe(2_598_960);

    // Straights and flushes here exclude straight flushes, counted separately.
    expect(counts.get(Category.StraightFlush)).toBe(40);
    expect(counts.get(Category.Quads)).toBe(624);
    expect(counts.get(Category.FullHouse)).toBe(3_744);
    expect(counts.get(Category.Flush)).toBe(5_108);
    expect(counts.get(Category.Straight)).toBe(10_200);
    expect(counts.get(Category.Trips)).toBe(54_912);
    expect(counts.get(Category.TwoPair)).toBe(123_552);
    expect(counts.get(Category.Pair)).toBe(1_098_240);
    expect(counts.get(Category.HighCard)).toBe(1_302_540);
  }, 120_000);
});
