import { Schema } from "effect";

import { Chips } from "./Chips.ts";
import { PlayerName, TableId } from "./Ids.ts";

export const CreditMode = Schema.Literals([
  "BURNOUT_CREDIT",
  "LOSS_BONUS",
  "DISABLED",
]);
export type CreditMode = typeof CreditMode.Type;

export const CREDIT_MODES = [
  "BURNOUT_CREDIT",
  "LOSS_BONUS",
  "DISABLED",
] as const;

// Provisional tuning numbers, expressed as multiples of the table minimum
// so retuning later means changing a constant, not tracing game logic.
export const HOUSE_RULES = {
  /** Default starting stack, as a multiple of the table minimum. */
  startingBalanceMultiplier: 70,
  /** Burnout credit is this multiple of recent spend. */
  burnoutSpendMultiplier: 2,
  /** How many recent hands of spend feed the burnout calculation. */
  burnoutSpendWindow: 3,
  /** Burnout floor, as a multiple of the table minimum. */
  burnoutFloorMultiplier: 5,
  /** Burnout ceiling, as a multiple of the table minimum. */
  burnoutCeilingMultiplier: 20,
  /** Hands a busted player sits out before their credit can be claimed. */
  burnoutCooldownHands: 3,
  /** Share of a losing hand's spend returned in LOSS_BONUS mode. */
  lossBonusPercent: 15,
} as const;

export class TableConfig extends Schema.Class<TableConfig>("TableConfig")({
  id: TableId,
  name: Schema.String,
  minimum: Chips,
  mode: CreditMode,
  startingBalance: Chips,
  adminName: Schema.UndefinedOr(PlayerName),
}) {
  /** Small blind: half the table minimum, rounded down. */
  get smallBlind(): Chips {
    return Math.floor(this.minimum / 2) as Chips;
  }

  /** Big blind: the table minimum. */
  get bigBlind(): Chips {
    return this.minimum;
  }

  get burnoutFloor(): Chips {
    return (this.minimum * HOUSE_RULES.burnoutFloorMultiplier) as Chips;
  }

  get burnoutCeiling(): Chips {
    return (this.minimum * HOUSE_RULES.burnoutCeilingMultiplier) as Chips;
  }

  isAdmin(name: PlayerName): boolean {
    return this.adminName !== undefined && this.adminName === name;
  }
}
