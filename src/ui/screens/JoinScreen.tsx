import { useState } from "react";

import { describePlayerNameProblem, normalizePlayerName } from "~/domain/Ids";
import { Button } from "~/ui/components/ui/button";
import { Input } from "~/ui/components/ui/input";

// Validation here is UX only; the server is the real authority and `join`
// is idempotent.
export const JoinScreen = ({
  onJoin,
}: {
  readonly onJoin: (name: string) => void;
}) => {
  const [raw, setRaw] = useState("");
  const normalized = normalizePlayerName(raw);

  const submit = () => {
    if (normalized.ok) onJoin(normalized.name);
  };

  return (
    <div className="bg-background flex min-h-dvh flex-col items-center justify-center gap-6 px-6">
      <h1 className="text-foreground text-2xl font-semibold">lan-poker</h1>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <Input
          autoFocus
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="your name"
        />
        {!normalized.ok && raw.length > 0 && (
          <div className="text-destructive text-xs">
            {describePlayerNameProblem(normalized.problem)}
          </div>
        )}
        <p className="text-muted-foreground text-xs">
          Joining a name already in use takes it over -- you'll share that
          player's balance and history. Only do this if it's really you,
          reconnecting.
        </p>
        <Button disabled={!normalized.ok} onClick={submit}>
          Join
        </Button>
      </div>
    </div>
  );
};
