import type { ReactNode } from "react";

import { Spinner } from "~/ui/components/ui/spinner";

export function LoadingState({
  message,
  error,
  action,
}: {
  readonly message: string;
  readonly error?: string;
  readonly action?: ReactNode;
}) {
  return (
    <div className="bg-background flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <Spinner />
      <p className="text-muted-foreground text-sm">{message}</p>
      {error && <p className="text-destructive text-xs">{error}</p>}
      {action}
    </div>
  );
}
