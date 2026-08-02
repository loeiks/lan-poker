import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import * as Chips from "~/domain/Chips";
import {
  InsufficientBalance,
  NotYourTurn,
  StaleSequence,
} from "~/domain/Errors";
import type { PlayerName } from "~/domain/Ids";
import {
  decodeClientMessage,
  describeIntentError,
  encodeServerMessage,
  errorMessage,
  snapshotMessage,
} from "~/server/Messages";

const p = (name: string) => name as PlayerName;

describe("Messages: inbound frame decoding (task 11.3)", () => {
  it.effect("decodes a well-formed Ready frame", () =>
    Effect.gen(function* () {
      const decoded = yield* decodeClientMessage(
        JSON.stringify({ _tag: "Ready", seq: 3 }),
      );
      expect(decoded).toEqual({ _tag: "Ready", seq: 3 });
    }),
  );

  it.effect("decodes an Act frame with a raise intent", () =>
    Effect.gen(function* () {
      const decoded = yield* decodeClientMessage(
        JSON.stringify({
          _tag: "Act",
          seq: 1,
          intent: { _tag: "raise", to: 40 },
        }),
      );
      expect(decoded).toEqual({
        _tag: "Act",
        seq: 1,
        intent: { _tag: "raise", to: 40 },
      });
    }),
  );

  it.effect("decodes a SetHoleCards frame with null cards (correction)", () =>
    Effect.gen(function* () {
      const decoded = yield* decodeClientMessage(
        JSON.stringify({
          _tag: "SetHoleCards",
          seq: 2,
          target: "alice",
          cards: null,
        }),
      );
      expect(decoded).toEqual({
        _tag: "SetHoleCards",
        seq: 2,
        target: "alice",
        cards: null,
      });
    }),
  );

  it.effect("rejects malformed JSON", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(decodeClientMessage("not json"));
      expect(exit._tag).toBe("Failure");
    }),
  );

  it.effect("rejects an unknown message tag", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        decodeClientMessage(JSON.stringify({ _tag: "Nonsense" })),
      );
      expect(exit._tag).toBe("Failure");
    }),
  );

  it.effect("rejects a negative seq", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        decodeClientMessage(JSON.stringify({ _tag: "Ready", seq: -1 })),
      );
      expect(exit._tag).toBe("Failure");
    }),
  );
});

describe("Messages: error mapping (task 11.6)", () => {
  it("maps every IntentError tag to a non-empty message", () => {
    const notYourTurn = new NotYourTurn({
      player: p("alice"),
      actingPlayer: p("bob"),
    });
    const insufficient = new InsufficientBalance({
      player: p("alice"),
      required: Chips.make(50),
      available: Chips.make(10),
    });
    expect(describeIntentError(notYourTurn).length).toBeGreaterThan(0);
    expect(describeIntentError(insufficient)).toContain("50");
  });

  it("StaleSequence rejection carries a fresh snapshot on the wire message", () => {
    const error = new StaleSequence({
      submitted: 1 as never,
      current: 5 as never,
    });
    const fakeSnapshot = { seq: 5 } as never;
    const message = errorMessage(error, fakeSnapshot);
    expect(message.type).toBe("error");
    if (message.type === "error") {
      expect(message.snapshot).toBe(fakeSnapshot);
    }
  });

  it("non-stale errors carry no snapshot", () => {
    const error = new NotYourTurn({
      player: p("alice"),
      actingPlayer: p("bob"),
    });
    const message = errorMessage(error, undefined);
    expect(message.type).toBe("error");
    if (message.type === "error") {
      expect(message.snapshot).toBeUndefined();
    }
  });
});

describe("Messages: outbound encoding round-trips", () => {
  it("a snapshot message survives JSON encode/decode", () => {
    const fakeSnapshot = { seq: 7, tableName: "t" } as never;
    const encoded = encodeServerMessage(snapshotMessage(fakeSnapshot));
    const parsed = JSON.parse(encoded);
    expect(parsed).toEqual({ type: "snapshot", snapshot: fakeSnapshot });
  });
});
