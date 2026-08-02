import { useEffect, useRef, useState } from "react";

import {
  RiExchangeLine,
  RiLogoutBoxRLine,
  RiMenuLine,
  RiRefreshLine,
  RiShieldUserLine,
} from "@remixicon/react";
import confetti from "canvas-confetti";

import type { Card } from "~/domain/Card";
import type { PlayerName, Seq } from "~/domain/Ids";
import { ActionBar } from "~/ui/components/ActionBar";
import { AdminPanel } from "~/ui/components/AdminPanel";
import { Board } from "~/ui/components/Board";
import { CardPickerDialog } from "~/ui/components/CardPickerDialog";
import { CreditPanel } from "~/ui/components/CreditPanel";
import { HandSummary } from "~/ui/components/HandSummary";
import { HoleCards } from "~/ui/components/HoleCards";
import { Leaderboard } from "~/ui/components/Leaderboard";
import { PlayerAvatarRow } from "~/ui/components/PlayerAvatarRow";
import { TransferPanel } from "~/ui/components/TransferPanel";
import { Button } from "~/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/ui/components/ui/dialog";
import { Separator } from "~/ui/components/ui/separator";
import type { UseTable } from "~/ui/hooks/useTable";

type Dialogs = "menu" | "transfer" | "admin" | undefined;

// Fills the viewport and swaps the dialog's `grid` for `flex-col`: a grid of
// `auto` rows in a tall (`h-dvh`) container spreads leftover height across
// every row instead of packing content at the top.
const FULLSCREEN_DIALOG =
  "inset-0 top-0 left-0 flex h-dvh w-full max-w-none flex-col items-stretch justify-start translate-x-0 translate-y-0 overflow-y-auto rounded-none sm:max-w-none";

export const TableView = ({
  table,
  you,
  onLeave,
}: {
  readonly table: UseTable;
  readonly you: string;
  readonly onLeave: () => void;
}) => {
  const [openDialog, setOpenDialog] = useState<Dialogs>(undefined);
  const [editingBoardSlot, setEditingBoardSlot] = useState<number | undefined>(
    undefined,
  );
  const [errorDismissed, setErrorDismissed] = useState(false);
  const snapshot = table.snapshot;
  const playerName = you as PlayerName;

  const firedConfettiRef = useRef<string | undefined>(undefined);
  const confettiTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => {
    const winners = snapshot?.lastWinners;
    if (winners === undefined) return;
    const key = winners.join(",");
    if (key === firedConfettiRef.current) return;
    firedConfettiRef.current = key;
    if (!winners.includes(playerName)) return;
    // A second, delayed burst reads as a real celebration rather than a
    // blip -- scheduled off a ref, not effect cleanup, so a later snapshot
    // (e.g. someone else readying up) can't cancel it early.
    const burst = () =>
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    burst();
    confettiTimerRef.current = setTimeout(burst, 700);
  }, [snapshot?.lastWinners, playerName]);

  useEffect(
    () => () => {
      if (confettiTimerRef.current !== undefined)
        clearTimeout(confettiTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    setErrorDismissed(false);
  }, [table.lastError]);

  if (snapshot === undefined) return null;

  const seq = snapshot.seq as Seq;
  const me = snapshot.players.find((p) => p.name === playerName);
  const hand = snapshot.hand;
  const playing = hand !== undefined && !hand.complete;
  const spectating = playing && !hand.players.includes(playerName);

  return (
    <div className="bg-background flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className="text-foreground text-sm font-semibold">{you}</span>
          <span className="text-muted-foreground text-xs">
            {snapshot.tableName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {table.status !== "open" && (
            <span className="text-muted-foreground text-xs">reconnecting…</span>
          )}
          <Button
            variant="ghost"
            aria-label="Refresh"
            onClick={() => window.location.reload()}
          >
            <RiRefreshLine />
          </Button>
          <Button
            variant="ghost"
            aria-label="Menu"
            onClick={() => setOpenDialog("menu")}
          >
            <RiMenuLine />
          </Button>
        </div>
      </header>

      {table.lastError !== undefined && !errorDismissed && (
        <div
          className="bg-destructive/20 text-destructive mx-3 mb-2 cursor-pointer rounded-lg px-3 py-2 text-xs"
          onClick={() => setErrorDismissed(true)}
        >
          {table.lastError}
        </div>
      )}

      {snapshot.lastWinners !== undefined &&
        snapshot.lastWinners.includes(playerName) && (
          <div className="mx-3 mb-2 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-400">
            You won this hand!
          </div>
        )}

      {spectating && (
        <div className="bg-muted text-muted-foreground mx-3 mb-2 rounded-lg px-3 py-2 text-xs font-medium">
          Spectating this hand — you'll be dealt into the next one.
        </div>
      )}

      <PlayerAvatarRow
        players={snapshot.players}
        hand={hand}
        lastWinners={snapshot.lastWinners}
      />

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-3">
        {playing && !snapshot.isAdmin && <Board hand={hand} />}
        {playing && snapshot.isAdmin && (
          <Board
            hand={hand}
            onSlotClick={(index) => setEditingBoardSlot(index)}
          />
        )}
        {!playing && (
          <div className="flex flex-col items-center gap-3">
            {me !== undefined && !me.ready && (
              <Button onClick={() => table.ready(seq)}>Ready</Button>
            )}
            {me !== undefined && me.ready && (
              <div className="flex flex-col items-center gap-2">
                <Button variant="outline" onClick={() => table.unready(seq)}>
                  Unready
                </Button>
                <div className="text-muted-foreground flex items-center gap-2 text-xs">
                  <span className="relative flex size-2">
                    <span className="bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
                    <span className="bg-primary relative inline-flex size-2 rounded-full" />
                  </span>
                  Waiting for the game to start…
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {!playing && me !== undefined && (
        <div className="px-3 pb-4">
          <CreditPanel you={me} seq={snapshot.seq} table={table} />
        </div>
      )}

      {playing && (
        <div className="flex items-end justify-between gap-3 px-3 pb-2">
          {spectating ? (
            <div className="text-muted-foreground text-xs">Spectating</div>
          ) : (
            <HoleCards
              cards={hand.yourHoleCards}
              onSet={(cards) => table.setHoleCards(seq, playerName, cards)}
            />
          )}
          <HandSummary hand={hand} />
        </div>
      )}

      {hand !== undefined && (
        <ActionBar
          legalActions={snapshot.legalActions}
          tableMinimum={snapshot.tableMinimum}
          onAct={(intent) => table.act(seq, intent)}
          disabledReason={
            hand.complete
              ? "Hand settled"
              : spectating
                ? "You're spectating this hand"
                : hand.folded.includes(playerName)
                  ? "You've folded"
                  : hand.actingPlayer === undefined
                    ? "Waiting…"
                    : hand.actingPlayer !== playerName
                      ? `It's ${hand.actingPlayer}'s turn, wait yours`
                      : undefined
          }
        />
      )}

      <Dialog
        open={openDialog === "menu"}
        onOpenChange={(open) => setOpenDialog(open ? "menu" : undefined)}
      >
        <DialogContent className={FULLSCREEN_DIALOG}>
          <DialogHeader>
            <DialogTitle>
              {snapshot.finished ? "Final standings" : "Leaderboard"}
            </DialogTitle>
          </DialogHeader>
          <Leaderboard standings={snapshot.standings} />

          <div className="mt-0 flex flex-col gap-1">
            <Separator />
            <Button
              variant="ghost"
              className="justify-start gap-2 px-0"
              onClick={() => setOpenDialog("transfer")}
            >
              <RiExchangeLine />
              Transfer chips
            </Button>

            {snapshot.isAdmin && (
              <Button
                variant="ghost"
                className="justify-start gap-2 px-0"
                onClick={() => setOpenDialog("admin")}
              >
                <RiShieldUserLine />
                Admin panel
              </Button>
            )}

            <Button
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive justify-start gap-2 px-0"
              onClick={onLeave}
            >
              <RiLogoutBoxRLine />
              Leave table
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={openDialog === "transfer"}
        onOpenChange={(open) => setOpenDialog(open ? "transfer" : undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer chips</DialogTitle>
          </DialogHeader>
          <TransferPanel
            snapshot={snapshot}
            table={table}
            you={you}
            onSent={() => setOpenDialog(undefined)}
          />
        </DialogContent>
      </Dialog>

      {snapshot.isAdmin && (
        <Dialog
          open={openDialog === "admin"}
          onOpenChange={(open) => setOpenDialog(open ? "admin" : undefined)}
        >
          <DialogContent className={FULLSCREEN_DIALOG}>
            <DialogHeader>
              <DialogTitle>Admin</DialogTitle>
            </DialogHeader>
            <AdminPanel snapshot={snapshot} table={table} />
          </DialogContent>
        </Dialog>
      )}

      {editingBoardSlot !== undefined && hand !== undefined && (
        <CardPickerDialog
          open
          onOpenChange={(open) => {
            if (!open) setEditingBoardSlot(undefined);
          }}
          title={`Board card ${editingBoardSlot + 1}`}
          onPick={(card: Card | undefined) => {
            table.setBoardCard(seq, editingBoardSlot, card);
            setEditingBoardSlot(undefined);
          }}
        />
      )}
    </div>
  );
};
