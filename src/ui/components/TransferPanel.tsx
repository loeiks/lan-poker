import { useState } from "react";

import type { PlayerName, Seq } from "~/domain/Ids";
import type { TableSnapshot } from "~/state/snapshot";
import { Button } from "~/ui/components/ui/button";
import { Input } from "~/ui/components/ui/input";
import type { UseTable } from "~/ui/hooks/useTable";

/** Transfer chips to another player. Only enabled between hands. Dialog content. */
export const TransferPanel = ({
  snapshot,
  table,
  you,
  onSent,
}: {
  readonly snapshot: TableSnapshot;
  readonly table: UseTable;
  readonly you: string;
  readonly onSent?: () => void;
}) => {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const disabled = snapshot.hand !== undefined;

  const others = snapshot.players.filter((p) => p.name !== you);

  return (
    <div className="flex flex-col gap-3">
      {disabled && (
        <div className="text-muted-foreground text-xs">
          Only available between hands.
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        {others.map((p) => (
          <Button
            key={p.name}
            type="button"
            size="sm"
            variant={to === p.name ? "default" : "secondary"}
            disabled={disabled}
            onClick={() =>
              setTo((current) => (current === p.name ? "" : p.name))
            }
          >
            {p.name}
            {to === p.name ? " ✓" : ""}
          </Button>
        ))}
      </div>
      <Input
        placeholder="amount"
        inputMode="numeric"
        disabled={disabled}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <Button
        disabled={
          disabled ||
          to.length === 0 ||
          !Number.isFinite(Number(amount)) ||
          Number(amount) <= 0
        }
        onClick={() => {
          table.transfer(snapshot.seq as Seq, to as PlayerName, Number(amount));
          setTo("");
          setAmount("");
          onSent?.();
        }}
      >
        Send
      </Button>
    </div>
  );
};
