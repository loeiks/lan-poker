import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

describe("toolchain", () => {
  it("runs plain assertions", () => {
    expect(1 + 1).toBe(2);
  });

  it.effect("runs Effect programs", () =>
    Effect.gen(function* () {
      const value = yield* Effect.succeed(42);
      expect(value).toBe(42);
    }),
  );
});
