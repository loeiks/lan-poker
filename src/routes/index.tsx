import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { JoinScreen } from "~/ui/screens/JoinScreen";
import { useTableContext } from "./__root";

export const Route = createFileRoute("/")({
  ssr: false,
  component: JoinRoute,
});

function JoinRoute() {
  const { name, table, join } = useTableContext();
  const navigate = useNavigate();

  if (name && table.status === "open") {
    navigate({ to: "/play" });
    return null;
  }

  return <JoinScreen onJoin={join} />;
}
