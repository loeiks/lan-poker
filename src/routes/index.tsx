import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useEffect } from "react";

import { LoadingState } from "~/ui/components/LoadingState";
import { JoinScreen } from "~/ui/screens/JoinScreen";
import { useTableContext } from "./__root";

export const Route = createFileRoute("/")({
  component: JoinRoute,
});

function JoinRoute() {
  const { name, table, join } = useTableContext();
  const navigate = useNavigate();
  const router = useRouter();

  useEffect(() => {
    router.preloadRoute({ to: "/play" });
  }, [router]);

  useEffect(() => {
    if (name && table.status === "open") navigate({ to: "/play" });
  }, [name, table.status, navigate]);

  if (name && table.status === "open") {
    return <LoadingState message="Redirecting…" />;
  }

  if (name) {
    return <LoadingState message="Connecting…" />;
  }

  return <JoinScreen onJoin={join} />;
}
