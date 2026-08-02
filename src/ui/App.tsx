import { useState } from "react";

import type { Seq } from "~/domain/Ids";
import { useTable } from "~/ui/hooks/useTable";
import { JoinScreen } from "~/ui/screens/JoinScreen";
import { TableView } from "~/ui/screens/TableView";

const NAME_KEY = "lan-poker:name";

// `sessionStorage` in dev (MODE=development) so each tab is a distinct
// player for solo testing; `localStorage` in prod so identity survives
// reloads. `dev:client` passes `--mode development`.
const nameStorage: Storage =
  import.meta.env.MODE === "development" ? sessionStorage : localStorage;

export const App = () => {
  const [name, setName] = useState<string | undefined>(
    () => nameStorage.getItem(NAME_KEY) ?? undefined,
  );
  const table = useTable(name);

  const join = (n: string) => {
    nameStorage.setItem(NAME_KEY, n);
    setName(n);
  };

  const leave = () => {
    if (table.snapshot !== undefined) {
      table.leave(table.snapshot.seq as Seq);
    }
    nameStorage.removeItem(NAME_KEY);
    setName(undefined);
  };

  if (name === undefined) {
    return <JoinScreen onJoin={join} />;
  }

  if (table.snapshot === undefined) {
    // Render something other than the join form while the first snapshot
    // arrives, so the submit button doesn't appear to do nothing.
    return (
      <div className="bg-background flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-muted-foreground text-sm">
          {table.status === "closed" ? "Reconnecting…" : "Connecting…"}
        </p>
        {table.lastError !== undefined && (
          <p className="text-destructive text-xs">{table.lastError}</p>
        )}
        <button
          type="button"
          className="text-muted-foreground text-xs underline"
          onClick={() => {
            nameStorage.removeItem(NAME_KEY);
            setName(undefined);
          }}
        >
          Use a different name
        </button>
      </div>
    );
  }

  return <TableView table={table} you={name} onLeave={leave} />;
};
