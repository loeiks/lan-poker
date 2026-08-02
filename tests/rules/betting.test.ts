import { describe, expect, it } from "@effect/vitest";

import * as Chips from "~/domain/Chips";
import type { HandId, PlayerName, TableId } from "~/domain/Ids";
import type { HandState } from "~/domain/State";
import {
  actingPlayer,
  contributionOf,
  roundContributionOf,
} from "~/domain/State";
import { TableConfig } from "~/domain/TableConfig";
import {
  advanceStreet,
  applyAction,
  bettingExhausted,
  emptyHand,
  isRoundClosed,
  legalActions,
  onlyOneLeft,
  openRound,
  postBlind,
} from "~/rules/betting";
import { blindSeats } from "~/rules/positions";

const p = (name: string) => name as PlayerName;

const config = new TableConfig({
  id: "t1" as TableId,
  name: "test",
  minimum: Chips.make(10),
  mode: "BURNOUT_CREDIT",
  startingBalance: Chips.make(700),
  adminName: undefined,
});

/** A hand with blinds posted and the action open, plus a mutable bank. */
const setup = (
  names: ReadonlyArray<string>,
  balances: Record<string, number> = {},
) => {
  const players = names.map(p);
  const bank = new Map<PlayerName, Chips.Chips>(
    players.map((name) => [name, Chips.make(balances[name] ?? 1000)]),
  );

  let hand = emptyHand("h1" as HandId, players, 0);
  const seats = blindSeats(players.length, 0);
  const sb = players[seats.smallBlind]!;
  const bb = players[seats.bigBlind]!;

  const posted = postBlind(hand, sb, "small", config.smallBlind, bank.get(sb)!);
  hand = posted.hand;
  bank.set(sb, Chips.sub(bank.get(sb)!, posted.event.amount));

  const postedBig = postBlind(hand, bb, "big", config.bigBlind, bank.get(bb)!);
  hand = postedBig.hand;
  bank.set(bb, Chips.sub(bank.get(bb)!, postedBig.event.amount));

  hand = openRound(hand);

  const act = (
    name: string,
    intent: Parameters<typeof applyAction>[4],
  ): HandState => {
    const player = p(name);
    const result = applyAction(hand, config, player, bank.get(player)!, intent);
    if (!result.ok)
      throw new Error(`rejected: ${JSON.stringify(result.error)}`);
    hand = result.hand;
    bank.set(player, Chips.sub(bank.get(player)!, result.spent));
    return hand;
  };

  const attempt = (name: string, intent: Parameters<typeof applyAction>[4]) => {
    const player = p(name);
    return applyAction(hand, config, player, bank.get(player)!, intent);
  };

  return {
    get hand() {
      return hand;
    },
    set hand(next: HandState) {
      hand = next;
    },
    bank,
    act,
    attempt,
    balanceOf: (name: PlayerName) => bank.get(name)!,
  };
};

describe("blinds", () => {
  it("posts small and big blinds and sets the current bet", () => {
    const t = setup(["a", "b", "c"]);
    expect(contributionOf(t.hand, p("b"))).toBe(5);
    expect(contributionOf(t.hand, p("c"))).toBe(10);
    expect(t.hand.currentBet).toBe(10);
  });

  it("puts a short stack all-in for what they have", () => {
    const t = setup(["a", "b", "c"], { b: 3 });
    expect(contributionOf(t.hand, p("b"))).toBe(3);
    expect(t.hand.allIn.has(p("b"))).toBe(true);
    expect(t.bank.get(p("b"))).toBe(0);
  });

  it("opens the action under the gun with three or more players", () => {
    const t = setup(["a", "b", "c", "d"]);
    // a=button, b=small blind, c=big blind, so d is under the gun.
    expect(actingPlayer(t.hand)).toBe(p("d"));
  });

  it("wraps under the gun back to the button with exactly three players", () => {
    const t = setup(["a", "b", "c"]);
    expect(actingPlayer(t.hand)).toBe(p("a"));
  });

  it("opens the action on the button heads-up", () => {
    const t = setup(["a", "b"]);
    expect(actingPlayer(t.hand)).toBe(p("a"));
    expect(contributionOf(t.hand, p("a"))).toBe(5); // button posts the small blind
    expect(contributionOf(t.hand, p("b"))).toBe(10);
  });
});

describe("legalActions", () => {
  it("offers call, raise, fold and all-in facing a bet", () => {
    const t = setup(["a", "b", "c"]);
    const legal = legalActions(t.hand, config, t.balanceOf);
    expect(legal.check).toBe(false);
    expect(legal.call).toBe(10);
    expect(legal.fold).toBe(true);
    expect(legal.raise?.min).toBe(20);
    expect(legal.raise?.step).toBe(10);
    expect(legal.allIn).toBe(1000);
  });

  it("offers check when nothing is owed", () => {
    const t = setup(["a", "b", "c"]);
    t.act("a", { kind: "call" });
    t.act("b", { kind: "call" });
    // c is the big blind and has already matched.
    const legal = legalActions(t.hand, config, t.balanceOf);
    expect(legal.check).toBe(true);
    expect(legal.call).toBeUndefined();
  });

  it("offers nothing when nobody is left to act", () => {
    const t = setup(["a", "b", "c"]);
    t.hand = { ...t.hand, actingIndex: undefined };
    const legal = legalActions(t.hand, config, t.balanceOf);
    expect(legal.check).toBe(false);
    expect(legal.fold).toBe(false);
    expect(legal.allIn).toBeUndefined();
  });

  it("caps the raise range at what the player can cover", () => {
    const t = setup(["a", "b", "c"], { a: 45 });
    const legal = legalActions(t.hand, config, t.balanceOf);
    expect(legal.raise?.max).toBe(40); // floored to a multiple of the minimum
  });
});

describe("applyAction", () => {
  it("rejects an action from someone whose turn it is not", () => {
    const t = setup(["a", "b", "c"]);
    const result = t.attempt("b", { kind: "call" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error._tag).toBe("NotYourTurn");
  });

  it("rejects a check facing a bet", () => {
    const t = setup(["a", "b", "c"]);
    const result = t.attempt("a", { kind: "check" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe("IllegalAction");
      expect((result.error as { reason: string }).reason).toBe(
        "check-facing-bet",
      );
    }
  });

  it("moves chips on a call", () => {
    const t = setup(["a", "b", "c"]);
    t.act("a", { kind: "call" });
    expect(contributionOf(t.hand, p("a"))).toBe(10);
    expect(t.bank.get(p("a"))).toBe(990);
  });

  it("takes a folded player out without refunding their chips", () => {
    const t = setup(["a", "b", "c"]);
    t.act("a", { kind: "call" });
    t.act("b", { kind: "fold" });
    expect(t.hand.folded.has(p("b"))).toBe(true);
    expect(contributionOf(t.hand, p("b"))).toBe(5); // blind stays in
  });

  it("raises to a multiple of the table minimum", () => {
    const t = setup(["a", "b", "c"]);
    t.act("a", { kind: "raise", to: Chips.make(30) });
    expect(t.hand.currentBet).toBe(30);
    expect(contributionOf(t.hand, p("a"))).toBe(30);
    expect(t.bank.get(p("a"))).toBe(970);
  });

  it("rejects a raise that is not a multiple of the minimum", () => {
    const t = setup(["a", "b", "c"]);
    const result = t.attempt("a", { kind: "raise", to: Chips.make(15) });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as { reason: string }).reason).toBe(
        "raise-not-multiple-of-minimum",
      );
    }
  });

  it("rejects a raise at or below the current bet", () => {
    const t = setup(["a", "b", "c"]);
    const result = t.attempt("a", { kind: "raise", to: Chips.make(10) });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as { reason: string }).reason).toBe(
        "raise-below-current-bet",
      );
    }
  });

  it("rejects a raise beyond the balance in favour of an all-in", () => {
    const t = setup(["a", "b", "c"], { a: 25 });
    const result = t.attempt("a", { kind: "raise", to: Chips.make(30) });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as { reason: string }).reason).toBe(
        "bet-exceeds-balance",
      );
    }
  });

  it("lets an all-in ignore the stepper", () => {
    const t = setup(["a", "b", "c"], { a: 37 });
    t.act("a", { kind: "allin" });
    expect(contributionOf(t.hand, p("a"))).toBe(37);
    expect(t.hand.currentBet).toBe(37);
    expect(t.hand.allIn.has(p("a"))).toBe(true);
    expect(t.bank.get(p("a"))).toBe(0);
  });

  it("marks a short call as all-in without raising the bet", () => {
    const t = setup(["a", "b", "c"], { a: 4 });
    t.act("a", { kind: "call" });
    expect(contributionOf(t.hand, p("a"))).toBe(4);
    expect(t.hand.allIn.has(p("a"))).toBe(true);
    expect(t.hand.currentBet).toBe(10);
  });
});

describe("round closure", () => {
  it("closes when everyone has called the big blind", () => {
    const t = setup(["a", "b", "c"]);
    t.act("a", { kind: "call" });
    t.act("b", { kind: "call" });
    expect(isRoundClosed(t.hand)).toBe(false); // big blind still to act
    t.act("c", { kind: "check" });
    expect(isRoundClosed(t.hand)).toBe(true);
  });

  it("closes when everyone checks postflop", () => {
    const t = setup(["a", "b", "c"]);
    t.act("a", { kind: "call" });
    t.act("b", { kind: "call" });
    t.act("c", { kind: "check" });
    t.hand = advanceStreet(t.hand);
    expect(t.hand.street).toBe("flop");
    t.act("b", { kind: "check" }); // small blind acts first postflop
    t.act("c", { kind: "check" });
    expect(isRoundClosed(t.hand)).toBe(false);
    t.act("a", { kind: "check" });
    expect(isRoundClosed(t.hand)).toBe(true);
  });

  it("reopens the action after a raise", () => {
    const t = setup(["a", "b", "c"]);
    t.act("a", { kind: "call" });
    t.act("b", { kind: "call" });
    t.act("c", { kind: "raise", to: Chips.make(40) });
    expect(isRoundClosed(t.hand)).toBe(false);
    t.act("a", { kind: "call" });
    expect(isRoundClosed(t.hand)).toBe(false);
    t.act("b", { kind: "call" });
    expect(isRoundClosed(t.hand)).toBe(true);
  });

  it("does not wait on players who are all-in", () => {
    const t = setup(["a", "b", "c"], { a: 37 });
    t.act("a", { kind: "allin" });
    t.act("b", { kind: "call" });
    t.act("c", { kind: "call" });
    expect(isRoundClosed(t.hand)).toBe(true);
  });
});

describe("street advancement", () => {
  it("resets per-round contributions but keeps hand totals", () => {
    const t = setup(["a", "b", "c"]);
    t.act("a", { kind: "call" });
    t.act("b", { kind: "call" });
    t.act("c", { kind: "check" });
    t.hand = advanceStreet(t.hand);

    expect(t.hand.street).toBe("flop");
    expect(t.hand.currentBet).toBe(0);
    expect(roundContributionOf(t.hand, p("a"))).toBe(0);
    expect(contributionOf(t.hand, p("a"))).toBe(10);
  });

  it("opens each postflop street left of the button", () => {
    const t = setup(["a", "b", "c"]);
    t.act("a", { kind: "call" });
    t.act("b", { kind: "call" });
    t.act("c", { kind: "check" });
    t.hand = advanceStreet(t.hand);
    expect(actingPlayer(t.hand)).toBe(p("b"));
  });

  it("runs preflop through to showdown", () => {
    let hand = setup(["a", "b", "c"]).hand;
    for (const expected of ["flop", "turn", "river", "showdown"] as const) {
      hand = advanceStreet(hand);
      expect(hand.street).toBe(expected);
    }
    expect(hand.actingIndex).toBeUndefined();
  });
});

describe("early termination", () => {
  it("ends the hand when everyone but one folds", () => {
    const t = setup(["a", "b", "c"]);
    t.act("a", { kind: "fold" });
    t.act("b", { kind: "fold" });
    expect(onlyOneLeft(t.hand)).toBe(true);
  });

  it("reports betting exhausted when fewer than two can still act", () => {
    const t = setup(["a", "b", "c"], { a: 37, b: 20 });
    expect(bettingExhausted(t.hand)).toBe(false);
    t.act("a", { kind: "allin" });
    t.act("b", { kind: "allin" });
    expect(bettingExhausted(t.hand)).toBe(true);
  });

  it("is not exhausted while two players still have chips", () => {
    const t = setup(["a", "b", "c"]);
    t.act("a", { kind: "call" });
    expect(bettingExhausted(t.hand)).toBe(false);
  });
});
