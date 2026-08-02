import { describe, expect, it } from "@effect/vitest";

import * as Chips from "~/domain/Chips";

describe("Chips", () => {
  it("accepts whole non-negative amounts", () => {
    expect(Chips.make(0)).toBe(0);
    expect(Chips.make(700)).toBe(700);
  });

  it("rejects negative and fractional amounts", () => {
    expect(() => Chips.make(-1)).toThrow();
    expect(() => Chips.make(10.5)).toThrow();
  });

  it("fromNumber returns undefined instead of throwing", () => {
    expect(Chips.fromNumber(10)).toBe(10);
    expect(Chips.fromNumber(-1)).toBeUndefined();
    expect(Chips.fromNumber(1.5)).toBeUndefined();
  });

  it("sub clamps at zero but subExact refuses to hide a shortfall", () => {
    const a = Chips.make(30);
    const b = Chips.make(80);
    expect(Chips.sub(a, b)).toBe(0);
    expect(Chips.subExact(a, b)).toBeUndefined();
    expect(Chips.subExact(b, a)).toBe(50);
  });

  it("divide splits evenly and reports the odd chip", () => {
    expect(Chips.divide(Chips.make(200), 2)).toEqual({
      share: 100,
      remainder: 0,
    });
    expect(Chips.divide(Chips.make(201), 2)).toEqual({
      share: 100,
      remainder: 1,
    });
    expect(Chips.divide(Chips.make(100), 3)).toEqual({
      share: 33,
      remainder: 1,
    });
  });

  it("clamp applies the burnout floor and ceiling", () => {
    const floor = Chips.make(50);
    const ceiling = Chips.make(200);
    expect(Chips.clamp(Chips.make(0), floor, ceiling)).toBe(50);
    expect(Chips.clamp(Chips.make(140), floor, ceiling)).toBe(140);
    expect(Chips.clamp(Chips.make(900), floor, ceiling)).toBe(200);
  });

  it("percent rounds down, matching the loss bonus rule", () => {
    expect(Chips.percent(Chips.make(100), 15)).toBe(15);
    expect(Chips.percent(Chips.make(99), 15)).toBe(14);
    expect(Chips.percent(Chips.make(3), 15)).toBe(0);
  });

  it("isMultipleOf backs the raise stepper", () => {
    const step = Chips.make(10);
    expect(Chips.isMultipleOf(Chips.make(20), step)).toBe(true);
    expect(Chips.isMultipleOf(Chips.make(15), step)).toBe(false);
  });

  it("sum totals contributions", () => {
    expect(Chips.sum([Chips.make(30), Chips.make(80), Chips.make(80)])).toBe(
      190,
    );
    expect(Chips.sum([])).toBe(0);
  });
});
