import type { HandView } from "~/state/snapshot";
import { Badge } from "~/ui/components/ui/badge";

/** Your current hand ranking, live as board cards are revealed. Nothing shown until enough cards are known. */
export const HandSummary = ({
  hand,
}: {
  readonly hand: HandView | undefined;
}) => {
  if (hand?.yourRanking === undefined) return null;
  return (
    <Badge variant="secondary" className="text-sm">
      {hand.yourRanking}
    </Badge>
  );
};
