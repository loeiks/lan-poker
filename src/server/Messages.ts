import { Schema } from "effect";

import { Card } from "~/domain/Card";
import { Chips } from "~/domain/Chips";
import { PlayerName, Seq } from "~/domain/Ids";
import type { TableIntentError } from "~/services/Table";
import type { TableSnapshot } from "~/state/snapshot";

// Inbound frames are untrusted, so decoded through `Schema` before reaching
// `Table`. Outbound frames carry a full `TableSnapshot` (no delta protocol),
// which stays a plain interface -- it's only ever produced/serialized, never
// decoded, so a `Schema` for it would buy no safety.

const ActionIntent = Schema.Union([
  Schema.TaggedStruct("check", {}),
  Schema.TaggedStruct("call", {}),
  Schema.TaggedStruct("fold", {}),
  Schema.TaggedStruct("raise", { to: Chips }),
  Schema.TaggedStruct("allin", {}),
]);

export class Ready extends Schema.TaggedClass<Ready>()("Ready", { seq: Seq }) {}
export class Unready extends Schema.TaggedClass<Unready>()("Unready", {
  seq: Seq,
}) {}
export class Leave extends Schema.TaggedClass<Leave>()("Leave", { seq: Seq }) {}
export class StartHand extends Schema.TaggedClass<StartHand>()("StartHand", {
  seq: Seq,
  dealer: Schema.optional(PlayerName),
}) {}

export class Act extends Schema.TaggedClass<Act>()("Act", {
  seq: Seq,
  intent: ActionIntent,
}) {}

// JSON drops `undefined` keys, which would make "clear this card"
// undecodable; `null` is the JSON-safe stand-in, normalized to `undefined`
// at dispatch.
export class SetBoardCard extends Schema.TaggedClass<SetBoardCard>()(
  "SetBoardCard",
  {
    seq: Seq,
    index: Schema.Int,
    card: Schema.NullOr(Card),
  },
) {}

export class SetHoleCards extends Schema.TaggedClass<SetHoleCards>()(
  "SetHoleCards",
  {
    seq: Seq,
    target: PlayerName,
    cards: Schema.NullOr(Schema.Tuple([Card, Card])),
  },
) {}

export class DeclareWinners extends Schema.TaggedClass<DeclareWinners>()(
  "DeclareWinners",
  {
    seq: Seq,
    awards: Schema.Array(
      Schema.Struct({
        potIndex: Schema.Int,
        winners: Schema.Array(PlayerName),
      }),
    ),
  },
) {}

export class AdjustBalance extends Schema.TaggedClass<AdjustBalance>()(
  "AdjustBalance",
  {
    seq: Seq,
    player: PlayerName,
    next: Chips,
  },
) {}

export class Transfer extends Schema.TaggedClass<Transfer>()("Transfer", {
  seq: Seq,
  to: PlayerName,
  amount: Chips,
}) {}

export class ClaimCredit extends Schema.TaggedClass<ClaimCredit>()(
  "ClaimCredit",
  { seq: Seq },
) {}

export class FinishSession extends Schema.TaggedClass<FinishSession>()(
  "FinishSession",
  {
    seq: Seq,
  },
) {}

export class ReorderSeats extends Schema.TaggedClass<ReorderSeats>()(
  "ReorderSeats",
  {
    seq: Seq,
    order: Schema.Array(PlayerName),
  },
) {}

export const ClientMessage = Schema.Union([
  Ready,
  Unready,
  Leave,
  StartHand,
  Act,
  SetBoardCard,
  SetHoleCards,
  DeclareWinners,
  AdjustBalance,
  Transfer,
  ClaimCredit,
  FinishSession,
  ReorderSeats,
]);
export type ClientMessage = typeof ClientMessage.Type;

const ClientMessageFromJson = Schema.fromJsonString(ClientMessage);

export const decodeClientMessage = Schema.decodeUnknownEffect(
  ClientMessageFromJson,
);

export const describeIntentError = (error: TableIntentError): string => {
  switch (error._tag) {
    case "NotYourTurn":
      return error.actingPlayer === undefined
        ? "It's not your turn."
        : `It's not your turn -- waiting on ${error.actingPlayer}.`;
    case "IllegalAction":
      return error.detail ?? describeIllegalActionReason(error.reason);
    case "InsufficientBalance":
      return `You need ${error.required} chips but only have ${error.available}.`;
    case "StaleSequence":
      return "Your view was out of date -- refreshed with the current table state.";
    case "NotAdmin":
      return "Only the table admin can do that.";
    case "DuplicateCard":
      return "That card is already in play.";
    case "BoardFull":
      return "The board already has five cards.";
    case "PlayerNotFound":
      return `${error.player} is not at the table.`;
    case "NotEnoughPlayers":
      return `Need at least ${error.required} ready players to start, only ${error.ready} are ready.`;
    case "InvalidAmount":
      return error.detail;
    case "InvalidPlayerName":
      return error.detail;
    case "NotEligibleForPot":
      return `${error.player} is not eligible for pot ${error.potIndex + 1}.`;
    case "CreditUnavailable":
      return describeCreditUnavailable(error.reason, error.handsRemaining);
    case "InconsistentEventLog":
      return "The table's history is inconsistent and cannot continue.";
  }
};

const describeIllegalActionReason = (reason: string): string => {
  switch (reason) {
    case "check-facing-bet":
      return "You can't check facing a bet.";
    case "raise-not-multiple-of-minimum":
      return "Raises must land on a multiple of the table minimum.";
    case "raise-below-current-bet":
      return "Your raise must be above the current bet.";
    case "bet-exceeds-balance":
      return "You don't have enough chips for that bet.";
    case "no-hand-in-progress":
      return "There is no hand in progress.";
    case "hand-in-progress":
      return "A hand is already in progress.";
    case "betting-closed":
      return "Betting is closed for this hand.";
    case "player-not-in-hand":
      return "That player is not in the current hand.";
    case "player-already-folded":
      return "That player has already folded.";
    default:
      return "That action isn't allowed right now.";
  }
};

const describeCreditUnavailable = (
  reason: string,
  handsRemaining: number | undefined,
): string => {
  switch (reason) {
    case "mode-disabled":
      return "Credit is disabled at this table.";
    case "no-pending-credit":
      return "You have no credit to claim.";
    case "cooldown-active":
      return `Credit is on cooldown for ${handsRemaining ?? 0} more hand(s).`;
    case "balance-not-zero":
      return "Credit can only be claimed once your balance reaches zero.";
    default:
      return "Credit is not available right now.";
  }
};

export type ServerMessage =
  | { readonly type: "snapshot"; readonly snapshot: TableSnapshot }
  | {
      readonly type: "error";
      readonly tag: TableIntentError["_tag"];
      readonly message: string;
      /** Present on stale-sequence rejection so the client refreshes in one message (spec: realtime-sync). */
      readonly snapshot: TableSnapshot | undefined;
    };

export const snapshotMessage = (snapshot: TableSnapshot): ServerMessage => ({
  type: "snapshot",
  snapshot,
});

export const errorMessage = (
  error: TableIntentError,
  freshSnapshot: TableSnapshot | undefined,
): ServerMessage => ({
  type: "error",
  tag: error._tag,
  message: describeIntentError(error),
  snapshot: error._tag === "StaleSequence" ? freshSnapshot : undefined,
});

export const encodeServerMessage = (message: ServerMessage): string =>
  JSON.stringify(message);
