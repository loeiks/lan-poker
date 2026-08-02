import { describe, expect, it } from "@effect/vitest";

import * as Chips from "~/domain/Chips";
import type { PlayerName } from "~/domain/Ids";
import { awardPots, buildPots, returnUncalled, splitPot } from "~/rules/pots";

const p = (name: string) => name as PlayerName;

const contribs = (entries: Record<string, number>) =>
  new Map(
    Object.entries(entries).map(([name, amount]) => [
      p(name),
      Chips.make(amount),
    ]),
  );

const names = (list: ReadonlyArray<string>) => list.map(p);

describe("buildPots", () => {
  it("forms a single pot when nobody is short", () => {
    const pots = buildPots(
      contribs({ enes: 80, ali: 80, zeynep: 80 }),
      names(["enes", "ali", "zeynep"]),
    );
    expect(pots).toEqual([
      { amount: 240, eligible: names(["enes", "ali", "zeynep"]) },
    ]);
  });

  it("splits into a main and side pot around one short all-in", () => {
    const pots = buildPots(
      contribs({ enes: 30, ali: 80, zeynep: 80 }),
      names(["enes", "ali", "zeynep"]),
    );
    expect(pots).toEqual([
      { amount: 90, eligible: names(["enes", "ali", "zeynep"]) },
      { amount: 100, eligible: names(["ali", "zeynep"]) },
    ]);
  });

  it("counts folded contributions but never makes them eligible", () => {
    // deniz folded after putting in 80.
    const pots = buildPots(
      contribs({ enes: 30, ali: 80, zeynep: 80, deniz: 80 }),
      names(["enes", "ali", "zeynep"]),
    );
    expect(pots).toEqual([
      { amount: 120, eligible: names(["enes", "ali", "zeynep"]) },
      { amount: 150, eligible: names(["ali", "zeynep"]) },
    ]);
    for (const pot of pots) expect(pot.eligible).not.toContain(p("deniz"));
  });

  it("forms one layer per distinct all-in level", () => {
    const pots = buildPots(
      contribs({ a: 10, b: 30, c: 60, d: 100 }),
      names(["a", "b", "c", "d"]),
    );
    expect(pots).toEqual([
      { amount: 40, eligible: names(["a", "b", "c", "d"]) },
      { amount: 60, eligible: names(["b", "c", "d"]) },
      { amount: 60, eligible: names(["c", "d"]) },
      { amount: 40, eligible: names(["d"]) },
    ]);
  });

  it("drops zero-amount layers", () => {
    const pots = buildPots(contribs({ a: 50, b: 50 }), names(["a", "b"]));
    expect(pots).toHaveLength(1);
    for (const pot of pots) expect(pot.amount).toBeGreaterThan(0);
  });

  it("ignores players who contributed nothing", () => {
    const pots = buildPots(
      contribs({ a: 50, b: 50, c: 0 }),
      names(["a", "b", "c"]),
    );
    expect(pots).toEqual([{ amount: 100, eligible: names(["a", "b"]) }]);
  });

  it("folds dead money down into a pot someone can win", () => {
    // enes is all-in for 30; ali and zeynep both folded having put in 80.
    // The layer above 30 has no eligible player, so those chips would
    // otherwise vanish. enes is last standing and takes everything.
    const pots = buildPots(
      contribs({ enes: 30, ali: 80, zeynep: 80 }),
      names(["enes"]),
    );
    expect(pots).toEqual([{ amount: 190, eligible: names(["enes"]) }]);
  });

  it("keeps dead money on the table even when no one contributed to a live pot", () => {
    // Everyone who put chips in has folded; the only active player put in
    // nothing. The chips still belong to whoever is left.
    const pots = buildPots(contribs({ a: 0, b: 32 }), names(["a"]));
    expect(pots.reduce((sum, pot) => sum + pot.amount, 0)).toBe(32);
    expect(pots[0]!.eligible).toEqual(names(["a"]));
  });

  it("conserves chips", () => {
    const contributions = contribs({
      enes: 30,
      ali: 80,
      zeynep: 80,
      deniz: 55,
    });
    const pots = buildPots(contributions, names(["enes", "ali", "zeynep"]));
    const potTotal = pots.reduce((sum, pot) => sum + pot.amount, 0);
    const contributed = [...contributions.values()].reduce((a, b) => a + b, 0);
    expect(potTotal).toBe(contributed);
  });
});

describe("returnUncalled", () => {
  it("returns the portion no opponent could match", () => {
    const result = returnUncalled(
      contribs({ enes: 30, ali: 80 }),
      names(["enes", "ali"]),
    );
    expect(result.returned.get(p("ali"))).toBe(50);
    expect(result.contributions.get(p("ali"))).toBe(30);
    expect(result.contributions.get(p("enes"))).toBe(30);
  });

  it("returns nothing when the top bet was matched", () => {
    const result = returnUncalled(
      contribs({ enes: 80, ali: 80 }),
      names(["enes", "ali"]),
    );
    expect(result.returned.size).toBe(0);
  });

  it("only ever returns to a single player", () => {
    const result = returnUncalled(
      contribs({ a: 20, b: 20, c: 90 }),
      names(["a", "b", "c"]),
    );
    expect(result.returned.size).toBe(1);
    expect(result.returned.get(p("c"))).toBe(70);
  });

  it("counts folded players' chips as matching", () => {
    // deniz folded but had already put in 80, so ali's 80 was covered.
    const result = returnUncalled(
      contribs({ ali: 80, deniz: 80 }),
      names(["ali"]),
    );
    expect(result.returned.size).toBe(0);
  });

  it("returns the whole bet when everyone else folded pre-action", () => {
    const result = returnUncalled(contribs({ ali: 40 }), names(["ali"]));
    expect(result.returned.get(p("ali"))).toBe(40);
    expect(result.contributions.get(p("ali"))).toBe(0);
  });

  it("conserves chips", () => {
    const original = contribs({ enes: 30, ali: 80, zeynep: 55 });
    const result = returnUncalled(original, names(["enes", "ali", "zeynep"]));
    const before = [...original.values()].reduce((a, b) => a + b, 0);
    const after =
      [...result.contributions.values()].reduce((a, b) => a + b, 0) +
      [...result.returned.values()].reduce((a, b) => a + b, 0);
    expect(after).toBe(before);
  });
});

describe("splitPot", () => {
  const seatOrder = names(["btn", "sb", "bb", "utg"]);

  it("splits evenly when it divides", () => {
    const shares = splitPot(Chips.make(200), names(["sb", "bb"]), seatOrder, 0);
    expect(shares).toEqual([
      { player: p("sb"), amount: 100 },
      { player: p("bb"), amount: 100 },
    ]);
  });

  it("gives the odd chip to the player closest clockwise of the button", () => {
    const shares = splitPot(Chips.make(201), names(["bb", "sb"]), seatOrder, 0);
    const bySeat = new Map(shares.map((s) => [s.player, s.amount]));
    expect(bySeat.get(p("sb"))).toBe(101);
    expect(bySeat.get(p("bb"))).toBe(100);
  });

  it("distributes multiple odd chips clockwise from the button", () => {
    const shares = splitPot(
      Chips.make(100),
      names(["sb", "bb", "utg"]),
      seatOrder,
      0,
    );
    const bySeat = new Map(shares.map((s) => [s.player, s.amount]));
    expect(bySeat.get(p("sb"))).toBe(34);
    expect(bySeat.get(p("bb"))).toBe(33);
    expect(bySeat.get(p("utg"))).toBe(33);
    expect(shares.reduce((sum, s) => sum + s.amount, 0)).toBe(100);
  });

  it("gives everything to a single winner", () => {
    const shares = splitPot(Chips.make(201), names(["bb"]), seatOrder, 0);
    expect(shares).toEqual([{ player: p("bb"), amount: 201 }]);
  });

  it("never produces a fractional share", () => {
    for (const total of [1, 7, 99, 101, 1000]) {
      const shares = splitPot(
        Chips.make(total),
        names(["sb", "bb", "utg"]),
        seatOrder,
        0,
      );
      for (const share of shares)
        expect(Number.isInteger(share.amount)).toBe(true);
      expect(shares.reduce((sum, s) => sum + s.amount, 0)).toBe(total);
    }
  });
});

describe("awardPots", () => {
  const seatOrder = names(["enes", "ali", "zeynep"]);

  it("gives a short stack only the pot they were eligible for", () => {
    const pots = [
      { amount: Chips.make(90), eligible: names(["enes", "ali", "zeynep"]) },
      { amount: Chips.make(100), eligible: names(["ali", "zeynep"]) },
    ];
    const awards = awardPots(pots, seatOrder, 0, (eligible) =>
      // enes has the best hand overall; ali beats zeynep.
      eligible.includes(p("enes")) ? [p("enes")] : [p("ali")],
    );
    expect(awards[0]!.shares).toEqual([{ player: p("enes"), amount: 90 }]);
    expect(awards[1]!.shares).toEqual([{ player: p("ali"), amount: 100 }]);
  });

  it("splits a pot between tied winners", () => {
    const pots = [
      { amount: Chips.make(200), eligible: names(["enes", "ali"]) },
    ];
    const awards = awardPots(pots, seatOrder, 0, () => names(["enes", "ali"]));
    expect(awards[0]!.shares).toEqual([
      { player: p("enes"), amount: 100 },
      { player: p("ali"), amount: 100 },
    ]);
  });

  it("conserves chips across every pot", () => {
    const pots = [
      { amount: Chips.make(90), eligible: names(["enes", "ali", "zeynep"]) },
      { amount: Chips.make(101), eligible: names(["ali", "zeynep"]) },
    ];
    const awards = awardPots(pots, seatOrder, 0, (eligible) => [eligible[0]!]);
    const paid = awards
      .flatMap((a) => a.shares)
      .reduce((s, x) => s + x.amount, 0);
    expect(paid).toBe(191);
  });

  it("refuses to award a pot to an ineligible player", () => {
    const pots = [{ amount: Chips.make(90), eligible: names(["ali"]) }];
    expect(() => awardPots(pots, seatOrder, 0, () => [p("zeynep")])).toThrow();
  });
});
