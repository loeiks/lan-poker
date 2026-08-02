import type { Card, Suit } from "~/domain/Card";
import { displayRank, isRedSuit, RANKS, SUITS } from "~/domain/Card";
import { Button } from "~/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/ui/components/ui/dialog";
import { cn } from "~/ui/lib/utils";

const SUIT_SYMBOLS: Record<Suit, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };

export const CardPickerDialog = ({
  open,
  onOpenChange,
  onPick,
  title,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onPick: (card: Card | undefined) => void;
  readonly title: string;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-4 gap-1">
          {SUITS.map((suit) => (
            <div key={suit} className="flex flex-col gap-0.5">
              <div
                className={cn(
                  "mb-0.5 text-center text-base",
                  isRedSuit(suit) ? "text-suit-red" : "text-suit-white",
                )}
              >
                {SUIT_SYMBOLS[suit]}
              </div>
              {RANKS.map((rank) => (
                <Button
                  key={`${rank}${suit}`}
                  variant="ghost"
                  size="sm"
                  className="tabular text-foreground h-8 px-0 text-sm font-medium"
                  onClick={() => {
                    onPick(`${rank}${suit}` as Card);
                    onOpenChange(false);
                  }}
                >
                  {displayRank(rank)}
                </Button>
              ))}
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            onPick(undefined);
            onOpenChange(false);
          }}
        >
          Clear
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);
