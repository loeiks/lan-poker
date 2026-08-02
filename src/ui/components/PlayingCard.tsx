import {
  displayRank,
  isRedSuit,
  rankOf,
  suitOf,
  suitSymbol,
  type Card,
} from "~/domain/Card";
import { cn } from "~/ui/lib/utils";

/** White rounded-rect card: rank top, suit symbol below.
 * `hidden` renders the diagonal-hatch pattern (board streets / censored hole cards). */
export const PlayingCard = ({
  card,
  hidden = false,
  size = "md",
  className,
  onClick,
}: {
  readonly card: Card | undefined;
  readonly hidden?: boolean;
  readonly size?: "sm" | "md" | "lg";
  readonly className?: string;
  readonly onClick?: () => void;
}) => {
  const dims =
    size === "lg"
      ? "h-24 w-16 text-2xl"
      : size === "sm"
        ? "h-12 w-9 text-sm"
        : "h-16 w-11 text-lg";

  if (hidden || card === undefined) {
    return (
      <div
        onClick={onClick}
        className={cn(
          "rounded-2xl bg-white shadow-inner",
          dims,
          onClick !== undefined && "cursor-pointer",
          className,
        )}
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, oklch(0.9 0 0) 0px, oklch(0.9 0 0) 2px, transparent 2px, transparent 8px)",
        }}
      />
    );
  }

  const red = isRedSuit(suitOf(card));
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl bg-white leading-none",
        dims,
        onClick !== undefined && "cursor-pointer",
        className,
      )}
    >
      <span
        className={cn(
          "tabular font-bold",
          red ? "text-suit-red" : "text-suit-black",
        )}
      >
        {displayRank(rankOf(card))}
      </span>
      <span className={cn(red ? "text-suit-red" : "text-suit-black")}>
        {suitSymbol(suitOf(card))}
      </span>
    </div>
  );
};
