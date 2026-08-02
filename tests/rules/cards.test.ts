import { describe, expect, it } from "@effect/vitest";

import type { Card } from "~/domain/Card";
import { DECK } from "~/domain/Card";
import type { HandId, PlayerName } from "~/domain/Ids";
import { emptyHand } from "~/rules/betting";
import { availableCards, setBoardCard, setHoleCards } from "~/rules/cards";

const p = (name: string) => name as PlayerName;
const base = () => emptyHand("h1" as HandId, [p("enes"), p("ali")], 0);

const board = (hand: ReturnType<typeof base>, ...cards: Array<Card>) => {
  let next = hand;
  cards.forEach((card, i) => {
    const result = setBoardCard(next, i, card);
    if (!result.ok) throw new Error("unexpected rejection");
    next = result.hand;
  });
  return next;
};

describe("board cards", () => {
  it("records a card and makes it visible", () => {
    const result = setBoardCard(base(), 0, "As");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.hand.board[0]).toBe("As");
  });

  it("accepts cards entered out of order or late", () => {
    const result = setBoardCard(base(), 4, "As");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.hand.board[4]).toBe("As");
      expect(result.hand.board[0]).toBeUndefined();
    }
  });

  it("refuses a sixth board card", () => {
    const result = setBoardCard(base(), 5, "As");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error._tag).toBe("BoardFull");
  });

  it("allows correcting a card in place", () => {
    const hand = board(base(), "As");
    const result = setBoardCard(hand, 0, "Kd");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.hand.board[0]).toBe("Kd");
  });

  it("allows clearing a card", () => {
    const hand = board(base(), "As");
    const result = setBoardCard(hand, 0, undefined);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.hand.board[0]).toBeUndefined();
  });
});

describe("duplicate detection", () => {
  it("rejects a card already on the board and says where it is", () => {
    const hand = board(base(), "As");
    const result = setBoardCard(hand, 1, "As");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe("DuplicateCard");
      expect((result.error as { heldBy: { _tag: string } }).heldBy._tag).toBe(
        "board",
      );
    }
  });

  it("rejects a card already held by a player and names them", () => {
    const withHole = setHoleCards(base(), p("ali"), ["As", "Kd"]);
    if (!withHole.ok) throw new Error("setup failed");
    const result = setBoardCard(withHole.hand, 0, "As");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const heldBy = (
        result.error as { heldBy: { _tag: string; player?: string } }
      ).heldBy;
      expect(heldBy._tag).toBe("player");
      expect(heldBy.player).toBe(p("ali"));
    }
  });

  it("rejects a player holding the same card twice", () => {
    const result = setHoleCards(base(), p("enes"), ["As", "As"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error._tag).toBe("DuplicateCard");
  });

  it("rejects a card another player already holds", () => {
    const first = setHoleCards(base(), p("ali"), ["As", "Kd"]);
    if (!first.ok) throw new Error("setup failed");
    const result = setHoleCards(first.hand, p("enes"), ["As", "2c"]);
    expect(result.ok).toBe(false);
  });

  it("frees a card once it is cleared", () => {
    const hand = board(base(), "As");
    const cleared = setBoardCard(hand, 0, undefined);
    if (!cleared.ok) throw new Error("setup failed");
    const result = setHoleCards(cleared.hand, p("enes"), ["As", "2c"]);
    expect(result.ok).toBe(true);
  });

  it("frees a card when it is replaced in place", () => {
    const hand = board(base(), "As");
    const replaced = setBoardCard(hand, 0, "Kd");
    if (!replaced.ok) throw new Error("setup failed");
    const result = setHoleCards(replaced.hand, p("enes"), ["As", "2c"]);
    expect(result.ok).toBe(true);
  });

  it("lets a player re-enter their own cards", () => {
    const first = setHoleCards(base(), p("enes"), ["As", "Kd"]);
    if (!first.ok) throw new Error("setup failed");
    const result = setHoleCards(first.hand, p("enes"), ["As", "2c"]);
    expect(result.ok).toBe(true);
  });

  it("starts every hand with a clean slate", () => {
    const hand = board(base(), "As", "Kd", "7c");
    expect(availableCards(hand, DECK).length).toBe(49);
    // A brand new hand has all 52 available again.
    expect(availableCards(base(), DECK).length).toBe(52);
  });
});

describe("hole cards", () => {
  it("stores cards against the player", () => {
    const result = setHoleCards(base(), p("enes"), ["As", "Kd"]);
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.hand.holeCards.get(p("enes"))).toEqual(["As", "Kd"]);
  });

  it("allows clearing", () => {
    const first = setHoleCards(base(), p("enes"), ["As", "Kd"]);
    if (!first.ok) throw new Error("setup failed");
    const result = setHoleCards(first.hand, p("enes"), undefined);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.hand.holeCards.has(p("enes"))).toBe(false);
  });
});

describe("availableCards", () => {
  it("excludes everything already recorded", () => {
    const hand = board(base(), "As", "Kd");
    const withHole = setHoleCards(hand, p("enes"), ["7c", "2h"]);
    if (!withHole.ok) throw new Error("setup failed");
    const available = availableCards(withHole.hand, DECK);
    expect(available).toHaveLength(48);
    for (const card of ["As", "Kd", "7c", "2h"]) {
      expect(available).not.toContain(card);
    }
  });
});
