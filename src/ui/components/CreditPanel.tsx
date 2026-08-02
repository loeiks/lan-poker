import type { Seq } from "~/domain/Ids";
import type { PlayerView } from "~/state/snapshot";
import { Button } from "~/ui/components/ui/button";
import { Card } from "~/ui/components/ui/card";
import type { UseTable } from "~/ui/hooks/useTable";

/** Shows pending credit and a claim button, disabled during cooldown. */
export const CreditPanel = ({
  you,
  seq,
  table,
}: {
  readonly you: PlayerView;
  readonly seq: number;
  readonly table: UseTable;
}) => {
  if (you.pendingCredit === undefined) return null;
  const { amount, handsRemaining } = you.pendingCredit;
  const claimable = handsRemaining === 0;

  return (
    <Card className="flex-row items-center justify-between px-3 py-2">
      <div>
        <div className="tabular text-foreground text-sm">Credit: {amount}</div>
        <div className="text-muted-foreground text-xs">
          {claimable ? "Ready to claim" : `${handsRemaining} hand(s) remaining`}
        </div>
      </div>
      <Button
        disabled={!claimable}
        onClick={() => table.claimCredit(seq as Seq)}
      >
        Claim
      </Button>
    </Card>
  );
};
