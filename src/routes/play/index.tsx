import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { LoadingState } from "~/ui/components/LoadingState";
import { TableView } from "~/ui/screens/TableView";
import { useTableContext } from "../__root";

export const Route = createFileRoute("/play/")({
  component: PlayRoute,
});

function PlayRoute() {
  const { name, table, leave } = useTableContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (!name) navigate({ to: "/" });
  }, [name, navigate]);

  if (!table.snapshot || !name) {
    return (
      <LoadingState
        message={
          table.status === "closed" ? "Reconnecting..." : "Connecting..."
        }
        error={table.lastError}
        action={
          <button
            type="button"
            className="text-muted-foreground text-xs underline"
            onClick={() => {
              leave();
              navigate({ to: "/" });
            }}
          >
            Use a different name
          </button>
        }
      />
    );
  }

  return <TableView table={table} you={name} onLeave={leave} />;
}
