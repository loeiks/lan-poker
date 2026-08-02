import { RiCoinsLine } from "@remixicon/react";

import * as Chips from "~/domain/Chips";
import type { Street } from "~/domain/State";
import type { HandView } from "~/state/snapshot";
import { PlayingCard } from "~/ui/components/PlayingCard";

const STREET_LABEL: Record<Street, string> = {
  preflop: "Pre-Flop",
  flop: "Flop",
  turn: "Turn",
  river: "River",
  showdown: "Showdown",
};

/** Community cards plus the pot total(s), Offsuit-style plain layout. */
export const Board = ({
  hand,
  onSlotClick,
}: {
  readonly hand: HandView;
  readonly onSlotClick?: (index: number) => void;
}) => {
  const slots = [0, 1, 2, 3, 4];
  const potTotal = Chips.sum(hand.pots.map((p) => p.amount));

  return (
    <div className="flex flex-col items-center gap-3 pb-7">
      <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {STREET_LABEL[hand.street]}
      </div>
      <div className="flex gap-2">
        {slots.map((i) => {
          const click =
            onSlotClick !== undefined ? () => onSlotClick(i) : undefined;
          return click !== undefined ? (
            <PlayingCard
              key={i}
              card={hand.board[i]}
              hidden={hand.board[i] === undefined}
              onClick={click}
            />
          ) : (
            <PlayingCard
              key={i}
              card={hand.board[i]}
              hidden={hand.board[i] === undefined}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-1.5">
        <RiCoinsLine className="text-muted-white size-5" />
        <div className="tabular text-foreground text-2xl font-semibold">
          {potTotal}
        </div>
      </div>
      {hand.pots.length > 1 && (
        <div className="text-muted-foreground flex flex-col gap-1 text-xs">
          {hand.pots.map((pot, i) => (
            <div key={i} className="tabular">
              Pot {i + 1}: {pot.amount} ({pot.eligible.join(", ")})
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
