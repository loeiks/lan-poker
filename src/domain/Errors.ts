import { Schema } from "effect";

import { Card } from "./Card.ts";
import { Chips } from "./Chips.ts";
import { PlayerName, Seq } from "./Ids.ts";

/**
 * Rejected intents. These are answers, not faults -- each carries enough
 * detail to explain itself without the UI having to re-derive context.
 */

export class NotYourTurn extends Schema.TaggedErrorClass<NotYourTurn>()(
  "NotYourTurn",
  {
    player: PlayerName,
    actingPlayer: Schema.UndefinedOr(PlayerName),
  },
) {}

export const IllegalActionReason = Schema.Literals([
  "check-facing-bet",
  "raise-not-multiple-of-minimum",
  "raise-below-current-bet",
  "bet-exceeds-balance",
  "no-hand-in-progress",
  "hand-in-progress",
  "betting-closed",
  "player-not-in-hand",
  "player-already-folded",
]);
export type IllegalActionReason = typeof IllegalActionReason.Type;

export class IllegalAction extends Schema.TaggedErrorClass<IllegalAction>()(
  "IllegalAction",
  {
    reason: IllegalActionReason,
    detail: Schema.UndefinedOr(Schema.String),
  },
) {}

export class InsufficientBalance extends Schema.TaggedErrorClass<InsufficientBalance>()(
  "InsufficientBalance",
  {
    player: PlayerName,
    required: Chips,
    available: Chips,
  },
) {}

/** The client acted on a screen that had already moved on -- the realistic failure when a phone wakes from lock. */
export class StaleSequence extends Schema.TaggedErrorClass<StaleSequence>()(
  "StaleSequence",
  {
    submitted: Seq,
    current: Seq,
  },
) {}

export class NotAdmin extends Schema.TaggedErrorClass<NotAdmin>()("NotAdmin", {
  player: PlayerName,
}) {}

export class DuplicateCard extends Schema.TaggedErrorClass<DuplicateCard>()(
  "DuplicateCard",
  {
    card: Card,
    /** Where the conflicting copy already sits, so the typo can be found. */
    heldBy: Schema.Union([
      Schema.TaggedStruct("board", {}),
      Schema.TaggedStruct("player", { player: PlayerName }),
    ]),
  },
) {}

export class BoardFull extends Schema.TaggedErrorClass<BoardFull>()(
  "BoardFull",
  {},
) {}

export class PlayerNotFound extends Schema.TaggedErrorClass<PlayerNotFound>()(
  "PlayerNotFound",
  { player: PlayerName },
) {}

export class NotEnoughPlayers extends Schema.TaggedErrorClass<NotEnoughPlayers>()(
  "NotEnoughPlayers",
  { ready: Schema.Int, required: Schema.Int },
) {}

export class InvalidAmount extends Schema.TaggedErrorClass<InvalidAmount>()(
  "InvalidAmount",
  { detail: Schema.String },
) {}

export class InvalidPlayerName extends Schema.TaggedErrorClass<InvalidPlayerName>()(
  "InvalidPlayerName",
  { detail: Schema.String },
) {}

/** Awarding a pot to someone who never qualified for it. */
export class NotEligibleForPot extends Schema.TaggedErrorClass<NotEligibleForPot>()(
  "NotEligibleForPot",
  { player: PlayerName, potIndex: Schema.Int },
) {}

export const CreditUnavailableReason = Schema.Literals([
  "mode-disabled",
  "no-pending-credit",
  "cooldown-active",
  "balance-not-zero",
]);
export type CreditUnavailableReason = typeof CreditUnavailableReason.Type;

export class CreditUnavailable extends Schema.TaggedErrorClass<CreditUnavailable>()(
  "CreditUnavailable",
  {
    player: PlayerName,
    reason: CreditUnavailableReason,
    handsRemaining: Schema.UndefinedOr(Schema.Int),
  },
) {}

/**
 * The event log says something that cannot be true. Replay is the only path
 * to current state, so a disagreeing log must stop the process rather than
 * quietly produce a state nobody can explain.
 */
export class InconsistentEventLog extends Schema.TaggedErrorClass<InconsistentEventLog>()(
  "InconsistentEventLog",
  {
    seq: Seq,
    event: Schema.String,
    detail: Schema.String,
  },
) {}

/** Every way an intent can be turned down. */
export type IntentError =
  | NotYourTurn
  | IllegalAction
  | InsufficientBalance
  | StaleSequence
  | NotAdmin
  | DuplicateCard
  | BoardFull
  | PlayerNotFound
  | NotEnoughPlayers
  | InvalidAmount
  | InvalidPlayerName
  | NotEligibleForPot
  | CreditUnavailable;
