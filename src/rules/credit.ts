import * as Chips from "~/domain/Chips";
import type { PlayerName } from "~/domain/Ids";
import type { PlayerState, TableState } from "~/domain/State";
import { scoreOf } from "~/domain/State";
import { HOUSE_RULES, type TableConfig } from "~/domain/TableConfig";

// Credit is a loan, not a gift: every chip taken is permanently subtracted
// from standing, keeping chips meaningful. Tuning numbers live in HOUSE_RULES.

/** Sized from recent spending. Floored (so folding to zero isn't stranded),
 * capped (all-in streaks don't distort). Frozen at bust time. */
export const burnoutAmount = (
  spendHistory: ReadonlyArray<Chips.Chips>,
  config: TableConfig,
): Chips.Chips => {
  const window = spendHistory.slice(-HOUSE_RULES.burnoutSpendWindow);
  const recent = Chips.sum(window);
  const raw = Chips.mul(recent, HOUSE_RULES.burnoutSpendMultiplier);
  return Chips.clamp(raw, config.burnoutFloor, config.burnoutCeiling);
};

/** What a losing player gets back in LOSS_BONUS mode. Rounded down. */
export const lossBonusAmount = (spend: Chips.Chips): Chips.Chips =>
  Chips.percent(spend, HOUSE_RULES.lossBonusPercent);

export interface CreditGrant {
  readonly player: PlayerName;
  readonly amount: Chips.Chips;
  readonly cooldownHands: number;
}

/**
 * Whether a player who has just finished a hand should have a credit frozen
 * for them, and for how much.
 *
 * Only fires between hands, only at a zero balance, and never while a credit
 * is already pending.
 */
export const burnoutOnSettle = (
  player: PlayerState,
  config: TableConfig,
): CreditGrant | undefined => {
  if (config.mode !== "BURNOUT_CREDIT") return undefined;
  if (player.balance > 0) return undefined;
  if (player.pendingCredit !== undefined) return undefined;
  return {
    player: player.name,
    amount: burnoutAmount(player.spendHistory, config),
    cooldownHands: HOUSE_RULES.burnoutCooldownHands,
  };
};

/**
 * What a player is owed as a loss bonus for the hand just settled.
 * Losing means winning no part of any pot, regardless of balance.
 */
export const lossBonusOnSettle = (
  config: TableConfig,
  spendThisHand: Chips.Chips,
  wonAnything: boolean,
): Chips.Chips | undefined => {
  if (config.mode !== "LOSS_BONUS") return undefined;
  if (wonAnything) return undefined;
  if (spendThisHand === 0) return undefined;
  const amount = lossBonusAmount(spendThisHand);
  return amount > 0 ? amount : undefined;
};

/** Whether a pending credit can be claimed right now. */
export const canClaim = (player: PlayerState): boolean =>
  player.pendingCredit !== undefined &&
  player.pendingCredit.handsRemaining === 0;

/** Tick a pending credit's cooldown down by one settled hand. */
export const tickCooldown = (player: PlayerState): PlayerState => {
  const pending = player.pendingCredit;
  if (pending === undefined || pending.handsRemaining === 0) return player;
  return {
    ...player,
    pendingCredit: {
      ...pending,
      handsRemaining: pending.handsRemaining - 1,
    },
  };
};

export interface Standing {
  readonly rank: number;
  readonly player: PlayerName;
  readonly balance: Chips.Chips;
  readonly creditTaken: Chips.Chips;
  readonly score: number;
  readonly seated: boolean;
}

/**
 * Standings, best first. Players who have gone home stay on the board with
 * their final score.
 */
export const standings = (state: TableState): ReadonlyArray<Standing> => {
  const rows = [...state.players.values()]
    .map((player) => ({
      player: player.name,
      balance: player.balance,
      creditTaken: player.creditTaken,
      score: scoreOf(state, player),
      seated: player.seated,
    }))
    .sort((a, b) => b.score - a.score || a.player.localeCompare(b.player));

  // Equal scores share a rank.
  let rank = 0;
  let previousScore: number | undefined;
  return rows.map((row, index) => {
    if (previousScore === undefined || row.score !== previousScore) {
      rank = index + 1;
      previousScore = row.score;
    }
    return { rank, ...row };
  });
};
