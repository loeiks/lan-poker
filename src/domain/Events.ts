import { Schema } from "effect";

import { Card } from "./Card.ts";
import { Chips } from "./Chips.ts";
import { HandId, PlayerName, TableId } from "./Ids.ts";

// The append-only event log; everything else is derived by folding over it.
// Streets aren't events -- they're a deterministic consequence of betting.

export class Check extends Schema.TaggedClass<Check>()("Check", {}) {}

export class Call extends Schema.TaggedClass<Call>()("Call", {
  /** Chips actually moved; less than the call amount when this is a short all-in. */
  amount: Chips,
  allIn: Schema.Boolean,
}) {}

export class Fold extends Schema.TaggedClass<Fold>()("Fold", {}) {}

export class Raise extends Schema.TaggedClass<Raise>()("Raise", {
  /** The new current bet for the round, not the increment. */
  to: Chips,
  amount: Chips,
  allIn: Schema.Boolean,
}) {}

export class AllIn extends Schema.TaggedClass<AllIn>()("AllIn", {
  amount: Chips,
  to: Chips,
}) {}

export const BettingAction = Schema.Union([Check, Call, Fold, Raise, AllIn]);
export type BettingAction = typeof BettingAction.Type;

export class TableCreated extends Schema.TaggedClass<TableCreated>()(
  "TableCreated",
  {
    tableId: TableId,
  },
) {}

export class PlayerJoined extends Schema.TaggedClass<PlayerJoined>()(
  "PlayerJoined",
  {
    player: PlayerName,
    startingBalance: Chips,
  },
) {}

export class PlayerRejoined extends Schema.TaggedClass<PlayerRejoined>()(
  "PlayerRejoined",
  {
    player: PlayerName,
  },
) {}

export class PlayerReadied extends Schema.TaggedClass<PlayerReadied>()(
  "PlayerReadied",
  {
    player: PlayerName,
  },
) {}

export class PlayerUnreadied extends Schema.TaggedClass<PlayerUnreadied>()(
  "PlayerUnreadied",
  {
    player: PlayerName,
  },
) {}

export class PlayerLeft extends Schema.TaggedClass<PlayerLeft>()("PlayerLeft", {
  player: PlayerName,
}) {}

export class ChipsTransferred extends Schema.TaggedClass<ChipsTransferred>()(
  "ChipsTransferred",
  {
    from: PlayerName,
    to: PlayerName,
    amount: Chips,
  },
) {}

export class BalanceAdjusted extends Schema.TaggedClass<BalanceAdjusted>()(
  "BalanceAdjusted",
  {
    player: PlayerName,
    previous: Chips,
    next: Chips,
  },
) {}

export class SessionFinished extends Schema.TaggedClass<SessionFinished>()(
  "SessionFinished",
  {},
) {}

export class HandStarted extends Schema.TaggedClass<HandStarted>()(
  "HandStarted",
  {
    handId: HandId,
    /** Participants in clockwise seat order. */
    players: Schema.Array(PlayerName),
    /** Index into `players` holding the button. */
    button: Schema.Int,
  },
) {}

export const BlindKind = Schema.Literals(["small", "big"]);
export type BlindKind = typeof BlindKind.Type;

export class BlindPosted extends Schema.TaggedClass<BlindPosted>()(
  "BlindPosted",
  {
    player: PlayerName,
    kind: BlindKind,
    amount: Chips,
    allIn: Schema.Boolean,
  },
) {}

export class PlayerActed extends Schema.TaggedClass<PlayerActed>()(
  "PlayerActed",
  {
    player: PlayerName,
    action: BettingAction,
  },
) {}

export class BoardCardSet extends Schema.TaggedClass<BoardCardSet>()(
  "BoardCardSet",
  {
    /** 0-4, in dealing order: flop, flop, flop, turn, river. */
    index: Schema.Int,
    card: Schema.optional(Card),
  },
) {}

export class HoleCardsSet extends Schema.TaggedClass<HoleCardsSet>()(
  "HoleCardsSet",
  {
    player: PlayerName,
    cards: Schema.optional(Schema.Tuple([Card, Card])),
  },
) {}

export class UncalledBetReturned extends Schema.TaggedClass<UncalledBetReturned>()(
  "UncalledBetReturned",
  {
    player: PlayerName,
    amount: Chips,
  },
) {}

export class PotAwarded extends Schema.TaggedClass<PotAwarded>()("PotAwarded", {
  /** 0 is the main pot; higher indices are side pots. */
  potIndex: Schema.Int,
  amount: Chips,
  winners: Schema.Array(PlayerName),
  /** Per-winner share, including the odd chip where it landed. */
  shares: Schema.Array(Schema.Struct({ player: PlayerName, amount: Chips })),
  /** True when a human decided this rather than the evaluator. */
  declared: Schema.Boolean,
}) {}

export class HandSettled extends Schema.TaggedClass<HandSettled>()(
  "HandSettled",
  {
    handId: HandId,
    /** Chips each participant committed, after uncalled returns. */
    spends: Schema.Array(Schema.Struct({ player: PlayerName, amount: Chips })),
    /** Every player who received chips from a pot (for UI celebration). */
    winners: Schema.Array(PlayerName),
  },
) {}

export class CreditPending extends Schema.TaggedClass<CreditPending>()(
  "CreditPending",
  {
    player: PlayerName,
    /** Frozen at bust time; never recalculated. */
    amount: Chips,
    /** Hands that must elapse before it can be claimed. */
    cooldownHands: Schema.Int,
  },
) {}

export class CreditClaimed extends Schema.TaggedClass<CreditClaimed>()(
  "CreditClaimed",
  {
    player: PlayerName,
    amount: Chips,
  },
) {}

export class LossBonusGranted extends Schema.TaggedClass<LossBonusGranted>()(
  "LossBonusGranted",
  {
    player: PlayerName,
    amount: Chips,
  },
) {}

export class SeatsReordered extends Schema.TaggedClass<SeatsReordered>()(
  "SeatsReordered",
  {
    order: Schema.Array(PlayerName),
  },
) {}

export const TableEvent = Schema.Union([
  TableCreated,
  PlayerJoined,
  PlayerRejoined,
  PlayerReadied,
  PlayerUnreadied,
  PlayerLeft,
  ChipsTransferred,
  BalanceAdjusted,
  SessionFinished,
  HandStarted,
  BlindPosted,
  PlayerActed,
  BoardCardSet,
  HoleCardsSet,
  UncalledBetReturned,
  PotAwarded,
  HandSettled,
  CreditPending,
  CreditClaimed,
  LossBonusGranted,
  SeatsReordered,
]);
export type TableEvent = typeof TableEvent.Type;

export type TableEventTag = TableEvent["_tag"];

/** A persisted event: the payload plus the sequence number the store assigned. */
export interface StoredEvent {
  readonly seq: number;
  readonly event: TableEvent;
  readonly at: number;
}
