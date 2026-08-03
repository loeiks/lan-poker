import { Schema } from "effect";

// A player's name is their identity: typing it back in on a new device
// reclaims balance/history. Normalized to a single lowercase word so
// "Enes", "ENES", " enes " are all the same person.
export const PLAYER_NAME_MAX_LENGTH = 20;

const playerNamePattern = /^[a-z0-9_-]+$/;

export const PlayerName = Schema.String.pipe(
  Schema.check(Schema.isMinLength(1)),
  Schema.check(Schema.isMaxLength(PLAYER_NAME_MAX_LENGTH)),
  Schema.check(Schema.isPattern(playerNamePattern)),
  Schema.brand("PlayerName"),
);
export type PlayerName = typeof PlayerName.Type;

/** Why a raw string could not become a `PlayerName`. */
export type PlayerNameProblem =
  | "empty"
  | "not-a-single-word"
  | "too-long"
  | "unsupported-characters";

/**
 * Normalize raw player input, or explain why it cannot be a name.
 *
 * Kept separate from the schema so the join screen can show a specific
 * message rather than a generic validation failure.
 */
export const normalizePlayerName = (
  raw: string,
):
  | { readonly ok: true; readonly name: PlayerName }
  | {
      readonly ok: false;
      readonly problem: PlayerNameProblem;
    } => {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0) return { ok: false, problem: "empty" };
  if (/\s/.test(trimmed)) return { ok: false, problem: "not-a-single-word" };
  if (trimmed.length > PLAYER_NAME_MAX_LENGTH)
    return { ok: false, problem: "too-long" };
  if (!playerNamePattern.test(trimmed))
    return { ok: false, problem: "unsupported-characters" };
  return { ok: true, name: trimmed as PlayerName };
};

export const describePlayerNameProblem = (
  problem: PlayerNameProblem,
): string => {
  switch (problem) {
    case "empty":
      return "Enter a name.";
    case "not-a-single-word":
      return "Names must be a single word, with no spaces.";
    case "too-long":
      return `Names can be at most ${PLAYER_NAME_MAX_LENGTH} characters.`;
    case "unsupported-characters":
      return "Use letters, numbers, hyphens or underscores only.";
  }
};

export const HandId = Schema.String.pipe(Schema.brand("HandId"));
export type HandId = typeof HandId.Type;

export const TableId = Schema.String.pipe(Schema.brand("TableId"));
export type TableId = typeof TableId.Type;

/** Monotonic event sequence number; doubles as the state version used to reject stale actions. */
export const Seq = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(0)),
  Schema.brand("Seq"),
);
export type Seq = typeof Seq.Type;

export const initialSeq: Seq = 0 as Seq;
