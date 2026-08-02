import { describe, expect, it } from "@effect/vitest";

import * as Card from "~/domain/Card";

describe("Card", () => {
  it("enumerates exactly 52 distinct cards", () => {
    expect(Card.DECK).toHaveLength(52);
    expect(new Set(Card.DECK).size).toBe(52);
  });

  it("parses case-insensitively and normalizes", () => {
    expect(Card.parseCard("as")).toBe("As");
    expect(Card.parseCard("AS")).toBe("As");
    expect(Card.parseCard(" th ")).toBe("Th");
    expect(Card.parseCard("2c")).toBe("2c");
  });

  it("rejects anything that is not a real card", () => {
    expect(Card.parseCard("1s")).toBeUndefined();
    expect(Card.parseCard("Ax")).toBeUndefined();
    expect(Card.parseCard("A")).toBeUndefined();
    expect(Card.parseCard("Ass")).toBeUndefined();
    expect(Card.parseCard("")).toBeUndefined();
  });

  it("exposes rank and suit", () => {
    expect(Card.rankOf("As")).toBe("A");
    expect(Card.suitOf("As")).toBe("s");
    expect(Card.rankOf("Td")).toBe("T");
    expect(Card.suitOf("Td")).toBe("d");
  });

  it("ranks aces high", () => {
    expect(Card.cardValue("As")).toBe(14);
    expect(Card.cardValue("Ks")).toBe(13);
    expect(Card.cardValue("Ts")).toBe(10);
    expect(Card.cardValue("2s")).toBe(2);
  });

  it("displays with suit symbols", () => {
    expect(Card.showCard("As")).toBe("A♠");
    expect(Card.showCard("Th")).toBe("T♥");
  });

  it("knows which suits render red", () => {
    expect(Card.isRedSuit("h")).toBe(true);
    expect(Card.isRedSuit("d")).toBe(true);
    expect(Card.isRedSuit("s")).toBe(false);
    expect(Card.isRedSuit("c")).toBe(false);
  });

  it("pluralizes rank names for hand descriptions", () => {
    expect(Card.rankNamePlural("A")).toBe("Aces");
    expect(Card.rankNamePlural("6")).toBe("Sixes");
    expect(Card.rankNamePlural("K")).toBe("Kings");
  });
});
