import { describe, expect, it } from "@effect/vitest";

import type { Card } from "~/domain/Card";
import { parseCard } from "~/domain/Card";
import type { PlayerName } from "~/domain/Ids";
import {
  canEvaluate,
  Category,
  compare,
  evaluate,
  winnersAmong,
  winnersFromCards,
} from "~/rules/evaluate";

const cards = (spec: string): ReadonlyArray<Card> =>
  spec.split(/\s+/).map((raw) => {
    const card = parseCard(raw);
    if (card === undefined) throw new Error(`bad card in test: ${raw}`);
    return card;
  });

const p = (name: string) => name as PlayerName;
const categoryOf = (spec: string) => evaluate(cards(spec)).category;

describe("evaluate: categories", () => {
  it("classifies every category", () => {
    expect(categoryOf("9h 8h 7h 6h 5h")).toBe(Category.StraightFlush);
    expect(categoryOf("As Ks Qs Js Ts")).toBe(Category.StraightFlush);
    expect(categoryOf("9h 9s 9d 9c 5h")).toBe(Category.Quads);
    expect(categoryOf("9h 9s 9d 5c 5h")).toBe(Category.FullHouse);
    expect(categoryOf("Ah Jh 8h 5h 2h")).toBe(Category.Flush);
    expect(categoryOf("9h 8s 7d 6c 5h")).toBe(Category.Straight);
    expect(categoryOf("9h 9s 9d Kc 5h")).toBe(Category.Trips);
    expect(categoryOf("9h 9s 5d 5c Kh")).toBe(Category.TwoPair);
    expect(categoryOf("9h 9s Kd 7c 5h")).toBe(Category.Pair);
    expect(categoryOf("Ah Jd 8s 5c 2h")).toBe(Category.HighCard);
  });

  it("handles the wheel", () => {
    expect(categoryOf("Ah 2s 3d 4c 5h")).toBe(Category.Straight);
    expect(categoryOf("Ah 2h 3h 4h 5h")).toBe(Category.StraightFlush);
    expect(
      compare(
        evaluate(cards("Ah 2s 3d 4c 5h")),
        evaluate(cards("6h 2s 3d 4c 5h")),
      ),
    ).toBeLessThan(0);
  });

  it("does not treat K-A-2-3-4 as a straight", () => {
    expect(categoryOf("Kh As 2d 3c 4h")).toBe(Category.HighCard);
  });
});

describe("compare", () => {
  it("orders the categories ascending", () => {
    const ascending = [
      "Ah Jd 8s 5c 2h",
      "9h 9s Kd 7c 5h",
      "9h 9s 5d 5c Kh",
      "9h 9s 9d Kc 5h",
      "9h 8s 7d 6c 5h",
      "Ah Jh 8h 5h 2h",
      "9h 9s 9d 5c 5h",
      "9h 9s 9d 9c 5h",
      "9h 8h 7h 6h 5h",
    ].map((spec) => evaluate(cards(spec)));

    for (let i = 1; i < ascending.length; i++) {
      expect(compare(ascending[i - 1]!, ascending[i]!)).toBeLessThan(0);
    }
  });

  it("breaks ties on kickers", () => {
    expect(
      compare(
        evaluate(cards("9h 9s Kd 7c 5h")),
        evaluate(cards("9h 9s Ad 7c 5h")),
      ),
    ).toBeLessThan(0);
  });

  it("compares two pair by top pair, then kicker", () => {
    expect(
      compare(
        evaluate(cards("Qh Qs Jd Jc Ah")),
        evaluate(cards("Kh Ks 2d 2c 3h")),
      ),
    ).toBeLessThan(0);
    expect(
      compare(
        evaluate(cards("Kh Ks 2d 2c 3h")),
        evaluate(cards("Kh Ks 2d 2c Ah")),
      ),
    ).toBeLessThan(0);
  });

  it("never uses suits to break a tie", () => {
    expect(
      compare(
        evaluate(cards("Ah Ks Qd Jc 9h")),
        evaluate(cards("Ac Kd Qh Js 9c")),
      ),
    ).toBe(0);
    expect(
      compare(
        evaluate(cards("Ah Kh Qh Jh 9h")),
        evaluate(cards("As Ks Qs Js 9s")),
      ),
    ).toBe(0);
  });
});

describe("evaluate: best of seven", () => {
  it("picks the best five of seven", () => {
    const result = evaluate(cards("Ah Kh 9h 9s 4h 2c 7h"));
    expect(result.category).toBe(Category.Flush);
    expect(result.cards).toHaveLength(5);
  });

  it("finds a straight spanning hole and board", () => {
    expect(evaluate(cards("8h 7s 6d 5c 4h Ks Qd")).category).toBe(
      Category.Straight,
    );
  });

  it("plays the board when hole cards add nothing", () => {
    const result = evaluate(cards("Ah Ks Qd Jc Th 2s 3d"));
    expect(result.category).toBe(Category.Straight);
    expect(new Set(result.cards)).toEqual(new Set(cards("Ah Ks Qd Jc Th")));
  });

  it("prefers quads over a full house from the same seven", () => {
    expect(evaluate(cards("9h 9s 9d 9c Kh Ks 2d")).category).toBe(
      Category.Quads,
    );
  });

  it("rejects fewer than five cards", () => {
    expect(() => evaluate(cards("Ah Kh 9h 9s"))).toThrow();
  });
});

describe("winnersAmong", () => {
  const board = cards("Ah Kd 7s 3c 2h");

  it("picks the single best hand", () => {
    const winners = winnersAmong([
      { player: p("enes"), cards: [...cards("As Ks"), ...board] },
      { player: p("ali"), cards: [...cards("7d 7h"), ...board] },
    ]);
    expect(winners).toEqual([p("ali")]); // trip sevens beats two pair
  });

  it("returns every player tied for best", () => {
    const winners = winnersAmong([
      { player: p("enes"), cards: [...cards("Qs Js"), ...board] },
      { player: p("ali"), cards: [...cards("Qd Jd"), ...board] },
    ]);
    expect(new Set(winners)).toEqual(new Set([p("enes"), p("ali")]));
  });

  it("returns nothing for an empty field", () => {
    expect(winnersAmong([])).toEqual([]);
  });
});

describe("winnersFromCards", () => {
  const board = cards("Ah Kd 7s 3c 2h");

  it("is unavailable until all five board cards are known", () => {
    expect(winnersFromCards(cards("Ah Kd 7s"), new Map())).toBeUndefined();
    expect(winnersFromCards(board, new Map())).toBeDefined();
  });

  it("resolves winners when every eligible player's cards are known", () => {
    const holeCards = new Map<PlayerName, readonly [Card, Card]>([
      [p("enes"), cards("As Ks") as unknown as readonly [Card, Card]],
      [p("ali"), cards("7d 7h") as unknown as readonly [Card, Card]],
    ]);
    const pick = winnersFromCards(board, holeCards)!;
    expect(pick([p("enes"), p("ali")])).toEqual([p("ali")]);
  });

  it("yields no winner when a player's cards are missing", () => {
    const holeCards = new Map<PlayerName, readonly [Card, Card]>([
      [p("enes"), cards("As Ks") as unknown as readonly [Card, Card]],
    ]);
    const pick = winnersFromCards(board, holeCards)!;
    expect(pick([p("enes"), p("ali")])).toEqual([]);
  });
});

describe("canEvaluate", () => {
  const board = cards("Ah Kd 7s 3c 2h");
  const holeCards = new Map<PlayerName, readonly [Card, Card]>([
    [p("enes"), cards("As Ks") as unknown as readonly [Card, Card]],
  ]);

  it("needs a full board and every eligible player's hole cards", () => {
    expect(canEvaluate(board, holeCards, [p("enes")])).toBe(true);
    expect(canEvaluate(board, holeCards, [p("enes"), p("ali")])).toBe(false);
    expect(canEvaluate(cards("Ah Kd 7s"), holeCards, [p("enes")])).toBe(false);
  });
});

describe("descriptions", () => {
  it("describes hands for the live ranking display", () => {
    expect(evaluate(cards("As Ks Qs Js Ts")).description).toBe("Royal Flush");
    expect(evaluate(cards("9h 9s 9d 9c 5h")).description).toContain(
      "Four of a Kind",
    );
    expect(evaluate(cards("9h 9s 9d 5c 5h")).description).toContain(
      "Full House",
    );
    expect(evaluate(cards("9h 8s 7d 6c 5h")).description).toContain("Straight");
    expect(evaluate(cards("9h 9s Kd 7c 5h")).description).toContain("Pair");
  });
});
