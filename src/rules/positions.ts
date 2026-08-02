import type { PlayerName } from "~/domain/Ids";

// Heads-up inverts the blinds: the button posts small blind, acts first
// preflop, last postflop. Common end state as a night winds down, not an
// edge case.

export interface BlindSeats {
  /** Index into the hand's player list. */
  readonly smallBlind: number;
  readonly bigBlind: number;
}

export const isHeadsUp = (playerCount: number): boolean => playerCount === 2;

export const blindSeats = (playerCount: number, button: number): BlindSeats => {
  if (playerCount < 2) {
    throw new Error(`a hand needs at least two players, got ${playerCount}`);
  }
  if (isHeadsUp(playerCount)) {
    // The button IS the small blind.
    return { smallBlind: button, bigBlind: (button + 1) % playerCount };
  }
  return {
    smallBlind: (button + 1) % playerCount,
    bigBlind: (button + 2) % playerCount,
  };
};

/**
 * Who acts first before the flop.
 * Heads-up that is the button; otherwise it is under the gun, left of the
 * big blind.
 */
export const firstToActPreflop = (
  playerCount: number,
  button: number,
): number => (isHeadsUp(playerCount) ? button : (button + 3) % playerCount);

/**
 * Who acts first on the flop, turn and river.
 * Left of the button in both cases -- which heads-up means the big blind,
 * leaving the button to act last.
 */
export const firstToActPostflop = (
  playerCount: number,
  button: number,
): number => (button + 1) % playerCount;

/** Seat indices in acting order, starting from `from` and wrapping. */
export const orderFrom = (
  playerCount: number,
  from: number,
): ReadonlyArray<number> =>
  Array.from({ length: playerCount }, (_, i) => (from + i) % playerCount);

/**
 * Where the button sits for the next hand.
 *
 * Rotation follows the table's seating, not the previous hand's line-up, so
 * that players coming and going never make the button jump backwards. Returns
 * an index into `participants`.
 */
export const nextButtonIndex = (
  participants: ReadonlyArray<PlayerName>,
  seatOrder: ReadonlyArray<PlayerName>,
  lastButton: PlayerName | undefined,
): number => {
  if (participants.length === 0) {
    throw new Error("cannot place the button with no participants");
  }
  if (lastButton === undefined) return 0;

  const lastSeat = seatOrder.indexOf(lastButton);
  if (lastSeat < 0) return 0;

  // Walk clockwise from the seat after the last button until we reach
  // somebody who is actually in this hand.
  for (let step = 1; step <= seatOrder.length; step++) {
    const seat = seatOrder[(lastSeat + step) % seatOrder.length]!;
    const index = participants.indexOf(seat);
    if (index >= 0) return index;
  }
  return 0;
};

/** A random starting button, used only for the very first hand of a table. */
export const randomButtonIndex = (
  participantCount: number,
  random: () => number = Math.random,
): number => Math.floor(random() * participantCount);
