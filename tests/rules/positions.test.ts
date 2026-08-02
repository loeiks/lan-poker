import { describe, expect, it } from "@effect/vitest";

import type { PlayerName } from "~/domain/Ids";
import {
  blindSeats,
  firstToActPostflop,
  firstToActPreflop,
  nextButtonIndex,
  orderFrom,
  randomButtonIndex,
} from "~/rules/positions";

const names = (list: ReadonlyArray<string>) => list.map((n) => n as PlayerName);

describe("blindSeats", () => {
  it("puts the blinds left of the button with three or more players", () => {
    expect(blindSeats(4, 0)).toEqual({ smallBlind: 1, bigBlind: 2 });
    expect(blindSeats(3, 0)).toEqual({ smallBlind: 1, bigBlind: 2 });
  });

  it("wraps around the table", () => {
    expect(blindSeats(4, 3)).toEqual({ smallBlind: 0, bigBlind: 1 });
    expect(blindSeats(3, 2)).toEqual({ smallBlind: 0, bigBlind: 1 });
  });

  it("makes the button the small blind heads-up", () => {
    expect(blindSeats(2, 0)).toEqual({ smallBlind: 0, bigBlind: 1 });
    expect(blindSeats(2, 1)).toEqual({ smallBlind: 1, bigBlind: 0 });
  });

  it("refuses a hand with fewer than two players", () => {
    expect(() => blindSeats(1, 0)).toThrow();
  });
});

describe("action order", () => {
  it("starts preflop under the gun with three or more players", () => {
    expect(firstToActPreflop(4, 0)).toBe(3);
    expect(firstToActPreflop(3, 0)).toBe(0); // wraps back to the button
    expect(firstToActPreflop(6, 0)).toBe(3);
  });

  it("starts preflop on the button heads-up", () => {
    expect(firstToActPreflop(2, 0)).toBe(0);
    expect(firstToActPreflop(2, 1)).toBe(1);
  });

  it("starts postflop left of the button", () => {
    expect(firstToActPostflop(4, 0)).toBe(1);
    expect(firstToActPostflop(4, 3)).toBe(0);
  });

  it("leaves the button acting last postflop heads-up", () => {
    // With two players, first to act is the one who is not the button.
    expect(firstToActPostflop(2, 0)).toBe(1);
    expect(firstToActPostflop(2, 1)).toBe(0);
  });

  it("orders seats clockwise from a starting point", () => {
    expect(orderFrom(4, 2)).toEqual([2, 3, 0, 1]);
    expect(orderFrom(3, 0)).toEqual([0, 1, 2]);
  });
});

describe("nextButtonIndex", () => {
  const seatOrder = names(["enes", "ali", "zeynep", "deniz"]);

  it("starts at the first seat when there is no previous button", () => {
    expect(nextButtonIndex(seatOrder, seatOrder, undefined)).toBe(0);
  });

  it("moves clockwise to the next seat", () => {
    expect(nextButtonIndex(seatOrder, seatOrder, "enes" as PlayerName)).toBe(1);
    expect(nextButtonIndex(seatOrder, seatOrder, "zeynep" as PlayerName)).toBe(
      3,
    );
  });

  it("wraps around the table", () => {
    expect(nextButtonIndex(seatOrder, seatOrder, "deniz" as PlayerName)).toBe(
      0,
    );
  });

  it("skips players who are not in this hand", () => {
    // ali and zeynep are sitting out; the button should land on deniz.
    const participants = names(["enes", "deniz"]);
    expect(nextButtonIndex(participants, seatOrder, "enes" as PlayerName)).toBe(
      1,
    );
  });

  it("skips players who have left the table", () => {
    // The previous button holder has gone home and is no longer seated.
    const participants = names(["ali", "zeynep"]);
    expect(nextButtonIndex(participants, seatOrder, "enes" as PlayerName)).toBe(
      0,
    );
  });

  it("comes back to the only remaining participant", () => {
    const participants = names(["ali"]);
    expect(nextButtonIndex(participants, seatOrder, "ali" as PlayerName)).toBe(
      0,
    );
  });

  it("refuses to place a button with nobody playing", () => {
    expect(() => nextButtonIndex([], seatOrder, undefined)).toThrow();
  });
});

describe("randomButtonIndex", () => {
  it("stays within the participant range", () => {
    expect(randomButtonIndex(4, () => 0)).toBe(0);
    expect(randomButtonIndex(4, () => 0.99)).toBe(3);
    expect(randomButtonIndex(1, () => 0.5)).toBe(0);
  });
});
