import { Schema } from "effect";

/** Non-negative integer branded so a raw `number` (seat index, seq) can't
 * be passed where a chip amount is expected. */
export const Chips = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(0)),
  Schema.brand("Chips"),
);
export type Chips = typeof Chips.Type;

const unsafe = (n: number): Chips => n as Chips;

export const zero: Chips = unsafe(0);

/** Construct from a number, throwing if it is not a whole non-negative value. */
export const make = (n: number): Chips => Chips.make(n);

/** Construct, or return `undefined` when the value is not a valid amount. */
export const fromNumber = (n: number): Chips | undefined =>
  Number.isSafeInteger(n) && n >= 0 ? unsafe(n) : undefined;

export const add = (a: Chips, b: Chips): Chips => unsafe(a + b);

/** Subtract, clamping at zero. Balances can never go negative. */
export const sub = (a: Chips, b: Chips): Chips => unsafe(Math.max(0, a - b));

/**
 * Subtract only when `a` fully covers `b`, otherwise `undefined`.
 * Use this wherever silently clamping would hide a bug.
 */
export const subExact = (a: Chips, b: Chips): Chips | undefined =>
  a >= b ? unsafe(a - b) : undefined;

export const mul = (a: Chips, n: number): Chips => unsafe(Math.floor(a * n));

export const min = (a: Chips, b: Chips): Chips => (a <= b ? a : b);

export const max = (a: Chips, b: Chips): Chips => (a >= b ? a : b);

export const clamp = (value: Chips, lower: Chips, upper: Chips): Chips =>
  min(max(value, lower), upper);

export const sum = (amounts: Iterable<Chips>): Chips => {
  let total = 0;
  for (const amount of amounts) total += amount;
  return unsafe(total);
};

export const isZero = (a: Chips): boolean => a === 0;

export const isPositive = (a: Chips): boolean => a > 0;

/** Whether `a` is a whole multiple of `step`. Used by the raise stepper. */
export const isMultipleOf = (a: Chips, step: Chips): boolean =>
  step > 0 && a % step === 0;

/**
 * Split `total` into `n` equal whole shares plus a remainder.
 * The remainder is what the odd-chip rule assigns to the player closest
 * clockwise of the button.
 */
export const divide = (
  total: Chips,
  n: number,
): { readonly share: Chips; readonly remainder: Chips } => ({
  share: unsafe(Math.floor(total / n)),
  remainder: unsafe(total % n),
});

/** Percentage of an amount, always rounded down. */
export const percent = (a: Chips, pct: number): Chips =>
  unsafe(Math.floor((a * pct) / 100));
