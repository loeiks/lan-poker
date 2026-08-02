import { describe, expect, it } from "@effect/vitest";

import * as Chips from "~/domain/Chips";
import type { PlayerName, Seq, TableId } from "~/domain/Ids";
import type { PlayerState, TableState } from "~/domain/State";
import { scoreOf } from "~/domain/State";
import type { CreditMode } from "~/domain/TableConfig";
import { TableConfig } from "~/domain/TableConfig";
import {
  burnoutAmount,
  burnoutOnSettle,
  canClaim,
  lossBonusAmount,
  lossBonusOnSettle,
  standings,
  tickCooldown,
} from "~/rules/credit";

const p = (name: string) => name as PlayerName;

const configFor = (mode: CreditMode, minimum = 10) =>
  new TableConfig({
    id: "t1" as TableId,
    name: "test",
    minimum: Chips.make(minimum),
    mode,
    startingBalance: Chips.make(minimum * 70),
    adminName: undefined,
  });

const burnout = configFor("BURNOUT_CREDIT");

const player = (
  over: { name: string } & Partial<Omit<PlayerState, "name">>,
): PlayerState => {
  const { name, ...rest } = over;
  return {
    name: p(name),
    balance: Chips.make(0),
    creditTaken: Chips.make(0),
    ready: false,
    seated: true,
    spendHistory: [],
    pendingCredit: undefined,
    ...rest,
  };
};

const chips = (values: ReadonlyArray<number>) => values.map(Chips.make);

describe("burnoutAmount", () => {
  it("is twice the spend over the last three hands", () => {
    // (20 + 15 + 0) * 2 = 70, within the floor and ceiling.
    expect(burnoutAmount(chips([20, 15, 0]), burnout)).toBe(70);
  });

  it("only looks at the last three hands", () => {
    expect(burnoutAmount(chips([500, 500, 20, 15, 0]), burnout)).toBe(70);
  });

  it("applies the floor so a folder is never stranded", () => {
    // Three folded hands then busting on a blind: 0 * 2 = 0, floored to 5x min.
    expect(burnoutAmount(chips([0, 0, 0]), burnout)).toBe(50);
    expect(burnoutAmount([], burnout)).toBe(50);
  });

  it("applies the ceiling so all-ins cannot run away", () => {
    // 2 * 900 = 1800, capped to 20x min.
    expect(burnoutAmount(chips([300, 300, 300]), burnout)).toBe(200);
  });

  it("scales the floor and ceiling with the table minimum", () => {
    const big = configFor("BURNOUT_CREDIT", 50);
    expect(burnoutAmount(chips([0]), big)).toBe(250);
    expect(burnoutAmount(chips([9999]), big)).toBe(1000);
  });
});

describe("burnoutOnSettle", () => {
  it("fires for a broke player in burnout mode", () => {
    const grant = burnoutOnSettle(
      player({ name: "enes", spendHistory: chips([20, 15, 0]) }),
      burnout,
    );
    expect(grant).toEqual({
      player: p("enes"),
      amount: 70,
      cooldownHands: 3,
    });
  });

  it("does not fire while the player still has chips", () => {
    expect(
      burnoutOnSettle(
        player({ name: "enes", balance: Chips.make(5) }),
        burnout,
      ),
    ).toBeUndefined();
  });

  it("does not grant a second credit while one is pending", () => {
    expect(
      burnoutOnSettle(
        player({
          name: "enes",
          pendingCredit: { amount: Chips.make(70), handsRemaining: 2 },
        }),
        burnout,
      ),
    ).toBeUndefined();
  });

  it("does nothing in the other modes", () => {
    expect(
      burnoutOnSettle(player({ name: "enes" }), configFor("LOSS_BONUS")),
    ).toBeUndefined();
    expect(
      burnoutOnSettle(player({ name: "enes" }), configFor("DISABLED")),
    ).toBeUndefined();
  });
});

describe("cooldown", () => {
  it("counts down one hand at a time", () => {
    let subject = player({
      name: "enes",
      pendingCredit: { amount: Chips.make(70), handsRemaining: 3 },
    });
    expect(canClaim(subject)).toBe(false);

    subject = tickCooldown(subject);
    expect(subject.pendingCredit?.handsRemaining).toBe(2);
    subject = tickCooldown(subject);
    subject = tickCooldown(subject);
    expect(subject.pendingCredit?.handsRemaining).toBe(0);
    expect(canClaim(subject)).toBe(true);
  });

  it("never goes below zero", () => {
    const subject = tickCooldown(
      player({
        name: "enes",
        pendingCredit: { amount: Chips.make(70), handsRemaining: 0 },
      }),
    );
    expect(subject.pendingCredit?.handsRemaining).toBe(0);
  });

  it("keeps the frozen amount unchanged as the cooldown runs", () => {
    // The whole point of freezing: sitting out zeroes the spend history, so
    // recalculating later would always collapse to the floor.
    let subject = player({
      name: "enes",
      spendHistory: chips([20, 15, 0]),
      pendingCredit: { amount: Chips.make(70), handsRemaining: 3 },
    });
    subject = tickCooldown(subject);
    subject = { ...subject, spendHistory: chips([20, 15, 0, 0, 0, 0]) };
    subject = tickCooldown(subject);
    subject = tickCooldown(subject);
    expect(subject.pendingCredit?.amount).toBe(70);
  });

  it("leaves a gift during cooldown from cancelling the credit", () => {
    // A friend transfers chips in; the player can play, and still claims later.
    let subject = player({
      name: "enes",
      pendingCredit: { amount: Chips.make(70), handsRemaining: 2 },
    });
    subject = { ...subject, balance: Chips.make(100) };
    subject = tickCooldown(subject);
    subject = tickCooldown(subject);
    expect(canClaim(subject)).toBe(true);
    expect(subject.pendingCredit?.amount).toBe(70);
  });

  it("does nothing for a player with no pending credit", () => {
    const subject = player({ name: "enes" });
    expect(tickCooldown(subject)).toEqual(subject);
    expect(canClaim(subject)).toBe(false);
  });
});

describe("loss bonus", () => {
  const config = configFor("LOSS_BONUS");

  it("returns fifteen percent of spend, rounded down", () => {
    expect(lossBonusAmount(Chips.make(100))).toBe(15);
    expect(lossBonusAmount(Chips.make(99))).toBe(14);
  });

  it("fires for a losing player", () => {
    expect(lossBonusOnSettle(config, Chips.make(100), false)).toBe(15);
  });

  it("does not fire for a winner", () => {
    expect(lossBonusOnSettle(config, Chips.make(100), true)).toBeUndefined();
  });

  it("does not fire without spend", () => {
    expect(lossBonusOnSettle(config, Chips.make(0), false)).toBeUndefined();
  });

  it("does not fire when the bonus rounds down to nothing", () => {
    expect(lossBonusOnSettle(config, Chips.make(3), false)).toBeUndefined();
  });

  it("fires regardless of how many chips the loser still holds", () => {
    expect(lossBonusOnSettle(config, Chips.make(100), false)).toBe(15);
  });

  it("does nothing in the other modes", () => {
    expect(lossBonusOnSettle(burnout, Chips.make(100), false)).toBeUndefined();
    expect(
      lossBonusOnSettle(configFor("DISABLED"), Chips.make(100), false),
    ).toBeUndefined();
  });
});

describe("leaderboard", () => {
  const stateWith = (players: ReadonlyArray<PlayerState>): TableState => ({
    config: burnout,
    seq: 0 as Seq,
    players: new Map(players.map((pl) => [pl.name, pl])),
    seatOrder: players.map((pl) => pl.name),
    hand: undefined,
    handsPlayed: 0,
    lastButton: undefined,
    finished: false,
    lastWinners: undefined,
  });

  it("scores as balance minus starting balance minus credit taken", () => {
    const state = stateWith([
      player({ name: "zeynep", balance: Chips.make(980) }),
      player({
        name: "enes",
        balance: Chips.make(760),
        creditTaken: Chips.make(140),
      }),
    ]);
    const rows = standings(state);
    expect(rows[0]).toMatchObject({ player: p("zeynep"), score: 280, rank: 1 });
    expect(rows[1]).toMatchObject({ player: p("enes"), score: -80, rank: 2 });
  });

  it("starts a fresh player at zero", () => {
    const state = stateWith([
      player({ name: "enes", balance: Chips.make(700) }),
    ]);
    expect(standings(state)[0]!.score).toBe(0);
  });

  it("shares a rank between equal scores", () => {
    const state = stateWith([
      player({ name: "a", balance: Chips.make(800) }),
      player({ name: "b", balance: Chips.make(800) }),
      player({ name: "c", balance: Chips.make(600) }),
    ]);
    const rows = standings(state);
    expect(rows[0]!.rank).toBe(1);
    expect(rows[1]!.rank).toBe(1);
    expect(rows[2]!.rank).toBe(3);
  });

  it("keeps players who have gone home on the board", () => {
    const state = stateWith([
      player({ name: "enes", balance: Chips.make(980), seated: false }),
    ]);
    const rows = standings(state);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ seated: false, score: 280 });
  });

  it("leaves the score unchanged when a credit is claimed", () => {
    const before = player({ name: "enes", balance: Chips.make(0) });
    const after = player({
      name: "enes",
      balance: Chips.make(70),
      creditTaken: Chips.make(70),
    });
    const state = stateWith([before]);
    expect(scoreOf(state, before)).toBe(scoreOf(state, after));
  });

  it("moves score between players on a transfer", () => {
    const state = stateWith([
      player({ name: "giver", balance: Chips.make(600) }),
      player({ name: "taker", balance: Chips.make(800) }),
    ]);
    const rows = standings(state);
    expect(rows.find((r) => r.player === p("giver"))!.score).toBe(-100);
    expect(rows.find((r) => r.player === p("taker"))!.score).toBe(100);
  });
});
