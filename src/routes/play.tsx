import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { Spinner } from "~/ui/components/ui/spinner";
import { TableView } from "~/ui/screens/TableView";
import { useTableContext } from "./__root";

export const Route = createFileRoute("/play")({
  ssr: false,
  component: PlayRoute,
});

function PlayRoute() {
  const { name, table, leave } = useTableContext();
  const navigate = useNavigate();

  if (!name) {
    navigate({ to: "/" });
    return null;
  }

  if (!table.snapshot) {
    return (
      <div className="bg-background flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <Spinner />
        <p className="text-muted-foreground text-sm">
          {table.status === "closed" ? "Reconnecting..." : "Connecting..."}
        </p>
        {table.lastError && (
          <p className="text-destructive text-xs">{table.lastError}</p>
        )}
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
      </div>
    );
  }

  return <TableView table={table} you={name} onLeave={leave} />;
}
