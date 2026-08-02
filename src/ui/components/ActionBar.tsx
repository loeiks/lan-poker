import { useEffect, useState } from "react";

import * as Chips from "~/domain/Chips";
import type { ActionIntent, LegalActions } from "~/rules/betting";
import { Button } from "~/ui/components/ui/button";
import { cn } from "~/ui/lib/utils";

export const ActionBar = ({
  legalActions,
  tableMinimum,
  onAct,
  disabledReason,
}: {
  readonly legalActions: LegalActions | undefined;
  readonly tableMinimum: Chips.Chips;
  readonly onAct: (intent: ActionIntent) => void;
  readonly disabledReason: string | undefined;
}) => {
  const [raiseTo, setRaiseTo] = useState<number>(legalActions?.raise?.min ?? 0);
  const blocked = disabledReason !== undefined;

  useEffect(() => {
    setRaiseTo(legalActions?.raise?.min ?? 0);
  }, [legalActions?.raise?.min]);

  return (
    <div className="relative flex flex-col gap-2 px-3 pt-2 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
      {blocked && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg backdrop-blur-[1px]">
          {/* Fine-pitched 45-degree striped overlay */}
          <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(0,0,0,0.25)_4px,rgba(0,0,0,0.25)_8px)]" />

          {/* Disabled state reason text */}
          <div className="text-muted-foreground relative z-10 px-4 py-2 text-sm font-medium">
            {disabledReason}
          </div>
        </div>
      )}

      {legalActions?.raise !== undefined && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="secondary"
            className="h-11 w-11 rounded-full p-0 text-lg"
            disabled={
              blocked || raiseTo - tableMinimum < legalActions.raise.min
            }
            onClick={() =>
              setRaiseTo((v) =>
                Math.max(legalActions.raise!.min, v - tableMinimum),
              )
            }
          >
            −
          </Button>
          <div className="tabular text-foreground min-w-16 text-center text-lg font-semibold">
            {raiseTo}
          </div>
          <Button
            variant="secondary"
            className="h-11 w-11 rounded-full p-0 text-lg"
            disabled={
              blocked || raiseTo + tableMinimum > legalActions.raise.max
            }
            onClick={() =>
              setRaiseTo((v) =>
                Math.min(legalActions.raise!.max, v + tableMinimum),
              )
            }
          >
            +
          </Button>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="destructive"
          className={cn(
            "flex-1",
            legalActions !== undefined && !legalActions.fold && "hidden",
          )}
          disabled={blocked || legalActions?.fold === false}
          onClick={() => onAct({ kind: "fold" })}
        >
          Fold
        </Button>
        <Button
          variant="secondary"
          className={cn(
            "flex-1",
            legalActions !== undefined && !legalActions.check && "hidden",
          )}
          disabled={blocked || legalActions?.check === false}
          onClick={() => onAct({ kind: "check" })}
        >
          Check
        </Button>
        {legalActions === undefined && (
          <Button variant="secondary" className="flex-1" disabled={blocked}>
            Call
          </Button>
        )}
        {legalActions?.call !== undefined && (
          <Button
            variant="secondary"
            className="flex-1"
            disabled={blocked}
            onClick={() => onAct({ kind: "call" })}
          >
            Call {legalActions.call}
          </Button>
        )}
        {legalActions === undefined && (
          <Button className="flex-1" disabled={blocked}>
            Raise
          </Button>
        )}
        {legalActions?.raise !== undefined && (
          <Button
            className="flex-1"
            disabled={blocked}
            onClick={() => onAct({ kind: "raise", to: raiseTo as Chips.Chips })}
          >
            Raise {raiseTo}
          </Button>
        )}
        {legalActions === undefined && (
          <Button variant="outline" className="flex-1" disabled={blocked}>
            All in
          </Button>
        )}
        {legalActions?.allIn !== undefined && (
          <Button
            variant="outline"
            className="flex-1"
            disabled={blocked}
            onClick={() => onAct({ kind: "allin" })}
          >
            All in {legalActions.allIn}
          </Button>
        )}
      </div>
    </div>
  );
};
